import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { removeLegacyDemoData } from '../src/lib/demo-cleanup'

describe('legacy demo cleanup', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('is a no-op for an empty workspace', async () => {
    await expect(removeLegacyDemoData()).resolves.toBeUndefined()
    expect(await db.cards.count()).toBe(0)
    expect(await db.boardItems.count()).toBe(0)
  })

  it('removes only fixed demo records and preserves user data', async () => {
    await db.cards.bulkPut([
      {
        id: 'card-demo-001',
        title: 'Demo',
        content: '',
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
      {
        id: 'user-card',
        title: 'Mine',
        content: '',
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      },
    ])
    await db.boardItems.bulkPut([
      {
        id: 'projection-001',
        cardId: 'card-demo-001',
        boardId: 'board-main',
        x: 0,
        y: 0,
      },
      {
        id: 'user-projection',
        cardId: 'user-card',
        boardId: 'board-main',
        x: 100,
        y: 100,
      },
    ])
    await db.connections.put({
      id: 'demo-connection',
      boardId: 'board-main',
      fromCardId: 'card-demo-001',
      toCardId: 'user-card',
    })
    await db.syncOutbox.put({
      key: 'cards:card-demo-001',
      table: 'cards',
      recordId: 'card-demo-001',
      operation: 'upsert',
      payload: {},
      updatedAt: 1,
    })

    await removeLegacyDemoData()

    expect(await db.cards.get('card-demo-001')).toBeUndefined()
    expect(await db.boardItems.get('projection-001')).toBeUndefined()
    expect(await db.connections.get('demo-connection')).toBeUndefined()
    expect(await db.syncOutbox.get('cards:card-demo-001')).toBeUndefined()
    expect(await db.cards.get('user-card')).toBeDefined()
    expect(await db.boardItems.get('user-projection')).toBeDefined()
  })
})
