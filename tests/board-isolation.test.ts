import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { useBoardStore } from '../src/stores/board'
import type { Board } from '../src/types'

const boards: Board[] = [
  {
    id: 'board-isolation-b',
    name: '隔离 B',
    createdAt: 2,
    updatedAt: 2,
  },
  {
    id: 'board-isolation-c',
    name: '隔离 C',
    createdAt: 3,
    updatedAt: 3,
  },
]

describe('board and card isolation', () => {
  beforeEach(async () => {
    localStorage.clear()
    await db.delete()
    setActivePinia(createPinia())
  })

  afterEach(async () => {
    await db.delete()
  })

  it('keeps same-titled cards, edits and connections inside their own boards', async () => {
    const board = useBoardStore()
    await board.initialize('board-main')
    await db.boards.bulkPut(boards)

    await board.loadBoard('board-isolation-b')
    const b1 = await board.captureAndPlace(
      { title: '同名卡片', content: 'B 内容', tags: ['Board/B'] },
      'board-isolation-b',
      { x: 10, y: 10 },
    )
    const b2 = await board.captureAndPlace(
      { title: 'B 第二张', content: '只在 B', tags: ['Board/B'] },
      'board-isolation-b',
      { x: 500, y: 10 },
    )
    const bConnection = await board.createConnection(b1.card.id, b2.card.id)

    await board.loadBoard('board-isolation-c')
    const c1 = await board.captureAndPlace(
      { title: '同名卡片', content: 'C 内容', tags: ['Board/C'] },
      'board-isolation-c',
      { x: 20, y: 20 },
    )

    expect(b1.card.id).not.toBe(c1.card.id)
    expect(board.entries.map((entry) => entry.card.content)).toEqual(['C 内容'])
    expect(board.connections).toHaveLength(0)

    await board.updateCard(b1.card.id, {
      title: b1.card.title,
      content: 'B 更新',
      tags: b1.card.tags,
    })
    expect((await db.cards.get(c1.card.id))?.content).toBe('C 内容')
    expect((await db.cards.get(b1.card.id))?.content).toBe('B 更新')

    await board.loadBoard('board-main')
    expect(board.entries).toHaveLength(3)
    expect(board.entries.some((entry) => entry.card.title === '同名卡片')).toBe(
      false,
    )
    expect(board.connections).toHaveLength(0)

    await board.loadBoard('board-isolation-b')
    expect(board.entries.map((entry) => entry.card.title).sort()).toEqual([
      'B 第二张',
      '同名卡片',
    ])
    expect(board.connections.map((connection) => connection.id)).toEqual([
      bConnection?.id,
    ])
    expect(
      board.entries.find((entry) => entry.card.id === b1.card.id)?.card.content,
    ).toBe('B 更新')

    await board.loadBoard('board-isolation-c')
    expect(
      board.entries.find((entry) => entry.card.id === c1.card.id)?.card.content,
    ).toBe('C 内容')

    expect(
      await db.boardItems.where('boardId').equals('board-isolation-b').count(),
    ).toBe(2)
    expect(
      await db.boardItems.where('boardId').equals('board-isolation-c').count(),
    ).toBe(1)
  })

  it('reloads a board without claiming cards from another board', async () => {
    const board = useBoardStore()
    await board.initialize('board-main')
    await db.boards.bulkPut(boards)

    await board.loadBoard('board-isolation-b')
    await board.captureAndPlace(
      { title: 'B 专属', content: '', tags: [] },
      'board-isolation-b',
      { x: 0, y: 0 },
    )
    await board.loadBoard('board-isolation-c')
    await board.captureAndPlace(
      { title: 'C 专属', content: '', tags: [] },
      'board-isolation-c',
      { x: 0, y: 0 },
    )

    setActivePinia(createPinia())
    const reloaded = useBoardStore()
    await reloaded.initialize('board-isolation-c')

    expect(reloaded.entries.map((entry) => entry.card.title)).toEqual([
      'C 专属',
    ])
    expect(
      await db.boardItems.where('boardId').equals('board-isolation-b').count(),
    ).toBe(1)
    expect(
      await db.boardItems.where('boardId').equals('board-isolation-c').count(),
    ).toBe(1)
  })
})
