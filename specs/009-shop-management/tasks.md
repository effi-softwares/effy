---
description: "Task list for 009-shop-management"
---

# Tasks: Back-Office Shop Management

**Input**: Design documents from `/specs/009-shop-management/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/shop-management.contract.md](contracts/shop-management.contract.md),
[quickstart.md](quickstart.md)

**Tests**: Unit tests are included for the cold-path `shops` slice and the 007 gate reconciliation —
these match the established `edge-api` pattern (co-located `*.test.ts`, `query`/`withTransaction` +
Cognito seams mocked) and cover the behaviours that cannot honestly be skipped (idempotency, the
one-shop invariant, the authz predicates, the gate). Live acceptance (SC-001…SC-015) is in
[quickstart.md](quickstart.md).

**Organization**: Tasks are grouped by user story (spec P1–P6) for independent implementation/testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: US1–US6 (setup/foundational/polish carry no story label)
- 🧑‍💻 = **operator-run** step (touches live cloud state; Claude authors, operator runs — CLAUDE.md)

## Path Conventions

- Cold-path backend: `apis/edge-api/admin/` (new `shops/` slice) and `apis/edge-api/shop/` (007 reconcile)
- Migration: `db/migrations/`
- Shared packages: `packages/{shared-types,api-client,design-system,web-kit}/`
- Back-office SPA: `apps/back-office/src/`

---

## Phase 1: Setup (Shared Package Foundations)

**Purpose**: Cross-cutting shared additions every story consumes — added **in the packages**
(Principle II), not the app. No story-specific logic here.

- [X] T001 [P] Add `@aws-sdk/client-cognito-identity-provider` to `apis/edge-api/admin/package.json` deps; run workspace install
- [X] T002 [P] Add back-office management DTOs + `ShopLifecycleStatus` union to `packages/shared-types/src/shop.ts` (per data-model §5: `ShopListItemDTO`, `ShopDetailDTO`, `ShopUserDTO`, `CreateShopRequest`, `UpdateShopRequest`, `ChangeShopStatusRequest`, `CreateShopUserRequest`, `UpdateShopUserRequest`, `AuditEntryDTO`, `PagedDTO<T>`) and change `ShopSummaryDTO`/`ShopSummary` `isActive` → `status`
- [X] T003 [P] Add public `post`/`patch`/`delete` methods delegating to the existing private `request` in `packages/api-client/src/client.ts`
- [X] T004 [P] Generate shadcn primitives `table`, `dialog`, `alert-dialog`, `select`, `badge`, `form` into `packages/design-system/src/ui/` and register them in `packages/design-system/src/ui/index.ts`
- [X] T005 [P] Add a generic `DataTable` (on the installed `@tanstack/react-table`) to `packages/web-kit/src/console/DataTable.tsx` and export it from `packages/web-kit/src/console/index.ts`
- [X] T006 [P] Add the typed shop-management PostHog event names (R9: `shop_created`, `shop_updated`, `shop_status_changed`, `shop_deleted`, `shop_user_provisioned`, `shop_user_role_changed`, `shop_user_status_changed`) to the shared telemetry taxonomy in `packages/web-kit/src/runtime/telemetry.ts`

**Checkpoint**: `pnpm --filter @effy/{shared-types,api-client,design-system,web-kit} typecheck` green.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The data migration, the 007 gate reconciliation, and the `shops` slice + frontend
scaffolding all stories build on. **⚠️ No user story can begin until this phase is complete.**

**Data + cross-slice gate (R2)**

- [X] T007 🧑‍💻 Create the migration via `make db-new NAME=shop_management`, then author `db/migrations/<ts>_shop_management.sql`: `ALTER public.shop` add `status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','disabled'))`, backfill from `is_active`, `DROP COLUMN is_active`, add `contact_phone text`, `notes text`; `CREATE TABLE admin.audit_log (id, actor_sub, action, target_type, target_id, detail jsonb, created_at)` + indexes (data-model §1, §4)
- [X] T008 [P] Reconcile the 007 manager gate in `apis/edge-api/shop/src/staff/repository.ts`: gate predicate `AND st.is_active` → `AND st.status = 'active'`; read projection `st.is_active AS shop_is_active` → `st.status AS shop_status`; update `StaffRow` + `mapRow`
- [X] T009 [P] Update `apis/edge-api/shop/src/staff/types.ts` `ShopSummary` `isActive` → `status: ShopLifecycleStatus`, and update `apps/shop-web` reads of that field to `status`
- [X] T010 Update `apis/edge-api/shop/src/staff/lifecycle.test.ts` fixtures/assertions (`shop_is_active: true` → `shop_status: 'active'`; assert `status`) — keep the 007 suite green (depends on T008, T009)

