<script setup lang="ts">
import { computed, inject, onBeforeUnmount, ref, watch } from 'vue'
import { Check, Copy, LoaderCircle, Sparkles, X } from '@lucide/vue'
import { canvasCameraKey } from '../../composables/useCanvas'
import { AIClientError, chatCompletion } from '../../lib/ai/deepseek'
import {
  buildWormholePrompt,
  parseWormholeLabel,
  WORMHOLE_SYSTEM_PROMPT,
} from '../../lib/ai/prompts'
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
import { useAIStore } from '../../stores/ai'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'

const camera = inject(canvasCameraKey)
const board = useBoardStore()
const toast = useToastStore()
const ai = useAIStore()

if (!camera) {
  throw new Error('SelectionChrome must be rendered inside CanvasStage')
}

const livePositions = new Map<string, { x: number; y: number }>()
const liveTick = ref(0)
const copied = ref(false)
const wormholeOpen = ref(false)
const wormholeLoading = ref(false)
const wormholeResult = ref('')
const wormholeError = ref('')
let copiedTimer: ReturnType<typeof setTimeout> | null = null
let wormholeController: AbortController | null = null

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
const canUseWormhole = computed(
  () => selectableCount.value === 2 && ai.wormholeEnabled,
)

const wormholePair = computed(() =>
  selectedEntries.value.length === 2
    ? selectedEntries.value.map((entry) => entry.card)
    : null,
)

const wormholePosition = computed(() => {
  const toolbar = toolbarPosition.value
  if (!toolbar) return null

  const halfWidth = Math.min(360, window.innerWidth - 24) / 2
  return {
    left: Math.max(
      halfWidth + 12,
      Math.min(toolbar.left, window.innerWidth - halfWidth - 12),
    ),
    top: Math.max(72, Math.min(toolbar.top + 52, window.innerHeight - 252)),
  }
})

const wormholePairKey = computed(
  () =>
    wormholePair.value
      ?.map((card) => card.id)
      .sort()
      .join(':') ?? '',
)

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
  wormholeController?.abort()
  if (copiedTimer) clearTimeout(copiedTimer)
  window.removeEventListener('keydown', handleWormholeKeydown)
})

watch(wormholePairKey, () => closeWormhole())

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

function closeWormhole() {
  wormholeController?.abort()
  wormholeController = null
  wormholeOpen.value = false
  wormholeLoading.value = false
  wormholeResult.value = ''
  wormholeError.value = ''
}

async function openWormhole() {
  const pair = wormholePair.value
  if (!pair || !canUseWormhole.value) return

  wormholeController?.abort()
  const controller = new AbortController()
  wormholeController = controller
  wormholeOpen.value = true
  wormholeLoading.value = true
  wormholeResult.value = ''
  wormholeError.value = ''

  try {
    const raw = await chatCompletion(
      ai.config,
      [
        { role: 'system', content: WORMHOLE_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildWormholePrompt(pair[0], pair[1]),
        },
      ],
      {
        stream: true,
        maxTokens: 100,
        temperature: 0.25,
        timeoutMs: 25_000,
        signal: controller.signal,
        onToken: (token) => {
          if (!controller.signal.aborted) wormholeResult.value += token
        },
      },
    )
    if (controller.signal.aborted) return

    const label = parseWormholeLabel(raw)
    if (!label) {
      throw new AIClientError('invalid_response', 'AI 没有返回可用连线说明。')
    }
    wormholeResult.value = label
  } catch (cause) {
    if (controller.signal.aborted) return
    wormholeError.value =
      cause instanceof Error ? cause.message : '虫洞探针暂时不可用。'
  } finally {
    if (wormholeController === controller) {
      wormholeController = null
      wormholeLoading.value = false
    }
  }
}

async function adoptWormhole() {
  const pair = wormholePair.value
  const label = parseWormholeLabel(wormholeResult.value)
  if (!pair || !label || wormholeLoading.value) return

  const connection = await board.createConnection(pair[0].id, pair[1].id, label)
  if (connection) closeWormhole()
}

function handleWormholeKeydown(event: KeyboardEvent) {
  if (!wormholeOpen.value || event.isComposing) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    closeWormhole()
    return
  }

  const target = event.target
  if (
    target instanceof HTMLElement &&
    target.closest(
      'input, textarea, select, [contenteditable], [role="textbox"]',
    )
  ) {
    return
  }

  // Let buttons inside the probe use their native Enter activation.
  if (target instanceof HTMLElement && target.closest('[data-wormhole]')) {
    return
  }

  if (
    event.key === 'Enter' &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !event.shiftKey &&
    wormholeResult.value &&
    !wormholeLoading.value
  ) {
    event.preventDefault()
    event.stopImmediatePropagation()
    void adoptWormhole()
  }
}

