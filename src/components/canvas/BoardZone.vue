<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref } from 'vue'
import { Grip, Pencil, X } from '@lucide/vue'
import { canvasCameraKey } from '../../composables/useCanvas'
import { getItemRect } from '../../lib/card-metrics'
import {
  emitCardDragBatch,
  emitCardDragEndBatch,
  subscribeCardDragBatch,
  subscribeCardDragEndBatch,
} from '../../lib/card-drag-bus'
import { useBoardStore } from '../../stores/board'
import type { BoardItem, BoardZone } from '../../types'

const props = defineProps<{
  zone: BoardZone
}>()

const camera = inject(canvasCameraKey)
const board = useBoardStore()
const rootEl = ref<HTMLElement | null>(null)
const titleInput = ref<HTMLInputElement | null>(null)
const editing = ref(false)
const draftTitle = ref(props.zone.title)
const isDragging = ref(false)
const livePositions = new Map<string, { x: number; y: number }>()
const liveTick = ref(0)

const members = computed(() =>
  board.entries.filter((entry) => entry.item.zoneId === props.zone.id),
)

const bounds = computed(() => {
  liveTick.value
  if (!members.value.length) return null
  const rects = members.value.map((entry) => {
    const rect = getItemRect(entry.item)
    const live = isDragging.value ? undefined : livePositions.get(entry.item.id)
    return live ? { ...rect, x: live.x, y: live.y } : rect
  })
  const left = Math.min(...rects.map((rect) => rect.x)) - 28
  const top = Math.min(...rects.map((rect) => rect.y)) - 58
  const right = Math.max(...rects.map((rect) => rect.x + rect.width)) + 28
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height)) + 28
  return { left, top, width: right - left, height: bottom - top }
})

let pointerId: number | null = null
let startClient = { x: 0, y: 0 }
let latestDelta = { x: 0, y: 0 }
let activeItems: BoardItem[] = []

function cardElement(itemId: string) {
  return document.querySelector<HTMLElement>(
    `[data-world-item][data-item-id="${CSS.escape(itemId)}"]`,
  )
}

function applyDelta(deltaX: number, deltaY: number) {
  if (!isDragging.value) return
  rootEl.value?.style.setProperty(
    'transform',
    `translate3d(${deltaX}px, ${deltaY}px, 0)`,
  )
  for (const item of activeItems) {
    cardElement(item.id)?.style.setProperty(
      'transform',
      `translate3d(${deltaX}px, ${deltaY}px, 0)`,
    )
  }
  emitCardDragBatch({
    items: activeItems.map((item) => ({
      itemId: item.id,
      cardId: item.cardId,
      x: item.x + deltaX,
      y: item.y + deltaY,
    })),
  })
}

function clearTransforms() {
  rootEl.value?.style.removeProperty('transform')
  for (const item of activeItems) {
    cardElement(item.id)?.style.removeProperty('transform')
  }
  if (activeItems.length) {
    emitCardDragEndBatch({
      items: activeItems.map((item) => ({
        itemId: item.id,
        cardId: item.cardId,
      })),
    })
  }
}

function removeListeners() {
  window.removeEventListener('pointermove', handlePointerMove)
  window.removeEventListener('pointerup', handlePointerUp)
  window.removeEventListener('pointercancel', cancelDrag)
  window.removeEventListener('blur', cancelDrag)
}

function cancelDrag() {
  removeListeners()
  if (rootEl.value && pointerId !== null) {
    try {
      rootEl.value.releasePointerCapture(pointerId)
    } catch {
      // The browser may already have released capture.
    }
  }
  pointerId = null
  isDragging.value = false
  clearTransforms()
  activeItems = []
}

function handlePointerMove(event: PointerEvent) {
  if (pointerId !== event.pointerId || !camera) return
  const scale = camera.getViewport().scale
  latestDelta = {
    x: (event.clientX - startClient.x) / Math.max(scale, 0.01),
    y: (event.clientY - startClient.y) / Math.max(scale, 0.01),
  }
  if (!isDragging.value) {
    if (Math.hypot(latestDelta.x, latestDelta.y) < 3) return
    isDragging.value = true
  }
  applyDelta(latestDelta.x, latestDelta.y)
}

