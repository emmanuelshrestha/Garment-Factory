# Scaling, Multi-User, and Commercialisation

Status: **plan only — not approved, not started**
Date: 2026-03-25
Audience: owner + engineer
Related: `PLAN.md` (MVP), `DECISIONS.md` (OPEN-6, OPEN-5, OPEN-7), `DEPLOY.md` (single-machine), `docs/ARCHITECTURE.md`

This document is the build plan for taking the current product — a correct, owner-only, loopback factory app — and turning it into something that can be used by several people in one factory, then hosted, then sold to other factories.

It is **not** a licence to start coding. Money, stock, invoices, and historical records stay under the same rules as the MVP. Scaling work that would invent a business rule, weaken a ledger invariant, or add a backend dependency without naming it is refused.

---

## 0. What is already true

The MVP (Slice 1 sales/inventory + later production, cutting stock, and employee earnings) is fit for **one factory PC, one operator**. That is the product that exists today.

| Fact | Where it lives |
|---|---|
| HTTP API + React UI on one process | `src/main.ts`, `src/http/server.ts`, `web/dist/` |
| Bound to loopback by default | `src/config.ts` `host: 127.0.0.1` |
| No login; every mutation is attributed to the owner | `src/http/context.ts` `resolveOwnerUserId` |
| `users` and `sessions` tables exist; passwords are hashed | `001_init.sql`, `scripts/seed.ts` (`scryptSync` + salt) |
| Roles already constrained to `owner` / `staff` | `users.role` CHECK |
| SQLite is the only database; the seam is one file | `src/db/sqlite.ts` (D006) |
| WAL, foreign keys, STRICT, `BEGIN IMMEDIATE`, 5s busy timeout | `openDatabase` |
| Hot backup is `VACUUM INTO` | `scripts/backup.ts` |
| Zero backend npm dependencies | `package.json` |
| Docker image exists but still has no auth | `Dockerfile`, `DEPLOY.md` |

What is **not** true, despite looking ready:

- Binding `GARMENT_HOST=0.0.0.0` does **not** make it a multi-user product. It puts an unauthenticated money-and-stock API on the LAN. The server already prints this warning. See OPEN-6.
- `users.password_hash` does **not** mean login works. Seed writes a hash so a future login does not need a data migration. Nothing reads it.
- A Dockerfile does **not** mean the product is sellable. There is no tenant, no billing, no session, no backup off the machine.

Launch verdict, restated:

- **Owner-only, factory PC, loopback:** usable now, with OPEN-5 / OPEN-7 workarounds.
- **Several people on the factory LAN:** not ready. Auth is the gate.
- **Hosted / sold to other factories:** not ready. Auth, tenancy, backups-off-box, and a commercial wrapper are the gate.

---

## 1. Non-negotiables (do not “scale away”)

These hold in every later phase. If a scaling idea conflicts with one of them, the idea is wrong.

1. **Integer minor units for money.** No float. No ORM decimal that becomes a float. (D007, D014, D018)
2. **Finished stock is the movement ledger.** No cached on-hand column unless explicitly approved. Never negative. One writer: `recordStockMovement`. (D003, D004)
3. **Issued invoices are immutable.** Void-and-reissue only. (D005, D025)
4. **Append-only tables stay append-only.** `stock_movements`, `invoice_lines`, `payment_allocations`, `price_history`, `audit_log`. (D013)
5. **Domain stays pure.** No database, HTTP, filesystem, or Stripe in `src/domain/`.
6. **Services own transactions.** `BEGIN IMMEDIATE` (or the PostgreSQL equivalent) around every multi-table write.
7. **SQLite access stays behind a seam.** Today that seam is `src/db/sqlite.ts`. A second driver is allowed only as a new file plus a factory, never as scattered `pg.query` calls.
8. **Do not invent business rules.** OPEN-5 (close a part-delivered order), OPEN-7 (returns), and staff permissions are owner decisions. Until answered, the code keeps refusing with a clear error.
9. **Name every new backend dependency.** The MVP backend is zero-dep so money tests run in the sandbox. Stripe, Postgres drivers, and email SDKs are real exceptions — they are listed in the phase that needs them, not slipped in.
10. **Do not put business logic in React.** Login, role checks, and tenant resolution belong on the server. The UI only reflects what the API allows.

---

## 2. Three products, not one leap

Selling is not one project. It is three successive products. Each one is shippable on its own. Do not start Product C while Product A is unfinished.

