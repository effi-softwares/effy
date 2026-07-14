---
description: "Task list for 011-customer-storefront-web"
---

# Tasks: Customer Storefront Web Foundation (Bootstrap)

**Input**: Design documents from `/specs/011-customer-storefront-web/`

**Prerequisites**: [plan.md](./plan.md) · [spec.md](./spec.md) · [research.md](./research.md) ·
[data-model.md](./data-model.md) · [contracts/](./contracts/) · [quickstart.md](./quickstart.md)

**Tests**: **Included, and not optional here.** SC-002/SC-003/SC-004 are *unprovable* by unit tests —
Vitest cannot test async Server Components (research **D22**) and Next 16 no longer reports First Load
JS (**D10**). Playwright + size-limit + Lighthouse CI are how this slice keeps its central promises
honest.

**Organization**: by user story, so each is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]** — parallelizable (different files, no dependency on incomplete work)
- **[Story]** — US1..US4 from spec.md
- **🧑‍💻 OPERATOR** — the user runs this, not Claude (CLAUDE.md: Claude never touches live AWS, runs
  migrations, or deploys)

## Two orderings are load-bearing — do not "optimize" them away

1. **Phase 2 (the gates) precedes Phase 4 (the auth SDK)** — and the gates must be **wired into CI
   (T021)**, not merely configured. A bundle guard written *after* Amplify lands is a guard nobody has
   ever watched fail; a guard that only runs on a developer's laptop is a guard nobody runs at all.
   Landing T017–T021 first means we watch the guard go **red** when the SDK arrives (T020) and **green**
   when the quarantine works. FR-005 demands the budget "**fail the build**" — that is a CI job, not a
   README instruction.
2. **The spikes (T052–T053) precede the sign-in UI (T054+).** Both can change the design.
   `AliasExistsException` (research **D17**) is the highest-risk unknown in the slice and lands squarely
   on FR-011. Building the UI first and discovering it afterwards means building it twice.

---

## Phase 1: Setup — scaffold and monorepo reconciliation

**Purpose**: get `@effy/customer-web` into the monorepo, on the platform's design system, with Next 16
configured correctly.

- [X] T001 Bump `lucide-react` to `^1.24.0` and `tailwind-merge` to `^3.6.0` in `packages/design-system/package.json` (research **D2**: two icon majors in one graph = two copies = a budget breach; tailwind-merge v2 is subtly wrong for the Tailwind v4 the design system already uses)
- [X] T002 Propagate the same two versions to `packages/web-kit/package.json`, `apps/back-office/package.json`, `apps/shop-web/package.json`
- [X] T003 Add `"sideEffects": false` to `packages/{design-system,shared-types,api-client,web-kit}/package.json` (barrel files de-opt tree-shaking without it — **D9**)
- [X] T004 Run `pnpm install` and fix any lucide v1 icon renames across `apps/back-office` and `apps/shop-web`
- [X] T005 **Regression gate**: `pnpm -r test` + `pnpm typecheck` must stay green — all **184** existing tests. This is the safety net that makes T001–T002 a safe call rather than a scary one; if it is red, stop.
- [X] T006 Scaffold the app with the **mandated** command (operator-directives **OD2**) into a temp dir, then move it to `apps/customer-web/`: `pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix --template next --pointer` (it is **interactive** — it prompts for a project name)
- [X] T007 Strip the scaffold's standalone-repo artifacts: delete `apps/customer-web/{.git,pnpm-lock.yaml,pnpm-workspace.yaml}` (a nested workspace breaks the root pnpm workspace)
- [X] T008 Rewrite `apps/customer-web/package.json`: name `@effy/customer-web`, `private: true`, scripts `dev`/`build`/`start`/`lint`/`typecheck`/`test`/`e2e`/`size`/`analyze`; add workspace deps `@effy/{design-system,shared-types,api-client}`
- [X] T009 Configure `apps/customer-web/next.config.ts`: `cacheComponents: true` (**D3** — PPR becomes the rendering model and uncached-outside-Suspense becomes a **build error**), `transpilePackages: ['@effy/design-system','@effy/shared-types','@effy/api-client']` (they ship raw TS), `images.remotePatterns`, `experimental.optimizePackageImports` for the `@effy/*` packages
- [X] T010 Replace the preset's token block in `apps/customer-web/app/globals.css` with `@effy/design-system` tokens (`tokens.css`) — Jade `#0FB57E`, neutral surfaces. **Zero surface-local brand colours** (SC-014, Principle V). The preset's `baseColor: neutral` already matches 005-D2.
- [X] T011 [P] Wire dark mode via the preset's `next-themes` provider in `apps/customer-web/app/layout.tsx` (correct on SSR: it sets the class before paint, so there is no flash of the wrong theme)
- [X] T012 [P] Add `apps/customer-web/.env.example` with `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_CORE_API_BASE_URL`, `EDGE_API_BASE_URL`, `NEXT_PUBLIC_COGNITO_*` — **addresses are configuration, never literals** (FR-029)
- [X] T013 [P] Add Makefile targets `cw-dev` / `cw-build` / `cw-test` / `cw-e2e` / `cw-size` following the `bo-*` / `shop-*` convention
- [X] T014 Verify `pnpm --filter @effy/customer-web build` and `turbo build` are green

