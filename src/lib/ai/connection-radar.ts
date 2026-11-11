import type { BoardItem, Card, Connection } from '../../types'

export interface RadarCardEntry {
  card: Card
  item: BoardItem
}

export interface RankedRadarCandidate extends RadarCardEntry {
  score: number
  signals: string[]
}

export interface RadarSuggestion {
  targetId: string
  label: string
  reason: string
  strength: number
}

const MIN_LOCAL_SCORE = 10
const STOP_BIGRAMS = new Set([
  '一个',
  '一些',
  '不是',
  '也是',
  '以及',
  '因为',
  '所以',
  '如果',
  '可以',
  '我们',
  '这个',
  '这些',
  '进行',
  '没有',
  '就是',
  '如何',
])

function normalize(value: string) {
  return value.trim().toLocaleLowerCase()
}

function normalizedTagPath(tag: string) {
  return normalize(tag)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean)
}

function tagScore(source: Card, candidate: Card) {
  let best = 0
  let signal = ''

  for (const sourceTag of source.tags) {
    const sourcePath = normalizedTagPath(sourceTag)
    if (!sourcePath.length) continue

    for (const candidateTag of candidate.tags) {
      const candidatePath = normalizedTagPath(candidateTag)
      if (!candidatePath.length) continue

      let score = 0
      let nextSignal = ''
      if (normalize(sourceTag) === normalize(candidateTag)) {
        score = 40
        nextSignal = `共享标签 #${sourceTag}`
      } else if (sourcePath.at(-1) === candidatePath.at(-1)) {
        score = 32
        nextSignal = `共享标签末级 ${sourcePath.at(-1)}`
      } else if (
        sourcePath[0] === candidatePath[0] &&
        sourcePath[1] === candidatePath[1]
      ) {
        score = 24
        nextSignal = `共享标签分支 ${sourcePath[0]}/${sourcePath[1]}`
      } else {
        const shared = sourcePath.find((part) =>
          candidatePath.some(
            (candidatePart) =>
              candidatePart === part ||
              (part.length >= 2 &&
                candidatePart.length >= 2 &&
                (part.includes(candidatePart) || candidatePart.includes(part))),
          ),
        )
        if (shared) {
          score = 16
          nextSignal = `标签层级出现 ${shared}`
        }
      }

      if (score > best) {
        best = score
        signal = nextSignal
      }
    }
  }

  return { score: best, signal }
}

function samePair(connection: Connection, a: string, b: string) {
  return (
    (connection.fromCardId === a && connection.toCardId === b) ||
    (connection.fromCardId === b && connection.toCardId === a)
  )
}

function topology(
  graph: Map<string, Set<string>>,
  sourceId: string,
  targetId: string,
) {
  const sourceNeighbors = graph.get(sourceId)
  const targetNeighbors = graph.get(targetId)
  if (!sourceNeighbors || !targetNeighbors) return { score: 0, count: 0 }

  let count = 0
  for (const neighbor of sourceNeighbors) {
    if (targetNeighbors.has(neighbor)) count += 1
  }

  return {
    count,
    score: count >= 2 ? 30 : count === 1 ? 24 : 0,
  }
}

function lexicalTokens(value: string) {
  const compact = value
    .replace(/[`*_>#\[\](){}|=~，。！？、；：“”‘’]/g, ' ')
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase()
  const tokens = new Set<string>()

  for (const token of compact.match(/[a-z0-9]{2,}/g) ?? []) {
    tokens.add(token)
  }

  for (const sequence of compact.match(/\p{Script=Han}{2,}/gu) ?? []) {
    const characters = Array.from(sequence)
    for (let index = 0; index < characters.length - 1; index += 1) {
      const token = `${characters[index]}${characters[index + 1]}`
      if (!STOP_BIGRAMS.has(token)) tokens.add(token)
    }
  }

  return tokens
}

function lexicalScore(source: Card, candidate: Card) {
  const sourceTokens = lexicalTokens(source.title)
  const candidateTokens = lexicalTokens(candidate.title)
  if (!sourceTokens.size || !candidateTokens.size)
    return { score: 0, shared: [] }

  const shared: string[] = []
  for (const token of sourceTokens) {
    if (candidateTokens.has(token)) shared.push(token)
  }
  if (!shared.length) return { score: 0, shared }

  const union = new Set([...sourceTokens, ...candidateTokens])
  return {
    shared,
    score: Math.round((shared.length / union.size) * 30),
  }
}

function adjacencyGraph(connections: Connection[]) {
  const graph = new Map<string, Set<string>>()

  const connect = (from: string, to: string) => {
    const neighbors = graph.get(from) ?? new Set<string>()
    neighbors.add(to)
    graph.set(from, neighbors)
  }

  for (const connection of connections) {
    connect(connection.fromCardId, connection.toCardId)
    connect(connection.toCardId, connection.fromCardId)
  }

  return graph
}

/**
 * Local-only candidate ranking. The result contains no AI-authored content and
 * never modifies the board graph.
 */
export function rankRadarCandidates(
  source: Card,
  entries: RadarCardEntry[],
  connections: Connection[],
  limit = 6,
): RankedRadarCandidate[] {
  const graph = adjacencyGraph(connections)
  const seenCards = new Set<string>([source.id])
  const ranked: RankedRadarCandidate[] = []

  for (const entry of entries) {
    const candidate = entry.card
    if (candidate.isDeleted || seenCards.has(candidate.id)) continue
    if (
      connections.some((connection) =>
        samePair(connection, source.id, candidate.id),
      )
    ) {
      continue
    }
    seenCards.add(candidate.id)

    const tags = tagScore(source, candidate)
    const topologyMatch = topology(graph, source.id, candidate.id)
    const lexical = lexicalScore(source, candidate)
    const score = tags.score + topologyMatch.score + lexical.score
    if (score < MIN_LOCAL_SCORE) continue

    const signals: string[] = []
    if (tags.signal) signals.push(tags.signal)
    if (topologyMatch.count) {
      signals.push(`共享 ${topologyMatch.count} 个相邻卡片`)
    }
    if (lexical.shared.length) {
      signals.push(`标题共同出现 ${lexical.shared.slice(0, 3).join('、')}`)
    }

    ranked.push({ ...entry, score, signals })
  }

  return ranked
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.card.updatedAt - a.card.updatedAt ||
        a.card.id.localeCompare(b.card.id),
    )
    .slice(0, Math.max(1, limit))
}
