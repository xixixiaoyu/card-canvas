<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CornerDownLeft, Search, X } from '@lucide/vue'
import { db } from '../../db'
import { parseTaskLine } from '../../lib/atomic-markdown'
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
const scope = ref<'board' | 'workspace'>('workspace')
const sortMode = ref<'recent' | 'title'>('recent')
const selectedIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const resultEls = ref<Array<HTMLElement | null>>([])
const entries = ref<GlobalSearchEntry[]>([])
const indexLoading = ref(false)
const indexError = ref('')

let previousFocus: HTMLElement | null = null
let skipFocusRestore = false
let indexToken = 0

const scopedEntries = computed(() =>
  scope.value === 'board'
    ? entries.value.filter((entry) => entry.boardId === workspace.activeBoardId)
    : entries.value,
)

const results = computed<GlobalSearchResult[]>(() => {
  const matches = searchGlobalEntries(
    scopedEntries.value,
    query.value,
    workspace.activeBoardId,
    Math.max(scopedEntries.value.length, 1),
  )

  if (sortMode.value === 'recent') return matches

  return [...matches].sort(
    (a, b) =>
      a.card.title.localeCompare(b.card.title, 'zh-CN') ||
      a.entry.boardName.localeCompare(b.entry.boardName, 'zh-CN'),
  )
})

const selectedResult = computed(() => results.value[selectedIndex.value])
const hasQuery = computed(() => query.value.trim().length > 0)
const scopedCardCount = computed(
  () => new Set(scopedEntries.value.map((entry) => entry.card.id)).size,
)
const resultLabel = computed(() =>
  hasQuery.value
    ? `${results.value.length} 个结果`
    : scope.value === 'board'
      ? '当前白板全部卡片'
      : '全工作区卡片',
)
const pendingByCard = computed(() => {
  const counts = new Map<string, number>()

  for (const entry of scopedEntries.value) {
    if (counts.has(entry.card.id)) continue

    let count = 0
    for (const line of entry.card.content.split(/\r?\n/)) {
      const task = parseTaskLine(line)
      if (task && !task.checked) count += 1
    }
    counts.set(entry.card.id, count)
  }

  return counts
})

function pendingCount(cardId: string) {
  return pendingByCard.value.get(cardId) ?? 0
}

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
      scope.value = 'workspace'
      sortMode.value = 'recent'
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

