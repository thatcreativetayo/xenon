import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/**
 * A workspace owns everything downstream: collections, saved requests, history.
 * Access is always resolved through WorkspaceMember, not `ownerId` — `ownerId`
 * records who created it, membership records who may touch it.
 */
const workspaceSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
)

export type Workspace = InferSchemaType<typeof workspaceSchema>
export type WorkspaceDoc = HydratedDocument<Workspace>

export const WorkspaceModel: Model<Workspace> =
  (mongoose.models.Workspace as Model<Workspace>) ??
  mongoose.model<Workspace>('Workspace', workspaceSchema)