| Product | Who uses it | Where it runs | What must exist | What it is for |
|---|---|---|---|---|
| **A. Factory LAN** | Owner + staff of *this* factory | The factory PC, or a small NAS on the LAN | Login, sessions, roles, cookie, LAN bind after login | Daily use by more than one person |
| **B. Hosted single-factory** | Same people, from office / home | A VPS or container with a volume | HTTPS, off-box backups, process supervisor, restore drill | The factory PC is no longer a single point of death |
| **C. Sold to many factories** | Many unrelated businesses | Control plane + one isolated data store per factory | Tenancy, provisioning, billing, support login, rate limits | A product other people pay for |

Product A is the only phase that this factory itself needs. B and C are how you sell. Building C first would put other people’s money on an app that this factory does not yet log into.

Recommended sequence, with a stop after each:

```
A0  Authentication (login, session cookie, currentUserId from session)
A1  Staff users + a confirmed permission matrix
A2  LAN bind + HTTPS-or-trusted-network decision
A3  Operational hardening (busy retry, backup schedule, restore drill)
    ── ship to this factory ──
B1  Process supervisor / Docker as the supported install
B2  TLS, off-machine backup, monitoring
    ── offer as “we host it for you” ──
C1  Database-per-tenant (one SQLite file per factory)
C2  Provisioning + owner invite
C3  Billing (Stripe/Razorpay) in a *control plane*, not in the ledger
C4  Public site, plans, support
    ── sell ──
```

---

## 3. Product A — several users in one factory

This is OPEN-6, made precise. It does not change money or stock rules. It changes *who is allowed to call the existing services*.

### 3.1 Current code path (what to change)

Today:

1. `src/main.ts` opens **one** database, resolves **one** owner id, and builds **one** `AppContext`.
2. Every route uses `app.currentUserId` for `created_by`.
3. `Router.handle` has no middleware. A match calls the handler immediately.
4. `scripts/seed.ts` already implements `hashPassword` / `verifyPassword` with `scryptSync` (64-byte key, hex salt) and `timingSafeEqual`. Login is supposed to reuse that comparison exactly — the comment in the seed file says so.

Target:

1. A request either has a valid session cookie or it does not.
2. Unauthenticated callers may hit only `POST /api/auth/login`, `GET /api/health`, and static UI assets.
3. Authenticated callers get `currentUserId` from the session row, not from startup.
4. `created_by` and `audit_log.user_id` become the actual operator.

### 3.2 Schema

**No new tables for login.** `users` and `sessions` in `001_init.sql` are the design:

```
users     (id, username UNIQUE, password_hash, password_salt, display_name,
           role IN ('owner','staff'), is_active, created_at)
sessions  (id TEXT PK, user_id, created_at, expires_at)
```

Likely additive migration (new file, never edit `001`):

- `sessions.user_agent` / `sessions.ip` — optional, for “who is logged in” and theft forensics. Not required to ship login.
- `users.password_changed_at` — optional.
- `users.last_login_at` — optional; do not put it on the hot path if it contends with stock writes.

Do **not** store the raw password. Do **not** log it. Do **not** put it in `audit_log.detail_json`.

Session id: `crypto.randomBytes(32).toString('hex')` (64 hex chars). It is the primary key. Treat it like a password: only send it in an httpOnly cookie, never in JSON, never in a query string.

### 3.3 Files to add or move

| File | Job |
|---|---|
| `src/domain/auth.ts` | Pure rules: session expiry, “inactive user cannot log in”, allowed role transitions. No `node:crypto`, no DB. |
| `src/services/auth.ts` | Hash/verify (move out of `scripts/seed.ts`), create/get/revoke session, login, logout, list users, create staff, deactivate. Owns the transaction. |
| `src/http/auth.ts` | Parse `Cookie`, load session, attach user to a **per-request** context. Set/clear `Set-Cookie`. |
| `src/http/routes/auth.ts` | `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`, later user-admin routes. |
| `web/src/pages/Login.tsx` (or `components/LoginView.tsx`) | Username, password, error from 401. No business logic. |
| `web/src/api.ts` | `credentials: 'include'` on every `fetch`. `login`, `logout`, `me`. |
| `web/src/App.tsx` | If `me` is 401, render login instead of the app. |
| `tests/unit/auth.test.ts` | Expiry, inactive user, wrong password (using exported verify). |
| `tests/integration/auth.test.ts` | Login sets cookie; next request is that user; logout; expired session; staff cannot hit owner-only routes. |

Seed keeps creating the owner. It **imports** `hashPassword` from the service so there is one hash format.

### 3.4 Cookie contract

Name: `garment_session` (or `GARMENT_SESSION_COOKIE` in config).

Attributes:

