import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/**
 * A pending one-time login code. Deleted on successful verification, so this
 * collection cannot be used to enforce the request rate limit — see CodeRequest.
 */
const emailCodeSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    code: {
      type: String,
      required: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { versionKey: false },
)

// Mongo reaps expired docs on a ~60s sweep, so this is storage hygiene only.
// Expiry is also checked explicitly at verification time for correctness.
emailCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 })

// Supports the atomic claim in verifyCode().
emailCodeSchema.index({ email: 1, code: 1 })

export type EmailCode = InferSchemaType<typeof emailCodeSchema>
export type EmailCodeDoc = HydratedDocument<EmailCode>

export const EmailCodeModel: Model<EmailCode> =
  (mongoose.models.EmailCode as Model<EmailCode>) ??
  mongoose.model<EmailCode>('EmailCode', emailCodeSchema)
