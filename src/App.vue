<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { Layers2, Moon, Sun } from '@lucide/vue'
import CanvasStage from './components/canvas/CanvasStage.vue'
import CardNode from './components/canvas/CardNode.vue'
import { useTheme } from './composables/useTheme'
import { FOCUS_BOARD_ITEM_ID } from './data/seed'
import { useBoardStore } from './stores/board'
import { useWorkspaceStore } from './stores/workspace'

const { isDark, toggleTheme } = useTheme()
const workspace = useWorkspaceStore()
const board = useBoardStore()

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

onMounted(initializeBoard)
</script>

<template>
  <CanvasStage
    v-if="board.isHydrated"
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
              Phase 03 / Interaction
            </p>
          </div>
        </div>

        <button
          type="button"
          data-canvas-ui
          class="pointer-events-auto group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 py-1 pl-1 pr-2.5 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-500 ease-soft hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-zinc-950"
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
