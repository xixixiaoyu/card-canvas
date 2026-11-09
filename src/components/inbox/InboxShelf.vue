<script setup lang="ts">
import { computed, ref } from 'vue'
import {
  GripVertical,
  Inbox,
  Search,
  Sparkles,
  X,
} from '@lucide/vue'
import CardNode from '../canvas/CardNode.vue'
import { useBoardStore } from '../../stores/board'
import { useWorkspaceStore } from '../../stores/workspace'
import {
  GHOST_CARD_WIDTH,
  useInboxDrag,
  type InboxDropPayload,
} from '../../composables/useInboxDrag'
import type { CanvasCamera } from '../../composables/useCanvas'
import type { BoardItem, Card } from '../../types'

const props = defineProps<{
  camera: CanvasCamera
}>()

const board = useBoardStore()
const workspace = useWorkspaceStore()

const search = ref('')
const activeTags = ref<string[]>([])

const tagFrequency = computed(() => {
  const counts = new Map<string, number>()

  for (const card of board.inboxCards) {
    for (const tag of card.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1)
    }
  }

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([tag]) => tag)
})

const filteredCards = computed(() => {
  const query = search.value.trim().toLowerCase()

  return board.inboxCards.filter((card) => {
    if (query) {
      const haystack =
        `${card.title} ${card.content} ${card.tags.join(' ')}`.toLowerCase()
      if (!haystack.includes(query)) return false
    }

    if (activeTags.value.length) {
      const cardTags = new Set(card.tags.map((tag) => tag.toLowerCase()))
      if (!activeTags.value.every((tag) => cardTags.has(tag.toLowerCase()))) {
        return false
      }
    }

    return true
  })
})

const hasFilters = computed(
  () => Boolean(search.value.trim()) || activeTags.value.length > 0,
)

function isTagActive(tag: string) {
  return activeTags.value.some(
    (entry) => entry.toLowerCase() === tag.toLowerCase(),
  )
}

function toggleTag(tag: string) {
  activeTags.value = isTagActive(tag)
    ? activeTags.value.filter((entry) => entry !== tag)
    : [...activeTags.value, tag]
}

function clearFilters() {
  search.value = ''
  activeTags.value = []
}

function handleSearchEscape() {
  if (search.value.trim() || activeTags.value.length) {
    clearFilters()
    return
  }

  workspace.closeInbox()
}

function tagTone(index: number) {
  return index % 2 === 0 ? 'tag-amber' : 'tag-sage'
}

function formatTime(timestamp: number) {
  const elapsed = Date.now() - timestamp

  if (elapsed < 60_000) return '刚刚'
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)} 分钟前`
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)} 小时前`

  const date = new Date(timestamp)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

const drag = useInboxDrag({
  camera: props.camera,
  onDrop: (payload: InboxDropPayload) => {
    board.placeCard(payload.card.id, workspace.activeBoardId, {
      x: payload.x,
      y: payload.y,
      width: payload.width,
    })
  },
})

const {
  ghostCard,
  isDragging,
  isOverCanvas,
  draggingCardId,
  onPointerDown: startInboxDrag,
} = drag

const ghostItem = computed<BoardItem>(() => ({
  id: 'projection-inbox-ghost',
  cardId: ghostCard.value?.id ?? 'inbox-ghost',
  boardId: workspace.activeBoardId,
  x: 0,
  y: 0,
  width: GHOST_CARD_WIDTH,
}))

function bindGhostRef(element: unknown) {
  drag.setGhostElement(element)
}

function startDrag(event: PointerEvent, card: Card) {
  startInboxDrag(event, card)
}
</script>

