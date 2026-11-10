<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Cloud,
  KeyRound,
  Mail,
  X,
} from '@lucide/vue'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

type EmailStep = 'form' | 'code' | 'link'
type EmailMethod = 'code' | 'link'

const auth = useAuthStore()
const email = ref('')
const code = ref('')
const step = ref<EmailStep>('form')
const emailMethod = ref<EmailMethod>(auth.isEmailCodeEnabled ? 'code' : 'link')
const emailInput = ref<HTMLInputElement | null>(null)
const codeInput = ref<HTMLInputElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
let previousFocus: HTMLElement | null = null
let keydownBound = false

const title = computed(() => {
  if (step.value === 'code') return '输入验证码'
  if (step.value === 'link') return '检查你的邮箱'
  return '连接 Card Canvas'
})

const description = computed(() => {
  if (step.value === 'code') {
    return `验证码已发送至 ${email.value.trim()}，输入邮件中的 6 位数字即可登录。`
  }
  if (step.value === 'link') {
    return `登录链接已发送至 ${email.value.trim()}。点击邮件中的链接即可回到当前白板。`
  }
  return '登录后，本地卡片会在后台同步到你的私有云端工作区；断网时仍然照常编辑。'
})

function close() {
  if (!props.open) return
  emit('update:open', false)
}

