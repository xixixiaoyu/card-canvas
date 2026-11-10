import type { Card } from '../types'
import { searchSpotlightCards, type SpotlightMatch } from './spotlight-search'

export interface SpotlightTarget {
  cardId: string
  boardId: string
  itemId: string
}

export interface GlobalSearchEntry {
  card: Card
  itemId: string
  boardId: string
  boardName: string
}

export interface GlobalSearchResult extends SpotlightMatch {
  entry: GlobalSearchEntry
}

function placementsForCard(
  entries: GlobalSearchEntry[],
  cardId: string,
  activeBoardId: string,
) {
  return entries
    .filter((entry) => entry.card.id === cardId)
    .sort(
      (a, b) =>
        Number(b.boardId === activeBoardId) -
          Number(a.boardId === activeBoardId) ||
        a.boardName.localeCompare(b.boardName),
    )
}

/**
 * Global search keeps one result per board placement. A card projected onto
 * multiple boards is therefore visible in every constellation, with the
 * active board floated first for that card.
 */
export function searchGlobalEntries(
  entries: GlobalSearchEntry[],
  query: string,
  activeBoardId: string,
  limit = 8,
): GlobalSearchResult[] {
  const cards = new Map<string, Card>()
  for (const entry of entries) cards.set(entry.card.id, entry.card)

  const matches = searchSpotlightCards(
    [...cards.values()],
    query,
    Math.max(cards.size, 1),
  )
  const results: GlobalSearchResult[] = []

  for (const match of matches) {
    for (const entry of placementsForCard(
      entries,
      match.card.id,
      activeBoardId,
    )) {
      results.push({ ...match, entry })
      if (results.length >= limit) return results
    }
  }

  return results
}
