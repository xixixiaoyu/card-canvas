<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, provide, ref } from 'vue'
import {
  canvasCameraKey,
  useCanvas,
  type CanvasCamera,
} from '../../composables/useCanvas'
import { connectionKey, useConnection } from '../../composables/useConnection'
import {
  isCanvasBackground,
  useMarqueeSelect,
} from '../../composables/useMarqueeSelect'
import { readViewport, writeViewport } from '../../lib/view-state'
import { useBoardStore } from '../../stores/board'
import type { Viewport } from '../../types'
import CanvasHUD from './CanvasHUD.vue'
import ConnectionLayer from './ConnectionLayer.vue'
import SelectionChrome from './SelectionChrome.vue'

const emit = defineEmits<{
  'background-pointerdown': [payload: { shiftKey: boolean }]
  ready: [boardId: string]
  search: []
  arrange: []
  shortcuts: []
}>()

const props = withDefaults(
  defineProps<{
    boardId?: string
    minScale?: number
    maxScale?: number
  }>(),
  {
    boardId: 'board-main',
    minScale: 0.1,
    maxScale: 3,
  },
)

const board = useBoardStore()
const stageEl = ref<HTMLElement | null>(null)
const worldEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const isReady = ref(false)
let hasRestoredView = false
let saveTimer: ReturnType<typeof setTimeout> | null = null
let pendingViewport: Viewport | null = null

function scheduleViewportSave(next: Viewport) {
  if (!hasRestoredView) return

  pendingViewport = next
  if (saveTimer !== null) return

  saveTimer = setTimeout(() => {
    saveTimer = null
    if (!pendingViewport) return

    writeViewport(props.boardId, {
      ...pendingViewport,
      width: stageEl.value?.clientWidth,
      height: stageEl.value?.clientHeight,
    })
    pendingViewport = null
  }, 250)
}

const {
  viewport,
  zoomPercent,
  isPanning,
  isSpaceHeld,
  atLimit,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToContent,
  focusElement,
  flyTo,
  screenToWorld,
  worldToScreen,
  getViewport,
  getContainerRect,
  restoreViewport,
} = useCanvas({
  stage: stageEl,
  world: worldEl,
  grid: gridEl,
  minScale: props.minScale,
  maxScale: props.maxScale,
  onViewportChange: scheduleViewportSave,
})

const cameraApi: CanvasCamera = {
  viewport,
  getViewport,
  getContainerRect,
  screenToWorld,
  worldToScreen,
  flyTo,
  isSpaceHeld,
}

provide(canvasCameraKey, cameraApi)

const connection = useConnection({ camera: cameraApi })
provide(connectionKey, connection)

const {
  isActive: marqueeActive,
  box: marqueeBox,
  canStart: canStartMarquee,
  start: startMarquee,
} = useMarqueeSelect({
  stage: stageEl,
  camera: cameraApi,
  isSpaceHeld,
  getItems: () => board.items,
  getSelectedIds: () => [...board.selectedItemIds],
  setSelectedIds: (ids) => board.selectItems(ids),
})

function handleStagePointerDown(event: PointerEvent) {
  if (event.pointerType !== 'mouse') {
    if (
      event.button === 0 &&
      !isSpaceHeld.value &&
      isCanvasBackground(event.target)
    ) {
      emit('background-pointerdown', { shiftKey: event.shiftKey })
    }
    return
  }

  if (!canStartMarquee(event)) return

  emit('background-pointerdown', { shiftKey: event.shiftKey })
  startMarquee(event)
}

function fitAll(animate = true) {
  const compact = (stageEl.value?.clientWidth ?? 0) < 640
  fitToContent({
    maxScale: 1,
    animate,
    duration: 480,
    insets: {
      top: 88,
      bottom: compact ? 104 : 96,
      left: compact ? 24 : 64,
      right: compact ? 24 : 64,
    },
  })
}

