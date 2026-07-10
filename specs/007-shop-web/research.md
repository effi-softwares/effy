# Phase 0 — Research: Shop Web Foundation (Bootstrap)

**Feature**: 007-shop-web · **Date**: 2026-07-09 · **Input**: [spec.md](./spec.md),
[operator-directives.md](./operator-directives.md), constitution v1.4.0,
[ARCHITECTURE.md](../../ARCHITECTURE.md)

Every technology choice below stays inside the locked Technology Standards. Nothing here
swaps a locked technology. Two decisions (R2, R5) expand scope beyond the spec's stated
assumptions and are called out as such.

---

## Terminology — the `shop` / `store` split

> **SUPERSEDED by 008-shop-naming-unification (2026-07-10).** This section recorded a decision to
> *keep* a two-name split for this audience. That split was retired: the audience, its pool, its
> authorizer, its service, its routes, its tables, and its roles are now all named **shop**, and
> `make verify-naming` enforces it. The record below is preserved because R1's argument — and the
> cost estimate it got wrong — is the reason 008 exists.

The repository carried two names for one audience. 007 chose not to rename what was deployed:

| Concept | Name at 007 | Name today (008) |
|---|---|---|
| The audience | store | **shop** |
| The identity pool | shop | shop (unchanged) |
| The gateway authorizer | shop | shop (unchanged) |
| The cold-path service | `effy-edge-store`, routes `/store/v1/...` | **`effy-edge-shop`, routes `/shop/v1/...`** |
| The mobile surface | shop | shop (unchanged) |
| The web surface | `shop-web` ← decided by R1 | shop-web (unchanged) |

### R1 — The web surface is `apps/shop-web` (package `@effy/shop-web`)

**Decision**: name the directory and package `shop-web`, not `store-web`. **Still correct.**

**Rationale**: the parity pair this slice exists to establish (FR-023a) is `shop-web` ↔
`shop-mobile`. Naming the web half `store-web` would put the two surfaces of one audience under two
different prefixes — precisely the drift the parity register prevents.

