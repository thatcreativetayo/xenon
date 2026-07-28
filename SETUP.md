# Xenon — auth backend setup

Do these three account setups **first**. Each one produces a value that goes into `api/.env`.
Copy `api/.env.example` to `api/.env` and fill it in as you go.

```bash
cd api
cp .env.example .env
```

---

## 1. MongoDB Atlas (free M0) → `MONGO_URI`

1. Go to <https://www.mongodb.com/cloud/atlas/register> and sign up (Google sign-in is fine).
2. On the "Deploy your cluster" screen pick the **M0 / Free** tier. Choose the provider region
   closest to you (latency only — any works). Name the cluster `xenon`. Click **Create Deployment**.
3. Atlas immediately shows a **"Connect to xenon"** panel with a *Create a database user* step and an
   auto-generated username + password. **Copy the password now** — it is not shown again.
   - Missed it? Left sidebar → **Database Access** → **Add New Database User** → Authentication
     Method *Password* → give it a username/password → Built-in Role **Read and write to any
     database** → **Add User**.
4. Left sidebar → **Network Access** → **Add IP Address**. For local dev click
   **Allow Access from Anywhere** (`0.0.0.0/0`) → **Confirm**. (Home IPs usually rotate, so
   "Add Current IP Address" tends to break the next day.)
5. Left sidebar → **Clusters** → **Connect** on the `xenon` cluster → **Drivers** → Driver *Node.js*.
   Copy the connection string. It looks like:

   ```
   mongodb+srv://xenonuser:<db_password>@xenon.ab1cd.mongodb.net/?retryWrites=true&w=majority&appName=xenon
   ```

6. Two edits before it works — **both matter**:
   - Replace `<db_password>` with the real password. If it contains `@ : / ? # [ ] %` you must
     percent-encode it (`@` → `%40`, `#` → `%23`, `/` → `%2F`), otherwise the URI parse fails.
     Easiest path: reset the password to something alphanumeric.
   - Insert the **database name** `xenon` between the host and the `?`. Without it, everything
     silently lands in a db called `test`.

   Final value:

   ```
   MONGO_URI=mongodb+srv://xenonuser:s3cret@xenon.ab1cd.mongodb.net/xenon?retryWrites=true&w=majority&appName=xenon
   ```

---

## 2. Resend → `RESEND_API_KEY`, `RESEND_FROM`

1. Sign up at <https://resend.com/signup>. **Note which email address you sign up with** — step 4
   explains why it matters tonight.
2. Left sidebar → **API Keys** → **Create API Key**. Name it `xenon-dev`, Permission
   **Sending access**, Domain *All domains*. → **Add**.
3. Copy the key (`re_...`) immediately — it is only displayed once.

   ```
   RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx
   ```

4. **Sender address.** You have no verified domain yet, so use Resend's shared sandbox sender:

   ```
   RESEND_FROM=Xenon <onboarding@resend.dev>
   ```

   ⚠️ The sandbox sender will **only deliver to the email address you created the Resend account
   with**. Sending to any other address returns a 403 from Resend. So for win-condition #1, request
   the code using your Resend signup email.

5. *(Later, not tonight)* To email anyone: **Domains** → **Add Domain** → enter a domain you own →
   add the shown DKIM `TXT` + SPF `MX/TXT` records at your DNS provider → **Verify**. Then change
   `RESEND_FROM` to e.g. `Xenon <auth@yourdomain.com>`. Propagation is minutes to a few hours.

---

## 3. Google Cloud Console OAuth client → `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`

Google renamed this area to **Google Auth Platform**; the layout differs slightly by account age, so
both paths are given.

1. <https://console.cloud.google.com> → project dropdown in the top bar → **New Project** → name it
   `Xenon` → **Create**. Make sure the top bar shows `Xenon` before continuing.
2. **Consent screen.** Navigate to **APIs & Services → OAuth consent screen** (newer UI:
   **Google Auth Platform → Branding**).
   - User Type **External** → **Create**.
   - App name `Xenon`, User support email = your email, Developer contact = your email → **Save and
     Continue**.
3. **Scopes.** → **Add or Remove Scopes** → tick these three, then **Update** → **Save and Continue**:
   - `openid`
   - `.../auth/userinfo.email`
   - `.../auth/userinfo.profile`
4. **Test users** (newer UI: **Google Auth Platform → Audience**). Your app is in *Testing* mode,
   which means **only listed accounts can sign in**. Click **Add Users** and add every Google
   account you plan to test with — including the second, different-email account you need for
   win-condition #3. Skipping this gives you `Error 403: access_denied` in the browser.
5. **Create the client.** **APIs & Services → Credentials** (newer UI: **Google Auth Platform →
   Clients**) → **Create Credentials** → **OAuth client ID**.
   - Application type: **Web application**
   - Name: `Xenon local`
   - **Authorized redirect URIs** → **Add URI** → paste exactly, no trailing slash:

     ```
     http://localhost:4001/auth/google/callback
     ```

     This must match `GOOGLE_REDIRECT_URI` character for character or Google returns
     `Error 400: redirect_uri_mismatch`. *Authorized JavaScript origins* can be left empty — this is
     a server-side code exchange, not a browser-side flow.
   - **Create**.
6. Copy **Client ID** and **Client secret** from the dialog:

   ```
   GOOGLE_CLIENT_ID=1234567890-abcdefg.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=GOCSPX-xxxxxxxxxxxx
   ```

---

## 4. Install and run

```bash
cd api
pnpm install
pnpm dev
```

You should see:

```
[db] connected to MongoDB
[xenon] auth api listening on http://localhost:4001
```

The server refuses to boot with a named error if any required env var is missing, so a blank
`.env` fails loudly rather than at first request.

---

## 5. Win conditions

### #1 + #2 — email code round trip

Use your **Resend signup email** (see §2.4).

```bash
curl -i -X POST http://localhost:4001/auth/email/request-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com"}'
```

`202 Accepted`, and the 6-digit code arrives in your inbox. Then:

```bash
curl -i -X POST http://localhost:4001/auth/email/verify-code \
  -H 'Content-Type: application/json' \
  -d '{"email":"you@example.com","code":"123456"}'
```

Look for the header:

```
Set-Cookie: xenon_token=<64-hex-chars>; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000
```

A 4th request-code call inside the same 10 minutes returns `429` with `retryAfterSeconds`.

### #3 — Google with a *new* email

Open <http://localhost:4001/auth/google> in a browser, sign in with a Google account whose email is
**different** from #1 (and which you added as a test user). You land on
`http://localhost:3000/app` — connection refused is expected and fine, nothing serves port 3000
tonight. Confirm in devtools **Network → the callback request → Response Headers** that
`Set-Cookie: xenon_token=...` is present, and that Application → Cookies shows it on `localhost`.

Confirm a *second, separate* user exists:

```bash
pnpm dev:users
```

### #4 — Google with the *same* email as #1

Repeat #3 but sign in with the Google account matching the email from #1. Then:

```bash
pnpm dev:users
```

The row count is unchanged, and the user from #1 now has a `googleId` — same `_id`, same `token`.
That is the merge.

### Automated proof of (a) (b) (c)

With the server running:

```bash
pnpm test:merge
```

See [api/scripts/test-merge.sh](api/scripts/test-merge.sh) for what it asserts.
