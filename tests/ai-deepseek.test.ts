import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  AIClientError,
  chatCompletion,
  inferTags,
} from '../src/lib/ai/deepseek'
import { DEFAULT_AI_CONFIG } from '../src/lib/ai/config'

const config = {
  ...DEFAULT_AI_CONFIG,
  apiKey: 'test-key',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('DeepSeek client', () => {
  it('sends a same-origin request and parses a normal response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: '底层节律共享' } }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      chatCompletion(config, [{ role: 'user', content: '分析' }]),
    ).resolves.toBe('底层节律共享')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [endpoint, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(endpoint).toBe('/api/deepseek')
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer test-key',
    })
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: 'deepseek-flash',
      thinking: { type: 'disabled' },
    })
  })

  it('does not send DeepSeek-only thinking options to custom endpoints', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({
        choices: [{ message: { content: 'OK' } }],
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await chatCompletion(
      {
        ...config,
        baseUrl: 'https://example.com/v1/chat/completions',
        model: 'custom-model',
      },
      [{ role: 'user', content: 'test' }],
    )

    const init = fetchMock.mock.calls[0][1] as RequestInit
    const body = JSON.parse(String(init.body))
    expect(body.model).toBe('custom-model')
    expect(body).not.toHaveProperty('thinking')
  })

  it('parses split SSE chunks and reports tokens as they arrive', async () => {
    const payload = [
      'data: {"choices":[{"delta":{"content":"共享"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"节律"}}]}\n\n',
      'data: [DONE]\n\n',
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(payload[0].slice(0, 23)))
        controller.enqueue(encoder.encode(payload[0].slice(23) + payload[1]))
        controller.enqueue(encoder.encode(payload[2]))
        controller.close()
      },
    })
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(stream, {
          headers: { 'content-type': 'text/event-stream' },
        }),
      ),
    )
    const tokens: string[] = []

    await expect(
      chatCompletion(config, [{ role: 'user', content: '分析' }], {
        stream: true,
        onToken: (token) => tokens.push(token),
      }),
    ).resolves.toBe('共享节律')
    expect(tokens).toEqual(['共享', '节律'])
  })

  it('maps auth failures and parses inferred tags', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: { message: 'invalid key' } }, { status: 401 }),
        ),
    )

    await expect(
      chatCompletion(config, [{ role: 'user', content: 'test' }]),
    ).rejects.toMatchObject({
      code: 'unauthorized',
    } satisfies Pick<AIClientError, 'code'>)

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: {
                content: '心理学/防御机制，声乐/共鸣',
              },
            },
          ],
        }),
      ),
    )
    await expect(inferTags(config, 'prompt', 'system')).resolves.toEqual([
      '心理学/防御机制',
      '声乐/共鸣',
    ])
  })

  it('turns an insufficient balance response into an actionable error', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: { message: 'Insufficient Balance' } },
            { status: 402 },
          ),
        ),
    )

    await expect(
      chatCompletion(config, [{ role: 'user', content: 'test' }]),
    ).rejects.toMatchObject({
      code: 'insufficient_balance',
    })
  })

  it('explains a response truncated before final content', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        Response.json({
          choices: [
            {
              message: { content: '' },
              finish_reason: 'length',
            },
          ],
        }),
      ),
    )

    await expect(
      chatCompletion(config, [{ role: 'user', content: 'test' }]),
    ).rejects.toMatchObject({
      code: 'truncated',
      message: 'AI 在生成有效内容前达到了长度上限，请重试。',
    })
  })

  it('fails before making a request when the key is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      chatCompletion(DEFAULT_AI_CONFIG, [{ role: 'user', content: 'test' }]),
    ).rejects.toMatchObject({ code: 'missing_key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
