---
description: "Task list for 008-shop-naming-unification"
---

# Tasks: Shop Naming Unification

**Input**: Design documents from `/specs/008-shop-naming-unification/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/)

**Tests**: No new test tasks. The spec forbids adding or removing tests (FR-020, SC-003) — the existing
**159** must survive the rename with the same count and the same assertions. Renaming a symbol inside a
test file is part of the task that renames the symbol, not a separate test task.

**Organization**: Grouped by user story. The three stories are the spec's three audiences for this
change — the contributor (P1), the operator (P2), and the reader of governance documents (P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]` / `[US2]` / `[US3]` — maps to a user story in [spec.md](spec.md)
- 🧑‍💻 **OPERATOR**: touches live AWS or the database. Claude never runs these (CLAUDE.md mode-of-work).
- Every task names its exact file path.

## Path Conventions

Monorepo. Real roots: `apis/edge-api/<service>/`, `apps/<surface>/`, `packages/<pkg>/`, `db/migrations/`,
`infra/envs/dev/`, `scripts/`, `docs/`, `specs/`.

> **The normative old→new map for every rename below is
> [contracts/naming.contract.md](contracts/naming.contract.md).** Do not improvise a name. If a task says
> "per the naming contract," open it.

---

## Phase 1: Setup — capture the baseline

**Purpose**: Two numbers make SC-003 and SC-006 checkable afterwards instead of assertable. Capture them
before touching anything.

- [X] T001 Run `pnpm test` at the repo root and record the total in `specs/008-shop-naming-unification/tasks.md` under Notes. Expect **159** (edge-shared 26, edge-admin 7, edge-store 39, web-kit 38, back-office 20, shop-web 29). This number is the SC-003 invariant.
- [X] T002 [P] 🧑‍💻 **OPERATOR**: record the live deployment units — `aws cloudformation list-stacks --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE --query "StackSummaries[?contains(StackName,'effy-edge')].StackName"`. Expect `effy-edge-admin-dev` and `effy-edge-store-dev`. This is the SC-006 baseline.
- [X] T003 [P] Snapshot the four exclusion categories so their survival can be checked later: `grep -rn 'ui-store\|@tanstack/react-store' packages/web-kit/src apps/*/src`, `grep -rn 'storefront' CLAUDE.md platform-brief.md`, `grep -rn 'Parameter Store' ARCHITECTURE.md infra/README.md`, `grep -rn 'no-store' ARCHITECTURE.md`. Save the counts.

---

## Phase 2: Foundational — the guard, then the three operator gates

**⚠️ CRITICAL**: No renaming may begin until this phase completes. T009–T011 are **blocking operator
gates**; two of them can void the plan's chosen strategy, and T011 becomes *impossible* once T014 renames
the service directory.

### The guard (write it before the rename — its output is the worklist)

- [X] T004 Create `scripts/verify-no-store.sh`: walk the repo excluding `node_modules`, `.git`, `dist`, `build`, `.gradle`, `.turbo`, `.next`, `.serverless`, `pnpm-lock.yaml`; find every case-insensitive `store`; subtract lines matching any pattern in `scripts/store-token-allowlist.txt`; print the remainder as `path:line: text`; exit 1 if non-empty, 0 otherwise. Per [contracts/naming.contract.md](contracts/naming.contract.md) § 4.
- [X] T005 [P] Create `scripts/store-token-allowlist.txt` with the categories (a)–(e) from the naming contract § 3. Every pattern line MUST carry a `#` comment naming its category letter and reason. Category (d) — the English verb — starts deliberately narrow; it is finalized in T064 once the true survivor set is known.
- [X] T006 Add two targets to `Makefile`: `verify-naming` (runs `bash scripts/verify-no-store.sh`) and `edge-remove` (OPERATOR: `serverless remove` for one service, with the same `Continue? [y/N]` confirmation prompt as `edge-deploy`). **Do not** wire `verify-naming` into `lint` — that target is Terraform-only hygiene.
- [X] T007 Run `shellcheck scripts/verify-no-store.sh` — must be clean.
- [X] T008 Run `make verify-naming`. It MUST exit **1** and print the worklist (~60 files). Save the output; it is the checklist the rest of this feature works through.

### 🧑‍💻 Operator gates — each can halt or re-route the plan

