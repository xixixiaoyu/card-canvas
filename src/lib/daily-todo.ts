import type { Card } from '../types'

export const DAILY_TODO_TAG = '待办/今日'
export const DAILY_TODO_CONTENT = '- [ ] '

function pad(value: number) {
  return String(value).padStart(2, '0')
}

export function formatDailyTodoTitle(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

export function isDailyTodoCard(card: Card, title = formatDailyTodoTitle()) {
  return (
    !card.isDeleted &&
    card.title === title &&
    card.tags.some(
      (tag) =>
        tag.trim().toLocaleLowerCase() === DAILY_TODO_TAG.toLocaleLowerCase(),
    )
  )
}

export interface DailyTodoDeferral {
  label: '移至今天' | '移至明天'
  targetTitle: string
}

export function dailyTodoDeferral(
  card: Card,
  today = new Date(),
): DailyTodoDeferral | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(card.title)) return null
  if (!isDailyTodoCard(card, card.title)) return null

  const todayTitle = formatDailyTodoTitle(today)
  if (card.title < todayTitle) {
    return { label: '移至今天', targetTitle: todayTitle }
  }
  if (card.title === todayTitle) {
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    return {
      label: '移至明天',
      targetTitle: formatDailyTodoTitle(tomorrow),
    }
  }
  return null
}

export function trimTrailingEmptyDailyTask(content: string) {
  return content
    .trim()
    .replace(/(?:\r?\n)?\s*-\s+\[\s*\]\s*$/u, '')
    .trimEnd()
}
