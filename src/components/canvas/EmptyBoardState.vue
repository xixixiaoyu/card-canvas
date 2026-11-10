<script setup lang="ts">
import { ArrowUpRight, Sparkles } from '@lucide/vue'

defineEmits<{
  capture: []
}>()
</script>

<template>
  <div
    class="empty-board-state pointer-events-none absolute inset-0 z-10 flex items-center justify-center px-6"
    data-empty-state
  >
    <button
      type="button"
      class="pointer-events-auto group flex max-w-sm flex-col items-center rounded-[28px] border border-dashed border-stone-300/70 bg-white/35 px-9 py-8 text-center shadow-[0_18px_60px_-38px_rgba(41,37,36,0.35)] backdrop-blur-[2px] transition-[background-color,border-color,box-shadow,transform] duration-500 ease-soft hover:-translate-y-0.5 hover:border-amber-500/40 hover:bg-white/55 hover:shadow-[0_24px_70px_-38px_rgba(41,37,36,0.45)] focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/40 focus-visible:ring-offset-4 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-white/[0.025] dark:hover:border-amber-300/30 dark:hover:bg-white/[0.05] dark:focus-visible:ring-amber-300/30 dark:focus-visible:ring-offset-zinc-950"
      aria-label="捕获第一张卡片"
      data-canvas-ui
      @pointerdown.stop
      @click.stop="$emit('capture')"
    >
      <span
        class="relative flex h-12 w-12 items-center justify-center rounded-[15px] border border-stone-200/80 bg-white/70 text-amber-700/80 shadow-[0_1px_2px_rgba(41,37,36,0.04)] transition-colors duration-500 group-hover:border-amber-500/30 group-hover:text-amber-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-amber-200/80 dark:group-hover:text-amber-200"
        aria-hidden="true"
      >
        <Sparkles :size="18" :stroke-width="1.35" />
        <span
          class="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full bg-amber-500/75"
        />
      </span>

      <span
        class="mt-5 font-mono text-[8px] uppercase tracking-[0.24em] text-stone-400 dark:text-zinc-500"
      >
        A Blank Canvas
      </span>
      <span
        class="mt-2 font-serif text-[19px] tracking-[-0.015em] text-stone-800 dark:text-zinc-200"
      >
        空白也是一块画布
      </span>
      <span
        class="mt-2 max-w-[16rem] text-[11px] leading-[1.8] text-stone-500 dark:text-zinc-400"
      >
        按
        <kbd
          class="rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 font-mono text-[9px] text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
        >
          ⌘K
        </kbd>
        捕获你的第一个灵感碎片
      </span>
      <span
        class="mt-4 inline-flex items-center gap-1 font-mono text-[8px] uppercase tracking-[0.14em] text-stone-400 transition-colors group-hover:text-amber-700/80 dark:text-zinc-600 dark:group-hover:text-amber-200/70"
      >
        或点击这里
        <ArrowUpRight :size="10" :stroke-width="1.8" aria-hidden="true" />
      </span>
    </button>
  </div>
</template>
