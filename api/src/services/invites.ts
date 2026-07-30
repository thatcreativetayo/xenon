import { INVITE_TTL_MS } from '../config/constants.js'
import { badRequest, conflict, forbidden, isDuplicateKeyError, notFound } from '../lib/errors.js'
import { generateInviteToken } from '../lib/tokens.js'
import { normalizeEmail } from '../lib/validate.js'
import { UserModel } from '../models/User.js'
import type { UserDoc } from '../models/User.js'
import { WorkspaceModel } from '../models/Workspace.js'
import { WorkspaceInviteModel } from '../models/WorkspaceInvite.js'
import type { WorkspaceInviteDoc } from '../models/WorkspaceInvite.js'
import { WorkspaceMemberModel } from '../models/WorkspaceMember.js'
import type { WorkspaceMemberDoc } from '../models/WorkspaceMember.js'

/**
 * Invite lifecycle. Two properties are worth stating up front because the rest
 * of this file exists to hold them:
 *
 *   1. An invite is spent exactly once. Acceptance flips `pending -> accepted`
 *      with a conditional update, so two clicks on the same link race into one
 *      winner rather than two membership rows.
 *   2. Expiry is evaluated on read, not by a background sweep. `status` may
 *      still say "pending" on a week-old row; `isExpired()` is what decides.
 */

export function isExpired(invite: WorkspaceInviteDoc): boolean {
  return invite.expiresAt.getTime() <= Date.now()
}

/** The status to show a client, folding lapsed-but-unswept rows into "expired". */
export function effectiveStatus(invite: WorkspaceInviteDoc): string {
  if (invite.status === 'pending' && isExpired(invite)) {
    return 'expired'
  }
  return invite.status ?? 'pending'
}

/**
 * Creates a pending invite. Caller must have already established that the
 * requester may invite (see requireWorkspaceOwner) and that the workspace has
 * room under its plan.
 */
export async function createInvite(input: {
  workspaceId: string
  email: string
  invitedBy: UserDoc
}): Promise<WorkspaceInviteDoc> {
  const email = normalizeEmail(input.email)

  if (email === normalizeEmail(input.invitedBy.email ?? '')) {
    throw badRequest('cannot_invite_self', 'You are already in this workspace.')
  }

  // Already a member? Nothing to offer. Resolved via the invitee's user row,
  // which only exists if they've signed in before — a brand new address falls
  // through to the invite path, which is the common case.
  const existingUser = await UserModel.findOne({ email }).lean()
  if (existingUser) {
    const alreadyMember = await WorkspaceMemberModel.exists({
      workspaceId: input.workspaceId,
      userId: existingUser._id,
    })
    if (alreadyMember) {
      throw conflict('already_a_member', 'That person is already in this workspace.')
    }
  }

  // A lapsed invite shouldn't block re-inviting, and the partial unique index
  // only sees `status: pending`, so retire stale rows before inserting.
  await WorkspaceInviteModel.updateMany(
    { workspaceId: input.workspaceId, email, status: 'pending', expiresAt: { $lte: new Date() } },
    { $set: { status: 'expired' } },
  )

  try {
    return await WorkspaceInviteModel.create({
      workspaceId: input.workspaceId,
      email,
      invitedByUserId: input.invitedBy._id,
      token: generateInviteToken(),
      status: 'pending',
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      createdAt: new Date(),
    })
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      throw conflict('invite_already_pending', 'That address already has a pending invite.')
    }
    throw err
  }
}

/** Loads an invite by its token. 404 for an unknown token — nothing to enumerate. */
export async function getInviteByToken(token: string): Promise<WorkspaceInviteDoc> {
  const invite = await WorkspaceInviteModel.findOne({ token })
  if (!invite) {
    throw notFound('invite_not_found', 'That invite link is not valid.')
  }
  return invite
}

/**
 * Turns a valid invite into membership.
 *
 * The accepting account's email must match the invited address. An invite link
 * is a bearer credential that travels through email, and email gets forwarded,
 * quoted in threads, and occasionally delivered to the wrong person entirely.
 * Binding acceptance to the address the owner actually typed means a leaked link
 * grants nothing on its own — the holder also has to control that inbox. Letting
 * any signed-in account redeem it would turn one mis-sent message into silent,
 * permanent access to the workspace's stored API credentials, which is the worst
 * thing this codebase can leak. The cost of being strict is a clear error when
 * someone is signed in as their personal account instead of their work one, and
 * that is a recoverable annoyance.
 */
