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
  anchor?: { x: number; y: number }
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
  const anchorX =
    options.anchor?.x ?? Math.round(Math.min(...ordered.map((card) => card.x)))
  const anchorY =
    options.anchor?.y ?? Math.round(Math.min(...ordered.map((card) => card.y)))
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

function cardComponents(
  cards: LayoutCard[],
  connections: Array<{ fromCardId: string; toCardId: string }>,
) {
  const cardIds = new Set(cards.map((card) => card.id))
  const graph = new Map<string, Set<string>>()
  for (const card of cards) graph.set(card.id, new Set())
  for (const connection of connections) {
    if (
      !cardIds.has(connection.fromCardId) ||
      !cardIds.has(connection.toCardId)
    ) {
      continue
    }
    graph.get(connection.fromCardId)!.add(connection.toCardId)
    graph.get(connection.toCardId)!.add(connection.fromCardId)
  }

  const cardById = new Map(cards.map((card) => [card.id, card]))
  const visited = new Set<string>()
  const components: LayoutCard[][] = []
  for (const card of readingOrder(cards)) {
    if (visited.has(card.id)) continue
    const component: LayoutCard[] = []
    const queue = [card.id]
    visited.add(card.id)

    while (queue.length) {
      const id = queue.shift()!
      const current = cardById.get(id)
      if (current) component.push(current)
      for (const neighbor of graph.get(id) ?? []) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        queue.push(neighbor)
      }
    }
    components.push(component)
  }
  return components
}

export function arrangeConnectedClusters(
  cards: LayoutCard[],
  connections: Array<{ fromCardId: string; toCardId: string }>,
  options: ArrangeOptions = {},
): LayoutPosition[] {
  if (cards.length < 2) return []

  const columnGap = options.columnGap ?? DEFAULT_COLUMN_GAP
  const rowGap = options.rowGap ?? DEFAULT_ROW_GAP
  const components = cardComponents(cards, connections)
  const anchorX =
    options.anchor?.x ?? Math.round(Math.min(...cards.map((card) => card.x)))
  const anchorY =
    options.anchor?.y ?? Math.round(Math.min(...cards.map((card) => card.y)))
  const cardById = new Map(cards.map((card) => [card.id, card]))
  const positions: LayoutPosition[] = []
  let cursorX = anchorX

  for (const component of components) {
    const componentPositions =
      component.length === 1
        ? [{ itemId: component[0]!.id, x: cursorX, y: anchorY }]
        : arrangeCards(component, {
            ...options,
            columnGap,
            rowGap,
            anchor: { x: cursorX, y: anchorY },
          })
    positions.push(...componentPositions)
    const right = Math.max(
      ...componentPositions.map(
        (position) =>
          position.x + (cardById.get(position.itemId)?.width ?? 420),
      ),
    )
    cursorX = right + Math.round(columnGap * 1.5)
  }

  return positions
}