**Checkpoint**: the app builds inside the monorepo, on the platform's design system, with Next 16
configured. Nothing is proven yet.

---

## Phase 2: Foundational — the gates, BEFORE the code they guard

**⚠ BLOCKING for every user story.** These exist to make the slice's promises falsifiable.

- [X] T015 Set up **Vitest** in `apps/customer-web/vitest.config.ts` (jsdom, `@testing-library/react`, `vite-tsconfig-paths`). ⚠ Record in the config header that **async Server Components cannot be unit-tested** (**D22**) — they are covered by Playwright, and someone will otherwise waste an afternoon discovering this.
- [X] T016 Set up **Playwright** in `apps/customer-web/playwright.config.ts` + `e2e/` (webServer against a **production** build, not `next dev` — dev-mode bundles and cache behaviour are not what ships)
- [X] T017 Configure **`size-limit`** in `apps/customer-web/.size-limit.json` — the budget **gate** (**D9**): guest routes **≤ 120 KB** First Load JS (hard fail > 150 KB), auth routes ≤ 300 KB, shared chunk ≤ 90 KB. This must **fail the build**, not warn. Next 16 no longer reports these numbers (**D10**), so we compute them ourselves.
- [X] T018 Configure **Lighthouse CI** in `apps/customer-web/lighthouserc.json` with assertions: LCP ≤ 2000 ms, CLS ≤ 0.05, `resource-summary:script:size` ≤ 150000 (**D7** — tighter than Google's "good", so field regression doesn't immediately breach the public standard)
- [X] T019 **The Amplify quarantine guard** — add `dependency-cruiser` in `apps/customer-web/.dependency-cruiser.cjs` with a rule that **fails the build** if any module reachable from `app/(shop)/**`, `app/page.tsx`, or `app/layout.tsx` transitively imports `aws-amplify`. This is FR-006/SC-003's real enforcement; the regression is one careless import in a shared header away, so it gets a machine guard, not a code-review convention.
- [X] T020 Prove the guard is real: add a throwaway `import 'aws-amplify'` to `app/layout.tsx`, confirm T019 goes **RED**, then remove it. **A guard nobody has watched fail is not a guard.**
- [X] T021 Wire the three gates into a **blocking** pipeline: new `.github/workflows/web.yml` (the repo has **no JS/web CI at all** today — only `infra.yml`) running typecheck → test → build → `depcruise` → `size` → `e2e`, and add `depcruise` + `size` to the `build` script so a breach fails locally too. **FR-005 requires the budgets be enforced automatically — "a change that breaches one MUST fail the build".** Without this, T017–T019 are commands a human must remember to run, and T020's proof is theatre.
- [X] T022 Extend `packages/api-client` with a **server-side variant** (injected token + `cacheTag`/`cacheLife` passthrough), per plan § Principle II — the shared package is extended **at the package**, not forked into the app (Principle II). `lib/api/core.ts` and `lib/api/edge.ts` below are thin surface-local wrappers over it, not reimplementations.
- [X] T023 [P] Add `apps/customer-web/lib/api/core.ts` — the **hot-path** client: server-side, read-only, `'use cache'`-friendly, supports `cacheTag`/`cacheLife`. Base URL from config (FR-029).
- [X] T024 [P] Add `apps/customer-web/lib/api/edge.ts` — the **cold-path** client: authed, `cache: 'no-store'`, token injected by the caller
- [X] T025 [P] Add `apps/customer-web/lib/next-target.ts` — the **open-redirect-safe** `next` validator: accept only same-origin relative paths; reject `//…` and anything carrying a scheme. This is the standard bug in return-to-intent, so it is written once, tested, and reused.
- [X] T026 [P] Unit-test `lib/next-target.ts` in `apps/customer-web/lib/next-target.test.ts` — the hostile cases (`//evil.com`, `https://evil.com`, `/\evil`, encoded variants) matter more than the happy one
- [X] T027 [P] Add customer DTOs (`CustomerDTO`, `UpdateCustomerDTO`) to `packages/shared-types/src/` — the single source of truth; `customer-web` and `edge-api/customer` both consume them and neither redefines them (Principle II)
- [X] T028 [P] Add PostHog telemetry init + the typed event taxonomy + a **consent gate** in `apps/customer-web/lib/telemetry.ts` (`storefront_viewed`, `sign_up_started/_completed{route}`, `sign_in_completed{route}`, `deferred_sign_in_prompted/_resumed`, `sign_in_declined`, `account_linked{provider}`). **No analytics network call may fire before consent** (Principle VII — and it matters here as nowhere before, because these are members of the public, not employees); consent state lives in the client store and is remembered. **No PII beyond the auth subject id** — the customer's email is never a property.
- [X] T029 Wire `useReportWebVitals` → PostHog in `apps/customer-web/app/web-vitals.tsx` — **this is the real SC-002 gate**; Lighthouse CI is only a lab pre-filter

