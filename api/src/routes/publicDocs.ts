import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { badRequest } from '../lib/errors.js'
import { getPublishedCollection, publicDocsCollection } from '../services/sharing.js'

/**
 * Unauthenticated read-only docs. Mounted outside `requireAuth` in app.ts, which
 * is the entire reason services/sharing.ts serializes by allowlist — nothing here
 * has an authenticated caller to trust.
 */
export const publicDocsRouter = express.Router()

/** Slugs are base64url, fixed length. Reject anything else before touching Mongo. */
function parseShareSlug(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) {
    throw badRequest('slug_invalid', 'That is not a valid share link.')
  }
  return value
}

/**
 * GET /api/public/collections/:shareSlug — no auth.
 *
 * 404s identically for an unknown slug, a slug whose collection was unpublished,
 * and a private collection, so the response never confirms that a given slug
 * corresponds to something real.
 */
publicDocsRouter.get(
  '/collections/:shareSlug',
  asyncHandler(async (req, res) => {
    const shareSlug = parseShareSlug(req.params.shareSlug)
    const collection = await getPublishedCollection(shareSlug)

    // Published docs are safe to cache but shouldn't be sticky — unpublishing
    // should take effect promptly.
    res.set('Cache-Control', 'public, max-age=60')
    res.json({ ok: true, collection: await publicDocsCollection(collection) })
  }),
)
