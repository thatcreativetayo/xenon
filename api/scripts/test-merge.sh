#!/usr/bin/env bash
#
# Proves Xenon's account-merging rules. Run with the server already up
# (`pnpm dev` in another terminal) and a filled-in .env:
#
#   pnpm test:merge
#
# Asserts:
#   (a) email-code signup creates a user
#   (b) Google signup with a DIFFERENT email creates a second, separate user
#   (c) Google signup with the SAME email as (a) merges into the existing user —
#       same _id, same token, googleId now attached, no duplicate row
#
# The email leg runs over real HTTP against /auth/email/verify-code. The code is
# minted through the real issueEmailCode service via scripts/dev-tool.ts rather
# than a real inbox, because Resend's sandbox sender only delivers to the account
# owner's address. The Google leg calls findOrCreateUserByGoogle — the same
# function GET /auth/google/callback calls once it has a verified profile — since
# a genuine Google authorization code can only be obtained through a browser.
# Every assertion below therefore exercises production merge logic.

set -uo pipefail
cd "$(dirname "$0")/.."

BASE_URL="${BASE_URL:-http://localhost:4001}"
EMAIL_A="${EMAIL_A:-xenon-merge-a@example.test}"
EMAIL_B="${EMAIL_B:-xenon-merge-b@example.test}"
GOOGLE_ID_A="${GOOGLE_ID_A:-google-oauth2-merge-aaa-111}"
GOOGLE_ID_B="${GOOGLE_ID_B:-google-oauth2-merge-bbb-222}"

RED=$'\033[31m'; GREEN=$'\033[32m'; DIM=$'\033[2m'; BOLD=$'\033[1m'; OFF=$'\033[0m'
failures=0

pass() { printf '  %sPASS%s %s\n' "$GREEN" "$OFF" "$1"; }
fail() { printf '  %sFAIL%s %s\n' "$RED" "$OFF" "$1"; failures=$((failures + 1)); }
step() { printf '\n%s%s%s\n' "$BOLD" "$1" "$OFF"; }
note() { printf '  %s%s%s\n' "$DIM" "$1" "$OFF"; }

expect_eq() {
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == "$expected" ]]; then
    pass "$label"
  else
    fail "$label — expected '$expected', got '$actual'"
  fi
}

expect_ne() {
  local label="$1" a="$2" b="$3"
  if [[ "$a" != "$b" ]]; then
    pass "$label"
  else
    fail "$label — both values were '$a'"
  fi
}

tool() { pnpm -s dev:tool "$@"; }

# Pull a top-level string field out of a JSON blob without needing jq.
json_field() {
  local json="$1" key="$2"
  printf '%s' "$json" \
    | tr -d '\n' \
    | sed -n "s/.*\"$key\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p"
}

# ---------------------------------------------------------------------------
step "Preflight"

if ! curl -fsS --max-time 5 "$BASE_URL/health" >/dev/null 2>&1; then
  printf '  %sFAIL%s server not reachable at %s — start it with `pnpm dev`\n' "$RED" "$OFF" "$BASE_URL"
  exit 1
fi
pass "server is up at $BASE_URL"

note "resetting test accounts: $EMAIL_A, $EMAIL_B"
tool reset "$EMAIL_A" "$EMAIL_B" >/dev/null || {
  printf '  %sFAIL%s could not reach MongoDB — check MONGO_URI in .env\n' "$RED" "$OFF"
  exit 1
}

users_before="$(tool count-users)"
note "user count before: $users_before"

# ---------------------------------------------------------------------------
step "(a) email-code signup creates a user"

code_a="$(tool issue-code "$EMAIL_A")"
if [[ ! "$code_a" =~ ^[0-9]{6}$ ]]; then
  fail "issue-code returned a six-digit code (got '$code_a')"
  exit 1
fi
pass "minted code $code_a for $EMAIL_A"

verify_headers="$(mktemp)"
verify_body="$(curl -sS -D "$verify_headers" \
  -X POST "$BASE_URL/auth/email/verify-code" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_A\",\"code\":\"$code_a\"}")"

verify_status="$(sed -n 's/^HTTP\/[0-9.]* \([0-9]*\).*/\1/p' "$verify_headers" | tail -1)"
expect_eq "verify-code returned 200" "$verify_status" "200"

if grep -qi '^set-cookie: *xenon_token=' "$verify_headers"; then
  pass "response set the xenon_token cookie"
else
  fail "response did not set a xenon_token cookie"
fi

if grep -qi '^set-cookie: *xenon_token=.*httponly' "$verify_headers"; then
  pass "cookie is HttpOnly"
else
  fail "cookie is missing the HttpOnly flag"
fi
rm -f "$verify_headers"

expect_eq "verify-code reported created=true" "$(json_field "$verify_body" created)" "true"

