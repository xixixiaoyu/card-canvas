import { ref } from 'vue'
import { defineStore } from 'pinia'

export type ToastTone = 'info' | 'success' | 'error'

export interface ToastAction {
  label: string
  run: () => void | Promise<void>
}

export interface ToastOptions {
  tone?: ToastTone
  action?: ToastAction
  /** Milliseconds before auto-dismiss; 0 keeps it until dismissed. */
  timeout?: number
}

export interface ToastItem {
  id: string
  tone: ToastTone
  message: string
  action?: ToastAction
  timeout: number
}

let sequence = 0

/**
 * Small transient feedback queue. Errors stay long enough to be read and can
 * carry a retry action; the store owns the timers so dismissing a toast never
 * leaves a stray callback behind.
 */
export const useToastStore = defineStore('toast', () => {
  const toasts = ref<ToastItem[]>([])
  const timers = new Map<string, ReturnType<typeof setTimeout>>()

  function clearTimer(id: string) {
    const timer = timers.get(id)
    if (timer === undefined) return

    clearTimeout(timer)
    timers.delete(id)
  }

  function dismiss(id: string) {
    clearTimer(id)
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }

  function push(message: string, options: ToastOptions = {}) {
    const id = `toast-${++sequence}`
    const timeout =
      options.timeout ??
      (options.action ? 10_000 : options.tone === 'error' ? 6_000 : 4_000)

    const toast: ToastItem = {
      id,
      tone: options.tone ?? 'info',
      message,
      action: options.action,
      timeout,
    }

    toasts.value = [...toasts.value, toast]

    while (toasts.value.length > 4) {
      dismiss(toasts.value[0].id)
    }

    if (timeout > 0) {
      timers.set(
        id,
        setTimeout(() => dismiss(id), timeout),
      )
    }

    return id
  }

  async function runAction(id: string) {
    const toast = toasts.value.find((entry) => entry.id === id)
    if (!toast?.action) {
      dismiss(id)
      return
    }

    try {
      await toast.action.run()
    } finally {
      dismiss(id)
    }
  }

  function clear() {
    for (const id of timers.keys()) clearTimer(id)
    toasts.value = []
  }

  return {
    toasts,
    push,
    dismiss,
    runAction,
    clear,
  }
})
