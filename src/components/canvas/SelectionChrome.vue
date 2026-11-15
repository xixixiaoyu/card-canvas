<script setup lang="ts">
import { computed, inject, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  Check,
  Copy,
  Layers3,
  LoaderCircle,
  Sparkles,
  Trash2,
  Unlink,
  X,
} from '@lucide/vue'
import { canvasCameraKey } from '../../composables/useCanvas'
import { inferZoneTitle } from '../../lib/ai/deepseek'
import {
  buildZoneTitlePrompt,
  ZONE_TITLE_SYSTEM_PROMPT,
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
import type { BoardZoneColor } from '../../types'

const camera = inject(canvasCameraKey)
const ai = useAIStore()
const board = useBoardStore()
const toast = useToastStore()

const emit = defineEmits<{
  'open-ai-settings': []
}>()

if (!camera) {
  throw new Error('SelectionChrome must be rendered inside CanvasStage')
}

const livePositions = new Map<string, { x: number; y: number }>()
const liveTick = ref(0)
const copied = ref(false)
const deleteDialogOpen = ref(false)
const deleteBusy = ref(false)
const deleteTrigger = ref<HTMLButtonElement | null>(null)
const deleteDialog = ref<HTMLElement | null>(null)
const zoneDialogOpen = ref(false)
const zoneBusy = ref(false)
const zoneTitleGenerating = ref(false)
const zoneTitle = ref('')
const zoneColor = ref<BoardZoneColor>('amber')
const zoneInput = ref<HTMLInputElement | null>(null)
const zoneDialog = ref<HTMLElement | null>(null)
const zoneTrigger = ref<HTMLButtonElement | null>(null)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
let zoneTitleController: AbortController | null = null

const zoneColors: Array<{
  id: BoardZoneColor
  label: string
  className: string
}> = [
  { id: 'amber', label: '琥珀', className: 'bg-amber-500' },
  { id: 'sage', label: '鼠尾草', className: 'bg-emerald-600' },
  { id: 'sky', label: '雾蓝', className: 'bg-sky-600' },
  { id: 'rose', label: '玫瑰', className: 'bg-rose-500' },
]

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
  const edgeInset = Math.min(168, window.innerWidth / 2 - 8)

  return {
    left: Math.min(
      Math.max(bounds.left + bounds.width / 2, edgeInset),
      window.innerWidth - edgeInset,
    ),
    top,
  }
})

const selectableCount = computed(() => selectedEntries.value.length)
const selectedCardIds = computed(() =>
  selectedEntries.value.map((entry) => entry.card.id),
)

function setBackgroundInert(inert: boolean) {
  const app = document.getElementById('app')
  if (!app) return
  if (inert) app.setAttribute('inert', '')
  else app.removeAttribute('inert')
}

function abortZoneTitleGeneration() {
  const controller = zoneTitleController
  zoneTitleController = null
  controller?.abort()
  zoneTitleGenerating.value = false
}

async function openBatchDelete() {
  if (zoneDialogOpen.value) return
  if (!selectedCardIds.value.length) return
  deleteDialogOpen.value = true
  setBackgroundInert(true)
  await nextTick()
  deleteDialog.value?.focus()
}

async function openZoneDialog() {
  if (deleteDialogOpen.value || selectableCount.value < 2) return
  abortZoneTitleGeneration()
  zoneTitle.value = ''
  zoneColor.value =
    zoneColors[board.zones.length % zoneColors.length]?.id ?? 'amber'
  zoneDialogOpen.value = true
  setBackgroundInert(true)
  await nextTick()
  zoneInput.value?.focus()
}

async function closeZoneDialog(returnFocus = true) {
  if (zoneBusy.value) return
  abortZoneTitleGeneration()
  zoneDialogOpen.value = false
  setBackgroundInert(false)
  if (!returnFocus) return
  await nextTick()
  zoneTrigger.value?.focus()
}

function handleZoneDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void closeZoneDialog()
    return
  }
  if (event.key !== 'Tab' || !zoneDialog.value) return

  const focusable = [
    ...zoneDialog.value.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled)',
    ),
  ]
  if (!focusable.length) return

  const first = focusable[0]!
  const last = focusable.at(-1)!
  const active = document.activeElement
  if (
    event.shiftKey &&
    (active === first || !zoneDialog.value.contains(active))
  ) {
    event.preventDefault()
    last.focus()
  } else if (
    !event.shiftKey &&
    (active === last || !zoneDialog.value.contains(active))
  ) {
    event.preventDefault()
    first.focus()
  }
}

