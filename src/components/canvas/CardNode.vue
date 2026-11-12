<script setup lang="ts">
import {
  computed,
  inject,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
} from 'vue'
import {
  Check,
  Copy,
  Grip,
  Layers3,
  Link2,
  Pencil,
  Share2,
  Sparkles,
  Trash2,
} from '@lucide/vue'
import { removeCardHeight, setCardHeight } from '../../lib/card-metrics'
import { tagMatches } from '../../lib/galaxy'
import { useCardDrag, type CardDragCommit } from '../../composables/useCardDrag'
import { canvasCameraKey, type CanvasCamera } from '../../composables/useCanvas'
import { connectionKey } from '../../composables/useConnection'
import type { BoardItem, Card, CardAttachment } from '../../types'
import AtomicMarkdown from './AtomicMarkdown.vue'

const props = withDefaults(
  defineProps<{
    item: BoardItem
    card: Card
    attachments?: CardAttachment[]
    selected?: boolean
    landing?: boolean
    isHighlighted?: boolean
    isDimmed?: boolean
    activeFilterTag?: string | null
    getDragGroup?: () => BoardItem[]
    copyable?: boolean
    copied?: boolean
  }>(),
  {
    selected: false,
    attachments: () => [],
    landing: false,
    isHighlighted: false,
    isDimmed: false,
    activeFilterTag: null,
    getDragGroup: undefined,
    copyable: false,
    copied: false,
  },
)

const emit = defineEmits<{
  select: [event?: PointerEvent]
  clickCard: [event: PointerEvent]
  positionCommit: [position: { x: number; y: number }]
  positionCommitGroup: [positions: CardDragCommit[]]
  nudge: [delta: { x: number; y: number }]
  edit: []
  delete: []
  copyMarkdown: []
  share: []
  addToBoard: []
  findConnections: []
  toggleTask: [lineIndex: number]
  tagClick: [tag: string]
}>()

const identityCamera: CanvasCamera = {
  viewport: shallowRef({ panX: 0, panY: 0, scale: 1 }),
  getViewport: () => ({ panX: 0, panY: 0, scale: 1 }),
  getContainerRect: () => null,
  screenToWorld: (point) => ({ x: point.x, y: point.y }),
  worldToScreen: (point) => ({ x: point.x, y: point.y }),
  flyTo: async () => {},
}

const camera = inject(canvasCameraKey, identityCamera)
const connection = inject(connectionKey, null)
const rootEl = ref<HTMLElement | null>(null)
const liftEl = ref<HTMLElement | null>(null)

let resizeObserver: ResizeObserver | null = null

function measureHeight() {
  const height = rootEl.value?.offsetHeight
  if (height) setCardHeight(props.item.id, height)
}

onMounted(() => {
  measureHeight()

  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    resizeObserver = new ResizeObserver(measureHeight)
    resizeObserver.observe(rootEl.value)
  }
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  resizeObserver = null
  removeCardHeight(props.item.id)
})

const compact = computed(() => (props.item.width ?? 420) < 360)
const highlights = computed(() => props.card.highlights ?? [])
const titleId = computed(() => `card-title-${props.card.id}`)

function handleLinkPointerDown(event: PointerEvent) {
  if (!connection) return

  connection.beginDrag(event, props.item)
}

const { isDragging, isGroupDragging, onPointerDown } = useCardDrag({
  root: rootEl,
  lift: liftEl,
  camera,
  getItem: () => props.item,
  getGroupItems: () => props.getDragGroup?.() ?? [props.item],
  onSelect: (event) => emit('select', event),
  onClick: (event) => emit('clickCard', event),
  onCommit: (position) => emit('positionCommit', position),
  onCommitGroup: (positions) => emit('positionCommitGroup', positions),
})

function handleKeydown(event: KeyboardEvent) {
  if (event.target !== event.currentTarget) return

  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    event.stopPropagation()
    emit('select')
    return
  }

  const step = event.shiftKey ? 1 : 10
  const delta = {
    ArrowLeft: { x: -step, y: 0 },
    ArrowRight: { x: step, y: 0 },
    ArrowUp: { x: 0, y: -step },
    ArrowDown: { x: 0, y: step },
  }[event.key]

  if (!delta) return

  event.preventDefault()
  event.stopPropagation()
  emit('nudge', delta)
}

function handleDoubleClick(event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element)) return
  if (
    target.closest(
      '[data-card-interactive], [data-card-selectable], [data-card-drag-handle]',
    )
  ) {
    return
  }

  event.preventDefault()
  emit('edit')
}

