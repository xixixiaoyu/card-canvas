import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { db } from '../db'
import { softDeleteUnreferencedCards } from '../lib/board-cleanup'
import {
  broadcastWorkspaceChange,
  subscribeWorkspaceChange,
} from '../lib/tab-sync'
import { clearViewport } from '../lib/view-state'
import type { Board } from '../types'

const ACTIVE_BOARD_KEY = 'card-canvas:active-board'
const DEFAULT_BOARD_ID = 'board-main'
const DEFAULT_BOARD_NAME = '我的白板'

/**
 * Workspace UI state plus the durable board list. Cards are global; a board is
 * only a set of spatial projections, so switching boards never copies content.
 */
export const useWorkspaceStore = defineStore('workspace', () => {
  const boards = ref<Board[]>([])
  const activeBoardId = ref(DEFAULT_BOARD_ID)
  const selectedCardId = ref<string | null>(null)
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')

  let loading: Promise<void> | null = null
  let syncStarted = false
  let unsubscribe: (() => void) | null = null

  const activeBoard = computed(
    () =>
      boards.value.find((board) => board.id === activeBoardId.value) ?? null,
  )
  const activeBoardName = computed(
    () => activeBoard.value?.name ?? '未命名白板',
  )

  function persistActiveBoard(id: string) {
    try {
      localStorage.setItem(ACTIVE_BOARD_KEY, id)
    } catch {
      // Private mode may reject storage; the in-memory choice still works.
    }
  }

  async function refreshBoards() {
    const stored = await db.boards.toArray()
    if (!stored.length) return

    boards.value = stored.sort((a, b) => a.createdAt - b.createdAt)

    if (!stored.some((board) => board.id === activeBoardId.value)) {
      switchBoard(stored[0].id)
    }
  }

  async function loadBoards() {
    if (loading) return loading

    const task = (async () => {
      status.value = 'loading'
      await db.open()

      let stored = await db.boards.toArray()

      if (!stored.length) {
        const now = Date.now()
        const board: Board = {
          id: DEFAULT_BOARD_ID,
          name: DEFAULT_BOARD_NAME,
          createdAt: now,
          updatedAt: now,
        }
        await db.boards.put(board)
        stored = [board]
      }

      boards.value = stored.sort((a, b) => a.createdAt - b.createdAt)

      let saved: string | null = null
      try {
        saved = localStorage.getItem(ACTIVE_BOARD_KEY)
      } catch {
        saved = null
      }

      activeBoardId.value =
        saved && stored.some((board) => board.id === saved)
          ? saved
          : stored[0].id
      persistActiveBoard(activeBoardId.value)
      status.value = 'ready'
    })()

    loading = task.finally(() => {
      loading = null
    })

    return loading
  }

  function switchBoard(boardId: string) {
    if (!boards.value.some((board) => board.id === boardId)) return false

    activeBoardId.value = boardId
    persistActiveBoard(boardId)
    return true
  }

  async function createBoard(name: string) {
    const now = Date.now()
    const board: Board = {
      id: `board-${crypto.randomUUID()}`,
      name: name.trim() || `未命名白板 ${boards.value.length + 1}`,
      createdAt: now,
      updatedAt: now,
    }

    await db.boards.put(board)
    boards.value = [...boards.value, board]
    switchBoard(board.id)
    broadcastWorkspaceChange('boards')

    return board
  }

  async function renameBoard(boardId: string, name: string) {
    const board = boards.value.find((entry) => entry.id === boardId)
    const trimmed = name.trim()
    if (!board || !trimmed) return false

    const next: Board = { ...board, name: trimmed, updatedAt: Date.now() }
    await db.boards.put(next)
    boards.value = boards.value.map((entry) =>
      entry.id === boardId ? next : entry,
    )
    broadcastWorkspaceChange('boards')

    return true
  }

  async function deleteBoard(boardId: string) {
    if (boards.value.length <= 1) return false
    if (!boards.value.some((board) => board.id === boardId)) return false

    await db.transaction(
      'rw',
      db.boards,
      db.cards,
      db.boardItems,
      db.connections,
      async () => {
        const boardItems = await db.boardItems
          .where('boardId')
          .equals(boardId)
          .toArray()
        const candidateCardIds = [
          ...new Set(boardItems.map((item) => item.cardId)),
        ]

        await db.boards.delete(boardId)
        await db.boardItems.where('boardId').equals(boardId).delete()
        await db.connections.where('boardId').equals(boardId).delete()

        await softDeleteUnreferencedCards(candidateCardIds)
      },
    )

    boards.value = boards.value.filter((board) => board.id !== boardId)
    clearViewport(boardId)

    if (activeBoardId.value === boardId) {
      switchBoard(boards.value[0].id)
    }

    broadcastWorkspaceChange('boards')
    return true
  }

  function startSync() {
    if (syncStarted) return
    syncStarted = true

    unsubscribe = subscribeWorkspaceChange((change) => {
      if (change.type !== 'boards' && change.type !== 'all') return
      void refreshBoards()
    })
  }

  function stopSync() {
    if (!syncStarted) return
    syncStarted = false
    unsubscribe?.()
    unsubscribe = null
  }

  function selectCard(cardId: string | null) {
    selectedCardId.value = cardId
  }

  return {
    boards,
    activeBoardId,
    activeBoard,
    activeBoardName,
    selectedCardId,
    status,
    loadBoards,
    switchBoard,
    createBoard,
    renameBoard,
    deleteBoard,
    startSync,
    stopSync,
    selectCard,
  }
})
