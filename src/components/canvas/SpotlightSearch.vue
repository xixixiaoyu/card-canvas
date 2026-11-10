<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { CornerDownLeft, Search, X } from '@lucide/vue'
import type { CanvasCamera } from '../../composables/useCanvas'
import { getItemRect } from '../../lib/card-metrics'
import {
  searchSpotlightCards,
  type SpotlightMatch,
} from '../../lib/spotlight-search'
import { useBoardStore, type BoardEntry } from '../../stores/board'

const props = defineProps<{
  open: boolean
  camera?: CanvasCamera | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

interface SpotlightResult extends SpotlightMatch {
  entry: BoardEntry
}

const board = useBoardStore()
const query = ref('')
const selectedIndex = ref(0)
const inputEl = ref<HTMLInputElement | null>(null)
const resultEls = ref<Array<HTMLElement | null>>([])

let previousFocus: HTMLElement | null = null
let skipFocusRestore = false

const entriesByCard = computed(
  () => new Map(board.entries.map((entry) => [entry.card.id, entry])),
)

const results = computed<SpotlightResult[]>(() =>
  searchSpotlightCards(board.cards, query.value)
    .flatMap((match) => {
      const entry = entriesByCard.value.get(match.card.id)
      return entry ? [{ ...match, entry }] : []
    })
    .slice(0, 8),
)

const selectedResult = computed(() => results.value[selectedIndex.value])
const hasQuery = computed(() => query.value.trim().length > 0)
const resultLabel = computed(() =>
  hasQuery.value ? `${results.value.length} 个结果` : '最近卡片',
)

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
      await nextTick()
      inputEl.value?.focus()
      inputEl.value?.select()
      return
    }

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

  const entry = result.entry
  const rect = getItemRect(entry.item)
  const currentScale = props.camera?.getViewport().scale ?? 1
  const targetScale =
    currentScale < 0.5 || currentScale > 1.4 ? 1 : currentScale

  board.clearFilterTag()
  board.selectItem(entry.item.id)
  skipFocusRestore = true
  close()

  const targetCardId = entry.card.id
  void nextTick(() => {
    const target = [
      ...document.querySelectorAll<HTMLElement>('[data-world-item]'),
    ].find((element) => element.dataset.cardId === targetCardId)
    target?.focus({ preventScroll: true })
  })

  const flight = props.camera?.flyTo(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    targetScale,
    400,
  )

  if (flight) {
    void flight.then(() => board.pulseItem(entry.item.id))
  } else {
    board.pulseItem(entry.item.id)
  }
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
            placeholder="搜索标题、正文或标签…"
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
          <span>{{ board.entries.length }} CARDS ON BOARD</span>
        </div>

        <div
          class="max-h-[340px] overflow-y-auto px-2 pb-2 [scrollbar-width:thin]"
          role="listbox"
          aria-label="搜索结果"
        >
          <button
            v-for="(result, index) in results"
            :key="result.card.id"
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
              <span
                class="block truncate font-serif text-[14px] font-medium tracking-[-0.01em] text-stone-800 dark:text-zinc-100"
              >
                {{ result.card.title }}
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
            v-if="!results.length"
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
