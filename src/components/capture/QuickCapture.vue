<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
  type Component,
} from 'vue'
import {
  CornerDownLeft,
  Hash,
  History,
  List,
  ListOrdered,
  ListTodo,
  LoaderCircle,
  PenLine,
  Sparkles,
  X,
} from '@lucide/vue'
import {
  buildTagPrompt,
  buildTitlePrompt,
  TAGS_SYSTEM_PROMPT,
  TITLE_SYSTEM_PROMPT,
} from '../../lib/ai/prompts'
import {
  attachmentMarkdown,
  referencedAttachmentIds,
  removeAttachmentReference,
  stripAttachmentReferences,
} from '../../lib/atomic-markdown'
import {
  MAX_ATTACHMENTS_PER_CARD,
  prepareImageAttachment,
} from '../../lib/attachments'
import { inferTags, inferTitle } from '../../lib/ai/deepseek'
import {
  mergeTags,
  normalizeTags,
  parseHashtags,
  sameTag,
  splitTagInput,
} from '../../lib/tags'
import { chooseCapturePlacement } from '../../lib/capture-placement'
import { getItemRect } from '../../lib/card-metrics'
import {
  DAILY_TODO_CONTENT,
  DAILY_TODO_TAG,
  formatDailyTodoTitle,
  trimTrailingEmptyDailyTask,
} from '../../lib/daily-todo'
import { continueMarkdownList } from '../../lib/list-continuation'
import type { CanvasCamera } from '../../composables/useCanvas'
import { useAIStore } from '../../stores/ai'
import { useAttachmentStore } from '../../stores/attachments'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'
import type { Card, CardAttachment } from '../../types'

const UNTITLED_CARD_TITLE = '未命名卡片'

const props = defineProps<{
  open: boolean
  card?: Card | null
  camera?: CanvasCamera | null
  boardId?: string
  template?: 'daily-todo' | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'open-history': []
}>()

const board = useBoardStore()
const attachmentStore = useAttachmentStore()
const toast = useToastStore()
const ai = useAIStore()

const title = ref('')
const content = ref('')
const tags = ref<string[]>([])
const tagDraft = ref('')
const isEditing = computed(() => Boolean(props.card))
const titleEl = ref<HTMLInputElement | null>(null)
const contentEl = ref<HTMLTextAreaElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const slashQuery = ref<string | null>(null)
const slashStart = ref(0)
const slashSelected = ref(0)
const suggestingTags = ref(false)
const regeneratingTitle = ref(false)
const pendingAttachments = ref<CardAttachment[]>([])
const processingImages = ref(false)

interface CaptureDraft {
  title: string
  content: string
  tags: string[]
  tagDraft: string
  attachments: CardAttachment[]
}

interface SlashCommand {
  label: string
  hint: string
  prefix: string
  aliases: string[]
  icon: Component
}

const slashCommands: SlashCommand[] = [
  {
    label: '任务清单',
    hint: 'Checkbox',
    prefix: '- [ ] ',
    aliases: ['todo', 'task', 'checkbox'],
    icon: ListTodo,
  },
  {
    label: '有序列表',
    hint: 'Numbered list',
    prefix: '1. ',
    aliases: ['ol', 'ordered', 'number'],
    icon: ListOrdered,
  },
  {
    label: '无序列表',
    hint: 'Bulleted list',
    prefix: '- ',
    aliases: ['ul', 'list', 'bullet'],
    icon: List,
  },
]

const isSlashMenuOpen = computed(() => slashQuery.value !== null)
const filteredSlashCommands = computed(() => {
  const query = slashQuery.value?.trim().toLowerCase() ?? ''
  if (!query) return slashCommands

  return slashCommands.filter(
    (command) =>
      command.label.includes(query) ||
      command.aliases.some((alias) => alias.includes(query)),
  )
})

let restoreFocus: HTMLElement | null = null
let restoreFocusAfterClose = false
let saveAttempt = 0
let suppressModeSync = false
let tagSuggestionController: AbortController | null = null
let titleRegenerationController: AbortController | null = null
let initialAttachments: CardAttachment[] = []
const autoTagControllers = new Set<AbortController>()
const draftsByBoard = new Map<string, CaptureDraft>()

const canSave = computed(
  () => Boolean(title.value.trim()) || Boolean(content.value.trim()),
)

function getSlashContext() {
  const element = contentEl.value
  if (!element) return null

  const cursor = element.selectionStart
  const before = content.value.slice(0, cursor)
  const lineStart = before.lastIndexOf('\n') + 1
  const line = before.slice(lineStart)
  const match = /^(\s*)\/([^\s/]*)$/.exec(line)
  if (!match) return null

  return {
    start: lineStart + match[1].length,
    query: match[2],
  }
}

function updateSlashMenu() {
  const context = getSlashContext()
  if (!context) {
    slashQuery.value = null
    slashSelected.value = 0
    return
  }

  slashQuery.value = context.query
  slashStart.value = context.start
  slashSelected.value = 0
}

function closeSlashMenu() {
  slashQuery.value = null
  slashSelected.value = 0
}

