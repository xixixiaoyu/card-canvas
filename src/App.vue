<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Layers2, Moon, Sun } from '@lucide/vue'
import CanvasStage from './components/canvas/CanvasStage.vue'
import CardNode from './components/canvas/CardNode.vue'
import { useTheme } from './composables/useTheme'
import { db } from './db'
import { useWorkspaceStore } from './stores/workspace'
import type { Card, CardHighlight } from './types'

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

const sampleCard: Card = {
  id: 'card-demo-001',
  title: '声音的支点，与防御的回声',
  content:
    '咽音不是把声音推得更响，而是让气息、共鸣与喉位重新协作。防御也一样：它保护自我，也悄悄决定哪些话不被说出口。',
  tags: ['声乐/咽音', '心理学/防御机制'],
  createdAt: 0,
  updatedAt: 0,
}

const sampleHighlights: CardHighlight[] = [
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
]
</script>

<template>
  <CanvasStage>
    <div class="relative flex h-full flex-col overflow-hidden">
      <header
        class="stage-header relative z-20 flex shrink-0 items-start justify-between gap-4 px-5 pb-2 pt-5 sm:px-8 sm:pb-3 sm:pt-7"
      >
        <div class="flex items-center gap-3">
          <div
            class="relative flex h-9 w-9 items-center justify-center rounded-[11px] border border-stone-300/70 bg-white/60 text-stone-600 shadow-[0_1px_1px_rgba(41,37,36,0.04)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
          >
            <Layers2
              :size="15"
              :stroke-width="1.5"
              aria-hidden="true"
            />
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
              class="mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500 dark:text-zinc-500"
            >
              Phase 01 / Foundation
            </p>
          </div>
        </div>

        <button
          type="button"
          class="group inline-flex h-10 items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 py-1 pl-1 pr-2.5 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-500 ease-soft hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-zinc-950"
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

      <main
        class="stage-main relative flex min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-8 sm:py-6"
      >
        <div class="card-rig relative m-auto w-full max-w-[31rem]">
          <!-- Ghost projections hint at the canvas without implementing it yet. -->
          <div
            class="ghost-card pointer-events-none absolute inset-x-3 inset-y-8 -rotate-[3.5deg] rounded-[26px] border border-stone-300/40 bg-white/25 shadow-[0_18px_50px_-30px_rgba(41,37,36,0.2)] dark:border-white/[0.05] dark:bg-white/[0.015] dark:shadow-none"
            aria-hidden="true"
          />
          <div
            class="ghost-card pointer-events-none absolute inset-x-1.5 inset-y-6 rotate-[1.6deg] rounded-[26px] border border-stone-300/30 bg-white/20 dark:border-white/[0.04] dark:bg-white/[0.01]"
            aria-hidden="true"
          />

          <div class="relative z-10">
            <div class="board-meta mb-3 flex items-center justify-between px-1">
              <span
                class="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500 dark:text-zinc-500"
              >
                <span
                  class="h-1 w-1 rounded-full bg-stone-400 dark:bg-zinc-500"
                  aria-hidden="true"
                />
                Freeboard / Draft 01
              </span>
              <span
                class="font-mono text-[9px] uppercase tracking-[0.16em] text-stone-500 dark:text-zinc-500"
              >
                {{ workspace.zoomLabel }}
              </span>
            </div>

            <CardNode :card="sampleCard" :highlights="sampleHighlights" />
          </div>
        </div>
      </main>

      <footer
        class="stage-footer pointer-events-none relative z-20 flex shrink-0 items-center justify-between gap-6 px-5 pb-5 pt-2 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-500 dark:text-zinc-500 sm:px-8 sm:pb-7 sm:pt-3"
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
        <div class="hidden items-center gap-4 sm:flex">
          <span>{{ workspace.activeBoardName }}</span>
          <span
            class="h-3 w-px bg-stone-300/70 dark:bg-white/10"
            aria-hidden="true"
          />
          <span>Entity ↔ Projection</span>
        </div>
      </footer>
    </div>
  </CanvasStage>
</template>

<style scoped>
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

/* The main stage is the only possible scroll container: the page itself never
   scrolls. Its scrollbar stays hidden to preserve the infinite-canvas illusion. */
.stage-main {
  scrollbar-width: none;
}

.stage-main::-webkit-scrollbar {
  display: none;
}

@media (max-height: 720px) {
  .stage-header {
    padding-top: 0.9rem;
    padding-bottom: 0.4rem;
  }

  .stage-main {
    padding-top: 0.5rem;
    padding-bottom: 0.5rem;
  }

  .stage-footer {
    padding-top: 0.4rem;
    padding-bottom: 0.9rem;
  }
}

/* On unusually short screens, progressive disclosure keeps the note legible
   instead of letting the chrome squeeze the canvas. */
@media (max-height: 620px) and (max-width: 640px) {
  .stage-footer,
  .board-meta {
    display: none;
  }
}
</style>