- `HttpOnly` — always. JavaScript must not read it.
- `SameSite=Strict` — the UI and API are same-origin (Node serves `web/dist`).
- `Path=/`
- `Secure` — **only when the request is HTTPS**. On factory LAN HTTP, `Secure` would make the cookie undeliverable. Config flag `GARMENT_COOKIE_SECURE=1` for hosted.
- Expiry: `GARMENT_SESSION_TTL_HOURS` default **12**. Idle factory PCs should not stay logged in overnight. Absolute expiry in `sessions.expires_at`; no sliding expiry in v1 (sliding expiry hides stolen cookies).

Login response body is the public user (`id`, `username`, `displayName`, `role`). The session id is only in `Set-Cookie`.

Logout: delete the session row (sessions are not a financial ledger; they are credentials). `Set-Cookie` with a past expiry. Do not “expire in place” and leave the id reusable.

### 3.5 Per-request context (the important structural change)

`AppContext` today is process-global:

```
{ db, currentUserId }
```

After auth it must be:

```
{ db, currentUserId, currentUserRole, sessionId }
```

and it must be **built per request**, not once in `main.ts`.

How, without a middleware framework:

1. Keep `buildRouter(app: AppContext)` for tests that inject a user.
2. In `createApiServer`, wrap `router.handle`:
   - If path starts with `/api/` and is not `/api/health` or `/api/auth/login`:
     - Read cookie → lookup session → if missing/expired/user inactive → `401 { error: 'unauthenticated' }`.
     - Else call the route with a request-local context.
   - Static files stay public (the JS bundle is not a secret; the API is).
3. Routes that currently close over `app.currentUserId` keep doing so, but `app` is the request-local one.

Do **not** add a plugin system. A 40-line `authenticate(req, db)` function is enough.

HTTP mapping additions in `src/http/respond.ts`:

- Unauthenticated → **401** `unauthenticated`
- Authenticated but role insufficient → **403** `forbidden`
- Do not reuse 409 for these. 409 is a business-rule refusal on a well-formed, allowed request.

### 3.6 Password hashing

Keep the seed format so existing owner rows work:

- Salt: 16 random bytes, hex.
- Hash: `scryptSync(password, salt, 64)`, hex.
- Verify: decode both to buffers, length check, `timingSafeEqual`.

Optional hardening, same format:

- Pass `scrypt` cost params explicitly (`N: 16384, r: 8, p: 1`) so Node defaults cannot silently change.
- Minimum password length 10, enforced at login-set and at staff-create. Empty or `change-me` refused in production (`NODE_ENV=production` or `GARMENT_REQUIRE_STRONG_PASSWORD=1`).

Default seed password remains `change-me` **only** for development. Production start should refuse to listen if the owner hash still matches `change-me`, or if `GARMENT_OWNER_PASSWORD` is unset on first seed.

### 3.7 Staff users and permissions (OPEN — do not invent)

The schema already allows `role = 'staff'`. What staff may do is an **owner decision**. Until it is confirmed, implement only:

- Owner can create/deactivate staff and reset a staff password.
- Staff can log in.
- Every mutation still records `created_by`.
- A single function `assertRole(user, 'owner')` used by routes that must stay owner-only.

**Proposed default** (PROPOSED, not confirmed — see DECISIONS.md OPEN-8):

| Action | Owner | Staff |
|---|---|---|
| Catalogue, customers, orders, deliveries, invoices issue, payments record/apply | yes | yes |
| Stock adjustments | yes | no |
| Void invoice, bounce cheque, cancel cleared payment | yes | no |
| User admin, settings | yes | no |
| Deactivate customer / product | yes | no |
| Employee earnings (if in use) | yes | owner decides |

If the owner says “staff can do everything except user admin”, that is also a valid v1. Write the matrix in DECISIONS.md before coding the 403s. Wrong 403s are invented business rules.

### 3.8 Frontend

`web/src/api.ts` currently fetches without cookies. Change the helper so every call uses `credentials: 'include'`. A 401 from any API call during an authenticated session should drop the UI back to login (session expired).

Do not store the password. Do not store the session id in `localStorage`. The cookie is the session.

Print views stay as they are: they are the same origin, cookie is sent.

### 3.9 Tests that must pass before LAN bind is allowed

- Wrong password → 401, no session row.
- Right password → 201/200, `Set-Cookie`, session row with future `expires_at`.
- `GET /api/auth/me` with cookie → the user; without → 401.
- Inactive user cannot log in; existing sessions for that user are rejected.
- Expired session → 401 and the row can be deleted lazily.
- Logout → subsequent `me` is 401.
- Creating an order after login stores `created_by = <that user>`, not the owner id, unless they are the owner.
- `GET /api/orders` without cookie → 401 (this is the test that proves the API is no longer public).
- Seed owner can still log in with `GARMENT_OWNER_PASSWORD`.
- Mutation tests of `services/auth.ts` catch broken verify (timingSafeEqual skipped, salt ignored, etc.).

