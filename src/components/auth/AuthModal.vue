<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { ArrowRight, Check, Cloud, Mail, X } from '@lucide/vue'
import { useAuthStore } from '../../stores/auth'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  'update:open': [value: boolean]
}>()

const auth = useAuthStore()
const email = ref('')
const sent = ref(false)
const emailInput = ref<HTMLInputElement | null>(null)
const closeButton = ref<HTMLButtonElement | null>(null)
let previousFocus: HTMLElement | null = null
let keydownBound = false

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

  if (event.key === 'Tab') {
    const focusable: HTMLElement[] = []
    if (emailInput.value) focusable.push(emailInput.value)
    if (closeButton.value) focusable.push(closeButton.value)
    if (!focusable.length) return

    const currentIndex = focusable.indexOf(
      document.activeElement as HTMLElement,
    )
    const nextIndex = event.shiftKey
      ? currentIndex <= 0
        ? focusable.length - 1
        : currentIndex - 1
      : (currentIndex + 1) % focusable.length

    event.preventDefault()
    focusable[nextIndex]?.focus()
  }
}

async function attachInteraction() {
  previousFocus =
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  auth.error = null
  sent.value = false
  if (!keydownBound) {
    window.addEventListener('keydown', handleWindowKeydown)
    keydownBound = true
  }

  await nextTick()
  if (sent.value) closeButton.value?.focus()
  else emailInput.value?.focus()
}

function detachInteraction() {
  if (keydownBound) {
    window.removeEventListener('keydown', handleWindowKeydown)
    keydownBound = false
  }
  if (previousFocus?.isConnected) previousFocus.focus()
  previousFocus = null
}

async function submit() {
  const ok = await auth.sendMagicLink(email.value)
  if (!ok) return

  sent.value = true
  await nextTick()
  closeButton.value?.focus()
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
          class="relative w-full max-w-[25rem] overflow-hidden rounded-[24px] border border-stone-200/80 bg-[#fdfbf7]/[0.98] p-5 shadow-[0_36px_120px_-30px_rgba(41,37,36,0.55)] backdrop-blur-2xl dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_46px_140px_-32px_rgba(0,0,0,0.95)]"
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
            {{ sent ? '检查你的邮箱' : '连接 Card Canvas' }}
          </h2>
          <p
            class="mt-2 text-[12px] leading-6 text-stone-500 dark:text-zinc-400"
          >
            {{
              sent
                ? `登录链接已发送至 ${email.trim()}。点击邮件中的链接即可回到当前白板。`
                : '登录后，本地卡片会在后台同步到你的私有云端工作区；断网时仍然照常编辑。'
            }}
          </p>

          <div
            v-if="sent"
            class="mt-5 flex items-center gap-2 rounded-2xl border border-emerald-600/15 bg-emerald-500/[0.06] px-3.5 py-3 text-[11px] text-emerald-700 dark:border-emerald-300/15 dark:text-emerald-300"
          >
            <Check :size="14" :stroke-width="1.9" aria-hidden="true" />
            邮件可能延迟几秒，请同时检查垃圾邮件。
          </div>

          <form v-else class="mt-5" @submit.prevent="submit">
            <label
              for="cloud-auth-email"
              class="text-[10px] font-medium text-stone-600 dark:text-zinc-300"
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
              {{ auth.loading ? '正在发送…' : '发送登录链接' }}
              <ArrowRight
                v-if="!auth.loading"
                :size="14"
                :stroke-width="1.8"
                aria-hidden="true"
              />
            </button>
          </form>

          <p
            class="mt-4 font-mono text-[8px] uppercase tracking-[0.14em] text-stone-400 dark:text-zinc-600"
          >
            Magic link · No password
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
