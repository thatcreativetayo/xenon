import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/** A named group of saved requests inside a workspace. */
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
