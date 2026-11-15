import { describe, expect, it } from 'vitest'
import {
  DAILY_TODO_TAG,
  dailyTodoDeferral,
  formatDailyTodoTitle,
  isDailyTodoCard,
  isEmptyDailyTodoCard,
  trimTrailingEmptyDailyTask,
} from '../src/lib/daily-todo'
import type { Card } from '../src/types'

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-daily',
    title: '2026-11-12',
    content: '- [ ] 发布版本',
    tags: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

describe('daily todo cards', () => {
  it('formats a stable local calendar date', () => {
    expect(formatDailyTodoTitle(new Date(2026, 10, 12, 23, 30))).toBe(
      '2026-11-12',
    )
  })

  it('recognises dated task cards with or without the legacy daily tag', () => {
    expect(isDailyTodoCard(card(), '2026-11-12')).toBe(true)
    expect(
      isDailyTodoCard(card({ tags: [DAILY_TODO_TAG] }), '2026-11-12'),
    ).toBe(true)
    expect(isDailyTodoCard(card({ title: '2026-11-11' }), '2026-11-12')).toBe(
      false,
    )
    expect(
      isDailyTodoCard(card({ content: '只有普通正文' }), '2026-11-12'),
    ).toBe(false)
    expect(isDailyTodoCard(card({ title: '周记' }), '周记')).toBe(false)
    expect(isDailyTodoCard(card({ isDeleted: true }), '2026-11-12')).toBe(false)
  })

  it('removes only the trailing blank checklist row', () => {
    expect(trimTrailingEmptyDailyTask('- [ ] 发布版本\n- [ ] ')).toBe(
      '- [ ] 发布版本',
    )
    expect(trimTrailingEmptyDailyTask('- [ ] ')).toBe('')
    expect(trimTrailingEmptyDailyTask('- [ ] A\n- [x] B')).toBe(
      '- [ ] A\n- [x] B',
    )
  })

  it('recognises only a clean, system-shaped empty daily card', () => {
    expect(isEmptyDailyTodoCard(card({ content: '   ' }))).toBe(true)
    expect(
      isEmptyDailyTodoCard(card({ content: '', tags: [DAILY_TODO_TAG] })),
    ).toBe(true)
    expect(isEmptyDailyTodoCard(card({ content: '手动备注' }))).toBe(false)
    expect(
      isEmptyDailyTodoCard(card({ tags: [DAILY_TODO_TAG, '额外标签'] })),
    ).toBe(false)
    expect(
      isEmptyDailyTodoCard(
        card({
          content: '',
          highlights: [{ order: '01', label: '重点', text: '内容' }],
        }),
      ),
    ).toBe(false)
    expect(isEmptyDailyTodoCard(card({ title: '周记', content: '' }))).toBe(
      false,
    )
    expect(isEmptyDailyTodoCard(card({ content: '', isDeleted: true }))).toBe(
      false,
    )
  })

  it('offers today or tomorrow as the next daily card', () => {
    const today = new Date(2026, 10, 13, 10, 0)
    expect(dailyTodoDeferral(card(), today)).toEqual({
      label: '移至今天',
      targetTitle: '2026-11-13',
    })
    expect(dailyTodoDeferral(card({ title: '2026-11-13' }), today)).toEqual({
      label: '移至明天',
      targetTitle: '2026-11-14',
    })
    expect(dailyTodoDeferral(card({ title: '2026-11-14' }), today)).toBeNull()
    expect(dailyTodoDeferral(card({ title: '周记' }), today)).toBeNull()
    expect(dailyTodoDeferral(card({ content: '普通正文' }), today)).toBeNull()
  })
})
