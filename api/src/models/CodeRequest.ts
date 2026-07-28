import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/**
 * Append-only log of code requests, one row per request, used solely for rate
 * limiting.
 *
 * This exists because EmailCode rows are deleted on successful verification —
 * counting those would let someone verify a code and immediately earn three
 * fresh requests. These rows survive verification, so the limit holds.
 */
const codeRequestSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
)

// Storage hygiene. The limit itself is evaluated with an explicit time-window
// query, so the reaper's ~60s imprecision cannot widen the window.
codeRequestSchema.index({ createdAt: 1 }, { expireAfterSeconds: 15 * 60 })

export type CodeRequest = InferSchemaType<typeof codeRequestSchema>
export type CodeRequestDoc = HydratedDocument<CodeRequest>

export const CodeRequestModel: Model<CodeRequest> =
  (mongoose.models.CodeRequest as Model<CodeRequest>) ??
  mongoose.model<CodeRequest>('CodeRequest', codeRequestSchema)
