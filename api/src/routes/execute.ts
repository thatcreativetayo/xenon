import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { HttpError, badRequest } from '../lib/errors.js'
import { parseRequestShape, parseTargetUrl } from '../lib/requestShape.js'
import { listPlaceholders, resolveRequestShape } from '../lib/variables.js'
import { parseObjectId } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import { getSavedRequestForUser } from '../services/access.js'
import { getEnvironmentForUser } from '../services/environments.js'
import { executeHttpRequest, recordHistory } from '../services/executor.js'
import { assertAuthTypeAllowed, workspacePlan } from '../services/plans.js'
import { requireWorkspaceMembership } from '../services/workspaces.js'

export const executeRouter = express.Router()

/** Error codes meaning "we tried the target and it never answered". */
const ATTEMPTED_FAILURES = new Set(['target_timeout', 'target_unreachable'])

/**
 * POST /api/execute
 * Body: { method, url, headers?, params?, body?, authType?, authConfig?,
 *         environmentId?, workspaceId? | savedRequestId? }
 *
 * Runs an arbitrary request server-side and returns
 * { status, statusText, headers, body, durationMs }. One of workspaceId or
 * savedRequestId must identify the workspace context — both are membership-
 * checked, so history can't be written into (or inferred from) a workspace the
 * caller isn't in. Runs where the target never answered are recorded with
 * status 0.
 *
 * If `environmentId` is given, `{{variable}}` placeholders in url, header
 * values, param values and body are substituted from that environment BEFORE
 * the final URL is validated and SSRF-checked — the check must see the real
 * target, not the `{{baseUrl}}/...` template. Placeholders with no match are
 * left as-is and reported via `unresolvedVariables`, except in the URL, where
 * an unresolved placeholder can't produce a fetchable address and is a 400.
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

    // Template-tolerant at this point: a url like {{baseUrl}}/users passes.
    let shape = parseRequestShape(body)
    let unresolvedVariables: string[] = []

    assertAuthTypeAllowed(await workspacePlan(workspaceId), shape.authType)

    // --- substitute environment variables, then re-validate the real URL ----
    if (body.environmentId !== undefined) {
      const environmentId = parseObjectId(body.environmentId, 'environmentId')
      const environment = await getEnvironmentForUser(user, environmentId)

      // Membership alone isn't enough: the caller may be in two workspaces and
      // must not run workspace A's request against workspace B's secrets.
      if (String(environment.workspaceId) !== workspaceId) {
        throw badRequest(
          'environment_workspace_mismatch',
          'That environment belongs to a different workspace than this run.',
        )
      }

      const resolved = resolveRequestShape(shape, environment)
      shape = resolved.shape
      unresolvedVariables = resolved.unresolved
    }

    const urlPlaceholders = listPlaceholders(shape.url)
    if (urlPlaceholders.length > 0) {
      throw badRequest(
        'url_unresolved_variables',
        body.environmentId !== undefined
          ? `The URL still contains {{${urlPlaceholders.join('}}, {{')}}} after substitution — the selected environment has no value for ${urlPlaceholders.length === 1 ? 'it' : 'them'}.`
          : `The URL contains {{${urlPlaceholders.join('}}, {{')}}} but no "environmentId" was provided to resolve ${urlPlaceholders.length === 1 ? 'it' : 'them'}.`,
        { unresolved: urlPlaceholders },
      )
    }
    // Full URL validation was skipped for templates; the string must stand on
    // its own now that substitution has run.
    shape = { ...shape, url: parseTargetUrl(shape.url) }

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

      res.json({ ok: true, result, unresolvedVariables })
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
