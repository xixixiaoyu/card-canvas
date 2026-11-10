import { describe, expect, it } from 'vitest'
import {
  searchGlobalEntries,
  type GlobalSearchEntry,
} from '../src/lib/global-search'
import type { Card } from '../src/types'

function card(
  id: string,
  title: string,
  tags: string[] = [],
  updatedAt = 1,
): Card {
  return {
    id,
    title,
    content: `${title} 的正文`,
    tags,
    createdAt: 1,
    updatedAt,
  }
}

function entry(
  cardValue: Card,
  boardId: string,
  boardName: string,
  itemId = `item-${cardValue.id}-${boardId}`,
): GlobalSearchEntry {
  return {
    card: cardValue,
    itemId,
    boardId,
    boardName,
  }
}

const voice = card('voice', '声音的支点', ['声乐/咽音'], 10)
const boundary = card('boundary', '边界不是墙', ['心理学/边界'], 20)
const defence = card('defence', '防御的回路', ['心理学/防御机制'], 30)

describe('searchGlobalEntries', () => {
  it('searches cards across boards and keeps their board badges', () => {
    const results = searchGlobalEntries(
      [
        entry(voice, 'board-a', '声乐板'),
        entry(boundary, 'board-b', '心理学板'),
        entry(defence, 'board-b', '心理学板'),
      ],
      '防御',
      'board-a',
    )

    expect(results).toHaveLength(1)
    expect(results[0].entry.boardName).toBe('心理学板')
    expect(results[0].entry.boardId).toBe('board-b')
  })

  it('returns one row per projection for a card on multiple boards', () => {
    const results = searchGlobalEntries(
      [
        entry(voice, 'board-a', '声乐板', 'item-a'),
        entry(voice, 'board-b', '实验板', 'item-b'),
      ],
      '支点',
      'board-b',
    )

    expect(results).toHaveLength(2)
    expect(results[0].entry.boardId).toBe('board-b')
    expect(results[1].entry.boardId).toBe('board-a')
  })

  it('does not leak sibling tag branches into the query', () => {
    expect(
      searchGlobalEntries(
        [entry(boundary, 'board-b', '心理学板')],
        '心理学',
        'board-b',
      ),
    ).toHaveLength(1)
    expect(
      searchGlobalEntries(
        [entry(boundary, 'board-b', '心理学板')],
        '心理学/防御',
        'board-b',
      ),
    ).toHaveLength(0)
  })

  it('caps results and preserves score order across boards', () => {
    const results = searchGlobalEntries(
      [
        entry(voice, 'board-a', 'A'),
        entry(boundary, 'board-b', 'B'),
        entry(defence, 'board-c', 'C'),
      ],
      '',
      'board-a',
      2,
    )

    expect(results).toHaveLength(2)
    expect(results[0].card.id).toBe('defence')
    expect(results[1].card.id).toBe('boundary')
  })
})
