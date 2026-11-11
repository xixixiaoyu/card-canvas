<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy } from '@lucide/vue'
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

  const above = bounds.top - 52
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

watch(selectableCount, () => {
  copied.value = false
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = null
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
    copiedTimer = null
  }, 1600)
}
</script>

<template>
  <div
    v-if="selectableCount > 1 && isVisible"
    class="selection-chrome pointer-events-none"
    data-selection-chrome
  >
    <div
      v-if="screenBounds"
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
      :class="{ 'is-copied': copied }"
      :style="{
        left: `${toolbarPosition.left}px`,
        top: `${toolbarPosition.top}px`,
      }"
      :data-selected-count="selectableCount"
      data-canvas-ui
      @pointerdown.stop
      @click.stop
    >
      <span class="selection-context">
        <span class="selection-status" aria-hidden="true" />
        <span class="selection-count" aria-live="polite">
          {{ selectableCount }} SELECTED
        </span>
      </span>
      <span class="selection-divider" aria-hidden="true" />
      <button
        type="button"
        class="selection-copy"
        :aria-label="copied ? '已复制 Markdown' : '复制 Markdown'"
        @click.stop="copyMarkdown"
      >
        <span class="selection-copy-icon" aria-hidden="true">
          <Check v-if="copied" :size="13" :stroke-width="2" />
          <Copy v-else :size="13" :stroke-width="1.8" />
        </span>
        <span>{{ copied ? '已复制' : '复制 Markdown' }}</span>
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
  transform: translateX(-50%);
  border: 1px solid rgba(120, 113, 108, 0.2);
  border-radius: 9999px;
  background: rgba(250, 249, 247, 0.86);
  padding: 0.1875rem;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.86),
    0 12px 30px -18px rgba(41, 37, 36, 0.42),
    0 2px 5px rgba(41, 37, 36, 0.05);
  backdrop-filter: blur(20px) saturate(1.25);
  transition:
    border-color 180ms cubic-bezier(0.22, 1, 0.36, 1),
    background-color 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .selection-toolbar {
  border-color: rgba(255, 255, 255, 0.13);
  background: rgba(18, 18, 21, 0.82);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.07),
    0 16px 38px -18px rgba(0, 0, 0, 0.9),
    0 2px 6px rgba(0, 0, 0, 0.32);
}

.selection-context {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0 0.625rem 0 0.55rem;
}

.selection-status {
  width: 0.3125rem;
  height: 0.3125rem;
  border-radius: 9999px;
  background: rgb(180 83 9 / 0.85);
  box-shadow: 0 0 0 3px rgb(217 119 6 / 0.09);
}

.dark .selection-status {
  background: rgb(186 230 253 / 0.85);
  box-shadow: 0 0 0 3px rgb(147 197 253 / 0.08);
}

.selection-count {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 9px;
  font-weight: 550;
  line-height: 1;
  letter-spacing: 0.12em;
  color: rgb(87 83 78);
}

.dark .selection-count {
  color: rgb(196 196 202);
}

.selection-divider {
  width: 1px;
  height: 0.875rem;
  flex: none;
  background: rgba(120, 113, 108, 0.18);
}

.dark .selection-divider {
  background: rgba(255, 255, 255, 0.11);
}

.selection-copy {
  display: inline-flex;
  height: 2rem;
  align-items: center;
  gap: 0.4rem;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  padding: 0 0.75rem;
  font-size: 11px;
  font-weight: 550;
  letter-spacing: -0.005em;
  color: rgb(41 37 36);
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.selection-copy:hover {
  background: rgba(231, 229, 224, 0.72);
}

.selection-copy:active {
  transform: scale(0.975);
}

.selection-copy:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.42);
  outline-offset: 2px;
}

.selection-copy-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgb(180 83 9);
  transition: color 160ms ease;
}

.dark .selection-copy {
  color: rgb(244 244 245);
}

.dark .selection-copy:hover {
  background: rgba(255, 255, 255, 0.07);
}

.dark .selection-copy:focus-visible {
  outline-color: rgba(186, 230, 253, 0.42);
}

.dark .selection-copy-icon {
  color: rgb(186 230 253);
}

.selection-toolbar.is-copied {
  border-color: rgba(5, 150, 105, 0.26);
}

.dark .selection-toolbar.is-copied {
  border-color: rgba(110, 231, 183, 0.2);
}

.selection-toolbar.is-copied .selection-copy-icon {
  color: rgb(5 150 105);
}

.dark .selection-toolbar.is-copied .selection-copy-icon {
  color: rgb(110 231 183);
}

@media (prefers-reduced-motion: reduce) {
  .selection-toolbar,
  .selection-copy,
  .selection-copy-icon {
    transition: none;
  }
}
</style>