**Checkpoint**: the gates exist and are proven to bite. Now the code can be written against them.

---

## Phase 3: User Story 1 — A stranger browses with no account (P1) 🎯 MVP

**Goal**: a fast, indexable, guest-first public surface. This is the whole reason the surface is
SSR-first and public.

**Independent test**: visit as a fresh unauthenticated visitor; every public page renders its content
fully-formed on arrival, no page demands an account, the raw HTML contains the content, metadata and
crawl directives are correct, and the budgets hold.

- [X] T030 [US1] Build `apps/customer-web/app/layout.tsx` — the root layout: fonts (`next/font`, self-hosted → no third-party origin on the critical path, metric-matched fallback → no CLS), design-system tokens, theme provider, `metadataBase` from `NEXT_PUBLIC_SITE_URL`. **⚠ It MUST NOT call `cookies()`/`headers()`, and MUST NOT import `aws-amplify`** — either one silently destroys the static shell for every page in the app (**D4**).
- [X] T031 [US1] Create the `(shop)` route group + `apps/customer-web/app/(shop)/layout.tsx` — the public shell: header (logo, nav, search box) as pure static markup in the prerendered shell
- [X] T032 [US1] **The personalized island** — `apps/customer-web/components/header/UserIsland.tsx`: a **Server Component** that reads `cookies()` and renders either "Sign in" or the customer's name + cart slot. Mounted inside `<Suspense fallback={<UserSlotSkeleton/>}>` in the `(shop)` layout so it streams at request time while the page body stays a cached static shell (**D4**, FR-007). **Zero client JS. Zero Amplify.** The skeleton reserves the exact box → no CLS.
- [X] T033 [US1] [P] `apps/customer-web/app/page.tsx` — the home page: `'use cache'` + `cacheLife('minutes')`, server-rendered, indexable
- [X] T034 [US1] [P] `apps/customer-web/app/(shop)/browse/page.tsx` — the catalog **placeholder**: `'use cache'` + `cacheLife('hours')`. **No product data exists this slice** (spec § Out of Scope); this page exists to prove the render mode and the budget, and the catalog slice fills it.
- [X] T035 [US1] [P] `generateMetadata` per public page — title, description, **single canonical**, OG/Twitter. ⚠ It must read from **the same `'use cache'` function the page body uses** — uncached I/O in `generateMetadata` on a prerenderable page is a **build error** in Next 16 (**D12**).
- [X] T036 [US1] [P] `apps/customer-web/app/sitemap.ts` — the machine-readable page index (FR-004). ⚠ If `generateSitemaps` is used, `id` is now a **`Promise<string>`** and must be awaited (Next 16 breaking change).
- [X] T037 [US1] [P] `apps/customer-web/app/robots.ts` — `Allow: /`; `Disallow: /account /checkout /sign-in /sign-up /callback /api/`; `Sitemap:` absolute (per `contracts/storefront-routes.contract.md`)
- [X] T038 [US1] [P] `apps/customer-web/lib/json-ld.tsx` — a JSON-LD helper rendering a **native `<script>`** from a Server Component (the Next docs are explicit: *not* `next/script` — "structured data, not executable code"), XSS-scrubbed via `JSON.stringify(ld).replace(/</g,'\\u003c')`. `Organization` + `BreadcrumbList` ship now; `Product`/`Offer` are the catalog slice's.
- [X] T039 [US1] [P] `apps/customer-web/app/error.tsx` + `not-found.tsx` — a **recoverable** degraded state (FR-030). A failure in a personalized region must never take down the public content around it.
- [X] T040 [US1] **E2E — the promise that matters most** (`e2e/ssr-seo.spec.ts`): fetch each public page's **raw HTTP response with JavaScript disabled** and assert the content is present in it (**SC-004**); assert each page's title/description/canonical/OG; assert `sitemap.xml` and `robots.txt` are valid. *If this fails, the surface has failed its central promise no matter what the browser shows.* **Also assert FR-008 (no cloaking)**: fetch one page with a Googlebot UA and one with a browser UA and assert the bodies are **byte-identical** — content must never branch on User-Agent.
- [X] T041 [US1] **E2E — guest-first** (`e2e/guest.spec.ts`): a visitor with no session reaches **100%** of public pages and is asked to sign in **zero** times (**SC-001**); nothing degrades for being signed out **Also assert SC-013**: block every request to `*.amazoncognito.com` (simulating an authentication outage) and confirm `/` and `/browse` still render and are **fully usable** — a guest who was never going to sign in must be unaffected by the account system being down.
- [X] T042 [US1] Run `pnpm --filter @effy/customer-web size` → guest routes **≤ 120 KB** (**SC-003**), and `lighthouse` → LCP/INP/CLS within **D7** budgets (**SC-002**). Both are *[partial]* by design: re-proven on real product pages in the catalog slice.

