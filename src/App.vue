<script setup lang="ts">
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue'
import {
  CalendarPlus,
  Layers2,
  LockKeyhole,
  Moon,
  PenLine,
  Redo2,
  Sparkles,
  Sun,
  Undo2,
} from '@lucide/vue'
import CanvasStage from './components/canvas/CanvasStage.vue'
import CardNode from './components/canvas/CardNode.vue'
import EmptyBoardState from './components/canvas/EmptyBoardState.vue'
import CloudAccount from './components/auth/CloudAccount.vue'
import BoardSwitcher from './components/board/BoardSwitcher.vue'
import DataMenu from './components/ui/DataMenu.vue'
import MobileUtilityMenu from './components/ui/MobileUtilityMenu.vue'
import ToastStack from './components/ui/ToastStack.vue'
import { useTheme } from './composables/useTheme'
import type { CanvasCamera } from './composables/useCanvas'
import { attachmentMarkdown, collectPendingTasks } from './lib/atomic-markdown'
import {
  MAX_ATTACHMENTS_PER_CARD,
  prepareImageAttachment,
} from './lib/attachments'
import { getItemRect } from './lib/card-metrics'
import { chooseCapturePlacement } from './lib/capture-placement'
import { cardDisplayTitle } from './lib/card-display'
import { cardHasTag } from './lib/galaxy'
import { arrangeCards, arrangeConnectedClusters } from './lib/card-layout'
import type { SpotlightTarget } from './lib/global-search'
import { buildMarkdown, copyTextToClipboard } from './lib/markdownExport'
import { DEMO_FOCUS_ITEM_ID } from './lib/demo-data'
import {
  dailyTodoDeferral,
  formatDailyTodoTitle,
  isDailyTodoCard,
} from './lib/daily-todo'
import {
  buildPastedCardDraft,
  MAX_PASTED_TEXT_LENGTH,
  normalizeClipboardText,
  plainTextFromClipboardHtml,
} from './lib/paste-to-card'
import { useAuthStore } from './stores/auth'
import { useAIStore } from './stores/ai'
import { useAttachmentStore } from './stores/attachments'
import { useBoardStore } from './stores/board'
import { useSyncStore } from './stores/sync'
import { useToastStore } from './stores/toast'
import { useWorkspaceStore } from './stores/workspace'
import type { Card, CardAttachment } from './types'

const ActionLens = defineAsyncComponent(
  () => import('./components/canvas/ActionLens.vue'),
)
const BoardPlacementPicker = defineAsyncComponent(
  () => import('./components/canvas/BoardPlacementPicker.vue'),
)
const CardHistoryModal = defineAsyncComponent(
  () => import('./components/canvas/CardHistoryModal.vue'),
)
const DeleteCardDialog = defineAsyncComponent(
  () => import('./components/canvas/DeleteCardDialog.vue'),
)
const ShortcutModal = defineAsyncComponent(
  () => import('./components/canvas/ShortcutModal.vue'),
)
const SpotlightSearch = defineAsyncComponent(
  () => import('./components/canvas/SpotlightSearch.vue'),
)
const TrashModal = defineAsyncComponent(
  () => import('./components/canvas/TrashModal.vue'),
)
const ConnectionRadar = defineAsyncComponent(
  () => import('./components/ai/ConnectionRadar.vue'),
)
const ShareStudio = defineAsyncComponent(
  () => import('./components/share/ShareStudio.vue'),
)
const QuickCapture = defineAsyncComponent(
  () => import('./components/capture/QuickCapture.vue'),
)
const AISettingsModal = defineAsyncComponent(
  () => import('./components/ui/AISettingsModal.vue'),
)

const { isDark, toggleTheme } = useTheme()
const workspace = useWorkspaceStore()
const board = useBoardStore()
const attachments = useAttachmentStore()
const toast = useToastStore()
const auth = useAuthStore()
const sync = useSyncStore()
const ai = useAIStore()

const stageRef = ref<InstanceType<typeof CanvasStage> | null>(null)
const isCaptureOpen = ref(false)
const isSpotlightOpen = ref(false)
const isShortcutOpen = ref(false)
const isActionTrayOpen = ref(false)
const isAISettingsOpen = ref(false)
const isConnectionRadarOpen = ref(false)
const isShareStudioOpen = ref(false)
const isBoardPickerOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const isTrashOpen = ref(false)
const isCardHistoryOpen = ref(false)
const radarCard = ref<Card | null>(null)
const shareCard = ref<Card | null>(null)
const boardPickerCard = ref<Card | null>(null)
const deleteDialogCard = ref<Card | null>(null)
const historyCard = ref<Card | null>(null)
const captureTemplate = ref<'daily-todo' | null>(null)
const editingCard = ref<Card | null>(null)
const stageReady = ref(false)
const pendingTeleport = ref<SpotlightTarget | null>(null)
const copiedCardId = ref<string | null>(null)
const deleteBusy = ref(false)
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
  return card ? `已选中：${cardDisplayTitle(card)}` : '已选中卡片'
})

