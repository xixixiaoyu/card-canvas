<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Inbox, Layers2, Moon, PenLine, Sun } from '@lucide/vue'
import CanvasStage from './components/canvas/CanvasStage.vue'
import CardNode from './components/canvas/CardNode.vue'
import QuickCapture from './components/capture/QuickCapture.vue'
import InboxShelf from './components/inbox/InboxShelf.vue'
import ToastStack from './components/ui/ToastStack.vue'
import { useTheme } from './composables/useTheme'
import type { CanvasCamera } from './composables/useCanvas'
import { FOCUS_BOARD_ITEM_ID } from './data/seed'
import { useBoardStore } from './stores/board'
import { useWorkspaceStore } from './stores/workspace'

const { isDark, toggleTheme } = useTheme()
const workspace = useWorkspaceStore()
const board = useBoardStore()

const stageRef = ref<InstanceType<typeof CanvasStage> | null>(null)
const isCaptureOpen = ref(false)

const camera = computed<CanvasCamera | null>(
  () => stageRef.value?.camera ?? null,
)

const databaseLabel = computed(() => {
  if (board.status === 'ready') return 'Dexie ready'
  if (board.status === 'error') return 'Dexie unavailable'
  return 'Opening Dexie…'
})

async function initializeBoard() {
  try {
    await board.initialize(workspace.activeBoardId)
  } catch (error) {
    console.error('[card-canvas] Unable to initialize the board', error)
  }
}

function openCapture() {
  isCaptureOpen.value = true
}

function toggleInbox() {
  if (workspace.isInboxOpen) workspace.closeInbox()
  else workspace.openInbox()
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  const editable = target.closest(
    'input, textarea, select, [contenteditable], [role="textbox"]',
  )
  if (!editable) return false
  if (editable instanceof HTMLElement && editable.isContentEditable) return true
  if (editable.getAttribute('role') === 'textbox') return true

  return (
    editable.tagName === 'INPUT' ||
    editable.tagName === 'TEXTAREA' ||
    editable.tagName === 'SELECT'
  )
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return

  if (event.key === 'Escape') {
    if (
      !isCaptureOpen.value &&
      workspace.isInboxOpen &&
      !isEditableTarget(event.target)
    ) {
      workspace.closeInbox()
    }
    return
  }

  if (isCaptureOpen.value) return
  // Never steal shortcuts from inputs, textareas or future inline editors.
  if (isEditableTarget(event.target)) return
  // The store hydrates by replacing `cards`; capturing mid-hydration could be
  // overwritten, so keep the shortcuts dormant until the board is ready.
  if (!board.isHydrated) return

  const mod = event.metaKey || event.ctrlKey

  if (mod && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
    event.preventDefault()
    openCapture()
    return
  }

  if (event.altKey && !mod && !event.shiftKey && event.code === 'KeyN') {
    event.preventDefault()
    openCapture()
  }
}

onMounted(() => {
  void initializeBoard()
  window.addEventListener('keydown', handleGlobalKeydown)
})

onBeforeUnmount(() =>
  window.removeEventListener('keydown', handleGlobalKeydown),
)
</script>