Until those pass, `GARMENT_HOST` stays `127.0.0.1`.

### 3.10 After login works: opening the LAN

1. Set `GARMENT_HOST=0.0.0.0`.
2. Keep the existing console warning until TLS is on, but change the text: “bound to all interfaces; login is required; traffic is still HTTP”.
3. Factory network must be trusted (PLAN.md §8). Guest Wi-Fi on the same LAN is a no. If it is, Product B (HTTPS) is required before opening the port.

This is still Product A. Other factories cannot sign up.

---

## 4. Product A hardening (same factory, safer)

Do these next to login. None of them need a new database engine.

### 4.1 SQLITE_BUSY retry

`transaction()` in `src/db/sqlite.ts` uses `BEGIN IMMEDIATE` and a 5s busy timeout. Two staff clicking “dispatch” at once can still lose: one waits, then throws.

Change (same file, same SQL):

- On `SQLITE_BUSY` / `SQLITE_LOCKED`, retry the **whole** `BEGIN IMMEDIATE … fn … COMMIT` up to N times (e.g. 3) with short backoff (10ms, 40ms, 160ms).
- Do **not** retry inside `fn` after a partial write. The helper already rolls back on throw.
- Do **not** nest transactions. That rule stays.
- Test: two concurrent deliveries of the last remaining pieces — one commits, one gets a business-rule shortage or a busy retry that then sees zero available. Never two `delivery_out` rows that take stock negative.

Optional: raise `PRAGMA busy_timeout` to 8000. Do not raise it to 30s; the UI would freeze.

### 4.2 One writer process

SQLite WAL allows many readers and one writer. Product A assumes **one Node process** per database file. Do not run two `npm start` against the same `garment.db` (Docker + a host process, or two windows). Document this in the runbook.

A second process is a restore/ops bug, not a scale strategy.

### 4.3 Backups that actually exist

Already implemented: `npm run backup` → `VACUUM INTO data/backups/…`.

Still missing, and required before treating the factory as “in production”:

1. **Windows Task Scheduler** (or cron) daily at a quiet hour, calling `npm run backup`.
2. **Copy off the PC** — USB, NAS, or cloud folder. PLAN.md assumption 9 is still open. A backup that lives on the same disk as `garment.db` is not a backup of a dead PC.
3. **Restore drill** already written in `docs/RUNBOOK.md`. Perform it once on a copy and record the date in the runbook. “A backup is not a backup until a restore has been rehearsed.”
4. Retention: 30 daily files, then keep month-ends. A 20-line cleanup in `scripts/backup.ts` is enough. Do not write a backup framework.

### 4.4 `verify-ledger` on a schedule

`npm run verify-ledger` already recomputes on-hand from movements. Run it after backup. If it fails, do not delete the backup; alert the owner. This is the cheapest integrity monitor the product will ever have.

### 4.5 Config cleanup

`.env.example` uses `GARMENT_DB_PATH` / `GARMENT_WEB_DIST_DIR`. `src/config.ts` reads `GARMENT_DB` / `GARMENT_WEB_DIST`. Align names in one change, document both for one release if needed, and make Docker match. Silent split config is how production points at an empty database.

Add:

```
GARMENT_SESSION_TTL_HOURS=12
GARMENT_COOKIE_SECURE=0
GARMENT_REQUIRE_STRONG_PASSWORD=0
```

### 4.6 What not to do in Product A

- Do not add PostgreSQL “for concurrency” of 3 staff. WAL + one process is enough.
- Do not add Redis, Prisma, Fastify, or a queue.
- Do not add a cached stock column.
- Do not build a mobile app.
- Do not build returns or “close short” as a side effect of auth. Those remain OPEN-7 and OPEN-5.

---

## 5. Product B — hosted single factory

Goal: the same one factory, reachable from more than one machine, with TLS and backups that survive the factory PC.

### 5.1 Process model

Keep **one Node process, one SQLite file, one volume**.

Supported install (pick one, document only that one):

- **Docker**, as in `DEPLOY.md`: bind mount `./data:/data`, set `GARMENT_DB` to the file on that volume. Frontend is baked into the image from `web/dist`.
- **Bare metal** + Windows Service / `nssm` / systemd, working directory fixed, Node 22 pinned.

Do not run a second “API server” and a separate static host unless TLS termination needs a reverse proxy.

### 5.2 TLS

HTTP on the public internet is not acceptable once invoices leave the building.

Options, cheapest first:

