import { db } from '../db'
import type { Card } from '../types'

/**
 * Soft-delete cards that have no remaining board projection.
 *
 * Call this inside a Dexie transaction that already covers cards and
 * boardItems so a board deletion and its orphan cleanup remain atomic.
 */
export async function softDeleteUnreferencedCards(
  candidateCardIds: string[],
  deletedAt = Date.now(),
): Promise<Card[]> {
  if (!candidateCardIds.length) return []

  const remainingItems = await db.boardItems.toArray()
  const referencedCardIds = new Set(remainingItems.map((item) => item.cardId))
  const orphanCards = (await db.cards.bulkGet(candidateCardIds)).filter(
    (card): card is Card =>
      card !== undefined && !card.isDeleted && !referencedCardIds.has(card.id),
  )
  if (!orphanCards.length) return []

  const deletedCards = orphanCards.map((card) => ({
    ...card,
    isDeleted: true as const,
    updatedAt: deletedAt,
  }))
  await db.cards.bulkPut(deletedCards)
  return deletedCards
}
