import { describe, expect, it } from 'vitest'
import {
  latestRemoteServerCursor,
  localRecordToRemote,
  parsePullCursor,
  pullCursorFilter,
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
          title: '不应上传的标题',
          content: '不应上传的正文',
          tags: ['敏感标签'],
          createdAt: 1000,
          updatedAt: 2000,
          isDeleted: true,
          highlights: [{ order: '01', label: '隐私', text: '内容' }],
        },
      },
      'user-a',
      'client-a',
    )

    expect(remote).toMatchObject({
      id: 'card-deleted',
      title: '',
      content: '',
      tags: [],
      highlights: null,
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

  it('maps compact attachment metadata and data URLs', () => {
    const remote = localRecordToRemote(
      {
        table: 'attachments',
        recordId: 'attachment-a',
        operation: 'upsert',
        updatedAt: 3200,
        payload: {
          cardId: 'card-a',
          fileName: '截图.webp',
          mimeType: 'image/webp',
          size: 2048,
          width: 640,
          height: 360,
          dataUrl: 'data:image/webp;base64,AAAA',
          createdAt: 3000,
        },
      },
      'user-a',
      'client-a',
    )
    const local = remoteRecordToLocal('attachments', {
      ...remote,
      updated_at: 3200,
    })

    expect(remote).toMatchObject({
      id: 'attachment-a',
      card_id: 'card-a',
      file_name: '截图.webp',
      data_url: 'data:image/webp;base64,AAAA',
    })
    expect(local).toMatchObject({
      id: 'attachment-a',
      cardId: 'card-a',
      dataUrl: 'data:image/webp;base64,AAAA',
      width: 640,
      height: 360,
      updatedAt: 3200,
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

  it('keeps every queued local mutation until the server acknowledges it', () => {
    expect(shouldAcceptRemoteRevision(2000, 2000)).toBe(false)
    expect(shouldAcceptRemoteRevision(2000, undefined, 2000)).toBe(false)
    expect(shouldAcceptRemoteRevision(5000, 1000, 1000)).toBe(false)
    expect(shouldAcceptRemoteRevision(2001, 2000, 2000)).toBe(false)
    expect(shouldAcceptRemoteRevision(2000, 1999, undefined)).toBe(true)
  })

  it('prefers the server revision time over a skewed client timestamp', () => {
    expect(
      remoteRecordToLocal('cards', {
        id: 'card-server-time',
        title: '服务端时间',
        content: '',
        tags: [],
        created_at: 1000,
        updated_at: 99_000,
        server_updated_at: '2026-11-14T08:00:00.000Z',
      }),
    ).toMatchObject({
      updatedAt: Date.parse('2026-11-14T08:00:00.000Z'),
    })
  })

  it('advances pull cursors with server timestamps instead of client time', () => {
    expect(
      latestRemoteServerCursor([
        {
          id: 'card-a',
          server_updated_at: '2026-11-11T10:00:00.100Z',
        },
        {
          id: 'card-b',
          server_updated_at: '2026-11-11T10:00:00.300Z',
        },
        {
          id: 'card-a',
          server_updated_at: '2026-11-11T10:00:00.300Z',
        },
        { id: 'card-invalid', server_updated_at: 'invalid' },
      ]),
    ).toEqual({
      updatedAt: '2026-11-11T10:00:00.300Z',
      id: 'card-b',
    })
    expect(latestRemoteServerCursor([])).toBeNull()
  })

  it('uses a composite cursor so equal server timestamps cannot be skipped', () => {
    const cursor = {
      updatedAt: '2026-11-11T10:00:00.300Z',
      id: 'card-b',
    }

    expect(pullCursorFilter(cursor)).toBe(
      'server_updated_at.gt.2026-11-11T10:00:00.300Z,and(server_updated_at.eq.2026-11-11T10:00:00.300Z,id.gt.card-b)',
    )
    expect(parsePullCursor(JSON.stringify(cursor))).toEqual(cursor)
    expect(parsePullCursor('2026-11-11T10:00:00.300Z')).toEqual({
      updatedAt: '2026-11-11T10:00:00.300Z',
      id: '',
    })
    expect(parsePullCursor(null)).toBeNull()
  })
})
