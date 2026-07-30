import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { badRequest } from '../lib/errors.js'
import { parseRequestShape } from '../lib/requestShape.js'
import { parseName, parseObjectId } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import type { CollectionDoc } from '../models/Collection.js'
import { SavedRequestModel } from '../models/SavedRequest.js'
import type { SavedRequestDoc } from '../models/SavedRequest.js'
import { getCollectionForUser } from '../services/access.js'
import {
  assertAuthTypeAllowed,
  assertCanAddSavedRequest,
  workspacePlan,
} from '../services/plans.js'
import { setCollectionSharing } from '../services/sharing.js'

export const collectionsRouter = express.Router()

export function publicCollection(collection: CollectionDoc) {
  return {
    id: String(collection._id),
    workspaceId: String(collection.workspaceId),
    name: collection.name,
    isPublic: collection.isPublic ?? false,
    // The slug survives unpublishing, but only surface it while the docs page is
    // actually live — otherwise the UI would show a URL that 404s.
    shareSlug: collection.isPublic ? (collection.shareSlug ?? null) : null,
    createdAt: collection.createdAt,
  }
}

export function publicSavedRequest(request: SavedRequestDoc) {
  return {
    id: String(request._id),
    collectionId: String(request.collectionId),
    name: request.name,
    method: request.method,
    url: request.url,
    headers: request.headers ?? {},
    params: request.params ?? {},
    body: request.body ?? '',
    authType: request.authType,
    authConfig: request.authConfig ?? {},
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
  }
}

/**
 * PATCH /api/collections/:id/share — body { isPublic }.
 *
 * Any member can publish. Publishing exposes request shapes, not credentials
 * (see services/sharing.ts), so it isn't the kind of irreversible authority
 * grant that inviting is — and it's undone by sending `false`.
 */
collectionsRouter.patch(
  '/:id/share',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const collectionId = parseObjectId(req.params.id, 'id')
    const isPublic = (req.body as Record<string, unknown> | undefined)?.isPublic

    if (typeof isPublic !== 'boolean') {
      throw badRequest('is_public_invalid', 'A boolean "isPublic" is required.')
    }

    const collection = await getCollectionForUser(user, collectionId)
    const updated = await setCollectionSharing(collection, isPublic)

    res.json({ ok: true, collection: publicCollection(updated) })
  }),
)

/**
 * DELETE /api/collections/:id
 * Membership is verified via the collection's workspace. The collection's saved
 * requests go with it — leaving them orphaned would just strand rows no route
 * can reach. History entries referencing them are kept: history is a log.
 */
collectionsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const collectionId = parseObjectId(req.params.id, 'id')

    const collection = await getCollectionForUser(user, collectionId)

    const removed = await SavedRequestModel.deleteMany({ collectionId: collection._id })
    await collection.deleteOne()

    res.json({ ok: true, deletedRequests: removed.deletedCount })
  }),
)

/** POST /api/collections/:collectionId/requests — save a request. */
collectionsRouter.post(
  '/:collectionId/requests',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const collectionId = parseObjectId(req.params.collectionId, 'collectionId')
    const body = (req.body ?? {}) as Record<string, unknown>

    const collection = await getCollectionForUser(user, collectionId)

    const name = parseName(body.name, 'name')
    const shape = parseRequestShape(body)

    const workspaceId = String(collection.workspaceId)
    await assertCanAddSavedRequest(workspaceId)
    assertAuthTypeAllowed(await workspacePlan(workspaceId), shape.authType)

    const now = new Date()
    const savedRequest = await SavedRequestModel.create({
      collectionId: collection._id,
      name,
      ...shape,
      createdAt: now,
      updatedAt: now,
    })

    res.status(201).json({ ok: true, request: publicSavedRequest(savedRequest) })
  }),
)

/** GET /api/collections/:collectionId/requests */
collectionsRouter.get(
  '/:collectionId/requests',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const collectionId = parseObjectId(req.params.collectionId, 'collectionId')

    const collection = await getCollectionForUser(user, collectionId)

    const requests = await SavedRequestModel.find({ collectionId: collection._id }).sort({
      createdAt: 1,
    })
    res.json({ ok: true, requests: requests.map(publicSavedRequest) })
  }),
)
