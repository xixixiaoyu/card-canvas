<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  Check,
  Cloud,
  CloudOff,
  LoaderCircle,
  LogOut,
  RefreshCw,
  TriangleAlert,
  UserRound,
} from '@lucide/vue'
import { useAuthStore } from '../../stores/auth'
import { useSyncStore } from '../../stores/sync'
import AuthModal from './AuthModal.vue'

const auth = useAuthStore()
const sync = useSyncStore()
const rootEl = ref<HTMLElement | null>(null)
const menuOpen = ref(false)
const authOpen = ref(false)

const initial = computed(() => auth.email.slice(0, 1).toUpperCase() || 'C')
const statusTone = computed(() => {
  if (sync.phase === 'synced') return 'text-emerald-600 dark:text-emerald-300'
  if (sync.phase === 'error' || sync.phase === 'locked') {
    return 'text-rose-600 dark:text-rose-300'
  }
  if (sync.phase === 'offline') return 'text-amber-700 dark:text-amber-300'
  return 'text-stone-400 dark:text-zinc-500'
})

function closeMenu() {
  menuOpen.value = false
}

function toggle() {
  if (!auth.isAuthenticated) {
    authOpen.value = true
    return
  }
  menuOpen.value = !menuOpen.value
}

function handlePointerDown(event: PointerEvent) {
  if (!menuOpen.value) return
  const target = event.target
  if (target instanceof Node && rootEl.value?.contains(target)) return
  closeMenu()
}

