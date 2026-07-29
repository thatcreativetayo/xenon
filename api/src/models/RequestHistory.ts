import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

import { HTTP_METHODS } from './SavedRequest.js'

/**
 * One row per executed request. `savedRequestId` is optional because /api/execute
 * also runs one-off requests that were never saved to a collection. `status` is 0
 * when the target could not be reached at all (timeout, DNS failure, refused) —
 * those runs are still worth showing in history.
 */
const requestHistorySchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Workspace',
      required: true,
    },
    savedRequestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'SavedRequest',
    },
    runByUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
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
    status: {
      type: Number,
      required: true,
    },
    durationMs: {
      type: Number,
      required: true,
    },
    ranAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
)

// "Newest history for a workspace" is the only read pattern.
requestHistorySchema.index({ workspaceId: 1, ranAt: -1 })

export type RequestHistory = InferSchemaType<typeof requestHistorySchema>
export type RequestHistoryDoc = HydratedDocument<RequestHistory>

export const RequestHistoryModel: Model<RequestHistory> =
  (mongoose.models.RequestHistory as Model<RequestHistory>) ??
  mongoose.model<RequestHistory>('RequestHistory', requestHistorySchema)
