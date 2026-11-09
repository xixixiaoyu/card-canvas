import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../db'
import { seedBoardItems, seedCards } from '../data/seed'
import type { BoardItem, Card } from '../types'

export type BoardStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface BoardEntry {
  item: BoardItem
  card: Card
}

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

        cards.value = storedCards.filter((card) => !card.isDeleted)
        items.value = storedItems.sort((a, b) => a.id.localeCompare(b.id))
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
    initialize,
    selectItem,
    clearSelection,
    commitItemPosition,
  }
})