**Cold-path `shops` slice base**

- [X] T011 [P] Create `apis/edge-api/admin/src/shops/types.ts` — domain types (Shop, ShopUser, ShopLifecycleStatus, paged result) + a domain error type (map to `problem(...)`)
- [X] T012 [P] Create `apis/edge-api/admin/src/shops/authz.ts` — `isActiveStaff(sub)` (read, any role) and `isActiveShopManager(sub)` (mutate, role ∈ {admin,manager}) decided from `admin.staff` (R6), raw SQL via `@effy/edge-shared` `query`
- [X] T013 [P] Create `apis/edge-api/admin/src/shops/cognito.ts` — shop-pool Admin API adapter (module singleton over `@aws-sdk/client-cognito-identity-provider`): `ensureShopUser(email,name,group)→sub` (AdminCreateUser no-password/SUPPRESS/email_verified + AdminAddUserToGroup; idempotent on `UsernameExistsException`+AdminGetUser), `setUserGroups`, `disableUser`, `enableUser` (R4/R5); reads `SHOP_USER_POOL_ID` from env
- [X] T014 Create `apis/edge-api/admin/src/shops/repository.ts` base — DB access to `public.shop`/`shop_staff`/`shop_staff_role` + an `writeAudit(tx, ...)` helper into `admin.audit_log`, row→domain mappers (no logic yet) (depends on T007, T011)
- [X] T015 Create `apis/edge-api/admin/src/shops/service.ts` base — wire repository + cognito + authz seams (explicit, greppable; no DI framework), shared validation helpers (depends on T012, T013, T014)
- [X] T016 [P] Author unit test for the authz predicates in `apis/edge-api/admin/src/shops/authz.test.ts` (active admin/manager pass; csa/role-less/disabled refused) (depends on T012)

**Back-office SPA scaffold**

- [X] T017 [P] Create the `apps/back-office/src/features/shops/` slice scaffold — `repo.ts` (imports `api` from `@/lib/api`), `queries.ts` (query keys), `model.ts` (domain types from `@effy/shared-types`), following the `staff-identity` pattern
- [X] T018 Register Shops routes in `apps/back-office/src/routes/shops.tsx` (index + `$shopId` detail under `appRoute`) and wire them into `apps/back-office/src/router.tsx` (depends on T017)
- [X] T019 [P] Add the Shops nav item (no `requiredRole` — `csa` reads) to `apps/back-office/src/components/layout/nav.ts` and extend `apps/back-office/src/components/layout/nav.test.ts`

**Checkpoint**: migration parses (`db-status` dry), `pnpm test` green (007 gate + authz), typecheck clean across touched packages. User stories can now begin.

---

## Phase 3: User Story 1 — Create a shop and provision its first operator (Priority: P1) 🎯 MVP

**Goal**: An authorized admin creates a shop + primary manager in one operation; the new owner signs
into the shop console and is served. **Unblocks 007 SC-005b positive half.**

**Independent Test**: Create a shop with a primary contact email as admin → shop + `shop_staff(shop_manager)` exist scoped to the shop → on `:5174` request an OTP for that email, sign in, reach the manager area.

