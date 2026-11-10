import type { BoardItem, Card } from '../types'
import { DEMO_FOCUS_ITEM_ID } from '../lib/demo-data'

export const FOCUS_BOARD_ITEM_ID = DEMO_FOCUS_ITEM_ID

const seededAt = Date.now()

export const seedCards: Card[] = [
  {
    id: 'card-demo-001',
    title: '声音的支点，与防御的回声',
    content:
      '咽音不是把声音推得更响，而是让气息、共鸣与喉位重新协作。防御也一样：它保护自我，也悄悄决定哪些话不被说出口。',
    tags: ['声乐/咽音', '心理学/防御机制'],
    createdAt: seededAt,
    updatedAt: seededAt,
    highlights: [
      {
        order: '01',
        label: '身体',
        text: '抬软腭、沉喉位，让共鸣落在面罩，而不是挤在声带。',
      },
      {
        order: '02',
        label: '心理',
        text: '防御像声音的“代偿”：短时保护，长期锁住真实表达。',
      },
      {
        order: '03',
        label: '练习',
        text: '先呼气到尽头，再让声音落在气息上，保持三秒不塌。',
      },
    ],
  },
  {
    id: 'card-demo-002',
    title: '边界不是墙，是可移动的膜',
    content: '真正稳定的关系，不靠无限靠近，也不靠彻底隔离，而靠可协商的距离。',
    tags: ['心理学/边界', '关系'],
    createdAt: seededAt,
    updatedAt: seededAt,
    highlights: [
      {
        order: '01',
        label: '识别',
        text: '先分清“我的感受”与“你的责任”。',
      },
      {
        order: '02',
        label: '表达',
        text: '用请求代替指责，让边界可以被听见。',
      },
    ],
  },
  {
    id: 'card-demo-003',
    title: '先让气息落下，再让声音升起',
    content: '高音不是向上够，而是让气息稳定下沉，把空间留给共鸣。',
    tags: ['声乐/咽音', '练习'],
    createdAt: seededAt,
    updatedAt: seededAt,
    highlights: [
      {
        order: '01',
        label: '坐稳',
        text: '肩颈松开，肋骨保持弹性。',
      },
      {
        order: '02',
        label: '落气',
        text: '呼气到尽头，再让声音落在气息上。',
      },
    ],
  },
]

export const seedBoardItems: BoardItem[] = [
  {
    id: 'projection-001',
    cardId: 'card-demo-001',
    boardId: 'board-main',
    x: -190,
    y: -150,
    width: 400,
  },
  {
    id: 'projection-002',
    cardId: 'card-demo-002',
    boardId: 'board-main',
    x: -600,
    y: -60,
    width: 300,
  },
  {
    id: 'projection-003',
    cardId: 'card-demo-003',
    boardId: 'board-main',
    x: 390,
    y: 140,
    width: 320,
  },
]
