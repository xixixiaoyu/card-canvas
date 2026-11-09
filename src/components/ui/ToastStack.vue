<script setup lang="ts">
import { storeToRefs } from 'pinia'
import { CircleCheck, Info, TriangleAlert, X } from '@lucide/vue'
import { useToastStore } from '../../stores/toast'

const toast = useToastStore()
const { toasts } = storeToRefs(toast)

const toneStyles = {
  info: 'border-stone-200/80 bg-white/95 text-stone-700 dark:border-white/10 dark:bg-zinc-900/95 dark:text-zinc-200',
  success:
    'border-emerald-300/60 bg-emerald-50/95 text-emerald-900 dark:border-emerald-400/20 dark:bg-emerald-950/90 dark:text-emerald-100',
  error:
    'border-rose-300/60 bg-rose-50/95 text-rose-900 dark:border-rose-400/25 dark:bg-rose-950/90 dark:text-rose-100',
} as const

const toneIcons = {
  info: Info,
  success: CircleCheck,
  error: TriangleAlert,
} as const

const toneIconStyles = {
  info: 'text-stone-400 dark:text-zinc-500',
  success: 'text-emerald-600 dark:text-emerald-300',
  error: 'text-rose-600 dark:text-rose-300',
} as const
</script>

<template>
  <Teleport to="body">
    <div
      class="pointer-events-none fixed inset-x-4 bottom-4 z-[90] flex flex-col items-stretch gap-2 sm:inset-x-auto sm:bottom-6 sm:left-6 sm:w-[min(24rem,calc(100vw-3rem))]"
      aria-live="polite"
      data-canvas-ui
    >
      <TransitionGroup name="toast" tag="div" class="flex flex-col gap-2">
        <div
          v-for="item in toasts"
          :key="item.id"
          :role="item.tone === 'error' ? 'alert' : 'status'"
          class="pointer-events-auto flex items-start gap-2.5 rounded-2xl border px-3.5 py-3 shadow-[0_18px_50px_-22px_rgba(41,37,36,0.45)] backdrop-blur-xl"
          :class="toneStyles[item.tone]"
        >
          <component
            :is="toneIcons[item.tone]"
            :size="15"
            :stroke-width="1.7"
            class="mt-px shrink-0"
            :class="toneIconStyles[item.tone]"
            aria-hidden="true"
          />
          <p class="min-w-0 flex-1 text-[12px] leading-[1.6]">
            {{ item.message }}
          </p>
          <button
            v-if="item.action"
            type="button"
            class="shrink-0 rounded-full bg-black/[0.06] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] opacity-80 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:bg-white/10 dark:focus-visible:ring-white/20"
            @click="toast.runAction(item.id)"
          >
            {{ item.action.label }}
          </button>
          <button
            type="button"
            class="mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full opacity-50 transition-opacity hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:focus-visible:ring-white/20"
            aria-label="关闭提示"
            @click="toast.dismiss(item.id)"
          >
            <X :size="11" :stroke-width="2" aria-hidden="true" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.toast-enter-from {
  opacity: 0;
  transform: translateY(8px) scale(0.98);
}

.toast-leave-to {
  opacity: 0;
  transform: translateX(-12px);
}

.toast-move {
  transition: transform 200ms ease;
}
</style>
