export interface ListContinuationResult {
  content: string
  cursor: number
}

interface ListMatch {
  body: string
  continuation: string
}

function matchListLine(line: string): ListMatch | null {
  const task = /^(\s*)([-*+])\s+\[[ xX]\]\s*(.*)$/u.exec(line)
  if (task) {
    return {
      body: task[3] ?? '',
      continuation: `${task[1] ?? ''}${task[2] ?? '-'} [ ] `,
    }
  }

  const unordered = /^(\s*)([-*+])\s+(.*)$/u.exec(line)
  if (unordered) {
    return {
      body: unordered[3] ?? '',
      continuation: `${unordered[1] ?? ''}${unordered[2] ?? '-'} `,
    }
  }

  const ordered = /^(\s*)(\d+)([.)])\s+(.*)$/u.exec(line)
  if (ordered) {
    return {
      body: ordered[4] ?? '',
      continuation: `${ordered[1] ?? ''}${Number(ordered[2]) + 1}${ordered[3] ?? '.'} `,
    }
  }

  return null
}

/**
 * Continue a Markdown list at a collapsed textarea cursor. Empty list items
 * exit the list by removing their marker instead of creating another row.
 */
export function continueMarkdownList(
  content: string,
  cursor: number,
): ListContinuationResult | null {
  if (!Number.isInteger(cursor) || cursor < 0 || cursor > content.length) {
    return null
  }

  const lineStart = content.lastIndexOf('\n', cursor - 1) + 1
  const nextBreak = content.indexOf('\n', cursor)
  const lineEnd = nextBreak === -1 ? content.length : nextBreak
  const line = content.slice(lineStart, lineEnd)
  const match = matchListLine(line)
  if (!match) return null

  if (!match.body.trim()) {
    return {
      content: content.slice(0, lineStart) + content.slice(lineEnd),
      cursor: lineStart,
    }
  }

  const insertion = `\n${match.continuation}`
  return {
    content: content.slice(0, cursor) + insertion + content.slice(cursor),
    cursor: cursor + insertion.length,
  }
}
