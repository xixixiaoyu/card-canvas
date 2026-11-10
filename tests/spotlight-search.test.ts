import { describe, expect, it } from 'vitest'
import { searchSpotlightCards } from '../src/lib/spotlight-search'
import type { Card } from '../src/types'

function card(
  id: string,
  title: string,
  content: string,
  tags: string[],
  updatedAt = 1,
): Card {
  return {
    id,
    title,
    content,
    tags,
    createdAt: 1,
    updatedAt,
  }
}

const cards = [
  card(
    'voice',
    '声音的支点',
    '咽音不是把声音推得更响，而是让气息、共鸣与喉位重新协作。',
    ['声乐/咽音', '心理学/防御机制'],
    10,
  ),
  card(
    'boundary',
    '边界不是墙',
    '真正稳定的关系靠可协商的距离。',
    ['心理学/边界', '关系'],
    20,
  ),
  card(
    'practice',
    '先让气息落下',
    '高音不是向上够，而是让气息稳定下沉。',
    ['声乐/咽音', '练习'],
    30,
  ),
]

describe('searchSpotlightCards', () => {
  it('matches titles case-insensitively', () => {
    expect(
      searchSpotlightCards(cards, '声音').map((hit) => hit.card.id),
    ).toEqual(['voice'])
  })

  it('matches content and tags', () => {
    expect(
      searchSpotlightCards(cards, '可协商').map((hit) => hit.card.id),
    ).toEqual(['boundary'])
    expect(
      searchSpotlightCards(cards, '心理学/防御').map((hit) => hit.card.id),
    ).toEqual(['voice'])
  })

  it('requires every token to match', () => {
    expect(searchSpotlightCards(cards, '气息 下沉')[0]?.card.id).toBe(
      'practice',
    )
    expect(searchSpotlightCards(cards, '气息 不存在')).toHaveLength(0)
  })

  it('ranks title hits above content hits', () => {
    const hits = searchSpotlightCards(cards, '边界')
    expect(hits[0]?.card.id).toBe('boundary')
  })

  it('returns recent cards for an empty query', () => {
    expect(
      searchSpotlightCards(cards, '   ').map((hit) => hit.card.id),
    ).toEqual(['practice', 'boundary', 'voice'])
  })

  it('returns a compact excerpt around content matches', () => {
    const [hit] = searchSpotlightCards(cards, '喉位')

    expect(hit?.excerpt).toContain('喉位')
    expect(hit?.matchedTags).toEqual([])
  })

  it('caps the result count', () => {
    expect(searchSpotlightCards(cards, '', 2)).toHaveLength(2)
  })
})
