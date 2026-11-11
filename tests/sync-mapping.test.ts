import { describe, expect, it } from 'vitest'
import {
  localRecordToRemote,
  remoteRecordToLocal,
  shouldAcceptRemoteRevision,
} from '../src/lib/sync/mapping'

describe('Supabase record mapping', () => {
  it('maps local cards to the snake-case remote contract', () => {
    const remote = localRecordToRemote(
      {
        table: 'cards',
        recordId: 'card-a',
        operation: 'upsert',
        updatedAt: 1234,
        payload: {
          title: '测试卡片',
          content: '正文',
          tags: ['心理/边界'],
          createdAt: 1000,
          highlights: [{ order: '01', label: '重点', text: '内容' }],
        },
      },
      'user-a',
      'client-a',
    )

    expect(remote).toMatchObject({
      id: 'card-a',
      user_id: 'user-a',
      title: '测试卡片',
      content: '正文',
      tags: ['心理/边界'],
      created_at: 1000,
      updated_at: 1234,
      is_deleted: false,
      sync_client_id: 'client-a',
    })
  })

  it('maps a soft-deleted local card to a remote tombstone', () => {
    const remote = localRecordToRemote(
      {
        table: 'cards',
        recordId: 'card-deleted',
        operation: 'upsert',
        updatedAt: 2000,
        payload: {
          title: '已删除',
          content: '',
          tags: [],
          createdAt: 1000,
          updatedAt: 2000,
          isDeleted: true,
        },
      },
      'user-a',
      'client-a',
    )

    expect(remote).toMatchObject({
      id: 'card-deleted',
      updated_at: 2000,
      is_deleted: true,
    })
  })

  it('maps remote board item coordinates back to local fields', () => {
    const local = remoteRecordToLocal('boardItems', {
      id: 'projection-a',
      card_id: 'card-a',
      board_id: 'board-main',
      x: 12.5,
      y: -30,
      width: 420,
      updated_at: 9876,
    })

    expect(local).toMatchObject({
      id: 'projection-a',
      cardId: 'card-a',
      boardId: 'board-main',
      x: 12.5,
      y: -30,
      width: 420,
      updatedAt: 9876,
    })
  })

  it('preserves tombstones when mapping remote cards', () => {
    const local = remoteRecordToLocal('cards', {
      id: 'card-a',
      title: '已删除',
      content: '',
      tags: [],
      created_at: 1000,
      updated_at: 2000,
      is_deleted: true,
    })

    expect(local).toMatchObject({
      id: 'card-a',
      isDeleted: true,
      updatedAt: 2000,
    })
  })

  it('keeps local deletes when remote revisions tie', () => {
    expect(shouldAcceptRemoteRevision(2000, 2000)).toBe(false)
    expect(shouldAcceptRemoteRevision(2000, undefined, 2000)).toBe(false)
    expect(shouldAcceptRemoteRevision(2001, 2000, 2000)).toBe(true)
    expect(shouldAcceptRemoteRevision(2000, undefined, undefined)).toBe(true)
  })
})
