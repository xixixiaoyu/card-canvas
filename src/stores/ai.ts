import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import {
  clearAISecret,
  DEFAULT_AI_CONFIG,
  loadAIConfig,
  normalizeAIConfig,
  saveAIConfig,
} from '../lib/ai/config'
import type { AIConfig } from '../types/ai'

export const useAIStore = defineStore('ai', () => {
  const config = ref<AIConfig>(loadAIConfig())

  const hasKey = computed(() => Boolean(config.value.apiKey))
  const wormholeEnabled = computed(
    () => hasKey.value && config.value.enableWormhole,
  )
  const autoTagsEnabled = computed(
    () => hasKey.value && config.value.enableAutoTags,
  )

  function save(next: AIConfig) {
    config.value = saveAIConfig(normalizeAIConfig(next))
    return config.value
  }

  function clearKey() {
    config.value = clearAISecret(config.value)
  }

  function reset() {
    config.value = saveAIConfig({ ...DEFAULT_AI_CONFIG })
  }

  return {
    config,
    hasKey,
    wormholeEnabled,
    autoTagsEnabled,
    save,
    clearKey,
    reset,
  }
})
