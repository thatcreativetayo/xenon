import express from 'express'

import {
  FREE_PLAN_HISTORY_DAYS,
  HISTORY_DEFAULT_LIMIT,
  HISTORY_MAX_LIMIT,
} from '../config/constants.js'
import { asyncHandler } from '../lib/asyncHandler.js'
import { parseEmail, parseName, parseObjectId, parsePagination } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import { CollectionModel } from '../models/Collection.js'
import { EnvironmentModel } from '../models/Environment.js'
import { RequestHistoryModel } from '../models/RequestHistory.js'
import { WorkspaceInviteModel } from '../models/WorkspaceInvite.js'
import { WorkspaceModel } from '../models/Workspace.js'
import {
  createWorkspace,
  ensureDefaultWorkspace,
  listWorkspacesForUser,
  publicWorkspace,
  requireWorkspaceMembership,
  requireWorkspaceOwner,
} from '../services/workspaces.js'
import { createInvite, listPendingInvites, publicInvite } from '../services/invites.js'
import { sendWorkspaceInviteEmail } from '../services/mailer.js'
import { assertCanAddMember, historyCutoff } from '../services/plans.js'
import { publicEnvironment } from '../services/environments.js'
import { publicCollection } from './collections.js'
import { parseBaseUrl, parseEnvironmentVariables } from './environments.js'

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

/** POST /api/workspaces/:workspaceId/environments */
workspacesRouter.post(
  '/:workspaceId/environments',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const workspaceId = parseObjectId(req.params.workspaceId, 'workspaceId')
    const body = (req.body ?? {}) as Record<string, unknown>
    const name = parseName(body.name, 'name')
    const baseUrl = parseBaseUrl(body.baseUrl)
    const variables = parseEnvironmentVariables(body.variables)

    await requireWorkspaceMembership(user, workspaceId)

    const now = new Date()
    const environment = await EnvironmentModel.create({
      workspaceId,
      name,
      baseUrl,
      variables,
      createdAt: now,
      updatedAt: now,
    })
    res.status(201).json({ ok: true, environment: publicEnvironment(environment) })
  }),
)

/** GET /api/workspaces/:workspaceId/environments */
workspacesRouter.get(
  '/:workspaceId/environments',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const workspaceId = parseObjectId(req.params.workspaceId, 'workspaceId')

    await requireWorkspaceMembership(user, workspaceId)

    const environments = await EnvironmentModel.find({ workspaceId }).sort({ createdAt: 1 })
    res.json({ ok: true, environments: environments.map(publicEnvironment) })
  }),
)

/**
 * POST /api/workspaces/:workspaceId/invites — body { email }.
 *
 * Owner-only. Membership grants access to every stored credential in the
 * workspace, so handing it out is exactly the kind of action that shouldn't be
 * available to someone who was themselves invited.
 */
workspacesRouter.post(
  '/:workspaceId/invites',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const workspaceId = parseObjectId(req.params.workspaceId, 'workspaceId')
    const email = parseEmail((req.body as Record<string, unknown> | undefined)?.email)

    await requireWorkspaceOwner(user, workspaceId)
    await assertCanAddMember(workspaceId)
    const workspace = await WorkspaceModel.findById(workspaceId).lean()

    const invite = await createInvite({ workspaceId, email, invitedBy: user })

    try {
      await sendWorkspaceInviteEmail(email, {
        workspaceName: workspace?.name ?? 'a Xenon workspace',
        inviterName: user.name ?? user.email ?? 'A teammate',
        token: invite.token,
      })
    } catch (err) {
      // The row would otherwise sit there pending, and the unique partial index
      // would answer the retry with "already invited" — a dead end for an invite
      // that never actually left the building.
      await WorkspaceInviteModel.deleteOne({ _id: invite._id })
      throw err
    }

    res.status(201).json({ ok: true, invite: publicInvite(invite) })
  }),
)

/** GET /api/workspaces/:workspaceId/invites — outstanding invites, newest first. */
workspacesRouter.get(
  '/:workspaceId/invites',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const workspaceId = parseObjectId(req.params.workspaceId, 'workspaceId')

    await requireWorkspaceMembership(user, workspaceId)

    const invites = await listPendingInvites(workspaceId)
    res.json({ ok: true, invites: invites.map(publicInvite) })
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

    // Free plans see a trailing window. The rows are never deleted — the filter
    // narrows the view, and upgrading brings the older entries straight back.
    const cutoff = await historyCutoff(workspaceId)
    const filter = cutoff ? { workspaceId, ranAt: { $gte: cutoff } } : { workspaceId }

    const [entries, total] = await Promise.all([
      RequestHistoryModel.find(filter).sort({ ranAt: -1 }).skip(skip).limit(limit).lean(),
      RequestHistoryModel.countDocuments(filter),
    ])

    res.json({
      ok: true,
      total,
      limit,
      skip,
      retentionDays: cutoff ? FREE_PLAN_HISTORY_DAYS : null,
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
