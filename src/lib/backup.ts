import { db } from '../db'
import type {
  Board,
  BoardItem,
  Card,
  CardAttachment,
  CardVersion,
  Connection,
} from '../types'
import { normalizeTags } from './tags'

const DEFAULT_CARD_WIDTH = 420

export interface BackupPayload {
  app: 'card-canvas'
  version: 3
  exportedAt: string
  cards: Card[]
  boardItems: BoardItem[]
  connections: Connection[]
  boards: Board[]
  cardVersions: CardVersion[]
  attachments: CardAttachment[]
}

export interface BackupCounts {
  cards: number
  boardItems: number
  connections: number
  boards: number
  cardVersions: number
  attachments: number
}

export interface BackupImportCounts extends BackupCounts {
  skipped: BackupCounts
}

export type BackupImportMode = 'merge' | 'overwrite'

const EMPTY_COUNTS: BackupCounts = {
  cards: 0,
  boardItems: 0,
  connections: 0,
  boards: 0,
  cardVersions: 0,
  attachments: 0,
}

interface TimedRecord {
  updatedAt?: number
}

function newerImport(
  incoming: TimedRecord,
  existing: TimedRecord | undefined,
  mode: BackupImportMode,
) {
  if (!existing || mode === 'overwrite') return true
  return (incoming.updatedAt ?? 0) > (existing.updatedAt ?? 0)
}

