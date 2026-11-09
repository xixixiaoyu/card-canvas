export interface CaptureRect {
  x: number
  y: number
  width: number
  height: number
}

export interface CaptureViewport {
  left: number
  top: number
  right: number
  bottom: number
}

export interface CapturePlacementInput {
  viewport: CaptureViewport
  center: { x: number; y: number }
  width: number
  height: number
  selected?: CaptureRect | null
  existing: CaptureRect[]
}

export interface CapturePlacement {
  x: number
  y: number
}

const COMPANION_GAP = 48
const CASCADE_STEP = 32
const CASCADE_RINGS = 3

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function overlaps(a: CaptureRect, b: CaptureRect) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  )
}

function overlapArea(a: CaptureRect, b: CaptureRect) {
  const width = Math.max(
    0,
    Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
  )
  const height = Math.max(
    0,
    Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
  )
  return width * height
}

function intersectsViewport(rect: CaptureRect, viewport: CaptureViewport) {
  return (
    rect.x + rect.width > viewport.left &&
    rect.x < viewport.right &&
    rect.y + rect.height > viewport.top &&
    rect.y < viewport.bottom
  )
}

function fitsViewport(rect: CaptureRect, viewport: CaptureViewport) {
  return (
    rect.x >= viewport.left &&
    rect.y >= viewport.top &&
    rect.x + rect.width <= viewport.right &&
    rect.y + rect.height <= viewport.bottom
  )
}

function collisionArea(rect: CaptureRect, existing: CaptureRect[]) {
  return existing.reduce((total, item) => total + overlapArea(rect, item), 0)
}

function directionPriority(dx: number, dy: number) {
  if (dx > 0 && dy === 0) return 0
  if (dx === 0 && dy > 0) return 1
  if (dx < 0 && dy === 0) return 2
  if (dx === 0 && dy < 0) return 3
  if (dx > 0 && dy > 0) return 4
  if (dx < 0 && dy > 0) return 5
  if (dx < 0 && dy < 0) return 6
  return 7
}

/**
 * Captures should land where the user's attention already is:
 *
 * 1. next to the selected card, favouring its right side;
 * 2. otherwise the viewport center;
 * 3. if the center is occupied, a small 32px cascade around it — never a
 *    distant "best empty slot".
 *
 * The last resort keeps the least-overlapping cascade position instead of
 * teleporting the card to a corner of the viewport.
 */
export function chooseCapturePlacement(
  input: CapturePlacementInput,
): CapturePlacement {
  const { viewport, center, width, height, selected, existing } = input
  const maxX = Math.max(viewport.left, viewport.right - width)
  const maxY = Math.max(viewport.top, viewport.bottom - height)

  if (selected && intersectsViewport(selected, viewport)) {
    const centeredY = clamp(
      selected.y + selected.height / 2 - height / 2,
      viewport.top,
      maxY,
    )
    const centeredX = clamp(
      selected.x + selected.width / 2 - width / 2,
      viewport.left,
      maxX,
    )
    const companions: CapturePlacement[] = [
      {
        x: selected.x + selected.width + COMPANION_GAP,
        y: centeredY,
      },
      {
        x: centeredX,
        y: selected.y + selected.height + COMPANION_GAP,
      },
      {
        x: selected.x - width - COMPANION_GAP,
        y: centeredY,
      },
      {
        x: centeredX,
        y: selected.y - height - COMPANION_GAP,
      },
    ]

    for (const companion of companions) {
      const rect = { ...companion, width, height }
      if (
        fitsViewport(rect, viewport) &&
        !existing.some((item) => overlaps(rect, item))
      ) {
        return companion
      }
    }
  }

  const baseX = clamp(center.x - width / 2, viewport.left, maxX)
  const baseY = clamp(center.y - height / 2, viewport.top, maxY)
  const ringOffsets: Array<{ dx: number; dy: number }> = []

  for (let ring = 0; ring <= CASCADE_RINGS; ring += 1) {
    const offsets: Array<{ dx: number; dy: number }> = []

    for (let dx = -ring; dx <= ring; dx += 1) {
      for (let dy = -ring; dy <= ring; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue
        offsets.push({ dx, dy })
      }
    }

    offsets.sort(
      (a, b) =>
        directionPriority(a.dx, a.dy) - directionPriority(b.dx, b.dy) ||
        Math.abs(a.dx) + Math.abs(a.dy) - (Math.abs(b.dx) + Math.abs(b.dy)),
    )
    ringOffsets.push(...offsets)
  }

  const positions: CapturePlacement[] = []
  const seen = new Set<string>()

  for (const offset of ringOffsets) {
    const position = {
      x: clamp(baseX + offset.dx * CASCADE_STEP, viewport.left, maxX),
      y: clamp(baseY + offset.dy * CASCADE_STEP, viewport.top, maxY),
    }
    const key = `${position.x}:${position.y}`
    if (seen.has(key)) continue

    seen.add(key)
    positions.push(position)
  }

  for (const position of positions) {
    const rect = { ...position, width, height }
    if (
      fitsViewport(rect, viewport) &&
      !existing.some((item) => overlaps(rect, item))
    ) {
      return position
    }
  }

  let best = positions[0] ?? { x: baseX, y: baseY }
  let bestArea = Number.POSITIVE_INFINITY

  for (const position of positions) {
    const rect = { ...position, width, height }
    const area = collisionArea(rect, existing)
    if (area < bestArea) {
      best = position
      bestArea = area
    }
  }

  return best
}
