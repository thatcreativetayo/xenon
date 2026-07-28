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
} as const

export const isProduction = env.nodeEnv === 'production'
