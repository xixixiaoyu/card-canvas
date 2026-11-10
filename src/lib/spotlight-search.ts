import type { Card } from '../types'

export interface SpotlightMatch {
  card: Card
  excerpt: string
  matchedTags: string[]
  score: number
}

const DEFAULT_LIMIT = 8

function normalized(value: string) {
  return value.toLocaleLowerCase()
}

function matchedTags(card: Card, tokens: string[]) {
  return card.tags.filter((tag) => {
    const lower = normalized(tag)
    return tokens.some((token) => lower.includes(token))
  })
}

function excerptFor(content: string, tokens: string[]) {
  const compact = content.replace(/\s+/g, ' ').trim()
  if (!compact) return ''

  const lower = normalized(compact)
  let index = -1

  for (const token of tokens) {
    const candidate = lower.indexOf(token)
    if (candidate === -1) continue
    if (index === -1 || candidate < index) index = candidate
  }

  if (index === -1) {
    return compact.length > 96 ? `${compact.slice(0, 96)}…` : compact
  }

  const start = Math.max(0, index - 28)
  const end = Math.min(compact.length, start + 108)
  return `${start > 0 ? '…' : ''}${compact.slice(start, end)}${
    end < compact.length ? '…' : ''
  }`
}

function scoreCard(card: Card, tokens: string[]) {
  const title = normalized(card.title)
  const content = normalized(card.content)
  const tags = card.tags.map(normalized)
  let score = 0

  for (const token of tokens) {
    if (title === token) score += 140
    else if (title.startsWith(token)) score += 100
    else if (title.includes(token)) score += 70

    if (tags.some((tag) => tag === token)) score += 80
    else if (tags.some((tag) => tag.includes(token))) score += 55

    if (content.includes(token)) score += 28
  }

  return score
}

/**
 * Local, deterministic spotlight search over title, content and tags.
 *
 * Multi-word queries use AND semantics. An empty query exposes the most
 * recently edited cards instead of a blank panel.
 */
export function searchSpotlightCards(
  cards: Card[],
  query: string,
  limit = DEFAULT_LIMIT,
): SpotlightMatch[] {
  const tokens = normalized(query).trim().split(/\s+/).filter(Boolean)

  const matches = cards
    .filter((card) => {
      if (!tokens.length) return true

      const haystack = normalized(
        [card.title, card.content, card.tags.join(' ')].join(' '),
      )
      return tokens.every((token) => haystack.includes(token))
    })
    .map((card) => ({
      card,
      excerpt: excerptFor(card.content, tokens),
      matchedTags: matchedTags(card, tokens),
      score: tokens.length ? scoreCard(card, tokens) : 0,
    }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.card.updatedAt - a.card.updatedAt ||
        a.card.id.localeCompare(b.card.id),
    )

  return matches.slice(0, Math.max(1, limit))
}
