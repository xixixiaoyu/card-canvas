<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { Eye, EyeOff, KeyRound, Sparkles, X } from '@lucide/vue'
import { normalizeAIConfig } from '../../lib/ai/config'
import { AIClientError, testAIConnection } from '../../lib/ai/deepseek'
import { useAIStore } from '../../stores/ai'
import type { AIConfig } from '../../types/ai'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const ai = useAIStore()
const draft = reactive<AIConfig>({ ...ai.config })
const panelEl = ref<HTMLElement | null>(null)
const keyEl = ref<HTMLInputElement | null>(null)
const showKey = ref(false)
const testing = ref(false)
const testMessage = ref('')
const testTone = ref<'idle' | 'success' | 'error'>('idle')
let restoreFocus: HTMLElement | null = null

const canTest = computed(() => Boolean(draft.apiKey.trim()) && !testing.value)

function setBackgroundInert(inert: boolean) {
  const app = document.getElementById('app')
  if (!app) return

  if (inert) app.setAttribute('inert', '')
  else app.removeAttribute('inert')
}

function close() {
  emit('update:open', false)
}

function save() {
  ai.save(normalizeAIConfig(draft))
  close()
}

function clearKey() {
  ai.clearKey()
  draft.apiKey = ''
  testMessage.value = '已清除本机保存的 API Key。'
  testTone.value = 'idle'
}

async function testConnection() {
  if (!canTest.value) return

  testing.value = true
  testMessage.value = ''
  testTone.value = 'idle'

  try {
    const latency = await testAIConnection(normalizeAIConfig(draft))
    testMessage.value = `连接正常，往返 ${latency} ms。`
    testTone.value = 'success'
  } catch (cause) {
    testMessage.value =
      cause instanceof AIClientError
        ? cause.message
        : '连接测试失败，请检查配置。'
    testTone.value = 'error'
  } finally {
    testing.value = false
  }
}

function trapTabFocus(event: KeyboardEvent) {
  const panel = panelEl.value
  if (!panel) return

  const focusables = [
    ...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    close()
  }
}

watch(
  () => props.open,
  async (open) => {
    if (open) {
      Object.assign(draft, ai.config)
      testMessage.value = ''
      testTone.value = 'idle'
      showKey.value = false
      restoreFocus =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setBackgroundInert(true)

      await nextTick()
      keyEl.value?.focus()
      return
    }

    setBackgroundInert(false)
    restoreFocus?.focus()
    restoreFocus = null
  },
)