async function applySlashCommand(command: SlashCommand) {
  const element = contentEl.value
  if (!element) return

  const cursor = element.selectionStart
  content.value =
    content.value.slice(0, slashStart.value) +
    command.prefix +
    content.value.slice(cursor)
  closeSlashMenu()

  await nextTick()
  const nextCursor = slashStart.value + command.prefix.length
  element.focus()
  element.setSelectionRange(nextCursor, nextCursor)
}

function handleContentKeydown(event: KeyboardEvent) {
  if (event.isComposing) return

  if (
    !isSlashMenuOpen.value &&
    event.key === 'Enter' &&
    !event.shiftKey &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey
  ) {
    const element = contentEl.value
    if (element) {
      const cursor = element.selectionStart
      if (cursor === element.selectionEnd) {
        const continued = continueMarkdownList(content.value, cursor)
        if (continued) {
          event.preventDefault()
          content.value = continued.content
          void nextTick().then(() => {
            element.focus()
            element.setSelectionRange(continued.cursor, continued.cursor)
          })
          return
        }
      }
    }
  }

  if (!isSlashMenuOpen.value || event.isComposing) return
  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') return

  const commands = filteredSlashCommands.value
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    if (!commands.length) return
    event.preventDefault()
    event.stopPropagation()
    const direction = event.key === 'ArrowDown' ? 1 : -1
    slashSelected.value =
      (slashSelected.value + direction + commands.length) % commands.length
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    closeSlashMenu()
    return
  }

  if ((event.key === 'Enter' || event.key === 'Tab') && commands.length > 0) {
    event.preventDefault()
    event.stopPropagation()
    void applySlashCommand(commands[slashSelected.value] ?? commands[0])
  }
}

function insertAttachmentTokens(tokens: string[], cursor: number) {
  if (!tokens.length) return
  const before = content.value.slice(0, cursor)
  const after = content.value.slice(cursor)
  const leading = before && !before.endsWith('\n') ? '\n' : ''
  const inserted = tokens.join('\n')
  const trailing = after && !after.startsWith('\n') ? '\n' : ''
  content.value = `${before}${leading}${inserted}${trailing}${after}`

  const nextCursor = before.length + leading.length + inserted.length
  void nextTick().then(() => {
    const element = contentEl.value
    if (!element) return
    element.focus()
    element.setSelectionRange(nextCursor, nextCursor)
  })
}

async function handleContentPaste(event: ClipboardEvent) {
  const files = [...(event.clipboardData?.items ?? [])]
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file))
  if (!files.length) return

  event.preventDefault()
  processingImages.value = true
  const cursor = contentEl.value?.selectionStart ?? content.value.length
  const available = Math.max(
    0,
    MAX_ATTACHMENTS_PER_CARD - pendingAttachments.value.length,
  )
  const acceptedFiles = files.slice(0, available)
  const tokens: string[] = []
  let lastError: unknown = null

  try {
    if (acceptedFiles.length < files.length) {
      lastError = new Error(
        `每张卡片最多保留 ${MAX_ATTACHMENTS_PER_CARD} 张图片`,
      )
    }
    for (const file of acceptedFiles) {
      try {
        const prepared = await prepareImageAttachment(file)
        const now = Date.now()
        const attachment: CardAttachment = {
          id: `attachment-${crypto.randomUUID()}`,
          cardId: props.card?.id ?? '',
          ...prepared,
          createdAt: now,
          updatedAt: now,
        }
        pendingAttachments.value = [...pendingAttachments.value, attachment]
        tokens.push(attachmentMarkdown(attachment.id, attachment.fileName))
      } catch (cause) {
        lastError = cause
      }
    }

    insertAttachmentTokens(tokens, cursor)
    if (tokens.length) {
      toast.push(
        tokens.length === 1
          ? '图片已压缩并插入卡片。'
          : `已插入 ${tokens.length} 张图片。`,
        { tone: 'success', timeout: 2200 },
      )
    }
    if (lastError) {
      toast.push(
        lastError instanceof Error ? lastError.message : '图片处理失败。',
        { tone: 'error', timeout: 4200 },
      )
    }
  } finally {
    processingImages.value = false
  }
}

function removeAttachment(attachmentId: string) {
  pendingAttachments.value = pendingAttachments.value.filter(
    (attachment) => attachment.id !== attachmentId,
  )
  content.value = removeAttachmentReference(content.value, attachmentId)
}

function addTag(raw: string) {
  const [tag] = normalizeTags([raw])
  if (!tag) return
  if (tags.value.some((existing) => sameTag(existing, tag))) return

  tags.value = [...tags.value, tag]
}

function addTagsFromDraft() {
  const raw = tagDraft.value
  if (!raw.trim()) return

  splitTagInput(raw).forEach(addTag)
  tagDraft.value = ''
}

function removeTag(tag: string) {
  tags.value = tags.value.filter((entry) => entry !== tag)
}

function existingBoardTags() {
  return board.entries.flatMap((entry) => entry.card.tags)
}

