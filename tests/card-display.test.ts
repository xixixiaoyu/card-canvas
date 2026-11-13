import { describe, expect, it } from 'vitest'
import { cardDisplayTitle } from '../src/lib/card-display'

describe('card display title', () => {
  it('prefers an explicit card title', () => {
    expect(
      cardDisplayTitle({ title: '  明确标题  ', content: '正文内容' }),
    ).toBe('明确标题')
  })

  it('derives a temporary label from titleless content', () => {
    expect(
      cardDisplayTitle({
        title: '',
        content: '第一段正文\n\n第二段正文',
      }),
    ).toBe('第一段正文')

    expect(
      cardDisplayTitle({
        title: '',
        content: '- [ ] 整理粘贴内容\n- [ ] 继续写作',
      }),
    ).toBe('整理粘贴内容')

    expect(
      cardDisplayTitle({
        title: '',
        content: '# 只用于展示的原文标题\n正文内容',
      }),
    ).toBe('只用于展示的原文标题')
  })

  it('truncates long labels and falls back for empty cards', () => {
    expect(
      cardDisplayTitle(
        { title: '', content: '这是一段很长的正文内容，用来生成临时展示名称' },
        8,
      ),
    ).toBe('这是一段很长的正…')
    expect(cardDisplayTitle({ title: '', content: '' })).toBe('未命名卡片')
  })
})
