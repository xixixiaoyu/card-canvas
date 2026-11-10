import { describe, expect, it } from 'vitest'
import { resolveGroupPositions } from '../src/lib/group-drag'
import {
  emitCardDragBatch,
  emitCardDragEndBatch,
  subscribeCardDragBatch,
  subscribeCardDragEndBatch,
} from '../src/lib/card-drag-bus'

const group = [
  { id: 'a', cardId: 'card-a', x: 100, y: 200 },
  { id: 'b', cardId: 'card-b', x: 500, y: 200 },
  { id: 'c', cardId: 'card-c', x: 100, y: 600 },
]

describe('rigid group movement', () => {
  it('preserves every pairwise offset under an arbitrary delta', () => {
    const delta = { x: -123.75, y: 88.5 }
    const moved = resolveGroupPositions(group, delta)

    for (let index = 0; index < group.length; index += 1) {
      expect(moved[index].x - group[index].x).toBe(delta.x)
      expect(moved[index].y - group[index].y).toBe(delta.y)
    }

    expect(moved[1].x - moved[0].x).toBe(group[1].x - group[0].x)
    expect(moved[2].y - moved[1].y).toBe(group[2].y - group[1].y)
  })

  it('broadcasts one batch for all group members', () => {
    const positions: string[] = []
    const ends: string[] = []
    const disposePosition = subscribeCardDragBatch((event) => {
      positions.push(...event.items.map((item) => item.itemId))
    })
    const disposeEnd = subscribeCardDragEndBatch((event) => {
      ends.push(...event.items.map((item) => item.itemId))
    })

    const items = resolveGroupPositions(group, { x: 10, y: 20 })
    emitCardDragBatch({ items })
    emitCardDragEndBatch({
      items: group.map((item) => ({
        itemId: item.id,
        cardId: item.cardId,
      })),
    })

    expect(positions).toEqual(['a', 'b', 'c'])
    expect(ends).toEqual(['a', 'b', 'c'])

    disposePosition()
    disposeEnd()
  })
})