- [X] T009 🧑‍💻 **BLOCKING (A1)**: `make db-status ENV=dev`. Migration `20260710050004` MUST report **Pending**. → Proceed to T024 (Strategy A, edit in place). If it reports **Applied**, **STOP**: Strategy A is void, T024 is replaced by the forward rename migration pre-written in [data-model.md](data-model.md) § Strategy B, and the plan must be revised before any further work. Record the result.
- [X] T010 🧑‍💻 **BLOCKING (A2)**: read the shop pool id from SSM (`/effy/dev/auth/shop/user_pool_id`), then `aws cognito-idp list-groups --user-pool-id "$POOL" --query 'Groups[].GroupName'`. Neither `store_manager` nor `store_staff` may exist. If either does, **STOP** — a Cognito group name is immutable, so renaming plans as destroy+create and strips every member's membership (FR-017). Switch to [research.md](research.md) R4's three-step fallback. Record the result.
- [ ] T011 🧑‍💻 **BLOCKING (A3)**: retire the live stack **from the current tree, before any directory is renamed** — `cd apis/edge-api/store && AWS_PROFILE=$AWS_PROFILE pnpm exec serverless remove --stage dev`. Confirm with `aws cloudformation describe-stacks --stack-name effy-edge-store-dev` returning *does not exist*. **`serverless remove` reads the `serverless.yml` that T014 deletes** — this ordering is not optional. Recovery path if missed: [contracts/cutover.contract.md](contracts/cutover.contract.md) § A3.

**Checkpoint**: The guard prints the worklist. The migration is unapplied, the groups do not exist, and
`effy-edge-store-dev` is gone. Renaming may begin.

---

## Phase 3: User Story 1 — A contributor finds all shop-audience work under one name (Priority: P1) 🎯 MVP

**Goal**: Every file, directory, symbol, route, table, and role literal that names the audience says
**shop**. A contributor searching one word finds the whole system.

**Independent Test**: `make verify-naming` reports nothing under `apis/`, `apps/`, `packages/`, `db/`, or
`infra/`. `pnpm typecheck` passes. `pnpm test` reports **159**. A `grep -ril shop` reaches the console,
the service, the routes, the tables, and the roles.

### Shared contracts first — the compiler becomes the safety net

Renaming `@effy/shared-types` before its consumers makes every missed consumer a **compile error** rather
than a silent survival. Do these two first and let `tsc` find the rest.

- [X] T012 [US1] `git mv packages/shared-types/src/store.ts packages/shared-types/src/shop.ts`, then rename all 11 exported symbols per [contracts/naming.contract.md](contracts/naming.contract.md) § 2.6 (`StoreRole`→`ShopRole`, `STORE_ROLES`→`SHOP_ROLES`, `StoreStaffStatus`, `StoreSummaryDTO`, `StoreStaffRecordDTO`, `StoreManagerPingDTO`, `StoreSummary`, `StoreStaffRecord`, `toStoreRoles()`, `isStoreManager()`; `ManagerPingResult` unchanged). **Also the literal values**: the union becomes `"shop_manager" | "shop_staff"`, and `ShopManagerPingDTO`'s `audience: "store"`→`"shop"`, `scope: "store_manager"`→`"shop_manager"`.
- [X] T013 [US1] Update the re-export in `packages/shared-types/src/index.ts`: `export * from "./store"` → `export * from "./shop"`.

### The cold-path service