**Checkpoint**: 🎯 **MVP.** A fast, indexable, guest-browsable public storefront exists and is *proven*
so. Independently shippable even with nothing behind it.

---

## Phase 4: User Story 2 — A shopper self-registers, three ways (P2)

**Goal**: open self-registration with password / email OTP / Google, all converging on **one** customer.

**Independent test**: register a brand-new customer by each route; each yields a working session. Then
register by one route and return by another with the same email — the platform recognises **one**
customer, not two.

### Infrastructure (Cognito)

- [X] T043 [US2] Extend `infra/modules/cognito-user-pool/` with new optional variables: `enable_password_auth` (adds `ALLOW_USER_SRP_AUTH`), `oauth` (flows/scopes/providers), `password_policy`, `account_recovery`, `pre_sign_up_lambda_arn`. Defaults keep **driver/shop/admin exactly as they are** — strictly `EMAIL_OTP`, no password flow, no IdP. Update the `allowed_first_auth_factors` validation message, which currently says *"PASSWORD is forbidden platform-wide (constitution Principle IV)"* — **that is now false** (constitution v1.7.0).
- [X] T044 [P] [US2] New module `infra/modules/cognito-google-idp/` — `aws_cognito_identity_provider` (Google) + `aws_cognito_user_pool_domain` (**prefix domain** in dev: no ACM cert, and therefore no us-east-1 carve-out — **D15**). ⚠ `attribute_mapping` **MUST** include `email_verified = "email_verified"` — without it the merged profile lands unverified, which is both an account-takeover enabler and a lockout from password recovery (**D16**).
- [X] T045 [US2] Write the **pre-sign-up linking Lambda** (`apis/edge-api/customer/src/functions/pre-sign-up.ts`) per `contracts/auth-flows.contract.md`: on `PreSignUp_ExternalProvider` → **refuse unless `email_verified === true`** → `ListUsers` by email → `AdminLinkProviderForUser` into the **native** profile (creating it first if absent). **The native profile is ALWAYS the `DestinationUser`** — that is what preserves the `sub`, and there is **no retroactive merge** if Cognito auto-creates a `Google_…` profile first.
- [X] T046 [P] [US2] Unit-test the trigger's decision logic (`pre-sign-up.test.ts`): **unverified email → REFUSE to link** (the security control, FR-012); verified + existing native → link; verified + no native → create-then-link. Test the refusal path hardest — it is the one that stops an account takeover.
- [X] T047 [US2] Wire it in `infra/envs/dev/auth-customer.tf`: the extended module, the Google IdP, `lifecycle { prevent_destroy = true }` on the pool, `write_attributes` **excluding `email`** (or a signed-in user could change their email to a victim's). Also fix the **swapped `shop`/`back_office` callback URLs** in `infra/envs/dev/dev.tfvars` (shop has back-office's `:5173` and vice-versa) — inert today, live the moment OAuth is enabled.
- [X] T048 [US2] `terraform fmt` + `make validate ENV=dev` green
- [X] T049 [US2] Add `scripts/verify-pool-credentials.sh` + `make verify-pool-credentials` — assert the **driver / shop / admin** pools still have `allowed_first_auth_factors == [EMAIL_OTP]`, **no** identity provider, and `allow_admin_create_user_only = true`. **FR-017 is currently guaranteed only by module defaults**, and this slice is the first time password/OAuth arguments exist on the shared Cognito module at all — the regression it guards against is a one-line default change. 007 shipped `make shop-verify-isolation` for exactly this class of claim.

