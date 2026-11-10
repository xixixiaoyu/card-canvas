import type { SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import {
  removeLegacyDemoData,
  removeRemoteDemoData,
} from '../src/lib/demo-cleanup'

describe('legacy demo cleanup', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('is a no-op for an empty workspace', async () => {
    await expect(removeLegacyDemoData()).resolves.toBe(false)
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

    await expect(removeLegacyDemoData()).resolves.toBe(true)

    expect(await db.cards.get('card-demo-001')).toBeUndefined()
    expect(await db.boardItems.get('projection-001')).toBeUndefined()
    expect(await db.connections.get('demo-connection')).toBeUndefined()
    expect(await db.syncOutbox.get('cards:card-demo-001')).toBeUndefined()
    expect(await db.cards.get('user-card')).toBeDefined()
    expect(await db.boardItems.get('user-projection')).toBeDefined()
  })

  it('deletes fixed demo rows from the authenticated cloud workspace', async () => {
    const filters: Array<[string, string, string | string[]]> = []
    const from = vi.fn((table: string) => {
      const builder = {
        delete: vi.fn(() => builder),
        eq: vi.fn((column: string, value: string) => {
          if (column === 'user_id') {
            filters.push([table, column, value])
          }
          return builder
        }),
        in: vi.fn((column: string, values: string[]) => {
          filters.push([table, column, values])
          return Promise.resolve({ error: null })
        }),
      }
      return builder
    })

    await removeRemoteDemoData({ from } as unknown as SupabaseClient, 'user-1')

    expect(filters).toContainEqual(['cards', 'user_id', 'user-1'])
    expect(filters).toContainEqual([
      'cards',
      'id',
      ['card-demo-001', 'card-demo-002', 'card-demo-003'],
    ])
    expect(filters).toContainEqual([
      'board_items',
      'id',
      ['projection-001', 'projection-002', 'projection-003'],
    ])
    expect(filters).toContainEqual([
      'connections',
      'from_card_id',
      ['card-demo-001', 'card-demo-002', 'card-demo-003'],
    ])
    expect(filters).toContainEqual([
      'connections',
      'to_card_id',
      ['card-demo-001', 'card-demo-002', 'card-demo-003'],
    ])
  })
})
