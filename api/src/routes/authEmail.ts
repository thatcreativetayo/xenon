import express from 'express'

import { CODE_REQUEST_LIMIT, CODE_TTL_MS } from '../config/constants.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { setAuthCookie } from '../lib/cookies.js'
import { parseCode, parseEmail } from '../lib/validate.js'
import { consumeEmailCode, issueEmailCode } from '../services/emailCodes.js'
import { sendLoginCodeEmail } from '../services/mailer.js'
import { findOrCreateUserByEmail, publicUser } from '../services/users.js'
import { ensureDefaultWorkspace } from '../services/workspaces.js'

export const emailAuthRouter = express.Router()

/**
 * POST /auth/email/request-code
 * Body: { email }
 *
 * Always answers the same way whether or not the address has an account —
 * responding differently would turn this into an account-existence oracle.
 */
emailAuthRouter.post(
  '/request-code',
  asyncHandler(async (req, res) => {
    const email = parseEmail((req.body as { email?: unknown } | undefined)?.email)

    const { code, expiresAt } = await issueEmailCode(email)
    await sendLoginCodeEmail(email, code)

    res.status(202).json({
      ok: true,
      message: 'A sign-in code has been sent.',
      expiresAt: expiresAt.toISOString(),
      expiresInSeconds: CODE_TTL_MS / 1000,
      requestsPerWindow: CODE_REQUEST_LIMIT,
    })
  }),
)

/**
 * POST /auth/email/verify-code
 * Body: { email, code }
 *
 * Consumes the code, finds or creates the user keyed on email, and sets the
 * `xenon_token` cookie. If this address already exists — including an account
 * originally created via Google — the existing row is reused.
 */
emailAuthRouter.post(
  '/verify-code',
  asyncHandler(async (req, res) => {
    const body = req.body as { email?: unknown; code?: unknown } | undefined
    const email = parseEmail(body?.email)
    const code = parseCode(body?.code)

    await consumeEmailCode(email, code)

    const { user, created } = await findOrCreateUserByEmail({ email })
    setAuthCookie(res, user.token)

    if (created) {
      // Non-fatal: GET /api/workspaces lazily re-provisions if this fails.
      await ensureDefaultWorkspace(user).catch((err) =>
        console.error('[workspace] default provisioning failed:', err),
      )
    }

    console.log(`[auth] email login ${created ? 'created' : 'reused'} user ${email}`)

    res.status(200).json({
      ok: true,
      created,
      user: publicUser(user),
    })
  }),
)