onMounted(async () => {
  await nextTick()

  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // Font metrics are best-effort; layout measurement still works.
    }
  }

  // Give the world items two frames to settle before measuring their bounds.
  // The extra frame matters in dev mode, where injected styles can land one
  // paint after the initial component mount.
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve())
    })
  })

  const savedView = readViewport(props.boardId)
  const width = stageEl.value?.clientWidth ?? 0
  const height = stageEl.value?.clientHeight ?? 0
  const sizeChanged =
    savedView?.width !== undefined &&
    savedView?.height !== undefined &&
    (Math.abs(savedView.width - width) / Math.max(savedView.width, 1) > 0.25 ||
      Math.abs(savedView.height - height) / Math.max(savedView.height, 1) >
        0.25)

  if (savedView && !sizeChanged) {
    restoreViewport(savedView)
  } else if (
    window.matchMedia('(max-width: 1100px), (max-height: 680px)').matches
  ) {
    focusElement('[data-canvas-focus]', {
      maxScale: 1,
      animate: false,
      insets: {
        top: 92,
        bottom: 104,
        left: 24,
        right: 24,
      },
    })
  } else {
    fitAll(false)
  }

  hasRestoredView = true
  isReady.value = true
  emit('ready', props.boardId)
})

onBeforeUnmount(() => {
  if (saveTimer !== null) {
    clearTimeout(saveTimer)
    saveTimer = null
  }

  if (hasRestoredView) {
    writeViewport(props.boardId, {
      ...getViewport(),
      width: stageEl.value?.clientWidth,
      height: stageEl.value?.clientHeight,
    })
  }
})

defineExpose({
  zoomIn,
  zoomOut,
  resetZoom,
  fitToContent,
  focusElement,
  flyTo,
  screenToWorld,
  worldToScreen,
  getViewport,
  getContainerRect,
  restoreViewport,
  camera: cameraApi,
})
</script>

<template>
  <section
    ref="stageEl"
    class="canvas-stage select-none"
    :class="{
      'is-space-ready': isSpaceHeld,
      'is-panning': isPanning,
      'is-ready': isReady,
    }"
    aria-label="Card Canvas 无限画布"
    @pointerdown="handleStagePointerDown"
  >
    <p class="sr-only">
      画布操作：双指滑动平移，捏合缩放；按住空格并拖动鼠标，或使用鼠标中键拖动画布。拖动卡片标题或右上角把手可以移动卡片；正文可选择文字；点击空白取消选中。
    </p>

    <div
      ref="gridEl"
      class="canvas-dots absolute inset-0 z-0"
      aria-hidden="true"
    />
    <div class="canvas-glow-light absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-dark absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-noise absolute inset-0 z-0" aria-hidden="true" />

    <div
      v-if="marqueeActive && marqueeBox"
      class="marquee-box"
      :style="{
        left: `${marqueeBox.left}px`,
        top: `${marqueeBox.top}px`,
        width: `${marqueeBox.width}px`,
        height: `${marqueeBox.height}px`,
      }"
      aria-hidden="true"
    />

    <div ref="worldEl" class="canvas-world" data-canvas-world>
      <ConnectionLayer />
      <slot />
    </div>

    <SelectionChrome />

    <div class="pointer-events-none absolute inset-0 z-20">
      <slot name="overlay" />
    </div>

    <div
      class="canvas-hud-dock pointer-events-none absolute inset-x-0 z-30 flex justify-center"
    >
      <CanvasHUD
        :zoom-percent="zoomPercent"
        :at-limit="atLimit"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
        @reset-zoom="resetZoom"
        @fit="fitAll(true)"
        @arrange="emit('arrange')"
        @search="emit('search')"
        @shortcuts="emit('shortcuts')"
      />
    </div>
  </section>
</template>

<style scoped>
.marquee-box {
  position: fixed;
  z-index: 25;
  pointer-events: none;
  border: 1px dashed rgba(217, 119, 6, 0.8);
  border-radius: 10px;
  background: rgba(217, 119, 6, 0.08);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.45) inset;
}

.dark .marquee-box {
  border-color: rgba(147, 197, 253, 0.75);
  background: rgba(147, 197, 253, 0.07);
  box-shadow: 0 0 18px rgba(147, 197, 253, 0.12);
}

.canvas-hud-dock {
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}

@media (min-width: 640px) {
  .canvas-hud-dock {
    bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>
