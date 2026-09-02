# Tasks: Shop Console Redesign

**Input**: Design documents from `/specs/057-shop-web-redesign/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md (all present)

**Tests**: Included — this repo's established convention (every prior feature) verifies each
slice with unit/container-backed tests before sign-off; tasks below follow that pattern.

**Organization**: Tasks are grouped by the seven user stories in `spec.md`, in priority order
(US1/US2 = P1, US3/US4/US5 = P2, US6/US7 = P3).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1–US7)

## Path Conventions

Web app per plan.md's Project Structure: `apps/shop-web/` (frontend), `apis/edge-api/shop/`
(cold-path backend), `apis/core-api/` (one narrow hot-path addition), plus shared packages
`packages/{shared-types,design-system,api-client,web-kit}`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new files/directories every later phase writes into.

- [X] T001 Create the forward-only migration skeleton at `db/migrations/<ts>_shop_console_redesign.sql`
- [X] T002 [P] Scaffold `apps/shop-web/src/theme/` and an empty shop-scoped token stub at `packages/design-system/src/tokens/shop.css`
- [X] T003 [P] Scaffold `packages/shared-types/src/supplier.ts` and `packages/shared-types/src/purchase-order.ts` (empty exports)
- [X] T004 [P] Scaffold `apis/edge-api/shop/src/suppliers/`, `apis/edge-api/shop/src/purchase-orders/`, `apis/edge-api/shop/src/team/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Schema, shared contracts, shared component gaps, and the shop token layer + third
pool verifier that every user story below depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T005 Write the full migration SQL in `db/migrations/<ts>_shop_console_redesign.sql`: `public.supplier`, `public.purchase_order`, `public.purchase_order_line` tables, plus `product.supplier_id` and `stock_movement.purchase_order_line_id` nullable columns (data-model.md)
- [X] T006 Inspect 055's committed refund table and add its initiator/actor column(s) (`initiated_by` enum + nullable `initiated_by_shop_staff_id`) in the same migration file (research.md R8) — depends on T005
- [X] T007 [P] Populate `Supplier` DTO in `packages/shared-types/src/supplier.ts` (id, shopId, name, contactEmail, contactPhone, createdAt, updatedAt)
- [X] T008 [P] Populate `PurchaseOrder`/`PurchaseOrderLine` DTOs in `packages/shared-types/src/purchase-order.ts` (status enum draft/submitted/received/partially_received; lines with orderedQty/receivedQty/unitCost)
- [X] T009 [P] Extend the existing refund DTO in `packages/shared-types/src/refund.ts` with `initiatedBy`/`initiatedByShopStaffId` and the shop-refund request/response shape (contracts/shop-console-redesign.contract.md)
- [X] T010 Audit `packages/design-system/src/ui/` against the mockup's component vocabulary (research.md R7) and add missing shadcn primitives: a responsive Sheet (drawer-on-mobile/dialog-on-desktop), Toast, a segmented Tabs control, a multi-step wizard progress rail
- [X] T011 [P] Define the shop-web-scoped token value layer in `packages/design-system/src/tokens/shop.css` (spacing `--pad`/`--rowpad`, single 8px radius, Geist typeface, the mockup's neutral-scale hex values) through the existing `tokens:gen`/`tokens:check` mechanism, deliberately omitting the mockup's `--warning` hue (research.md R3) — depends on T010
- [X] T012 [P] Wire `apps/shop-web`'s root layout to consume the new shop token layer in `apps/shop-web/src/theme/`
- [X] T013 Add the third (shop-pool) Cognito JWT verifier registration in `apis/core-api/internal/platform/auth/` (research.md R2), independently validated with its own pinned issuer
- [X] T014 Run the design-system AA-contrast guard (`check-tokens.mjs`) and `check-no-emerald.sh`/`check-no-jade.sh` against the new shop token layer; fix any failures — depends on T011

**Checkpoint**: Schema, DTOs, component gaps, the shop token layer, and the third pool verifier all exist. Every user story phase below can now proceed.

---

## Phase 3: User Story 1 - Redesigned dashboard with live counts (Priority: P1) 🎯 MVP

**Goal**: The dashboard shows the new visual design with real (not placeholder) pick-queue and
ready-for-pickup counts, a clickable needs-attention list, and a calm empty state.

**Independent Test**: Sign in as a shop operator; the home screen renders with the new design and
real counts; each needs-attention row navigates correctly; an empty shop shows a calm steady state.

### Tests for User Story 1

- [X] T015 [P] [US1] Test dashboard live-count rendering in `apps/shop-web/src/features/dashboard/__tests__/dashboard.test.tsx`
- [X] T016 [P] [US1] Test the needs-attention empty/steady state in `apps/shop-web/src/features/dashboard/__tests__/empty-state.test.tsx`

### Implementation for User Story 1

- [X] T017 [US1] Restyle the dashboard metric strip with the new tokens/shadcn primitives in `apps/shop-web/src/features/dashboard/DashboardOverview.tsx`
- [X] T018 [US1] Wire the dashboard to real pick-queue/ready-for-pickup counts via the existing `edge-api/shop` reads (no new endpoint) in `apps/shop-web/src/features/dashboard/DashboardOverview.tsx`
- [X] T019 [US1] Build the "needs attention" list (oldest-waiting orders + low-stock products, click-through) in `apps/shop-web/src/features/dashboard/NeedsAttention.tsx`
- [X] T020 [US1] Implement the calm empty/steady dashboard state in `apps/shop-web/src/features/dashboard/EmptyState.tsx`
- [X] T021 [US1] Remap any amber/warning styling on the dashboard to monochrome emphasis (research.md R3) in `apps/shop-web/src/features/dashboard/`

**Checkpoint**: Dashboard fully functional and independently testable — MVP deliverable.

---

## Phase 4: User Story 2 - Redesigned order queue & detail, true to Effy's model (Priority: P1)

**Goal**: Order queue and detail rebuilt in the new visual language, with no action offered the
platform can't perform (no capture, no carrier/tracking, no order-line editing).

**Independent Test**: Filter/search the queue, open an order, advance it through its lifecycle,
confirm the state change persists and is reflected in the queue; confirm no capture/carrier/
tracking control exists anywhere.

### Tests for User Story 2

- [X] T022 [P] [US2] Test order queue filter/search/tab counts in `apps/shop-web/src/features/orders/__tests__/order-queue.test.tsx`
- [X] T023 [P] [US2] Test that order detail renders no capture/carrier/tracking control (FR-012) in `apps/shop-web/src/features/orders/__tests__/order-detail.test.tsx`
- [X] T024 [P] [US2] Test bulk state-advance success-count summary in `apps/shop-web/src/features/orders/__tests__/bulk-actions.test.tsx`

### Implementation for User Story 2

- [X] T025 [US2] Restyle the order queue (tabs, saved views, filters, search, sortable table, empty state, pagination) in `apps/shop-web/src/features/orders/OrderQueue.tsx`
- [X] T026 [US2] Restyle order detail (pick list, status, destination/customer context, activity log), explicitly omitting payment-capture/carrier/tracking (FR-012) and line-editing/duplication (FR-013), in `apps/shop-web/src/features/orders/OrderDetail.tsx`
- [X] T027 [US2] Implement multi-select + bulk state-advance with a success-count summary in `apps/shop-web/src/features/orders/BulkActions.tsx`
- [X] T028 [US2] Remap risk-flag and "awaiting pick" badge colours to monochrome emphasis (research.md R3) across `apps/shop-web/src/features/orders/`

**Checkpoint**: Order queue + detail fully restyled and correct against the real fulfilment model — independently testable.

---

## Phase 5: User Story 3 - Redesigned catalog, product detail, stock/restock (Priority: P2)

**Goal**: Catalog list, product detail, add-product wizard, and the restock queue restyled, using
the existing product/stock model (no supplier/PO/cost fields yet — that's US6).

**Independent Test**: Browse/search the catalog, edit a product, confirm persistence; open the
restock queue and confirm it lists exactly the low-stock-flagged products.

### Tests for User Story 3

- [X] T029 [P] [US3] Test catalog search/filter results in `apps/shop-web/src/features/catalog/__tests__/catalog-list.test.tsx`
- [X] T030 [P] [US3] Test product detail edit-and-persist flow in `apps/shop-web/src/features/catalog/__tests__/product-detail.test.tsx`
- [X] T031 [P] [US3] Test restock queue lists exactly the flagged products in `apps/shop-web/src/features/restock/__tests__/restock-queue.test.tsx`

### Implementation for User Story 3

- [X] T032 [US3] Restyle the catalog list + search/filter in `apps/shop-web/src/features/catalog/CatalogList.tsx`
- [X] T033 [US3] Restyle product detail (details/pricing/media/inventory sections + edit sheets) in `apps/shop-web/src/features/catalog/ProductDetail.tsx`
- [X] T034 [US3] Restyle the 4-step add-product wizard in `apps/shop-web/src/features/catalog/AddProductWizard.tsx`
- [X] T035 [US3] Restyle the restock queue list (existing low-stock data only) in `apps/shop-web/src/features/restock/RestockQueue.tsx`

**Checkpoint**: Catalog/product/stock screens fully restyled — independently testable.

---

## Phase 6: User Story 4 - Consistent visual identity across the whole console (Priority: P2)

**Goal**: Every screen — including sign-in and the shared shell — runs on the imported tokens and
shadcn vocabulary, stays tablet-usable, and keeps the existing appearance control working.

**Independent Test**: Navigate every screen at desktop and tablet width, in both appearances;
confirm one consistent visual language and no leftover prior-design styling.

### Tests for User Story 4

- [X] T036 [P] [US4] Add an AA-contrast sweep test confirming every restyled screen passes in both themes, in `packages/design-system/tests/shop-theme-contrast.test.ts`

### Implementation for User Story 4

- [X] T037 [US4] Restyle the shared console shell (sidebar nav with badge counts, header search + theme toggle) in `packages/web-kit/src/console/ConsoleShell.tsx`
- [X] T038 [US4] Restyle the sign-in screen in `apps/shop-web/src/features/auth/SignIn.tsx`
- [X] T039 [US4] Verify/adjust tablet-width layout (SC-004) across dashboard/orders/catalog/restock, using the responsive Sheet primitive from T010
- [X] T040 [US4] Verify Light/Dark/Follow-System appearance persists across sign-out/sign-in in `apps/shop-web/src/features/auth/`
- [X] T041 [US4] Run the full AA-contrast + `check-no-emerald`/`check-no-jade` guard sweep across all restyled screens and fix any failures

**Checkpoint**: Whole console visually consistent, tablet-usable, theme-correct — independently testable end to end.

---

## Phase 7: User Story 5 - Shop-initiated refund/cancellation (Priority: P2)

**Goal**: A shop manager can initiate a refund/cancellation from order detail, reusing 055's
existing refund pipeline via the new shop-pool-authorized `core-api` route.

**Independent Test**: Initiate a refund with a reason; confirm status advances through 055's
existing states and is identical from the customer/back-office view of the same order.

### Tests for User Story 5

- [X] T042 [P] [US5] Go test for the shop-pool-authorized refund route (manager-only, own-shop-scoped) in `apis/core-api/internal/platform/refund/shop_refund_test.go`
- [X] T043 [P] [US5] Container-backed test proving a shop-initiated and a back-office-initiated refund produce byte-identical status on the same order, in `apis/core-api/internal/platform/refund/shop_refund_container_test.go`
- [X] T044 [P] [US5] Test that a non-manager shop-staff user sees refund status read-only with no action offered (FR-014b) in `apps/shop-web/src/features/orders/__tests__/refund-sheet.test.tsx`

### Implementation for User Story 5

- [X] T045 [US5] Implement `POST /v1/orders/{orderId}/shop-refund` in `apis/core-api/internal/platform/refund/`, calling the existing refund service and writing `initiated_by='shop'` (contracts/shop-console-redesign.contract.md)
- [X] T046 [US5] Wire the shop-pool verifier (T013) to this one route only; confirm every other route still rejects a shop-pool token
- [X] T047 [US5] Add the `shop_refund_initiated` telemetry event and a `core_api_shop_refund_failed` metric feeding 055's existing refund-failure alert
- [X] T048 [US5] Build the refund-initiation sheet (line quantities, reason, restock toggle) in `apps/shop-web/src/features/orders/RefundSheet.tsx`, calling the new endpoint via `@effy/api-client`
- [X] T049 [US5] Display refund/cancellation status identically to the customer/back-office view, sourced from the same record (FR-014a), in `apps/shop-web/src/features/orders/OrderDetail.tsx`
- [X] T050 [US5] Gate the refund action to `shop_manager` only in the UI (defense in depth; backend is authoritative per T046) in `apps/shop-web/src/features/orders/OrderDetail.tsx`

**Checkpoint**: Shop-initiated refunds work end-to-end, reusing 055's pipeline exactly — independently testable.

---

## Phase 8: User Story 6 - Suppliers & purchase orders for restocking (Priority: P3)

**Goal**: A shop manager can record suppliers, assign them to products, build purchase orders
from the restock queue, and receive them (fully or partially), updating stock with a paper trail.

**Independent Test**: Create a supplier, assign it, build a PO with quantities/cost, mark it
received, confirm stock increases and is traceable to the PO; repeat with a partial receive.

### Tests for User Story 6

- [X] T051 [P] [US6] Test supplier CRUD routes in `apis/edge-api/shop/src/suppliers/__tests__/suppliers.test.ts`
- [X] T052 [P] [US6] Container-backed test for purchase-order creation + full/partial receive updating stock in `apis/edge-api/shop/src/purchase-orders/__tests__/purchase-orders.container.test.ts`

### Implementation for User Story 6

- [X] T053 [US6] Implement supplier CRUD routes (`GET/POST /shop/v1/suppliers`, `GET/PATCH/DELETE /shop/v1/suppliers/{id}`) in `apis/edge-api/shop/src/suppliers/`
- [X] T054 [US6] Implement purchase-order routes (`GET/POST /shop/v1/purchase-orders`, `GET/PATCH /shop/v1/purchase-orders/{id}`) in `apis/edge-api/shop/src/purchase-orders/`
- [X] T055 [US6] Implement `POST /shop/v1/purchase-orders/{id}/receive` — creates `stock_movement` rows per line delta, increments `product.stock_on_hand`, sets the draft/submitted/received/partially_received status (data-model.md state machine)
- [X] T056 [US6] Extend `GET /shop/v1/restock` to group by supplier with an "Unassigned" bucket for products with no `supplier_id`
- [X] T057 [US6] Build the supplier create/edit sheet in `apps/shop-web/src/features/restock/SupplierSheet.tsx`
- [X] T058 [US6] Build the purchase-order build/submit flow (restock queue → select lines → quantities/unit cost → running total → submit) in `apps/shop-web/src/features/restock/PurchaseOrderBuilder.tsx`
- [X] T059 [US6] Build the purchase-order receive (full/partial) flow in `apps/shop-web/src/features/restock/ReceivePurchaseOrder.tsx`
- [X] T060 [US6] Add `purchase_order_created`/`purchase_order_received` telemetry events

**Checkpoint**: Supplier + purchase-order workflow fully functional — independently testable.

---

## Phase 9: User Story 7 - Shop manager manages their own team (Priority: P3)

**Goal**: A shop manager can invite, role-edit, and deactivate staff at their own shop only,
writing the same records back-office already owns.

**Independent Test**: Invite a staff member, confirm sign-in and shop-scoped access; deactivate
them; confirm the manager cannot touch another shop's staff or deactivate the last manager.

### Tests for User Story 7

- [X] T061 [P] [US7] Test team invite/role/deactivate routes, including own-shop-scope refusal and last-manager refusal, in `apis/edge-api/shop/src/team/__tests__/team.test.ts`
- [X] T062 [P] [US7] Test that a non-manager shop-staff user sees the team screen read-only/hidden (FR-019b) in `apps/shop-web/src/features/team/__tests__/team-roster.test.tsx`

### Implementation for User Story 7

- [X] T063 [US7] Implement `GET /shop/v1/team` in `apis/edge-api/shop/src/team/`
- [X] T064 [US7] Implement `POST /shop/v1/team/invite`, reusing 009's Cognito-first→DB-idempotent-upsert provisioning mechanism (research.md R5), in `apis/edge-api/shop/src/team/`
- [X] T065 [US7] Implement `PATCH /shop/v1/team/{staffId}/role` and `POST /shop/v1/team/{staffId}/deactivate` with own-shop-scope and last-manager refusals
- [X] T066 [US7] Build the team roster UI (invite/role/deactivate) in `apps/shop-web/src/features/team/TeamRoster.tsx`, manager-only actions
- [X] T067 [US7] Build the shop settings toggles panel (restyled) in `apps/shop-web/src/features/team/ShopSettings.tsx`
- [X] T068 [US7] Add `shop_staff_invited`/`shop_staff_deactivated` telemetry events

**Checkpoint**: Team management fully functional, own-shop-scoped — independently testable.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [X] T069 [P] Run full workspace `pnpm -r typecheck` + `pnpm -r test` and fix any regressions
- [X] T070 [P] Run `tokens:check`/AA-guard + `check-no-emerald.sh`/`check-no-jade.sh` once more across the whole shop-web surface
- [ ] T071 Run `quickstart.md`'s validation scenarios end-to-end locally
- [X] T072 [P] Update `docs/audiences/shop-capabilities.md` parity register for this feature
- [X] T073 Update CLAUDE.md's "Active feature" section with this feature's status

---

## Operator-Run Deployment Steps

Per this project's working agreement, the implementing agent authors migration SQL and Lambda/Go
source but does not run migrations or deploy against live state. These steps are listed for
completeness and operator tracking, not for the implementing agent to execute:

- [ ] T074 `make db-up ENV=dev` — apply the migration from T005/T006
- [ ] T075 `make edge-deploy SERVICE=shop ENV=dev` — deploy suppliers/purchase-orders/team routes
- [ ] T076 Deploy `core-api` with the new shop-pool verifier + refund route (`core-image-push && core-deploy`) — before any traffic depends on it
- [ ] T077 Live walk of `quickstart.md`'s US1–US7 scenarios + negative proofs against a real deployed environment

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories.
- **User Stories (Phase 3–9)**: All depend on Foundational. Independently testable per their own
  acceptance criteria; two pairs share an implementation file and are easiest done in order if one
  implementer is working alone:
  - **US5 (Phase 7)** adds the refund sheet to `OrderDetail.tsx`, the same file **US2 (Phase 4)**
    builds — sequence US2 → US5.
  - **US6 (Phase 8)** extends `RestockQueue.tsx`, the same file **US3 (Phase 5)** builds —
    sequence US3 → US6.
  - US1, US4, and US7 have no file overlap with any other story and can proceed in any order once
    Foundational is done.
- **Polish (Phase 10)**: Depends on all desired user stories being complete.
- **Operator Deployment Steps**: Depend on Polish; executed by the operator, not the agent.

### Within Each User Story

- Tests are written and expected to fail before implementation.
- Backend routes/services before the UI that calls them.
- Story complete (its own Independent Test passes) before moving to the next priority.

### Parallel Opportunities

- All Setup tasks marked [P] run in parallel.
- All Foundational tasks marked [P] run in parallel (after T005/T006, which are sequential on the
  same migration file, and after T010, which T011 depends on).
- Once Foundational completes: US1, US4, and US7 can start in parallel immediately; US5 waits on
  US2's `OrderDetail.tsx`; US6 waits on US3's `RestockQueue.tsx`.
- All tests marked [P] within a story run in parallel.

---

## Parallel Example: User Story 1

```bash
# Tests together:
Task: "Test dashboard live-count rendering in apps/shop-web/src/features/dashboard/__tests__/dashboard.test.tsx"
Task: "Test the needs-attention empty/steady state in apps/shop-web/src/features/dashboard/__tests__/empty-state.test.tsx"

# Then implementation (T017 first, T019/T020/T021 can follow in parallel once T017/T018 land):
Task: "Build the needs-attention list in apps/shop-web/src/features/dashboard/NeedsAttention.tsx"
Task: "Implement the calm empty/steady dashboard state in apps/shop-web/src/features/dashboard/EmptyState.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup.
2. Complete Phase 2: Foundational (blocks everything).
3. Complete Phase 3: User Story 1 (dashboard).
4. **STOP and VALIDATE**: run US1's Independent Test.
5. Demo if ready — the dashboard alone proves the new visual system end to end.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 (dashboard) → validate → demo (MVP).
3. US2 (orders) → validate → demo.
4. US3 (catalog/stock) → validate → demo.
5. US4 (visual consistency sweep) → validate — this is the point the whole console reads as one
   redesign, not three separate ones.
6. US5 (shop refunds) → validate → demo.
7. US6 (suppliers/PO) → validate → demo.
8. US7 (team management) → validate → demo.
9. Polish → operator deployment steps.

### Suggested MVP Scope

**User Story 1 (dashboard) only** — it is the cheapest, fastest proof that the new visual system
(chrome, typography, tokens, spacing) is fully in place, and it has zero dependency on any other
story.

---

## Notes

- [P] tasks touch different files with no unmet dependency.
- [Story] labels map every implementation/test task to its spec.md user story for traceability.
- Two file-sharing pairs (US2→US5 on `OrderDetail.tsx`, US3→US6 on `RestockQueue.tsx`) are called
  out above; every other story is fully independent.
- Verify tests fail before implementing.
- Stop at any checkpoint to validate a story independently before continuing.
- Colour law is non-negotiable throughout: no task in any phase introduces a UI hue beyond the
  monochrome ramp and the two existing semantic colours (error/success) — see research.md R3.
