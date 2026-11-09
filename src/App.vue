<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Layers2, Moon, Sun } from '@lucide/vue'
import CanvasStage from './components/canvas/CanvasStage.vue'
import CardNode from './components/canvas/CardNode.vue'
import { useTheme } from './composables/useTheme'
import { db } from './db'
import { useWorkspaceStore } from './stores/workspace'
import type { BoardItem, Card, CardHighlight } from './types'

const { isDark, toggleTheme } = useTheme()
const workspace = useWorkspaceStore()
const databaseStatus = ref<'opening' | 'ready' | 'error'>('opening')
const databaseLabel = computed(
  () =>
    ({
      opening: 'Opening Dexie…',
      ready: 'Dexie ready',
      error: 'Dexie unavailable',
    })[databaseStatus.value],
)

onMounted(async () => {
  try {
    await db.open()
    databaseStatus.value = 'ready'
  } catch (error) {
    databaseStatus.value = 'error'
    console.error('[card-canvas] Unable to open the local database', error)
  }
})

interface CanvasCard {
  item: BoardItem
  card: Card
  highlights: CardHighlight[]
  compact: boolean
  indexLabel: string
  focus?: boolean
}

const canvasCards: CanvasCard[] = [
  {
    item: {
      id: 'projection-voice-001',
      cardId: 'card-demo-001',
      boardId: 'board-main',
      x: -190,
      y: -150,
      width: 400,
    },
    card: {
      id: 'card-demo-001',
      title: '声音的支点，与防御的回声',
      content:
        '咽音不是把声音推得更响，而是让气息、共鸣与喉位重新协作。防御也一样：它保护自我，也悄悄决定哪些话不被说出口。',
      tags: ['声乐/咽音', '心理学/防御机制'],
      createdAt: 0,
      updatedAt: 0,
    },
    highlights: [
      {
        order: '01',
        label: '身体',
        text: '抬软腭、沉喉位，让共鸣落在面罩，而不是挤在声带。',
      },
      {
        order: '02',
        label: '心理',
        text: '防御像声音的“代偿”：短时保护，长期锁住真实表达。',
      },
      {
        order: '03',
        label: '练习',
        text: '先呼气到尽头，再让声音落在气息上，保持三秒不塌。',
      },
    ],
    compact: false,
    indexLabel: 'CARD / 001',
    focus: true,
  },
  {
    item: {
      id: 'projection-boundary-002',
      cardId: 'card-demo-002',
      boardId: 'board-main',
      x: -600,
      y: -60,
      width: 300,
    },
    card: {
      id: 'card-demo-002',
      title: '边界不是墙，是可移动的膜',
      content:
        '真正稳定的关系，不靠无限靠近，也不靠彻底隔离，而靠可协商的距离。',
      tags: ['心理学/边界', '关系'],
      createdAt: 0,
      updatedAt: 0,
    },
    highlights: [
      {
        order: '01',
        label: '识别',
        text: '先分清“我的感受”与“你的责任”。',
      },
      {
        order: '02',
        label: '表达',
        text: '用请求代替指责，让边界可以被听见。',
      },
    ],
    compact: true,
    indexLabel: 'CARD / 002',
  },
  {
    item: {
      id: 'projection-breath-003',
      cardId: 'card-demo-003',
      boardId: 'board-main',
      x: 390,
      y: 140,
      width: 320,
    },
    card: {
      id: 'card-demo-003',
      title: '先让气息落下，再让声音升起',
      content:
        '高音不是向上够，而是让气息稳定下沉，把空间留给共鸣。',
      tags: ['声乐/咽音', '练习'],
      createdAt: 0,
      updatedAt: 0,
    },
    highlights: [
      {
        order: '01',
        label: '坐稳',
        text: '肩颈松开，肋骨保持弹性。',
      },
      {
        order: '02',
        label: '落气',
        text: '呼气到尽头，再让声音落在气息上。',
      },
    ],
    compact: true,
    indexLabel: 'CARD / 003',
  },
]
</script>

<template>
  <CanvasStage>
    <h1 class="sr-only">Card Canvas 无限白板</h1>

    <div
      v-for="entry in canvasCards"
      :key="entry.item.id"
      class="canvas-world-item"
      :style="{
        left: `${entry.item.x}px`,
        top: `${entry.item.y}px`,
        width: `${entry.item.width ?? 420}px`,
      }"
      :data-canvas-focus="entry.focus ? '' : undefined"
      data-world-item
    >
      <CardNode
        :card="entry.card"
        :highlights="entry.highlights"
        :compact="entry.compact"
        :index-label="entry.indexLabel"
      />
    </div>

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
              Phase 02 / Infinite Canvas
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
                'bg-emerald-500/80': databaseStatus === 'ready',
                'bg-amber-500/80': databaseStatus === 'opening',
                'bg-rose-500/80': databaseStatus === 'error',
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
          <span>Scroll to pan</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>Pinch to zoom</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>Space + drag</span>
        </div>
      </footer>
    </template>
  </CanvasStage>
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
