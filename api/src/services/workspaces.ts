import mongoose from 'mongoose'

import { forbidden, notFound } from '../lib/errors.js'
import type { UserDoc } from '../models/User.js'
import { WorkspaceModel } from '../models/Workspace.js'
import type { WorkspaceDoc } from '../models/Workspace.js'
import { WorkspaceMemberModel } from '../models/WorkspaceMember.js'
import type { WorkspaceMemberDoc } from '../models/WorkspaceMember.js'

/** Creates a workspace and its owner membership row in one go. */
export async function createWorkspace(user: UserDoc, name: string): Promise<WorkspaceDoc> {
  const workspace = await WorkspaceModel.create({
    name,
    ownerId: user._id,
    createdAt: new Date(),
  })

  await WorkspaceMemberModel.create({
    workspaceId: workspace._id,
    userId: user._id,
    role: 'owner',
  })

  return workspace
}

function defaultWorkspaceName(user: UserDoc): string {
  // Email-code users have no name on file, so fall back rather than producing
  // "undefined's Workspace".
  return user.name ? `${user.name}'s Workspace` : 'My Workspace'
}

/**
 * Gives a user their first workspace if they have none. Called from both login
 * flows when a user is first created, and lazily from GET /api/workspaces so
 * accounts that predate this feature are healed on their next visit.
 */
export async function ensureDefaultWorkspace(user: UserDoc): Promise<void> {
  const hasAny = await WorkspaceMemberModel.exists({ userId: user._id })
  if (hasAny) {
    return
  }
  await createWorkspace(user, defaultWorkspaceName(user))
  console.log(`[workspace] provisioned default workspace for ${user.email ?? user._id}`)
}

/**
 * The membership check every /api route funnels through: 404 whether the
 * workspace doesn't exist or the user simply isn't in it, so IDs can't be
 * probed to learn which workspaces exist.
 */
export async function requireWorkspaceMembership(
  user: UserDoc,
  workspaceId: string | mongoose.Types.ObjectId,
): Promise<WorkspaceMemberDoc> {
  const membership = await WorkspaceMemberModel.findOne({
    workspaceId,
    userId: user._id,
  })
  if (!membership) {
    throw notFound('workspace_not_found', 'No such workspace.')
  }
  return membership
}

/**
 * Owner-only variant, for actions that change who can reach a workspace.
 * Returns 403 rather than 404 because the caller can already see the workspace —
 * there is nothing left to hide, only an action to refuse.
 */
export async function requireWorkspaceOwner(
  user: UserDoc,
  workspaceId: string | mongoose.Types.ObjectId,
): Promise<WorkspaceMemberDoc> {
  const membership = await requireWorkspaceMembership(user, workspaceId)
  if (membership.role !== 'owner') {
    throw forbidden('owner_only', 'Only the workspace owner can do that.')
  }
  return membership
}

export async function listWorkspacesForUser(user: UserDoc): Promise<WorkspaceDoc[]> {
  const memberships = await WorkspaceMemberModel.find({ userId: user._id }).lean()
  const ids = memberships.map((m) => m.workspaceId)
  return WorkspaceModel.find({ _id: { $in: ids } }).sort({ createdAt: 1 })
}

export function publicWorkspace(workspace: WorkspaceDoc) {
  return {
    id: String(workspace._id),
    name: workspace.name,
    ownerId: String(workspace.ownerId),
    createdAt: workspace.createdAt,
  }
}
