import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import {
  installSyncTracking,
  withSyncTrackingSuppressed,
} from '../src/lib/sync/tracker'

describe('sync outbox tracker', () => {
  beforeEach(async () => {
    installSyncTracking()
    await db.delete()
    await db.open()
  })

  afterAll(async () => {
    await db.delete()
  })

  it('coalesces local writes into one pending upsert', async () => {
    await db.cards.put({
      id: 'card-sync',
      title: '第一版',
      content: '正文',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    })

    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(1)
    })

    await db.cards.update('card-sync', {
      title: '第二版',
      updatedAt: 2,
    })

    await vi.waitFor(async () => {
      const entry = await db.syncOutbox.get('cards:card-sync')
      expect(entry?.payload.title).toBe('第二版')
      expect(entry?.operation).toBe('upsert')
    })
  })

  it('records a tombstone when a local row is hard deleted', async () => {
    await db.connections.put({
      id: 'connection-sync',
      boardId: 'board-main',
      fromCardId: 'card-a',
      toCardId: 'card-b',
    })
    await vi.waitFor(async () => {
      expect(await db.syncOutbox.count()).toBe(1)
    })

    await db.connections.delete('connection-sync')
    await vi.waitFor(async () => {
      const entry = await db.syncOutbox.get('connections:connection-sync')
      expect(entry?.operation).toBe('delete')
    })
  })

  it('does not enqueue writes applied from the cloud', async () => {
    await withSyncTrackingSuppressed(async () => {
      await db.cards.put({
        id: 'card-remote',
        title: '远程卡片',
        content: '',
        tags: [],
        createdAt: 1,
        updatedAt: 1,
      })
    })

    await new Promise((resolve) => setTimeout(resolve, 25))
    expect(await db.syncOutbox.count()).toBe(0)
  })
})