1. **Caddy or nginx** in front of Node, Let’s Encrypt, reverse_proxy to `127.0.0.1:4000`. Node keeps serving HTTP locally. `GARMENT_COOKIE_SECURE=1`.
2. Cloud flare tunnel / Tailscale — factory-only access without opening port 4000 to the world. Often the right answer for one business you host yourself.

The Node process does not need to speak TLS itself in v1.

### 5.3 Hosting platforms

For a **single** paying factory you host:

| Option | When to use | Database |
|---|---|---|
| A small VPS (Hetzner, DigitalOcean, Contabo) + Docker | You want SSH and a file you can copy | SQLite on a volume |
| Fly.io volume | You want a managed edge and a persistent disk | SQLite on the volume, **one machine** |
| Render/Railway disk | Same idea, more expensive disks | SQLite on disk, one instance |

**Do not** put SQLite on an ephemeral filesystem. **Do not** run two app instances against one SQLite file. If a platform forces horizontal scale, that platform is wrong for Product B.

PostgreSQL-as-a-service is Product C-optional, not a requirement to host one factory.

### 5.4 Off-box backup for hosted

Daily:

1. `VACUUM INTO` a timestamped file on the volume (consistency).
2. Upload that file to object storage (S3 / R2 / Backblaze). This is the first place a small, named dependency or a CLI (`aws`, `rclone`) is justified — **in an ops script**, not in the request path.
3. Restore drill: new VPS, copy file in, `npm start`, `verify-ledger`, log in.

Encryption at rest: disk encryption on the VPS plus bucket encryption. The SQLite file contains customer balances. Treat the bucket as secret.

### 5.5 Monitoring (minimum)

- Uptime check on `GET /api/health` every 5 minutes (UptimeRobot free tier).
- Process logs to stdout (already). Docker/journald keeps them.
- Optional: Sentry later. Not a launch blocker for one factory. If added, it is a backend dependency — name it, keep it out of `domain/`.

Do not build an internal metrics product.

---

## 6. Product C — selling to many factories

This is a different program sitting **around** the factory app. The factory app remains “one factory, one database, one set of ledgers”. The mistake is to turn every table into a multi-tenant table and hope `WHERE tenant_id = ?` is never forgotten on a money query.

### 6.1 Tenancy model — PROPOSED (OPEN-9)

**Decision to confirm before any C code:** how a second factory is isolated.

| Model | How | Isolation | Fits this codebase | Main cost |
|---|---|---|---|---|
| **C1. Database-per-tenant (recommended)** | One SQLite file per factory, e.g. `data/tenants/<slug>/garment.db` | Physical. A bug cannot leak Factory B’s invoices into Factory A’s SELECT | High. Services stay unchanged. Context gains `db` chosen per request | Ops: many files, many backups |
| **C2. Shared PostgreSQL + `tenant_id`** | Every table gets `tenant_id`, every query filters | Logical. One missed WHERE is a data breach | Low. Touches every SQL string, every migration, every test | One backup, easier fleet query |
| **C3. Schema-per-tenant in Postgres** | `tenant_acme.orders` | Medium | Medium. Migration runner must loop schemas | Operationally fussy |

**Recommendation: C1**, until a *single* tenant needs more write concurrency than one SQLite writer can give (many dozens of simultaneous dispatch clicks — not this market).

Reasons C1 matches the architecture:

- D006 already isolated SQLite behind one file.
- Backup/restore already know how to copy one file.
- Ledgers, sequences, and STRICT tables stay exactly as tested.
- `verify-ledger` runs per tenant without a tenant filter.
- A factory that leaves takes its file. GDPR/deletion is a directory delete after a retention hold.

C2 is the right move only if you later need cross-tenant analytics in one SQL query or a platform that will not store SQLite files. Do not pre-migrate.

### 6.2 Request routing for C1

New, small control-plane tables — **in a separate control database** (`data/control.db`), not inside a factory ledger:

```
tenants (id, slug UNIQUE, name, db_path, plan, is_active, created_at, …)
tenant_users  -- only if you centralise login; see 6.3
```

Resolution order (pick one, put it in config):

1. **Subdomain:** `acme.yourproduct.com` → slug `acme` → open `data/tenants/acme/garment.db` (cache the connection).
2. **Path prefix:** `/t/acme/api/...` — worse UX, easier local testing.
3. **Header** for the control API only, never as the only production check.

`createApiServer` today closes over one `db`. Change:

- Connection cache: `Map<slug, Db>` with a cap. Open on first request, migrate if needed, reuse.
- **Never** keep two tenants’ transactions on one connection.
- Close idle connections periodically so file backups are easier.