async function generateTagSuggestions() {
  if (
    suggestingTags.value ||
    !ai.hasKey ||
    (!title.value.trim() && !content.value.trim())
  ) {
    return
  }

  tagSuggestionController?.abort()
  const controller = new AbortController()
  tagSuggestionController = controller
  suggestingTags.value = true

  try {
    const suggestions = await inferTags(
      ai.config,
      buildTagPrompt(title.value, content.value, existingBoardTags()),
      TAGS_SYSTEM_PROMPT,
      controller.signal,
    )
    if (controller.signal.aborted) return

    if (!suggestions.length) {
      toast.push('这次没有找到稳定的层级标签。', {
        tone: 'info',
        timeout: 2200,
      })
      return
    }

    suggestions.forEach(addTag)
  } catch (cause) {
    if (controller.signal.aborted) return
    toast.push(
      cause instanceof Error ? cause.message : '标签建议暂时不可用。',
      { tone: 'error', timeout: 4200 },
    )
  } finally {
    if (tagSuggestionController === controller) {
      tagSuggestionController = null
      suggestingTags.value = false
    }
  }
}

async function regenerateTitle() {
  if (regeneratingTitle.value || !ai.hasKey || !canSave.value) return

  const sourceTitle = title.value
  const sourceContent = content.value
  const source = sourceContent.trim() || sourceTitle.trim()
  if (!source) return

  titleRegenerationController?.abort()
  const controller = new AbortController()
  titleRegenerationController = controller
  regeneratingTitle.value = true

  try {
    const generated = await inferTitle(
      ai.config,
      buildTitlePrompt(source),
      TITLE_SYSTEM_PROMPT,
      controller.signal,
    )
    if (
      !generated ||
      controller.signal.aborted ||
      title.value !== sourceTitle ||
      content.value !== sourceContent
    ) {
      return
    }

    title.value = generated
    toast.push('AI 已重新生成标题，可继续修改后再保存。', {
      tone: 'success',
      timeout: 2800,
    })
  } catch (cause) {
    if (controller.signal.aborted) return
    toast.push(
      cause instanceof Error ? cause.message : '标题生成暂时不可用。',
      { tone: 'error', timeout: 4200 },
    )
  } finally {
    if (titleRegenerationController === controller) {
      titleRegenerationController = null
      regeneratingTitle.value = false
    }
  }
}

async function autoTitleCapturedCard(
  card: Card,
  sourceContent: string,
): Promise<Card> {
  if (
    !ai.autoTitleEnabled ||
    !sourceContent ||
    card.title !== UNTITLED_CARD_TITLE
  ) {
    return card
  }

  const controller = new AbortController()
  autoTagControllers.add(controller)

  try {
    const generated = await inferTitle(
      ai.config,
      buildTitlePrompt(sourceContent),
      TITLE_SYSTEM_PROMPT,
      controller.signal,
    )
    if (
      !generated ||
      generated === UNTITLED_CARD_TITLE ||
      controller.signal.aborted
    ) {
      return card
    }

    const current = board.cards.find(
      (entry) => entry.id === card.id && !entry.isDeleted,
    )
    if (
      !current ||
      current.title !== UNTITLED_CARD_TITLE ||
      current.content !== sourceContent
    ) {
      return current ?? card
    }

    return (
      (await board.updateCard(
        current.id,
        {
          title: generated,
          content: current.content,
          tags: current.tags,
        },
        'AI 生成标题',
      )) ?? current
    )
  } catch {
    return card
  } finally {
    autoTagControllers.delete(controller)
  }
}

async function autoTagCapturedCard(card: Card, tagContext: string[]) {
  if (!ai.autoTagsEnabled || card.tags.length) return

  const controller = new AbortController()
  autoTagControllers.add(controller)

  try {
    const suggestions = await inferTags(
      ai.config,
      buildTagPrompt(card.title, card.content, tagContext),
      TAGS_SYSTEM_PROMPT,
      controller.signal,
    )
    if (!suggestions.length || controller.signal.aborted) return

    const current = board.cards.find(
      (entry) => entry.id === card.id && !entry.isDeleted,
    )
    if (!current) return

    const nextTags = mergeTags(current.tags, suggestions)
    if (nextTags.length === current.tags.length) return

    await board.updateCard(
      current.id,
      {
        title: current.title,
        content: current.content,
        tags: nextTags,
      },
      'AI 补充标签',
    )
  } catch {
    // Background enrichment stays silent when offline or rate-limited.
  } finally {
    autoTagControllers.delete(controller)
  }
}

function handleTagKeydown(event: KeyboardEvent) {
  if (event.isComposing) return

  if (event.key === 'Enter' || event.key === ',' || event.key === '，') {
    event.preventDefault()
    addTagsFromDraft()
    return
  }

  if (event.key === 'Backspace' && !tagDraft.value && tags.value.length) {
    event.preventDefault()
    tags.value = tags.value.slice(0, -1)
  }
}

function handleTitleEnter(event: KeyboardEvent) {
  if (event.isComposing) return
  event.preventDefault()
  contentEl.value?.focus()
}

function reset() {
  title.value = ''
  content.value = ''
  tags.value = []
  tagDraft.value = ''
  pendingAttachments.value = []
  closeSlashMenu()
}