- [ ] T014 [US1] `git mv apis/edge-api/store apis/edge-api/shop`. **Requires T011 to have already run.** `pnpm-workspace.yaml`'s `apis/edge-api/*` glob and turbo's `@effy/edge-*` filter both still match — no workspace config change needed.
- [ ] T015 [US1] `apis/edge-api/shop/package.json`: `name` → `@effy/edge-shop`; rewrite `description` to name the shop service and `/shop/` routes.
- [ ] T016 [P] [US1] `git mv` the five audience-named function files in `apis/edge-api/shop/src/functions/`: `store-ping-v1-get.ts`, `store-me-v1-get.ts`, `store-me.test.ts`, `store-manager-ping-v1-get.ts`, `store-manager-ping.test.ts` → their `shop-*` equivalents. Leave `health-get.ts`, `platform-status-v{1,2}-get.ts`, and `platform-status.test.ts` alone — they are audience-neutral.
- [ ] T017 [US1] `apis/edge-api/shop/serverless.yml`: `service: effy-edge-shop`; provider tag `service: shop`; the six route paths `/store/…` → `/shop/…`; the three function keys `storePingV1`/`storeMeV1`/`storeManagerPingV1` → `shop*`; their `handler:` paths (T016); all six alarm logical ids `Store*Alarm` → `Shop*Alarm` and their `AlarmName` strings `…-store-…` → `…-shop-…`; the header comment. **Do not touch** `${ssm:/effy/${sls:stage}/edge/authorizer/shop_id}` — already correct.
- [ ] T018 [US1] `apis/edge-api/shop/src/staff/types.ts`: rename `StoreRole`, `StoreStaffStatus`, `KNOWN_ROLES` members, `StoreSummary`, `StoreStaffRecord` per the naming contract. The union literals become `"shop_manager" | "shop_staff"`. (These stay duplicated from shared-types — see plan § Observed, not fixed.)
- [ ] T019 [US1] ⚠️ `apis/edge-api/shop/src/staff/repository.ts`: rewrite the **raw SQL string literals** — `public.store_staff` → `public.shop_staff`, `public.store_staff_role` → `public.shop_staff_role`, `public.store_role` → `public.shop_role`, column `store_id` → `shop_id` — plus the `Store*` type references. **`tsc` cannot catch a miss here**; the names live in strings. Cross-check every statement against [data-model.md](data-model.md).
- [ ] T020 [US1] `apis/edge-api/shop/src/staff/service.ts` and `email.ts`: rename `Store*` identifiers and any `store`-named locals/params.
- [ ] T021 [P] [US1] Rename identifiers and assertions in `apis/edge-api/shop/src/staff/repository.test.ts`, `staff/lifecycle.test.ts`, `functions/shop-me.test.ts`, `functions/shop-manager-ping.test.ts`. Assertions on emitted SQL are the only guard on T019 — update them to expect `public.shop_staff`, not merely to stop failing. **Do not change the number of tests.**
- [ ] T022 [US1] `apis/edge-api/shop/src/functions/shop-ping-v1-get.ts`, `shop-me-v1-get.ts`, `shop-manager-ping-v1-get.ts`: rename handler identifiers, imports, log fields, and the `audience`/`scope` response literals.
- [ ] T023 [US1] `apis/edge-api/shop/README.md`: service name, routes, and prose.

### The database

- [X] T024 [US1] **Gated on T009 reporting Pending.** `git mv db/migrations/20260710050004_store_staff_rbac.sql db/migrations/20260710050004_shop_staff_rbac.sql`, then rewrite its body per [data-model.md](data-model.md) — four tables, the `store_id`→`shop_id` column, two indexes, the `CHECK (key IN ('shop_manager','shop_staff'))`, the two seeded role rows, every `COMMENT ON`, and the `-- +goose Down` drop order. **Keep the version integer `20260710050004`** — Goose keys on it, not on the filename suffix. Preserve the two substantive comments (why `email` and `shop_id` are nullable) verbatim, noun swapped.

### The role literal — it must agree across four systems (SC-007)

- [X] T025 [US1] `infra/envs/dev/auth-shop.tf`: the two Cognito group `name` values → `shop_manager` / `shop_staff`; update their `description` strings and the file's header comment (which currently *explains* the store/shop split as intentional). Requires T010 to have confirmed the groups are unapplied.

### The console

- [X] T026 [US1] `git mv apps/shop-web/src/features/store-identity apps/shop-web/src/features/shop-identity`.
- [X] T027 [US1] `apps/shop-web/src/features/shop-identity/repo.ts`: request paths `/store/v1/me` → `/shop/v1/me`, `/store/v1/manager-ping` → `/shop/v1/manager-ping`; imports of the renamed `@effy/shared-types` symbols.
- [X] T028 [US1] React Query cache keys: `["store", …]` → `["shop", …]` in `apps/shop-web/src/features/shop-identity/queries.ts`, and `removeQueries({ queryKey: ["store"] })` → `["shop"]` in `apps/shop-web/src/features/auth/queries.ts`.
- [X] T029 [US1] `apps/shop-web/src/lib/telemetry.ts`: the mixed compound event `shop_store_assignment_missing` → **`shop_assignment_missing`** (FR-003; [research.md](research.md) R3 — *not* `shop_shop_…`), and the file's header comment which names "the store audience". Update its one emitter in `features/shop-identity/ProvingScreen.tsx`.
- [X] T030 [P] [US1] `apps/shop-web/src/features/shop-identity/ManagerOnlyScreen.tsx`, `ProvingScreen.tsx`, and their `.test.tsx` files: user-visible copy ("Store management" → "Shop management", "Your store record" → "Your shop record") and identifiers. FR-011.
- [X] T031 [US1] `apps/shop-web/src/components/layout/nav.ts` + `nav.test.ts` + `src/routes/app.tsx`: the `navGroupLabel="Store"` → `"Shop"`, role imports, and role-gated nav assertions.
- [X] T032 [US1] `apps/shop-web/src/features/auth/model.ts`, `repo.ts`, and `roles.test.ts`: `Store*` type imports and the `store_manager`/`store_staff` string assertions → `shop_*`.
- [X] T033 [US1] `apps/shop-web/.env.example` and `apps/shop-web/README.md`: the `/store/v1/*` example paths and all prose naming the store audience.

