import { env } from '../config/env.js'
import { badGateway, badRequest } from '../lib/errors.js'

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v2/userinfo'

export interface GoogleProfile {
  googleId: string
  email: string
  emailVerified: boolean
  name: string | undefined
}

/** Consent-screen URL the browser is sent to when a login starts. */
export function buildGoogleAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    // Always show the picker so testing a second account doesn't silently reuse
    // the first one's session.
    prompt: 'select_account',
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/** Trades the one-time `code` from the callback for an access token. */
async function exchangeCodeForAccessToken(code: string): Promise<string> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: 'authorization_code',
    }),
  })

  const body = (await response.json().catch(() => null)) as
    | { access_token?: string; error?: string; error_description?: string }
    | null

  if (!response.ok || !body?.access_token) {
    console.error('[google] token exchange failed:', response.status, body)
    // `redirect_uri_mismatch` here means GOOGLE_REDIRECT_URI and the Authorized
    // redirect URI in the Cloud Console are not byte-identical.
    throw badGateway(
      'google_token_exchange_failed',
      body?.error_description ?? body?.error ?? 'Google rejected the authorization code.',
    )
  }

  return body.access_token
}

/** Reads the profile behind an access token. */
async function fetchGoogleProfile(accessToken: string): Promise<GoogleProfile> {
  const response = await fetch(GOOGLE_USERINFO_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  const body = (await response.json().catch(() => null)) as
    | {
        id?: string
        email?: string
        verified_email?: boolean
        email_verified?: boolean
        name?: string
      }
    | null

  if (!response.ok || !body?.id || !body.email) {
    console.error('[google] userinfo failed:', response.status, body)
    throw badGateway('google_userinfo_failed', 'Could not read your Google profile.')
  }

  return {
    googleId: body.id,
    email: body.email,
    // The v2 endpoint returns `verified_email`; OIDC-style responses use
    // `email_verified`. Accept either, and treat a missing flag as unverified.
    emailVerified: body.verified_email ?? body.email_verified ?? false,
    name: body.name,
  }
}

/**
 * Full callback exchange. Rejects unverified addresses: because Xenon matches
 * accounts on email alone, accepting an unverified one would let someone claim
 * an existing account by typing its address into a Google profile.
 */
export async function resolveGoogleProfileFromCode(code: string): Promise<GoogleProfile> {
  const accessToken = await exchangeCodeForAccessToken(code)
  const profile = await fetchGoogleProfile(accessToken)

  if (!profile.emailVerified) {
    throw badRequest(
      'google_email_unverified',
      'Your Google account email is not verified, so it cannot be used to sign in.',
    )
  }

  return profile
}