function importCard(
  incoming: Card,
  existing: Card | undefined,
  mode: BackupImportMode,
) {
  if (!existing || mode === 'overwrite') return true
  if (existing.isDeleted && !incoming.isDeleted) return false
  return incoming.updatedAt > existing.updatedAt
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
    updatedAt: isFiniteNumber(value.updatedAt)
      ? value.updatedAt
      : isFiniteNumber(value.createdAt)
        ? value.createdAt
        : 0,
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
    updatedAt: isFiniteNumber(value.updatedAt)
      ? value.updatedAt
      : isFiniteNumber(value.createdAt)
        ? value.createdAt
        : 0,
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

function parseAttachment(value: unknown): CardAttachment {
  if (!isRecord(value)) throw new Error('备份中的图片附件格式无效')
  if (!isString(value.id) || !isString(value.cardId)) {
    throw new Error('备份中的图片附件缺少 id')
  }
  if (
    typeof value.fileName !== 'string' ||
    typeof value.mimeType !== 'string' ||
    typeof value.dataUrl !== 'string'
  ) {
    throw new Error('备份中的图片附件内容无效')
  }
  if (
    !value.mimeType.startsWith('image/') ||
    !value.dataUrl.startsWith('data:image/')
  ) {
    throw new Error('备份中的图片附件类型无效')
  }
  if (
    !isFiniteNumber(value.size) ||
    !isFiniteNumber(value.width) ||
    !isFiniteNumber(value.height) ||
    !isFiniteNumber(value.createdAt) ||
    !isFiniteNumber(value.updatedAt)
  ) {
    throw new Error('备份中的图片附件元数据无效')
  }

  return {
    id: value.id,
    cardId: value.cardId,
    fileName: value.fileName,
    mimeType: value.mimeType,
    size: value.size,
    width: value.width,
    height: value.height,
    dataUrl: value.dataUrl,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    isDeleted: value.isDeleted === true ? true : undefined,
  }
}

/** Build a portable snapshot of every durable table. */
export async function createBackup(): Promise<BackupPayload> {
  const [cards, boardItems, connections, boards, cardVersions, attachments] =
    await Promise.all([
      db.cards.toArray(),
      db.boardItems.toArray(),
      db.connections.toArray(),
      db.boards.toArray(),
      db.cardVersions.toArray(),
      db.attachments.toArray(),
    ])

  return {
    app: 'card-canvas',
    version: 3,
    exportedAt: new Date().toISOString(),
    cards,
    boardItems,
    connections,
    boards,
    cardVersions,
    attachments,
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

/**
 * Validate and safely merge a backup. Newer records win, and an existing local
 * tombstone is never resurrected by an older live copy.
 */
export async function importBackupText(
  text: string,
  fallbackBoardId?: string,
  mode: BackupImportMode = 'merge',
): Promise<BackupImportCounts> {
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
  if (raw.attachments !== undefined && !Array.isArray(raw.attachments)) {
    throw new Error('备份中的 attachments 格式无效')
  }

  const cards = raw.cards.map(parseCard)
  const boardItems = raw.boardItems.map(parseBoardItem)
  const connections = (raw.connections ?? []).map(parseConnection)
  const boards = (raw.boards ?? []).map(parseBoard)
  const cardVersions = (raw.cardVersions ?? []).map(parseCardVersion)
  const attachments = (raw.attachments ?? []).map(parseAttachment)
  let importedBoardItems = boardItems
  const skipped = { ...EMPTY_COUNTS }

  await db.transaction(
    'rw',
    [
      db.cards,
      db.boardItems,
      db.connections,
      db.boards,
      db.cardVersions,
      db.attachments,
    ],
    async () => {
      const existingBoards = await db.boards.bulkGet(
        boards.map((board) => board.id),
      )
      const boardsById = new Map(
        existingBoards.flatMap((board) =>
          board ? [[board.id, board] as const] : [],
        ),
      )
      const acceptedBoards = boards.filter((board) =>
        newerImport(board, boardsById.get(board.id), mode),
      )
      skipped.boards += boards.length - acceptedBoards.length
      if (acceptedBoards.length) await db.boards.bulkPut(acceptedBoards)

      const existingCards = await db.cards.bulkGet(cards.map((card) => card.id))
      const cardsById = new Map(
        existingCards.flatMap((card) =>
          card ? [[card.id, card] as const] : [],
        ),
      )
      const acceptedCards = cards.filter((card) =>
        importCard(card, cardsById.get(card.id), mode),
      )
      skipped.cards += cards.length - acceptedCards.length
      if (acceptedCards.length) await db.cards.bulkPut(acceptedCards)

      const storedCards = await db.cards.toArray()
      const storedCardsById = new Map(
        storedCards.map((card) => [card.id, card]),
      )
      const liveCardIds = new Set(
        storedCards.filter((card) => !card.isDeleted).map((card) => card.id),
      )

      const existingItems = await db.boardItems.bulkGet(
        boardItems.map((item) => item.id),
      )
      const itemsById = new Map(
        existingItems.flatMap((item) =>
          item ? [[item.id, item] as const] : [],
        ),
      )
      const acceptedItems = boardItems.filter(
        (item) =>
          liveCardIds.has(item.cardId) &&
          newerImport(item, itemsById.get(item.id), mode),
      )
      skipped.boardItems += boardItems.length - acceptedItems.length

      const existingConnections = await db.connections.bulkGet(
        connections.map((connection) => connection.id),
      )
      const connectionsById = new Map(
        existingConnections.flatMap((connection) =>
          connection ? [[connection.id, connection] as const] : [],
        ),
      )
      const acceptedConnections = connections.filter(
        (connection) =>
          liveCardIds.has(connection.fromCardId) &&
          liveCardIds.has(connection.toCardId) &&
          newerImport(connection, connectionsById.get(connection.id), mode),
      )
      skipped.connections += connections.length - acceptedConnections.length

      const existingVersions = await db.cardVersions.bulkGet(
        cardVersions.map((version) => version.id),
      )
      const versionsById = new Set(
        existingVersions.flatMap((version) => (version ? [version.id] : [])),
      )
      const acceptedVersions = cardVersions.filter(
        (version) =>
          storedCardsById.has(version.cardId) &&
          (mode === 'overwrite' || !versionsById.has(version.id)),
      )
      skipped.cardVersions += cardVersions.length - acceptedVersions.length

      const existingAttachments = await db.attachments.bulkGet(
        attachments.map((attachment) => attachment.id),
      )
      const attachmentsById = new Map(
        existingAttachments.flatMap((attachment) =>
          attachment ? [[attachment.id, attachment] as const] : [],
        ),
      )
      const acceptedAttachments = attachments.filter(
        (attachment) =>
          storedCardsById.has(attachment.cardId) &&
          newerImport(attachment, attachmentsById.get(attachment.id), mode),
      )
      skipped.attachments += attachments.length - acceptedAttachments.length

      const allItems = await db.boardItems.toArray()
      const projectedCardIds = new Set(
        [...allItems, ...acceptedItems].map((item) => item.cardId),
      )
      const fallbackItems: BoardItem[] = []

      if (fallbackBoardId) {
        const targetItems = [...allItems, ...acceptedItems].filter(
          (item) => item.boardId === fallbackBoardId,
        )
        const baseX = targetItems.length
          ? Math.max(
              ...targetItems.map(
                (item) => item.x + (item.width ?? DEFAULT_CARD_WIDTH),
              ),
            ) + 120
          : 0
        const baseY = targetItems.length
          ? Math.min(...targetItems.map((item) => item.y))
          : -150

        for (const card of acceptedCards) {
          if (card.isDeleted || projectedCardIds.has(card.id)) continue
          projectedCardIds.add(card.id)
          fallbackItems.push({
            id: `projection-${crypto.randomUUID()}`,
            cardId: card.id,
            boardId: fallbackBoardId,
            x: baseX + (fallbackItems.length % 2) * 460,
            y: baseY + Math.floor(fallbackItems.length / 2) * 340,
            width: DEFAULT_CARD_WIDTH,
            updatedAt: Date.now(),
          })
        }
      }

      importedBoardItems = [...acceptedItems, ...fallbackItems]
      if (importedBoardItems.length) {
        await db.boardItems.bulkPut(importedBoardItems)
      }
      if (acceptedConnections.length) {
        await db.connections.bulkPut(acceptedConnections)
      }
      if (acceptedVersions.length) {
        await db.cardVersions.bulkPut(acceptedVersions)
      }
      if (acceptedAttachments.length) {
        await db.attachments.bulkPut(acceptedAttachments)
      }
    },
  )

  return {
    cards: cards.length - skipped.cards,
    boardItems: importedBoardItems.length,
    connections: connections.length - skipped.connections,
    boards: boards.length - skipped.boards,
    cardVersions: cardVersions.length - skipped.cardVersions,
    attachments: attachments.length - skipped.attachments,
    skipped,
  }
}

export async function importBackupFile(
  file: File,
  fallbackBoardId?: string,
  mode: BackupImportMode = 'merge',
) {
  return importBackupText(await file.text(), fallbackBoardId, mode)
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
    attachments: payload.attachments.length,
  }
}
