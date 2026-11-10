<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
  type Component,
} from 'vue'
import { Keyboard, Layers2, Move, PenLine, Search, X } from '@lucide/vue'

interface ShortcutItem {
  keys: string[]
  label: string
}

interface ShortcutGroup {
  title: string
  caption: string
  icon: Component
  items: ShortcutItem[]
}

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const groups: ShortcutGroup[] = [
  {
    title: '捕获',
    caption: 'Capture',
    icon: PenLine,
    items: [
      { keys: ['⌘', 'K'], label: '速记并直接上板' },
      { keys: ['⇧', 'N'], label: '备用速记入口' },
      { keys: ['⌘', '↵'], label: '保存速记' },
    ],
  },
  {
    title: '漫游',
    caption: 'Navigate',
    icon: Move,
    items: [
      { keys: ['Space', '拖动'], label: '平移画布' },
      { keys: ['滚轮', '捏合'], label: '以光标为中心缩放' },
      { keys: ['拖动卡片'], label: '移动卡片 / 已选集群' },
      { keys: ['Shift', '框选'], label: '增量选择卡片' },
    ],
  },
  {
    title: '检索聚焦',
    caption: 'Focus',
    icon: Search,
    items: [
      { keys: ['⌘', 'F'], label: '全局穿梭搜索' },
      { keys: ['/'], label: '搜索当前白板' },
      { keys: ['↑', '↓', '↵'], label: '选择并前往结果' },
      { keys: ['Esc'], label: '关闭当前浮层' },
    ],
  },
  {
    title: '组织产出',
    caption: 'Compose',
    icon: Layers2,
    items: [
      { keys: ['拖动'], label: '刚体平移整个选中组' },
      { keys: ['⌘', 'Z'], label: '撤销上一步' },
      { keys: ['⇧', '⌘', 'Z'], label: '重做' },
      { keys: ['选中', '复制'], label: '蒸馏为 Markdown 大纲' },
    ],
  },
]

const closeButton = ref<HTMLButtonElement | null>(null)
const titleId = computed(() => 'shortcut-modal-title')
let previousFocus: HTMLElement | null = null
let keydownBound = false

function close() {
  if (!props.open) return
  emit('update:open', false)
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!props.open) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close()
    return
  }

  if (event.key === 'Tab') {
    event.preventDefault()
    closeButton.value?.focus()
  }
}

async function attachInteraction() {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  if (!keydownBound) {
    window.addEventListener('keydown', handleWindowKeydown)
    keydownBound = true
  }
  await nextTick()
  closeButton.value?.focus()
}

