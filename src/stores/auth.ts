import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session, Subscription, User } from '@supabase/supabase-js'
import { getSupabaseClient, isSupabaseConfigured } from '../lib/supabase'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const session = ref<Session | null>(null)
  const initialized = ref(false)
  const loading = ref(false)
  const error = ref<string | null>(null)

  let initPromise: Promise<void> | null = null
  let subscription: Subscription | null = null

  const isAuthenticated = computed(() => Boolean(user.value))
  const email = computed(() => user.value?.email ?? '')

  function applySession(next: Session | null) {
    session.value = next
    user.value = next?.user ?? null
  }

  function initialize() {
    if (initPromise) return initPromise
    if (!isSupabaseConfigured) {
      initialized.value = true
      return Promise.resolve()
    }

    initPromise = (async () => {
      try {
        const supabase = await getSupabaseClient()
        if (!supabase) throw new Error('Supabase 客户端无法初始化。')

        if (!subscription) {
          const {
            data: { subscription: authSubscription },
          } = supabase.auth.onAuthStateChange((_event, nextSession) => {
            applySession(nextSession)
            initialized.value = true
          })
          subscription = authSubscription
        }

        const { data, error: authError } = await supabase.auth.getSession()
        if (authError) throw authError
        applySession(data.session)
      } catch (cause) {
        error.value =
          cause instanceof Error ? cause.message : '无法读取云端登录状态。'
      } finally {
        initialized.value = true
      }
    })().finally(() => {
      initPromise = null
    })

    return initPromise
  }

  async function sendMagicLink(address: string) {
    const normalized = address.trim()
    if (!normalized) {
      error.value = '请输入邮箱地址。'
      return false
    }

    loading.value = true
    error.value = null

    try {
      const supabase = await getSupabaseClient()
      if (!supabase) throw new Error('当前部署未配置 Supabase。')

      const { error: authError } = await supabase.auth.signInWithOtp({
        email: normalized,
        options: {
          emailRedirectTo: window.location.origin,
        },
      })
      if (authError) throw authError
      return true
    } catch (cause) {
      error.value =
        cause instanceof Error ? cause.message : '登录链接发送失败。'
      return false
    } finally {
      loading.value = false
    }
  }

  async function signOut() {
    loading.value = true
    error.value = null

    try {
      const supabase = await getSupabaseClient()
      if (!supabase) return

      let result = await supabase.auth.signOut()
      if (result.error) {
        result = await supabase.auth.signOut({ scope: 'local' })
      }
      if (result.error) throw result.error
      applySession(null)
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '退出登录失败。'
    } finally {
      loading.value = false
    }
  }

  function dispose() {
    subscription?.unsubscribe()
    subscription = null
  }

  return {
    user,
    session,
    initialized,
    loading,
    error,
    isConfigured: isSupabaseConfigured,
    isAuthenticated,
    email,
    initialize,
    sendMagicLink,
    signOut,
    dispose,
  }
})
