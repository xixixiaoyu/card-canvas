<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowUpRight,
  CircleSlash2,
  Link2,
  LoaderCircle,
  RefreshCw,
  Sparkles,
  X,
} from '@lucide/vue'
import { AIClientError, chatCompletion } from '../../lib/ai/deepseek'
import {
  rankRadarCandidates,
  type RadarSuggestion,
} from '../../lib/ai/connection-radar'
import {
  buildConnectionRadarPrompt,
  parseRadarSuggestions,
  RADAR_SYSTEM_PROMPT,
} from '../../lib/ai/prompts'
import { useAIStore } from '../../stores/ai'
import { useBoardStore } from '../../stores/board'
import { useToastStore } from '../../stores/toast'
import type { Card } from '../../types'

type RadarState =
  'idle' | 'loading' | 'ready' | 'empty' | 'error' | 'unconfigured'

const props = defineProps<{
  open: boolean
  card: Card | null
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
  'open-settings': []
}>()

const board = useBoardStore()
const ai = useAIStore()
const toast = useToastStore()
const panelEl = ref<HTMLElement | null>(null)
const state = ref<RadarState>('idle')
const suggestions = ref<RadarSuggestion[]>([])
const errorMessage = ref('')
const acceptingIds = ref(new Set<string>())
let controller: AbortController | null = null
let restoreFocus: HTMLElement | null = null
let restoreFocusAfterClose = false

const candidates = computed(() => {
  if (!props.card) return []
  return rankRadarCandidates(props.card, board.entries, board.connections, 6)
})

const candidatesById = computed(
  () =>
    new Map(
      candidates.value.map((candidate) => [candidate.card.id, candidate]),
    ),
)

function setBackgroundInert(inert: boolean) {
  const app = document.getElementById('app')
  if (!app) return

  if (inert) app.setAttribute('inert', '')
  else app.removeAttribute('inert')
}

function close(returnFocus = false) {
  controller?.abort()
  controller = null
  if (!props.open) return
  restoreFocusAfterClose = returnFocus
  emit('update:open', false)
}

function openAISettings() {
  close()
  emit('open-settings')
}

function candidateFor(targetId: string) {
  return candidatesById.value.get(targetId) ?? null
}

async function analyze() {
  if (!props.card) return

  controller?.abort()
  controller = null
  suggestions.value = []
  acceptingIds.value = new Set()
  errorMessage.value = ''

  if (!ai.wormholeEnabled) {
    state.value = 'unconfigured'
    return
  }
  if (!candidates.value.length) {
    state.value = 'empty'
    return
  }

  const current = new AbortController()
  controller = current
  state.value = 'loading'

  try {
    const raw = await chatCompletion(
      ai.config,
      [
        { role: 'system', content: RADAR_SYSTEM_PROMPT },
        {
          role: 'user',
          content: buildConnectionRadarPrompt(props.card, candidates.value),
        },
      ],
      {
        stream: false,
        maxTokens: 900,
        temperature: 0.15,
        timeoutMs: 30_000,
        signal: current.signal,
      },
    )
    if (current.signal.aborted) return

    suggestions.value = parseRadarSuggestions(
      raw,
      candidates.value.map((candidate) => candidate.card.id),
    )
    state.value = suggestions.value.length ? 'ready' : 'empty'
  } catch (cause) {
    if (current.signal.aborted) return

    state.value = 'error'
    errorMessage.value =
      cause instanceof AIClientError
        ? cause.message
        : cause instanceof SyntaxError
          ? 'AI 返回的关联结构无法读取，请重新分析。'
          : '关联雷达暂时不可用，请稍后重试。'
  } finally {
    if (controller === current) controller = null
  }
}

async function adopt(suggestion: RadarSuggestion) {
  if (!props.card || acceptingIds.value.has(suggestion.targetId)) return
  if (!candidateFor(suggestion.targetId)) return

  acceptingIds.value = new Set([...acceptingIds.value, suggestion.targetId])
  const connection = await board.createConnection(
    props.card.id,
    suggestion.targetId,
    suggestion.label,
  )

  if (connection) {
    suggestions.value = suggestions.value.filter(
      (entry) => entry.targetId !== suggestion.targetId,
    )
    if (!suggestions.value.length) close()
    toast.push(`已建立关联，可用 ⌘Z 撤销。`, {
      tone: 'success',
      timeout: 3200,
    })
  }

  const next = new Set(acceptingIds.value)
  next.delete(suggestion.targetId)
  acceptingIds.value = next
}

