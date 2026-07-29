// Importing this barrel registers every model with mongoose, which
// connectToDatabase() relies on to build indexes before serving traffic.
export { UserModel } from './User.js'
export type { User, UserDoc } from './User.js'

export { EmailCodeModel } from './EmailCode.js'
export type { EmailCode, EmailCodeDoc } from './EmailCode.js'

export { CodeRequestModel } from './CodeRequest.js'
export type { CodeRequest, CodeRequestDoc } from './CodeRequest.js'

export { WorkspaceModel } from './Workspace.js'
export type { Workspace, WorkspaceDoc } from './Workspace.js'

export { WorkspaceMemberModel, WORKSPACE_ROLES } from './WorkspaceMember.js'
export type { WorkspaceMember, WorkspaceMemberDoc, WorkspaceRole } from './WorkspaceMember.js'

export { CollectionModel } from './Collection.js'
export type { Collection, CollectionDoc } from './Collection.js'

export { SavedRequestModel, HTTP_METHODS, AUTH_TYPES } from './SavedRequest.js'
export type { SavedRequest, SavedRequestDoc, HttpMethod, AuthType } from './SavedRequest.js'

export { RequestHistoryModel } from './RequestHistory.js'
export type { RequestHistory, RequestHistoryDoc } from './RequestHistory.js'
