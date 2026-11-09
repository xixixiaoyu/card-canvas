const TAG_SEPARATORS = /[\s,，。.;；、]+/g
const TAG_SPLIT = /[\s,，。.;；、]+/

/**
 * Tags are free-form labels with a few hard constraints: no leading `#`, no
 * whitespace or punctuation separators, and case-insensitive uniqueness. The
 * display casing is preserved; comparisons always go through `sameTag`.
 */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(TAG_SEPARATORS, '')
}

export function sameTag(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase()
}

/** Normalize and dedupe a tag list, preserving the first display casing. */
export function normalizeTags(tags: Iterable<string>): string[] {
  const result: string[] = []
  const seen = new Set<string>()

  for (const raw of tags) {
    const tag = normalizeTag(raw)
    if (!tag) continue

    const key = tag.toLowerCase()
    if (seen.has(key)) continue

    seen.add(key)
    result.push(tag)
  }

  return result
}

/** Split a free-form tag input into individual tags. */
export function splitTagInput(raw: string): string[] {
  return raw.split(TAG_SPLIT).map(normalizeTag).filter(Boolean)
}

/** Extract `#hashtag` tokens from arbitrary text. */
export function parseHashtags(text: string): string[] {
  const found: string[] = []

  for (const match of text.matchAll(/#([^\s#，,。.;；、]+)/gu)) {
    const tag = normalizeTag(match[1])
    if (tag) found.push(tag)
  }

  return normalizeTags(found)
}

/** Merge several tag sources, keeping the first display casing. */
export function mergeTags(...groups: Iterable<string>[]): string[] {
  const merged: string[] = []

  for (const group of groups) {
    for (const tag of group) merged.push(tag)
  }

  return normalizeTags(merged)
}
