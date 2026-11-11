import type {
  AIChatOptions,
  AIConfig,
  AIErrorCode,
  AIMessage,
} from '../../types/ai'
import { parseTagSuggestions } from './prompts'

interface DeepSeekChoice {
  message?: { content?: unknown }
  delta?: { content?: unknown }
}

interface DeepSeekResponse {
  choices?: DeepSeekChoice[]
  error?: { message?: unknown }
}

export class AIClientError extends Error {
  readonly code: AIErrorCode

  constructor(code: AIErrorCode, message: string) {
    super(message)
    this.name = 'AIClientError'
    this.code = code
  }
}

function responseMessage(payload: DeepSeekResponse | null) {
  const message = payload?.error?.message
  return typeof message === 'string' ? message.slice(0, 300) : ''
}

async function readJson(response: Response): Promise<DeepSeekResponse | null> {
  try {
    return (await response.json()) as DeepSeekResponse
  } catch {
    return null
  }
}

function httpError(status: number, payload: DeepSeekResponse | null) {
  const upstream = responseMessage(payload)

  if (status === 401 || status === 403) {
    return new AIClientError('unauthorized', 'API Key 无效或无权访问当前端点。')
  }
  if (status === 429) {
    return new AIClientError('rate_limited', '请求过于频繁，请稍后再试。')
  }

  return new AIClientError(
    'server',
    upstream || `AI 服务返回 ${status}，请稍后重试。`,
  )
}

function contentFromResponse(payload: DeepSeekResponse | null) {
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string' || !content.trim()) {
    throw new AIClientError('invalid_response', 'AI 没有返回有效内容。')
  }
  return content.trim()
}

function consumeEvent(
  event: string,
  chunks: string[],
  onToken?: (token: string) => void,
) {
  const data = event
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n')
    .trim()

  if (!data || data === '[DONE]') return

  try {
    const payload = JSON.parse(data) as DeepSeekResponse
    const token = payload.choices?.[0]?.delta?.content
    if (typeof token === 'string' && token) {
      chunks.push(token)
      onToken?.(token)
    }
  } catch {
    // Ignore keep-alive and provider-specific events that are not JSON.
  }
}

async function readEventStream(
  response: Response,
  onToken?: (token: string) => void,
) {
  if (!response.body) {
    throw new AIClientError('invalid_response', 'AI 流式响应为空。')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    let boundary = buffer.search(/\r?\n\r?\n/)
    while (boundary >= 0) {
      const match = buffer.slice(boundary).match(/^\r?\n\r?\n/)
      const length = match?.[0].length ?? 2
      const event = buffer.slice(0, boundary)
      buffer = buffer.slice(boundary + length)
      consumeEvent(event, chunks, onToken)
      boundary = buffer.search(/\r?\n\r?\n/)
    }
  }

  buffer += decoder.decode()
  if (buffer.trim()) consumeEvent(buffer, chunks, onToken)

  const content = chunks.join('').trim()
  if (!content) {
    throw new AIClientError('invalid_response', 'AI 流式响应没有有效内容。')
  }
  return content
}

function endpointFor(config: AIConfig) {
  return config.baseUrl.trim().replace(/\/+$/, '')
}

export async function chatCompletion(
  config: AIConfig,
  messages: AIMessage[],
  options: AIChatOptions = {},
) {
  if (!config.apiKey.trim()) {
    throw new AIClientError('missing_key', '请先在 AI 设置中填写 API Key。')
  }
  if (options.signal?.aborted) {
    throw new AIClientError('aborted', 'AI 请求已取消。')
  }

  const controller = new AbortController()
  let timedOut = false
  const timeout = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, options.timeoutMs ?? 25_000)
  const abortExternal = () => controller.abort()
  options.signal?.addEventListener('abort', abortExternal, { once: true })

  try {
    const response = await fetch(endpointFor(config), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: options.stream ? 'text/event-stream' : 'application/json',
        Authorization: `Bearer ${config.apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: Boolean(options.stream),
        max_tokens: options.maxTokens ?? (options.stream ? 120 : 80),
        temperature: options.temperature ?? 0.2,
      }),
      signal: controller.signal,
    })

    if (!response.ok) {
      throw httpError(response.status, await readJson(response))
    }

    if (
      options.stream &&
      response.headers.get('content-type')?.includes('text/event-stream')
    ) {
      return await readEventStream(response, options.onToken)
    }

    return contentFromResponse(await readJson(response))
  } catch (cause) {
    if (cause instanceof AIClientError) throw cause
    if (options.signal?.aborted) {
      throw new AIClientError('aborted', 'AI 请求已取消。')
    }
    if (timedOut) {
      throw new AIClientError('timeout', 'AI 请求超时，请检查网络后重试。')
    }
    throw new AIClientError(
      'network',
      cause instanceof Error
        ? `AI 网络请求失败：${cause.message}`
        : 'AI 网络请求失败。',
    )
  } finally {
    clearTimeout(timeout)
    options.signal?.removeEventListener('abort', abortExternal)
  }
}

export async function testAIConnection(config: AIConfig) {
  const startedAt = performance.now()
  await chatCompletion(
    config,
    [
      { role: 'system', content: '只回复 OK。' },
      { role: 'user', content: '连接测试' },
    ],
    { maxTokens: 4, temperature: 0, timeoutMs: 15_000 },
  )
  return Math.max(1, Math.round(performance.now() - startedAt))
}

export async function inferTags(
  config: AIConfig,
  prompt: string,
  systemPrompt: string,
  signal?: AbortSignal,
) {
  const raw = await chatCompletion(
    config,
    [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: prompt },
    ],
    { maxTokens: 80, temperature: 0.1, timeoutMs: 15_000, signal },
  )
  return parseTagSuggestions(raw)
}
