import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import { useWorkspaceStore } from '../src/stores/workspace'
import type { Card } from '../src/types'

async function freshWorkspace() {
  setActivePinia(createPinia())
  await db.delete()
  await db.open()

  const workspace = useWorkspaceStore()
  await workspace.loadBoards()
  return workspace
}

describe('workspace store', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    vi.restoreAllMocks()
    localStorage.clear()
    await db.delete()
  })

  it('creates a default board and restores the last active one', async () => {
    const workspace = await freshWorkspace()

    expect(workspace.boards).toHaveLength(1)
    expect(workspace.boards[0].id).toBe('board-main')
    expect(workspace.activeBoardId).toBe('board-main')
    expect(workspace.activeBoardName).toBe('我的白板')
    expect(localStorage.getItem('card-canvas:active-board')).toBe('board-main')
  })

  it('creates, renames and switches boards', async () => {
    const workspace = await freshWorkspace()
    const board = await workspace.createBoard('研究板')

    expect(workspace.boards).toHaveLength(2)
    expect(workspace.activeBoardId).toBe(board.id)
    expect(workspace.activeBoardName).toBe('研究板')

    expect(await workspace.renameBoard(board.id, '深度工作')).toBe(true)
    expect(workspace.activeBoardName).toBe('深度工作')

    workspace.switchBoard('board-main')
    expect(workspace.activeBoardName).toBe('我的白板')
  })

  it('deletes a board with its projections and selects another board', async () => {
    const workspace = await freshWorkspace()
    const board = await workspace.createBoard('临时板')
    await db.boardItems.put({
      id: 'projection-temp',
      cardId: 'card-x',
      boardId: board.id,
      x: 0,
      y: 0,
    })
    await db.connections.put({
      id: 'connection-temp',
      boardId: board.id,
      fromCardId: 'card-x',
      toCardId: 'card-y',
    })

    expect(await workspace.deleteBoard(board.id)).toBe(true)
    expect(workspace.boards).toHaveLength(1)
    expect(workspace.activeBoardId).toBe('board-main')
    expect(await db.boardItems.get('projection-temp')).toBeUndefined()
    expect(await db.connections.get('connection-temp')).toBeUndefined()
  })

  it('soft-deletes cards that only belonged to the deleted board', async () => {
    const workspace = await freshWorkspace()
    const board = await workspace.createBoard('临时板')
    const cards: Card[] = [
      {
        id: 'card-unique',
        title: '只属于临时板',
        content: '',
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'card-shared',
        title: '同时出现在两个白板',
        content: '',
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ]
    await db.cards.bulkPut(cards)
    await db.boardItems.bulkPut([
      {
        id: 'projection-unique',
        cardId: 'card-unique',
        boardId: board.id,
        x: 0,
        y: 0,
      },
      {
        id: 'projection-shared-temp',
        cardId: 'card-shared',
        boardId: board.id,
        x: 100,
        y: 0,
      },
      {
        id: 'projection-shared-main',
        cardId: 'card-shared',
        boardId: 'board-main',
        x: 200,
        y: 0,
      },
    ])

    expect(await workspace.deleteBoard(board.id)).toBe(true)

    expect((await db.cards.get('card-unique'))?.isDeleted).toBe(true)
    expect((await db.cards.get('card-shared'))?.isDeleted).toBeUndefined()
    expect(await db.boardItems.get('projection-shared-main')).toBeDefined()
  })

  it('rolls back the whole board deletion when orphan cleanup fails', async () => {
    const workspace = await freshWorkspace()
    const board = await workspace.createBoard('事务板')
    await db.cards.put({
      id: 'card-transaction',
      title: '事务卡片',
      content: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    })
    await db.boardItems.put({
      id: 'projection-transaction',
      cardId: 'card-transaction',
      boardId: board.id,
      x: 0,
      y: 0,
    })
    vi.spyOn(db.cards, 'bulkPut').mockRejectedValueOnce(new Error('disk full'))

    await expect(workspace.deleteBoard(board.id)).rejects.toThrow('disk full')

    expect(await db.boards.get(board.id)).toBeDefined()
    expect(await db.boardItems.get('projection-transaction')).toBeDefined()
    expect((await db.cards.get('card-transaction'))?.isDeleted).toBeUndefined()
  })

  it('refuses to delete the last remaining board', async () => {
    const workspace = await freshWorkspace()

    expect(await workspace.deleteBoard('board-main')).toBe(false)
    expect(workspace.boards).toHaveLength(1)
  })
})
