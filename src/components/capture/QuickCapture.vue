<script setup lang="ts">
import { PenLine } from '@lucide/vue'

withDefaults(
  defineProps<{
    shortcut?: string
  }>(),
  {
    shortcut: '⌘ K',
  },
)
</script>

<template>
  <!-- Phase 1 placeholder for the 1D quick-capture surface. -->
  <div
    class="flex items-center gap-3 rounded-2xl border border-stone-200/80 bg-white/70 p-3 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/60"
  >
    <span
      class="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100/80 text-stone-500 dark:bg-white/[0.05] dark:text-zinc-400"
    >
      <PenLine :size="15" :stroke-width="1.6" aria-hidden="true" />
    </span>
    <div class="min-w-0 flex-1">
      <p class="text-[13px] font-medium text-stone-700 dark:text-zinc-300">
        一维速记
      </p>
      <p class="mt-0.5 text-[10px] text-stone-400 dark:text-zinc-500">
        捕捉想法，稍后再整理
      </p>
    </div>
    <kbd
      class="rounded-md border border-stone-200/80 bg-stone-50/80 px-1.5 py-1 font-mono text-[9px] text-stone-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-500"
    >
      {{ shortcut }}
    </kbd>
  </div>
</template>
