import { describe, expect, it } from 'vitest'
import {
  idsIntersecting,
  normalizeRect,
  rectsIntersect,
} from '../src/lib/selection'

describe('marquee selection geometry', () => {
  it('normalizes a backwards drag', () => {
    expect(normalizeRect(300, 200, 100, 50)).toEqual({
      x: 100,
      y: 50,
      width: 200,
      height: 150,
    })
  })

  it('selects intersecting cards, including edge contact', () => {
    const inside = { id: 'inside', x: 10, y: 10, width: 20, height: 20 }
    const edge = { id: 'edge', x: 30, y: 20, width: 20, height: 20 }
    const outside = { id: 'outside', x: 200, y: 200, width: 10, height: 10 }
    const world = { x: 0, y: 0, width: 30, height: 40 }

    expect(
      idsIntersecting([inside, edge, outside], world, (item) => item),
    ).toEqual(['inside', 'edge'])
  })

  it('is independent of screen scale because rects are world-space', () => {
    const world = { x: -100, y: -100, width: 50, height: 50 }
    const card = { id: 'scale-agnostic', x: -80, y: -80, width: 10, height: 10 }
    const scaledCard = { ...card, x: 1000, y: 1000 }

    expect(rectsIntersect(world, card)).toBe(true)
    expect(rectsIntersect(world, scaledCard)).toBe(false)
  })
})