### Verify User Story 1

- [ ] T034 [US1] `pnpm install` (the `@effy/edge-store` → `@effy/edge-shop` package rename updates `pnpm-lock.yaml`), then `pnpm typecheck` across the workspace — clean. Any missed consumer of a `@effy/shared-types` symbol fails here.
- [ ] T035 [US1] `pnpm test` — MUST report **159**, matching T001. Not 158, not 160. Then `pnpm --filter @effy/back-office test` → 20 green, proving the rename did not leak through the shared `@effy/web-kit` / `@effy/design-system` packages into the other console.
- [X] T036 [US1] `terraform -chdir=infra/envs/dev validate` and `terraform fmt -check -recursive infra/` — clean (covers T025).
- [X] T037 [US1] Confirm the four exclusions survived, comparing against T003's snapshot: `ui-store.ts` / `@tanstack/react-store` intact, "storefront" intact, "Parameter Store" intact, `no-store` intact. A naive find-and-replace destroys all four, and only the TanStack breakage is caught by `tsc`.

**Checkpoint**: The code, the schema, the types, and the role literals all say *shop*. The guard is now
silent everywhere except `Makefile`, `scripts/`, `docs/`, `specs/`, and the governance documents.

---

## Phase 4: User Story 2 — An operator runs the platform with one vocabulary (Priority: P2)

**Goal**: No command an operator types, and no resource name they must recognise, contains the retired
word. Then prove the renamed system behaves exactly as the old one did.

**Independent Test**: Every command in [quickstart.md](quickstart.md) executes; none contains "store".
`make shop-verify-isolation` returns `200 200 401 401`; `make shop-verify-gate` refuses all three
principals; `/store/healthz` returns 404.

### The operator surface

- [X] T038 [US2] `Makefile`: every `SERVICE=admin|store` usage string and comment → `SERVICE=admin|shop` (targets `edge-test`, `edge-offline`, `edge-deploy`); the `# store service + SHOP Cognito pool` comment; the `# store slice verification (007)` section header.
- [X] T039 [US2] `scripts/verify-manager-gate.sh`: rename `EXPECT_STORE` → **`EXPECT_SHOP`** ([research.md](research.md) R8); the `/store/v1/*` request paths → `/shop/v1/*`; and — importantly — the comments that say *"the default until 008"* and *"Either 008 already shipped"*. That "008" meant the future back-office **shop-management** slice, anticipated by number; 008 is now *this* feature, so the reference is actively wrong. Reword to name the slice, not a number.
- [X] T040 [P] [US2] `scripts/verify-cross-pool.sh`: `/store/v1/*` request paths → `/shop/v1/*`.
- [X] T041 [P] [US2] `scripts/token-claims.sh`: the `public.store_staff.email` reference → `public.shop_staff.email`.
- [X] T042 [US2] `scripts/README.md`: the `EXPECT_STORE` section → `EXPECT_SHOP`; the example invocations; and the same number-free rewording of the "008" references as T039.
- [X] T043 [US2] `shellcheck scripts/*.sh` — clean.

### 🧑‍💻 The cutover — [contracts/cutover.contract.md](contracts/cutover.contract.md) Phase B