window.addEventListener('keydown', handleWindowKeydown)
onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleWindowKeydown)
  setBackgroundInert(false)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="ai-settings">
      <div
        v-if="open"
        class="fixed inset-0 z-[90] flex items-start justify-center overflow-y-auto bg-stone-950/25 px-4 pb-10 pt-[8vh] backdrop-blur-[4px] dark:bg-black/65"
        data-ai-settings
        @click.self="close"
      >
        <section
          ref="panelEl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ai-settings-title"
          class="relative w-full max-w-[580px] overflow-hidden rounded-[26px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_40px_120px_-40px_rgba(41,37,36,0.5)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.97] dark:shadow-[0_50px_140px_-40px_rgba(0,0,0,0.95)]"
        >
          <div
            class="pointer-events-none absolute inset-x-14 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/60 to-transparent dark:via-amber-200/25"
            aria-hidden="true"
          />

          <header
            class="flex items-start justify-between gap-4 border-b border-stone-200/70 px-6 py-4 dark:border-white/[0.08]"
          >
            <div class="flex items-center gap-3">
              <span
                class="flex h-9 w-9 items-center justify-center rounded-[12px] border border-amber-700/15 bg-amber-500/[0.08] text-amber-700 dark:border-amber-200/15 dark:bg-amber-200/[0.06] dark:text-amber-200"
              >
                <Sparkles :size="15" :stroke-width="1.6" aria-hidden="true" />
              </span>
              <div>
                <h2
                  id="ai-settings-title"
                  class="font-serif text-[17px] font-medium tracking-[-0.015em] text-stone-800 dark:text-zinc-100"
                >
                  AI 认知辅助
                </h2>
                <p
                  class="mt-0.5 font-mono text-[8px] uppercase tracking-[0.18em] text-stone-400 dark:text-zinc-500"
                >
                  DeepSeek · Bring your own key
                </p>
              </div>
            </div>

            <button
              type="button"
              class="flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/60 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.07] dark:hover:text-zinc-200 dark:focus-visible:ring-white/25"
              aria-label="关闭 AI 设置"
              @click="close"
            >
              <X :size="15" :stroke-width="1.6" aria-hidden="true" />
            </button>
          </header>

          <div class="space-y-5 px-6 py-5">
            <label class="block">
              <span
                class="mb-2 flex items-center gap-1.5 text-[11px] font-medium text-stone-600 dark:text-zinc-300"
              >
                <KeyRound :size="12" :stroke-width="1.7" aria-hidden="true" />
                DeepSeek API Key
              </span>
              <span
                class="flex h-11 items-center rounded-xl border border-stone-200/90 bg-white/65 px-3 transition-colors focus-within:border-stone-400 dark:border-white/10 dark:bg-white/[0.035] dark:focus-within:border-white/25"
              >
                <input
                  ref="keyEl"
                  v-model="draft.apiKey"
                  :type="showKey ? 'text' : 'password'"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="sk-..."
                  aria-label="DeepSeek API Key"
                  class="min-w-0 flex-1 border-0 bg-transparent font-mono text-[12px] text-stone-800 outline-none placeholder:text-stone-300 dark:text-zinc-100 dark:placeholder:text-zinc-600"
                />
                <button
                  type="button"
                  class="ml-2 flex h-7 w-7 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 dark:text-zinc-500 dark:hover:bg-white/[0.06] dark:hover:text-zinc-200"
                  :aria-label="showKey ? '隐藏 API Key' : '显示 API Key'"
                  @click="showKey = !showKey"
                >
                  <EyeOff
                    v-if="showKey"
                    :size="13"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                  <Eye
                    v-else
                    :size="13"
                    :stroke-width="1.7"
                    aria-hidden="true"
                  />
                </button>
              </span>
            </label>

            <label class="block">
              <span
                class="mb-2 block text-[11px] font-medium text-stone-600 dark:text-zinc-300"
              >
                模型
              </span>
              <input
                v-model="draft.model"
                type="text"
                spellcheck="false"
                aria-label="AI 模型"
                class="h-11 w-full rounded-xl border border-stone-200/90 bg-white/65 px-3 font-mono text-[11px] text-stone-700 outline-none transition-colors focus:border-stone-400 dark:border-white/10 dark:bg-white/[0.035] dark:text-zinc-300 dark:focus:border-white/25"
              />
              <span
                class="mt-1.5 block text-[10px] leading-5 text-stone-400 dark:text-zinc-500"
              >
                DeepSeek 默认使用 deepseek-chat；第三方兼容端点请同步填写其模型
                ID。
              </span>
            </label>

            <label class="block">
              <span
                class="mb-2 block text-[11px] font-medium text-stone-600 dark:text-zinc-300"
              >
                API 端点
              </span>
              <input
                v-model="draft.baseUrl"
                type="url"
                spellcheck="false"
                aria-label="API 端点"
                class="h-11 w-full rounded-xl border border-stone-200/90 bg-white/65 px-3 font-mono text-[11px] text-stone-700 outline-none transition-colors focus:border-stone-400 dark:border-white/10 dark:bg-white/[0.035] dark:text-zinc-300 dark:focus:border-white/25"
              />
              <span
                class="mt-1.5 block text-[10px] leading-5 text-stone-400 dark:text-zinc-500"
              >
                默认端点经同源代理转发。自定义第三方地址时必须包含完整的 Chat
                Completions 路径。
              </span>
            </label>

            <div
              class="space-y-2 rounded-2xl border border-stone-200/75 bg-white/35 p-3 dark:border-white/[0.08] dark:bg-white/[0.02]"
            >
              <label
                class="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-2 py-1.5"
              >
                <span>
                  <span
                    class="block text-[11px] text-stone-700 dark:text-zinc-200"
                  >
                    启用虫洞探针
                  </span>
                  <span
                    class="mt-0.5 block text-[10px] text-stone-400 dark:text-zinc-500"
                  >
                    选中两张卡片时寻找底层关联
                  </span>
                </span>
                <input
                  v-model="draft.enableWormhole"
                  type="checkbox"
                  role="switch"
                  aria-label="启用虫洞探针"
                  class="ai-switch"
                />
              </label>

              <label
                class="flex cursor-pointer items-center justify-between gap-4 rounded-xl px-2 py-1.5"
              >
                <span>
                  <span
                    class="block text-[11px] text-stone-700 dark:text-zinc-200"
                  >
                    无标签时自动推断
                  </span>
                  <span
                    class="mt-0.5 block text-[10px] text-stone-400 dark:text-zinc-500"
                  >
                    保存卡片不等待网络，标签后台补齐
                  </span>
                </span>
                <input
                  v-model="draft.enableAutoTags"
                  type="checkbox"
                  role="switch"
                  aria-label="无标签时自动推断"
                  class="ai-switch"
                />
              </label>
            </div>

            <div
              class="rounded-xl border border-amber-700/10 bg-amber-500/[0.045] px-3 py-2.5 text-[10px] leading-5 text-stone-500 dark:border-amber-200/10 dark:bg-amber-200/[0.035] dark:text-zinc-400"
            >
              Key 仅保存在当前浏览器的 localStorage，不写入 Dexie
              或仓库；它能被同源脚本读取，因此不是硬件级密钥保险箱。启用功能后，相关卡片的标题与正文会发送到你配置的端点。
            </div>

            <div class="flex min-h-6 items-center justify-between gap-3">
              <p
                class="text-[10px] leading-5"
                :class="{
                  'text-emerald-600 dark:text-emerald-400':
                    testTone === 'success',
                  'text-rose-600 dark:text-rose-400': testTone === 'error',
                  'text-stone-400 dark:text-zinc-500': testTone === 'idle',
                }"
                aria-live="polite"
              >
                {{ testMessage }}
              </p>
              <button
                type="button"
                class="shrink-0 rounded-full border border-stone-200/90 bg-white/60 px-3 py-1.5 text-[10px] text-stone-600 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-300 dark:hover:bg-white/[0.07]"
                :disabled="!canTest"
                @click="testConnection"
              >
                {{ testing ? '测试中…' : '测试连接' }}
              </button>
            </div>
          </div>

          <footer
            class="flex items-center justify-between gap-3 border-t border-stone-200/70 px-6 py-4 dark:border-white/[0.08]"
          >
            <button
              type="button"
              class="text-[10px] text-stone-400 transition-colors hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-35 dark:text-zinc-500 dark:hover:text-rose-400"
              :disabled="!ai.hasKey && !draft.apiKey"
              @click="clearKey"
            >
              清除本机 Key
            </button>
            <button
              type="button"
              class="inline-flex h-9 items-center rounded-full bg-stone-900 px-4 text-[11px] font-medium text-white transition-colors hover:bg-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/60 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              @click="save"
            >
              保存设置
            </button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.ai-switch {
  width: 2.25rem;
  height: 1.25rem;
  flex: none;
  cursor: pointer;
  appearance: none;
  border: 1px solid rgb(214 211 209 / 0.9);
  border-radius: 9999px;
  background: rgb(245 245 244);
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.ai-switch::after {
  content: '';
  display: block;
  width: 0.875rem;
  height: 0.875rem;
  margin: 0.125rem;
  border-radius: 9999px;
  background: white;
  box-shadow: 0 1px 2px rgb(41 37 36 / 0.18);
  transition: transform 180ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ai-switch:checked {
  border-color: rgb(180 83 9 / 0.55);
  background: rgb(217 119 6 / 0.78);
}

.ai-switch:checked::after {
  transform: translateX(1rem);
}

.dark .ai-switch {
  border-color: rgb(255 255 255 / 0.14);
  background: rgb(255 255 255 / 0.06);
}

.dark .ai-switch:checked {
  border-color: rgb(253 230 138 / 0.28);
  background: rgb(180 83 9 / 0.72);
}

.ai-settings-enter-active,
.ai-settings-leave-active {
  transition: opacity 180ms ease;
}

.ai-settings-enter-active section,
.ai-settings-leave-active section {
  transition:
    opacity 200ms ease,
    transform 260ms cubic-bezier(0.22, 1, 0.36, 1);
}

.ai-settings-enter-from,
.ai-settings-leave-to {
  opacity: 0;
}

.ai-settings-enter-from section,
.ai-settings-leave-to section {
  opacity: 0;
  transform: translateY(-10px) scale(0.975);
}

@media (prefers-reduced-motion: reduce) {
  .ai-settings-enter-active,
  .ai-settings-leave-active,
  .ai-settings-enter-active section,
  .ai-settings-leave-active section,
  .ai-switch,
  .ai-switch::after {
    transition: none;
  }
}
</style>
