import { reactive } from 'vue'
import type { BoardItem } from '../types'
import type { Rect } from './geometry'

/**
 * World-space card heights are content-driven, so they cannot live in the
 * BoardItem contract. CardNode reports its measured layout height here and the
 * connection layer reads it reactively.
 */
const heights = reactive(new Map<string, number>())

export function setCardHeight(itemId: string, height: number) {
  if (!Number.isFinite(height) || height <= 0) return

  const rounded = Math.round(height * 100) / 100
  if (heights.get(itemId) === rounded) return

  heights.set(itemId, rounded)
}

export function getCardHeight(itemId: string) {
  return heights.get(itemId)
}

export function removeCardHeight(itemId: string) {
  heights.delete(itemId)
}

/**
 * World bounds for connection geometry. Falls back to a conservative height
 * until the card has been measured (first paint / offscreen card).
 */
export function getItemRect(
  item: Pick<BoardItem, 'id' | 'x' | 'y' | 'width'>,
): Rect {
  const width = item.width ?? 420

  return {
    x: item.x,
    y: item.y,
    width,
    height: getCardHeight(item.id) ?? Math.max(180, width * 0.62),
  }
}

export function useCardMetrics() {
  return { heights, setCardHeight, getCardHeight, removeCardHeight }
}
