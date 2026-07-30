import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/**
 * A named group of saved requests inside a workspace.
 *
 * `isPublic` + `shareSlug` back the read-only docs page. The two are deliberately
 * separate: unpublishing flips the boolean and leaves the slug alone, so
 * re-publishing later restores the same URL instead of breaking every link
 * someone already shared. Only `isPublic` decides whether the public route
 * answers — see routes/publicDocs.ts.
 */
const collectionSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isPublic: {
      type: Boolean,
      default: false,
    },
    /**
     * Generated on first publish and kept forever after. Sparse because most
     * collections never get one, and a non-sparse unique index would collide on
     * every `null`.
     */
    shareSlug: {
      type: String,
      unique: true,
      sparse: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
)

export type Collection = InferSchemaType<typeof collectionSchema>
export type CollectionDoc = HydratedDocument<Collection>

export const CollectionModel: Model<Collection> =
  (mongoose.models.Collection as Model<Collection>) ??
  mongoose.model<Collection>('Collection', collectionSchema)
