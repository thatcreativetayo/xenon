import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import {
  parseAuthSettings,
  parseHttpMethod,
  parseRequestBody,
  parseStringRecord,
  parseTargetUrl,
} from '../lib/requestShape.js'
import { parseName, parseObjectId } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import { getSavedRequestForUser } from '../services/access.js'
import { assertAuthTypeAllowed, workspacePlan } from '../services/plans.js'
import { publicSavedRequest } from './collections.js'

export const savedRequestsRouter = express.Router()

/**
 * PATCH /api/requests/:id — partial update. Only the fields present in the body
 * change; authType and authConfig must be sent together since one is
 * meaningless without the other. Bumps updatedAt.
 */
savedRequestsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const requestId = parseObjectId(req.params.id, 'id')
    const body = (req.body ?? {}) as Record<string, unknown>

    const { savedRequest, collection } = await getSavedRequestForUser(user, requestId)

    if (body.name !== undefined) savedRequest.name = parseName(body.name, 'name')
    if (body.method !== undefined) savedRequest.method = parseHttpMethod(body.method)
    if (body.url !== undefined) savedRequest.url = parseTargetUrl(body.url)
    if (body.headers !== undefined) savedRequest.headers = parseStringRecord(body.headers, 'headers')
    if (body.params !== undefined) savedRequest.params = parseStringRecord(body.params, 'params')
    if (body.body !== undefined) savedRequest.body = parseRequestBody(body.body)

    if (body.authType !== undefined || body.authConfig !== undefined) {
      // Validate as a pair against the incoming (or existing) type.
      const { authType, authConfig } = parseAuthSettings(
        body.authType ?? savedRequest.authType,
        body.authConfig,
      )
      assertAuthTypeAllowed(await workspacePlan(String(collection.workspaceId)), authType)
      savedRequest.authType = authType
      savedRequest.authConfig = authConfig
    }

    savedRequest.updatedAt = new Date()
    await savedRequest.save()

    res.json({ ok: true, request: publicSavedRequest(savedRequest) })
  }),
)

/** DELETE /api/requests/:id */
savedRequestsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const requestId = parseObjectId(req.params.id, 'id')

    const { savedRequest } = await getSavedRequestForUser(user, requestId)
    await savedRequest.deleteOne()

    res.json({ ok: true })
  }),
)
