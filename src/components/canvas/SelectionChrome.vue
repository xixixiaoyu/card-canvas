<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref } from 'vue'
import { Copy } from '@lucide/vue'
import { canvasCameraKey } from '../../composables/useCanvas'
import { getItemRect } from '../../lib/card-metrics'
import {
  subscribeCardDragBatch,
  subscribeCardDragEndBatch,
} from '../../lib/card-drag-bus'
import {
  buildMarkdown,
  copyTextToClipboard,
  type MarkdownEntry,
} from '../../lib/markdownExport'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'

const camera = inject(canvasCameraKey)
const board = useBoardStore()
const toast = useToastStore()

if (!camera) {
  throw new Error('SelectionChrome must be rendered inside CanvasStage')
}

const livePositions = new Map<string, { x: number; y: number }>()
const liveTick = ref(0)
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null

const selectedEntries = computed(() =>
  board.entries.filter((entry) => board.selectedItemIds.has(entry.item.id)),
)

const selectedWorldRects = computed(() => {
  liveTick.value
  return selectedEntries.value.map((entry) => {
    const rect = getItemRect(entry.item)
    const live = livePositions.get(entry.item.id)
    return live ? { ...rect, x: live.x, y: live.y } : rect
  })
})

const worldBounds = computed(() => {
  const rects = selectedWorldRects.value
  if (!rects.length) return null

  const left = Math.min(...rects.map((rect) => rect.x))
  const top = Math.min(...rects.map((rect) => rect.y))
  const right = Math.max(...rects.map((rect) => rect.x + rect.width))
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))

  return { left, top, width: right - left, height: bottom - top }
})

const screenBounds = computed(() => {
  const viewport = camera.viewport.value
  const container = camera.getContainerRect()
  const bounds = worldBounds.value
  if (!container || !bounds) return null

  return {
    left: container.left + viewport.panX + bounds.left * viewport.scale,
    top: container.top + viewport.panY + bounds.top * viewport.scale,
    width: bounds.width * viewport.scale,
    height: bounds.height * viewport.scale,
  }
})

const isVisible = computed(() => {
  const bounds = screenBounds.value
  if (!bounds) return false

  return (
    bounds.left < window.innerWidth &&
    bounds.left + bounds.width > 0 &&
    bounds.top < window.innerHeight &&
    bounds.top + bounds.height > 0
  )
})

const toolbarPosition = computed(() => {
  const bounds = screenBounds.value
  if (!bounds) return null

  const above = bounds.top - 48
  const below = bounds.top + bounds.height + 14
  const maxTop = Math.max(72, window.innerHeight - 96)
  const top =
    above >= 72 ? Math.min(above, maxTop) : below <= maxTop ? below : 72

  return {
    left: Math.min(
      Math.max(bounds.left + bounds.width / 2, 110),
      window.innerWidth - 110,
    ),
    top,
  }
})

const selectableCount = computed(() => selectedEntries.value.length)

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
  if (copiedTimer) clearTimeout(copiedTimer)
})

async function copyMarkdown() {
  const entries: MarkdownEntry[] = selectedEntries.value.map((entry) => ({
    card: entry.card,
    item: entry.item,
  }))
  const markdown = buildMarkdown(entries, board.connections)
  if (!markdown) return

  const ok = await copyTextToClipboard(markdown)
  if (!ok) {
    toast.push('复制失败，请允许剪贴板权限后重试。', { tone: 'error' })
    return
  }

  toast.push(`已复制 ${entries.length} 张卡片大纲到剪贴板。`, {
    tone: 'success',
    timeout: 2800,
  })
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => {
    copied.value = false
  }, 1600)
}
</script>

<template>
  <div
    v-if="selectedEntries.length && isVisible"
    class="selection-chrome pointer-events-none"
    data-selection-chrome
  >
    <div
      v-if="selectableCount > 1 && screenBounds"
      class="selection-bounds"
      :style="{
        left: `${screenBounds.left - 6}px`,
        top: `${screenBounds.top - 6}px`,
        width: `${screenBounds.width + 12}px`,
        height: `${screenBounds.height + 12}px`,
      }"
      aria-hidden="true"
    />

    <div
      v-if="toolbarPosition"
      class="selection-toolbar pointer-events-auto"
      :style="{
        left: `${toolbarPosition.left}px`,
        top: `${toolbarPosition.top}px`,
      }"
      data-canvas-ui
      @pointerdown.stop
      @click.stop
    >
      <span class="selection-count"> {{ selectableCount }} SELECTED </span>
      <span class="selection-divider" aria-hidden="true" />
      <button
        type="button"
        class="selection-copy"
        :aria-label="copied ? '已复制 Markdown' : '复制 Markdown'"
        @click.stop="copyMarkdown"
      >
        <Copy :size="12" :stroke-width="1.8" aria-hidden="true" />
        {{ copied ? '已复制' : '复制 Markdown' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.selection-chrome {
  position: fixed;
  inset: 0;
  z-index: 35;
}

.selection-bounds {
  position: fixed;
  border: 1px dashed rgba(217, 119, 6, 0.42);
  border-radius: 34px;
  background: rgba(217, 119, 6, 0.025);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.22) inset;
}

.dark .selection-bounds {
  border-color: rgba(147, 197, 253, 0.38);
  background: rgba(147, 197, 253, 0.025);
}

.selection-toolbar {
  position: fixed;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transform: translateX(-50%);
  border: 1px solid rgba(214, 211, 209, 0.82);
  border-radius: 9999px;
  background: rgba(253, 251, 247, 0.9);
  padding: 0.3rem 0.35rem 0.3rem 0.75rem;
  box-shadow:
    0 10px 30px -16px rgba(41, 37, 36, 0.45),
    0 1px 2px rgba(41, 37, 36, 0.06);
  backdrop-filter: blur(16px);
}

.dark .selection-toolbar {
  border-color: rgba(255, 255, 255, 0.12);
  background: rgba(24, 24, 27, 0.9);
  box-shadow:
    0 14px 34px -16px rgba(0, 0, 0, 0.8),
    0 1px 2px rgba(0, 0, 0, 0.4);
}

.selection-count {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 8px;
  letter-spacing: 0.16em;
  color: rgb(120 113 108);
}

.dark .selection-count {
  color: rgb(161 161 170);
}

.selection-divider {
  width: 1px;
  height: 0.75rem;
  background: rgba(214, 211, 209, 0.8);
}

.dark .selection-divider {
  background: rgba(255, 255, 255, 0.1);
}

.selection-copy {
  display: inline-flex;
  height: 1.75rem;
  align-items: center;
  gap: 0.35rem;
  border-radius: 9999px;
  background: rgb(41 37 36);
  padding: 0 0.65rem;
  font-size: 10px;
  font-weight: 500;
  color: rgb(250 250 249);
  transition:
    background-color 160ms ease,
    transform 160ms ease;
}

.selection-copy:hover {
  background: rgb(68 64 60);
}

.selection-copy:active {
  transform: scale(0.97);
}

.selection-copy:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.45);
  outline-offset: 2px;
}

.dark .selection-copy {
  background: rgb(244 244 245);
  color: rgb(24 24 27);
}

.dark .selection-copy:hover {
  background: white;
}
</style>