window.addEventListener('keydown', handleWormholeKeydown)
</script>

<template>
  <div
    v-if="selectableCount > 1 && isVisible"
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

      <template v-if="canUseWormhole">
        <span class="selection-divider" aria-hidden="true" />
        <button
          type="button"
          class="selection-wormhole"
          :aria-pressed="wormholeOpen"
          aria-label="寻找底层关联"
          data-wormhole-trigger
          @click.stop="wormholeOpen ? closeWormhole() : openWormhole()"
        >
          <Sparkles :size="13" :stroke-width="1.7" aria-hidden="true" />
          <span>寻找关联</span>
        </button>
      </template>
    </div>

    <section
      v-if="wormholeOpen && wormholePosition"
      class="wormhole-panel pointer-events-auto"
      :style="{
        left: `${wormholePosition.left}px`,
        top: `${wormholePosition.top}px`,
      }"
      role="dialog"
      aria-modal="false"
      aria-labelledby="wormhole-title"
      data-wormhole
      @pointerdown.stop
      @click.stop
    >
      <header class="wormhole-heading">
        <span class="wormhole-mark" aria-hidden="true">
          <Sparkles :size="13" :stroke-width="1.65" />
        </span>
        <span>
          <strong id="wormhole-title">虫洞探针</strong>
          <small>底层机制同构</small>
        </span>
        <button
          type="button"
          class="wormhole-close"
          aria-label="关闭虫洞探针"
          @click="closeWormhole"
        >
          <X :size="12" :stroke-width="1.8" aria-hidden="true" />
        </button>
      </header>

      <div class="wormhole-body" aria-live="polite">
        <p v-if="wormholeError" class="wormhole-error">
          {{ wormholeError }}
        </p>
        <p
          v-else-if="wormholeLoading && !wormholeResult"
          class="wormhole-loading"
        >
          <LoaderCircle
            :size="12"
            :stroke-width="1.8"
            class="animate-spin"
            aria-hidden="true"
          />
          正在穿过表层术语…
        </p>
        <p v-else class="wormhole-result" data-wormhole-result>
          {{ wormholeResult }}
          <span
            v-if="wormholeLoading"
            class="wormhole-caret"
            aria-hidden="true"
          />
        </p>
      </div>

      <footer class="wormhole-actions">
        <button type="button" class="wormhole-cancel" @click="closeWormhole">
          放弃 · Esc
        </button>
        <button
          type="button"
          class="wormhole-adopt"
          :disabled="
            wormholeLoading ||
            Boolean(wormholeError) ||
            !parseWormholeLabel(wormholeResult)
          "
          data-wormhole-adopt
          @click="adoptWormhole"
        >
          <Check :size="12" :stroke-width="2" aria-hidden="true" />
          建立连线 · Enter
        </button>
      </footer>
    </section>
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

.selection-wormhole {
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
  color: rgb(120 53 15);
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.selection-wormhole:hover,
.selection-wormhole[aria-pressed='true'] {
  background: rgba(245, 158, 11, 0.11);
  color: rgb(146 64 14);
}

.selection-wormhole:active {
  transform: scale(0.975);
}

.selection-wormhole:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.42);
  outline-offset: 2px;
}

.dark .selection-wormhole {
  color: rgb(253 230 138 / 0.82);
}

.dark .selection-wormhole:hover,
.dark .selection-wormhole[aria-pressed='true'] {
  background: rgba(253, 230, 138, 0.075);
  color: rgb(254 243 199);
}

.dark .selection-wormhole:focus-visible {
  outline-color: rgba(253, 230, 138, 0.35);
}

.wormhole-panel {
  position: fixed;
  z-index: 36;
  width: min(360px, calc(100vw - 24px));
  overflow: hidden;
  transform: translateX(-50%);
  border: 1px solid rgba(180, 83, 9, 0.16);
  border-radius: 20px;
  background:
    linear-gradient(
      145deg,
      rgba(255, 251, 235, 0.92),
      rgba(253, 251, 247, 0.91)
    ),
    rgba(253, 251, 247, 0.92);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.9),
    0 26px 70px -30px rgba(68, 38, 13, 0.5),
    0 2px 8px rgba(41, 37, 36, 0.06);
  backdrop-filter: blur(22px) saturate(1.2);
  animation: wormhole-arrive 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.dark .wormhole-panel {
  border-color: rgba(253, 230, 138, 0.14);
  background:
    linear-gradient(145deg, rgba(38, 32, 25, 0.94), rgba(24, 24, 27, 0.94)),
    rgba(24, 24, 27, 0.94);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.055),
    0 32px 80px -30px rgba(0, 0, 0, 0.92);
}

