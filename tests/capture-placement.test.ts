import { describe, expect, it } from 'vitest'
import {
  chooseCapturePlacement,
  type CapturePlacementInput,
  type CaptureRect,
} from '../src/lib/capture-placement'

const viewport = {
  left: 0,
  top: 88,
  right: 1600,
  bottom: 860,
}

function rect(x: number, y: number, width = 420, height = 320): CaptureRect {
  return { x, y, width, height }
}

function choose(overrides: Partial<CapturePlacementInput> = {}) {
  return chooseCapturePlacement({
    viewport,
    center: { x: 800, y: 474 },
    width: 420,
    height: 320,
    selected: null,
    existing: [],
    ...overrides,
  })
}

describe('chooseCapturePlacement', () => {
  it('uses the viewport center when nothing is selected', () => {
    expect(choose()).toEqual({ x: 590, y: 314 })
  })

  it('places the next capture to the right of the selected card', () => {
    const selected = rect(100, 200, 420, 500)

    expect(choose({ selected, existing: [selected] })).toEqual({
      x: 568,
      y: 290,
    })
  })

  it('falls back below when the right side does not fit', () => {
    const selected = rect(400, 100, 420, 400)

    expect(
      choose({
        viewport: { left: 0, top: 88, right: 1000, bottom: 900 },
        width: 420,
        height: 300,
        selected,
        existing: [selected],
      }),
    ).toEqual({ x: 400, y: 548 })
  })

  it('keeps crowded captures near the center instead of jumping away', () => {
    const occupied = rect(590, 314)

    const result = choose({ existing: [occupied] })

    expect(Math.abs(result.x - 590)).toBeLessThanOrEqual(96)
    expect(Math.abs(result.y - 314)).toBeLessThanOrEqual(96)
  })

  it('ignores an off-screen selected card and uses the center', () => {
    const selected = rect(-1000, 0, 420, 300)

    expect(choose({ selected, existing: [selected] })).toEqual({
      x: 590,
      y: 314,
    })
  })
})
