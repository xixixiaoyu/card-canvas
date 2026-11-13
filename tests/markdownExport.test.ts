import { describe, expect, it } from 'vitest'
import {
  buildMarkdown,
  sortEntriesForReading,
  type MarkdownEntry,
} from '../src/lib/markdownExport'
import type { Card, Connection } from '../src/types'

function card(
  id: string,
  title: string,
  content = '',
  tags: string[] = [],
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

function entry(cardValue: Card, x: number, y: number): MarkdownEntry {
  return { card: cardValue, item: { x, y } }
}

const defence = card('defence', '防御的回路', '防御是声音的短暂代偿。', [
  '心理学/防御机制',
])
const boundary = card('boundary', '边界不是墙', '关系靠可协商的距离。', [
  '心理学/边界',
])
const voice = card('voice', '声音的支点', '气息与共鸣。', ['声乐/咽音'])

defence.highlights = [
  { order: '01', label: '识别', text: '先分清我的感受' },
  { order: '02', label: '表达', text: '用请求代替指责' },
]

const link: Connection = {
  id: 'link-1',
  boardId: 'board-main',
  fromCardId: 'defence',
  toCardId: 'boundary',
  label: '共享防御机制',
}

describe('markdown synthesis', () => {
  it('sorts rows from top to bottom and left to right', () => {
    const ordered = sortEntriesForReading([
      entry(voice, 600, 400),
      entry(boundary, 500, 120),
      entry(defence, 100, 110),
      entry(card('late', 'Late', '', []), 100, 520),
    ])

    expect(ordered.map((item) => item.card.id)).toEqual([
      'defence',
      'boundary',
      'voice',
      'late',
    ])
  })

  it('serializes title, tags, body, highlights and selected links', () => {
    const markdown = buildMarkdown(
      [entry(defence, 100, 100), entry(boundary, 600, 100)],
      [
        link,
        {
          id: 'external',
          boardId: 'board-main',
          fromCardId: 'defence',
          toCardId: 'voice',
        },
      ],
    )

    expect(markdown).toContain('### 防御的回路')
    expect(markdown).toContain('#心理学/防御机制')
    expect(markdown).toContain('防御是声音的短暂代偿。')
    expect(markdown).toContain('- 01 **识别**：先分清我的感受')
    expect(markdown).toContain('> ↳ 关联 [边界不是墙]：共享防御机制')
    expect(markdown).not.toContain('声音的支点')
    expect(markdown).not.toContain('external')
  })

  it('keeps reading order stable across separators', () => {
    const markdown = buildMarkdown(
      [entry(voice, 100, 500), entry(defence, 100, 100)],
      [],
    )

    expect(markdown.indexOf('### 防御的回路')).toBeLessThan(
      markdown.indexOf('### 声音的支点'),
    )
    expect(markdown).toContain('\n\n---\n\n')
  })

  it('keeps titleless pasted content in the body without inventing a heading', () => {
    const markdown = buildMarkdown(
      [entry(card('pasted', '', '# 原文标题\n\n完整正文'), 100, 100)],
      [],
    )

    expect(markdown).toBe('# 原文标题\n\n完整正文')
  })

  it('returns an empty string for an empty selection', () => {
    expect(buildMarkdown([], [])).toBe('')
  })
})
