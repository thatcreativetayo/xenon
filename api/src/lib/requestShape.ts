import { badRequest } from './errors.js'
import { containsPlaceholders } from './variables.js'
import { AUTH_TYPES, HTTP_METHODS } from '../models/SavedRequest.js'
import type { AuthType, HttpMethod } from '../models/SavedRequest.js'

/**
 * Validation for the request shape shared by saved requests and /api/execute:
 * { method, url, headers, params, body, authType, authConfig }.
 */

export type StringRecord = Record<string, string>

export interface AuthSettings {
  authType: AuthType
  authConfig: Record<string, unknown>
}

export interface RequestShape {
  method: HttpMethod
  url: string
  headers: StringRecord
  params: StringRecord
  body: string
  authType: AuthType
  authConfig: Record<string, unknown>
}

export function parseHttpMethod(value: unknown): HttpMethod {
  if (typeof value !== 'string') {
    throw badRequest('method_required', 'A "method" string is required.')
  }
  const method = value.toUpperCase()
  if (!(HTTP_METHODS as readonly string[]).includes(method)) {
    throw badRequest('method_invalid', `"method" must be one of ${HTTP_METHODS.join(', ')}.`)
  }
  return method as HttpMethod
}

/**
 * Shape check only — reachability/SSRF rules live in lib/ssrf.ts.
 *
 * A url containing `{{placeholders}}` is not yet a URL, so it only gets the
 * non-empty check here; the execute route re-validates with this same function
 * AFTER substitution, once the string must stand on its own.
 */
export function parseTargetUrl(value: unknown): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest('url_required', 'A non-empty "url" string is required.')
  }
  const raw = value.trim()

  if (containsPlaceholders(raw)) {
    return raw
  }

  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw badRequest('url_invalid', `"${raw}" is not a valid absolute URL.`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw badRequest('url_scheme_invalid', 'Only http:// and https:// URLs are supported.')
  }

  return raw
}

/** headers/params: a flat object of string keys to string values. */
export function parseStringRecord(value: unknown, field: string): StringRecord {
  if (value === undefined || value === null) {
    return {}
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw badRequest(`${field}_invalid`, `"${field}" must be an object of string values.`)
  }

  const record: StringRecord = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key.trim() === '') {
      continue
    }
    if (typeof entry !== 'string') {
      throw badRequest(
        `${field}_invalid`,
        `"${field}.${key}" must be a string, got ${Array.isArray(entry) ? 'array' : typeof entry}.`,
      )
    }
    record[key] = entry
  }
  return record
}

export function parseRequestBody(value: unknown): string {
  if (value === undefined || value === null) {
    return ''
  }
  if (typeof value !== 'string') {
    throw badRequest('body_invalid', '"body" must be a raw string (stringify JSON first).')
  }
  return value
}

function requireConfigString(
  config: Record<string, unknown>,
  key: string,
  authType: string,
): string {
  const value = config[key]
  if (typeof value !== 'string' || value === '') {
    throw badRequest(
      'auth_config_invalid',
      `authType "${authType}" requires a non-empty string "authConfig.${key}".`,
    )
  }
  return value
}

/**
 * Validates authType + authConfig together and returns the config narrowed to
 * exactly the keys that auth type uses, so junk keys never reach the database
 * or the outgoing request.
 */
export function parseAuthSettings(
  authTypeValue: unknown,
  authConfigValue: unknown,
): AuthSettings {
  const authType = authTypeValue === undefined ? 'none' : authTypeValue
  if (typeof authType !== 'string' || !(AUTH_TYPES as readonly string[]).includes(authType)) {
    throw badRequest('auth_type_invalid', `"authType" must be one of ${AUTH_TYPES.join(', ')}.`)
  }

  if (
    authConfigValue !== undefined &&
    authConfigValue !== null &&
    (typeof authConfigValue !== 'object' || Array.isArray(authConfigValue))
  ) {
    throw badRequest('auth_config_invalid', '"authConfig" must be an object.')
  }
  const config = (authConfigValue ?? {}) as Record<string, unknown>

  switch (authType as AuthType) {
    case 'none':
      return { authType: 'none', authConfig: {} }
    case 'apiKey': {
      const key = requireConfigString(config, 'key', 'apiKey')
      const value = requireConfigString(config, 'value', 'apiKey')
      const addTo = config.addTo
      if (addTo !== 'header' && addTo !== 'query') {
        throw badRequest(
          'auth_config_invalid',
          'authType "apiKey" requires "authConfig.addTo" of "header" or "query".',
        )
      }
      return { authType: 'apiKey', authConfig: { key, value, addTo } }
    }
    case 'bearer':
      return {
        authType: 'bearer',
        authConfig: { token: requireConfigString(config, 'token', 'bearer') },
      }
    case 'basic':
      return {
        authType: 'basic',
        authConfig: {
          username: requireConfigString(config, 'username', 'basic'),
          password: requireConfigString(config, 'password', 'basic'),
        },
      }
  }
}

/** Full validation for create + execute payloads. */
export function parseRequestShape(body: Record<string, unknown>): RequestShape {
  const { authType, authConfig } = parseAuthSettings(body.authType, body.authConfig)
  return {
    method: parseHttpMethod(body.method),
    url: parseTargetUrl(body.url),
    headers: parseStringRecord(body.headers, 'headers'),
    params: parseStringRecord(body.params, 'params'),
    body: parseRequestBody(body.body),
    authType,
    authConfig,
  }
}
