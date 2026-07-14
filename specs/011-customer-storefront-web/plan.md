# Implementation Plan: Customer Storefront Web Foundation (Bootstrap)

**Branch**: `011-customer-storefront-web` | **Date**: 2026-07-14 | **Spec**: [spec.md](./spec.md)

**Input**: [spec.md](./spec.md) · [operator-directives.md](./operator-directives.md) (binding tech
input) · [research.md](./research.md) (Phase 0, binding)

## Summary

Bootstrap **`apps/customer-web`** — the platform's **fourth client surface, and its first public
one**. Every surface so far sits behind a login and serves an Effy employee; this one is open to
anyone, must be found by search engines, and serves a person who has no account until they choose to
make one.

**Technical approach**: a **Next.js 16 App Router** app, scaffolded by the mandated shadcn preset,
running **`cacheComponents: true`** so that Partial Prerendering is the rendering model and "is this
page still cacheable?" becomes a **compile-time gate**. Public pages prerender into a **static shell**;
the personalized header is a **server-rendered Suspense island** that streams in — so personalization
never costs us the cache or the crawler (research **D4**). Authentication is the **Amplify client
library** (`aws-amplify` v6 + `@aws-amplify/adapter-nextjs`) against the **Terraform-owned** customer
Cognito pool — **not** Gen 2 backend tooling, which would fight Terraform for ownership (**D19**) — and
the SDK is **quarantined into the `(auth)` route group with a CI dependency guard**, so a guest who
never signs in downloads **zero bytes** of it (**D11**). The customer pool gains **three credential
routes** (password, email OTP, Google) that all converge on **one `sub`** via a pre-sign-up linking
trigger whose **security rule is verified-email-only** (**D16**).

**No commerce ships.** No catalog, cart, checkout, payment, or product data (operator decision,
2026-07-14). The hot path stays **local-Docker-only**; its go-live is a later slice. What ships is the
surface, its auth, and the **routing law** every later customer slice obeys.

## Technical Context

**Language/Version**: TypeScript 5.9, Node 22 · React 19.2.4 · **Next.js 16.2.6**

**Primary Dependencies**: Next 16 (App Router, `cacheComponents`) · Tailwind v4 · shadcn/ui
(`radix-vega`, neutral base) · `next-themes` · `aws-amplify@^6.18.0` +
`@aws-amplify/adapter-nextjs@^1.7.3` · `@effy/{design-system,shared-types,api-client,web-kit}`

**Storage**: PostgreSQL 16, raw SQL, Goose. One new table: `public.customer`.

**Testing**: **Vitest** (unit) + **Playwright** (E2E — *required*: Vitest cannot test async Server
Components, **D22**) + **size-limit** & **Lighthouse CI** (the budget gates, **D10**)

**Target Platform**: modern browsers; the SSR server is **local-only this slice** (`next dev` /
`next start` on :3000)

