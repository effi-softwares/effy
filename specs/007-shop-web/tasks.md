---
description: "Task list for 007-shop-web — Shop Web Foundation (Bootstrap)"
---

# Tasks: Shop Web Foundation (Bootstrap)

**Input**: Design documents from `/specs/007-shop-web/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: **INCLUDED.** Each contract in `contracts/` specifies its own test list, and plan Phase 5
makes back-office's 20 passing tests a hard gate on the shared extraction. Tests are therefore not
optional in this slice.

**Organization**: Tasks are grouped by user story so each can be implemented and tested
independently. Backend, client, infra, and docs tasks for one story live in that story's phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies on incomplete tasks)
- **[Story]**: Which user story the task serves (US1–US5)
- **✋**: **OPERATOR-RUN** — touches live AWS, the database, a real identity, or a real inbox.
  Claude authors the code and the exact command; the operator executes it (CLAUDE.md, Mode of work).

## Path Conventions

Monorepo. Real paths from plan.md § Project Structure:

- Client surface: `apps/shop-web/src/` · Shared packages: `packages/{design-system,shared-types,api-client,web-kit}/src/`
- Cold-path service: `apis/edge-api/store/src/` · Migrations: `db/migrations/` · Infra: `infra/envs/dev/`
- **Terminology**: client surfaces are `shop-*`; the backend service and its paths are `store`; the
  pool and authorizer are `shop`; the audience in prose is "store" (research R1).

---

## Phase 1: Setup (Governance & Scaffolding)

**Purpose**: The governance amendment that authorizes the infra change, plus empty scaffolds.

**⚠️ T001 gates T009.** Terraform that puts RBAC groups on a second pool MUST NOT merge ahead of the
amendment that permits it (plan § Amendment A; Quality Gates treat an undocumented deviation as a defect).

- [ ] T001 Amend `.specify/memory/constitution.md` to **v1.5.0** (MINOR): generalize Principle IV's RBAC sentence from "the admin pool defines RBAC groups" to "pools MAY define RBAC groups", enumerating admin (`admin`/`manager`/`csa`) and store (`store_manager`/`store_staff`), customer and driver defining none; restate that the claim is the **origin of role assignment** while the platform record is **authoritative for the access decision**. Add the Sync Impact Report per Governance. Exact wording in [research.md](./research.md) R2.
- [ ] T002 Reconcile `CLAUDE.md`: platform-shape line `store-web` → `shop-web`; Auth section's "the admin pool defines RBAC groups" sentence updated to match constitution v1.5.0.
- [ ] T003 [P] Add `shop-dev` (vite :5174), `shop-build`, `shop-lint`, `shop-test` targets to `Makefile`, mirroring the existing `bo-*` block.
- [ ] T004 [P] Create `packages/web-kit/` skeleton: `package.json` (`@effy/web-kit`, `type: module`, exports `"."` → `./src/index.ts` and `"./console"` → `./src/console/index.ts`, react/react-dom as peerDependencies), `tsconfig.json` and `vitest.config.ts` copied from `packages/design-system/`, plus `README.md`.
- [ ] T005 [P] Create `apps/shop-web/` skeleton: `package.json` (`@effy/shop-web`, scripts mirroring `@effy/back-office`), `vite.config.ts` (**`server: { port: 5174, strictPort: true }`**, `@` alias, vitest jsdom + `vitest.setup.ts`), `tsconfig.json`, `index.html` (`<title>Effy Shop</title>`), `components.json` (`aliases.ui` → `@effy/design-system/ui`), `.env.example` per [config.contract.md](./contracts/config.contract.md), `vitest.setup.ts`, `.gitignore`.
- [ ] T006 Run `pnpm install` and confirm `pnpm typecheck` + `pnpm lint` are green across the workspace with the two new packages linked via the `packages/*` and `apps/*` globs in `pnpm-workspace.yaml` (verify the `node_modules/@effy/web-kit` symlink resolves).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure, schema, and the shared-package extraction that **every** user story sits on.

**⚠️ CRITICAL**: No user story work begins until this phase completes. The extraction (T014–T021) is
the slice's largest cost and its whole point — see research R5.

### Infrastructure (one apply covers both edits)

- [ ] T007 [P] Add `groups = [{ name = "store_manager", ... }, { name = "store_staff", ... }]` to the `shop_pool` module block in `infra/envs/dev/auth-shop.tf`, with descriptions from [data-model.md](./data-model.md) § `public.store_role`.
- [ ] T008 [P] Add `"http://localhost:5174"` to `cors_configuration.allow_origins` on `aws_apigatewayv2_api.edge` in `infra/envs/dev/edge-gateway.tf` (the gateway owns CORS — an attached service cannot set it).
- [ ] T009 ✋ Run `make plan ENV=dev` then `make apply ENV=dev`. **Expect exactly** two `aws_cognito_user_group` creates plus one in-place CORS update. **Abort if the plan shows `aws_cognito_user_pool` must be replaced** — that would destroy every existing user. Runbook: [quickstart.md](./quickstart.md) §1.

### Data (serves US2, US3, US4 — hence Foundational, per template entity rule)

- [ ] T010 Create the migration via `make db-new name=store_staff_rbac`, then author `db/migrations/<ts>_store_staff_rbac.sql`: `public.store`, `public.store_staff`, `public.store_role` (seeded with both roles), `public.store_staff_role` — exact columns, constraints, FK actions and indexes per [data-model.md](./data-model.md) and [store-schema.contract.md](./contracts/store-schema.contract.md). Goose `Up`/`Down` sections; `Down` drops in FK-safe order.
- [ ] T011 [P] Create `db/seeds/dev-store.sql` — an idempotent (`ON CONFLICT (code) DO NOTHING`) insert of one dev store.
- [ ] T012 ✋ Commit the migration (`make db-up` refuses uncommitted migrations — `Makefile:119-125`), then run `make db-status ENV=dev` and `make db-up ENV=dev`. Verify the four tables and the two seeded role rows exist. Runbook: [quickstart.md](./quickstart.md) §2.

### Shared contracts

- [ ] T013 [P] Add `packages/shared-types/src/store.ts`: `StoreRole`, `STORE_ROLES`, `toStoreRoles` (tolerant reader — drops unknown values), `StoreStaffStatus`, `StoreSummaryDTO`, `StoreStaffRecordDTO`, `StoreManagerPingDTO`, and the narrowed domain types `StoreSummary` / `StoreStaffRecord` / `ManagerPingResult`. Re-export from `packages/shared-types/src/index.ts`. Signatures in [data-model.md](./data-model.md) § Client-side domain models.

### Shared foundation extraction (research R5)

> **Gate on every task T014–T021**: `make bo-lint bo-test bo-build` green and the `theme-tokens`
> guard passing. An extraction that reddens the back-office is **reverted, not patched forward**.

- [ ] T014 Move the 12 shadcn primitives from `apps/back-office/src/components/ui/*.tsx` to `packages/design-system/src/ui/`, and `apps/back-office/src/hooks/use-mobile.ts` to `packages/design-system/src/hooks/use-mobile.ts`. Add the `"./ui"` export to `packages/design-system/package.json`; add react/react-dom as peerDependencies. Do **not** touch `tokens.css` or `scale.css` (005's D2 visual sign-off depends on them).
- [ ] T015 Repoint `apps/back-office`: `components.json` `aliases.ui` → `@effy/design-system/ui`; update every `@/components/ui/*` import; delete the local copies. Keep `src/lib/utils.ts`'s `cn` re-export. **Run the gate.**
- [ ] T016 [P] Create `packages/web-kit/src/runtime/`: `config.ts` (`createConfig(requiredKeys)` — throws on any missing key), `amplify.ts` (`configureAmplify({ userPoolId, clientId })`), `auth-session.ts` (`getAccessToken`, `getSubject`, `getGroups`), `query-client.ts` (`createQueryClient()` — no retry on `forbidden`/`unauthenticated`/`not-found`), `telemetry.ts` (`createTelemetry<TEvent>({ key, host, surface })` → `{ init, track, reportError }`, no-op without a key), `ui-store.ts` (`createUiStore()` — theme, sidebarOpen, commandPaletteOpen; TanStack Store).
- [ ] T017 [P] Create `packages/web-kit/src/auth/`: `otp.ts` (`startSignIn`, `submitOtp`, `signOutUser`, `otpErrorMessage` — the Cognito-exception → human-copy map from [shop-web.contract.md](./contracts/shop-web.contract.md) §1) and `guards.ts` (`createSessionGuard(sessionQuery)` → `requireSession(queryClient, href)` redirecting to `/auth/sign-in?next=<href>`).
- [ ] T018 Create `packages/web-kit/src/console/`: `ErrorState.tsx` (renders by `DomainError.kind`, never raw `detail`), `NavList.tsx` (generic over the role union; filters by `requiredRole`), `ConsoleUserMenu.tsx`, `ConsoleHeader.tsx`, `ConsoleSidebar.tsx`, `ConsoleShell.tsx`, `OtpSignInCard.tsx` (two-step email → OTP form) — each parameterized by brand, nav config, identity, and callbacks. Barrel at `src/console/index.ts`. Consumes primitives from `@effy/design-system/ui`.
- [ ] T019 Move the tests that cover moved code into `packages/web-kit/src/**/*.test.ts(x)`: ui-store, telemetry no-op, session guard redirect + `next`, nav role filtering, `otpErrorMessage` mapping, `ErrorState` per-kind rendering.
- [ ] T020 Refactor `apps/back-office` onto the packages: `src/lib/{env,amplify,auth-session,query-client,telemetry,ui-store}.ts` become thin wiring over `@effy/web-kit`; `src/features/auth/{repo,guards}.ts` use `web-kit`'s otp + guard; `src/components/layout/*` are replaced by `<ConsoleShell>` fed a back-office nav config. Delete every file whose logic now lives in a package.
- [ ] T021 **Extraction gate**: `make bo-lint bo-test bo-build` all green with **20/20** back-office tests passing, and `src/theme-tokens.test.ts` still passing. If back-office test count dropped because tests moved to `web-kit` (T019), the *combined* count must be ≥ 20 and every original assertion must still exist somewhere.

### Shop-web wiring & backend restructure

- [ ] T022 Create `apps/shop-web/src/lib/`: `env.ts` (`createConfig` with the three required `VITE_*` keys from [config.contract.md](./contracts/config.contract.md)), `api.ts` (`new ApiClient({ baseUrl, getToken })`), `telemetry.ts` (typed `ShopAnalyticsEvent` union + `surface: "shop-web"` super-property, per research R8), `ui-store.ts` (`createUiStore()`).
- [ ] T023 Create `apps/shop-web/src/main.tsx` (fail-fast `assertConfig` → `configureAmplify` → `initTelemetry` → `applyTheme` → render; catch → plain configuration-error page), `src/router.tsx` (code-based route tree), `src/routes/__root.tsx`, `src/styles.css` (imports `@effy/design-system/tokens.css` + `scale.css` **only** — no local theme rules).
- [ ] T024 [P] Add `apps/shop-web/src/theme-tokens.test.ts` — asserts `shop-web` defines **zero** local theme or scaling rules and inherits from `@effy/design-system` (SC-007).
- [ ] T025 Restructure `apis/edge-api/store/src/`: move the flat `types.ts`/`repository.ts`/`service.ts` (status domain) into `src/status/`, update imports in `functions/platform-status-v{1,2}-get.ts` and `src/status/service.test.ts`. `make edge-test` green. (The service gains a second domain; match the admin service's nested layout — plan § Complexity Tracking.)

**Checkpoint**: Infra applied, schema live, shared packages extracted with back-office green, both
apps scaffolded. User stories can now begin.

---

## Phase 3: User Story 1 — Store operator signs in passwordlessly and reaches the console (Priority: P1) 🎯 MVP

**Goal**: A provisioned store operator signs in with an emailed one-time code and lands in the
dashboard shell. Session persists across reload; protected routes are unreachable signed-out;
sign-out works.

**Independent Test**: From a fresh clone, `make shop-dev`, request a code for a provisioned shop
account, enter it, arrive in the shell. Reload → still signed in. Deep-link a protected route signed
out → sign-in → returned to intent. Sign out → protected areas unreachable. **Needs no backend
endpoint, no database, and no gateway CORS** — Amplify talks to Cognito directly.

- [ ] T026 [P] [US1] Create `apps/shop-web/src/features/auth/model.ts` — `Identity { subject, email, roles: StoreRole[] }`, `Session` union (`signed-in` | `signed-out`), `isStoreManager(roles)`.
- [ ] T027 [P] [US1] Create `apps/shop-web/src/features/auth/repo.ts` — `loadSession()` reads the Amplify session: `subject` from the access token, `email` from the ID token, roles via `toStoreRoles(access.payload["cognito:groups"])`. Re-export `startSignIn`/`submitOtp`/`signOutUser` from `@effy/web-kit`.
- [ ] T028 [US1] Create `apps/shop-web/src/features/auth/queries.ts` — `sessionQuery` (`queryOptions`, key `["auth","session"]`) and `useSignOut()` mutation invalidating it.
- [ ] T029 [US1] Create `apps/shop-web/src/features/auth/SignInScreen.tsx` — composes `<OtpSignInCard>` from `@effy/web-kit/console`; emits `shop_auth_sign_in_started`, `shop_auth_otp_submitted`, `shop_auth_sign_in_succeeded`, `shop_auth_sign_in_failed`; uniform email error (no account-existence oracle).
- [ ] T030 [US1] Create `apps/shop-web/src/routes/auth.tsx` — public `/auth` layout + `/auth/sign-in` route with a validated `next` search param.
- [ ] T031 [US1] Create `apps/shop-web/src/routes/app.tsx` — protected layout route with `beforeLoad: requireSession(...)` rendering `<ConsoleShell>` (sidebar + header + `<Outlet/>`), plus the index `DashboardScreen`. Register both trees in `src/router.tsx`.
- [ ] T032 [P] [US1] Create `apps/shop-web/src/components/layout/nav.ts` — `NAV = [{ Dashboard, "/" }, { Management, "/manager", requiredRole: "store_manager" }]` and `visibleNav(roles)`.
- [ ] T033 [US1] Add `apps/shop-web/src/features/auth/` tests: guard redirects signed-out and preserves `next`; the two-step sign-in advances email → OTP → session; sign-out clears the session; `visibleNav` filters by role; the shell's rail collapses/expands (`nav.test.ts`, `guards.test.ts`, `SignInScreen.test.tsx`).
- [ ] T034 ✋ [US1] Provision three shop-pool accounts and verify sign-in (SC-002, SC-013): `sam.manager@effy.test` (`store_manager`), `ravi.staff@effy.test` (`store_staff`), `nobody@effy.test` (no group). Commands in [quickstart.md](./quickstart.md) §3–§4. Confirm zero password prompts, and the shell renders in light **and** dark.

**Checkpoint**: US1 is independently demonstrable — a real operator signs in and sits in the shell.
Nothing privileged exists yet, and nothing needs to.

---

## Phase 4: User Story 2 — Identity-scoped read + cross-pool credentials structurally refused (Priority: P2)

**Goal**: The console calls the store backend with the operator's store credential and renders the
verified identity, roles, and assigned store from the **platform record**. Cross-pool tokens are
refused in both directions.

**Independent Test**: Signed in, the proving screen shows backend-returned identity + roles + store.
Present a back-office token to the store backend → `401`; a store token to the back-office backend →
`401`. Kill the backend → degraded state + Retry, never a broken interface.

### Backend — `GET /store/v1/me` ([store-me.contract.md](./contracts/store-me.contract.md))

- [ ] T035 [P] [US2] Create `apis/edge-api/store/src/staff/types.ts` — `StoreRole`, `KNOWN_ROLES`, `StoreStaffStatus`, `StoreSummary`, `StoreStaffRecord`.
- [ ] T036 [US2] Create `apis/edge-api/store/src/staff/repository.ts` — `upsertOnContact(sub, email, tokenRoles)` inside `withTransaction`: `INSERT … ON CONFLICT (cognito_sub) DO UPDATE SET email = COALESCE(EXCLUDED.email, store_staff.email), last_seen_at = now(), updated_at = now()`; delete role rows not in the claim; insert the claim's roles `ON CONFLICT DO NOTHING`; filter unknown group names **before** reconcile; read back joined to `public.store`. Explicit row→domain mapping; raw SQL as named constants. **`status` and `store_id` are never written here.**
- [ ] T037 [US2] Create `apis/edge-api/store/src/staff/service.ts` — `recordAndLoad(sub, email, tokenRoles)`. No HTTP, no SQL.
- [ ] T038 [US2] Create `apis/edge-api/store/src/functions/store-me-v1-get.ts` — `preamble` → `subject` or `401` → resolve email as `claim("email") ?? emailShaped(claim("username")) ?? null` (research R6) → `recordAndLoad` → `200` with `{subject,email,roles,status,store,lastSeenAt}`; catch → `unavailable` (`503`). Log `subject` only — **never** the email (Principle VII).
- [ ] T039 [US2] Add `storeMeV1` to `apis/edge-api/store/serverless.yml` — `httpApi GET /store/v1/me`, authorizer by id `${ssm:/effy/${sls:stage}/edge/authorizer/shop_id}`; alarms `StoreMeV1ErrorsAlarm` (Errors>0) and `StoreMeV1DurationP95Alarm` (p95 > 5000ms).
- [ ] T040 [P] [US2] Add `apis/edge-api/store/src/staff/repository.test.ts` and `src/functions/store-me.test.ts` covering contract tests 1–6: first call creates + returns; second refreshes `last_seen_at` with no duplicate; reconcile drops a removed role and filters an unknown group; unassigned operator returns `store: null` with `200`; a stored email is not clobbered by a null token email; repository failure → `503` with the cause withheld.
- [ ] T041 ✋ [US2] Deploy the store service — `make edge-deploy SERVICE=store ENV=dev` (deploys `apis/edge-api/store/serverless.yml` against the shared gateway). Confirm `GET /store/v1/me` answers `401` without a token.

### Client — proving screen

- [ ] T042 [P] [US2] Create `apps/shop-web/src/features/store-identity/repo.ts` (`loadMe()` → `api.get<StoreStaffRecordDTO>("/store/v1/me")`, mapped to `StoreStaffRecord` via `toStoreRoles`) and `queries.ts` (`meQuery`).
- [ ] T043 [US2] Create `apps/shop-web/src/features/store-identity/ProvingScreen.tsx` — renders subject/email/roles/**assigned store**; a **role-less** state; a **no-store-assigned** state (emits `shop_store_assignment_missing`); `unavailable` → degraded + Retry; `unauthenticated` → session recovery. Never raw `detail`. Render it inside the dashboard.
- [ ] T044 [P] [US2] Add `apps/shop-web/src/features/store-identity/ProvingScreen.test.tsx` — pending, populated, role-less, no-store, degraded+retry, expired-session states.
- [ ] T045 ✋ [US2] **SC-004 — cross-pool isolation, both directions.** With a real shop token and a real back-office token, run the four `curl`s in [quickstart.md](./quickstart.md) §5. **Pass = `200 200 401 401`.** A `403` means a route lost its authorizer; a `200` means a route carries the wrong authorizer id ([cross-pool-isolation.contract.md](./contracts/cross-pool-isolation.contract.md)).

**Checkpoint**: The full vertical works — client → store backend → identity/role enforcement →
platform record → back — and pool isolation is proven, not assumed, for the first time.

---

## Phase 5: User Story 3 — The store role model exists and the backend enforces it (Priority: P3)

**Goal**: `store_manager` is served the manager-only read; `store_staff` is refused **by the backend**
even when the request bypasses the hidden nav item.

**Independent Test**: Sign in as the manager → Management area and its read succeed. Sign in as
`store_staff` → the item is hidden **and** a direct `curl` to `/store/v1/manager-ping` returns `403`.
Role-less → nothing privileged reachable.

### Backend — `GET /store/v1/manager-ping` ([store-manager-ping.contract.md](./contracts/store-manager-ping.contract.md))

- [ ] T046 [US3] Add `authorizeStoreManager(sub)` to `apis/edge-api/store/src/staff/repository.ts` — the single three-term `EXISTS` predicate (role AND `status='active'` AND `JOIN public.store` with `st.is_active`) from [data-model.md](./data-model.md). Named SQL constant, raw SQL.
- [ ] T047 [US3] Add `isActiveStoreManager(sub)` to `apis/edge-api/store/src/staff/service.ts`.
- [ ] T048 [US3] Create `apis/edge-api/store/src/functions/store-manager-ping-v1-get.ts` — `preamble` → `subject` or `401` → `try isActiveStoreManager / catch → 503` (**fail closed** — never treat a check failure as a grant) → `!allowed` → `forbidden` (`403`, uniform body, **no disclosure of which term failed**) → `200 {audience:"store", scope:"store_manager", subject, message:"pong"}`. Warn-log `subject` only on denial.
- [ ] T049 [US3] Add `storeManagerPingV1` to `apis/edge-api/store/serverless.yml` — `httpApi GET /store/v1/manager-ping`, shop authorizer by id; `StoreManagerPingV1ErrorsAlarm`.
- [ ] T050 [P] [US3] Add `apis/edge-api/store/src/functions/store-manager-ping.test.ts` covering contract tests 1–6: active manager at an active store → `200`; `store_staff` → `403`; disabled manager → `403`; manager with `store_id IS NULL` → `403`; manager at an inactive store → `403`; repository throws → `503` not `200`. Assert the `403` body discloses no term.

### Client — role-aware interface

- [ ] T051 [P] [US3] Create `apps/shop-web/src/features/store-identity/ManagerOnlyScreen.tsx` + its `managerPingQuery` in `queries.ts` and `loadManagerPing()` in `repo.ts` — checking / confirmed / access-denied (`forbidden`) / degraded+Retry states; emits `shop_manager_area_access_denied` on denial.
- [ ] T052 [US3] Add the `/manager` route as a child of `appRoute` in `apps/shop-web/src/routes/app.tsx`; register in `src/router.tsx`. The nav item is already role-gated by `visibleNav` (T032).
- [ ] T053 [P] [US3] Add `apps/shop-web/src/features/store-identity/ManagerOnlyScreen.test.tsx` and extend `nav.test.ts`: Management is hidden for `store_staff` and role-less; shown for `store_manager`; the denied state renders and fires the telemetry event exactly once.
- [ ] T054 ✋ [US3] **SC-005** — redeploy (`make edge-deploy SERVICE=store ENV=dev`) and run [quickstart.md](./quickstart.md) §6 (a)–(c): manager → `200`, `store_staff` → `403` on a direct request past the hidden control, role-less → `403`.

**Checkpoint**: The store audience has RBAC, and the gate is authoritative rather than cosmetic.

---

## Phase 6: User Story 4 — The platform's own record of stores and the staff assigned to them (Priority: P4)

**Goal**: The record is the platform's, not the identity provider's: status and store assignment are
platform-owned, the upsert is idempotent, and a disabled / unassigned / inactive-store operator is
refused while holding a perfectly valid credential.

**Independent Test**: Seed a store, provision an operator, confirm the record. Flip each
platform-owned term (`status`, `store_id`, `store.is_active`) and watch a `200` become a `403` with
the operator's token unchanged. Reload repeatedly → exactly one row, advancing `last_seen_at`.

- [ ] T055 [P] [US4] Add `shop-seed-store` to `Makefile` — `make shop-seed-store CODE=… NAME=… ENV=dev`, composing the DSN via `infra/scripts/db-dsn.sh` (no credential in shell history, exactly as `db-up` does); idempotent on `code`.
- [ ] T056 [P] [US4] Add `shop-provision-staff` to `Makefile` — `make shop-provision-staff EMAIL=… STORE=<code> [STATUS=active] ENV=dev`, setting `email`, `store_id`, `status` on `public.store_staff`. Runs **after** the operator's first sign-in (the row is created by the JIT upsert). Fails clearly when the email or store code is unknown.
- [ ] T057 [US4] Add ownership tests to `apis/edge-api/store/src/staff/repository.test.ts`: a token carrying `status` or `store_id`-shaped data **never** writes those columns; a null token email **never** overwrites a stored one (`COALESCE`); role reconcile leaves `status` and `store_id` untouched.
- [ ] T058 [P] [US4] Add idempotency tests: repeat first-contact produces exactly one row and advances `last_seen_at`; two concurrent first-contact upserts resolve to a single row via `UNIQUE (cognito_sub)` + `ON CONFLICT` (SC-011).
- [ ] T059 [P] [US4] Add an audit-persistence test: when all roles are removed from the claim, the `store_staff` row **persists** with `roles: []` and grants nothing — the record is never deleted on role removal ([data-model.md](./data-model.md) § State transitions).
- [ ] T060 ✋ [US4] **SC-011 / SC-012 / SC-005a** — run [quickstart.md](./quickstart.md) §2 (seed), §4 (provision), and §6's term-flipping block: disable the manager → `403`; null the `store_id` → `403`; deactivate the store → `403`; each restored afterwards. Then confirm exactly one `store_staff` row after several console reloads, with `last_seen_at` advancing.

**Checkpoint**: Authorization is a decision the platform owns, independent of Cognito. A disabled
operator is refused with a valid token.

---

## Phase 7: User Story 5 — The store audience's two surfaces are held at parity (Priority: P5)

**Goal**: The capability baseline lives in exactly one place both surfaces reference, with every
capability's state on **each** surface explicit. Building `shop-mobile` is **out of scope** (FR-023a).

**Independent Test**: Locate the register; confirm every capability this slice delivered is marked
delivered on web and outstanding on mobile; confirm the outstanding column is specific enough to
scope the later mobile bootstrap without re-deriving it.

- [ ] T061 [P] [US5] Create `docs/audiences/store-capabilities.md` — the parity register. One row per capability delivered here (passwordless sign-in against the shop pool · authenticated shell · identity-scoped record-backed read · role-aware access · backend-authoritative manager gate · store-scoped staff record), each with an explicit **Web** and **Mobile** state, and a short note on what the mobile bootstrap must build. Declares itself the single place a future capability's per-surface state is recorded.
- [ ] T062 [P] [US5] Create `apps/shop-web/README.md` — structure guide (where every concern lives and why), the "add a screen" walkthrough from [shop-web.contract.md](./contracts/shop-web.contract.md) §7 (including its mandatory step 4: update the parity register), the client error-handling contract table, and local-run instructions targeting SC-001 (fresh clone → signed in, under 15 minutes).
- [ ] T063 [P] [US5] Add a "Surface parity" section to `apps/shop-mobile/README.md` linking to `docs/audiences/store-capabilities.md` as the binding baseline for this app.
- [ ] T064 [US5] **SC-009 audit**: `git grep -n "components/ui" apps/shop-web` returns nothing; each shared concern (tokens, primitives, fetch client, DTOs, config, auth flow, shell) resolves to exactly one source; **`packages/api-client/` is untouched by this slice** — record that in the audit note as the cleanest evidence the foundation was already audience-neutral.
- [ ] T065 [P] [US5] Register the two new routes in the platform API docs: add `/store/v1/me` and `/store/v1/manager-ping` to `docs/api/path-assignment.md` § worked examples (or the store-service section) and to `docs/api/shared-gateway.md`'s route inventory.

**Checkpoint**: All five user stories are independently functional. The mobile gap is explicit rather
than silent.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [ ] T066 Full hygiene sweep: `pnpm lint`, `pnpm typecheck`, `pnpm test` (turbo) green across the workspace; `make edge-test`, `make bo-test` (20/20 or the ≥20 combined count from T021), `make shop-test`, `make shop-build`, `make lint` (terraform fmt/validate).
- [ ] T067 [P] **SC-008 secret & PII sweep**: `git grep -nE '(us-east-1_|ap-southeast-1_|AKIA|eyJ)' -- apps/shop-web packages/web-kit` returns nothing; `.env` is git-ignored and `.env.example` holds no real values; confirm no telemetry event carries the email, the OTP code, a token, or a store code — only `subject`.
- [ ] T068 ✋ **Verify the token claim set** (research R6, ~2 min): decode a real shop-pool access token per [quickstart.md](./quickstart.md) §4 and record the actual claims in `research.md` R6. If `username` is a UUID rather than an email, that **confirms the 005 defect** — proceed to T069.
- [ ] T069 [P] Record the 005 follow-up: append a note to `specs/005-back-office-web/plan.md` (or its checklist) that `/admin/v1/me` resolves email as `claim("username") ?? sub` and may be storing UUIDs in `admin.staff.email`. **Do not fix it here** — it belongs to a 005 reconciliation. Reference research R6.
- [ ] T070 ✋ **SC sign-off**: run [quickstart.md](./quickstart.md) end to end and tick SC-001…SC-016 in the spec. Includes SC-001 (fresh clone → signed in under 15 min, docs only), SC-003, SC-006 (every sampled failure renders recoverably, zero stack traces), SC-007, SC-010, SC-014, SC-015, SC-016.
- [ ] T071 Update `CLAUDE.md` § Active feature to describe 007 as implemented, listing any operator steps still open; move 005/006 into the previous-slices list as appropriate.
- [ ] T072 Run `make dev-stop ENV=dev` if the dev database is no longer needed (cost control), leaving the three test accounts in place — §5 and §6 are worth re-running whenever a route's authorizer changes.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies. **T001 (amendment) blocks T009 (apply).**
- **Foundational (Phase 2)**: depends on Setup. **Blocks every user story.**
  - T009 (apply) depends on T001, T007, T008.
  - T012 (`db-up`) depends on T010 being **committed** (`Makefile` commit-guard).
  - T014 → T015 → T020 → T021 is a strict chain (move primitives → repoint back-office → refactor onto web-kit → gate).
  - T022–T024 depend on T016–T018 (shop-web wires over web-kit).
- **US1 (Phase 3)**: depends on Foundational's client half (T014–T024). **Independent of T007–T012** — sign-in talks to Cognito directly, needing neither gateway CORS nor the database.
- **US2 (Phase 4)**: depends on Foundational (all of it — needs schema, CORS, and the client base) + US1's session (T027–T028).
- **US3 (Phase 5)**: depends on US2's `staff/` module (T035–T037) and the shop pool's groups (T009).
- **US4 (Phase 6)**: depends on US2's repository (T036) and US3's gate (T046) to have terms to flip.
- **US5 (Phase 7)**: depends on US1–US4 having delivered the capabilities the register records.
- **Polish (Phase 8)**: depends on everything.

### Within each user story

Types → repository → service → handler → serverless registration → tests → deploy → client repo →
queries → screen → client tests → live verification.

### Parallel opportunities

- **Setup**: T003, T004, T005 in parallel (after T001/T002, different files).
- **Foundational**: T007 ∥ T008 (different `.tf` files); T011 ∥ T013; T016 ∥ T017 (different
  directories) — but **T018 waits on both**, and **T014→T015→T020→T021 is strictly serial** (it
  moves files the back-office imports).
- **US1**: T026 ∥ T027 ∥ T032 (different files). T028–T031 serialize on them.
- **US2**: T035 ∥ (nothing else, it seeds the module); T040 ∥ T042 once T038 exists.
- **US3**: T050 ∥ T051 (backend test vs client screen); T053 after T051.
- **US4**: T055 ∥ T056 (both `Makefile`, so actually serial — same file); T057 ∥ T058 ∥ T059 only if
  split across `repository.test.ts` and a new `staff-lifecycle.test.ts`, otherwise serial.
- **US5**: T061 ∥ T062 ∥ T063 ∥ T065 (four different files).

> **Same-file caution**: T055/T056 both edit `Makefile`, and T057/T058/T059 may share
> `repository.test.ts`. They are marked `[P]` by *intent* (independent concerns) but must be
> serialized if a single agent edits the file. T003 also edits `Makefile` — land it first.

### Operator-run tasks (✋) — the critical path the operator owns

`T009` (apply) → `T012` (db-up) → `T034` (provision + sign-in) → `T041` (deploy) → `T045` (isolation
curl) → `T054` (manager gate curl) → `T060` (term flipping) → `T068` (token decode) → `T070` (sign-off).

Everything else Claude authors and verifies locally.

---

## Parallel Example: Foundational shared extraction

```bash
# T016 and T017 touch different directories under packages/web-kit/src/ — safe together:
Task: "Create packages/web-kit/src/runtime/{config,amplify,auth-session,query-client,telemetry,ui-store}.ts"
Task: "Create packages/web-kit/src/auth/{otp,guards}.ts"

# T018 must wait — the console components import from BOTH runtime/ and auth/.
```

```bash
# US5 docs, four independent files:
Task: "Create docs/audiences/store-capabilities.md"
Task: "Create apps/shop-web/README.md"
Task: "Add a Surface parity section to apps/shop-mobile/README.md"
Task: "Register the new routes in docs/api/path-assignment.md and shared-gateway.md"
```

---

## Implementation Strategy

### MVP scope — Setup + Foundational + US1

`T001`–`T034`. Delivers a real store operator signing in passwordlessly against the shop pool and
landing in the dashboard shell, on a shared foundation that provably serves two surfaces.

Note the MVP is unusually front-loaded: **US1 alone requires the whole extraction** (T014–T021),
because `shop-web` cannot render a shell or a sign-in card without `@effy/web-kit`. That is the cost
of doing Principle II properly rather than copying the back-office. The upside is that everything
after US1 is thin.

The MVP does **not** require the Terraform apply or the database. If the operator is unavailable,
`T001`–`T006`, `T013`–`T034` can all be completed and demonstrated with a hand-provisioned account.

### Incremental delivery

1. Setup + Foundational → foundation ready, back-office still green (**T021 is the gate**).
2. **US1** → operator signs in and reaches the shell → demo (**MVP**).
3. **US2** → the proving screen renders the platform record; pool isolation proven both ways → demo.
4. **US3** → RBAC, with the gate enforced by the backend → demo.
5. **US4** → the record is the platform's: disable an operator and watch a valid token stop working → demo.
6. **US5** → the parity register makes the mobile gap explicit.
7. Polish → SC sign-off.

Each story adds value without breaking the previous one.

### Parallel team strategy

After Foundational, US2's backend (`T035`–`T041`) and US1's client work (`T026`–`T033`) are the only
genuinely parallelizable pair — one developer per side. US3 and US4 both build on US2's `staff/`
module and are better done in sequence by whoever wrote it.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- **✋ = operator-run.** Claude authors the code and the exact command; it does not run
  `terraform apply`, `db-up`, `edge-deploy`, or anything touching live AWS (CLAUDE.md).
- **SC-004 and SC-005a are not unit-testable.** Enforcement is structural (gateway authorizers) and
  relational (a SQL join); a vitest assertion would only prove the test's own fixture. They are
  `curl` checks in `quickstart.md` §5–§6 (research R9).
- **The extraction gate (T021) is not advisory.** A red back-office means the extraction is wrong;
  revert it. The fallback — keep the shell per-app and record the duplication as a justified
  exception — is documented in research R5 and plan § Complexity Tracking.
- Commit after each task or logical group. Stop at any checkpoint to validate a story independently.
