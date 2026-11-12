import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { useAttachmentStore } from '../src/stores/attachments'
import type { CardAttachment } from '../src/types'

function attachment(id: string, cardId: string, createdAt = 1): CardAttachment {
  return {
    id,
    cardId,
    fileName: `${id}.webp`,
    mimeType: 'image/webp',
    size: 16,
    width: 8,
    height: 8,
    dataUrl: `data:image/webp;base64,${id}`,
    createdAt,
    updatedAt: createdAt,
  }
}

describe('attachment store', () => {
  beforeEach(async () => {
    await db.delete()
    setActivePinia(createPinia())
  })

  afterEach(async () => {
    await db.delete()
  })

  it('updates one card attachment set while preserving undo history', async () => {
    const store = useAttachmentStore()
    await store.initialize()
    await store.replaceForCard('card-a', [
      attachment('first', 'card-a'),
      attachment('second', 'card-a', 2),
    ])

    expect(store.forCard('card-a').map((entry) => entry.id)).toEqual([
      'first',
      'second',
    ])

    await store.replaceForCard('card-a', [attachment('second', 'card-a', 2)])
    expect(store.forCard('card-a').map((entry) => entry.id)).toEqual([
      'first',
      'second',
    ])
    expect(await db.attachments.get('first')).toBeDefined()
    expect(await db.attachments.get('second')).toBeDefined()
  })

  it('deletes every attachment that belongs to purged cards', async () => {
    const store = useAttachmentStore()
    await store.initialize()
    await store.replaceForCard('card-a', [attachment('a', 'card-a')])
    await store.replaceForCard('card-b', [attachment('b', 'card-b')])

    await store.deleteForCards(['card-a'])

    expect(store.forCard('card-a')).toHaveLength(0)
    expect(store.forCard('card-b')).toHaveLength(1)
    expect(await db.attachments.get('a')).toBeUndefined()
    expect(await db.attachments.get('b')).toBeDefined()
  })
})
