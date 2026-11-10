import { onBeforeUnmount, readonly, ref, type Ref } from 'vue'
import { getItemRect } from '../lib/card-metrics'
import {
  idsIntersecting,
  normalizeRect,
  type SelectionRect,
} from '../lib/selection'
import type { BoardItem } from '../types'
import type { CanvasCamera } from './useCanvas'

interface MarqueeBox {
  left: number
  top: number
  width: number
  height: number
}

interface UseMarqueeSelectOptions {
  stage: Ref<HTMLElement | null>
  camera: CanvasCamera
  isSpaceHeld: Readonly<Ref<boolean>>
  getItems: () => BoardItem[]
  getSelectedIds: () => string[]
  setSelectedIds: (ids: string[]) => void
}

const MARQUEE_THRESHOLD = 3

export function isCanvasBackground(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return !target.closest(
    '[data-world-item], [data-canvas-ui], [data-selection-chrome], button, a, input, textarea, select, [role="button"], [role="textbox"], [contenteditable], .connection-hit, .connection-label-pill, .connection-label-input',
  )
}

/**
 * Rubber-band selection in world space.
 *
 * Screen corners are converted through the live camera, then tested against
 * each card's measured world rect. The marquee only starts on blank canvas and
 * yields to space/middle/touch navigation.
 */
export function useMarqueeSelect(options: UseMarqueeSelectOptions) {
  const isActive = ref(false)
  const box = ref<MarqueeBox | null>(null)

  let activePointerId: number | null = null
  let startClient = { x: 0, y: 0 }
  let baseSelection = new Set<string>()
  let additive = false
  let containerRect: DOMRect | null = null

  function canStart(event: PointerEvent) {
    if (event.button !== 0) return false
    if (event.pointerType !== 'mouse') return false
    if (options.isSpaceHeld.value) return false
    if (activePointerId !== null) return false
    return isCanvasBackground(event.target)
  }

  function updateSelection(clientX: number, clientY: number) {
    if (!containerRect) return

    const screenRect = normalizeRect(
      startClient.x,
      startClient.y,
      clientX,
      clientY,
    )
    box.value = {
      left: screenRect.x,
      top: screenRect.y,
      width: screenRect.width,
      height: screenRect.height,
    }

    const startWorld = options.camera.screenToWorld(
      { x: screenRect.x, y: screenRect.y },
      containerRect,
    )
    const endWorld = options.camera.screenToWorld(
      {
        x: screenRect.x + screenRect.width,
        y: screenRect.y + screenRect.height,
      },
      containerRect,
    )
    const worldRect: SelectionRect = normalizeRect(
      startWorld.x,
      startWorld.y,
      endWorld.x,
      endWorld.y,
    )
    const hitIds = idsIntersecting(options.getItems(), worldRect, (item) =>
      getItemRect(item),
    )
    const next = new Set(additive ? baseSelection : [])
    hitIds.forEach((itemId) => next.add(itemId))

    const current = options.getSelectedIds()
    if (
      next.size !== current.length ||
      current.some((itemId) => !next.has(itemId))
    ) {
      options.setSelectedIds([...next])
    }
  }

  function releasePointer() {
    const stage = options.stage.value
    if (!stage || activePointerId === null) return

    try {
      if (stage.hasPointerCapture(activePointerId)) {
        stage.releasePointerCapture(activePointerId)
      }
    } catch {
      // Browser may already have released capture during cancellation.
    }
  }

  function removeListeners() {
    window.removeEventListener('pointermove', handleWindowPointerMove)
    window.removeEventListener('pointerup', handleWindowPointerUp)
    window.removeEventListener('pointercancel', handleWindowPointerCancel)
    window.removeEventListener('blur', handleWindowBlur)
  }

  function finish() {
    releasePointer()
    removeListeners()
    activePointerId = null
    isActive.value = false
    box.value = null
    containerRect = null
  }

  function handleWindowPointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    const distance = Math.hypot(
      event.clientX - startClient.x,
      event.clientY - startClient.y,
    )
    if (!isActive.value && distance < MARQUEE_THRESHOLD) return

    event.preventDefault()
    if (!isActive.value) isActive.value = true
    updateSelection(event.clientX, event.clientY)
  }

  function handleWindowPointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return
    event.preventDefault()
    finish()
  }

  function handleWindowPointerCancel(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return
    finish()
  }

  function handleWindowBlur() {
    if (activePointerId !== null) finish()
  }

  function start(event: PointerEvent) {
    const stage = options.stage.value
    if (!stage || !canStart(event)) return false

    event.preventDefault()
    activePointerId = event.pointerId
    startClient = { x: event.clientX, y: event.clientY }
    additive = event.shiftKey
    baseSelection = new Set(event.shiftKey ? options.getSelectedIds() : [])
    containerRect = stage.getBoundingClientRect()
    isActive.value = false
    box.value = null

    try {
      stage.setPointerCapture(event.pointerId)
    } catch {
      // Capture is best-effort; window listeners still keep the gesture alive.
    }

    window.addEventListener('pointermove', handleWindowPointerMove, {
      passive: false,
    })
    window.addEventListener('pointerup', handleWindowPointerUp)
    window.addEventListener('pointercancel', handleWindowPointerCancel)
    window.addEventListener('blur', handleWindowBlur)

    return true
  }

  onBeforeUnmount(finish)

  return {
    isActive: readonly(isActive),
    box: readonly(box),
    canStart,
    start,
    cancel: finish,
  }
}
