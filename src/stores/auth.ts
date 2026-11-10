import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { Session, Subscription, User } from '@supabase/supabase-js'
import {
  getSupabaseClient,
  isEmailCodeEnabled,
  isSupabaseConfigured,
} from '../lib/supabase'

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

  function readAndClearRedirectError() {
    const search = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.slice(1))
    const message =
      search.get('error_description') ??
      hash.get('error_description') ??
      search.get('error') ??
      hash.get('error')

    if (!message) return null

    for (const key of ['error', 'error_code', 'error_description']) {
      search.delete(key)
      hash.delete(key)
    }

    const nextSearch = search.toString()
    const nextHash = hash.toString()
    window.history.replaceState(
      window.history.state,
      '',
      `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${
        nextHash ? `#${nextHash}` : ''
      }`,
    )
    return message
  }

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
        error.value = readAndClearRedirectError()
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
        if (!error.value) {
          error.value =
            cause instanceof Error ? cause.message : '无法读取云端登录状态。'
        }
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

  async function sendEmailCode(address: string) {
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
          shouldCreateUser: true,
        },
      })
      if (authError) throw authError
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '验证码发送失败。'
      return false
    } finally {
      loading.value = false
    }
  }

  async function verifyEmailCode(address: string, token: string) {
    const normalized = address.trim()
    const normalizedToken = token.replace(/\s/g, '')
    if (!normalized || !/^\d{6}$/.test(normalizedToken)) {
      error.value = '请输入 6 位邮箱验证码。'
      return false
    }

    loading.value = true
    error.value = null

    try {
      const supabase = await getSupabaseClient()
      if (!supabase) throw new Error('当前部署未配置 Supabase。')

      const { data, error: authError } = await supabase.auth.verifyOtp({
        email: normalized,
        token: normalizedToken,
        type: 'email',
      })
      if (authError) throw authError
      if (!data.session) throw new Error('验证码验证成功，但会话未建立。')

      applySession(data.session)
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '验证码验证失败。'
      return false
    } finally {
      loading.value = false
    }
  }

  async function signInWithGitHub() {
    loading.value = true
    error.value = null

    try {
      const supabase = await getSupabaseClient()
      if (!supabase) throw new Error('当前部署未配置 Supabase。')

      const { error: authError } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
        },
      })
      if (authError) throw authError
      return true
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : 'GitHub 登录失败。'
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
    isEmailCodeEnabled,
    isAuthenticated,
    email,
    initialize,
    sendMagicLink,
    sendEmailCode,
    verifyEmailCode,
    signInWithGitHub,
    signOut,
    dispose,
  }
})