**Where R1 was wrong.** It also declined to rename the backend service, reasoning that "a live
deployed stack, live SSM contract, and `/store/v1/*` paths already consumed" made renaming "churn
with no user-visible benefit." Two of those three premises did not hold: **no SSM parameter ever
contained `store`** (the pool contract was always `/effy/<env>/auth/shop/*`), and the only consumer
of `/store/v1/*` was 007's own console, which had not shipped. The real cost was one `serverless
remove` of a stack serving four proving routes with no consumers. The benefit R1 could not see from
inside the slice was cumulative: every subsequent reader, author, and agent paid a mapping tax on
every shop feature, forever. 008 pays the one-time cost instead.

**Rule for readers (as of 008)**: *it is `shop` everywhere.* The four surviving senses of the word
"store" — the TanStack Store library, the customer "storefront", AWS "Parameter Store", and the
English verb — are enumerated in
[008's naming contract](../008-shop-naming-unification/contracts/naming.contract.md).

---

## R2 — RBAC on the shop pool (spec Q1) and the constitution tension

**Decision**: two Cognito groups on the shop pool — **`shop_manager`** (higher privilege)
and **`shop_staff`** (baseline operator) — created by the existing
`infra/modules/cognito-user-pool` `groups` variable. Roles originate in the identity
provider (`cognito:groups` claim), are reconciled into the platform record on every visit,
and the access decision is made from the platform record (role **and** status **and** shop
scope), never from the claim alone.

**Rationale**: this is the pattern the back-office pool already proves
(`infra/envs/dev/auth-backoffice.tf:20-24` → `admin.staff_role` reconcile in
`apis/edge-api/admin/src/staff/repository.ts`). Reusing it means the shop service's staff
module is a structural twin of the admin one, and the module already supports it: `groups`
is a `list(object({name, description}))` defaulting to `[]`, materialized as
`aws_cognito_user_group` under `for_each`. Adding groups to an existing pool is an additive,
create-only Terraform change — **no pool replacement, no user disruption**.

**Group naming**: prefixed (`shop_manager`, not `manager`) even though pool isolation makes
collision structurally impossible. The prefix keeps group names unambiguous in logs, JWT
dumps, and cross-pool conversations, where `manager` already means a back-office role.

**Constitution tension (real, must be resolved before the infra change lands)**:
Principle IV currently reads *"The admin pool defines RBAC groups (admin / manager / csa),
surfaced via the `cognito:groups` JWT claim."* Putting groups on a second pool makes that
sentence false as a description of the platform. Per Governance, this is a **material
expansion of guidance → MINOR bump → v1.5.0**, not a silent deviation.

**Proposed amendment (authored in this slice, before Phase 2 infra work)**:

> Pools MAY define RBAC groups, surfaced via the `cognito:groups` JWT claim. The admin pool
> defines `admin` / `manager` / `csa`; the shop pool defines `shop_manager` /
> `shop_staff`. The customer and driver pools define none. In every case the claim is the
> **origin of role assignment**; the platform's own record is authoritative for the access
> decision.

**Alternatives considered**:
- **Platform-only roles** (pool stays group-less; roles assigned solely in the DB). Avoids
  the amendment entirely and is arguably where the platform ends up long-term. Rejected by
  the operator at `/speckit-specify` Q1: it diverges from the proven back-office pattern and
  leaves role assignment with no operator-facing path until a later slice.
- **Claim-only authorization** (no platform record). Rejected: contradicts FR-021 and the
  005 precedent; a disabled operator holding a valid token would keep access.

---

## R3 — Shop entity + staff schema: shape, data area, and the three-term gate (spec Q2)

**Decision**: four tables in the **`public`** (customer-operational) schema —
`public.shop`, `public.shop_staff`, `public.shop_role`, `public.shop_staff_role` — via
the 003 forward-only Goose workflow. Authorization is **role AND status AND shop scope**.

**Why `public` and not `admin`**: the `admin` schema's designated purpose is *back-office
accounts + audit* (`db/migrations/20260705095817_baseline_admin_schema.sql`). A shop is a
fulfillment node — an operational entity every future slice (inventory, picking, orders)
will join against. Putting `shop` in `admin` would mean the operational schema's most
central entity lives in the back-office schema. Shop staff follow their shop.

**This is the platform's first `public` table.** Everything to date lives in `admin`. Worth
naming: the 003 workflow's forward-only guarantees and the `db-up` commit-guard are
schema-agnostic (`Makefile:119-125` greps `git status --porcelain db/migrations`), so no
workflow change is needed — but this is the first exercise of the operational half of the
two-schema model.

**Shop assignment is nullable.** `shop_staff.shop_id uuid NULL REFERENCES public.shop(id)
ON DELETE RESTRICT`. The JIT upsert meets an operator on first authenticated contact and
cannot know their shop, so the record is created unassigned and the operator assigns it.
Spec edge cases require exactly this: "authenticated but assigned to no shop" is an expected
state, not an error. `ON DELETE RESTRICT` prevents orphaning staff by deleting a shop.

**The gate is one SQL predicate**, mirroring `authorizeAdmin` in the admin service:

```sql
SELECT EXISTS (
  SELECT 1 FROM public.shop_staff ss
    JOIN public.shop_staff_role ssr ON ssr.staff_id = ss.id
    JOIN public.shop st            ON st.id = ss.shop_id
   WHERE ss.cognito_sub = $1
     AND ss.status  = 'active'
     AND st.is_active
     AND ssr.role_key = 'shop_manager'
) AS ok
```

The `JOIN public.shop` is load-bearing: it makes "no shop assignment" (NULL `shop_id`, so
the join drops the row) and "inactive shop" (`is_active = false`) both refuse, satisfying
SC-005a with no extra branch.

**Alternatives considered**:
- Staff-only, no shop entity (spec option A). Rejected by the operator at Q2. It would have
  made "shop-scoped authorization" a phrase with nothing behind it.
- Shop staff in the `admin` schema. Rejected: conflates two audiences' identity systems and
  blurs the boundary the two-schema model was drawn for.
- Many-shops-per-operator (`shop_staff_shop` join table). Rejected as premature: FR-020
  says *at most one shop*; a join table can arrive additively when a real multi-shop
  operator exists.

---

## R4 — Backend placement, endpoints, and versioning

**Path assignment** (`docs/api/path-assignment.md` requires this line verbatim in the plan):

> **Path: edge — rule 2** (an internal operator console; latency-tolerant, low-frequency,
> cold starts acceptable). **Service: shop —** the shop/operator domain, behind the shop
> pool's authorizer.

**Decision**: extend the existing `apis/edge-api/shop/` service with two authenticated
routes, and restructure its source to the admin service's nested-domain layout.

| Route | Auth | Purpose | FR |
|---|---|---|---|
| `GET /shop/v1/me` | shop authorizer, any authenticated caller | Record-backed identity read + idempotent JIT upsert. Returns subject, email, roles, status, assigned shop (or `null`). | FR-005, FR-020 |
| `GET /shop/v1/manager-ping` | shop authorizer + **DB gate** | Manager-only proving read. Served to an active `shop_manager` at an active shop; **refused by the backend** otherwise. | FR-008, FR-021 |

Existing routes are untouched: `/shop/healthz`, `/shop/v1/status`, `/shop/v2/status`,
`/shop/v1/ping` (the token-echo proving route from 004). `/me` **admits role-less callers**
— its job is to *record* them; privilege gating lives on `/manager-ping`. This mirrors the
admin service's `/me` vs `/admin-ping` split exactly.

**Versioning**: both routes are born under `/v1` per `docs/api/versioning-policy.md` rule 1.
Adding new operations to an existing version is *additive* (rule 3) — no `/v2`.

**Layout change**: `shop/src/` currently keeps its single domain flat
(`types.ts`/`repository.ts`/`service.ts` at `src/`). Adding a second domain (staff) forces a
choice. Adopt the admin service's nested form — `src/staff/{types,repository,service}.ts` —
and move the existing status domain to `src/status/`. This is a mechanical move that makes
the two services structurally identical, which is the point of Principle VI.

**No new dependencies.** The service already has `@effy/edge-shared` (`query`,
`withTransaction`, `preamble`, `json`, `problem`, `forbidden`, `unavailable`, `subject`,
`claim`, `groups`). Zero new npm packages on the backend.

---

## R5 — The shared-foundation extraction (the slice's largest cost)

**Problem**: FR-012 requires the console to consume the shared foundation with **zero**
surface-local re-implementation, and SC-009 measures it. But today the reusable half of the
back-office console is *inside the app*, not in a package:

| Concern | Lives today | Genuinely audience-neutral? |
|---|---|---|
| brand tokens, `cn`, scaling | `@effy/design-system` | ✅ already shared |
| authed fetch + RFC 9457 → `DomainError` | `@effy/api-client` | ✅ already shared |
| DTOs, role narrowing | `@effy/shared-types` | ✅ already shared (needs a `shop.ts`) |
| shadcn primitives (12 files), `use-mobile` | `apps/back-office/src/components/ui/` | ✅ — Principle V: *one* design system drives every surface |
| config load + fail-fast, Amplify wiring | `apps/back-office/src/lib/{env,amplify}.ts` | ✅ — Principle II names **configuration** as a shared concern |
| EMAIL_OTP flow, session/token/claims, route guard | `.../features/auth/{repo,guards}.ts`, `lib/auth-session.ts` | ✅ — identical for every pool |
| query-client retry policy, telemetry, ui-store | `apps/back-office/src/lib/` | ✅ — identical |
| console shell (sidebar / header / user menu / nav) | `.../components/layout/` | ✅ — differs only by nav config + brand label |
| the sign-in card | `.../features/auth/SignInScreen.tsx` | ✅ — differs only by brand copy |
| proving/manager screens, nav items, role type | `.../features/*` | ❌ per-surface |

Copying any row marked ✅ into `shop-web` is exactly what Principle II forbids ("Copy-paste of
cross-cutting logic across surfaces is prohibited") and what SC-009 fails on.

**Decision**: extract before building the second surface.

1. **`@effy/design-system` grows a `./ui` subpath** — the 12 shadcn primitives plus
   `hooks/use-mobile`. Both apps point `components.json` `aliases.ui` at
   `@effy/design-system/ui`. React moves to a `peerDependency`.
2. **New package `@effy/web-kit`** with two entry points:
   - `@effy/web-kit` — the runtime: `createConfig(requiredKeys)`, `configureAmplify`,
     `getAccessToken/getSubject/getGroups`, `startSignIn/submitOtp/signOut/otpErrorMessage`,
     `createSessionGuard`, `createQueryClient`, `createTelemetry<TEvent>`, `createUiStore`.
   - `@effy/web-kit/console` — the SPA chrome: `<ConsoleShell>`, `<ConsoleSidebar>`,
     `<ConsoleHeader>`, `<ConsoleUserMenu>`, `<NavList>`, `<OtpSignInCard>`, `<ErrorState>`
     — each parameterized by brand, nav config, and role type (generic over the role union).
3. **`apps/back-office` is refactored to consume both**, and its **20 tests must stay green**.
   The tests that cover moved code move with it.

**This contradicts a spec assumption** — *"No new shared packages are assumed necessary."*
That assumption was a guess made before the foundation was inspected; the inspection shows it
is false. Per constitution Principle I ("a gap discovered downstream MUST be fixed by
returning to the earliest affected artifact"), **the spec's assumption is corrected as part of
this plan**, not worked around.

**Why a new package rather than growing `api-client`**: `web-kit` depends on React, TanStack
Router/Query/Store, and Amplify. `api-client` is a dependency-light fetch wrapper that a
non-React consumer (or a Node test) can import. Fusing them would drag React into the DTO/HTTP
layer. The `./console` subpath split further lets `customer-web` (Next.js SSR, a later slice)
take the runtime without the SPA chrome.

**Risk and the line held**: this refactor touches a surface whose shell was visually signed
off (005 T058) and whose live SC sign-off (T046) is still open. Mitigations, in order:
(a) the extraction is a *move + parameterize*, never a rewrite; (b) back-office's `bo-test`
(20/20), `bo-lint`, `bo-build`, and the `theme-tokens` guard are the gate on every extraction
task; (c) the design-system token files are not touched at all, so the D2 visual sign-off
stands. **Fallback, if the shell proves genuinely surface-shaped in practice**: keep
`components/layout/` per-app, extract only runtime + primitives, and record the shell
duplication as a justified exception in Complexity Tracking. The plan proceeds on the
extraction path.

---

## R6 — Where `/shop/v1/me` gets the operator's email (and a defect this surfaces in 005)

**Problem**: the shop pool sets `username_attributes = ["email"]`
(`infra/modules/cognito-user-pool/main.tf`). In that configuration Cognito's internal
username is widely reported to be a generated UUID, and a Cognito **access token carries no
`email` claim** (`sub`, `username`, `cognito:groups`, `client_id`, …). The back-office
service today does:

```ts
const email = claim(event, "username") ?? sub;   // apis/edge-api/admin/src/functions/back-office-me-v1-get.ts
```

If `username` is a UUID, then **`admin.staff.email` is currently storing a UUID, not an
email** — a latent defect in 005, not in this slice. I could not settle Cognito's exact
behavior for this pool configuration from the repository alone, and I am not going to guess
in a migration.

**Decision** — design so the answer does not matter, then verify cheaply:

1. `public.shop_staff.email` is **nullable**.
2. `/shop/v1/me` resolves email as `claim("email") ?? emailShaped(claim("username")) ?? null`
   and **never overwrites a non-null stored email with null**.
3. The **staff-management step is authoritative** for email — back-office shop management writes
   it (next slice), exactly as 006 seeds `admin.staff.name` out-of-band. Until then `email` stays
   null for operators whose token carries no address, which is a correct, visible state rather than
   a wrong value.
4. A **2-minute operator verification task** decodes a real shop-pool access token and records
   the actual claim set in this file. If `email` is present, step 2's first branch wins and
   nothing changes. If it is absent, nothing changes either — the record is already correct
   via step 3.

FR-020 ("capturing at least each member's ... contact email") is satisfied: provisioning
always sets it; the JIT read refreshes it whenever the token does carry one.

**Alternatives considered**:
- **Send the ID token as the bearer** (it does carry `email`, and the API Gateway JWT
  authorizer accepts it because `aud` = client id). Rejected: ID tokens are not authorization
  tokens, and it would diverge shop-web from back-office's access-token convention for a
  field the operator already owns.
- **`AdminGetUser` from the Lambda on first contact.** Rejected for a bootstrap slice: adds
  a `cognito-idp` IAM statement and a network call to the auth-critical path.
- **Pre-token-generation Lambda injecting `email`.** Rejected: real infrastructure (a Lambda
  + a pool trigger) for a field the provisioning step already knows.

**Follow-up recorded, not fixed here**: 005's `/admin/v1/me` email resolution should be
re-checked against the same finding. It is out of this slice's scope and belongs in a 005
reconciliation, but it must not be silently inherited.

---

## R7 — Dev origin, CORS, and config

**Decision**: `shop-web` runs on **`http://localhost:5174`** (`strictPort: true`), and
`infra/envs/dev/edge-gateway.tf` adds that origin to the shared gateway's
`cors_configuration.allow_origins` (today: `5173`, `3000`).

The gateway owns CORS because a service attaching to an external HTTP API cannot configure it
(A3). This is therefore a **Terraform change in the same `make apply` as the shop groups** —
one operator apply, not two.

**Config contract** (`apps/shop-web/.env.example`, all build-time `VITE_*`, all non-secret):

| Variable | Source |
|---|---|
| `VITE_COGNITO_USER_POOL_ID` | SSM `/effy/dev/auth/shop/user_pool_id` |
| `VITE_COGNITO_CLIENT_ID` | SSM `/effy/dev/auth/shop/app_client_id` |
| `VITE_API_BASE_URL` | SSM `/effy/dev/edge/api_endpoint` (paths carry `/shop/v1/...`) |
| `VITE_POSTHOG_KEY` / `VITE_POSTHOG_HOST` | optional; absent → telemetry no-ops |

`createConfig` fails fast on a missing required key (FR-017), rendering the configuration-error
page rather than silently pointing at the wrong pool.

---

## R8 — Telemetry (Principle VII declaration)

**Product analytics + web error tracking — PostHog**, via `createTelemetry` from `web-kit`,
with a `surface: "shop-web"` super-property on every event so shop-audience events are
distinguishable from back-office events (FR-016). Typed event union, no PII beyond `subject`:

`shop_auth_sign_in_started` · `shop_auth_otp_submitted` · `shop_auth_sign_in_succeeded` ·
`shop_auth_sign_in_failed` · `shop_auth_signed_out` · `shop_manager_area_access_denied` ·
`shop_assignment_missing`

**Metrics/alerts**: per-function CloudWatch alarms in `shop/serverless.yml`, matching the
admin service's set — `Errors > 0` on both new functions, plus `Duration p95 > 5000ms` on
`/shop/v1/me` (the DB-touching read). The API-level 5xx alarm already exists in Terraform.

**No alerting on the console itself** this slice: it is local-only (FR-001), so there is no
hosted surface to alert on.

---

## R9 — Cross-pool isolation: how SC-004 is actually proven

Both directions are enforced by the gateway's per-pool JWT authorizers
(`aws_apigatewayv2_authorizer.pool`, `for_each` over four pools, each pinned to one issuer +
one client id). A back-office token presented to `/shop/v1/me` fails `aud`/`iss` validation
**at the authorizer**, returning 401 before any handler runs; a shop token at `/admin/v1/me`
likewise.

This is **structural, not code** — which means it cannot be unit-tested, and asserting it in
a vitest suite would prove nothing. SC-004 is therefore an **operator-run `curl` check** with
two real tokens, scripted in [quickstart.md](./quickstart.md) §5. That is the honest
verification, and it is the first time the platform proves the four-pool claim end to end
rather than assuming it.

---

## Resolved unknowns

| # | Unknown | Resolution |
|---|---|---|
| R1 | Surface directory name | `apps/shop-web`; reconcile CLAUDE.md |
| R2 | Shop role model + origin | `shop_manager`/`shop_staff` as shop-pool groups; **constitution v1.5.0 amendment required** |
| R3 | Shop entity + data area | 4 tables in `public`; gate = role AND status AND shop scope |
| R4 | Backend home + routes | edge / shop service; `/shop/v1/me`, `/shop/v1/manager-ping` |
| R5 | Shared-foundation reuse | extract `@effy/design-system/ui` + new `@effy/web-kit`; **corrects a spec assumption** |
| R6 | Email claim source | nullable + operator-authoritative; verify token claims; 005 defect flagged |
| R7 | Dev origin / CORS / config | `:5174`; gateway CORS updated in the same apply |
| R8 | Telemetry | PostHog typed events with `surface` property; 3 new CloudWatch alarms |
| R9 | Isolation proof | operator `curl`, both directions — structural, not unit-testable |

**No NEEDS CLARIFICATION remains.**
