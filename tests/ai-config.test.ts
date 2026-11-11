import { beforeEach, describe, expect, it } from 'vitest'
import {
  AI_CONFIG_STORAGE_KEY,
  clearAISecret,
  DEFAULT_AI_CONFIG,
  loadAIConfig,
  normalizeAIConfig,
  saveAIConfig,
} from '../src/lib/ai/config'

describe('AI configuration', () => {
  beforeEach(() => localStorage.clear())

  it('normalizes safe defaults and rejects non-http endpoints', () => {
    expect(
      normalizeAIConfig({
        apiKey: '  key-123  ',
        baseUrl: 'javascript:alert(1)',
        enableWormhole: false,
      }),
    ).toEqual({
      apiKey: 'key-123',
      baseUrl: '/api/deepseek',
      model: 'deepseek-flash',
      enableWormhole: false,
      enableAutoTags: true,
      enableAutoTitle: true,
    })
    expect(normalizeAIConfig(null)).toEqual(DEFAULT_AI_CONFIG)
  })

  it('persists only in localStorage and supports key removal', () => {
    const saved = saveAIConfig({
      ...DEFAULT_AI_CONFIG,
      apiKey: 'local-key',
      baseUrl: 'https://example.com/v1/chat/completions',
    })

    expect(saved.apiKey).toBe('local-key')
    expect(loadAIConfig().baseUrl).toBe(
      'https://example.com/v1/chat/completions',
    )
    expect(localStorage.getItem(AI_CONFIG_STORAGE_KEY)).toContain('local-key')

    expect(clearAISecret(saved).apiKey).toBe('')
    expect(loadAIConfig().apiKey).toBe('')
  })

  it('falls back safely when stored JSON is corrupt', () => {
    localStorage.setItem(AI_CONFIG_STORAGE_KEY, '{not-json')
    expect(loadAIConfig()).toEqual(DEFAULT_AI_CONFIG)
  })

  it('migrates the retired default model without overriding custom endpoints', () => {
    expect(
      normalizeAIConfig({
        baseUrl: '/api/deepseek',
        model: 'deepseek-chat',
      }).model,
    ).toBe('deepseek-flash')
    expect(
      normalizeAIConfig({
        baseUrl: 'https://example.com/v1/chat/completions',
        model: 'deepseek-chat',
      }).model,
    ).toBe('deepseek-chat')
  })
})
