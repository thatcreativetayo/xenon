import type { Request } from 'express'

import { AUTH_COOKIE_NAME } from '../config/constants.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { unauthorized } from '../lib/errors.js'
import type { UserDoc } from '../models/User.js'
import { findUserByToken } from '../services/users.js'

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth. Read it via currentUser(req) in handlers. */
      user?: UserDoc
    }
  }
}

/**
 * Resolves the `xenon_token` cookie to a User and attaches it as `req.user`.
 * 401s with a stable code when the cookie is missing or stale. Mount in front
 * of every /api route — nothing behind it needs to re-check the cookie.
 */
export const requireAuth = asyncHandler(async (req, _res, next) => {
  const cookies = req.cookies as Record<string, string | undefined> | undefined
  const token = cookies?.[AUTH_COOKIE_NAME]
  if (!token) {
    throw unauthorized('not_authenticated', 'No session cookie present.')
  }

  const user = await findUserByToken(token)
  if (!user) {
    throw unauthorized('session_invalid', 'That session token does not match a user.')
  }

  req.user = user
  next()
})

/**
 * Typed accessor for the user requireAuth attached. Throwing (rather than
 * returning undefined) keeps handlers free of repetitive null checks while
 * still failing loudly if a route forgot the middleware.
 */
export function currentUser(req: Request): UserDoc {
  if (!req.user) {
    throw unauthorized('not_authenticated', 'This route requires authentication.')
  }
  return req.user
}