export async function acceptInvite(
  user: UserDoc,
  token: string,
): Promise<{ invite: WorkspaceInviteDoc; membership: WorkspaceMemberDoc }> {
  const invite = await getInviteByToken(token)

  if (invite.status === 'accepted') {
    throw conflict('invite_already_accepted', 'That invite has already been used.')
  }
  if (invite.status === 'expired' || isExpired(invite)) {
    throw conflict('invite_expired', 'That invite has expired. Ask for a new one.')
  }

  const userEmail = normalizeEmail(user.email ?? '')
  if (!userEmail || userEmail !== invite.email) {
    throw forbidden(
      'invite_email_mismatch',
      `That invite was sent to ${invite.email}. Sign in with that address to accept it.`,
    )
  }

  // Conditional flip: whoever moves the row out of `pending` owns the acceptance.
  // A concurrent second request finds nothing to update and stops here.
  const claimed = await WorkspaceInviteModel.findOneAndUpdate(
    { _id: invite._id, status: 'pending' },
    { $set: { status: 'accepted' } },
    { new: true },
  )
  if (!claimed) {
    throw conflict('invite_already_accepted', 'That invite has already been used.')
  }

  let membership: WorkspaceMemberDoc
  try {
    membership = await WorkspaceMemberModel.create({
      workspaceId: claimed.workspaceId,
      userId: user._id,
      role: 'member',
    })
  } catch (err) {
    if (isDuplicateKeyError(err)) {
      // Membership already existed (added by another path between checks).
      // The invite is spent either way; return the row that's actually there.
      const existing = await WorkspaceMemberModel.findOne({
        workspaceId: claimed.workspaceId,
        userId: user._id,
      })
      if (!existing) throw err
      membership = existing
    } else {
      // Don't leave the invite burned if membership couldn't be written.
      await WorkspaceInviteModel.updateOne({ _id: claimed._id }, { $set: { status: 'pending' } })
      throw err
    }
  }

  console.log(`[invite] ${user.email ?? user._id} joined workspace ${String(claimed.workspaceId)}`)
  return { invite: claimed, membership }
}

export async function listPendingInvites(workspaceId: string): Promise<WorkspaceInviteDoc[]> {
  return WorkspaceInviteModel.find({
    workspaceId,
    status: 'pending',
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 })
}

/** Counts seats a workspace has committed: current members plus live invites. */
export async function countCommittedSeats(workspaceId: string): Promise<number> {
  const [members, invites] = await Promise.all([
    WorkspaceMemberModel.countDocuments({ workspaceId }),
    WorkspaceInviteModel.countDocuments({
      workspaceId,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }),
  ])
  return members + invites
}

/**
 * Shape for the workspace owner's own invite list. Includes the token because
 * the owner may legitimately want to re-copy the link they already sent.
 */
export function publicInvite(invite: WorkspaceInviteDoc) {
  return {
    id: String(invite._id),
    email: invite.email,
    status: effectiveStatus(invite),
    invitedByUserId: String(invite.invitedByUserId),
    token: invite.token,
    expiresAt: invite.expiresAt,
    createdAt: invite.createdAt,
  }
}

/**
 * Shape for the unauthenticated landing page, which renders
 * "You've been invited to X by Y" before the visitor has signed in.
 *
 * Anyone holding the link sees this, so it carries only what that sentence needs:
 * the workspace name, the inviter's display name, and the invited address so the
 * page can say which account to sign in with. No IDs, no member list, no token
 * echo, and nothing about the workspace's contents.
 */
export async function publicInvitePreview(invite: WorkspaceInviteDoc) {
  const [workspace, inviter] = await Promise.all([
    WorkspaceModel.findById(invite.workspaceId).lean(),
    UserModel.findById(invite.invitedByUserId).lean(),
  ])

  return {
    workspaceName: workspace?.name ?? 'a workspace',
    invitedBy: inviter?.name ?? inviter?.email ?? 'a teammate',
    email: invite.email,
    status: effectiveStatus(invite),
    expiresAt: invite.expiresAt,
  }
}
