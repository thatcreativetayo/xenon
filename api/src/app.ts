import cookieParser from 'cookie-parser'
import express from 'express'

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { requireAuth } from './middleware/requireAuth.js'
import { emailAuthRouter } from './routes/authEmail.js'
import { googleAuthRouter } from './routes/authGoogle.js'
import { sessionRouter } from './routes/authSession.js'
import { collectionsRouter } from './routes/collections.js'
import { executeRouter } from './routes/execute.js'
import { savedRequestsRouter } from './routes/requests.js'
import { workspacesRouter } from './routes/workspaces.js'

export function createApp() {
  const app = express()

  // Atlas/dev runs behind no proxy, but this keeps req.protocol honest if you
  // later put this behind one.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

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

  // --- product API (session required) ---------------------------------------
  app.use('/api/workspaces', requireAuth, workspacesRouter)
  app.use('/api/collections', requireAuth, collectionsRouter)
  app.use('/api/requests', requireAuth, savedRequestsRouter)
  app.use('/api/execute', requireAuth, executeRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
