export type InlineNodeType =
  'text' | 'strong' | 'emphasis' | 'code' | 'highlight'

export interface InlineNode {
  type: InlineNodeType
  value: string
  children?: InlineNode[]
}

export interface MarkdownParagraph {
  type: 'paragraph'
  lineIndex: number
  nodes: InlineNode[]
}

export interface MarkdownBlank {
  type: 'blank'
  lineIndex: number
}

export interface MarkdownListItem {
  type: 'bullet' | 'ordered' | 'task'
  lineIndex: number
  checked?: boolean
  number?: number
  nodes: InlineNode[]
  text: string
}

export interface MarkdownList {
  type: 'list'
  style: 'unordered' | 'ordered'
  items: MarkdownListItem[]
}

export type MarkdownBlock = MarkdownParagraph | MarkdownBlank | MarkdownList

export interface ActionTaskSource {
  cardId: string
  itemId: string
  title: string
  content: string
  x: number
  y: number
}

export interface ActionTask {
  id: string
  cardId: string
  itemId: string
  title: string
  lineIndex: number
  text: string
}

const TASK_LINE = /^(\s*-\s+\[)([ xX])(\]\s*)(.*)$/
const BULLET_LINE = /^(\s*)-\s+(.*)$/
const ORDERED_LINE = /^(\s*)(\d+)[.)]\s+(.*)$/
const INLINE_DELIMITERS = [
  { delimiter: '`', type: 'code' as const },
  { delimiter: '**', type: 'strong' as const },
  { delimiter: '==', type: 'highlight' as const },
  { delimiter: '*', type: 'emphasis' as const },
]

function mergeText(nodes: InlineNode[]) {
  const merged: InlineNode[] = []
  for (const node of nodes) {
    const previous = merged.at(-1)
    if (node.type === 'text' && previous?.type === 'text') {
      previous.value += node.value
    } else {
      merged.push(node)
    }
  }
  return merged
}

function appendListItem(
  blocks: MarkdownBlock[],
  style: MarkdownList['style'],
  item: MarkdownListItem,
) {
  const previous = blocks.at(-1)
  if (previous?.type === 'list' && previous.style === style) {
    previous.items.push(item)
  } else {
    blocks.push({ type: 'list', style, items: [item] })
  }
}

function nextDelimiter(source: string, from: number) {
  let match: { index: number; delimiter: string; type: InlineNodeType } | null =
    null

  for (const candidate of INLINE_DELIMITERS) {
    const index = source.indexOf(candidate.delimiter, from)
    if (index === -1) continue
    if (
      !match ||
      index < match.index ||
      (index === match.index &&
        candidate.delimiter.length > match.delimiter.length)
    ) {
      match = {
        index,
        delimiter: candidate.delimiter,
        type: candidate.type,
      }
    }
  }

  return match
}

/**
 * Parse only the deliberately small inline grammar supported by cards.
 * HTML never becomes DOM markup: it remains a text node, so no sanitizer or
 * v-html path is needed.
 */
export function parseInlineMarkdown(source: string, depth = 0): InlineNode[] {
  if (!source) return []

  const nodes: InlineNode[] = []
  let cursor = 0

  while (cursor < source.length) {
    const opening = nextDelimiter(source, cursor)
    if (!opening) {
      nodes.push({ type: 'text', value: source.slice(cursor) })
      break
    }

    if (opening.index > cursor) {
      nodes.push({
        type: 'text',
        value: source.slice(cursor, opening.index),
      })
    }

    const contentStart = opening.index + opening.delimiter.length
    const closingIndex = source.indexOf(opening.delimiter, contentStart)
    if (closingIndex <= contentStart) {
      nodes.push({ type: 'text', value: opening.delimiter })
      cursor = contentStart
      continue
    }

    const content = source.slice(contentStart, closingIndex)
    nodes.push({
      type: opening.type,
      value: content,
      children:
        opening.type === 'code' || depth >= 3
          ? undefined
          : parseInlineMarkdown(content, depth + 1),
    })
    cursor = closingIndex + opening.delimiter.length
  }

  return mergeText(nodes)
}

