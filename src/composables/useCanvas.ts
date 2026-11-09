import {
  onBeforeUnmount,
  onMounted,
  readonly,
  ref,
  type Ref,
} from 'vue'
import { usePreferredReducedMotion } from '@vueuse/core'
import type { Viewport } from '../types'

export interface Point {
  x: number
  y: number
}

export interface ScreenPoint extends Point {}
export interface WorldPoint extends Point {}

/** The geometry needed by the coordinate conversion contract. */
export type CanvasContainerRect = Pick<DOMRectReadOnly, 'left' | 'top'> &
  Partial<Pick<DOMRectReadOnly, 'width' | 'height'>>

export interface WorldBounds {
  x: number
  y: number
  width: number
  height: number
}

export type ZoomLimit = 'min' | 'max' | null

export interface FitInsets {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

export interface FitOptions {
  padding?: number
  insets?: FitInsets
  maxScale?: number
  animate?: boolean
  duration?: number
}

export interface UseCanvasOptions {
  stage: Ref<HTMLElement | null>
  world: Ref<HTMLElement | null>
  grid?: Ref<HTMLElement | null>
  minScale?: number
  maxScale?: number
}

export interface UseCanvasReturn {
  zoomPercent: Readonly<Ref<number>>
  isPanning: Readonly<Ref<boolean>>
  isSpaceHeld: Readonly<Ref<boolean>>
  atLimit: Readonly<Ref<ZoomLimit>>
  /** Two-argument convenience bound to the live viewport. */
  screenToWorld: (
    screenPoint: ScreenPoint,
    containerRect?: CanvasContainerRect,
  ) => WorldPoint
  /** Two-argument convenience bound to the live viewport. */
  worldToScreen: (
    worldPoint: WorldPoint,
    containerRect?: CanvasContainerRect,
  ) => ScreenPoint
  getViewport: () => Viewport
  getContainerRect: () => DOMRect | null
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  fitToContent: (options?: FitOptions) => void
  focusElement: (selector: string, options?: FitOptions) => void
  destroy: () => void
}

/**
 * Pure screen → world conversion.
 *
 * The viewport is passed explicitly to keep this function deterministic and
 * testable. Inside a component, use the two-argument function returned by
 * `useCanvas()`, which is bound to the live camera.
 */
export function screenToWorld(
  screenPoint: ScreenPoint,
  containerRect: CanvasContainerRect,
  viewport: Viewport,
): WorldPoint {
  const scale = viewport.scale || 1

  return {
    x: (screenPoint.x - containerRect.left - viewport.panX) / scale,
    y: (screenPoint.y - containerRect.top - viewport.panY) / scale,
  }
}

/** Pure world → screen conversion (client coordinates). */
export function worldToScreen(
  worldPoint: WorldPoint,
  containerRect: CanvasContainerRect,
  viewport: Viewport,
): ScreenPoint {
  return {
    x: containerRect.left + viewport.panX + worldPoint.x * viewport.scale,
    y: containerRect.top + viewport.panY + worldPoint.y * viewport.scale,
  }
}

type MotionMode = 'idle' | 'pan' | 'zoom' | 'fly'
type PanSource = 'space' | 'middle' | 'touch' | null
type SafariGestureEvent = Event & {
  scale: number
  clientX: number
  clientY: number
}
interface ZoomAnchor {
  screenX: number
  screenY: number
  worldX: number
  worldY: number
}

const DEFAULT_MIN_SCALE = 0.1
const DEFAULT_MAX_SCALE = 3
const ZOOM_BUTTON_FACTOR = 1.25
const MIN_GRID_SPACING = 18
const BASE_GRID_WORLD_SIZE = 26
const PAN_SMOOTHING = 30
const ZOOM_SMOOTHING = 26

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function positiveModulo(value: number, divisor: number) {
  return ((value % divisor) + divisor) % divisor
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1)
  return t * t * (3 - 2 * t)
}

function easeOutCubic(value: number) {
  return 1 - (1 - value) ** 3
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

function isCanvasUiTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false

  return Boolean(
    target.closest(
      '[data-canvas-ui], button, a, input, textarea, select, [role="button"], [role="textbox"]',
    ),
  )
}