- [X] T020 [US1] Implement `createShop(input, actorSub)` in `apis/edge-api/admin/src/shops/repository.ts` — one `withTransaction`: INSERT `public.shop` `ON CONFLICT (code)`, upsert `public.shop_staff` by `cognito_sub`, grant `shop_staff_role('shop_manager')`, write `admin.audit_log('shop.create')` (depends on T014)
- [X] T021 [US1] Implement create orchestration in `apis/edge-api/admin/src/shops/service.ts` — validate unique code + email-not-already-a-shop-user (one-shop invariant); Cognito-first `ensureShopUser` → sub → repository txn (R4) (depends on T013, T015, T020)
- [X] T022 [US1] Create handler `apis/edge-api/admin/src/functions/shop-create-v1-post.ts` (`POST /admin/v1/shops`, back-office authorizer, `isActiveShopManager` gate, `parseJsonBody` validation → `problem(400)`, `409` on code/email conflict, `201` `ShopDetailDTO`)
- [X] T023 [US1] Wire the route + Cognito IAM (scoped to shop pool ARN via `/effy/${stage}/auth/shop/user_pool_arn`) + `SHOP_USER_POOL_ID` env (from `/effy/${stage}/auth/shop/user_pool_id`) + per-function alarm in `apis/edge-api/admin/serverless.yml`
- [X] T024 [P] [US1] Unit test create idempotency + one-shop invariant + duplicate-code in `apis/edge-api/admin/src/shops/service.test.ts` (mock `query`/`withTransaction` + cognito seam; re-run converges, no orphan/dup) (depends on T021)
- [X] T025 [P] [US1] Add `createShop()` to `apps/back-office/src/features/shops/repo.ts` and `useCreateShop` mutation (+ invalidate) to `queries.ts`
- [X] T026 [US1] Build `apps/back-office/src/features/shops/components/CreateShopDialog.tsx` (form: code, name, contactPhone?, notes?, primaryContact{name,email}) using `@effy/design-system/ui` `dialog`+`form`; emit `shop_created` telemetry on success (depends on T004, T006, T025)
- [X] T027 [US1] Render a role-gated (admin/manager) "Create shop" entry + success confirmation on the Shops index in `apps/back-office/src/features/shops/ShopsListScreen.tsx` (minimal for US1; full table in US2) (depends on T018, T026)

**Checkpoint**: US1 fully functional — a shop + its manager can be created and the manager is served on the shop console.

---

## Phase 4: User Story 2 — Browse, search, and view all shops (Priority: P2)

**Goal**: A searchable/filterable/paginated shop register + detail with roster; `csa` read-only.

**Independent Test**: With several shops of differing statuses, the register lists all with code/name/status/user-count; filter by status and search by code narrow correctly; open a shop → detail + roster.

- [X] T028 [P] [US2] Implement `listShops({page,pageSize,status,q})` (server-side paginate + `ILIKE` search + `userCount`) and `getShopDetail(id)` (shop + roster) in `apis/edge-api/admin/src/shops/repository.ts` (depends on T014)
- [X] T029 [US2] Add list/detail service methods (read authz `isActiveStaff`) in `apis/edge-api/admin/src/shops/service.ts` (depends on T028)
- [X] T030 [P] [US2] Create handler `apis/edge-api/admin/src/functions/shops-list-v1-get.ts` (`GET /admin/v1/shops`, paged `ShopListItemDTO`)
- [X] T031 [P] [US2] Create handler `apis/edge-api/admin/src/functions/shop-get-v1-get.ts` (`GET /admin/v1/shops/{shopId}`, `ShopDetailDTO`, `404` unknown)
- [X] T032 [US2] Wire both read routes + alarms in `apis/edge-api/admin/serverless.yml`
- [X] T033 [P] [US2] Unit test list filter/search/pagination + detail roster shaping in `apis/edge-api/admin/src/shops/repository.test.ts` (depends on T028)
- [X] T034 [P] [US2] Add `loadShops()`/`loadShop(id)` (DTO→domain) to `repo.ts` and `queryOptions` to `queries.ts` in `apps/back-office/src/features/shops/`
- [X] T035 [US2] Build the full `ShopsListScreen.tsx` `DataTable` (code, name, status `badge`, userCount; status `select` filter; search input; pagination) reusing `@effy/web-kit/console` `DataTable`; `ErrorState` for failures (depends on T005, T034)
- [X] T036 [US2] Build `apps/back-office/src/features/shops/ShopDetailScreen.tsx` (shop details + roster table) mounted at `/shops/$shopId`; hide all mutating controls for `csa`/role-less (depends on T018, T034)
- [X] T072 [US2] Implement audit-history read (FR-016/SC-010) — `listAuditEntries(targetType, targetId, page)` in `apis/edge-api/admin/src/shops/repository.ts`, a read service method (`isActiveStaff` gate) in `service.ts`, and handler `apis/edge-api/admin/src/functions/shop-audit-v1-get.ts` (`GET /admin/v1/shops/{shopId}/audit`, paged `AuditEntryDTO`); wire route + alarm in `serverless.yml` (depends on T014, T029)
- [X] T073 [US2] Add a history section to `apps/back-office/src/features/shops/ShopDetailScreen.tsx` rendering the shop's and its users' audit entries (actor, action, target, time) via a repo/queries read; failures delegate to `ErrorState` (depends on T036, T072)