<template>
  <Transition name="inbox-tab">
    <button
      v-if="!workspace.isInboxOpen"
      type="button"
      class="fixed right-0 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-2 rounded-l-2xl border border-r-0 border-stone-200/80 bg-white/80 px-2.5 py-4 text-stone-500 shadow-[0_12px_36px_-16px_rgba(41,37,36,0.28)] backdrop-blur-xl transition-colors hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-white/10 dark:bg-zinc-900/80 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      data-inbox-ui
      aria-label="打开待整理池"
      :aria-expanded="workspace.isInboxOpen"
      @click="workspace.openInbox()"
    >
      <span class="relative">
        <Inbox :size="15" :stroke-width="1.6" aria-hidden="true" />
        <span
          v-if="board.inboxCount > 0"
          class="absolute -right-3 -top-2.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-amber-600 px-1 font-mono text-[8px] font-medium leading-none text-white shadow-sm dark:bg-amber-500 dark:text-zinc-950"
        >
          {{ board.inboxCount > 99 ? '99+' : board.inboxCount }}
        </span>
      </span>
      <span
        class="font-mono text-[9px] uppercase tracking-[0.2em] [writing-mode:vertical-rl]"
      >
        待整理
      </span>
    </button>
  </Transition>

  <Transition name="shelf">
    <aside
      v-if="workspace.isInboxOpen"
      id="inbox-shelf"
      class="inbox-shelf fixed inset-x-3 bottom-4 top-[80px] z-40 flex flex-col overflow-hidden rounded-[26px] border border-stone-200/80 bg-[#fdfbf7]/[0.92] shadow-[0_30px_90px_-30px_rgba(41,37,36,0.35)] backdrop-blur-2xl sm:inset-x-auto sm:bottom-6 sm:right-4 sm:top-[88px] sm:w-[360px] dark:border-white/10 dark:bg-zinc-900/[0.9] dark:shadow-[0_40px_110px_-30px_rgba(0,0,0,0.9)]"
      data-inbox-ui
      aria-label="待整理池"
    >
      <header
        class="flex items-start justify-between gap-3 border-b border-stone-200/70 px-4 pb-3.5 pt-4 dark:border-white/[0.08]"
      >
        <div class="flex items-center gap-2.5">
          <span
            class="flex h-8 w-8 items-center justify-center rounded-[10px] border border-stone-200/80 bg-white/70 text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
          >
            <Inbox :size="14" :stroke-width="1.6" aria-hidden="true" />
          </span>
          <div>
            <p
              class="flex items-center gap-2 font-serif text-[13px] font-medium text-stone-800 dark:text-zinc-100"
            >
              待整理池
              <span
                class="rounded-full border border-stone-200/80 px-1.5 py-0.5 font-mono text-[9px] font-normal text-stone-500 dark:border-white/10 dark:text-zinc-400"
              >
                {{ board.inboxCount }}
              </span>
            </p>
            <p
              class="mt-0.5 font-mono text-[8px] uppercase tracking-[0.2em] text-stone-400 dark:text-zinc-500"
            >
              Inbox · {{ isDragging ? '松手投放' : '拖到画布' }}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200 dark:focus-visible:ring-white/25"
          aria-label="收起待整理池"
          @click="workspace.closeInbox()"
        >
          <X :size="14" :stroke-width="1.6" aria-hidden="true" />
        </button>
      </header>

      <div class="px-4 py-3">
        <div class="relative">
          <Search
            :size="13"
            :stroke-width="1.7"
            class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-500"
            aria-hidden="true"
          />
          <input
            v-model="search"
            type="text"
            placeholder="搜索标题、正文或标签"
            aria-label="搜索待整理卡片"
            class="h-8 w-full rounded-full border border-stone-200/80 bg-white/60 pl-8 pr-8 text-[11px] text-stone-700 outline-none transition-colors placeholder:text-stone-400 focus:border-stone-300 focus:bg-white dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:placeholder:text-zinc-600 dark:focus:border-white/20 dark:focus:bg-white/[0.05]"
            @keydown.esc.stop.prevent="handleSearchEscape"
          />
          <button
            v-if="search"
            type="button"
            class="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
            aria-label="清空搜索"
            @click="search = ''"
          >
            <X :size="10" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>

        <div
          v-if="tagFrequency.length"
          class="mt-2.5 flex flex-wrap gap-1.5"
          aria-label="按标签筛选"
        >
          <button
            v-for="tag in tagFrequency"
            :key="tag"
            type="button"
            class="rounded-full border px-2 py-0.5 text-[10px] transition-colors"
            :class="
              isTagActive(tag)
                ? 'border-amber-700/30 bg-amber-500/15 text-amber-800 dark:border-amber-300/25 dark:bg-amber-300/10 dark:text-amber-200'
                : 'border-stone-200/80 bg-white/40 text-stone-500 hover:border-stone-300 hover:text-stone-700 dark:border-white/10 dark:bg-white/[0.02] dark:text-zinc-500 dark:hover:border-white/20 dark:hover:text-zinc-300'
            "
            :aria-pressed="isTagActive(tag)"
            @click="toggleTag(tag)"
          >
            #{{ tag }}
          </button>
        </div>

        <button
          v-if="hasFilters"
          type="button"
          class="mt-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-400 transition-colors hover:text-stone-700 dark:text-zinc-500 dark:hover:text-zinc-200"
          @click="clearFilters"
        >
          清除筛选
        </button>
      </div>

      <div class="flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
        <ul v-if="filteredCards.length" class="flex flex-col gap-2">
          <li v-for="card in filteredCards" :key="card.id">
            <article
              class="inbox-card group relative cursor-grab select-none rounded-2xl border border-stone-200/70 bg-white/70 p-3 transition-[border-color,background-color,box-shadow,opacity] duration-200 hover:border-stone-300/90 hover:bg-white hover:shadow-[0_8px_24px_-14px_rgba(41,37,36,0.3)] dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-white/15 dark:hover:bg-white/[0.045]"
              :class="{
                'is-dragging opacity-40': draggingCardId === card.id,
              }"
              :data-card-id="card.id"
              data-inbox-card
              draggable="false"
              @pointerdown="startDrag($event, card)"
              @dragstart.prevent
            >
              <div class="flex items-start justify-between gap-2">
                <div class="flex min-w-0 flex-wrap items-center gap-1.5">
                  <span
                    v-for="(tag, index) in card.tags.slice(0, 2)"
                    :key="tag"
                    class="tag-pill"
                    :class="tagTone(index)"
                  >
                    #{{ tag }}
                  </span>
                  <span
                    v-if="card.tags.length > 2"
                    class="font-mono text-[9px] text-stone-400 dark:text-zinc-600"
                  >
                    +{{ card.tags.length - 2 }}
                  </span>
                </div>
                <GripVertical
                  :size="13"
                  :stroke-width="1.6"
                  class="mt-0.5 shrink-0 text-stone-300 transition-colors group-hover:text-stone-500 dark:text-zinc-700 dark:group-hover:text-zinc-400"
                  aria-hidden="true"
                />
              </div>

              <h3
                class="mt-2 line-clamp-2 font-serif text-[13px] font-medium leading-snug tracking-[-0.01em] text-stone-800 dark:text-zinc-200"
              >
                {{ card.title }}
              </h3>
              <p
                v-if="card.content"
                class="mt-1 line-clamp-2 text-[11px] leading-[1.7] text-stone-500 dark:text-zinc-500"
              >
                {{ card.content }}
              </p>

              <div
                class="mt-2 flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.16em] text-stone-400 dark:text-zinc-600"
              >
                <span>{{ formatTime(card.createdAt) }}</span>
                <span class="opacity-0 transition-opacity group-hover:opacity-100">
                  拖到画布
                </span>
              </div>
            </article>
          </li>
        </ul>

        <div
          v-else-if="board.inboxCards.length === 0"
          class="flex h-full min-h-[220px] flex-col items-center justify-center px-6 text-center"
        >
          <span
            class="flex h-11 w-11 items-center justify-center rounded-2xl border border-dashed border-stone-300/80 text-stone-400 dark:border-white/15 dark:text-zinc-600"
          >
            <Sparkles :size="17" :stroke-width="1.4" aria-hidden="true" />
          </span>
          <p class="mt-3 font-serif text-[13px] text-stone-700 dark:text-zinc-300">
            所有灵感均已上板
          </p>
          <p class="mt-1 text-[10px] leading-5 text-stone-400 dark:text-zinc-600">
            按 <kbd class="font-mono">⌘K</kbd> 记录新的想法
          </p>
        </div>

        <div
          v-else
          class="flex h-full min-h-[200px] flex-col items-center justify-center px-6 text-center"
        >
          <p class="font-serif text-[13px] text-stone-700 dark:text-zinc-300">
            没有匹配的卡片
          </p>
          <button
            type="button"
            class="mt-2 rounded-full border border-stone-200/80 px-3 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-500 transition-colors hover:text-stone-800 dark:border-white/10 dark:text-zinc-500 dark:hover:text-zinc-200"
            @click="clearFilters"
          >
            清除筛选
          </button>
        </div>
      </div>

      <footer
        class="flex items-center justify-between gap-2 border-t border-stone-200/70 px-4 py-2.5 font-mono text-[8px] uppercase tracking-[0.16em] text-stone-400 dark:border-white/[0.08] dark:text-zinc-600"
      >
        <span>Pointer · 拖入画布</span>
        <span>{{ filteredCards.length }} / {{ board.inboxCount }}</span>
      </footer>
    </aside>
  </Transition>

  <Teleport to="body">
    <div
      v-if="ghostCard"
      :ref="bindGhostRef"
      class="inbox-ghost"
      :class="{ 'is-over-canvas': isOverCanvas }"
      aria-hidden="true"
    >
      <CardNode
        :item="ghostItem"
        :card="ghostCard"
        :selected="false"
        index-label="DROP"
      />
    </div>
  </Teleport>