async function generateZoneTitle() {
  if (zoneBusy.value || zoneTitleGenerating.value) return
  if (!ai.hasKey) {
    abortZoneTitleGeneration()
    zoneDialogOpen.value = false
    setBackgroundInert(false)
    emit('open-ai-settings')
    return
  }

  const cards = selectedEntries.value.map((entry) => entry.card)
  if (cards.length < 2) return

  abortZoneTitleGeneration()
  const sourceTitle = zoneTitle.value
  const controller = new AbortController()
  zoneTitleController = controller
  zoneTitleGenerating.value = true

  try {
    const generated = await inferZoneTitle(
      ai.config,
      buildZoneTitlePrompt(cards),
      ZONE_TITLE_SYSTEM_PROMPT,
      controller.signal,
    )
    if (controller.signal.aborted) return
    if (zoneTitle.value !== sourceTitle) return
    if (!generated) {
      toast.push('AI 没有生成合适的区域名称，请手动填写。', {
        tone: 'info',
        timeout: 3200,
      })
      return
    }

    zoneTitle.value = generated
    toast.push('AI 已生成区域名称，可继续修改后再创建。', {
      tone: 'success',
      timeout: 2800,
    })
  } catch (cause) {
    if (controller.signal.aborted) return
    toast.push(
      cause instanceof Error ? cause.message : '区域名称生成暂时不可用。',
      { tone: 'error', timeout: 4200 },
    )
  } finally {
    if (zoneTitleController === controller) {
      zoneTitleController = null
      zoneTitleGenerating.value = false
    }
  }
}

async function createSelectedZone() {
  if (zoneBusy.value || !zoneTitle.value.trim()) return
  const itemIds = selectedEntries.value.map((entry) => entry.item.id)
  if (itemIds.length < 2) return

  abortZoneTitleGeneration()
  zoneBusy.value = true
  try {
    const zone = await board.createZone({
      title: zoneTitle.value,
      color: zoneColor.value,
      itemIds,
    })
    if (!zone) {
      toast.push('创建区域失败，卡片未改动。', { tone: 'error' })
      return
    }
    zoneBusy.value = false
    void closeZoneDialog(false)
    board.clearSelection()
    toast.push(`已创建区域「${zone.title}」。`, {
      tone: 'success',
      timeout: 5000,
      action: { label: '撤销', run: () => board.undo() },
    })
  } finally {
    zoneBusy.value = false
  }
}

async function closeBatchDelete(returnFocus = true, force = false) {
  if (deleteBusy.value && !force) return
  deleteDialogOpen.value = false
  setBackgroundInert(false)
  if (!returnFocus) return
  await nextTick()
  deleteTrigger.value?.focus()
}

function handleDeleteDialogKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.preventDefault()
    void closeBatchDelete()
    return
  }
  if (event.key !== 'Tab' || !deleteDialog.value) return

  const focusable = [
    ...deleteDialog.value.querySelectorAll<HTMLButtonElement>(
      'button:not(:disabled)',
    ),
  ]
  if (!focusable.length) return

  const first = focusable[0]!
  const last = focusable.at(-1)!
  const active = document.activeElement
  if (
    event.shiftKey &&
    (active === first || !deleteDialog.value.contains(active))
  ) {
    event.preventDefault()
    last.focus()
  } else if (
    !event.shiftKey &&
    (active === last || !deleteDialog.value.contains(active))
  ) {
    event.preventDefault()
    first.focus()
  }
}

async function removeSelectedFromBoard() {
  if (deleteBusy.value || !board.activeBoardId) return
  const ids = [...selectedCardIds.value]
  if (!ids.length) return

  deleteBusy.value = true
  try {
    const removed = await board.removeCardsFromBoard(ids, board.activeBoardId)
    if (!removed) {
      toast.push('没有可移除的选中卡片。', { tone: 'info' })
      return
    }
    await closeBatchDelete(false, true)
    toast.push(`已从当前白板移除 ${ids.length} 张卡片。`, {
      tone: 'info',
      timeout: 8000,
      action: { label: '撤销', run: () => board.undo() },
    })
  } finally {
    deleteBusy.value = false
  }
}

