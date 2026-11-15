import type {
  Board,
  BoardItem,
  BoardZone,
  Card,
  CardAttachment,
  Connection,
} from '../../types'

interface LocalWorkspaceSnapshot {
  boards: Pick<Board, 'id' | 'name'>[]
  boardZones?: Pick<BoardZone, 'id'>[]
  cards: Pick<Card, 'id'>[]
  attachments: Pick<CardAttachment, 'id'>[]
  boardItems: Pick<BoardItem, 'id'>[]
  connections: Pick<Connection, 'id'>[]
}

/**
 * A new device creates the default board before auth restoration finishes.
 * It must not be uploaded until the account's remote workspace has been
 * pulled, otherwise its fresh timestamp could overwrite a renamed board.
 */
export function isPristineLocalWorkspace(
  snapshot: LocalWorkspaceSnapshot,
  defaultBoard: Pick<Board, 'id' | 'name'>,
) {
  const hasOnlyDefaultBoard =
    snapshot.boards.length === 0 ||
    (snapshot.boards.length === 1 &&
      snapshot.boards[0].id === defaultBoard.id &&
      snapshot.boards[0].name === defaultBoard.name)

  return (
    hasOnlyDefaultBoard &&
    (snapshot.boardZones ?? []).length === 0 &&
    snapshot.cards.length === 0 &&
    snapshot.attachments.length === 0 &&
    snapshot.boardItems.length === 0 &&
    snapshot.connections.length === 0
  )
}