const pendingActionCount = computed(
  () =>
    collectPendingTasks(
      board.entries.map((entry) => ({
        cardId: entry.card.id,
        itemId: entry.item.id,
        title: cardDisplayTitle(entry.card),
        content: entry.card.content,
        x: entry.item.x,
        y: entry.item.y,
      })),
    ).length,
)

const carryoverTaskCount = computed(() => {
  const todayTitle = formatDailyTodoTitle()
  const carryoverSources = board.entries
    .filter((entry) => {
      const deferral = dailyTodoDeferral(entry.card)
      return (
        entry.card.title < todayTitle && deferral?.targetTitle === todayTitle
      )
    })
    .map((entry) => ({
      cardId: entry.card.id,
      itemId: entry.item.id,
      title: cardDisplayTitle(entry.card),
      content: entry.card.content,
      x: entry.item.x,
      y: entry.item.y,
    }))
  return collectPendingTasks(carryoverSources).length
})

const databaseLabel = computed(() => {
  if (board.status === 'ready') return 'Dexie ready'
  if (board.status === 'error') return 'Dexie unavailable'
  return 'Opening Dexie…'
})

async function initializeBoard() {
  try {
    await workspace.loadBoards()
    await attachments.initialize()
    await board.initialize(workspace.activeBoardId)
    board.startSync()
    attachments.startSync()
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
    isConnectionRadarOpen.value = false
    isShareStudioOpen.value = false
    isBoardPickerOpen.value = false
    isDeleteDialogOpen.value = false
    isTrashOpen.value = false
    isCardHistoryOpen.value = false
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
  if (!(event instanceof PointerEvent && event.shiftKey)) {
    board.clearFilterTag()
  }
  const isTextSelection =
    event instanceof PointerEvent &&
    event.target instanceof Element &&
    Boolean(event.target.closest('[data-card-selectable]'))
  if (
    isTextSelection &&
    !event.shiftKey &&
    board.selectedItemIds.size > 1 &&
    board.selectedItemIds.has(itemId)
  ) {
    board.selectItem(itemId)
    return
  }
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

function handlePositionCommit(
  itemId: string,
  position: { x: number; y: number },
) {
  return board.commitItemPosition(itemId, position.x, position.y)
}

function handleGroupCommit(
  positions: Parameters<typeof board.commitItemPositions>[0],
) {
  return board.commitItemPositions(positions)
}

async function handleArrangeCards(
  mode: 'reading' | 'selected' | 'clusters' = 'reading',
) {
  const sourceItems = mode === 'selected' ? board.selectedItems : board.items
  if (sourceItems.length < 2) {
    toast.push('当前白板至少需要两张卡片才能整理。', {
      tone: 'info',
      timeout: 2400,
    })
    return
  }

  const layoutCards = sourceItems.map((item) => {
    const rect = getItemRect(item)
    return {
      id: item.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    }
  })
  let layout
  if (mode === 'clusters') {
    layout = arrangeConnectedClusters(layoutCards, board.connections)
  } else if (mode === 'selected') {
    const selectedIds = new Set(sourceItems.map((item) => item.id))
    const unselected = board.items.filter((item) => !selectedIds.has(item.id))
    const anchor = unselected.length
      ? {
          x:
            Math.max(
              ...unselected.map(
                (item) => getItemRect(item).x + getItemRect(item).width,
              ),
            ) + 120,
          y: Math.min(...unselected.map((item) => getItemRect(item).y)),
        }
      : undefined
    layout = arrangeCards(layoutCards, { anchor })
  } else {
    layout = arrangeCards(layoutCards)
  }
  const historyLabel =
    mode === 'selected'
      ? '整理选中卡片'
      : mode === 'clusters'
        ? '按关联整理'
        : '整理当前白板'
  const changed = layout.some((position) => {
    const item = board.items.find((entry) => entry.id === position.itemId)
    return item?.x !== position.x || item?.y !== position.y
  })

  if (!changed) {
    toast.push('当前白板已经排列整齐。', {
      tone: 'info',
      timeout: 2400,
    })
    return
  }

  const saved = await board.commitItemPositions(layout, historyLabel)
  if (!saved) return

  board.clearSelection()
  board.clearFilterTag()
  window.getSelection()?.removeAllRanges()
  await nextTick()

  const compact = window.innerWidth < 640
  stageRef.value?.fitToContent({
    maxScale: 1,
    animate: true,
    duration: 480,
    insets: {
      top: 88,
      bottom: compact ? 104 : 96,
      left: compact ? 24 : 64,
      right: compact ? 24 : 64,
    },
  })
  toast.push(`已整理 ${layout.length} 张卡片。`, {
    tone: 'success',
    timeout: 4000,
    action: { label: '撤销', run: () => board.undo() },
  })
}

function openCapture() {
  isActionTrayOpen.value = false
  isConnectionRadarOpen.value = false
  isShareStudioOpen.value = false
  captureTemplate.value = null
  editingCard.value = null
  isCaptureOpen.value = true
}

function buildCanvasPlacement(height = 300) {
  const width = 420
  const activeCamera = camera.value
  const rect = activeCamera?.getContainerRect() ?? null

  if (!activeCamera || !rect) {
    const existing = board.items.map((item) => getItemRect(item))
    return {
      x: existing.length
        ? Math.max(...existing.map((item) => item.x + item.width)) + 120
        : 0,
      y: existing.length ? Math.min(...existing.map((item) => item.y)) : -150,
      width,
    }
  }

  const topLeft = activeCamera.screenToWorld(
    { x: rect.left, y: rect.top },
    rect,
  )
  const bottomRight = activeCamera.screenToWorld(
    { x: rect.left + rect.width, y: rect.top + rect.height },
    rect,
  )
  const center = activeCamera.screenToWorld(
    {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    },
    rect,
  )
  const placement = chooseCapturePlacement({
    viewport: {
      left: topLeft.x,
      top: topLeft.y + 88,
      right: bottomRight.x,
      bottom: bottomRight.y - 96,
    },
    center,
    width,
    height,
    selected:
      board.selectedItemId && board.selectedItem
        ? getItemRect(board.selectedItem)
        : null,
    existing: board.items.map((item) => getItemRect(item)),
  })
  return { ...placement, width }
}

async function handleDeferDailyTask(task: {
  cardId: string
  lineIndex: number
  targetTitle: string
  text: string
}) {
  const result = await board.deferDailyTask({
    sourceCardId: task.cardId,
    sourceLineIndex: task.lineIndex,
    targetTitle: task.targetTitle,
    targetBoardId: workspace.activeBoardId,
    position: buildCanvasPlacement(),
  })
  if (!result) {
    toast.push('任务顺延失败，原任务未改动。', { tone: 'error' })
    return
  }

  toast.push(
    result.duplicate
      ? `${task.targetTitle} 已有这项任务，已移除重复项。`
      : `已将「${task.text || '未命名待办'}」移至 ${task.targetTitle}。`,
    {
      tone: 'success',
      timeout: 5000,
      action: { label: '撤销', run: () => board.undo() },
    },
  )
}

function hasBlockingOverlay() {
  return (
    isShortcutOpen.value ||
    isSpotlightOpen.value ||
    isCaptureOpen.value ||
    isActionTrayOpen.value ||
    isAISettingsOpen.value ||
    isConnectionRadarOpen.value ||
    isShareStudioOpen.value ||
    isBoardPickerOpen.value ||
    isDeleteDialogOpen.value ||
    isTrashOpen.value ||
    isCardHistoryOpen.value ||
    Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
  )
}

function canHandleCanvasPaste(event: ClipboardEvent) {
  if (event.defaultPrevented || sync.phase === 'locked' || !board.isHydrated) {
    return false
  }
  if (hasBlockingOverlay()) return false
  if (isEditableTarget(event.target) || hasTextSelection()) return false

  const active = document.activeElement
  return !(
    active instanceof Element &&
    active.closest(
      'button, a[href], input, textarea, select, [contenteditable], [role="textbox"]',
    )
  )
}

function clipboardText(data: DataTransfer) {
  const plain = normalizeClipboardText(data.getData('text/plain'))
  if (plain) return plain
  return plainTextFromClipboardHtml(data.getData('text/html'))
}

function clipboardImageFiles(data: DataTransfer) {
  const files = [...data.items]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))

  return files.length
    ? files
    : [...data.files].filter((file) => file.type.startsWith('image/'))
}

