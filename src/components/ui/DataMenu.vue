<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { Database, Download, Upload } from '@lucide/vue'
import { downloadBackup, importBackupFile } from '../../lib/backup'
import { broadcastWorkspaceChange } from '../../lib/tab-sync'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'
import { useWorkspaceStore } from '../../stores/workspace'

const board = useBoardStore()
const workspace = useWorkspaceStore()
const toast = useToastStore()

const rootEl = ref<HTMLElement | null>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const open = ref(false)
const importing = ref(false)

function close() {
  open.value = false
}

function toggle() {
  open.value = !open.value
}

function handlePointerDown(event: PointerEvent) {
  if (!open.value) return

  const target = event.target
  if (target instanceof Node && rootEl.value?.contains(target)) return
  close()
}

function handleKeydown(event: KeyboardEvent) {
  if (!open.value || event.key !== 'Escape') return

  event.preventDefault()
  event.stopPropagation()
  close()
}

async function handleExport() {
  try {
    const counts = await downloadBackup()
    toast.push(
      `已导出 ${counts.cards} 张卡片与 ${counts.connections} 条连线。`,
      {
        tone: 'success',
        timeout: 3000,
      },
    )
    close()
  } catch (cause) {
    console.error('[card-canvas] Unable to export backup', cause)
    toast.push('导出备份失败。', { tone: 'error' })
  }
}

function pickImportFile() {
  fileInput.value?.click()
}

async function handleImportFile(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file || importing.value) return

  importing.value = true

  try {
    const counts = await importBackupFile(file)
    const previousBoardId = workspace.activeBoardId
    await workspace.loadBoards()
    if (workspace.activeBoardId === previousBoardId) {
      await board.refresh()
    }
    broadcastWorkspaceChange('all')
    toast.push(`已导入 ${counts.cards} 张卡片、${counts.boardItems} 个投影。`, {
      tone: 'success',
      timeout: 4000,
    })
    close()
  } catch (cause) {
    console.error('[card-canvas] Unable to import backup', cause)
    toast.push(cause instanceof Error ? cause.message : '导入备份失败。', {
      tone: 'error',
    })
  } finally {
    importing.value = false
  }
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
      class="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/80 bg-white/60 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color] duration-300 hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30"
      aria-label="数据与备份"
      aria-haspopup="menu"
      :aria-expanded="open"
      title="数据与备份"
      @click="toggle"
    >
      <Database :size="14" :stroke-width="1.7" aria-hidden="true" />
    </button>

    <Transition name="data-menu">
      <div
        v-if="open"
        class="fixed left-3 right-3 top-16 z-50 w-auto overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fdfbf7]/[0.97] shadow-[0_24px_70px_-24px_rgba(41,37,36,0.4)] backdrop-blur-2xl sm:absolute sm:top-12 sm:right-0 sm:left-auto sm:w-64 dark:border-white/10 dark:bg-zinc-900/[0.97] dark:shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]"
        role="menu"
        aria-label="数据与备份"
      >
        <header
          class="flex items-center justify-between border-b border-stone-200/70 px-3.5 py-2.5 dark:border-white/[0.08]"
        >
          <p
            class="font-mono text-[8px] uppercase tracking-[0.2em] text-stone-400 dark:text-zinc-500"
          >
            Workspace Data
          </p>
          <p class="font-serif text-[11px] text-stone-500 dark:text-zinc-400">
            本地优先
          </p>
        </header>

        <div class="flex flex-col p-1.5">
          <button
            type="button"
            class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[11px] text-stone-600 transition-colors hover:bg-stone-100/70 hover:text-stone-900 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
            role="menuitem"
            @click="handleExport"
          >
            <Download :size="13" :stroke-width="1.7" aria-hidden="true" />
            导出工作区备份
            <span
              class="ml-auto font-mono text-[8px] uppercase tracking-[0.12em] text-stone-400 dark:text-zinc-600"
            >
              JSON
            </span>
          </button>

          <button
            type="button"
            class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[11px] text-stone-600 transition-colors hover:bg-stone-100/70 hover:text-stone-900 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
            role="menuitem"
            :disabled="importing"
            @click="pickImportFile"
          >
            <Upload :size="13" :stroke-width="1.7" aria-hidden="true" />
            {{ importing ? '正在导入…' : '导入工作区备份' }}
          </button>

          <input
            ref="fileInput"
            type="file"
            accept="application/json,.json"
            class="sr-only"
            aria-label="选择要导入的备份文件"
            @change="handleImportFile"
          />
        </div>

        <p
          class="border-t border-stone-200/70 px-3.5 py-2 font-mono text-[8px] uppercase tracking-[0.14em] text-stone-400 dark:border-white/[0.08] dark:text-zinc-600"
        >
          Cards · Wires · Boards
        </p>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.data-menu-enter-active,
.data-menu-leave-active {
  transition:
    opacity 160ms ease,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.data-menu-enter-from,
.data-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
