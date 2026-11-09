import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createBackup, importBackupText } from '../src/lib/backup'
import { db } from '../src/db'
import { useBoardStore } from '../src/stores/board'

async function seed() {
  setActivePinia(createPinia())
  const board = useBoardStore()
  await board.initialize('board-main')
  return board
}

describe('workspace backup', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterEach(async () => {
    await db.delete()
  })

  it('exports every durable table and imports it back', async () => {
    await seed()
    const backup = await createBackup()

    expect(backup.app).toBe('card-canvas')
    expect(backup.version).toBe(1)
    expect(backup.cards).toHaveLength(3)
    expect(backup.boardItems).toHaveLength(3)
    expect(backup.connections).toHaveLength(0)

    await db.cards.clear()
    await db.boardItems.clear()
    await db.connections.clear()

    const counts = await importBackupText(JSON.stringify(backup))

    expect(counts).toEqual({
      cards: 3,
      boardItems: 3,
      connections: 0,
      boards: 0,
    })
    expect(await db.cards.count()).toBe(3)
    expect(await db.boardItems.count()).toBe(3)
  })

  it('includes connections and restores them', async () => {
    const board = await seed()
    await board.createConnection(board.cards[0].id, board.cards[1].id)

    const backup = await createBackup()
    expect(backup.connections).toHaveLength(1)
    expect(backup.connections[0].label).toBeUndefined()

    await db.connections.clear()
    await importBackupText(JSON.stringify(backup))
    expect(await db.connections.count()).toBe(1)
  })

  it('normalizes tags while importing and preserves projections', async () => {
    const payload = {
      app: 'card-canvas',
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: [
        {
          id: 'card-imported',
          title: '导入卡片',
          content: '内容',
          tags: ['Design', 'design', ' 研究 '],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      boardItems: [
        {
          id: 'projection-imported',
          cardId: 'card-imported',
          boardId: 'board-main',
          x: 12,
          y: 34,
          width: 420,
        },
      ],
      connections: [],
    }

    const counts = await importBackupText(JSON.stringify(payload))
    const card = await db.cards.get('card-imported')
    const item = await db.boardItems.get('projection-imported')

    expect(counts.cards).toBe(1)
    expect(card?.tags).toEqual(['Design', '研究'])
    expect(item).toMatchObject({ x: 12, y: 34, cardId: 'card-imported' })
  })

  it('rejects malformed backups without writing anything', async () => {
    await expect(importBackupText('{oops')).rejects.toThrow('JSON')
    await expect(
      importBackupText(JSON.stringify({ app: 'other' })),
    ).rejects.toThrow('Card Canvas')
    await expect(
      importBackupText(
        JSON.stringify({
          app: 'card-canvas',
          cards: [],
          boardItems: [{ id: 'x', cardId: 'c', boardId: 'b', x: 0 }],
        }),
      ),
    ).rejects.toThrow('坐标')

    expect(await db.cards.count()).toBe(0)
    expect(await db.boardItems.count()).toBe(0)
  })
})
