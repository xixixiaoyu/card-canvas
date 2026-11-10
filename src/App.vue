<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Layers2, Moon, PenLine, Redo2, Sun, Undo2 } from '@lucide/vue'
import CanvasStage from './components/canvas/CanvasStage.vue'
import CardNode from './components/canvas/CardNode.vue'
import ActionLens from './components/canvas/ActionLens.vue'
import EmptyBoardState from './components/canvas/EmptyBoardState.vue'
import ShortcutModal from './components/canvas/ShortcutModal.vue'
import SpotlightSearch from './components/canvas/SpotlightSearch.vue'
import CloudAccount from './components/auth/CloudAccount.vue'
import BoardSwitcher from './components/board/BoardSwitcher.vue'
import QuickCapture from './components/capture/QuickCapture.vue'
import DataMenu from './components/ui/DataMenu.vue'
import ToastStack from './components/ui/ToastStack.vue'
import { useTheme } from './composables/useTheme'
import type { CanvasCamera } from './composables/useCanvas'
import { getItemRect } from './lib/card-metrics'
import { cardHasTag } from './lib/galaxy'
import type { SpotlightTarget } from './lib/global-search'
import { buildMarkdown, copyTextToClipboard } from './lib/markdownExport'
import { DEMO_FOCUS_ITEM_ID } from './lib/demo-data'
import { useAuthStore } from './stores/auth'
import { useBoardStore } from './stores/board'
import { useSyncStore } from './stores/sync'
import { useToastStore } from './stores/toast'
import { useWorkspaceStore } from './stores/workspace'
import type { Card } from './types'

const { isDark, toggleTheme } = useTheme()
const workspace = useWorkspaceStore()
const board = useBoardStore()
const toast = useToastStore()
const auth = useAuthStore()
const sync = useSyncStore()

const stageRef = ref<InstanceType<typeof CanvasStage> | null>(null)
const isCaptureOpen = ref(false)
const isSpotlightOpen = ref(false)
const isShortcutOpen = ref(false)
const isActionTrayOpen = ref(false)
const editingCard = ref<Card | null>(null)
const stageReady = ref(false)
const pendingTeleport = ref<SpotlightTarget | null>(null)
const copiedCardId = ref<string | null>(null)
let booting = true
let teleportToken = 0
let teleportRunning = false
let copyFeedbackTimer: ReturnType<typeof setTimeout> | null = null

const camera = computed<CanvasCamera | null>(
  () => stageRef.value?.camera ?? null,
)

const selectionAnnouncement = computed(() => {
  const count = board.selectedItems.length
  if (count === 0) return '未选中任何卡片'
  if (count > 1) return `已选中 ${count} 张卡片`

  const item = board.selectedItems[0]
  const card = board.cards.find((entry) => entry.id === item.cardId)
  return card ? `已选中：${card.title}` : '已选中卡片'
})

const databaseLabel = computed(() => {
  if (board.status === 'ready') return 'Dexie ready'
  if (board.status === 'error') return 'Dexie unavailable'
  return 'Opening Dexie…'
})

