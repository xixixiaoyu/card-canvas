<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Trash2, Unlink, X } from '@lucide/vue'
import { db } from '../../db'
import { useWorkspaceStore } from '../../stores/workspace'
import type { Card } from '../../types'

const props = defineProps<{
  open: boolean
  card: Card | null
  busy?: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  remove: []
  delete: []
}>()

const workspace = useWorkspaceStore()
const panelEl = ref<HTMLElement | null>(null)
const boardIds = ref<string[]>([])
let restoreFocus: HTMLElement | null = null
let restoreFocusAfterClose = false

const placementCount = computed(() => boardIds.value.length)
const boardNames = computed(() =>
  boardIds.value
    .map(
      (boardId) =>
        workspace.boards.find((board) => board.id === boardId)?.name ??
        '未知白板',
    )
    .join('、'),
)

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
  const items = await db.boardItems.where('cardId').equals(cardId).toArray()
  boardIds.value = [...new Set(items.map((item) => item.boardId))]
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
      boardIds.value = []
      await loadPlacements(props.card.id)
      await nextTick()
      panelEl.value?.focus()
      return
    }
    if (!open && wasOpen) {
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
    <Transition name="delete-card">
      <div
        v-if="open && card"
        class="fixed inset-0 z-[87] flex items-center justify-center bg-stone-950/25 px-4 py-6 backdrop-blur-sm dark:bg-black/65"
        data-delete-card-dialog
        @click.self="close()"
      >
        <section
          ref="panelEl"
          class="w-full max-w-[450px] overflow-hidden rounded-[24px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_36px_100px_-30px_rgba(41,37,36,0.5)] outline-none dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_50px_130px_-36px_rgba(0,0,0,0.95)]"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="delete-card-title"
          tabindex="-1"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-5 py-4 dark:border-white/[0.08]"
          >
            <div>
              <h2
                id="delete-card-title"
                class="font-serif text-[19px] text-stone-800 dark:text-zinc-100"
              >
                删除「{{ card.title }}」
              </h2>
              <p
                class="mt-1 text-[11px] leading-5 text-stone-500 dark:text-zinc-400"
              >
                这张卡当前位于 {{ placementCount }} 块白板：{{ boardNames }}
              </p>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
              aria-label="关闭删除确认"
              @click="close()"
            >
              <X :size="14" :stroke-width="1.7" aria-hidden="true" />
            </button>
          </header>

          <div class="space-y-2 p-3">
            <button
              v-if="placementCount > 1"
              type="button"
              class="flex w-full items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/35 px-3.5 py-3 text-left transition-colors hover:bg-stone-100/70 disabled:opacity-45 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:bg-white/[0.055]"
              :disabled="busy"
              data-delete-from-board
              @click="emit('remove')"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-200/80 text-stone-500 dark:border-white/10 dark:text-zinc-400"
              >
                <Unlink :size="15" :stroke-width="1.7" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block text-[12px] font-medium text-stone-700 dark:text-zinc-200"
                >
                  仅从当前白板移除
                </span>
                <span
                  class="mt-0.5 block text-[10px] leading-5 text-stone-400 dark:text-zinc-500"
                >
                  其他白板中的同一张卡不受影响
                </span>
              </span>
            </button>

            <button
              type="button"
              class="flex w-full items-center gap-3 rounded-2xl border border-rose-200/80 bg-rose-50/70 px-3.5 py-3 text-left transition-colors hover:bg-rose-50 disabled:opacity-45 dark:border-rose-300/10 dark:bg-rose-400/[0.045] dark:hover:bg-rose-400/[0.075]"
              :disabled="busy"
              data-delete-card-all
              @click="emit('delete')"
            >
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-rose-200 text-rose-500 dark:border-rose-300/10 dark:text-rose-300"
              >
                <Trash2 :size="15" :stroke-width="1.7" aria-hidden="true" />
              </span>
              <span class="min-w-0 flex-1">
                <span
                  class="block text-[12px] font-medium text-rose-700 dark:text-rose-300"
                >
                  删除整张卡片
                </span>
                <span
                  class="mt-0.5 block text-[10px] leading-5 text-rose-500/80 dark:text-rose-300/65"
                >
                  从所有白板移除，可在回收站恢复
                </span>
              </span>
            </button>
          </div>

          <footer
            class="flex justify-end border-t border-stone-200/70 px-5 py-3 dark:border-white/[0.08]"
          >
            <button
              type="button"
              class="rounded-full px-3.5 py-2 text-[10px] text-stone-500 hover:bg-stone-100 dark:text-zinc-400 dark:hover:bg-white/[0.05]"
              @click="close()"
            >
              取消
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.delete-card-enter-active,
.delete-card-leave-active {
  transition: opacity 160ms ease;
}

.delete-card-enter-from,
.delete-card-leave-to {
  opacity: 0;
}
</style>
