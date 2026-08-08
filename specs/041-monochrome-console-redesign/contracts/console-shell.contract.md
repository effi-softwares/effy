# Contract: Console Shell (dashboard structure)

**Surface**: `@effy/web-kit/console` (shared) → consumed by `apps/shop-web` and `apps/back-office`. One implementation, two consumers (Principle II).

## C1 — Structure
The authenticated shell adopts the shadcn `dashboard-01` shape:
- **App sidebar** (`Sidebar collapsible="icon"`): brand (`ConsoleBrand`) · role-aware nav (`NavList`, filtered by the surface's role union) · user menu + sign-out + appearance control (`ConsoleUserMenu`).
- **Site header**: current-location breadcrumb (`ConsoleHeader`) within a `SidebarInset`.
- **Main region**: the routed content.
- The shell stays generic over `TRole` and prop-driven (brand, nav, roles, identity, callbacks, controlled `sidebarOpen`) exactly as today — no per-app fork.

## C2 — Dashboard overview landing
Each console's landing route (`routes/app.tsx`) composes a shared overview scaffold:
- a **section-cards** row (operator-directed Principle V card exception — plan §"card-layout justification"; internal consoles only),
- an **interactive chart** (`chart` primitive, chart-1..5 hues), and
- a **data-table** slot,
each fed the console's own data, or **bounded placeholder data** clearly marked as such where a console has none yet. Placeholder data MUST NOT imply real operational numbers.

## C3 — Existing feature screens
Catalog, orders/fulfillment, shops, staff, catalog-schema, promotions, deliverability render **inside** the new shell with their current table/list/detail-row layouts and **unchanged behaviour** (FR-018). No card-ifying of these screens.

## C4 — Theming
Every screen uses only design-system tokens (C1–C6 of the tokens contract). Colour beyond the monochrome ramp appears only as the two semantic states and, inside charts, the chart hues (SC-007). Light/Dark/Follow-System all supported (SC-005).

## C5 — New shared primitive
`packages/design-system/src/ui/chart.tsx` (recharts wrapper) added and exported from `ui/index.ts`; `recharts` added as a dependency of `@effy/design-system`. No chart code is copied into an app.

## Verification
- `make shop-lint && make shop-test`; `make bo-lint && make bo-test`; web-kit + design-system suites; `pnpm -r typecheck`.
- Both consoles build; every existing screen reachable and functionally unchanged.
- Side-by-side: shop-web, back-office, and customer app read as one visual system (SC-003).
- Bundle/gate scripts for each web app stay within budget.