async function initializeBoard() {
  try {
    await workspace.loadBoards()
    await board.initialize(workspace.activeBoardId)
    board.startSync()
    workspace.startSync()
  } catch (error) {
    console.error('[card-canvas] Unable to initialize the board', error)
  } finally {
    booting = false
  }
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

function cancelPendingTeleport() {
  if (!pendingTeleport.value) return
  teleportToken += 1
  pendingTeleport.value = null
  teleportRunning = false
}

watch(
  () => workspace.activeBoardId,
  (boardId, previous) => {
    stageReady.value = false
    if (pendingTeleport.value && pendingTeleport.value.boardId !== boardId) {
      cancelPendingTeleport()
    }
    if (booting || !previous || boardId === previous) return

    void board.loadBoard(boardId).catch((error) => {
      console.error('[card-canvas] Unable to switch board', error)
    })
  },
)

watch(
  () => board.status,
  (status) => {
    if (status === 'ready') void completePendingTeleport()
  },
)

watch(
  () => auth.user?.id,
  (userId) => {
    if (userId) void sync.start(userId)
    else sync.stop()
  },
)

function handleStageReady(boardId: string) {
  if (boardId !== workspace.activeBoardId) return
  stageReady.value = true
  void completePendingTeleport()
}

async function completePendingTeleport() {
  const target = pendingTeleport.value
  if (!target || teleportRunning) return
  if (
    board.status !== 'ready' ||
    board.activeBoardId !== target.boardId ||
    !stageReady.value
  ) {
    return
  }

  const token = teleportToken
  teleportRunning = true

  try {
    await nextTick()
    await nextFrame()
    await nextFrame()
    if (token !== teleportToken) return

    const entry =
      board.entries.find((candidate) => candidate.item.id === target.itemId) ??
      board.entries.find((candidate) => candidate.card.id === target.cardId)

    if (!entry) {
      toast.push('目标卡片已不在该白板上。', { tone: 'error' })
      pendingTeleport.value = null
      return
    }

    let camera = stageRef.value?.camera
    for (let attempt = 0; !camera && attempt < 3; attempt += 1) {
      await nextFrame()
      camera = stageRef.value?.camera
    }
    if (!camera) {
      toast.push('画布尚未准备好，请稍后重试。', { tone: 'error' })
      pendingTeleport.value = null
      return
    }

    board.selectItem(entry.item.id)
    await nextTick()
    document
      .querySelector<HTMLElement>(
        `[data-world-item][data-item-id="${entry.item.id}"]`,
      )
      ?.focus({ preventScroll: true })

    const rect = getItemRect(entry.item)
    const currentScale = camera.getViewport().scale
    const targetScale =
      currentScale < 0.5 || currentScale > 1.4 ? 1 : currentScale

    await camera.flyTo(
      rect.x + rect.width / 2,
      rect.y + rect.height / 2,
      targetScale,
      400,
    )

    if (token === teleportToken) {
      board.pulseItem(entry.item.id)
    }
  } catch (error) {
    console.error('[card-canvas] Unable to teleport to card', error)
    toast.push('无法飞往目标卡片。', { tone: 'error' })
  } finally {
    if (token === teleportToken) {
      pendingTeleport.value = null
      teleportRunning = false
    }
  }
}

function handleSpotlightSelect(target: SpotlightTarget) {
  teleportToken += 1
  pendingTeleport.value = { ...target }
  teleportRunning = false
  board.clearFilterTag()

  if (target.boardId === workspace.activeBoardId) {
    void completePendingTeleport()
    return
  }

  stageReady.value = false
  if (!workspace.switchBoard(target.boardId)) {
    pendingTeleport.value = null
    toast.push('目标白板不存在。', { tone: 'error' })
    return
  }

  // The board watcher loads the target and the new CanvasStage will emit
  // `ready`; completePendingTeleport resumes only after both signals.
}

function handleCardSelect(itemId: string, event?: Event) {
  if (board.selectedItemIds.has(itemId)) return

  if (event instanceof PointerEvent && event.shiftKey) {
    board.selectItems([...board.selectedItemIds, itemId])
    return
  }

  board.selectItem(itemId)
}

function handleCardClick(itemId: string, event: PointerEvent) {
  if (event.shiftKey) return
  if (board.selectedItemIds.size > 1 && board.selectedItemIds.has(itemId)) {
    board.selectItem(itemId)
  }
}

async function handleActionTaskFocus(task: { cardId: string; itemId: string }) {
  const entry =
    board.entries.find((candidate) => candidate.item.id === task.itemId) ??
    board.entries.find((candidate) => candidate.card.id === task.cardId)
  if (!entry) return

  board.selectItem(entry.item.id)
  await nextTick()
  document
    .querySelector<HTMLElement>(
      `[data-world-item][data-item-id="${entry.item.id}"]`,
    )
    ?.focus({ preventScroll: true })

  const camera = stageRef.value?.camera
  if (!camera) return

  const rect = getItemRect(entry.item)
  const currentScale = camera.getViewport().scale
  const targetScale =
    currentScale < 0.5 || currentScale > 1.4 ? 1 : currentScale

  await camera.flyTo(
    rect.x + rect.width / 2,
    rect.y + rect.height / 2,
    targetScale,
    400,
  )
  board.pulseItem(entry.item.id)
}

async function handleCopyCardMarkdown(itemId: string) {
  const entry = board.entries.find((candidate) => candidate.item.id === itemId)
  if (!entry) return

  const markdown = buildMarkdown(
    [{ card: entry.card, item: entry.item }],
    board.connections,
  )
  if (!markdown) return

  const ok = await copyTextToClipboard(markdown)
  if (!ok) {
    toast.push('复制失败，请允许剪贴板权限后重试。', { tone: 'error' })
    return
  }

  toast.push('已复制 1 张卡片大纲到剪贴板。', {
    tone: 'success',
    timeout: 2800,
  })
  copiedCardId.value = entry.card.id
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer)
  copyFeedbackTimer = setTimeout(() => {
    copiedCardId.value = null
    copyFeedbackTimer = null
  }, 1600)
}

