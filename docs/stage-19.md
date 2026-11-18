# Stage 19 — Authentication and User Lifecycle

## Completion and acceptance

**Stage 19 is complete and locally accepted on 2026-11-18.**

Baseline: `dbc4cd3` (accepted Stage 18). Implementation commit: `5b55b91`. The user confirmed successful operation of a second account: objects belonging to the first account are not visible, data is saved, and graph movement/behavior remains consistent with earlier stages. This acceptance covers local use, not a public deployment.

The implementation was installed in the existing local checkout on 2026-11-17. The legacy owner was activated without changing its user ID. Existing graph/layout ownership IDs remain unchanged. Historical migrations are unchanged; new head is `e19a01e4b901`.

### Recorded validation

- Backend: **148 tests passed** on PostgreSQL 17, both locally with Python 3.10 and in the final Python 3.13 Docker image.
- Frontend: **280 tests passed** on Node 24; TypeScript/Vite production build passed.
- Lint: exit 0; the same 13 warnings as the Stage 18 baseline, with no new warnings.
- Browser: 14 scenarios passed, including registration, verification, session restore, first node/Main layout, local recovery, cross-tab logout, same-browser account isolation, hash-link routing and mobile login. No page errors were recorded.
- Migration: clean upgrade, populated Stage 18 upgrade, normalized-email collision rollback and ORM/schema parity passed on disposable databases.
- Before updating the real local DB, a PostgreSQL custom-format backup was restored successfully to a separate verification database. After migration, full-row checksums matched for all 576 nodes, 618 edges, 2 layouts, 1,083 positions and 18 annotations (totals across accounts). Source and environment backups were retained outside this repository.
- User acceptance subsequently confirmed activation/login, password recovery, second-account isolation, persistence and unchanged graph behavior in the actual local application.

These are recorded results for this implementation; no destructive test suite was run against the user's application data.

### Current local operation

- Frontend: `http://localhost:5173`; backend Compose port is restricted to `127.0.0.1:8000`.
- `.env` retains the existing database settings and is untracked. Local operation uses `APP_ENV=development`, `MAIL_MODE=file`, `MAIL_SINK_PATH=/app/.local-mail` and an exact `PUBLIC_ORIGIN` matching the frontend.
- Verification/reset messages are written to the host project's `.local-mail/` through the existing bind mount. They are not sent to real mailboxes. `.local-mail/` is ignored by Git and Docker; do not commit or publish its bearer links.
- To activate a new local account, open its latest verification link from the local message and let the account owner enter the password. For a verified account with a forgotten password, use Forgot password and the latest reset link. Verification links last 24 hours, reset links 30 minutes. A newly issued same-purpose link supersedes the old one. Never repeat registration to reset an existing account.
- The user chooses passwords directly in the browser; passwords are not recorded in documentation or chat.

### Remaining before external testers

Real SMTP delivery, a public HTTPS origin, trusted reverse-proxy configuration, production cookie/throttle checks and deployment backup/restore procedures must be configured and verified before an Internet rollout. No server was purchased, public deployment performed or Git push made as part of closing Stage 19.


## Behavior

- Open registration; verify mailbox and choose/confirm the password from the email link before signing in. Verification sets the final password, preventing an attacker from pre-registering a known password against another person's mailbox.
- Login uses server-side PostgreSQL sessions. Session and action tokens are random 256-bit values; only SHA-256 digests of bearer tokens are stored. Argon2id hashes passwords. Password policy: 15–128 characters, preserving whitespace.
- Idle expiration: 7 days; absolute expiration: 30 days, configurable. Multiple devices are supported. Logout revokes the current session. Reset/change password revoke all sessions and action tokens. Reset never unblocks or verifies an account.
- Verification links expire after 24h, reset links after 30min. GET does not consume tokens. Tokens are removed from browser history and POSTed only after an explicit form submission.
- No private workspace until the account is verified and active. Shared type catalogues remain public and read-only.
- Empty first-run graph, a small first-node action, first Save creates Main. Empty graph camera initialization does not await a fit-to-nodes operation. No demo graph or copied legacy data.
- Local layout recovery, including an explicit snapshot of the initial unsaved layout at account teardown, stays under the same user scope. Logout offers Save / Leave without saving / Cancel when dirty. Recovery is best effort if local storage is unavailable or an operation is in flight; it is not a backup. Browser profile storage is not encrypted and is accessible through developer tools. Separate accounts must not be presented as protection against someone with access to that browser profile.
- Account changes remount the workspace, cancel requests and ignore old responses. A session-bound CSRF header on private reads and writes prevents a stale tab from loading or mutating the account selected in another tab. `/auth/me` deliberately revalidates the current cookie without that context requirement.
- BroadcastChannel invalidates other tabs; focus and a visible-tab 60s heartbeat revalidate. A lost connection does not clear the workspace as if logout succeeded.
- No roles/admin UI, OAuth, MFA, account deletion, sharing, subscriptions, or email change.

