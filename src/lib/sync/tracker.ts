import type { Table } from 'dexie'
import { db } from '../../db'
import { plainRecord } from '../plain-record'
import {
  SYNC_TABLES,
  type SyncOperation,
  type SyncOutboxRecord,
  type SyncTableName,
} from './types'

type TrackableRecord = { id: string; updatedAt?: number }

const listeners = new Set<() => void>()
let installed = false
let suppressionDepth = 0

function outboxTable(): Table<SyncOutboxRecord, string> {
  return db.syncOutbox
}

function notifyOutboxChanged() {
  for (const listener of listeners) {
    try {
      listener()
    } catch (error) {
      console.error('[card-canvas] Sync outbox listener failed', error)
    }
  }
}

/**
 * Coalesce every pending mutation for one record into a single outbox row.
 * A newer local edit always supersedes an older queued operation.
 */
async function queueRecord(
  table: SyncTableName,
  recordId: string,
  operation: SyncOperation,
  source: TrackableRecord,
  updatedAt: number,
) {
  const key = `${table}:${recordId}`
  const payload = {
    ...plainRecord(source),
    updatedAt,
  }

  await db.transaction('rw', outboxTable(), async () => {
    const existing = await outboxTable().get(key)
    if (existing && existing.updatedAt > updatedAt) return

    await outboxTable().put({
      key,
      table,
      recordId,
      operation,
      payload,
      updatedAt,
    })
  })

  notifyOutboxChanged()
}

function tableFor(name: SyncTableName) {
  return db[name] as Table<TrackableRecord, string>
}

async function queueCurrentRecord(
  table: SyncTableName,
  recordId: string,
  updatedAt: number,
) {
  const record = await tableFor(table).get(recordId)
  if (!record) return
  await queueRecord(table, recordId, 'upsert', record, updatedAt)
}

/**
 * Install Dexie write hooks once. Sync-table and remote-pull writes skip these
 * hooks so the local echo of a server response can never enter the outbox.
 */
export function installSyncTracking() {
  if (installed) return
  installed = true

  for (const tableName of SYNC_TABLES) {
    const table = tableFor(tableName)

    table.hook('creating', function (_key, object, transaction) {
      if (suppressionDepth > 0) return
      const updatedAt = Date.now()

      transaction.on('complete', () => {
        void queueCurrentRecord(tableName, object.id, updatedAt).catch(
          (error) => {
            console.error('[card-canvas] Unable to queue created record', error)
          },
        )
      })
    })

    table.hook('updating', function (modifications, key, object, transaction) {
      if (suppressionDepth > 0) return
      const updatedAt = Date.now()

      void modifications
      void key
      transaction.on('complete', () => {
        void queueCurrentRecord(tableName, object.id, updatedAt).catch(
          (error) => {
            console.error('[card-canvas] Unable to queue updated record', error)
          },
        )
      })

      return { updatedAt }
    })

    table.hook('deleting', function (_key, object, transaction) {
      if (suppressionDepth > 0) return
      const snapshot = plainRecord(object)
      const updatedAt = Date.now()

      transaction.on('complete', () => {
        void queueRecord(
          tableName,
          object.id,
          'delete',
          snapshot,
          updatedAt,
        ).catch((error) => {
          console.error('[card-canvas] Unable to queue deleted record', error)
        })
      })
    })
  }
}

export function subscribeSyncOutbox(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function withSyncTrackingSuppressed<T>(
  operation: () => Promise<T>,
): Promise<T> {
  suppressionDepth += 1
  try {
    return await operation()
  } finally {
    suppressionDepth -= 1
  }
}

/** Queue the current local workspace when a user first claims anonymous data. */
export async function queueFullWorkspaceSnapshot() {
  await db.open()
  const now = Date.now()

  for (const tableName of SYNC_TABLES) {
    const records = await tableFor(tableName).toArray()
    await Promise.all(
      records.map((record) =>
        queueRecord(
          tableName,
          record.id,
          'upsert',
          record,
          record.updatedAt ?? now,
        ),
      ),
    )
  }
}