<template>
  <CanvasStage
    v-if="board.isHydrated"
    ref="stageRef"
    @background-pointerdown="board.clearSelection()"
  >
    <h1 class="sr-only">Card Canvas 无限白板</h1>

    <CardNode
      v-for="(entry, index) in board.entries"
      :key="entry.item.id"
      :item="entry.item"
      :card="entry.card"
      :selected="board.selectedItemId === entry.item.id"
      :index-label="`CARD / ${String(index + 1).padStart(3, '0')}`"
      :data-canvas-focus="
        entry.item.id === FOCUS_BOARD_ITEM_ID ? '' : undefined
      "
      @select="board.selectItem(entry.item.id)"
      @position-commit="
        board.commitItemPosition(entry.item.id, $event.x, $event.y)
      "
    />

    <template #overlay>
      <header
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-5 py-5 sm:px-8 sm:py-7"
      >
        <div class="flex items-center gap-3">
          <div
            class="relative flex h-9 w-9 items-center justify-center rounded-[11px] border border-stone-300/70 bg-white/60 text-stone-600 shadow-[0_1px_1px_rgba(41,37,36,0.04)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
          >
            <Layers2 :size="15" :stroke-width="1.5" aria-hidden="true" />
            <span
              class="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full border border-paper bg-amber-500/80 dark:border-zinc-950"
              aria-hidden="true"
            />
          </div>
          <div class="select-none">
            <p
              class="font-serif text-[13px] font-medium tracking-[0.01em] text-stone-800 dark:text-zinc-200"
            >
              Card Canvas
            </p>
            <p
              class="brand-subtitle mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500 dark:text-zinc-500"
            >
              Phase 04 / Capture Loop
            </p>
          </div>
        </div>

        <div class="pointer-events-auto flex items-center gap-2">
          <button
            type="button"
            data-canvas-ui
            class="group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 pl-3 pr-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-600 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-500 ease-soft hover:border-stone-300/90 hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-zinc-950"
            aria-label="打开速记"
            title="速记 · ⌘K"
            @click="openCapture()"
          >
            <PenLine :size="14" :stroke-width="1.7" aria-hidden="true" />
            <span class="hidden sm:inline">速记</span>
            <kbd
              class="ml-0.5 hidden rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-normal text-stone-500 md:inline dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
            >
              ⌘K
            </kbd>
          </button>

          <button
            type="button"
            data-canvas-ui
            class="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 pl-3 pr-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-600 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-500 ease-soft hover:border-stone-300/90 hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-zinc-950"
            :aria-expanded="workspace.isInboxOpen"
            :aria-controls="workspace.isInboxOpen ? 'inbox-shelf' : undefined"
            :aria-label="`待整理池，${board.inboxCount} 张未上板`"
            title="待整理池"
            @click="toggleInbox()"
          >
            <Inbox :size="14" :stroke-width="1.7" aria-hidden="true" />
            <span class="hidden sm:inline">待整理</span>
            <span
              class="flex h-5 min-w-[1.25rem] items-center justify-center rounded-full px-1 font-mono text-[9px] font-normal tracking-normal transition-colors"
              :class="
                board.inboxCount > 0
                  ? 'bg-amber-600 text-white dark:bg-amber-500 dark:text-zinc-950'
                  : 'bg-stone-200/70 text-stone-500 dark:bg-white/[0.06] dark:text-zinc-500'
              "
            >
              {{ board.inboxCount > 99 ? '99+' : board.inboxCount }}
            </span>
          </button>

          <button
            type="button"
            data-canvas-ui
            class="group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 py-1 pl-1 pr-2.5 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-500 ease-soft hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-zinc-950"
            :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
            :aria-pressed="isDark"
            :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
            @click="toggleTheme()"
          >
            <span
              class="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-stone-100/80 text-stone-600 transition-colors duration-500 dark:bg-white/[0.06] dark:text-zinc-300"
            >
              <Transition name="theme-icon" mode="out-in">
                <Sun
                  v-if="!isDark"
                  key="sun"
                  :size="15"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
                <Moon
                  v-else
                  key="moon"
                  :size="14"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
              </Transition>
            </span>
            <span
              class="hidden text-[10px] font-medium uppercase tracking-[0.18em] sm:inline"
            >
              {{ isDark ? 'Dark' : 'Light' }}
            </span>
          </button>
        </div>
      </header>

      <footer
        class="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-center justify-between gap-6 px-8 pb-6 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-500 dark:text-zinc-500 lg:flex"
      >
        <div class="flex items-center gap-2.5" aria-live="polite">
          <span class="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span
              class="absolute inset-0 rounded-full bg-emerald-500/30 blur-[3px]"
            />
            <span
              class="relative h-1.5 w-1.5 rounded-full"
              :class="{
                'bg-emerald-500/80': board.status === 'ready',
                'bg-amber-500/80':
                  board.status === 'loading' || board.status === 'idle',
                'bg-rose-500/80': board.status === 'error',
              }"
            />
          </span>
          <span>Local-first · {{ databaseLabel }}</span>
        </div>

        <div class="hidden items-center gap-3 xl:flex">
          <span>{{ workspace.activeBoardName }}</span>
          <span
            class="h-3 w-px bg-stone-300/70 dark:bg-white/10"
            aria-hidden="true"
          />
          <span>Scroll / Space to pan</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>Pinch to zoom</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>Drag card to move</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>⌘K to capture</span>
        </div>
      </footer>
    </template>
  </CanvasStage>

  <div
    v-else
    class="canvas-stage flex items-center justify-center overflow-hidden"
    role="status"
    aria-live="polite"
  >
    <h1 class="sr-only">Card Canvas 无限白板</h1>
    <div class="canvas-dots absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-light absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-dark absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-noise absolute inset-0 z-0" aria-hidden="true" />

    <div
      class="relative z-10 flex max-w-sm flex-col items-center px-6 text-center"
    >
      <div
        class="flex h-12 w-12 items-center justify-center rounded-[14px] border border-stone-300/70 bg-white/60 text-stone-600 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
        :class="{ 'animate-pulse': board.status !== 'error' }"
      >
        <Layers2 :size="19" :stroke-width="1.4" aria-hidden="true" />
      </div>

      <p
        class="mt-5 font-mono text-[9px] uppercase tracking-[0.22em] text-stone-500 dark:text-zinc-500"
      >
        {{ board.status === 'error' ? 'Local board offline' : 'Opening board' }}
      </p>
      <p
        class="mt-2 font-serif text-xl text-stone-800 dark:text-zinc-200"
      >
        {{
          board.status === 'error'
            ? '本地白板暂时无法打开'
            : '正在准备卡片与空间'
        }}
      </p>
      <p
        v-if="board.status === 'error'"
        class="mt-3 max-w-xs break-words font-mono text-[10px] leading-5 text-stone-500 dark:text-zinc-500"
      >
        {{ board.error }}
      </p>
      <p v-else class="mt-3 text-[12px] text-stone-500 dark:text-zinc-500">
        从本地 IndexedDB 读取上一次的位置。
      </p>

      <button
        v-if="board.status === 'error'"
        type="button"
        class="mt-6 rounded-full border border-stone-300/80 bg-white/70 px-5 py-2 text-[11px] font-medium text-stone-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white/25"
        @click="initializeBoard"
      >
        重试
      </button>
    </div>
  </div>

  <InboxShelf v-if="camera" :camera="camera" />

  <QuickCapture v-model:open="isCaptureOpen" />

  <ToastStack />
</template>

<style scoped>
@media (max-width: 380px) {
  .brand-subtitle {
    display: none;
  }
}

.theme-icon-enter-active,
.theme-icon-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.theme-icon-enter-from {
  opacity: 0;
  transform: rotate(-25deg) scale(0.8);
}

.theme-icon-leave-to {
  opacity: 0;
  transform: rotate(25deg) scale(0.8);
}
</style>
