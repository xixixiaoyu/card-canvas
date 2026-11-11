import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import ToastStack from '../src/components/ui/ToastStack.vue'
import { useToastStore } from '../src/stores/toast'

function mountToasts() {
  const pinia = createPinia()
  setActivePinia(pinia)

  return mount(ToastStack, {
    global: { plugins: [pinia] },
    attachTo: document.body,
  })
}

describe('ToastStack', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    useToastStore().clear()
    document.body.innerHTML = ''
  })

  it('renders an error toast with a working retry action', async () => {
    const wrapper = mountToasts()
    const run = vi.fn()
    const toast = useToastStore()

    toast.push('投放失败', {
      tone: 'error',
      action: { label: '重试', run },
    })
    await nextTick()

    expect(document.body.textContent).toContain('投放失败')

    const retry = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '重试',
    )
    expect(retry).toBeDefined()
    retry!.click()

    await vi.waitFor(() => {
      expect(run).toHaveBeenCalledOnce()
      expect(toast.toasts).toHaveLength(0)
    })

    wrapper.unmount()
  })

  it('dismisses a toast with the close button', async () => {
    const wrapper = mountToasts()
    const toast = useToastStore()
    toast.push('普通提示')
    await nextTick()

    const close = document.body.querySelector<HTMLButtonElement>(
      'button[aria-label="关闭提示"]',
    )
    expect(close).not.toBeNull()
    close!.click()
    await nextTick()

    expect(toast.toasts).toHaveLength(0)
    wrapper.unmount()
  })

  it('replaces a failed action with a retryable error message', async () => {
    const wrapper = mountToasts()
    const toast = useToastStore()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    toast.push('删除失败', {
      tone: 'error',
      action: {
        label: '重试',
        run: () => Promise.reject(new Error('disk full')),
      },
    })
    await nextTick()

    const retry = [...document.body.querySelectorAll('button')].find(
      (button) => button.textContent?.trim() === '重试',
    )
    retry!.click()

    await vi.waitFor(() => {
      expect(toast.toasts).toHaveLength(1)
      expect(toast.toasts[0]).toMatchObject({
        message: '操作失败，请重试。',
        tone: 'error',
      })
    })

    wrapper.unmount()
  })
})
