// Importing this barrel registers every model with mongoose, which
// connectToDatabase() relies on to build indexes before serving traffic.
export { UserModel } from './User.js'
export type { User, UserDoc } from './User.js'

export { EmailCodeModel } from './EmailCode.js'
export type { EmailCode, EmailCodeDoc } from './EmailCode.js'

export { CodeRequestModel } from './CodeRequest.js'
export type { CodeRequest, CodeRequestDoc } from './CodeRequest.js'
