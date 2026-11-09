<script setup lang="ts">
import { computed, inject, onBeforeUnmount, onMounted, ref } from 'vue'
import { Grip, Inbox, Link2, Pencil, Trash2 } from '@lucide/vue'
import { removeCardHeight, setCardHeight } from '../../lib/card-metrics'
import { useCardDrag } from '../../composables/useCardDrag'
import { canvasCameraKey, type CanvasCamera } from '../../composables/useCanvas'
import { connectionKey } from '../../composables/useConnection'
import type { BoardItem, Card } from '../../types'

const props = withDefaults(
  defineProps<{
    item: BoardItem
    card: Card
    selected?: boolean
    indexLabel?: string
  }>(),
  {
    selected: false,
    indexLabel: 'CARD',
  },
)

const emit = defineEmits<{
  select: []
  positionCommit: [position: { x: number; y: number }]
  nudge: [delta: { x: number; y: number }]
  edit: []
  unplace: []
  delete: []
}>()

const identityCamera: CanvasCamera = {
  getViewport: () => ({ panX: 0, panY: 0, scale: 1 }),
  getContainerRect: () => null,
  screenToWorld: (point) => ({ x: point.x, y: point.y }),
  worldToScreen: (point) => ({ x: point.x, y: point.y }),
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
const noteCountLabel = computed(
  () => `${highlights.value.length.toString().padStart(2, '0')} ATOMIC NOTES`,
)

function handleLinkPointerDown(event: PointerEvent) {
  if (!connection) return

  connection.beginDrag(event, props.item)
}

const { isDragging, onPointerDown } = useCardDrag({
  root: rootEl,
  lift: liftEl,
  camera,
  getItem: () => props.item,
  onSelect: () => emit('select'),
  onCommit: (position) => emit('positionCommit', position),
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
    }"
    :style="{
      left: `${item.x}px`,
      top: `${item.y}px`,
      width: `${item.width ?? 420}px`,
    }"
    :data-card-id="card.id"
    :aria-labelledby="titleId"
    :aria-current="selected ? 'true' : undefined"
    data-world-item
    tabindex="0"
    @pointerdown="onPointerDown"
    @focus="emit('select')"
    @keydown="handleKeydown"
    @dragstart.prevent
  >
    <div ref="liftEl" class="card-lift relative w-full">
      <div
        class="card-selection pointer-events-none absolute -inset-1.5 rounded-[32px]"
        aria-hidden="true"
      />

      <div
        class="note-card card-surface relative w-full overflow-hidden rounded-[26px] border border-stone-200/80 bg-white/95 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/80"
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
          <header class="flex items-start justify-between gap-4">
            <div class="flex flex-wrap items-center gap-1.5">
              <span
                v-for="(tag, index) in card.tags"
                :key="tag"
                class="tag-pill"
                :class="tagTone(index)"
                data-card-interactive
              >
                #{{ tag }}
              </span>
            </div>

            <div class="flex shrink-0 items-center gap-1">
              <div class="card-actions flex items-center gap-0.5">
                <button
                  type="button"
                  class="card-action"
                  data-card-interactive
                  aria-label="编辑卡片"
                  title="编辑"
                  @pointerdown.stop
                  @click.stop="emit('edit')"
                >
                  <Pencil :size="11" :stroke-width="1.7" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="card-action"
                  data-card-interactive
                  aria-label="移出白板"
                  title="移出白板"
                  @pointerdown.stop
                  @click.stop="emit('unplace')"
                >
                  <Inbox :size="11" :stroke-width="1.7" aria-hidden="true" />
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
                  <Trash2 :size="11" :stroke-width="1.7" aria-hidden="true" />
                </button>
              </div>

              <span
                class="card-index flex cursor-grab items-center gap-1.5 rounded-full border border-stone-200/70 bg-stone-50/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400"
                data-card-drag-handle
                title="拖动卡片"
              >
                <Grip
                  :size="13"
                  :stroke-width="1.6"
                  class="text-stone-400 dark:text-zinc-500"
                  aria-hidden="true"
                />
                <span v-if="!compact" class="card-index-label">
                  {{ indexLabel }}
                </span>
              </span>
            </div>
          </header>

          <h2
            :id="titleId"
            class="card-title mt-7 font-serif text-[1.7rem] font-medium leading-[1.36] tracking-[-0.02em] text-stone-900 dark:text-zinc-100"
          >
            {{ card.title }}
          </h2>

          <p
            class="card-content card-selectable mt-3.5 text-[0.9375rem] leading-[1.9] text-stone-600 dark:text-zinc-400"
            data-card-selectable
          >
            {{ card.content }}
          </p>

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
            class="card-footer mt-7 flex items-center justify-between gap-4 border-t border-stone-200/70 pt-4 dark:border-white/[0.08]"
          >
            <div
              class="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400"
            >
              <span class="relative flex h-1.5 w-1.5" aria-hidden="true">
                <span
                  class="absolute inset-0 rounded-full bg-emerald-500/25 blur-[3px]"
                />
                <span
                  class="relative h-1.5 w-1.5 rounded-full bg-emerald-500/80"
                />
              </span>
              <span>{{
                isDragging ? '拖动中 · 待落盘' : '本地草稿 · 已保存'
              }}</span>
            </div>
            <span
              class="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400"
            >
              {{ noteCountLabel }}
            </span>
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
  width: 1.35rem;
  height: 1.35rem;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  color: rgb(168 162 158);
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.card-action:hover {
  background: rgba(214, 211, 209, 0.55);
  color: rgb(68 64 60);
}

.card-action--danger:hover {
  background: rgba(254, 226, 226, 0.8);
  color: rgb(190 18 60);
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
  cursor: grabbing;
  will-change: transform;
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

.note-card--compact {
  border-radius: 22px;
}

.note-card--compact .card-body {
  padding: 1.5rem;
}

.note-card--compact .card-index {
  gap: 0;
  padding: 0.3rem;
}

.note-card--compact .card-index-label {
  display: none;
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
