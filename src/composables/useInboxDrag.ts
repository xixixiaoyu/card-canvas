import { nextTick, onBeforeUnmount, ref } from 'vue'
import type { Card } from '../types'
import type { CanvasCamera } from './useCanvas'

export const GHOST_CARD_WIDTH = 420

const DRAG_THRESHOLD = 5

export interface InboxDropPayload {
  card: Card
  /** World-space top-left of the projection. */
  x: number
  y: number
  width: number
  /** Measured world-space height, used to center the card on the cursor. */
  height: number
  world: { x: number; y: number }
  screen: { x: number; y: number }
}

export interface UseInboxDragOptions {
  camera: CanvasCamera
  onDrop: (payload: InboxDropPayload) => void
}

/**
 * Pointer-driven drag from the inbox shelf onto the infinite canvas.
 *
 * The ghost is a fixed screen-space clone of the real card. It is moved through
 * direct style writes inside one rAF loop and never touches the Pinia graph, so
 * dragging never re-renders the canvas. On drop the cursor's screen point is
 * converted once through the live camera; because the ghost lays out at the
 * card's real world width, its measured height is already world height.
 */
export function useInboxDrag(options: UseInboxDragOptions) {
  const ghostCard = ref<Card | null>(null)
  const isDragging = ref(false)
  const isOverCanvas = ref(false)
  const draggingCardId = ref<string | null>(null)

  let ghostEl: HTMLElement | null = null
  let activePointerId: number | null = null
  let pendingCard: Card | null = null
  let armed = false
  let dropping = false
  let cancelling = false
  let cancelTimer: ReturnType<typeof setTimeout> | null = null
  let frameId = 0
  let startClient = { x: 0, y: 0 }
  let latestClient = { x: 0, y: 0 }

  function setGhostElement(element: unknown) {
    ghostEl = element instanceof HTMLElement ? element : null
    if (ghostEl) applyPosition()
  }

  function applyPosition() {
    if (!ghostEl) return

    const scale = options.camera.getViewport().scale || 1
    const lift = isOverCanvas.value ? 1.02 : 1

    // translate3d keeps the ghost on the compositor: no left/top layout work
    // per pointer frame. The trailing translate centers the card on the point.
    ghostEl.style.transform = `translate3d(${latestClient.x}px, ${latestClient.y}px, 0) scale(${scale * lift}) translate(-50%, -50%)`
  }

  function schedulePosition() {
    if (frameId) return

    frameId = requestAnimationFrame(() => {
      frameId = 0
      // One hit-test per frame keeps the drop-target feedback cheap.
      syncOverCanvas()
      applyPosition()
    })
  }

  function isPointOverCanvas(x: number, y: number) {
    const target = document.elementFromPoint(x, y)
    if (!(target instanceof Element)) return false

    if (
      target.closest(
        '[data-inbox-ui], [data-canvas-ui], [data-quick-capture]',
      )
    ) {
      return false
    }

    return Boolean(target.closest('.canvas-stage'))
  }

  function syncOverCanvas() {
    const next = isPointOverCanvas(latestClient.x, latestClient.y)
    if (next === isOverCanvas.value) return

    isOverCanvas.value = next
    applyPosition()
  }

  function beginDrag() {
    if (!pendingCard || armed) return

    armed = true
    ghostCard.value = pendingCard
    draggingCardId.value = pendingCard.id
    isDragging.value = true

    void nextTick(() => {
      applyPosition()
      syncOverCanvas()
    })
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    latestClient = { x: event.clientX, y: event.clientY }

    if (!armed) {
      const distance = Math.hypot(
        event.clientX - startClient.x,
        event.clientY - startClient.y,
      )
      if (distance < DRAG_THRESHOLD) return
      beginDrag()
    }

    event.preventDefault()
    schedulePosition()
  }

  async function handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId || dropping) return

    if (!armed || !ghostCard.value) {
      finish()
      return
    }

    dropping = true
    removeListeners()

    const card = ghostCard.value
    latestClient = { x: event.clientX, y: event.clientY }

    if (!isPointOverCanvas(event.clientX, event.clientY)) {
      dropping = false
      cancelWithAnimation()
      return
    }

    // A very fast flick can release before Vue has mounted the ghost; wait one
    // flush so the measured height is trustworthy.
    await nextTick()

    // The ghost lays out at its real world width, so its measured height is
    // already world-space height even while the wrapper is scaled.
    const height = ghostEl?.offsetHeight ?? 0
    const width = GHOST_CARD_WIDTH
    const rect = options.camera.getContainerRect()
    const world = options.camera.screenToWorld(
      { x: event.clientX, y: event.clientY },
      rect ?? undefined,
    )

    const payload: InboxDropPayload = {
      card,
      x: world.x - width / 2,
      y: world.y - (height > 0 ? height / 2 : 0),
      width,
      height,
      world,
      screen: { x: event.clientX, y: event.clientY },
    }

    try {
      options.onDrop(payload)
      // Let Vue mount the real projection before removing the ghost, so the
      // hand-off happens inside the same frame with no visible gap.
      await nextTick()
    } catch (cause) {
      console.error('[card-canvas] Unable to drop inbox card', cause)
    } finally {
      dropping = false
      finish()
    }
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    cancelWithAnimation()
  }

  function removeListeners() {
    window.removeEventListener('pointermove', handlePointerMove)
    window.removeEventListener('pointerup', handlePointerUp)
    window.removeEventListener('pointercancel', cancelWithAnimation)
    window.removeEventListener('blur', handlePointerCancel)
    window.removeEventListener('keydown', handleKeydown)
  }

  function handlePointerCancel() {
    cancelWithAnimation()
  }

  function clearCancelTimer() {
    if (cancelTimer === null) return

    clearTimeout(cancelTimer)
    cancelTimer = null
  }

  /**
   * Release the pointer without placing the card. The ghost shrinks and fades
   * before unmounting so a cancelled drag does not pop out of existence.
   */
  function cancelWithAnimation() {
    if (cancelling) return
    if (!armed || !ghostEl) {
      finish()
      return
    }

    cancelling = true
    removeListeners()
    dropping = false
    activePointerId = null
    pendingCard = null
    armed = false
    isDragging.value = false
    draggingCardId.value = null
    isOverCanvas.value = false

    const element = ghostEl
    const scale = (options.camera.getViewport().scale || 1) * 0.96

    element.style.transition = 'opacity 160ms ease, transform 160ms ease'
    element.style.transform = `translate3d(${latestClient.x}px, ${latestClient.y}px, 0) scale(${scale}) translate(-50%, -50%)`
    element.style.opacity = '0'

    cancelTimer = setTimeout(() => {
      cancelTimer = null
      finish()
    }, 170)
  }

  function finish() {
    removeListeners()
    clearCancelTimer()

    if (frameId) {
      cancelAnimationFrame(frameId)
      frameId = 0
    }

    activePointerId = null
    pendingCard = null
    armed = false
    dropping = false
    cancelling = false
    ghostCard.value = null
    draggingCardId.value = null
    isDragging.value = false
    isOverCanvas.value = false
  }

  function onPointerDown(event: PointerEvent, card: Card) {
    if (event.button !== 0) return
    if (cancelling) finish()
    if (activePointerId !== null || dropping) return

    event.preventDefault()
    event.stopPropagation()

    activePointerId = event.pointerId
    pendingCard = card
    startClient = { x: event.clientX, y: event.clientY }
    latestClient = { ...startClient }
    armed = false

    window.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    })
    window.addEventListener('pointerup', handlePointerUp)
    window.addEventListener('pointercancel', cancelWithAnimation)
    window.addEventListener('blur', handlePointerCancel)
    window.addEventListener('keydown', handleKeydown)
  }

  onBeforeUnmount(finish)

  return {
    ghostCard,
    isDragging,
    isOverCanvas,
    draggingCardId,
    setGhostElement,
    onPointerDown,
    cancel: cancelWithAnimation,
  }
}