async function handlePointerUp(event: PointerEvent) {
  if (pointerId !== event.pointerId) return
  const delta = latestDelta
  removeListeners()
  try {
    rootEl.value?.releasePointerCapture(pointerId)
  } catch {
    // The browser may already have released capture.
  }
  pointerId = null
  isDragging.value = false

  clearTransforms()
  activeItems = []
  if (Math.hypot(delta.x, delta.y) >= 3) {
    await board.moveZone(props.zone.id, delta.x, delta.y)
  }
  await nextTick()
}

function startDrag(event: PointerEvent) {
  if (event.button !== 0 || camera?.isSpaceHeld?.value) return
  if (
    event.target instanceof Element &&
    event.target.closest('[data-zone-interactive]')
  ) {
    return
  }
  pointerId = event.pointerId
  startClient = { x: event.clientX, y: event.clientY }
  latestDelta = { x: 0, y: 0 }
  activeItems = members.value.map((entry) => plainItem(entry.item))
  rootEl.value?.setPointerCapture(event.pointerId)
  window.addEventListener('pointermove', handlePointerMove)
  window.addEventListener('pointerup', handlePointerUp)
  window.addEventListener('pointercancel', cancelDrag)
  window.addEventListener('blur', cancelDrag)
  event.preventDefault()
  event.stopPropagation()
}

function plainItem(item: BoardItem): BoardItem {
  return { ...item }
}

async function beginRename() {
  draftTitle.value = props.zone.title
  editing.value = true
  await nextTick()
  titleInput.value?.focus()
  titleInput.value?.select()
}

async function commitRename() {
  if (!editing.value) return
  editing.value = false
  if (draftTitle.value.trim() === props.zone.title) return
  await board.renameZone(props.zone.id, draftTitle.value)
}

function cancelRename() {
  editing.value = false
  draftTitle.value = props.zone.title
}

async function dissolve() {
  await board.dissolveZone(props.zone.id)
}

const disposePosition = subscribeCardDragBatch((event) => {
  for (const item of event.items) {
    livePositions.set(item.itemId, { x: item.x, y: item.y })
  }
  liveTick.value += 1
})

const disposeEnd = subscribeCardDragEndBatch((event) => {
  for (const item of event.items) livePositions.delete(item.itemId)
  liveTick.value += 1
})

onBeforeUnmount(() => {
  disposePosition()
  disposeEnd()
  removeListeners()
})
</script>

<template>
  <section
    v-if="bounds"
    ref="rootEl"
    class="board-zone pointer-events-none absolute rounded-[34px]"
    :class="`is-${zone.color}`"
    :style="{
      left: `${bounds.left}px`,
      top: `${bounds.top}px`,
      width: `${bounds.width}px`,
      height: `${bounds.height}px`,
    }"
    :data-board-zone="zone.id"
    :aria-label="`区域：${zone.title}`"
  >
    <header
      class="pointer-events-auto absolute left-5 top-3 flex max-w-[calc(100%-2.5rem)] cursor-grab items-center gap-2 rounded-full border px-2.5 py-1.5 shadow-sm backdrop-blur-xl active:cursor-grabbing"
      :class="{ 'is-dragging': isDragging }"
      data-zone-drag-handle
      tabindex="0"
      :aria-label="`移动区域：${zone.title}`"
      @pointerdown="startDrag"
    >
      <Grip :size="10" :stroke-width="1.8" aria-hidden="true" />
      <input
        v-if="editing"
        ref="titleInput"
        v-model="draftTitle"
        data-zone-interactive
        maxlength="40"
        class="min-w-0 flex-1 border-0 bg-transparent p-0 font-serif text-[12px] outline-none"
        aria-label="区域名称"
        @pointerdown.stop
        @click.stop
        @keydown.enter.prevent="commitRename"
        @keydown.esc.prevent="cancelRename"
        @blur="commitRename"
      />
      <button
        v-else
        type="button"
        class="min-w-0 truncate border-0 bg-transparent p-0 font-serif text-[12px]"
        data-zone-interactive
        :title="`重命名区域：${zone.title}`"
        @pointerdown.stop
        @click.stop="beginRename"
      >
        {{ zone.title }}
      </button>
      <span class="shrink-0 font-mono text-[8px] opacity-60">
        {{ members.length }}
      </span>
      <button
        type="button"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-45 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2"
        data-zone-interactive
        aria-label="重命名区域"
        @pointerdown.stop
        @click.stop="beginRename"
      >
        <Pencil :size="9" :stroke-width="1.8" aria-hidden="true" />
      </button>
      <button
        type="button"
        class="flex h-5 w-5 shrink-0 items-center justify-center rounded-full opacity-45 transition-opacity hover:bg-rose-500/10 hover:text-rose-600 hover:opacity-100 focus:outline-none focus-visible:ring-2 dark:hover:text-rose-300"
        data-zone-interactive
        aria-label="解散区域"
        title="解散区域，保留卡片"
        @pointerdown.stop
        @click.stop="dissolve"
      >
        <X :size="10" :stroke-width="2" aria-hidden="true" />
      </button>
    </header>
  </section>
