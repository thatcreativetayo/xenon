import express from 'express'

import { PRO_PLAN_AMOUNT_KOBO } from '../config/constants.js'
import { env } from '../config/env.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { currentUser } from '../middleware/requireAuth.js'
import {
  findBillingUser,
  grantProPeriod,
  initializeTransaction,
  verifyTransaction,
} from '../services/billing.js'
import { effectivePlan } from '../services/plans.js'

export const billingRouter = express.Router()

/** POST /api/billing/initialize — returns the Paystack checkout URL. */
billingRouter.post(
  '/initialize',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const { authorizationUrl, reference } = await initializeTransaction(user)

    res.json({
      ok: true,
      authorizationUrl,
      reference,
      amount: PRO_PLAN_AMOUNT_KOBO,
      currency: 'NGN',
    })
  }),
)

/** GET /api/billing/status — what the current user's plan actually is. */
billingRouter.get(
  '/status',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)

    res.json({
      ok: true,
      plan: effectivePlan(user),
      storedPlan: user.plan ?? 'free',
      planExpiresAt: user.planExpiresAt ?? null,
      hasSubscription: Boolean(user.paystackSubscriptionCode),
    })
  }),
)

/**
 * The public half of billing. Separate router because Paystack drives both of
 * these and neither carries our session cookie.
 */
export const publicBillingRouter = express.Router()

/** Sends the browser back to the app with an outcome the UI can render. */
function redirectToApp(res: express.Response, status: 'success' | 'failed' | 'error'): void {
  res.redirect(`${env.frontendUrl}/app?billing=${status}`)
}

/**
 * GET /api/billing/callback?reference=… — where Paystack returns the payer.
 *
 * Unauthenticated by necessity: this is a top-level browser navigation from
 * Paystack's domain, and the session cookie is SameSite-restricted. That's fine,
 * because the reference is not taken at face value — `verifyTransaction` asks
 * Paystack what actually happened, and the account credited comes from the
 * metadata Paystack echoes back, never from a query param. A stranger replaying
 * someone else's reference therefore only re-grants that person's own plan.
 *
 * Always redirects, never renders an error body: a human is looking at this.
 */
publicBillingRouter.get(
  '/callback',
  asyncHandler(async (req, res) => {
    const reference = req.query.reference
    if (typeof reference !== 'string' || reference.trim() === '') {
      redirectToApp(res, 'error')
      return
    }

    let verified
    try {
      verified = await verifyTransaction(reference)
    } catch (err) {
      console.error('[billing] callback verification failed:', err)
      redirectToApp(res, 'error')
      return
    }

    if (verified.status !== 'success') {
      console.warn(`[billing] callback for ${reference} was "${verified.status}", not success`)
      redirectToApp(res, 'failed')
      return
    }

    // Underpayment shouldn't buy a month. Paystack amounts are in kobo.
    if (verified.amount < PRO_PLAN_AMOUNT_KOBO) {
      console.warn(
        `[billing] ${reference} paid ${verified.amount} kobo, expected ${PRO_PLAN_AMOUNT_KOBO}`,
      )
      redirectToApp(res, 'failed')
      return
    }

    const user = await findBillingUser({
      userId: verified.userId,
      customerCode: verified.customerCode,
      email: verified.email,
    })
    if (!user) {
      console.error(`[billing] no account matched successful transaction ${reference}`)
      redirectToApp(res, 'error')
      return
    }

    await grantProPeriod(user, { customerCode: verified.customerCode })
    redirectToApp(res, 'success')
  }),
)
