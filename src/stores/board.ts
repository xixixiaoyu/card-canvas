import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../db'
import { removeLegacyDemoData } from '../lib/demo-cleanup'
import {
  broadcastWorkspaceChange,
  subscribeWorkspaceChange,
} from '../lib/tab-sync'
import { normalizeTags } from '../lib/tags'
import { toggleTaskLine } from '../lib/atomic-markdown'
import type { BoardItem, Card, Connection } from '../types'
import { plainRecord } from '../lib/plain-record'
import { useToastStore } from './toast'

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface BoardEntry {
  item: BoardItem
  card: Card
}

export interface CaptureCardInput {
  title: string
  content: string
  tags: string[]
}

export interface UpdateCardInput {
  title: string
  content: string
  tags: string[]
}

export interface PlaceCardPosition {
  x: number
  y: number
  width?: number
}

export interface HistoryEntry {
  id: string
  label: string
  undo: () => Promise<void>
  redo: () => Promise<void>
}

const DEFAULT_CARD_WIDTH = 420
const HISTORY_LIMIT = 50

function normalizeCard(card: Card): Card {
  return { ...card, tags: normalizeTags(card.tags ?? []) }
}

/**
 * IndexedDB structured-clones values before writing. Vue reactive proxies (and
 * proxied nested arrays) are not cloneable, so every store -> Dexie write goes
 * through a plain snapshot.
 */
/**
 * The board store owns the durable graph (cards + spatial projections) that
 * the canvas renders. During a card drag no store writes happen; the final
 * position is committed exactly once on pointerup.
 *
 * Every user-visible mutation is represented by an in-memory history entry so
 * it can be undone/redone without persisting a second command log.
 */