**Checkpoint**: US1 + US2 both work — shops can be created, listed, searched, and inspected; read-only role sees no mutations; a shop's history is viewable.

---

## Phase 5: User Story 3 — Govern a shop's lifecycle (Priority: P3)

**Goal**: Activate/suspend/disable transitions that immediately gate operator access. **Unblocks 007 SC-005b inactive-shop denial.**

**Independent Test**: A manager served at an active shop → suspend the shop → manager refused → re-activate → served; each transition recorded; invalid transitions not offered.

- [X] T037 [US3] Implement `changeShopStatus(id, status, actorSub)` (UPDATE `public.shop.status` + `admin.audit_log('shop.status_change')` with from/to) in `apis/edge-api/admin/src/shops/repository.ts` (depends on T014)
- [X] T038 [US3] Add `changeShopStatus` service method with valid-transition enforcement (invalid → domain error → `400`) in `apis/edge-api/admin/src/shops/service.ts` (depends on T037)
- [X] T039 [US3] Create handler `apis/edge-api/admin/src/functions/shop-status-v1-post.ts` (`POST /admin/v1/shops/{shopId}/status`, mutate gate, `200` `ShopDetailDTO`) + wire route/alarm in `serverless.yml`
- [X] T040 [P] [US3] Unit test transition validity matrix in `apis/edge-api/admin/src/shops/service.test.ts` (depends on T038)
- [X] T041 [P] [US3] Add `changeShopStatus()` + `useChangeShopStatus` to `apps/back-office/src/features/shops/{repo,queries}.ts`
- [X] T042 [US3] Build `apps/back-office/src/features/shops/components/ShopStatusMenu.tsx` (`dropdown-menu` offering only valid transitions) on the detail screen; emit `shop_status_changed` telemetry (depends on T036, T041)

**Checkpoint**: Shop lifecycle governs operator access live (verified via the shop console).

---

## Phase 6: User Story 4 — Manage the people at a shop (Priority: P4)

**Goal**: Add users, change roles, disable/re-enable — Cognito↔record consistent. **Unblocks 007 SC-012.**

**Independent Test**: Add a `shop_staff` user → they sign in with staff privilege; promote to manager → elevated access; disable → refused despite valid credential; re-enable → served; adding an email used at another shop → refused.

