import { describe, expect, it } from 'vitest'
import {
  attachmentMarkdown,
  collectPendingTasks,
  inlineNodesToText,
  parseAtomicMarkdown,
  parseInlineMarkdown,
  referencedAttachmentIds,
  removeAttachmentReference,
  toggleTaskLine,
} from '../src/lib/atomic-markdown'

describe('atomic Markdown', () => {
  it('parses only the supported inline styles', () => {
    const nodes = parseInlineMarkdown(
      '**重要** *斜体* `api()` ==高亮== <script>alert(1)</script>',
    )

    expect(nodes.map((node) => node.type)).toEqual([
      'strong',
      'text',
      'emphasis',
      'text',
      'code',
      'text',
      'highlight',
      'text',
    ])
    expect(inlineNodesToText(nodes)).toContain('<script>alert(1)</script>')
  })

  it('keeps headings, HTML and tables as plain paragraph text', () => {
    const blocks = parseAtomicMarkdown(
      '# 标题\n<table><tr><td>x</td></tr></table>\n| a | b |',
    )

    expect(blocks.every((block) => block.type === 'paragraph')).toBe(true)
  })

  it('groups list items and extracts task line indexes', () => {
    const blocks = parseAtomicMarkdown('- 普通项\n- [ ] 第一项\n- [x] 第二项')

    expect(blocks).toHaveLength(1)
    expect(blocks[0]).toMatchObject({
      type: 'list',
      style: 'unordered',
      items: [
        { type: 'bullet', lineIndex: 0 },
        { type: 'task', lineIndex: 1, checked: false, text: '第一项' },
        { type: 'task', lineIndex: 2, checked: true, text: '第二项' },
      ],
    })
  })

  it('parses ordered lists separately from unordered lists', () => {
    const blocks = parseAtomicMarkdown('1. 第一步\n2. 第二步\n- 补充')

    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toMatchObject({
      type: 'list',
      style: 'ordered',
      items: [
        { type: 'ordered', number: 1, text: '第一步' },
        { type: 'ordered', number: 2, text: '第二步' },
      ],
    })
    expect(blocks[1]).toMatchObject({
      type: 'list',
      style: 'unordered',
    })
  })

  it('parses attachment images without accepting arbitrary image URLs', () => {
    const attachmentId = 'attachment-image'
    const token = attachmentMarkdown(attachmentId, '参考图')
    const blocks = parseAtomicMarkdown(
      `${token}\n![remote](https://example.com/a.png)`,
    )

    expect(blocks[0]).toEqual({
      type: 'image',
      lineIndex: 0,
      attachmentId,
      alt: '参考图',
    })
    expect(blocks[1]?.type).toBe('paragraph')
    expect(referencedAttachmentIds(`${token}\n正文`)).toEqual(
      new Set([attachmentId]),
    )
    expect(
      removeAttachmentReference(`前文\n${token}\n后文`, attachmentId),
    ).toBe('前文\n后文')
  })

  it('toggles only the selected task line and preserves CRLF', () => {
    const source = '正文\r\n- [ ] 第一项\r\n- [x] 第二项'
    const toggled = toggleTaskLine(source, 1)

    expect(toggled).toEqual({
      checked: true,
      content: '正文\r\n- [x] 第一项\r\n- [x] 第二项',
    })
    expect(toggleTaskLine(source, 0)).toBeNull()
  })

  it('collects only pending tasks in board reading order', () => {
    const tasks = collectPendingTasks([
      {
        cardId: 'card-b',
        itemId: 'item-b',
        title: '第二张',
        content: '- [ ] 后续任务',
        x: 100,
        y: 200,
      },
      {
        cardId: 'card-a',
        itemId: 'item-a',
        title: '第一张',
        content: '- [ ] **优先任务**\n- [x] 已完成',
        x: 20,
        y: 20,
      },
    ])

    expect(tasks.map((task) => task.text)).toEqual(['优先任务', '后续任务'])
    expect(tasks[0]).toMatchObject({
      cardId: 'card-a',
      itemId: 'item-a',
      lineIndex: 0,
      title: '第一张',
    })
  })
})
