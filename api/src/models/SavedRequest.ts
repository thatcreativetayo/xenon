import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const
export type HttpMethod = (typeof HTTP_METHODS)[number]

export const AUTH_TYPES = ['none', 'apiKey', 'bearer', 'basic'] as const
export type AuthType = (typeof AUTH_TYPES)[number]

/**
 * A request definition saved into a collection. `headers`/`params` are plain
 * key→value string maps; `authConfig`'s shape depends on `authType`
 * (apiKey: {key, value, addTo}; bearer: {token}; basic: {username, password})
 * and is validated at the route layer — Mixed here so the stored document
 * matches exactly what the client sent.
 */
const savedRequestSchema = new mongoose.Schema(
  {
    collectionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Collection',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    method: {
      type: String,
      enum: HTTP_METHODS,
      required: true,
    },
    url: {
      type: String,
      required: true,
    },
    headers: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    params: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    body: {
      type: String,
      default: '',
    },
    authType: {
      type: String,
      enum: AUTH_TYPES,
      default: 'none',
    },
    authConfig: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false, minimize: false },
)

export type SavedRequest = InferSchemaType<typeof savedRequestSchema>
export type SavedRequestDoc = HydratedDocument<SavedRequest>

export const SavedRequestModel: Model<SavedRequest> =
  (mongoose.models.SavedRequest as Model<SavedRequest>) ??
  mongoose.model<SavedRequest>('SavedRequest', savedRequestSchema)