async function preparePastedImages(files: File[]) {
  const accepted = files.slice(0, MAX_ATTACHMENTS_PER_CARD)
  const attachments: CardAttachment[] = []
  let firstError: string | null =
    accepted.length < files.length
      ? `每张卡片最多保留 ${MAX_ATTACHMENTS_PER_CARD} 张图片`
      : null

  for (const file of accepted) {
    try {
      const safeFile = file.name
        ? file
        : new File([file], '粘贴的图片.png', { type: file.type })
      const prepared = await prepareImageAttachment(safeFile)
      const now = Date.now()
      attachments.push({
        id: `attachment-${crypto.randomUUID()}`,
        cardId: '',
        ...prepared,
        createdAt: now,
        updatedAt: now,
      })
    } catch (cause) {
      firstError ??=
        cause instanceof Error ? cause.message : '图片处理失败，请重试。'
    }
  }

  return { attachments, firstError }
}

function estimatePastedCardHeight(
  content: string,
  pastedAttachments: CardAttachment[],
) {
  const contentLines = content
    .trim()
    .split('\n')
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / 23)),
      0,
    )
  const attachmentHeight = pastedAttachments.reduce(
    (total, attachment) =>
      total +
      Math.min(
        320,
        352 * (attachment.height / Math.max(1, attachment.width)) + 18,
      ),
    0,
  )
  return Math.min(
    820,
    Math.max(300, 250 + contentLines * 29 + attachmentHeight),
  )
}

