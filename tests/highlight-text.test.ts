import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import HighlightText from '../src/components/ui/HighlightText.vue'

describe('HighlightText', () => {
  it('marks every case-insensitive match while preserving the text', () => {
    const wrapper = mount(HighlightText, {
      props: { text: 'Hello world hello', query: 'hello' },
    })

    expect(wrapper.findAll('mark')).toHaveLength(2)
    expect(wrapper.element.textContent).toBe('Hello world hello')
  })

  it('treats regexp characters in the query literally', () => {
    const wrapper = mount(HighlightText, {
      props: { text: 'a.b axb a.b', query: 'a.b' },
    })

    expect(wrapper.findAll('mark')).toHaveLength(2)
  })

  it('renders plain text without a query', () => {
    const wrapper = mount(HighlightText, {
      props: { text: 'plain text', query: '   ' },
    })

    expect(wrapper.findAll('mark')).toHaveLength(0)
    expect(wrapper.element.textContent).toBe('plain text')
  })
})
