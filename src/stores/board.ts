import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../db'
import { seedBoardItems, seedCards } from '../data/seed'
import { normalizeTags } from '../lib/tags'
import type { BoardItem, Card } from '../types'
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

export interface PlaceCardPosition {
  x: number
  y: number
  width?: number
}

const DEFAULT_CARD_WIDTH = 420

/**
 * The board store owns the durable graph (cards + spatial projections) that
 * the canvas renders. During a card drag no store writes happen; the final
 * position is committed exactly once on pointerup.
 */
export const useBoardStore = defineStore('board', () => {
  const cards = ref<Card[]>([])
  const items = ref<BoardItem[]>([])
  const selectedItemId = ref<string | null>(null)
  const status = ref<BoardStatus>('idle')
  const error = ref<string | null>(null)

  let initialization: Promise<void> | null = null
  let loadedBoardId: string | null = null

  const entries = computed<BoardEntry[]>(() => {
    const cardsById = new Map(cards.value.map((card) => [card.id, card]))

    return items.value.flatMap((item) => {
      const card = cardsById.get(item.cardId)
      return card ? [{ item, card }] : []
    })
  })

  const selectedItem = computed(
    () =>
      items.value.find((item) => item.id === selectedItemId.value) ?? null,
  )

  const isHydrated = computed(() => status.value === 'ready')

  /**
   * The inbox is derived, never stored: a card is "unsorted" exactly when it
   * has no projection on the active board. No `isPlaced` flag can drift.
   */
  const placedCardIds = computed(
    () => new Set(items.value.map((item) => item.cardId)),
  )

  const inboxCards = computed(() =>
    cards.value
      .filter((card) => !placedCardIds.value.has(card.id))
      .sort((a, b) => b.createdAt - a.createdAt),
  )

  const inboxCount = computed(() => inboxCards.value.length)

  function initialize(boardId: string) {
    if (initialization) return initialization
    if (status.value === 'ready') return Promise.resolve()

    const task = (async () => {
      status.value = 'loading'
      error.value = null

      try {
        await db.open()

        const [cardCount, itemCount] = await Promise.all([
          db.cards.count(),
          db.boardItems.count(),
        ])

        if (cardCount === 0 && itemCount === 0) {
          await db.transaction('rw', db.cards, db.boardItems, async () => {
            await db.cards.bulkPut(seedCards)
            await db.boardItems.bulkPut(seedBoardItems)
          })
        }

        const [storedCards, storedItems] = await Promise.all([
          db.cards.toArray(),
          db.boardItems.where('boardId').equals(boardId).toArray(),
        ])

        cards.value = storedCards
          .filter((card) => !card.isDeleted)
          .map((card) => ({ ...card, tags: normalizeTags(card.tags ?? []) }))
        items.value = storedItems.sort((a, b) => a.id.localeCompare(b.id))
        loadedBoardId = boardId
        status.value = 'ready'
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

  /**
   * Capture writes a pure Card entity. No board id, no coordinates: placing it
   * on a canvas is a separate, explicit gesture handled by `placeCard`.
   */
  async function captureCard(input: CaptureCardInput): Promise<Card> {
    const now = Date.now()
    const card: Card = {
      id: `card-${crypto.randomUUID()}`,
      title: input.title.trim(),
      content: input.content.trim(),
      tags: normalizeTags(input.tags),
      createdAt: now,
      updatedAt: now,
    }

    // The UI closing and the inbox badge are more important than the disk
    // round-trip, so the card is published first and persisted in background.
    cards.value = [card, ...cards.value]

    try {
      await db.cards.put(card)
    } catch (cause) {
      cards.value = cards.value.filter((entry) => entry.id !== card.id)

      console.error('[card-canvas] Unable to persist captured card', cause)
      throw cause instanceof Error ? cause : new Error(String(cause))
    }

    return card
  }

  /**
   * Add a spatial projection for an existing card and mount it on the board.
   * The derived inbox drops the card as soon as this item exists.
   */
  function placeCard(
    cardId: string,
    boardId: string,
    position: PlaceCardPosition,
  ): BoardItem | null {
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) return null
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

    items.value = [...items.value, item]
    selectItem(item.id)

    void db.boardItems.put(item).catch((cause) => {
      items.value = items.value.filter((entry) => entry.id !== item.id)
      if (selectedItemId.value === item.id) selectedItemId.value = null

      console.error('[card-canvas] Unable to persist board item', cause)
      useToastStore().push('投放未能写入本地库，已撤销。', {
        tone: 'error',
        action: {
          label: '重试',
          run: () => {
            if (loadedBoardId !== boardId) return
            placeCard(cardId, boardId, position)
          },
        },
      })
    })

    return item
  }

  function selectItem(itemId: string) {
    selectedItemId.value = itemId
  }

  function clearSelection() {
    selectedItemId.value = null
  }

  function commitItemPosition(itemId: string, x: number, y: number) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return

    const index = items.value.findIndex((item) => item.id === itemId)
    const item = items.value[index]
    if (!item || (item.x === x && item.y === y)) return

    // One reactive store write per drop, then a single asynchronous DB update.
    items.value[index] = { ...item, x, y }
    void db.boardItems.update(itemId, { x, y }).catch((cause) => {
      console.error('[card-canvas] Unable to persist board item position', cause)
      useToastStore().push('卡片位置未能写入本地库。', {
        tone: 'error',
        action: {
          label: '重试',
          run: () => {
            void db.boardItems.update(itemId, { x, y }).catch((retryCause) => {
              console.error(
                '[card-canvas] Unable to persist board item position',
                retryCause,
              )
            })
          },
        },
      })
    })
  }

  return {
    cards,
    items,
    entries,
    selectedItemId,
    selectedItem,
    status,
    error,
    isHydrated,
    inboxCards,
    inboxCount,
    initialize,
    selectItem,
    clearSelection,
    commitItemPosition,
    captureCard,
    placeCard,
  }
})