async function capturePastedClipboard(rawText: string, imageFiles: File[]) {
  if (rawText.length > MAX_PASTED_TEXT_LENGTH) {
    toast.push('粘贴内容超过 5 万字，请分几次粘贴。', {
      tone: 'error',
      timeout: 5000,
    })
    return
  }

  const { attachments: pastedAttachments, firstError } =
    await preparePastedImages(imageFiles)
  const textDraft = buildPastedCardDraft(rawText)
  if (!textDraft && !pastedAttachments.length) {
    toast.push(firstError ?? '这次没有可粘贴的文字或图片。', {
      tone: 'error',
      timeout: 5000,
    })
    return
  }

  const imageContent = pastedAttachments
    .map((attachment) => attachmentMarkdown(attachment.id, attachment.fileName))
    .join('\n')
  const content = [textDraft?.content, imageContent]
    .filter((part): part is string => Boolean(part))
    .join('\n\n')
  const draft = {
    title: '',
    content,
    tags: textDraft?.tags ?? [],
  }

  try {
    const result = await board.captureAndPlace(
      draft,
      workspace.activeBoardId,
      buildCanvasPlacement(
        estimatePastedCardHeight(content, pastedAttachments),
      ),
      pastedAttachments,
    )
    attachments.rememberForCard(result.card.id, result.attachments)
    toast.push(textDraft ? '已粘贴为卡片。' : '图片已粘贴为卡片。', {
      tone: 'success',
      timeout: 5000,
      action: { label: '撤销', run: () => board.undo() },
    })
  } catch (cause) {
    console.error('[card-canvas] Unable to paste into a card', cause)
    toast.push('粘贴为卡片失败，内容未改动。', { tone: 'error' })
    return
  }

  if (firstError) {
    toast.push(firstError, { tone: 'error', timeout: 5000 })
  }
}

function handleCanvasPaste(event: ClipboardEvent) {
  if (!canHandleCanvasPaste(event)) return
  const data = event.clipboardData
  if (!data) return

  const text = clipboardText(data)
  const images = clipboardImageFiles(data)
  if (!text && !images.length) return

  event.preventDefault()
  void capturePastedClipboard(text, images)
}

function openTodayTodo() {
  if (!board.isHydrated) return

  const title = formatDailyTodoTitle()
  const existing = board.entries.find((entry) =>
    isDailyTodoCard(entry.card, title),
  )
  if (existing) {
    isActionTrayOpen.value = false
    board.clearFilterTag()
    void handleActionTaskFocus({
      cardId: existing.card.id,
      itemId: existing.item.id,
    })
    toast.push('今天的待办卡已经在白板上，已带你回到这张卡。', {
      tone: 'info',
      timeout: 2600,
    })
    return
  }

  openCapture()
  captureTemplate.value = 'daily-todo'
}

