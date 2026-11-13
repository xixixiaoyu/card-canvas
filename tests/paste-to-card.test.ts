import { describe, expect, it } from 'vitest'
import {
  buildPastedCardDraft,
  normalizeClipboardText,
  plainTextFromClipboardHtml,
} from '../src/lib/paste-to-card'

describe('paste to card', () => {
  it('keeps every pasted block in the body without inventing a title', () => {
    expect(
      buildPastedCardDraft(
        '  粘贴的内容\r\n第二段内容\r\n\r\n#学习 #Product  ',
      ),
    ).toEqual({
      content: '粘贴的内容\n第二段内容\n\n#学习 #Product',
      tags: ['学习', 'Product'],
    })
  })

  it('keeps Markdown headings in the body', () => {
    expect(buildPastedCardDraft('## 长文摘录\n\n正文内容')).toEqual({
      content: '## 长文摘录\n\n正文内容',
      tags: [],
    })
  })

  it('keeps lists and long text in the body', () => {
    expect(
      buildPastedCardDraft('- [ ] 第一件事\n- [ ] 第二件事'),
    ).toMatchObject({
      content: '- [ ] 第一件事\n- [ ] 第二件事',
    })

    const longLine = '这是一段很长但仍然是正文的内容'.repeat(8)
    expect(buildPastedCardDraft(longLine)).toMatchObject({
      content: longLine,
    })
  })

  it('normalizes line endings and ignores empty clipboard text', () => {
    expect(normalizeClipboardText('第一行\r第二行\r\n第三行')).toBe(
      '第一行\n第二行\n第三行',
    )
    expect(buildPastedCardDraft(' \n ')).toBeNull()
  })

  it('converts basic clipboard HTML into safe readable text', () => {
    expect(
      plainTextFromClipboardHtml(`
        <style>body { color: red }</style>
        <h2>标题</h2>
        <p>第一段<strong>内容</strong></p>
        <p>第二段<br>换行</p>
        <ul><li>条目一</li><li>条目二</li></ul>
        <script>window.evil = true</script>
      `),
    ).toBe('标题\n第一段内容\n第二段\n换行\n- 条目一\n- 条目二')
  })
})
