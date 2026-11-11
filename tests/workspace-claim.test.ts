import { describe, expect, it } from 'vitest'
import { isPristineLocalWorkspace } from '../src/lib/sync/workspace-claim'

const defaultBoard = { id: 'board-main', name: '我的白板' }

describe('workspace claiming', () => {
  it('recognizes a fresh default board as pristine', () => {
    expect(
      isPristineLocalWorkspace(
        {
          boards: [defaultBoard],
          cards: [],
          boardItems: [],
          connections: [],
        },
        defaultBoard,
      ),
    ).toBe(true)
  })

  it('claims any workspace that already contains meaningful local data', () => {
    expect(
      isPristineLocalWorkspace(
        {
          boards: [defaultBoard],
          cards: [{ id: 'card-local' }],
          boardItems: [{ id: 'item-local' }],
          connections: [],
        },
        defaultBoard,
      ),
    ).toBe(false)
    expect(
      isPristineLocalWorkspace(
        {
          boards: [{ id: 'board-custom', name: '我的白板' }],
          cards: [],
          boardItems: [],
          connections: [],
        },
        defaultBoard,
      ),
    ).toBe(false)
  })
})
