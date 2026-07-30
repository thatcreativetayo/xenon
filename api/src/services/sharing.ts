import { isDuplicateKeyError, notFound } from '../lib/errors.js'
import { generateShareSlug } from '../lib/tokens.js'
import { CollectionModel } from '../models/Collection.js'
import type { CollectionDoc } from '../models/Collection.js'
import { SavedRequestModel } from '../models/SavedRequest.js'
import type { SavedRequestDoc } from '../models/SavedRequest.js'

/**
 * Published, read-only collection docs.
 *
 * Everything below is written on the assumption that the output of
 * `publicDocsCollection` is world-readable by anyone who guesses or is given a
 * slug. That makes this the highest-consequence serializer in the codebase: the
 * authenticated routes hand back stored API keys and bearer tokens by design,
 * and this one must never do that.
 *
 * The rule followed here is allowlist-only. Every field in the response is named
 * explicitly and copied one at a time — no object spreads, no `...rest`, no
 * reuse of `publicSavedRequest`. Adding a field to SavedRequest therefore cannot
 * silently publish it; someone has to come here and type its name.
 */

/** What a withheld value looks like on the wire. */
const MASKED = '[hidden]'

/**
 * Header and param names that conventionally carry credentials. Matched on word
 * boundaries so `X-Api-Key` and `X-Auth-Token` hit while `Content-Type` and
 * `monkey` don't.
 *
 * This is a safety net, not the primary defence: stored auth lives in
 * `authConfig`, which is never serialized here at all. It exists because a user
 * who types `Authorization: Bearer sk_live_…` straight into the headers table
 * has stored a real credential in a field the docs page would otherwise show.
 */
const SENSITIVE_KEY_PATTERN =
  /(^|[-_.])(authorization|proxy-authorization|cookie|set-cookie|auth|token|secret|password|passwd|pwd|key|apikey|access|refresh|session|signature|sig|credential|credentials|private)([-_.]|$)/i

/** `{{var}}` references name a variable rather than holding its value. */
function isPlaceholderOnly(value: string): boolean {
  return value.trim() !== '' && value.replace(/\{\{\s*[\w.-]+\s*\}\}/g, '').trim() === ''
}

/**
 * Keeps every key (the shape of a request is the useful part of docs) but drops
 * values that look like credentials. A bare `{{placeholder}}` survives because
 * it publishes a variable's name, not its contents.
 */
function maskSensitiveValues(record: unknown): Record<string, string> {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return {}
  }

  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(record as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      continue
    }
    out[key] =
      SENSITIVE_KEY_PATTERN.test(key) && !isPlaceholderOnly(value) ? MASKED : value
  }
  return out
}

/**
 * One request as the docs page sees it.
 *
 * `authConfig` is never included in any form. What a reader needs to know is
 * "this endpoint expects a bearer token", and `authType` says that by itself;
 * the stored token is the workspace's own credential and has no business on a
 * public page. `body` is included because an example payload is most of what
 * makes docs useful — it is user-authored request content, not a stored secret.
 */
function publicDocsRequest(request: SavedRequestDoc) {
  return {
    name: request.name,
    method: request.method,
    url: request.url,
    headers: maskSensitiveValues(request.headers),
    params: maskSensitiveValues(request.params),
    body: typeof request.body === 'string' ? request.body : '',
    /** The scheme only. Values live in authConfig, which never leaves the server. */
    authType: request.authType ?? 'none',
    requiresAuth: (request.authType ?? 'none') !== 'none',
  }
}

/**
 * Loads a published collection by slug, or throws 404.
 *
 * A private collection and a nonexistent slug produce the identical response, so
 * holding a slug for a collection that was unpublished tells you nothing about
 * whether it still exists.
 */
export async function getPublishedCollection(shareSlug: string): Promise<CollectionDoc> {
  const collection = await CollectionModel.findOne({ shareSlug, isPublic: true })
  if (!collection) {
    throw notFound('collection_not_found', 'No published collection at that link.')
  }
  return collection
}

/** The full read-only docs payload for a published collection. */
export async function publicDocsCollection(collection: CollectionDoc) {
  const requests = await SavedRequestModel.find({ collectionId: collection._id }).sort({
    createdAt: 1,
  })

  return {
    name: collection.name,
    publishedAt: collection.createdAt,
    requests: requests.map(publicDocsRequest),
  }
}

/**
 * Flips publication on or off, minting the slug the first time it's enabled.
 *
 * Retries on the astronomically unlikely slug collision rather than surfacing a
 * duplicate-key error, because a 500 here would be inexplicable to the caller.
 */
export async function setCollectionSharing(
  collection: CollectionDoc,
  isPublic: boolean,
): Promise<CollectionDoc> {
  collection.isPublic = isPublic

  if (isPublic && !collection.shareSlug) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      collection.shareSlug = generateShareSlug()
      try {
        return await collection.save()
      } catch (err) {
        if (!isDuplicateKeyError(err) || attempt === 2) throw err
      }
    }
  }

  return collection.save()
}

