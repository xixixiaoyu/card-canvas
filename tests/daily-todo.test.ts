import { describe, expect, it } from 'vitest'
import {
  DAILY_TODO_TAG,
  formatDailyTodoTitle,
  isDailyTodoCard,
  trimTrailingEmptyDailyTask,
} from '../src/lib/daily-todo'
import type { Card } from '../src/types'

function card(overrides: Partial<Card> = {}): Card {
  return {
    id: 'card-daily',
    title: '2026-11-12',
    content: '- [ ] 发布版本',
    tags: [DAILY_TODO_TAG],
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

  it('recognises only the current day card with the daily tag', () => {
    expect(isDailyTodoCard(card(), '2026-11-12')).toBe(true)
    expect(isDailyTodoCard(card({ title: '2026-11-11' }), '2026-11-12')).toBe(
      false,
    )
    expect(isDailyTodoCard(card({ tags: [] }), '2026-11-12')).toBe(false)
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
})
