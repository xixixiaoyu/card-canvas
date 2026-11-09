import { describe, expect, it } from 'vitest'
import {
  mergeTags,
  normalizeTag,
  normalizeTags,
  parseHashtags,
  sameTag,
  splitTagInput,
} from '../src/lib/tags'

describe('tags', () => {
  it('strips hashes and separators from a single tag', () => {
    expect(normalizeTag('  ##声乐 / 练习 ')).toBe('声乐/练习')
    expect(normalizeTag('   ')).toBe('')
  })

  it('dedupes case-insensitively while keeping the first casing', () => {
    expect(normalizeTags(['Design', 'design', '  #DESIGN ', '研究'])).toEqual([
      'Design',
      '研究',
    ])
  })

  it('compares tags case-insensitively', () => {
    expect(sameTag('Design', ' design ')).toBe(true)
    expect(sameTag('设计', 'Design')).toBe(false)
  })

  it('splits free-form input on spaces and commas', () => {
    expect(splitTagInput('设计, 研究  #声乐')).toEqual(['设计', '研究', '声乐'])
  })

  it('extracts hashtags from Chinese and English text', () => {
    expect(
      parseHashtags('第一行 #声乐/练习，第二行 #design #DESIGN #研究'),
    ).toEqual(['声乐/练习', 'design', '研究'])
  })

  it('merges several sources without duplicates', () => {
    expect(mergeTags(['A', 'b'], ['#a', 'C '], ['c'])).toEqual(['A', 'b', 'C'])
  })
})
