import { nextTick, onBeforeUnmount, readonly, ref, type Ref } from 'vue'
import { emitCardDragBatch, emitCardDragEndBatch } from '../lib/card-drag-bus'
import {
  resolveGroupPositions,
  type GroupDragPosition,
} from '../lib/group-drag'
import type { BoardItem } from '../types'
import type { CanvasCamera } from './useCanvas'

export interface CardDragPosition {
  x: number
  y: number
}

export type CardDragCommit = GroupDragPosition

export interface UseCardDragOptions {
  /** Positioned element that receives capture and the live world translation. */
  root: Ref<HTMLElement | null>
  /** Scaled lift wrapper; it scales around the exact grab point. */
  lift: Ref<HTMLElement | null>
  camera: CanvasCamera
  getItem: () => Pick<BoardItem, 'id' | 'cardId' | 'x' | 'y'>
  getGroupItems?: () => Array<Pick<BoardItem, 'id' | 'cardId' | 'x' | 'y'>>
  ignoreSelector?: string
  onSelect?: (event: PointerEvent) => void
  onClick?: (event: PointerEvent) => void
  onCommit?: (position: CardDragPosition) => void
  onCommitGroup?: (positions: CardDragCommit[]) => void
}

export interface UseCardDragReturn {
  isDragging: Readonly<Ref<boolean>>
  isGroupDragging: Readonly<Ref<boolean>>
  onPointerDown: (event: PointerEvent) => void
  cancel: () => void
}

const DRAG_THRESHOLD = 3

interface DragGroupCard {
  id: string
  cardId: string
  x: number
  y: number
  element: HTMLElement | null
}

/**
 * Pointer-driven card movement with optional rigid-body group support.
 *
 * The pointer-down card is the only Master Source: it owns capture and window
 * listeners, computes one world-space delta, and applies that exact delta to
 * every selected card's DOM transform. Nothing is written to Pinia or Dexie
 * until pointerup.
 */