function handleKeydown(event: KeyboardEvent) {
  if (!menuOpen.value || event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  closeMenu()
}

async function signOut() {
  closeMenu()
  await auth.signOut()
}

async function syncNow() {
  await sync.synchronize()
}

watch(
  () => auth.isAuthenticated,
  (authenticated) => {
    if (authenticated) authOpen.value = false
    else closeMenu()
  },
)

onMounted(() => {
  document.addEventListener('pointerdown', handlePointerDown)
  document.addEventListener('keydown', handleKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', handlePointerDown)
  document.removeEventListener('keydown', handleKeydown)
})
</script>

<template>
  <div
    v-if="auth.isConfigured"
    ref="rootEl"
    class="pointer-events-auto relative"
    data-canvas-ui
  >
    <button
      type="button"
      class="flex h-10 items-center gap-2 rounded-full border border-stone-200/80 bg-white/60 py-1 pl-1 pr-2.5 text-stone-500 shadow-[0_1px_2px_rgba(41,37,36,0.04)] backdrop-blur-xl transition-[background-color,border-color,color,box-shadow] duration-300 hover:border-stone-300/90 hover:bg-white hover:text-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-400/50 dark:border-white/10 dark:bg-zinc-900/60 dark:text-zinc-400 dark:hover:border-white/20 dark:hover:bg-zinc-900 dark:hover:text-zinc-100 dark:focus-visible:ring-white/30"
      :aria-label="auth.isAuthenticated ? '云端账号' : '登录云端同步'"
      aria-haspopup="menu"
      :aria-expanded="menuOpen"
      :title="auth.isAuthenticated ? auth.email : '登录云端同步'"
      @click="toggle"
    >
      <span
        class="relative flex h-8 w-8 items-center justify-center rounded-full bg-stone-100/80 text-stone-600 dark:bg-white/[0.06] dark:text-zinc-300"
      >
        <span
          v-if="auth.isAuthenticated"
          class="font-serif text-[11px] font-medium"
        >
          {{ initial }}
        </span>
        <Cloud v-else :size="14" :stroke-width="1.7" aria-hidden="true" />
        <span
          v-if="auth.isAuthenticated"
          class="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full border border-white dark:border-zinc-900"
          :class="{
            'bg-emerald-500': sync.phase === 'synced',
            'bg-amber-500':
              sync.phase === 'offline' || sync.phase === 'syncing',
            'bg-rose-500': sync.phase === 'error' || sync.phase === 'locked',
            'bg-stone-400': sync.phase === 'idle',
          }"
          aria-hidden="true"
        />
      </span>
      <span
        class="hidden text-[10px] font-medium uppercase tracking-[0.15em] lg:inline"
      >
        {{ auth.isAuthenticated ? 'Cloud' : 'Login' }}
      </span>
    </button>

    <Transition name="cloud-menu">
      <div
        v-if="menuOpen"
        class="fixed left-3 right-3 top-16 z-50 overflow-hidden rounded-2xl border border-stone-200/80 bg-[#fdfbf7]/[0.98] shadow-[0_24px_70px_-24px_rgba(41,37,36,0.4)] backdrop-blur-2xl sm:absolute sm:left-auto sm:right-0 sm:top-12 sm:w-72 dark:border-white/10 dark:bg-zinc-900/[0.98] dark:shadow-[0_30px_80px_-24px_rgba(0,0,0,0.9)]"
        role="menu"
        aria-label="云端账号"
      >
        <div
          class="border-b border-stone-200/70 p-3.5 dark:border-white/[0.08]"
        >
          <div class="flex items-center gap-2.5">
            <span
              class="flex h-8 w-8 items-center justify-center rounded-full bg-stone-100/80 text-stone-600 dark:bg-white/[0.06] dark:text-zinc-300"
            >
              <UserRound :size="14" :stroke-width="1.7" aria-hidden="true" />
            </span>
            <div class="min-w-0">
              <p class="truncate text-[11px] text-stone-700 dark:text-zinc-200">
                {{ auth.email }}
              </p>
              <p
                class="mt-0.5 flex items-center gap-1.5 font-mono text-[8px] uppercase tracking-[0.13em]"
                :class="statusTone"
              >
                <LoaderCircle
                  v-if="sync.phase === 'syncing'"
                  :size="9"
                  class="animate-spin"
                  aria-hidden="true"
                />
                <Check
                  v-else-if="sync.phase === 'synced'"
                  :size="9"
                  aria-hidden="true"
                />
                <TriangleAlert
                  v-else-if="sync.phase === 'error' || sync.phase === 'locked'"
                  :size="9"
                  aria-hidden="true"
                />
                <CloudOff
                  v-else-if="sync.phase === 'offline'"
                  :size="9"
                  aria-hidden="true"
                />
                <Cloud v-else :size="9" aria-hidden="true" />
                {{ sync.label }} · {{ sync.pendingCount }} 待传
              </p>
            </div>
          </div>
          <p
            v-if="sync.error"
            class="mt-2.5 rounded-xl bg-rose-500/[0.06] px-2.5 py-2 text-[9px] leading-4 text-rose-600 dark:text-rose-300"
          >
            {{ sync.error }}
          </p>
        </div>

        <div class="flex flex-col p-1.5">
          <button
            type="button"
            class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[11px] text-stone-600 transition-colors hover:bg-stone-100/70 hover:text-stone-900 disabled:cursor-wait disabled:opacity-50 dark:text-zinc-400 dark:hover:bg-white/[0.04] dark:hover:text-zinc-100"
            role="menuitem"
            :disabled="sync.isBusy || sync.phase === 'locked'"
            @click="syncNow"
          >
            <RefreshCw
              :size="13"
              :stroke-width="1.7"
              :class="{ 'animate-spin': sync.isBusy }"
              aria-hidden="true"
            />
            立即同步
          </button>
          <button
            type="button"
            class="flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left text-[11px] text-stone-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:text-zinc-400 dark:hover:bg-rose-500/[0.08] dark:hover:text-rose-300"
            role="menuitem"
            :disabled="auth.loading"
            @click="signOut"
          >
            <LogOut :size="13" :stroke-width="1.7" aria-hidden="true" />
            退出云端账号
          </button>
        </div>
      </div>
    </Transition>

    <AuthModal v-model:open="authOpen" />
  </div>
</template>

<style scoped>
.cloud-menu-enter-active,
.cloud-menu-leave-active {
  transition:
    opacity 160ms ease,
    transform 200ms cubic-bezier(0.22, 1, 0.36, 1);
}

.cloud-menu-enter-from,
.cloud-menu-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.98);
}

@media (prefers-reduced-motion: reduce) {
  .cloud-menu-enter-active,
  .cloud-menu-leave-active {
    transition: none;
  }
}
</style>
