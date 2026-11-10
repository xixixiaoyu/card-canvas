export interface GroupDragItem {
  id: string
  cardId: string
  x: number
  y: number
}

export interface GroupDragPosition {
  itemId: string
  cardId: string
  x: number
  y: number
}

/**
 * Apply one world-space delta to every member of a drag group. Because every
 * member receives the exact same delta, all pairwise differences remain
 * invariant at every zoom level.
 */
export function resolveGroupPositions(
  items: GroupDragItem[],
  delta: { x: number; y: number },
): GroupDragPosition[] {
  return items.map((item) => ({
    itemId: item.id,
    cardId: item.cardId,
    x: item.x + delta.x,
    y: item.y + delta.y,
  }))
}
