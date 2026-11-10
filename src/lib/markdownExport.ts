import type { Card, Connection } from '../types'

export interface MarkdownEntry {
  card: Card
  item: { x: number; y: number }
}

const ROW_TOLERANCE = 80

/**
 * Human reading order: top-to-bottom rows, then left-to-right inside a row.
 * The tolerance keeps cards that are visually on the same line from being
 * separated by a few pixels of vertical jitter.
 */
export function sortEntriesForReading(entries: MarkdownEntry[]) {
  const byY = [...entries].sort(
    (a, b) => a.item.y - b.item.y || a.item.x - b.item.x,
  )
  const rows: MarkdownEntry[][] = []

  for (const entry of byY) {
    const row = rows.at(-1)
    if (!row || Math.abs(entry.item.y - row[0].item.y) > ROW_TOLERANCE) {
      rows.push([entry])
    } else {
      row.push(entry)
    }
  }

  return rows.flatMap((row) => [...row].sort((a, b) => a.item.x - b.item.x))
}

function tagsLine(card: Card) {
  return card.tags.map((tag) => `#${tag}`).join(' ')
}

function cardBlock(
  entry: MarkdownEntry,
  selectedIds: Set<string>,
  connections: Connection[],
  readingIndex: Map<string, number>,
  titles: Map<string, string>,
) {
  const { card } = entry
  const sections: string[] = [`### ${card.title.trim() || '未命名卡片'}`]

  if (card.tags.length) sections.push(tagsLine(card))
  if (card.content.trim()) sections.push(card.content.trim())

  if (card.highlights?.length) {
    sections.push(
      card.highlights
        .map(
          (highlight) =>
            `- ${highlight.order} **${highlight.label}**：${highlight.text}`,
        )
        .join('\n'),
    )
  }

  const relations = connections
    .filter(
      (connection) =>
        connection.fromCardId === card.id &&
        selectedIds.has(connection.toCardId),
    )
    .sort(
      (a, b) =>
        (readingIndex.get(a.toCardId) ?? 0) -
        (readingIndex.get(b.toCardId) ?? 0),
    )
    .map((connection) => {
      const targetTitle = titles.get(connection.toCardId) ?? '关联卡片'
      return connection.label
        ? `> ↳ 关联 [${targetTitle}]：${connection.label}`
        : `> ↳ 关联 [${targetTitle}]`
    })

  if (relations.length) sections.push(relations.join('\n'))

  return sections.join('\n\n')
}

export function buildMarkdown(
  entries: MarkdownEntry[],
  connections: Connection[],
) {
  if (!entries.length) return ''

  const ordered = sortEntriesForReading(entries)
  const selectedIds = new Set(ordered.map((entry) => entry.card.id))
  const readingIndex = new Map(
    ordered.map((entry, index) => [entry.card.id, index]),
  )
  const titles = new Map(
    ordered.map((entry) => [
      entry.card.id,
      entry.card.title.trim() || '未命名卡片',
    ]),
  )

  const selectedConnections = connections.filter(
    (connection) =>
      selectedIds.has(connection.fromCardId) &&
      selectedIds.has(connection.toCardId),
  )

  return ordered
    .map((entry) =>
      cardBlock(entry, selectedIds, selectedConnections, readingIndex, titles),
    )
    .join('\n\n---\n\n')
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the legacy path below.
  }

  let textarea: HTMLTextAreaElement | null = null

  try {
    textarea = document.createElement('textarea')
    textarea.value = text
    textarea.setAttribute('readonly', 'true')
    textarea.style.position = 'fixed'
    textarea.style.left = '-9999px'
    textarea.style.top = '-9999px'
    textarea.style.opacity = '0'
    textarea.style.pointerEvents = 'none'
    document.body.appendChild(textarea)
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    textarea?.remove()
  }
}
