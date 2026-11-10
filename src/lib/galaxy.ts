import type { Card, Connection } from '../types'

export function cardHasTag(card: Card, tag: string) {
  const target = tag.trim().toLocaleLowerCase()
  if (!target) return false

  return card.tags.some(
    (candidate) => candidate.trim().toLocaleLowerCase() === target,
  )
}

export function isCardDimmed(card: Card, activeTag: string | null) {
  return Boolean(activeTag) && !cardHasTag(card, activeTag!)
}

/**
 * A wire stays legible when either endpoint belongs to the active galaxy.
 * Only wires whose two endpoints are both outside the spotlight dim.
 */
export function isConnectionDimmed(
  connection: Connection,
  activeTag: string | null,
  cards: Card[],
) {
  if (!activeTag) return false

  const from = cards.find((card) => card.id === connection.fromCardId)
  const to = cards.find((card) => card.id === connection.toCardId)
  if (!from || !to) return false

  return !cardHasTag(from, activeTag) && !cardHasTag(to, activeTag)
}
