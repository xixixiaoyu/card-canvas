import { describe, expect, it } from 'vitest'
import {
  buildTagPrompt,
  buildWormholePrompt,
  parseTagSuggestions,
  parseWormholeLabel,
} from '../src/lib/ai/prompts'
import type { Card } from '../src/types'

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
  it('builds a bounded comparison prompt with both card contents', () => {
    const prompt = buildWormholePrompt(cardA, cardB)
    expect(prompt).toContain('气泡音')
    expect(prompt).toContain('低喉位支撑')
    expect(prompt).toContain('迷走神经')
    expect(prompt).toContain('不超过 35 个汉字')
  })

  it('keeps tag prompts inside the existing hierarchy', () => {
    const prompt = buildTagPrompt('概念', '正文', [
      '心理学/防御机制',
      '心理学/防御机制',
    ])
    expect(prompt).toContain('当前标签体系：心理学/防御机制\n')
  })

  it('cleans and limits labels and tag suggestions', () => {
    expect(parseWormholeLabel('“关系：低喉位稳定会反向调节迷走张力”')).toBe(
      '低喉位稳定会反向调节迷走张力',
    )
    expect(parseWormholeLabel('一'.repeat(80))).toHaveLength(35)
    expect(
      parseTagSuggestions('心理学/防御机制, #声乐/共鸣 普通标签 第三个/层级'),
    ).toEqual(['心理学/防御机制', '声乐/共鸣'])
    expect(parseTagSuggestions(`心理学/${'机制'.repeat(40)}`)[0]).toHaveLength(
      64,
    )
  })
})
