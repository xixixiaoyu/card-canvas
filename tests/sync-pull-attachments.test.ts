import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import { SYNC_META_KEYS, tablePullCursorKey } from '../src/lib/sync/types'

const remoteRows = {
  boards: [
    {
      id: 'board-main',
      name: '云端白板',
      created_at: 1,
      updated_at: 10,
      is_deleted: false,
      server_updated_at: '2026-11-14T00:00:00.001Z',
    },
  ],
  cards: [
    {
      id: 'card-cloud',
      title: '云端图片卡片',
      content: '![image.webp](attachment://attachment-cloud)',
      tags: [],
      highlights: null,
      created_at: 2,
      updated_at: 20,
      is_deleted: false,
      server_updated_at: '2026-11-14T00:00:00.002Z',
    },
  ],
  attachments: [
    {
      id: 'attachment-cloud',
      card_id: 'card-cloud',
      file_name: 'image.webp',
      mime_type: 'image/webp',
      size: 4,
      width: 1,
      height: 1,
      data_url: 'data:image/webp;base64,AA==',
      created_at: 3,
      updated_at: 30,
      is_deleted: false,
      server_updated_at: '2026-11-14T00:00:00.003Z',
    },
  ],
  board_items: [
    {
      id: 'projection-cloud',
      card_id: 'card-cloud',
      board_id: 'board-main',
      x: 120,
      y: 80,
      width: 420,
      color: null,
      updated_at: 40,
      is_deleted: false,
      server_updated_at: '2026-11-14T00:00:00.004Z',
    },
  ],
  connections: [],
} as const

const supabaseApi = vi.hoisted(() => ({
  getSupabaseClient: vi.fn(),
}))

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: true,
  syncClientId: 'test-client',
  getSupabaseClient: supabaseApi.getSupabaseClient,
}))

import { useSyncStore } from '../src/stores/sync'

function queryBuilder(table: string) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    or: () => builder,
    order: () => builder,
    range: () =>
      Promise.resolve({
        data:
          remoteRows[table as keyof typeof remoteRows]?.map((row) => ({
            ...row,
          })) ?? [],
        error: null,
      }),
  }
  return builder
}

function deleteBuilder() {
  const builder = {
    eq: () => builder,
    in: () => Promise.resolve({ error: null }),
  }
  return builder
}

function createSupabaseMock() {
  return {
    from(table: string) {
      return {
        select: () => queryBuilder(table),
        delete: () => deleteBuilder(),
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
}

describe('sync remote pull with image attachments', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    setActivePinia(createPinia())
    vi.clearAllMocks()
    supabaseApi.getSupabaseClient.mockResolvedValue(createSupabaseMock())
  })

  afterEach(async () => {
    useSyncStore().stop()
    await db.delete()
  })

  it('applies remote attachments before continuing to board projections', async () => {
    const sync = useSyncStore()
    await sync.start('user-a')

    expect(sync.error).toBeNull()
    expect(sync.phase).toBe('synced')
    expect(await db.attachments.get('attachment-cloud')).toMatchObject({
      cardId: 'card-cloud',
      dataUrl: 'data:image/webp;base64,AA==',
    })
    expect(await db.boardItems.get('projection-cloud')).toMatchObject({
      cardId: 'card-cloud',
      boardId: 'board-main',
    })
    expect(
      await db.syncMeta.get(tablePullCursorKey('attachments')),
    ).toBeDefined()
    expect(await db.syncMeta.get(SYNC_META_KEYS.ownerId)).toMatchObject({
      value: 'user-a',
    })
  })
})
