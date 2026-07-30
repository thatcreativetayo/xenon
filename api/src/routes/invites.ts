import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { badRequest } from '../lib/errors.js'
import { currentUser } from '../middleware/requireAuth.js'
import { acceptInvite, getInviteByToken, publicInvitePreview } from '../services/invites.js'
import { publicWorkspace } from '../services/workspaces.js'
import { WorkspaceModel } from '../models/Workspace.js'

/**
 * Two routers because the two halves of this flow have opposite auth needs: the
 * landing page has to render before the visitor has an account, while accepting
 * is what actually grants access. Keeping them separate means the public one can
 * never accidentally inherit `requireAuth`'s absence as a bug — see app.ts.
 */

/** Route params arrive as strings but can be absent or arrays; narrow first. */
function parseInviteToken(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > 128) {
    throw badRequest('token_invalid', 'That invite link is not valid.')
  }
  return value
}

export const publicInvitesRouter = express.Router()

/**
 * GET /api/invites/:token — no auth.
 *
 * Feeds the "You've been invited to X by Y" screen. Returns 200 with a status of
 * "expired"/"accepted" rather than an error for a spent invite, because the page
 * still needs to explain what happened; only an unknown token 404s.
 */
publicInvitesRouter.get(
  '/:token',
  asyncHandler(async (req, res) => {
    const token = parseInviteToken(req.params.token)
    const invite = await getInviteByToken(token)
    res.json({ ok: true, invite: await publicInvitePreview(invite) })
  }),
)

export const invitesRouter = express.Router()

/** POST /api/invites/:token/accept — requires auth; creates the membership row. */
invitesRouter.post(
  '/:token/accept',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const token = parseInviteToken(req.params.token)

    const { invite, membership } = await acceptInvite(user, token)
    const workspace = await WorkspaceModel.findById(invite.workspaceId)

    res.json({
      ok: true,
      workspace: workspace ? publicWorkspace(workspace) : null,
      membership: { role: membership.role },
    })
  }),
)
