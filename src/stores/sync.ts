import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js'
import { db } from '../db'
import { softDeleteUnreferencedCards } from '../lib/board-cleanup'
import { removeLegacyDemoData, removeRemoteDemoData } from '../lib/demo-cleanup'
import { plainRecord } from '../lib/plain-record'
import {
  getSupabaseClient,
  isSupabaseConfigured,
  syncClientId,
} from '../lib/supabase'
import { broadcastWorkspaceChange } from '../lib/tab-sync'
import { clearViewport } from '../lib/view-state'
import {
  isRemoteTombstone,
  latestRemoteServerCursor,
  localRecordToRemote,
  outboxKey,
  parsePullCursor,
  pullCursorFilter,
  remoteRecordToLocal,
  remoteTableName,
  remoteUpdatedAt,
  shouldAcceptRemoteRevision,
  type RemoteRow,
} from '../lib/sync/mapping'
import {
  queueFullWorkspaceSnapshot,
  subscribeSyncOutbox,
  withSyncTrackingSuppressed,
} from '../lib/sync/tracker'
import {
  SYNC_META_KEYS,
  SYNC_TABLES,
  tablePullCursorKey,
  type PullCursor,
  type SyncMetaRecord,
  type SyncOutboxRecord,
  type SyncTableName,
} from '../lib/sync/types'
import { isPristineLocalWorkspace } from '../lib/sync/workspace-claim'
import type { Card } from '../types'
import { useBoardStore } from './board'
import { useToastStore } from './toast'
import {
  DEFAULT_BOARD_ID,
  DEFAULT_BOARD_NAME,
  useWorkspaceStore,
} from './workspace'

export type SyncPhase =
  'disabled' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'locked'

const PUSH_DEBOUNCE_MS = 500
const SYNC_RETRY_MS = 30_000
const HEARTBEAT_MS = 60_000
const PULL_PAGE_SIZE = 500

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

function isMissingRemoteTable(errorLike: unknown) {
  if (!errorLike || typeof errorLike !== 'object') return false
  const error = errorLike as { code?: unknown; message?: unknown }
  return (
    error.code === 'PGRST205' ||
    (typeof error.message === 'string' &&
      /relation .* does not exist|could not find the table/i.test(
        error.message,
      ))
  )
}