function trapTabFocus(event: KeyboardEvent) {
  const panel = panelEl.value
  if (!panel) return

  const focusables = [
    ...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
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
  [() => props.open, () => props.card?.id],
  async ([open, cardId], [wasOpen, previousCardId]) => {
    if (!open) {
      if (wasOpen) {
        controller?.abort()
        controller = null
        setBackgroundInert(false)
        if (restoreFocusAfterClose) restoreFocus?.focus()
        restoreFocus = null
        restoreFocusAfterClose = false
      }
      return
    }

    if (open && (!wasOpen || cardId !== previousCardId)) {
      restoreFocusAfterClose = false
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)
      await nextTick()
      panelEl.value?.focus()
      void analyze()
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown)
})

onBeforeUnmount(() => {
  controller?.abort()
  window.removeEventListener('keydown', handleWindowKeydown)
  setBackgroundInert(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="connection-radar">
      <div
        v-if="open && card"
        class="fixed inset-0 z-[82] flex items-center justify-center bg-stone-950/20 px-4 py-6 backdrop-blur-[3px] dark:bg-black/60"
        data-connection-radar-backdrop
        @click.self="close()"
      >
        <section
          ref="panelEl"
          class="relative flex max-h-[min(720px,calc(100vh-2rem))] w-full max-w-[600px] flex-col overflow-hidden rounded-[28px] border border-stone-200/90 bg-[#fdfbf7]/[0.99] shadow-[0_42px_120px_-34px_rgba(41,37,36,0.52)] outline-none backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.99] dark:shadow-[0_50px_150px_-36px_rgba(0,0,0,0.96)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="connection-radar-title"
          tabindex="-1"
          data-connection-radar
        >
          <div
            class="pointer-events-none absolute inset-x-20 top-0 h-px bg-gradient-to-r from-transparent via-amber-400/70 to-transparent dark:via-amber-200/30"
            aria-hidden="true"
          />

          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-5 py-4 dark:border-white/[0.08]"
          >
            <div class="flex min-w-0 items-start gap-3">
              <span
                class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[13px] border border-amber-700/15 bg-amber-500/[0.08] text-amber-700 dark:border-amber-200/15 dark:bg-amber-200/[0.06] dark:text-amber-200"
              >
                <Sparkles :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <h2
                    id="connection-radar-title"
                    class="font-serif text-[18px] font-medium tracking-[-0.02em] text-stone-800 dark:text-zinc-100"
                  >
                    关联雷达
                  </h2>
                  <span
                    class="rounded-full border border-amber-700/15 bg-amber-500/[0.06] px-2 py-0.5 font-mono text-[8px] uppercase tracking-[0.14em] text-amber-800/75 dark:border-amber-200/10 dark:bg-amber-200/[0.04] dark:text-amber-200/70"
                  >
                    {{ candidates.length }} 张候选
                  </span>
                </div>
                <p
                  class="mt-1 truncate text-[11px] text-stone-500 dark:text-zinc-400"
                >
                  从「{{ card.title }}」出发，只寻找值得落盘的深层联系
                </p>
              </div>
            </div>

            <button
              type="button"
              class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200 dark:focus-visible:ring-white/25"
              aria-label="关闭关联雷达"
              @click="close()"
            >
              <X :size="15" :stroke-width="1.6" aria-hidden="true" />
            </button>
          </header>

          <div class="min-h-[280px] overflow-y-auto px-5 py-4">
            <div
              v-if="state === 'unconfigured'"
              class="flex min-h-[240px] flex-col items-center justify-center text-center"
            >
              <span
                class="flex h-11 w-11 items-center justify-center rounded-full border border-amber-700/15 bg-amber-500/[0.06] text-amber-700 dark:border-amber-200/15 dark:bg-amber-200/[0.05] dark:text-amber-200"
              >
                <Sparkles :size="17" :stroke-width="1.5" aria-hidden="true" />
              </span>
              <p
                class="mt-4 font-serif text-[16px] text-stone-700 dark:text-zinc-200"
              >
                先启用 AI 认知辅助
              </p>
              <p
                class="mt-2 max-w-[330px] text-[11px] leading-6 text-stone-500 dark:text-zinc-400"
              >
                关联雷达会用你自己的 DeepSeek Key
                审查本地候选，不会自动建立或保存任何连线。
              </p>
              <button
                type="button"
                class="mt-5 rounded-full bg-stone-900 px-4 py-2 text-[10px] font-medium text-white transition-colors hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                @click="openAISettings"
              >
                打开 AI 设置
              </button>
            </div>

            <div
              v-else-if="state === 'loading'"
              class="flex min-h-[240px] flex-col items-center justify-center text-center"
              aria-live="polite"
            >
              <span
                class="relative flex h-12 w-12 items-center justify-center rounded-full border border-amber-700/15 bg-amber-500/[0.06] text-amber-700 dark:border-amber-200/15 dark:bg-amber-200/[0.05] dark:text-amber-200"
              >
                <span
                  class="absolute inset-0 animate-ping rounded-full border border-amber-500/15 dark:border-amber-200/10"
                />
                <Sparkles :size="18" :stroke-width="1.5" aria-hidden="true" />
              </span>
              <p
                class="mt-4 font-serif text-[15px] text-stone-700 dark:text-zinc-200"
              >
                正在穿过表层术语
              </p>
              <p class="mt-1.5 text-[10px] text-stone-400 dark:text-zinc-500">
                本地已筛出 {{ candidates.length }} 张候选，正在审查真实关联
              </p>
            </div>

            <div
              v-else-if="state === 'empty'"
              class="flex min-h-[240px] flex-col items-center justify-center text-center"
            >
              <span
                class="flex h-11 w-11 items-center justify-center rounded-full border border-stone-200 bg-stone-100/70 text-stone-400 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-500"
              >
                <CircleSlash2
                  :size="17"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </span>
              <p
                class="mt-4 font-serif text-[16px] text-stone-700 dark:text-zinc-200"
              >
                {{
                  candidates.length
                    ? '这次没有足够可靠的联系'
                    : '暂时没有可探索的候选'
                }}
              </p>
              <p
                class="mt-2 max-w-[360px] text-[11px] leading-6 text-stone-500 dark:text-zinc-400"
              >
                {{
                  candidates.length
                    ? '宁愿留白，也不制造牵强连线。继续记录后可以再次分析。'
                    : '增加卡片、标签或已有连线后，雷达会发现新的探索路径。'
                }}
              </p>
              <button
                v-if="candidates.length"
                type="button"
                class="mt-5 inline-flex items-center gap-1.5 rounded-full border border-stone-300/80 bg-white/70 px-3.5 py-2 text-[10px] text-stone-600 transition-colors hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.07]"
                @click="analyze"
              >
                <RefreshCw :size="11" :stroke-width="1.7" aria-hidden="true" />
                再分析一次
              </button>
            </div>

            <div
              v-else-if="state === 'error'"
              class="flex min-h-[240px] flex-col items-center justify-center text-center"
              role="alert"
            >
              <span
                class="flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-500 dark:border-rose-300/10 dark:bg-rose-400/[0.05] dark:text-rose-300"
              >
                <CircleSlash2
                  :size="17"
                  :stroke-width="1.5"
                  aria-hidden="true"
                />
              </span>
              <p
                class="mt-4 font-serif text-[16px] text-stone-700 dark:text-zinc-200"
              >
                雷达暂时没有完成扫描
              </p>
              <p
                class="mt-2 max-w-[390px] text-[11px] leading-6 text-stone-500 dark:text-zinc-400"
                data-radar-error
              >
                {{ errorMessage }}
              </p>
              <button
                type="button"
                class="mt-5 inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-[10px] font-medium text-white transition-colors hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                @click="analyze"
              >
                <RefreshCw :size="11" :stroke-width="1.7" aria-hidden="true" />
                重新分析
              </button>
            </div>

            <div v-else-if="state === 'ready'" class="space-y-2.5">
              <p
                class="mb-3 flex items-center gap-2 text-[10px] leading-5 text-stone-400 dark:text-zinc-500"
              >
                <span class="h-px flex-1 bg-stone-200 dark:bg-white/[0.07]" />
                值得你确认的关系
                <span class="h-px flex-1 bg-stone-200 dark:bg-white/[0.07]" />
              </p>

              <article
                v-for="suggestion in suggestions"
                :key="suggestion.targetId"
                class="group rounded-[18px] border border-stone-200/80 bg-white/55 p-3.5 transition-[border-color,background-color] hover:border-amber-700/20 hover:bg-white/85 dark:border-white/[0.08] dark:bg-white/[0.025] dark:hover:border-amber-200/15 dark:hover:bg-white/[0.045]"
                data-radar-suggestion
              >
                <div class="flex items-start gap-3">
                  <span
                    class="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] border border-amber-700/15 bg-amber-500/[0.06] text-amber-700 dark:border-amber-200/15 dark:bg-amber-200/[0.05] dark:text-amber-200"
                  >
                    <Link2 :size="13" :stroke-width="1.7" aria-hidden="true" />
                  </span>

                  <div class="min-w-0 flex-1">
                    <div class="flex items-start justify-between gap-3">
                      <h3
                        class="line-clamp-1 text-[12px] font-medium text-stone-700 dark:text-zinc-200"
                      >
                        {{ candidateFor(suggestion.targetId)?.card.title }}
                      </h3>
                      <span
                        class="shrink-0 rounded-full border border-stone-200/80 bg-stone-50 px-1.5 py-0.5 font-mono text-[8px] text-stone-400 dark:border-white/[0.08] dark:bg-white/[0.04] dark:text-zinc-500"
                      >
                        {{ suggestion.strength }}%
                      </span>
                    </div>
                    <p
                      class="mt-1.5 font-serif text-[14px] leading-6 text-stone-700 dark:text-zinc-200"
                      data-radar-label
                    >
                      {{ suggestion.label }}
                    </p>
                    <p
                      class="mt-1 text-[10px] leading-5 text-stone-500 dark:text-zinc-400"
                    >
                      {{ suggestion.reason }}
                    </p>
                    <p
                      v-if="candidateFor(suggestion.targetId)?.signals.length"
                      class="mt-1.5 truncate font-mono text-[8px] uppercase tracking-[0.08em] text-stone-400 dark:text-zinc-600"
                    >
                      {{
                        candidateFor(suggestion.targetId)?.signals.join(' · ')
                      }}
                    </p>
                  </div>
                </div>

                <div
                  class="mt-3 flex items-center justify-between gap-3 border-t border-stone-200/60 pt-2.5 dark:border-white/[0.06]"
                >
                  <span
                    class="font-mono text-[8px] uppercase tracking-[0.12em] text-stone-400 dark:text-zinc-600"
                  >
                    确认后写入白板
                  </span>
                  <button
                    type="button"
                    class="inline-flex h-7 items-center gap-1 rounded-full bg-stone-900 px-3 text-[9px] font-medium text-white transition-colors hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 disabled:cursor-wait disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                    :disabled="acceptingIds.has(suggestion.targetId)"
                    data-radar-adopt
                    @click="adopt(suggestion)"
                  >
                    <LoaderCircle
                      v-if="acceptingIds.has(suggestion.targetId)"
                      :size="10"
                      :stroke-width="1.8"
                      class="animate-spin"
                      aria-hidden="true"
                    />
                    <ArrowUpRight
                      v-else
                      :size="10"
                      :stroke-width="1.8"
                      aria-hidden="true"
                    />
                    建立连线
                  </button>
                </div>
              </article>

              <button
                type="button"
                class="mx-auto mt-3 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[9px] text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:text-zinc-500 dark:hover:bg-white/[0.05] dark:hover:text-zinc-300"
                @click="analyze"
              >
                <RefreshCw :size="10" :stroke-width="1.6" aria-hidden="true" />
                重新分析
              </button>
            </div>
          </div>

          <footer
            class="flex items-center justify-between gap-4 border-t border-stone-200/70 px-5 py-3 dark:border-white/[0.08]"
          >
            <p
              class="flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.11em] text-stone-400 dark:text-zinc-600"
            >
              <span class="h-1 w-1 rounded-full bg-amber-500/70" />
              候选不会自动写入白板
            </p>
            <button
              type="button"
              class="rounded-full px-3 py-1.5 text-[9px] text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/40 dark:text-zinc-400 dark:hover:bg-white/[0.05] dark:hover:text-zinc-200"
              @click="close()"
            >
              关闭 · Esc
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.connection-radar-enter-active,
.connection-radar-leave-active {
  transition: opacity 180ms ease;
}

.connection-radar-enter-active section,
.connection-radar-leave-active section {
  transition:
    opacity 200ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.connection-radar-enter-from,
.connection-radar-leave-to,
.connection-radar-enter-from section,
.connection-radar-leave-to section {
  opacity: 0;
}

.connection-radar-enter-from section {
  transform: translateY(10px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .connection-radar-enter-active,
  .connection-radar-leave-active,
  .connection-radar-enter-active section,
  .connection-radar-leave-active section {
    transition: none;
  }
}
</style>
