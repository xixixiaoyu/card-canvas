<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CornerDownLeft, Search, X } from '@lucide/vue'
import { db } from '../../db'
import {
  searchGlobalEntries,
  type GlobalSearchEntry,
  type GlobalSearchResult,
  type SpotlightTarget,
} from '../../lib/global-search'
import { plainRecord } from '../../lib/plain-record'
import { useBoardStore } from '../../stores/board'
import { useWorkspaceStore } from '../../stores/workspace'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [target: SpotlightTarget]
}>()

const board = useBoardStore()
const workspace = useWorkspaceStore()
const query = ref('')
const selectedIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const resultEls = ref<Array<HTMLElement | null>>([])
const entries = ref<GlobalSearchEntry[]>([])
const indexLoading = ref(false)
const indexError = ref('')

let previousFocus: HTMLElement | null = null
let skipFocusRestore = false
let indexToken = 0

const results = computed<GlobalSearchResult[]>(() =>
  searchGlobalEntries(entries.value, query.value, workspace.activeBoardId),
)

const selectedResult = computed(() => results.value[selectedIndex.value])
const hasQuery = computed(() => query.value.trim().length > 0)
const cardCount = computed(
  () => new Set(entries.value.map((entry) => entry.card.id)).size,
)
const resultLabel = computed(() =>
  hasQuery.value ? `${results.value.length} 个结果` : '最近卡片',
)

async function loadGlobalIndex() {
  const token = ++indexToken
  indexLoading.value = true
  indexError.value = ''
  entries.value = []

  try {
    const [storedCards, storedItems, storedBoards] = await Promise.all([
      db.cards.toArray(),
      db.boardItems.toArray(),
      db.boards.toArray(),
    ])
    if (token !== indexToken) return

    const snapshot = plainRecord({
      cards: storedCards,
      items: storedItems,
      boards: storedBoards,
    })
    const boardsById = new Map(
      snapshot.boards.map((entry) => [entry.id, entry]),
    )
    const cardsById = new Map(
      snapshot.cards
        .filter((card) => !card.isDeleted)
        .map((card) => [card.id, card]),
    )
    const next = new Map<string, GlobalSearchEntry>()

    for (const item of snapshot.items) {
      const card = cardsById.get(item.cardId)
      const targetBoard = boardsById.get(item.boardId)
      if (!card || !targetBoard) continue

      next.set(item.id, {
        card,
        itemId: item.id,
        boardId: item.boardId,
        boardName: targetBoard.name,
      })
    }

    // The current board may have just-captured cards whose Dexie transaction
    // has not settled yet. Overlay the live store for immediate searchability.
    const activeName = workspace.activeBoardName
    for (const entry of board.entries) {
      const card = plainRecord(entry.card)
      next.set(entry.item.id, {
        card,
        itemId: entry.item.id,
        boardId: workspace.activeBoardId,
        boardName: activeName,
      })
    }

    if (token === indexToken) entries.value = [...next.values()]
  } catch (cause) {
    console.error('[card-canvas] Unable to build global search index', cause)
    if (token === indexToken) {
      indexError.value = '无法读取全局卡片'
      entries.value = []
    }
  } finally {
    if (token === indexToken) indexLoading.value = false
  }
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      skipFocusRestore = false
      previousFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      query.value = ''
      selectedIndex.value = 0
      void loadGlobalIndex()
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
      return
    }

    indexToken += 1
    await nextTick()
    if (skipFocusRestore) {
      skipFocusRestore = false
      previousFocus = null
      return
    }
    if (previousFocus?.isConnected) previousFocus.focus()
    previousFocus = null
  },
)

watch(query, () => {
  selectedIndex.value = 0
})

watch(results, (next) => {
  if (!next.length) {
    selectedIndex.value = 0
    return
  }
  selectedIndex.value = Math.min(selectedIndex.value, next.length - 1)
})

watch(selectedIndex, async () => {
  await nextTick()
  resultEls.value[selectedIndex.value]?.scrollIntoView({ block: 'nearest' })
})

function close() {
  if (!props.open) return
  emit('update:open', false)
}

function setResultEl(element: unknown, index: number) {
  resultEls.value[index] = element instanceof HTMLElement ? element : null
}

function moveSelection(delta: number) {
  if (!results.value.length) return
  const total = results.value.length
  selectedIndex.value = (selectedIndex.value + delta + total) % total
}