- [X] T043 [US4] Unit-test the `apis/edge-api/admin/src/shops/cognito.ts` roster methods (`setUserGroups`, `disableUser`, `enableUser`) created in T013, in `cognito.test.ts` with a mocked SDK client (depends on T013)
- [X] T044 [US4] Implement `addShopUser`, `updateShopUserRole`, `updateShopUserStatus` (each `withTransaction` + audit) in `apis/edge-api/admin/src/shops/repository.ts` (depends on T014)
- [X] T045 [US4] Add roster service methods in `service.ts`: `addShopUser` (one-shop invariant, Cognito-first R4), `changeUserRole` (Cognito groups **and** DB — R5), `setUserStatus` (Cognito enable/disable **and** DB — R5/Q1) (depends on T043, T044)
- [X] T046 [P] [US4] Create handler `apis/edge-api/admin/src/functions/shop-user-create-v1-post.ts` (`POST /admin/v1/shops/{shopId}/users`, `201` `ShopUserDTO`, `409` on used email)
- [X] T047 [P] [US4] Create handler `apis/edge-api/admin/src/functions/shop-user-update-v1-patch.ts` (`PATCH /admin/v1/shops/{shopId}/users/{userId}`, role and/or status; `409` if path shop ≠ user's shop — no reassignment A8)
- [X] T048 [US4] Wire both roster routes + alarms in `apis/edge-api/admin/serverless.yml`
- [X] T049 [P] [US4] Unit test roster in `apis/edge-api/admin/src/shops/service.test.ts`: add-user invariant, role-change touches both Cognito+DB, disable sets status+disables account, and the provisioned row is keyed on the returned `sub` (the precondition for 007's `/shop/v1/me` reconcile — the reconcile itself lives in the shop service and is verified live via T070) (depends on T045)
- [X] T050 [P] [US4] Add `addShopUser()`/`updateShopUser()` + mutations to `apps/back-office/src/features/shops/{repo,queries}.ts`
- [X] T051 [US4] Build `apps/back-office/src/features/shops/components/AddShopUserDialog.tsx` (name, email, role `select`) + role/status controls in the ShopDetailScreen roster; surface a **non-blocking warning** when disabling/removing a shop's only remaining manager (spec Edge Case — a warning, not a hard block); emit `shop_user_provisioned`/`shop_user_role_changed`/`shop_user_status_changed` telemetry (depends on T036, T050)

**Checkpoint**: Full roster management; disabled user refused live on the shop console.

---

## Phase 7: User Story 5 — Edit a shop's details (Priority: P5)

**Goal**: Edit name/contact_phone/notes; code immutable.

**Independent Test**: Edit name + contact details → persists in register/detail; code cannot be changed; blank name refused.

- [X] T052 [US5] Implement `updateShop(id, {name,contactPhone,notes}, actorSub)` (+ `admin.audit_log('shop.update')`) in `apis/edge-api/admin/src/shops/repository.ts` (depends on T014)
- [X] T053 [US5] Add `editShop` service method (code immutable; validate non-empty name → `400`) in `apis/edge-api/admin/src/shops/service.ts` (depends on T052)
- [X] T054 [US5] Create handler `apis/edge-api/admin/src/functions/shop-update-v1-patch.ts` (`PATCH /admin/v1/shops/{shopId}`, `200` `ShopDetailDTO`) + wire route/alarm in `serverless.yml`
- [X] T055 [P] [US5] Add `updateShop()` + `useUpdateShop` to `apps/back-office/src/features/shops/{repo,queries}.ts`
- [X] T056 [US5] Build `apps/back-office/src/features/shops/components/EditShopDialog.tsx` (name, contactPhone, notes; code shown read-only); emit `shop_updated` telemetry (depends on T036, T055)

**Checkpoint**: Shop details editable; code protected.

---

## Phase 8: User Story 6 — Remove a shop safely (Priority: P6)

**Goal**: Guarded hard-delete (dependent-free only); operated shops disabled instead.

**Independent Test**: Remove a shop with users → refused with disable-instead guidance; create an empty shop, remove it → gone + recorded; requires explicit confirmation.

- [X] T057 [US6] Implement `deleteShop(id, actorSub)` in `apis/edge-api/admin/src/shops/repository.ts` — guard: refuse if any `shop_staff` references it; else DELETE + `admin.audit_log('shop.delete')` (FK RESTRICT backstop) (depends on T014)
- [X] T058 [US6] Add `removeShop` service method (dependents → domain error → `409` with guidance) in `apis/edge-api/admin/src/shops/service.ts` (depends on T057)
- [X] T059 [US6] Create handler `apis/edge-api/admin/src/functions/shop-delete-v1-delete.ts` (`DELETE /admin/v1/shops/{shopId}`, `204`, `409` with dependents) + wire route/alarm in `serverless.yml`
- [X] T060 [P] [US6] Unit test delete guard (dependents refused; dependent-free deleted) in `apis/edge-api/admin/src/shops/service.test.ts` (depends on T058)
- [X] T061 [P] [US6] Add `deleteShop()` + `useDeleteShop` to `apps/back-office/src/features/shops/{repo,queries}.ts`
- [X] T062 [US6] Build `apps/back-office/src/features/shops/components/RemoveShopDialog.tsx` (`alert-dialog` explicit confirm) on the detail screen; emit `shop_deleted` telemetry (depends on T036, T061)

**Checkpoint**: All six stories independently functional.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T063 [P] Telemetry hygiene sweep — confirm every emitted event carries no PII beyond the subject id (no email/code/token), and handlers log actor `sub` + shop id only (SC-013, Principle VII)
- [X] T064 [P] Author the conventions doc (FR-024/SC-015): how a back-office capability spans the console + cold-path, and how shop-user provisioning stays consistent across Cognito + the platform record — in `docs/` (or `apps/back-office/README.md`)
- [X] T065 [P] Update the CLAUDE.md active-feature section for 009 (housekeeping)
- [X] T066 Full workspace `pnpm typecheck` + `pnpm test` + `turbo run build` + shellcheck + secret/PII sweep — all green (code-verifiable gate)
- [ ] T067 🧑‍💻 Apply infra delta `make apply ENV=dev` (admin Cognito IAM scoped to shop pool ARN + `SHOP_USER_POOL_ID`) — *abort if a pool would be replaced*
- [ ] T068 🧑‍💻 Commit the migration, then `make db-up ENV=dev` (public.shop status/contact cols; admin.audit_log)
- [ ] T069 🧑‍💻 Deploy both services: `make edge-deploy SERVICE=admin ENV=dev` and `make edge-deploy SERVICE=shop ENV=dev`
- [ ] T070 🧑‍💻 Run [quickstart.md](quickstart.md) live acceptance (SC-001…SC-015), including **007 sign-off closure**: SC-007 (007 SC-005b — served at active shop, refused when suspended/disabled) and SC-008 (007 SC-012 — disabled user refused) against product-created data
- [ ] T071 🧑‍💻 If any shop-web capability's verification state changed, update [docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md); then partial/full SC sign-off + commit

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: no dependencies — start immediately; T001–T006 all `[P]`.
- **Foundational (Phase 2)**: depends on Setup — **blocks all user stories**. Internal order: T007 → T014; T008/T009 → T010; T011/T012/T013 → T015; scaffold T017 → T018.
- **User Stories (Phase 3–8)**: all depend on Foundational. US1 (P1) is the MVP. US2–US6 each build on the slice base and the detail screen (US2's `ShopDetailScreen`, T036) for their UI controls — so US2 should land before US3/US4/US5/US6 UI tasks, though their **backend** tasks are independent and parallelizable.
- **Polish (Phase 9)**: T063–T066 after the stories you intend to ship; T067–T071 are operator-run and gated on the code-verifiable gate (T066).

### User Story Dependencies

- **US1 (P1)**: after Foundational. Independent. MVP.
- **US2 (P2)**: after Foundational. Independent (reads only).
- **US3/US5/US6**: after Foundational; backend independent; their **UI** attaches to US2's detail screen (T036).
- **US4 (P4)**: after Foundational; backend independent; UI attaches to US2's detail screen.

### Within Each User Story

- Repository (SQL) → service (logic/validation) → handler (edge) → serverless wiring.
- Backend service method before its unit test's assertions; frontend repo/queries before its screen/dialog.

### Parallel Opportunities

- All of Phase 1 (T001–T006) in parallel.
- In Phase 2: T008/T009/T011/T012/T013 in parallel; T016/T017/T019 in parallel.
- Backend repository methods across stories (T028, T037, T044, T052, T057) touch the **same** `repository.ts` — **not** `[P]` with each other; sequence them or expect merge coordination. Handlers (separate files) across stories **are** `[P]`.
- Frontend repo/queries additions (T025, T034, T041, T050, T055, T061) touch the same `repo.ts`/`queries.ts` — sequence them; the dialog components (separate files) are `[P]`.

---

## Parallel Example: Setup (Phase 1)

```bash
# All shared-package foundations at once (different files, no deps):
Task: "T002 shared-types shop DTOs + ShopLifecycleStatus"
Task: "T003 api-client write methods"
Task: "T004 design-system CRUD primitives"
Task: "T005 web-kit DataTable"
Task: "T006 telemetry event taxonomy"
```

## Parallel Example: User Story 4 backend

```bash
# Handlers are separate files → parallel; the shared repository.ts (T044) is serialized before them:
Task: "T046 shop-user-create handler"
Task: "T047 shop-user-update handler"
Task: "T049 roster service unit tests"
```

---

## Implementation Strategy

### MVP First (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational (migration + gate reconcile + slice base + scaffold).
2. Phase 3 US1 (create shop + provision manager).
3. **STOP & VALIDATE**: create a shop, sign the owner into the shop console, confirm served (T070 subset). This alone closes 007's positive-gate half.

### Incremental Delivery

Foundation → US1 (MVP, unblocks 007 positive gate) → US2 (register/detail) → US3 (lifecycle, unblocks 007 inactive-shop denial) → US4 (roster, unblocks 007 SC-012) → US5 (edit) → US6 (remove). Each ships independently valuable and keeps prior stories green.

### Notes

- `[P]` = different files, no incomplete-task dependency.
- The shared `repository.ts`, `service.ts`, `serverless.yml`, `repo.ts`, and `queries.ts` are written across multiple tasks — treat same-file tasks as serialized even when in different stories.
- Operator-run (🧑‍💻) steps are authored by Claude and executed by the operator (CLAUDE.md mode of work); everything code-verifiable (T001–T066) is done by Claude.
- 007's shop service + tests are edited **in this slice** (T008–T010) — a deliberate, compliant cross-slice edit (research R2).
