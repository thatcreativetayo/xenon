/**
 * Local database helper for manual auth testing. Not part of the server.
 *
 *   pnpm dev:tool peek-code <email>              latest live code, bare stdout
 *   pnpm dev:tool issue-code <email>             mint a code without emailing it
 *   pnpm dev:tool simulate-google <email> <gid>  run the real merge path
 *   pnpm dev:tool list-users                     table of every user
 *   pnpm dev:tool user-json <email>              one user as JSON
 *   pnpm dev:tool count-users                    bare count on stdout
 *   pnpm dev:tool reset <email...>               delete users/codes for emails
 */
import { connectToDatabase, disconnectFromDatabase } from '../src/db/connect.js'
import { normalizeEmail, parseEmail } from '../src/lib/validate.js'
import { CodeRequestModel } from '../src/models/CodeRequest.js'
import { EmailCodeModel } from '../src/models/EmailCode.js'
import { UserModel } from '../src/models/User.js'
import { issueEmailCode } from '../src/services/emailCodes.js'
import { findOrCreateUserByGoogle } from '../src/services/users.js'

function requireArg(args: string[], index: number, name: string): string {
  const value = args[index]
  if (value === undefined || value === '') {
    console.error(`Missing required argument: ${name}`)
    process.exit(2)
  }
  return value
}

async function peekCode(email: string): Promise<void> {
  const record = await EmailCodeModel.findOne({
    email: normalizeEmail(email),
    expiresAt: { $gt: new Date() },
  })
    .sort({ expiresAt: -1 })
    .lean()

  if (!record) {
    console.error(`No live code for ${email}`)
    process.exit(1)
  }
  // Bare value so the shell can capture it directly.
  process.stdout.write(record.code)
}

/**
 * Mints a real code via the real service (rate limit and TTL included) but skips
 * the mailer, so automated tests can use throwaway addresses that Resend's
 * sandbox sender would refuse to deliver to.
 */
async function issueCode(email: string): Promise<void> {
  const { code } = await issueEmailCode(parseEmail(email))
  process.stdout.write(code)
}

/**
 * Calls findOrCreateUserByGoogle — the exact function GET /auth/google/callback
 * calls once it has a verified profile. Only the Google round trip is stood in
 * for; all of the merge behaviour under test is the real code path.
 */
async function simulateGoogle(email: string, googleId: string, name?: string): Promise<void> {
  const { user, created, googleIdAttached } = await findOrCreateUserByGoogle({
    email,
    googleId,
    ...(name ? { name } : {}),
  })

  console.log(
    JSON.stringify(
      {
        created,
        googleIdAttached,
        id: String(user._id),
        email: user.email,
        googleId: user.googleId,
        name: user.name ?? null,
        token: `${user.token.slice(0, 12)}…`,
      },
      null,
      2,
    ),
  )
}

async function listUsers(): Promise<void> {
  const users = await UserModel.find().sort({ createdAt: 1 }).lean()

  if (users.length === 0) {
    console.log('(no users)')
    return
  }

  console.table(
    users.map((user) => ({
      id: String(user._id),
      email: user.email ?? '—',
      googleId: user.googleId ?? '—',
      name: user.name ?? '—',
      token: user.token ? `${user.token.slice(0, 12)}…` : '—',
      createdAt: user.createdAt?.toISOString() ?? '—',
    })),
  )
  console.log(`${users.length} user(s)`)
}

async function userJson(email: string): Promise<void> {
  const user = await UserModel.findOne({ email: normalizeEmail(email) }).lean()
  if (!user) {
    console.error(`No user with email ${email}`)
    process.exit(1)
  }
  console.log(
    JSON.stringify({
      id: String(user._id),
      email: user.email,
      googleId: user.googleId ?? null,
      name: user.name ?? null,
      tokenPrefix: user.token?.slice(0, 12) ?? null,
    }),
  )
}

async function countUsers(): Promise<void> {
  process.stdout.write(String(await UserModel.countDocuments()))
}

async function reset(emails: string[]): Promise<void> {
  if (emails.length === 0) {
    console.error('Pass at least one email to reset.')
    process.exit(2)
  }
  const normalized = emails.map(normalizeEmail)

  const users = await UserModel.deleteMany({ email: { $in: normalized } })
  const codes = await EmailCodeModel.deleteMany({ email: { $in: normalized } })
  const requests = await CodeRequestModel.deleteMany({ email: { $in: normalized } })

  console.log(
    `reset ${normalized.join(', ')} — users: ${users.deletedCount}, ` +
      `codes: ${codes.deletedCount}, requests: ${requests.deletedCount}`,
  )
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2)

  if (!command) {
    console.error('Usage: pnpm dev:tool <peek-code|issue-code|simulate-google|list-users|user-json|count-users|reset>')
    process.exit(2)
  }

  await connectToDatabase()

  try {
    switch (command) {
      case 'peek-code':
        await peekCode(requireArg(args, 0, 'email'))
        break
      case 'issue-code':
        await issueCode(requireArg(args, 0, 'email'))
        break
      case 'simulate-google':
        await simulateGoogle(
          requireArg(args, 0, 'email'),
          requireArg(args, 1, 'googleId'),
          args[2],
        )
        break
      case 'list-users':
        await listUsers()
        break
      case 'user-json':
        await userJson(requireArg(args, 0, 'email'))
        break
      case 'count-users':
        await countUsers()
        break
      case 'reset':
        await reset(args)
        break
      default:
        console.error(`Unknown command: ${command}`)
        process.exit(2)
    }
  } finally {
    await disconnectFromDatabase()
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