async function deleteSelectedCards() {
  if (deleteBusy.value) return
  const ids = [...selectedCardIds.value]
  if (!ids.length) return

  deleteBusy.value = true
  try {
    const deleted = await board.deleteCards(ids)
    if (!deleted) {
      toast.push('没有可删除的选中卡片。', { tone: 'info' })
      return
    }
    await closeBatchDelete(false, true)
    toast.push(`已将 ${ids.length} 张卡片移入回收站。`, {
      tone: 'info',
      timeout: 8000,
      action: { label: '撤销', run: () => board.undo() },
    })
  } finally {
    deleteBusy.value = false
  }
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

watch(selectableCount, () => {
  copied.value = false
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = null
  if (selectableCount.value <= 1 && deleteDialogOpen.value) {
    void closeBatchDelete(false)
  }
  if (selectableCount.value <= 1 && zoneDialogOpen.value) {
    void closeZoneDialog(false)
  }
})

onBeforeUnmount(() => {
  disposePosition()
  disposeEnd()
  abortZoneTitleGeneration()
  if (copiedTimer) clearTimeout(copiedTimer)
  setBackgroundInert(false)
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

  toast.push(`已复制 ${entries.length} 张卡片内容。`, {
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
        ref="zoneTrigger"
        type="button"
        class="selection-zone"
        data-create-zone
        aria-label="将选中卡片设为区域"
        @click.stop="openZoneDialog"
      >
        <Layers3 :size="13" :stroke-width="1.8" aria-hidden="true" />
        <span>设为区域</span>
      </button>
      <span class="selection-divider" aria-hidden="true" />
      <button
        type="button"
        class="selection-copy"
        :aria-label="copied ? '已复制卡片内容' : '复制卡片内容'"
        @click.stop="copyMarkdown"
      >
        <span class="selection-copy-icon" aria-hidden="true">
          <Check v-if="copied" :size="13" :stroke-width="2" />
          <Copy v-else :size="13" :stroke-width="1.8" />
        </span>
        <span>{{ copied ? '已复制' : '复制内容' }}</span>
      </button>
      <span class="selection-divider" aria-hidden="true" />
      <button
        ref="deleteTrigger"
        type="button"
        class="selection-delete"
        data-batch-delete
        aria-label="批量处理选中卡片"
        aria-haspopup="dialog"
        @click.stop="openBatchDelete"
      >
        <Trash2 :size="13" :stroke-width="1.8" aria-hidden="true" />
        <span>批量删除</span>
      </button>
    </div>
  </div>

  <Teleport to="body">
    <Transition name="batch-delete">
      <div
        v-if="deleteDialogOpen"
        class="fixed inset-0 z-[92] flex items-center justify-center bg-stone-950/30 px-4 py-6 backdrop-blur-sm dark:bg-black/70"
        @click.self="closeBatchDelete()"
      >
        <section
          ref="deleteDialog"
          class="w-full max-w-[440px] overflow-hidden rounded-[24px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_36px_100px_-30px_rgba(41,37,36,0.5)] outline-none dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_50px_130px_-36px_rgba(0,0,0,0.95)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-delete-title"
          tabindex="-1"
          data-batch-delete-dialog
          @keydown="handleDeleteDialogKeydown"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-5 py-4 dark:border-white/[0.08]"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[12px] border border-rose-700/15 bg-rose-500/[0.06] text-rose-700 dark:border-rose-200/10 dark:bg-rose-200/[0.04] dark:text-rose-200"
              >
                <Trash2 :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="batch-delete-title"
                  class="font-serif text-[18px] text-stone-800 dark:text-zinc-100"
                >
                  处理 {{ selectedCardIds.length }} 张卡片
                </h2>
                <p class="mt-1 text-[11px] text-stone-500 dark:text-zinc-400">
                  先选择删除范围，所有操作均可撤销。
                </p>
              </div>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 disabled:opacity-40 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
              aria-label="关闭批量删除"
              :disabled="deleteBusy"
              @click="closeBatchDelete()"
            >
              <X :size="14" :stroke-width="1.7" aria-hidden="true" />
            </button>
          </header>

          <div class="space-y-2 p-3">
            <button
              type="button"
              class="group flex w-full items-start gap-3 rounded-[16px] border border-stone-200/70 bg-white/50 px-3.5 py-3 text-left transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-amber-500/30 hover:bg-white/80 disabled:cursor-wait disabled:opacity-55 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-amber-200/20 dark:hover:bg-white/[0.05]"
              data-batch-remove
              :disabled="deleteBusy"
              @click="removeSelectedFromBoard"
            >
              <span
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-700/15 bg-amber-500/[0.06] text-amber-700 dark:border-amber-200/10 dark:bg-amber-200/[0.04] dark:text-amber-200"
              >
                <Unlink :size="14" :stroke-width="1.7" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block text-[13px] font-medium text-stone-800 dark:text-zinc-100"
                >
                  仅从当前白板移除
                </span>
                <span
                  class="mt-1 block text-[10px] leading-5 text-stone-500 dark:text-zinc-400"
                >
                  推荐。其他白板中的同一张卡片会保留，只属于此板的卡片进入回收站。
                </span>
              </span>
            </button>

            <button
              type="button"
              class="group flex w-full items-start gap-3 rounded-[16px] border border-rose-200/70 bg-rose-50/35 px-3.5 py-3 text-left transition-[background-color,border-color,transform] hover:-translate-y-px hover:border-rose-400/45 hover:bg-rose-50/70 disabled:cursor-wait disabled:opacity-55 dark:border-rose-300/10 dark:bg-rose-500/[0.035] dark:hover:border-rose-300/20 dark:hover:bg-rose-500/[0.07]"
              data-batch-delete-all
              :disabled="deleteBusy"
              @click="deleteSelectedCards"
            >
              <span
                class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-rose-700/15 bg-rose-500/[0.06] text-rose-700 dark:border-rose-200/10 dark:bg-rose-200/[0.04] dark:text-rose-200"
              >
                <Trash2 :size="14" :stroke-width="1.7" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block text-[13px] font-medium text-rose-700 dark:text-rose-200"
                >
                  删除整张卡片
                </span>
                <span
                  class="mt-1 block text-[10px] leading-5 text-rose-600/75 dark:text-rose-200/60"
                >
                  会从所有白板移除，并进入回收站保留 30 天。
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </Transition>

    <Transition name="batch-delete">
      <div
        v-if="zoneDialogOpen"
        class="fixed inset-0 z-[92] flex items-center justify-center bg-stone-950/30 px-4 py-6 backdrop-blur-sm dark:bg-black/70"
        @click.self="closeZoneDialog()"
      >
        <section
          ref="zoneDialog"
          class="w-full max-w-[400px] overflow-hidden rounded-[24px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_36px_100px_-30px_rgba(41,37,36,0.5)] outline-none dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_50px_130px_-36px_rgba(0,0,0,0.95)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="zone-dialog-title"
          data-zone-dialog
          tabindex="-1"
          @keydown="handleZoneDialogKeydown"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-5 py-4 dark:border-white/[0.08]"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[12px] border border-stone-200/80 bg-white/65 text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
              >
                <Layers3 :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="zone-dialog-title"
                  class="font-serif text-[18px] text-stone-800 dark:text-zinc-100"
                >
                  创建区域
                </h2>
                <p class="mt-1 text-[11px] text-stone-500 dark:text-zinc-400">
                  为 {{ selectableCount }} 张卡片建立持久空间分组。
                </p>
              </div>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
              aria-label="关闭创建区域"
              :disabled="zoneBusy"
              @click="closeZoneDialog()"
            >
              <X :size="14" :stroke-width="1.7" aria-hidden="true" />
            </button>
          </header>

          <div class="space-y-4 px-5 py-4">
            <div>
              <span class="mb-1.5 flex items-center justify-between gap-3">
                <span class="text-[10px] text-stone-500 dark:text-zinc-400">
                  区域名称
                </span>
                <button
                  type="button"
                  class="inline-flex h-6 items-center gap-1 rounded-full border border-amber-700/15 bg-amber-500/[0.065] px-2 text-[9px] text-amber-800 transition-[background-color,border-color,opacity] hover:border-amber-700/25 hover:bg-amber-500/[0.11] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/30 disabled:cursor-wait disabled:opacity-50 dark:border-amber-200/15 dark:bg-amber-200/[0.045] dark:text-amber-200/90 dark:hover:border-amber-200/25 dark:hover:bg-amber-200/[0.075]"
                  :disabled="zoneBusy || zoneTitleGenerating"
                  :aria-busy="zoneTitleGenerating"
                  :title="
                    ai.hasKey
                      ? '根据选中的卡片生成区域名称'
                      : '请先在 AI 设置中填写 API Key'
                  "
                  aria-label="AI 为选区命名"
                  data-zone-ai-title
                  @click="generateZoneTitle"
                >
                  <LoaderCircle
                    v-if="zoneTitleGenerating"
                    :size="10"
                    :stroke-width="1.8"
                    class="animate-spin"
                    aria-hidden="true"
                  />
                  <Sparkles
                    v-else
                    :size="10"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                  {{ zoneTitleGenerating ? '生成中…' : 'AI 生成' }}
                </button>
              </span>
              <input
                ref="zoneInput"
                v-model="zoneTitle"
                type="text"
                maxlength="40"
                placeholder="例如：心理学 / 自我和解"
                class="h-10 w-full rounded-xl border border-stone-200/80 bg-white/70 px-3 text-[12px] text-stone-700 outline-none placeholder:text-stone-400 focus:border-amber-600/35 focus:ring-2 focus:ring-amber-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-200 dark:placeholder:text-zinc-600"
                aria-label="区域名称"
                @keydown.enter.prevent="createSelectedZone"
              />
            </div>

            <div>
              <span
                class="mb-2 block text-[10px] text-stone-500 dark:text-zinc-400"
              >
                视觉标识
              </span>
              <div
                class="flex items-center gap-2"
                role="radiogroup"
                aria-label="区域颜色"
              >
                <button
                  v-for="color in zoneColors"
                  :key="color.id"
                  type="button"
                  class="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg border text-[9px] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/35"
                  :class="
                    zoneColor === color.id
                      ? 'border-stone-400/70 bg-white/80 text-stone-700 dark:border-white/30 dark:bg-white/[0.08] dark:text-zinc-200'
                      : 'border-stone-200/65 bg-white/35 text-stone-500 hover:bg-white/65 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-500'
                  "
                  role="radio"
                  :aria-checked="zoneColor === color.id"
                  :aria-label="color.label"
                  @click="zoneColor = color.id"
                >
                  <span
                    class="h-2 w-2 rounded-full"
                    :class="color.className"
                    aria-hidden="true"
                  />
                  {{ color.label }}
                </button>
              </div>
            </div>
          </div>

          <footer
            class="flex items-center justify-end gap-2 border-t border-stone-200/70 px-5 py-3.5 dark:border-white/[0.08]"
          >
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-[11px] text-stone-500 hover:bg-stone-100/70 hover:text-stone-800 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-100"
              :disabled="zoneBusy"
              @click="closeZoneDialog()"
            >
              取消
            </button>
            <button
              type="button"
              class="rounded-full bg-stone-800 px-3.5 py-1.5 text-[11px] font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-wait disabled:opacity-45 dark:bg-zinc-100 dark:text-zinc-900"
              data-zone-confirm
              :disabled="zoneBusy || !zoneTitle.trim()"
              @click="createSelectedZone"
            >
              {{ zoneBusy ? '创建中…' : '创建区域' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
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

.selection-zone {
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
  color: rgb(68 64 60);
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.selection-zone:hover {
  background: rgba(209, 250, 229, 0.62);
  color: rgb(4 120 87);
}

.selection-zone:active {
  transform: scale(0.975);
}

.selection-zone:focus-visible {
  outline: 2px solid rgba(16, 185, 129, 0.35);
  outline-offset: 2px;
}

.dark .selection-zone {
  color: rgb(228 228 231);
}

.dark .selection-zone:hover {
  background: rgba(110, 231, 183, 0.08);
  color: rgb(167 243, 208);
}

.selection-delete {
  display: inline-flex;
  height: 2rem;
  align-items: center;
  gap: 0.4rem;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  padding: 0 0.75rem 0 0.68rem;
  font-size: 11px;
  font-weight: 550;
  letter-spacing: -0.005em;
  color: rgb(159 18 57);
  transition:
    background-color 160ms ease,
    color 160ms ease,
    transform 160ms ease;
}

.selection-delete:hover {
  background: rgb(255 228 230 / 0.72);
  color: rgb(190 18 60);
}

.selection-delete:active {
  transform: scale(0.975);
}

.selection-delete:focus-visible {
  outline: 2px solid rgb(244 63 94 / 0.35);
  outline-offset: 2px;
}

.dark .selection-delete {
  color: rgb(253 164 175);
}

.dark .selection-delete:hover {
  background: rgb(244 63 94 / 0.1);
  color: rgb(254 205 211);
}

.batch-delete-enter-active,
.batch-delete-leave-active {
  transition: opacity 160ms ease;
}

.batch-delete-enter-active section,
.batch-delete-leave-active section {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.batch-delete-enter-from,
.batch-delete-leave-to,
.batch-delete-enter-from section,
.batch-delete-leave-to section {
  opacity: 0;
}

.batch-delete-enter-from section {
  transform: translateY(8px) scale(0.985);
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
  .selection-zone,
  .selection-copy-icon,
  .selection-delete,
  .batch-delete-enter-active,
  .batch-delete-leave-active,
  .batch-delete-enter-active section,
  .batch-delete-leave-active section {
    transition: none;
  }
}

@media (max-width: 480px) {
  .selection-zone,
  .selection-copy,
  .selection-delete {
    width: 2rem;
    justify-content: center;
    padding-inline: 0;
  }

  .selection-zone > span,
  .selection-copy > span:not(.selection-copy-icon),
  .selection-delete > span {
    display: none;
  }
}
</style>
