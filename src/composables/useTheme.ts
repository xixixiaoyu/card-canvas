import { computed, watchEffect } from 'vue'
import {
  useDark,
  usePreferredDark,
  useStorage,
  useToggle,
} from '@vueuse/core'

type ThemePreference = 'auto' | 'light' | 'dark'

/**
 * Single source of truth for the light / dark theme.
 *
 * useDark keeps the `dark` class on <html> in sync. We pass it a controlled
 * storage ref so the first visit may follow the OS ("auto"), while an explicit
 * click always persists "light" or "dark" — VueUse's default would write
 * "auto" whenever the chosen mode happened to match the OS.
 *
 * disableTransition is turned off so our own CSS can cross-fade the canvas
 * instead of VueUse injecting a transition blocker.
 */
export function useTheme() {
  const systemPrefersDark = usePreferredDark()
  const storedTheme = useStorage<ThemePreference>('card-canvas-theme', 'auto')
  const themePreference = computed<ThemePreference>({
    get: () => storedTheme.value,
    set: (value) => {
      if (value === 'auto') {
        storedTheme.value = systemPrefersDark.value ? 'dark' : 'light'
        return
      }

      storedTheme.value = value
    },
  })

  const isDark = useDark({
    selector: 'html',
    attribute: 'class',
    valueDark: 'dark',
    valueLight: '',
    storageRef: themePreference,
    disableTransition: false,
  })

  const toggleTheme = useToggle(isDark)

  // Keep the mobile browser chrome (theme-color) in step with the canvas.
  watchEffect(() => {
    if (typeof document === 'undefined') return

    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', isDark.value ? '#09090b' : '#f7f6f3')
  })

  return {
    isDark,
    toggleTheme,
  }
}
