import { db } from '../db'
import type { Board, BoardItem, Card, CardVersion, Connection } from '../types'
import { normalizeTags } from './tags'

export interface BackupPayload {
  app: 'card-canvas'
  version: 2
  exportedAt: string
  cards: Card[]
  boardItems: BoardItem[]
  connections: Connection[]
  boards: Board[]
  cardVersions: CardVersion[]
}

export interface BackupCounts {
  cards: number
  boardItems: number
  connections: number
  boards: number
  cardVersions: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseCard(value: unknown): Card {
  if (!isRecord(value)) throw new Error('备份中的卡片格式无效')
  if (!isString(value.id)) throw new Error('备份中的卡片缺少 id')
  if (typeof value.title !== 'string') throw new Error('备份中的卡片缺少标题')
  if (typeof value.content !== 'string') throw new Error('备份中的卡片缺少正文')

  const now = Date.now()

  return {
    id: value.id,
    title: value.title,
    content: value.content,
    tags: Array.isArray(value.tags)
      ? normalizeTags(value.tags.filter(isString))
      : [],
    createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : now,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now,
    isDeleted: value.isDeleted === true ? true : undefined,
    highlights: Array.isArray(value.highlights)
      ? (value.highlights as Card['highlights'])
      : undefined,
  }
}

function parseBoardItem(value: unknown): BoardItem {
  if (!isRecord(value)) throw new Error('备份中的投影格式无效')
  if (!isString(value.id)) throw new Error('备份中的投影缺少 id')
  if (!isString(value.cardId)) throw new Error('备份中的投影缺少 cardId')
  if (!isString(value.boardId)) throw new Error('备份中的投影缺少 boardId')
  if (!isFiniteNumber(value.x) || !isFiniteNumber(value.y)) {
    throw new Error('备份中的投影坐标无效')
  }

  return {
    id: value.id,
    cardId: value.cardId,
    boardId: value.boardId,
    x: value.x,
    y: value.y,
    width: isFiniteNumber(value.width) ? value.width : undefined,
    color: typeof value.color === 'string' ? value.color : undefined,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : undefined,
  }
}

function parseBoard(value: unknown): Board {
  if (!isRecord(value)) throw new Error('备份中的白板格式无效')
  if (!isString(value.id)) throw new Error('备份中的白板缺少 id')
  if (typeof value.name !== 'string') throw new Error('备份中的白板缺少名称')

  const now = Date.now()

  return {
    id: value.id,
    name: value.name.trim() || '未命名白板',
    createdAt: isFiniteNumber(value.createdAt) ? value.createdAt : now,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : now,
  }
}

function parseConnection(value: unknown): Connection {
  if (!isRecord(value)) throw new Error('备份中的连线格式无效')
  if (!isString(value.id)) throw new Error('备份中的连线缺少 id')
  if (!isString(value.boardId)) throw new Error('备份中的连线缺少 boardId')
  if (!isString(value.fromCardId) || !isString(value.toCardId)) {
    throw new Error('备份中的连线端点无效')
  }

  return {
    id: value.id,
    boardId: value.boardId,
    fromCardId: value.fromCardId,
    toCardId: value.toCardId,
    label: typeof value.label === 'string' ? value.label : undefined,
    updatedAt: isFiniteNumber(value.updatedAt) ? value.updatedAt : undefined,
  }
}

function parseCardVersion(value: unknown): CardVersion {
  if (!isRecord(value)) throw new Error('备份中的历史版本格式无效')
  if (!isString(value.id) || !isString(value.cardId)) {
    throw new Error('备份中的历史版本缺少 id')
  }
  if (typeof value.title !== 'string' || typeof value.content !== 'string') {
    throw new Error('备份中的历史版本内容无效')
  }
  if (!isFiniteNumber(value.snapshotAt)) {
    throw new Error('备份中的历史版本时间无效')
  }

  return {
    id: value.id,
    cardId: value.cardId,
    title: value.title,
    content: value.content,
    tags: Array.isArray(value.tags)
      ? normalizeTags(value.tags.filter(isString))
      : [],
    highlights: Array.isArray(value.highlights)
      ? (value.highlights as CardVersion['highlights'])
      : undefined,
    snapshotAt: value.snapshotAt,
  }
}

/** Build a portable snapshot of every durable table. */
export async function createBackup(): Promise<BackupPayload> {
  const [cards, boardItems, connections, boards, cardVersions] =
    await Promise.all([
      db.cards.toArray(),
      db.boardItems.toArray(),
      db.connections.toArray(),
      db.boards.toArray(),
      db.cardVersions.toArray(),
    ])

  return {
    app: 'card-canvas',
    version: 2,
    exportedAt: new Date().toISOString(),
    cards,
    boardItems,
    connections,
    boards,
    cardVersions,
  }
}

export function backupFileName(date = new Date()) {
  const stamp = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-')

  return `card-canvas-backup-${stamp}.json`
}

/** Validate and merge a backup file. Existing ids are overwritten. */
export async function importBackupText(text: string): Promise<BackupCounts> {
  let raw: unknown

  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON')
  }

  if (!isRecord(raw)) throw new Error('备份根节点格式无效')
  if (raw.app !== 'card-canvas') throw new Error('不是 Card Canvas 备份')
  if (!Array.isArray(raw.cards)) throw new Error('备份缺少 cards')
  if (!Array.isArray(raw.boardItems)) throw new Error('备份缺少 boardItems')
  if (raw.connections !== undefined && !Array.isArray(raw.connections)) {
    throw new Error('备份中的 connections 格式无效')
  }
  if (raw.boards !== undefined && !Array.isArray(raw.boards)) {
    throw new Error('备份中的 boards 格式无效')
  }
  if (raw.cardVersions !== undefined && !Array.isArray(raw.cardVersions)) {
    throw new Error('备份中的 cardVersions 格式无效')
  }

  const cards = raw.cards.map(parseCard)
  const boardItems = raw.boardItems.map(parseBoardItem)
  const connections = (raw.connections ?? []).map(parseConnection)
  const boards = (raw.boards ?? []).map(parseBoard)
  const cardVersions = (raw.cardVersions ?? []).map(parseCardVersion)

  await db.transaction(
    'rw',
    db.cards,
    db.boardItems,
    db.connections,
    db.boards,
    db.cardVersions,
    async () => {
      if (cards.length) await db.cards.bulkPut(cards)
      if (boardItems.length) await db.boardItems.bulkPut(boardItems)
      if (connections.length) await db.connections.bulkPut(connections)
      if (boards.length) await db.boards.bulkPut(boards)
      if (cardVersions.length) {
        await db.cardVersions.bulkPut(cardVersions)
      }
    },
  )

  return {
    cards: cards.length,
    boardItems: boardItems.length,
    connections: connections.length,
    boards: boards.length,
    cardVersions: cardVersions.length,
  }
}

export async function importBackupFile(file: File) {
  return importBackupText(await file.text())
}

/** Trigger a browser download for a backup snapshot. */
export async function downloadBackup() {
  const payload = await createBackup()
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = url
  anchor.download = backupFileName()
  anchor.rel = 'noopener'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()

  setTimeout(() => URL.revokeObjectURL(url), 0)

  return {
    cards: payload.cards.length,
    boardItems: payload.boardItems.length,
    connections: payload.connections.length,
    boards: payload.boards.length,
    cardVersions: payload.cardVersions.length,
  }
}
