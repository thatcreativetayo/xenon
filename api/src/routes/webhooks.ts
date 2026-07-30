import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { findBillingUser, grantProPeriod, verifyWebhookSignature } from '../services/billing.js'

/**
 * Paystack webhooks. This is how a plan stays correct after the first payment —
 * renewals extend it, failures and cancellations let it lapse.
 *
 * Mounted with `express.raw` rather than the global JSON parser, because the
 * signature covers the exact bytes Paystack sent. Parsing first and
 * re-serializing would reorder keys and never match. See app.ts.
 */
export const webhooksRouter = express.Router()

interface PaystackEvent {
  event?: unknown
  data?: {
    status?: unknown
    amount?: unknown
    reference?: unknown
    subscription_code?: unknown
    customer?: { customer_code?: unknown; email?: unknown }
    metadata?: unknown
  }
}

/** Pulls the identifiers an event carries, whatever kind it is. */
function identify(data: PaystackEvent['data']): {
  userId: string | null
  customerCode: string | null
  email: string | null
  subscriptionCode: string | null
} {
  let userId: string | null = null
  const raw = data?.metadata
  const metadata = typeof raw === 'string' ? safeParse(raw) : raw
  if (metadata && typeof metadata === 'object' && 'userId' in metadata) {
    const candidate = (metadata as { userId?: unknown }).userId
    if (typeof candidate === 'string') userId = candidate
  }

  const customer = data?.customer
  return {
    userId,
    customerCode: typeof customer?.customer_code === 'string' ? customer.customer_code : null,
    email: typeof customer?.email === 'string' ? customer.email : null,
    subscriptionCode:
      typeof data?.subscription_code === 'string' ? data.subscription_code : null,
  }
}

function safeParse(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * POST /api/webhooks/paystack — no session, authenticated by HMAC.
 *
 * Returns 200 for anything genuinely signed, including events we ignore:
 * Paystack retries non-2xx responses, and retrying an event we've decided not to
 * act on accomplishes nothing. A bad signature gets 401 and no explanation.
 */
webhooksRouter.post(
  '/paystack',
  asyncHandler(async (req, res) => {
    const rawBody = Buffer.isBuffer(req.body) ? req.body : null

    if (!rawBody || !verifyWebhookSignature(rawBody, req.headers['x-paystack-signature'])) {
      console.warn('[webhook] rejected a Paystack payload with a bad or missing signature')
      res.status(401).json({
        ok: false,
        error: { code: 'invalid_signature', message: 'Signature verification failed.' },
      })
      return
    }

    const payload = safeParse(rawBody.toString('utf8')) as PaystackEvent | null
    const event = typeof payload?.event === 'string' ? payload.event : ''
    const data = payload?.data
    const ids = identify(data)

    // Acknowledge first-class: past this point the payload is trusted, and any
    // failure to act on it is ours to log, not Paystack's to retry forever.
    switch (event) {
      case 'charge.success':
      case 'subscription.create':
      case 'invoice.update':
      case 'invoice.payment_failed':
      case 'subscription.not_renew':
      case 'subscription.disable':
        break
      default:
        console.log(`[webhook] ignoring Paystack event "${event}"`)
        res.json({ ok: true, ignored: true })
        return
    }

    const user = await findBillingUser(ids)
    if (!user) {
      console.error(`[webhook] no account matched "${event}" (customer ${ids.customerCode})`)
      res.json({ ok: true, matched: false })
      return
    }

    switch (event) {
      // A renewal charge. `invoice.update` carries a status; only a paid one counts.
      case 'invoice.update': {
        if (data?.status !== 'success') {
          console.log(`[webhook] invoice.update for ${user.email ?? user._id} was "${data?.status}"`)
          break
        }
        await grantProPeriod(user, {
          customerCode: ids.customerCode,
          subscriptionCode: ids.subscriptionCode,
        })
        break
      }

      case 'charge.success':
        await grantProPeriod(user, {
          customerCode: ids.customerCode,
          subscriptionCode: ids.subscriptionCode,
        })
        break

      // Record the subscription without touching the period — the charge event
      // that accompanies it is what pays for time.
      case 'subscription.create':
        if (ids.subscriptionCode) {
          user.paystackSubscriptionCode = ids.subscriptionCode
        }
        if (ids.customerCode) {
          user.paystackCustomerCode = ids.customerCode
        }
        await user.save()
        break

      /**
       * Cancelled or failed. Deliberately does NOT revoke access now: the user
       * paid through `planExpiresAt`, and effectivePlan() already treats that
       * date as the real boundary. Cutting them off mid-period would be taking
       * back something already bought.
       */
      case 'invoice.payment_failed':
      case 'subscription.not_renew':
      case 'subscription.disable':
        user.paystackSubscriptionCode = undefined
        await user.save()
        console.log(
          `[webhook] ${event} for ${user.email ?? user._id}; pro runs out at ${
            user.planExpiresAt?.toISOString() ?? 'unset'
          }`,
        )
        break
    }

    res.json({ ok: true })
  }),
)
