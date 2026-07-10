# Implementation Plan: Shop Naming Unification

**Branch**: `008-shop-naming-unification` (not created — repo is on `main`) | **Date**: 2026-07-10 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/008-shop-naming-unification/spec.md`

## Summary

Retire **store** as a name for the third audience. The word survives only in four excluded senses
(TanStack Store, "storefront", AWS "Parameter Store", the English verb).

The technical approach is a **pure rename with zero behaviour change**, executed as one atomic commit
across the monorepo, bracketed by two operator-run cloud steps. The work divides into six mechanical
surfaces — the cold-path service, the database, the shared types, the console, the infrastructure, and
the documents — plus one new **guard** that makes the "one name" rule enforceable at `make lint` time
instead of by human vigilance.

The decisive finding from Phase 0 research is that **nothing this rename touches has been applied to
any environment yet**. The four `store*` tables are defined in a committed migration that is still
`Pending` (verified live — the three earlier migrations *are* applied, but this one is not). The two
Cognito groups are declared in Terraform but not applied, and the shop pool currently has zero groups
and zero users (verified live). The 007 routes are written but not deployed (007 T041 open).
This collapses what would be a data-and-identity migration into a set of file edits — but the collapse
is **conditional**, so the plan gates on three operator prechecks and carries a documented fallback for
each. The one genuinely live artifact is the `effy-edge-store-dev` CloudFormation stack from 004,
which must be explicitly retired.

## Technical Context

**Language/Version**: TypeScript 5.9 on Node 22 (cold path, Lambda arm64); React 19 (console); SQL
(PostgreSQL 16 via Goose); HCL (Terraform); Bash (verification scripts). Go 1.25 (`apis/core-api`) is
**untouched** — it contains no reference to the retired name.

**Primary Dependencies**: Serverless Framework 3.40.0 (pinned, frozen v3); `@effy/edge-shared`; pg;
aws-jwt-verify; the TanStack suite; Vitest 3; pnpm + Turborepo.

**Storage**: PostgreSQL 16, `public` schema. Four tables renamed (`store`, `store_staff`, `store_role`,
`store_staff_role`), plus their columns, constraints, indexes, comments, and two seeded role keys.

**Testing**: Vitest — **159 tests** across six packages (edge-shared 26, edge-admin 7, edge-store 39,
web-kit 38, back-office 20, shop-web 29). The count is a hard invariant (SC-003). Plus `terraform
validate` + `fmt`, `tsc --noEmit` workspace-wide, shellcheck, and the three operator verification
scripts.

**Target Platform**: AWS `ap-southeast-1`, `dev` environment. Console runs locally on `:5174`.

**Project Type**: Monorepo-wide cross-cutting rename. Not a feature; a refactor with a governance
amendment attached.

**Performance Goals**: N/A. Zero runtime behaviour change is the requirement, not a performance target.

**Constraints**: No Cognito pool, app client, SSM contract, or provisioned account may be replaced
(FR-016). Test count MUST NOT decrease (FR-020). Exactly one deployment unit at the end (FR-018,
SC-006). The token's group claim and the persisted role key must be byte-identical (SC-007).

**Scale/Scope**: ~1424 raw case-insensitive hits for `store`. The rename set (the spec's "Bucket A") is
~60 files, 12 path renames, 4 tables, 2 Cognito groups, 6 route paths, 11 exported type/function
symbols, 1 workspace package name, 1 telemetry event, and prose across the constitution, the brief,
`ARCHITECTURE.md`, `CLAUDE.md`, `docs/`, and specs 001/004/005/007.

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1. Constitution v1.5.0 → amended to v1.6.0 by
this feature.*

| Principle | Verdict | Evidence |
|---|---|---|
| **I. Spec-Driven Development** | **PASS** | `spec.md` committed before this plan; `tasks.md` follows. This feature *is* the Principle I remedy — a naming contradiction found downstream is being fixed by returning to the earliest affected artifacts (the constitution, then the specs), not patched silently in code. |
| **II. Monorepo with Shared Contracts** | **PASS — strengthened** | `@effy/shared-types` stays the single source of the role union and DTOs; the rename is one atomic edit all consumers pick up. `@effy/api-client` needs no change (it contains zero `store` references), confirming the shared foundation was already audience-neutral. |
| **III. Dual-Path Backend Discipline** | **PASS** | Cold path only, and the path assignment is **unchanged**. `apis/edge-api/store` → `apis/edge-api/shop` remains low-frequency operator CRUD on Lambda, exactly where Principle III puts it. The hot path is not touched. No latency-sensitive customer traffic is involved. |
| **IV. Auth Isolation** | **PASS — with an amendment** | Four pools, per-pool JWT validation, no auth proxy, cross-pool rejection: all unchanged and re-proven by `make shop-verify-isolation`. What changes is the **names** of two RBAC groups (`store_manager`/`store_staff` → `shop_manager`/`shop_staff`) and the constitution text that declares them. FR-017's ordering constraint guarantees no token bearing a retired group value is ever relied upon. Requires constitution **v1.6.0**. |
| **V. Native-Feel, Consistent Design** | **PASS** | No design token, no component, no color, no layout changes. Only user-visible copy strings ("Store management" → "Shop management") and one nav label. |
| **VI. Layered Architecture & Explicit Wiring** | **PASS** | No layer moves. `functions/` → `staff/service.ts` → `staff/repository.ts` survives the directory rename intact. Raw SQL stays raw SQL; the repository still maps rows to domain models; wiring stays explicit and greppable — and becomes *more* greppable, which is the point. |
| **VII. Observability & Telemetry** | **PASS** | One analytics event renamed (`shop_store_assignment_missing` → `shop_assignment_missing`); six CloudWatch alarm names follow the service rename. **No new events, metrics, or alerts are introduced**, so Principle VII's "a plan that adds a user-facing flow MUST state its telemetry" clause is satisfied vacuously — this plan adds no flow. No PII change; the taxonomy stays subject-id-only. |

**Gate result: PASS.** One justified deviation is recorded in Complexity Tracking.

### Amendment A — Constitution v1.6.0 (MINOR)

Principle IV currently reads *"four isolated Cognito pools: customer, driver, **store**, admin"* and
*"the **store** pool defines `store_manager` / `store_staff`"*. The preamble reads *"**stores** are hidden
internal fulfillment nodes"*. All become "shop".

**Why MINOR, not PATCH or MAJOR.** Per the Governance versioning policy: no principle is added or
removed, and none is redefined in a way that invalidates an existing plan (so MAJOR is wrong). But this
is not a wording refinement either — `shop_manager` is a **normative value** that tokens assert and code
compares against, so changing it is a material change of guidance (so PATCH is wrong). **MINOR.** The
rationale, the modified clauses, and the template re-check go in the Sync Impact Report, per the
amendment procedure.

The one place the retired word must *survive* inside the constitution is the Sync Impact Report's prior
history line for v1.5.0, which records that the groups were introduced under their old names. Rewriting
it would falsify the audit trail. It is therefore an explicit, annotated entry in the naming
allowlist — see [contracts/naming.contract.md](contracts/naming.contract.md).

## Project Structure

### Documentation (this feature)

```text
specs/008-shop-naming-unification/
├── plan.md                        # This file
├── spec.md                        # Committed
├── research.md                    # Phase 0 — R1..R8, the three deferred HOW questions resolved
├── data-model.md                  # Phase 1 — the DB rename map + migration strategy
├── quickstart.md                  # Phase 1 — the operator cutover + validation runbook
├── checklists/requirements.md     # Committed
├── contracts/
│   ├── naming.contract.md         # Phase 1 — normative old→new token map + the four exclusions
│   └── cutover.contract.md        # Phase 1 — operator ordering, preconditions, rollback
└── tasks.md                       # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

