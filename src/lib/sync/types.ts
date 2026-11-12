export const SYNC_TABLES = [
  'boards',
  'cards',
  'attachments',
  'boardItems',
  'connections',
] as const

export type SyncTableName = (typeof SYNC_TABLES)[number]
export type SyncOperation = 'upsert' | 'delete'

export interface SyncOutboxRecord {
  key: string
  table: SyncTableName
  recordId: string
  operation: SyncOperation
  payload: Record<string, unknown>
  updatedAt: number
}

export interface SyncMetaRecord {
  key: string
  value: string | number | boolean | null
}

export interface PullCursor {
  updatedAt: string
  id: string
}

export const SYNC_META_KEYS = {
  ownerId: 'owner-id',
  pullCursor: 'pull-cursor',
} as const

export function tablePullCursorKey(table: SyncTableName) {
  return `${SYNC_META_KEYS.pullCursor}:${table}`
}