async function focusContentAtEnd() {
  await nextTick()
  await new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  )
  await new Promise<void>((resolve) => setTimeout(resolve, 40))
  if (!props.open) return
  const element = contentEl.value
  if (!element) return
  element.focus({ preventScroll: true })
  const end = content.value.length
  element.setSelectionRange(end, end)
}

function hasDraftContent() {
  return Boolean(
    content.value.trim() ||
    tags.value.length ||
    tagDraft.value.trim() ||
    pendingAttachments.value.length,
  )
}

function rememberDraft() {
  const boardId = props.boardId || 'board-main'
  if (!canSave.value && !hasDraftContent()) {
    draftsByBoard.delete(boardId)
    return
  }

  draftsByBoard.set(boardId, {
    title: title.value,
    content: content.value,
    tags: [...tags.value],
    tagDraft: tagDraft.value,
    attachments: pendingAttachments.value.map((attachment) => ({
      ...attachment,
    })),
  })
}

function restoreDraft(boardId: string) {
  const draft = draftsByBoard.get(boardId)
  if (!draft) {
    reset()
    return
  }

  title.value = draft.title
  content.value = draft.content
  tags.value = [...draft.tags]
  tagDraft.value = draft.tagDraft
  pendingAttachments.value = draft.attachments.map((attachment) => ({
    ...attachment,
  }))
  closeSlashMenu()
}

function close(returnFocus = false) {
  if (processingImages.value) {
    toast.push('图片正在处理，请稍候。', { tone: 'info', timeout: 2200 })
    return
  }
  tagSuggestionController?.abort()
  titleRegenerationController?.abort()
  if (!props.card && props.template !== 'daily-todo' && !suppressModeSync) {
    rememberDraft()
  }
  restoreFocusAfterClose = returnFocus
  emit('update:open', false)
}

function handleBackdropClick() {
  if (canSave.value || tags.value.length || tagDraft.value.trim()) {
    if (content.value.trim()) contentEl.value?.focus()
    else titleEl.value?.focus()
    return
  }

  close()
}

/**
 * Immediate-capture flow: find a comfortable empty slot near the viewport
 * center, keeping the new card on screen and away from existing cards when
 * possible. A crowded board falls back to a small cascade at the center.
 */
function estimateCaptureHeight() {
  const titleLines = Math.max(1, Math.ceil(title.value.trim().length / 13))
  const contentLines = content.value
    .trim()
    .split('\n')
    .reduce(
      (total, line) => total + Math.max(1, Math.ceil(line.length / 23)),
      0,
    )
  const attachmentHeight = pendingAttachments.value.reduce(
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
    Math.max(
      280,
      220 +
        titleLines * 37 +
        contentLines * 29 +
        (tags.value.length ? 28 : 0) +
        attachmentHeight,
    ),
  )
}

function buildPlacement() {
  const width = 420
  const reservedHeight = estimateCaptureHeight()
  const rect = props.camera?.getContainerRect() ?? null

  if (!rect) return { x: 0, y: 0, width }

  const camera = props.camera!
  const topLeft = camera.screenToWorld({ x: rect.left, y: rect.top }, rect)
  const bottomRight = camera.screenToWorld(
    { x: rect.left + rect.width, y: rect.top + rect.height },
    rect,
  )
  const center = camera.screenToWorld(
    {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    },
    rect,
  )
  const selected =
    board.selectedItemId && board.selectedItem
      ? getItemRect(board.selectedItem)
      : null
  const placement = chooseCapturePlacement({
    viewport: {
      left: topLeft.x,
      top: topLeft.y + 88,
      right: bottomRight.x,
      bottom: bottomRight.y - 96,
    },
    center,
    width,
    height: reservedHeight,
    selected,
    existing: board.items.map((item) => getItemRect(item)),
  })

  return { ...placement, width }
}