## Setup / rollout

1. Back up the actual PostgreSQL database and verify restore. Keep the application private/maintenance-only until legacy activation and auth checks pass. Do not run the destructive test fixture against production.
2. Install `requirements.txt` (direct dependencies plus tested constraints). Docker copies both requirements files. Frontend dependencies are unchanged; use `npm ci` and the supported Node version (tested Node 24).
3. Copy `.env.stage19.example` to `.env` and configure the database. The archive's original `.env` was not copied into this delivery. `PUBLIC_ORIGIN` must exactly match the browser origin, with no trailing slash/path. Development defaults to `http://localhost:5173`. `MYWAY_API_TARGET` optionally changes the Vite API proxy, whose default remains localhost:8000.
4. Production: `APP_ENV=production`, a private random `AUTH_SECRET` (32+ characters), HTTPS `PUBLIC_ORIGIN`, SMTP sender/credentials with STARTTLS. Configuration fails closed if these requirements are absent. Generate secrets locally; do not paste them into a chat or commit them.
5. Run `alembic upgrade head` against the intended DB. The migration stops on normalized email collisions and never merges users. IDs/graph/layouts/annotations are preserved; the users sequence is advanced safely. Existing users have no password or verified timestamp and cannot log in until bootstrapped.
6. Serve the frontend and `/api` on the same HTTPS origin. Strip `/api` on proxying to FastAPI, as Vite does. Forward Cookie/Set-Cookie, Origin, Content-Type and X-CSRF-Token. Do not cache authenticated responses. Keep API ports private. Set a proxy request-size limit (e.g. 1 MiB for workspace writes; auth is separately bounded at 16 KiB).
7. Configure trusted proxy IPs explicitly for Uvicorn so `request.client.host` represents the real source IP; never trust arbitrary Internet-supplied forwarded headers. The application uses DB-backed per-IP and per-email rate limits across workers, with Retry-After. Proxied traffic must not all appear as the proxy IP. Add edge/IP abuse limits at the public reverse proxy.
8. Configure and test actual SMTP delivery, sender domain and the public links. The implementation awaits bounded SMTP sending after committing the token. Delivery errors are logged without recipient/token payload, and resend can retry. Generic responses hide account status in their text; delivery-dependent timing is not a guarantee of account-enumeration resistance. A durable encrypted mail outbox is a future option if the delivery model changes; none is silently assumed here.
9. Activate each legacy account only after independently verifying ownership (see below), then verify that its original data opens. Set `REGISTRATION_ENABLED=false` during a private rollout if desired. This flag does not disable existing logins, recovery or verification.
10. Public rollout requires real HTTPS/cookie, trusted proxy, SMTP and throttle acceptance checks. Local test results do not establish those deployment properties. No deployment or modification of the user's actual DB was performed in this task.

Production cookie: `__Host-myway_session`, Secure, HttpOnly, SameSite=Lax, Path=/, no Domain. Local HTTP uses separate `myway_session_dev`. Public unsafe requests use a signed pre-auth CSRF cookie/header plus exact Origin validation; private requests additionally bind to the session's CSRF value. No auth token is stored in localStorage/IndexedDB.

## Operator commands