### 🧑‍💻 OPERATOR — cloud + the two spikes

- [~] T050 [US2] ⏸ **PARKED** (2026-07-14) — register the **Google OAuth client**. Deferred with SSO. This was the slice's ONLY out-of-code dependency; parking Google removes it entirely. Un-park via [quickstart](./quickstart.md) § 8.
- [ ] T051 [US2] 🧑‍💻 **OPERATOR** `make plan ENV=dev` then `make apply ENV=dev` (**ONE apply now — SSO parked, so no two-stage trigger wiring, and no external dependency**). Then `make verify-pool-credentials ENV=dev`. **⚠ ABORT if any Cognito pool shows `must be replaced` / `-/+`** — a replaced pool destroys every account in it (the 006 first admin, the 009 shop users). The change set is verified **non-destructive** against the provider schema (**D13**), which is precisely why an unexpected replacement means *stop and investigate*.
- [~] T052 [US2] ⏸ **PARKED with SSO** — **⚠ SPIKE A — `AliasExistsException`** (quickstart step 6): register via **email OTP** with no password, then sign in with **Google** using the same email. **Does the first Google sign-in fail?** Record the answer in `research.md` **D17**. This is the **highest-risk unknown in the slice** and it lands on FR-011. If it fires → adopt the transparent single-retry fallback before building the UI.
- [ ] T053 [US2] 🧑‍💻 **⚠ SPIKE B** — can a customer who **never had a password** set one via forgot-password? If not, the path is an authorized `AdminSetUserPassword` after an OTP-authenticated session (the 006/009 Cognito-first shape). Record in **D17**.

### The `(auth)` surface — only after the spikes