function save() {
  if (!canSave.value) return
  if (processingImages.value) {
    toast.push('图片正在处理，请稍候再保存。', {
      tone: 'info',
      timeout: 2400,
    })
    return
  }

  addTagsFromDraft()

  const rawTitle = title.value.trim()
  const rawContent =
    props.template === 'daily-todo'
      ? trimTrailingEmptyDailyTask(content.value)
      : content.value.trim()
  const referencedIds = referencedAttachmentIds(rawContent)
  const savedAttachments = pendingAttachments.value
    .filter((attachment) => referencedIds.has(attachment.id))
    .map((attachment) => ({ ...attachment }))
  const previousAttachments = initialAttachments.map((attachment) => ({
    ...attachment,
  }))
  const textContent = stripAttachmentReferences(rawContent)
  const firstLine =
    textContent
      .split('\n')
      .map((line) => line.trim())
      .find(Boolean) ?? ''
  const editingCard = props.card
  const resolvedTitle = rawTitle || (editingCard ? '' : UNTITLED_CARD_TITLE)
  const needsAutoTitle = !editingCard && !rawTitle && Boolean(firstLine)

  const uniqueTags = mergeTags(
    tags.value,
    parseHashtags(`${resolvedTitle} ${rawContent}`),
  )

  const draft = {
    title: resolvedTitle,
    content: rawContent,
    tags: uniqueTags,
  }
  const tagContext = existingBoardTags()
  const attempt = ++saveAttempt
  const placement = buildPlacement()

  // Store publishes the card synchronously and persists in the background;
  // the modal closes before IndexedDB resolves. If the write fails, the draft
  // is restored and the modal reopens instead of silently losing the text.
  reset()
  close()

  const restoreAfterFailure = (cause: unknown) => {
    console.error('[card-canvas] Unable to save capture', cause)
    if (attempt !== saveAttempt) return

    if (!props.open) {
      suppressModeSync = true
      title.value = draft.title
      content.value = draft.content
      tags.value = [...draft.tags]
      pendingAttachments.value = savedAttachments.map((attachment) => ({
        ...attachment,
      }))
      emit('update:open', true)
    }

    toast.push(
      editingCard ? '卡片更新失败，草稿已恢复。' : '速记上板失败，草稿已恢复。',
      { tone: 'error' },
    )
  }

  if (editingCard) {
    void (async () => {
      let attachmentsSaved = false
      try {
        await attachmentStore.replaceForCard(editingCard.id, savedAttachments)
        attachmentsSaved = true
        const updated = await board.updateCard(editingCard.id, draft)
        if (!updated) throw new Error('卡片已不存在')
        toast.push('卡片已更新。', { tone: 'success', timeout: 2200 })
      } catch (cause) {
        if (attachmentsSaved) {
          await attachmentStore
            .replaceForCard(editingCard.id, previousAttachments)
            .catch((rollbackCause) => {
              console.error(
                '[card-canvas] Unable to roll back card attachments',
                rollbackCause,
              )
            })
        }
        restoreAfterFailure(cause)
      }
    })()
    return
  }

  void board
    .captureAndPlace(
      draft,
      props.boardId || 'board-main',
      placement,
      savedAttachments,
    )
    .then(async ({ card, attachments: saved }) => {
      attachmentStore.rememberForCard(card.id, saved)
      const enriched =
        needsAutoTitle && ai.autoTitleEnabled
          ? await autoTitleCapturedCard(card, textContent)
          : card
      if (
        !draft.tags.length &&
        (enriched.title !== UNTITLED_CARD_TITLE || textContent)
      ) {
        void autoTagCapturedCard(enriched, tagContext)
      }
    })
    .catch(restoreAfterFailure)
}

function setBackgroundInert(inert: boolean) {
  const app = document.getElementById('app')
  if (!app) return

  if (inert) app.setAttribute('inert', '')
  else app.removeAttribute('inert')
}

function trapTabFocus(event: KeyboardEvent) {
  const panel = panelEl.value
  if (!panel) return

  const focusables = [
    ...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.getClientRects().length > 0)

  if (!focusables.length) return

  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement

  if (event.shiftKey) {
    if (active === first || !panel.contains(active)) {
      event.preventDefault()
      last.focus()
    }
    return
  }

  if (active === last || !panel.contains(active)) {
    event.preventDefault()
    first.focus()
  }
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!props.open) return
  // Let the IME cancel its own composition before Escape closes the modal.
  if (event.isComposing) return

  if (event.key === 'Tab') {
    trapTabFocus(event)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    // The modal owns Escape; stop the app-level handler from also reacting to
    // the same keystroke.
    event.stopImmediatePropagation()
    tagSuggestionController?.abort()
    close(true)
    return
  }

  if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
    event.preventDefault()
    save()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      restoreFocusAfterClose = false
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)

      if (suppressModeSync) {
        suppressModeSync = false
      } else if (props.template === 'daily-todo') {
        title.value = formatDailyTodoTitle()
        content.value = DAILY_TODO_CONTENT
        tags.value = [DAILY_TODO_TAG]
        tagDraft.value = ''
        pendingAttachments.value = []
        initialAttachments = []
        closeSlashMenu()
      } else if (props.card) {
        await attachmentStore.initialize()
        title.value = props.card.title
        content.value = props.card.content
        tags.value = [...props.card.tags]
        tagDraft.value = ''
        const referencedIds = referencedAttachmentIds(props.card.content)
        initialAttachments = attachmentStore
          .forCard(props.card.id)
          .filter((attachment) => referencedIds.has(attachment.id))
          .map((attachment) => ({ ...attachment }))
        pendingAttachments.value = initialAttachments.map((attachment) => ({
          ...attachment,
        }))
      } else {
        initialAttachments = []
        restoreDraft(props.boardId || 'board-main')
      }

      await focusContentAtEnd()
      return
    }

    tagSuggestionController?.abort()
    tagSuggestionController = null
    suggestingTags.value = false
    setBackgroundInert(false)
    if (restoreFocusAfterClose) restoreFocus?.focus()
    restoreFocus = null
    restoreFocusAfterClose = false
  },
)

