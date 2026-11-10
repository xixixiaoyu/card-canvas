<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CornerDownLeft, Hash, PenLine, X } from '@lucide/vue'
import {
  mergeTags,
  normalizeTags,
  parseHashtags,
  sameTag,
  splitTagInput,
} from '../../lib/tags'
import { chooseCapturePlacement } from '../../lib/capture-placement'
import { getItemRect } from '../../lib/card-metrics'
import type { CanvasCamera } from '../../composables/useCanvas'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'
import type { Card } from '../../types'

const props = defineProps<{
  open: boolean
  card?: Card | null
  camera?: CanvasCamera | null
  boardId?: string
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const board = useBoardStore()
const toast = useToastStore()

const title = ref('')
const content = ref('')
const tags = ref<string[]>([])
const tagDraft = ref('')
const isEditing = computed(() => Boolean(props.card))
const titleEl = ref<HTMLInputElement | null>(null)
const contentEl = ref<HTMLTextAreaElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)

let restoreFocus: HTMLElement | null = null
let saveAttempt = 0
let lastMode: 'capture' | 'edit' = 'capture'
let suppressModeSync = false

const canSave = computed(
  () => Boolean(title.value.trim()) || Boolean(content.value.trim()),
)

function addTag(raw: string) {
  const [tag] = normalizeTags([raw])
  if (!tag) return
  if (tags.value.some((existing) => sameTag(existing, tag))) return

  tags.value = [...tags.value, tag]
}

function addTagsFromDraft() {
  const raw = tagDraft.value
  if (!raw.trim()) return

  splitTagInput(raw).forEach(addTag)
  tagDraft.value = ''
}

function removeTag(tag: string) {
  tags.value = tags.value.filter((entry) => entry !== tag)
}

function handleTagKeydown(event: KeyboardEvent) {
  if (event.isComposing) return

  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
    event.preventDefault()
    addTagsFromDraft()
    return
  }

  if (event.key === 'Backspace' && !tagDraft.value && tags.value.length) {
    event.preventDefault()
    tags.value = tags.value.slice(0, -1)
  }
}

function handleTitleEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  contentEl.value?.focus()
}

function reset() {
  title.value = ''
  content.value = ''
  tags.value = []
  tagDraft.value = ''
}

function close() {
  emit('update:open', false)
}

/**
 * Immediate-capture flow: find a comfortable empty slot near the viewport
 * center, keeping the new card on screen and away from existing cards when
 * possible. A crowded board falls back to a small cascade at the center.
 */
function estimateCaptureHeight() {
  const titleLines = Math.max(1, Math.ceil(title.value.trim().length / 13))
  const contentLines = content.value
    .trim()
    .split('\n')
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / 23)),
      0,
    )

  return Math.min(
    560,
    Math.max(
      280,
      220 + titleLines * 37 + contentLines * 29 + (tags.value.length ? 28 : 0),
    ),
  )
}

function buildPlacement() {
  const width = 420
  const reservedHeight = estimateCaptureHeight()
  const rect = props.camera?.getContainerRect() ?? null

  if (!rect) return { x: 0, y: 0, width }

  const camera = props.camera!
  const topLeft = camera.screenToWorld({ x: rect.left, y: rect.top }, rect)
  const bottomRight = camera.screenToWorld(
    { x: rect.left + rect.width, y: rect.top + rect.height },
    rect,
  )
  const center = camera.screenToWorld(
    {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    },
    rect,
  )
  const selected =
    board.selectedItemId && board.selectedItem
      ? getItemRect(board.selectedItem)
      : null
  const placement = chooseCapturePlacement({
    viewport: {
      left: topLeft.x,
      top: topLeft.y + 88,
      right: bottomRight.x,
      bottom: bottomRight.y - 96,
    },
    center,
    width,
    height: reservedHeight,
    selected,
    existing: board.items.map((item) => getItemRect(item)),
  })

  return { ...placement, width }
}

