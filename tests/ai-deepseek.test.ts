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

  it('fails before making a request when the key is empty', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      chatCompletion(DEFAULT_AI_CONFIG, [{ role: 'user', content: 'test' }]),
    ).rejects.toMatchObject({ code: 'missing_key' })
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