- [ ] T044 [US2] **Merge gate**: `make verify-naming` exits 0; `pnpm typecheck` clean; `pnpm test` = 159; `terraform validate` + `fmt -check` clean; `shellcheck` clean. Commit the rename (including `db/migrations/20260710050004_shop_staff_rbac.sql` — 003's commit-guard refuses uncommitted migration files).
- [ ] T045 🧑‍💻 [US2] **B1** `make apply ENV=dev`. **Read the plan before confirming.** Expect exactly two creates: `aws_cognito_user_group.this["shop_manager"]` and `["shop_staff"]`. 🛑 **Abort** if `aws_cognito_user_pool` appears with any action (`~`, `-/+`, `-`) — FR-016 forbids replacing the pool, its app client, or any account.
- [ ] T046 🧑‍💻 [US2] **B2** `make db-status ENV=dev` (→ Pending), `make db-up ENV=dev`, `make db-status ENV=dev` (→ Applied). Then `\dt public.*` → exactly `shop`, `shop_role`, `shop_staff`, `shop_staff_role`, and **no `store*` relation**. `public.shop` is empty and stays empty — no shop-creation path exists in any slice (007 FR-019).
- [ ] T047 🧑‍💻 [US2] **B3** `make edge-deploy SERVICE=shop ENV=dev` → stack `effy-edge-shop-dev`. Then curl the endpoint: `/shop/healthz` → 200, `/shop/v1/status` → 200, `/shop/v1/me` (no token) → 401, and **`/store/healthz` → 404**. That 404 is SC-006's evidence; a 200 means T011 never ran.
- [ ] T048 🧑‍💻 [US2] **B4** Re-add the shop accounts to the new groups (`admin-add-user-to-group … --group-name shop_manager` / `shop_staff`), or create them per 007's quickstart if they do not exist yet. **Sign out and back in** — group membership is baked into the token at issue time, so a token minted before T045 carries a stale claim and will be refused (correctly, and confusingly).
- [ ] T049 🧑‍💻 [US2] **B5** `make shop-verify-isolation SHOP_TOKEN=… BO_TOKEN=… ENV=dev` → `200 200 401 401`. Cross-pool isolation (constitution Principle IV) is untouched by the rename. SC-004.
- [ ] T050 🧑‍💻 [US2] **B5** `make shop-verify-gate MANAGER_TOKEN=… STAFF_TOKEN=… NOBODY_TOKEN=… ENV=dev` with the default `EXPECT_SHOP=0`. The manager is refused **for lack of a shop assignment**; staff and role-less are refused too; all three receive the same uniform 403 that discloses nothing about which term failed. The gate is still one SQL predicate over `role AND status AND shop scope`, still fail-closed. SC-004.
- [ ] T051 🧑‍💻 [US2] **SC-007** — the four-system agreement. `make shop-token-claims ENV=dev | grep cognito:groups` → `["shop_manager"]`; then `DSN=$(AWS_PROFILE=$AWS_PROFILE bash infra/scripts/db-dsn.sh dev)` and `psql "$DSN" -c 'SELECT key FROM public.shop_role ORDER BY key;'` → `shop_manager`, `shop_staff`. The token's claim and the persisted role key must be byte-identical. Finally `make shop-dev` → sign in at `:5174`, confirm the console reads `/shop/v1/me` and the manager sees the **Shop** nav group.

**Checkpoint**: The platform runs under one vocabulary and behaves identically. Exactly one deployment
unit per service.

---

## Phase 5: User Story 3 — Governance documents speak one word (Priority: P3)

**Goal**: The constitution, the brief, the architecture reference, and every specification artifact that
describes the *running* system name the audience once, consistently.

**Independent Test**: Read constitution v1.6.0, `platform-brief.md`, and `ARCHITECTURE.md` — each
describes the audience, its pool, its roles, and the fulfillment-node concept with one word and zero
internal contradictions. No spec artifact directs a reader to a path, route, table, or command that does
not exist.

### The constitution — a versioned amendment, not an editorial pass

- [X] T052 [US3] `.specify/memory/constitution.md` → **v1.6.0 (MINOR)**. (1) Preamble: "customers, drivers, **stores**, and admin/back-office" → "shops"; "**stores** are hidden internal fulfillment nodes (dark-store-like)" → "shops are…" — **keep "dark-store-like"**, it names an external industry concept (naming contract § "dark store"). (2) Principle IV: "four isolated Cognito pools: customer, driver, **store**, admin" → "shop"; "the **store** pool defines `store_manager` / `store_staff`" → "the **shop** pool defines `shop_manager` / `shop_staff`"; "Driver, **store**, and admin users are admin-provisioned" → "shop". (3) **Leave Principle VI's "client store" and the Technology Standards' "TanStack Store" untouched** — exclusion category (a). (4) Replace the Sync Impact Report with the v1.6.0 report: version line, MINOR rationale (per plan § Amendment A — `shop_manager` is a normative literal, so this exceeds PATCH; no principle is removed or invalidated, so it is below MAJOR), the modified clauses, and the template re-check. (5) Reword the **Prior history** line for 1.5.0 to stay truthful: *"…the shop pool gained its two role groups (introduced as `store_manager` / `store_staff`; renamed to `shop_*` in 1.6.0)."* (6) Update the footer `**Version**: 1.6.0 | … | **Last Amended**: 2026-07-10`.
- [X] T053 [US3] Add allowlist category **(e)** to `scripts/store-token-allowlist.txt`: the single Prior-history line from T052(5). Rewriting the changelog would falsify the audit trail ([research.md](research.md) R6). This is the one place inside the constitution where the retired word legitimately survives, and it is annotated as such.

### The other governing documents

- [X] T054 [P] [US3] `platform-brief.md`: the audience name, the fulfillment-node sentences, and `shop-web`/`shop-mobile` prose. **Keep** "no storefront marketplace" and "customer-web storefront" — exclusion (b).
- [X] T055 [P] [US3] `ARCHITECTURE.md`: "store-scoped routes", "store pool", the audience rows, and the cold-path service name. **Keep** every "TanStack Store" / "client store" (a), "Parameter Store" (c), and the `no-store` cache directive (d). This file contains all three trap categories at once — edit by hand, not by `sed`.
- [X] T056 [US3] `CLAUDE.md`: the product-model bullets, the audience list, the auth section's RBAC sentence (`shop_manager` / `shop_staff`), the current-status section, and the 007 slice summary. **Keep** "no marketplace of named storefronts" and "customer storefront" (b).
- [X] T057 [US3] `git mv docs/audiences/store-capabilities.md docs/audiences/shop-capabilities.md`, then rewrite it. Its **Terminology** section currently *codifies the split as intentional* ("client surfaces are `shop-*`; the backend service and its paths are `store`") — replace it with a statement that one name is now normative, citing constitution v1.6.0 (FR-015). Update the capability matrix, the shared-contract references, and the file's own links.
- [X] T058 [P] [US3] `docs/api/shared-gateway.md`: the route table's `/store/*` rows → `/shop/*`; the service name `effy-edge-store` → `effy-edge-shop`.

### The specification artifacts — content, not directory names

Spec directory names and git history are **never** rewritten ([research.md](research.md) R7). Reconcile
only what a reader would *type or open*: runbooks, contracts, route tables, file paths, table names.

- [X] T059 [US3] `specs/007-shop-web/`: `git mv` the three contracts — `contracts/store-me.contract.md` → `shop-me.contract.md`, `contracts/store-manager-ping.contract.md` → `shop-manager-ping.contract.md`, `contracts/store-schema.contract.md` → `shop-schema.contract.md` — then reconcile **all** artifacts (`spec.md`, `plan.md`, `tasks.md`, `research.md`, `data-model.md`, `quickstart.md`, `operator-directives.md`, `contracts/*`) and every cross-reference to the renamed files. 007 is not signed off and its runbook is about to be executed; it must not name a route, table, or command that no longer exists.
- [X] T060 [P] [US3] `specs/005-back-office-web/` (`plan.md`, `tasks.md`, `spec.md`, `data-model.md`, `research.md`): reconcile only where they name the shop service, its routes, or the shop audience. Their `admin.*` subject matter is untouched.
- [X] T061 [P] [US3] `specs/004-backend-bootstrap/` (`spec.md`, `plan.md`, `tasks.md`, `research.md`, `contracts/shared-gateway.contract.md`): `apis/edge-api/store` → `apis/edge-api/shop`, `effy-edge-store` → `effy-edge-shop`, `/store/v2/status` → `/shop/v2/status`.
- [X] T062 [P] [US3] `specs/001-infra-foundation/spec.md`: prose naming the "store pool" → "shop pool". Leave `specs/002-dev-database/`, `specs/003-db-migrations/`, and `specs/006-first-admin-bootstrap/` untouched — every `store` hit in them is "Parameter Store" or the English verb.

**Checkpoint**: One word, from the constitution down to the route table.

---

## Phase 6: Polish & Cross-Cutting

- [X] T063 Finalize allowlist category **(d)**. Run `make verify-naming` and enumerate the surviving English-verb occurrences explicitly, pinning each with a **narrow** pattern. A pattern broad enough to swallow every verb usage is broad enough to swallow a missed rename, silently defeating SC-001. Each line keeps its `#` justification.
- [ ] T064 `make verify-naming` exits **0**. Every surviving `store` is individually attributable to category (a), (b), (c), (d), or (e). **This is SC-001.**
- [ ] T065 Remove the stale local build artifacts left by the old service: `apis/edge-api/store/.serverless/` and `.turbo/` no longer exist after T014, but confirm no `effy-edge-store` string remains in any tracked file, and that `pnpm-lock.yaml` records `@effy/edge-shop`.
- [ ] T066 Full green sweep: `pnpm typecheck`, `pnpm test` (**159**), `terraform -chdir=infra/envs/dev validate`, `terraform fmt -check -recursive infra/`, `shellcheck scripts/*.sh`, `make verify-naming`. Plus a secret/PII sweep over the diff.
- [ ] T067 Run [quickstart.md](quickstart.md) end to end and tick its success-criteria map.
- [ ] T068 🧑‍💻 Sign off SC-001…SC-010 in [spec.md](spec.md). **SC-005** (no account replaced) is evidenced by T045's plan output; **SC-007** by T051. Record the final test count and the surviving stack list against the T001/T002 baselines.
- [ ] T069 Update `CLAUDE.md`'s **Active feature** section to describe 008 as complete, and demote 007 to the previous-slice list with its runbook pointing at the renamed contracts.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — no dependencies.
- **Phase 2 (Foundational)** — depends on Phase 1. **Blocks everything.** T009/T010/T011 are gates: T009 can void T024's strategy, T010 can void T025's approach, and **T011 becomes impossible after T014**.
- **Phase 3 (US1)** — depends on Phase 2. The MVP.
- **Phase 4 (US2)** — the *code* half (T038–T043) depends only on Phase 2 and can run beside Phase 3. The *cutover* half (T044–T051) depends on **all of Phase 3** plus T038–T043, because it deploys and verifies the renamed system.
- **Phase 5 (US3)** — depends on Phase 2 only. Fully parallel with Phases 3 and 4: documents have no compile step.
- **Phase 6 (Polish)** — depends on Phases 3, 4, and 5. T064 (SC-001) cannot pass until every phase's files are renamed.

### The hard ordering constraints

1. **T011 before T014.** `serverless remove` reads the `serverless.yml` that the directory rename deletes. This is the one mistake that costs real cleanup work.
2. **T009 before T024.** If the migration is already applied, the in-place edit is void and Strategy B is mandatory.
3. **T010 before T025.** If the groups already exist with members, renaming them strands tokens.
4. **T012/T013 before every other US1 task.** Renaming the shared contract first turns every missed consumer into a compile error.
5. **T045 before T048.** Group membership is baked into tokens at issue time; accounts must be re-grouped *after* the groups exist, and tokens re-minted after that.
6. **T044 before T045.** Nothing is applied to the cloud until the tree is green and committed.

### Within User Story 1

Shared types (T012–T013) → service (T014–T023) ∥ database (T024) ∥ infra role literal (T025) ∥ console
(T026–T033) → verification (T034–T037).

### Parallel opportunities

- Phase 1: T002, T003 together.
- Phase 2: T005 alongside T004.
- Phase 3: after T013, the service (T014→T023), the migration (T024), the Terraform groups (T025), and the console (T026→T033) are four independent tracks. T016, T021, T030 are `[P]` within their tracks.
- Phase 4: T040, T041 in parallel with T039.
- Phase 5: T054, T055, T058 in parallel; T060, T061, T062 in parallel after T059.
- **Phases 3, 4 (code half), and 5 can all proceed simultaneously** — they touch disjoint files.

---

## Parallel Example: User Story 1, after T013

```bash
# Four independent tracks, once the shared contract is renamed:
Track A (service):  T014 → T015 → T016 → T017 → T018 → T019 → T020 → T021 → T022 → T023
Track B (database): T024
Track C (infra):    T025
Track D (console):  T026 → T027 → T028 → T029 → T030 → T031 → T032 → T033

# Then converge:
T034 (typecheck) → T035 (159 tests) → T036 (terraform) → T037 (exclusions survived)
```

---

## Implementation Strategy

### MVP First (User Story 1)

1. Phase 1: capture the baseline (159 tests; two live stacks).
2. Phase 2: write the guard, run the three operator gates. **Do not skip T011.**
3. Phase 3: rename the code, the schema, the types, the role literals.
4. **STOP and VALIDATE**: `pnpm test` = 159, `pnpm typecheck` clean, the four exclusions intact.

At this point a contributor already finds the whole shop system under one word. Nothing is deployed;
nothing is at risk.

### Incremental Delivery

1. **US1** → the code says shop. Locally verifiable, zero cloud contact.
2. **US2 (code half)** → the Makefile and scripts say shop. Still zero cloud contact.
3. **T044 merge gate** → the tree is green and committed.
4. **US2 (cutover)** → apply, migrate, deploy, verify. The system *runs* under one name.
5. **US3** → the law matches the code. (Can land at any point; it blocks nothing.)
6. **Polish** → SC-001 goes green, and the guard keeps it there.

---

## Discovered during implementation (2026-07-10)

The guard (T008) is the reason these exist: run against the real tree it printed **1262 occurrences
across 115 files**, and five of those files were not in any phase above. Recorded here rather than
folded silently into a neighbouring task.

- [X] T070 [US1] `packages/web-kit` uses the shop audience as its **exemplar role union**. The plan asserted web-kit needed no change; it needed four. `src/console/nav.test.ts` (`type Role = "store_manager" | "store_staff"` + 6 assertions), `src/auth/guards.test.ts` (`roles: ["store_manager"]`), `src/console/ErrorState.test.tsx` (a fake error detail `SELECT * FROM public.store_staff`), `src/console/nav.ts` (a doc comment naming `NavItem<StoreRole>`), and `README.md` (the role-genericity section). Renamed; 38 tests still green.
- [X] T071 [US3] `infra/envs/dev/auth-backoffice.tf` — the **admin** pool's `manager` group description reads "catalog, stores, fulfillment oversight". It names the shop audience from the back-office side. Renamed.
- [X] T072 [US3] `docs/api/path-assignment.md` and `docs/api/versioning-policy.md` carry `/store/v1/*` route examples and the service-prefix table. Neither was listed in Phase 5. Renamed.
- [X] T073 [US3] `specs/006-first-admin-bootstrap/spec.md` ("driver/store/admin are…") and `specs/001-infra-foundation/data-model.md` ("staff-provisioned (store/operator)") each carry one audience-noun line. The plan's R7 wrote both slices off as "verb only". Wrong; renamed.
- [X] T074 [US3] `specs/007-shop-web/research.md` § Terminology + R1 **argued for keeping the split**. A mechanical rename turned it into "name the directory `shop-web`, not `shop-web`" — self-referential nonsense. Restored from git and rewritten as an explicitly **superseded** decision record that states where R1's cost estimate was wrong (no SSM parameter ever contained `store`; the only consumer of `/store/v1/*` was 007's own unshipped console). Same treatment for the terminology blocks in 007's `plan.md`, `tasks.md`, and `operator-directives.md`.

