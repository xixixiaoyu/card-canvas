import { describe, expect, it } from 'vitest'
import {
  screenToWorld,
  shouldApplyWheelPanDirectly,
  viewportForWorldCenter,
  worldToScreen,
} from '../src/composables/useCanvas'
import type { Viewport } from '../src/types'

const viewport: Viewport = { panX: 321.5, panY: -87.25, scale: 1.75 }
const rect = { left: 24, top: 96, width: 1200, height: 800 }

describe('canvas coordinates', () => {
  it('subtracts the container origin and divides by scale', () => {
    expect(screenToWorld({ x: 424, y: 296 }, rect, viewport)).toEqual({
      x: (424 - 24 - 321.5) / 1.75,
      y: (296 - 96 + 87.25) / 1.75,
    })
  })

  it('round-trips screen -> world -> screen', () => {
    const screen = { x: 913.25, y: 411.75 }
    const world = screenToWorld(screen, rect, viewport)
    const back = worldToScreen(world, rect, viewport)

    expect(back.x).toBeCloseTo(screen.x, 10)
    expect(back.y).toBeCloseTo(screen.y, 10)
  })

  it('keeps a point under the cursor when zooming around it', () => {
    const cursor = { x: 640, y: 360 }
    const anchor = screenToWorld(cursor, rect, viewport)
    const zoomed: Viewport = {
      panX: cursor.x - rect.left - anchor.x * 2.5,
      panY: cursor.y - rect.top - anchor.y * 2.5,
      scale: 2.5,
    }
    const pinned = screenToWorld(cursor, rect, zoomed)

    expect(pinned.x).toBeCloseTo(anchor.x, 10)
    expect(pinned.y).toBeCloseTo(anchor.y, 10)
  })

  it('centres a card geometry midpoint exactly in the viewport', () => {
    const item = { x: 120, y: -80, width: 400, height: 300 }
    const centre = {
      x: item.x + item.width / 2,
      y: item.y + item.height / 2,
    }
    const centred = viewportForWorldCenter(centre, 1280, 720, 1.25)
    const screen = worldToScreen(centre, { left: 0, top: 0 }, centred)

    expect(screen.x).toBeCloseTo(640, 10)
    expect(screen.y).toBeCloseTo(360, 10)
  })

  it('keeps the centre invariant at different zooms', () => {
    const centre = { x: 900, y: 450 }
    for (const scale of [0.3, 1, 2.5]) {
      const centred = viewportForWorldCenter(centre, 1440, 900, scale)
      const screen = worldToScreen(centre, { left: 0, top: 0 }, centred)
      expect(screen.x).toBeCloseTo(720, 10)
      expect(screen.y).toBeCloseTo(450, 10)
    }
  })

  it('treats a zero scale as identity instead of dividing by zero', () => {
    const result = screenToWorld({ x: 100, y: 100 }, rect, {
      panX: 0,
      panY: 0,
      scale: 0,
    })

    expect(Number.isFinite(result.x)).toBe(true)
    expect(Number.isFinite(result.y)).toBe(true)
  })

  it('keeps fast horizontal trackpad swipes on the direct path', () => {
    expect(shouldApplyWheelPanDirectly(120, 4, 0)).toBe(true)
    expect(shouldApplyWheelPanDirectly(-180, 0, 0)).toBe(true)
  })

  it('keeps small two-axis gestures on the direct path', () => {
    expect(shouldApplyWheelPanDirectly(12, 8, 0)).toBe(true)
  })

  it('keeps large vertical wheel steps on the damped path', () => {
    expect(shouldApplyWheelPanDirectly(0, 100, 0)).toBe(false)
    expect(shouldApplyWheelPanDirectly(60, 60, 1)).toBe(false)
  })
})
