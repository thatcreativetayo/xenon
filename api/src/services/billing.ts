import { createHmac, timingSafeEqual } from 'node:crypto'

import { PRO_PLAN_AMOUNT_KOBO, PRO_PLAN_PERIOD_MS } from '../config/constants.js'
import { env } from '../config/env.js'
import { badGateway, badRequest } from '../lib/errors.js'
import { UserModel } from '../models/User.js'
import type { UserDoc } from '../models/User.js'

/**
 * Paystack integration.
 *
 * Two things are load-bearing and neither is optional:
 *
 *   1. Nothing the *browser* tells us about a payment is trusted. The callback
 *      carries a reference in a query param, and anyone can type one; the plan
 *      is only granted after asking Paystack directly what that reference is
 *      worth (`verifyTransaction`).
 *   2. Webhook bodies are authenticated by HMAC before being parsed as meaning
 *      anything. The endpoint is public by necessity, so the signature is the
 *      only thing separating Paystack from a stranger with curl.
 */

const PAYSTACK_BASE = 'https://api.paystack.co'

/** Shared shape of every Paystack REST reply. */
interface PaystackEnvelope<T> {
  status: boolean
  message?: string
  data?: T
}

async function paystack<T>(
  path: string,
  init?: { method: 'GET' | 'POST'; body?: unknown },
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${PAYSTACK_BASE}${path}`, {
      method: init?.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${env.paystackSecretKey}`,
        'Content-Type': 'application/json',
      },
      ...(init?.body === undefined ? {} : { body: JSON.stringify(init.body) }),
      signal: AbortSignal.timeout(15_000),
    })
  } catch (err) {
    console.error('[billing] Paystack request failed:', err)
    throw badGateway('paystack_unreachable', 'Could not reach the payment provider.')
  }

  const payload = (await response.json().catch(() => null)) as PaystackEnvelope<T> | null

  if (!response.ok || !payload?.status || payload.data === undefined) {
    console.error(
      `[billing] Paystack ${path} -> ${response.status}: ${payload?.message ?? 'no message'}`,
    )
    throw badGateway('paystack_error', 'The payment provider rejected that request.')
  }

  return payload.data
}

/**
 * Starts a checkout. The amount is fixed server-side — accepting it from the
 * client would let anyone buy Pro for one kobo.
 */
export async function initializeTransaction(user: UserDoc): Promise<{
  authorizationUrl: string
  reference: string
}> {
  if (!user.email) {
    throw badRequest('email_required', 'Add an email address to your account before subscribing.')
  }

  const data = await paystack<{ authorization_url: string; reference: string }>(
    '/transaction/initialize',
    {
      method: 'POST',
      body: {
        email: user.email,
        amount: PRO_PLAN_AMOUNT_KOBO,
        currency: 'NGN',
        callback_url: `${env.apiUrl}/api/billing/callback`,
        // Echoed back on verify and in webhooks, so the payment can be tied to an
        // account without trusting anything the browser carries.
        metadata: { userId: String(user._id) },
      },
    },
  )

  return { authorizationUrl: data.authorization_url, reference: data.reference }
}

export interface VerifiedTransaction {
  status: string
  reference: string
  amount: number
  userId: string | null
  customerCode: string | null
  email: string | null
}

/** Asks Paystack what a reference is actually worth. The only source of truth. */
export async function verifyTransaction(reference: string): Promise<VerifiedTransaction> {
  const data = await paystack<{
    status: string
    reference: string
    amount: number
    metadata?: { userId?: unknown } | string
    customer?: { customer_code?: string; email?: string }
  }>(`/transaction/verify/${encodeURIComponent(reference)}`)

  // Paystack returns metadata as an object normally, but as a string when it was
  // set through some dashboard paths.
  let userId: string | null = null
  const metadata =
    typeof data.metadata === 'string'
      ? (JSON.parse(data.metadata) as { userId?: unknown } | null)
      : data.metadata
  if (metadata && typeof metadata.userId === 'string') {
    userId = metadata.userId
  }

  return {
    status: data.status,
    reference: data.reference,
    amount: data.amount,
    userId,
    customerCode: data.customer?.customer_code ?? null,
    email: data.customer?.email ?? null,
  }
}

/**
 * True only if `signature` is Paystack's HMAC-SHA512 of exactly these bytes,
 * keyed with our secret.
 *
 * Takes the raw Buffer, not the parsed body: re-serializing with JSON.stringify
 * would reorder keys and change whitespace, and the digest would never match
 * again — a bug that presents as "webhooks mysteriously all fail". See the
 * express.raw mount in app.ts.
 *
 * Comparison is constant-time. A fast-exit compare leaks how many leading bytes
 * a guess got right, which over enough attempts is enough to forge a digest.
 */
export function verifyWebhookSignature(rawBody: Buffer, signature: unknown): boolean {
  if (typeof signature !== 'string' || signature.length === 0) {
    return false
  }

  const expected = createHmac('sha512', env.paystackSecretKey).update(rawBody).digest('hex')
  const provided = Buffer.from(signature, 'utf8')
  const expectedBuf = Buffer.from(expected, 'utf8')

  // timingSafeEqual throws on a length mismatch, which is itself a (harmless,
  // already-public) length comparison.
  if (provided.length !== expectedBuf.length) {
    return false
  }
  return timingSafeEqual(provided, expectedBuf)
}

/** Moves a user onto pro for one paid period, extending rather than resetting. */
export async function grantProPeriod(
  user: UserDoc,
  input: { customerCode?: string | null; subscriptionCode?: string | null } = {},
): Promise<UserDoc> {
  // Extend from the current expiry when it's still in the future, so a renewal
  // that arrives early doesn't silently shorten what was already paid for.
  const from =
    user.planExpiresAt && user.planExpiresAt.getTime() > Date.now()
      ? user.planExpiresAt.getTime()
      : Date.now()

  user.plan = 'pro'
  user.planExpiresAt = new Date(from + PRO_PLAN_PERIOD_MS)
  if (input.customerCode) {
    user.paystackCustomerCode = input.customerCode
  }
  if (input.subscriptionCode) {
    user.paystackSubscriptionCode = input.subscriptionCode
  }

  await user.save()
  console.log(
    `[billing] ${user.email ?? user._id} is pro until ${user.planExpiresAt.toISOString()}`,
  )
  return user
}

/**
 * Finds the account a webhook is about. Prefers the customer code (stable across
 * renewals, and what subscription events carry) and falls back to email.
 */
export async function findBillingUser(input: {
  userId?: string | null
  customerCode?: string | null
  email?: string | null
}): Promise<UserDoc | null> {
  if (input.userId) {
    const byId = await UserModel.findById(input.userId).catch(() => null)
    if (byId) return byId
  }
  if (input.customerCode) {
    const byCode = await UserModel.findOne({ paystackCustomerCode: input.customerCode })
    if (byCode) return byCode
  }
  if (input.email) {
    const byEmail = await UserModel.findOne({ email: input.email.trim().toLowerCase() })
    if (byEmail) return byEmail
  }
  return null
}
