import {
  FREE_PLAN_AUTH_TYPES,
  FREE_PLAN_HISTORY_DAYS,
  FREE_PLAN_MEMBER_LIMIT,
  FREE_PLAN_SAVED_REQUEST_LIMIT,
} from '../config/constants.js'
import { forbidden } from '../lib/errors.js'
import { CollectionModel } from '../models/Collection.js'
import { SavedRequestModel } from '../models/SavedRequest.js'
import { UserModel } from '../models/User.js'
import type { Plan, UserDoc } from '../models/User.js'
import { WorkspaceModel } from '../models/Workspace.js'
import { countCommittedSeats } from './invites.js'

/**
 * Plan resolution and the free-tier gates.
 *
 * One rule drives everything here: `plan: 'pro'` is a claim, not an answer.
 * A subscription whose `planExpiresAt` has passed is free, today, regardless of
 * what the field says — so a webhook that never arrived, a card that quietly
 * failed, or a Paystack outage degrades the account instead of granting an
 * indefinite free ride. `effectivePlan` is the only correct way to ask.
 *
 * Gates are enforced on write, never on read. An account that drops from pro to
 * free while holding 40 saved requests keeps all 40 and can still run them; it
 * just cannot add the 41st. Retroactively hiding data someone already created
 * would look like data loss, and this is a billing boundary, not a security one.
 */

/** The plan a user actually has right now, accounting for expiry. */
export function effectivePlan(user: UserDoc): Plan {
  if ((user.plan ?? 'free') !== 'pro') {
    return 'free'
  }
  // A pro row with no expiry is treated as active: comped accounts and
  // manually-granted plans have no Paystack period attached.
  if (user.planExpiresAt && user.planExpiresAt.getTime() <= Date.now()) {
    return 'free'
  }
  return 'pro'
}

export function isPro(user: UserDoc): boolean {
  return effectivePlan(user) === 'pro'
}

/**
 * The plan governing a workspace, which is its owner's.
 *
 * Every workspace-scoped limit resolves through here rather than through the
 * caller. The workspace is the billed thing; if limits followed whoever happened
 * to be making the request, a free workspace could grow past its cap simply by
 * having a pro member do the clicking.
 */
export async function workspacePlan(workspaceId: string): Promise<Plan> {
  const owner = await workspaceOwner(workspaceId)
  return owner ? effectivePlan(owner) : 'free'
}

/**
 * How far back a workspace's history reaches, or null for no limit.
 *
 * Applied as a query filter, never by deleting rows: the entries stay in the
 * database and reappear on upgrade. Trimming storage to match a billing state
 * would make a lapsed card indistinguishable from data loss.
 */
export async function historyCutoff(workspaceId: string): Promise<Date | null> {
  if ((await workspacePlan(workspaceId)) === 'pro') {
    return null
  }
  return new Date(Date.now() - FREE_PLAN_HISTORY_DAYS * 24 * 60 * 60 * 1000)
}

/**
 * Refuses a new member/invite once a free workspace is full. Pending invites
 * count toward the limit, otherwise ten outstanding invites could all land at
 * once and blow past it.
 *
 * Checked against the *workspace owner's* plan, not the inviter's: the workspace
 * is the thing being billed, and its owner is who pays. Otherwise a free
 * workspace could borrow a pro member's entitlement to grow past the cap.
 */
export async function assertCanAddMember(workspaceId: string): Promise<void> {
  if ((await workspacePlan(workspaceId)) === 'pro') {
    return
  }

  const seats = await countCommittedSeats(workspaceId)
  if (seats >= FREE_PLAN_MEMBER_LIMIT) {
    throw forbidden(
      'plan_member_limit',
      `The free plan allows ${FREE_PLAN_MEMBER_LIMIT} members per workspace, including pending invites. Upgrade to Pro to add more.`,
      { limit: FREE_PLAN_MEMBER_LIMIT, current: seats, plan: 'free' },
    )
  }
}

/**
 * Refuses a new saved request once a free workspace is full. Counted per
 * workspace, summed across its collections — a per-collection cap would be
 * trivially sidestepped by making another collection.
 */
export async function assertCanAddSavedRequest(workspaceId: string): Promise<void> {
  if ((await workspacePlan(workspaceId)) === 'pro') {
    return
  }

  const collectionIds = await CollectionModel.find({ workspaceId }).distinct('_id')
  const count = await SavedRequestModel.countDocuments({ collectionId: { $in: collectionIds } })

  if (count >= FREE_PLAN_SAVED_REQUEST_LIMIT) {
    throw forbidden(
      'plan_saved_request_limit',
      `The free plan allows ${FREE_PLAN_SAVED_REQUEST_LIMIT} saved requests per workspace. Upgrade to Pro for unlimited.`,
      { limit: FREE_PLAN_SAVED_REQUEST_LIMIT, current: count, plan: 'free' },
    )
  }
}

/**
 * Gate for auth schemes beyond the basics. Nothing currently trips this —
 * AUTH_TYPES and FREE_PLAN_AUTH_TYPES hold the same four entries — so it exists
 * to be the single place OAuth2 lands when it's built, rather than a check
 * someone has to remember to add later.
 *
 * Takes a resolved plan rather than a user because both kinds of caller need it:
 * saving a request is governed by the workspace's plan, while an ad-hoc
 * /api/execute call is governed by the caller's own.
 */
export function assertAuthTypeAllowed(plan: Plan, authType: string): void {
  if (plan === 'pro') {
    return
  }
  if (!(FREE_PLAN_AUTH_TYPES as readonly string[]).includes(authType)) {
    throw forbidden(
      'plan_auth_type',
      `The "${authType}" auth type is available on the Pro plan.`,
      { authType, plan: 'free' },
    )
  }
}

/**
 * The user who pays for a workspace. Null only if the workspace or its owner row
 * is gone, which the callers above treat as "free" — the safe direction to fail.
 */
async function workspaceOwner(workspaceId: string): Promise<UserDoc | null> {
  const workspace = await WorkspaceModel.findById(workspaceId).lean()
  if (!workspace) {
    return null
  }
  return UserModel.findById(workspace.ownerId)
}
