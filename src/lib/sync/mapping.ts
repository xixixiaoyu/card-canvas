import type { Board, BoardItem, Card, Connection } from '../../types'
import type { SyncOperation, SyncOutboxRecord, SyncTableName } from './types'

export type RemoteRow = Record<string, unknown>

const REMOTE_TABLE_NAMES: Record<SyncTableName, string> = {
  boards: 'boards',
  cards: 'cards',
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
  const common = {
    id: entry.recordId,
    user_id: userId,
    updated_at: entry.updatedAt,
    is_deleted: entry.operation === 'delete',
    sync_client_id: clientId,
  }

  switch (entry.table) {
    case 'boards':
      return {
        ...common,
        name: stringOr(source.name, '未命名白板'),
        created_at: numberOr(source.createdAt, entry.updatedAt),
      }
    case 'cards':
      return {
        ...common,
        title: stringOr(source.title),
        content: stringOr(source.content),
        tags: Array.isArray(source.tags)
          ? source.tags.filter((tag): tag is string => typeof tag === 'string')
          : [],
        highlights: Array.isArray(source.highlights) ? source.highlights : null,
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
        label: typeof source.label === 'string' ? source.label : null,
      }
  }
}

export function remoteRecordToLocal(
  table: SyncTableName,
  row: RemoteRow,
): Board | Card | BoardItem | Connection {
  const updatedAt = numberOr(row.updated_at, Date.now())

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
  return numberOr(row.updated_at)
}

export function operationForRow(row: RemoteRow): SyncOperation {
  return isRemoteTombstone(row) ? 'delete' : 'upsert'
}
