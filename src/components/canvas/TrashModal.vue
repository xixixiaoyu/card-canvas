<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArchiveRestore, LoaderCircle, RotateCcw, Trash2, X } from '@lucide/vue'
import { db } from '../../db'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'
import type { Card } from '../../types'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const board = useBoardStore()
const workspace = useWorkspaceStore()
const toast = useToastStore()
const panelEl = ref<HTMLElement | null>(null)
const cards = ref<Card[]>([])
const loading = ref(false)
const busyId = ref<string | null>(null)
const confirmPurgeId = ref<string | null>(null)
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

async function loadTrash() {
  loading.value = true
  try {
    cards.value = (await db.cards.toArray())
      .filter((card) => card.isDeleted)
      .sort((a, b) => b.updatedAt - a.updatedAt)
  } finally {
    loading.value = false
  }
}

function formatDeletedAt(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

async function restore(card: Card) {
  if (busyId.value) return
  busyId.value = card.id
  try {
    const item = await board.restoreCard(card.id, workspace.activeBoardId)
    if (!item) throw new Error('无法恢复卡片')
    cards.value = cards.value.filter((entry) => entry.id !== card.id)
    toast.push(`已恢复「${card.title}」。`, {
      tone: 'success',
      timeout: 3200,
    })
  } catch (cause) {
    console.error('[card-canvas] Unable to restore trashed card', cause)
    toast.push('恢复卡片失败。', { tone: 'error' })
  } finally {
    busyId.value = null
  }
}

async function purge(card: Card) {
  if (busyId.value) return
  if (confirmPurgeId.value !== card.id) {
    confirmPurgeId.value = card.id
    return
  }

  busyId.value = card.id
  try {
    const purged = await board.purgeCard(card.id)
    if (!purged) throw new Error('无法永久删除卡片')
    cards.value = cards.value.filter((entry) => entry.id !== card.id)
    confirmPurgeId.value = null
    toast.push('卡片已永久删除。', { tone: 'info' })
  } catch (cause) {
    console.error('[card-canvas] Unable to purge trashed card', cause)
    toast.push('永久删除失败。', { tone: 'error' })
  } finally {
    busyId.value = null
  }
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
    if (open) {
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)
      confirmPurgeId.value = null
      void loadTrash()
      await nextTick()
      panelEl.value?.focus()
      return
    }
    if (wasOpen) {
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
    <Transition name="trash-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-[88] flex items-center justify-center bg-stone-950/25 px-4 py-6 backdrop-blur-sm dark:bg-black/65"
        data-trash-modal
        @click.self="close()"
      >
        <section
          ref="panelEl"
          class="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-[620px] flex-col overflow-hidden rounded-[26px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_40px_110px_-32px_rgba(41,37,36,0.5)] outline-none dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_50_140px_-38px_rgba(0,0,0,0.95)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="trash-title"
          tabindex="-1"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-5 py-4 dark:border-white/[0.08]"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[12px] border border-stone-200/80 bg-stone-100/65 text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                <ArchiveRestore
                  :size="15"
                  :stroke-width="1.6"
                  aria-hidden="true"
                />
              </span>
              <div>
                <h2
                  id="trash-title"
                  class="font-serif text-[19px] text-stone-800 dark:text-zinc-100"
                >
                  回收站
                </h2>
                <p class="mt-1 text-[11px] text-stone-500 dark:text-zinc-400">
                  删除的卡片保留 30 天，恢复后回到当前白板
                </p>
              </div>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
              aria-label="关闭回收站"
              @click="close()"
            >
              <X :size="14" :stroke-width="1.7" aria-hidden="true" />
            </button>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto p-3">
            <div
              v-if="loading"
              class="flex items-center justify-center gap-2 py-14 text-[11px] text-stone-400 dark:text-zinc-500"
            >
              <LoaderCircle
                :size="14"
                :stroke-width="1.8"
                class="animate-spin"
                aria-hidden="true"
              />
              正在读取回收站…
            </div>
            <div
              v-else-if="!cards.length"
              class="flex flex-col items-center justify-center px-5 py-14 text-center"
            >
              <span
                class="flex h-11 w-11 items-center justify-center rounded-full border border-emerald-600/15 bg-emerald-500/[0.05] text-emerald-600 dark:border-emerald-300/10 dark:text-emerald-300"
              >
                <ArchiveRestore
                  :size="17"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </span>
              <p class="mt-3 text-[12px] text-stone-600 dark:text-zinc-300">
                回收站是空的
              </p>
            </div>
            <div v-else class="space-y-2">
              <article
                v-for="card in cards"
                :key="card.id"
                class="rounded-2xl border border-stone-200/75 bg-white/35 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.02]"
                data-trash-card
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3
                      class="truncate font-serif text-[14px] text-stone-700 dark:text-zinc-200"
                    >
                      {{ card.title || '未命名卡片' }}
                    </h3>
                    <p
                      class="mt-1 line-clamp-2 text-[10px] leading-5 text-stone-500 dark:text-zinc-400"
                    >
                      {{ card.content || '没有正文' }}
                    </p>
                  </div>
                  <time
                    class="shrink-0 font-mono text-[8px] text-stone-400 dark:text-zinc-600"
                    :datetime="new Date(card.updatedAt).toISOString()"
                  >
                    {{ formatDeletedAt(card.updatedAt) }}
                  </time>
                </div>
                <div class="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200/80 px-3 text-[9px] text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                    :disabled="Boolean(busyId)"
                    :data-trash-restore="card.id"
                    @click="restore(card)"
                  >
                    <RotateCcw
                      :size="11"
                      :stroke-width="1.7"
                      aria-hidden="true"
                    />
                    恢复
                  </button>
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[9px] transition-colors disabled:opacity-40"
                    :class="
                      confirmPurgeId === card.id
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : 'text-rose-500 hover:bg-rose-500/[0.06] dark:text-rose-300'
                    "
                    :disabled="Boolean(busyId)"
                    :data-trash-purge="card.id"
                    @click="purge(card)"
                  >
                    <Trash2 :size="11" :stroke-width="1.7" aria-hidden="true" />
                    {{
                      confirmPurgeId === card.id ? '确认永久删除' : '永久删除'
                    }}
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.trash-modal-enter-active,
.trash-modal-leave-active {
  transition: opacity 160ms ease;
}

.trash-modal-enter-from,
.trash-modal-leave-to {
  opacity: 0;
}
</style>