### Allowlist categories the spec did not anticipate

`scripts/store-token-allowlist.txt` ships **six** categories, not four:

- **(e) historical record** — text falsified by rewriting: the constitution's v1.5.0 changelog line, the v1.6.0 Sync Impact Report (which must name the token it retires), 007's superseded R1, and **verbatim user quotes** in every `operator-directives.md` and each spec's `**Input**:` line. These are records of what someone *said*.
- **(f) meta** — `specs/008-shop-naming-unification/`, the guard, and the allowlist itself. Path-excluded in the guard rather than pattern-matched.

Category (e) was flagged in [research.md](research.md) R6 for the constitution line alone; implementation
found it applies to verbatim quotes too. Category (f) is new.

### Notes

- **Baseline test count (T001)**: **159** — verified 2026-07-10, uncached (`pnpm test --force`):
  edge-shared 26 · edge-store 39 · edge-admin 7 · web-kit 38 · back-office 20 · shop-web 29.
- **T002 baseline stacks**: `effy-edge-store-dev`, `effy-edge-admin-dev`.
- **T009 result**: `20260710050004` = **Pending** → Strategy A authorized. *(Note: the three earlier
  migrations report Applied. `research.md` R1 originally claimed `db-up` had never run — false, and
  corrected in place. The gate depends only on this one migration being Pending, which it is.)*
- **T010 result**: shop pool `ap-southeast-1_JeKqQCyKK` has **zero groups and zero users**. The group
  rename is a pure create; no token can be stranded.
- The rename lands as **one atomic commit**. The phase order above is the order of *work*, not of commits.
- `[P]` = different files, no dependency on an incomplete task.
- The guard (T004–T008) is written **before** the rename on purpose: its output is the worklist, and its
  exit code is the definition of done.
- **Only three tasks can hurt anything**: T011 (retires a live stack), T045 (touches Cognito), T046
  (touches the schema). Each has a rollback in [contracts/cutover.contract.md](contracts/cutover.contract.md)
  § Rollback, and none of them is irreversible — `public.shop` ships empty and the pool is never in
  Terraform's change set.
