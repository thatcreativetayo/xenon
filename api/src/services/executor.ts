import { EXECUTE_MAX_RESPONSE_BYTES, EXECUTE_TIMEOUT_MS } from '../config/constants.js'
import { badGateway, badRequest, gatewayTimeout } from '../lib/errors.js'
import type { RequestShape } from '../lib/requestShape.js'
import { assertPublicTarget } from '../lib/ssrf.js'
import { RequestHistoryModel } from '../models/RequestHistory.js'
import type { HttpMethod } from '../models/SavedRequest.js'
import type { UserDoc } from '../models/User.js'

export interface ExecutionResult {
  status: number
  statusText: string
  headers: Record<string, string>
  body: string
  bodyTruncated: boolean
  durationMs: number
}

/** Builds the final URL: merges `params` into the query string. */
function buildTargetUrl(shape: RequestShape): URL {
  const url = new URL(shape.url)
  for (const [key, value] of Object.entries(shape.params)) {
    url.searchParams.append(key, value)
  }
  return url
}

/** Applies authType/authConfig to the outgoing headers or query string. */
function applyAuth(url: URL, headers: Record<string, string>, shape: RequestShape): void {
  const config = shape.authConfig
  switch (shape.authType) {
    case 'none':
      return
    case 'apiKey': {
      const key = String(config.key)
      const value = String(config.value)
      if (config.addTo === 'query') {
        url.searchParams.append(key, value)
      } else {
        headers[key] = value
      }
      return
    }
    case 'bearer':
      headers['Authorization'] = `Bearer ${String(config.token)}`
      return
    case 'basic': {
      const encoded = Buffer.from(`${String(config.username)}:${String(config.password)}`).toString(
        'base64',
      )
      headers['Authorization'] = `Basic ${encoded}`
      return
    }
  }
}

// fetch rejects GET requests with a body; every other supported method may carry one.
const BODYLESS_METHODS: ReadonlySet<HttpMethod> = new Set(['GET'])

/**
 * Runs the request server-side (the whole point: the browser can't call
 * arbitrary third-party APIs cross-origin) and returns what came back.
 *
 * - SSRF-checked before any bytes leave the box (see lib/ssrf.ts)
 * - Redirects are NOT followed: following one could hop from a public host to
 *   an internal one, and an API tester should show redirects anyway. The 3xx
 *   response itself (status + Location header) is returned to the caller.
 * - Aborts after EXECUTE_TIMEOUT_MS so a hung target can't pin the connection.
 * - Response bodies are capped at EXECUTE_MAX_RESPONSE_BYTES.
 */
export async function executeHttpRequest(shape: RequestShape): Promise<ExecutionResult> {
  await assertPublicTarget(shape.url)

  const url = buildTargetUrl(shape)
  const headers: Record<string, string> = { ...shape.headers }
  applyAuth(url, headers, shape)

  const includeBody = shape.body !== '' && !BODYLESS_METHODS.has(shape.method)

  const startedAt = Date.now()
  let response: Response
  try {
    response = await fetch(url, {
      method: shape.method,
      headers,
      ...(includeBody ? { body: shape.body } : {}),
      redirect: 'manual',
      signal: AbortSignal.timeout(EXECUTE_TIMEOUT_MS),
    })
  } catch (err) {
    const durationMs = Date.now() - startedAt

    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw gatewayTimeout(
        'target_timeout',
        `The target did not respond within ${EXECUTE_TIMEOUT_MS / 1000}s (waited ${durationMs}ms).`,
      )
    }

    // undici surfaces headers rejected at the HTTP layer (bad characters etc.)
    // as TypeErrors before any connection is made.
    if (err instanceof TypeError && /header/i.test(err.message)) {
      throw badRequest('headers_invalid', `A header was rejected: ${err.message}`)
    }

    const cause = (err as { cause?: { code?: string; message?: string } }).cause
    const detail = cause?.code ?? cause?.message ?? (err instanceof Error ? err.message : 'unknown error')
    throw badGateway('target_unreachable', `Could not reach the target server (${detail}).`)
  }

  const durationMs = Date.now() - startedAt

  const raw = Buffer.from(await response.arrayBuffer())
  const bodyTruncated = raw.length > EXECUTE_MAX_RESPONSE_BYTES
  const body = raw.subarray(0, EXECUTE_MAX_RESPONSE_BYTES).toString('utf8')

  const responseHeaders: Record<string, string> = {}
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value
  })

  return {
    status: response.status,
    statusText: response.statusText,
    headers: responseHeaders,
    body,
    bodyTruncated,
    durationMs,
  }
}

/**
 * Writes the history row for a run. `status: 0` marks runs where the target
 * never answered (timeout / DNS / refused) — still useful in the timeline.
 * Never throws: losing a history row shouldn't fail a request that already ran.
 */
export async function recordHistory(entry: {
  workspaceId: string
  savedRequestId?: string | undefined
  user: UserDoc
  method: HttpMethod
  url: string
  status: number
  durationMs: number
}): Promise<void> {
  try {
    await RequestHistoryModel.create({
      workspaceId: entry.workspaceId,
      ...(entry.savedRequestId ? { savedRequestId: entry.savedRequestId } : {}),
      runByUserId: entry.user._id,
      method: entry.method,
      url: entry.url,
      status: entry.status,
      durationMs: entry.durationMs,
      ranAt: new Date(),
    })
  } catch (err) {
    console.error('[history] failed to record run:', err)
  }
}
