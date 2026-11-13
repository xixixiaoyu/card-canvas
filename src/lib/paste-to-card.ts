import { parseHashtags } from './tags'

export const MAX_PASTED_TEXT_LENGTH = 50_000

const REMOVED_HTML_TAGS = 'script,style,noscript,template,iframe,object,embed'
const BLOCK_HTML_TAGS =
  'p,div,section,article,header,footer,h1,h2,h3,h4,h5,h6,blockquote,pre,table,tr'

export interface PastedCardDraft {
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

/** Direct paste is lossless: every readable block stays in the card body. */
export function buildPastedCardDraft(raw: string): PastedCardDraft | null {
  const text = normalizeClipboardText(raw)
  if (!text) return null

  return {
    content: text,
    tags: parseHashtags(text),
  }
}
