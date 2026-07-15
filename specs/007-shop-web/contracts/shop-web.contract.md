# Contract — `shop-web` client behavior

**Feature**: 007 (FR-007, FR-010, FR-011, FR-013, FR-014, FR-016) · **Surface**:
`apps/shop-web` · **Status**: to build this slice.

The console's side of the platform contracts: how it authenticates, what it renders for every
backend outcome, how it gates the interface by role, and what it reports. This is the document a
newcomer reads before adding a shop screen.

---

## 1. Authentication

Passwordless **EMAIL_OTP** against the **shop** pool only, via Amplify v6. No self-sign-up. No
password field exists anywhere in the app.

```
email → startSignIn({ authFlowType: "USER_AUTH", preferredChallenge: "EMAIL_OTP" })
      → CONFIRM_SIGN_IN_WITH_EMAIL_CODE → submitOtp(code) → DONE → session
```

Both steps come from `@effy/web-kit` (`auth/otp.ts`) — identical to back-office, not copied.

- **Session** persists across reload (Amplify token storage) until legitimate expiry.
- **Protected routes** sit under one route with `beforeLoad: requireSession(...)`, which redirects
  to `/auth/sign-in?next=<href>` and returns the operator to their intended destination after
  authenticating (FR-004, SC-010).
- **Sign-out** clears the session; every protected area becomes unreachable.
- The **access token** is the bearer for `/shop/v1/*` (never the ID token; research R6).

### Sign-in error copy (no account-existence oracle)

An unrecognized or unprovisioned email produces the **same** message as a recognized one. Cognito
exception names map to human copy in `otpErrorMessage` (`web-kit`):

| Cognito exception | Message |
|---|---|
| `CodeMismatchException` | "That code isn't right. Check it and try again." |
| `ExpiredCodeException` | "That code has expired. Request a new one." |
| `LimitExceededException` / `TooManyRequestsException` / `TooManyFailedAttemptsException` | "Too many attempts. Wait a moment and try again." |

Never surfaced: which of the above occurred for an *unknown* email, or whether the account exists.

---

## 2. The client error-handling contract (single, documented)

Every backend failure arrives as a `DomainError` from `@effy/api-client` (RFC 9457 problem+json →
`kind`). Screens render a human state keyed on `kind` — **never** the raw `detail`, a stack trace,
a token, or a status code.

| `kind` | Rendered as | Recovery |
|---|---|---|
| `unauthenticated` | "Your session has expired." | recover session, else route to sign-in |
| `forbidden` | access-denied state; **no privileged data** | none (correct outcome) |
| `unavailable` | degraded state — "The service is waking up or unreachable." | **Retry** button |
| `not-found` | not-found state | back to dashboard |
| `unknown` | generic "Something went wrong." | Retry |

`createQueryClient` (web-kit) does **not** retry `forbidden` / `unauthenticated` / `not-found` —
retrying a correct denial wastes the operator's time and hammers the gate. Everything else retries
twice.

**Cold starts are an expected state, not a bug**: the cost-optimized backend may take seconds on
first wake. `unavailable` + Retry is the designed response (FR-011).

---

## 3. Role-aware interface (least-privilege UX, never the guard)

The interface reveals only what the operator's role permits, and the backend independently enforces
it. Interface gating is **defense in depth**, never a substitute (FR-007).

```ts
// src/components/layout/nav.ts
export const NAV: NavItem[] = [
  { label: "Dashboard",  to: "/",        icon: LayoutDashboard },
  { label: "Management", to: "/manager", icon: Shield, requiredRole: "shop_manager" },
];
export function visibleNav(roles: readonly ShopRole[]): NavItem[]
```

- A `shop_staff` operator does not see the Management item **and** is refused by
  `/shop/v1/manager-ping` if they navigate to `/manager` directly.
- A **role-less** operator sees no privileged item and reaches nothing privileged.
- An operator with **no shop assignment** is admitted to the shell and sees a clear "no shop
  assigned" state on the dashboard — explained, not a blank screen.

Roles come from the **platform record** (`/shop/v1/me`), not from the token, for everything the
interface renders about privilege. The token's claim is only ever an input to the backend's
reconcile.

---

## 4. Shell and theme

- The authenticated shell is `<ConsoleShell>` from `@effy/web-kit/console`: collapsible sidebar
  rail (brand, role-aware nav, user menu with identity + sign-out), a top bar showing the current
  location, and a main content region into which every screen renders (FR-014).
- `shop-web` **defines no theme of its own** (FR-013, SC-007). Brand, dark mode, and neutral
  surfaces with a single jade accent are inherited from `@effy/design-system` (`tokens.css`);
  sizing is the shadcn/Tailwind default. **Zero** local theme rules — asserted by a token-guard
  test, mirroring back-office's. *(2026-07-15: the shared `scale.css` fluid large-display scaling
  this once also inherited was removed platform-wide; the guard still forbids any local
  `font-size: clamp()`.)*
- shadcn primitives come from `@effy/design-system/ui`, not a local copy.

---

## 5. State discipline (Principle VI)

- The **server-state cache is the source of truth** for all server data (`sessionQuery`, `meQuery`,
  `managerPingQuery`). Server data is **never** hand-copied into component state or the client store.
- **TanStack Shop** holds genuine client state only: theme, sidebar collapse, command-palette
  open. No Zustand (constitution v1.4.0).
- Feature slices are `repo.ts` (DTO ↔ domain) → `queries.ts` (query options + keys) →
  `<Screen>.tsx`. A screen never calls `api` directly.

---

## 6. Telemetry (Principle VII)

PostHog via `createTelemetry` from `web-kit`, with a **`surface: "shop-web"` super-property** on
every event so shop-audience events are distinguishable from back-office events (FR-016).

`shop_auth_sign_in_started` · `shop_auth_otp_submitted` · `shop_auth_sign_in_succeeded` ·
`shop_auth_sign_in_failed` · `shop_auth_signed_out` · `shop_manager_area_access_denied` ·
`shop_assignment_missing`

**No PII beyond the verified `subject`.** Never the email, the OTP code, a token, or a shop code.
Runtime errors route to PostHog as `$exception`. Absent `VITE_POSTHOG_KEY` ⇒ every call is a no-op.

---

## 7. Add a screen — walkthrough

1. Create `src/features/<domain>/` with `repo.ts` (calls `api`, maps DTO → domain), `queries.ts`
   (`queryOptions` + key), and `<Screen>.tsx` (renders states, never raw errors).
2. Add the route in `src/routes/app.tsx` as a child of `appRoute`; register it in `router.tsx`.
3. Add a `NAV` entry in `src/components/layout/nav.ts`, with `requiredRole` if privileged — and
   **add the matching backend gate**. A hidden nav item is not a gate.
4. **Update the parity register** (`docs/audiences/shop-capabilities.md`): a capability added to
   the web surface must record its state on the mobile surface (FR-023a). This step is not optional.
5. `make shop-lint shop-test`.