`AppContext.db` is the tenant database. Services do not know about slugs.

### 6.3 Login in a multi-tenant world

Keep **users inside the tenant database**. Factory A’s `owner` is not Factory B’s `owner`. Session rows stay in that tenant’s `sessions` table. Cookie must be scoped so it cannot be sent to another subdomain (`Domain=acme.yourproduct.com`, not the parent, or host-only cookies).

Do not introduce a global user table in v1. “Log in with Google across factories” is a later product.

Provisioning a tenant:

1. Create directory and empty SQLite file.
2. Run the **same** `migrate()` used in production.
3. Insert owner user with a hashed invite password or a one-time set-password token.
4. Do not copy another factory’s database.

### 6.4 Control plane vs factory app

Split the code at the HTTP boundary:

| Path | Database | Contains |
|---|---|---|
| `/api/...` (existing) | Tenant SQLite | Orders, stock, invoices, payments |
| `/control/...` (new, your staff only) | `control.db` | Tenant list, plan, suspend, impersonation flag |
| Marketing site | none | Pricing, signup |

The factory app must **not** call Stripe on the invoice path. Mixing “customer paid us for software” with “factory’s customer paid for jackets” is how ledgers get polluted.

If you ever store subscription status, it lives in `control.db`. The tenant app may read a signed “this tenant is active until T” flag at request start and return 402/403 if suspended. It does not write payment rows for *your* revenue into `payments`.

### 6.5 Rate limiting

In-memory, per process, in `src/http`:

- Key: tenant slug + IP for login; tenant slug + user for API.
- Login: 10 failures / 15 minutes / username, then 429. Prevents password grinding. Use a generic error so usernames are not enumerable if you can avoid it (`invalid_credentials` for both unknown user and bad password).
- API: something like 120 req/min/user. This app is a factory UI, not a public API.

No Redis. One process per machine in C1.

### 6.6 When (if ever) to add PostgreSQL

Add Postgres **per tenant that outgrows SQLite**, or as an alternative driver behind the existing seam, not as a surprise rewrite.

How to do it without lying about zero-dep:

1. Introduce `src/db/types.ts` with `Db` / `Tx` as the interface services already use (prepared statements, `exec`, `isTransaction`).
2. Keep `src/db/sqlite.ts` as the default implementation.
3. Add `src/db/postgres.ts` **only when a named driver is approved** (`postgres` or `pg`). That is a real dependency. Say so. Tests in the sandbox still run on SQLite.
4. SQL is SQLite dialect today (`STRICT`, `PRAGMA`, `?` placeholders, `INTEGER PRIMARY KEY`). Postgres will need a **second set of migrations** or a carefully chosen subset. Budget this as a project, not an afternoon.
5. `BEGIN IMMEDIATE` becomes `BEGIN` + `SET TRANSACTION ISOLATION LEVEL SERIALIZABLE` or explicit row locks around stock allocation. Re-run the stock/delivery tests against Postgres before any tenant uses it. Availability under concurrent writers is the whole point; if those tests are not run, do not migrate.

Until a tenant has a demonstrated SQLITE_BUSY problem that retries cannot absorb, **do not start**.

---

## 7. Billing and selling (the commercial wrapper)

### 7.1 What you are selling

You are not selling “an ERP”. You are selling **a garment factory operating system** that already does:

- Colour × Size stock with reservations
- Partial delivery
- Immutable invoicing and cheque lifecycle
- NPR / INR / USD with document-time FX
- Production / cutting stock / employee earnings as they exist

Price the **factory**, not the user count, until a factory asks for 20 seats. User count as a limiter is easy to add later (`COUNT(users)` vs plan) and hard to explain now.

**Proposed plans** (PROPOSED, OPEN-11 — confirm before building paywalls):

| Plan | Indicative | Includes |
|---|---|---|
| On-prem licence | one-time or annual | Product A on their PC. You do not hold their DB. |
| Hosted standard | monthly | Product B. One factory, one volume, backups included. |
| Hosted + production | monthly higher | Same + production/cutting/earnings modules if you gate them. |

Do not gate **correctness**. A cheaper plan that allows negative stock is not a plan.

### 7.2 Stripe / Razorpay

Named dependency, control plane only.

Recommended first provider:

- **Nepal/India cards and UPI:** Razorpay
- **International cards:** Stripe

How:

1. Hosted Checkout / Payment Link — they type card details on Stripe/Razorpay, not on your form.
2. Webhook `invoice.paid` / `subscription.active` → mark tenant active in `control.db`.
3. Webhook `subscription.deleted` / payment failed → grace period (owner decision, e.g. 7 days) then read-only or login-blocked.
4. Verify webhook signatures. Do not trust a query parameter.

