/**
 * An error carrying an HTTP status and a stable machine-readable code, so route
 * handlers can throw and let one error middleware shape the response.
 */
export class HttpError extends Error {
  readonly status: number
  readonly code: string
  readonly details: Record<string, unknown> | undefined

  constructor(
    status: number,
    code: string,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message)
    this.name = 'HttpError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (code: string, message: string, details?: Record<string, unknown>) =>
  new HttpError(400, code, message, details)

export const unauthorized = (code: string, message: string) => new HttpError(401, code, message)

/**
 * Used where the caller is authenticated and the resource genuinely is theirs,
 * but the action is refused anyway — a plan limit, or an owner-only operation.
 * Distinct from the 404s that access checks return: hiding a workspace the
 * caller can already see would only confuse them.
 */
export const forbidden = (code: string, message: string, details?: Record<string, unknown>) =>
  new HttpError(403, code, message, details)

export const notFound = (code: string, message: string) => new HttpError(404, code, message)

export const conflict = (code: string, message: string) => new HttpError(409, code, message)

export const tooManyRequests = (
  code: string,
  message: string,
  details?: Record<string, unknown>,
) => new HttpError(429, code, message, details)

export const badGateway = (code: string, message: string) => new HttpError(502, code, message)

export const gatewayTimeout = (code: string, message: string) => new HttpError(504, code, message)

/** True for a MongoDB duplicate-key error (unique index violation). */
export function isDuplicateKeyError(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: number }).code === 11000
}
