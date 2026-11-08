<script setup lang="ts">
import { Inbox } from '@lucide/vue'

withDefaults(
  defineProps<{
    count?: number
  }>(),
  {
    count: 0,
  },
)
</script>

<template>
  <!-- Phase 1 placeholder for the unsorted capture shelf. -->
  <div
    class="rounded-2xl border border-stone-200/80 bg-white/60 p-4 backdrop-blur-md dark:border-white/10 dark:bg-zinc-900/50"
  >
    <div class="flex items-center justify-between">
      <div class="flex items-center gap-2.5">
        <span
          class="flex h-8 w-8 items-center justify-center rounded-xl bg-stone-100/80 text-stone-500 dark:bg-white/[0.05] dark:text-zinc-400"
        >
          <Inbox :size="14" :stroke-width="1.6" aria-hidden="true" />
        </span>
        <div>
          <p class="text-[12px] font-medium text-stone-700 dark:text-zinc-300">
            待整理池
          </p>
          <p class="mt-0.5 text-[9px] uppercase tracking-[0.14em] text-stone-400 dark:text-zinc-600">
            Inbox
          </p>
        </div>
      </div>
      <span
        class="rounded-full border border-stone-200/70 px-2 py-0.5 font-mono text-[9px] text-stone-400 dark:border-white/10 dark:text-zinc-500"
      >
        {{ count }}
      </span>
    </div>
  </div>
</template>
