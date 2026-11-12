import Dexie, { type Table } from 'dexie'
import type { SyncMetaRecord, SyncOutboxRecord } from '../lib/sync/types'
import type {
  Board,
  BoardItem,
  Card,
  CardAttachment,
  CardVersion,
  Connection,
} from '../types'

/**
 * Local-first storage for the workspace.
 *
 * The database is a singleton so every feature module (capture, canvas, connections)
 * reads and writes through the same IndexedDB connection.
 */
export class KnowledgeDatabase extends Dexie {
  cards!: Table<Card, string>
  boardItems!: Table<BoardItem, string>
  connections!: Table<Connection, string>
  boards!: Table<Board, string>
  syncOutbox!: Table<SyncOutboxRecord, string>
  syncMeta!: Table<SyncMetaRecord, string>
  cardVersions!: Table<CardVersion, string>
  attachments!: Table<CardAttachment, string>

  constructor() {
    super('card-canvas')

    this.version(1).stores({
      cards: 'id, *tags, updatedAt, isDeleted',
      boardItems: 'id, cardId, boardId',
      connections: 'id, boardId, fromCardId, toCardId',
    })

    this.version(2).stores({
      boards: 'id, updatedAt',
    })

    this.version(3).stores({
      cards: 'id, *tags, updatedAt, isDeleted',
      boardItems: 'id, cardId, boardId',
      connections: 'id, boardId, fromCardId, toCardId',
      boards: 'id, updatedAt',
      syncOutbox: 'key, table, recordId, updatedAt',
      syncMeta: 'key',
    })

    this.version(4).stores({
      cardVersions: 'id, cardId, snapshotAt',
    })

    this.version(5).stores({
      attachments: 'id, cardId, updatedAt, isDeleted',
    })
  }
}

export const db = new KnowledgeDatabase()

export default db
