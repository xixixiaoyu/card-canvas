import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { useWorkspaceStore } from '../src/stores/workspace'

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

  it('refuses to delete the last remaining board', async () => {
    const workspace = await freshWorkspace()

    expect(await workspace.deleteBoard('board-main')).toBe(false)
    expect(workspace.boards).toHaveLength(1)
  })
})
