import { describe, expect, it } from 'vitest'
import { continueMarkdownList } from '../src/lib/list-continuation'

describe('Markdown list continuation', () => {
  it('continues unordered lists and preserves indentation', () => {
    const content = '  - 第一条'
    expect(continueMarkdownList(content, content.length)).toEqual({
      content: '  - 第一条\n  - ',
      cursor: 12,
    })
  })

  it('increments ordered list numbers and preserves the delimiter', () => {
    const content = '9) 第九条'
    expect(continueMarkdownList(content, content.length)).toEqual({
      content: '9) 第九条\n10) ',
      cursor: 11,
    })
  })

  it('continues task lists with an unchecked item', () => {
    const content = '- [x] 已完成'
    expect(continueMarkdownList(content, content.length)).toEqual({
      content: '- [x] 已完成\n- [ ] ',
      cursor: 16,
    })
  })

  it('exits the list when Enter is pressed on an empty item', () => {
    const content = '前文\n- [ ] \n后文'
    const cursor = content.indexOf('\n后文')
    expect(continueMarkdownList(content, cursor)).toEqual({
      content: '前文\n\n后文',
      cursor: 3,
    })
  })

  it('leaves ordinary paragraphs untouched', () => {
    expect(continueMarkdownList('普通段落', 4)).toBeNull()
    expect(continueMarkdownList('- 内容', -1)).toBeNull()
  })
})