user_a_json="$(tool user-json "$EMAIL_A")"
user_a_id="$(json_field "$user_a_json" id)"
user_a_token="$(json_field "$user_a_json" tokenPrefix)"
if [[ -n "$user_a_id" ]]; then
  pass "user row exists for $EMAIL_A (id $user_a_id)"
else
  fail "no user row found for $EMAIL_A"
  exit 1
fi

# Reusing the same code must fail — it was deleted on use.
replay_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/auth/email/verify-code" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_A\",\"code\":\"$code_a\"}")"
expect_eq "replaying the same code is rejected (single-use)" "$replay_status" "400"

# ---------------------------------------------------------------------------
step "(b) Google signup with a DIFFERENT email creates a second, separate user"

google_b="$(tool simulate-google "$EMAIL_B" "$GOOGLE_ID_B" "Merge Test B")"
expect_eq "created a new user for $EMAIL_B" "$(json_field "$google_b" created)" "true"

user_b_id="$(json_field "$google_b" id)"
expect_ne "user B has a different id from user A" "$user_b_id" "$user_a_id"
expect_eq "user B carries googleId $GOOGLE_ID_B" "$(json_field "$google_b" googleId)" "$GOOGLE_ID_B"

users_after_b="$(tool count-users)"
expect_eq "user count grew by exactly 2" "$users_after_b" "$((users_before + 2))"

# ---------------------------------------------------------------------------
step "(c) Google signup with the SAME email as (a) merges — no duplicate"

google_a="$(tool simulate-google "$EMAIL_A" "$GOOGLE_ID_A" "Merge Test A")"

expect_eq "did NOT create a new user" "$(json_field "$google_a" created)" "false"
expect_eq "reported googleIdAttached=true" "$(json_field "$google_a" googleIdAttached)" "true"
expect_eq "merged into user A's existing id" "$(json_field "$google_a" id)" "$user_a_id"
expect_eq "googleId is now attached to user A" "$(json_field "$google_a" googleId)" "$GOOGLE_ID_A"

users_after_c="$(tool count-users)"
expect_eq "user count did NOT change" "$users_after_c" "$users_after_b"

user_a_after="$(tool user-json "$EMAIL_A")"
expect_eq "user A's session token was preserved" "$(json_field "$user_a_after" tokenPrefix)" "$user_a_token"

step "(c2) email-code login into the Google-created account reuses it"

code_b="$(tool issue-code "$EMAIL_B")"
verify_b="$(curl -sS -X POST "$BASE_URL/auth/email/verify-code" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL_B\",\"code\":\"$code_b\"}")"
expect_eq "reused the Google-created user, created=false" "$(json_field "$verify_b" created)" "false"
expect_eq "user count still unchanged" "$(tool count-users)" "$users_after_b"

# ---------------------------------------------------------------------------
step "Rate limit: 3 requests per email per 10 minutes"

rate_email="xenon-ratelimit-$$@example.test"
tool reset "$rate_email" >/dev/null

rate_ok=1
for attempt in 1 2 3; do
  if ! tool issue-code "$rate_email" >/dev/null 2>&1; then
    fail "request $attempt of 3 should have been allowed"
    rate_ok=0
  fi
done
[[ $rate_ok -eq 1 ]] && pass "first 3 code requests allowed"

if tool issue-code "$rate_email" >/dev/null 2>&1; then
  fail "4th request should have been rate limited"
else
  pass "4th request rejected by the rate limit"
fi

# Over HTTP the same limit must surface as 429.
http_rate_email="xenon-ratelimit-http-$$@example.test"
tool reset "$http_rate_email" >/dev/null
for attempt in 1 2 3; do
  tool issue-code "$http_rate_email" >/dev/null 2>&1
done
rate_status="$(curl -sS -o /dev/null -w '%{http_code}' \
  -X POST "$BASE_URL/auth/email/request-code" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$http_rate_email\"}")"
expect_eq "request-code returns 429 once the limit is hit" "$rate_status" "429"

tool reset "$rate_email" "$http_rate_email" >/dev/null

# ---------------------------------------------------------------------------
step "Final state"
tool list-users

if [[ $failures -eq 0 ]]; then
  printf '\n%sAll merge assertions passed.%s\n' "$GREEN" "$OFF"
  printf '%sLeaving %s and %s in place so you can inspect them.%s\n' \
    "$DIM" "$EMAIL_A" "$EMAIL_B" "$OFF"
  printf '%sClean up with: pnpm dev:tool reset %s %s%s\n\n' "$DIM" "$EMAIL_A" "$EMAIL_B" "$OFF"
  exit 0
fi

printf '\n%s%d assertion(s) failed.%s\n\n' "$RED" "$failures" "$OFF"
exit 1
