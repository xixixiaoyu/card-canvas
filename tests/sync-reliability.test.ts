import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import { SYNC_META_KEYS } from '../src/lib/sync/types'

const supabaseApi = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: true,
  syncClientId: 'test-client',
  getSupabaseClient: supabaseApi.getSupabaseClient,
}))

import { useSyncStore } from '../src/stores/sync'

interface MockOptions {
  pullError?: { message: string } | null
  serverUpdatedAt?: string
}

function createSupabaseMock(options: MockOptions = {}) {
  const upsert = vi.fn((rows: Array<Record<string, unknown>>) => ({
    select: () =>
      Promise.resolve({
        data: rows.map((row) => ({
          id: row.id,
          server_updated_at:
            options.serverUpdatedAt ?? '2026-11-14T08:30:00.000Z',
        })),
        error: null,
      }),
  }))
  const client = {
    from() {
      return {
        select() {
          const query = {
            eq: () => query,
            or: () => query,
            order: () => query,
            range: () =>
              Promise.resolve({
                data: [],
                error: options.pullError ?? null,
              }),
          }
          return query
        },
        delete() {
          const query = {
            eq: () => query,
            in: () => Promise.resolve({ error: null }),
          }
          return query
        },
        upsert,
      }
    },
    channel() {
      const channel = {
        on: () => channel,
        subscribe: (listener: (status: string) => void) => {
          listener('SUBSCRIBED')
          return channel
        },
      }
      return channel
    },
    removeChannel: () => Promise.resolve(),
  }
  return { client, upsert }
}

describe('sync reliability', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    await db.syncMeta.put({
      key: SYNC_META_KEYS.ownerId,
      value: 'user-a',
    })
  })

  afterEach(async () => {
    useSyncStore().stop()
    await db.delete()
  })

  it('uploads delete tombstones even when a pull fails', async () => {
    const tombstone = {
      id: 'card-delete',
      title: '',
      content: '',
      tags: [],
      createdAt: 1000,
      updatedAt: 5000,
      isDeleted: true,
    }
    await db.cards.put(tombstone)
    await db.syncOutbox.put({
      key: 'cards:card-delete',
      table: 'cards',
      recordId: 'card-delete',
      operation: 'upsert',
      payload: tombstone,
      updatedAt: 5000,
    })
    const { client, upsert } = createSupabaseMock({
      pullError: { message: 'temporary pull failure' },
    })
    supabaseApi.getSupabaseClient.mockResolvedValue(client)

    const sync = useSyncStore()
    await sync.start('user-a')

    expect(upsert).toHaveBeenCalledTimes(1)
    expect(upsert.mock.calls[0]?.[0]).toEqual([
      expect.objectContaining({
        id: 'card-delete',
        title: '',
        content: '',
        is_deleted: true,
      }),
    ])
    expect(await db.syncOutbox.count()).toBe(0)
    expect(sync.error).toContain('temporary pull failure')
  })

  it('replaces a skewed local timestamp with the server revision time', async () => {
    const futureTime = Date.now() + 86_400_000
    const card = {
      id: 'card-local',
      title: '本地修改',
      content: '等待同步',
      tags: [],
      createdAt: 1000,
      updatedAt: futureTime,
    }
    await db.cards.put(card)
    await db.syncOutbox.put({
      key: 'cards:card-local',
      table: 'cards',
      recordId: 'card-local',
      operation: 'upsert',
      payload: card,
      updatedAt: futureTime,
    })
    const { client } = createSupabaseMock({
      serverUpdatedAt: '2026-11-14T09:00:00.000Z',
    })
    supabaseApi.getSupabaseClient.mockResolvedValue(client)

    const sync = useSyncStore()
    await sync.start('user-a')

    expect(sync.phase).toBe('synced')
    expect(await db.syncOutbox.count()).toBe(0)
    expect((await db.cards.get('card-local'))?.updatedAt).toBe(
      Date.parse('2026-11-14T09:00:00.000Z'),
    )
  })

  it('turns startup failures into a recoverable sync error', async () => {
    supabaseApi.getSupabaseClient.mockRejectedValue(
      new Error('unable to start sync'),
    )
    const sync = useSyncStore()

    await expect(sync.start('user-a')).resolves.toBeUndefined()
    expect(sync.phase).toBe('error')
    expect(sync.error).toContain('unable to start sync')
  })
})
