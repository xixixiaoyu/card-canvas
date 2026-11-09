import {
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  type InjectionKey,
  type Ref,
} from 'vue'
import { getItemRect } from '../lib/card-metrics'
import { pointInRect, type Point } from '../lib/geometry'
import { useBoardStore } from '../stores/board'
import type { BoardItem } from '../types'
import type { CanvasCamera } from './useCanvas'

export interface ConnectionController {
  isConnecting: Readonly<Ref<boolean>>
  fromItemId: Readonly<Ref<string | null>>
  targetItemId: Readonly<Ref<string | null>>
  pointerWorld: Readonly<Ref<Point | null>>
  editingConnectionId: Readonly<Ref<string | null>>
  beginDrag: (
    event: PointerEvent,
    item: Pick<BoardItem, 'id' | 'cardId'>,
  ) => void
  cancel: () => void
  startLabelEdit: (connectionId: string) => void
  stopLabelEdit: () => void
}

export const connectionKey: InjectionKey<ConnectionController> = Symbol(
  'card-canvas:connection',
)

export interface UseConnectionOptions {
  camera: CanvasCamera
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

function isModalOpen() {
  return Boolean(document.querySelector('[role="dialog"]'))
}

/**
 * Drag-to-connect state machine plus connection keyboard shortcuts.
 *
 * The draft lives in world coordinates (via the camera) so it stays correct at
 * every zoom level. Target detection is a pure world-space hit test against the
 * measured card bounds — no elementFromPoint, no duplicated scale math.
 */
export function useConnection(
  options: UseConnectionOptions,
): ConnectionController {
  const board = useBoardStore()

  const isConnecting = ref(false)
  const fromItemId = ref<string | null>(null)
  const fromCardId = ref<string | null>(null)
  const targetItemId = ref<string | null>(null)
  const pointerWorld = ref<Point | null>(null)
  const editingConnectionId = ref<string | null>(null)

  let activePointerId: number | null = null

  function screenToWorldPoint(clientX: number, clientY: number) {
    const rect = options.camera.getContainerRect()
    return options.camera.screenToWorld(
      { x: clientX, y: clientY },
      rect ?? undefined,
    )
  }

  function updateTarget() {
    if (!pointerWorld.value || !fromCardId.value) {
      targetItemId.value = null
      return
    }

    const point = pointerWorld.value
    const target = board.items.find((item) => {
      if (item.cardId === fromCardId.value) return false
      return pointInRect(point, getItemRect(item))
    })

    targetItemId.value = target?.id ?? null
  }

  function removeListeners() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', handlePointerCancel)
    window.removeEventListener('blur', handleWindowBlur)
  }

  function reset() {
    removeListeners()
    activePointerId = null
    isConnecting.value = false
    fromItemId.value = null
    fromCardId.value = null
    targetItemId.value = null
    pointerWorld.value = null
  }

  function beginDrag(
    event: PointerEvent,
    item: Pick<BoardItem, 'id' | 'cardId'>,
  ) {
    if (event.button !== 0 || isConnecting.value) return
    if (isModalOpen()) return
    if (options.camera.isSpaceHeld?.value) return

    event.preventDefault()
    event.stopPropagation()

    board.selectItem(item.id)

    activePointerId = event.pointerId
    isConnecting.value = true
    fromItemId.value = item.id
    fromCardId.value = item.cardId
    targetItemId.value = null
    editingConnectionId.value = null
    pointerWorld.value = screenToWorldPoint(event.clientX, event.clientY)

    window.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', handlePointerCancel)
    window.addEventListener('blur', handleWindowBlur)
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    event.preventDefault()
    event.stopPropagation()

    pointerWorld.value = screenToWorldPoint(event.clientX, event.clientY)
    updateTarget()
  }

  function handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    event.preventDefault()
    event.stopPropagation()

    const elementUnderPointer = document.elementFromPoint(
      event.clientX,
      event.clientY,
    )
    const overUi =
      elementUnderPointer instanceof Element &&
      Boolean(
        elementUnderPointer.closest(
          '[data-canvas-ui], [data-inbox-ui], [data-quick-capture]',
        ),
      )

    if (overUi) {
      reset()
      return
    }

    const targetCardId = targetItemId.value
      ? board.items.find((item) => item.id === targetItemId.value)?.cardId
      : null

    if (fromCardId.value && targetCardId) {
      void board.createConnection(fromCardId.value, targetCardId)
    }

    reset()
  }

  function handlePointerCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return
    reset()
  }

  function handleWindowBlur() {
    if (isConnecting.value) reset()
  }

  function startLabelEdit(connectionId: string) {
    if (!board.connections.some((connection) => connection.id === connectionId))
      return

    reset()
    board.selectConnection(connectionId)
    editingConnectionId.value = connectionId
  }

  function stopLabelEdit() {
    editingConnectionId.value = null
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) return
    if (isModalOpen()) return

    if (event.key === 'Escape') {
      if (isConnecting.value) {
        event.preventDefault()
        event.stopImmediatePropagation()
        reset()
        return
      }

      if (editingConnectionId.value) {
        event.preventDefault()
        event.stopImmediatePropagation()
        stopLabelEdit()
      }
      return
    }

    if (isEditableTarget(event.target)) return

    const selectedId = board.selectedConnectionId
    if (!selectedId || editingConnectionId.value) return

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      void board.deleteConnection(selectedId)
      return
    }

    if (event.key === 'Enter') {
      event.preventDefault()
      startLabelEdit(selectedId)
    }
  }

  onMounted(() => window.addEventListener('keydown', handleKeydown))

  onBeforeUnmount(() => {
    window.removeEventListener('keydown', handleKeydown)
    reset()
  })

  return {
    isConnecting: readonly(isConnecting),
    fromItemId: readonly(fromItemId),
    targetItemId: readonly(targetItemId),
    pointerWorld: readonly(pointerWorld),
    editingConnectionId: readonly(editingConnectionId),
    beginDrag,
    cancel: reset,
    startLabelEdit,
    stopLabelEdit,
  }
}
