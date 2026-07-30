import { notFound } from '../lib/errors.js'
import { EnvironmentModel } from '../models/Environment.js'
import type { EnvironmentDoc } from '../models/Environment.js'
import type { UserDoc } from '../models/User.js'
import { requireWorkspaceMembership } from './workspaces.js'

/** environment → workspace → membership; same 404-on-both pattern as access.ts. */
export async function getEnvironmentForUser(
  user: UserDoc,
  environmentId: string,
): Promise<EnvironmentDoc> {
  const environment = await EnvironmentModel.findById(environmentId)
  if (!environment) {
    throw notFound('environment_not_found', 'No such environment.')
  }
  await requireWorkspaceMembership(user, environment.workspaceId)
  return environment
}

export function publicEnvironment(environment: EnvironmentDoc) {
  return {
    id: String(environment._id),
    workspaceId: String(environment.workspaceId),
    name: environment.name,
    baseUrl: environment.baseUrl ?? '',
    variables: environment.variables.map((variable) => ({
      key: variable.key,
      value: variable.value ?? '',
      secret: Boolean(variable.secret),
    })),
    createdAt: environment.createdAt,
    updatedAt: environment.updatedAt,
  }
}