Every path below is a **rename**, not a rewrite. Left column is today; right column is after.

```text
apis/edge-api/store/                           →  apis/edge-api/shop/
├── package.json  (@effy/edge-store)           →  @effy/edge-shop
├── serverless.yml (service: effy-edge-store)  →  service: effy-edge-shop
│   └── routes /store/{healthz,v1,v2}/…        →  /shop/{healthz,v1,v2}/…
├── src/functions/store-ping-v1-get.ts         →  src/functions/shop-ping-v1-get.ts
├── src/functions/store-me-v1-get.ts           →  src/functions/shop-me-v1-get.ts
├── src/functions/store-me.test.ts             →  src/functions/shop-me.test.ts
├── src/functions/store-manager-ping-v1-get.ts →  src/functions/shop-manager-ping-v1-get.ts
├── src/functions/store-manager-ping.test.ts   →  src/functions/shop-manager-ping.test.ts
├── src/staff/*                                →  unchanged paths; Store* identifiers → Shop*
└── src/status/*                               →  unchanged paths; audience-neutral

apps/shop-web/src/features/store-identity/     →  apps/shop-web/src/features/shop-identity/
packages/shared-types/src/store.ts             →  packages/shared-types/src/shop.ts
db/migrations/20260710050004_store_staff_rbac.sql
                                               →  db/migrations/20260710050004_shop_staff_rbac.sql
docs/audiences/store-capabilities.md           →  docs/audiences/shop-capabilities.md

specs/007-shop-web/contracts/store-me.contract.md            →  shop-me.contract.md
specs/007-shop-web/contracts/store-manager-ping.contract.md  →  shop-manager-ping.contract.md
specs/007-shop-web/contracts/store-schema.contract.md        →  shop-schema.contract.md

NEW  scripts/verify-no-store.sh                # the SC-001 guard
NEW  scripts/store-token-allowlist.txt         # every permitted survivor, with a reason
```

