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

export function trimTrailingEmptyDailyTask(content: string) {
  return content
    .trim()
    .replace(/(?:\r?\n)?\s*-\s+\[\s*\]\s*$/u, '')
    .trimEnd()
}
