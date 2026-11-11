import type { AIConfig } from '../../types/ai'

export const AI_CONFIG_STORAGE_KEY = 'card-canvas:deepseek-config'
export const DEFAULT_AI_ENDPOINT = '/api/deepseek'
export const DEFAULT_AI_MODEL = 'deepseek-flash'
export const DEEPSEEK_API_KEYS_URL = 'https://platform.deepseek.com/api_keys'

export const DEFAULT_AI_CONFIG: AIConfig = {
  apiKey: '',
  baseUrl: DEFAULT_AI_ENDPOINT,
  model: DEFAULT_AI_MODEL,
  enableWormhole: true,
  enableAutoTags: true,
  enableAutoTitle: true,
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {}
}

function normalizeEndpoint(value: unknown) {
  if (typeof value !== 'string') return DEFAULT_AI_ENDPOINT
  const endpoint = value.trim()
  if (!endpoint) return DEFAULT_AI_ENDPOINT

  if (endpoint.startsWith('/')) {
    return endpoint.startsWith('//') ? DEFAULT_AI_ENDPOINT : endpoint
  }

  try {
    const url = new URL(endpoint)
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? endpoint
      : DEFAULT_AI_ENDPOINT
  } catch {
    return DEFAULT_AI_ENDPOINT
  }
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

export function normalizeAIConfig(value: unknown): AIConfig {
  const source = asRecord(value)
  const baseUrl = normalizeEndpoint(source.baseUrl)
  const sourceModel =
    typeof source.model === 'string' ? source.model.trim().slice(0, 160) : ''
  const model =
    !sourceModel ||
    (sourceModel === 'deepseek-chat' && baseUrl === DEFAULT_AI_ENDPOINT)
      ? DEFAULT_AI_MODEL
      : sourceModel

  return {
    apiKey:
      typeof source.apiKey === 'string'
        ? source.apiKey.trim().slice(0, 4096)
        : '',
    baseUrl,
    model,
    enableWormhole: source.enableWormhole !== false,
    enableAutoTags: source.enableAutoTags !== false,
    enableAutoTitle: source.enableAutoTitle !== false,
  }
}

export function loadAIConfig(storage: Storage | null = browserStorage()) {
  try {
    const raw = storage?.getItem(AI_CONFIG_STORAGE_KEY)
    return raw ? normalizeAIConfig(JSON.parse(raw)) : { ...DEFAULT_AI_CONFIG }
  } catch {
    return { ...DEFAULT_AI_CONFIG }
  }
}

export function saveAIConfig(
  config: AIConfig,
  storage: Storage | null = browserStorage(),
) {
  const normalized = normalizeAIConfig(config)

  try {
    storage?.setItem(AI_CONFIG_STORAGE_KEY, JSON.stringify(normalized))
  } catch {
    // Private browsing can reject localStorage. Keep the in-memory config.
  }

  return normalized
}

export function clearAISecret(
  config: AIConfig,
  storage: Storage | null = browserStorage(),
) {
  return saveAIConfig({ ...config, apiKey: '' }, storage)
}
