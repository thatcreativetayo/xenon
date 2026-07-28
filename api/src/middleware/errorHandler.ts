import type { NextFunction, Request, Response } from 'express'

import { HttpError } from '../lib/errors.js'
import { isProduction } from '../config/env.js'

/** Terminal 404 for unmatched routes. */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    ok: false,
    error: { code: 'not_found', message: `No route for ${req.method} ${req.path}` },
  })
}

/**
 * Single place that turns thrown errors into responses. Anything that is not an
 * HttpError is treated as a bug: logged in full, reported as a bare 500 so
 * internals never reach the client.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (res.headersSent) {
    next(err)
    return
  }

  if (err instanceof HttpError) {
    if (err.status === 429) {
      const retryAfter = err.details?.['retryAfterSeconds']
      if (typeof retryAfter === 'number') {
        res.set('Retry-After', String(retryAfter))
      }
    }

    res.status(err.status).json({
      ok: false,
      error: {
        code: err.code,
        message: err.message,
        ...(err.details ? { details: err.details } : {}),
      },
    })
    return
  }

  // Malformed JSON body — express.json() raises this before any handler runs.
  if (
    typeof err === 'object' &&
    err !== null &&
    (err as { type?: string }).type === 'entity.parse.failed'
  ) {
    res.status(400).json({
      ok: false,
      error: { code: 'invalid_json', message: 'Request body is not valid JSON.' },
    })
    return
  }

  console.error('[error] unhandled:', err)
  res.status(500).json({
    ok: false,
    error: {
      code: 'internal_error',
      message: 'Something went wrong.',
      ...(isProduction ? {} : { debug: err instanceof Error ? err.message : String(err) }),
    },
  })
}
