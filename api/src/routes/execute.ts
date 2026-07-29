import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { HttpError, badRequest } from '../lib/errors.js'
import { parseRequestShape } from '../lib/requestShape.js'
import { parseObjectId } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import { getSavedRequestForUser } from '../services/access.js'
import { executeHttpRequest, recordHistory } from '../services/executor.js'
import { requireWorkspaceMembership } from '../services/workspaces.js'

export const executeRouter = express.Router()

/** Error codes meaning "we tried the target and it never answered". */
const ATTEMPTED_FAILURES = new Set(['target_timeout', 'target_unreachable'])

/**
 * POST /api/execute
 * Body: { method, url, headers?, params?, body?, authType?, authConfig?,
 *         workspaceId? | savedRequestId? }
 *
 * Runs an arbitrary request server-side and returns
 * { status, statusText, headers, body, durationMs }. One of workspaceId or
 * savedRequestId must identify the workspace context — both are membership-
 * checked, so history can't be written into (or inferred from) a workspace the
 * caller isn't in. Runs where the target never answered are recorded with
 * status 0.
 */
executeRouter.post(
  '/',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const body = (req.body ?? {}) as Record<string, unknown>

    // --- resolve workspace context first: no context, no execution ---------
    let workspaceId: string
    let savedRequestId: string | undefined

    if (body.savedRequestId !== undefined) {
      savedRequestId = parseObjectId(body.savedRequestId, 'savedRequestId')
      const { collection } = await getSavedRequestForUser(user, savedRequestId)
      workspaceId = String(collection.workspaceId)
    } else if (body.workspaceId !== undefined) {
      workspaceId = parseObjectId(body.workspaceId, 'workspaceId')
      await requireWorkspaceMembership(user, workspaceId)
    } else {
      throw badRequest(
        'workspace_context_required',
        'Pass "workspaceId" (or "savedRequestId" to infer it) so the run can be recorded.',
      )
    }

    const shape = parseRequestShape(body)

    // --- run it -------------------------------------------------------------
    const startedAt = Date.now()
    try {
      const result = await executeHttpRequest(shape)

      await recordHistory({
        workspaceId,
        savedRequestId,
        user,
        method: shape.method,
        url: shape.url,
        status: result.status,
        durationMs: result.durationMs,
      })

      res.json({ ok: true, result })
    } catch (err) {
      // The target was attempted but never answered — still history-worthy.
      if (err instanceof HttpError && ATTEMPTED_FAILURES.has(err.code)) {
        await recordHistory({
          workspaceId,
          savedRequestId,
          user,
          method: shape.method,
          url: shape.url,
          status: 0,
          durationMs: Date.now() - startedAt,
        })
      }
      throw err
    }
  }),
)