function tagTone(index: number) {
  return index % 2 === 0 ? 'tag-amber' : 'tag-sage'
}
</script>

<template>
  <article
    ref="rootEl"
    class="canvas-world-item card-node group"
    :class="{
      'is-selected': selected,
      'is-dragging': isDragging,
      'is-group-dragging': isGroupDragging,
      'is-landing': landing,
      'is-dimmed': isDimmed,
    }"
    :style="{
      left: `${item.x}px`,
      top: `${item.y}px`,
      width: `${item.width ?? 420}px`,
    }"
    :data-card-id="card.id"
    :data-item-id="item.id"
    :aria-labelledby="titleId"
    :aria-current="selected ? 'true' : undefined"
    data-world-item
    tabindex="0"
    @pointerdown="onPointerDown"
    @focus="emit('select')"
    @keydown="handleKeydown"
    @dblclick="handleDoubleClick"
    @dragstart.prevent
  >
    <div ref="liftEl" class="card-lift relative w-full">
      <div
        class="card-selection pointer-events-none absolute -inset-1.5 rounded-[32px]"
        aria-hidden="true"
      />
      <div
        v-if="isHighlighted"
        class="card-pulse pointer-events-none absolute -inset-2 rounded-[34px]"
        data-card-pulse
        aria-hidden="true"
      />

      <div
        class="note-card card-surface relative w-full overflow-hidden rounded-[26px] border border-stone-200/80 bg-white/95 backdrop-blur-md dark:border-white/[0.13] dark:bg-zinc-900/[0.93]"
        :class="{ 'note-card--compact': compact }"
      >
        <!-- A hairline of light along the top edge keeps the paper feeling physical. -->
        <div
          class="pointer-events-none absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent opacity-90 dark:via-white/20"
          aria-hidden="true"
        />
        <div
          class="pointer-events-none absolute -right-24 -top-28 h-56 w-56 rounded-full bg-[radial-gradient(circle,rgba(240,222,195,0.32),transparent_66%)] blur-2xl dark:bg-[radial-gradient(circle,rgba(255,255,255,0.05),transparent_66%)]"
          aria-hidden="true"
        />

        <div class="card-body relative p-8">
          <header class="flex items-center justify-end gap-1.5">
            <div class="flex shrink-0 items-center gap-0.5">
              <div class="card-actions flex items-center gap-0">
                <button
                  v-if="copyable"
                  type="button"
                  class="card-action card-action--copy"
                  :class="{ 'is-copied': copied }"
                  data-card-interactive
                  data-card-copy
                  :aria-label="
                    copied ? '已复制 Markdown' : '复制卡片为 Markdown'
                  "
                  :title="copied ? '已复制' : '复制 Markdown'"
                  @pointerdown.stop
                  @click.stop="emit('copyMarkdown')"
                >
                  <Check
                    v-if="copied"
                    :size="13"
                    :stroke-width="2"
                    aria-hidden="true"
                  />
                  <Copy
                    v-else
                    :size="13"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                </button>
                <button
                  type="button"
                  class="card-action card-action--share"
                  data-card-interactive
                  data-card-share
                  aria-label="分享卡片图片"
                  title="分享图片"
                  @pointerdown.stop
                  @click.stop="emit('share')"
                >
                  <Share2 :size="13" :stroke-width="1.7" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="card-action card-action--radar"
                  data-card-interactive
                  data-card-radar
                  aria-label="寻找关联卡片"
                  title="找关联"
                  @pointerdown.stop
                  @click.stop="emit('findConnections')"
                >
                  <Sparkles :size="13" :stroke-width="1.7" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="card-action card-action--board"
                  data-card-interactive
                  data-card-add-board
                  aria-label="加入其他白板"
                  title="加入其他白板"
                  @pointerdown.stop
                  @click.stop="emit('addToBoard')"
                >
                  <Layers3 :size="13" :stroke-width="1.7" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="card-action"
                  data-card-interactive
                  aria-label="编辑卡片"
                  title="编辑"
                  @pointerdown.stop
                  @click.stop="emit('edit')"
                >
                  <Pencil :size="13" :stroke-width="1.7" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="card-action card-action--danger"
                  data-card-interactive
                  aria-label="删除卡片"
                  title="删除"
                  @pointerdown.stop
                  @click.stop="emit('delete')"
                >
                  <Trash2 :size="13" :stroke-width="1.7" aria-hidden="true" />
                </button>
              </div>

              <span
                class="card-drag-grip flex cursor-grab items-center justify-center"
                data-card-drag-handle
                title="拖动卡片"
              >
                <Grip :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
            </div>
          </header>

          <h2
            :id="titleId"
            class="card-title mt-7 font-serif text-[1.7rem] font-medium leading-[1.36] tracking-[-0.02em] text-stone-900 dark:text-zinc-100"
          >
            {{ card.title }}
          </h2>

          <AtomicMarkdown
            class="card-content card-selectable mt-3.5 text-[0.9375rem] leading-[1.9] text-stone-600 dark:text-zinc-400"
            :content="card.content"
            :attachments="attachments"
            @toggle-task="emit('toggleTask', $event)"
          />

          <template v-if="highlights.length">
            <div
              class="card-divider my-6 h-px w-full bg-gradient-to-r from-stone-200/90 via-stone-200/60 to-transparent dark:from-white/10 dark:via-white/[0.06]"
              aria-hidden="true"
            />

            <ul
              class="card-highlights flex flex-col gap-4"
              aria-label="原子化重点"
            >
              <li
                v-for="highlight in highlights"
                :key="highlight.order"
                class="card-highlight flex items-start gap-3.5"
              >
                <span
                  class="card-highlight-icon mt-px flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-stone-200/80 bg-stone-50/80 font-mono text-[9px] tracking-[0.06em] text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400"
                >
                  {{ highlight.order }}
                </span>
                <p
                  class="card-highlight-text card-selectable text-[0.8125rem] leading-6 text-stone-600 dark:text-zinc-400"
                  data-card-selectable
                >
                  <span class="font-medium text-stone-800 dark:text-zinc-200">{{
                    highlight.label
                  }}</span>
                  <span
                    class="mx-1.5 text-stone-300 dark:text-zinc-700"
                    aria-hidden="true"
                    >/</span
                  >
                  <span>{{ highlight.text }}</span>
                </p>
              </li>
            </ul>
          </template>

          <footer
            v-if="card.tags.length || isDragging"
            class="card-footer mt-7 flex items-start justify-between gap-4 border-t border-stone-200/70 pt-4 dark:border-white/[0.08]"
            :class="isDragging ? 'justify-between' : 'justify-end'"
          >
            <div
              v-if="isDragging"
              class="flex shrink-0 items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400"
            >
              <span class="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span
                  class="absolute inset-0 rounded-full bg-amber-500/30 blur-[3px]"
                />
                <span
                  class="relative h-1.5 w-1.5 rounded-full bg-amber-500/85"
                />
              </span>
              <span>拖动中</span>
            </div>

            <div
              v-if="card.tags.length"
              class="card-tags flex min-w-0 flex-1 flex-wrap items-center justify-end gap-1"
            >
              <button
                v-for="(tag, index) in card.tags"
                :key="tag"
                type="button"
                class="tag-pill cursor-pointer"
                :class="[
                  tagTone(index),
                  {
                    'is-active': activeFilterTag
                      ? tagMatches(tag, activeFilterTag)
                      : false,
                  },
                ]"
                data-card-interactive
                :data-filter-tag="tag"
                :aria-pressed="
                  activeFilterTag ? tagMatches(tag, activeFilterTag) : false
                "
                :title="`聚焦 #${tag}`"
                @pointerdown.stop
                @click.stop="emit('tagClick', tag)"
              >
                #{{ tag }}
              </button>
            </div>
          </footer>
        </div>
      </div>

      <button
        v-if="connection"
        type="button"
        class="link-handle"
        :class="{
          'is-connecting':
            connection.isConnecting.value &&
            connection.fromItemId.value === item.id,
        }"
        data-card-interactive
        :tabindex="selected ? 0 : -1"
        :aria-hidden="selected ? undefined : 'true'"
        aria-label="从卡片引线"
        title="拖出连线"
        @pointerdown.stop.prevent="handleLinkPointerDown"
        @click.stop
      >
        <Link2 :size="11" :stroke-width="1.9" aria-hidden="true" />
      </button>
    </div>
  </article>
