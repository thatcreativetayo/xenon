# Xenon

An API testing tool for non-technical teams.

```
api/    Express + TypeScript API (MongoDB via Mongoose)
app/    Next.js frontend scaffold — not wired to the API yet
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
| `Workspace` | `name`, `ownerId`, `createdAt` |
| `WorkspaceMember` | `workspaceId`, `userId`, `role` (`owner`\|`member`) — unique per pair; all access checks resolve to this |
| `Collection` | `workspaceId`, `name`, `createdAt` |
| `SavedRequest` | `collectionId`, `name`, `method`, `url`, `headers`, `params`, `body`, `authType`, `authConfig`, `createdAt`, `updatedAt` |
| `RequestHistory` | `workspaceId`, `savedRequestId?`, `runByUserId`, `method`, `url`, `status` (0 = target never answered), `durationMs`, `ranAt` |

## Product API

All `/api` routes sit behind the `xenon_token` cookie (`requireAuth`). Every
resource access is verified up the chain — request → collection → workspace →
membership — and both "doesn't exist" and "not yours" answer `404`, so IDs
can't be probed.

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/workspaces` | `{ name }` → creator becomes owner. |
| `GET` | `/api/workspaces` | Workspaces you're a member of. Provisions a default one if you have none. |
| `POST` | `/api/workspaces/:id/collections` | `{ name }` |
| `GET` | `/api/workspaces/:id/collections` | |
| `GET` | `/api/workspaces/:id/history` | Newest first; `?limit=` (default 50, max 200) `&skip=`. |
| `DELETE` | `/api/collections/:id` | Also deletes the collection's saved requests; history is kept. |
| `POST` | `/api/collections/:id/requests` | `{ name, method, url, headers?, params?, body?, authType?, authConfig? }` |
| `GET` | `/api/collections/:id/requests` | |
| `PATCH` | `/api/requests/:id` | Partial update; bumps `updatedAt`. |
| `DELETE` | `/api/requests/:id` | |
| `POST` | `/api/execute` | Runs a request server-side. Same shape as a saved request plus `workspaceId` (or `savedRequestId` to infer it). Returns `{ status, statusText, headers, body, durationMs }`, records a history row. 15s timeout; 5 MB response cap; redirects returned, not followed. |

New users get a default workspace (`"{name}'s Workspace"`, or `"My Workspace"`
when the account has no name) on first login.

### /api/execute and SSRF

The execute route makes the server call user-supplied URLs, so it refuses
targets that resolve to internal addresses: `localhost`/`*.localhost`/`*.internal`,
`127.0.0.0/8`, `0.0.0.0`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`,
link-local/cloud-metadata `169.254.0.0/16`, CGNAT, and the IPv6 equivalents
(including IPv4-mapped). Hostnames are DNS-resolved and every returned address
is checked; redirects are never followed. See
[api/src/lib/ssrf.ts](api/src/lib/ssrf.ts) for the residual DNS-rebinding
caveat.