Edited in place (no rename): `infra/envs/dev/auth-shop.tf` (two group names + comments), `Makefile`
(`SERVICE=admin|shop`, `EXPECT_STORE` → `EXPECT_SHOP`, new `edge-remove` + `verify-naming` targets),
`scripts/{verify-manager-gate,verify-cross-pool,token-claims}.sh`, `scripts/README.md`,
`apps/shop-web/{README.md,.env.example,src/**}`, `packages/shared-types/src/index.ts`,
`.specify/memory/constitution.md`, `CLAUDE.md`, `ARCHITECTURE.md`, `platform-brief.md`,
`docs/api/shared-gateway.md`, and the artifacts of specs 001/004/005/007.

**Structure Decision**: No structure changes. The monorepo layout, the three-layer slice inside the
cold-path service, and the console's feature-folder convention are all preserved exactly. This is a
rename of names, not a move of responsibilities — which is why the Constitution Check passes Principle
VI without a single directory changing depth or parent.

## Phase Plan

Six implementation surfaces, then two operator brackets. Ordering *within* the commit is irrelevant
(it lands atomically); ordering of the **operator** steps around it is load-bearing and is specified in
[contracts/cutover.contract.md](contracts/cutover.contract.md).

| # | Surface | What changes | Verified by |
|---|---|---|---|
| 1 | **Guard** | `scripts/verify-no-store.sh` + allowlist; new standalone `make verify-naming` target | The guard fails on today's tree and passes on the finished tree |
| 2 | **Shared types** | `store.ts` → `shop.ts`; 11 symbols; `index.ts` re-export | `pnpm typecheck` — every consumer breaks loudly if a symbol is missed |
| 3 | **Cold-path service** | dir, package name, service name, 6 routes, 3 function files, alarm names, `Store*` identifiers, SQL table names in the repository layer | `pnpm --filter @effy/edge-shop test` — 39 tests |
| 4 | **Database** | `20260710050004` rewritten in place (research R1) | `make db-status` precheck, then `make db-up` |
| 5 | **Console** | `store-identity/` → `shop-identity/`; query keys; telemetry event; copy; nav label | `pnpm --filter @effy/shop-web test` — 29 tests |
| 6 | **Infra + docs + specs** | 2 Cognito groups; Makefile; scripts; constitution v1.6.0; brief; ARCHITECTURE; CLAUDE.md; docs/; specs 001/004/005/007 | `terraform validate` + `fmt`; shellcheck; `make verify-naming` |

