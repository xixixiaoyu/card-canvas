import type { Card } from '../types'
import { inlineNodesToText, parseAtomicMarkdown } from './atomic-markdown'

export const UNTITLED_CARD_LABEL = '未命名卡片'

function truncateLabel(value: string, maxLength: number) {
  const characters = Array.from(value)
  if (characters.length <= maxLength) return value
  return `${characters.slice(0, maxLength).join('')}…`
}

/**
 * Cards may intentionally have no title. Display-only surfaces still need a
 * stable label, so derive one from the first readable content block without
 * mutating or duplicating the card body.
 */
export function cardDisplayTitle(
  card: Pick<Card, 'title' | 'content'>,
  maxLength = 52,
) {
  const explicit = card.title.trim()
  if (explicit) return explicit

  for (const block of parseAtomicMarkdown(card.content)) {
    const text =
      block.type === 'paragraph'
        ? inlineNodesToText(block.nodes)
        : block.type === 'list'
          ? block.items[0]?.text
          : block.type === 'image'
            ? block.alt || '图片'
            : ''
    const compact = text
      ?.replace(/\s+/g, ' ')
      .trim()
      .replace(/^#{1,6}\s+/u, '')
      .replace(/^>\s*/u, '')
    if (compact) return truncateLabel(compact, maxLength)
  }

  return UNTITLED_CARD_LABEL
}
