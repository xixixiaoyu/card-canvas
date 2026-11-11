import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from '../api/deepseek'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('production DeepSeek proxy', () => {
  it('rejects unsupported methods and missing credentials', async () => {
    const getResponse = await handler(
      new Request('https://card-canvas.test/api/deepseek'),
    )
    expect(getResponse.status).toBe(405)

    const unauthorized = await handler(
      new Request('https://card-canvas.test/api/deepseek', {
        method: 'POST',
        body: '{}',
      }),
    )
    expect(unauthorized.status).toBe(401)
  })

  it('forwards only to the fixed DeepSeek endpoint', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"choices":[]}', {
        headers: {
          'content-type': 'application/json',
          'x-request-id': 'request-1',
        },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    const response = await handler(
      new Request('https://card-canvas.test/api/deepseek', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer local-test-key',
          'Content-Type': 'application/json',
        },
        body: '{"model":"deepseek-chat"}',
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('x-request-id')).toBe('request-1')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.deepseek.com/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer local-test-key',
        }),
      }),
    )
  })
})
