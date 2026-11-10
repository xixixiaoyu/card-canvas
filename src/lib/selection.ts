export interface SelectionRect {
  x: number
  y: number
  width: number
  height: number
}

export function normalizeRect(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): SelectionRect {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}

/**
 * Marquee semantics are "touch": a card is selected as soon as the rubber-band
 * rect intersects it, not only when fully enclosed.
 */
export function rectsIntersect(a: SelectionRect, b: SelectionRect) {
  return (
    a.x <= b.x + b.width &&
    a.x + a.width >= b.x &&
    a.y <= b.y + b.height &&
    a.y + a.height >= b.y
  )
}

export function idsIntersecting<T>(
  items: T[],
  worldRect: SelectionRect,
  getRect: (item: T) => SelectionRect,
): string[] {
  return items
    .filter((item) => rectsIntersect(worldRect, getRect(item)))
    .map((item) => (item as T & { id: string }).id)
}