**Surface 1 goes first on purpose.** Writing the guard before the rename gives an executable definition
of "done": the guard's output *is* the worklist, and SC-001 is satisfied exactly when it exits 0.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| **Rewriting a committed migration in place** (`20260710050004`) rather than appending a forward `ALTER … RENAME` migration | The migration has **never been applied** to any environment (`db-up` has not been run — 003 T008 is open). Appending a rename migration would permanently encode, in the schema's audit trail, a set of table names that no live database ever had, and would rename nothing on a fresh `db-up`. | Appending a forward migration is rejected **conditionally, not absolutely**. The choice is gated on `make db-status ENV=dev` at cutover time: if `20260710050004` reports anything other than *Pending*, the in-place edit is abandoned and Strategy B (forward rename migration) becomes mandatory. See [research.md](research.md) R1 and [data-model.md](data-model.md). The constitution's "forward-only" standard governs *reliance on down migrations* and is not violated here; 003's convention that committed migrations are append-only **is** — knowingly, and only under the stated precondition. |

### Observed, not fixed

`apis/edge-api/store/src/staff/types.ts` re-declares `StoreRole`, `StoreStaffStatus`, `StoreSummary`,
and `StoreStaffRecord` rather than importing them from `@effy/shared-types` — a standing tension with
Principle II. This plan renames the duplicate but **does not remove it**: the spec's own assumption is
"this is a rename, not a redesign," and collapsing the duplication would change what the service bundles
at deploy time. Recorded here so the next shop slice inherits the knowledge rather than rediscovering it.

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| A naive find-and-replace breaks `ui-store.ts`, "storefront", "Parameter Store", or `no-store` | High if done by hand | The guard's allowlist is written **first** and asserts these survive; `pnpm test` catches TanStack breakage immediately |
| The migration turns out to be already applied | Low | `make db-status ENV=dev` is a **blocking precheck** (cutover contract A1); Strategy B is pre-written |
| The Cognito groups turn out to be already applied, with members | Low | `aws cognito-idp list-groups` is a **blocking precheck** (A2); fallback is create → re-add members → delete old, *before* the code's role union flips |
| `terraform apply` proposes replacing the shop **pool** rather than just its groups | Low | The cutover contract requires reading the plan output and **aborting** if `aws_cognito_user_pool` shows anything but "no changes" (FR-016) |
| `serverless remove` becomes impossible once the directory is renamed | **Certain if sequenced wrong** | The old stack is removed **before** the rename lands (A3), from the pre-rename working tree. Fallback in research R2. |
| Both `/store/*` and `/shop/*` routes exist simultaneously | Low | They are distinct route keys on the Terraform-owned shared API, so no collision occurs — but SC-006 forbids the orphan, hence A3 |
| Test count silently drops when a test file is renamed away | Medium | SC-003 is checked mechanically: `pnpm test` must report **159** |

## Progress

- [x] Phase 0 — research complete → [research.md](research.md)
- [x] Phase 1 — design artifacts → [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)
- [x] Constitution Check — pre-design: **PASS**
- [x] Constitution Check — post-design: **PASS** (the design introduced no new violation; the single
      Complexity Tracking entry is unchanged and remains conditional)
- [x] Agent context updated (`CLAUDE.md` SPECKIT block → this plan)
- [ ] Phase 2 — `tasks.md` (`/speckit-tasks`)
