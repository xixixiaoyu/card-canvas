import { describe, expect, it } from 'vitest'
import { connectionsTouchingCards } from '../src/lib/drag-topology'
import type { Connection } from '../src/types'

const connection = (
  id: string,
  fromCardId: string,
  toCardId: string,
): Connection => ({
  id,
  boardId: 'board-main',
  fromCardId,
  toCardId,
})

describe('batch connection topology', () => {
  it('keeps internal and boundary connections, drops untouched ones', () => {
    const connections = [
      connection('internal', 'a', 'b'),
      connection('boundary', 'b', 'c'),
      connection('untouched', 'c', 'd'),
    ]

    expect(
      connectionsTouchingCards(connections, new Set(['a', 'b'])).map(
        (entry) => entry.id,
      ),
    ).toEqual(['internal', 'boundary'])
  })

  it('returns nothing when no card moves', () => {
    expect(
      connectionsTouchingCards([connection('internal', 'a', 'b')], new Set()),
    ).toEqual([])
  })
})
