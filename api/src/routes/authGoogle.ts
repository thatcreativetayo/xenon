import express from 'express'
import { timingSafeEqual } from 'node:crypto'

import { OAUTH_STATE_COOKIE_NAME } from '../config/constants.js'
import { env } from '../config/env.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { clearOAuthStateCookie, setAuthCookie, setOAuthStateCookie } from '../lib/cookies.js'
import { badRequest } from '../lib/errors.js'
import { generateOAuthState } from '../lib/tokens.js'
import { buildGoogleAuthUrl, resolveGoogleProfileFromCode } from '../services/google.js'
import { findOrCreateUserByGoogle } from '../services/users.js'
import { ensureDefaultWorkspace } from '../services/workspaces.js'

export const googleAuthRouter = express.Router()

/** Reads a query parameter only when it arrived as a single string value. */
function queryString(value: unknown): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined
}

function statesMatch(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/**
 * GET /auth/google
 *
 * Starts the flow. The `state` value is stashed in a short-lived httpOnly cookie
 * and re-checked in the callback, so a callback URL replayed by someone else
 * cannot log this browser into an attacker's account.
 */
googleAuthRouter.get('/', (_req, res) => {
  const state = generateOAuthState()
  setOAuthStateCookie(res, state)
  res.redirect(buildGoogleAuthUrl(state))
})

/**
 * GET /auth/google/callback
 *
 * Exchanges the code, resolves the verified Google email, then finds or creates
 * the user keyed on that email — attaching `googleId` to an existing row rather
 * than creating a duplicate. Sets `xenon_token` and redirects into the app.
 */
googleAuthRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const oauthError = queryString(req.query.error)
    const code = queryString(req.query.code)
    const state = queryString(req.query.state)

    // User hit "Cancel" on the consent screen, or the app is in Testing mode and
    // this account is not on the test-user list (error=access_denied).
    if (oauthError) {
      throw badRequest('google_oauth_denied', `Google returned an error: ${oauthError}`)
    }

    if (!code) {
      throw badRequest('google_code_missing', 'Google did not return an authorization code.')
    }

    const cookies = req.cookies as Record<string, string | undefined> | undefined
    const expectedState = cookies?.[OAUTH_STATE_COOKIE_NAME]
    if (!expectedState || !state || !statesMatch(state, expectedState)) {
      throw badRequest(
        'google_state_mismatch',
        'OAuth state did not match. Start the sign-in again from /auth/google.',
      )
    }
    clearOAuthStateCookie(res)

    const profile = await resolveGoogleProfileFromCode(code)

    const { user, created, googleIdAttached } = await findOrCreateUserByGoogle({
      email: profile.email,
      googleId: profile.googleId,
      ...(profile.name ? { name: profile.name } : {}),
    })

    setAuthCookie(res, user.token)

    if (created) {
      // Non-fatal: GET /api/workspaces lazily re-provisions if this fails.
      await ensureDefaultWorkspace(user).catch((err) =>
        console.error('[workspace] default provisioning failed:', err),
      )
    }

    console.log(
      created
        ? `[auth] google login created user ${profile.email}`
        : `[auth] google login merged into existing user ${profile.email} (googleId attached: ${googleIdAttached})`,
    )

    res.redirect(env.postLoginRedirect)
  }),
)
