<script setup lang="ts">
import { nextTick, onMounted, provide, ref } from 'vue'
import {
  canvasCameraKey,
  useCanvas,
  type CanvasCamera,
} from '../../composables/useCanvas'
import CanvasHUD from './CanvasHUD.vue'

const emit = defineEmits<{
  'background-pointerdown': []
}>()

const props = withDefaults(
  defineProps<{
    minScale?: number
    maxScale?: number
  }>(),
  {
    minScale: 0.1,
    maxScale: 3,
  },
)

const stageEl = ref<HTMLElement | null>(null)
const worldEl = ref<HTMLElement | null>(null)
const gridEl = ref<HTMLElement | null>(null)
const isReady = ref(false)

const {
  zoomPercent,
  isPanning,
  isSpaceHeld,
  atLimit,
  zoomIn,
  zoomOut,
  resetZoom,
  fitToContent,
  focusElement,
  screenToWorld,
  worldToScreen,
  getViewport,
  getContainerRect,
} = useCanvas({
  stage: stageEl,
  world: worldEl,
  grid: gridEl,
  minScale: props.minScale,
  maxScale: props.maxScale,
})

const cameraApi: CanvasCamera = {
  getViewport,
  getContainerRect,
  screenToWorld,
  worldToScreen,
  isSpaceHeld,
}

provide(canvasCameraKey, cameraApi)

function handleBackgroundPointerDown(event: PointerEvent) {
  if (event.button !== 0) return
  // Space + drag is a canvas pan, not a selection gesture.
  if (isSpaceHeld.value) return

  const target = event.target
  if (
    target instanceof Element &&
    target.closest('[data-canvas-ui], [data-world-item]')
  ) {
    return
  }

  emit('background-pointerdown')
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

  if (window.matchMedia('(max-width: 1100px), (max-height: 680px)').matches) {
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

  isReady.value = true
})

defineExpose({
  zoomIn,
  zoomOut,
  resetZoom,
  fitToContent,
  focusElement,
  screenToWorld,
  worldToScreen,
  getViewport,
  getContainerRect,
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
    @pointerdown="handleBackgroundPointerDown"
  >
    <p class="sr-only">
      画布操作：双指滑动平移，捏合缩放；按住空格并拖动鼠标，或使用鼠标中键拖动画布。拖动卡片标题或右上角把手可以移动卡片；正文可选择文字；点击空白取消选中。
    </p>

    <div ref="gridEl" class="canvas-dots absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-light absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-glow-dark absolute inset-0 z-0" aria-hidden="true" />
    <div class="canvas-noise absolute inset-0 z-0" aria-hidden="true" />

    <div ref="worldEl" class="canvas-world" data-canvas-world>
      <slot />
    </div>

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
      />
    </div>
  </section>
</template>

<style scoped>
.canvas-hud-dock {
  bottom: calc(1rem + env(safe-area-inset-bottom, 0px));
}

@media (min-width: 640px) {
  .canvas-hud-dock {
    bottom: calc(1.5rem + env(safe-area-inset-bottom, 0px));
  }
}
</style>