function detachInteraction() {
  if (keydownBound) {
    window.removeEventListener('keydown', handleWindowKeydown)
    keydownBound = false
  }
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

watch(
  () => props.open,
  (open) => {
    if (open) void attachInteraction()
    else detachInteraction()
  },
)

onBeforeUnmount(detachInteraction)
</script>

<template>
  <Teleport to="body">
    <Transition name="shortcut-modal">
      <div
        v-if="open"
        class="shortcut-layer fixed inset-0 z-[85] flex items-center justify-center px-4"
        @pointerdown.self="close"
      >
        <div
          class="shortcut-backdrop absolute inset-0 bg-stone-950/15 backdrop-blur-[3px] dark:bg-black/45"
          aria-hidden="true"
          @pointerdown="close"
        />

        <section
          class="shortcut-panel relative max-h-[calc(100vh-2rem)] w-full max-w-[58rem] overflow-y-auto rounded-[26px] border border-stone-200/80 bg-[#fdfbf7]/95 p-5 shadow-[0_36px_120px_-32px_rgba(41,37,36,0.55)] backdrop-blur-2xl sm:p-6 dark:border-white/10 dark:bg-zinc-900/95 dark:shadow-[0_46px_140px_-32px_rgba(0,0,0,0.95)]"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="titleId"
          data-shortcut-modal
          @pointerdown.stop
        >
          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 pb-4 dark:border-white/[0.08]"
          >
            <div class="flex items-start gap-3">
              <span
                class="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[11px] border border-stone-200/80 bg-white/65 text-amber-700/80 shadow-[0_1px_2px_rgba(41,37,36,0.04)] dark:border-white/10 dark:bg-white/[0.04] dark:text-amber-200/80"
                aria-hidden="true"
              >
                <Keyboard :size="16" :stroke-width="1.55" />
              </span>
              <div>
                <p
                  class="font-mono text-[8px] uppercase tracking-[0.22em] text-stone-400 dark:text-zinc-500"
                >
                  Shortcut Map · v1.1.0
                </p>
                <h2
                  :id="titleId"
                  class="mt-1 font-serif text-[20px] tracking-[-0.02em] text-stone-800 dark:text-zinc-100"
                >
                  快捷键备忘录
                </h2>
                <p class="mt-1 text-[11px] text-stone-500 dark:text-zinc-400">
                  键盘是一块更快的画布。输入框内不会触发。
                </p>
              </div>
            </div>

            <button
              ref="closeButton"
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.08] dark:hover:text-zinc-200 dark:focus-visible:ring-white/20"
              aria-label="关闭快捷键"
              @click="close"
            >
              <X :size="14" :stroke-width="1.8" aria-hidden="true" />
            </button>
          </header>

          <div class="mt-4 grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <section
              v-for="group in groups"
              :key="group.title"
              class="rounded-2xl border border-stone-200/65 bg-white/35 p-3 dark:border-white/[0.07] dark:bg-white/[0.025]"
              :data-shortcut-group="group.caption"
            >
              <div class="flex items-center gap-2">
                <component
                  :is="group.icon"
                  :size="12"
                  :stroke-width="1.7"
                  class="text-stone-400 dark:text-zinc-500"
                  aria-hidden="true"
                />
                <h3
                  class="text-[11px] font-medium text-stone-700 dark:text-zinc-300"
                >
                  {{ group.title }}
                </h3>
                <span
                  class="ml-auto font-mono text-[7px] uppercase tracking-[0.14em] text-stone-300 dark:text-zinc-600"
                >
                  {{ group.caption }}
                </span>
              </div>

              <dl class="mt-3 space-y-2.5">
                <div
                  v-for="item in group.items"
                  :key="`${group.title}-${item.label}`"
                  class="flex items-start justify-between gap-2"
                >
                  <dt
                    class="min-w-0 text-[10px] leading-[1.55] text-stone-500 dark:text-zinc-400"
                  >
                    {{ item.label }}
                  </dt>
                  <dd class="flex shrink-0 flex-wrap justify-end gap-1">
                    <kbd
                      v-for="key in item.keys"
                      :key="`${item.label}-${key}`"
                      class="min-w-[1.35rem] rounded-md border border-stone-200/80 bg-white/75 px-1 py-0.5 text-center font-mono text-[8px] leading-[1.35] text-stone-600 shadow-[0_1px_0_rgba(41,37,36,0.04)] dark:border-white/10 dark:bg-white/[0.05] dark:text-zinc-300"
                    >
                      {{ key }}
                    </kbd>
                  </dd>
                </div>
              </dl>
            </section>
          </div>

          <footer
            class="mt-4 flex flex-col gap-2 border-t border-stone-200/70 pt-3 font-mono text-[8px] uppercase tracking-[0.14em] text-stone-400 sm:flex-row sm:items-center sm:justify-between dark:border-white/[0.08] dark:text-zinc-600"
          >
            <span>Esc 关闭 · 点击遮罩关闭</span>
            <span>Windows / Linux 使用 Ctrl 替代 ⌘</span>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.shortcut-modal-enter-active,
.shortcut-modal-leave-active {
  transition: opacity 180ms ease;
}

.shortcut-modal-enter-active .shortcut-panel,
.shortcut-modal-leave-active .shortcut-panel {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.shortcut-modal-enter-from,
.shortcut-modal-leave-to {
  opacity: 0;
}

.shortcut-modal-enter-from .shortcut-panel,
.shortcut-modal-leave-to .shortcut-panel {
  transform: translateY(8px) scale(0.985);
}
</style>
