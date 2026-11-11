<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useWindowSize } from '@vueuse/core'
import {
  Check,
  Clipboard,
  Download,
  LoaderCircle,
  Settings2,
  Share2,
  X,
} from '@lucide/vue'
import { toBlob } from 'html-to-image'
import type { Card } from '../../types'
import {
  buildShareFilename,
  SHARE_RATIOS,
  SHARE_THEMES,
  type ShareRatioId,
  type ShareThemeId,
} from '../../lib/share/presets'
import { useToastStore } from '../../stores/toast'
import ShareCardArtwork from './ShareCardArtwork.vue'

type BusyAction = 'download' | 'copy' | null

const props = defineProps<{
  open: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const toast = useToastStore()
const { width: viewportWidth, height: viewportHeight } = useWindowSize()
const panelEl = ref<HTMLElement | null>(null)
const exportEl = ref<HTMLElement | null>(null)
const themeId = ref<ShareThemeId>('dawn')
const ratioId = ref<ShareRatioId>('square')
const showTags = ref(true)
const showDate = ref(true)
const showWatermark = ref(true)
const busy = ref<BusyAction>(null)
let restoreFocus: HTMLElement | null = null
let restoreFocusAfterClose = false

const selectedTheme = computed(() =>
  SHARE_THEMES.find((theme) => theme.id === themeId.value)!,
)
const selectedRatio = computed(() =>
  SHARE_RATIOS.find((ratio) => ratio.id === ratioId.value)!,
)

const previewBounds = computed(() => {
  const stacked = viewportWidth.value < 1024
  const horizontalSpace = stacked
    ? viewportWidth.value - 48
    : Math.min(610, viewportWidth.value - 410)
  const verticalSpace = Math.max(
    260,
    Math.min(560, viewportHeight.value * (stacked ? 0.46 : 0.62)),
  )
  const maxWidth = Math.max(220, horizontalSpace)
  const scale = Math.min(
    maxWidth / selectedRatio.value.width,
    verticalSpace / selectedRatio.value.height,
    1,
  )

  return {
    width: `${Math.round(selectedRatio.value.width * scale)}px`,
    height: `${Math.round(selectedRatio.value.height * scale)}px`,
  }
})

function setBackgroundInert(inert: boolean) {
  const app = document.getElementById('app')
  if (!app) return

  if (inert) app.setAttribute('inert', '')
  else app.removeAttribute('inert')
}

function close(returnFocus = false) {
  if (!props.open) return
  restoreFocusAfterClose = returnFocus
  emit('update:open', false)
}

function nextFrame() {
  return new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
}

async function waitForArtwork() {
  await nextTick()
  if (document.fonts?.ready) {
    try {
      await document.fonts.ready
    } catch {
      // Export can proceed with the browser's fallback fonts.
    }
  }
  await nextFrame()
  await nextFrame()
}

async function renderPng() {
  const node = exportEl.value
  const ratio = selectedRatio.value
  if (!node) throw new Error('分享画布尚未准备好。')

  await waitForArtwork()
  let lastError: unknown = null

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const blob = await toBlob(node, {
        width: ratio.width,
        height: ratio.height,
        canvasWidth: ratio.width,
        canvasHeight: ratio.height,
        pixelRatio: 1,
        cacheBust: false,
      })
      if (blob) return blob
    } catch (cause) {
      lastError = cause
      await nextFrame()
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('图片生成失败，请稍后重试。')
}

async function downloadImage() {
  if (!props.card || busy.value) return
  busy.value = 'download'

  try {
    const blob = await renderPng()
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = buildShareFilename(
      props.card.title,
      selectedTheme.value.id,
      selectedRatio.value.id,
    )
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.push('分享图片已生成。', {
      tone: 'success',
      timeout: 2600,
    })
  } catch (cause) {
    console.error('[card-canvas] Unable to export share image', cause)
    toast.push('图片生成失败，请稍后重试。', { tone: 'error' })
  } finally {
    busy.value = null
  }
}

async function copyImage() {
  if (!props.card || busy.value) return

  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    toast.push('当前浏览器不支持复制图片，请改用下载 PNG。', {
      tone: 'error',
    })
    return
  }

  busy.value = 'copy'
  try {
    const blob = await renderPng()
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
    toast.push('图片已复制到剪贴板。', {
      tone: 'success',
      timeout: 2600,
    })
  } catch (cause) {
    console.error('[card-canvas] Unable to copy share image', cause)
    toast.push('复制图片失败，请允许剪贴板权限后重试。', {
      tone: 'error',
    })
  } finally {
    busy.value = null
  }
}

