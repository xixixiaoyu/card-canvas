import { describe, expect, it } from 'vitest'
import {
  parseSemanticQueryTerms,
  parseSemanticSuggestions,
  selectSemanticCandidates,
} from '../src/lib/ai/semantic-search'
import type { GlobalSearchEntry } from '../src/lib/global-search'
import type { Card } from '../src/types'

function card(
  id: string,
  title: string,
  content: string,
  tags: string[],
): Card {
  return {
    id,
    title,
    content,
    tags,
    createdAt: 1,
    updatedAt: 1,
  }
}

function entry(
  value: Card,
  boardId = 'board-main',
  boardName = '我的白板',
): GlobalSearchEntry {
  return {
    card: value,
    itemId: `item-${value.id}-${boardId}`,
    boardId,
    boardName,
  }
}

describe('AI semantic search helpers', () => {
  it('parses bounded query expansion terms', () => {
    expect(
      parseSemanticQueryTerms(
        '```json\n{"terms":["讨好型人格","边界感","冲突回避","讨好型人格",""]}\n```',
      ),
    ).toEqual(['讨好型人格', '边界感', '冲突回避'])
    expect(() => parseSemanticQueryTerms('bad json')).toThrow()
  })

  it('deduplicates card placements and prefers the active board', () => {
    const value = card(
      'card-boundary',
      '可移动的边界',
      '边界不是隔离，而是可协商的距离。',
      ['心理学/边界'],
    )
    const candidates = selectSemanticCandidates(
      [
        entry(value, 'board-other', '其他白板'),
        entry(value, 'board-main', '我的白板'),
      ],
      ['边界'],
      'board-main',
    )

    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.entry.boardId).toBe('board-main')
    expect(candidates[0]?.localScore).toBeGreaterThan(0)
  })

  it('validates semantic result IDs, scores and duplicates', () => {
    const parsed = parseSemanticSuggestions(
      JSON.stringify({
        results: [
          {
            cardId: 'card-a',
            score: 88,
            reason: '都在讨论边界与情绪劳动。',
          },
          {
            cardId: 'card-a',
            score: 90,
            reason: '重复结果。',
          },
          {
            cardId: 'unknown',
            score: 95,
            reason: '非法目标。',
          },
          {
            cardId: 'card-b',
            score: 40,
            reason: '分数过低。',
          },
          {
            cardId: 'card-c',
            score: 72,
            reason: '理由'.repeat(40),
          },
        ],
      }),
      ['card-a', 'card-b', 'card-c'],
    )

    expect(parsed).toHaveLength(2)
    expect(parsed.map((item) => item.cardId)).toEqual(['card-a', 'card-c'])
    expect(parsed[1]?.reason.length).toBeLessThanOrEqual(70)
    expect(parseSemanticSuggestions('{"results":[]}', ['card-a'])).toEqual([])
  })
})