function openSpotlight() {
  if (
    !board.isHydrated ||
    isCaptureOpen.value ||
    isShortcutOpen.value ||
    isActionTrayOpen.value ||
    isConnectionRadarOpen.value ||
    isShareStudioOpen.value
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
    isActionTrayOpen.value ||
    isConnectionRadarOpen.value ||
    isShareStudioOpen.value
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
  isConnectionRadarOpen.value = false
  isShareStudioOpen.value = false
  captureTemplate.value = null
  editingCard.value = card
  isCaptureOpen.value = true
}

function openShareStudio(card: Card) {
  shareCard.value = card
  radarCard.value = null
  isConnectionRadarOpen.value = false
  isActionTrayOpen.value = false
  isCaptureOpen.value = false
  editingCard.value = null
  isShareStudioOpen.value = true
}

function openBoardPicker(card: Card) {
  boardPickerCard.value = card
  isBoardPickerOpen.value = true
}

function openConnectionRadar(card: Card) {
  radarCard.value = card
  shareCard.value = null
  isShareStudioOpen.value = false
  isActionTrayOpen.value = false
  isCaptureOpen.value = false
  editingCard.value = null
  isConnectionRadarOpen.value = true
}

async function openAISettingsFromRadar() {
  isConnectionRadarOpen.value = false
  await nextTick()
  isAISettingsOpen.value = true
}

async function openAISettingsFromSpotlight() {
  isSpotlightOpen.value = false
  await nextTick()
  isAISettingsOpen.value = true
}

async function handleDelete(card: Card) {
  deleteDialogCard.value = card
  isDeleteDialogOpen.value = true
}

async function placeCardOnBoard(payload: {
  boardId: string
  boardName: string
}) {
  const card = boardPickerCard.value
  if (!card) return
  const sourceItem = board.entries.find((entry) => entry.card.id === card.id)
  const item = await board.addCardToBoard(
    card.id,
    payload.boardId,
    sourceItem?.item.width,
  )
  isBoardPickerOpen.value = false
  if (!item) return

  toast.push(`已加入「${payload.boardName}」。`, {
    tone: 'success',
    timeout: 4200,
    action: {
      label: '前往',
      run: () => {
        workspace.switchBoard(payload.boardId)
      },
    },
  })
}

async function removeCardFromBoard() {
  const card = deleteDialogCard.value
  if (!card || deleteBusy.value) return
  deleteBusy.value = true
  try {
    const removed = await board.removeCardFromBoard(
      card.id,
      workspace.activeBoardId,
    )
    if (!removed) return
    isDeleteDialogOpen.value = false
    toast.push(`已将「${cardDisplayTitle(card)}」移出当前白板。`, {
      tone: 'info',
      timeout: 5000,
      action: { label: '撤销', run: () => board.undo() },
    })
  } finally {
    deleteBusy.value = false
  }
}

async function deleteWholeCard() {
  const card = deleteDialogCard.value
  if (!card || deleteBusy.value) return
  deleteBusy.value = true
  try {
    const deleted = await board.deleteCard(card.id)
    if (!deleted) return
    isDeleteDialogOpen.value = false
    toast.push(`已将「${cardDisplayTitle(card)}」移入回收站。`, {
      tone: 'info',
      timeout: 5000,
      action: { label: '撤销', run: () => board.undo() },
    })
  } finally {
    deleteBusy.value = false
  }
}

function openCardHistory(card: Card | null) {
  if (!card) return
  isCaptureOpen.value = false
  editingCard.value = null
  historyCard.value = card
  isCardHistoryOpen.value = true
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
  if (sync.phase === 'locked') return
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return

  // The modal owns Escape and Tab while it is open.
  if (isShortcutOpen.value) return
  if (
    isSpotlightOpen.value ||
    isCaptureOpen.value ||
    isActionTrayOpen.value ||
    isConnectionRadarOpen.value ||
    isShareStudioOpen.value ||
    isBoardPickerOpen.value ||
    isDeleteDialogOpen.value ||
    isTrashOpen.value ||
    isCardHistoryOpen.value
  ) {
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
  window.addEventListener('paste', handleCanvasPaste)

  // Best-effort durable storage: browsers may ignore or deny the request.
  if (navigator.storage?.persist) {
    void navigator.storage.persist().catch(() => {})
  }
})

onBeforeUnmount(() => {
  sync.stop()
  auth.dispose()
  board.stopSync()
  attachments.stopSync()
  workspace.stopSync()
  window.removeEventListener('keydown', handleGlobalKeydown)
  window.removeEventListener('paste', handleCanvasPaste)
  if (copyFeedbackTimer) clearTimeout(copyFeedbackTimer)
})
</script>

<template>
  <CanvasStage
    v-if="board.isHydrated"
    :key="workspace.activeBoardId"
    :inert="sync.phase === 'locked'"
    ref="stageRef"
    :board-id="workspace.activeBoardId"
    @background-pointerdown="handleCanvasBackground"
    @ready="handleStageReady"
    @arrange="handleArrangeCards"
    @search="openSpotlight"
    @shortcuts="openShortcuts"
  >
    <h1 class="sr-only">Card Canvas 无限白板</h1>
    <p class="sr-only" aria-live="polite">{{ selectionAnnouncement }}</p>

    <CardNode
      v-for="entry in board.entries"
      :key="entry.item.id"
      :item="entry.item"
      :card="entry.card"
      :attachments="attachments.forCard(entry.card.id)"
      :selected="board.selectedItemIds.has(entry.item.id)"
      :landing="board.landingItemId === entry.item.id"
      :is-highlighted="board.pulseItemId === entry.item.id"
      :is-dimmed="isCardOutsideGalaxy(entry.card)"
      :active-filter-tag="board.activeFilterTag"
      :copyable="
        board.selectedItemIds.size === 1 &&
        board.selectedItemIds.has(entry.item.id)
      "
      :copied="copiedCardId === entry.card.id"
      :data-canvas-focus="entry.item.id === DEMO_FOCUS_ITEM_ID ? '' : undefined"
      :get-drag-group="getDragGroup"
      @select="handleCardSelect(entry.item.id, $event)"
      @click-card="handleCardClick(entry.item.id, $event)"
      @position-commit="handlePositionCommit(entry.item.id, $event)"
      @position-commit-group="handleGroupCommit($event)"
      @nudge="board.nudgeItem(entry.item.id, $event.x, $event.y)"
      @edit="openEdit(entry.card)"
      @delete="handleDelete(entry.card)"
      @copy-markdown="handleCopyCardMarkdown(entry.item.id)"
      @share="openShareStudio(entry.card)"
      @add-to-board="openBoardPicker(entry.card)"
      @find-connections="openConnectionRadar(entry.card)"
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
        class="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-4 px-3 py-5 max-[380px]:gap-1 max-[380px]:px-2 sm:px-8 sm:py-7"
      >
        <div class="flex items-center gap-3">
          <div
            class="relative hidden h-9 w-9 items-center justify-center rounded-[11px] border border-stone-300/70 bg-white/60 text-stone-600 shadow-[0_1px_1px_rgba(41,37,36,0.04)] backdrop-blur-md sm:flex dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300"
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
              v1.13.0 · Local-first
            </p>
          </div>

          <span
            class="hidden h-4 w-px bg-stone-300/70 sm:block dark:bg-white/10"
            aria-hidden="true"
          />
          <BoardSwitcher />
        </div>

        <div class="pointer-events-auto flex items-center gap-0.5 sm:gap-2">
          <div
            class="hidden h-10 items-center rounded-full border border-stone-200/80 bg-white/60 p-1 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl xl:flex dark:border-white/10 dark:bg-zinc-900/60"
            data-canvas-ui
          >
            <button
              type="button"
              data-canvas-ui
              class="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-stone-600 transition-[background-color,color,opacity] duration-200 hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-stone-600 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:disabled:hover:bg-transparent dark:disabled:hover:text-zinc-400"
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
              <span>撤销</span>
            </button>
            <span
              class="h-4 w-px bg-stone-200/90 dark:bg-white/10"
              aria-hidden="true"
            />
            <button
              type="button"
              data-canvas-ui
              class="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[10px] font-medium text-stone-600 transition-[background-color,color,opacity] duration-200 hover:bg-white hover:text-stone-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent disabled:hover:text-stone-600 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-100 dark:focus-visible:ring-white/30 dark:disabled:hover:bg-transparent dark:disabled:hover:text-zinc-400"
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
              <span>重做</span>
            </button>
          </div>

          <div
            class="topbar-action-cluster flex items-center rounded-full border border-stone-200/80 bg-white/80 p-1 shadow-[0_1px_2px_rgba(41,37,36,0.04)] dark:border-white/10 dark:bg-zinc-900/80"
            data-topbar-actions
          >
            <button
              type="button"
              data-canvas-ui
              class="topbar-cluster-action group"
              aria-label="打开速记"
              title="速记 · ⌘K"
              @click="openCapture()"
            >
              <PenLine :size="14" :stroke-width="1.7" aria-hidden="true" />
              <span class="hidden lg:inline">速记</span>
              <kbd
                class="ml-0.5 hidden rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 font-mono text-[9px] font-normal tracking-normal text-stone-500 lg:inline dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                ⌘K
              </kbd>
            </button>

            <button
              type="button"
              data-canvas-ui
              data-daily-todo
              class="topbar-cluster-action group"
              :aria-label="
                carryoverTaskCount
                  ? `创建今日待办卡片，${carryoverTaskCount} 个历史待办待延续`
                  : '创建今日待办卡片'
              "
              title="今日待办"
              @click="openTodayTodo"
            >
              <span class="relative flex items-center justify-center">
                <CalendarPlus
                  :size="14"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
                <span
                  v-if="carryoverTaskCount"
                  class="absolute -right-2 -top-2 flex min-w-[0.95rem] items-center justify-center rounded-full border border-white bg-amber-600 px-0.5 font-mono text-[7px] leading-[0.85rem] text-white shadow-sm dark:border-zinc-900 dark:bg-sky-300 dark:text-zinc-900"
                  aria-hidden="true"
                >
                  {{ carryoverTaskCount > 9 ? '9+' : carryoverTaskCount }}
                </span>
              </span>
              <span class="hidden lg:inline">今日</span>
            </button>

            <span class="topbar-cluster-divider" aria-hidden="true" />

            <ActionLens
              v-model:open="isActionTrayOpen"
              trigger-class="max-[380px]:hidden"
              @focus="handleActionTaskFocus"
              @toggle="board.toggleCardTask($event.cardId, $event.lineIndex)"
              @defer="handleDeferDailyTask"
            />
            <span class="hidden sm:contents">
              <button
                type="button"
                data-canvas-ui
                data-ai-entry
                class="topbar-cluster-action relative"
                :aria-label="
                  ai.hasKey ? 'AI 认知辅助，已配置' : 'AI 认知辅助，尚未配置'
                "
                aria-haspopup="dialog"
                :title="
                  ai.hasKey
                    ? 'AI 认知辅助 · 已配置'
                    : 'AI 认知辅助 · 配置 DeepSeek Key'
                "
                @click="isAISettingsOpen = true"
              >
                <span
                  class="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-amber-700 dark:text-amber-200"
                >
                  <Sparkles :size="14" :stroke-width="1.7" aria-hidden="true" />
                  <span
                    v-if="ai.hasKey"
                    class="absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full border border-white bg-emerald-500 dark:border-zinc-900"
                    aria-hidden="true"
                  />
                </span>
              </button>
            </span>

            <span class="topbar-cluster-divider" aria-hidden="true" />

            <CloudAccount />
            <DataMenu @open-trash="isTrashOpen = true" />

            <span class="hidden sm:contents">
              <button
                type="button"
                data-canvas-ui
                class="topbar-cluster-action group"
                :aria-label="isDark ? '切换到浅色主题' : '切换到深色主题'"
                :aria-pressed="isDark"
                :title="isDark ? '切换到浅色主题' : '切换到深色主题'"
                @click="toggleTheme()"
              >
                <span
                  class="relative flex h-8 w-8 items-center justify-center overflow-hidden rounded-full text-stone-600 dark:text-zinc-300"
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
              </button>
            </span>

            <MobileUtilityMenu
              class="sm:hidden"
              :is-dark="isDark"
              :ai-configured="ai.hasKey"
              :pending-action-count="pendingActionCount"
              @open-ai="isAISettingsOpen = true"
              @open-actions="isActionTrayOpen = true"
              @toggle-theme="toggleTheme()"
            />
          </div>
        </div>
      </header>

      <footer
        class="pointer-events-none absolute inset-x-0 bottom-0 z-20 hidden items-center justify-between gap-6 px-8 pb-6 font-mono text-[10px] uppercase tracking-[0.13em] text-stone-500 dark:text-zinc-500 lg:flex"
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
          <span>v1.13.0</span>
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
          <span>⌘F atlas</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>⌘K to capture</span>
          <span class="text-stone-300 dark:text-zinc-700">·</span>
          <span>⌘V paste card</span>
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
    :template="captureTemplate"
    @open-history="openCardHistory(editingCard)"
  />

  <SpotlightSearch
    v-model:open="isSpotlightOpen"
    @select="handleSpotlightSelect"
    @open-ai-settings="openAISettingsFromSpotlight"
  />

  <ShortcutModal v-model:open="isShortcutOpen" />

  <AISettingsModal v-model:open="isAISettingsOpen" />
  <ConnectionRadar
    v-model:open="isConnectionRadarOpen"
    :card="radarCard"
    @open-settings="openAISettingsFromRadar"
  />
  <ShareStudio v-model:open="isShareStudioOpen" :card="shareCard" />
  <BoardPlacementPicker
    v-model:open="isBoardPickerOpen"
    :card="boardPickerCard"
    @select="placeCardOnBoard"
  />
  <DeleteCardDialog
    v-model:open="isDeleteDialogOpen"
    :card="deleteDialogCard"
    :busy="deleteBusy"
    @remove="removeCardFromBoard"
    @delete="deleteWholeCard"
  />
  <TrashModal v-model:open="isTrashOpen" />
  <CardHistoryModal v-model:open="isCardHistoryOpen" :card="historyCard" />

  <Transition name="account-lock">
    <div
      v-if="sync.phase === 'locked'"
      class="fixed inset-0 z-[95] flex items-center justify-center bg-stone-950/45 px-4 backdrop-blur-md dark:bg-black/65"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="account-lock-title"
    >
      <section
        class="w-full max-w-md rounded-[26px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] p-6 shadow-[0_40px_120px_-32px_rgba(41,37,36,0.55)] dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_50px_140px_-36px_rgba(0,0,0,0.95)]"
      >
        <span
          class="flex h-10 w-10 items-center justify-center rounded-[13px] border border-amber-700/15 bg-amber-500/[0.08] text-amber-700 dark:border-amber-200/15 dark:bg-amber-200/[0.06] dark:text-amber-200"
        >
          <LockKeyhole :size="17" :stroke-width="1.6" aria-hidden="true" />
        </span>
        <h2
          id="account-lock-title"
          class="mt-4 font-serif text-[21px] tracking-[-0.025em] text-stone-800 dark:text-zinc-100"
        >
          本机数据属于另一个云端账号
        </h2>
        <p class="mt-2 text-[12px] leading-6 text-stone-500 dark:text-zinc-400">
          为避免不同账号的数据混用，当前账号已暂停对本机白板的编辑和同步。请退出当前账号，再使用原账号登录。
        </p>
        <button
          type="button"
          class="mt-5 flex h-11 w-full items-center justify-center rounded-full bg-stone-900 text-[11px] font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-wait disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          :disabled="auth.loading"
          @click="auth.signOut()"
        >
          {{ auth.loading ? '正在退出…' : '退出当前账号' }}
        </button>
      </section>
    </div>
  </Transition>

  <ToastStack />
</template>

<style scoped>
.topbar-action-cluster {
  isolation: isolate;
}

.topbar-cluster-action {
  display: inline-flex;
  height: 2rem;
  flex: none;
  align-items: center;
  gap: 0.45rem;
  border: 0;
  border-radius: 9999px;
  background: transparent;
  padding: 0 0.5rem;
  color: rgb(87 83 78);
  font-size: 10px;
  font-weight: 560;
  letter-spacing: 0.02em;
  transition:
    background-color 160ms ease,
    color 160ms ease;
}

.topbar-cluster-action:hover {
  background: rgba(231, 229, 224, 0.72);
  color: rgb(28 25 23);
}

.topbar-cluster-action:focus-visible {
  outline: 2px solid rgba(217, 119, 6, 0.38);
  outline-offset: 1px;
}

.dark .topbar-cluster-action {
  color: rgb(161 161 170);
}

.dark .topbar-cluster-action:hover {
  background: rgba(255, 255, 255, 0.07);
  color: rgb(244 244 245);
}

.dark .topbar-cluster-action:focus-visible {
  outline-color: rgba(253, 230, 138, 0.28);
}

.topbar-cluster-divider {
  width: 1px;
  height: 1rem;
  flex: none;
  margin: 0 0.2rem;
  background: rgba(120, 113, 108, 0.17);
}

.dark .topbar-cluster-divider {
  background: rgba(255, 255, 255, 0.1);
}

.topbar-action-cluster :deep([data-canvas-ui] > button) {
  width: auto !important;
  min-width: 2rem !important;
  height: 2rem !important;
  gap: 0.35rem !important;
  border: 0 !important;
  background: transparent !important;
  padding: 0 0.35rem !important;
  box-shadow: none !important;
  backdrop-filter: none !important;
}

.topbar-action-cluster :deep([data-canvas-ui] > button:hover) {
  background: rgba(231, 229, 224, 0.72) !important;
}

.dark .topbar-action-cluster :deep([data-canvas-ui] > button:hover) {
  background: rgba(255, 255, 255, 0.07) !important;
}

@media (max-width: 639px), (hover: none) {
  .topbar-action-cluster {
    gap: 0;
    padding: 0.125rem;
  }

  .topbar-cluster-action {
    min-width: 2.5rem;
    height: 2.5rem;
    justify-content: center;
    padding: 0 0.4rem;
  }

  .topbar-cluster-divider {
    margin: 0 0.08rem;
  }

  .topbar-action-cluster :deep([data-canvas-ui] > button) {
    min-width: 2.5rem !important;
    height: 2.5rem !important;
  }
}

@media (max-width: 380px) {
  .brand-subtitle {
    display: none;
  }

  .topbar-cluster-action {
    min-width: 2.375rem;
  }

  .topbar-action-cluster :deep([data-canvas-ui] > button) {
    min-width: 2.375rem !important;
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

.account-lock-enter-active,
.account-lock-leave-active {
  transition: opacity 180ms ease;
}

.account-lock-enter-active section,
.account-lock-leave-active section {
  transition: transform 220ms cubic-bezier(0.22, 1, 0.36, 1);
}

.account-lock-enter-from,
.account-lock-leave-to,
.account-lock-enter-from section,
.account-lock-leave-to section {
  opacity: 0;
}

.account-lock-enter-from section {
  transform: translateY(8px) scale(0.98);
}
</style>
