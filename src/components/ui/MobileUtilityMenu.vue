<script setup lang="ts">
import { ListTodo, Moon, MoreHorizontal, Sparkles, Sun, X } from '@lucide/vue'
import { onBeforeUnmount, onMounted, ref } from 'vue'

defineProps<{
  isDark: boolean
  aiConfigured: boolean
  pendingActionCount: number
}>()

const emit = defineEmits<{
  'open-ai': []
  'open-actions': []
  toggleTheme: []
}>()

const rootEl = ref<HTMLElement | null>(null)
const open = ref(false)

function close() {
  open.value = false
}

function handlePointerDown(event: PointerEvent) {
  if (!open.value) return
  if (event.target instanceof Node && rootEl.value?.contains(event.target)) {
    return
  }
  close()
}

function handleKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  close()
}

function openAI() {
  close()
  emit('open-ai')
}

function openActions() {
  close()
  emit('open-actions')
}

function toggleTheme() {
  close()
  emit('toggleTheme')
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div ref="rootEl" class="relative">
    <button
      type="button"
      class="utility-trigger"
      :aria-label="open ? '关闭更多工具' : '更多工具'"
      :aria-expanded="open"
      aria-haspopup="menu"
      title="更多工具"
      @click="open = !open"
    >
      <X v-if="open" :size="14" :stroke-width="1.8" aria-hidden="true" />
      <MoreHorizontal
        v-else
        :size="15"
        :stroke-width="1.7"
        aria-hidden="true"
      />
    </button>

    <Transition name="mobile-utility">
      <div
        v-if="open"
        class="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fdfbf7]/[0.98] p-1.5 shadow-[0_24px_65px_-22px_rgba(41,37,36,0.44)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_30px_80px_-24px_rgba(0,0,0,0.94)]"
        role="menu"
        aria-label="更多工具"
      >
        <button
          type="button"
          class="compact-action-entry min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-stone-600 transition-colors hover:bg-stone-100/75 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-white/[0.055] dark:hover:text-zinc-100"
          role="menuitem"
          @click="openActions"
        >
          <span
            class="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200/80 bg-white/60 text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
          >
            <ListTodo :size="13" :stroke-width="1.7" aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span class="block text-[12px] font-medium">行动透镜</span>
            <span
              class="mt-0.5 block text-[10px] text-stone-400 dark:text-zinc-500"
            >
              {{
                pendingActionCount
                  ? `${pendingActionCount} 个待办等待处理`
                  : '当前没有待办'
              }}
            </span>
          </span>
        </button>

        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-stone-600 transition-colors hover:bg-stone-100/75 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-white/[0.055] dark:hover:text-zinc-100"
          role="menuitem"
          @click="openAI"
        >
          <span
            class="flex h-8 w-8 items-center justify-center rounded-lg border border-amber-700/15 bg-amber-500/[0.06] text-amber-700 dark:border-amber-200/10 dark:bg-amber-200/[0.04] dark:text-amber-200"
          >
            <Sparkles :size="13" :stroke-width="1.7" aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span class="block text-[12px] font-medium">AI 认知辅助</span>
            <span
              class="mt-0.5 block text-[10px] text-stone-400 dark:text-zinc-500"
            >
              {{ aiConfigured ? '已配置 DeepSeek' : '配置 DeepSeek Key' }}
            </span>
          </span>
        </button>

        <button
          type="button"
          class="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-stone-600 transition-colors hover:bg-stone-100/75 hover:text-stone-900 dark:text-zinc-300 dark:hover:bg-white/[0.055] dark:hover:text-zinc-100"
          role="menuitem"
          @click="toggleTheme"
        >
          <span
            class="flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200/80 bg-white/60 text-stone-600 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
          >
            <Sun
              v-if="isDark"
              :size="13"
              :stroke-width="1.7"
              aria-hidden="true"
            />
            <Moon v-else :size="13" :stroke-width="1.7" aria-hidden="true" />
          </span>
          <span class="min-w-0">
            <span class="block text-[12px] font-medium">
              {{ isDark ? '切换浅色主题' : '切换深色主题' }}
            </span>
            <span
              class="mt-0.5 block text-[10px] text-stone-400 dark:text-zinc-500"
            >
              当前为{{ isDark ? '深色' : '浅色' }}外观
            </span>
          </span>
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.utility-trigger {
  display: inline-flex;
  width: 2.5rem;
  height: 2.5rem;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  color: rgb(87 83 78);
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.compact-action-entry {
  display: none;
}

.utility-trigger:hover {
  background: rgba(231, 229, 224, 0.72);
  color: rgb(28 25 23);
}

.utility-trigger:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.38);
  outline-offset: 1px;
}

:global(.dark) .utility-trigger {
  color: rgb(161 161 170);
}

:global(.dark) .utility-trigger:hover {
  background: rgba(255, 255, 255, 0.07);
  color: rgb(244 244 245);
}

:global(.dark) .utility-trigger:focus-visible {
  outline-color: rgba(253, 230, 138, 0.28);
}

.mobile-utility-enter-active,
.mobile-utility-leave-active {
  transition:
    opacity 160ms ease,
    transform 190ms cubic-bezier(0.22, 1, 0.36, 1);
}

@media (max-width: 380px) {
  .compact-action-entry {
    display: flex;
  }
}

.mobile-utility-enter-from,
.mobile-utility-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .mobile-utility-enter-active,
  .mobile-utility-leave-active {
    transition: none;
  }
}
</style>
