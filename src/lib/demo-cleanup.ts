import type { SupabaseClient } from '@supabase/supabase-js'
import { db } from '../db'
import { DEMO_CARD_IDS, DEMO_ITEM_IDS } from './demo-data'
import { withSyncTrackingSuppressed } from './sync/tracker'

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
  const existingDemoItems = (await db.boardItems.toArray())
    .filter((item) => demoItemIds.has(item.id) || demoCardIds.has(item.cardId))
    .map((item) => item.id)
  const demoConnections = (await db.connections.toArray()).filter(
    (connection) =>
      demoCardIds.has(connection.fromCardId) ||
      demoCardIds.has(connection.toCardId),
  )

  const removedCount =
    existingDemoCards.length + existingDemoItems.length + demoConnections.length

  await withSyncTrackingSuppressed(() =>
    db.transaction(
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
          ...existingDemoItems.map((id) => `boardItems:${id}`),
          ...demoConnections.map(
            (connection) => `connections:${connection.id}`,
          ),
        ])
      },
    ),
  )

  return removedCount > 0
}

/** Remove fixed demo rows that older builds may already have synced to cloud. */
export async function removeRemoteDemoData(
  supabase: SupabaseClient,
  userId: string,
) {
  const cardIds = [...DEMO_CARD_IDS]
  const itemIds = [...DEMO_ITEM_IDS]
  const results = await Promise.all([
    supabase
      .from('connections')
      .delete()
      .eq('user_id', userId)
      .in('from_card_id', cardIds),
    supabase
      .from('connections')
      .delete()
      .eq('user_id', userId)
      .in('to_card_id', cardIds),
    supabase
      .from('board_items')
      .delete()
      .eq('user_id', userId)
      .in('id', itemIds),
    supabase
      .from('board_items')
      .delete()
      .eq('user_id', userId)
      .in('card_id', cardIds),
    supabase.from('cards').delete().eq('user_id', userId).in('id', cardIds),
  ])

  const failure = results.find((result) => result.error)?.error
  if (failure) throw new Error(failure.message)
}