- [X] T054 [US2] Create the `(auth)` route group and `apps/customer-web/app/(auth)/layout.tsx` with `<ConfigureAmplifyClientSide />`. **⚠ This is the ONLY place `Amplify.configure` is ever called.** Amplify's own docs put it in the root layout — for a storefront with anonymous browsing that is **exactly wrong**: it lands the SDK in the shared client chunk that *every* page loads (**D11**). T019's guard enforces this.
- [X] T055 [US2] [P] `apps/customer-web/lib/amplify-config.ts` — build the config from **env** (the SSM contract), **not** `amplify_outputs.json`. No `ampx`, no `@aws-amplify/backend`: Gen 2 backend tooling would fight Terraform for ownership of the pool (**D19**).
- [X] T056 [US2] [P] `apps/customer-web/lib/amplify-server.ts` — `createServerRunner` from `@aws-amplify/adapter-nextjs`
- [X] T057 [US2] `apps/customer-web/app/(auth)/sign-up/page.tsx` + a `next/dynamic`-loaded form: **password** route (`signUp` + `confirmSignUp`) and **passwordless** route (`signUp` with **no `Password`** — legitimate Cognito behaviour, not a hack (**D14**) — + `autoSignIn`, so register+verify+sign-in costs **one** code)
- [X] T058 [US2] `apps/customer-web/app/(auth)/sign-in/page.tsx`: **password** (`USER_SRP_AUTH` — the password never goes on the wire) and **email OTP** (`USER_AUTH` + `preferredChallenge: 'EMAIL_OTP'` → `confirmSignIn`). Note the **double `confirmSignIn`** in the factor-selection path (once to pick the factor, once to submit the code).
- [X] T059 [US2] [P] "Continue with Google" → `signInWithRedirect({ provider: 'Google' })`, deep-linked with `identity_provider=Google` so the customer goes **straight to Google's consent screen** and never sees a Cognito-branded page
- [X] T060 [US2] `apps/customer-web/app/(auth)/callback/page.tsx` — the OAuth return. ⚠ **`import 'aws-amplify/auth/enable-oauth-listener'`** or the redirect completes and *nothing happens*. Apply the Spike-A fallback here if T052 fired.
- [X] T061 [US2] [P] Password recovery (FR-014): `resetPassword` → `confirmResetPassword`
- [X] T062 [US2] [P] Actionable error states for every failure (FR-015): wrong password, wrong/expired code, abandoned Google flow, already-registered email, rejected password. **Never leave the shopper stranded with no way forward.**
- [X] T063 [US2] [P] App-level cooldown on "send me a code" in `apps/customer-web/lib/otp-cooldown.ts` (FR-016), on top of Cognito's per-user throttles (5–20 OTP emails per address per hour)
- [X] T064 [US2] **E2E** (`e2e/auth-routes.spec.ts`): register + sign in by **each** of the three routes (**SC-006**); session persists across reload; sign-out clears it
- [X] T065 [US2] **E2E — convergence** (`e2e/account-linking.spec.ts`): register by one route, return by another with the **same verified email** → **exactly one** customer, **zero** duplicates (**SC-007**), and the `sub` is identical across both sessions
- [X] T066 [US2] **Re-run T019's guard + `size`**: `aws-amplify` must appear in the `(auth)` chunks and **nowhere** in a guest route's module graph (FR-006). Guest budget still ≤ 120 KB.

**Checkpoint**: three credential routes, one customer, and guests still pay nothing for the account
system.

---

## Phase 5: User Story 3 — The store asks who you are only when it matters (P3)

**Goal**: the sign-in demand lands at the point of ordering, not at the door — and costs the shopper
nothing.

**Independent test**: as a guest, go deep, trigger an identity-requiring action, confirm the demand
appears **there and not before**, authenticate by each route, and land back **exactly** where you were.

- [X] T067 [US3] `apps/customer-web/proxy.ts` — Next 16's rename of `middleware.ts` (**Node runtime, not Edge, and not configurable**). An **optimistic cookie-presence check only**, with a matcher that is an **allowlist** of `/account/*` and `/checkout/*` — guest routes never run it. It performs **no** database or network check.
- [X] T068 [US3] `apps/customer-web/lib/dal.ts` (`import 'server-only'`) — **the authoritative check** (**D20**). Next's own auth guide: a proxy check *"should not be your only line of defense… the majority of security checks should be performed as close as possible to your data source."* Called by **every** protected page, Server Action and Route Handler. ⚠ **Auth checks must NOT live in layouts** — they don't re-render on navigation.
- [X] T069 [US3] `apps/customer-web/app/checkout/page.tsx` — the deferred-demand target. **A placeholder: no cart, no commerce** (spec § Out of Scope). It exists to prove the *mechanism* — the first action that genuinely requires an identity — and the checkout slice fills it in.
- [X] T070 [US3] The demand → `/sign-in?next=<validated path>`, explaining **why it is being asked now** (FR-019), and resuming the intended action afterwards (FR-020) via `lib/next-target.ts`
- [X] T071 [US3] [P] Declining the demand returns the shopper to browsing with context intact — a dismiss path in `apps/customer-web/app/(auth)/sign-in/page.tsx` (FR-021). **Declining to authenticate is not punished** (SC-009).
- [X] T072 [US3] **E2E** (`e2e/deferred-signin.spec.ts`): a guest is **never** prompted while browsing; is prompted at `/checkout`; and after authenticating by **each** of the three routes lands back at the exact destination (**SC-008**) — **zero** instances of being dumped at the home page. Includes deep-link/bookmark/back-button entry (FR-022) and the open-redirect refusals.

**Checkpoint**: guest-first browsing is real, not nominal.

---

## Phase 6: User Story 4 — A real record, and a credential that works nowhere else (P4)

**Goal**: the platform's own customer record is authoritative, and the four-pool isolation rule holds
for the audience anyone in the world can join.

