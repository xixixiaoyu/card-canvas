import { describe, expect, it } from 'vitest'
import { rankRadarCandidates } from '../src/lib/ai/connection-radar'
import type { BoardItem, Card, Connection } from '../src/types'

function card(
  id: string,
  title: string,
  tags: string[],
  overrides: Partial<Card> = {},
): Card {
  return {
    id,
    title,
    content: '',
    tags,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function item(id: string, cardId: string): BoardItem {
  return {
    id,
    cardId,
    boardId: 'board-main',
    x: 0,
    y: 0,
  }
}

function connection(id: string, fromCardId: string, toCardId: string) {
  return {
    id,
    boardId: 'board-main',
    fromCardId,
    toCardId,
  } satisfies Connection
}

describe('connection radar local candidate ranking', () => {
  it('prioritises hierarchical tags and removes existing connections', () => {
    const source = card('source', '喉位稳定与迷走神经', ['声乐/生理/喉位'])
    const exactTag = card('exact', '低喉位支撑', ['声乐/生理/喉位'])
    const leafTag = card('leaf', '躯体化与发声', ['心理学/身体/喉位'])
    const alreadyConnected = card('existing', '既有连接', ['声乐/生理/喉位'])
    const entries = [source, exactTag, leafTag, alreadyConnected].map(
      (entry) => ({
        card: entry,
        item: item(`item-${entry.id}`, entry.id),
      }),
    )

    const result = rankRadarCandidates(source, entries, [
      connection('existing-connection', 'source', 'existing'),
    ])

    expect(result.map((entry) => entry.card.id)).toEqual(['exact', 'leaf'])
    expect(result[0]?.score).toBeGreaterThan(result[1]?.score ?? 0)
    expect(result[0]?.signals[0]).toContain('共享标签')
    expect(result[1]?.signals[0]).toContain('末级')
  })

  it('uses two-hop topology and Chinese title overlap as exploration signals', () => {
    const source = card('source', '呼吸节律与迷走神经', ['声乐/基础'])
    const bridge = card('bridge', '共同邻居', ['桥梁'])
    const triangle = card('triangle', '膈肌呼吸练习', ['练习/呼吸'])
    const lexical = card('lexical', '呼吸节律与迷走神经恢复', ['神经科学'])
    const entries = [bridge, triangle, lexical].map((entry) => ({
      card: entry,
      item: item(`item-${entry.id}`, entry.id),
    }))
    const connections = [
      connection('a', 'source', 'bridge'),
      connection('b', 'triangle', 'bridge'),
    ]

    const result = rankRadarCandidates(source, entries, connections)
    const triangleResult = result.find((entry) => entry.card.id === 'triangle')
    const lexicalResult = result.find((entry) => entry.card.id === 'lexical')

    expect(triangleResult?.signals).toContain('共享 1 个相邻卡片')
    expect(lexicalResult?.signals.join(' ')).toContain('标题共同出现')
    expect(result.map((entry) => entry.card.id)).not.toContain('bridge')
  })

  it('excludes deleted cards, duplicate projections and respects the limit', () => {
    const source = card('source', '主题', ['项目/共同'])
    const deleted = card('deleted', '已删除', ['项目/共同'], {
      isDeleted: true,
    })
    const candidates = Array.from({ length: 8 }, (_, index) =>
      card(`candidate-${index}`, `候选 ${index}`, ['项目/共同']),
    )
    const entries = [deleted, ...candidates, candidates[0]!].map(
      (entry, index) => ({
        card: entry,
        item: item(`item-${index}`, entry.id),
      }),
    )

    const result = rankRadarCandidates(source, entries, [], 3)

    expect(result).toHaveLength(3)
    expect(new Set(result.map((entry) => entry.card.id)).size).toBe(3)
    expect(result.map((entry) => entry.card.id)).not.toContain('deleted')
  })
})
