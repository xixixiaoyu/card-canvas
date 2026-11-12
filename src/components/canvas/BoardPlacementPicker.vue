<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowUpRight, Check, Layers3, LoaderCircle, X } from '@lucide/vue'
import { db } from '../../db'
import { useWorkspaceStore } from '../../stores/workspace'
import type { Card } from '../../types'

const props = defineProps<{
  open: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  select: [payload: { boardId: string; boardName: string }]
}>()

const workspace = useWorkspaceStore()
const panelEl = ref<HTMLElement | null>(null)
const placedBoardIds = ref(new Set<string>())
const loading = ref(false)
let queryToken = 0
let restoreFocus: HTMLElement | null = null
let restoreFocusAfterClose = false

function setBackgroundInert(inert: boolean) {
  const app = document.getElementById('app')
  if (!app) return
  if (inert) app.setAttribute('inert', '')
  else app.removeAttribute('inert')
}

function close(returnFocus = false) {
  restoreFocusAfterClose = returnFocus
  emit('update:open', false)
}

async function loadPlacements(cardId: string) {
  const token = ++queryToken
  loading.value = true
  try {
    const items = await db.boardItems.where('cardId').equals(cardId).toArray()
    if (token === queryToken) {
      placedBoardIds.value = new Set(items.map((item) => item.boardId))
    }
  } finally {
    if (token === queryToken) loading.value = false
  }
}

function choose(boardId: string, boardName: string) {
  if (placedBoardIds.value.has(boardId)) return
  const board = workspace.boards.find((entry) => entry.id === boardId)
  if (!board) return
  emit('select', { boardId, boardName })
  close()
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open || event.isComposing) return
  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close(true)
  }
}

watch(
  () => props.open,
  async (open, wasOpen) => {
    if (open && props.card) {
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)
      void loadPlacements(props.card.id)
      await nextTick()
      panelEl.value?.focus()
      return
    }
    if (!open && wasOpen) {
      queryToken += 1
      setBackgroundInert(false)
      if (restoreFocusAfterClose) restoreFocus?.focus()
      restoreFocus = null
      restoreFocusAfterClose = false
    }
  },
)

window.addEventListener('keydown', handleKeydown)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeydown)
  setBackgroundInert(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="board-picker">
      <div
        v-if="open && card"
        class="fixed inset-0 z-[86] flex items-center justify-center bg-stone-950/25 px-4 py-6 backdrop-blur-sm dark:bg-black/65"
        data-board-picker
        @click.self="close()"
      >
        <section
          ref="panelEl"
          class="w-full max-w-[430px] overflow-hidden rounded-[24px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_36px_100px_-30px_rgba(41,37,36,0.5)] outline-none dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_50px_130px_-36px_rgba(0,0,0,0.95)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="board-picker-title"
          tabindex="-1"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-5 py-4 dark:border-white/[0.08]"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[12px] border border-emerald-700/15 bg-emerald-500/[0.06] text-emerald-700 dark:border-emerald-200/10 dark:bg-emerald-200/[0.04] dark:text-emerald-200"
              >
                <Layers3 :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="board-picker-title"
                  class="font-serif text-[18px] text-stone-800 dark:text-zinc-100"
                >
                  加入其他白板
                </h2>
                <p class="mt-1 text-[11px] text-stone-500 dark:text-zinc-400">
                  复用同一张卡片，不复制内容
                </p>
              </div>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
              aria-label="关闭白板选择"
              @click="close()"
            >
              <X :size="14" :stroke-width="1.7" aria-hidden="true" />
            </button>
          </header>

          <div class="p-2">
            <div
              v-if="loading"
              class="flex items-center justify-center gap-2 py-10 text-[11px] text-stone-400 dark:text-zinc-500"
            >
              <LoaderCircle
                :size="13"
                :stroke-width="1.8"
                class="animate-spin"
                aria-hidden="true"
              />
              正在检查卡片所在白板…
            </div>
            <div
              v-else-if="workspace.boards.length <= 1"
              class="px-4 py-9 text-center text-[11px] leading-6 text-stone-500 dark:text-zinc-400"
            >
              当前只有一个白板。先创建一个新白板，再回来复用这张卡片。
            </div>
            <div v-else class="space-y-0.5">
              <button
                v-for="targetBoard in workspace.boards"
                :key="targetBoard.id"
                type="button"
                class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors"
                :class="
                  placedBoardIds.has(targetBoard.id)
                    ? 'cursor-default bg-stone-100/45 text-stone-400 dark:bg-white/[0.025] dark:text-zinc-600'
                    : 'text-stone-600 hover:bg-stone-100/75 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-white/[0.055] dark:hover:text-zinc-100'
                "
                :disabled="placedBoardIds.has(targetBoard.id)"
                :data-placement-board="targetBoard.id"
                @click="choose(targetBoard.id, targetBoard.name)"
              >
                <span
                  class="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200/70 bg-white/45 dark:border-white/[0.08] dark:bg-white/[0.03]"
                >
                  <Check
                    v-if="placedBoardIds.has(targetBoard.id)"
                    :size="13"
                    :stroke-width="1.9"
                    aria-hidden="true"
                  />
                  <Layers3
                    v-else
                    :size="13"
                    :stroke-width="1.6"
                    aria-hidden="true"
                  />
                </span>
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-[12px] font-medium">
                    {{ targetBoard.name }}
                  </span>
                  <span class="mt-0.5 block text-[9px] opacity-70">
                    {{
                      placedBoardIds.has(targetBoard.id)
                        ? '已在这块白板中'
                        : '加入此白板'
                    }}
                  </span>
                </span>
                <ArrowUpRight
                  v-if="!placedBoardIds.has(targetBoard.id)"
                  :size="12"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
              </button>
            </div>
          </div>

          <footer
            class="border-t border-stone-200/70 px-5 py-3 text-[9px] leading-5 text-stone-400 dark:border-white/[0.08] dark:text-zinc-500"
          >
            标题、正文与标签在多个白板间同步；位置和连线分别属于各自白板。
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.board-picker-enter-active,
.board-picker-leave-active {
  transition: opacity 160ms ease;
}

.board-picker-enter-active section,
.board-picker-leave-active section {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.board-picker-enter-from,
.board-picker-leave-to,
.board-picker-enter-from section,
.board-picker-leave-to section {
  opacity: 0;
}

.board-picker-enter-from section {
  transform: translateY(8px) scale(0.985);
}
</style>
