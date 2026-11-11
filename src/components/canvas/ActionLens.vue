<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Check, ListTodo } from '@lucide/vue'
import { collectPendingTasks } from '../../lib/atomic-markdown'
import { useBoardStore } from '../../stores/board'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  focus: [task: { cardId: string; itemId: string }]
  toggle: [task: { cardId: string; lineIndex: number }]
}>()

const board = useBoardStore()
const rootEl = ref<HTMLElement | null>(null)

const tasks = computed(() =>
  collectPendingTasks(
    board.entries.map((entry) => ({
      cardId: entry.card.id,
      itemId: entry.item.id,
      title: entry.card.title,
      content: entry.card.content,
      x: entry.item.x,
      y: entry.item.y,
    })),
  ),
)

function close() {
  if (props.open) emit('update:open', false)
}

function toggleOpen() {
  emit('update:open', !props.open)
}

function handlePointerDown(event: PointerEvent) {
  if (!props.open) return
  const target = event.target
  if (target instanceof Node && rootEl.value?.contains(target)) return
  close()
}

function handleKeydown(event: KeyboardEvent) {
  if (!props.open || event.key !== 'Escape') return
  event.preventDefault()
  event.stopImmediatePropagation()
  close()
}

function focusTask(task: { cardId: string; itemId: string }) {
  close()
  emit('focus', task)
}

function toggleTask(task: { cardId: string; lineIndex: number }) {
  emit('toggle', task)
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
  <div ref="rootEl" class="pointer-events-auto relative" data-canvas-ui>
    <button
      type="button"
      class="group relative flex h-10 items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 py-1 pl-1 pr-1 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,opacity,box-shadow] duration-300 hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 sm:pr-2.5 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30"
      :class="{ 'opacity-60': tasks.length === 0 }"
      :aria-label="
        tasks.length ? `行动透镜，${tasks.length} 个待办` : '行动透镜，无待办'
      "
      aria-haspopup="dialog"
      :aria-expanded="open"
      @click="toggleOpen"
    >
      <span
        class="relative flex h-8 w-8 items-center justify-center rounded-full bg-stone-100/80 text-stone-600 dark:bg-white/[0.06] dark:text-zinc-300"
      >
        <ListTodo :size="14" :stroke-width="1.7" aria-hidden="true" />
        <span
          v-if="tasks.length"
          class="absolute -right-1 -top-1 flex min-w-[1.05rem] items-center justify-center rounded-full border border-white bg-amber-600 px-1 font-mono text-[8px] leading-[1rem] text-white dark:border-zinc-900 dark:bg-sky-300 dark:text-zinc-900"
        >
          {{ tasks.length }}
        </span>
      </span>
    </button>

    <Transition name="action-lens">
      <section
        v-if="open"
        class="fixed left-3 right-3 top-16 z-50 overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_24px_70px_-24px_rgba(41,37,36,0.4)] backdrop-blur-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-[22rem] dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]"
        role="dialog"
        aria-label="行动透镜"
        data-action-lens
        @pointerdown.stop
        @click.stop
      >
        <header
          class="flex items-center justify-between border-b border-stone-200/70 px-3.5 py-3 dark:border-white/[0.08]"
        >
          <div>
            <p
              class="font-mono text-[8px] uppercase tracking-[0.2em] text-stone-400 dark:text-zinc-500"
            >
              Action Lens
            </p>
            <p
              class="mt-1 font-serif text-[14px] text-stone-700 dark:text-zinc-200"
            >
              当前白板行动
            </p>
          </div>
          <span
            class="rounded-full border border-amber-700/15 bg-amber-500/[0.07] px-2 py-1 font-mono text-[8px] uppercase tracking-[0.12em] text-amber-800/80 dark:border-sky-200/10 dark:bg-sky-300/[0.06] dark:text-sky-200/80"
          >
            {{ tasks.length }} pending
          </span>
        </header>

        <div
          v-if="tasks.length"
          class="max-h-[min(26rem,calc(100vh-10rem))] overflow-y-auto p-1.5"
        >
          <div
            v-for="task in tasks"
            :key="task.id"
            class="group flex items-start gap-2 rounded-xl px-2 py-2 transition-colors hover:bg-stone-100/65 dark:hover:bg-white/[0.04]"
          >
            <button
              type="button"
              class="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border border-stone-400/60 text-transparent transition hover:border-amber-700/60 hover:bg-amber-100/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/35 dark:border-white/25 dark:hover:border-sky-200/45 dark:hover:bg-sky-300/[0.08] dark:focus-visible:ring-sky-200/25"
              :aria-label="`完成待办：${task.text}`"
              data-action-task-toggle
              @pointerdown.stop.prevent
              @click.stop.prevent="toggleTask(task)"
            >
              <Check :size="9" :stroke-width="2.4" aria-hidden="true" />
            </button>

            <button
              type="button"
              class="min-w-0 flex-1 text-left focus:outline-none focus-visible:rounded-md focus-visible:ring-2 focus-visible:ring-amber-500/30 dark:focus-visible:ring-sky-200/20"
              :title="`前往：${task.title}`"
              data-action-task
              @click="focusTask(task)"
            >
              <span
                class="block text-[11px] leading-5 text-stone-700 dark:text-zinc-300"
              >
                {{ task.text }}
              </span>
              <span
                class="mt-0.5 block truncate font-mono text-[8px] uppercase tracking-[0.11em] text-stone-400 dark:text-zinc-600"
              >
                ↳ {{ task.title }}
              </span>
            </button>
          </div>
        </div>

        <div v-else class="px-4 py-8 text-center">
          <span
            class="mx-auto flex h-8 w-8 items-center justify-center rounded-full border border-emerald-600/15 bg-emerald-500/[0.05] text-emerald-600 dark:border-emerald-300/15 dark:text-emerald-300"
          >
            <Check :size="14" :stroke-width="1.8" aria-hidden="true" />
          </span>
          <p class="mt-3 text-[11px] text-stone-600 dark:text-zinc-300">
            当前白板所有行动均已就绪
          </p>
          <p class="mt-1 text-[9px] text-stone-400 dark:text-zinc-600">
            在卡片正文里写「- [ ] 待办」即可加入这里
          </p>
        </div>
      </section>
    </Transition>
  </div>
</template>

<style scoped>
.action-lens-enter-active,
.action-lens-leave-active {
  transition:
    opacity 160ms ease,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.action-lens-enter-from,
.action-lens-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .action-lens-enter-active,
  .action-lens-leave-active {
    transition: none;
  }
}
</style>