**Independent test**: sign in as a new customer → a record is created, reused (never duplicated), and
displayed. Bar the customer → refused despite a valid token. Cross-pool tokens refused both ways.

- [X] T073 [US4] Migration `db/migrations/<ts>_customer.sql` — `public.customer` per [data-model.md](./data-model.md) **E1** (`cognito_sub` UNIQUE, `email` citext UNIQUE, platform-owned `status` CHECK `('active','barred')`). Forward-only.
- [X] T074 [US4] Scaffold `apis/edge-api/customer/` (`effy-edge-customer`): `serverless.yml` attaching to the **shared HTTP API** by id, using the **customer** JWT authorizer by id from `/effy/<env>/edge/authorizer/customer_id` — following the `admin`/`shop` pattern exactly
- [X] T075 [US4] `GET /customer/v1/me` as a three-layer slice (handler → service → repo, **raw SQL, no ORM** — Principle VI), with the **idempotent JIT upsert** of data-model **E2**. ⚠ **`status` MUST be absent from the `ON CONFLICT DO UPDATE` set** — otherwise a barred customer silently un-bars themselves by signing in. This is the single most important line in the slice, and the easiest to get wrong with a lazy `SET (email, status) = …`.
- [X] T076 [US4] [P] `PATCH /customer/v1/me` — `displayName` **only**. `email` is deliberately not writable (identity operation + takeover vector); `status` is platform-owned.
- [X] T077 [US4] [P] The **barred gate**: `status = 'barred'` → **403**, uniform body that does not disclose why. A valid credential never overrides the record (FR-025).
- [X] T078 [US4] [P] Unit tests for `edge-api/customer` — upsert idempotency (incl. concurrent first sign-in), the barred refusal, DTO mapping
- [X] T079 [US4] `apps/customer-web/app/(account)/profile/page.tsx` — DAL-gated; reads the **platform record** (not the claim set) and lets the customer maintain `displayName` (FR-026)
- [X] T080 [US4] [P] Prove the **hot-path routing law** (FR-028/FR-029): a server-side call from `customer-web` to `core-api`'s existing `GET /v1/customer/ping` (local Docker) with the customer token, via `lib/api/core.ts`. The address is **configuration** — the hot path's future go-live needs zero code change here.
- [ ] T081 [US4] 🧑‍💻 **OPERATOR** Commit the migration, then `make db-up ENV=dev` (the 003 commit-guard requires the commit first)
- [ ] T082 [US4] 🧑‍💻 **OPERATOR** `make edge-deploy SERVICE=customer ENV=dev`
- [X] T083 [US4] **E2E — isolation, both directions** (`e2e/isolation.spec.ts`, **SC-012**): a **customer** token → `/admin/v1/me` = **401 at the gateway**; a **back-office** token → `/customer/v1/me` = **401**. Refused **before any handler runs** — structurally unusable, not merely unauthorized.
- [X] T084 [US4] **E2E — the record** (`e2e/customer-record.spec.ts`): first sign-in creates it; 10 consecutive sign-ins produce **exactly one** row (**SC-010**); a **barred** customer is refused while holding a completely valid credential (**SC-011**)

**Checkpoint**: the customer audience is closed end to end.

---

## Phase 7: Polish & cross-cutting