</template>

<style scoped>
.card-node {
  transition: opacity 300ms ease;
}

.card-node.is-dimmed {
  opacity: 0.15;
}

.card-pulse {
  border: 1.5px solid rgba(217, 119, 6, 0.58);
  box-shadow:
    0 0 0 6px rgba(217, 119, 6, 0.06),
    0 0 30px rgba(217, 119, 6, 0.18);
  animation: card-pulse 1200ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.dark .card-pulse {
  border-color: rgba(147, 197, 253, 0.68);
  box-shadow:
    0 0 0 6px rgba(147, 197, 253, 0.06),
    0 0 34px rgba(147, 197, 253, 0.22);
}

.tag-pill.is-active {
  box-shadow: 0 0 0 1px currentColor inset;
}

.card-tags .tag-pill {
  flex: none;
}

.tag-pill:focus-visible {
  outline: 2px solid rgba(180, 83, 9, 0.5);
  outline-offset: 2px;
}

.dark .tag-pill:focus-visible {
  outline-color: rgba(147, 197, 253, 0.55);
}

@keyframes card-pulse {
  0% {
    opacity: 0;
    transform: scale(0.965);
  }
  22% {
    opacity: 1;
  }
  100% {
    opacity: 0;
    transform: scale(1.035);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-pulse {
    animation: none;
    opacity: 0.85;
  }
}

.canvas-world-item.is-landing {
  animation: card-land-fade 260ms ease-out both;
}

.canvas-world-item.is-landing .note-card {
  animation: card-land-paper 340ms cubic-bezier(0.22, 1, 0.36, 1) both;
  transform-origin: 50% 18%;
}

@keyframes card-land-fade {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes card-land-paper {
  from {
    opacity: 0.4;
    transform: translateY(10px) scale(0.975);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .canvas-world-item.is-landing,
  .canvas-world-item.is-landing .note-card {
    animation: none;
  }
}
.card-node {
  z-index: 1;
  cursor: grab;
  outline: none;
}

.link-handle {
  position: absolute;
  top: 50%;
  right: -0.8rem;
  z-index: 5;
  display: flex;
  width: 1.45rem;
  height: 1.45rem;
  align-items: center;
  justify-content: center;
  transform: translateY(-50%) scale(0.9);
  border-radius: 9999px;
  border: 1px solid rgba(214, 211, 209, 0.9);
  background: rgba(255, 255, 255, 0.88);
  color: rgb(120 113 108);
  opacity: 0;
  pointer-events: none;
  box-shadow:
    0 1px 2px rgba(41, 37, 36, 0.08),
    0 8px 20px -10px rgba(41, 37, 36, 0.3);
  backdrop-filter: blur(10px);
  transition:
    opacity 180ms ease,
    transform 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.card-node.is-selected .link-handle {
  opacity: 1;
  pointer-events: auto;
  transform: translateY(-50%) scale(1);
}

.link-handle:hover,
.link-handle.is-connecting {
  border-color: rgba(217, 119, 6, 0.45);
  color: rgb(180 83, 9);
  transform: translateY(-50%) scale(1.06);
}

.link-handle:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.45);
  outline-offset: 2px;
}

.dark .link-handle {
  border-color: rgba(255, 255, 255, 0.16);
  background: rgba(24, 24, 27, 0.9);
  color: rgb(161 161 170);
}

.dark .link-handle:hover,
.dark .link-handle.is-connecting {
  border-color: rgba(147, 197, 253, 0.42);
  color: rgb(191, 219, 254);
}

.card-actions {
  opacity: 0;
  transition: opacity 160ms ease;
}

.card-node:hover .card-actions,
.card-node:focus-within .card-actions,
.card-node.is-selected .card-actions {
  opacity: 1;
}

.card-action {
  display: flex;
  width: 1.5rem;
  height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: rgb(168 162 158);
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

@media (hover: none), (max-width: 640px) {
  .card-action {
    width: 2.75rem;
    height: 2.75rem;
  }

  .card-drag-grip {
    width: 2.5rem;
    height: 2.5rem;
  }
}

.card-action:hover {
  background: rgba(214, 211, 209, 0.55);
  color: rgb(68 64 60);
}

.card-action--copy:hover {
  background: rgba(254, 243, 199, 0.82);
  color: rgb(180, 83, 9);
}

.card-action--danger:hover {
  background: rgba(254, 226, 226, 0.8);
  color: rgb(190 18 60);
}

.card-action--share:hover {
  background: rgba(224, 231, 255, 0.78);
  color: rgb(67 56, 202);
}

.card-action--radar:hover {
  background: rgba(254, 243, 199, 0.78);
  color: rgb(146 64, 14);
}

.card-action--board:hover {
  background: rgba(209, 250, 229, 0.72);
  color: rgb(5, 150, 105);
}

.dark .card-action {
  color: rgb(113 113 122);
}

.dark .card-action:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgb(228 228 231);
}

.dark .card-action--danger:hover {
  background: rgba(136, 19, 55, 0.35);
  color: rgb(253 164 175);
}

.dark .card-action--copy:hover {
  background: rgba(56, 189, 248, 0.1);
  color: rgb(186, 230, 253);
}

.dark .card-action--share:hover {
  background: rgba(199, 210, 254, 0.1);
  color: rgb(199, 210, 254);
}

.dark .card-action--radar:hover {
  background: rgba(253, 230, 138, 0.09);
  color: rgb(253, 230, 138);
}

.dark .card-action--board:hover {
  background: rgba(110, 231, 183, 0.09);
  color: rgb(167, 243, 208);
}

.card-action--copy.is-copied,
.card-action--copy.is-copied:hover {
  background: rgba(209, 250, 229, 0.72);
  color: rgb(5, 150, 105);
}

.dark .card-action--copy.is-copied,
.dark .card-action--copy.is-copied:hover {
  background: rgba(16, 185, 129, 0.12);
  color: rgb(110, 231, 183);
}

.card-node:focus-visible .card-surface {
  border-color: var(--card-selected-border);
  box-shadow:
    var(--card-shadow-hover),
    0 0 0 2px var(--card-selection-border);
}

.card-node.is-selected {
  z-index: 100;
}

.card-node.is-dragging {
  z-index: 1000;
  opacity: 1;
  cursor: grabbing;
  will-change: transform;
}

.card-node.is-group-dragging {
  z-index: 999;
  opacity: 1;
}

.card-node.is-dragging,
.card-node.is-dragging * {
  cursor: grabbing !important;
}

.card-lift {
  transform-origin: 50% 50%;
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.card-node.is-dragging .card-lift {
  transform: scale(1.018);
  will-change: transform;
}

/* A rigid group must preserve every pairwise edge pixel: no per-card lift. */
.card-node.is-group-dragging .card-lift {
  transform: none;
}

.card-surface {
  box-shadow: var(--card-shadow-rest);
  transition:
    background-color 550ms cubic-bezier(0.22, 1, 0.36, 1),
    border-color 240ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.card-node:hover .card-surface {
  border-color: var(--card-hover-border);
  box-shadow: var(--card-shadow-hover);
}

.card-node.is-selected .card-surface {
  border-color: var(--card-hover-border);
}

.card-node.is-selected:focus-visible .card-surface {
  border-color: var(--card-selected-border);
}

.card-node.is-dragging .card-surface {
  box-shadow: var(--card-shadow-drag);
}

.card-selection {
  opacity: 0;
  border: 1px solid var(--card-selection-border);
  box-shadow: var(--card-selection-glow);
  transition:
    opacity 180ms ease,
    border-color 550ms cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 550ms cubic-bezier(0.22, 1, 0.36, 1);
}

.card-node.is-selected .card-selection {
  opacity: 1;
}

.card-selectable {
  cursor: text;
  user-select: text;
  -webkit-user-select: text;
}

[data-card-interactive] {
  cursor: default;
}

.card-drag-grip {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 9999px;
  color: rgb(168 162 158 / 0.72);
  opacity: 0.58;
  transition:
    opacity 160ms ease,
    color 160ms ease,
    background-color 160ms ease;
}

.card-node:hover .card-drag-grip,
.card-node:focus-within .card-drag-grip,
.card-node.is-selected .card-drag-grip {
  opacity: 1;
}

.card-drag-grip:hover {
  background: rgba(214, 211, 209, 0.5);
  color: rgb(87 83 78);
}

.dark .card-drag-grip {
  color: rgb(113 113 122 / 0.82);
}

.dark .card-drag-grip:hover {
  background: rgba(255, 255, 255, 0.08);
  color: rgb(212 212 216);
}

.note-card--compact {
  border-radius: 22px;
}

.note-card--compact .card-body {
  padding: 1.5rem;
}

.note-card--compact .card-title {
  margin-top: 1.4rem;
  font-size: 1.3rem;
  letter-spacing: -0.03em;
}

.note-card--compact .card-content {
  margin-top: 0.7rem;
  font-size: 0.8125rem;
  line-height: 1.7;
}

.note-card--compact .card-divider {
  margin-top: 1rem;
  margin-bottom: 1rem;
}

.note-card--compact .card-highlights {
  gap: 0.625rem;
}

.note-card--compact .card-highlight {
  gap: 0.75rem;
}

.note-card--compact .card-highlight-icon {
  width: 1.35rem;
  height: 1.35rem;
}

.note-card--compact .card-highlight-text {
  font-size: 0.75rem;
  line-height: 1.45rem;
}

.note-card--compact .card-footer {
  margin-top: 1rem;
  padding-top: 0.75rem;
}
</style>
