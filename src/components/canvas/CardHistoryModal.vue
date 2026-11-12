<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { History, LoaderCircle, RotateCcw, X } from '@lucide/vue'
import { db } from '../../db'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'
import type { Card, CardVersion } from '../../types'

const props = defineProps<{
  open: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const board = useBoardStore()
const toast = useToastStore()
const panelEl = ref<HTMLElement | null>(null)
const versions = ref<CardVersion[]>([])
const loading = ref(false)
const restoringId = ref<string | null>(null)
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

async function loadVersions(cardId: string) {
  loading.value = true
  try {
    versions.value = (
      await db.cardVersions.where('cardId').equals(cardId).toArray()
    ).sort((a, b) => b.snapshotAt - a.snapshotAt)
  } finally {
    loading.value = false
  }
}

function formatSnapshotAt(timestamp: number) {
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(timestamp))
}

async function restoreVersion(version: CardVersion) {
  if (!props.card || restoringId.value) return
  restoringId.value = version.id
  try {
    const updated = await board.restoreCardVersion(props.card.id, version.id)
    if (!updated) throw new Error('无法恢复版本')
    toast.push('已恢复历史版本，可继续撤销。', {
      tone: 'success',
      timeout: 3200,
    })
    close()
  } catch (cause) {
    console.error('[card-canvas] Unable to restore card version', cause)
    toast.push('恢复历史版本失败。', { tone: 'error' })
  } finally {
    restoringId.value = null
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
    if (open && props.card) {
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)
      void loadVersions(props.card.id)
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
    <Transition name="card-history">
      <div
        v-if="open && card"
        class="fixed inset-0 z-[89] flex items-center justify-center bg-stone-950/25 px-4 py-6 backdrop-blur-sm dark:bg-black/65"
        data-card-history
        @click.self="close()"
      >
        <section
          ref="panelEl"
          class="flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-[580px] flex-col overflow-hidden rounded-[26px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_40px_110px_-32px_rgba(41,37,36,0.5)] outline-none dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_50_140px_-38px_rgba(0,0,0,0.95)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="card-history-title"
          tabindex="-1"
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-5 py-4 dark:border-white/[0.08]"
          >
            <div class="flex items-start gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[12px] border border-amber-700/15 bg-amber-500/[0.06] text-amber-700 dark:border-amber-200/10 dark:bg-amber-200/[0.04] dark:text-amber-200"
              >
                <History :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="card-history-title"
                  class="font-serif text-[19px] text-stone-800 dark:text-zinc-100"
                >
                  历史版本
                </h2>
                <p
                  class="mt-1 max-w-[390px] truncate text-[11px] text-stone-500 dark:text-zinc-400"
                >
                  {{ card.title }}
                </p>
              </div>
            </div>
            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 hover:bg-stone-200/60 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200"
              aria-label="关闭历史版本"
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
              正在读取版本…
            </div>
            <div
              v-else-if="!versions.length"
              class="px-5 py-14 text-center text-[11px] leading-6 text-stone-500 dark:text-zinc-400"
            >
              还没有可恢复的历史版本。之后编辑这张卡片时会自动保存最近 8
              个版本。
            </div>
            <div v-else class="space-y-2">
              <article
                v-for="version in versions"
                :key="version.id"
                class="rounded-2xl border border-stone-200/75 bg-white/35 p-3.5 dark:border-white/[0.08] dark:bg-white/[0.02]"
                data-card-version
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <h3
                      class="truncate font-serif text-[13px] text-stone-700 dark:text-zinc-200"
                    >
                      {{ version.title || '未命名卡片' }}
                    </h3>
                    <p
                      class="mt-1 line-clamp-3 text-[10px] leading-5 text-stone-500 dark:text-zinc-400"
                    >
                      {{ version.content || '没有正文' }}
                    </p>
                  </div>
                  <time
                    class="shrink-0 font-mono text-[8px] text-stone-400 dark:text-zinc-600"
                  >
                    {{ formatSnapshotAt(version.snapshotAt) }}
                  </time>
                </div>
                <div class="mt-3 flex justify-end">
                  <button
                    type="button"
                    class="inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200/80 px-3 text-[9px] text-stone-600 hover:bg-stone-100 disabled:opacity-40 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
                    :disabled="Boolean(restoringId)"
                    :data-restore-version="version.id"
                    @click="restoreVersion(version)"
                  >
                    <RotateCcw
                      :size="11"
                      :stroke-width="1.7"
                      aria-hidden="true"
                    />
                    恢复此版本
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
.card-history-enter-active,
.card-history-leave-active {
  transition: opacity 160ms ease;
}

.card-history-enter-from,
.card-history-leave-to {
  opacity: 0;
}
</style>
