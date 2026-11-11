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

describe('sync account isolation', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  afterEach(async () => {
    useSyncStore().stop()
    await db.delete()
  })

  it('locks sync instead of uploading local data to another account', async () => {
    await db.syncMeta.put({
      key: SYNC_META_KEYS.ownerId,
      value: 'owner-a',
    })
    await db.cards.put({
      id: 'card-owner-a',
      title: '账号 A 的本地卡片',
      content: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    })

    const sync = useSyncStore()
    await sync.start('owner-b')

    expect(sync.phase).toBe('locked')
    expect(sync.error).toContain('本机数据已绑定另一个云端账号')
    expect(await db.cards.get('card-owner-a')).toBeDefined()
    expect(await db.syncOutbox.count()).toBe(0)
    expect(supabaseApi.getSupabaseClient).not.toHaveBeenCalled()
  })
})
