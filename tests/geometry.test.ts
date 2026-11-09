import { describe, expect, it } from 'vitest'
import {
  bezierMidpoint,
  closestEdgePair,
  connectionGeometry,
  cubicPoint,
  draftGeometry,
  edgeMidpoints,
  edgeNormal,
  pointInRect,
  type Rect,
} from '../src/lib/geometry'

const cardA: Rect = { x: 0, y: 0, width: 100, height: 80 }
const cardRight: Rect = { x: 300, y: 0, width: 120, height: 80 }
const cardBelow: Rect = { x: 0, y: 240, width: 100, height: 100 }

describe('connection geometry', () => {
  it('computes the four edge midpoint anchors', () => {
    expect(edgeMidpoints(cardA)).toEqual({
      top: { x: 50, y: 0 },
      right: { x: 100, y: 40 },
      bottom: { x: 50, y: 80 },
      left: { x: 0, y: 40 },
    })
  })

  it('exposes outward normals for every side', () => {
    expect(edgeNormal('top')).toEqual({ x: 0, y: -1 })
    expect(edgeNormal('right')).toEqual({ x: 1, y: 0 })
    expect(edgeNormal('bottom')).toEqual({ x: 0, y: 1 })
    expect(edgeNormal('left')).toEqual({ x: -1, y: 0 })
  })

  it('docks the right edge to the left edge for side-by-side cards', () => {
    const pair = closestEdgePair(cardA, cardRight)

    expect(pair.from.side).toBe('right')
    expect(pair.to.side).toBe('left')
    expect(pair.from.point).toEqual({ x: 100, y: 40 })
    expect(pair.to.point).toEqual({ x: 300, y: 40 })
    expect(pair.distance).toBe(200)
  })

  it('docks the bottom edge to the top edge for stacked cards', () => {
    const pair = closestEdgePair(cardA, cardBelow)

    expect(pair.from.side).toBe('bottom')
    expect(pair.to.side).toBe('top')
    expect(pair.distance).toBe(160)
  })

  it('produces a cubic path with finite controls and exact endpoints', () => {
    const geometry = connectionGeometry(cardA, cardRight)

    expect(geometry.path).toMatch(/^M 100\.00 40\.00 C /)
    expect(geometry.path).toContain('300.00 40.00')
    expect(geometry.start).toEqual({ x: 100, y: 40 })
    expect(geometry.end).toEqual({ x: 300, y: 40 })
    expect(Number.isFinite(geometry.control1.x)).toBe(true)
    expect(Number.isFinite(geometry.control2.y)).toBe(true)
    expect(geometry.control1.x).toBeGreaterThan(geometry.start.x)
    expect(geometry.control2.x).toBeLessThan(geometry.end.x)
  })

  it('places the label anchor at t = 0.5', () => {
    const geometry = connectionGeometry(cardA, cardRight)
    const expected = bezierMidpoint(
      geometry.start,
      geometry.control1,
      geometry.control2,
      geometry.end,
    )

    expect(geometry.midpoint.x).toBeCloseTo(expected.x, 10)
    expect(geometry.midpoint.y).toBeCloseTo(expected.y, 10)
    expect(
      cubicPoint(
        0,
        geometry.start,
        geometry.control1,
        geometry.control2,
        geometry.end,
      ),
    ).toEqual(geometry.start)
    expect(
      cubicPoint(
        1,
        geometry.start,
        geometry.control1,
        geometry.control2,
        geometry.end,
      ),
    ).toEqual(geometry.end)
  })

  it('keeps the control offset inside the spring bounds', () => {
    const near = connectionGeometry(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 110, y: 0, width: 100, height: 100 },
    )
    const far = connectionGeometry(
      { x: 0, y: 0, width: 100, height: 100 },
      { x: 5000, y: 0, width: 100, height: 100 },
    )

    expect(near.control1.x - near.start.x).toBeCloseTo(36, 5)
    expect(far.control1.x - far.start.x).toBeCloseTo(180, 5)
  })

  it('honors a preferred draft handle side', () => {
    const draft = draftGeometry(cardA, { x: -200, y: 40 }, 'right')

    expect(draft.fromSide).toBe('right')
    expect(draft.start).toEqual({ x: 100, y: 40 })
  })

  it('starts a draft from the edge nearest the pointer', () => {
    const left = draftGeometry(cardA, { x: -200, y: 40 })
    const bottom = draftGeometry(cardA, { x: 50, y: 300 })

    expect(left.fromSide).toBe('left')
    expect(left.start).toEqual({ x: 0, y: 40 })
    expect(bottom.fromSide).toBe('bottom')
    expect(bottom.end).toEqual({ x: 50, y: 300 })
    expect(bottom.path).toMatch(/^M 50\.00 80\.00 C /)
  })

  it('detects whether a world point is inside a card', () => {
    expect(pointInRect({ x: 0, y: 0 }, cardA)).toBe(true)
    expect(pointInRect({ x: 100, y: 80 }, cardA)).toBe(true)
    expect(pointInRect({ x: 101, y: 80 }, cardA)).toBe(false)
  })
})
