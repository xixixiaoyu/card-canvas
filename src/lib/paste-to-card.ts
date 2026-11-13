import { parseHashtags } from './tags'

export const MAX_PASTED_TEXT_LENGTH = 50_000

const MAX_TITLE_LENGTH = 72
const MARKDOWN_HEADING = /^#{1,6}\s+(.+?)(?:\s+#+)?\s*$/u
const NON_TITLE_FIRST_LINE = /^(?:[-*+]\s+|\d+[.)]\s+|!\[|```|>\s*|\|)/u
const REMOVED_HTML_TAGS = 'script,style,noscript,template,iframe,object,embed'
const BLOCK_HTML_TAGS =
  'p,div,section,article,header,footer,h1,h2,h3,h4,h5,h6,blockquote,pre,table,tr'

export interface PastedCardDraft {
  title: string
  content: string
  tags: string[]
}

export function normalizeClipboardText(raw: string) {
  return raw.replace(/\r\n?/gu, '\n').replaceAll('\u0000', '').trim()
}

/**
 * Clipboard HTML is untrusted. Convert only its readable structure into plain
 * text; the original markup never reaches the Markdown renderer or the DOM.
 */
export function plainTextFromClipboardHtml(html: string) {
  if (!html.trim()) return ''

  const document = new DOMParser().parseFromString(html, 'text/html')
  document.querySelectorAll(REMOVED_HTML_TAGS).forEach((element) => {
    element.remove()
  })
  document.querySelectorAll('br').forEach((element) => {
    element.replaceWith(document.createTextNode('\n'))
  })
  document.querySelectorAll('li').forEach((element) => {
    element.prepend(document.createTextNode('- '))
    element.append(document.createTextNode('\n'))
  })
  document.querySelectorAll(BLOCK_HTML_TAGS).forEach((element) => {
    element.append(document.createTextNode('\n'))
  })

  return normalizeClipboardText(
    (document.body?.textContent ?? '')
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .replace(/\n{2,}/gu, '\n'),
  )
}

/**
 * A short leading line becomes the card title when it reads like a heading.
 * Lists, images, code fences and overly long first lines stay in the body so
 * direct paste never hides meaningful content in a title.
 */
export function buildPastedCardDraft(raw: string): PastedCardDraft | null {
  const text = normalizeClipboardText(raw)
  if (!text) return null

  const lines = text.split('\n')
  const firstLine = lines[0]?.trim() ?? ''
  const heading = MARKDOWN_HEADING.exec(firstLine)
  const title = heading?.[1]?.trim() ?? firstLine
  const canUseFirstLineAsTitle =
    Boolean(title) &&
    title.length <= MAX_TITLE_LENGTH &&
    (Boolean(heading) || !NON_TITLE_FIRST_LINE.test(firstLine))

  if (!canUseFirstLineAsTitle) {
    return {
      title: '未命名卡片',
      content: text,
      tags: parseHashtags(text),
    }
  }

  return {
    title,
    content: lines.slice(1).join('\n').trim(),
    tags: parseHashtags(text),
  }
}
