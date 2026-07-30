import cookieParser from 'cookie-parser'
import express from 'express'

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { requireAuth } from './middleware/requireAuth.js'
import { emailAuthRouter } from './routes/authEmail.js'
import { googleAuthRouter } from './routes/authGoogle.js'
import { sessionRouter } from './routes/authSession.js'
import { billingRouter, publicBillingRouter } from './routes/billing.js'
import { collectionsRouter } from './routes/collections.js'
import { environmentsRouter } from './routes/environments.js'
import { executeRouter } from './routes/execute.js'
import { invitesRouter, publicInvitesRouter } from './routes/invites.js'
import { publicDocsRouter } from './routes/publicDocs.js'
import { savedRequestsRouter } from './routes/requests.js'
import { webhooksRouter } from './routes/webhooks.js'
import { workspacesRouter } from './routes/workspaces.js'

export function createApp() {
  const app = express()

  // Atlas/dev runs behind no proxy, but this keeps req.protocol honest if you
  // later put this behind one.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  /**
   * Webhooks mount BEFORE express.json and get the raw bytes instead.
   *
   * The Paystack signature is an HMAC over exactly what was sent, so the parsed
   * body is useless for verifying it — JSON.stringify would reorder keys and
   * drop whitespace, and the digest would never match. Order matters here: move
   * this below express.json and every webhook silently starts failing auth.
   */
  app.use('/api/webhooks', express.raw({ type: '*/*', limit: '1mb' }), webhooksRouter)

  // 1mb: /api/execute and saved requests carry user-authored request bodies.
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'xenon-auth' })
  })

  // --- auth (public) --------------------------------------------------------
  app.use('/auth/email', emailAuthRouter)
  app.use('/auth/google', googleAuthRouter)
  app.use('/auth', sessionRouter)

  // --- public API (no session) ----------------------------------------------
  // Mounted before the authenticated invite router: Express matches in order,
  // and this one only declares GET /:token, so POST /:token/accept falls
  // through to the guarded router below.
  app.use('/api/invites', publicInvitesRouter)
  app.use('/api/public', publicDocsRouter)
  // Paystack returns the payer's browser here; a cross-site navigation carries
  // no session cookie, so the transaction is re-verified server-side instead.
  app.use('/api/billing', publicBillingRouter)

  // --- product API (session required) ---------------------------------------
  app.use('/api/invites', requireAuth, invitesRouter)
  app.use('/api/billing', requireAuth, billingRouter)
  app.use('/api/workspaces', requireAuth, workspacesRouter)
  app.use('/api/collections', requireAuth, collectionsRouter)
  app.use('/api/environments', requireAuth, environmentsRouter)
  app.use('/api/requests', requireAuth, savedRequestsRouter)
  app.use('/api/execute', requireAuth, executeRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
