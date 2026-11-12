import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import {
  installSyncTracking,
  queueFullWorkspaceSnapshot,
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

  it('does not retain image binary data in an attachment tombstone', async () => {
    await db.attachments.put({
      id: 'attachment-delete',
      cardId: 'card-a',
      fileName: '图.webp',
      mimeType: 'image/webp',
      size: 16,
      width: 8,
      height: 8,
      dataUrl: 'data:image/webp;base64,AAAA',
      createdAt: 1,
      updatedAt: 1,
    })
    await vi.waitFor(async () => {
      expect(
        await db.syncOutbox.get('attachments:attachment-delete'),
      ).toBeDefined()
    })

    await db.attachments.delete('attachment-delete')
    await vi.waitFor(async () => {
      const entry = await db.syncOutbox.get('attachments:attachment-delete')
      expect(entry?.operation).toBe('delete')
      expect(entry?.payload.dataUrl).toBe('')
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

  it('never claims fixed demo records into a cloud snapshot', async () => {
    await withSyncTrackingSuppressed(async () => {
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
          id: 'card-user',
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
          id: 'projection-user',
          cardId: 'card-user',
          boardId: 'board-main',
          x: 100,
          y: 100,
        },
      ])
      await db.connections.put({
        id: 'connection-demo',
        boardId: 'board-main',
        fromCardId: 'card-demo-001',
        toCardId: 'card-user',
      })
    })

    await queueFullWorkspaceSnapshot()

    expect(await db.syncOutbox.get('cards:card-demo-001')).toBeUndefined()
    expect(await db.syncOutbox.get('boardItems:projection-001')).toBeUndefined()
    expect(
      await db.syncOutbox.get('connections:connection-demo'),
    ).toBeUndefined()
    expect(await db.syncOutbox.get('cards:card-user')).toBeDefined()
    expect(await db.syncOutbox.get('boardItems:projection-user')).toBeDefined()
  })
})
