import { notFound } from '../lib/errors.js'
import { CollectionModel } from '../models/Collection.js'
import type { CollectionDoc } from '../models/Collection.js'
import { SavedRequestModel } from '../models/SavedRequest.js'
import type { SavedRequestDoc } from '../models/SavedRequest.js'
import type { UserDoc } from '../models/User.js'
import { requireWorkspaceMembership } from './workspaces.js'

/**
 * Ownership never lives on the resource the URL names — it's always resolved
 * up the chain to a WorkspaceMember row. These helpers are the only way routes
 * load collections and saved requests, so a guessed or iterated ID from another
 * workspace always dead-ends in the same 404 as a genuinely missing one.
 */

/** collection → workspace → membership */
export async function getCollectionForUser(
  user: UserDoc,
  collectionId: string,
): Promise<CollectionDoc> {
  const collection = await CollectionModel.findById(collectionId)
  if (!collection) {
    throw notFound('collection_not_found', 'No such collection.')
  }
  await requireWorkspaceMembership(user, collection.workspaceId)
  return collection
}

/** saved request → collection → workspace → membership */
export async function getSavedRequestForUser(
  user: UserDoc,
  requestId: string,
): Promise<{ savedRequest: SavedRequestDoc; collection: CollectionDoc }> {
  const savedRequest = await SavedRequestModel.findById(requestId)
  if (!savedRequest) {
    throw notFound('request_not_found', 'No such request.')
  }

  const collection = await CollectionModel.findById(savedRequest.collectionId)
  if (!collection) {
    // Collection was deleted out from under its requests — treat as gone.
    throw notFound('request_not_found', 'No such request.')
  }

  await requireWorkspaceMembership(user, collection.workspaceId)
  return { savedRequest, collection }
}
