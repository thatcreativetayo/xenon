import express from 'express'

import { AUTH_COOKIE_NAME } from '../config/constants.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { unauthorized } from '../lib/errors.js'
import { findUserByToken, publicUser } from '../services/users.js'

export const sessionRouter = express.Router()

/**
 * GET /auth/me
 *
 * Resolves the `xenon_token` cookie to a user. Exists so the cookie set by both
 * login flows can be verified end to end:
 *
 *   curl -i --cookie 'xenon_token=...' http://localhost:4001/auth/me
 */
sessionRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const cookies = req.cookies as Record<string, string | undefined> | undefined
    const token = cookies?.[AUTH_COOKIE_NAME]
    if (!token) {
      throw unauthorized('not_authenticated', 'No session cookie present.')
    }

    const user = await findUserByToken(token)
    if (!user) {
      throw unauthorized('session_invalid', 'That session token does not match a user.')
    }

    res.json({ ok: true, user: publicUser(user) })
  }),
)
