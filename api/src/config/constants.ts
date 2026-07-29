/** Name of the httpOnly session cookie set on every successful login. */
export const AUTH_COOKIE_NAME = 'xenon_token'

/** Short-lived cookie holding the OAuth `state` value for CSRF validation. */
export const OAUTH_STATE_COOKIE_NAME = 'xenon_oauth_state'

/** How long an emailed one-time code stays valid. */
export const CODE_TTL_MS = 10 * 60 * 1000

/** Rate limit: at most this many code requests per email per window. */
export const CODE_REQUEST_LIMIT = 3

/** The rolling window the rate limit is measured over. */
export const CODE_REQUEST_WINDOW_MS = 10 * 60 * 1000

/** Session cookie lifetime. */
export const AUTH_COOKIE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

/** OAuth state cookie lifetime — long enough to pick a Google account, no longer. */
export const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000

/** How long /api/execute waits for the target server before aborting. */
export const EXECUTE_TIMEOUT_MS = 15 * 1000

/** Largest target-response body /api/execute will buffer and return. */
export const EXECUTE_MAX_RESPONSE_BYTES = 5 * 1024 * 1024

/** Request-history pagination defaults. */
export const HISTORY_DEFAULT_LIMIT = 50
export const HISTORY_MAX_LIMIT = 200
