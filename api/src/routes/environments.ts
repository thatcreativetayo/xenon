import express from 'express'

import { asyncHandler } from '../lib/asyncHandler.js'
import { badRequest } from '../lib/errors.js'
import { parseName, parseObjectId } from '../lib/validate.js'
import { currentUser } from '../middleware/requireAuth.js'
import type { Environment } from '../models/Environment.js'
import { getEnvironmentForUser, publicEnvironment } from '../services/environments.js'

export const environmentsRouter = express.Router()

/**
 * NOTE: variable values (including `secret: true` ones) are stored as-is —
 * encryption-at-rest is a deliberate follow-up, not built in this pass. The
 * `secret` flag only tells the frontend to mask the value by default.
 */

const MAX_VARIABLES = 200
const MAX_VALUE_LENGTH = 10_000

// Must stay in sync with PLACEHOLDER_PATTERN in lib/variables.ts, so every key
// that can be stored can also be referenced as {{key}}.
const VARIABLE_KEY_PATTERN = /^[\w.-]{1,64}$/

/** Optional base URL; empty string clears it. Placeholders are not allowed here. */
export function parseBaseUrl(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return ''
  }
  if (typeof value !== 'string') {
    throw badRequest('baseUrl_invalid', '"baseUrl" must be a string.')
  }
  const raw = value.trim()

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw badRequest('baseUrl_invalid', `"${raw}" is not a valid absolute URL.`)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw badRequest('baseUrl_invalid', 'Only http:// and https:// base URLs are supported.')
  }
  return raw
}

/** Full validation for the `variables` array: [{ key, value, secret }]. */
export function parseEnvironmentVariables(value: unknown): Environment['variables'] {
  if (value === undefined || value === null) {
    return []
  }
  if (!Array.isArray(value)) {
    throw badRequest('variables_invalid', '"variables" must be an array.')
  }
  if (value.length > MAX_VARIABLES) {
    throw badRequest('variables_invalid', `At most ${MAX_VARIABLES} variables per environment.`)
  }

  const seen = new Set<string>()
  return value.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw badRequest('variables_invalid', `"variables[${index}]" must be an object.`)
    }
    const { key, value: varValue, secret } = entry as Record<string, unknown>

    if (typeof key !== 'string' || !VARIABLE_KEY_PATTERN.test(key)) {
      throw badRequest(
        'variables_invalid',
        `"variables[${index}].key" must be 1-64 characters of letters, digits, "_", "." or "-".`,
      )
    }
    if (seen.has(key)) {
      throw badRequest('variables_invalid', `Duplicate variable key "${key}".`)
    }
    seen.add(key)

    if (varValue !== undefined && typeof varValue !== 'string') {
      throw badRequest('variables_invalid', `"variables[${index}].value" must be a string.`)
    }
    if ((varValue ?? '').length > MAX_VALUE_LENGTH) {
      throw badRequest(
        'variables_invalid',
        `"variables[${index}].value" must be ${MAX_VALUE_LENGTH} characters or fewer.`,
      )
    }
    if (secret !== undefined && typeof secret !== 'boolean') {
      throw badRequest('variables_invalid', `"variables[${index}].secret" must be a boolean.`)
    }

    return { key, value: (varValue as string | undefined) ?? '', secret: secret === true }
  }) as Environment['variables']
}

/**
 * PATCH /api/environments/:id — partial update of name/baseUrl/variables.
 * Membership is verified via the environment's workspace.
 */
environmentsRouter.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const environmentId = parseObjectId(req.params.id, 'id')
    const body = (req.body ?? {}) as Record<string, unknown>

    const environment = await getEnvironmentForUser(user, environmentId)

    if (body.name !== undefined) {
      environment.name = parseName(body.name, 'name')
    }
    if (body.baseUrl !== undefined) {
      environment.baseUrl = parseBaseUrl(body.baseUrl)
    }
    if (body.variables !== undefined) {
      environment.set('variables', parseEnvironmentVariables(body.variables))
    }

    environment.updatedAt = new Date()
    await environment.save()

    res.json({ ok: true, environment: publicEnvironment(environment) })
  }),
)

/** DELETE /api/environments/:id — membership via the environment's workspace. */
environmentsRouter.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const user = currentUser(req)
    const environmentId = parseObjectId(req.params.id, 'id')

    const environment = await getEnvironmentForUser(user, environmentId)
    await environment.deleteOne()

    res.json({ ok: true })
  }),
)
