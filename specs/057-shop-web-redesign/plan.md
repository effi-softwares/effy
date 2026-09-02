# Implementation Plan: Shop Console Redesign

**Branch**: `057-shop-web-redesign` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/057-shop-web-redesign/spec.md`

## Summary

Rebuild `apps/shop-web` on the visual language of an imported Claude Design mockup
(`Effy Shop Console.dc.html`) — shadcn-style components, the mockup's spacing/radius/typography
tokens, sidebar + header chrome — across every existing screen (dashboard, order queue/detail,
catalog, product detail, stock/restock), while reinterpreting the mockup's generic e-commerce
assumptions (Swedish VAT, carrier shipping, payment capture) against Effy's real model. Three
genuinely new capabilities are added on operator direction, each reusing an existing platform
mechanism rather than inventing a parallel one: shop-manager-initiated refunds/cancellations
(reusing 055's refund pipeline), supplier + purchase-order tracking for restocking (new
shop-scoped data), and full shop-scoped team management in shop-web (writing the same
`shop_staff`/`shop_role` records back-office already owns).

## Technical Context

**Language/Version**: TypeScript 5.x / React 19 (shop-web frontend); Node 22 + TypeScript
(cold-path additions in `apis/edge-api/shop`); Go 1.25 (one narrow hot-path addition in
`apis/core-api` — see Constitution Check, Principle III/IV).

**Primary Dependencies**: shadcn/ui (Radix base) + Tailwind v4; TanStack Router/Query/Table/
Form/Store (existing shop-web spine, unchanged); Serverless Framework + Lambda on arm64
(`edge-api/shop`); Gin + pgx/v5 (`core-api`, existing 055 refund service, extended).

**Storage**: PostgreSQL 16, Goose migrations, forward-only. New tables `public.supplier`,
`public.purchase_order`, `public.purchase_order_line`; new nullable columns on
`public.product` (`supplier_id`), `public.stock_movement` (a purchase-order-line reference),
and the existing 055 refund table (an initiator/actor reference) — exact column set confirmed
against 055's committed schema at task time (see research.md R8).

**Testing**: Vitest + Testing Library for `apps/shop-web` (existing pattern, 139 tests at 041);
Vitest for `apis/edge-api/shop` (existing pattern, 172 tests at 047); Go `testing` +
container-backed tests for the `core-api` refund-initiation addition, following 055's own
container-test pattern for its refund state machine.

**Target Platform**: Web SPA, desktop and tablet-width browsers (Chrome/Safari/Firefox current),
matching the shop audience's tablet-first posture (014).

**Project Type**: web (existing frontend `apps/shop-web` + existing cold-path service
`apis/edge-api/shop`, plus one narrowly-scoped hot-path addition to `apis/core-api`).

**Performance Goals**: No new latency budget beyond what 055's refund pipeline and 054's stock
model already meet; order/catalog filtering and search remain client-visible-instant (no full
page reload) per SC-003, consistent with the existing TanStack Query-backed list screens.

**Constraints**: WCAG AA in both appearances (non-negotiable); monochrome ramp + exactly two
semantic colours, no third hue as a UI colour (non-negotiable, Principle V); tablet-width floor
(SC-004); the refund-initiation path MUST NOT introduce an auth proxy or forward another pool's
token (Principle IV, non-negotiable).

**Scale/Scope**: Single-shop data volumes (hundreds to low thousands of orders/products per
shop, not platform-wide); ~9 primary screens (dashboard, orders list, order detail, catalog
list, product detail, add-product wizard, restock/purchase-orders, team/settings) plus roughly
20 dialog/sheet variants (refund, receive stock, edit-lines, cancel, return, note, tags, capture,
fulfil, archive, invite-staff, edit-role, create-supplier, create-PO, receive-PO, and the
existing product-edit sheets).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **I. Spec-Driven Development** — PASS. This plan follows a committed `spec.md`; `tasks.md`
  follows this plan; no code precedes the artifact chain.

- **II. Monorepo with Shared Contracts** — PASS, with one recorded token-value exception (see
  Complexity Tracking). New DTOs (`Supplier`, `PurchaseOrder`, `PurchaseOrderLine`, the
  shop-refund request/response, team invite/role-update requests) are added to
  `packages/shared-types` and consumed via `@effy/api-client` — never hand-redefined in
  `apps/shop-web`. Every new UI surface is built from `@effy/design-system/ui` (shadcn
  primitives) and `@effy/web-kit/console` (`ConsoleShell`, nav, session guard) — no bespoke
  hand-rolled component duplicates a shadcn primitive that already covers the need (FR-002).
  Where the design introduces a component pattern the shared package doesn't yet have (a
  responsive sheet/dialog, a multi-step wizard progress rail, toast notifications, a segmented
  tab control), it is added **to** `@effy/design-system/ui`, not copy-pasted shop-web-local
  (research R7).

- **III. Dual-Path Backend Discipline** — PASS, explicitly justified per feature. All new
  low-frequency shop CRUD — suppliers, purchase orders, team management — is served by the
  existing cold-path service `apis/edge-api/shop` (Principle III's default for ops/admin CRUD).
  The one exception is refund/cancellation **initiation**: it MUST settle through 055's existing
  refund state machine, whose Stripe secret lives only in `apis/core-api` (hot path). Rather than
  duplicate that machine or add a cold-path→hot-path service call, `core-api` gains a narrowly
  scoped **third** per-pool JWT verifier (shop pool) on exactly one endpoint — the same shape
  055 used when it added a back-office verifier to `core-api` for the identical reason ("the
  payment secret lives there and nowhere else"). This is a repeat of an already-approved pattern,
  not a new one (research R2).

- **IV. Auth Isolation** — PASS. The new shop-pool verifier on `core-api` is validated
  independently with its own pinned issuer, exactly like the existing customer and back-office
  verifiers already there — no forwarding, no auth proxy, and a shop-pool token remains rejected
  by every other pool-scoped route. Refund initiation is gated by `shop_manager` in
  `cognito:groups` **and** the platform's own `shop_staff`/`shop_role` record (the claim is
  origin, the record is authoritative) — the same two-part check the existing shop RBAC gate
  already uses for every other action (FR-021).

- **V. Native-Feel, Consistent Design** — CONDITIONAL PASS, one recorded exception (Complexity
  Tracking). Non-negotiable floor unchanged and unmodified: the monochrome ramp, exactly two
  semantic colours (error/success only), WCAG AA in both appearances, dark mode
  required-and-selectable. The imported design's third "warning" hue (used for "Awaiting pick"
  order status and low-stock/medium-risk indicators) is **remapped to monochrome emphasis**
  (bold weight, border, or the existing muted-foreground/foreground contrast) rather than
  shipped as a new UI colour — the identical fix 041 already applied to shop-web's amber warning
  usage. The design's alternate "Indigo"/"Evergreen" primary options and its density toggle are
  confirmed Claude-Design authoring scaffolding (visible in the file's own `data-props` schema,
  never surfaced as a real app control) and are not implemented (spec Assumptions). The mockup's
  own internal "Tokens" screen — a raw colour-swatch/typography/button gallery, structurally
  identical to a Storybook page — is **excluded entirely**: nothing on it maps to a shop
  operator task, and it is Claude-Design's own component-preview page, not a console feature
  (research R6). No-card-layout doctrine: the dashboard's metric strip + needs-attention list +
  latest-orders table is tabular/sectioned, not tiled cards — consistent with the existing
  doctrine, no new card layout introduced.

- **VI. Layered Architecture & Explicit Wiring** — PASS. Every new capability (suppliers,
  purchase orders, team management, refund initiation) follows the existing three-layer slice
  (handler → service → repository) already used throughout `edge-api/shop` and `core-api`; raw
  SQL via pgx/v5 or the cold path's existing query pattern, no ORM; explicit wiring, no DI
  framework. Web state: TanStack Query remains the source of truth for all server data (orders,
  products, suppliers, purchase orders, team); TanStack Store carries only genuine client state
  (open sheet/dialog kind, wizard step, table filters, selection) — no server data is hand-cached
  in component state, matching the existing shop-web pattern.

- **VII. Observability & Telemetry** — PASS, telemetry declared. New product events:
  `shop_refund_initiated`, `purchase_order_created`, `purchase_order_received`,
  `shop_staff_invited`, `shop_staff_deactivated`. New metrics: request latency/error rate on the
  new `edge-api/shop` routes via the existing Prometheus middleware pattern, plus a
  `core_api_shop_refund_failed` counter feeding the same alert 055 already built for refund
  failures (no new alert channel). Whether `apps/shop-web` has PostHog initialised at all is
  confirmed in research (R9); if not yet wired, this plan does not newly block on it (matching
  the platform-wide precedent of recording, not silently absorbing, that gap).

**Gate result: PASS**, with two recorded, narrowly-scoped exceptions — see Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/057-shop-web-redesign/
├── plan.md              # This file (/speckit-plan command output)
├── research.md          # Phase 0 output (/speckit-plan command)
├── data-model.md         # Phase 1 output (/speckit-plan command)
├── quickstart.md        # Phase 1 output (/speckit-plan command)
├── contracts/           # Phase 1 output (/speckit-plan command)
└── tasks.md             # Phase 2 output (/speckit-tasks command - NOT created by /speckit-plan)
```

