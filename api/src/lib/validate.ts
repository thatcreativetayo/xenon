import { badRequest } from './errors.js'

// Deliberately permissive: one @, no spaces, a dot in the domain. Real
// validation is "did the code arrive in the inbox".
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/

/**
 * Lowercases and trims. Every read and write of an email goes through this, so
 * `Foo@Example.com` and `foo@example.com` resolve to the same account — without
 * it, "email is the source of truth" would silently allow case-variant
 * duplicates.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

/** Normalizes and validates, throwing a 400 for anything unusable. */
export function parseEmail(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest('email_required', 'A non-empty "email" string is required.')
  }
  const email = normalizeEmail(value)
  if (email.length > 320 || !EMAIL_PATTERN.test(email)) {
    throw badRequest('email_invalid', 'That does not look like a valid email address.')
  }
  return email
}

/** Validates a submitted one-time code's shape before hitting the database. */
export function parseCode(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest('code_required', 'A non-empty "code" string is required.')
  }
  const code = value.trim()
  if (!/^\d{6}$/.test(code)) {
    throw badRequest('code_invalid', 'The code must be six digits.')
  }
  return code
}