- [X] T085 [P] Create `docs/audiences/customer-capabilities.md` — the **parity register** (FR-031, SC-015) binding `customer-web` ↔ the forthcoming `customer-mobile` (KMP), following the `shop-capabilities.md` format. Every capability this slice delivers marked ✅ web / ⬜ mobile. **The mobile column is outstanding by design** — that is the operator's stated next slice, and this file is the definition of done it will be held to.
- [X] T086 [P] Update `CLAUDE.md`: the **Active feature** section, the surface list (`customer-web` now exists), and the "three KMP mobile apps remain the base template" status line
- [X] T087 [P] `apps/customer-web/README.md` — how to run it, the routing law, and **the two rules that will otherwise be broken by accident**: never call `cookies()` above a Suspense boundary; never import `aws-amplify` outside `(auth)`
- [X] T088 [P] Accessibility + responsive pass on the public pages: light **and** dark, every supported viewport, **design-system tokens only** (SC-014)
- [X] T089 Full-workspace green: `pnpm typecheck` + `pnpm -r test` + `turbo build` + `make lint` + **`make verify-pool-credentials`** + the storefront's own gates — **`depcruise`**, **`size`**, **`e2e`** (a green run that never invokes the gates is not a green run)
- [X] T090 Secret/PII sweep — **no email in telemetry**, no Google client secret in any committed file, no token in a log
- [ ] T091 🧑‍💻 **OPERATOR** — **live SC sign-off** (SC-001…SC-015) per [quickstart](./quickstart.md) § 7, including the two hand-runnable proofs: `curl -s localhost:3000/ | grep "<h1"` (content in the raw HTML) and `analyze | grep aws-amplify` (**must print nothing**)
- [ ] T092 🧑‍💻 **OPERATOR** — record the resolved **spike outcomes** (T052/T053) in `research.md` **D17**; if either changed the design, reconcile `contracts/auth-flows.contract.md` in the **same** commit (Principle I: a gap found downstream goes back to the artifact)
- [ ] T093 🧑‍💻 **OPERATOR** — commit the slice (spec + plan + tasks + code + the **v1.7.0 constitution amendment**, which must land in the same change as the code it governs)

---

## Dependencies

```
Phase 1 (Setup)  ─────► Phase 2 (Gates)  ─────►  US1 (P1) ──► 🎯 MVP, shippable alone
                            │                       │
                            │                       ▼
                            └──────────────────►  US2 (P2)  [infra + SPIKES gate the auth UI]
                                                    │
                                    ┌───────────────┼───────────────┐
                                    ▼                               ▼
                                  US3 (P3)                        US4 (P4)
                                    └───────────────┬───────────────┘
                                                    ▼
                                              Phase 7 (Polish)
```

- **US1 depends on nothing but the gates** → it is the MVP and is independently shippable.
- **US3 and US4 both depend on US2** (there is no session to defer to, and no record to key, until
  registration works). US3 and US4 are **independent of each other** and can run in parallel.
- **T052/T053 (spikes) block T054+.** Non-negotiable — see the header.

## Parallel opportunities

- **Phase 1**: T011, T012, T013 after T008
- **Phase 2**: T023–T029 are all `[P]` — different files, no interdependencies
- **US1**: T033–T039 are all `[P]` once the layouts (T030–T032) exist
- **US2**: T044 ∥ T046 ∥ T049; T055 ∥ T056; T059, T061, T062, T063 all `[P]`
- **US4**: T076, T077, T078, T080 are `[P]` once T075 lands
- **Phase 7**: T085–T088 are all `[P]`
- **US3 ∥ US4** entirely, once US2 is green

## Implementation strategy

**MVP = Phase 1 + Phase 2 + US1** (T001–T042). That delivers a fast, indexable, guest-browsable public
storefront — *proven* fast and *proven* indexable, not merely asserted — with no account system at all.
It is genuinely worth shipping on its own, and it is the honest floor of this slice.

Then **US2** (the account system — and the largest single chunk, since it carries the Cognito
infrastructure and the two spikes), then **US3 ∥ US4**, then polish.

⚠ **The critical path runs through the operator, and it runs through them early.** T050 (register the
Google OAuth client) and T051 (`make apply ENV=dev`) gate the two spikes, which gate the entire `(auth)`
surface (T054–T066), which gates **both** US3 and US4 — roughly **half the remaining slice**. That
ordering is correct and defended above, but it means a stalled operator sitting stalls everything behind
it. **Start T050 early** — it is an out-of-code dependency (a Google Cloud console registration) with no
code prerequisite at all, so it can be done in parallel with Phases 1–3 rather than waited on at T050.

**Where the slice is most likely to go wrong**, in order:

1. **Spike A (`AliasExistsException`, T052)** — the highest-risk unknown, unresolved in AWS's own docs,
   and it lands on FR-011. It is why the spikes gate the UI.
2. **The Amplify quarantine (T019/T054)** — one careless import in a shared component breaches the guest
   budget. Hence a machine guard that we deliberately watch fail first (T020).
3. **`status` in the upsert (T075)** — a lazy `SET` un-bars barred customers on sign-in. Silent, and a
   real security hole.
4. **`cookies()` above a Suspense boundary (T030)** — one line in the root layout silently turns every
   page in the app dynamic and destroys the SEO and speed the surface exists for. `cacheComponents`
   turns this into a build error, which is exactly why it is on from day one.
