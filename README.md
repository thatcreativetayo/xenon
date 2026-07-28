# Xenon

An API testing tool for non-technical teams.

Right now the repository contains the auth foundation only — no workspace,
collection or request features yet.

```
api/    Express + TypeScript auth API (MongoDB via Mongoose)
app/    Next.js frontend scaffold — not wired to auth yet
```

## Getting started

Account setup (MongoDB Atlas, Resend, Google Cloud Console) and the full
verification walkthrough live in **[SETUP.md](SETUP.md)**. Start there.

```bash
cd api
cp .env.example .env   # then fill it in — see SETUP.md
pnpm install
pnpm dev               # http://localhost:4001
```

## Auth

Two methods, and only ever these two — no passwords.

| Method | Purpose |
| --- | --- |
| Email one-time code | Primary. Six digits, 10-minute expiry, single use. |
| Google OAuth | Secondary. |

Both issue the same opaque session token in an httpOnly `xenon_token` cookie.

### Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/auth/email/request-code` | `{ email }` → emails a code. Max 3 per email per 10 min, else `429`. |
| `POST` | `/auth/email/verify-code` | `{ email, code }` → sets `xenon_token`, returns the user. |
| `GET` | `/auth/google` | Starts the OAuth flow. |
| `GET` | `/auth/google/callback` | Code exchange → sets `xenon_token` → redirects to `/app`. |
| `GET` | `/auth/me` | Resolves the cookie to a user. |
| `GET` | `/health` | Liveness. |

### Account merging

`email` is the single source of truth for identity, whichever method was used.
Signing in with Google using an address that already has an account attaches
`googleId` to that existing row rather than creating a second one — and vice
versa. Both paths go through a single atomic upsert keyed on `email`, so
concurrent first-time logins cannot race into duplicates.

Implemented in [api/src/services/users.ts](api/src/services/users.ts).

```bash
cd api
pnpm dev          # in one terminal
pnpm test:merge   # in another — asserts the merge rules
pnpm dev:users    # table of every user row
```

## Data model

| Collection | Fields |
| --- | --- |
| `User` | `email` (unique, sparse), `googleId` (unique, sparse), `token` (unique), `name`, `createdAt` |
| `EmailCode` | `email`, `code`, `expiresAt` — deleted on use |
| `CodeRequest` | `email`, `createdAt` — rate-limit log, survives code deletion |
