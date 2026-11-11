<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import {
  Check,
  ChevronDown,
  Eraser,
  LayoutGrid,
  Pencil,
  Plus,
  Trash2,
} from '@lucide/vue'
import { useToastStore } from '../../stores/toast'
import { useBoardStore } from '../../stores/board'
import { useWorkspaceStore } from '../../stores/workspace'
import type { Board } from '../../types'

const workspace = useWorkspaceStore()
const board = useBoardStore()
const toast = useToastStore()

const rootEl = ref<HTMLElement | null>(null)
const open = ref(false)
const newName = ref('')
const renamingId = ref<string | null>(null)
const renameDraft = ref('')
const pendingDeleteId = ref<string | null>(null)
const pendingClear = ref(false)

let deleteTimer: ReturnType<typeof setTimeout> | null = null
let clearTimer: ReturnType<typeof setTimeout> | null = null

function close() {
  open.value = false
  renamingId.value = null
  pendingDeleteId.value = null
  pendingClear.value = false
  if (deleteTimer !== null) {
    clearTimeout(deleteTimer)
    deleteTimer = null
  }
  if (clearTimer !== null) {
    clearTimeout(clearTimer)
    clearTimer = null
  }
}

function toggle() {
  if (open.value) close()
  else open.value = true
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

function select(boardId: string) {
  workspace.switchBoard(boardId)
  close()
}

async function createBoard() {
  try {
    await workspace.createBoard(newName.value)
    newName.value = ''
    close()
  } catch (cause) {
    console.error('[card-canvas] Unable to create board', cause)
    toast.push('新建白板失败，请重试。', { tone: 'error' })
  }
}

function startRename(board: Board) {
  renamingId.value = board.id
  renameDraft.value = board.name
  void nextTick(() => {
    rootEl.value
      ?.querySelector<HTMLInputElement>('[data-board-rename-input]')
      ?.focus()
  })
}

async function commitRename() {
  if (!renamingId.value) return

  try {
    const renamed = await workspace.renameBoard(
      renamingId.value,
      renameDraft.value,
    )
    if (renamed) renamingId.value = null
  } catch (cause) {
    console.error('[card-canvas] Unable to rename board', cause)
    toast.push('重命名白板失败，请重试。', { tone: 'error' })
  }
}

function cancelRename() {
  renamingId.value = null
}

async function requestDelete(board: Board) {
  if (workspace.boards.length <= 1) return

  if (pendingDeleteId.value === board.id) {
    if (deleteTimer !== null) clearTimeout(deleteTimer)
    deleteTimer = null
    pendingDeleteId.value = null
    try {
      const deleted = await workspace.deleteBoard(board.id)
      if (!deleted) return

      toast.push(`已删除白板「${board.name}」。`, {
        tone: 'info',
        timeout: 3000,
      })
    } catch (cause) {
      console.error('[card-canvas] Unable to delete board', cause)
      toast.push('删除白板失败，数据未改动。', { tone: 'error' })
    }
    return
  }

  pendingDeleteId.value = board.id
  if (deleteTimer !== null) clearTimeout(deleteTimer)
  deleteTimer = setTimeout(() => {
    pendingDeleteId.value = null
    deleteTimer = null
  }, 3000)
}

async function requestClearBoard() {
  if (!board.entries.length && !board.connections.length) return

  if (!pendingClear.value) {
    pendingClear.value = true
    if (clearTimer !== null) clearTimeout(clearTimer)
    clearTimer = setTimeout(() => {
      pendingClear.value = false
      clearTimer = null
    }, 4000)
    return
  }

  if (clearTimer !== null) clearTimeout(clearTimer)
  clearTimer = null
  pendingClear.value = false

  try {
    const result = await board.clearBoard()
    if (!result) return

    close()
    toast.push(
      `已清空 ${result.itemCount} 张卡片及 ${result.connectionCount} 条连线。`,
      {
        tone: 'info',
        timeout: 8000,
        action: {
          label: '撤销',
          run: async () => {
            await board.undoIfLatest(result.historyId)
          },
        },
      },
    )
  } catch (cause) {
    console.error('[card-canvas] Unable to clear board', cause)
    toast.push('清空白板失败，数据未改动。', { tone: 'error' })
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
  if (deleteTimer !== null) clearTimeout(deleteTimer)
  if (clearTimer !== null) clearTimeout(clearTimer)
})
</script>

<template>
  <div ref="rootEl" class="pointer-events-auto relative" data-canvas-ui>
    <button
      type="button"
      class="inline-flex h-10 items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 px-2.5 text-stone-600 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color] duration-300 hover:border-stone-300/90 hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/25"
      aria-label="切换白板"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <LayoutGrid :size="13" :stroke-width="1.7" aria-hidden="true" />
      <span
        class="hidden max-w-[9rem] truncate text-[11px] font-medium md:inline"
      >
        {{ workspace.activeBoardName }}
      </span>
      <ChevronDown
        :size="12"
        :stroke-width="1.8"
        class="text-stone-400 transition-transform duration-200 dark:text-zinc-500"
        :class="{ 'rotate-180': open }"
        aria-hidden="true"
      />
    </button>

    <Transition name="board-menu">
      <div
        v-if="open"
        class="fixed left-3 right-3 top-16 z-50 w-auto overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fdfbf7]/[0.97] shadow-[0_24px_70px_-24px_rgba(41,37,36,0.4)] backdrop-blur-2xl sm:absolute sm:top-12 sm:right-auto sm:left-0 sm:w-[min(20rem,calc(100vw-2rem))] dark:border-white/10 dark:bg-zinc-900/[0.97] dark:shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]"
        role="menu"
        aria-label="白板列表"
      >
        <header
          class="flex items-center justify-between border-b border-stone-200/70 px-3.5 py-2.5 dark:border-white/[0.08]"
        >
          <p
            class="font-mono text-[8px] uppercase tracking-[0.2em] text-stone-400 dark:text-zinc-500"
          >
            Boards · {{ workspace.boards.length }}
          </p>
          <p class="font-serif text-[11px] text-stone-500 dark:text-zinc-400">
            切换白板
          </p>
        </header>

        <ul class="max-h-60 overflow-y-auto overscroll-contain p-1.5">
          <li
            v-for="board in workspace.boards"
            :key="board.id"
            class="group flex items-center gap-1 rounded-xl px-1 py-0.5"
            :class="
              board.id === workspace.activeBoardId
                ? 'bg-amber-500/[0.08] dark:bg-amber-300/[0.06]'
                : 'hover:bg-stone-100/70 dark:hover:bg-white/[0.04]'
            "
          >
            <template v-if="renamingId === board.id">
              <input
                v-model="renameDraft"
                data-board-rename-input
                type="text"
                maxlength="40"
                aria-label="白板名称"
                class="h-7 min-w-0 flex-1 rounded-lg border border-stone-300/80 bg-white px-2 text-[11px] text-stone-700 outline-none focus:border-stone-400 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-200"
                @keydown.enter.prevent="commitRename"
                @keydown.esc.prevent="cancelRename"
              />
              <button
                type="button"
                class="rounded-full px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.1em] text-stone-500 hover:bg-stone-200/70 dark:text-zinc-400 dark:hover:bg-white/10"
                @click="commitRename"
              >
                保存
              </button>
            </template>

            <template v-else>
              <button
                type="button"
                class="flex min-w-0 flex-1 items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left"
                :aria-current="
                  board.id === workspace.activeBoardId ? 'true' : undefined
                "
                @click="select(board.id)"
              >
                <Check
                  :size="11"
                  :stroke-width="2"
                  class="shrink-0"
                  :class="
                    board.id === workspace.activeBoardId
                      ? 'text-amber-700 dark:text-amber-300'
                      : 'text-transparent'
                  "
                  aria-hidden="true"
                />
                <span
                  class="truncate text-[11px] text-stone-700 dark:text-zinc-300"
                >
                  {{ board.name }}
                </span>
              </button>

              <button
                type="button"
                class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-stone-400 opacity-100 transition-[opacity,color,background-color] hover:bg-stone-200/70 hover:text-stone-700 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:text-zinc-500 dark:hover:bg-white/10 dark:hover:text-zinc-200"
                aria-label="重命名白板"
                title="重命名"
                @click.stop="startRename(board)"
              >
                <Pencil :size="11" :stroke-width="1.7" aria-hidden="true" />
              </button>

              <button
                type="button"
                class="flex h-6 shrink-0 items-center justify-center rounded-full px-1.5 text-[8px] transition-colors disabled:cursor-not-allowed disabled:opacity-25"
                :class="
                  pendingDeleteId === board.id
                    ? 'bg-rose-600 font-mono uppercase tracking-[0.1em] text-white'
                    : 'text-stone-400 opacity-100 hover:bg-rose-500/10 hover:text-rose-600 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100 dark:text-zinc-500 dark:hover:text-rose-300'
                "
                :disabled="workspace.boards.length <= 1"
                :aria-label="
                  pendingDeleteId === board.id ? '确认删除白板' : '删除白板'
                "
                :title="
                  workspace.boards.length <= 1
                    ? '至少保留一块白板'
                    : pendingDeleteId === board.id
                      ? '再次点击确认删除'
                      : '删除'
                "
                @click.stop="requestDelete(board)"
              >
                <template v-if="pendingDeleteId === board.id">确认</template>
                <Trash2
                  v-else
                  :size="11"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
              </button>
            </template>
          </li>
        </ul>

        <form
          class="flex items-center gap-1.5 border-t border-stone-200/70 p-2.5 dark:border-white/[0.08]"
          @submit.prevent="createBoard"
        >
          <input
            v-model="newName"
            type="text"
            maxlength="40"
            placeholder="新白板名称"
            aria-label="新白板名称"
            class="h-7 min-w-0 flex-1 rounded-lg border border-stone-200/80 bg-white/70 px-2 text-[11px] text-stone-700 outline-none placeholder:text-stone-400 focus:border-stone-300 dark:border-white/10 dark:bg-white/[0.03] dark:text-zinc-300 dark:placeholder:text-zinc-600 dark:focus:border-white/20"
          />
          <button
            type="submit"
            class="inline-flex h-7 items-center gap-1 rounded-full bg-stone-900 px-2.5 text-[10px] font-medium text-white transition-colors hover:bg-stone-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            <Plus :size="11" :stroke-width="2" aria-hidden="true" />
            新建
          </button>
        </form>

        <div class="border-t border-stone-200/70 p-2 dark:border-white/[0.08]">
          <button
            type="button"
            class="flex h-8 w-full items-center justify-center gap-1.5 rounded-xl text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-30"
            :class="
              pendingClear
                ? 'bg-rose-600 font-medium text-white'
                : 'text-stone-500 hover:bg-rose-50 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-rose-500/[0.08] dark:hover:text-rose-300'
            "
            :disabled="!board.entries.length && !board.connections.length"
            :aria-label="pendingClear ? '确认清空当前白板' : '清空当前白板'"
            :title="
              pendingClear ? '再次点击确认清空' : '保留白板，清空其中的卡片'
            "
            @click="requestClearBoard"
          >
            <Eraser :size="12" :stroke-width="1.7" aria-hidden="true" />
            {{ pendingClear ? '确认清空当前白板' : '清空当前白板' }}
          </button>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.board-menu-enter-active,
.board-menu-leave-active {
  transition:
    opacity 160ms ease,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.board-menu-enter-from,
.board-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}
</style>
