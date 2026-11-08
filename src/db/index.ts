import Dexie, { type Table } from 'dexie'
import type { BoardItem, Card, Connection } from '../types'

/**
 * Local-first storage for the workspace.
 *
 * The database is a singleton so every feature module (capture, inbox, canvas)
 * reads and writes through the same IndexedDB connection.
 */
export class KnowledgeDatabase extends Dexie {
  cards!: Table<Card, string>
  boardItems!: Table<BoardItem, string>
  connections!: Table<Connection, string>

  constructor() {
    super('card-canvas')

    this.version(1).stores({
      cards: 'id, *tags, updatedAt, isDeleted',
      boardItems: 'id, cardId, boardId',
      connections: 'id, boardId, fromCardId, toCardId',
    })
  }
}

export const db = new KnowledgeDatabase()

export default db