export function inlineNodesToText(nodes: InlineNode[]): string {
  return nodes
    .map((node) =>
      node.children?.length ? inlineNodesToText(node.children) : node.value,
    )
    .join('')
}

export function parseTaskLine(line: string) {
  const match = TASK_LINE.exec(line)
  if (!match) return null

  const nodes = parseInlineMarkdown(match[4])
  return {
    checked: match[2].toLowerCase() === 'x',
    nodes,
    text: inlineNodesToText(nodes).trim(),
  }
}

export function parseAtomicMarkdown(source: string): MarkdownBlock[] {
  const lines = source.split(/\r?\n/)
  const blocks: MarkdownBlock[] = []

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex]

    if (!line.trim()) {
      blocks.push({ type: 'blank', lineIndex })
      continue
    }

    const task = parseTaskLine(line)
    if (task) {
      const item: MarkdownListItem = {
        type: 'task',
        lineIndex,
        checked: task.checked,
        nodes: task.nodes,
        text: task.text,
      }
      appendListItem(blocks, 'unordered', item)
      continue
    }

    const bullet = BULLET_LINE.exec(line)
    if (bullet) {
      const nodes = parseInlineMarkdown(bullet[2])
      const item: MarkdownListItem = {
        type: 'bullet',
        lineIndex,
        nodes,
        text: inlineNodesToText(nodes).trim(),
      }
      appendListItem(blocks, 'unordered', item)
      continue
    }

    const ordered = ORDERED_LINE.exec(line)
    if (ordered) {
      const nodes = parseInlineMarkdown(ordered[3])
      const item: MarkdownListItem = {
        type: 'ordered',
        lineIndex,
        number: Number(ordered[2]),
        nodes,
        text: inlineNodesToText(nodes).trim(),
      }
      appendListItem(blocks, 'ordered', item)
      continue
    }

    // Headings intentionally fall through to paragraphs. HTML and table
    // syntax also remain literal text because only the inline grammar above
    // can produce styled nodes.
    blocks.push({
      type: 'paragraph',
      lineIndex,
      nodes: parseInlineMarkdown(line),
    })
  }

  return blocks
}

/**
 * Replace exactly one task marker without rebuilding or reflowing other lines.
 * Both LF and CRLF documents preserve their original newline convention.
 */
export function toggleTaskLine(content: string, lineIndex: number) {
  const newline = content.includes('\r\n') ? '\r\n' : '\n'
  const lines = content.split(/\r?\n/)
  const line = lines[lineIndex]
  if (typeof line !== 'string') return null

  const match = TASK_LINE.exec(line)
  if (!match) return null

  const checked = match[2].toLowerCase() !== 'x'
  lines[lineIndex] = `${match[1]}${checked ? 'x' : ' '}${match[3]}${match[4]}`

  return {
    checked,
    content: lines.join(newline),
  }
}

export function collectPendingTasks(sources: ActionTaskSource[]): ActionTask[] {
  const sourceById = new Map(sources.map((source) => [source.itemId, source]))

  return sources
    .flatMap((source) =>
      parseAtomicMarkdown(source.content).flatMap((block) => {
        if (block.type !== 'list') return []

        return block.items.flatMap((item) => {
          if (item.type !== 'task' || item.checked) return []

          return [
            {
              id: `${source.itemId}:${item.lineIndex}`,
              cardId: source.cardId,
              itemId: source.itemId,
              title: source.title.trim() || '未命名卡片',
              lineIndex: item.lineIndex,
              text: item.text || '未命名待办',
            },
          ]
        })
      }),
    )
    .sort((a, b) => {
      const sourceA = sourceById.get(a.itemId)!
      const sourceB = sourceById.get(b.itemId)!
      return (
        sourceA.y - sourceB.y ||
        sourceA.x - sourceB.x ||
        a.lineIndex - b.lineIndex
      )
    })
}