### Source Code (repository root)

```text
apps/shop-web/
├── src/
│   ├── features/
│   │   ├── dashboard/           # EXISTING (041) — restyled, live counts (FR-006/FR-007/FR-008)
│   │   ├── orders/              # EXISTING (020) — restyled queue+detail; refund action added (FR-014)
│   │   ├── catalog/             # EXISTING (016/054) — restyled list/detail/wizard
│   │   ├── restock/             # EXISTING (054) — restyled; gains supplier + purchase-order UI
│   │   └── team/                # NEW — shop-scoped team management (FR-019)
│   ├── components/              # shop-web-local composition only; primitives from @effy/design-system/ui
│   └── theme/                   # NEW — shop-web token value layer (see Constitution Check, Principle V)
└── tests/

apis/edge-api/shop/
├── src/
│   ├── suppliers/                # NEW
│   ├── purchase-orders/          # NEW
│   ├── team/                     # NEW — invite/role/deactivate, own-shop scoped, reuses 009's pattern
│   ├── fulfillments/              # EXISTING (020) — unchanged, restyle only
│   ├── products/                 # EXISTING (016/054) — minor: supplier_id field
│   └── ...
└── tests/

apis/core-api/
├── internal/platform/refund/     # EXISTING (055) — gains shop-pool-authorized initiation path
├── internal/platform/auth/       # EXISTING — gains third (shop) per-pool verifier registration
└── cmd/...

packages/shared-types/src/
├── supplier.ts                   # NEW
├── purchase-order.ts             # NEW
└── refund.ts                     # EXTENDED — shop-initiation request/response shape

packages/design-system/
└── src/tokens/shop.css           # NEW — shop-web-scoped token value layer
```

