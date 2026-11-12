<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  CircleHelp,
  Layers3,
  LayoutGrid,
  Minus,
  Plus,
  Scan,
  Search,
} from '@lucide/vue'
import type { ZoomLimit } from '../../composables/useCanvas'

const props = defineProps<{
  zoomPercent: number
  atLimit: ZoomLimit
  selectedCount: number
  hasConnections: boolean
}>()

const emit = defineEmits<{
  zoomIn: []
  zoomOut: []
  resetZoom: []
  fit: []
  arrange: [mode: 'reading' | 'selected' | 'clusters']
  search: []
  shortcuts: []
}>()

const limitLabel = computed(() =>
  props.atLimit === 'min' ? 'MIN' : props.atLimit === 'max' ? 'MAX' : '',
)
const rootEl = ref<HTMLElement | null>(null)
const arrangeOpen = ref(false)

function toggleArrange() {
  arrangeOpen.value = !arrangeOpen.value
}

function chooseArrangement(mode: 'reading' | 'selected' | 'clusters') {
  arrangeOpen.value = false
  emit('arrange', mode)
}

function handleDocumentPointerDown(event: PointerEvent) {
  if (!arrangeOpen.value) return
  const target = event.target
  if (target instanceof Node && rootEl.value?.contains(target)) return
  arrangeOpen.value = false
}

function handleDocumentKeydown(event: KeyboardEvent) {
  if (!arrangeOpen.value || event.key !== 'Escape') return
  arrangeOpen.value = false
}

function releasePointerFocus(event: PointerEvent) {
  if (event.pointerType !== 'mouse') return
  const target = event.target
  if (target instanceof Element) {
    const button = target.closest('button') as HTMLButtonElement | null
    button?.blur()
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handleDocumentPointerDown)
  document.removeEventListener('keydown', handleDocumentKeydown)
})
</script>

