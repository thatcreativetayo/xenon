import { randomBytes, randomInt } from 'node:crypto'

/**
 * Opaque 256-bit session token, hex encoded. Stored on the user document and
 * handed to the client in the `xenon_token` cookie.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Six-digit numeric login code. Uses `randomInt` (CSPRNG) rather than
 * `Math.random`, and pads so that codes like `000123` stay six characters.
 */
export function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** URL-safe random value for the OAuth `state` parameter. */
export function generateOAuthState(): string {
  return randomBytes(16).toString('hex')
}
