const DEEPSEEK_CHAT_ENDPOINT = 'https://api.deepseek.com/chat/completions'
const MAX_REQUEST_BYTES = 64 * 1024

function json(status: number, code: string, message: string) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Content-Type': 'application/json; charset=utf-8',
    },
  })
}

export const config = { runtime: 'edge' }

export default async function handler(request: Request) {
  if (request.method !== 'POST') {
    return json(405, 'method_not_allowed', 'Only POST is supported.')
  }

  const authorization = request.headers.get('authorization') ?? ''
  if (authorization.length > 8192 || !/^Bearer\s+\S+$/i.test(authorization)) {
    return json(401, 'missing_key', 'A bearer API key is required.')
  }

  const contentLength = Number(request.headers.get('content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > MAX_REQUEST_BYTES) {
    return json(413, 'payload_too_large', 'Request body is too large.')
  }

  let body: string
  try {
    body = await request.text()
  } catch {
    return json(400, 'invalid_body', 'Unable to read request body.')
  }
  if (new TextEncoder().encode(body).byteLength > MAX_REQUEST_BYTES) {
    return json(413, 'payload_too_large', 'Request body is too large.')
  }

  try {
    const upstream = await fetch(DEEPSEEK_CHAT_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: authorization,
        'Content-Type': 'application/json',
        Accept:
          request.headers.get('accept') === 'text/event-stream'
            ? 'text/event-stream'
            : 'application/json',
      },
      body,
    })

    const headers = new Headers({
      'Cache-Control': 'no-store',
      'Content-Type':
        upstream.headers.get('content-type') ??
        'application/json; charset=utf-8',
    })
    const requestId = upstream.headers.get('x-request-id')
    if (requestId) headers.set('X-Request-Id', requestId)

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    })
  } catch {
    return json(502, 'upstream_unavailable', 'DeepSeek is unreachable.')
  }
}
