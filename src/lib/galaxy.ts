import type { Card, Connection } from '../types'

/**
 * Hierarchical tags use `/` as a path separator. A focused parent includes
 * every descendant, while siblings remain isolated:
 *   #心理学       -> #心理学, #心理学/防御机制, #心理学/边界
 *   #心理学/防御  -> #心理学/防御机制
 *   #心理学/边界  -> not #心理学/防御机制
 */
export function tagMatches(tag: string, targetTag: string) {
  const candidate = tag.trim().toLocaleLowerCase()
  const target = targetTag.trim().toLocaleLowerCase()
  if (!candidate || !target) return false

  return candidate === target || candidate.startsWith(`${target}/`)
}

export function cardHasTag(card: Card, tag: string) {
  return card.tags.some((candidate) => tagMatches(candidate, tag))
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
