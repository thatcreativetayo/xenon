import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

/**
 * A per-workspace variable set (Development / Staging / Production / custom).
 * `baseUrl` backs the special `{{baseUrl}}` placeholder; `variables` back every
 * other `{{key}}`. `secret` only signals "mask this in the UI by default" —
 * values are currently stored as-is (encryption-at-rest is a flagged follow-up,
 * see routes/environments.ts).
 */
const environmentSchema = new mongoose.Schema(
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
    baseUrl: {
      type: String,
      default: '',
    },
    variables: {
      type: [
        new mongoose.Schema(
          {
            key: { type: String, required: true },
            value: { type: String, default: '' },
            secret: { type: Boolean, default: false },
          },
          { _id: false },
        ),
      ],
      default: [],
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

export type Environment = InferSchemaType<typeof environmentSchema>
export type EnvironmentDoc = HydratedDocument<Environment>

export const EnvironmentModel: Model<Environment> =
  (mongoose.models.Environment as Model<Environment>) ??
  mongoose.model<Environment>('Environment', environmentSchema)
