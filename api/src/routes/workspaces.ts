import express from 'express'

import { HISTORY_DEFAULT_LIMIT, HISTORY_MAX_LIMIT } from '../config/constants.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parseName, parseObjectId, parsePagination } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import { CollectionModel } from '../models/Collection.js'
import { RequestHistoryModel } from '../models/RequestHistory.js'
import {
  createWorkspace,
  ensureDefaultWorkspace,
  listWorkspacesForUser,
  publicWorkspace,
  requireWorkspaceMembership,
} from '../services/workspaces.js'
import { publicCollection } from './collections.js'

export const workspacesRouter = express.Router()

/** POST /api/workspaces — create; the creator becomes owner. */
workspacesRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const name = parseName((req.body as Record<string, unknown> | undefined)?.name, 'name')

    const workspace = await createWorkspace(user, name)
    res.status(201).json({ ok: true, workspace: publicWorkspace(workspace) })
  }),
)

/** GET /api/workspaces — every workspace the user is a member of. */
workspacesRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)

    // Self-heals accounts created before default provisioning existed.
    await ensureDefaultWorkspace(user)

    const workspaces = await listWorkspacesForUser(user)
    res.json({ ok: true, workspaces: workspaces.map(publicWorkspace) })
  }),
)

/** POST /api/workspaces/:workspaceId/collections */
workspacesRouter.post(
  '/:workspaceId/collections',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const workspaceId = parseObjectId(req.params.workspaceId, 'workspaceId')
    const name = parseName((req.body as Record<string, unknown> | undefined)?.name, 'name')

    await requireWorkspaceMembership(user, workspaceId)

    const collection = await CollectionModel.create({
      workspaceId,
      name,
      createdAt: new Date(),
    })
    res.status(201).json({ ok: true, collection: publicCollection(collection) })
  }),
)

/** GET /api/workspaces/:workspaceId/collections */
workspacesRouter.get(
  '/:workspaceId/collections',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const workspaceId = parseObjectId(req.params.workspaceId, 'workspaceId')

    await requireWorkspaceMembership(user, workspaceId)

    const collections = await CollectionModel.find({ workspaceId }).sort({ createdAt: 1 })
    res.json({ ok: true, collections: collections.map(publicCollection) })
  }),
)

/** GET /api/workspaces/:workspaceId/history?limit=&skip= — newest first. */
workspacesRouter.get(
  '/:workspaceId/history',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const workspaceId = parseObjectId(req.params.workspaceId, 'workspaceId')
    const { limit, skip } = parsePagination(req.query as Record<string, unknown>, {
      limit: HISTORY_DEFAULT_LIMIT,
      maxLimit: HISTORY_MAX_LIMIT,
    })

    await requireWorkspaceMembership(user, workspaceId)

    const [entries, total] = await Promise.all([
      RequestHistoryModel.find({ workspaceId }).sort({ ranAt: -1 }).skip(skip).limit(limit).lean(),
      RequestHistoryModel.countDocuments({ workspaceId }),
    ])

    res.json({
      ok: true,
      total,
      limit,
      skip,
      history: entries.map((entry) => ({
        id: String(entry._id),
        savedRequestId: entry.savedRequestId ? String(entry.savedRequestId) : null,
        runByUserId: String(entry.runByUserId),
        method: entry.method,
        url: entry.url,
        status: entry.status,
        durationMs: entry.durationMs,
        ranAt: entry.ranAt,
      })),
    })
  }),
)