Run inside the configured server environment; possession of server/database access is the administrative boundary. No public block/bootstrap endpoint exists. Operator actions are emitted as structured audit lines (operator username, target ID, action, UTC timestamp), without raw tokens or internal reason contents.

```sh
# After verifying the owner of the legacy account, preserve its ID and send activation mail:
python -m app.commands.auth bootstrap 1 --email owner@example.com
# Permanent / temporary block:
python -m app.commands.auth block 1 --reason "Internal operator note"
python -m app.commands.auth block 1 --until 2026-12-01T12:00:00Z
python -m app.commands.auth unblock 1
# Periodic maintenance (schedule through your deployment tooling):
python -m app.commands.auth cleanup
```

Bootstrap refuses an already password-enabled/verified account and email collisions. Ordinary registration, resend and reset cannot claim an unactivated legacy row. Bootstrap mail delivery failure leaves the controlled activation eligible for resend. It never changes ownership links.

Block/unblock and protected operations lock the same user row. An operation authorized before block may commit first; once block commits, subsequent operations fail. Block revokes existing sessions/tokens and does not delete graph data. After a temporary block expires, a new login is required. A displayed graph is hidden on the next failed request, focus check or heartbeat; there is no push channel capable of retracting already delivered data.

## API

FastAPI `/auth/*`, browser `/api/auth/*`:

- GET csrf → csrf_token (pre-auth cookie/header).
- POST register: email, display_name, password → generic 202.
- POST login: email, password → safe user + csrf_token, session cookie.
- GET me → safe user + csrf_token; public catalogues aside, private GETs also require that csrf header.
- POST logout: `{}` → 204, current session revoked and cookie cleared.
- POST email/resend, password/forgot: email → generic 202.
- POST email/verify, password/reset: token, password → 204; login required afterward.
- POST password/change: current_password, password → 204; all sessions revoked.

Send JSON, exact trusted Origin on unsafe requests, and X-CSRF-Token. 401 for invalid credentials/session; 403 for verified-credential block/unverified state or CSRF/origin policy; 400 for invalid/expired/used tokens; 429 with Retry-After for limits. Domain ownership remains 404 and existing 409/422 semantics are preserved. Neither passwords/hashes nor internal blocking reasons are returned in safe user objects.

## Verification / regression notes

Tests include real independent cookie jars, concurrent token consumption, block serialization, foreign resource IDs, session/idle expiry, replay, rate limits, mailbox ownership, and activation without ownership reassignment. Migration tests create uniquely named disposable databases and exercise clean upgrade, populated Stage 18 upgrade and collision rollback, then compare ORM metadata to migrated schema. They require a PostgreSQL role allowed to create/drop those disposable databases.

`tests/conftest.py` still drops/creates all ORM tables in the DB named `myway_test`; only point it at an isolated test server. Old CRUD tests now use a test-only dependency override helper, not a production TEST_USER_ID fallback. Integration tests clear overrides and use actual cookie sessions.

The two historical ORM mismatches were corrected to match migrated behavior: edge→node FKs are RESTRICT, and edges.updated_at is timezone-aware. No historical migration or graph deletion contract changed. Auth requests serialize on each user's row for a simple, auditable block boundary; this is intentionally conservative for the initial user count and should be load-tested before substantial scale.

Rollback: do not downgrade auth or expose the old TEST_USER_ID application after public launch. The new migration explicitly refuses downgrade. Restore a verified backup only in maintenance/private mode, or forward-fix.


### Reproducing the browser check

Use a disposable instance with `MAIL_MODE=file` and a host-readable `MAIL_SINK_PATH`. Install Playwright and Chromium in a temporary tool directory, then run `poc/graph-visualization/tests/browser/stage19.cjs` with `MYWAY_PLAYWRIGHT_MODULE` pointing to that installed module, `MYWAY_TEST_ORIGIN` matching PUBLIC_ORIGIN, `MYWAY_TEST_MAIL_DIR` matching the mail sink, and `EVIDENCE_DIR` pointing to a writable screenshots folder. The check creates test accounts and a private node/layout, retains their local recovery and verifies same-browser isolation. It never uses a real mailbox and must not target production. Repeated runs can legitimately hit the rate limits.