export const useSyncStore = defineStore('sync', () => {
  const toast = useToastStore()
  const phase = ref<SyncPhase>('idle')
  const pendingCount = ref(0)
  const lastSyncedAt = ref<number | null>(null)
  const error = ref<string | null>(null)
  const attachmentCloudMissing = ref(false)

  let activeUserId: string | null = null
  let running: Promise<void> | null = null
  let generation = 0
  let rerunRequested = false
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let unsubscribeOutbox: (() => void) | null = null
  let channel: RealtimeChannel | null = null
  let realtimeClient: SupabaseClient | null = null
  let visibilityAttached = false
  let onlineAttached = false
  let pendingRemoteDemoCleanupUserId: string | null = null
  let attachmentWarningShown = false

  const isActive = computed(() => Boolean(activeUserId))
  const isBusy = computed(() => phase.value === 'syncing')
  const label = computed(() => {
    if (phase.value === 'disabled') return '仅本地'
    if (phase.value === 'locked') return '账号不匹配'
    if (phase.value === 'syncing') return '同步中'
    if (phase.value === 'synced') return '已同步'
    if (phase.value === 'offline') return '离线，待同步'
    if (phase.value === 'error') return '等待重试'
    return '尚未同步'
  })

  async function readMeta(key: string) {
    const entry = await db.syncMeta.get(key)
    return entry?.value ?? null
  }

  async function writeMeta(key: string, value: SyncMetaRecord['value']) {
    await db.syncMeta.put({ key, value })
  }

  async function refreshPendingCount() {
    pendingCount.value = await db.syncOutbox.count()
  }

  function markAttachmentCloudMissing(showWarning = true) {
    attachmentCloudMissing.value = true
    if (!showWarning || attachmentWarningShown) return
    attachmentWarningShown = true
    toast.push(
      '图片已保存在本机；Supabase 附件表尚未安装，跨设备图片同步暂未启用。',
      { tone: 'info', timeout: 7000 },
    )
  }

  function markAttachmentCloudReady() {
    attachmentCloudMissing.value = false
    attachmentWarningShown = false
  }

  async function clearPristineLocalWorkspace() {
    await withSyncTrackingSuppressed(async () => {
      await db.transaction(
        'rw',
        [
          db.boards,
          db.cards,
          db.attachments,
          db.boardItems,
          db.connections,
          db.syncOutbox,
          db.syncMeta,
        ],
        async () => {
          await Promise.all([
            db.boards.clear(),
            db.cards.clear(),
            db.attachments.clear(),
            db.boardItems.clear(),
            db.connections.clear(),
            db.syncOutbox.clear(),
            db.syncMeta.clear(),
          ])
        },
      )
    })
    broadcastWorkspaceChange('all')
  }

  async function clearPullCursors() {
    await db.syncMeta.bulkDelete(
      SYNC_TABLES.map((table) => tablePullCursorKey(table)),
    )
  }

  async function hasPristineLocalWorkspace() {
    const [boards, cards, attachments, boardItems, connections] =
      await Promise.all([
        db.boards.toArray(),
        db.cards.toArray(),
        db.attachments.toArray(),
        db.boardItems.toArray(),
        db.connections.toArray(),
      ])

    return isPristineLocalWorkspace(
      { boards, cards, attachments, boardItems, connections },
      { id: DEFAULT_BOARD_ID, name: DEFAULT_BOARD_NAME },
    )
  }

  function clearPushTimer() {
    if (pushTimer !== null) {
      clearTimeout(pushTimer)
      pushTimer = null
    }
  }

  function clearRetryTimer() {
    if (retryTimer !== null) {
      clearTimeout(retryTimer)
      retryTimer = null
    }
  }

  function scheduleSync(delay = PUSH_DEBOUNCE_MS) {
    if (!activeUserId || !isSupabaseConfigured) return
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      phase.value = 'offline'
      return
    }

    clearPushTimer()
    pushTimer = setTimeout(() => {
      pushTimer = null
      void synchronize()
    }, delay)
  }

  async function removePushedEntries(entries: SyncOutboxRecord[]) {
    await db.transaction('rw', db.syncOutbox, async () => {
      for (const entry of entries) {
        const current = await db.syncOutbox.get(entry.key)
        if (current?.updatedAt === entry.updatedAt) {
          await db.syncOutbox.delete(entry.key)
        }
      }
    })
  }

  async function acknowledgeServerRevisions(
    table: SyncTableName,
    entries: SyncOutboxRecord[],
    rows: RemoteRow[],
  ) {
    if (!rows.length) return
    const rowsById = new Map(
      rows.flatMap((row) =>
        typeof row.id === 'string' ? [[row.id, row] as const] : [],
      ),
    )

    await withSyncTrackingSuppressed(async () => {
      await db.transaction(
        'rw',
        [
          db.boards,
          db.cards,
          db.attachments,
          db.boardItems,
          db.connections,
          db.syncOutbox,
        ],
        async () => {
          for (const entry of entries) {
            const remote = rowsById.get(entry.recordId)
            if (!remote) continue
            const current = await db.syncOutbox.get(entry.key)
            if (current?.updatedAt !== entry.updatedAt) continue
            const updatedAt = remoteUpdatedAt(remote)
            if (!updatedAt) continue

            if (table === 'boards') {
              const local = await db.boards.get(entry.recordId)
              if (local) await db.boards.put({ ...local, updatedAt })
            } else if (table === 'cards') {
              const local = await db.cards.get(entry.recordId)
              if (local) await db.cards.put({ ...local, updatedAt })
            } else if (table === 'attachments') {
              const local = await db.attachments.get(entry.recordId)
              if (local) await db.attachments.put({ ...local, updatedAt })
            } else if (table === 'boardItems') {
              const local = await db.boardItems.get(entry.recordId)
              if (local) await db.boardItems.put({ ...local, updatedAt })
            } else {
              const local = await db.connections.get(entry.recordId)
              if (local) await db.connections.put({ ...local, updatedAt })
            }
          }
        },
      )
    })
  }

  function isTombstoneEntry(entry: SyncOutboxRecord) {
    return entry.operation === 'delete' || entry.payload.isDeleted === true
  }

  async function pushOutbox(
    userId: string,
    shouldPush: (entry: SyncOutboxRecord) => boolean = () => true,
  ) {
    const supabase = await getSupabaseClient()
    if (!supabase) return
    const entries = (await db.syncOutbox.orderBy('updatedAt').toArray()).filter(
      shouldPush,
    )
    if (!entries.length) return

    for (const table of SYNC_TABLES) {
      const batch = entries.filter((entry) => entry.table === table)
      if (!batch.length) continue

      const rows = batch.map((entry) =>
        localRecordToRemote(entry, userId, syncClientId),
      )
      const { data: pushedRows, error: pushError } = await supabase
        .from(remoteTableName(table))
        .upsert(rows, { onConflict: 'user_id,id' })
        .select('id,server_updated_at')

      if (pushError) {
        if (table === 'attachments' && isMissingRemoteTable(pushError)) {
          console.warn(
            '[card-canvas] Attachment table is not installed; keeping image uploads pending',
          )
          markAttachmentCloudMissing()
          continue
        }
        throw new Error(pushError.message)
      }
      await acknowledgeServerRevisions(
        table,
        batch,
        (pushedRows ?? []) as RemoteRow[],
      )
      await removePushedEntries(batch)
      if (table === 'attachments') markAttachmentCloudReady()
    }
  }

  async function shouldApplyRemote(table: SyncTableName, row: RemoteRow) {
    const recordId = typeof row.id === 'string' ? row.id : ''
    if (!recordId) return false

    const key = outboxKey(table, recordId)
    const queued = await db.syncOutbox.get(key)
    const remoteTime = remoteUpdatedAt(row)

    const local = await db[table].get(recordId)
    if (
      !shouldAcceptRemoteRevision(
        remoteTime,
        local?.updatedAt,
        queued?.updatedAt,
      )
    ) {
      return false
    }
    if (queued) await db.syncOutbox.delete(key)

    return true
  }

  async function applyRemoteRows(table: SyncTableName, rows: RemoteRow[]) {
    if (!rows.length) return false
    let changed = false
    const cardsToRetombstone: Card[] = []

    await withSyncTrackingSuppressed(async () => {
      await db.transaction(
        'rw',
        [
          db.boards,
          db.cards,
          db.attachments,
          db.boardItems,
          db.connections,
          db.syncOutbox,
        ],
        async () => {
          for (const row of rows) {
            if (!(await shouldApplyRemote(table, row))) continue

            const recordId = String(row.id)
            if (isRemoteTombstone(row)) {
              if (table === 'boards') {
                const boardItems = await db.boardItems
                  .where('boardId')
                  .equals(recordId)
                  .toArray()
                const candidateCardIds = [
                  ...new Set(boardItems.map((item) => item.cardId)),
                ]
                await db.boards.delete(recordId)
                await db.boardItems.where('boardId').equals(recordId).delete()
                await db.connections.where('boardId').equals(recordId).delete()
                cardsToRetombstone.push(
                  ...(await softDeleteUnreferencedCards(
                    candidateCardIds,
                    remoteUpdatedAt(row),
                  )),
                )
                clearViewport(recordId)
              } else if (table === 'cards') {
                const local = await db.cards.get(recordId)
                if (local) {
                  await db.cards.put({
                    ...plainRecord(local),
                    isDeleted: true,
                    updatedAt: remoteUpdatedAt(row),
                  })
                }
              } else if (table === 'attachments') {
                await db.attachments.delete(recordId)
              } else if (table === 'boardItems') {
                await db.boardItems.delete(recordId)
              } else {
                await db.connections.delete(recordId)
              }
              changed = true
              continue
            }

            const local = remoteRecordToLocal(table, row)
            if (table === 'boards') {
              await db.boards.put(local as never)
            } else if (table === 'cards') {
              await db.cards.put(local as never)
            } else if (table === 'attachments') {
              await db.attachments.put(local as never)
            } else if (table === 'boardItems') {
              await db.boardItems.put(local as never)
            } else {
              await db.connections.put(local as never)
            }
            changed = true
          }
        },
      )
    })

    if (cardsToRetombstone.length) {
      // Board tombstones also cascade to cards that existed only on that
      // board. Reapply outside suppression so those deletes enter the outbox.
      await db.cards.bulkPut(cardsToRetombstone)
    }

    return changed
  }

  async function pullRemote(
    userId: string,
    isCurrent: () => boolean = () => true,
  ) {
    const supabase = await getSupabaseClient()
    if (!supabase) return false
    let changed = false
    let completed = false

    try {
      for (const table of SYNC_TABLES) {
        const cursorKey = tablePullCursorKey(table)
        const storedCursor = await readMeta(cursorKey)
        const cursor = parsePullCursor(
          typeof storedCursor === 'string' ? storedCursor : null,
        )
        const pageSize = table === 'attachments' ? 20 : PULL_PAGE_SIZE
        let offset = 0
        let nextCursor: PullCursor | null = null

        while (true) {
          let query = supabase
            .from(remoteTableName(table))
            .select('*')
            .eq('user_id', userId)

          if (cursor) query = query.or(pullCursorFilter(cursor))

          const { data, error: pullError } = await query
            .order('server_updated_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1)
          if (pullError) {
            if (table === 'attachments' && isMissingRemoteTable(pullError)) {
              console.warn(
                '[card-canvas] Attachment table is not installed; skipping image download',
              )
              markAttachmentCloudMissing(false)
              break
            }
            throw new Error(pullError.message)
          }
          if (table === 'attachments') markAttachmentCloudReady()

          const rows = (data ?? []) as RemoteRow[]
          if (!isCurrent()) return changed
          changed = (await applyRemoteRows(table, rows)) || changed
          nextCursor = latestRemoteServerCursor(rows) ?? nextCursor
          if (rows.length < pageSize) break
          offset += rows.length
        }

        if (nextCursor) {
          await writeMeta(cursorKey, JSON.stringify(nextCursor))
        }
      }
      // Cards are pulled before their board projections. Publishing a partial
      // pass would briefly make them look like orphaned cards to the board UI.
      completed = true
    } finally {
      if (completed && changed && isCurrent()) {
        broadcastWorkspaceChange('all')
        await useWorkspaceStore().loadBoards()
        const boardStore = useBoardStore()
        try {
          await boardStore.refresh()
        } finally {
          boardStore.clearHistory()
        }
      }
    }

    return changed
  }

  async function synchronize() {
    if (!activeUserId || !isSupabaseConfigured) return
    if (running) {
      rerunRequested = true
      return running
    }
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      phase.value = 'offline'
      return
    }

    clearRetryTimer()
    phase.value = 'syncing'
    error.value = null
    const userId = activeUserId
    const runGeneration = generation
    const isCurrentRun = () =>
      generation === runGeneration && activeUserId === userId

    running = (async () => {
      let succeeded = false
      try {
        const supabase = await getSupabaseClient()
        if (!supabase) return
        if (!isCurrentRun()) return
        if (pendingRemoteDemoCleanupUserId === userId) {
          await removeRemoteDemoData(supabase, userId)
          if (!isCurrentRun()) return
          pendingRemoteDemoCleanupUserId = null
        }
        let pullError: unknown = null
        try {
          await pullRemote(userId, isCurrentRun)
        } catch (cause) {
          pullError = cause
        }
        if (!isCurrentRun()) return
        try {
          // Tombstones must not be trapped behind a failing pull. Only upload
          // deletes while the pull is incomplete so stale live edits cannot
          // overwrite newer remote data.
          await pushOutbox(userId, pullError ? isTombstoneEntry : undefined)
        } catch (cause) {
          if (!pullError) throw cause
          console.error(
            '[card-canvas] Unable to flush delete tombstones after pull failure',
            cause,
          )
        }
        if (pullError) throw pullError
        if (!isCurrentRun()) return
        await refreshPendingCount()
        lastSyncedAt.value = Date.now()
        phase.value = 'synced'
        succeeded = true
      } catch (cause) {
        if (!isCurrentRun()) return
        error.value = errorMessage(cause)
        phase.value =
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : 'error'
        clearRetryTimer()
        retryTimer = setTimeout(() => {
          retryTimer = null
          void synchronize()
        }, SYNC_RETRY_MS)
      } finally {
        if (generation === runGeneration) {
          running = null
          const shouldRerun =
            rerunRequested && succeeded && activeUserId === userId
          rerunRequested = false
          if (shouldRerun) {
            queueMicrotask(() => {
              if (activeUserId === userId && generation === runGeneration) {
                void synchronize()
              }
            })
          }
        }
        if (activeUserId === userId) {
          await refreshPendingCount().catch(() => {})
        }
      }
    })()

    return running
  }

  async function subscribeRealtime(userId: string) {
    if (channel) return
    const supabase = await getSupabaseClient()
    if (!supabase) return

    realtimeClient = supabase
    const nextChannel = supabase.channel(
      `card-canvas:${userId}:${syncClientId}`,
    )
    channel = nextChannel
    for (const table of SYNC_TABLES) {
      nextChannel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: remoteTableName(table),
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const next = payload.new as RemoteRow | undefined
          const previous = payload.old as RemoteRow | undefined
          const sourceClient = next?.sync_client_id ?? previous?.sync_client_id
          if (sourceClient === syncClientId) return
          scheduleSync(120)
        },
      )
    }
    await new Promise<void>((resolve) => {
      nextChannel.subscribe((status) => {
        if (
          status === 'SUBSCRIBED' ||
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          resolve()
        }
      })
    })
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') void synchronize()
  }

  function handleOnline() {
    if (activeUserId) void synchronize()
  }

  function handleOffline() {
    if (activeUserId) phase.value = 'offline'
  }

  function start(userId: string) {
    if (!userId) return stop()
    if (activeUserId === userId && phase.value !== 'locked') {
      return synchronize()
    }

    stop()
    activeUserId = userId
    const startGeneration = generation
    const isCurrentStart = () =>
      generation === startGeneration && activeUserId === userId

    if (!isSupabaseConfigured) {
      phase.value = 'disabled'
      return Promise.resolve()
    }

    return (async () => {
      try {
        await db.open()
        if (!isCurrentStart()) return
        const ownerId = await readMeta(SYNC_META_KEYS.ownerId)
        if (!isCurrentStart()) return
        let pristineClaim = false
        if (!ownerId) {
          pristineClaim = await hasPristineLocalWorkspace()
          if (!isCurrentStart()) return
          if (pristineClaim) await clearPristineLocalWorkspace()
          if (!isCurrentStart()) return
          await clearPullCursors()
          if (!isCurrentStart()) return
          await writeMeta(SYNC_META_KEYS.ownerId, userId)
        } else if (ownerId !== userId) {
          phase.value = 'locked'
          error.value =
            '本机数据已绑定另一个云端账号，为避免数据混用已暂停同步。'
          return
        }

        const removedLocalDemo = await removeLegacyDemoData()
        if (!isCurrentStart()) return
        if (removedLocalDemo) {
          broadcastWorkspaceChange('all')
          await useBoardStore().refresh()
          if (!isCurrentStart()) return
        }
        if (!ownerId && !pristineClaim) await queueFullWorkspaceSnapshot()
        if (!isCurrentStart()) return

        pendingRemoteDemoCleanupUserId = userId
        unsubscribeOutbox = subscribeSyncOutbox(scheduleSync)
        document.addEventListener('visibilitychange', handleVisibilityChange)
        window.addEventListener('online', handleOnline)
        window.addEventListener('offline', handleOffline)
        visibilityAttached = true
        onlineAttached = true
        heartbeatTimer = setInterval(() => void synchronize(), HEARTBEAT_MS)

        await refreshPendingCount()
        if (!isCurrentStart()) return
        await subscribeRealtime(userId)
        if (!isCurrentStart()) return
        await synchronize()
        if (!isCurrentStart()) return

        if (pristineClaim && (await db.boards.count()) === 0) {
          await useWorkspaceStore().loadBoards()
          if (!isCurrentStart()) return
          await useBoardStore().refresh()
          if (!isCurrentStart()) return
          await synchronize()
        }
      } catch (cause) {
        if (!isCurrentStart()) return
        error.value = errorMessage(cause)
        phase.value =
          typeof navigator !== 'undefined' && !navigator.onLine
            ? 'offline'
            : 'error'
        clearRetryTimer()
        retryTimer = setTimeout(() => {
          retryTimer = null
          if (activeUserId !== userId) return
          stop()
          void Promise.resolve(start(userId)).catch((retryCause: unknown) => {
            console.error(
              '[card-canvas] Unable to restart synchronization',
              retryCause,
            )
          })
        }, SYNC_RETRY_MS)
      }
    })()
  }

  function stop() {
    generation += 1
    running = null
    rerunRequested = false
    clearPushTimer()
    clearRetryTimer()
    if (heartbeatTimer !== null) {
      clearInterval(heartbeatTimer)
      heartbeatTimer = null
    }
    unsubscribeOutbox?.()
    unsubscribeOutbox = null
    if (channel && realtimeClient) {
      void realtimeClient.removeChannel(channel)
      channel = null
    }
    realtimeClient = null
    if (visibilityAttached) {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      visibilityAttached = false
    }
    if (onlineAttached) {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      onlineAttached = false
    }
    activeUserId = null
    pendingRemoteDemoCleanupUserId = null
    attachmentCloudMissing.value = false
    attachmentWarningShown = false
    phase.value = 'idle'
    error.value = null
  }

  return {
    phase,
    pendingCount,
    lastSyncedAt,
    error,
    attachmentCloudMissing,
    isActive,
    isBusy,
    label,
    start,
    stop,
    synchronize,
    refreshPendingCount,
  }
})
