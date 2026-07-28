import {
  CODE_REQUEST_LIMIT,
  CODE_REQUEST_WINDOW_MS,
  CODE_TTL_MS,
} from '../config/constants.js'
import { badRequest, tooManyRequests } from '../lib/errors.js'
import { generateEmailCode } from '../lib/tokens.js'
import { CodeRequestModel } from '../models/CodeRequest.js'
import { EmailCodeModel } from '../models/EmailCode.js'

/**
 * Enforces "at most CODE_REQUEST_LIMIT requests per email per window".
 *
 * The window is evaluated with an explicit `createdAt` comparison rather than by
 * trusting the TTL index, because Mongo's expiry sweep runs about once a minute
 * and would otherwise let the effective window drift wider than intended.
 */
async function assertUnderRateLimit(email: string): Promise<void> {
  const windowStart = new Date(Date.now() - CODE_REQUEST_WINDOW_MS)

  // Newest first, so recent[LIMIT - 1] is the request whose expiry frees a slot.
  const recent = await CodeRequestModel.find({ email, createdAt: { $gte: windowStart } })
    .sort({ createdAt: -1 })
    .limit(CODE_REQUEST_LIMIT)
    .lean()

  if (recent.length < CODE_REQUEST_LIMIT) {
    return
  }

  const blocking = recent[CODE_REQUEST_LIMIT - 1]
  const blockingAt = blocking?.createdAt?.getTime() ?? Date.now()
  const retryAfterMs = Math.max(0, blockingAt + CODE_REQUEST_WINDOW_MS - Date.now())
  const retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000))

  throw tooManyRequests(
    'code_request_rate_limited',
    `Too many code requests. Try again in ${retryAfterSeconds} seconds.`,
    { retryAfterSeconds, limit: CODE_REQUEST_LIMIT, windowMinutes: CODE_REQUEST_WINDOW_MS / 60_000 },
  )
}

/**
 * Records the request, mints a code and stores it. Returns the plaintext code
 * for the caller to email.
 *
 * Previous unexpired codes for this email are intentionally left valid, so a
 * user who requests twice can still use whichever email they open first.
 */
export async function issueEmailCode(email: string): Promise<{ code: string; expiresAt: Date }> {
  await assertUnderRateLimit(email)

  // Written before sending so a failing mailer still consumes an attempt —
  // otherwise the rate limit could be sidestepped by triggering send errors.
  await CodeRequestModel.create({ email, createdAt: new Date() })

  const code = generateEmailCode()
  const expiresAt = new Date(Date.now() + CODE_TTL_MS)

  await EmailCodeModel.create({ email, code, expiresAt })

  return { code, expiresAt }
}

/**
 * Atomically claims a matching, unexpired code.
 *
 * `findOneAndDelete` is a single atomic operation, so two concurrent requests
 * carrying the same code cannot both succeed — the code is genuinely single-use.
 * A successful claim also clears any sibling codes for the address.
 */
export async function consumeEmailCode(email: string, code: string): Promise<void> {
  const claimed = await EmailCodeModel.findOneAndDelete({
    email,
    code,
    expiresAt: { $gt: new Date() },
  })

  if (!claimed) {
    // Distinguish expired from wrong, but only after the claim failed, so the
    // happy path stays a single round trip.
    const expired = await EmailCodeModel.findOne({ email, code })
    if (expired) {
      await EmailCodeModel.deleteMany({ email, code })
      throw badRequest('code_expired', 'That code has expired. Request a new one.')
    }
    throw badRequest('code_invalid', 'That code is not valid.')
  }

  // Any other codes outstanding for this address are now moot.
  await EmailCodeModel.deleteMany({ email })
}