function getDragGroup() {
  return board.selectedItems
}

function handleGroupCommit(
  positions: Parameters<typeof board.commitItemPositions>[0],
) {
  void board.commitItemPositions(positions)
}

function openCapture() {
  isActionTrayOpen.value = false
  editingCard.value = null
  isCaptureOpen.value = true
}

function openSpotlight() {
  if (
    !board.isHydrated ||
    isCaptureOpen.value ||
    isShortcutOpen.value ||
    isActionTrayOpen.value
  ) {
    return
  }
  isSpotlightOpen.value = true
}

function openShortcuts() {
  if (
    !board.isHydrated ||
    isCaptureOpen.value ||
    isSpotlightOpen.value ||
    isActionTrayOpen.value
  ) {
    return
  }
  isShortcutOpen.value = true
}

function handleCanvasBackground(payload?: { shiftKey?: boolean }) {
  if (payload?.shiftKey) {
    board.selectItems([...board.selectedItemIds])
  } else {
    board.clearSelection()
  }
  board.clearFilterTag()
  window.getSelection()?.removeAllRanges()
}

function isCardOutsideGalaxy(card: Card) {
  return (
    Boolean(board.activeFilterTag) && !cardHasTag(card, board.activeFilterTag!)
  )
}

function hasTextSelection() {
  const selection = window.getSelection()
  return Boolean(
    selection && !selection.isCollapsed && selection.toString().trim(),
  )
}

function openEdit(card: Card) {
  editingCard.value = card
  isCaptureOpen.value = true
}

async function handleDelete(card: Card) {
  const ok = await board.deleteCard(card.id)
  if (!ok) return

  toast.push(`已删除「${card.title}」。`, {
    tone: 'info',
    timeout: 5000,
    action: { label: '撤销', run: () => board.undo() },
  })
}

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  const editable = target.closest(
    'input, textarea, select, [contenteditable], [role="textbox"]',
  )
  if (!editable) return false
  if (editable instanceof HTMLElement && editable.isContentEditable) return true
  if (editable.getAttribute('role') === 'textbox') return true

  return (
    editable.tagName === 'INPUT' ||
    editable.tagName === 'TEXTAREA' ||
    editable.tagName === 'SELECT'
  )
}

function handleGlobalKeydown(event: KeyboardEvent) {
  if (event.defaultPrevented || event.isComposing) return

  // The modal owns Escape and Tab while it is open.
  if (isShortcutOpen.value) return
  if (isSpotlightOpen.value || isCaptureOpen.value || isActionTrayOpen.value) {
    return
  }
  // Never steal shortcuts from inputs, textareas or future inline editors.
  if (isEditableTarget(event.target)) return
  // The store hydrates by replacing `cards`; capturing mid-hydration could be
  // overwritten, so keep the shortcuts dormant until the board is ready.
  if (!board.isHydrated) return

  const mod = event.metaKey || event.ctrlKey

  if (!mod && !event.altKey && event.key === '?') {
    event.preventDefault()
    openShortcuts()
    return
  }

  if (mod && !event.altKey && !event.shiftKey && event.code === 'KeyF') {
    event.preventDefault()
    openSpotlight()
    return
  }

  if (
    !mod &&
    !event.altKey &&
    !event.shiftKey &&
    event.key === '/' &&
    !hasTextSelection()
  ) {
    event.preventDefault()
    openSpotlight()
    return
  }

  if (mod && !event.altKey && event.code === 'KeyZ') {
    event.preventDefault()
    if (event.shiftKey) void board.redo()
    else void board.undo()
    return
  }

  if (mod && !event.altKey && !event.shiftKey && event.code === 'KeyY') {
    event.preventDefault()
    void board.redo()
    return
  }

  if (mod && !event.altKey && !event.shiftKey && event.code === 'KeyK') {
    event.preventDefault()
    openCapture()
    return
  }

  if (!mod && event.shiftKey && !event.altKey && event.code === 'KeyN') {
    event.preventDefault()
    openCapture()
  }
}