function trapTabFocus(event: KeyboardEvent) {
  const panel = panelEl.value
  if (!panel) return

  const focusables = [
    ...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
  if (!props.open || event.isComposing) return

  if (event.key === 'Tab') {
    trapTabFocus(event)
    return
  }

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close(true)
  }
}

watch(
  () => props.open,
  async (open, wasOpen) => {
    if (open) {
      restoreFocusAfterClose = false
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)
      await nextTick()
      panelEl.value?.focus()
      return
    }

    if (wasOpen) {
      setBackgroundInert(false)
      if (restoreFocusAfterClose) restoreFocus?.focus()
      restoreFocus = null
      restoreFocusAfterClose = false
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  setBackgroundInert(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="share-studio">
      <div
        v-if="open && card"
        class="fixed inset-0 z-[84] flex items-center justify-center overflow-y-auto bg-stone-950/30 px-3 py-4 backdrop-blur-md dark:bg-black/70 sm:px-5"
        data-share-studio-backdrop
        @click.self="close()"
      >
        <section
          ref="panelEl"
          class="relative w-full max-w-[1080px] overflow-hidden rounded-[30px] border border-white/60 bg-[#f8f6f1]/[0.985] shadow-[0_50px_140px_-32px_rgba(41,37,36,0.58)] outline-none dark:border-white/10 dark:bg-zinc-900/[0.985] dark:shadow-[0_60px_160px_-40px_rgba(0,0,0,0.98)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="share-studio-title"
          tabindex="-1"
          data-share-studio
        >
          <header
            class="flex items-center justify-between gap-4 border-b border-stone-200/70 px-5 py-3.5 sm:px-6 dark:border-white/[0.08]"
          >
            <div class="flex min-w-0 items-center gap-3">
              <span
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-indigo-700/10 bg-indigo-500/[0.07] text-indigo-700 dark:border-indigo-200/10 dark:bg-indigo-200/[0.05] dark:text-indigo-200"
              >
                <Share2 :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <h2
                  id="share-studio-title"
                  class="font-serif text-[18px] font-medium tracking-[-0.02em] text-stone-800 dark:text-zinc-100"
                >
                  分享卡片工作室
                </h2>
                <p
                  class="mt-0.5 truncate font-mono text-[8px] uppercase tracking-[0.16em] text-stone-400 dark:text-zinc-500"
                >
                  {{ card.title }} · private by default
                </p>
              </div>
            </div>

            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200 dark:focus-visible:ring-white/25"
              aria-label="关闭分享工作室"
              @click="close()"
            >
              <X :size="15" :stroke-width="1.6" aria-hidden="true" />
            </button>
          </header>

          <div class="grid lg:grid-cols-[minmax(0,1fr)_320px]">
            <div
              class="relative flex min-h-[330px] items-center justify-center overflow-hidden bg-[#ded9cf] px-4 py-6 dark:bg-[#111114] sm:px-8 sm:py-8"
            >
              <div
                class="pointer-events-none absolute inset-0 opacity-40 [background-image:radial-gradient(rgba(255,255,255,.7)_1px,transparent_1px)] [background-size:18px_18px] dark:opacity-20 dark:[background-image:radial-gradient(rgba(255,255,255,.18)_1px,transparent_1px)]"
                aria-hidden="true"
              />
              <div
                class="share-preview relative z-10 overflow-hidden rounded-[4px] shadow-[0_28px_70px_-24px_rgba(41,37,36,0.62)] ring-1 ring-black/[0.06] transition-[width,height] duration-300 ease-out dark:ring-white/10"
                :style="previewBounds"
                data-share-preview
              >
                <ShareCardArtwork
                  :card="card"
                  :theme="selectedTheme"
                  :ratio="selectedRatio"
                  :show-tags="showTags"
                  :show-date="showDate"
                  :show-watermark="showWatermark"
                />
              </div>

              <div
                class="absolute bottom-3 left-4 z-20 flex items-center gap-1.5 rounded-full border border-white/30 bg-stone-950/20 px-2.5 py-1 font-mono text-[8px] uppercase tracking-[0.14em] text-white/80 backdrop-blur-md dark:border-white/10 dark:bg-black/25"
              >
                <span
                  class="h-1 w-1 rounded-full bg-emerald-300/90"
                  aria-hidden="true"
                />
                {{ selectedRatio.width }} × {{ selectedRatio.height }} px
              </div>
            </div>

            <aside
              class="flex min-h-0 flex-col border-t border-stone-200/70 bg-[#faf8f4]/80 lg:border-l lg:border-t-0 dark:border-white/[0.08] dark:bg-zinc-900/50"
            >
              <div class="flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-5">
                <fieldset>
                  <legend
                    class="mb-2.5 flex items-center gap-2 text-[10px] font-medium text-stone-600 dark:text-zinc-300"
                  >
                    <span
                      class="flex h-5 w-5 items-center justify-center rounded-md bg-stone-200/60 text-stone-500 dark:bg-white/[0.06] dark:text-zinc-400"
                    >
                      <Settings2
                        :size="10"
                        :stroke-width="1.7"
                        aria-hidden="true"
                      />
                    </span>
                    主题
                  </legend>
                  <div class="grid grid-cols-2 gap-2">
                    <button
                      v-for="theme in SHARE_THEMES"
                      :key="theme.id"
                      type="button"
                      class="group relative overflow-hidden rounded-[13px] border p-2 text-left transition-[border-color,background-color,transform] hover:-translate-y-px focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50"
                      :class="
                        themeId === theme.id
                          ? 'border-stone-400/60 bg-white shadow-[0_4px_14px_-8px_rgba(41,37,36,.35)] dark:border-white/25 dark:bg-white/[0.08]'
                          : 'border-stone-200/80 bg-white/35 hover:border-stone-300 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-white/15'
                      "
                      :aria-label="`主题：${theme.name}`"
                      :aria-pressed="themeId === theme.id"
                      :data-share-theme-option="theme.id"
                      @click="themeId = theme.id"
                    >
                      <span class="flex items-center gap-1.5">
                        <span
                          v-for="swatch in theme.swatches"
                          :key="swatch"
                          class="h-3.5 w-3.5 rounded-full border border-black/10 shadow-sm dark:border-white/10"
                          :style="{ backgroundColor: swatch }"
                          aria-hidden="true"
                        />
                        <Check
                          v-if="themeId === theme.id"
                          :size="10"
                          :stroke-width="2"
                          class="ml-auto text-stone-500 dark:text-zinc-300"
                          aria-hidden="true"
                        />
                      </span>
                      <span
                        class="mt-1.5 block text-[10px] font-medium text-stone-700 dark:text-zinc-200"
                      >
                        {{ theme.name }}
                      </span>
                      <span
                        class="mt-0.5 block truncate text-[8px] text-stone-400 dark:text-zinc-500"
                      >
                        {{ theme.note }}
                      </span>
                    </button>
                  </div>
                </fieldset>

                <fieldset>
                  <legend
                    class="mb-2.5 text-[10px] font-medium text-stone-600 dark:text-zinc-300"
                  >
                    画面比例
                  </legend>
                  <div class="grid grid-cols-3 gap-2">
                    <button
                      v-for="ratio in SHARE_RATIOS"
                      :key="ratio.id"
                      type="button"
                      class="rounded-xl border px-2 py-2 text-center transition-[border-color,background-color] focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50"
                      :class="
                        ratioId === ratio.id
                          ? 'border-amber-700/30 bg-amber-500/[0.07] dark:border-amber-200/20 dark:bg-amber-200/[0.05]'
                          : 'border-stone-200/80 bg-white/35 hover:border-stone-300 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-white/15'
                      "
                      :aria-label="`比例：${ratio.label}，${ratio.description}`"
                      :aria-pressed="ratioId === ratio.id"
                      :data-share-ratio-option="ratio.id"
                      @click="ratioId = ratio.id"
                    >
                      <span
                        class="mx-auto mb-1.5 block border border-current opacity-50"
                        :class="{
                          'h-4 w-4': ratio.id === 'square',
                          'h-[1.15rem] w-[0.875rem]': ratio.id === 'portrait',
                          'h-[0.65rem] w-[1.15rem]': ratio.id === 'landscape',
                        }"
                        aria-hidden="true"
                      />
                      <span
                        class="block font-mono text-[9px] text-stone-600 dark:text-zinc-300"
                      >
                        {{ ratio.label }}
                      </span>
                    </button>
                  </div>
                </fieldset>

                <fieldset>
                  <legend
                    class="mb-2 text-[10px] font-medium text-stone-600 dark:text-zinc-300"
                  >
                    画面内容
                  </legend>
                  <div class="space-y-1.5">
                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-stone-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:hover:bg-white/[0.04]"
                      role="switch"
                      :aria-checked="showTags"
                      aria-label="显示标签"
                      @click="showTags = !showTags"
                    >
                      <span
                        class="text-[10px] text-stone-600 dark:text-zinc-300"
                        >显示标签</span
                      >
                      <span
                        class="relative h-4 w-7 rounded-full transition-colors"
                        :class="
                          showTags
                            ? 'bg-stone-800 dark:bg-zinc-200'
                            : 'bg-stone-300 dark:bg-zinc-700'
                        "
                        aria-hidden="true"
                      >
                        <span
                          class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-[left] dark:bg-zinc-900"
                          :class="showTags ? 'left-3.5' : 'left-0.5'"
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-stone-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:hover:bg-white/[0.04]"
                      role="switch"
                      :aria-checked="showDate"
                      aria-label="显示日期"
                      @click="showDate = !showDate"
                    >
                      <span
                        class="text-[10px] text-stone-600 dark:text-zinc-300"
                        >显示日期</span
                      >
                      <span
                        class="relative h-4 w-7 rounded-full transition-colors"
                        :class="
                          showDate
                            ? 'bg-stone-800 dark:bg-zinc-200'
                            : 'bg-stone-300 dark:bg-zinc-700'
                        "
                        aria-hidden="true"
                      >
                        <span
                          class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-[left] dark:bg-zinc-900"
                          :class="showDate ? 'left-3.5' : 'left-0.5'"
                        />
                      </span>
                    </button>

                    <button
                      type="button"
                      class="flex w-full items-center justify-between rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-stone-100/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:hover:bg-white/[0.04]"
                      role="switch"
                      :aria-checked="showWatermark"
                      aria-label="显示品牌签名"
                      @click="showWatermark = !showWatermark"
                    >
                      <span
                        class="text-[10px] text-stone-600 dark:text-zinc-300"
                        >品牌签名</span
                      >
                      <span
                        class="relative h-4 w-7 rounded-full transition-colors"
                        :class="
                          showWatermark
                            ? 'bg-stone-800 dark:bg-zinc-200'
                            : 'bg-stone-300 dark:bg-zinc-700'
                        "
                        aria-hidden="true"
                      >
                        <span
                          class="absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-[left] dark:bg-zinc-900"
                          :class="showWatermark ? 'left-3.5' : 'left-0.5'"
                        />
                      </span>
                    </button>
                  </div>
                </fieldset>

                <p
                  class="rounded-xl border border-stone-200/70 bg-white/35 px-3 py-2 text-[8px] leading-4 text-stone-400 dark:border-white/[0.07] dark:bg-white/[0.02] dark:text-zinc-500"
                >
                  图片只包含卡片内容与所选装饰，不包含账号、白板位置或其他卡片。
                </p>
              </div>

              <div
                class="grid gap-2 border-t border-stone-200/70 p-4 dark:border-white/[0.08] sm:grid-cols-2"
              >
                <button
                  type="button"
                  class="inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-stone-300/80 bg-white/65 text-[10px] font-medium text-stone-600 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 disabled:cursor-wait disabled:opacity-50 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.07]"
                  :disabled="Boolean(busy)"
                  @click="copyImage"
                >
                  <LoaderCircle
                    v-if="busy === 'copy'"
                    :size="13"
                    :stroke-width="1.8"
                    class="animate-spin"
                    aria-hidden="true"
                  />
                  <Clipboard
                    v-else
                    :size="13"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                  复制图片
                </button>
                <button
                  type="button"
                  class="inline-flex h-10 items-center justify-center gap-1.5 rounded-full bg-stone-900 text-[10px] font-medium text-white transition-colors hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 disabled:cursor-wait disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                  :disabled="Boolean(busy)"
                  data-share-download
                  @click="downloadImage"
                >
                  <LoaderCircle
                    v-if="busy === 'download'"
                    :size="13"
                    :stroke-width="1.8"
                    class="animate-spin"
                    aria-hidden="true"
                  />
                  <Download
                    v-else
                    :size="13"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                  下载 PNG
                </button>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </Transition>
  </Teleport>

  <div
    v-if="open && card"
    class="pointer-events-none fixed left-[-20000px] top-0 overflow-hidden"
    :style="{
      width: `${selectedRatio.width}px`,
      height: `${selectedRatio.height}px`,
    }"
    aria-hidden="true"
  >
    <div
      ref="exportEl"
      :style="{
        width: `${selectedRatio.width}px`,
        height: `${selectedRatio.height}px`,
      }"
      data-share-export
    >
      <ShareCardArtwork
        :card="card"
        :theme="selectedTheme"
        :ratio="selectedRatio"
        :show-tags="showTags"
        :show-date="showDate"
        :show-watermark="showWatermark"
      />
    </div>
  </div>
</template>

<style scoped>
.share-preview {
  background: #f5f0e7;
}

.share-studio-enter-active,
.share-studio-leave-active {
  transition: opacity 180ms ease;
}

.share-studio-enter-active section,
.share-studio-leave-active section {
  transition:
    opacity 210ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.share-studio-enter-from,
.share-studio-leave-to,
.share-studio-enter-from section,
.share-studio-leave-to section {
  opacity: 0;
}

.share-studio-enter-from section {
  transform: translateY(10px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .share-studio-enter-active,
  .share-studio-leave-active,
  .share-studio-enter-active section,
  .share-studio-leave-active section,
  .share-preview {
    transition: none;
  }
}
</style>
