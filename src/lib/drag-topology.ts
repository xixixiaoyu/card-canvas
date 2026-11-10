import type { Connection } from '../types'

/**
 * Return only connections with at least one endpoint in the moving card set.
 * ConnectionLayer updates these once per batch; untouched connections stay
 * out of the hot loop entirely.
 */
export function connectionsTouchingCards(
  connections: Connection[],
  movingCardIds: Set<string>,
): Connection[] {
  if (!movingCardIds.size) return []

  return connections.filter(
    (connection) =>
      movingCardIds.has(connection.fromCardId) ||
      movingCardIds.has(connection.toCardId),
  )
}
