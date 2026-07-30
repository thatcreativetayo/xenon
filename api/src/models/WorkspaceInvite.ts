import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

export const INVITE_STATUSES = ['pending', 'accepted', 'expired'] as const
export type InviteStatus = (typeof INVITE_STATUSES)[number]

/**
 * A pending offer of workspace membership, addressed to an email rather than a
 * user — the invitee may not have a Xenon account yet, and often won't.
 *
 * `token` is the only credential: whoever holds it and is signed in as the
 * invited address can turn it into a WorkspaceMember row exactly once. Status
 * and `expiresAt` are both checked at accept time rather than relying on a
 * sweeper, because a lagging background job would leave a window where an
 * expired token still works.
 */
const workspaceInviteSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    /** Normalized (lowercased, trimmed) so the accept-time comparison is exact. */
    email: {
      type: String,
      required: true,
    },
    invitedByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    token: {
      type: String,
      required: true,
      unique: true,
    },
    status: {
      type: String,
      enum: INVITE_STATUSES,
      default: 'pending',
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    createdAt: {
      type: Date,
      default: () => new Date(),
    },
  },
  { versionKey: false },
)

// "Show this workspace's pending invites", newest first.
workspaceInviteSchema.index({ workspaceId: 1, createdAt: -1 })
// Blocks a second live invite for the same address; expired/accepted rows are
// free to accumulate, so the partial filter keeps re-inviting possible.
workspaceInviteSchema.index(
  { workspaceId: 1, email: 1 },
  { unique: true, partialFilterExpression: { status: 'pending' } },
)

export type WorkspaceInvite = InferSchemaType<typeof workspaceInviteSchema>
export type WorkspaceInviteDoc = HydratedDocument<WorkspaceInvite>

export const WorkspaceInviteModel: Model<WorkspaceInvite> =
  (mongoose.models.WorkspaceInvite as Model<WorkspaceInvite>) ??
  mongoose.model<WorkspaceInvite>('WorkspaceInvite', workspaceInviteSchema)
