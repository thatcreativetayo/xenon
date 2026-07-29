import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { parseRequestShape } from '../lib/requestShape.js'
import { parseName, parseObjectId } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import type { CollectionDoc } from '../models/Collection.js'
import { SavedRequestModel } from '../models/SavedRequest.js'
import type { SavedRequestDoc } from '../models/SavedRequest.js'
import { getCollectionForUser } from '../services/access.js'

export const collectionsRouter = express.Router()

export function publicCollection(collection: CollectionDoc) {
  return {
    id: String(collection._id),
    workspaceId: String(collection.workspaceId),
    name: collection.name,
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