export const useBoardStore = defineStore('board', () => {
  const cards = ref<Card[]>([])
  const items = ref<BoardItem[]>([])
  const connections = ref<Connection[]>([])
  const selectedItemIds = ref<Set<string>>(new Set())
  const selectedConnectionId = ref<string | null>(null)
  const landingItemId = ref<string | null>(null)
  const activeFilterTag = ref<string | null>(null)
  const pulseItemId = ref<string | null>(null)
  const status = ref<BoardStatus>('idle')
  const error = ref<string | null>(null)
  const past = ref<HistoryEntry[]>([])
  const future = ref<HistoryEntry[]>([])

  const activeBoardId = ref<string | null>(null)
  let initialization: Promise<void> | null = null
  let loadToken = 0
  let syncStarted = false
  let refreshTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribeSync: (() => void) | null = null
  let applyingHistory = false
  let landingTimer: ReturnType<typeof setTimeout> | null = null
  let pulseTimer: ReturnType<typeof setTimeout> | null = null

  function markLanding(itemId: string) {
    landingItemId.value = itemId
    if (landingTimer) clearTimeout(landingTimer)
    landingTimer = setTimeout(() => {
      if (landingItemId.value === itemId) landingItemId.value = null
    }, 520)
  }

  function pulseItem(itemId: string) {
    pulseItemId.value = itemId
    if (pulseTimer) clearTimeout(pulseTimer)
    pulseTimer = setTimeout(() => {
      if (pulseItemId.value === itemId) pulseItemId.value = null
    }, 1200)
  }

  function toggleFilterTag(tag: string) {
    const next = tag.trim()
    if (!next) return

    activeFilterTag.value = activeFilterTag.value === next ? null : next
  }

  function clearFilterTag() {
    activeFilterTag.value = null
  }

  const entries = computed<BoardEntry[]>(() => {
    const cardsById = new Map(cards.value.map((card) => [card.id, card]))

    return items.value.flatMap((item) => {
      const card = cardsById.get(item.cardId)
      return card ? [{ item, card }] : []
    })
  })

  const selectedItems = computed(() =>
    items.value.filter((item) => selectedItemIds.value.has(item.id)),
  )

  const selectedItemId = computed(() =>
    selectedItemIds.value.size === 1
      ? (selectedItems.value[0]?.id ?? null)
      : null,
  )

  const selectedItem = computed(() => selectedItems.value[0] ?? null)

  const selectedConnection = computed(
    () =>
      connections.value.find(
        (connection) => connection.id === selectedConnectionId.value,
      ) ?? null,
  )

  const isHydrated = computed(() => status.value === 'ready')

  const canUndo = computed(() => past.value.length > 0)
  const canRedo = computed(() => future.value.length > 0)
  const undoLabel = computed(() => past.value.at(-1)?.label ?? '')
  const redoLabel = computed(() => future.value.at(-1)?.label ?? '')

  // --- local graph helpers -------------------------------------------------

  function replaceLocalCard(card: Card) {
    const index = cards.value.findIndex((entry) => entry.id === card.id)
    cards.value =
      index === -1
        ? [card, ...cards.value]
        : cards.value.map((entry) => (entry.id === card.id ? card : entry))
  }

  function removeLocalCard(cardId: string) {
    cards.value = cards.value.filter((card) => card.id !== cardId)
  }

  function replaceLocalItem(item: BoardItem) {
    const index = items.value.findIndex((entry) => entry.id === item.id)
    items.value =
      index === -1
        ? [...items.value, item]
        : items.value.map((entry) => (entry.id === item.id ? item : entry))
  }

  function removeLocalItem(itemId: string) {
    items.value = items.value.filter((item) => item.id !== itemId)
  }

  function replaceLocalConnection(connection: Connection) {
    const index = connections.value.findIndex(
      (entry) => entry.id === connection.id,
    )
    connections.value =
      index === -1
        ? [...connections.value, connection]
        : connections.value.map((entry) =>
            entry.id === connection.id ? connection : entry,
          )
  }

  function removeLocalConnection(connectionId: string) {
    connections.value = connections.value.filter(
      (connection) => connection.id !== connectionId,
    )
  }

  function isSameCardPair(
    first: Connection,
    fromCardId: string,
    toCardId: string,
  ) {
    return (
      (first.fromCardId === fromCardId && first.toCardId === toCardId) ||
      (first.fromCardId === toCardId && first.toCardId === fromCardId)
    )
  }

  function record(entry: Omit<HistoryEntry, 'id'>) {
    if (applyingHistory) return

    const next: HistoryEntry = {
      ...entry,
      id: `history-${crypto.randomUUID()}`,
    }

    past.value = [...past.value.slice(-(HISTORY_LIMIT - 1)), next]
    future.value = []
  }

  function notifyFailure(
    message: string,
    action?: { label: string; run: () => void | Promise<void> },
  ) {
    useToastStore().push(message, { tone: 'error', action })
  }

  // --- bootstrap -----------------------------------------------------------

  async function readBoard(boardId: string) {
    const [storedCards, storedItems, storedConnections] = await Promise.all([
      db.cards.toArray(),
      db.boardItems.where('boardId').equals(boardId).toArray(),
      db.connections.where('boardId').equals(boardId).toArray(),
    ])

    return {
      cards: storedCards.filter((card) => !card.isDeleted).map(normalizeCard),
      items: storedItems.sort((a, b) => a.id.localeCompare(b.id)),
      connections: storedConnections.sort((a, b) => a.id.localeCompare(b.id)),
    }
  }

  /**
   * Legacy/unplaced cards must not become invisible after the inbox removal.
   * Any card with no projection on any board is placed on the active board in
   * a deterministic grid to the right of existing content.
   */
  async function placeMissingCards(
    boardId: string,
    liveCards: Card[],
  ): Promise<BoardItem[]> {
    try {
      // Read + write inside one transaction so concurrent loads/refreshes
      // cannot create duplicate projections for the same legacy card.
      const snapshots = await db.transaction('rw', db.boardItems, async () => {
        const allItems = await db.boardItems.toArray()
        const placedCardIds = new Set(allItems.map((item) => item.cardId))
        const missing = liveCards.filter((card) => !placedCardIds.has(card.id))
        if (!missing.length) return [] as BoardItem[]

        const activeItems = allItems.filter((item) => item.boardId === boardId)
        const baseX = activeItems.length
          ? Math.max(
              ...activeItems.map(
                (item) => item.x + (item.width ?? DEFAULT_CARD_WIDTH),
              ),
            ) + 120
          : 0
        const baseY = activeItems.length
          ? Math.min(...activeItems.map((item) => item.y))
          : -150

        const created: BoardItem[] = missing.map((card, index) => ({
          id: `projection-${crypto.randomUUID()}`,
          cardId: card.id,
          boardId,
          x: baseX + (index % 2) * 460,
          y: baseY + Math.floor(index / 2) * 340,
          width: DEFAULT_CARD_WIDTH,
        }))
        const next = plainRecord(created)

        await db.boardItems.bulkPut(next)
        return next
      })

      if (snapshots.length) {
        broadcastWorkspaceChange('items', boardId)
      }

      return snapshots
    } catch (cause) {
      console.error('[card-canvas] Unable to place unplaced cards', cause)
      return []
    }
  }

  /**
   * Switch the store to another board without re-seeding. Status flips to
   * `loading` so the stage unmounts, fits the new board and restores its own
   * saved viewport instead of briefly framing the previous board.
   */
  async function loadBoard(boardId: string) {
    if (!boardId) return
    if (activeBoardId.value === boardId && status.value === 'ready') return

    const token = ++loadToken
    status.value = 'loading'
    error.value = null

    try {
      await db.open()
      const snapshot = await readBoard(boardId)
      if (token !== loadToken) return

      const migrated = await placeMissingCards(boardId, snapshot.cards)
      if (token !== loadToken) return

      cards.value = snapshot.cards
      items.value = [...snapshot.items, ...migrated].sort((a, b) =>
        a.id.localeCompare(b.id),
      )
      connections.value = snapshot.connections
      selectedItemIds.value = new Set()
      selectedConnectionId.value = null
      activeFilterTag.value = null
      pulseItemId.value = null
      activeBoardId.value = boardId
      past.value = []
      future.value = []
      status.value = 'ready'
    } catch (cause) {
      if (token === loadToken) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : String(cause)
      }
      throw cause
    }
  }

  function initialize(boardId: string) {
    if (initialization) return initialization
    if (status.value === 'ready' && activeBoardId.value === boardId) {
      return Promise.resolve()
    }

    const task = (async () => {
      status.value = 'loading'
      error.value = null

      try {
        await db.open()

        if (import.meta.env.PROD) {
          await removeLegacyDemoData()
        }

        const [cardCount, itemCount] = await Promise.all([
          db.cards.count(),
          db.boardItems.count(),
        ])

        if (!import.meta.env.PROD && cardCount === 0 && itemCount === 0) {
          const { seedBoardItems, seedCards } = await import('../data/seed')
          await db.transaction('rw', db.cards, db.boardItems, async () => {
            await db.cards.bulkPut(seedCards)
            await db.boardItems.bulkPut(seedBoardItems)
          })
        }

        // Repair partial databases: projections whose card no longer exists
        // are invisible in the UI and would otherwise linger forever.
        const [allCards, allItems] = await Promise.all([
          db.cards.toArray(),
          db.boardItems.toArray(),
        ])
        const liveCardIds = new Set(
          allCards.filter((card) => !card.isDeleted).map((card) => card.id),
        )
        const orphanItemIds = allItems
          .filter((item) => !liveCardIds.has(item.cardId))
          .map((item) => item.id)

        if (orphanItemIds.length) {
          await db.boardItems.bulkDelete(orphanItemIds)
        }

        await loadBoard(boardId)
      } catch (cause) {
        status.value = 'error'
        error.value = cause instanceof Error ? cause.message : String(cause)
        throw cause
      }
    })()

    initialization = task.finally(() => {
      initialization = null
    })

    return initialization
  }

  // --- capture -------------------------------------------------------------

  function buildCard(input: CaptureCardInput): Card {
    const now = Date.now()

    return {
      id: `card-${crypto.randomUUID()}`,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: normalizeTags(input.tags),
      createdAt: now,
      updatedAt: now,
    }
  }

  async function captureCard(input: CaptureCardInput): Promise<Card> {
    const card = buildCard(input)

    replaceLocalCard(card)

    const snapshot = plainRecord(card)

    try {
      await db.cards.put(snapshot)
      broadcastWorkspaceChange('cards')
    } catch (cause) {
      removeLocalCard(card.id)

      console.error('[card-canvas] Unable to persist captured card', cause)
      throw cause instanceof Error ? cause : new Error(String(cause))
    }

    record({
      label: '速记',
      undo: async () => {
        await db.cards.delete(card.id)
        removeLocalCard(card.id)
        broadcastWorkspaceChange('all')
      },
      redo: async () => {
        await db.cards.put(snapshot)
        replaceLocalCard(snapshot)
        broadcastWorkspaceChange('all')
      },
    })

    return card
  }

  /**
   * Capture and place in one atomic user action. With the inbox removed, a
   * captured card must always land on the active board.
   */
  async function captureAndPlace(
    input: CaptureCardInput,
    boardId: string,
    position: PlaceCardPosition,
  ): Promise<{ card: Card; item: BoardItem }> {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
      throw new Error('Invalid placement position')
    }

    const card = buildCard(input)
    const item: BoardItem = {
      id: `projection-${crypto.randomUUID()}`,
      cardId: card.id,
      boardId,
      x: position.x,
      y: position.y,
      width: position.width ?? DEFAULT_CARD_WIDTH,
    }
    const cardSnapshot = plainRecord(card)
    const itemSnapshot = plainRecord(item)

    replaceLocalCard(card)
    replaceLocalItem(item)
    selectItem(item.id)
    markLanding(item.id)

    try {
      await db.transaction('rw', db.cards, db.boardItems, async () => {
        await db.cards.put(cardSnapshot)
        await db.boardItems.put(itemSnapshot)
      })
      broadcastWorkspaceChange('all')
    } catch (cause) {
      removeLocalCard(card.id)
      removeLocalItem(item.id)
      removeSelectedItem(item.id)

      console.error('[card-canvas] Unable to capture and place card', cause)
      throw cause instanceof Error ? cause : new Error(String(cause))
    }

    record({
      label: '速记上板',
      undo: async () => {
        await db.transaction('rw', db.cards, db.boardItems, async () => {
          await db.cards.delete(card.id)
          await db.boardItems.delete(item.id)
        })
        removeLocalCard(card.id)
        removeLocalItem(item.id)
        removeSelectedItem(item.id)
        broadcastWorkspaceChange('all')
      },
      redo: async () => {
        await db.transaction('rw', db.cards, db.boardItems, async () => {
          await db.cards.put(cardSnapshot)
          await db.boardItems.put(itemSnapshot)
        })
        replaceLocalCard(cardSnapshot)
        replaceLocalItem(itemSnapshot)
        selectItem(itemSnapshot.id)
        broadcastWorkspaceChange('all')
      },
    })

    return { card, item }
  }

  async function updateCard(
    cardId: string,
    input: UpdateCardInput,
    historyLabel = '编辑卡片',
  ): Promise<Card | null> {
    const previous = cards.value.find((card) => card.id === cardId)
    if (!previous) return null

    const before = plainRecord(previous)
    const next: Card = normalizeCard({
      ...before,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: normalizeTags(input.tags),
      updatedAt: Date.now(),
    })
    const after = plainRecord(next)

    replaceLocalCard(next)

    try {
      await db.cards.put(after)
      broadcastWorkspaceChange('cards')
    } catch (cause) {
      replaceLocalCard(previous)

      console.error('[card-canvas] Unable to update card', cause)
      throw cause instanceof Error ? cause : new Error(String(cause))
    }

    record({
      label: historyLabel,
      undo: async () => {
        await db.cards.put(before)
        replaceLocalCard(before)
        broadcastWorkspaceChange('cards')
      },
      redo: async () => {
        await db.cards.put(after)
        replaceLocalCard(after)
        broadcastWorkspaceChange('cards')
      },
    })

    return next
  }

  async function toggleCardTask(cardId: string, lineIndex: number) {
    const card = cards.value.find((entry) => entry.id === cardId)
    if (!card) return false

    const toggled = toggleTaskLine(card.content, lineIndex)
    if (!toggled) return false

    const updated = await updateCard(
      cardId,
      {
        title: card.title,
        content: toggled.content,
        tags: card.tags,
      },
      toggled.checked ? '完成待办' : '取消完成待办',
    )

    return Boolean(updated)
  }

  // --- projections ---------------------------------------------------------

  async function placeCard(
    cardId: string,
    boardId: string,
    position: PlaceCardPosition,
  ): Promise<BoardItem | null> {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y))
      return null
    if (!cards.value.some((card) => card.id === cardId)) return null
    if (items.value.some((item) => item.cardId === cardId)) return null

    const item: BoardItem = {
      id: `projection-${crypto.randomUUID()}`,
      cardId,
      boardId,
      x: position.x,
      y: position.y,
      width: position.width ?? DEFAULT_CARD_WIDTH,
    }

    const snapshot = plainRecord(item)

    replaceLocalItem(item)
    selectItem(item.id)

    try {
      await db.boardItems.put(snapshot)
      broadcastWorkspaceChange('items', boardId)
    } catch (cause) {
      removeLocalItem(item.id)
      removeSelectedItem(item.id)

      console.error('[card-canvas] Unable to persist board item', cause)
      notifyFailure('投放未能写入本地库，已撤销。', {
        label: '重试',
        run: () => {
          if (activeBoardId.value !== boardId) return
          void placeCard(cardId, boardId, position)
        },
      })
      return null
    }

    record({
      label: '投放卡片',
      undo: async () => {
        await db.boardItems.delete(item.id)
        removeLocalItem(item.id)
        removeSelectedItem(item.id)
        broadcastWorkspaceChange('items', boardId)
      },
      redo: async () => {
        await db.boardItems.put(snapshot)
        replaceLocalItem(snapshot)
        selectItem(snapshot.id)
        broadcastWorkspaceChange('items', boardId)
      },
    })

    return item
  }

  async function deleteCard(cardId: string): Promise<boolean> {
    const card = cards.value.find((entry) => entry.id === cardId)
    if (!card) return false

    const cardSnapshot = plainRecord(card)
    const deleted: Card = {
      ...cardSnapshot,
      isDeleted: true,
      updatedAt: Date.now(),
    }
    const relatedItems = await db.boardItems
      .where('cardId')
      .equals(cardId)
      .toArray()
    const [outgoing, incoming] = await Promise.all([
      db.connections.where('fromCardId').equals(cardId).toArray(),
      db.connections.where('toCardId').equals(cardId).toArray(),
    ])
    const relatedConnections = [
      ...new Map(
        [...outgoing, ...incoming].map((connection) => [
          connection.id,
          plainRecord(connection),
        ]),
      ).values(),
    ]
    const localItems = items.value.filter((item) => item.cardId === cardId)
    const localConnections = connections.value.filter(
      (connection) =>
        connection.fromCardId === cardId || connection.toCardId === cardId,
    )

    removeLocalCard(cardId)
    for (const item of localItems) removeLocalItem(item.id)
    for (const connection of localConnections) {
      removeLocalConnection(connection.id)
    }
    pruneSelectedItems()
    if (
      selectedConnectionId.value &&
      !connections.value.some(
        (connection) => connection.id === selectedConnectionId.value,
      )
    ) {
      selectedConnectionId.value = null
    }

    try {
      await db.transaction(
        'rw',
        db.cards,
        db.boardItems,
        db.connections,
        async () => {
          await db.cards.put(deleted)
          await db.boardItems.where('cardId').equals(cardId).delete()
          if (relatedConnections.length) {
            await db.connections.bulkDelete(
              relatedConnections.map((connection) => connection.id),
            )
          }
        },
      )
      broadcastWorkspaceChange('all')
    } catch (cause) {
      replaceLocalCard(cardSnapshot)
      for (const item of localItems) replaceLocalItem(plainRecord(item))
      for (const connection of localConnections) {
        replaceLocalConnection(plainRecord(connection))
      }

      console.error('[card-canvas] Unable to delete card', cause)
      notifyFailure('删除卡片失败，已恢复。')
      return false
    }

    record({
      label: '删除卡片',
      undo: async () => {
        const restored: Card = { ...cardSnapshot }
        delete restored.isDeleted

        await db.transaction(
          'rw',
          db.cards,
          db.boardItems,
          db.connections,
          async () => {
            await db.cards.put(restored)
            if (relatedItems.length) {
              await db.boardItems.bulkPut(plainRecord(relatedItems))
            }
            if (relatedConnections.length) {
              await db.connections.bulkPut(relatedConnections)
            }
          },
        )

        replaceLocalCard(restored)
        for (const item of relatedItems) {
          if (item.boardId === activeBoardId.value) replaceLocalItem(item)
        }
        for (const connection of relatedConnections) {
          if (connection.boardId === activeBoardId.value) {
            replaceLocalConnection(connection)
          }
        }
        broadcastWorkspaceChange('all')
      },
      redo: async () => {
        await db.transaction(
          'rw',
          db.cards,
          db.boardItems,
          db.connections,
          async () => {
            await db.cards.put(deleted)
            await db.boardItems.where('cardId').equals(cardId).delete()
            if (relatedConnections.length) {
              await db.connections.bulkDelete(
                relatedConnections.map((connection) => connection.id),
              )
            }
          },
        )

        removeLocalCard(cardId)
        for (const item of relatedItems) removeLocalItem(item.id)
        for (const connection of relatedConnections) {
          removeLocalConnection(connection.id)
        }
        broadcastWorkspaceChange('all')
      },
    })

    return true
  }

  // --- connections ---------------------------------------------------------

  async function createConnection(
    fromCardId: string,
    toCardId: string,
  ): Promise<Connection | null> {
    const boardId = activeBoardId.value
    if (!boardId) return null
    if (fromCardId === toCardId) return null

    const hasFrom = items.value.some((item) => item.cardId === fromCardId)
    const hasTo = items.value.some((item) => item.cardId === toCardId)
    if (!hasFrom || !hasTo) return null

    if (
      connections.value.some((connection) =>
        isSameCardPair(connection, fromCardId, toCardId),
      )
    ) {
      useToastStore().push('这两张卡片之间已有连线。', {
        tone: 'info',
        timeout: 2500,
      })
      return null
    }

    const connection: Connection = {
      id: `connection-${crypto.randomUUID()}`,
      boardId,
      fromCardId,
      toCardId,
    }
    const snapshot = plainRecord(connection)

    replaceLocalConnection(connection)
    selectConnection(connection.id)

    try {
      await db.connections.put(snapshot)
      broadcastWorkspaceChange('connections', boardId)
    } catch (cause) {
      removeLocalConnection(connection.id)
      if (selectedConnectionId.value === connection.id) {
        selectedConnectionId.value = null
      }

      console.error('[card-canvas] Unable to persist connection', cause)
      notifyFailure('连线未能写入本地库，已撤销。')
      return null
    }

    record({
      label: '建立连线',
      undo: async () => {
        await db.connections.delete(connection.id)
        removeLocalConnection(connection.id)
        if (selectedConnectionId.value === connection.id) {
          selectedConnectionId.value = null
        }
        broadcastWorkspaceChange('connections', boardId)
      },
      redo: async () => {
        await db.connections.put(snapshot)
        replaceLocalConnection(snapshot)
        selectConnection(snapshot.id)
        broadcastWorkspaceChange('connections', boardId)
      },
    })

    return connection
  }

  async function deleteConnection(connectionId: string): Promise<boolean> {
    const found = connections.value.find(
      (connection) => connection.id === connectionId,
    )
    if (!found) return false

    const connection = plainRecord(found)

    removeLocalConnection(connection.id)
    if (selectedConnectionId.value === connection.id) {
      selectedConnectionId.value = null
    }

    try {
      await db.connections.delete(connection.id)
      broadcastWorkspaceChange('connections', connection.boardId)
    } catch (cause) {
      replaceLocalConnection(connection)

      console.error('[card-canvas] Unable to delete connection', cause)
      notifyFailure('删除连线失败，已恢复。')
      return false
    }

    record({
      label: '删除连线',
      undo: async () => {
        await db.connections.put(connection)
        replaceLocalConnection(connection)
        selectConnection(connection.id)
        broadcastWorkspaceChange('connections', connection.boardId)
      },
      redo: async () => {
        await db.connections.delete(connection.id)
        removeLocalConnection(connection.id)
        if (selectedConnectionId.value === connection.id) {
          selectedConnectionId.value = null
        }
        broadcastWorkspaceChange('connections', connection.boardId)
      },
    })

    return true
  }

  async function updateConnectionLabel(
    connectionId: string,
    label: string,
  ): Promise<Connection | null> {
    const found = connections.value.find(
      (connection) => connection.id === connectionId,
    )
    if (!found) return null

    const normalized = label.trim() || undefined
    if (found.label === normalized) return found

    const before = plainRecord(found)
    const after: Connection = { ...before, label: normalized }
    if (normalized === undefined) delete after.label

    replaceLocalConnection(after)

    try {
      await db.connections.put(after)
      broadcastWorkspaceChange('connections', after.boardId)
    } catch (cause) {
      replaceLocalConnection(before)

      console.error('[card-canvas] Unable to update connection label', cause)
      notifyFailure('连线说明保存失败，已恢复。')
      return null
    }

    record({
      label: '编辑连线说明',
      undo: async () => {
        await db.connections.put(before)
        replaceLocalConnection(before)
        broadcastWorkspaceChange('connections', before.boardId)
      },
      redo: async () => {
        await db.connections.put(after)
        replaceLocalConnection(after)
        broadcastWorkspaceChange('connections', after.boardId)
      },
    })

    return after
  }

  // --- positioning ---------------------------------------------------------

  function nudgeItem(itemId: string, dx: number, dy: number) {
    const item = items.value.find((entry) => entry.id === itemId)
    if (!item) return

    void commitItemPosition(itemId, item.x + dx, item.y + dy)
  }

  async function commitItemPositions(
    positions: Array<{ itemId: string; x: number; y: number }>,
  ): Promise<boolean> {
    const unique = new Map<string, { itemId: string; x: number; y: number }>()
    for (const position of positions) {
      if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) continue
      unique.set(position.itemId, position)
    }

    const changes = [...unique.values()].flatMap((position) => {
      const item = items.value.find((entry) => entry.id === position.itemId)
      if (!item || (item.x === position.x && item.y === position.y)) return []
      return [{ item, before: plainRecord(item), x: position.x, y: position.y }]
    })

    if (!changes.length) return true

    const after = changes.map((change) =>
      plainRecord({ ...change.item, x: change.x, y: change.y }),
    )
    const before = changes.map((change) => change.before)
    const boardId = after[0]?.boardId

    for (const item of after) replaceLocalItem(item)

    try {
      await db.transaction('rw', db.boardItems, async () => {
        await db.boardItems.bulkPut(after)
      })
      if (boardId) broadcastWorkspaceChange('items', boardId)
    } catch (cause) {
      for (const item of before) replaceLocalItem(item)
      console.error('[card-canvas] Unable to persist group positions', cause)
      notifyFailure('卡片位置保存失败，已恢复。', {
        label: '重试',
        run: () => {
          void commitItemPositions(
            after.map((item) => ({
              itemId: item.id,
              x: item.x,
              y: item.y,
            })),
          )
        },
      })
      return false
    }

    record({
      label: `移动 ${after.length} 张卡片`,
      undo: async () => {
        await db.transaction('rw', db.boardItems, async () => {
          await db.boardItems.bulkPut(before)
        })
        for (const item of before) replaceLocalItem(item)
        if (boardId) broadcastWorkspaceChange('items', boardId)
      },
      redo: async () => {
        await db.transaction('rw', db.boardItems, async () => {
          await db.boardItems.bulkPut(after)
        })
        for (const item of after) replaceLocalItem(item)
        if (boardId) broadcastWorkspaceChange('items', boardId)
      },
    })

    return true
  }

  async function commitItemPosition(itemId: string, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return

    const item = items.value.find((entry) => entry.id === itemId)
    if (!item || (item.x === x && item.y === y)) return

    const previous = { x: item.x, y: item.y }
    const moved = { ...item, x, y }

    replaceLocalItem(moved)

    try {
      await db.boardItems.update(itemId, { x, y })
      broadcastWorkspaceChange('items', item.boardId)
    } catch (cause) {
      replaceLocalItem(item)

      console.error(
        '[card-canvas] Unable to persist board item position',
        cause,
      )
      notifyFailure('卡片位置保存失败，已恢复。', {
        label: '重试',
        run: () => commitItemPosition(itemId, x, y),
      })
      return
    }

    record({
      label: '移动卡片',
      undo: async () => {
        await db.boardItems.update(itemId, previous)
        replaceLocalItem({ ...item, ...previous })
        broadcastWorkspaceChange('items', item.boardId)
      },
      redo: async () => {
        await db.boardItems.update(itemId, { x, y })
        replaceLocalItem({ ...item, x, y })
        broadcastWorkspaceChange('items', item.boardId)
      },
    })
  }

  // --- history -------------------------------------------------------------

  async function undo() {
    if (applyingHistory) return
    const entry = past.value.at(-1)
    if (!entry) return

    applyingHistory = true
    past.value = past.value.slice(0, -1)

    try {
      await entry.undo()
      future.value = [...future.value, entry]
    } catch (cause) {
      past.value = [...past.value, entry]
      console.error('[card-canvas] Unable to undo', cause)
      notifyFailure(`撤销「${entry.label}」失败。`)
    } finally {
      applyingHistory = false
    }
  }

  async function redo() {
    if (applyingHistory) return
    const entry = future.value.at(-1)
    if (!entry) return

    applyingHistory = true
    future.value = future.value.slice(0, -1)

    try {
      await entry.redo()
      past.value = [...past.value, entry]
    } catch (cause) {
      future.value = [...future.value, entry]
      console.error('[card-canvas] Unable to redo', cause)
      notifyFailure(`重做「${entry.label}」失败。`)
    } finally {
      applyingHistory = false
    }
  }

  function clearHistory() {
    past.value = []
    future.value = []
  }

  // --- cross-tab sync ------------------------------------------------------

  function scheduleRefresh() {
    if (refreshTimer !== null) return

    refreshTimer = setTimeout(() => {
      refreshTimer = null
      void refreshFromDb()
    }, 80)
  }

  async function refreshFromDb() {
    const boardId = activeBoardId.value
    if (!boardId || status.value !== 'ready') return

    try {
      const [storedCards, storedItems] = await Promise.all([
        db.cards.toArray(),
        db.boardItems.where('boardId').equals(boardId).toArray(),
      ])

      if (activeBoardId.value !== boardId || status.value !== 'ready') return

      const liveCards = storedCards
        .filter((card) => !card.isDeleted)
        .map(normalizeCard)
      const migrated = await placeMissingCards(boardId, liveCards)
      if (activeBoardId.value !== boardId || status.value !== 'ready') return

      cards.value = liveCards
      items.value = [...storedItems, ...migrated].sort((a, b) =>
        a.id.localeCompare(b.id),
      )
      connections.value = await db.connections
        .where('boardId')
        .equals(boardId)
        .toArray()

      pruneSelectedItems()

      if (
        selectedConnectionId.value &&
        !connections.value.some(
          (connection) => connection.id === selectedConnectionId.value,
        )
      ) {
        selectedConnectionId.value = null
      }
    } catch (cause) {
      console.error('[card-canvas] Unable to refresh from another tab', cause)
    }
  }

  function handleVisibilityChange() {
    if (document.visibilityState === 'visible') scheduleRefresh()
  }

  function startSync() {
    if (syncStarted) return
    syncStarted = true

    unsubscribeSync = subscribeWorkspaceChange((change) => {
      if (change.type === 'boards') return
      if (!activeBoardId.value) return
      if (change.boardId && change.boardId !== activeBoardId.value) return
      scheduleRefresh()
    })

    document.addEventListener('visibilitychange', handleVisibilityChange)
  }

  function stopSync() {
    if (!syncStarted) return
    syncStarted = false
    unsubscribeSync?.()
    unsubscribeSync = null
    document.removeEventListener('visibilitychange', handleVisibilityChange)
    if (refreshTimer !== null) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }

  // --- selection -----------------------------------------------------------

  function removeSelectedItem(itemId: string) {
    if (!selectedItemIds.value.has(itemId)) return

    const next = new Set(selectedItemIds.value)
    next.delete(itemId)
    selectedItemIds.value = next
  }

  function pruneSelectedItems() {
    const next = new Set(
      [...selectedItemIds.value].filter((itemId) =>
        items.value.some((item) => item.id === itemId),
      ),
    )
    if (next.size !== selectedItemIds.value.size) {
      selectedItemIds.value = next
    }
  }

  function selectItem(itemId: string) {
    selectItems([itemId])
  }

  function selectItems(itemIds: Iterable<string>) {
    const next = new Set(
      [...itemIds].filter((itemId) =>
        items.value.some((item) => item.id === itemId),
      ),
    )
    selectedItemIds.value = next
    selectedConnectionId.value = null
  }

  function selectConnection(connectionId: string) {
    selectedConnectionId.value = connectionId
    selectedItemIds.value = new Set()
  }

  function clearSelection() {
    selectedItemIds.value = new Set()
    selectedConnectionId.value = null
  }

  return {
    cards,
    items,
    connections,
    entries,
    selectedItemIds,
    selectedItemId,
    selectedItems,
    selectedItem,
    landingItemId,
    activeFilterTag,
    pulseItemId,
    selectedConnectionId,
    selectedConnection,
    status,
    error,
    isHydrated,
    activeBoardId,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    initialize,
    loadBoard,
    refresh: refreshFromDb,
    startSync,
    stopSync,
    selectItem,
    selectItems,
    selectConnection,
    clearSelection,
    toggleFilterTag,
    clearFilterTag,
    pulseItem,
    commitItemPosition,
    commitItemPositions,
    nudgeItem,
    captureCard,
    updateCard,
    toggleCardTask,
    placeCard,
    captureAndPlace,
    deleteCard,
    createConnection,
    deleteConnection,
    updateConnectionLabel,
    undo,
    redo,
    clearHistory,
  }
})
