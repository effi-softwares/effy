# Implementation Plan: Shop Web Foundation (Bootstrap)

**Branch**: `main` (no feature branch; spec dir `007-shop-web`) | **Date**: 2026-07-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/007-shop-web/spec.md`

## Summary

Bootstrap the platform's **second web surface** — the store operator console (`apps/shop-web`) —
on the same stack as the back-office console, authenticating against the **shop** Cognito pool,
with a store role model the platform does not have yet.

The technical approach, in one breath: **amend the constitution** (a second pool gains RBAC
groups → v1.5.0), **give the shop pool two groups** (`store_manager` / `store_staff`) and add the
new dev origin to the shared gateway's CORS in one Terraform apply, **create the platform's first
`public`-schema tables** (`store`, `store_staff`, `store_role`, `store_staff_role`) via the 003
forward-only workflow, **extend the existing `store` edge service** with a record-backed
`/store/v1/me` and a DB-gated `/store/v1/manager-ping` (gate = role AND status AND store scope),
**extract the audience-neutral half of the back-office console into shared packages**
(`@effy/design-system/ui` + a new `@effy/web-kit`) so the second surface consumes rather than
copies it, then **build `shop-web`** on that foundation and record the store audience's
**parity register** against `shop-mobile`.

The extraction (research R5) is the largest single cost and the whole point: this slice is the
first test of whether the shared web foundation is genuinely reusable or merely back-office-shaped.

## Technical Context

**Language/Version**: TypeScript ~5.9.2 (web + cold path); Node 22 (Lambda runtime); SQL (PostgreSQL 16); HCL (Terraform)

**Primary Dependencies**: React 19 · Vite 7 · TanStack Router/Query/Store/Form/Table/Virtual/DevTools/Hotkeys · shadcn/ui (new-york, Radix base) + Tailwind v4 · AWS Amplify v6 (Cognito, EMAIL_OTP) · PostHog · `pg` + `pino` (edge) · Serverless Framework 3.40 + esbuild · Goose

**Storage**: PostgreSQL 16, raw SQL via `pg`, no ORM. New tables in the `public` (customer-operational) schema — the platform's first.

**Testing**: Vitest 3 + jsdom + Testing Library (`shop-web`, `web-kit`, `back-office`); Vitest node (`@effy/edge-store`). Cross-pool isolation and live RBAC are **operator-run** (`curl` + real tokens), not unit-testable — see research R9.

**Target Platform**: Browser SPA (local dev only this slice, `http://localhost:5174`); AWS Lambda arm64 behind the shared HTTP API for the backend.

**Project Type**: Web application — SPA client + cold-path serverless service + DB migration + Terraform + one governance amendment.

**Performance Goals**: None quantified beyond the spec's UX bars (sign-in under 2 minutes, SC-002). The cold path is *allowed* to be slow on first wake (spec edge case); the console renders a degraded state rather than optimizing it away.

**Constraints**: No new backend npm dependency. No hosted deploy (FR-001). No product store-operations features (FR-025). No store-management interface (FR-019). Back-office's 20 tests must stay green through the extraction. The local origin must be an *approved* origin — a Terraform change, not a code change.

**Scale/Scope**: 1 new app (~25 files), 1 new shared package, 1 grown shared package, 2 new endpoints, 4 new tables, 2 Cognito groups, 1 constitution amendment, 1 parity register. Roughly the size of 005 plus the extraction.

## Constitution Check

