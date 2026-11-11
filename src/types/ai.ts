export interface AIConfig {
  apiKey: string
  baseUrl: string
  model: string
  enableWormhole: boolean
  enableAutoTags: boolean
}

export interface AIMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export type AIErrorCode =
  | 'missing_key'
  | 'unauthorized'
  | 'rate_limited'
  | 'network'
  | 'timeout'
  | 'aborted'
  | 'invalid_response'
  | 'server'

export interface AIChatOptions {
  stream?: boolean
  maxTokens?: number
  temperature?: number
  timeoutMs?: number
  signal?: AbortSignal
  onToken?: (token: string) => void
}
