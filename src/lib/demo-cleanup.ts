import { db } from '../db'
import { DEMO_CARD_IDS, DEMO_ITEM_IDS } from './demo-data'

/**
 * Older production builds seeded three demo cards into an empty database.
 * Remove only those fixed records while preserving every user-created card.
 */
export async function removeLegacyDemoData() {
  const demoCardIds = new Set<string>(DEMO_CARD_IDS)
  const demoItemIds = new Set<string>(DEMO_ITEM_IDS)
  const existingDemoCards = (await db.cards.bulkGet([...demoCardIds]))
    .filter((card) => card !== undefined)
    .map((card) => card.id)
  const existingDemoItems = (await db.boardItems.bulkGet([...demoItemIds]))
    .filter((item) => item !== undefined)
    .map((item) => item.id)
  const demoConnections = (await db.connections.toArray()).filter(
    (connection) =>
      demoCardIds.has(connection.fromCardId) ||
      demoCardIds.has(connection.toCardId),
  )

  await db.transaction(
    'rw',
    db.cards,
    db.boardItems,
    db.connections,
    db.syncOutbox,
    async () => {
      if (existingDemoItems.length) {
        await db.boardItems.bulkDelete(existingDemoItems)
      }
      if (existingDemoCards.length) {
        await db.cards.bulkDelete(existingDemoCards)
      }
      if (demoConnections.length) {
        await db.connections.bulkDelete(
          demoConnections.map((connection) => connection.id),
        )
      }
      await db.syncOutbox.bulkDelete([
        ...[...demoCardIds].map((id) => `cards:${id}`),
        ...[...demoItemIds].map((id) => `boardItems:${id}`),
        ...demoConnections.map((connection) => `connections:${connection.id}`),
      ])
    },
  )
}
