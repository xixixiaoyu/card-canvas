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
  type SyncMetaRecord,
  type SyncOutboxRecord,
  type SyncTableName,
} from '../lib/sync/types'
import type { Card } from '../types'
import { useBoardStore } from './board'
import { useWorkspaceStore } from './workspace'

export type SyncPhase =
  'disabled' | 'idle' | 'syncing' | 'synced' | 'offline' | 'error' | 'locked'

const PUSH_DEBOUNCE_MS = 500
const SYNC_RETRY_MS = 30_000
const HEARTBEAT_MS = 60_000
const PULL_PAGE_SIZE = 500

function errorMessage(cause: unknown) {
  return cause instanceof Error ? cause.message : String(cause)
}

export const useSyncStore = defineStore('sync', () => {
  const phase = ref<SyncPhase>('idle')
  const pendingCount = ref(0)
  const lastSyncedAt = ref<number | null>(null)
  const error = ref<string | null>(null)

  let activeUserId: string | null = null
  let running: Promise<void> | null = null
  let generation = 0
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let retryTimer: ReturnType<typeof setTimeout> | null = null
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let unsubscribeOutbox: (() => void) | null = null
  let channel: RealtimeChannel | null = null
  let realtimeClient: SupabaseClient | null = null
  let visibilityAttached = false
  let onlineAttached = false
  let pendingRemoteDemoCleanupUserId: string | null = null

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

  async function pushOutbox(userId: string) {
    const supabase = await getSupabaseClient()
    if (!supabase) return
    const entries = await db.syncOutbox.orderBy('updatedAt').toArray()
    if (!entries.length) return

    for (const table of SYNC_TABLES) {
      const batch = entries.filter((entry) => entry.table === table)
      if (!batch.length) continue

      const rows = batch.map((entry) =>
        localRecordToRemote(entry, userId, syncClientId),
      )
      const { error: pushError } = await supabase
        .from(remoteTableName(table))
        .upsert(rows, { onConflict: 'user_id,id' })

      if (pushError) throw new Error(pushError.message)
      await removePushedEntries(batch)
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
        db.boards,
        db.cards,
        db.boardItems,
        db.connections,
        db.syncOutbox,
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

  async function pullRemote(userId: string) {
    const supabase = await getSupabaseClient()
    if (!supabase) return false
    let changed = false

    try {
      for (const table of SYNC_TABLES) {
        const cursorKey = tablePullCursorKey(table)
        const storedCursor = await readMeta(cursorKey)
        const cursor = typeof storedCursor === 'string' ? storedCursor : null
        let offset = 0
        let nextCursor: string | null = null

        while (true) {
          let query = supabase
            .from(remoteTableName(table))
            .select('*')
            .eq('user_id', userId)

          if (cursor) query = query.gt('server_updated_at', cursor)

          const { data, error: pullError } = await query
            .order('server_updated_at', { ascending: true })
            .order('id', { ascending: true })
            .range(offset, offset + PULL_PAGE_SIZE - 1)
          if (pullError) throw new Error(pullError.message)

          const rows = (data ?? []) as RemoteRow[]
          changed = (await applyRemoteRows(table, rows)) || changed
          nextCursor = latestRemoteServerCursor(rows) ?? nextCursor
          if (rows.length < PULL_PAGE_SIZE) break
          offset += rows.length
        }

        if (nextCursor) await writeMeta(cursorKey, nextCursor)
      }
    } finally {
      if (changed) {
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
    if (running) return running
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      phase.value = 'offline'
      return
    }

    clearRetryTimer()
    phase.value = 'syncing'
    error.value = null
    const userId = activeUserId
    const runGeneration = generation

    running = (async () => {
      try {
        const supabase = await getSupabaseClient()
        if (!supabase) return
        if (pendingRemoteDemoCleanupUserId === userId) {
          await removeRemoteDemoData(supabase, userId)
          pendingRemoteDemoCleanupUserId = null
        }
        await pullRemote(userId)
        await pushOutbox(userId)
        if (generation !== runGeneration || activeUserId !== userId) return
        await refreshPendingCount()
        lastSyncedAt.value = Date.now()
        phase.value = 'synced'
      } catch (cause) {
        if (generation !== runGeneration || activeUserId !== userId) return
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
        if (generation === runGeneration) running = null
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
    channel = supabase.channel(`card-canvas:${userId}:${syncClientId}`)
    for (const table of SYNC_TABLES) {
      channel.on(
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
    channel.subscribe()
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

    if (!isSupabaseConfigured) {
      phase.value = 'disabled'
      return Promise.resolve()
    }

    return (async () => {
      await db.open()
      const ownerId = await readMeta(SYNC_META_KEYS.ownerId)
      if (!ownerId) {
        await writeMeta(SYNC_META_KEYS.ownerId, userId)
      } else if (ownerId !== userId) {
        phase.value = 'locked'
        error.value = '本机数据已绑定另一个云端账号，为避免数据混用已暂停同步。'
        return
      }

      const removedLocalDemo = await removeLegacyDemoData()
      if (removedLocalDemo) {
        broadcastWorkspaceChange('all')
        await useBoardStore().refresh()
      }
      if (!ownerId) await queueFullWorkspaceSnapshot()

      pendingRemoteDemoCleanupUserId = userId
      unsubscribeOutbox = subscribeSyncOutbox(scheduleSync)
      document.addEventListener('visibilitychange', handleVisibilityChange)
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
      visibilityAttached = true
      onlineAttached = true
      heartbeatTimer = setInterval(() => void synchronize(), HEARTBEAT_MS)

      await refreshPendingCount()
      await synchronize()
      await subscribeRealtime(userId)
    })()
  }

  function stop() {
    generation += 1
    running = null
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
    phase.value = 'idle'
    error.value = null
  }

  return {
    phase,
    pendingCount,
    lastSyncedAt,
    error,
    isActive,
    isBusy,
    label,
    start,
    stop,
    synchronize,
    refreshPendingCount,
  }
})