function handleWindowKeydown(event: KeyboardEvent) {
  if (!props.open) return

  if (event.key === 'Escape') {
    event.preventDefault()
    event.stopImmediatePropagation()
    close()
    return
  }

  if (event.key !== 'Tab') return
  const panel = panelEl.value
  if (!panel) return

  const focusable = [
    ...panel.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  ].filter((element) => element.getClientRects().length > 0)
  if (!focusable.length) return

  const first = focusable[0]
  const last = focusable[focusable.length - 1]
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

async function focusCurrentStep() {
  await nextTick()
  if (step.value === 'code') codeInput.value?.focus()
  else if (step.value === 'form') emailInput.value?.focus()
  else closeButton.value?.focus()
}

async function attachInteraction() {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  code.value = ''
  step.value = 'form'
  emailMethod.value = auth.isEmailCodeEnabled ? 'code' : 'link'

  if (!keydownBound) {
    window.addEventListener('keydown', handleWindowKeydown)
    keydownBound = true
  }

  await focusCurrentStep()
}

function detachInteraction() {
  if (keydownBound) {
    window.removeEventListener('keydown', handleWindowKeydown)
    keydownBound = false
  }
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

async function sendEmail() {
  const ok =
    auth.isEmailCodeEnabled && emailMethod.value === 'code'
      ? await auth.sendEmailCode(email.value)
      : await auth.sendMagicLink(email.value)
  if (!ok) return

  step.value =
    auth.isEmailCodeEnabled && emailMethod.value === 'code' ? 'code' : 'link'
  code.value = ''
  await focusCurrentStep()
}

async function verifyCode() {
  const ok = await auth.verifyEmailCode(email.value, code.value)
  if (!ok) return
  close()
}

async function resendCode() {
  const ok = await auth.sendEmailCode(email.value)
  if (!ok) return
  code.value = ''
  await focusCurrentStep()
}

async function changeEmail() {
  auth.error = null
  code.value = ''
  step.value = 'form'
  await focusCurrentStep()
}

async function signInWithGitHub() {
  await auth.signInWithGitHub()
}

function normalizeCode(event: Event) {
  const input = event.target as HTMLInputElement
  code.value = input.value.replace(/\D/g, '').slice(0, 6)
}

watch(
  () => props.open,
  (open) => {
    if (open) void attachInteraction()
    else detachInteraction()
  },
)

onBeforeUnmount(detachInteraction)
</script>

<template>
  <Teleport to="body">
    <Transition name="auth-modal">
      <div
        v-if="open"
        class="fixed inset-0 z-[88] flex items-center justify-center px-4"
        data-auth-modal
        @pointerdown.self="close"
      >
        <div
          class="absolute inset-0 bg-stone-950/20 backdrop-blur-[4px] dark:bg-black/55"
          aria-hidden="true"
          @pointerdown="close"
        />

        <section
          ref="panelEl"
          class="relative w-full max-w-[26rem] overflow-hidden rounded-[24px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] p-5 shadow-[0_36px_120px_-30px_rgba(41,37,36,0.55)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_46px_140px_-32px_rgba(0,0,0,0.95)]"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          @pointerdown.stop
        >
          <button
            ref="closeButton"
            type="button"
            class="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-stone-400 transition-colors hover:bg-stone-200/70 hover:text-stone-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:text-zinc-500 dark:hover:bg-white/[0.08] dark:hover:text-zinc-200"
            aria-label="关闭登录"
            @click="close"
          >
            <X :size="14" :stroke-width="1.8" aria-hidden="true" />
          </button>

          <div
            class="flex h-10 w-10 items-center justify-center rounded-[12px] border border-stone-200/80 bg-white/65 text-amber-700/80 dark:border-white/10 dark:bg-white/[0.04] dark:text-amber-200/80"
          >
            <Cloud :size="18" :stroke-width="1.55" aria-hidden="true" />
          </div>

          <p
            class="mt-4 font-mono text-[8px] uppercase tracking-[0.21em] text-stone-400 dark:text-zinc-500"
          >
            Cloud workspace
          </p>
          <h2
            id="auth-modal-title"
            class="mt-1.5 font-serif text-[22px] tracking-[-0.025em] text-stone-800 dark:text-zinc-100"
          >
            {{ title }}
          </h2>
          <p
            class="mt-2 text-[12px] leading-6 text-stone-500 dark:text-zinc-400"
          >
            {{ description }}
          </p>

          <template v-if="step === 'form'">
            <button
              type="button"
              class="mt-5 flex h-11 w-full items-center justify-center gap-2.5 rounded-full border border-stone-300/80 bg-white/65 text-[11px] font-medium text-stone-700 shadow-sm transition hover:border-stone-400 hover:bg-white disabled:cursor-wait disabled:opacity-55 dark:border-white/12 dark:bg-white/[0.05] dark:text-zinc-200 dark:hover:border-white/20 dark:hover:bg-white/[0.08]"
              :disabled="auth.loading"
              @click="signInWithGitHub"
            >
              <svg
                viewBox="0 0 24 24"
                class="h-4 w-4 fill-current"
                aria-hidden="true"
              >
                <path
                  d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2.2c-3.22.7-3.9-1.37-3.9-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.2 1.77 1.2 1.04 1.77 2.72 1.26 3.38.96.1-.75.4-1.26.73-1.55-2.57-.3-5.27-1.29-5.27-5.69 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.47.11-3.06 0 0 .97-.31 3.16 1.18a10.9 10.9 0 0 1 5.75 0c2.19-1.49 3.16-1.18 3.16-1.18.63 1.59.23 2.77.11 3.06.74.81 1.19 1.84 1.19 3.1 0 4.41-2.71 5.39-5.29 5.68.42.36.79 1.08.79 2.18v3.23c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z"
                />
              </svg>
              使用 GitHub 登录
            </button>

            <div class="my-4 flex items-center gap-3">
              <span
                class="h-px flex-1 bg-stone-200/80 dark:bg-white/10"
                aria-hidden="true"
              />
              <span
                class="font-mono text-[8px] uppercase tracking-[0.15em] text-stone-400 dark:text-zinc-600"
              >
                或
              </span>
              <span
                class="h-px flex-1 bg-stone-200/80 dark:bg-white/10"
                aria-hidden="true"
              />
            </div>

            <form @submit.prevent="sendEmail">
              <div
                v-if="auth.isEmailCodeEnabled"
                class="flex rounded-full border border-stone-200/80 bg-stone-100/55 p-0.5 dark:border-white/8 dark:bg-white/[0.035]"
                role="tablist"
                aria-label="邮箱登录方式"
              >
                <button
                  type="button"
                  class="h-7 flex-1 rounded-full text-[10px] transition-colors"
                  :class="
                    emailMethod === 'code'
                      ? 'bg-white text-stone-800 shadow-sm dark:bg-white/[0.09] dark:text-zinc-100'
                      : 'text-stone-400 dark:text-zinc-500'
                  "
                  role="tab"
                  :aria-selected="emailMethod === 'code'"
                  @click="emailMethod = 'code'"
                >
                  验证码
                </button>
                <button
                  type="button"
                  class="h-7 flex-1 rounded-full text-[10px] transition-colors"
                  :class="
                    emailMethod === 'link'
                      ? 'bg-white text-stone-800 shadow-sm dark:bg-white/[0.09] dark:text-zinc-100'
                      : 'text-stone-400 dark:text-zinc-500'
                  "
                  role="tab"
                  :aria-selected="emailMethod === 'link'"
                  @click="emailMethod = 'link'"
                >
                  登录链接
                </button>
              </div>

              <label
                for="cloud-auth-email"
                class="mt-4 block text-[10px] font-medium text-stone-600 dark:text-zinc-300"
              >
                邮箱
              </label>
              <div class="relative mt-2">
                <Mail
                  :size="14"
                  :stroke-width="1.7"
                  class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-500"
                  aria-hidden="true"
                />
                <input
                  id="cloud-auth-email"
                  ref="emailInput"
                  v-model="email"
                  type="email"
                  autocomplete="email"
                  required
                  class="h-11 w-full rounded-full border border-stone-200/90 bg-white/75 pl-10 pr-4 text-[12px] text-stone-800 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:focus:border-amber-200/25 dark:focus:ring-amber-200/10"
                  placeholder="you@example.com"
                />
              </div>

              <p
                v-if="auth.error"
                class="mt-2 text-[10px] leading-5 text-rose-600 dark:text-rose-300"
                role="alert"
              >
                {{ auth.error }}
              </p>

              <button
                type="submit"
                class="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-stone-900 text-[11px] font-medium text-stone-50 transition hover:bg-stone-800 disabled:cursor-wait disabled:opacity-55 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
                :disabled="auth.loading"
              >
                {{
                  auth.loading
                    ? '正在发送…'
                    : auth.isEmailCodeEnabled && emailMethod === 'code'
                      ? '发送验证码'
                      : '发送登录链接'
                }}
                <ArrowRight
                  v-if="!auth.loading"
                  :size="14"
                  :stroke-width="1.8"
                  aria-hidden="true"
                />
              </button>
            </form>
          </template>

          <form
            v-else-if="step === 'code'"
            class="mt-5"
            @submit.prevent="verifyCode"
          >
            <label
              for="cloud-auth-code"
              class="text-[10px] font-medium text-stone-600 dark:text-zinc-300"
            >
              6 位验证码
            </label>
            <div class="relative mt-2">
              <KeyRound
                :size="14"
                :stroke-width="1.7"
                class="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-zinc-500"
                aria-hidden="true"
              />
              <input
                id="cloud-auth-code"
                ref="codeInput"
                :value="code"
                type="text"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
                required
                class="h-12 w-full rounded-full border border-stone-200/90 bg-white/75 pl-10 pr-4 font-mono text-[18px] tracking-[0.28em] text-stone-800 outline-none transition focus:border-amber-700/30 focus:ring-2 focus:ring-amber-500/15 dark:border-white/10 dark:bg-white/[0.04] dark:text-zinc-100 dark:focus:border-amber-200/25 dark:focus:ring-amber-200/10"
                placeholder="000000"
                @input="normalizeCode"
              />
            </div>

            <p
              v-if="auth.error"
              class="mt-2 text-[10px] leading-5 text-rose-600 dark:text-rose-300"
              role="alert"
            >
              {{ auth.error }}
            </p>

            <button
              type="submit"
              class="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-full bg-stone-900 text-[11px] font-medium text-stone-50 transition hover:bg-stone-800 disabled:cursor-wait disabled:opacity-55 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
              :disabled="auth.loading"
            >
              {{ auth.loading ? '正在验证…' : '验证并登录' }}
              <ArrowRight
                v-if="!auth.loading"
                :size="14"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </button>

            <div class="mt-3 flex items-center justify-between px-1">
              <button
                type="button"
                class="flex items-center gap-1 text-[10px] text-stone-500 transition-colors hover:text-stone-800 dark:text-zinc-500 dark:hover:text-zinc-200"
                @click="changeEmail"
              >
                <ArrowLeft :size="11" :stroke-width="1.8" aria-hidden="true" />
                更换邮箱
              </button>
              <button
                type="button"
                class="text-[10px] text-stone-500 transition-colors hover:text-stone-800 disabled:cursor-wait disabled:opacity-50 dark:text-zinc-500 dark:hover:text-zinc-200"
                :disabled="auth.loading"
                @click="resendCode"
              >
                重新发送
              </button>
            </div>
          </form>

          <div v-else class="mt-5">
            <div
              class="flex items-center gap-2 rounded-2xl border border-emerald-600/15 bg-emerald-500/[0.06] px-3.5 py-3 text-[11px] text-emerald-700 dark:border-emerald-300/15 dark:text-emerald-300"
            >
              <Check :size="14" :stroke-width="1.9" aria-hidden="true" />
              邮件可能延迟几秒，请同时检查垃圾邮件。
            </div>
            <button
              type="button"
              class="mt-3 flex h-10 items-center gap-1.5 px-1 text-[10px] text-stone-500 transition-colors hover:text-stone-800 dark:text-zinc-500 dark:hover:text-zinc-200"
              @click="changeEmail"
            >
              <ArrowLeft :size="11" :stroke-width="1.8" aria-hidden="true" />
              更换邮箱
            </button>
          </div>

          <p
            class="mt-4 font-mono text-[8px] uppercase tracking-[0.14em] text-stone-400 dark:text-zinc-600"
          >
            {{
              auth.isEmailCodeEnabled
                ? 'GitHub · Email code · Magic link'
                : 'GitHub · Magic link'
            }}
          </p>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.auth-modal-enter-active,
.auth-modal-leave-active {
  transition: opacity 180ms ease;
}

.auth-modal-enter-active section,
.auth-modal-leave-active section {
  transition:
    opacity 180ms ease,
    transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}

.auth-modal-enter-from,
.auth-modal-leave-to,
.auth-modal-enter-from section,
.auth-modal-leave-to section {
  opacity: 0;
}

.auth-modal-enter-from section {
  transform: translateY(10px) scale(0.98);
}

.auth-modal-leave-to section {
  transform: translateY(6px) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  .auth-modal-enter-active,
  .auth-modal-leave-active,
  .auth-modal-enter-active section,
  .auth-modal-leave-active section {
    transition: none;
  }
}
</style>
