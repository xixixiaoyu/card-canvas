import { describe, expect, it } from 'vitest'
import {
  buildShareFilename,
  formatShareDate,
  normalizeShareContent,
  SHARE_RATIOS,
  SHARE_THEMES,
} from '../src/lib/share/presets'

describe('share card presets', () => {
  it('offers all ratios at export resolution and six distinct themes', () => {
    expect(SHARE_RATIOS.map((ratio) => ratio.label)).toEqual([
      '1:1',
      '3:4',
      '16:9',
    ])
    expect(SHARE_RATIOS.map((ratio) => ratio.width)).toEqual([1080, 1080, 1280])
    expect(new Set(SHARE_THEMES.map((theme) => theme.id)).size).toBe(6)
    expect(SHARE_THEMES.every((theme) => theme.swatches.length === 3)).toBe(
      true,
    )
  })

  it('turns atomic Markdown into clean share text without headings or markers', () => {
    expect(
      normalizeShareContent(
        '# 标题\n**重要** 与 `api()`\n- [ ] 待办\n- [x] 完成\n==高亮==',
      ),
    ).toBe('标题\n重要 与 api()\n☐ 待办\n☑ 完成\n高亮')
  })

  it('builds a filesystem-safe deterministic filename', () => {
    expect(
      buildShareFilename('声音 / 防御: "回声"', 'midnight', 'portrait'),
    ).toBe('card-canvas_声音-防御-回声_midnight_portrait.png')
    expect(buildShareFilename('***', 'dawn', 'square')).toBe(
      'card-canvas_untitled_dawn_square.png',
    )
  })

  it('formats locale-aware dates for the artwork', () => {
    expect(formatShareDate(new Date(2026, 10, 11).getTime())).toContain('2026')
  })
})
