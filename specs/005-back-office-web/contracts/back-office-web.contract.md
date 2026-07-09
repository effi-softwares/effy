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
| `GET /admin/v1/ping` (004, existing) | identity proving read at **P2** (token echo; denies role-less) | Bearer **access** token | identity + roles |
| `GET /admin/v1/me` | record-backed identity read (**US4**; the P2 screen graduates to it) | Bearer **access** token | `StaffRecord` |
| `GET /admin/v1/admin-ping` | admin-only read — **role-claim gate (US3) → DB-record authz (US4)** | Bearer **access** token | `AdminPingResult` \| `forbidden` |

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

## 5. Routing, shell & guards (`src/router.tsx`, ARCHITECTURE admin-web)

- **Public** `auth` layout: sign-in + OTP verify.
- **Protected** `app` layout: `beforeLoad` ensures the session query (redirect to
  `/auth/sign-in?next=…` if `signed-out`) — FR-004. It renders the **default dashboard shell**
  (Amendment D1 / FR-023): a persistent **collapsible sidebar** (`SidebarProvider → AppSidebar`)
  + an **inset header** (`SidebarTrigger` + route **breadcrumb**) + a main content region hosting
  the same `<Outlet/>`. Built from the shadcn `sidebar-07` block, themed from `design-system`
  (§6) — no hardcoded brand.
  - **Sidebar brand**: a single **Effy Back-Office** mark (single-brand platform — no team switcher).
  - **NavMain (role-aware)**: items from a static nav model filtered by the **same** role logic as
    the route guards (`isAdmin`/`requireGroup`) — the Admin item is hidden for manager/csa/role-less.
    This is a reflection of the authoritative gate, never a substitute (FR-006/FR-006a).
  - **NavUser (sidebar footer)**: verified identity (email/subject) + **Sign out** (`useSignOut` →
    `/auth/sign-in`) + **theme toggle**. Collapse/expand state is client-UI state in `uiStore`.
- **Admin-only** area: `beforeLoad` `requireGroup('admin')` (interface gate) **and** the screen
  calls `/admin/v1/admin-ping` (authoritative gate) — US3/FR-006a.

## 6. Design + telemetry boundaries

- Brand tokens + **dark mode** consumed from `packages/design-system`; no hardcoded brand in the
  app (FR-011).
- **Theme (FR-024, Amendment D2)**: **neutral surfaces** (backgrounds, sidebar, cards, borders,
  hovers on the neutral scale — no brand-tinted blends) with the brand green **Jade `#0FB57E`** as
  the **single accent** (primary, ring, brand mark). Set once in the design-system tokens; the
  sign-in screen and the shell inherit it — never re-styled per screen. (Values: research Part H.)
- **Responsive scaling (FR-025, Amendment D2)**: the UI scales proportionally on wide displays via
  a design-system **root-font-size `clamp()`** rule (all rem-based sizing grows together); baseline
  preserved at laptop width; a content `max-width` cap guards ultrawide. Pure CSS, no client state.
- Telemetry (Principle VII): typed PostHog event taxonomy in `lib/telemetry` — sign-in lifecycle
  + `admin_area_access_denied`; runtime errors routed to PostHog. **No PII beyond `subject`**; a
  missing analytics key degrades to no-op.

## 7. Out of contract (this slice)

No product CRUD, no hosted deploy, no TanStack DB, no endpoints beyond the two proving reads.