**Project Type**: SSR web application (the platform's first) + one cold-path service + one migration +
Terraform

**Performance Goals**: LCP ≤ 2.0 s · INP ≤ 150 ms · CLS ≤ 0.05 (p75 mobile; tighter than Google's
"good", **D7**). **Guest First Load JS ≤ 120 KB** compressed, CI-enforced (**D9**).

**Constraints**: guest pages ship **zero** auth JS · public content must be present in the **raw** HTML ·
`aws-amplify` must not appear in a guest route's module graph · backend addresses are **configuration,
never literals**

**Scale/Scope**: 1 new app, 1 new cold-path service, 1 migration, 1 Terraform module extension, 2
shared-package bumps, ~12 routes. **Zero product data.**

## Constitution Check

*Checked against constitution **v1.7.0** — which this slice itself amends. The amendment is the first
gate, not an afterthought.*

### ⚠ Gate 0 — the Principle IV amendment (REQUIRED, and DONE)

The spec's **Constitution Impact** section flagged that FR-010 (password + Google) contradicted
Principle IV's "there are no passwords anywhere on the platform." **Amended to v1.7.0** as part of this
plan:

- The **customer** pool MAY offer password, email OTP, and Google federated sign-in, with **open
  self-registration**; federated identities MUST link into the native profile (**one `sub`**), and
  **linking MUST require a provider-asserted verified email**.
- **Driver / shop / admin are unchanged and re-affirmed**: strictly passwordless EMAIL_OTP, strictly
  admin-provisioned. The "no passwords" guarantee **narrows to the internal audiences** rather than
  being silently dropped.
- Isolation, per-pool validation, the pinned issuer, no-auth-proxy, cross-pool rejection, and
  claim-as-origin / record-as-authority are **all untouched**.

`CLAUDE.md` § Auth and `ARCHITECTURE.md` § Customer web were reconciled in the same change (Governance
requires dependent artifacts be re-checked in the same amendment).

### The seven principles

| Principle | Status | How |
|---|---|---|
| **I — Spec-Driven** | ✅ | spec → plan → tasks → implement. Tech directives quarantined in `operator-directives.md`; the spec stayed WHAT/WHY. |
| **II — Monorepo & Shared Contracts** | ✅ | Customer DTOs go to `@effy/shared-types`; UI from `@effy/design-system`. **`@effy/web-kit` is assessed, not assumed** (below). The two version bumps are made **at the package**, never forked into the app. |
| **III — Dual-Path Discipline** | ✅ | **Declared**: commerce → **hot path**; customer **profile/account** → **cold path**. This slice builds only the profile half (cold path) and proves the hot-path *route* against `core-api`'s existing `GET /v1/customer/ping`. FR-028 makes the split binding on later slices. |
| **IV — Auth Isolation** | ✅ (v1.7.0) | Customer pool only; cross-pool refusal proven **both ways** (SC-012). One `sub` per person. **The customer pool defines no RBAC groups** — deliberately, and it doubles as a **cookie-size** safety measure (**D21**). |
| **V — Design System** | ✅ | Jade `#0FB57E` from `@effy/design-system` tokens; the preset's own token block is **replaced**. Dark mode via `next-themes`. Zero surface-local brand colours (SC-014). |
| **VI — Layered Architecture** | ✅ | Three-layer slice in the cold-path service (handler → service → repo, raw SQL). On the web: Server Components → a typed `lib/` service layer → two fetch clients. **No DI framework.** Server data is never hand-cached in component state — the cache *is* the server (`use cache`). |
| **VII — Observability** | ✅ | PostHog analytics + web error tracking; **`useReportWebVitals` → PostHog** is the real CWV gate. Telemetry declared below. No PII beyond the subject id. |

### Principle II — the `web-kit` assessment (performed, not assumed)

`operator-directives.md` **OD5** required assessing each shared package for SSR fitness rather than
copying the console spine across. Result:

| Package | Verdict |
|---|---|
| `@effy/design-system` | **Reuse.** Tokens + primitives are framework-agnostic. Needs `transpilePackages` (it ships raw TS) and `"sideEffects": false`. |
| `@effy/shared-types` | **Reuse + extend** with the customer DTOs. |
| `@effy/api-client` | **Reuse + extend at the package** (T022). Audience-neutral (007 proved this). Gains a **server-side** variant taking an injected token + `cacheTag`/`cacheLife` passthrough. The app's `lib/api/{core,edge}.ts` are thin surface-local wrappers over it — **not** reimplementations, which would be a Principle II breach. |
| `@effy/web-kit` (root) | **Do NOT reuse on the guest path.** Its Amplify wiring, session guard and query client are **SPA-shaped and browser-only**; importing it from the root layout would drag `aws-amplify` into the shared client chunk and **breach the bundle budget by construction** (D11). Reuse *pure* helpers only, inside `(auth)`. |
| `@effy/web-kit/console` | **Not applicable.** Console chrome for an authenticated SPA; a storefront is not a console. |

**TanStack**: the directive allowed "any TanStack package". Adopted on the guest path: **none.**
**TanStack Router is rejected outright** — it is a *client-side* router, fundamentally incompatible
with SSR-first; Next owns routing. TanStack Query is **not needed** on guest pages (the server-state
cache *is* `use cache`); it may be used **inside `(account)`** if a genuine client-side cache need
appears. Each is declined explicitly rather than by omission, because adopting a library merely because
another surface uses it would be a defect **on this** surface (OD5).

### Complexity Tracking

| Deviation | Why needed | Simpler alternative rejected because |
|---|---|---|
| **Three new test/CI tools** (Playwright, size-limit, Lighthouse CI) | SC-004 ("content present with **no** client-side code executed") and SC-002/SC-003 are **not unit-testable**. Vitest *cannot* test async Server Components (**D22**), and **Next 16 no longer reports First Load JS at all** (**D10**). | Unit tests alone would let us *claim* SSR/SEO/budget compliance while proving none of it — the exact dishonesty the spec's scope caveat exists to prevent. |
| **A Lambda (pre-sign-up trigger)** in an otherwise front-end slice | Google federation **creates a duplicate account** without it (**D16**) — a direct FR-011 violation — and the linking rule is a **security control** (FR-012). | No trigger ⇒ two profiles, two `sub`s, and **no retroactive merge exists**. Deferring it is not possible without later deleting real accounts. |
| **Two shared-package major bumps** (`lucide-react` 0.x→1.x, `tailwind-merge` 2→3) | Two majors of an icon library in one graph = two copies = a budget breach on the one surface that has a budget (**D2**). `tailwind-merge` v2 is subtly wrong for the Tailwind v4 the design system already uses. | Pinning `customer-web` *down* freezes the platform on a dead major forever to save one afternoon, and leaves the latent v2/v4 bug in the two existing consoles. |

## Project Structure

### Documentation (this feature)

```text
specs/011-customer-storefront-web/
├── spec.md
├── operator-directives.md            # binding tech input (Principle I quarantine)
├── plan.md                           # this file
├── research.md                       # Phase 0 — D1..D22, binding
├── data-model.md                     # Phase 1
├── quickstart.md                     # Phase 1 — the operator runbook
├── contracts/
│   ├── customer-edge.contract.md     # /customer/v1/* (cold path)
│   ├── storefront-routes.contract.md # route map: render mode + index policy + budget
│   └── auth-flows.contract.md        # the three credential routes + account linking
└── checklists/requirements.md
```

### Source Code (repository root)

```text
apps/customer-web/                 # NEW — @effy/customer-web (Next 16, port 3000)
├── app/
│   ├── layout.tsx                 # root: fonts, tokens, theme. NO cookies(). NO Amplify.
│   ├── page.tsx                   # home — cached shell
│   ├── sitemap.ts   robots.ts     # FR-004
│   ├── (shop)/                    # PUBLIC · guest-first · indexable · budgeted
│   │   ├── layout.tsx             #   header with the <Suspense> personalized island (D4)
│   │   └── browse/page.tsx        #   catalog placeholder (no product data this slice)
│   ├── (auth)/                    # PUBLIC pages — but the ONLY place Amplify is configured
│   │   ├── layout.tsx             #   <ConfigureAmplifyClientSide /> lives HERE, not the root
│   │   ├── sign-in/   sign-up/    #   password · email OTP · Google
│   │   └── callback/page.tsx      #   OAuth return (enable-oauth-listener)
│   ├── (account)/                 # AUTH-GATED — profile; DAL-verified
│   └── checkout/page.tsx          # the deferred sign-in demand (US3) — placeholder, no commerce
├── components/
│   ├── header/UserIsland.tsx      # Server Component; reads cookies(); streams
│   └── ui/                        # thin re-exports of @effy/design-system/ui
├── lib/
│   ├── amplify-config.ts          # built from env (the SSM contract) — NOT amplify_outputs.json
│   ├── amplify-server.ts          # createServerRunner
│   ├── dal.ts                     # 'server-only' — THE authoritative auth check (D20)
│   ├── api/core.ts                # hot-path client (server-side, cacheable, tagged)
│   ├── api/edge.ts                # cold-path client (authed)
│   └── next-target.ts             # open-redirect-safe `next` validator
├── proxy.ts                       # Next 16 (was middleware.ts) — OPTIMISTIC redirect only
├── e2e/                           # Playwright: SSR · SEO · auth · isolation
└── next.config.ts                 # cacheComponents · transpilePackages · images

apis/edge-api/customer/            # NEW cold-path service — customer authorizer
└── src/functions/                 #   GET /customer/v1/me · PATCH /customer/v1/me

apis/core-api/                     # UNCHANGED — GET /v1/customer/ping proves the hot-path route

db/migrations/
└── 2026071xxxxxx_customer.sql     # NEW — public.customer

infra/
├── modules/cognito-user-pool/     # EXTENDED — password policy · OAuth · IdP · pre-sign-up
├── modules/cognito-google-idp/    # NEW — Google IdP + user-pool domain
└── envs/dev/auth-customer.tf      # wires them + the pre-sign-up Lambda

packages/                          # design-system · api-client · shared-types — extended in place
```

**Structure Decision**: `customer-web` follows **ARCHITECTURE.md § Customer web (SSR)** — file-based
route groups `(shop)` / `(auth)` / `(account)`, dual fetch clients, a client store for genuine client
state only. It deliberately does **not** adopt the console layout (`src/features/**`), which is shaped
for authenticated SPAs. The preset's no-`src/` layout is kept as-is; fighting it buys nothing.

## The routing law (FR-028) — declared here, binding on every later customer slice

| Traffic | Path | Why |
|---|---|---|
| Product · catalog · **search** · cart · order · **payment** | **Hot path** (`core-api`, Go) | Latency-sensitive customer reads and transactions — Principle III. Operator-directed. |
| Customer **profile / account management** | **Cold path** (`edge-api/customer`) | Low-frequency CRUD; cheap serverless is its right home. |

**No later slice may place a commerce feature on the cold path** without a justified, recorded
exception. Both base addresses are **configuration** (`NEXT_PUBLIC_CORE_API_BASE_URL`,
`EDGE_API_BASE_URL`), so the hot path's eventual go-live needs **zero code change here** (FR-029).

## Telemetry (Principle VII)

- **Product events** (PostHog, typed taxonomy): `storefront_viewed`, `sign_up_started` /
  `sign_up_completed{route: password|otp|google}`, `sign_in_completed{route}`,
  `deferred_sign_in_prompted`, `deferred_sign_in_resumed`, `sign_in_declined`,
  `account_linked{provider}`.
- **Web Vitals**: `useReportWebVitals` → PostHog. **This is the real SC-002 gate**; Lighthouse CI is a
  lab pre-filter only.
- **Errors**: PostHog error tracking. A failed backend read renders a recoverable degraded state
  (FR-030) and never takes the public content of the page down with it.
- **No PII beyond the auth subject id.** The customer's email is **never** a telemetry property — this
  matters more here than on any prior surface, because these are members of the public, not employees.
- **Consent-respecting**: analytics does not load before consent, which conveniently keeps it off the
  critical path by construction.

## Phasing

The authoritative phase numbering lives in [tasks.md](./tasks.md) (**7 phases, T001–T093**). This table
is the *workstream* view of the same work — it is deliberately **not** a second numbering, because two
phase numberings that drift is exactly how a plan stops describing the build.

| Workstream | Tasks | Content |
|---|---|---|
| Shared-package reconciliation | T001–T005 | `lucide-react` + `tailwind-merge` bumps, `"sideEffects": false`. The existing **184 tests must stay green**. |
| Scaffold + monorepo reconcile | T006–T014 | Run the mandated preset; strip its `.git` / lockfile / nested workspace; rename to `@effy/customer-web`; wire Turborepo; enable `cacheComponents`; swap in design-system tokens; dark mode. |
| **The gates** | T015–T029 | Vitest, Playwright, `size-limit`, Lighthouse CI, the **Amplify dependency guard**, and **wiring all of it into blocking CI**. Plus the shared `api-client` server variant, the `next` validator, telemetry + consent. |
| Public shell | T030–T042 | Root layout, `(shop)` group, the **Suspense personalized island**, metadata, `sitemap.ts`, `robots.ts`, JSON-LD. Guest path: **zero auth JS**. |
| Infra + **spikes** | T043–T053 | Cognito module extension, Google IdP + pool domain, the **pre-sign-up linking trigger**, the internal-pool credential guard, then the **two spikes**. |
| Auth surface | T054–T066 | The `(auth)` route group, three credential routes, error states, recovery, cooldown. |
| Deferred sign-in | T067–T072 | `proxy.ts` optimistic guard, the **DAL**, `/checkout`, return-to-intent. |
| The customer record | T073–T084 | Migration, `edge-api/customer`, `GET`/`PATCH /customer/v1/me`, idempotent JIT upsert, barred refusal, cross-pool isolation. |
| Polish & sign-off | T085–T093 | Parity register, docs, a11y, secret sweep, live SC sign-off. |

Two orderings are load-bearing, and they are stated **by task id** so they cannot drift:

- **T017–T021 (the gates, wired into CI) precede T054 (the auth SDK).** A bundle guard written *after*
  the SDK lands is a guard nobody has ever watched fail — and one that runs only on a laptop is a guard
  nobody runs. T020 exists to watch it go **red** on purpose.
- **T052–T053 (the spikes) precede T054+ (the sign-in UI).** Both can change the sign-in design.
  Building the UI first and discovering `AliasExistsException` afterwards means building it twice.

## Deferred risks (owned by the go-live slice — recorded so they cannot evaporate)

Both are **hosting-shape** decisions, extremely expensive to reverse, surfaced by the research (**D6**):

1. **`use cache` largely evaporates on serverless.** Per the Next docs, in serverless environments
   "cache entries typically don't persist across requests." Deploying `customer-web` to Lambda would
   drive the runtime cache hit-rate toward **zero** and put `core-api` on the critical path of every bot
   and every anonymous browse. **Preferred**: a long-lived Node server (Fargate, beside `core-api`);
   otherwise a custom `cacheHandlers` (Redis/ElastiCache).
2. **A CDN does not honour `revalidateTag`.** A price change needs `revalidateTag(...)` **plus a CDN
   purge**, covering **both** the HTML and the RSC variants; the CDN must keep `_rsc` in its cache key
   and forward the `rsc` header, or client-side navigation breaks.

Neither is in scope now (local-only), but the catalog and go-live slices inherit both as constraints.

## Open items requiring the operator

- **A Google OAuth client** (client id + secret) — an **out-of-code dependency**, exactly like the
  GoDaddy registrar in 010. Terraform can wire it; it cannot create it.
- **010's operator run is still open, and the email-OTP route inherits it**: the branded sender and SES
  production access gate OTP deliverability. Cognito's built-in sender caps at ~50 emails/day, which is
  fine for dev and fatal for real customers.
- **`make apply ENV=dev`** for the Cognito changes. The change set is **non-destructive** (**D13**,
  verified against the Terraform provider schema) — but **abort if any pool shows `must be replaced`**,
  exactly as 007 and 010 instruct.

## Also fixed in passing

`infra/envs/dev/dev.tfvars` has the **`shop` and `back_office` callback URLs swapped** (shop is given
`:5173`, which is back-office's port; back_office is given `:5174`, which is shop-web's). Both are inert
today because neither pool has an OAuth flow enabled — but this slice turns OAuth on for the first time,
so the latent error gets corrected now rather than becoming a live one later.

## Post-Design Constitution Re-check

✅ **Passes.** The design adds no DI framework, no ORM, no client-side router on an SSR surface, and no
second design system. The one genuinely new capability — passwords and federation on a public pool — is
**governed by the v1.7.0 amendment rather than smuggled past it**, and its most dangerous failure mode
(linking on an unverified email) is written into the constitution as a **prohibition**, not left as a
code comment.
