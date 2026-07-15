---
description: "Task list — 005 Back-Office Web Foundation (Bootstrap)"
---

# Tasks: Back-Office Web Foundation (Bootstrap)

**Input**: Design documents from `/specs/005-back-office-web/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md).
Constitution **v1.4.0**; ARCHITECTURE.md "Operator / admin web (SPA)" is binding.

**Tests**: included (project convention — Quality Gates + the plan's testing section). Vitest +
React Testing Library for the web; Vitest + testcontainers for edge-api.

**Organization**: by user story (decoupled MVP ladder). 🧑‍💻 = **operator-run** (touches live
cloud), per the mode of work. `[P]` = parallelizable (different files, no incomplete deps).

**Pins** (confirm-at-install — research A1/A2/C1): `@tanstack/react-router` 1.170.17 · `-query`
5.101.2 · `-table` 8.21.3 · `-form` 1.33.0 · `-store` 0.11.0 · `-virtual` 3.14.5 · `-devtools`
0.10.8 · `@tanstack/react-hotkeys` 0.10.0 (alpha) · `aws-amplify` ^6.18 · Vite 7 · React 19 · TS
5.9 · Tailwind v4 · shadcn CLI v4 (Radix). **No** `@tanstack/react-db`.

> **Amendment D1 (2026-07-08) — default dashboard shell.** Phases 1–8 below are **implemented**
> (T001–T045 `[x]`; open items are operator-run T022/T029/T038 + sign-off T046). The spec then
> added **FR-023 / US1 / SC-013** (the authenticated shell graduates to a shadcn **`sidebar-07`**
> dashboard layout). **Presentation-only** — no backend/data/auth change. New work lives in
> **[Phase 9](#phase-9-amendment-d1--default-dashboard-shell-us1--fr-023)** (T047–T058);
> plan [§ Amendment D1](./plan.md), research [Part G](./research.md#part-g), data-model
> [§8](./data-model.md), web contract [§5](./contracts/back-office-web.contract.md).
>
> **Amendment D2 (2026-07-09) — neutral theme + responsive scaling.** Spec added **FR-024/FR-025 /
> SC-014/SC-015**: neutralise the design-system surfaces (drop the green tints; **Jade `#0FB57E`
> stays the single accent**) + fluid **root-font-size scaling** for wide displays.
> **Presentation-only, design-system-scoped** (essentially one file: `tokens.css`). New work in
> **[Phase 10](#phase-10-amendment-d2--neutral-theme--responsive-scaling-fr-024fr-025)** (T059–T063);
> plan [§ Amendment D2](./plan.md), research [Part H](./research.md#part-h) + [Part I](./research.md#part-i).
> No constitution amendment (governance settled in plan § Amendment D2).

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: scaffold the first web surface + the first shared packages; activate the workspace.

- [x] T001 Decode + verify the shadcn preset **before** scaffolding: `pnpm dlx shadcn@latest preset decode b2BnwlLOK` — confirm what it encodes and plan the **Jade `#0FB57E`/fill `#047857`** override (brand is the binding SSOT; the preset must not win — research B1/B2). Record the outcome in the app README stub.
- [x] T002 Scaffold `apps/back-office/` — shadcn init flow (standalone create → reconcile into the monorepo per research B2): Vite 7 + React 19 + TS 5.9 + Tailwind v4 (`@tailwindcss/vite`) + shadcn (Radix base, preset `b2BnwlLOK`, `--pointer`). `package.json` with all pinned deps (TanStack Router/Query/Table/Form/Store/Virtual/DevTools + `@tanstack/react-hotkeys` alpha + `aws-amplify` ^6.18; **no** `react-db`), `tsconfig.json`, `vite.config.ts`, `components.json` (aliases → `@effy/design-system`), `vitest.config.ts`, `.gitignore`, `.env.example` (VITE_* names only, per config.contract.md).
- [x] T003 [P] Scaffold shared packages: `packages/design-system/`, `packages/shared-types/`, `packages/api-client/` — each with `package.json` (workspace name `@effy/*`), `tsconfig.json`, `src/index.ts` stub, build config (tsc/tsup). (plan Project Structure)
- [x] T004 [P] Activate the workspace: `pnpm-workspace.yaml` globs `apps/*` + `packages/*`; `turbo.json` tasks (`dev`/`build`/`lint`/`typecheck`/`test`); `Makefile` targets `bo-dev` (`vite dev` :5173), `bo-build`, `bo-lint`, `bo-test` (following 004 Makefile conventions).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: shared packages (minimal) + app `lib/` wiring + router skeleton that **all** stories need.

**⚠️ CRITICAL**: no user-story work begins until this phase is complete.

- [x] T005 [P] Design-system tokens (the brand SSOT — FR-011): `packages/design-system/src/tokens.css` (Tailwind v4 `@theme`: Jade `#0FB57E` / fill `#047857`, full light + **dark-mode** CSS variables), `src/cn.ts` (class-merge), `src/index.ts`. (research B3; data-model — n/a)
- [x] T006 [P] Shared types (the contract SSOT — Principle II): `packages/shared-types/src/problem.ts` (RFC 9457 `ProblemJSON`, mirrors `docs/api/error-envelope.md`), `src/back-office.ts` (`BackOfficeRole`, `StaffRecord(DTO)`, `BackOfficeAdminPingDTO`/`AdminPingResult`), `src/index.ts`. (data-model §1–4)
- [x] T007 API client: `packages/api-client/src/client.ts` (fetch wrapper — inject `Authorization: Bearer <access>` via an injected token-provider, parse problem+json) + `src/errors.ts` (`DomainError` mapping by `kind`) + `src/index.ts`. (contracts/back-office-web §3–4; depends on T006)
- [x] T008 [P] App auth lib: `apps/back-office/src/lib/amplify.ts` (`Amplify.configure` from VITE_* — existing admin pool, no backend project/identity pool; **fail-fast** on missing required key) + `src/lib/auth-session.ts` (`fetchAuthSession` → access token + `cognito:groups`, `forceRefresh` helper). (research C1/C3; config.contract.md)
- [x] T009 [P] App state/query lib: `apps/back-office/src/lib/query-client.ts` (the single `QueryClient`) + `src/lib/ui-store.ts` (**TanStack Shop** — theme / command-palette / hotkey-scope ONLY; no server data). (research A4; ARCHITECTURE admin-web)
- [x] T010 [P] App telemetry seam: `apps/back-office/src/lib/telemetry.ts` (PostHog provider + typed event taxonomy + runtime-error routing; **no-op if key absent**; subject-only, no PII). (plan Telemetry declaration; FR-013)
- [x] T011 Router skeleton + entry: `apps/back-office/src/router.tsx` (`createRouter` + `createRootRouteWithContext<{queryClient; auth}>`), `src/routes/__root.tsx` (providers: QueryClientProvider, theme, **unified `TanStackDevtools` panel** hosting Query+Router panels, error boundary → telemetry), `src/main.tsx` (`Amplify.configure` → `RouterProvider`). (research A1/A5/A1-devtools; depends on T008/T009)

**Checkpoint**: workspace builds; app boots to an empty shell; packages import cleanly.

---

## Phase 3: User Story 1 — Passwordless sign-in → console shell (Priority: P1) 🎯 MVP

**Goal**: a provisioned staff member signs in with an email OTP (no password) and lands in a
session-guarded shell; reload persists; sign-out clears; protected deep-links redirect+return.

**Independent Test**: quickstart §US1 steps 1–6 (sign in, reload persists, deep-link redirect,
sign out). No backend beyond Cognito.

- [x] T012 [P] [US1] Auth domain model: `apps/back-office/src/features/auth/model.ts` — `SessionState` discriminated union (`checking|signed-out|otp-pending|signed-in{identity}|error`) + `Identity{subject,email,roles}`. (data-model §1–2)
- [x] T013 [US1] Auth repo: `apps/back-office/src/features/auth/repo.ts` — Amplify `signIn({authFlowType:'USER_AUTH',preferredChallenge:'EMAIL_OTP'})`, `confirmSignIn`, `signOut`, session→`Identity` (roles filtered to `BackOfficeRole`). (contracts/back-office-web §1; research C2; depends on T008)
- [x] T014 [US1] Auth queries + guard: `apps/back-office/src/features/auth/queries.ts` (`sessionQuery` = session-as-a-query; `signIn`/`confirm`/`signOut` mutations invalidating it) + `guards.ts` (`requireSession` for `beforeLoad`). (plan mechanic 1; depends on T013)
- [x] T015 [US1] Sign-in screen: `apps/back-office/src/features/auth/SignInScreen.tsx` — email → OTP via **TanStack Form**; states for wrong/expired code, resend, throttle; never a password field. (FR-002; edge cases)
- [x] T016 [US1] Public + protected routes: `apps/back-office/src/routes/auth.tsx` (sign-in/verify layout) + `src/routes/app.tsx` (protected layout: `beforeLoad` → `ensureQueryData(sessionQuery)` else `throw redirect({to:'/auth/sign-in', search:{next}})`; shell greets identity; sign-out). (FR-003/004; plan mechanic 1; depends on T011/T014)
- [x] T017 [P] [US1] Tests: `apps/back-office/src/features/auth/*.test.tsx` — session state-machine transitions, protected-route guard redirect+return (`next`), SignInScreen OTP happy/error paths. (research E3)

**Checkpoint**: US1 fully functional — sign in, shell, reload, deep-link, sign out.

---

## Phase 4: User Story 2 — Identity proving read against the existing endpoint (Priority: P2)

**Goal**: from the shell, the console calls the **existing 004 `/admin/v1/ping`** and renders
identity + roles; role-less → no-privileges state; unreachable/slow → degraded + retry. (Decouple:
no new backend logic — the dev CORS origin is a Terraform gateway value, already live (A3).)

**Independent Test**: quickstart §US2 steps 7–8 (proving read renders roles; degraded state on
unreachable). Uses the already-live endpoint.

- [x] T018 [US2] edge-api dev CORS: the console's approved dev origin `http://localhost:5173` lives in the **Terraform-owned shared gateway** (`infra/envs/dev/edge-gateway.tf` `cors_configuration.allow_origins`, A3 — **already live**), **not** a per-service `corsOrigins` entry. No serverless change; an operator `terraform apply` (already done) owns it. (contracts/admin-ping.contract.md D2; config.contract.md CORS coupling)
- [x] T019 [P] [US2] staff-identity model + repo: `apps/back-office/src/features/staff-identity/model.ts` + `repo.ts` — `GET /admin/v1/ping` via `@effy/api-client` (DTO↔domain: identity + roles). (contracts/back-office-web §2)
- [x] T020 [US2] staff-identity queries + proving screen: `queries.ts` (ping query + keys) + the proving screen (renders identity+roles; **role-less → clear no-privileges state, no privileged data**; error-contract → degraded + retry) wired into the protected shell. (FR-005/009; US2 AS; depends on T007/T016/T019)
- [x] T021 [P] [US2] Tests: proving-screen renders roles; role-less no-privileges; `DomainError` → degraded state (vitest+RTL). (research E3)
- [ ] T022 [US2] 🧑‍💻 OPERATOR: `make edge-deploy SERVICE=admin ENV=dev` (deploys the admin service routes; the :5173 CORS origin is already live at the Terraform gateway, A3), then run quickstart §US2 live from `localhost:5173`.

**Checkpoint**: US1 + US2 both work — the console reads live from edge-api.

---

## Phase 5: User Story 3 — Admin gate, role-claim based (Priority: P3)

**Goal**: an admin-only area gated in the UI **and** by the backend — `GET /admin/v1/admin-ping`
authorizing on the **role claim** (`hasAnyGroup('admin')`); manager/csa refused by the backend.

**Independent Test**: quickstart §US3 steps 9–11 (admin 200 / manager+csa 403 live, incl. forced
route). No DB.

- [x] T023 [P] [US3] edge-api admin handler (role-claim): `apis/edge-api/admin/src/functions/back-office-admin-ping-v1-get.ts` — `hasAnyGroup(['admin'])` else `forbidden`; 200 `{audience,scope:'admin',subject,message}`; reuse `lib/{claims,http}`. (contracts/admin-ping.contract.md — US3 interim)
- [x] T024 [US3] edge-api wiring: `apis/edge-api/admin/serverless.yml` — function `backOfficeAdminPingV1` → `httpApi GET /admin/v1/admin-ping`, authorizer referenced **by id from SSM** (`${ssm:/effy/${sls:stage}/edge/authorizer/back-office_id}` — A3, Terraform-owned gateway) + 3 alarms (Errors/Throttles/Duration-p95) matching `BackOfficePingV1*`. (contracts/admin-ping.contract.md D1)
- [x] T025 [P] [US3] edge-api handler test: `apis/edge-api/admin/src/functions/back-office-admin-ping.test.ts` — admin→200, manager→403, csa→403, role-less→403 (typed fake events).
- [x] T026 [P] [US3] docs: register `/admin/v1/admin-ping` in `docs/api/` (one line).
- [x] T027 [US3] Console admin area: `apps/back-office/src/features/staff-identity/AdminOnlyScreen.tsx` (calls `/admin/v1/admin-ping`; renders on 200; **access-denied state on 403**) + `requireGroup('admin')` in the admin route `beforeLoad` (hide nav for non-admin); role-aware nav from token `roles`. (plan mechanic 2; FR-006/006a; depends on T007/T016)
- [x] T028 [P] [US3] Console tests: role-aware nav (admin sees / manager hidden); AdminOnlyScreen renders on 200, access-denied on `forbidden`. (research E3)
- [ ] T029 [US3] 🧑‍💻 OPERATOR: `make edge-deploy SERVICE=admin ENV=dev`; run quickstart §US3 (admin 200 / manager+csa 403 live; forced-route denial).

**Checkpoint**: US1–US3 work — backend-authoritative role gating on the claim.

---

## Phase 6: User Story 4 — Platform-owned staff & RBAC records (Priority: P4)

**Goal**: the platform's own system of record — `admin.staff`/`role`/`staff_role`; JIT-upsert on
`GET /admin/v1/me`; **upgrade** the admin gate to authorize from the DB (status + role) so a
`disabled` staff row is refused despite a valid token; console graduates its identity read to `/me`.

**Independent Test**: quickstart §US4 steps 12–14 (record created once + no dup; disable → admin
403 despite valid token) + SC-011/SC-012.

- [x] T030 [US4] Migration (003 workflow): `make db-new NAME=back_office_staff_rbac`, author `db/migrations/<ts>_back_office_staff_rbac.sql` — `admin.staff` (uuid pk, `cognito_sub` unique, email, `status` check active/disabled, timestamps, last_seen_at), `admin.role` (seed `admin`/`manager`/`csa` idempotent), `admin.staff_role` (m:n, FKs). Forward-only. (staff-schema.contract.md; data-model §6; FR-021)
- [x] T031 [P] [US4] edge-api staff repository + types: `apis/edge-api/admin/src/staff/types.ts` (`StaffRecord` + explicit row mappers) + `src/staff/repository.ts` (raw SQL: `upsertOnContact` `INSERT … ON CONFLICT (cognito_sub) DO UPDATE` + role reconcile in one txn; `getRecord`; `authorizeAdmin` = status active AND role admin). (staff-schema.contract.md; FR-019/020/022)
- [x] T032 [US4] edge-api staff service: `apis/edge-api/admin/src/staff/service.ts` — JIT provisioning orchestration + `authorizeAdmin`. (depends on T031)
- [x] T033 [US4] edge-api `/me` handler: `apis/edge-api/admin/src/functions/back-office-me-v1-get.ts` (`preamble` → `staff.upsertOnContact(sub,email,groups)` → return `StaffRecord`; **admits role-less** → `roles:[]`) + `apis/edge-api/admin/serverless.yml` function `backOfficeMeV1` (`GET /admin/v1/me`, authorizer by SSM id `.../edge/authorizer/back-office_id` — A3) + 3 alarms. (contracts/back-office-me.contract.md; FR-005/019)
- [x] T034 [US4] Upgrade admin gate to DB: change `back-office-admin-ping-v1-get.ts` to call `staff.authorizeAdmin(sub)` (status + role) instead of `hasAnyGroup` — disabled/manager/csa/absent → `forbidden`. (contracts/admin-ping.contract.md — US4 end state; FR-020)
- [x] T035 [P] [US4] edge-api tests: `src/staff/repository.test.ts` (testcontainers PG — upsert idempotency incl. concurrent, role reconcile add/remove, `authorizeAdmin` true active-admin / false disabled-admin+manager+csa+absent); `/me` handler test (records+returns, role-less `roles:[]`); update admin-ping test (**disabled-admin → 403**). (research E3/F1)
- [x] T036 [US4] Console graduates identity read to `/me`: update `features/staff-identity/{repo.ts,model.ts,<screen>}` to `GET /admin/v1/me` → `StaffRecord` (incl. `status`); role-less shows the recorded no-roles state. (contracts/back-office-me.contract.md; decouple graduation)
- [x] T037 [P] [US4] docs: register `/admin/v1/me` in `docs/api/` (one line).
- [ ] T038 [US4] 🧑‍💻 OPERATOR: `make db-up ENV=dev` (**first real migration**; verify `make db-status`), then `make edge-deploy SERVICE=admin ENV=dev`; run quickstart §US4 (record created once/no dup; disable staff → admin 403 despite valid token; re-enable).

**Checkpoint**: US1–US4 work — RBAC decided from the platform record, independent of Cognito.

---

## Phase 7: User Story 5 — Shared foundation + conventions (Priority: P5)

**Goal**: the shared web foundation is documented as the SSOT; a newcomer can add a screen on the
first attempt; dark mode is on-brand across screens.

**Independent Test**: quickstart §US5 steps 15–18 (add-a-screen walkthrough conforms first try; no
`#0FB57E` duplication; shared packages imported not re-implemented) + SC-006/008/009.

- [x] T039 [P] [US5] `apps/back-office/README.md` — structure guide (features/lib/components-ui, router, server-state-only) + **add-a-screen walkthrough** (feature slice → route → query) + the client error-handling contract. (FR-016; SC-008)
- [x] T040 [P] [US5] Package docs: `packages/design-system/README.md` (brand tokens SSOT + dark-mode usage + the **component graduation rule** — research B3); `packages/shared-types/README.md` + `packages/api-client/README.md` stubs.
- [x] T041 [US5] Dark-mode toggle + theme wiring via `lib/ui-store`; verify sign-in + proving + admin screens legible and on-brand in **both** appearances. (FR-011; SC-006)
- [x] T042 [US5] Newcomer + no-duplication validation per quickstart §US5: add a throwaway screen via the walkthrough (then revert); confirm no hardcoded `#0FB57E` in `apps/back-office/src`; confirm `@effy/shared-types` + `@effy/api-client` are imported, not re-implemented. (SC-008/SC-009)

**Checkpoint**: all five stories independently functional.

---

## Phase 8: Polish & Cross-Cutting Concerns

- [x] T043 [P] Lint/typecheck/test: `pnpm turbo lint typecheck test` green across `apps/back-office` + `packages/*`; `make bo-build` + `make edge-test` green.
- [x] T044 [P] Secret + PII hygiene sweep (quickstart §hygiene, SC-007): `grep -ri "0FB57E\|Bearer\|password" apps/back-office/src` → brand only via design-system, no secret/token literal, no password; a network request sends the **access** token (not ID token); telemetry events are subject-only (no `email`/PII). (FR-014)
- [x] T045 Telemetry verification (FR-013): sign-in lifecycle + `admin_area_access_denied` events fire; missing PostHog key = no-op; no PII beyond subject.
- [ ] T046 Full quickstart pass: **SC-001…SC-013** verified + recorded (fresh-clone timing SC-001; disabled-staff denial SC-012; dashboard-shell SC-013 via Phase 9 / T058); update CLAUDE.md Active-feature status to implemented + open operator items. (constitution v1.4.0 already ratified — no amendment task here.)

---

## Phase 9: Amendment D1 — Default dashboard shell (US1 / FR-023)

**Goal**: the authenticated shell graduates from the bootstrap top-header frame to a **default
dashboard layout** built from the shadcn **`sidebar-07`** block — a persistent, collapsible sidebar
(brand + role-aware nav + user menu) + an inset header (trigger + breadcrumb) + the content region
the proving screens already render into. **Presentation-only**: reuses the existing session /
sign-out / role / theme wiring; **no** backend, migration, auth, contract, or DTO change.

**Independent Test**: quickstart §US1 steps 3 / 3a / 3b + step 15 (land in the dashboard layout;
collapse/expand cleanly in light **and** dark; role-aware nav; identity + sign-out in the sidebar
user menu). Maps to **SC-013** (and reinforces SC-006). No operator/live-cloud step.

- [x] T047 [P] [US1] Design-system sidebar tokens: add the `--sidebar*` CSS variables (`--sidebar`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-accent`, `--sidebar-border`, `--sidebar-ring`, light **and** dark) to `packages/design-system/src/tokens.css`, mapped to the Jade brand palette so the shadcn sidebar primitive themes **from the SSOT** (no block-default palette). (research G3; Principle V; FR-011)
- [x] T048 [US1] Install/adapt the `sidebar-07` block into `apps/back-office`: `pnpm dlx shadcn@latest add sidebar-07` (resolves via the app `components.json`/preset `b2BnwlLOK`) **or** copy the block source — lands the primitives in `apps/back-office/src/components/ui/` (`sidebar`, `sheet`, `separator`, `tooltip`, `skeleton`, `breadcrumb`, `dropdown-menu`, `avatar`, `collapsible`) + the `hooks/use-mobile` hook. Verify **no hardcoded brand hex** in the copied files; they resolve `--sidebar*` from T047. (research G2/G4; depends on T047)
- [x] T049 [P] [US1] Extend the UI store: add `sidebarOpen: boolean` + a toggle/set action to `apps/back-office/src/lib/ui-store.ts` (genuine client-UI state — drives a **controlled** `SidebarProvider`; **not** the block's default cookie; server data never here). (data-model §8; research G6; Principle V/VI)
- [x] T050 [P] [US1] Role-aware nav model: `apps/back-office/src/components/layout/nav.ts` — `NavItem { label; to; requiredRole? }` + the `NAV` list (`Dashboard`, `Admin`→`requiredRole:'admin'`) + a `visibleNav(roles)` filter that **reuses** `isAdmin`/the `requireGroup` predicate (mechanic 2) — nav reflects the authoritative gate, never a second source. (data-model §8; FR-006/FR-023)
- [x] T051 [US1] `NavUser` (sidebar footer): `apps/back-office/src/components/layout/NavUser.tsx` — dropdown showing the verified identity (email/subject from `sessionQuery`), **Sign out** (`useSignOut` → redirect `/auth/sign-in`), and the **theme toggle** (`toggleTheme`/`uiStore`) — the actions the old header held, relocated with the same wiring. (web contract §5; depends on T048/T049)
- [x] T052 [US1] `NavMain`: `apps/back-office/src/components/layout/NavMain.tsx` — renders `visibleNav(roles)` as sidebar nav links with router active state (Admin item hidden for manager/csa/role-less). (web contract §5; depends on T048/T050)
- [x] T053 [US1] `AppSidebar`: `apps/back-office/src/components/layout/AppSidebar.tsx` — `SidebarHeader` with a single **Effy Back-Office** brand mark (no team switcher — single-brand platform), `NavMain`, `SidebarFooter` with `NavUser`. (research G5; depends on T051/T052)
- [x] T054 [US1] `AppHeader`: `apps/back-office/src/components/layout/AppHeader.tsx` — the `SidebarInset` header: `SidebarTrigger` (collapse/expand) + a **breadcrumb** derived from the active route (Dashboard / Admin). (web contract §5; depends on T048)
- [x] T055 [US1] Rewire the protected shell: rewrite `AppShell` in `apps/back-office/src/routes/app.tsx` to `SidebarProvider(open←uiStore.sidebarOpen) → AppSidebar + SidebarInset(AppHeader + main><Outlet/>)`; delete the old top-header nav (identity/sign-out/theme now in `NavUser`). `DashboardScreen` index content unchanged — it renders in the content region. (plan mechanic 4 / Amendment D1; depends on T049/T053/T054)
- [x] T056 [P] [US1] Shell tests: `apps/back-office/src/components/layout/*.test.tsx` — shell renders sidebar + inset header + content `Outlet`; **role-aware `NavMain`** shows Admin for an admin and hides it for manager/csa/role-less (reuse the existing role-gate fixtures); `NavUser` exposes sign-out + theme toggle wired to the existing mutation/store; toggling collapse flips `uiStore.sidebarOpen`. (plan Amendment D1 testing; SC-013)
- [x] T057 [P] [US1] Docs + hygiene: note in `apps/back-office/README.md` that dashboard chrome lives in `components/layout/` (app shell, not a feature slice) and how nav items/role-gating are added; confirm the SC-007 grep (`0FB57E`) still finds **no** hardcoded brand in the new `components/ui/` sidebar files or `components/layout/`. (FR-016/FR-014)
- [x] T058 [US1] Dashboard-shell validation (SC-013 / SC-006): the shell's rendering + behavior is **visually verified** via a seeded-session screenshot harness (light/dark × admin/manager × expanded/collapsed) — dashboard layout (sidebar + inset trigger/breadcrumb header + content region) ✅; collapse → icon rail with content reflow ✅; **role-aware nav** (admin sees Dashboard+Admin, manager sees only Dashboard) ✅; identity in the sidebar footer ✅; on-brand jade in **both** light and dark ✅. **Remaining for T046 (live):** arriving via a real OTP sign-in (SC-002) + the live proving reads/denials (SC-003/004/012) — needs the operator cloud steps. quickstart §US1 steps 3a/3b/15 confirmed; step 3 (OTP arrival) folds into T046.

**Checkpoint**: the authenticated console lands in the sidebar-07 dashboard layout; US1–US5 still
pass; `make bo-test`/`bo-lint`/`bo-build` green.

---

## Phase 10: Amendment D2 — Neutral theme + responsive scaling (FR-024/FR-025)

**Goal**: **(D2-a)** drop the green-tinted surfaces — rebase the design-system surface tokens onto the
neutral scale (shadcn `sidebar-07` neutral base), keeping **Jade `#0FB57E` as the single accent**; and
**(D2-b)** scale the whole rem-based UI proportionally on wide displays via a root-font-size `clamp()`.
Both edited **once** in `@effy/design-system` → every surface (sign-in + shell + all shadcn primitives)
re-themes/re-scales with **zero** component edits.

**Independent Test**: quickstart §Amendment D2 steps 14a/14b + step 15 — neutral surfaces + emerald-only
accent in light **and** dark (SC-014); proportional scaling at laptop/wide/ultrawide with no overflow
(SC-015). **Presentation-only, no operator/live-cloud step.** Governance: **no constitution amendment**
(`#0FB57E` retained as the emerald accent; surfaces merely neutralised — plan § Amendment D2 Governance).

- [x] T059 [P] [US5] Neutral surface tokens (D2-a): in `packages/design-system/src/tokens.css`, rebase every **surface** token (light `:root` + `.dark`) onto the neutral scale per the research **Part H** table — `--background`/`--foreground`/`--card`/`--popover`(+`-foreground`), `--secondary`, `--muted`(+`-foreground`), `--accent`(+`-foreground`, the hover), `--border`, `--input`, and **all `--sidebar*` surfaces** → neutral greys (light `#ffffff`/`#fafafa`/`#f5f5f5`/`#e5e5e5`/`#737373`/`#0a0a0a`; dark `#0a0a0a`/`#171717`/`#262626`/`#a1a1a1`/`#fafafa`). **Keep** `--primary`/`--ring`/`--sidebar-primary` = Jade `#0FB57E` and `--primary-foreground`/`--sidebar-primary-foreground`. Delete the green-tinted values (`#e6f7f0`/`#063a2b`/`#f4f8f6`/`#111815`/`#047857`/`#6ee7b7`/greenish `#f1f5f3`/`#1a2420`/`#e2e8e5`/`#24312b`). Update the file header comment (surfaces neutral; `#0FB57E` the single accent). (FR-024; research H3/H4)
- [x] ~~T060~~ [P] [US5] Root-font-size scaling (D2-b): ~~add a **sibling** `packages/design-system/src/scale.css` (distinct file, so parallel-safe with T059) `@import`ed by `tokens.css` (or the app entry `styles.css`) — `:root { font-size: clamp(1rem, <rem + vw>, ~1.375rem) }`, **rem-anchored** (WCAG zoom-safe — research I2), tuned so it equals the 16px baseline up to ~1536px and scales up above it, capped for ultrawide; baseline (laptop) unchanged.~~ **⚠ REVERTED 2026-07-15** — `scale.css` and its export were removed platform-wide; sizing is now the shadcn/Tailwind default. (was FR-025, superseded)
- [x] ~~T061~~ [US5] Content max-width cap (D2-b): ~~add a large centered `max-width` utility to the content wrapper (now `ConsoleShell`'s default `contentClassName`) so ultrawide viewports don't stretch line lengths.~~ **⚠ REVERTED 2026-07-15** — the `max-w-[1800px]` cap was removed; content is full-width (shadcn default). (was FR-025, superseded)
- [x] T062 [P] [US5] Guard test + docs: add a cheap check (e.g. `packages/design-system/src/tokens.test.ts` or extend the hygiene grep) asserting `tokens.css` contains **no** green-tinted surface hex (the old blends), mirroring the SC-007 grep; update `packages/design-system/README.md` — brand is the **single accent** on **neutral surfaces**, plus the root-scaling rule + rationale. (SC-014; FR-016)
- [x] T063 [US5] D2 visual verification (SC-014/SC-015) per `specs/005-back-office-web/quickstart.md` §Amendment D2 (steps 14a/14b + 15): via the seeded-session screenshot harness — capture sign-in + shell in light/dark → confirm **neutral surfaces + emerald-only accent, zero green blends** (SC-014); capture at laptop / wide (≥1536px) / ultrawide (~2560px) → confirm **proportional scaling with zero overflow/clipping**, laptop baseline unchanged (SC-015). Folds into the T046/T058 sign-off.

**Checkpoint**: no green-tinted surfaces anywhere (sign-in + shell, light + dark); UI scales up on wide
screens; `make bo-test`/`bo-lint`/`bo-build` green; SC-007 brand-hygiene grep still clean.

---

## Dependencies & Execution Order

### Phase dependencies
- **Setup (P1)** → no deps.
- **Foundational (P2)** → after Setup; **blocks all stories**.
- **US1 (P3)** → after Foundational. **MVP.**
- **US2 (P4)** → after Foundational (uses the existing `/ping`; independent of US1 code, but US1 gives the shell to render it in).
- **US3 (P5)** → after Foundational; independent of US4 (role-claim gate).
- **US4 (P6)** → after US3 (upgrades US3's admin gate + graduates US2's read). The one **intra-story dependency** by design (the decouple makes it an *upgrade*, not a prerequisite).
- **US5 (P7)** → after the surfaces it documents exist (US1–US4).
- **Polish (P8)** → last of the original slice.
- **Amendment D1 (P9)** → US1 presentation delta; depends only on the implemented Foundational
  `lib/ui-store` + design-system + the auth/role features (US1/US3 role logic it reuses).
  Independent of the edge-api/DB stories (US2/US4) — **no** backend/deploy step. Land before the
  T046 full sign-off so SC-013 is covered.
- **Amendment D2 (P10)** → design-system presentation delta (theme + scaling); depends only on the
  implemented `design-system` tokens + the shell (P9) it re-themes/re-scales. Independent of all
  backend/DB work — **no** operator/deploy step. Land before the T046/T058 sign-off so SC-014/SC-015
  are covered.

### Critical path (MVP → full)
Setup → Foundational → **US1 (MVP)** → US2 → US3 → US4 → US5 → Polish → **Amendment D1 (shell)** →
**Amendment D2 (theme + scaling)**.

### Within a story
Model → repo → queries → screen/route → tests. edge-api: repository → service → handler → serverless wiring → tests. Operator deploy/migration steps run **after** their story's code is green.

---

## Parallel Opportunities

- **Setup**: T003, T004 in parallel (after T001→T002).
- **Foundational**: T005, T006, T008, T009, T010 in parallel; T007 after T006; T011 after T008/T009.
- **US1**: T012 ∥ T017-authoring; T013→T014→T016 sequential (shared session); T015 ∥ after T014.
- **US2**: T019 ∥ T021 (T018 CORS is independent; T020 after T019; T022 operator last).
- **US3**: T023 ∥ T025 ∥ T026; T024 after T023; T027 ∥ T028 (web) parallel to the edge tasks; T029 operator last.
- **US4**: T031 ∥ T035-authoring ∥ T037; T030 (migration) first; T032→T033→T034 sequential (staff domain); T036 (web) parallel to edge; T038 operator last.
- **US5**: T039 ∥ T040; T041, T042 after.
- **Polish**: T043 ∥ T044.
- **Amendment D1 (P9)**: T047 first (tokens) → T048 (install block); then T049 ∥ T050 (store ∥ nav model); T051 ∥ T052 (NavUser ∥ NavMain) after their deps; T053 (AppSidebar) after T051/T052; T054 (AppHeader) ∥ T053; T055 (rewire) after T053/T054; T056 ∥ T057 (tests ∥ docs/hygiene) after T055; T058 validation last.
- **Amendment D2 (P10)**: T059 (neutral `tokens.css`) ∥ T060 (`scale.css`, sibling) ∥ T061 (content max-width in `app.tsx`) — three distinct files; T062 (guard test + README) after T059; T063 visual verification last.

### Parallel example — Foundational
```bash
Task: "T005 design-system tokens in packages/design-system/src/tokens.css"
Task: "T006 shared-types in packages/shared-types/src/{problem,back-office}.ts"
Task: "T008 lib/amplify.ts + lib/auth-session.ts in apps/back-office/src/lib/"
Task: "T009 lib/query-client.ts + lib/ui-store.ts in apps/back-office/src/lib/"
Task: "T010 lib/telemetry.ts in apps/back-office/src/lib/"
```

---

## Implementation Strategy

### MVP first (US1 only)
Setup → Foundational → US1 → **stop & validate** (quickstart §US1). A signable-in, session-guarded
console shell is a demoable MVP with zero backend changes.

### Incremental delivery
US2 (live read + CORS) → US3 (role-claim admin gate) → US4 (platform RBAC record + status gate) →
US5 (docs/foundation). Each adds value without breaking the prior; each has an operator checkpoint
where relevant.

### Amendment D1 (dashboard shell) — a self-contained US1 presentation increment
Phases 1–8 already shipped. Amendment D1 (Phase 9, T047–T058) is a **local, code-only** increment:
tokens → install `sidebar-07` → adapt into `components/layout/` (role-aware nav, NavUser, header) →
rewire `routes/app.tsx` → tests → validate SC-013. **No operator/live-cloud step** (unlike US2/US4).
Deliver and validate it independently, then include SC-013 in the T046 sign-off.

### Amendment D2 (neutral theme + scaling) — a near-single-file design-system increment
Amendment D2 (Phase 10, T059–T063) is the smallest increment: **rebase surface tokens to neutral +
add the root-font-size scale**, both in `@effy/design-system` (one file each), + one `max-width` class
in `app.tsx`. Because every surface consumes the tokens, the sign-in screen and the whole shell
re-theme and re-scale with **zero** component edits. **No operator/live-cloud step.** Deliver after
Phase 9 (it re-themes the shell) and validate SC-014/SC-015 in the same T046/T058 visual sign-off.

### Operator touchpoints (🧑‍💻 — nothing else touches live cloud)
- T022: edge-deploy (admin routes) — enables US2. (CORS origin already live at the Terraform gateway, A3.)
- T029: edge-deploy (admin-ping) — enables US3.
- T038: **db-up (first real migration)** + edge-deploy (/me + DB gate) — enables US4.
- T046: full SC sign-off.

---

## Notes
- `[P]` = different files, no incomplete deps. `[US#]` = traceability to spec stories.
- Tests fail before implementation where practical (auth state machine, staff repo).
- edge-api graduates to **per-domain folders** when the `staff` domain lands (research F5) — move the existing `platform-status` files if convenient, or document.
- Constitution amendment (v1.4.0: TanStack Store / Zustand removed) is **already ratified** — not a task here. The 004 Node-22 tick (T046 there) is separate.
- Commit after each task or logical group; stop at any checkpoint to validate a story independently.
