import cookieParser from 'cookie-parser'
import express from 'express'

import { errorHandler, notFoundHandler } from './middleware/errorHandler.js'
import { emailAuthRouter } from './routes/authEmail.js'
import { googleAuthRouter } from './routes/authGoogle.js'
import { sessionRouter } from './routes/authSession.js'

export function createApp() {
  const app = express()

  // Atlas/dev runs behind no proxy, but this keeps req.protocol honest if you
  // later put this behind one.
  app.set('trust proxy', 1)
  app.disable('x-powered-by')

  app.use(express.json({ limit: '32kb' }))
  app.use(cookieParser())

  app.get('/health', (_req, res) => {
    res.json({ ok: true, service: 'xenon-auth' })
  })

  app.use('/auth/email', emailAuthRouter)
  app.use('/auth/google', googleAuthRouter)
  app.use('/auth', sessionRouter)

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