function save() {
  if (!canSave.value) return

  addTagsFromDraft()

  const rawTitle = title.value.trim()
  const rawContent = content.value.trim()
  const firstLine =
    rawContent
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  const resolvedTitle = rawTitle || firstLine.slice(0, 48) || '未命名卡片'

  const uniqueTags = mergeTags(
    tags.value,
    parseHashtags(`${resolvedTitle} ${rawContent}`),
  )

  const draft = {
    title: resolvedTitle,
    content: rawContent,
    tags: uniqueTags,
  }
  const attempt = ++saveAttempt
  const editingCard = props.card
  const placement = buildPlacement()

  // Store publishes the card synchronously and persists in the background;
  // the modal closes before IndexedDB resolves. If the write fails, the draft
  // is restored and the modal reopens instead of silently losing the text.
  reset()
  close()

  const restoreAfterFailure = (cause: unknown) => {
    console.error('[card-canvas] Unable to save capture', cause)
    if (attempt !== saveAttempt) return

    if (!props.open) {
      suppressModeSync = true
      title.value = draft.title
      content.value = draft.content
      tags.value = [...draft.tags]
      emit('update:open', true)
    }

    toast.push(
      editingCard ? '卡片更新失败，草稿已恢复。' : '速记上板失败，草稿已恢复。',
      { tone: 'error' },
    )
  }

  if (editingCard) {
    void board.updateCard(editingCard.id, draft).then(() => {
      toast.push('卡片已更新。', { tone: 'success', timeout: 2200 })
    }, restoreAfterFailure)
    return
  }

  void board
    .captureAndPlace(draft, props.boardId || 'board-main', placement)
    .catch(restoreAfterFailure)
}

function setBackgroundInert(inert: boolean) {
  const app = document.getElementById('app')
  if (!app) return

  if (inert) app.setAttribute('inert', '')
  else app.removeAttribute('inert')
}

function trapTabFocus(event: KeyboardEvent) {
  const panel = panelEl.value
  if (!panel) return

  const focusables = [
    ...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.getClientRects().length > 0)

  if (!focusables.length) return

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement

  if (event.shiftKey) {
    if (active === first || !panel.contains(active)) {
      event.preventDefault()
      last.focus()
    }
    return
  }

  if (active === last || !panel.contains(active)) {
    event.preventDefault()
    first.focus()
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!props.open) return
  // Let the IME cancel its own composition before Escape closes the modal.
  if (event.isComposing) return

  if (event.key === 'Tab') {
    trapTabFocus(event)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    // The modal owns Escape; stop the app-level handler from also reacting to
    // the same keystroke.
    event.stopImmediatePropagation()
    close()
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    save()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)

      if (suppressModeSync) {
        suppressModeSync = false
      } else if (props.card) {
        lastMode = 'edit'
        title.value = props.card.title
        content.value = props.card.content
        tags.value = [...props.card.tags]
        tagDraft.value = ''
      } else if (lastMode === 'edit') {
        lastMode = 'capture'
        reset()
      }

      await nextTick()
      titleEl.value?.focus()
      return
    }

    setBackgroundInert(false)
    restoreFocus?.focus()
    restoreFocus = null
  },
)

