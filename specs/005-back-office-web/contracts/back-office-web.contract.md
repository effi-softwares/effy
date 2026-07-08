# Contract — Back-Office Web Console (consumption + behavior)

**Feature**: 005 · **Surface**: `apps/back-office` (client-only SPA) · **Date**: 2026-07-08

What the console consumes and how it must behave at its boundaries. Not an HTTP API (the console
exposes none) — this is the **client contract**: auth flow, backend consumption, token handling,
error handling, and the role gate.

## 1. Identity provider — AWS Cognito **admin** pool (001), via Amplify v6

- Configure at boot from `VITE_*` (config.contract.md): existing pool, **no** backend project,
  **no** identity pool, **no** sign-up.
- **Sign-in (passwordless EMAIL_OTP)** — the `USER_AUTH` choice flow (research C2):
  1. `signIn({ username: email, options: { authFlowType: 'USER_AUTH', preferredChallenge: 'EMAIL_OTP' } })`
     → expect `nextStep.signInStep === 'CONFIRM_SIGN_IN_WITH_EMAIL_CODE'`.
  2. `confirmSignIn({ challengeResponse: code })` → `DONE`.
- **Sign-out**: `signOut()` clears the session; all protected routes become unreachable (FR-003).
- **No password** is ever collected (Principle IV).

## 2. Backend consumption — `edge-api` only (cold path)

| Endpoint | Purpose | Auth | Maps to |
|---|---|---|---|
| `GET /v1/back-office/ping` (004, existing) | identity proving read at **P2** (token echo; denies role-less) | Bearer **access** token | identity + roles |
| `GET /v1/back-office/me` | record-backed identity read (**US4**; the P2 screen graduates to it) | Bearer **access** token | `StaffRecord` |
| `GET /v1/back-office/admin/ping` | admin-only read — **role-claim gate (US3) → DB-record authz (US4)** | Bearer **access** token | `AdminPingResult` \| `forbidden` |

*Build order (decouple):* US2 proves the loop against the existing `/ping`; US4 introduces `/me`
(records everyone, incl. role-less) and the console's identity screen graduates to it; the admin
gate ships role-claim-based at US3 and is upgraded to the DB record at US4.

- **Base URL**: `VITE_API_BASE_URL` (004 deploy output).
- The console adds **no** other endpoints; a missing interaction is a signal to extend edge-api
  in its own change (spec assumption), not to bypass it.

## 3. Token handling (`packages/api-client` + `lib/auth-session`)

- Before each request: `fetchAuthSession()` → `tokens.accessToken.toString()`; attach as
  `Authorization: Bearer <access>`. **Never** send the ID token to the backend.
- Amplify auto-refreshes when a valid refresh token exists; use `{ forceRefresh: true }` if a
  fresh token is required. A **401** on a protected call triggers a session re-check (refresh or
  redirect to sign-in preserving `next`), not an error toast (FR-009).
- RBAC groups read from `accessToken.payload['cognito:groups']`, filtered to `BackOfficeRole`.

## 4. Error handling — single client contract (FR-008)

- All backend failures parse as RFC 9457 problem+json (`shared-types/problem.ts`) → `DomainError`
  (`kind`). The UI renders human-readable states keyed on `kind`; **never** raw `detail`/stack/
  token to the user.
- Required states: `forbidden` → access-denied; `unavailable`/network/cold-start → degraded +
  retry; `unauthenticated` → session recovery / sign-in; `unsupported-version` → clear message.
- Corollary (spec edge case): a call from an **unapproved origin** is refused by edge-api CORS;
  the console is served only from the approved dev origin (`localhost:5173`).

## 5. Routing & guards (`src/router.tsx`, ARCHITECTURE admin-web)

- **Public** `auth` layout: sign-in + OTP verify.
- **Protected** `app` layout: `beforeLoad` ensures the session query (redirect to
  `/auth/sign-in?next=…` if `signed-out`) — FR-004.
- **Admin-only** area: `beforeLoad` `requireGroup('admin')` (interface gate) **and** the screen
  calls `/v1/back-office/admin/ping` (authoritative gate) — US3/FR-006a.

## 6. Design + telemetry boundaries

- Brand tokens (Jade `#0FB57E`/`#047857`) + **dark mode** consumed from
  `packages/design-system`; no hardcoded brand in the app (FR-011).
- Telemetry (Principle VII): typed PostHog event taxonomy in `lib/telemetry` — sign-in lifecycle
  + `admin_area_access_denied`; runtime errors routed to PostHog. **No PII beyond `subject`**; a
  missing analytics key degrades to no-op.

## 7. Out of contract (this slice)

No product CRUD, no hosted deploy, no TanStack DB, no endpoints beyond the two proving reads.