/**
 * Canvas physics engine.
 *
 * High-frequency state is kept in plain objects and applied straight to the
 * DOM inside one requestAnimationFrame loop. Only low-frequency UI signals
 * (integer zoom percentage, drag state, limit state) are reactive refs.
 */
export function useCanvas(options: UseCanvasOptions): UseCanvasReturn {
  const minScale = Math.max(0.01, options.minScale ?? DEFAULT_MIN_SCALE)
  const maxScale = Math.max(minScale, options.maxScale ?? DEFAULT_MAX_SCALE)
  const reducedMotion = usePreferredReducedMotion()

  const zoomPercent = ref(100)
  const isPanning = ref(false)
  const isSpaceHeld = ref(false)
  const atLimit = ref<ZoomLimit>(null)

  let stageEl: HTMLElement | null = null
  let worldEl: HTMLElement | null = null
  let gridEl: HTMLElement | null = null

  const current: Viewport = { panX: 0, panY: 0, scale: 1 }
  const target: Viewport = { ...current }

  let mode: MotionMode = 'idle'
  let rafId = 0
  let lastFrameTime = 0
  let zoomAnchor: ZoomAnchor | null = null

  let flyFrom: Viewport | null = null
  let flyTo: Viewport | null = null
  let flyStartedAt = 0
  let flyDuration = 0

  let activePointerId: number | null = null
  let panSource: PanSource = null
  let panOrigin = { x: 0, y: 0, panX: 0, panY: 0 }

  let safariGesture: {
    startScale: number
    anchor: ZoomAnchor
  } | null = null

  let resizeObserver: ResizeObserver | null = null
  let lastStageWidth = 0
  let lastStageHeight = 0

  function getContainerRect() {
    return stageEl?.getBoundingClientRect() ?? null
  }

  function getViewport(): Viewport {
    return { ...current }
  }

  function boundScreenToWorld(
    screenPoint: ScreenPoint,
    containerRect: CanvasContainerRect = getContainerRect() ?? {
      left: 0,
      top: 0,
    },
  ) {
    return screenToWorld(screenPoint, containerRect, current)
  }

  function boundWorldToScreen(
    worldPoint: WorldPoint,
    containerRect: CanvasContainerRect = getContainerRect() ?? {
      left: 0,
      top: 0,
    },
  ) {
    return worldToScreen(worldPoint, containerRect, current)
  }

  function localScreenPoint(screenPoint: ScreenPoint, rect: DOMRect): ScreenPoint {
    return {
      x: screenPoint.x - rect.left,
      y: screenPoint.y - rect.top,
    }
  }

  function syncFeedback() {
    const nextPercent = Math.round(current.scale * 100)
    if (nextPercent !== zoomPercent.value) {
      zoomPercent.value = nextPercent
    }

    const scaleForLimit = mode === 'zoom' ? target.scale : current.scale
    const limit: ZoomLimit =
      scaleForLimit <= minScale + 0.0001
        ? 'min'
        : scaleForLimit >= maxScale - 0.0001
          ? 'max'
          : null

    if (limit !== atLimit.value) {
      atLimit.value = limit
    }
  }

  function applyGrid() {
    if (!gridEl) return

    const baseSpacing = BASE_GRID_WORLD_SIZE * current.scale
    let lodFactor = 1

    // Increase world spacing at low zoom so dots never become a moiré field.
    while (baseSpacing * lodFactor < MIN_GRID_SPACING) {
      lodFactor *= 2
    }

    const screenSpacing = baseSpacing * lodFactor
    const x = positiveModulo(current.panX, screenSpacing)
    const y = positiveModulo(current.panY, screenSpacing)

    // Dots dissolve gently at both extremes. The high-zoom fade keeps a busy
    // world from feeling noisy without ever hiding the canvas geometry.
    const lowEndFade = smoothstep(0.1, 0.24, current.scale)
    const highEndFade = 1 - 0.5 * smoothstep(1.8, 3, current.scale)
    const opacity = (0.35 + 0.65 * lowEndFade) * highEndFade

    gridEl.style.setProperty('--grid-size', `${screenSpacing.toFixed(3)}px`)
    gridEl.style.setProperty('--grid-x', `${x.toFixed(3)}px`)
    gridEl.style.setProperty('--grid-y', `${y.toFixed(3)}px`)
    gridEl.style.setProperty('--grid-opacity', opacity.toFixed(3))
  }

  function applyTransform() {
    if (worldEl) {
      worldEl.style.transform = `translate3d(${current.panX}px, ${current.panY}px, 0) scale(${current.scale})`
    }

    applyGrid()
    syncFeedback()
  }

  function stopFrame() {
    if (rafId) {
      cancelAnimationFrame(rafId)
      rafId = 0
    }
    lastFrameTime = 0
  }

  function freezeMotion() {
    stopFrame()
    mode = 'idle'
    zoomAnchor = null
    flyFrom = null
    flyTo = null
    target.panX = current.panX
    target.panY = current.panY
    target.scale = current.scale
  }

  function scheduleFrame() {
    if (rafId) return

    lastFrameTime = 0
    rafId = requestAnimationFrame(stepFrame)
  }

  function stepFrame(now: number) {
    rafId = 0

    const deltaSeconds = lastFrameTime
      ? Math.min(0.05, Math.max(0.001, (now - lastFrameTime) / 1000))
      : 1 / 60

    lastFrameTime = now
    let keepRunning = false

    if (mode === 'pan') {
      const easing =
        reducedMotion.value === 'reduce'
          ? 1
          : 1 - Math.exp(-PAN_SMOOTHING * deltaSeconds)
      current.panX += (target.panX - current.panX) * easing
      current.panY += (target.panY - current.panY) * easing

      const settled =
        Math.abs(target.panX - current.panX) < 0.05 &&
        Math.abs(target.panY - current.panY) < 0.05

      if (settled) {
        current.panX = target.panX
        current.panY = target.panY
        mode = 'idle'
      } else {
        keepRunning = true
      }
    } else if (mode === 'zoom' && zoomAnchor) {
      const easing =
        reducedMotion.value === 'reduce'
          ? 1
          : 1 - Math.exp(-ZOOM_SMOOTHING * deltaSeconds)
      const scaleDelta = target.scale - current.scale
      current.scale += scaleDelta * easing

      if (Math.abs(scaleDelta) < 0.0004) {
        current.scale = target.scale
      }

      // Recompute pan from the fixed world anchor every frame. This keeps the
      // point under the cursor pinned for the entire easing animation.
      current.panX = zoomAnchor.screenX - zoomAnchor.worldX * current.scale
      current.panY = zoomAnchor.screenY - zoomAnchor.worldY * current.scale
      target.panX = current.panX
      target.panY = current.panY

      if (Math.abs(target.scale - current.scale) < 0.0004) {
        current.scale = target.scale
        zoomAnchor = null
        mode = 'idle'
      } else {
        keepRunning = true
      }
    } else if (mode === 'fly' && flyFrom && flyTo) {
      const progress = clamp((now - flyStartedAt) / flyDuration, 0, 1)
      const eased = easeOutCubic(progress)

      current.panX = flyFrom.panX + (flyTo.panX - flyFrom.panX) * eased
      current.panY = flyFrom.panY + (flyTo.panY - flyFrom.panY) * eased
      current.scale = flyFrom.scale + (flyTo.scale - flyFrom.scale) * eased

      if (progress >= 1) {
        current.panX = flyTo.panX
        current.panY = flyTo.panY
        current.scale = flyTo.scale
        target.panX = current.panX
        target.panY = current.panY
        target.scale = current.scale
        flyFrom = null
        flyTo = null
        mode = 'idle'
      } else {
        keepRunning = true
      }
    }

    applyTransform()

    if (keepRunning) {
      rafId = requestAnimationFrame(stepFrame)
    } else {
      lastFrameTime = 0
      mode = 'idle'
    }
  }

  function commitViewport(next: Viewport) {
    freezeMotion()
    current.panX = next.panX
    current.panY = next.panY
    current.scale = clamp(next.scale, minScale, maxScale)
    target.panX = current.panX
    target.panY = current.panY
    target.scale = current.scale
    applyTransform()
  }

  function animateViewportTo(next: Viewport, duration = 420) {
    const durationMs = reducedMotion.value === 'reduce' ? 0 : duration
    const clampedNext: Viewport = {
      panX: next.panX,
      panY: next.panY,
      scale: clamp(next.scale, minScale, maxScale),
    }

    if (durationMs <= 0) {
      commitViewport(clampedNext)
      return
    }

    freezeMotion()
    flyFrom = { ...current }
    flyTo = clampedNext
    flyStartedAt = performance.now()
    flyDuration = durationMs
    target.panX = clampedNext.panX
    target.panY = clampedNext.panY
    target.scale = clampedNext.scale
    mode = 'fly'
    scheduleFrame()
  }

  function zoomFactorForWheel(event: WheelEvent) {
    const delta = event.deltaY
    if (!delta) return 1

    const absolute = Math.abs(delta)
    const isSteppedWheel = event.deltaMode !== 0 || absolute >= 40

    if (isSteppedWheel) {
      const notches = Math.min(3, Math.max(1, Math.round(absolute / 100)))
      return Math.pow(1.12, -Math.sign(delta) * notches)
    }

    return clamp(Math.exp(-delta * 0.0085), 0.82, 1.22)
  }

  function normalizeWheelDelta(event: WheelEvent, rect: DOMRect) {
    const multiplier =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? Math.max(rect.height, 1)
          : 1
    const limit = 320

    return {
      dx: clamp(event.deltaX * multiplier, -limit, limit),
      dy: clamp(event.deltaY * multiplier, -limit, limit),
    }
  }

  function startZoomAt(screenPoint: ScreenPoint, factor: number) {
    if (!stageEl) return

    const baseScale = mode === 'zoom' ? target.scale : current.scale
    const nextScale = clamp(baseScale * factor, minScale, maxScale)
    const worldPoint = {
      x: (screenPoint.x - current.panX) / current.scale,
      y: (screenPoint.y - current.panY) / current.scale,
    }

    if (mode === 'pan' || mode === 'fly') {
      target.panX = current.panX
      target.panY = current.panY
    }

    target.scale = nextScale
    zoomAnchor = {
      screenX: screenPoint.x,
      screenY: screenPoint.y,
      worldX: worldPoint.x,
      worldY: worldPoint.y,
    }
    mode = 'zoom'
    atLimit.value =
      nextScale <= minScale + 0.0001
        ? 'min'
        : nextScale >= maxScale - 0.0001
          ? 'max'
          : null

    if (Math.abs(nextScale - current.scale) < 0.0001) {
      applyTransform()
      return
    }

    scheduleFrame()
  }

  function zoomAtStageCenter(factor: number) {
    if (!stageEl) return

    startZoomAt(
      {
        x: stageEl.clientWidth / 2,
        y: stageEl.clientHeight / 2,
      },
      factor,
    )
  }

  function zoomIn() {
    zoomAtStageCenter(ZOOM_BUTTON_FACTOR)
  }

  function zoomOut() {
    zoomAtStageCenter(1 / ZOOM_BUTTON_FACTOR)
  }

  function resetZoom() {
    if (!stageEl) return

    const baseScale = mode === 'zoom' ? target.scale : current.scale
    if (Math.abs(baseScale - 1) < 0.0001) return

    startZoomAt(
      {
        x: stageEl.clientWidth / 2,
        y: stageEl.clientHeight / 2,
      },
      1 / baseScale,
    )
  }

  function measureElement(element: HTMLElement): WorldBounds {
    return {
      x: element.offsetLeft,
      y: element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight,
    }
  }

  function measureContent(): WorldBounds | null {
    if (!worldEl) return null

    const elements = Array.from(
      worldEl.querySelectorAll<HTMLElement>('[data-world-item]'),
    ).filter((element) => element.offsetWidth > 0 && element.offsetHeight > 0)

    if (elements.length === 0) return null

    let minX = Number.POSITIVE_INFINITY
    let minY = Number.POSITIVE_INFINITY
    let maxX = Number.NEGATIVE_INFINITY
    let maxY = Number.NEGATIVE_INFINITY

    for (const element of elements) {
      const bounds = measureElement(element)
      minX = Math.min(minX, bounds.x)
      minY = Math.min(minY, bounds.y)
      maxX = Math.max(maxX, bounds.x + bounds.width)
      maxY = Math.max(maxY, bounds.y + bounds.height)
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    }
  }

  function fitBounds(bounds: WorldBounds, fitOptions: FitOptions = {}) {
    if (!stageEl) return

    const padding = Math.max(0, fitOptions.padding ?? 64)
    const insetTop = Math.max(0, fitOptions.insets?.top ?? padding)
    const insetRight = Math.max(0, fitOptions.insets?.right ?? padding)
    const insetBottom = Math.max(0, fitOptions.insets?.bottom ?? padding)
    const insetLeft = Math.max(0, fitOptions.insets?.left ?? padding)
    const width = stageEl.clientWidth
    const height = stageEl.clientHeight
    const availableWidth = Math.max(1, width - insetLeft - insetRight)
    const availableHeight = Math.max(1, height - insetTop - insetBottom)
    const maxFitScale = Math.min(maxScale, fitOptions.maxScale ?? 1)
    const scale = clamp(
      Math.min(
        availableWidth / Math.max(bounds.width, 1),
        availableHeight / Math.max(bounds.height, 1),
      ),
      minScale,
      maxFitScale,
    )

    const next: Viewport = {
      panX:
        insetLeft +
        (availableWidth - bounds.width * scale) / 2 -
        bounds.x * scale,
      panY:
        insetTop +
        (availableHeight - bounds.height * scale) / 2 -
        bounds.y * scale,
      scale,
    }

    if (fitOptions.animate ?? true) {
      animateViewportTo(next, fitOptions.duration ?? 460)
    } else {
      commitViewport(next)
    }
  }

  function fitToContent(fitOptions: FitOptions = {}) {
    const bounds = measureContent()
    if (!bounds) {
      if (stageEl) {
        commitViewport({
          panX: stageEl.clientWidth / 2,
          panY: stageEl.clientHeight / 2,
          scale: 1,
        })
      }
      return
    }

    fitBounds(bounds, fitOptions)
  }

  function focusElement(selector: string, fitOptions: FitOptions = {}) {
    const element = worldEl?.querySelector<HTMLElement>(selector)
    if (!element) {
      fitToContent(fitOptions)
      return
    }

    fitBounds(measureElement(element), {
      maxScale: 1,
      ...fitOptions,
    })
  }

  function finishPointer() {
    if (activePointerId === null) return

    const pointerId = activePointerId
    activePointerId = null
    panSource = null
    isPanning.value = false
    mode = 'idle'

    if (stageEl?.hasPointerCapture(pointerId)) {
      stageEl.releasePointerCapture(pointerId)
    }

    applyTransform()
  }

  function handleWheel(event: WheelEvent) {
    if (isEditableTarget(event.target)) return

    // Always take ownership of the wheel while over the canvas: this blocks
    // macOS horizontal swipe navigation and browser pinch page-zoom.
    event.preventDefault()

    if (activePointerId !== null || !stageEl) return

    const rect = stageEl.getBoundingClientRect()

    if (event.ctrlKey) {
      const local = localScreenPoint(
        { x: event.clientX, y: event.clientY },
        rect,
      )
      const factor = zoomFactorForWheel(event)
      if (factor !== 1) startZoomAt(local, factor)
      return
    }

    const { dx, dy } = normalizeWheelDelta(event, rect)
    if (dx === 0 && dy === 0) return

    const isTrackpadPan =
      event.deltaMode === 0 && Math.max(Math.abs(dx), Math.abs(dy)) < 40

    if (mode === 'zoom') {
      zoomAnchor = null
      target.scale = current.scale
    }

    if (isTrackpadPan) {
      // Trackpad deltas arrive per frame already: map them 1:1 so the paper
      // stays glued to the fingers instead of trailing the gesture.
      stopFrame()
      mode = 'idle'
      current.panX -= dx
      current.panY -= dy
      target.panX = current.panX
      target.panY = current.panY
      target.scale = current.scale
      scheduleFrame()
      return
    }

    if (mode !== 'pan') {
      stopFrame()
      target.panX = current.panX
      target.panY = current.panY
      target.scale = current.scale
      mode = 'pan'
    }

    // Mouse-wheel notches get a short damped glide to soften the stair-step.
    // Scrolling down moves the world up, matching native document scroll.
    target.panX -= dx
    target.panY -= dy
    scheduleFrame()
  }

  function handlePointerDown(event: PointerEvent) {
    if (!stageEl) return
    if (isCanvasUiTarget(event.target) || isEditableTarget(event.target)) return
    if (activePointerId !== null) return

    const isMiddleButton = event.button === 1
    const isTouch = event.pointerType === 'touch'
    const isSpaceDrag = event.button === 0 && isSpaceHeld.value

    if (!isMiddleButton && !isSpaceDrag && !isTouch) return

    event.preventDefault()
    freezeMotion()

    activePointerId = event.pointerId
    panSource = isMiddleButton ? 'middle' : isTouch ? 'touch' : 'space'
    isPanning.value = true
    panOrigin = {
      x: event.clientX,
      y: event.clientY,
      panX: current.panX,
      panY: current.panY,
    }

    try {
      stageEl.setPointerCapture(event.pointerId)
    } catch {
      // Pointer capture can fail if the pointer was already released.
    }
  }

  function handlePointerMove(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return

    event.preventDefault()

    const offsetX = event.clientX - panOrigin.x
    const offsetY = event.clientY - panOrigin.y

    current.panX = panOrigin.panX + offsetX
    current.panY = panOrigin.panY + offsetY
    target.panX = current.panX
    target.panY = current.panY

    scheduleFrame()
  }

  function handlePointerUp(event: PointerEvent) {
    if (event.pointerId !== activePointerId) return
    finishPointer()
  }

  function handleLostPointerCapture() {
    if (activePointerId !== null) finishPointer()
  }

  function handleAuxClick(event: MouseEvent) {
    if (event.button === 1) event.preventDefault()
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.defaultPrevented || event.isComposing) return
    if (event.code !== 'Space' || event.repeat) return
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (isEditableTarget(event.target) || isCanvasUiTarget(event.target)) return

    event.preventDefault()
    isSpaceHeld.value = true
  }

  function handleKeyUp(event: KeyboardEvent) {
    if (event.code !== 'Space') return
    if (!isSpaceHeld.value) return

    isSpaceHeld.value = false

    if (activePointerId !== null && panSource === 'space') {
      finishPointer()
    }
  }

  function handleWindowBlur() {
    isSpaceHeld.value = false
    if (activePointerId !== null) finishPointer()
  }

  function handleGestureStart(event: Event) {
    if (isEditableTarget(event.target) || !stageEl) return

    event.preventDefault()
    const gesture = event as SafariGestureEvent
    const rect = stageEl.getBoundingClientRect()
    const clientX = Number.isFinite(gesture.clientX)
      ? gesture.clientX
      : rect.left + rect.width / 2
    const clientY = Number.isFinite(gesture.clientY)
      ? gesture.clientY
      : rect.top + rect.height / 2
    const local = localScreenPoint({ x: clientX, y: clientY }, rect)

    freezeMotion()
    safariGesture = {
      startScale: current.scale,
      anchor: {
        screenX: local.x,
        screenY: local.y,
        worldX: (local.x - current.panX) / current.scale,
        worldY: (local.y - current.panY) / current.scale,
      },
    }
  }

  function handleGestureChange(event: Event) {
    if (!safariGesture) return

    event.preventDefault()
    const gesture = event as SafariGestureEvent
    const nextScale = clamp(
      safariGesture.startScale * gesture.scale,
      minScale,
      maxScale,
    )

    target.scale = nextScale
    zoomAnchor = safariGesture.anchor
    mode = 'zoom'
    atLimit.value =
      nextScale <= minScale + 0.0001
        ? 'min'
        : nextScale >= maxScale - 0.0001
          ? 'max'
          : null
    scheduleFrame()
  }

  function handleGestureEnd(event: Event) {
    event.preventDefault()
    safariGesture = null
  }

  function attach() {
    stageEl = options.stage.value
    worldEl = options.world.value
    gridEl = options.grid?.value ?? null

    if (!stageEl) return

    lastStageWidth = stageEl.clientWidth
    lastStageHeight = stageEl.clientHeight

    stageEl.addEventListener('wheel', handleWheel, { passive: false })
    stageEl.addEventListener('pointerdown', handlePointerDown, {
      passive: false,
    })
    stageEl.addEventListener('pointermove', handlePointerMove, {
      passive: false,
    })
    stageEl.addEventListener('pointerup', handlePointerUp)
    stageEl.addEventListener('pointercancel', handlePointerUp)
    stageEl.addEventListener('lostpointercapture', handleLostPointerCapture)
    stageEl.addEventListener('auxclick', handleAuxClick)
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    window.addEventListener('blur', handleWindowBlur)
    stageEl.addEventListener(
      'gesturestart',
      handleGestureStart as EventListener,
      { passive: false },
    )
    stageEl.addEventListener(
      'gesturechange',
      handleGestureChange as EventListener,
      { passive: false },
    )
    stageEl.addEventListener(
      'gestureend',
      handleGestureEnd as EventListener,
      { passive: false },
    )

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (!stageEl) return

        const width = stageEl.clientWidth
        const height = stageEl.clientHeight
        const deltaX = (width - lastStageWidth) / 2
        const deltaY = (height - lastStageHeight) / 2

        lastStageWidth = width
        lastStageHeight = height

        if (deltaX === 0 && deltaY === 0) return

        current.panX += deltaX
        current.panY += deltaY
        target.panX += deltaX
        target.panY += deltaY

        if (zoomAnchor) {
          zoomAnchor.screenX += deltaX
          zoomAnchor.screenY += deltaY
        }

        applyTransform()
      })
      resizeObserver.observe(stageEl)
    }

    applyTransform()
  }

  function destroy() {
    stopFrame()

    if (stageEl) {
      stageEl.removeEventListener('wheel', handleWheel)
      stageEl.removeEventListener('pointerdown', handlePointerDown)
      stageEl.removeEventListener('pointermove', handlePointerMove)
      stageEl.removeEventListener('pointerup', handlePointerUp)
      stageEl.removeEventListener('pointercancel', handlePointerUp)
      stageEl.removeEventListener(
        'lostpointercapture',
        handleLostPointerCapture,
      )
      stageEl.removeEventListener('auxclick', handleAuxClick)
      stageEl.removeEventListener(
        'gesturestart',
        handleGestureStart as EventListener,
      )
      stageEl.removeEventListener(
        'gesturechange',
        handleGestureChange as EventListener,
      )
      stageEl.removeEventListener(
        'gestureend',
        handleGestureEnd as EventListener,
      )
    }

    window.removeEventListener('keydown', handleKeyDown)
    window.removeEventListener('keyup', handleKeyUp)
    window.removeEventListener('blur', handleWindowBlur)
    resizeObserver?.disconnect()
    resizeObserver = null

    if (stageEl && activePointerId !== null) {
      if (stageEl.hasPointerCapture(activePointerId)) {
        stageEl.releasePointerCapture(activePointerId)
      }
    }

    activePointerId = null
    isPanning.value = false
    isSpaceHeld.value = false
  }

  onMounted(attach)
  onBeforeUnmount(destroy)

  return {
    zoomPercent: readonly(zoomPercent),
    isPanning: readonly(isPanning),
    isSpaceHeld: readonly(isSpaceHeld),
    atLimit: readonly(atLimit),
    screenToWorld: boundScreenToWorld,
    worldToScreen: boundWorldToScreen,
    getViewport,
    getContainerRect,
    zoomIn,
    zoomOut,
    resetZoom,
    fitToContent,
    focusElement,
    destroy,
  }
}
