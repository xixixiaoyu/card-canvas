import { describe, expect, it } from 'vitest'
import {
  arrangeCards,
  type LayoutCard,
  type LayoutPosition,
} from '../src/lib/card-layout'

function card(
  id: string,
  x: number,
  y: number,
  width = 420,
  height = 320,
): LayoutCard {
  return { id, x, y, width, height }
}

function overlap(a: LayoutPosition, b: LayoutPosition) {
  const aCard = cards.find((entry) => entry.id === a.itemId)!
  const bCard = cards.find((entry) => entry.id === b.itemId)!
  return (
    a.x < b.x + bCard.width &&
    a.x + aCard.width > b.x &&
    a.y < b.y + bCard.height &&
    a.y + aCard.height > b.y
  )
}

const cards = [
  card('a', 620, -40),
  card('b', -300, 180, 320, 440),
  card('c', 80, 30, 460, 280),
  card('d', 900, 400, 300, 360),
  card('e', -520, 500),
  card('f', 430, 650, 400, 300),
  card('g', 10, 760, 380, 420),
]

describe('one-click card layout', () => {
  it('lays cards out in a deterministic masonry grid without overlap', () => {
    const first = arrangeCards(cards)
    const second = arrangeCards(cards)

    expect(first).toEqual(second)
    expect(first).toHaveLength(cards.length)
    expect(new Set(first.map((position) => position.x)).size).toBe(3)
    expect(first.find((position) => position.itemId === 'c')).toMatchObject({
      x: -520,
      y: -40,
    })

    for (let left = 0; left < first.length; left += 1) {
      for (let right = left + 1; right < first.length; right += 1) {
        expect(overlap(first[left]!, first[right]!)).toBe(false)
      }
    }
  })

  it('leaves a single card alone and respects the column cap', () => {
    expect(arrangeCards([cards[0]!])).toEqual([])

    const many = Array.from({ length: 12 }, (_, index) =>
      card(`card-${index}`, index * 30, index * 20),
    )
    const positions = arrangeCards(many, { maxColumns: 2, columnGap: 40 })

    expect(new Set(positions.map((position) => position.x)).size).toBe(2)
  })
})
