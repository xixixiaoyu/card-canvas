export interface LayoutCard {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface LayoutPosition {
  itemId: string
  x: number
  y: number
}

interface ArrangeOptions {
  columnGap?: number
  rowGap?: number
  maxColumns?: number
}

const READING_ROW_TOLERANCE = 80
const DEFAULT_COLUMN_GAP = 72
const DEFAULT_ROW_GAP = 56

function readingOrder(cards: LayoutCard[]) {
  const byY = [...cards].sort((a, b) => a.y - b.y || a.x - b.x)
  const rows: LayoutCard[][] = []

  for (const card of byY) {
    const row = rows.at(-1)
    if (!row || Math.abs(card.y - row[0].y) > READING_ROW_TOLERANCE) {
      rows.push([card])
    } else {
      row.push(card)
    }
  }

  return rows.flatMap((row) => [...row].sort((a, b) => a.x - b.x))
}

export function arrangeCards(
  cards: LayoutCard[],
  options: ArrangeOptions = {},
): LayoutPosition[] {
  if (cards.length < 2) return []

  const ordered = readingOrder(cards)
  const maxColumns = Math.max(1, options.maxColumns ?? 4)
  const columnCount = Math.min(
    ordered.length,
    maxColumns,
    Math.max(2, Math.round(Math.sqrt(ordered.length))),
  )
  const columnGap = options.columnGap ?? DEFAULT_COLUMN_GAP
  const rowGap = options.rowGap ?? DEFAULT_ROW_GAP
  const columnWidth = Math.max(...ordered.map((card) => card.width))
  const columnHeights = Array.from({ length: columnCount }, () => 0)
  const anchorX = Math.round(Math.min(...ordered.map((card) => card.x)))
  const anchorY = Math.round(Math.min(...ordered.map((card) => card.y)))
  const positions: LayoutPosition[] = []

  for (const card of ordered) {
    let column = 0
    for (let index = 1; index < columnHeights.length; index += 1) {
      if (columnHeights[index] < columnHeights[column]) column = index
    }

    positions.push({
      itemId: card.id,
      x: anchorX + column * (columnWidth + columnGap),
      y: anchorY + columnHeights[column],
    })
    columnHeights[column] += card.height + rowGap
  }

  return positions
}