onMounted(() => window.addEventListener('keydown', handleWindowKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  setBackgroundInert(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="capture">
      <div
        v-if="open"
        class="capture-backdrop fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-stone-950/20 px-4 pb-10 pt-[9vh] backdrop-blur-[3px] dark:bg-black/60"
        data-canvas-ui
        data-quick-capture
        @click.self="close"
      >
        <section
          ref="panelEl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-capture-heading"
          class="capture-panel relative w-full max-w-[620px] overflow-hidden rounded-[26px] border border-stone-200/80 bg-[#fdfbf7]/[0.97] shadow-[0_40px_120px_-40px_rgba(41,37,36,0.45),0_2px_8px_rgba(41,37,36,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.94] dark:shadow-[0_50px_140px_-40px_rgba(0,0,0,0.9)]"
          @click.stop
        >
          <div
            class="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent dark:via-white/25"
            aria-hidden="true"
          />

          <header
            class="flex items-center justify-between gap-4 border-b border-stone-200/70 px-6 py-4 dark:border-white/[0.08]"
          >
            <div class="flex items-center gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[11px] border border-stone-200/80 bg-white/70 text-stone-500 shadow-[0_1px_1px_rgba(41,37,36,0.04)] dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                <PenLine :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="quick-capture-heading"
                  class="font-serif text-[15px] font-medium tracking-[-0.01em] text-stone-800 dark:text-zinc-100"
                >
                  {{ isEditing ? '编辑卡片' : '速记' }}
                </h2>
                <p
                  class="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-400 dark:text-zinc-500"
                >
                  {{
                    isEditing
                      ? 'Edit · 更新内容与标签'
                      : 'Quick Capture · 保存即上板'
                  }}
                </p>
              </div>
            </div>

            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200 dark:focus-visible:ring-white/25"
              aria-label="关闭速记"
              @click="close"
            >
              <X :size="15" :stroke-width="1.6" aria-hidden="true" />
            </button>
          </header>

          <div class="px-6 pb-5 pt-5">
            <input
              ref="titleEl"
              v-model="title"
              type="text"
              maxlength="160"
              placeholder="一句话标题，或直接写正文…"
              aria-label="卡片标题"
              class="w-full border-0 bg-transparent p-0 font-serif text-[1.45rem] font-medium leading-snug tracking-[-0.02em] text-stone-900 caret-amber-600 outline-none placeholder:text-stone-400/90 dark:text-zinc-100 dark:caret-amber-400 dark:placeholder:text-zinc-600"
              @keydown.enter="handleTitleEnter"
            />

            <textarea
              ref="contentEl"
              v-model="content"
              rows="5"
              placeholder="捕捉一个念头、一段引用或一条未成形的知识…"
              aria-label="卡片正文"
              class="mt-4 w-full resize-none border-0 bg-transparent p-0 text-[0.9375rem] leading-[1.85] text-stone-700 caret-amber-600 outline-none placeholder:text-stone-400/90 dark:text-zinc-300 dark:caret-amber-400 dark:placeholder:text-zinc-600"
            />

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <span
                v-for="tag in tags"
                :key="tag"
                class="group inline-flex items-center gap-1 rounded-full border border-amber-700/15 bg-amber-500/[0.08] py-1 pl-2.5 pr-1.5 text-[11px] text-amber-800 dark:border-amber-300/15 dark:bg-amber-300/[0.07] dark:text-amber-200/90"
              >
                #{{ tag }}
                <button
                  type="button"
                  class="flex h-4 w-4 items-center justify-center rounded-full text-amber-700/50 transition-colors hover:bg-amber-700/10 hover:text-amber-800 dark:text-amber-200/50 dark:hover:bg-white/10 dark:hover:text-amber-100"
                  :aria-label="`移除标签 ${tag}`"
                  @click="removeTag(tag)"
                >
                  <X :size="10" :stroke-width="2" aria-hidden="true" />
                </button>
              </span>

              <label
                class="flex min-w-[9rem] flex-1 items-center gap-1.5 rounded-full border border-dashed border-stone-300/80 px-3 py-1.5 text-stone-500 transition-colors focus-within:border-stone-400 focus-within:bg-white/60 dark:border-white/15 dark:text-zinc-500 dark:focus-within:border-white/25 dark:focus-within:bg-white/[0.03]"
              >
                <Hash :size="12" :stroke-width="1.8" aria-hidden="true" />
                <input
                  v-model="tagDraft"
                  type="text"
                  placeholder="标签，回车确认"
                  aria-label="添加标签"
                  class="w-full border-0 bg-transparent p-0 text-[11px] text-stone-700 outline-none placeholder:text-stone-400/90 dark:text-zinc-300 dark:placeholder:text-zinc-600"
                  @keydown="handleTagKeydown"
                  @blur="addTagsFromDraft"
                />
              </label>
            </div>
          </div>

          <footer
            class="flex flex-wrap items-center justify-between gap-3 border-t border-stone-200/70 px-6 py-3.5 dark:border-white/[0.08]"
          >
            <div
              class="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-400 dark:text-zinc-500"
            >
              <kbd
                class="rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 text-[9px] tracking-normal text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                ⌘↵
              </kbd>
              <span>{{ isEditing ? '保存' : '上板' }}</span>
              <span class="text-stone-300 dark:text-zinc-700">·</span>
              <kbd
                class="rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 text-[9px] tracking-normal text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                Esc
              </kbd>
              <span>退出</span>
              <span class="hidden text-stone-300 sm:inline dark:text-zinc-700"
                >·</span
              >
              <span class="hidden sm:inline">#标签自动解析</span>
            </div>

            <button
              type="button"
              class="inline-flex h-9 items-center gap-2 rounded-full bg-stone-900 px-4 text-[11px] font-medium tracking-[0.01em] text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-[background-color,opacity,transform] duration-200 hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 disabled:shadow-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600"
              :disabled="!canSave"
              @click="save"
            >
              <CornerDownLeft
                :size="13"
                :stroke-width="1.8"
                aria-hidden="true"
              />
              {{ isEditing ? '保存修改' : '保存并上板' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.capture-enter-active,
.capture-leave-active {
  transition: opacity 180ms ease;
}

.capture-enter-active .capture-panel,
.capture-leave-active .capture-panel {
  transition:
    opacity 200ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.capture-enter-from,
.capture-leave-to {
  opacity: 0;
}

.capture-enter-from .capture-panel,
.capture-leave-to .capture-panel {
  opacity: 0;
  transform: translateY(-12px) scale(0.97);
}
</style>
