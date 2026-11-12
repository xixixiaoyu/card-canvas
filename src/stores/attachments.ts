import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../db'
import { plainRecord } from '../lib/plain-record'
import {
  broadcastWorkspaceChange,
  subscribeWorkspaceChange,
} from '../lib/tab-sync'
import type { CardAttachment } from '../types'

export const useAttachmentStore = defineStore('attachments', () => {
  const attachments = ref<CardAttachment[]>([])
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

  let initialization: Promise<void> | null = null
  let syncStarted = false
  let unsubscribe: (() => void) | null = null
  let refreshTimer: ReturnType<typeof setTimeout> | null = null

  const byCard = computed(() => {
    const result = new Map<string, CardAttachment[]>()
    for (const attachment of attachments.value) {
      const entries = result.get(attachment.cardId) ?? []
      entries.push(attachment)
      result.set(attachment.cardId, entries)
    }
    return result
  })

  function forCard(cardId: string) {
    return byCard.value.get(cardId) ?? []
  }

  async function refresh() {
    const stored = await db.attachments.toArray()
    attachments.value = stored
      .filter((attachment) => !attachment.isDeleted)
      .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
  }

  function initialize() {
    if (initialization) return initialization

    const task = (async () => {
      status.value = 'loading'
      await db.open()
      await refresh()
      status.value = 'ready'
    })()

    initialization = task.finally(() => {
      initialization = null
    })
    return initialization
  }

  async function replaceForCard(
    cardId: string,
    nextAttachments: CardAttachment[],
  ) {
    const next = nextAttachments.map((attachment) =>
      plainRecord({ ...attachment, cardId, isDeleted: undefined }),
    )

    await db.transaction('rw', db.attachments, async () => {
      if (next.length) await db.attachments.bulkPut(next)
    })

    const merged = new Map(
      attachments.value.map((attachment) => [attachment.id, attachment]),
    )
    for (const attachment of next) merged.set(attachment.id, attachment)
    attachments.value = [...merged.values()].sort(
      (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
    )
    broadcastWorkspaceChange('all')
  }

  async function deleteForCards(cardIds: string[]) {
    const ids = new Set(cardIds)
    if (!ids.size) return

    const removed: string[] = []
    await db.transaction('rw', db.attachments, async () => {
      const records = await db.attachments.toArray()
      for (const attachment of records) {
        if (!ids.has(attachment.cardId)) continue
        removed.push(attachment.id)
        await db.attachments.delete(attachment.id)
      }
    })

    if (!removed.length) return
    const removedIds = new Set(removed)
    attachments.value = attachments.value.filter(
      (attachment) => !removedIds.has(attachment.id),
    )
    broadcastWorkspaceChange('all')
  }

  function scheduleRefresh() {
    if (refreshTimer !== null) return
    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void refresh()
    }, 80)
  }

  function startSync() {
    if (syncStarted) return
    syncStarted = true
    unsubscribe = subscribeWorkspaceChange((change) => {
      if (change.type === 'boards') return
      if (change.type !== 'all' && change.type !== 'cards') return
      scheduleRefresh()
    })
  }

  function stopSync() {
    if (!syncStarted) return
    syncStarted = false
    unsubscribe?.()
    unsubscribe = null
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  return {
    attachments,
    status,
    forCard,
    refresh,
    initialize,
    replaceForCard,
    deleteForCards,
    startSync,
    stopSync,
  }
})