Do not write a tax engine for *your* SaaS invoices in the factory domain. Your accountant’s tool issues those.

### 7.3 Signup flow (v1, manual is allowed)

The smallest honest v1 is **manual provisioning**:

1. They pay or you agree a price.
2. You create the tenant directory, migrate, set owner password, send the URL.
3. They log in and enter opening stock.

Self-serve signup is v2. It needs abuse controls (email verify, payment first) you should not invent on day one.

### 7.4 Website

A static page: what it is, who it is for (jacket factories, Colour × Size, Nepal/India money), a screenshot of the inventory matrix, a way to contact you. Do not iframe the live factory app.

A demo tenant with seed data (`npm run seed:demo`) on a throwaway database, reset nightly, is more convincing than a slide.

### 7.5 Licence for on-prem

If you sell a copy they run themselves:

- They get the same Docker/Node bundle.
- Support is “we help you update”.
- You still do not see their ledger unless they send a backup.
- Auth is still required; OPEN-6 applies to their LAN too.

Do not add phone-home licence keys in v1 unless piracy is a real problem. They are a support burden and another thing to get wrong on a factory with no internet.

---

## 8. Product features selling will demand (after A, not instead of A)

These are frequently requested. They are **not** scaling. They are product. Each needs an owner (or first customer) decision and its own tests.

| Feature | Status today | How to do it when approved |
|---|---|---|
| Close a part-delivered order | OPEN-5; `cancelOrder` refuses | Add an explicit `closeShort` that releases remaining allocations, leaves deliveries/invoices untouched, audits the reason. Do not reuse `cancelled` for this if the owner wants “closed at 200 of 500”. |
| Customer returns | OPEN-7; dispatched delivery cannot be cancelled | New slice: return document → `return_in` movements via `recordStockMovement` → financial effect is either credit note **or** void-and-reissue (owner chooses). QC-before-sellable is a second state; do not dump returns into finished stock if the owner says they need checking. |
| Credit terms | D022: due date typed per invoice | Ageing report from `due_date`. No standing terms column unless confirmed. |
| Roles beyond owner/staff | CHECK allows two values | Migration to add roles only after the matrix is written. |
| Reports / PDF / Excel | Print CSS for bills; `web/src/utils/csv.ts` | Server-side CSV of existing list endpoints. Do not add a reporting database. |
| Email/SMS reminders | none | Control-plane or a small outbox table. Never send from inside the invoice issue transaction (external I/O + ledger = poison). |
| PWA / mobile | web UI | Manifest + service worker last. Offline writes of stock are forbidden. |
| Barcode | none | Scan fills the existing variant id. No new stock path. |
| i18n | English UI, AD dates | Copy table in the frontend. Domain stays English rule names. |
| Opening-stock CSV | matrix screen | Parse CSV in a **service** that calls `recordOpeningBalance` per line in one transaction or in explicit batches. Reject partial silent loads. |

Production, payroll, raw materials, tax engine, multi-warehouse remain out of scope unless a paying customer funds them and the rules are written first. `CLAUDE.md` still says this.

---

## 9. How to implement a scaling slice (engineering method)

Same method as the MVP. A scaling slice that skips tests is not a scaling slice.

For any item in this document larger than one file:

1. Inspect the files listed in that section.
2. State a 3–7 bullet plan (this document already has most of them).
3. If it changes a business rule or schema, **stop for approval**.
4. Implement the smallest correct version.
5. Tests: domain first if there is a rule, then service transaction tests, then HTTP.
6. Update this file and `DECISIONS.md` if a decision was confirmed.
7. Report what changed and the test counts.

Auth is the first slice. It is the only one that currently blocks other people using the app.

**Suggested first implementation plan (auth only), when approved:**

1. Move `hashPassword` / `verifyPassword` from `scripts/seed.ts` to `src/services/auth.ts`; seed imports them. Unit-test verify (wrong salt, truncated hash, extra byte).
2. Add `src/domain/auth.ts` for expiry and inactive-user rules; unit-test.
3. Implement `login` / `logout` / `getSessionUser` in the service with real sessions table rows; integration-test.
4. Cookie helper + 401 for unauthenticated `/api/*` except health and login; HTTP tests with the existing `tests/helpers/testServer.ts`.
5. Per-request `currentUserId`; prove `created_by` on a created order.
6. Login view + `credentials: 'include'`.
7. Refuse production start if owner password is still the default.
8. Only then allow `GARMENT_HOST=0.0.0.0` in the runbook.

---

## 10. Cost sketch (not a quote)

