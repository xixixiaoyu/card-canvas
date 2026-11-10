import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '../src/db'
import { useBoardStore } from '../src/stores/board'
import { useToastStore } from '../src/stores/toast'

async function freshBoard() {
  setActivePinia(createPinia())
  await db.delete()

  const board = useBoardStore()
  await board.initialize('board-main')
  return board
}

describe('board store', () => {
  beforeEach(async () => {
    await db.delete()
    setActivePinia(createPinia())
  })

  afterEach(async () => {
    useToastStore().clear()
    await db.delete()
  })

  it('seeds cards and projections once when the database is empty', async () => {
    const board = await freshBoard()

    expect(board.status).toBe('ready')
    expect(board.cards).toHaveLength(3)
    expect(board.items).toHaveLength(3)
    expect(await db.cards.count()).toBe(3)
    expect(await db.boardItems.count()).toBe(3)
  })

  it('captures a pure card with normalized tags and no projection', async () => {
    const board = await freshBoard()

    const card = await board.captureCard({
      title: '  标签归一化  ',
      content: '纯 Card 实体',
      tags: ['Design', '#design', ' 研究 '],
    })

    expect(board.cards).toHaveLength(4)
    expect(board.items).toHaveLength(3)
    expect(card.title).toBe('标签归一化')
    expect(card.tags).toEqual(['Design', '研究'])
    expect(await db.cards.get(card.id)).toMatchObject({
      title: '标签归一化',
      tags: ['Design', '研究'],
    })
    expect('boardId' in card).toBe(false)
    expect('x' in card).toBe(false)
  })

  it('captures and places in one atomic action with undo/redo', async () => {
    const board = await freshBoard()

    const { card, item } = await board.captureAndPlace(
      { title: '直接上板', content: '不再经过待整理池', tags: ['Flow'] },
      'board-main',
      { x: 24, y: 36 },
    )

    expect(board.cards).toHaveLength(4)
    expect(board.items).toHaveLength(4)
    expect(board.selectedItemId).toBe(item.id)
    expect(await db.cards.get(card.id)).toBeDefined()
    expect(await db.boardItems.get(item.id)).toMatchObject({
      cardId: card.id,
      x: 24,
      y: 36,
    })

    await board.undo()
    expect(board.cards).toHaveLength(3)
    expect(board.items).toHaveLength(3)
    expect(await db.cards.get(card.id)).toBeUndefined()
    expect(await db.boardItems.get(item.id)).toBeUndefined()

    await board.redo()
    expect(board.cards).toHaveLength(4)
    expect(board.items).toHaveLength(4)
    expect(await db.cards.get(card.id)).toBeDefined()
    expect(await db.boardItems.get(item.id)).toBeDefined()
  })

  it('places a card as a projection', async () => {
    const board = await freshBoard()
    const card = await board.captureCard({
      title: '待投放',
      content: '',
      tags: [],
    })

    const item = await board.placeCard(card.id, 'board-main', {
      x: 10,
      y: 20,
      width: 420,
    })

    expect(item).not.toBeNull()
    expect(board.items).toHaveLength(4)
    expect(board.selectedItemId).toBe(item?.id)
    expect(await db.boardItems.get(item!.id)).toMatchObject({
      cardId: card.id,
      x: 10,
      y: 20,
      width: 420,
    })
  })

  it('does not place the same card twice on the same board', async () => {
    const board = await freshBoard()
    const card = board.cards[0]

    expect(
      await board.placeCard(card.id, 'board-main', { x: 0, y: 0 }),
    ).toBeNull()
    expect(board.items).toHaveLength(3)
  })

  it('commits a dragged position once and persists it', async () => {
    const board = await freshBoard()
    const item = board.items[0]

    await board.commitItemPosition(item.id, 123.5, -45.25)

    expect(board.items[0]).toMatchObject({ x: 123.5, y: -45.25 })
    await vi.waitFor(async () => {
      expect(await db.boardItems.get(item.id)).toMatchObject({
        x: 123.5,
        y: -45.25,
      })
    })
  })

  it('undoes and redoes a capture', async () => {
    const board = await freshBoard()
    const card = await board.captureCard({
      title: '可撤销',
      content: '',
      tags: [],
    })

    expect(board.canUndo).toBe(true)
    await board.undo()
    expect(board.cards.map((entry) => entry.id)).not.toContain(card.id)
    expect(await db.cards.get(card.id)).toBeUndefined()

    await board.redo()
    expect(board.cards.map((entry) => entry.id)).toContain(card.id)
    expect(await db.cards.get(card.id)).toBeDefined()
  })

  it('undoes and redoes a placement', async () => {
    const board = await freshBoard()
    const card = await board.captureCard({
      title: '投影撤销',
      content: '',
      tags: [],
    })
    const item = await board.placeCard(card.id, 'board-main', { x: 5, y: 6 })
    expect(item).not.toBeNull()

    await board.undo()
    expect(board.items).toHaveLength(3)
    expect(await db.boardItems.get(item!.id)).toBeUndefined()

    await board.redo()
    expect(board.items).toHaveLength(4)
    expect(await db.boardItems.get(item!.id)).toBeDefined()
  })

  it('undoes and redoes an edit', async () => {
    const board = await freshBoard()
    const card = board.cards[0]
    const originalTitle = card.title
    const updated = await board.updateCard(card.id, {
      title: '新标题',
      content: '新正文',
      tags: ['Edit'],
    })

    expect(updated?.title).toBe('新标题')
    await board.undo()
    expect(board.cards.find((entry) => entry.id === card.id)?.title).toBe(
      originalTitle,
    )

    await board.redo()
    expect(board.cards.find((entry) => entry.id === card.id)?.title).toBe(
      '新标题',
    )
  })

  it('soft-deletes a card with its projections and restores it on undo', async () => {
    const board = await freshBoard()
    const card = board.cards[0]

    expect(await board.deleteCard(card.id)).toBe(true)
    expect(board.cards.map((entry) => entry.id)).not.toContain(card.id)
    expect(board.items.some((item) => item.cardId === card.id)).toBe(false)
    expect((await db.cards.get(card.id))?.isDeleted).toBe(true)

    await board.undo()
    expect(board.cards.map((entry) => entry.id)).toContain(card.id)
    expect(board.items.some((item) => item.cardId === card.id)).toBe(true)
    expect((await db.cards.get(card.id))?.isDeleted).toBeUndefined()
  })

  it('supports multi-item selection without losing connection exclusivity', async () => {
    const board = await freshBoard()
    const [first, second] = board.items

    board.selectItems([first.id, second.id])
    expect(board.selectedItemIds.size).toBe(2)
    expect(board.selectedItems).toHaveLength(2)
    expect(board.selectedItemId).toBeNull()

    board.selectConnection('connection-test')
    expect(board.selectedItemIds.size).toBe(0)
    expect(board.selectedConnectionId).toBe('connection-test')

    board.selectItems([first.id])
    expect(board.selectedConnectionId).toBeNull()
    expect(board.selectedItemId).toBe(first.id)

    board.clearSelection()
    expect(board.selectedItemIds.size).toBe(0)
  })

  it('toggles the galaxy filter without mutating cards', async () => {
    const board = await freshBoard()
    const before = JSON.parse(JSON.stringify(board.cards))

    expect(board.activeFilterTag).toBeNull()
    board.toggleFilterTag('心理学/防御机制')
    expect(board.activeFilterTag).toBe('心理学/防御机制')
    board.toggleFilterTag('心理学/防御机制')
    expect(board.activeFilterTag).toBeNull()
    expect(board.cards).toEqual(before)
  })

  it('creates a connection, rejects self/duplicates and persists it', async () => {
    const board = await freshBoard()
    const cardA = board.cards[0]
    const cardB = board.cards[1]

    const connection = await board.createConnection(cardA.id, cardB.id)
    expect(connection).not.toBeNull()
    expect(board.connections).toHaveLength(1)
    expect(board.selectedConnectionId).toBe(connection!.id)
    expect(await db.connections.get(connection!.id)).toMatchObject({
      fromCardId: cardA.id,
      toCardId: cardB.id,
    })

    expect(await board.createConnection(cardA.id, cardA.id)).toBeNull()
    expect(await board.createConnection(cardA.id, cardB.id)).toBeNull()
    expect(await board.createConnection(cardB.id, cardA.id)).toBeNull()
    expect(board.connections).toHaveLength(1)
    expect(useToastStore().toasts[0].tone).toBe('info')
  })

  it('deletes a connection and restores it with undo/redo', async () => {
    const board = await freshBoard()
    const connection = await board.createConnection(
      board.cards[0].id,
      board.cards[1].id,
    )

    expect(await board.deleteConnection(connection!.id)).toBe(true)
    expect(board.connections).toHaveLength(0)
    expect(await db.connections.get(connection!.id)).toBeUndefined()

    await board.undo()
    expect(board.connections).toHaveLength(1)
    expect(await db.connections.get(connection!.id)).toBeDefined()

    await board.redo()
    expect(board.connections).toHaveLength(0)
    expect(await db.connections.get(connection!.id)).toBeUndefined()
  })

  it('updates a connection label and supports undo', async () => {
    const board = await freshBoard()
    const connection = await board.createConnection(
      board.cards[0].id,
      board.cards[1].id,
    )

    const updated = await board.updateConnectionLabel(
      connection!.id,
      '  底层机制相同  ',
    )
    expect(updated?.label).toBe('底层机制相同')

    await board.undo()
    expect(board.connections[0].label).toBeUndefined()

    await board.redo()
    expect(board.connections[0].label).toBe('底层机制相同')
  })

  it('cascades connections when a card is deleted and restores them on undo', async () => {
    const board = await freshBoard()
    const cardA = board.cards[0]
    const cardB = board.cards[1]
    const connection = await board.createConnection(cardA.id, cardB.id)

    expect(await board.deleteCard(cardA.id)).toBe(true)
    expect(board.connections).toHaveLength(0)
    expect(await db.connections.get(connection!.id)).toBeUndefined()

    await board.undo()
    expect(board.cards.map((entry) => entry.id)).toContain(cardA.id)
    expect(board.connections).toHaveLength(1)
    expect(await db.connections.get(connection!.id)).toBeDefined()

    await board.redo()
    expect(board.connections).toHaveLength(0)
  })

  it('cleans orphan projections left by a partial database', async () => {
    await db.delete()
    await db.open()
    await db.boardItems.put({
      id: 'projection-orphan',
      cardId: 'missing-card',
      boardId: 'board-main',
      x: 0,
      y: 0,
    })

    setActivePinia(createPinia())
    const board = useBoardStore()
    await board.initialize('board-main')

    expect(board.items).toHaveLength(0)
    expect(await db.boardItems.count()).toBe(0)
  })

  it('migrates cards without any projection onto the active board', async () => {
    const board = await freshBoard()
    await db.cards.put({
      id: 'card-legacy-unplaced',
      title: '历史未上板',
      content: '',
      tags: [],
      createdAt: 1,
      updatedAt: 1,
    })

    await board.refresh()

    expect(board.cards.map((entry) => entry.id)).toContain(
      'card-legacy-unplaced',
    )
    expect(
      board.items.some((item) => item.cardId === 'card-legacy-unplaced'),
    ).toBe(true)
    expect(
      await db.boardItems
        .where('cardId')
        .equals('card-legacy-unplaced')
        .count(),
    ).toBe(1)
  })

  it('rolls back a failed capture and surfaces the error', async () => {
    const board = await freshBoard()
    vi.spyOn(db.cards, 'put').mockRejectedValueOnce(new Error('disk full'))

    await expect(
      board.captureCard({ title: '会失败', content: '', tags: [] }),
    ).rejects.toThrow('disk full')

    expect(board.cards).toHaveLength(3)
    expect(useToastStore().toasts).toHaveLength(0)
  })

  it('rolls back a failed placement and offers a retry toast', async () => {
    const board = await freshBoard()
    const card = await board.captureCard({
      title: '投放失败',
      content: '',
      tags: [],
    })
    vi.spyOn(db.boardItems, 'put').mockRejectedValueOnce(new Error('quota'))

    void board.placeCard(card.id, 'board-main', { x: 1, y: 2 })
    await vi.waitFor(() => {
      expect(board.items).toHaveLength(3)
      expect(useToastStore().toasts).toHaveLength(1)
    })
    expect(useToastStore().toasts[0].tone).toBe('error')
    expect(useToastStore().toasts[0].action?.label).toBe('重试')
  })
})
