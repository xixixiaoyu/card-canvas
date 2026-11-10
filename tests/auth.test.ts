import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

const authApi = vi.hoisted(() => ({
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithOtp: vi.fn(),
  signOut: vi.fn(),
  verifyOtp: vi.fn(),
}))

vi.mock('../src/lib/supabase', () => ({
  isSupabaseConfigured: true,
  isEmailCodeEnabled: true,
  syncClientId: 'test-client',
  getSupabaseClient: vi.fn().mockResolvedValue({ auth: authApi }),
}))

import { useAuthStore } from '../src/stores/auth'

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    window.history.replaceState({}, '', '/')
  })

  it('surfaces and clears an OAuth redirect error', async () => {
    window.history.replaceState(
      {},
      '',
      '/?error=server_error&error_description=Unable+to+exchange+external+code',
    )
    authApi.onAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: vi.fn() } },
    })
    authApi.getSession.mockResolvedValue({
      data: { session: null },
      error: null,
    })
    const auth = useAuthStore()

    await auth.initialize()

    expect(auth.error).toBe('Unable to exchange external code')
    expect(auth.initialized).toBe(true)
    expect(window.location.search).toBe('')
  })

  it('sends an email code through the passwordless endpoint', async () => {
    authApi.signInWithOtp.mockResolvedValue({ error: null })
    const auth = useAuthStore()

    await expect(auth.sendEmailCode('user@example.com')).resolves.toBe(true)
    expect(authApi.signInWithOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      options: { shouldCreateUser: true },
    })
  })

  it('verifies a six-digit email code and applies the session', async () => {
    const session = {
      access_token: 'access',
      refresh_token: 'refresh',
      user: { id: 'user-1', email: 'user@example.com' },
    }
    authApi.verifyOtp.mockResolvedValue({ data: { session }, error: null })
    const auth = useAuthStore()

    await expect(
      auth.verifyEmailCode('user@example.com', '123 456'),
    ).resolves.toBe(true)
    expect(authApi.verifyOtp).toHaveBeenCalledWith({
      email: 'user@example.com',
      token: '123456',
      type: 'email',
    })
    expect(auth.isAuthenticated).toBe(true)
    expect(auth.email).toBe('user@example.com')
  })

  it('rejects malformed codes before calling Supabase', async () => {
    const auth = useAuthStore()

    await expect(auth.verifyEmailCode('user@example.com', '123')).resolves.toBe(
      false,
    )
    expect(authApi.verifyOtp).not.toHaveBeenCalled()
  })

  it('starts GitHub OAuth with the current origin as redirect', async () => {
    authApi.signInWithOAuth.mockResolvedValue({ error: null })
    const auth = useAuthStore()

    await expect(auth.signInWithGitHub()).resolves.toBe(true)
    expect(authApi.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: { redirectTo: window.location.origin },
    })
  })
})
