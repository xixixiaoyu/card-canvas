export interface CardDragPositionEvent {
  itemId: string
  cardId: string
  x: number
  y: number
}

export interface CardDragEndEvent {
  itemId: string
  cardId: string
}

type PositionListener = (event: CardDragPositionEvent) => void
type EndListener = (event: CardDragEndEvent) => void

const positionListeners = new Set<PositionListener>()
const endListeners = new Set<EndListener>()

/**
 * Card drags deliberately bypass Vue reactivity. Connected SVG paths get the
 * live world position through this tiny event bus and update their `d`
 * attributes in the same animation frame.
 */
export function emitCardDragPosition(event: CardDragPositionEvent) {
  for (const listener of positionListeners) listener(event)
}

export function emitCardDragEnd(event: CardDragEndEvent) {
  for (const listener of endListeners) listener(event)
}

export function subscribeCardDragPosition(listener: PositionListener) {
  positionListeners.add(listener)
  return () => positionListeners.delete(listener)
}

export function subscribeCardDragEnd(listener: EndListener) {
  endListeners.add(listener)
  return () => endListeners.delete(listener)
}