</template>

<style scoped>
.inbox-tab-enter-active,
.inbox-tab-leave-active {
  transition:
    opacity 200ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.inbox-tab-enter-from,
.inbox-tab-leave-to {
  opacity: 0;
  transform: translate(100%, -50%);
}

.shelf-enter-active,
.shelf-leave-active {
  transition:
    opacity 220ms ease,
    transform 340ms cubic-bezier(0.22, 1, 0.36, 1);
}

.shelf-enter-from,
.shelf-leave-to {
  opacity: 0;
  transform: translateX(calc(100% + 1.5rem));
}

.inbox-card {
  touch-action: none;
  -webkit-touch-callout: none;
}

.inbox-card:active {
  cursor: grabbing;
}

.inbox-ghost {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 70;
  width: 420px;
  transform-origin: 0 0;
  pointer-events: none;
  opacity: 1;
  will-change: transform;
}

.inbox-ghost :deep(.canvas-world-item) {
  position: relative !important;
  left: 0 !important;
  top: 0 !important;
}

.inbox-ghost :deep(.card-surface) {
  box-shadow:
    0 0 0 1px rgba(180, 83, 9, 0.14),
    0 2px 6px rgba(41, 37, 36, 0.08),
    0 30px 70px -20px rgba(41, 37, 36, 0.34);
  transition:
    box-shadow 220ms ease,
    border-color 220ms ease;
}

.inbox-ghost.is-over-canvas :deep(.card-surface) {
  box-shadow:
    0 0 0 1px rgba(217, 119, 6, 0.4),
    0 4px 10px rgba(41, 37, 36, 0.1),
    0 46px 100px -22px rgba(41, 37, 36, 0.4),
    0 0 48px -16px rgba(217, 119, 6, 0.32);
}

:global(.dark) .inbox-ghost :deep(.card-surface) {
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.14),
    0 40px 90px -20px rgba(0, 0, 0, 0.9);
}

:global(.dark) .inbox-ghost.is-over-canvas :deep(.card-surface) {
  box-shadow:
    0 0 0 1px rgba(251, 191, 36, 0.46),
    0 46px 100px -20px rgba(0, 0, 0, 0.95),
    0 0 56px -14px rgba(251, 191, 36, 0.3);
}
</style>