watch([scope, sortMode], () => {
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
      class="spotlight-layer fixed inset-0 z-[80] flex items-start justify-center px-3 pt-[8vh] sm:px-4"
      @pointerdown.self="close"
    >
      <div
        class="spotlight-backdrop absolute inset-0 bg-stone-950/10 backdrop-blur-[2px] dark:bg-black/35"
        aria-hidden="true"
        @pointerdown="close"
      />

      <section
        class="spotlight-panel relative w-full max-w-4xl overflow-hidden rounded-[22px] border border-stone-200/80 bg-[#fdfbf7]/95 shadow-[0_30px_100px_-30px_rgba(41,37,36,0.5)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/95 dark:shadow-[0_40px_120px_-30px_rgba(0,0,0,0.95)]"
        role="dialog"
        aria-modal="true"
        aria-label="Card Atlas 卡片纵览"
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
            placeholder="搜索卡片；留空即可纵览全部…"
            aria-label="搜索卡片"
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
          class="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200/60 px-3 py-2.5 dark:border-white/[0.06]"
        >
          <div
            class="flex items-center rounded-full border border-stone-200/75 bg-white/45 p-0.5 dark:border-white/[0.08] dark:bg-white/[0.025]"
            role="group"
            aria-label="卡片范围"
          >
            <button
              type="button"
              class="rounded-full px-2.5 py-1 text-[9px] transition-colors"
              :class="
                scope === 'board'
                  ? 'bg-stone-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-stone-500 hover:text-stone-800 dark:text-zinc-500 dark:hover:text-zinc-200'
              "
              :aria-pressed="scope === 'board'"
              data-atlas-scope="board"
              @click="scope = 'board'"
            >
              当前白板
            </button>
            <button
              type="button"
              class="rounded-full px-2.5 py-1 text-[9px] transition-colors"
              :class="
                scope === 'workspace'
                  ? 'bg-stone-900 text-white shadow-sm dark:bg-zinc-100 dark:text-zinc-900'
                  : 'text-stone-500 hover:text-stone-800 dark:text-zinc-500 dark:hover:text-zinc-200'
              "
              :aria-pressed="scope === 'workspace'"
              data-atlas-scope="workspace"
              @click="scope = 'workspace'"
            >
              全部白板
            </button>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              class="rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] transition-colors"
              :class="
                sortMode === 'recent'
                  ? 'bg-stone-900/[0.06] text-stone-700 dark:bg-white/[0.08] dark:text-zinc-200'
                  : 'text-stone-400 hover:text-stone-700 dark:text-zinc-600 dark:hover:text-zinc-300'
              "
              :aria-pressed="sortMode === 'recent'"
              data-atlas-sort="recent"
              @click="sortMode = 'recent'"
            >
              最近
            </button>
            <button
              type="button"
              class="rounded-full px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] transition-colors"
              :class="
                sortMode === 'title'
                  ? 'bg-stone-900/[0.06] text-stone-700 dark:bg-white/[0.08] dark:text-zinc-200'
                  : 'text-stone-400 hover:text-stone-700 dark:text-zinc-600 dark:hover:text-zinc-300'
              "
              :aria-pressed="sortMode === 'title'"
              data-atlas-sort="title"
              @click="sortMode = 'title'"
            >
              标题
            </button>
          </div>
        </div>

        <div
          class="flex items-center justify-between px-4 pb-1.5 pt-2.5 font-mono text-[8px] uppercase tracking-[0.18em] text-stone-400 dark:text-zinc-600"
        >
          <span>{{ resultLabel }}</span>
          <span
            >{{ scopedCardCount }} CARDS ·
            {{ scopedEntries.length }} PLACEMENTS</span
          >
        </div>

        <div
          class="grid max-h-[min(62vh,640px)] grid-cols-1 gap-2 overflow-y-auto px-2 pb-2 sm:grid-cols-2 [scrollbar-width:thin]"
          role="listbox"
          aria-label="卡片纵览结果"
        >
          <button
            v-for="(result, index) in results"
            :key="`${result.entry.itemId}`"
            :ref="(element) => setResultEl(element, index)"
            type="button"
            class="spotlight-result group relative flex min-h-[8rem] w-full flex-col overflow-hidden rounded-xl border px-3 py-2.5 text-left transition-[background-color,border-color,box-shadow]"
            :class="
              index === selectedIndex
                ? 'is-active border-stone-400/60 bg-stone-900/[0.055] shadow-[0_8px_24px_-18px_rgba(41,37,36,0.55)] dark:border-white/20 dark:bg-white/[0.065]'
                : 'border-stone-200/65 bg-white/25 hover:border-stone-300/70 hover:bg-stone-900/[0.025] dark:border-white/[0.07] dark:bg-white/[0.012] dark:hover:border-white/15 dark:hover:bg-white/[0.035]'
            "
            role="option"
            :aria-selected="index === selectedIndex"
            data-spotlight-result
            :data-result-board="result.entry.boardId"
            @pointermove="selectedIndex = index"
            @click="choose(result)"
          >
            <span
              class="pointer-events-none absolute right-2.5 top-2 font-mono text-[7px] tracking-[0.08em] text-stone-300 dark:text-zinc-700"
              aria-hidden="true"
            >
              {{ String(index + 1).padStart(2, '0') }}
            </span>

            <span class="flex min-w-0 items-start gap-2 pr-5">
              <span class="min-w-0 flex-1">
                <span
                  class="block min-w-0 truncate font-serif text-[14px] font-medium tracking-[-0.01em] text-stone-800 dark:text-zinc-100"
                >
                  {{ result.card.title }}
                </span>
              </span>

              <span
                v-if="pendingCount(result.card.id)"
                class="mt-0.5 shrink-0 rounded-full border border-amber-700/15 bg-amber-500/[0.08] px-1.5 py-0.5 font-mono text-[7px] text-amber-800 dark:border-sky-200/10 dark:bg-sky-300/[0.06] dark:text-sky-200"
                :data-card-pending="pendingCount(result.card.id)"
              >
                {{ pendingCount(result.card.id) }} 待办
              </span>
            </span>

            <span
              v-if="result.excerpt"
              class="mt-2 block line-clamp-2 text-[10px] leading-[1.75] text-stone-500 dark:text-zinc-400"
            >
              {{ result.excerpt }}
            </span>

            <span
              v-if="result.card.tags.length"
              class="mt-2 flex flex-wrap items-center gap-1"
            >
              <span
                v-for="tag in result.card.tags.slice(0, 4)"
                :key="tag"
                class="rounded-full border border-stone-200/70 bg-white/45 px-1.5 py-0.5 font-mono text-[7px] tracking-[0.04em] text-stone-500 dark:border-white/[0.08] dark:bg-white/[0.025] dark:text-zinc-400"
                :class="{
                  'border-amber-500/40 text-amber-700 dark:border-amber-300/30 dark:text-amber-200':
                    result.matchedTags.includes(tag),
                }"
              >
                #{{ tag }}
              </span>
            </span>

            <span
              class="mt-auto flex items-center justify-between gap-2 pt-2.5"
            >
              <span
                class="max-w-[10rem] truncate rounded-full border px-1.5 py-0.5 font-mono text-[7px] tracking-[0.04em]"
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
              <CornerDownLeft
                :size="11"
                :stroke-width="1.7"
                class="shrink-0 text-stone-300 transition-opacity dark:text-zinc-600"
                :class="{
                  'opacity-100': index === selectedIndex,
                  'opacity-0': index !== selectedIndex,
                }"
                aria-hidden="true"
              />
            </span>
          </button>

          <div
            v-if="indexLoading"
            class="flex flex-col items-center justify-center px-4 py-10 text-center sm:col-span-2"
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
            class="flex flex-col items-center justify-center px-4 py-10 text-center sm:col-span-2"
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
            class="flex flex-col items-center justify-center px-4 py-10 text-center sm:col-span-2"
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