.wormhole-heading {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  border-bottom: 1px solid rgba(180, 83, 9, 0.1);
  padding: 0.7rem 0.75rem 0.65rem;
}

.wormhole-mark {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(180, 83, 9, 0.14);
  border-radius: 0.65rem;
  background: rgba(245, 158, 11, 0.08);
  color: rgb(180 83 9);
}

.wormhole-heading > span:nth-child(2) {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 0.1rem;
}

.wormhole-heading strong {
  font-family: ui-serif, Georgia, serif;
  font-size: 12px;
  font-weight: 550;
  color: rgb(68 64 60);
}

.wormhole-heading small {
  font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
  font-size: 7px;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgb(168 162 158);
}

.wormhole-close {
  display: inline-flex;
  width: 1.75rem;
  height: 1.75rem;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: rgb(168 162 158);
  transition:
    background-color 150ms ease,
    color 150ms ease;
}

.wormhole-close:hover {
  background: rgba(231, 229, 224, 0.7);
  color: rgb(68 64 60);
}

.wormhole-body {
  min-height: 5.25rem;
  padding: 0.9rem 1rem;
}

.wormhole-loading,
.wormhole-error,
.wormhole-result {
  margin: 0;
  font-size: 12px;
  line-height: 1.75;
}

.wormhole-loading {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  color: rgb(120 113 108);
}

.wormhole-error {
  color: rgb(190 18 60);
}

.wormhole-result {
  font-family: ui-serif, Georgia, serif;
  font-size: 14px;
  line-height: 1.8;
  color: rgb(68 64 60);
}

.wormhole-caret {
  display: inline-block;
  width: 1px;
  height: 0.9em;
  margin-left: 2px;
  vertical-align: -0.08em;
  background: rgb(217 119 6 / 0.65);
  animation: wormhole-caret 800ms steps(1) infinite;
}

.wormhole-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border-top: 1px solid rgba(180, 83, 9, 0.1);
  padding: 0.55rem;
}

.wormhole-cancel,
.wormhole-adopt {
  display: inline-flex;
  height: 1.9rem;
  align-items: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 9999px;
  padding: 0 0.7rem;
  font-size: 10px;
  transition:
    background-color 150ms ease,
    opacity 150ms ease;
}

.wormhole-cancel {
  background: transparent;
  color: rgb(120 113 108);
}

.wormhole-cancel:hover {
  background: rgba(231, 229, 224, 0.65);
}

.wormhole-adopt {
  background: rgb(120 53 15);
  color: rgb(255 251 235);
}

.wormhole-adopt:hover:not(:disabled) {
  background: rgb(146 64 14);
}

.wormhole-adopt:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.wormhole-cancel:focus-visible,
.wormhole-adopt:focus-visible,
.wormhole-close:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.42);
  outline-offset: 2px;
}

.dark .wormhole-heading {
  border-bottom-color: rgba(253, 230, 138, 0.08);
}

.dark .wormhole-mark {
  border-color: rgba(253, 230, 138, 0.14);
  background: rgba(253, 230, 138, 0.055);
  color: rgb(253 230 138 / 0.8);
}

.dark .wormhole-heading strong,
.dark .wormhole-result {
  color: rgb(228 228 231);
}

.dark .wormhole-heading small {
  color: rgb(113 113 122);
}

.dark .wormhole-close {
  color: rgb(113 113 122);
}

.dark .wormhole-close:hover,
.dark .wormhole-cancel:hover {
  background: rgba(255, 255, 255, 0.065);
  color: rgb(228 228 231);
}

.dark .wormhole-loading,
.dark .wormhole-cancel {
  color: rgb(161 161 170);
}

.dark .wormhole-error {
  color: rgb(251 113 133);
}

.dark .wormhole-caret {
  background: rgba(253, 230, 138, 0.6);
}

.dark .wormhole-actions {
  border-top-color: rgba(253, 230, 138, 0.08);
}

.dark .wormhole-adopt {
  background: rgb(253 230 138);
  color: rgb(39 39 42);
}

.dark .wormhole-adopt:hover:not(:disabled) {
  background: rgb(254 243 199);
}

@keyframes wormhole-arrive {
  from {
    opacity: 0;
    transform: translateX(-50%) translateY(-5px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateX(-50%) translateY(0) scale(1);
  }
}

@keyframes wormhole-caret {
  50% {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .selection-toolbar,
  .selection-copy,
  .selection-copy-icon,
  .selection-wormhole {
    transition: none;
  }

  .wormhole-panel {
    animation: none;
  }

  .wormhole-caret {
    animation: none;
  }
}
</style>
