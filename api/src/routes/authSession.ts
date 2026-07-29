import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { currentUser, requireAuth } from '../middleware/requireAuth.js'
import { publicUser } from '../services/users.js'

export const sessionRouter = express.Router()

/**
 * GET /auth/me
 *
 * Resolves the `xenon_token` cookie to a user (via requireAuth, the same
 * middleware the /api routes sit behind):
 *
 *   curl -i --cookie 'xenon_token=...' http://localhost:4001/auth/me
 */
sessionRouter.get(
  '/me',
  requireAuth,
  asyncHandler(async (req, res) => {
    res.json({ ok: true, user: publicUser(currentUser(req)) })
  }),
)
