import {
  nextTick,
  onBeforeUnmount,
  readonly,
  ref,
  type Ref,
} from 'vue'
import type { BoardItem } from '../types'
import type { CanvasCamera } from './useCanvas'

export interface CardDragPosition {
  x: number
  y: number
}

export interface UseCardDragOptions {
  /** Positioned element that receives capture and the live world translation. */
  root: Ref<HTMLElement | null>
  /** Scaled lift wrapper; it scales around the exact grab point. */
  lift: Ref<HTMLElement | null>
  camera: CanvasCamera
  getItem: () => Pick<BoardItem, 'id' | 'x' | 'y'>
  ignoreSelector?: string
  onSelect?: () => void
  onCommit?: (position: CardDragPosition) => void
}

export interface UseCardDragReturn {
  isDragging: Readonly<Ref<boolean>>
  onPointerDown: (event: PointerEvent) => void
  cancel: () => void
}

const DRAG_THRESHOLD = 3

/**
 * Card drag mechanics with screen-to-world scale compensation.
 *
 * During a drag the card is translated through a direct DOM transform in
 * world units. Neither Pinia nor Dexie is touched until pointerup. The card's
 * grab offset is captured once, so cursor and card remain locked together even
 * if the canvas scale changes mid-gesture.
 */
export function useCardDrag(
  options: UseCardDragOptions,
): UseCardDragReturn {
  const isDragging = ref(false)
  const ignoreSelector =
    options.ignoreSelector ??
    '[data-card-selectable], [data-card-interactive]'

  let activePointerId: number | null = null
  let startClient = { x: 0, y: 0 }
  let startItem = { x: 0, y: 0 }
  let grabOffsetWorld = { x: 0, y: 0 }
  let latestPosition: CardDragPosition = { x: 0, y: 0 }
  let containerRect: DOMRect | null = null
  let pendingDelta: CardDragPosition | null = null
  let frameId = 0

  function applyPendingTransform() {
    const root = options.root.value
    if (!root || !pendingDelta) return

    root.style.transform = `translate3d(${pendingDelta.x}px, ${pendingDelta.y}px, 0)`
  }

  function scheduleTransform() {
    if (frameId) return

    frameId = requestAnimationFrame(() => {
      frameId = 0
      applyPendingTransform()
    })
  }

  function clearTransform() {
    if (frameId) {
      cancelAnimationFrame(frameId)
      frameId = 0
    }

    pendingDelta = null
    options.root.value?.style.removeProperty('transform')
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

  function cancel() {
    if (activePointerId === null) {
      clearTransform()
      isDragging.value = false
      return
    }

    finishPointer()
    clearTransform()
    isDragging.value = false
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

    if (!isDragging.value) {
      isDragging.value = true
    }

    syncPositionFromPointer(event.clientX, event.clientY)
    scheduleTransform()
  }

  async function handleWindowPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    event.stopPropagation()

    const wasDragging = isDragging.value
    const root = options.root.value

    if (wasDragging) {
      event.preventDefault()

      // Freeze the final frame synchronously before the store updates the base
      // left/top values, so the card never flashes back to its old position.
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
      return
    }

    // Start the drop animation immediately, then let Vue move the item to its
    // new base position before removing the temporary world translation.
    isDragging.value = false

    try {
      options.onCommit?.({ ...latestPosition })
      await nextTick()
    } finally {
      root?.style.removeProperty('transform')
      pendingDelta = null
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

  function onPointerDown(event: PointerEvent) {
    const root = options.root.value
    if (!root) return

    // While space is held the canvas owns the gesture: do not select, prevent
    // default or capture the pointer, so the event reaches the pan handler.
    if (options.camera.isSpaceHeld?.value) return

    if (event.pointerType === 'touch' && !event.isPrimary) {
      event.stopPropagation()
      return
    }

    // Only the primary mouse button starts a card drag. Middle click is left
    // for canvas panning.
    if (event.button !== 0) return
    if (activePointerId !== null) return

    const target = event.target
    const isInternalInteraction =
      target instanceof Element && Boolean(target.closest(ignoreSelector))

    // Card interactions never clear canvas selection or start a canvas pan.
    event.stopPropagation()
    options.onSelect?.()

    if (isInternalInteraction) return

    event.preventDefault()

    activePointerId = event.pointerId
    startClient = { x: event.clientX, y: event.clientY }
    containerRect = options.camera.getContainerRect()

    const item = options.getItem()
    startItem = { x: item.x, y: item.y }

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

    // Clear any stale inline transform and measure the untransformed card so
    // the tiny lift scale pivots around the exact grabbed pixel.
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
    onPointerDown,
    cancel,
  }
}
