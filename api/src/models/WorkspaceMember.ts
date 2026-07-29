import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

export const WORKSPACE_ROLES = ['owner', 'member'] as const
export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number]

/**
 * One row per user per workspace. Every access check in the product resolves
 * down to "does a WorkspaceMember row exist for this user + workspace".
 * The invite flow that creates non-owner rows is a future task; the shape is
 * ready now so it won't need a migration.
 */
const workspaceMemberSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: WORKSPACE_ROLES,
      default: 'member',
    },
  },
  { versionKey: false },
)

// A user can be a member of a workspace at most once.
workspaceMemberSchema.index({ workspaceId: 1, userId: 1 }, { unique: true })
// "List workspaces I'm in" is the hottest query.
workspaceMemberSchema.index({ userId: 1 })

export type WorkspaceMember = InferSchemaType<typeof workspaceMemberSchema>
export type WorkspaceMemberDoc = HydratedDocument<WorkspaceMember>

export const WorkspaceMemberModel: Model<WorkspaceMember> =
  (mongoose.models.WorkspaceMember as Model<WorkspaceMember>) ??
  mongoose.model<WorkspaceMember>('WorkspaceMember', workspaceMemberSchema)
