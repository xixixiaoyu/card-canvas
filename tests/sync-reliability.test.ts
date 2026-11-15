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
  pullErrorTable?: string
  missingTables?: string[]
  missingColumns?: Record<string, string[]>
  serverUpdatedAt?: string
}

function createSupabaseMock(options: MockOptions = {}) {
  const missingTableError = {
    code: 'PGRST205',
    message: 'Could not find the table in the schema cache',
  }
  const upsert = vi.fn(
    (table: string, rows: Array<Record<string, unknown>>) => {
      const missingColumn = options.missingColumns?.[table]?.find((column) =>
        rows.some((row) => column in row),
      )
      return {
        select: () =>
          Promise.resolve({
            data: options.missingTables?.includes(table)
              ? null
              : rows.map((row) => ({
                  id: row.id,
                  server_updated_at:
                    options.serverUpdatedAt ?? '2026-11-14T08:30:00.000Z',
                })),
            error: options.missingTables?.includes(table)
              ? missingTableError
              : missingColumn
                ? {
                    code: 'PGRST204',
                    message: `Could not find the '${missingColumn}' column of '${table}' in the schema cache`,
                  }
                : null,
          }),
      }
    },
  )
  const client = {
    from(table: string) {
      return {
        select(column?: string) {
          const query = {
            eq: () => query,
            or: () => query,
            order: () => query,
            limit: () =>
              Promise.resolve({
                data: [],
                error: options.missingTables?.includes(table)
                  ? missingTableError
                  : column && options.missingColumns?.[table]?.includes(column)
                    ? {
                        code: '42703',
                        message: `column ${table}.${column} does not exist`,
                      }
                    : null,
              }),
            range: () =>
              Promise.resolve({
                data: [],
                error: options.missingTables?.includes(table)
                  ? missingTableError
                  : options.pullError &&
                      (!options.pullErrorTable ||
                        options.pullErrorTable === table)
                    ? options.pullError
                    : null,
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
        upsert: (rows: Array<Record<string, unknown>>) => upsert(table, rows),
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
    expect(upsert.mock.calls[0]?.[1]).toEqual([
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

  it('keeps zone changes pending without blocking regular sync when its table is missing', async () => {
    const zone = {
      id: 'zone-missing',
      boardId: 'board-main',
      title: '暂不跨设备',
      color: 'amber' as const,
      createdAt: 1000,
      updatedAt: 5000,
    }
    const card = {
      id: 'card-syncable',
      title: '仍可同步',
      content: '',
      tags: [],
      createdAt: 1000,
      updatedAt: 5000,
    }
    await db.boardZones.put(zone)
    await db.cards.put(card)
    await db.syncOutbox.bulkPut([
      {
        key: 'boardZones:zone-missing',
        table: 'boardZones',
        recordId: zone.id,
        operation: 'upsert',
        payload: zone,
        updatedAt: 5000,
      },
      {
        key: 'cards:card-syncable',
        table: 'cards',
        recordId: card.id,
        operation: 'upsert',
        payload: card,
        updatedAt: 5000,
      },
    ])
    const { client, upsert } = createSupabaseMock({
      missingTables: ['board_zones'],
    })
    supabaseApi.getSupabaseClient.mockResolvedValue(client)

    const sync = useSyncStore()
    await sync.start('user-a')

    expect(sync.phase).toBe('synced')
    expect(sync.zoneCloudMissing).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      'board_zones',
      expect.arrayContaining([expect.objectContaining({ id: zone.id })]),
    )
    expect(upsert).toHaveBeenCalledWith(
      'cards',
      expect.arrayContaining([expect.objectContaining({ id: card.id })]),
    )
    expect(await db.syncOutbox.get('boardZones:zone-missing')).toBeDefined()
    expect(await db.syncOutbox.get('cards:card-syncable')).toBeUndefined()
  })

  it('syncs item positions without zone_id and backfills membership after migration', async () => {
    const item = {
      id: 'projection-zoned',
      cardId: 'card-a',
      boardId: 'board-main',
      x: 12,
      y: 24,
      zoneId: 'zone-a',
      updatedAt: 5000,
    }
    await db.boardItems.put(item)
    await db.syncOutbox.put({
      key: 'boardItems:projection-zoned',
      table: 'boardItems',
      recordId: item.id,
      operation: 'upsert',
      payload: item,
      updatedAt: 5000,
    })
    const options: MockOptions = {
      missingColumns: { board_items: ['zone_id'] },
    }
    const { client, upsert } = createSupabaseMock(options)
    supabaseApi.getSupabaseClient.mockResolvedValue(client)

    const sync = useSyncStore()
    await sync.start('user-a')

    expect(sync.zoneCloudMissing).toBe(true)
    expect(
      await db.syncOutbox.get('boardItems:projection-zoned'),
    ).toBeUndefined()
    const fallbackRows = upsert.mock.calls.find(
      (call) =>
        call[0] === 'board_items' &&
        call[1].every((row) => !Object.hasOwn(row, 'zone_id')),
    )?.[1]
    expect(fallbackRows).toEqual([
      expect.objectContaining({ id: item.id, x: 12, y: 24 }),
    ])

    options.missingColumns = {}
    await sync.synchronize()

    expect(sync.zoneCloudMissing).toBe(false)
    expect(upsert).toHaveBeenCalledWith('board_items', [
      expect.objectContaining({ id: item.id, zone_id: item.zoneId }),
    ])
  })
})
