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

export interface CardDragBatchEvent {
  items: CardDragPositionEvent[]
}

export interface CardDragEndBatchEvent {
  items: CardDragEndEvent[]
}

type BatchPositionListener = (event: CardDragBatchEvent) => void
type BatchEndListener = (event: CardDragEndBatchEvent) => void

const positionListeners = new Set<BatchPositionListener>()
const endListeners = new Set<BatchEndListener>()

/**
 * Card drags deliberately bypass Vue reactivity. A whole selected group is
 * broadcast in one batch so ConnectionLayer can union its endpoints and update
 * every affected path exactly once per animation frame.
 */
export function emitCardDragBatch(event: CardDragBatchEvent) {
  if (!event.items.length) return
  for (const listener of positionListeners) listener(event)
}

export function emitCardDragEndBatch(event: CardDragEndBatchEvent) {
  if (!event.items.length) return
  for (const listener of endListeners) listener(event)
}

export function subscribeCardDragBatch(listener: BatchPositionListener) {
  positionListeners.add(listener)
  return () => positionListeners.delete(listener)
}

export function subscribeCardDragEndBatch(listener: BatchEndListener) {
  endListeners.add(listener)
  return () => endListeners.delete(listener)
}