*GATE: evaluated against constitution v1.4.0 before Phase 0, re-evaluated after Phase 1 design.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-Driven Development** | ✅ PASS | `spec.md` + `plan.md` land together; `tasks.md` follows. Research R5 found the spec's "no new shared packages" assumption to be false and **corrects the spec** rather than routing around it — exactly as Principle I directs. |
| **II. Monorepo with Shared Contracts** | ✅ PASS (and it is the slice's core work) | Zero copy-paste of cross-cutting logic: the reusable half of the back-office console is extracted to `@effy/design-system/ui` + `@effy/web-kit` **before** the second surface is built (R5). Store DTOs are added to `@effy/shared-types` and both sides type from them. |
| **III. Dual-Path Backend Discipline** | ✅ PASS | **Path: edge — rule 2** (an internal operator console; latency-tolerant, low-frequency, cold starts acceptable). **Service: store —** the store/operator domain behind the shop pool's authorizer. This line is required verbatim by `docs/api/path-assignment.md`. |
| **IV. Auth Isolation** | ⚠️ **CONDITIONAL → resolved by amendment** | The slice *strengthens* isolation: SC-004 proves it in both directions for the first time; there is no auth proxy; a shop token is structurally rejected by the admin service and vice versa. **But** Principle IV names RBAC groups on the admin pool only, and this slice puts groups on the shop pool. Resolved by **constitution v1.5.0**, authored as the slice's first task (*Amendment A* below). Not a deviation — an amendment, per Governance. |
| **V. Native-Feel, Consistent Design** | ✅ PASS | `shop-web` defines **no theme of its own** (FR-013, SC-007): brand, dark mode, neutral surfaces + single accent, and `scale.css` are inherited from `@effy/design-system`. Token files are not touched, so 005's D2 visual sign-off stands. The shadcn primitives move *into* the design system — Principle V's "one design-system package drives every surface", made literal. |
| **VI. Layered Architecture & Explicit Wiring** | ✅ PASS | Backend: handler → service → repository, raw SQL, explicit row→domain mapping (`store/src/staff/`), structurally identical to `admin/src/staff/`. Client: feature-sliced (`repo.ts` → `queries.ts` → `<Screen>.tsx`), server-state cache authoritative, TanStack Store for client state only. No DI framework: wiring is by hand at `main.tsx` and by cached module singletons in Lambda. |
| **VII. Observability & Telemetry** | ✅ PASS | Declared in research R8: 7 typed PostHog events carrying a `surface: "shop-web"` property and no PII beyond `subject`; 3 new per-function CloudWatch alarms (`Errors>0` ×2, `Duration p95` on `/me`). No alerting on the console itself — it is local-only, so nothing hosted exists to alert on. |

### Amendment A — constitution v1.5.0 (MINOR)

Required by Principle IV, above. Authored in this slice, **before** the Terraform change lands.

- **What changes**: Principle IV's RBAC sentence generalizes from "the admin pool defines groups"
  to "pools MAY define groups", enumerating admin (`admin`/`manager`/`csa`) and store
  (`store_manager`/`store_staff`), with customer and driver defining none, and restating that the
  claim is the *origin* of role assignment while the platform record is *authoritative for the
  access decision*.
- **Why MINOR**: material expansion of guidance; no principle removed or redefined; no existing
  plan invalidated (no shipped surface relies on the old sentence's exclusivity).
- **Sync Impact Report** must note that `CLAUDE.md`'s Auth section — which repeats "the admin pool
  defines RBAC groups" — is updated in the same change.

Exact proposed wording is in [research.md](./research.md) R2.

### Post-design re-evaluation (after Phase 1)

Re-checked against the generated `data-model.md` and `contracts/`. **All gates hold.** Two notes:

- **Principle IV** remains conditional on Amendment A landing first. The phase ordering enforces
  this (governance → infra), so the infra change cannot merge ahead of the amendment.
- **Principle II** got *stronger* under design: `@effy/api-client` needed **no change at all** to
  serve a second audience. That is the cleanest available evidence for SC-009.

## Project Structure

### Documentation (this feature)

```text
specs/007-shop-web/
├── plan.md                  # This file
├── spec.md                  # (its "no new shared packages" assumption is corrected by R5)
├── operator-directives.md   # plan-phase input from the feature description
├── research.md              # Phase 0 output — R1..R9
├── data-model.md            # Phase 1 output
├── quickstart.md            # Phase 1 output — operator runbook + SC verification
├── contracts/               # Phase 1 output
│   ├── store-me.contract.md
│   ├── store-manager-ping.contract.md
│   ├── store-schema.contract.md
│   ├── shop-web.contract.md
│   ├── config.contract.md
│   └── cross-pool-isolation.contract.md
├── checklists/requirements.md
└── tasks.md                 # Phase 2 output (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
.specify/memory/constitution.md      # AMENDED → v1.5.0 (Amendment A)
CLAUDE.md                            # reconciled: store-web → shop-web; Auth RBAC sentence

infra/envs/dev/
├── auth-shop.tf                     # + groups = [store_manager, store_staff]
└── edge-gateway.tf                  # + "http://localhost:5174" in cors allow_origins

db/migrations/
└── <ts>_store_staff_rbac.sql        # NEW — public.store / store_staff / store_role / store_staff_role
db/seeds/
└── dev-store.sql                    # NEW — operator-seeded dev store

apis/edge-api/store/
├── serverless.yml                   # + storeMeV1, storeManagerPingV1 (+3 alarms)
└── src/
    ├── functions/
    │   ├── store-me-v1-get.ts               # NEW
    │   ├── store-manager-ping-v1-get.ts     # NEW
    │   ├── store-ping-v1-get.ts             # unchanged (004 token echo)
    │   ├── health-get.ts, platform-status-v{1,2}-get.ts
    │   └── *.test.ts
    ├── staff/                       # NEW three-layer domain (twin of admin/src/staff/)
    │   └── types.ts  repository.ts  service.ts  repository.test.ts
    └── status/                      # MOVED from src/ root (flat → nested; two domains now)
        └── types.ts  repository.ts  service.ts  service.test.ts

packages/
├── design-system/                   # GROWS
│   └── src/{tokens.css, scale.css, cn.ts, index.ts,
│            ui/*.tsx,               # ← moved from apps/back-office/src/components/ui/
│            hooks/use-mobile.ts}    # exports: ".", "./ui", "./tokens.css", "./scale.css"
├── shared-types/                    # GROWS
│   └── src/{problem.ts, back-office.ts, store.ts ← NEW, index.ts}
├── api-client/                      # UNCHANGED (already audience-neutral — SC-009 evidence)
└── web-kit/                         # NEW
    └── src/
        ├── runtime/{config,amplify,auth-session,query-client,telemetry,ui-store}.ts
        ├── auth/{otp.ts, guards.ts}
        └── console/{ConsoleShell,ConsoleSidebar,ConsoleHeader,ConsoleUserMenu,
                     NavList,OtpSignInCard,ErrorState}.tsx
                                     # exports: "." (runtime + auth), "./console" (SPA chrome)

apps/
├── back-office/                     # REFACTORED to consume the packages; 20/20 tests stay green
└── shop-web/                        # NEW — @effy/shop-web, vite :5174
    ├── package.json vite.config.ts tsconfig.json index.html components.json
    ├── .env.example vitest.setup.ts README.md
    └── src/
        ├── main.tsx router.tsx styles.css
        ├── routes/{__root,app,auth}.tsx
        ├── lib/{env,api,telemetry,ui-store}.ts      # thin wiring over web-kit
        ├── components/layout/nav.ts                 # store nav config (role-gated)
        └── features/
            ├── auth/{repo,queries,model,SignInScreen}.ts(x)
            └── store-identity/{repo,queries,ProvingScreen,ManagerOnlyScreen}.ts(x)

docs/audiences/
└── store-capabilities.md            # NEW — the parity register (FR-023a), single source; linked
                                     #   from apps/shop-web/README.md AND apps/shop-mobile/README.md

Makefile                             # + shop-dev, shop-build, shop-lint, shop-test,
                                     #   shop-seed-store, shop-provision-staff
```

**Structure Decision**: the client surface is `apps/shop-web` (package `@effy/shop-web`), pairing
with `apps/shop-mobile` — the two halves of the store audience that the parity register binds. The
backend keeps its deployed name (`apis/edge-api/store`, routes `/store/v1/...`). See research R1
for the full reasoning; the rule is stated once below and not re-derived elsewhere.

### Terminology (stated once)

**Client surfaces are `shop-*`. The backend service and its paths are `store`. The pool and its
authorizer are `shop`. The audience, in prose, is "store".** All four names already exist in the
repo; this slice adds no new one, and reconciles CLAUDE.md's lone `store-web` outlier.

## Implementation Phases

Ordered by dependency. Phases 1–3 gate everything (governance → infra → data); 4 and 5 are
independent of each other; 6 needs both.

| # | Phase | Delivers | Operator step? |
|---|---|---|---|
| 1 | **Governance** | Constitution v1.5.0 (Amendment A); CLAUDE.md reconciled | no |
| 2 | **Infra** | Shop pool groups; gateway CORS `:5174` | ✋ `make apply ENV=dev` |
| 3 | **Data** | Migration (4 tables) + `db/seeds/dev-store.sql` | ✋ commit, then `make db-up ENV=dev` |
| 4 | **Backend** | `store` service: `staff/` domain, `/store/v1/me`, `/store/v1/manager-ping`, alarms, unit tests | ✋ `make edge-deploy SERVICE=store ENV=dev` |
| 5 | **Shared foundation** | `@effy/design-system/ui`; new `@effy/web-kit`; **back-office refactored, 20/20 green** | no |
| 6 | **Shop console** | `apps/shop-web` — auth, shell, proving + manager-only screens, telemetry, config | no |
| 7 | **Parity + docs** | `docs/audiences/store-capabilities.md`; READMEs; contracts | no |
| 8 | **Verification** | SC-001…SC-016 sign-off | ✋ live: OTP sign-in, both-direction isolation curl, disabled/unassigned denials |

**Phase 5 gate (non-negotiable)**: every extraction task ends with `make bo-lint bo-test bo-build`
green and the `theme-tokens` guard passing. An extraction that reddens the back-office gets
reverted, not patched forward.

## Complexity Tracking

> Recorded because each item expands scope beyond the simplest reading of the spec. None is an
> undocumented deviation: each was either operator-chosen at `/speckit-specify` or is forced by a
> constitution principle.

| Deviation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **New shared package `@effy/web-kit`** — contradicts the spec assumption *"No new shared packages are assumed necessary"* | FR-012 + SC-009 demand **zero** surface-local re-implementation. The config loader, Amplify wiring, EMAIL_OTP flow, session/guard, query-client, telemetry, ui-store, console shell, and sign-in card are all audience-neutral but live inside `apps/back-office`. Building `shop-web` without extracting them means copy-pasting cross-cutting logic — flatly prohibited by Principle II. | *Grow `@effy/api-client` instead*: drags React, TanStack, and Amplify into a dependency-light fetch/DTO package that non-React consumers import. *Copy the files*: fails SC-009 and Principle II by construction. The spec's assumption was a pre-inspection guess; Principle I requires correcting it upstream, which this plan does. |
| **Constitution amendment v1.5.0** (a second pool gains RBAC groups) | The operator's Q1 answer mirrors the back-office pattern, which requires Cognito groups on the shop pool. Principle IV currently names groups on the admin pool only, so its text would become false. | *Platform-only roles* (no pool groups) needs no amendment and was the alternative offered at `/speckit-specify` Q1 — explicitly rejected by the operator. *Ship the groups and say nothing*: an undocumented deviation, which the Quality Gates define as a defect. |
| **A store entity in the `public` schema** — the platform's first customer-operational table, in a slice whose FR-025 forbids product features | FR-019/FR-021: store-scoped authorization is meaningless without a store to scope to. The operator chose this at Q2. Bounded hard by FR-025: identity, code, name, active flag — no address, hours, capacity, zones, or inventory, and no management interface. | *Staff-only, no store entity* was the alternative at Q2 — rejected by the operator; it would have made "store scope" a phrase with nothing behind it. *Put the tables in `admin`*: conflates two audiences' identity systems inside the schema designated for back-office accounts + audit. |
| **Nullable `store_staff.email`** | The shop pool uses email-as-username, so a Cognito **access token may carry no `email` claim** (research R6). Rather than guess Cognito's semantics inside a migration, email is operator-authoritative at provisioning and opportunistically refreshed from the token. | *Assume `username` is the email* — which is what 005 does, and which likely stores a UUID in `admin.staff.email` today (flagged as a 005 defect in R6). *Call `AdminGetUser` on first contact*: adds IAM and a network hop to the auth path for a value provisioning already knows. |
| **Restructuring `store/src/` from flat to nested domains** | The service gains a second domain (staff alongside status). The admin service already uses the nested form; matching it makes the two structurally identical (Principle VI). | *Nest only staff and leave status flat*: two layouts in one service, and the next reader has to ask why. A mechanical move is cheaper than a permanent inconsistency. |

## Notes carried forward

- **A defect in 005 was surfaced, not fixed here** (research R6): `/admin/v1/me` resolves email as
  `claim("username") ?? sub`, which for an email-as-username pool likely writes a UUID into
  `admin.staff.email`. It belongs to a 005 reconciliation; this slice deliberately does not
  inherit the pattern.
- **SC-004 (cross-pool isolation) and SC-005a (store-scope denial) are operator-verified**, not
  unit-tested — enforcement is structural (gateway authorizers) and relational (a SQL join).
  Asserting them in vitest would prove nothing. Both are scripted in `quickstart.md`.
- `make db-up` is guarded on committed migrations (`Makefile:119-125`), so Phase 3's migration must
  be committed before the operator can apply it.
