import type {
  Board,
  BoardItem,
  Card,
  CardAttachment,
  Connection,
} from '../../types'
import type {
  PullCursor,
  SyncOperation,
  SyncOutboxRecord,
  SyncTableName,
} from './types'

export type RemoteRow = Record<string, unknown>

const REMOTE_TABLE_NAMES: Record<SyncTableName, string> = {
  boards: 'boards',
  cards: 'cards',
  attachments: 'attachments',
  boardItems: 'board_items',
  connections: 'connections',
}

function numberOr(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function optionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringOr(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

export function remoteTableName(table: SyncTableName) {
  return REMOTE_TABLE_NAMES[table]
}

export function localRecordToRemote(
  entry: Pick<
    SyncOutboxRecord,
    'table' | 'recordId' | 'operation' | 'payload' | 'updatedAt'
  >,
  userId: string,
  clientId: string,
) {
  const source = entry.payload
  const deleted = entry.operation === 'delete' || source.isDeleted === true
  const common = {
    id: entry.recordId,
    user_id: userId,
    updated_at: entry.updatedAt,
    is_deleted: deleted,
    sync_client_id: clientId,
  }

  switch (entry.table) {
    case 'boards':
      return {
        ...common,
        name: deleted ? '' : stringOr(source.name, '未命名白板'),
        created_at: numberOr(source.createdAt, entry.updatedAt),
      }
    case 'cards':
      return {
        ...common,
        title: deleted ? '' : stringOr(source.title),
        content: deleted ? '' : stringOr(source.content),
        tags:
          !deleted && Array.isArray(source.tags)
            ? source.tags.filter(
                (tag): tag is string => typeof tag === 'string',
              )
            : [],
        highlights:
          !deleted && Array.isArray(source.highlights)
            ? source.highlights
            : null,
        created_at: numberOr(source.createdAt, entry.updatedAt),
      }
    case 'attachments':
      return {
        ...common,
        card_id: stringOr(source.cardId),
        file_name: stringOr(source.fileName, 'image.webp'),
        mime_type: stringOr(source.mimeType, 'image/webp'),
        size: numberOr(source.size),
        width: numberOr(source.width),
        height: numberOr(source.height),
        data_url: entry.operation === 'delete' ? '' : stringOr(source.dataUrl),
        created_at: numberOr(source.createdAt, entry.updatedAt),
      }
    case 'boardItems':
      return {
        ...common,
        card_id: stringOr(source.cardId),
        board_id: stringOr(source.boardId),
        x: numberOr(source.x),
        y: numberOr(source.y),
        width: optionalNumber(source.width) ?? null,
        color: typeof source.color === 'string' ? source.color : null,
      }
    case 'connections':
      return {
        ...common,
        board_id: stringOr(source.boardId),
        from_card_id: stringOr(source.fromCardId),
        to_card_id: stringOr(source.toCardId),
        label:
          !deleted && typeof source.label === 'string' ? source.label : null,
      }
  }
}

export function remoteRecordToLocal(
  table: SyncTableName,
  row: RemoteRow,
): Board | Card | CardAttachment | BoardItem | Connection {
  const updatedAt = remoteUpdatedAt(row)

  switch (table) {
    case 'boards':
      return {
        id: stringOr(row.id),
        name: stringOr(row.name, '未命名白板'),
        createdAt: numberOr(row.created_at, updatedAt),
        updatedAt,
      }
    case 'cards':
      return {
        id: stringOr(row.id),
        title: stringOr(row.title),
        content: stringOr(row.content),
        tags: Array.isArray(row.tags)
          ? row.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        createdAt: numberOr(row.created_at, updatedAt),
        updatedAt,
        isDeleted: row.is_deleted === true ? true : undefined,
        highlights: Array.isArray(row.highlights)
          ? (row.highlights as Card['highlights'])
          : undefined,
      }
    case 'attachments':
      return {
        id: stringOr(row.id),
        cardId: stringOr(row.card_id),
        fileName: stringOr(row.file_name, 'image.webp'),
        mimeType: stringOr(row.mime_type, 'image/webp'),
        size: numberOr(row.size),
        width: numberOr(row.width),
        height: numberOr(row.height),
        dataUrl: stringOr(row.data_url),
        createdAt: numberOr(row.created_at, updatedAt),
        updatedAt,
        isDeleted: row.is_deleted === true ? true : undefined,
      }
    case 'boardItems':
      return {
        id: stringOr(row.id),
        cardId: stringOr(row.card_id),
        boardId: stringOr(row.board_id),
        x: numberOr(row.x),
        y: numberOr(row.y),
        width: optionalNumber(row.width),
        color: typeof row.color === 'string' ? row.color : undefined,
        updatedAt,
      }
    case 'connections':
      return {
        id: stringOr(row.id),
        boardId: stringOr(row.board_id),
        fromCardId: stringOr(row.from_card_id),
        toCardId: stringOr(row.to_card_id),
        label: typeof row.label === 'string' ? row.label : undefined,
        updatedAt,
      }
  }
}

export function outboxKey(table: SyncTableName, recordId: string) {
  return `${table}:${recordId}`
}

export function isRemoteTombstone(row: RemoteRow) {
  return row.is_deleted === true
}

export function remoteUpdatedAt(row: RemoteRow) {
  if (typeof row.server_updated_at === 'string') {
    const serverTime = Date.parse(row.server_updated_at)
    if (Number.isFinite(serverTime)) return serverTime
  }
  return numberOr(row.updated_at)
}

export function latestRemoteServerCursor(rows: RemoteRow[]): PullCursor | null {
  let latestValue: PullCursor | null = null
  let latestTime = Number.NEGATIVE_INFINITY

  for (const row of rows) {
    const value = row.server_updated_at
    const id = row.id
    if (typeof value !== 'string' || typeof id !== 'string') continue

    const time = Date.parse(value)
    if (
      !Number.isFinite(time) ||
      time < latestTime ||
      (time === latestTime && latestValue && id <= latestValue.id)
    ) {
      continue
    }
    latestTime = time
    latestValue = { updatedAt: value, id }
  }

  return latestValue
}

export function pullCursorFilter(cursor: PullCursor) {
  return `server_updated_at.gt.${cursor.updatedAt},and(server_updated_at.eq.${cursor.updatedAt},id.gt.${cursor.id})`
}

export function parsePullCursor(value: string | null): PullCursor | null {
  if (!value) return null

  try {
    const parsed = JSON.parse(value) as Partial<PullCursor>
    if (typeof parsed.updatedAt === 'string' && typeof parsed.id === 'string') {
      return { updatedAt: parsed.updatedAt, id: parsed.id }
    }
  } catch {
    // Migrate the timestamp-only cursor written by versions before v1.4.8.
  }

  return { updatedAt: value, id: '' }
}

/**
 * Any local mutation still waiting in the outbox wins until it is uploaded.
 * The server then assigns the authoritative revision time, so a skewed device
 * clock cannot permanently dominate a later remote revision.
 */
export function shouldAcceptRemoteRevision(
  remoteTime: number,
  localTime?: number,
  queuedTime?: number,
) {
  if (queuedTime !== undefined) return false
  if (localTime !== undefined && localTime >= remoteTime) return false
  return true
}

export function operationForRow(row: RemoteRow): SyncOperation {
  return isRemoteTombstone(row) ? 'delete' : 'upsert'
}
