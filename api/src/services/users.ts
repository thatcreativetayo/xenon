import { UserModel } from '../models/User.js'
import type { UserDoc } from '../models/User.js'
import { conflict, isDuplicateKeyError } from '../lib/errors.js'
import { normalizeEmail } from '../lib/validate.js'
import { generateSessionToken } from '../lib/tokens.js'

/**
 * Account identity rules for Xenon.
 *
 * `email` is the single source of truth. Both entry points below upsert on
 * `{ email }`, which is what makes the three merge cases fall out for free:
 *
 *   1. code sign-up, then Google with the same email
 *        -> matched by email, `googleId` attached to the existing row
 *   2. Google sign-up, then code with the same email
 *        -> matched by email, authenticated into the existing row
 *   3. Google sign-up with a different email
 *        -> no match, a genuinely separate row
 *
 * `token` and `createdAt` live in `$setOnInsert`, so an existing user keeps the
 * token they were issued at sign-up and every later login just re-sets the same
 * cookie. A single atomic upsert (rather than find-then-create) also means two
 * simultaneous first-time logins cannot race into duplicate rows.
 *
 * Whether the upsert inserted is determined by checking if the returned document
 * carries the token we generated for `$setOnInsert`: that value is 256 bits of
 * fresh randomness, so it can only be present if this call created the row.
 */

/** Used by the email one-time-code flow. Creates the user if this email is new. */
export async function findOrCreateUserByEmail(input: {
  email: string
  name?: string
}): Promise<{ user: UserDoc; created: boolean }> {
  const email = normalizeEmail(input.email)
  const candidateToken = generateSessionToken()

  const user = await UserModel.findOneAndUpdate(
    { email },
    {
      $setOnInsert: {
        email,
        token: candidateToken,
        createdAt: new Date(),
        ...(input.name ? { name: input.name } : {}),
      },
    },
    { new: true, upsert: true },
  )

  if (!user) {
    // Unreachable with upsert + new, but keeps the return type honest.
    throw new Error(`Upsert for ${email} returned no document`)
  }

  return { user, created: user.token === candidateToken }
}

/**
 * Used by the Google OAuth callback. Attaches `googleId` to whichever row owns
 * this email, creating that row only if the email is genuinely new.
 *
 * Caller must have already confirmed the email is verified by Google — matching
 * on an unverified address would let anyone claim an existing Xenon account by
 * putting its address on a Google profile.
 */
export async function findOrCreateUserByGoogle(input: {
  email: string
  googleId: string
  name?: string
}): Promise<{ user: UserDoc; created: boolean; googleIdAttached: boolean }> {
  const email = normalizeEmail(input.email)
  const candidateToken = generateSessionToken()

  const update: Record<string, unknown> = { googleId: input.googleId }
  if (input.name) {
    update.name = input.name
  }

  try {
    const user = await UserModel.findOneAndUpdate(
      { email },
      {
        $set: update,
        $setOnInsert: {
          email,
          token: candidateToken,
          createdAt: new Date(),
        },
      },
      { new: true, upsert: true },
    )

    if (!user) {
      throw new Error(`Upsert for ${email} returned no document`)
    }

    const created = user.token === candidateToken
    return { user, created, googleIdAttached: !created }
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // This googleId is already bound to a *different* email. Happens when
      // someone changes the address on their Google account and signs in again.
      // Merging automatically would silently take over an unrelated Xenon row,
      // so refuse and let a human decide.
      throw conflict(
        'google_account_linked_elsewhere',
        'That Google account is already linked to a different Xenon user.',
      )
    }
    throw err
  }
}

export async function findUserByToken(token: string): Promise<UserDoc | null> {
  return UserModel.findOne({ token })
}

/** Shape returned to clients — never leaks the session token in a JSON body. */
export function publicUser(user: UserDoc) {
  return {
    id: String(user._id),
    email: user.email ?? null,
    name: user.name ?? null,
    hasGoogleLinked: Boolean(user.googleId),
    createdAt: user.createdAt,
  }
}