<template>
  <div
    ref="rootEl"
    class="canvas-hud pointer-events-auto relative inline-flex items-center gap-0.5 rounded-full border border-stone-200/80 bg-white/75 p-1 text-stone-500 shadow-[0_8px_30px_-12px_rgba(41,37,36,0.24)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/70 dark:text-zinc-400"
    role="group"
    aria-label="画布视图控制"
    data-canvas-ui
    @pointerdown.stop
    @pointerup="releasePointerFocus"
  >
    <button
      type="button"
      class="flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color,opacity] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      :disabled="atLimit === 'min'"
      aria-label="缩小画布"
      title="缩小"
      @click="emit('zoomOut')"
    >
      <Minus :size="14" :stroke-width="1.8" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="relative flex h-10 min-w-[3.4rem] items-center justify-center rounded-full px-2 font-mono text-[10px] tabular-nums tracking-[0.08em] transition-[background-color,color] duration-200 hover:bg-stone-100/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 sm:h-8 dark:hover:bg-white/[0.07] dark:focus-visible:ring-white/25"
      :class="
        atLimit
          ? 'text-amber-700 dark:text-amber-300'
          : 'text-stone-600 dark:text-zinc-300'
      "
      :aria-label="`当前缩放 ${zoomPercent}%，点击恢复 100%`"
      title="恢复到 100%"
      @click="emit('resetZoom')"
    >
      <span>{{ zoomPercent }}%</span>
      <span
        v-if="limitLabel"
        class="absolute -right-0.5 top-1 font-mono text-[6px] tracking-[0.08em] text-amber-600/80 dark:text-amber-300/70"
        aria-hidden="true"
      >
        {{ limitLabel }}
      </span>
    </button>

    <button
      type="button"
      class="flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color,opacity] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 disabled:pointer-events-none disabled:opacity-30 sm:h-8 sm:w-8 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      :disabled="atLimit === 'max'"
      aria-label="放大画布"
      title="放大"
      @click="emit('zoomIn')"
    >
      <Plus :size="14" :stroke-width="1.8" aria-hidden="true" />
    </button>

    <span
      class="mx-1 h-4 w-px bg-stone-200/80 dark:bg-white/10"
      aria-hidden="true"
    />

    <button
      type="button"
      class="flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 sm:h-8 sm:w-8 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="居中全部卡片"
      title="居中全部卡片"
      @click="emit('fit')"
    >
      <Scan :size="14" :stroke-width="1.7" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 sm:h-8 sm:w-8 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="一键整理当前白板"
      title="整理当前白板"
      :aria-expanded="arrangeOpen"
      aria-haspopup="menu"
      @click="toggleArrange"
    >
      <LayoutGrid :size="14" :stroke-width="1.7" aria-hidden="true" />
    </button>

    <Transition name="arrange-menu">
      <div
        v-if="arrangeOpen"
        class="absolute bottom-12 right-0 z-20 w-[260px] overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fdfbf7]/[0.98] p-1.5 shadow-[0_24px_60px_-22px_rgba(41,37,36,0.42)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_28px_70px_-22px_rgba(0,0,0,0.92)]"
        role="menu"
        aria-label="整理布局方式"
        data-arrange-menu
        @pointerdown.stop
      >
        <button
          type="button"
          class="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100/75 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
          role="menuitem"
          data-arrange-mode="reading"
          @click="chooseArrangement('reading')"
        >
          <LayoutGrid
            :size="13"
            :stroke-width="1.7"
            class="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            <span class="block text-[11px] font-medium">按阅读顺序整理</span>
            <span
              class="mt-0.5 block text-[9px] text-stone-400 dark:text-zinc-500"
            >
              全部卡片排成自适应瀑布网格
            </span>
          </span>
        </button>
        <button
          type="button"
          class="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100/75 disabled:cursor-not-allowed disabled:opacity-35 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
          role="menuitem"
          :disabled="selectedCount < 2"
          data-arrange-mode="selected"
          @click="chooseArrangement('selected')"
        >
          <Scan
            :size="13"
            :stroke-width="1.7"
            class="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            <span class="block text-[11px] font-medium">只整理选中卡片</span>
            <span
              class="mt-0.5 block text-[9px] text-stone-400 dark:text-zinc-500"
            >
              {{
                selectedCount > 1
                  ? `当前选中 ${selectedCount} 张，整理到右侧空白区`
                  : '先选择至少两张卡片'
              }}
            </span>
          </span>
        </button>
        <button
          type="button"
          class="flex w-full items-start gap-2.5 rounded-xl px-2.5 py-2 text-left text-stone-600 hover:bg-stone-100/75 disabled:cursor-not-allowed disabled:opacity-35 dark:text-zinc-300 dark:hover:bg-white/[0.05]"
          role="menuitem"
          :disabled="!hasConnections"
          data-arrange-mode="clusters"
          @click="chooseArrangement('clusters')"
        >
          <Layers3
            :size="13"
            :stroke-width="1.7"
            class="mt-0.5 shrink-0"
            aria-hidden="true"
          />
          <span>
            <span class="block text-[11px] font-medium">按关联聚类</span>
            <span
              class="mt-0.5 block text-[9px] text-stone-400 dark:text-zinc-500"
            >
              {{
                hasConnections ? '相连卡片作为一组靠拢' : '当前白板还没有连线'
              }}
            </span>
          </span>
        </button>
      </div>
    </Transition>

    <span
      class="mx-1 h-4 w-px bg-stone-200/80 dark:bg-white/10"
      aria-hidden="true"
    />

    <button
      type="button"
      class="flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 sm:h-8 sm:w-8 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="卡片纵览"
      title="卡片纵览 · ⌘F"
      @click="emit('search')"
    >
      <Search :size="14" :stroke-width="1.8" aria-hidden="true" />
    </button>

    <span
      class="mx-1 h-4 w-px bg-stone-200/80 dark:bg-white/10"
      aria-hidden="true"
    />

    <button
      type="button"
      class="flex h-10 w-10 items-center justify-center rounded-full transition-[background-color,color] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 sm:h-8 sm:w-8 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="查看快捷键"
      title="快捷键 · ?"
      @click="emit('shortcuts')"
    >
      <CircleHelp :size="14" :stroke-width="1.7" aria-hidden="true" />
    </button>
  </div>
</template>

<style scoped>
.arrange-menu-enter-active,
.arrange-menu-leave-active {
  transition:
    opacity 140ms ease,
    transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.arrange-menu-enter-from,
.arrange-menu-leave-to {
  opacity: 0;
  transform: translateY(5px) scale(0.985);
}
</style>
