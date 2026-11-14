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
    expect(backup.version).toBe(3)
    expect(backup.cards).toHaveLength(3)
    expect(backup.boardItems).toHaveLength(3)
    expect(backup.connections).toHaveLength(0)
    expect(backup.cardVersions).toHaveLength(0)
    expect(backup.attachments).toHaveLength(0)

    await db.cards.clear()
    await db.boardItems.clear()
    await db.connections.clear()

    const counts = await importBackupText(JSON.stringify(backup))

    expect(counts).toEqual({
      cards: 3,
      boardItems: 3,
      connections: 0,
      boards: 0,
      cardVersions: 0,
      attachments: 0,
      skipped: {
        cards: 0,
        boardItems: 0,
        connections: 0,
        boards: 0,
        cardVersions: 0,
        attachments: 0,
      },
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
    expect(backup.connections[0].boardId).toBe('board-main')
    expect(await db.cards.get(backup.connections[0].fromCardId)).toBeDefined()
    expect(await db.cards.get(backup.connections[0].toCardId)).toBeDefined()

    await db.connections.clear()
    const counts = await importBackupText(JSON.stringify(backup))
    expect(counts).toMatchObject({
      connections: 1,
      skipped: { connections: 0 },
    })
    expect(await db.connections.count()).toBe(1)
  })

  it('includes local card version snapshots', async () => {
    const board = await seed()
    const card = board.cards[0]!
    await board.updateCard(card.id, {
      title: '版本后的标题',
      content: '版本后的正文',
      tags: card.tags,
    })

    const backup = await createBackup()
    expect(backup.cardVersions).toHaveLength(1)
    await db.cardVersions.clear()
    await importBackupText(JSON.stringify(backup))
    expect(await db.cardVersions.count()).toBe(1)
  })

  it('includes image attachments and restores their binary data', async () => {
    const board = await seed()
    await db.attachments.put({
      id: 'attachment-backup',
      cardId: board.cards[0]!.id,
      fileName: '图.webp',
      mimeType: 'image/webp',
      size: 32,
      width: 20,
      height: 10,
      dataUrl: 'data:image/webp;base64,AAAA',
      createdAt: 1,
      updatedAt: 2,
    })

    const backup = await createBackup()
    expect(backup.version).toBe(3)
    expect(backup.attachments).toHaveLength(1)
    await db.attachments.clear()
    const counts = await importBackupText(JSON.stringify(backup))

    expect(counts.attachments).toBe(1)
    expect(await db.attachments.get('attachment-backup')).toMatchObject({
      cardId: board.cards[0]!.id,
      dataUrl: 'data:image/webp;base64,AAAA',
    })
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

  it('keeps newer local data when importing an older backup', async () => {
    await seed()
    const current = await db.cards.get('card-demo-001')
    expect(current).toBeDefined()
    await db.cards.put({
      ...current!,
      title: '当前较新版本',
      updatedAt: 10_000,
    })

    const counts = await importBackupText(
      JSON.stringify({
        app: 'card-canvas',
        version: 3,
        cards: [
          {
            ...current!,
            title: '旧备份版本',
            updatedAt: 1000,
          },
        ],
        boardItems: [],
      }),
    )

    expect(counts.cards).toBe(0)
    expect(counts.skipped.cards).toBe(1)
    expect(await db.cards.get(current!.id)).toMatchObject({
      title: '当前较新版本',
      updatedAt: 10_000,
    })
  })

  it('never resurrects a locally deleted card from a live backup', async () => {
    await seed()
    const deleted = {
      ...(await db.cards.get('card-demo-001'))!,
      isDeleted: true,
      updatedAt: 1000,
    }
    await db.cards.put(deleted)

    const counts = await importBackupText(
      JSON.stringify({
        app: 'card-canvas',
        version: 3,
        cards: [
          {
            ...deleted,
            isDeleted: undefined,
            title: '不应复活',
            updatedAt: 99_999,
          },
        ],
        boardItems: [],
      }),
    )

    expect(counts.cards).toBe(0)
    expect(counts.skipped.cards).toBe(1)
    expect(await db.cards.get(deleted.id)).toMatchObject({
      title: deleted.title,
      isDeleted: true,
    })
  })

  it('places legacy cards without projections on the requested board', async () => {
    const payload = {
      app: 'card-canvas',
      version: 1,
      exportedAt: new Date().toISOString(),
      cards: [
        {
          id: 'card-legacy-import',
          title: '旧备份卡片',
          content: '没有投影',
          tags: [],
          createdAt: 1,
          updatedAt: 2,
        },
      ],
      boardItems: [],
      connections: [],
    }

    const counts = await importBackupText(JSON.stringify(payload), 'board-main')
    const [item] = await db.boardItems.toArray()

    expect(counts.boardItems).toBe(1)
    expect(item).toMatchObject({
      cardId: 'card-legacy-import',
      boardId: 'board-main',
      width: 420,
    })
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
