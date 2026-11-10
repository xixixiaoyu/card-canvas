<script setup lang="ts">
import { computed } from 'vue'
import { CircleHelp, Minus, Plus, Scan, Search } from '@lucide/vue'
import type { ZoomLimit } from '../../composables/useCanvas'

const props = defineProps<{
  zoomPercent: number
  atLimit: ZoomLimit
}>()

const emit = defineEmits<{
  zoomIn: []
  zoomOut: []
  resetZoom: []
  fit: []
  search: []
  shortcuts: []
}>()

const limitLabel = computed(() =>
  props.atLimit === 'min' ? 'MIN' : props.atLimit === 'max' ? 'MAX' : '',
)
</script>

<template>
  <div
    class="canvas-hud pointer-events-auto inline-flex items-center gap-0.5 rounded-full border border-stone-200/80 bg-white/75 p-1 text-stone-500 shadow-[0_8px_30px_-12px_rgba(41,37,36,0.24)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/70 dark:text-zinc-400"
    role="group"
    aria-label="画布视图控制"
    data-canvas-ui
    @pointerdown.stop
  >
    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,opacity] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      :disabled="atLimit === 'min'"
      aria-label="缩小画布"
      title="缩小"
      @click="emit('zoomOut')"
    >
      <Minus :size="14" :stroke-width="1.8" aria-hidden="true" />
    </button>

    <button
      type="button"
      class="relative flex h-8 min-w-[3.4rem] items-center justify-center rounded-full px-2 font-mono text-[10px] tabular-nums tracking-[0.08em] transition-[background-color,color] duration-200 hover:bg-stone-100/85 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 dark:hover:bg-white/[0.07] dark:focus-visible:ring-white/25"
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
      class="flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color,opacity] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 disabled:pointer-events-none disabled:opacity-30 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
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
      class="flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="居中全部卡片"
      title="居中全部卡片"
      @click="emit('fit')"
    >
      <Scan :size="14" :stroke-width="1.7" aria-hidden="true" />
    </button>

    <span
      class="mx-1 h-4 w-px bg-stone-200/80 dark:bg-white/10"
      aria-hidden="true"
    />

    <button
      type="button"
      class="flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="搜索卡片"
      title="搜索 · ⌘F"
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
      class="flex h-8 w-8 items-center justify-center rounded-full transition-[background-color,color] duration-200 hover:bg-stone-100/85 hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/55 dark:hover:bg-white/[0.07] dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="查看快捷键"
      title="快捷键 · ?"
      @click="emit('shortcuts')"
    >
      <CircleHelp :size="14" :stroke-width="1.7" aria-hidden="true" />
    </button>
  </div>
</template>
