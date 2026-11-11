import { describe, expect, it } from 'vitest'
import {
  buildConnectionRadarPrompt,
  buildTagPrompt,
  buildTitlePrompt,
  parseConnectionLabel,
  parseGeneratedTitle,
  parseRadarSuggestions,
  parseTagSuggestions,
} from '../src/lib/ai/prompts'
import type { Card } from '../src/types'
import type { RankedRadarCandidate } from '../src/lib/ai/connection-radar'

const cardA: Card = {
  id: 'card-a',
  title: '气泡音',
  content: '低喉位支撑',
  tags: ['声乐/基础'],
  createdAt: 1,
  updatedAt: 1,
}

const cardB: Card = {
  id: 'card-b',
  title: '迷走神经',
  content: '副交感的恢复机制',
  tags: ['神经科学/自主神经'],
  createdAt: 1,
  updatedAt: 1,
}

describe('AI prompts and model output cleaning', () => {
  it('keeps tag prompts inside the existing hierarchy', () => {
    const prompt = buildTagPrompt('概念', '正文', [
      '心理学/防御机制',
      '心理学/防御机制',
    ])
    expect(prompt).toContain('当前标签体系：心理学/防御机制\n')
  })

  it('builds a title prompt and cleans generated card titles', () => {
    const prompt = buildTitlePrompt('真正的和解不是表演强大。'.repeat(100))
    expect(prompt).toContain('概括正文的核心命题')
    expect(prompt.length).toBeLessThan(1500)
    expect(parseGeneratedTitle('标题：**允许脆弱成为和解的入口。**')).toBe(
      '允许脆弱成为和解的入口',
    )
    expect(parseGeneratedTitle('“不要懂事与重新被看见”')).toBe(
      '不要懂事与重新被看见',
    )
    expect(parseGeneratedTitle('一'.repeat(50))).toHaveLength(28)
  })

  it('cleans and limits labels and tag suggestions', () => {
    expect(parseConnectionLabel('“关系：低喉位稳定会反向调节迷走张力”')).toBe(
      '低喉位稳定会反向调节迷走张力',
    )
    expect(parseConnectionLabel('一'.repeat(80))).toHaveLength(35)
    expect(
      parseTagSuggestions('心理学/防御机制, #声乐/共鸣 普通标签 第三个/层级'),
    ).toEqual(['心理学/防御机制', '声乐/共鸣'])
    expect(parseTagSuggestions(`心理学/${'机制'.repeat(40)}`)[0]).toHaveLength(
      64,
    )
  })

  it('builds a bounded multi-candidate radar prompt', () => {
    const candidate = {
      card: cardB,
      item: {
        id: 'item-b',
        cardId: cardB.id,
        boardId: 'board-main',
        x: 0,
        y: 0,
      },
      score: 42,
      signals: ['共享标签末级 机制'],
    } satisfies RankedRadarCandidate
    const prompt = buildConnectionRadarPrompt(cardA, [candidate])

    expect(prompt).toContain('"id":"card-a"')
    expect(prompt).toContain('"id":"card-b"')
    expect(prompt).toContain('"localSignals":["共享标签末级 机制"]')
    expect(prompt).toContain('必须返回空数组')
  })

  it('validates radar JSON, target IDs, duplicate IDs and strength', () => {
    const parsed = parseRadarSuggestions(
      JSON.stringify({
        suggestions: [
          {
            targetId: 'card-b',
            label: '「关系：共同调节恢复节律」',
            reason: '两者都通过自主神经调节恢复稳定。',
            strength: 84,
          },
          {
            targetId: 'card-b',
            label: '重复候选',
            reason: '不应重复采纳。',
            strength: 90,
          },
          {
            targetId: 'unknown',
            label: '非法目标',
            reason: '不在候选集中。',
            strength: 95,
          },
          {
            targetId: 'card-a',
            label: '低置信关系',
            reason: '证据不足。',
            strength: 69,
          },
          {
            targetId: 'card-a',
            label: '一'.repeat(60),
            reason: '机制'.repeat(60),
            strength: 78,
          },
        ],
      }),
      ['card-a', 'card-b'],
    )

    expect(parsed).toHaveLength(2)
    expect(parsed[0]).toMatchObject({
      targetId: 'card-b',
      label: '共同调节恢复节律',
      strength: 84,
    })
    expect(parsed[1]?.label).toHaveLength(35)
    expect(parsed[1]?.reason.length).toBeLessThanOrEqual(80)
  })

  it('allows an empty radar result and rejects malformed JSON', () => {
    expect(parseRadarSuggestions('{"suggestions":[]}', ['card-b'])).toEqual([])
    expect(() => parseRadarSuggestions('not-json', ['card-b'])).toThrow()
  })
})