</template>

<style scoped>
.board-zone {
  z-index: 0;
  border: 1px solid var(--zone-border);
  background:
    radial-gradient(circle at 18% 0%, var(--zone-glow), transparent 34%),
    var(--zone-fill);
}

.board-zone header {
  border-color: var(--zone-border);
  background: var(--zone-header);
  color: var(--zone-ink);
}

.board-zone.is-amber {
  --zone-border: rgba(180, 83, 9, 0.23);
  --zone-glow: rgba(245, 158, 11, 0.16);
  --zone-fill: rgba(245, 158, 11, 0.025);
  --zone-header: rgba(255, 251, 235, 0.88);
  --zone-ink: rgb(146 64 14);
}

.board-zone.is-sage {
  --zone-border: rgba(79, 112, 83, 0.23);
  --zone-glow: rgba(111, 143, 114, 0.15);
  --zone-fill: rgba(111, 143, 114, 0.028);
  --zone-header: rgba(247, 250, 246, 0.88);
  --zone-ink: rgb(63 98 68);
}

.board-zone.is-sky {
  --zone-border: rgba(54, 102, 143, 0.22);
  --zone-glow: rgba(89, 143, 189, 0.14);
  --zone-fill: rgba(89, 143, 189, 0.025);
  --zone-header: rgba(246, 250, 253, 0.9);
  --zone-ink: rgb(39 91 132);
}

.board-zone.is-rose {
  --zone-border: rgba(159, 80, 102, 0.22);
  --zone-glow: rgba(190, 105, 128, 0.14);
  --zone-fill: rgba(190, 105, 128, 0.025);
  --zone-header: rgba(253, 249, 250, 0.9);
  --zone-ink: rgb(139 63 84);
}

.dark .board-zone.is-amber {
  --zone-border: rgba(251, 191, 36, 0.18);
  --zone-glow: rgba(251, 191, 36, 0.08);
  --zone-fill: rgba(251, 191, 36, 0.025);
  --zone-header: rgba(39, 35, 28, 0.9);
  --zone-ink: rgb(253 230 138);
}

.dark .board-zone.is-sage {
  --zone-border: rgba(134, 190, 142, 0.17);
  --zone-glow: rgba(134, 190, 142, 0.075);
  --zone-fill: rgba(134, 190, 142, 0.02);
  --zone-header: rgba(29, 38, 32, 0.9);
  --zone-ink: rgb(187 220 191);
}

.dark .board-zone.is-sky {
  --zone-border: rgba(125, 185, 232, 0.17);
  --zone-glow: rgba(125, 185, 232, 0.075);
  --zone-fill: rgba(125, 185, 232, 0.02);
  --zone-header: rgba(27, 36, 44, 0.9);
  --zone-ink: rgb(186 221 247);
}

.dark .board-zone.is-rose {
  --zone-border: rgba(235, 151, 173, 0.17);
  --zone-glow: rgba(235, 151, 173, 0.075);
  --zone-fill: rgba(235, 151, 173, 0.02);
  --zone-header: rgba(43, 29, 35, 0.9);
  --zone-ink: rgb(245 194 208);
}

.board-zone header:focus-visible {
  outline: 2px solid var(--zone-border);
  outline-offset: 2px;
}

.board-zone header.is-dragging {
  opacity: 0.82;
}
</style>
