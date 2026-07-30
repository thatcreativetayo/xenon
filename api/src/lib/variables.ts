import type { EnvironmentDoc } from '../models/Environment.js'
import type { RequestShape, StringRecord } from './requestShape.js'

/**
 * `{{variableName}}` substitution against an environment.
 *
 * `{{baseUrl}}` maps to the environment's `baseUrl` field; every other name
 * maps to a `variables` entry by key. Unknown placeholders are left in place —
 * a typo shouldn't hard-fail the run — but their names are reported so the
 * response can surface them.
 */

// {{ name }} — whitespace-tolerant; name charset matches what the environment
// routes accept as variable keys, so every storable key is referenceable.
const PLACEHOLDER_PATTERN = /\{\{\s*([\w.-]+)\s*\}\}/g

/** True if the string still contains `{{...}}` placeholders. */
export function containsPlaceholders(input: string): boolean {
  // .test() on a /g regex advances lastIndex, and matchAll clones it — reset on
  // both sides so no call ever sees a half-consumed pattern.
  PLACEHOLDER_PATTERN.lastIndex = 0
  const found = PLACEHOLDER_PATTERN.test(input)
  PLACEHOLDER_PATTERN.lastIndex = 0
  return found
}

/** Placeholder names present in the string, deduplicated. */
export function listPlaceholders(input: string): string[] {
  PLACEHOLDER_PATTERN.lastIndex = 0
  return [...new Set([...input.matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1] as string))]
}

export interface Resolution {
  value: string
  unresolved: string[]
}

function buildLookup(environment: EnvironmentDoc): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const variable of environment.variables) {
    lookup.set(variable.key, variable.value ?? '')
  }
  // The dedicated field wins over any variable that happens to be named baseUrl.
  if (environment.baseUrl) {
    lookup.set('baseUrl', environment.baseUrl)
  }
  return lookup
}

export function resolveVariables(input: string, environment: EnvironmentDoc): Resolution {
  const lookup = buildLookup(environment)
  const unresolved: string[] = []

  const value = input.replace(PLACEHOLDER_PATTERN, (placeholder, name: string) => {
    const replacement = lookup.get(name)
    if (replacement === undefined) {
      unresolved.push(name)
      return placeholder
    }
    return replacement
  })

  return { value, unresolved }
}

/**
 * Applies substitution to every templatable field of a request shape: url,
 * header values, param values, and body. Keys are deliberately not templated —
 * a header name that varies per environment is almost certainly a mistake.
 * Returns the resolved shape plus the deduplicated names that had no match.
 */
export function resolveRequestShape(
  shape: RequestShape,
  environment: EnvironmentDoc,
): { shape: RequestShape; unresolved: string[] } {
  const unresolved = new Set<string>()

  const resolve = (input: string): string => {
    const result = resolveVariables(input, environment)
    result.unresolved.forEach((name) => unresolved.add(name))
    return result.value
  }

  const resolveRecord = (record: StringRecord): StringRecord => {
    const out: StringRecord = {}
    for (const [key, value] of Object.entries(record)) {
      out[key] = resolve(value)
    }
    return out
  }

  return {
    shape: {
      ...shape,
      url: resolve(shape.url),
      headers: resolveRecord(shape.headers),
      params: resolveRecord(shape.params),
      body: resolve(shape.body),
    },
    unresolved: [...unresolved],
  }
}
