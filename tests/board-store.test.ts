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
    expect(board.inboxCards).toHaveLength(0)
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
    expect(board.inboxCards.map((entry) => entry.id)).toEqual([card.id])
    expect(card.title).toBe('标签归一化')
    expect(card.tags).toEqual(['Design', '研究'])
    expect(await db.cards.get(card.id)).toMatchObject({
      title: '标签归一化',
      tags: ['Design', '研究'],
    })
    expect('boardId' in card).toBe(false)
    expect('x' in card).toBe(false)
  })

  it('places a card as a projection and removes it from the inbox', async () => {
    const board = await freshBoard()
    const card = await board.captureCard({
      title: '待投放',
      content: '',
      tags: [],
    })

    const item = board.placeCard(card.id, 'board-main', {
      x: 10,
      y: 20,
      width: 420,
    })

    expect(item).not.toBeNull()
    expect(board.items).toHaveLength(4)
    expect(board.inboxCards).toHaveLength(0)
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

    expect(board.placeCard(card.id, 'board-main', { x: 0, y: 0 })).toBeNull()
    expect(board.items).toHaveLength(3)
  })

  it('commits a dragged position once and persists it', async () => {
    const board = await freshBoard()
    const item = board.items[0]

    board.commitItemPosition(item.id, 123.5, -45.25)

    expect(board.items[0]).toMatchObject({ x: 123.5, y: -45.25 })
    await vi.waitFor(async () => {
      expect(await db.boardItems.get(item.id)).toMatchObject({
        x: 123.5,
        y: -45.25,
      })
    })
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
    const card = await board.captureCard({ title: '投放失败', content: '', tags: [] })
    vi.spyOn(db.boardItems, 'put').mockRejectedValueOnce(new Error('quota'))

    board.placeCard(card.id, 'board-main', { x: 1, y: 2 })
    await vi.waitFor(() => {
      expect(board.items).toHaveLength(3)
      expect(useToastStore().toasts).toHaveLength(1)
    })
    expect(useToastStore().toasts[0].tone).toBe('error')
    expect(useToastStore().toasts[0].action?.label).toBe('重试')
    expect(board.inboxCards.map((entry) => entry.id)).toContain(card.id)
  })
})