onMounted(() => {
  void (async () => {
    await initializeBoard()
    await auth.initialize()
  })()
  window.addEventListener('keydown', handleGlobalKeydown)

  // Best-effort durable storage: browsers may ignore or deny the request.
  if (navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => {})
  }
})

onBeforeUnmount(() => {
  sync.stop()
  auth.dispose()
  board.stopSync()
  workspace.stopSync()
  window.removeEventListener('keydown', handleGlobalKeydown)
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer)
})
</script>

<template>
  <CanvasStage
    v-if="board.isHydrated"
    :key="workspace.activeBoardId"
    ref="stageRef"
    :board-id="workspace.activeBoardId"
    @background-pointerdown="handleCanvasBackground"
    @ready="handleStageReady"
    @search="openSpotlight"
    @shortcuts="openShortcuts"
  >
    <h1 class="sr-only">Card Canvas 无限白板</h1>
    <p class="sr-only" aria-live="polite">{{ selectionAnnouncement }}</p>

    <CardNode
      v-for="(entry, index) in board.entries"
      :key="entry.item.id"
      :item="entry.item"
      :card="entry.card"
      :selected="board.selectedItemIds.has(entry.item.id)"
      :landing="board.landingItemId === entry.item.id"
      :is-highlighted="board.pulseItemId === entry.item.id"
      :is-dimmed="isCardOutsideGalaxy(entry.card)"
      :active-filter-tag="board.activeFilterTag"
      :index-label="`CARD / ${String(index + 1).padStart(3, '0')}`"
      :copyable="
        board.selectedItemIds.size === 1 &&
        board.selectedItemIds.has(entry.item.id)
      "
      :copied="copiedCardId === entry.card.id"
      :data-canvas-focus="entry.item.id === DEMO_FOCUS_ITEM_ID ? '' : undefined"
      :get-drag-group="getDragGroup"
      @select="handleCardSelect(entry.item.id, $event)"
      @click-card="handleCardClick(entry.item.id, $event)"
      @position-commit="
        board.commitItemPosition(entry.item.id, $event.x, $event.y)
      "
      @position-commit-group="handleGroupCommit($event)"
      @nudge="board.nudgeItem(entry.item.id, $event.x, $event.y)"
      @edit="openEdit(entry.card)"
      @delete="handleDelete(entry.card)"
      @copy-markdown="handleCopyCardMarkdown(entry.item.id)"
      @toggle-task="board.toggleCardTask(entry.card.id, $event)"
      @tag-click="board.toggleFilterTag($event)"
    />

    <template #overlay>
      <Transition name="empty-state">
        <EmptyBoardState
          v-if="board.entries.length === 0"
          @capture="openCapture"
        />
      </Transition>

      <header
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-5 py-5 sm:px-8 sm:py-7"
      >
        <div class="flex items-center gap-3">
          <div
            class="relative flex h-9 w-9 items-center justify-center rounded-[11px] border border-stone-300/70 bg-white/60 text-stone-600 shadow-[0_1px_1px_rgba(41,37,36,0.04)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
          >
            <Layers2 :size="15" :stroke-width="1.5" aria-hidden="true" />
            <span
              class="absolute -right-1 -top-1 h-1.5 w-1.5 rounded-full border border-paper bg-amber-500/80 dark:border-zinc-950"
              aria-hidden="true"
            />
          </div>
          <div class="hidden select-none sm:block">
            <p
              class="font-serif text-[13px] font-medium tracking-[0.01em] text-stone-800 dark:text-zinc-200"
            >
              Card Canvas
            </p>
            <p
              class="brand-subtitle mt-1 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-500 dark:text-zinc-500"
            >
              v1.3.0 · Local-first
            </p>
          </div>

          <span
            class="h-4 w-px bg-stone-300/70 dark:bg-white/10"
            aria-hidden="true"
          />
          <BoardSwitcher />
        </div>

        <div class="pointer-events-auto flex items-center gap-2">
          <div class="hidden items-center gap-1 md:flex">
            <button
              type="button"
              data-canvas-ui
              class="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/80 bg-white/60 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,opacity] duration-300 hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-stone-200/80 disabled:hover:bg-white/60 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:disabled:hover:border-white/10 dark:disabled:hover:bg-zinc-900/60"
              :disabled="!board.canUndo"
              :title="
                board.canUndo
                  ? `撤销：${board.undoLabel}（⌘Z）`
                  : '没有可撤销的操作'
              "
              aria-label="撤销"
              @click="board.undo()"
            >
              <Undo2 :size="14" :stroke-width="1.7" aria-hidden="true" />
            </button>
            <button
              type="button"
              data-canvas-ui
              class="flex h-10 w-10 items-center justify-center rounded-full border border-stone-200/80 bg-white/60 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,opacity] duration-300 hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:border-stone-200/80 disabled:hover:bg-white/60 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:disabled:hover:border-white/10 dark:disabled:hover:bg-zinc-900/60"
              :disabled="!board.canRedo"
              :title="
                board.canRedo
                  ? `重做：${board.redoLabel}（⇧⌘Z）`
                  : '没有可重做的操作'
              "
              aria-label="重做"
              @click="board.redo()"
            >
              <Redo2 :size="14" :stroke-width="1.7" aria-hidden="true" />
            </button>
          </div>

          <button
            type="button"
            data-canvas-ui
            class="group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 pl-3 pr-2.5 text-[10px] font-medium uppercase tracking-[0.16em] text-stone-600 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-500 ease-soft hover:border-stone-300/90 hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-zinc-950"
            aria-label="打开速记"
            title="速记 · ⌘K"
            @click="openCapture()"
          >
            <PenLine :size="14" :stroke-width="1.7" aria-hidden="true" />
            <span class="hidden md:inline">速记</span>
            <kbd
              class="ml-0.5 hidden rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-normal text-stone-500 lg:inline dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
            >
              ⌘K
            </kbd>
          </button>

          <ActionLens
            v-model:open="isActionTrayOpen"
            @focus="handleActionTaskFocus"
            @toggle="board.toggleCardTask($event.cardId, $event.lineIndex)"
          />
          <CloudAccount />
          <DataMenu />

          <button
            type="button"
            data-canvas-ui
            class="group inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 py-1 pl-1 pr-2.5 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-500 ease-soft hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-paper dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:focus-visible:ring-offset-zinc-950"
            :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
            :aria-pressed="isDark"
            :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
            @click="toggleTheme()"
          >
            <span
              class="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-stone-100/80 text-stone-600 transition-colors duration-500 dark:bg-white/[0.06] dark:text-zinc-300"
            >
              <Transition name="theme-icon" mode="out-in">
                <Sun
                  v-if="!isDark"
                  key="sun"
                  :size="15"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
                <Moon
                  v-else
                  key="moon"
                  :size="14"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
              </Transition>
            </span>
            <span
              class="hidden text-[10px] font-medium uppercase tracking-[0.18em] lg:inline"
            >
              {{ isDark ? 'Dark' : 'Light' }}
            </span>
          </button>
        </div>
      </header>

      <footer
        class="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-center justify-between gap-6 px-8 pb-6 font-mono text-[9px] uppercase tracking-[0.16em] text-stone-500 dark:text-zinc-500 lg:flex"
      >
        <div class="flex items-center gap-2.5" aria-live="polite">
          <span class="relative flex h-1.5 w-1.5" aria-hidden="true">
            <span
              class="absolute inset-0 rounded-full bg-emerald-500/30 blur-[3px]"
            />
            <span
              class="relative h-1.5 w-1.5 rounded-full"
              :class="{
                'bg-emerald-500/80': board.status === 'ready',
                'bg-amber-500/80':
                  board.status === 'loading' || board.status === 'idle',
                'bg-rose-500/80': board.status === 'error',
              }"
            />
          </span>
          <span>Local-first · {{ databaseLabel }}</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>v1.3.0</span>
        </div>

        <div class="hidden items-center gap-3 xl:flex">
          <span>{{ workspace.activeBoardName }}</span>
          <span
            class="h-3 w-px bg-stone-300/70 dark:bg-white/10"
            aria-hidden="true"
          />
          <span>Scroll / Space to pan</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>Pinch to zoom</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>Drag card to move</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>⌘F search</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>⌘K to capture</span>
        </div>
      </footer>
    </template>
  </CanvasStage>

  <div
    v-else
    class="canvas-stage flex items-center justify-center overflow-hidden"
    role="status"
    aria-live="polite"
  >
    <h1 class="sr-only">Card Canvas 无限白板</h1>
    <div class="canvas-dots absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-light absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-dark absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-noise absolute inset-0 z-0" aria-hidden="true" />

    <div
      class="relative z-10 flex max-w-sm flex-col items-center px-6 text-center"
    >
      <div
        class="flex h-12 w-12 items-center justify-center rounded-[14px] border border-stone-300/70 bg-white/60 text-stone-600 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-md dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
        :class="{ 'animate-pulse': board.status !== 'error' }"
      >
        <Layers2 :size="19" :stroke-width="1.4" aria-hidden="true" />
      </div>

      <p
        class="mt-5 font-mono text-[9px] uppercase tracking-[0.22em] text-stone-500 dark:text-zinc-500"
      >
        {{ board.status === 'error' ? 'Local board offline' : 'Opening board' }}
      </p>
      <p class="mt-2 font-serif text-xl text-stone-800 dark:text-zinc-200">
        {{
          board.status === 'error'
            ? '本地白板暂时无法打开'
            : '正在准备卡片与空间'
        }}
      </p>
      <p
        v-if="board.status === 'error'"
        class="mt-3 max-w-xs break-words font-mono text-[10px] leading-5 text-stone-500 dark:text-zinc-500"
      >
        {{ board.error }}
      </p>
      <p v-else class="mt-3 text-[12px] text-stone-500 dark:text-zinc-500">
        从本地 IndexedDB 读取上一次的位置。
      </p>

      <button
        v-if="board.status === 'error'"
        type="button"
        class="mt-6 rounded-full border border-stone-300/80 bg-white/70 px-5 py-2 text-[11px] font-medium text-stone-700 shadow-sm backdrop-blur-md transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.08] dark:focus-visible:ring-white/25"
        @click="initializeBoard"
      >
        重试
      </button>
    </div>
  </div>

  <QuickCapture
    v-model:open="isCaptureOpen"
    :card="editingCard"
    :camera="camera"
    :board-id="workspace.activeBoardId"
  />

  <SpotlightSearch
    v-model:open="isSpotlightOpen"
    @select="handleSpotlightSelect"
  />

  <ShortcutModal v-model:open="isShortcutOpen" />

  <ToastStack />
</template>

<style scoped>
@media (max-width: 380px) {
  .brand-subtitle {
    display: none;
  }
}

.theme-icon-enter-active,
.theme-icon-leave-active {
  transition:
    opacity 180ms ease,
    transform 180ms ease;
}

.theme-icon-enter-from {
  opacity: 0;
  transform: rotate(-25deg) scale(0.8);
}

.theme-icon-leave-to {
  opacity: 0;
  transform: rotate(25deg) scale(0.8);
}

.empty-state-enter-active,
.empty-state-leave-active {
  transition:
    opacity 320ms ease,
    transform 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.empty-state-enter-from,
.empty-state-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.985);
}
</style>