onMounted(() => window.addEventListener('keydown', handleWindowKeydown))
onBeforeUnmount(() => {
  tagSuggestionController?.abort()
  autoTagControllers.forEach((controller) => controller.abort())
  titleRegenerationController?.abort()
  window.removeEventListener('keydown', handleWindowKeydown)
  setBackgroundInert(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="capture">
      <div
        v-if="open"
        class="capture-backdrop fixed inset-0 z-[80] flex justify-center overflow-y-auto bg-stone-950/20 px-4 backdrop-blur-[3px] dark:bg-black/60"
        data-canvas-ui
        data-quick-capture
        @click.self="handleBackdropClick"
      >
        <section
          ref="panelEl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-capture-heading"
          class="capture-panel relative flex max-h-[calc(100dvh-2rem)] w-full max-w-[760px] flex-col overflow-hidden rounded-[28px] border border-stone-200/80 bg-[#fdfbf7]/[0.97] shadow-[0_40px_120px_-40px_rgba(41,37,36,0.45),0_2px_8px_rgba(41,37,36,0.06)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.94] dark:shadow-[0_50px_140px_-40px_rgba(0,0,0,0.9)]"
          @click.stop
        >
          <div
            class="pointer-events-none absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-white to-transparent dark:via-white/25"
            aria-hidden="true"
          />

          <header
            class="flex flex-none items-center justify-between gap-4 border-b border-stone-200/70 px-6 py-4 sm:px-7 dark:border-white/[0.08]"
          >
            <div class="flex items-center gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[11px] border border-stone-200/80 bg-white/70 text-stone-500 shadow-[0_1px_1px_rgba(41,37,36,0.04)] dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                <PenLine :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="quick-capture-heading"
                  class="font-serif text-[15px] font-medium tracking-[-0.01em] text-stone-800 dark:text-zinc-100"
                >
                  {{ isEditing ? '编辑卡片' : '速记' }}
                </h2>
                <p
                  class="mt-0.5 font-mono text-[9px] uppercase tracking-[0.2em] text-stone-400 dark:text-zinc-500"
                >
                  {{
                    isEditing
                      ? 'Edit · 更新内容与标签'
                      : 'Quick Capture · 保存即上板'
                  }}
                </p>
              </div>
            </div>

            <div class="flex items-center gap-1">
              <button
                v-if="isEditing"
                type="button"
                class="flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[9px] text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200 dark:focus-visible:ring-white/25"
                aria-label="查看历史版本"
                @click="emit('open-history')"
              >
                <History :size="13" :stroke-width="1.7" aria-hidden="true" />
                <span class="hidden sm:inline">历史</span>
              </button>
              <button
                type="button"
                class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200 dark:focus-visible:ring-white/25"
                aria-label="关闭速记"
                @click="close()"
              >
                <X :size="15" :stroke-width="1.6" aria-hidden="true" />
              </button>
            </div>
          </header>

          <div class="min-h-0 flex-1 overflow-y-auto px-6 pb-5 pt-5 sm:px-7">
            <div class="relative">
              <input
                ref="titleEl"
                v-model="title"
                type="text"
                maxlength="160"
                autocomplete="off"
                name="card-canvas-card-title"
                data-form-type="other"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                placeholder="一句话标题，或直接写正文…"
                aria-label="卡片标题"
                class="w-full border-0 bg-transparent p-0 font-serif text-[1.45rem] font-medium leading-snug tracking-[-0.02em] text-stone-900 caret-amber-600 outline-none placeholder:text-stone-400/90 dark:text-zinc-100 dark:caret-amber-400 dark:placeholder:text-zinc-600"
                :class="{ 'pr-28': isEditing && ai.hasKey }"
                @keydown.enter="handleTitleEnter"
              />
              <button
                v-if="isEditing && ai.hasKey"
                type="button"
                class="absolute right-0 top-1/2 inline-flex h-8 -translate-y-1/2 items-center gap-1.5 rounded-full border border-amber-700/15 bg-amber-500/[0.065] px-2.5 text-[9px] text-amber-800 transition-[background-color,border-color,opacity] hover:border-amber-700/25 hover:bg-amber-500/[0.11] disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-200/15 dark:bg-amber-200/[0.045] dark:text-amber-200/90 dark:hover:border-amber-200/25 dark:hover:bg-amber-200/[0.075]"
                :disabled="regeneratingTitle || !canSave"
                :aria-busy="regeneratingTitle"
                aria-label="AI 重新生成标题"
                title="根据当前正文重新生成标题"
                data-ai-title-regenerate
                @click="regenerateTitle"
              >
                <LoaderCircle
                  v-if="regeneratingTitle"
                  :size="12"
                  :stroke-width="1.8"
                  class="animate-spin"
                  aria-hidden="true"
                />
                <Sparkles
                  v-else
                  :size="12"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
                <span class="hidden sm:inline">重新命名</span>
              </button>
            </div>

            <div class="mt-4">
              <textarea
                ref="contentEl"
                v-model="content"
                rows="8"
                autocomplete="off"
                name="card-canvas-card-content"
                data-form-type="other"
                data-1p-ignore
                data-lpignore="true"
                data-bwignore
                placeholder="捕捉一个念头、一段引用或一条未成形的知识…"
                aria-label="卡片正文"
                aria-autocomplete="list"
                :aria-controls="
                  isSlashMenuOpen ? 'quick-capture-slash-menu' : undefined
                "
                :aria-expanded="isSlashMenuOpen"
                class="min-h-[13rem] w-full resize-none border-0 bg-transparent p-0 text-[0.9375rem] leading-[1.85] text-stone-700 caret-amber-600 outline-none placeholder:text-stone-400/90 dark:text-zinc-300 dark:caret-amber-400 dark:placeholder:text-zinc-600"
                @input="updateSlashMenu"
                @keydown="handleContentKeydown"
                @click="updateSlashMenu"
                @blur="closeSlashMenu"
                @paste="handleContentPaste"
              />

              <Transition name="slash-menu">
                <div
                  v-if="isSlashMenuOpen"
                  id="quick-capture-slash-menu"
                  class="mt-2 overflow-hidden rounded-xl border border-stone-200/85 bg-[#fdfbf7]/[0.98] p-1 shadow-[0_18px_45px_-20px_rgba(41,37,36,0.42)] backdrop-blur-xl dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_24px_55px_-18px_rgba(0,0,0,0.85)]"
                  role="listbox"
                  aria-label="插入格式"
                  data-slash-menu
                >
                  <button
                    v-for="(command, index) in filteredSlashCommands"
                    :key="command.label"
                    type="button"
                    class="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[11px] transition-colors"
                    :class="
                      index === slashSelected
                        ? 'bg-stone-100/80 text-stone-800 dark:bg-white/[0.07] dark:text-zinc-100'
                        : 'text-stone-600 dark:text-zinc-400'
                    "
                    role="option"
                    :aria-selected="index === slashSelected"
                    data-slash-option
                    @pointerdown.prevent
                    @pointermove="slashSelected = index"
                    @click="applySlashCommand(command)"
                  >
                    <span
                      class="flex h-6 w-6 items-center justify-center rounded-md border border-stone-200/70 bg-white/60 text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
                    >
                      <component
                        :is="command.icon"
                        :size="12"
                        :stroke-width="1.7"
                        aria-hidden="true"
                      />
                    </span>
                    <span class="min-w-0 flex-1">
                      <span class="block font-medium">{{ command.label }}</span>
                      <span
                        class="mt-0.5 block font-mono text-[7px] uppercase tracking-[0.12em] text-stone-400 dark:text-zinc-600"
                      >
                        {{ command.hint }} · {{ command.prefix.trim() }}
                      </span>
                    </span>
                    <span
                      v-if="index === slashSelected"
                      class="font-mono text-[8px] text-stone-400 dark:text-zinc-500"
                    >
                      ↵
                    </span>
                  </button>

                  <p
                    v-if="!filteredSlashCommands.length"
                    class="px-3 py-2 text-[10px] text-stone-400 dark:text-zinc-600"
                  >
                    没有匹配的格式
                  </p>
                </div>
              </Transition>
            </div>

            <div
              v-if="pendingAttachments.length || processingImages"
              class="mt-3 flex flex-wrap items-center gap-2"
              data-capture-attachments
            >
              <div
                v-for="attachment in pendingAttachments"
                :key="attachment.id"
                class="group relative h-20 w-28 overflow-hidden rounded-xl border border-stone-200/80 bg-white/50 shadow-[0_1px_2px_rgba(41,37,36,0.04)] dark:border-white/10 dark:bg-white/[0.03]"
                data-capture-attachment
              >
                <img
                  :src="attachment.dataUrl"
                  :alt="attachment.fileName"
                  class="h-full w-full object-cover"
                  draggable="false"
                />
                <button
                  type="button"
                  class="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-stone-950/55 text-white opacity-80 backdrop-blur transition-[background-color,opacity] hover:bg-rose-600 hover:opacity-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  :aria-label="`移除图片 ${attachment.fileName}`"
                  @click="removeAttachment(attachment.id)"
                >
                  <X :size="10" :stroke-width="2.2" aria-hidden="true" />
                </button>
              </div>
              <div
                v-if="processingImages"
                class="flex h-20 w-28 items-center justify-center rounded-xl border border-dashed border-stone-300/80 text-stone-400 dark:border-white/10 dark:text-zinc-500"
                role="status"
                aria-live="polite"
              >
                <LoaderCircle
                  :size="15"
                  :stroke-width="1.8"
                  class="animate-spin"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div class="mt-4 flex flex-wrap items-center gap-2">
              <span
                v-for="tag in tags"
                :key="tag"
                class="group inline-flex items-center gap-1 rounded-full border border-amber-700/15 bg-amber-500/[0.08] py-1 pl-2.5 pr-1.5 text-[11px] text-amber-800 dark:border-amber-300/15 dark:bg-amber-300/[0.07] dark:text-amber-200/90"
              >
                #{{ tag }}
                <button
                  type="button"
                  class="flex h-4 w-4 items-center justify-center rounded-full text-amber-700/50 transition-colors hover:bg-amber-700/10 hover:text-amber-800 dark:text-amber-200/50 dark:hover:bg-white/10 dark:hover:text-amber-100"
                  :aria-label="`移除标签 ${tag}`"
                  @click="removeTag(tag)"
                >
                  <X :size="10" :stroke-width="2" aria-hidden="true" />
                </button>
              </span>

              <label
                class="flex min-w-[9rem] flex-1 items-center gap-1.5 rounded-full border border-dashed border-stone-300/80 px-3 py-1.5 text-stone-500 transition-colors focus-within:border-stone-400 focus-within:bg-white/60 dark:border-white/15 dark:text-zinc-500 dark:focus-within:border-white/25 dark:focus-within:bg-white/[0.03]"
              >
                <Hash :size="12" :stroke-width="1.8" aria-hidden="true" />
                <input
                  v-model="tagDraft"
                  type="text"
                  autocomplete="off"
                  name="card-canvas-card-tag"
                  data-form-type="other"
                  data-1p-ignore
                  data-lpignore="true"
                  data-bwignore
                  placeholder="标签，回车确认"
                  aria-label="添加标签"
                  class="w-full border-0 bg-transparent p-0 text-[11px] text-stone-700 outline-none placeholder:text-stone-400/90 dark:text-zinc-300 dark:placeholder:text-zinc-600"
                  @keydown="handleTagKeydown"
                  @blur="addTagsFromDraft"
                />
              </label>

              <button
                v-if="ai.hasKey"
                type="button"
                class="inline-flex h-8 items-center gap-1.5 rounded-full border border-amber-700/15 bg-amber-500/[0.065] px-2.5 text-[10px] text-amber-800 transition-[background-color,border-color,opacity] hover:border-amber-700/25 hover:bg-amber-500/[0.11] disabled:cursor-not-allowed disabled:opacity-40 dark:border-amber-200/15 dark:bg-amber-200/[0.045] dark:text-amber-200/90 dark:hover:border-amber-200/25 dark:hover:bg-amber-200/[0.075]"
                :disabled="suggestingTags || !canSave"
                :aria-busy="suggestingTags"
                aria-label="AI 推荐标签"
                title="AI 推荐层级标签"
                data-ai-tag-suggest
                @click="generateTagSuggestions"
              >
                <LoaderCircle
                  v-if="suggestingTags"
                  :size="12"
                  :stroke-width="1.8"
                  class="animate-spin"
                  aria-hidden="true"
                />
                <Sparkles
                  v-else
                  :size="12"
                  :stroke-width="1.7"
                  aria-hidden="true"
                />
                <span class="hidden sm:inline">建议</span>
              </button>
            </div>
          </div>

          <footer
            class="flex flex-none flex-wrap items-center justify-between gap-3 border-t border-stone-200/70 px-6 py-3.5 sm:px-7 dark:border-white/[0.08]"
          >
            <div
              class="flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.14em] text-stone-400 dark:text-zinc-500"
            >
              <kbd
                class="rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 text-[9px] tracking-normal text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                ⌘↵
              </kbd>
              <span>{{ isEditing ? '保存' : '上板' }}</span>
              <span class="text-stone-300 dark:text-zinc-700">·</span>
              <kbd
                class="rounded-md border border-stone-200/80 bg-white/70 px-1.5 py-0.5 text-[9px] tracking-normal text-stone-500 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-400"
              >
                Esc
              </kbd>
              <span>退出</span>
              <span class="hidden text-stone-300 sm:inline dark:text-zinc-700"
                >·</span
              >
              <span class="hidden sm:inline">#标签自动解析</span>
              <span class="hidden text-stone-300 sm:inline dark:text-zinc-700"
                >·</span
              >
              <span class="hidden sm:inline">⌘/Ctrl+V 图片</span>
            </div>

            <button
              type="button"
              class="inline-flex h-9 items-center gap-2 rounded-full border border-transparent bg-stone-900 px-4 text-[11px] font-medium tracking-[0.01em] text-white shadow-[0_1px_2px_rgba(0,0,0,0.18)] transition-[background-color,border-color,color,opacity,transform] duration-200 hover:bg-stone-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:border-stone-300/80 disabled:bg-stone-200/85 disabled:text-stone-500 disabled:opacity-100 disabled:shadow-none dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white dark:disabled:border-white/10 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-400"
              :disabled="!canSave"
              @click="save"
            >
              <CornerDownLeft
                :size="13"
                :stroke-width="1.8"
                aria-hidden="true"
              />
              {{ isEditing ? '保存修改' : '保存并上板' }}
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.capture-backdrop {
  align-items: flex-start;
  padding-top: max(1rem, env(safe-area-inset-top, 0px));
  padding-bottom: max(2.5rem, env(safe-area-inset-bottom, 0px));
}

@media (min-width: 640px) and (min-height: 680px) {
  .capture-backdrop {
    align-items: center;
    padding-top: 2rem;
    padding-bottom: 2rem;
  }
}

.capture-enter-active,
.capture-leave-active {
  transition: opacity 180ms ease;
}

.capture-enter-active .capture-panel,
.capture-leave-active .capture-panel {
  transition:
    opacity 200ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.capture-enter-from,
.capture-leave-to {
  opacity: 0;
}

.capture-enter-from .capture-panel,
.capture-leave-to .capture-panel {
  opacity: 0;
  transform: translateY(-12px) scale(0.97);
}

.slash-menu-enter-active,
.slash-menu-leave-active {
  transition:
    opacity 120ms ease,
    transform 160ms cubic-bezier(0.22, 1, 0.36, 1);
}

.slash-menu-enter-from,
.slash-menu-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .slash-menu-enter-active,
  .slash-menu-leave-active {
    transition: none;
  }
}
</style>
