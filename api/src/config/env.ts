import 'dotenv/config'

function required(name: string): string {
  const value = process.env[name]
  if (value === undefined || value.trim() === '') {
    throw new Error(
      `Missing required env var ${name}. Copy api/.env.example to api/.env and fill it in — see SETUP.md.`,
    )
  }
  return value.trim()
}

function optional(name: string, fallback: string): string {
  const value = process.env[name]
  return value === undefined || value.trim() === '' ? fallback : value.trim()
}

const PORT = Number(optional('PORT', '4001'))
if (!Number.isInteger(PORT) || PORT <= 0 || PORT > 65535) {
  throw new Error(`PORT must be a valid port number, got "${process.env.PORT}"`)
}

const EXECUTE_RATE_LIMIT = Number(optional('EXECUTE_RATE_LIMIT_PER_MINUTE', '60'))
if (!Number.isInteger(EXECUTE_RATE_LIMIT) || EXECUTE_RATE_LIMIT <= 0) {
  throw new Error(
    `EXECUTE_RATE_LIMIT_PER_MINUTE must be a positive integer, got "${process.env.EXECUTE_RATE_LIMIT_PER_MINUTE}"`,
  )
}

/**
 * 32 bytes of key material for AES-256-GCM, hex or base64.
 *
 * Deliberately `required`: a missing key can only be handled by either refusing
 * to boot or silently writing secrets as plaintext, and the second option is the
 * exact failure this encryption exists to prevent. Generate one with
 * `openssl rand -hex 32`.
 */
function requiredEncryptionKey(): Buffer {
  const raw = required('ENCRYPTION_KEY')

  const decoded = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64')

  if (decoded.length !== 32) {
    throw new Error(
      'ENCRYPTION_KEY must decode to exactly 32 bytes (64 hex chars or 44 base64 chars). Generate one with: openssl rand -hex 32',
    )
  }
  return decoded
}

export const env = {
  nodeEnv: optional('NODE_ENV', 'development'),
  port: PORT,

  mongoUri: required('MONGO_URI'),

  resendApiKey: required('RESEND_API_KEY'),
  resendFrom: optional('RESEND_FROM', 'Xenon <onboarding@resend.dev>'),

  googleClientId: required('GOOGLE_CLIENT_ID'),
  googleClientSecret: required('GOOGLE_CLIENT_SECRET'),
  googleRedirectUri: optional('GOOGLE_REDIRECT_URI', `http://localhost:${PORT}/auth/google/callback`),

  postLoginRedirect: optional('POST_LOGIN_REDIRECT', 'http://localhost:3000/app'),

  /** Base URL of the Next.js app. Invite links and billing redirects are built from it. */
  frontendUrl: optional('FRONTEND_URL', 'http://localhost:3000').replace(/\/+$/, ''),

  /**
   * Public base URL of this API. Paystack sends the payer's browser back here
   * after checkout, so it has to be the externally reachable origin, not
   * whatever host Express happens to be bound to.
   */
  apiUrl: optional('API_URL', `http://localhost:${PORT}`).replace(/\/+$/, ''),

  paystackSecretKey: required('PAYSTACK_SECRET_KEY'),

  encryptionKey: requiredEncryptionKey(),

  executeRateLimitPerMinute: EXECUTE_RATE_LIMIT,
} as const

export const isProduction = env.nodeEnv === 'production'
