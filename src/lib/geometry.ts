export interface Point {
  x: number
  y: number
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const SIDES = ['top', 'right', 'bottom', 'left'] as const

export type Side = (typeof SIDES)[number]

export type EdgeMidpoints = Record<Side, Point>

export interface EdgePair {
  from: { side: Side; point: Point }
  to: { side: Side; point: Point }
  distance: number
}

export interface ConnectionGeometry {
  path: string
  start: Point
  end: Point
  control1: Point
  control2: Point
  midpoint: Point
  fromSide: Side
  toSide: Side
  distance: number
}

export function edgeMidpoints(rect: Rect): EdgeMidpoints {
  const centerX = rect.x + rect.width / 2
  const centerY = rect.y + rect.height / 2

  return {
    top: { x: centerX, y: rect.y },
    right: { x: rect.x + rect.width, y: centerY },
    bottom: { x: centerX, y: rect.y + rect.height },
    left: { x: rect.x, y: centerY },
  }
}

export function edgeNormal(side: Side): Point {
  switch (side) {
    case 'top':
      return { x: 0, y: -1 }
    case 'right':
      return { x: 1, y: 0 }
    case 'bottom':
      return { x: 0, y: 1 }
    case 'left':
      return { x: -1, y: 0 }
  }
}

export function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function pointInRect(point: Point, rect: Rect) {
  return (
    point.x >= rect.x &&
    point.x <= rect.x + rect.width &&
    point.y >= rect.y &&
    point.y <= rect.y + rect.height
  )
}

/**
 * Pick the pair of edge midpoints with the smallest Euclidean distance. The
 * iteration order is deterministic so equal distances resolve consistently.
 */
export function closestEdgePair(source: Rect, target: Rect): EdgePair {
  const sourceMidpoints = edgeMidpoints(source)
  const targetMidpoints = edgeMidpoints(target)

  let best: EdgePair | null = null

  for (const fromSide of SIDES) {
    for (const toSide of SIDES) {
      const fromPoint = sourceMidpoints[fromSide]
      const toPoint = targetMidpoints[toSide]
      const gap = distance(fromPoint, toPoint)

      if (!best || gap < best.distance) {
        best = {
          from: { side: fromSide, point: fromPoint },
          to: { side: toSide, point: toPoint },
          distance: gap,
        }
      }
    }
  }

  return best!
}

/** Cubic Bézier point at parameter t (0 = start, 1 = end). */
export function cubicPoint(
  t: number,
  p0: Point,
  p1: Point,
  p2: Point,
  p3: Point,
): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t

  return {
    x: a * p0.x + b * p1.x + c * p2.x + d * p3.x,
    y: a * p0.y + b * p1.y + c * p2.y + d * p3.y,
  }
}

export function bezierMidpoint(p0: Point, p1: Point, p2: Point, p3: Point) {
  return cubicPoint(0.5, p0, p1, p2, p3)
}

export function toPathData(
  start: Point,
  control1: Point,
  control2: Point,
  end: Point,
) {
  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `C ${control1.x.toFixed(2)} ${control1.y.toFixed(2)}`,
    `${control2.x.toFixed(2)} ${control2.y.toFixed(2)}`,
    `${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
  ].join(' ')
}

function controlOffset(gap: number) {
  return clamp(gap * 0.45, 36, 180)
}

/**
 * Auto-docked connection between two card bounds. The curve leaves each edge
 * along its outward normal and springs out proportionally to the gap.
 */
export function connectionGeometry(
  source: Rect,
  target: Rect,
): ConnectionGeometry {
  const pair = closestEdgePair(source, target)
  const offset = controlOffset(pair.distance)
  const fromNormal = edgeNormal(pair.from.side)
  const toNormal = edgeNormal(pair.to.side)

  const control1 = {
    x: pair.from.point.x + fromNormal.x * offset,
    y: pair.from.point.y + fromNormal.y * offset,
  }
  const control2 = {
    x: pair.to.point.x + toNormal.x * offset,
    y: pair.to.point.y + toNormal.y * offset,
  }

  return {
    path: toPathData(pair.from.point, control1, control2, pair.to.point),
    start: pair.from.point,
    end: pair.to.point,
    control1,
    control2,
    midpoint: bezierMidpoint(
      pair.from.point,
      control1,
      control2,
      pair.to.point,
    ),
    fromSide: pair.from.side,
    toSide: pair.to.side,
    distance: pair.distance,
  }
}

/**
 * Drafting wire: start from the source edge nearest the pointer and curve
 * toward the cursor. Once a target is hovered the layer switches to the
 * auto-docked `connectionGeometry` preview.
 */
export function draftGeometry(
  source: Rect,
  pointer: Point,
  preferredSide?: Side,
): ConnectionGeometry {
  const midpoints = edgeMidpoints(source)

  let side: Side = preferredSide ?? 'right'
  let start = midpoints[side]
  let gap = distance(start, pointer)

  if (!preferredSide) {
    for (const candidate of SIDES) {
      const candidatePoint = midpoints[candidate]
      const candidateGap = distance(candidatePoint, pointer)

      if (candidateGap < gap) {
        side = candidate
        start = candidatePoint
        gap = candidateGap
      }
    }
  }

  const normal = edgeNormal(side)
  const offset = controlOffset(gap)
  const control1 = {
    x: start.x + normal.x * offset,
    y: start.y + normal.y * offset,
  }
  const control2 = {
    x: pointer.x + normal.x * offset,
    y: pointer.y + normal.y * offset,
  }

  return {
    path: toPathData(start, control1, control2, pointer),
    start,
    end: pointer,
    control1,
    control2,
    midpoint: bezierMidpoint(start, control1, control2, pointer),
    fromSide: side,
    toSide: side,
    distance: gap,
  }
}
