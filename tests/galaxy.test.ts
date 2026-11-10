import { describe, expect, it } from 'vitest'
import {
  cardHasTag,
  isCardDimmed,
  isConnectionDimmed,
  tagMatches,
} from '../src/lib/galaxy'
import type { Card, Connection } from '../src/types'

function card(id: string, tags: string[]): Card {
  return {
    id,
    title: id,
    content: '',
    tags,
    createdAt: 1,
    updatedAt: 1,
  }
}

const voice = card('voice', ['声乐/咽音', '心理学/防御机制'])
const boundary = card('boundary', ['心理学/边界'])
const practice = card('practice', ['声乐/咽音'])

function connection(fromCardId: string, toCardId: string): Connection {
  return {
    id: `${fromCardId}-${toCardId}`,
    boardId: 'board-main',
    fromCardId,
    toCardId,
  }
}

describe('galaxy dimming', () => {
  it('matches a parent tag to every descendant', () => {
    expect(tagMatches('心理学/防御机制', '心理学')).toBe(true)
    expect(tagMatches('心理学/边界', '心理学')).toBe(true)
    expect(tagMatches('心理学', '心理学')).toBe(true)
    expect(cardHasTag(boundary, '心理学')).toBe(true)
  })

  it('isolates sibling branches', () => {
    expect(cardHasTag(boundary, '心理学/防御机制')).toBe(false)
    expect(cardHasTag(voice, '心理学/边界')).toBe(false)
    expect(tagMatches('心理学/防御机制', '心理学/防御')).toBe(false)
  })

  it('matches tags exactly and case-insensitively', () => {
    expect(cardHasTag(voice, '心理学/防御机制')).toBe(true)
    expect(cardHasTag(voice, 'PSYCHOLOGY')).toBe(false)
    expect(isCardDimmed(boundary, '心理学/防御机制')).toBe(true)
    expect(isCardDimmed(voice, null)).toBe(false)
  })

  it('keeps a wire lit when either endpoint matches', () => {
    const cards = [voice, boundary, practice]

    expect(
      isConnectionDimmed(
        connection('voice', 'boundary'),
        '心理学/防御机制',
        cards,
      ),
    ).toBe(false)
  })

  it('dims a wire when both endpoints are outside the spotlight', () => {
    const cards = [voice, boundary, practice]

    expect(
      isConnectionDimmed(
        connection('boundary', 'practice'),
        '心理学/防御机制',
        cards,
      ),
    ).toBe(true)
    expect(
      isConnectionDimmed(connection('boundary', 'practice'), null, cards),
    ).toBe(false)
  })
})
