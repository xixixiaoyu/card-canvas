import type { Viewport } from '../types'

const STORAGE_PREFIX = 'card-canvas:viewport:'

export interface StoredViewport extends Viewport {
  width?: number
  height?: number
}

export function viewportStorageKey(boardId: string) {
  return `${STORAGE_PREFIX}${boardId}`
}

/**
 * Read a previously saved camera for one board. Invalid or partial records are
 * treated as "no saved view" instead of throwing into the canvas mount path.
 */
export function readViewport(boardId: string): StoredViewport | null {
  if (typeof localStorage === 'undefined') return null

  try {
    const raw = localStorage.getItem(viewportStorageKey(boardId))
    if (!raw) return null

    const value = JSON.parse(raw) as Partial<StoredViewport>
    if (
      typeof value.panX !== 'number' ||
      typeof value.panY !== 'number' ||
      typeof value.scale !== 'number' ||
      !Number.isFinite(value.panX) ||
      !Number.isFinite(value.panY) ||
      !Number.isFinite(value.scale) ||
      value.scale <= 0
    ) {
      return null
    }

    return {
      panX: value.panX,
      panY: value.panY,
      scale: value.scale,
      width:
        typeof value.width === 'number' && Number.isFinite(value.width)
          ? value.width
          : undefined,
      height:
        typeof value.height === 'number' && Number.isFinite(value.height)
          ? value.height
          : undefined,
    }
  } catch {
    return null
  }
}

export function writeViewport(boardId: string, viewport: StoredViewport) {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.setItem(viewportStorageKey(boardId), JSON.stringify(viewport))
  } catch {
    // Private mode / quota failures should never break navigation.
  }
}

export function clearViewport(boardId: string) {
  if (typeof localStorage === 'undefined') return

  try {
    localStorage.removeItem(viewportStorageKey(boardId))
  } catch {
    // ignore
  }
}