For **this factory** (Product A): roughly zero extra rupees — it already runs on the PC.

For **one hosted factory** (Product B):

| Item | Order of magnitude |
|---|---|
| VPS 1 vCPU / 1–2 GB + 20 GB disk | a few hundred NPR–INR / month |
| Domain + TLS | domain annual; TLS free (Let’s Encrypt) |
| Object-storage backups | cents unless you retain huge files |

For **selling** (Product C):

| Item | Notes |
|---|---|
| Same VPS until ~dozens of quiet tenants | SQLite files are small; RAM is the cache of open DBs |
| Payment provider fees | Stripe/Razorpay percentage; do not hide them |
| Support time | Dominates cost. Manual provision is fine |

Do not rent Kubernetes for ten factories.

---

## 11. Risks

| Risk | Phase | Mitigation |
|---|---|---|
| Unauthenticated LAN bind | A | Cookie gate tests must exist first. Default host stays loopback. |
| Stolen session cookie | A/B | httpOnly, short TTL, logout deletes row, HTTPS when off LAN. |
| Two Node processes, one SQLite file | A/B | Runbook + single Docker container. |
| `tenant_id` forgotten on a money SELECT | C2 | Do not choose C2 until C1 hurts. |
| Stripe mixed into `payments` | C | Control plane database only. |
| Backup on the same disk | A | Off-box copy is a launch condition for “we depend on this”. |
| Invented staff permissions | A | OPEN-8. Owner matrix before 403s. |
| Postgres rewrite to look “enterprise” | C | Forbidden until SQLITE_BUSY is a measured problem. |
| Selling before this factory uses login | all | Product A is the reference customer. |

---

## 12. Open decisions that block work

Record answers in `DECISIONS.md`. Do not “just pick” them in code.

| ID | Blocks | Question |
|---|---|---|
| **OPEN-6** | Product A LAN, all of B/C | Who may reach the server? Login required before any non-loopback bind? Owner password policy? |
| **OPEN-8** (new) | Staff 403s | What may `staff` do that `owner` may not? See §3.7 table. |
| **OPEN-9** (new) | Product C | Confirm database-per-tenant SQLite vs shared Postgres. Recommendation: C1. |
| **OPEN-10** (new) | Product B | Hosted by you vs on-prem only vs both? TLS via Caddy vs Tailscale-only? |
| **OPEN-11** (new) | Billing | Prices, plans, who invoices the customer (you vs Stripe), grace period on failed payment. |
| **OPEN-5** | Order completeness | Close-short vs refuse. Not a scaling blocker; still needed for real factories. |
| **OPEN-7** | Returns | Return-to-stock vs QC hold; credit note vs void-and-reissue. Selling without this is possible; garment businesses will ask. |
| PLAN §9 item 9 | A/B backups | USB, NAS, or object storage for the off-machine copy? |

---

## 13. Definition of done

### Product A is done when

- Login, logout, me, cookie session, inactive users, expiry tests pass.
- Unauthenticated API calls (except health/login) return 401.
- `created_by` is the logged-in user.
- Staff can be created if OPEN-8 is answered; otherwise only the owner exists but login still works.
- Host may be `0.0.0.0` only with the warning about HTTP-on-LAN.
- Daily backup job exists; restore drill has been run once.
- Ledger verify still passes. Existing money/stock tests still pass.

### Product B is done when

- One factory runs on a host with TLS or a private tunnel.
- Backups land off that host.
- Restore from that backup has been rehearsed.
- Cookie `Secure` is on when HTTPS is on.

### Product C is done when

- A second factory can be provisioned onto a **separate** SQLite file without a code change to services.
- Factory A cannot read Factory B by cookie theft across hosts.
- Your subscription money is not stored in their `payments` table.
- Suspended tenants cannot mutate ledgers.
- You can take one tenant offline and restore it without touching the others.

### “Ready to sell” is not

- A pricing page without Product A in daily use.
- PostgreSQL.
- A mobile app.
- Multi-warehouse, tax, or payroll.

---

## 14. Explicitly out of scope until asked

Kubernetes, microservices, message buses, GraphQL, rewriting the router into Fastify/Express, ORMs, cached stock, shared-everything multi-tenancy, AI features, a marketplace, white-label in v1, and any change that edits issued invoices or rewrites `stock_movements`.

The backend may gain a **named** dependency when a phase actually requires it (Postgres driver, Stripe SDK, Sentry). The default remains zero dependencies in the factory request path.

---

*This document does not authorise implementation. Confirm OPEN-6 (and OPEN-8 if staff will exist) before Product A. Confirm OPEN-9 before any tenancy code. Confirm OPEN-11 before any payment integration.*
