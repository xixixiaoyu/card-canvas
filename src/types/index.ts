/**
 * Core domain contracts.
 *
 * A Card is the source of truth. A BoardItem is only a spatial projection of
 * that card onto a board, which keeps content independent from layout.
 */
export interface Card {
  id: string
  title: string
  content: string
  tags: string[]
  createdAt: number
  updatedAt: number
  isDeleted?: boolean
}

export interface BoardItem {
  id: string
  cardId: string
  boardId: string
  x: number
  y: number
  width?: number
  color?: string
}

export interface Viewport {
  panX: number
  panY: number
  scale: number
}

export interface Connection {
  id: string
  boardId: string
  fromCardId: string
  toCardId: string
  label?: string
}

/** Presentation-only structure used by the phase-one card preview. */
export interface CardHighlight {
  order: string
  label: string
  text: string
}