**Structure Decision**: Existing web-application layout (`apps/<surface>` frontend + `apis/edge-api/<service>`
cold-path backend) is reused as-is; no new top-level project. The one structural addition is a
shop-web-scoped token layer inside the existing `packages/design-system` package (kept in the
shared package, not shop-web-local, per Principle II) and a narrow extension inside
`apis/core-api`'s existing auth/refund internals (kept inside the existing hot-path service, not
a new service).

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Shop-web-specific design-token **values** (spacing scale, single 8px radius, Geist typeface, exact neutral hex steps) diverge from the shared design-system's current values, while colour law (monochrome ramp, two semantic colours, AA) and the shared component primitives stay identical and shared | Explicit operator direction for this feature: adopt the imported design's full token set, "no need to stick with current ones" | Forcing shop-web to keep back-office's exact current spacing/radius/typeface values would silently override that direction. The values live in a shop-scoped layer **inside** the one shared `@effy/design-system` package (same variable names, same `tokens:check`/AA-guard mechanism) rather than being copy-pasted shop-web-local — back-office is untouched and no logic is forked, only values |
| `apis/core-api` gains a third per-pool JWT verifier (shop pool), scoped to exactly one refund-initiation route | Shop-initiated refunds must settle through 055's existing refund state machine, whose Stripe secret exists only in `core-api` | A cold-path (`edge-api/shop`) → hot-path (`core-api`) service call was considered and rejected: it would introduce a new inter-service trust boundary the platform doesn't otherwise have, when 055 already established — and got right — the pattern of adding a second (here, third) narrowly-scoped pool verifier directly on `core-api` for the identical reason |
