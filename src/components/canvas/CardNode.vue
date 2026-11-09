<script setup lang="ts">
import { computed, inject, ref } from 'vue'
import { Grip } from '@lucide/vue'
import { useCardDrag } from '../../composables/useCardDrag'
import {
  canvasCameraKey,
  type CanvasCamera,
} from '../../composables/useCanvas'
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
}>()

const identityCamera: CanvasCamera = {
  getViewport: () => ({ panX: 0, panY: 0, scale: 1 }),
  getContainerRect: () => null,
  screenToWorld: (point) => ({ x: point.x, y: point.y }),
  worldToScreen: (point) => ({ x: point.x, y: point.y }),
}

const camera = inject(canvasCameraKey, identityCamera)
const rootEl = ref<HTMLElement | null>(null)
const liftEl = ref<HTMLElement | null>(null)

const compact = computed(() => (props.item.width ?? 420) < 360)
const highlights = computed(() => props.card.highlights ?? [])
const titleId = computed(() => `card-title-${props.card.id}`)
const noteCountLabel = computed(
  () =>
    `${highlights.value.length.toString().padStart(2, '0')} ATOMIC NOTES`,
)

const { isDragging, onPointerDown } = useCardDrag({
  root: rootEl,
  lift: liftEl,
  camera,
  getItem: () => props.item,
  onSelect: () => emit('select'),
  onCommit: (position) => emit('positionCommit', position),
})

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
    data-world-item
    @pointerdown="onPointerDown"
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

            <span
              class="card-index flex shrink-0 cursor-grab items-center gap-1.5 rounded-full border border-stone-200/70 bg-stone-50/60 px-2 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400"
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
                  <span
                    class="font-medium text-stone-800 dark:text-zinc-200"
                  >{{ highlight.label }}</span>
                  <span
                    class="mx-1.5 text-stone-300 dark:text-zinc-700"
                    aria-hidden="true"
                  >/</span>
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
              <span>{{ isDragging ? '拖动中 · 待落盘' : '本地草稿 · 已保存' }}</span>
            </div>
            <span
              class="font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 dark:text-zinc-400"
            >
              {{ noteCountLabel }}
            </span>
          </footer>
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.card-node {
  z-index: 1;
  cursor: grab;
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