function choose(result = selectedResult.value) {
  if (!result) return

  skipFocusRestore = true
  close()
  emit('select', {
    cardId: result.entry.card.id,
    boardId: result.entry.boardId,
    itemId: result.entry.itemId,
  })
}

function handleKeydown(event: KeyboardEvent) {
  if (event.isComposing) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close()
    return
  }

  if (event.key === 'ArrowDown') {
    event.preventDefault()
    event.stopPropagation()
    moveSelection(1)
    return
  }

  if (event.key === 'ArrowUp') {
    event.preventDefault()
    event.stopPropagation()
    moveSelection(-1)
    return
  }

  if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    choose()
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    inputEl.value?.focus()
  }
}
</script>

<template>
  <Transition name="spotlight">
    <div
      v-if="open"
      class="spotlight-layer fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[12vh]"
      @pointerdown.self="close"
    >
      <div
        class="spotlight-backdrop absolute inset-0 bg-stone-950/10 backdrop-blur-[2px] dark:bg-black/35"
        aria-hidden="true"
        @pointerdown="close"
      />

      <section
        class="spotlight-panel relative w-full max-w-xl overflow-hidden rounded-[22px] border border-stone-200/80 bg-[#fdfbf7]/95 shadow-[0_30px_100px_-30px_rgba(41,37,36,0.5)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/95 dark:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]"
        role="dialog"
        aria-modal="true"
        aria-label="卡片搜索"
        @keydown="handleKeydown"
        @pointerdown.stop
      >
        <header
          class="flex items-center gap-3 border-b border-stone-200/70 px-4 py-3.5 dark:border-white/[0.08]"
        >
          <Search
            :size="16"
            :stroke-width="1.8"
            class="shrink-0 text-stone-400 dark:text-zinc-500"
            aria-hidden="true"
          />
          <input
            ref="inputEl"
            v-model="query"
            type="text"
            class="min-w-0 flex-1 bg-transparent text-[14px] text-stone-800 outline-none placeholder:text-stone-400 dark:text-zinc-100 dark:placeholder:text-zinc-600"
            placeholder="搜索所有白板的标题、正文或标签…"
            aria-label="搜索关键词"
            autocomplete="off"
            spellcheck="false"
          />
          <button
            type="button"
            class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/[0.08] dark:hover:text-zinc-200"
            aria-label="关闭搜索"
            @click="close"
          >
            <X :size="13" :stroke-width="1.8" aria-hidden="true" />
          </button>
        </header>

        <div
          class="flex items-center justify-between px-4 pb-1.5 pt-3 font-mono text-[8px] uppercase tracking-[0.2em] text-stone-400 dark:text-zinc-600"
        >
          <span>{{ resultLabel }}</span>
          <span>{{ cardCount }} CARDS · {{ entries.length }} PLACEMENTS</span>
        </div>

        <div
          class="max-h-[340px] overflow-y-auto px-2 pb-2 [scrollbar-width:thin]"
          role="listbox"
          aria-label="搜索结果"
        >
          <button
            v-for="(result, index) in results"
            :key="`${result.entry.itemId}`"
            :ref="(element) => setResultEl(element, index)"
            type="button"
            class="spotlight-result group flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
            :class="
              index === selectedIndex
                ? 'is-active bg-stone-900/[0.065] dark:bg-white/[0.075]'
                : 'hover:bg-stone-900/[0.04] dark:hover:bg-white/[0.04]'
            "
            role="option"
            :aria-selected="index === selectedIndex"
            data-spotlight-result
            :data-result-board="result.entry.boardId"
            @pointermove="selectedIndex = index"
            @click="choose(result)"
          >
            <span
              class="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[7px] border border-stone-200/80 bg-white/60 font-mono text-[8px] text-stone-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-500"
              aria-hidden="true"
            >
              {{ String(index + 1).padStart(2, '0') }}
            </span>

            <span class="min-w-0 flex-1">
              <span class="flex items-start justify-between gap-2">
                <span
                  class="block min-w-0 truncate font-serif text-[14px] font-medium tracking-[-0.01em] text-stone-800 dark:text-zinc-100"
                >
                  {{ result.card.title }}
                </span>
                <span
                  class="max-w-[9rem] shrink-0 truncate rounded-full border px-1.5 py-0.5 font-mono text-[8px] tracking-[0.04em]"
                  :class="
                    result.entry.boardId === workspace.activeBoardId
                      ? 'border-amber-500/30 bg-amber-500/[0.08] text-amber-700 dark:border-amber-300/25 dark:bg-amber-300/[0.06] dark:text-amber-200'
                      : 'border-stone-200/70 bg-white/50 text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400'
                  "
                  :title="result.entry.boardName"
                  data-board-badge
                >
                  {{ result.entry.boardName }}
                </span>
              </span>

              <span
                v-if="result.excerpt"
                class="mt-1 block line-clamp-2 text-[11px] leading-[1.7] text-stone-500 dark:text-zinc-400"
              >
                {{ result.excerpt }}
              </span>

              <span
                v-if="result.card.tags.length"
                class="mt-1.5 flex flex-wrap items-center gap-1"
              >
                <span
                  v-for="tag in result.card.tags.slice(0, 4)"
                  :key="tag"
                  class="rounded-full border border-stone-200/70 bg-white/50 px-1.5 py-0.5 font-mono text-[8px] tracking-[0.04em] text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.03] dark:text-zinc-400"
                  :class="{
                    'border-amber-500/40 text-amber-700 dark:border-amber-300/30 dark:text-amber-200':
                      result.matchedTags.includes(tag),
                  }"
                >
                  #{{ tag }}
                </span>
              </span>
            </span>

            <CornerDownLeft
              :size="12"
              :stroke-width="1.7"
              class="mt-1 shrink-0 text-stone-300 transition-opacity dark:text-zinc-600"
              :class="{
                'opacity-100': index === selectedIndex,
                'opacity-0': index !== selectedIndex,
              }"
              aria-hidden="true"
            />
          </button>

          <div
            v-if="indexLoading"
            class="flex flex-col items-center justify-center px-4 py-10 text-center"
          >
            <Search
              :size="18"
              :stroke-width="1.5"
              class="animate-pulse text-stone-300 dark:text-zinc-700"
              aria-hidden="true"
            />
            <p class="mt-3 text-[12px] text-stone-500 dark:text-zinc-400">
              正在载入全局卡片…
            </p>
          </div>

          <div
            v-else-if="indexError"
            class="flex flex-col items-center justify-center px-4 py-10 text-center"
          >
            <p class="text-[12px] text-rose-600 dark:text-rose-300">
              {{ indexError }}
            </p>
            <button
              type="button"
              class="mt-3 rounded-full border border-stone-300/80 px-3 py-1 text-[10px] text-stone-600 hover:bg-stone-100 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.06]"
              @click="loadGlobalIndex"
            >
              重试
            </button>
          </div>

          <div
            v-else-if="!results.length"
            class="flex flex-col items-center justify-center px-4 py-10 text-center"
          >
            <Search
              :size="18"
              :stroke-width="1.5"
              class="text-stone-300 dark:text-zinc-700"
              aria-hidden="true"
            />
            <p class="mt-3 text-[12px] text-stone-500 dark:text-zinc-400">
              没有匹配的卡片
            </p>
            <p
              class="mt-1 font-mono text-[8px] uppercase tracking-[0.16em] text-stone-400 dark:text-zinc-600"
            >
              试试标题、正文或 #标签
            </p>
          </div>
        </div>

        <footer
          class="flex items-center justify-between border-t border-stone-200/70 px-4 py-2.5 font-mono text-[8px] uppercase tracking-[0.14em] text-stone-400 dark:border-white/[0.08] dark:text-zinc-600"
        >
          <div class="flex items-center gap-2">
            <span>↑↓ 选择</span>
            <span class="text-stone-300 dark:text-zinc-700">·</span>
            <span>↵ 飞往</span>
          </div>
          <span>Esc 关闭</span>
        </footer>
      </section>
    </div>
  </Transition>
</template>

<style scoped>
.spotlight-enter-active,
.spotlight-leave-active {
  transition: opacity 180ms ease;
}

.spotlight-enter-active .spotlight-panel,
.spotlight-leave-active .spotlight-panel {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.spotlight-enter-from,
.spotlight-leave-to {
  opacity: 0;
}

.spotlight-enter-from .spotlight-panel,
.spotlight-leave-to .spotlight-panel {
  opacity: 0;
  transform: translateY(-7px) scale(0.985);
}
</style>
