import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { db } from '../src/db'
import { useBoardStore } from '../src/stores/board'

async function freshBoard() {
  setActivePinia(createPinia())
  const board = useBoardStore()
  await board.initialize('board-main')
  return board
}

describe('board zones', () => {
  beforeEach(async () => {
    await db.delete()
    setActivePinia(createPinia())
  })

  afterEach(async () => {
    await db.delete()
  })

  it('creates a persistent zone and undoes the whole membership change', async () => {
    const board = await freshBoard()
    const items = board.items.slice(0, 2)
    const before = items.map((item) => ({ ...item }))

    const zone = await board.createZone({
      title: '  自我和解  ',
      color: 'rose',
      itemIds: items.map((item) => item.id),
    })

    expect(zone).toMatchObject({
      boardId: 'board-main',
      title: '自我和解',
      color: 'rose',
    })
    expect(board.zones).toHaveLength(1)
    expect(
      board.items
        .filter((item) => item.zoneId === zone!.id)
        .map((item) => item.id),
    ).toEqual(items.map((item) => item.id))
    expect(await db.boardZones.get(zone!.id)).toMatchObject({
      title: '自我和解',
    })

    await board.undo()
    expect(board.zones).toHaveLength(0)
    for (const item of before) {
      expect(
        board.items.find((candidate) => candidate.id === item.id)?.zoneId,
      ).toBeUndefined()
      expect(await db.boardItems.get(item.id)).toMatchObject({
        x: item.x,
        y: item.y,
      })
    }

    await board.redo()
    expect(board.zones).toHaveLength(1)
    expect(board.items.filter((item) => item.zoneId === zone!.id)).toHaveLength(
      2,
    )
  })

  it('renames, moves and dissolves a zone as separate undoable actions', async () => {
    const board = await freshBoard()
    const selected = board.items.slice(0, 2)
    const positions = new Map(
      selected.map((item) => [item.id, { x: item.x, y: item.y }]),
    )
    const zone = await board.createZone({
      title: '边界',
      color: 'amber',
      itemIds: selected.map((item) => item.id),
    })
    expect(zone).not.toBeNull()
    board.clearHistory()

    expect(await board.renameZone(zone!.id, '心理边界')).toBe(true)
    expect(board.zones[0]?.title).toBe('心理边界')
    await board.undo()
    expect(board.zones[0]?.title).toBe('边界')
    await board.redo()
    expect(board.zones[0]?.title).toBe('心理边界')

    expect(await board.moveZone(zone!.id, 64, -32)).toBe(true)
    for (const item of board.items.filter(
      (candidate) => candidate.zoneId === zone!.id,
    )) {
      expect(item.x).toBe(positions.get(item.id)!.x + 64)
      expect(item.y).toBe(positions.get(item.id)!.y - 32)
    }
    await board.undo()
    for (const item of board.items.filter(
      (candidate) => candidate.zoneId === zone!.id,
    )) {
      expect(item.x).toBe(positions.get(item.id)!.x)
      expect(item.y).toBe(positions.get(item.id)!.y)
    }
    await board.redo()

    expect(await board.dissolveZone(zone!.id)).toBe(true)
    expect(board.zones).toHaveLength(0)
    expect(board.items).toHaveLength(3)
    expect(board.items.some((item) => item.zoneId === zone!.id)).toBe(false)
    expect(await db.boardItems.count()).toBe(3)

    await board.undo()
    expect(board.zones[0]?.id).toBe(zone!.id)
    expect(board.items.filter((item) => item.zoneId === zone!.id)).toHaveLength(
      2,
    )
  })

  it('removes an old zone when all of its cards move into a new zone', async () => {
    const board = await freshBoard()
    const ids = board.items.slice(0, 2).map((item) => item.id)
    const first = await board.createZone({
      title: '旧区域',
      color: 'amber',
      itemIds: ids,
    })
    board.clearHistory()

    const second = await board.createZone({
      title: '新区域',
      color: 'sky',
      itemIds: ids,
    })

    expect(board.zones).toEqual([
      expect.objectContaining({ id: second!.id, title: '新区域' }),
    ])
    expect(await db.boardZones.get(first!.id)).toBeUndefined()
    expect(
      board.items.filter((item) => item.zoneId === second!.id),
    ).toHaveLength(2)

    await board.undo()
    expect(board.zones).toEqual([
      expect.objectContaining({ id: first!.id, title: '旧区域' }),
    ])
    expect(await db.boardZones.get(first!.id)).toBeDefined()
    expect(await db.boardZones.get(second!.id)).toBeUndefined()
    expect(
      board.items.filter((item) => item.zoneId === first!.id),
    ).toHaveLength(2)
  })

  it('reloads zones from IndexedDB on refresh', async () => {
    const board = await freshBoard()
    const zone = await board.createZone({
      title: '长期知识',
      color: 'sky',
      itemIds: board.items.slice(1, 3).map((item) => item.id),
    })
    expect(zone).not.toBeNull()

    board.zones = []
    await board.refresh()

    expect(board.zones).toEqual([
      expect.objectContaining({
        id: zone!.id,
        title: '长期知识',
        color: 'sky',
      }),
    ])
    expect(board.items.filter((item) => item.zoneId === zone!.id)).toHaveLength(
      2,
    )
  })

  it('clears zones with the board and restores them in one undo step', async () => {
    const board = await freshBoard()
    const zone = await board.createZone({
      title: '待清空',
      color: 'amber',
      itemIds: board.items.slice(0, 2).map((item) => item.id),
    })
    expect(zone).not.toBeNull()

    const result = await board.clearBoard()

    expect(result?.itemCount).toBe(3)
    expect(board.items).toHaveLength(0)
    expect(board.zones).toHaveLength(0)
    expect(await db.boardZones.count()).toBe(0)

    await board.undo()
    expect(board.items).toHaveLength(3)
    expect(board.zones[0]?.id).toBe(zone!.id)
    expect(board.items.filter((item) => item.zoneId === zone!.id)).toHaveLength(
      2,
    )
  })
})
