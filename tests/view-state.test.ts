import { beforeEach, describe, expect, it } from 'vitest'
import {
  clearViewport,
  readViewport,
  viewportStorageKey,
  writeViewport,
} from '../src/lib/view-state'

describe('viewport persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('round-trips pan and scale per board', () => {
    writeViewport('board-main', { panX: 12.5, panY: -80, scale: 1.75 })

    expect(readViewport('board-main')).toEqual({
      panX: 12.5,
      panY: -80,
      scale: 1.75,
    })
    expect(readViewport('board-other')).toBeNull()
    expect(localStorage.getItem(viewportStorageKey('board-main'))).toContain(
      '1.75',
    )
  })

  it('ignores malformed, partial or non-positive records', () => {
    localStorage.setItem(viewportStorageKey('a'), '{not json')
    localStorage.setItem(
      viewportStorageKey('b'),
      JSON.stringify({ panX: 0, panY: 0, scale: 0 }),
    )
    localStorage.setItem(
      viewportStorageKey('c'),
      JSON.stringify({ panX: Number.NaN, panY: 0, scale: 1 }),
    )
    localStorage.setItem(viewportStorageKey('d'), JSON.stringify({ panX: 1 }))

    expect(readViewport('a')).toBeNull()
    expect(readViewport('b')).toBeNull()
    expect(readViewport('c')).toBeNull()
    expect(readViewport('d')).toBeNull()
  })

  it('keeps the stage size so a resized window can skip a stale camera', () => {
    writeViewport('board-main', {
      panX: 1,
      panY: 2,
      scale: 1.5,
      width: 1280,
      height: 720,
    })

    expect(readViewport('board-main')).toMatchObject({
      width: 1280,
      height: 720,
    })
  })

  it('clears a saved viewport', () => {
    writeViewport('board-main', { panX: 1, panY: 2, scale: 1 })
    clearViewport('board-main')

    expect(readViewport('board-main')).toBeNull()
  })
})