export function useCardDrag(options: UseCardDragOptions): UseCardDragReturn {
  const isDragging = ref(false)
  const isGroupDragging = ref(false)
  const ignoreSelector =
    options.ignoreSelector ?? '[data-card-selectable], [data-card-interactive]'

  let activePointerId: number | null = null
  let startClient = { x: 0, y: 0 }
  let startItem = { x: 0, y: 0 }
  let grabOffsetWorld = { x: 0, y: 0 }
  let latestPosition: CardDragPosition = { x: 0, y: 0 }
  let containerRect: DOMRect | null = null
  let pendingDelta: CardDragPosition | null = null
  let frameId = 0
  let group: DragGroupCard[] = []

  function applyPendingTransform() {
    if (!pendingDelta || !group.length) return

    const delta = pendingDelta
    for (const item of group) {
      item.element?.style.setProperty(
        'transform',
        `translate3d(${delta.x}px, ${delta.y}px, 0)`,
      )
    }

    emitCardDragBatch({ items: resolveGroupPositions(group, delta) })
  }

  function scheduleTransform() {
    if (frameId) return

    frameId = requestAnimationFrame(() => {
      frameId = 0
      applyPendingTransform()
    })
  }

  function clearGroupTransforms() {
    if (frameId) {
      cancelAnimationFrame(frameId)
      frameId = 0
    }

    for (const item of group) item.element?.style.removeProperty('transform')
    pendingDelta = null
  }

  function emitGroupEnd() {
    if (!group.length) return

    emitCardDragEndBatch({
      items: group.map((item) => ({ itemId: item.id, cardId: item.cardId })),
    })
    group = []
  }

  function syncPositionFromPointer(clientX: number, clientY: number) {
    const world = options.camera.screenToWorld(
      { x: clientX, y: clientY },
      containerRect ?? undefined,
    )

    latestPosition = {
      x: world.x - grabOffsetWorld.x,
      y: world.y - grabOffsetWorld.y,
    }
    pendingDelta = {
      x: latestPosition.x - startItem.x,
      y: latestPosition.y - startItem.y,
    }
  }

  function releasePointer() {
    const root = options.root.value
    if (!root || activePointerId === null) return

    try {
      if (root.hasPointerCapture(activePointerId)) {
        root.releasePointerCapture(activePointerId)
      }
    } catch {
      // The pointer may already have been released by the browser.
    }
  }

  function removeListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove)
    window.removeEventListener('pointerup', handleWindowPointerUp)
    window.removeEventListener('pointercancel', handleWindowPointerCancel)
    window.removeEventListener('blur', handleWindowBlur)
    options.root.value?.removeEventListener(
      'lostpointercapture',
      handleLostPointerCapture,
    )
  }

  function finishPointer() {
    removeListeners()
    releasePointer()
    activePointerId = null
  }

  function resetGroup() {
    clearGroupTransforms()
    group = []
    isDragging.value = false
    isGroupDragging.value = false
  }

  function cancel() {
    if (activePointerId === null) {
      clearGroupTransforms()
      emitGroupEnd()
      resetGroup()
      return
    }

    finishPointer()
    clearGroupTransforms()
    emitGroupEnd()
    resetGroup()
  }

  function handleWindowPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    const distance = Math.hypot(
      event.clientX - startClient.x,
      event.clientY - startClient.y,
    )
    if (!isDragging.value && distance < DRAG_THRESHOLD) return

    event.preventDefault()
    event.stopPropagation()
    isDragging.value = true

    syncPositionFromPointer(event.clientX, event.clientY)
    scheduleTransform()
  }

  async function handleWindowPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    event.stopPropagation()
    const wasDragging = isDragging.value

    if (wasDragging) {
      event.preventDefault()

      if (frameId) {
        cancelAnimationFrame(frameId)
        frameId = 0
      }
      syncPositionFromPointer(event.clientX, event.clientY)
      applyPendingTransform()
    }

    finishPointer()

    if (!wasDragging) {
      isDragging.value = false
      options.onClick?.(event)
      resetGroup()
      return
    }

    const positions = resolveGroupPositions(
      group,
      pendingDelta ?? { x: 0, y: 0 },
    )

    isDragging.value = false

    try {
      if (positions.length > 1) {
        options.onCommitGroup?.(positions)
      } else if (positions[0]) {
        options.onCommit?.({ x: positions[0].x, y: positions[0].y })
      }
      await nextTick()
    } finally {
      clearGroupTransforms()
      emitGroupEnd()
      group = []
      pendingDelta = null
      isGroupDragging.value = false
    }
  }

  function handleWindowPointerCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return
    event.stopPropagation()
    cancel()
  }

  function handleWindowBlur() {
    if (activePointerId !== null) cancel()
  }

  function handleLostPointerCapture() {
    if (activePointerId !== null) cancel()
  }

  function elementForItem(itemId: string, sourceId: string, root: HTMLElement) {
    if (itemId === sourceId) return root

    return document.querySelector<HTMLElement>(
      `[data-world-item][data-item-id="${itemId}"]`,
    )
  }

  function onPointerDown(event: PointerEvent) {
    const root = options.root.value
    if (!root) return

    if (options.camera.isSpaceHeld?.value) return
    if (event.pointerType === 'touch' && !event.isPrimary) {
      event.stopPropagation()
      return
    }
    if (event.button !== 0) return
    if (activePointerId !== null) return

    const target = event.target
    const isInternalInteraction =
      target instanceof Element && Boolean(target.closest(ignoreSelector))

    event.stopPropagation()
    options.onSelect?.(event)

    if (isInternalInteraction) return

    event.preventDefault()

    activePointerId = event.pointerId
    startClient = { x: event.clientX, y: event.clientY }
    containerRect = options.camera.getContainerRect()

    const item = options.getItem()
    startItem = { x: item.x, y: item.y }

    const provided = options.getGroupItems?.() ?? []
    const groupById = new Map(provided.map((entry) => [entry.id, entry]))
    if (!groupById.has(item.id)) groupById.set(item.id, item)
    group = [...groupById.values()].map((entry) => ({
      id: entry.id,
      cardId: entry.cardId,
      x: entry.x,
      y: entry.y,
      element: elementForItem(entry.id, item.id, root),
    }))
    isGroupDragging.value = group.length > 1

    const startWorld = options.camera.screenToWorld(
      { x: event.clientX, y: event.clientY },
      containerRect ?? undefined,
    )
    grabOffsetWorld = {
      x: startWorld.x - item.x,
      y: startWorld.y - item.y,
    }
    latestPosition = { x: item.x, y: item.y }
    pendingDelta = null

    root.style.removeProperty('transform')
    const rootRect = root.getBoundingClientRect()
    const scale = options.camera.getViewport().scale || 1
    const lift = options.lift.value

    if (lift) {
      lift.style.transformOrigin = `${
        (event.clientX - rootRect.left) / scale
      }px ${(event.clientY - rootRect.top) / scale}px`
    }

    try {
      root.setPointerCapture(event.pointerId)
    } catch {
      // Window listeners still keep the gesture alive if capture is denied.
    }

    root.addEventListener('lostpointercapture', handleLostPointerCapture)
    window.addEventListener('pointermove', handleWindowPointerMove, {
      passive: false,
    })
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerCancel)
    window.addEventListener('blur', handleWindowBlur)
  }

  onBeforeUnmount(cancel)

  return {
    isDragging: readonly(isDragging),
    isGroupDragging: readonly(isGroupDragging),
    onPointerDown,
    cancel,
  }
}
