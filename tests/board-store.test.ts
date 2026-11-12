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

  it('commits a group move as one atomic history entry', async () => {
    const board = await freshBoard()
    const first = board.items[0]
    const second = board.items[1]
    const before = {
      first: { x: first.x, y: first.y },
      second: { x: second.x, y: second.y },
    }

    expect(
      await board.commitItemPositions([
        { itemId: first.id, x: first.x + 120, y: first.y + 40 },
        { itemId: second.id, x: second.x + 120, y: second.y + 40 },
      ]),
    ).toBe(true)

    expect(board.items.find((item) => item.id === first.id)).toMatchObject({
      x: before.first.x + 120,
      y: before.first.y + 40,
    })
    expect(board.items.find((item) => item.id === second.id)).toMatchObject({
      x: before.second.x + 120,
      y: before.second.y + 40,
    })
    expect(board.undoLabel).toBe('移动 2 张卡片')
    expect(await db.boardItems.get(first.id)).toMatchObject({
      x: before.first.x + 120,
      y: before.first.y + 40,
    })

    await board.undo()
    expect(board.items.find((item) => item.id === first.id)).toMatchObject(
      before.first,
    )
    expect(board.items.find((item) => item.id === second.id)).toMatchObject(
      before.second,
    )
    expect(await db.boardItems.get(second.id)).toMatchObject(before.second)

    await board.redo()
    expect(board.items.find((item) => item.id === first.id)).toMatchObject({
      x: before.first.x + 120,
      y: before.first.y + 40,
    })
  })

  it('rolls back every card when a group persist fails', async () => {
    const board = await freshBoard()
    const first = board.items[0]
    const second = board.items[1]
    const before = board.items.map((item) => ({ ...item }))
    const spy = vi
      .spyOn(db.boardItems, 'bulkPut')
      .mockRejectedValueOnce(new Error('quota'))

    expect(
      await board.commitItemPositions([
        { itemId: first.id, x: first.x + 50, y: first.y + 50 },
        { itemId: second.id, x: second.x + 50, y: second.y + 50 },
      ]),
    ).toBe(false)
    expect(board.items.map((item) => ({ ...item }))).toEqual(before)
    expect(board.undoLabel).not.toBe('移动 2 张卡片')
    spy.mockRestore()
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

  it('clears the active board as one reversible history action', async () => {
    const board = await freshBoard()
    const cardsBefore = [...board.cards]
    const itemsBefore = [...board.items]
    const connection = await board.createConnection(
      cardsBefore[0].id,
      cardsBefore[1].id,
    )

    const result = await board.clearBoard()

    expect(result).toMatchObject({
      cardCount: 3,
      itemCount: 3,
      connectionCount: 1,
    })
    expect(board.cards).toHaveLength(0)
    expect(board.items).toHaveLength(0)
    expect(board.connections).toHaveLength(0)
    expect(board.undoLabel).toBe('清空白板')
    expect(await db.boardItems.count()).toBe(0)
    expect(await db.connections.count()).toBe(0)
    expect((await db.cards.toArray()).every((card) => card.isDeleted)).toBe(
      true,
    )

    await board.undo()
    expect(board.cards.map((card) => card.id).sort()).toEqual(
      cardsBefore.map((card) => card.id).sort(),
    )
    expect(board.items.map((item) => item.id).sort()).toEqual(
      itemsBefore.map((item) => item.id).sort(),
    )
    expect(board.connections.map((item) => item.id)).toContain(connection!.id)
    expect((await db.cards.toArray()).some((card) => card.isDeleted)).toBe(
      false,
    )

    await board.redo()
    expect(board.entries).toHaveLength(0)
    expect(await db.boardItems.count()).toBe(0)
  })

  it('keeps cards that are shared with another board when clearing', async () => {
    const board = await freshBoard()
    const sharedCard = board.cards[0]
    await db.boardItems.put({
      id: 'projection-other-board',
      cardId: sharedCard.id,
      boardId: 'board-other',
      x: 100,
      y: 100,
    })

    const result = await board.clearBoard()

    expect(result?.cardCount).toBe(2)
    expect(board.cards.map((card) => card.id)).toEqual([sharedCard.id])
    expect((await db.cards.get(sharedCard.id))?.isDeleted).toBeUndefined()
    expect(await db.boardItems.get('projection-other-board')).toBeDefined()
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

  it('creates a labelled connection as one undoable mutation', async () => {
    const board = await freshBoard()
    const cardA = board.cards[0]
    const cardB = board.cards[1]

    const connection = await board.createConnection(
      cardA.id,
      cardB.id,
      '  共享  底层节律  ',
    )
    expect(connection?.label).toBe('共享 底层节律')
    expect(await db.connections.get(connection!.id)).toMatchObject({
      label: '共享 底层节律',
    })
    expect(board.undoLabel).toBe('建立连线')

    await board.undo()
    expect(board.connections).toHaveLength(0)
    await board.redo()
    expect(board.connections[0].label).toBe('共享 底层节律')
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

  it('preserves projections and connections for trash recovery', async () => {
    const board = await freshBoard()
    const cardA = board.cards[0]
    const cardB = board.cards[1]
    const connection = await board.createConnection(cardA.id, cardB.id)

    expect(await board.deleteCard(cardA.id)).toBe(true)
    expect(board.connections).toHaveLength(0)
    expect(await db.connections.get(connection!.id)).toBeDefined()
    expect(await db.boardItems.where('cardId').equals(cardA.id).count()).toBe(1)

    await board.undo()
    expect(board.cards.map((entry) => entry.id)).toContain(cardA.id)
    expect(board.connections).toHaveLength(1)
    expect(await db.connections.get(connection!.id)).toBeDefined()

    await board.redo()
    expect(board.connections).toHaveLength(0)
    expect(await db.connections.get(connection!.id)).toBeDefined()
  })

  it('reuses one card across boards without duplicating it on a board', async () => {
    const board = await freshBoard()
    const card = board.cards[0]!
    await db.boards.put({
      id: 'board-reuse',
      name: '复用板',
      createdAt: 2,
      updatedAt: 2,
    })

    const added = await board.addCardToBoard(card.id, 'board-reuse', 420)
    expect(added).toMatchObject({
      cardId: card.id,
      boardId: 'board-reuse',
    })
    expect(board.items.filter((item) => item.cardId === card.id)).toHaveLength(
      1,
    )
    expect(await db.boardItems.where('cardId').equals(card.id).count()).toBe(2)

    expect(await board.addCardToBoard(card.id, 'board-reuse')).toBeNull()
    expect(await db.boardItems.where('cardId').equals(card.id).count()).toBe(2)
  })

  it('removes a shared card from one board while preserving the other copy', async () => {
    const board = await freshBoard()
    const card = board.cards[0]!
    await db.boards.put({
      id: 'board-remove',
      name: '另一块板',
      createdAt: 2,
      updatedAt: 2,
    })
    await board.addCardToBoard(card.id, 'board-remove')

    expect(await board.removeCardFromBoard(card.id, 'board-main')).toBe(true)
    expect(board.cards.some((entry) => entry.id === card.id)).toBe(false)
    expect((await db.cards.get(card.id))?.isDeleted).toBeUndefined()
    expect(
      await db.boardItems
        .where('boardId')
        .equals('board-main')
        .filter((item) => item.cardId === card.id)
        .count(),
    ).toBe(0)
    expect(
      await db.boardItems
        .where('boardId')
        .equals('board-remove')
        .filter((item) => item.cardId === card.id)
        .count(),
    ).toBe(1)

    await board.undo()
    expect(board.cards.some((entry) => entry.id === card.id)).toBe(true)
  })

  it('restores trashed cards to the current board and permanently purges them', async () => {
    const board = await freshBoard()
    const card = board.cards[0]!

    expect(await board.deleteCard(card.id)).toBe(true)
    expect((await db.cards.get(card.id))?.isDeleted).toBe(true)
    const restoredItem = await board.restoreCard(card.id, 'board-main')
    expect(restoredItem?.boardId).toBe('board-main')
    expect((await db.cards.get(card.id))?.isDeleted).toBeUndefined()

    expect(await board.deleteCard(card.id)).toBe(true)
    expect(await board.purgeCard(card.id)).toBe(true)
    expect(await db.cards.get(card.id)).toBeUndefined()
    expect(await db.boardItems.where('cardId').equals(card.id).count()).toBe(0)
  })

  it('keeps recent versions and restores an earlier snapshot', async () => {
    const board = await freshBoard()
    const card = board.cards[0]!
    const originalTitle = card.title

    await board.updateCard(card.id, {
      title: '第一版标题',
      content: '第一版正文',
      tags: ['版本'],
    })
    await board.updateCard(card.id, {
      title: '第二版标题',
      content: '第二版正文',
      tags: ['版本'],
    })

    const versions = await db.cardVersions
      .where('cardId')
      .equals(card.id)
      .sortBy('snapshotAt')
    expect(versions.length).toBeGreaterThanOrEqual(2)

    const restored = await board.restoreCardVersion(card.id, versions[0]!.id)
    expect(restored?.title).toBe(originalTitle)
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
