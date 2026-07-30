import mongoose from 'mongoose'
import type { HydratedDocument, InferSchemaType, Model } from 'mongoose'

export const PLANS = ['free', 'pro'] as const
export type Plan = (typeof PLANS)[number]

/**
 * `email` is the single source of truth for identity. A person who signs in with
 * an email code and later with Google (same address) is one row, not two —
 * the Google sign-in attaches `googleId` to the existing document.
 *
 * Both `email` and `googleId` are unique+sparse: at most one row per value, but
 * rows missing the field are exempt (a code-only user has no `googleId`).
 */
const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      unique: true,
      sparse: true,
      lowercase: true,
      trim: true,
    },
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    /**
     * Opaque session token, generated once when the user is created and never
     * rotated, so signing in on a second device does not evict the first.
     */
    token: {
      type: String,
      required: true,
      unique: true,
    },
    name: {
      type: String,
      trim: true,
    },
    /**
     * Billing state. `plan` alone is not the answer to "is this user pro" —
     * `planExpiresAt` in the past means free regardless of what `plan` says, so
     * a lapsed subscription degrades on its own even if a webhook was missed.
     * services/billing.ts#isPro is the only thing that should read these.
     */
    plan: {
      type: String,
      enum: PLANS,
      default: 'free',
    },
    planExpiresAt: {
      type: Date,
    },
    paystackCustomerCode: {
      type: String,
    },
    paystackSubscriptionCode: {
      type: String,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { versionKey: false },
)

export type User = InferSchemaType<typeof userSchema>
export type UserDoc = HydratedDocument<User>

export const UserModel: Model<User> =
  (mongoose.models.User as Model<User>) ?? mongoose.model<User>('User', userSchema)
