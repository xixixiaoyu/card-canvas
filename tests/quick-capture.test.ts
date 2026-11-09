import { mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineComponent, h, nextTick, ref, type Ref } from 'vue'
import QuickCapture from '../src/components/capture/QuickCapture.vue'
import type { CanvasCamera } from '../src/composables/useCanvas'
import { db } from '../src/db'
import { useBoardStore } from '../src/stores/board'
import { useToastStore } from '../src/stores/toast'

let wrapper: VueWrapper | null = null

const camera: CanvasCamera = {
  getViewport: () => ({ panX: 0, panY: 0, scale: 1 }),
  getContainerRect: () => new DOMRect(0, 0, 800, 600),
  screenToWorld: (point) => point,
  worldToScreen: (point) => point,
}

function mountOpenCapture(initial = true) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const open = ref(initial)

  const Host = defineComponent({
    setup: () => () =>
      h(QuickCapture, {
        open: open.value,
        camera,
        boardId: 'board-main',
        'onUpdate:open': (value: boolean) => {
          open.value = value
        },
      }),
  })

  wrapper = mount(Host, {
    global: { plugins: [pinia] },
    attachTo: document.body,
  })

  return { open: open as Ref<boolean>, host: wrapper }
}

function field(selector: string) {
  const element = document.body.querySelector<
    HTMLInputElement | HTMLTextAreaElement
  >(selector)

  if (!element) throw new Error(`Missing field: ${selector}`)
  return element
}

function setField(selector: string, value: string) {
  const element = field(selector)
  element.value = value
  element.dispatchEvent(new Event('input', { bubbles: true }))
}

function pressEnterOn(selector: string) {
  field(selector).dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  )
}

async function save() {
  window.dispatchEvent(
    new KeyboardEvent('keydown', {
      key: 'Enter',
      code: 'Enter',
      metaKey: true,
      bubbles: true,
    }),
  )
  await nextTick()
}

describe('QuickCapture', () => {
  beforeEach(async () => {
    await db.delete()
    await db.open()
    document.body.innerHTML = ''
  })

  afterEach(async () => {
    wrapper?.unmount()
    wrapper = null
    useToastStore().clear()
    await db.delete()
  })

  it('saves a normalized card, closes immediately and places it on the canvas', async () => {
    const { open } = mountOpenCapture()
    expect(document.body.querySelector('[role="dialog"]')).not.toBeNull()

    setField('input[aria-label="卡片标题"]', '速记标题')
    setField('textarea[aria-label="卡片正文"]', '正文包含 #捕获 标签')
    setField('input[aria-label="添加标签"]', '设计')
    pressEnterOn('input[aria-label="添加标签"]')

    await save()
    expect(open.value).toBe(false)

    await vi.waitFor(async () => {
      expect(await db.cards.count()).toBe(1)
    })

    const board = useBoardStore()
    expect(board.cards).toHaveLength(1)
    expect(board.cards[0].tags).toEqual(['设计', '捕获'])
    expect(board.items).toHaveLength(1)
    expect(board.items[0].cardId).toBe(board.cards[0].id)
    expect(await db.boardItems.count()).toBe(1)
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
  })

  it('closes on Escape without clearing the draft', async () => {
    const { open } = mountOpenCapture()
    setField('input[aria-label="卡片标题"]', '未保存草稿')

    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    await nextTick()
    expect(open.value).toBe(false)

    open.value = true
    await nextTick()
    expect(field('input[aria-label="卡片标题"]').value).toBe('未保存草稿')
  })

  it('restores the draft and reopens when the IndexedDB write fails', async () => {
    const { open } = mountOpenCapture()
    setField('input[aria-label="卡片标题"]', '会失败的速记')
    setField('textarea[aria-label="卡片正文"]', '这段文字必须被保留')

    let rejectWrite: ((reason?: unknown) => void) | undefined
    vi.spyOn(db.cards, 'put').mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectWrite = reject
      }) as never,
    )

    await save()
    expect(open.value).toBe(false)
    rejectWrite?.(new Error('disk full'))
    await nextTick()
    await nextTick()

    await vi.waitFor(() => {
      expect(open.value).toBe(true)
    })
    expect(field('input[aria-label="卡片标题"]').value).toBe('会失败的速记')
    expect(field('textarea[aria-label="卡片正文"]').value).toBe(
      '这段文字必须被保留',
    )
    expect(useToastStore().toasts).toHaveLength(1)
    expect(useToastStore().toasts[0].tone).toBe('error')
  })
})
