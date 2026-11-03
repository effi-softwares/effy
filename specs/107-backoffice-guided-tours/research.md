# Research: Guided Tours in Back-Office (107)

Built on 106 (`specs/106-guided-tours/`), which is built and not yet deployed. Each decision below names what is reused
and what changes.

## R1 - Reuse 106's pieces as they are

**Decision**: back-office uses `TourStepView` (`@effy/design-system/ui`), everything in `@effy/web-kit/tour`
(provider, `AutoStart`, Help, All tours, `useTourPage`, `tourStateQueries`) and `@effy/edge-shared/tours` unchanged
in behaviour. No new component and no new library.

**Rationale**: FR-001. 106 put these in shared packages so that this slice adds only words, keys and wiring.

## R2 - Roles: one `roles` list on a step and on a tour

**Decision**: replace 106's boolean `managersOnly` with `roles?: readonly string[]`, on a step and on a whole tour.
- A **step** with `roles` is shown when the person holds **any** of them.
- A **tour** with `roles` does not start by itself, is not offered by Help or search, and is not listed in All tours
  for anyone else (FR-005).
- `TourProvider` takes `roles: readonly string[]` (the person's role keys) instead of `{ manager }`.
- The spec's marks map to role keys: **Admin or manager** → `["admin", "manager"]`, **Admin** → `["admin"]`, **Customer
  support** → `["csa"]`. The shop console's "Manager" → `["shop_manager"]`.
- shop-web is migrated in the same change (its 2 marked steps). Its words test now compares role marks too.

**Rationale**: three roles and an "only this role" mark (the read-only step) cannot be said with one boolean. One
list works for both consoles and any role added later.

**Alternatives**: `minRole` with a ranking (rejected: Customer support is not "below" in everything, and the
read-only step is for Customer support *only*); per-console flags (rejected: the engine would learn each console's
roles).

## R3 - Where a back-office person's record lives

**Decision**: the same table, `public.console_tour_state`, with `audience = 'admin'` (its CHECK already allows it), the
same `@effy/edge-shared/tours` service, and two routes in the **admin** service on the **staff** gateway:
`GET|PATCH /admin/v1/me/tours` with the back-office authorizer. The audience is fixed by the handler. A back-office
token cannot reach a shop row (FR-002).
- Staff gateway: **208 → 210 / 300** (70%; the alarm is at 75%).
- The `admin` stack has 53 functions. Two more stay well inside CloudFormation's 500 resources. `admin-promotions` was
  split out for that limit in 095, and the deploy would refuse rather than half-apply if it were reached.
- Path assignment: `admin` already owns `/admin/v1/me`.

## R4 - The Help button and search in back-office

**Decision**:
- `<TourHelpButton />` goes into `StaffShell`'s `headerActions` (back-office passes none today). Help's own menu is
  unchanged.
- The `?` key keeps opening Keyboard shortcuts. The Help button has no key.
- Back-office's `CommandPalette` gets **Tour this page** and **All tours**, found by "tour", "help" and "guide", as in
  shop-web.

## R5 - Tabs that are pages

**Decision**: a screen with sidebar tabs registers the tab's own tour key:
- `DeliveryScreen`: `delivery-coverage`, `delivery-courier`, `delivery-pricing`, `delivery-windows`, `delivery-days`,
  `delivery-hub`, from its `tab` search value.
- `CustomersScreen`: `customers` or `points-settings`.

Each tour's `path` + `search` (`{ tab: "pricing" }`) lets All tours open the right tab. A tab change is a page-key
change, so a running tour ends as closed (106 R13) and the new tab's tour may start by itself.

## R6 - Record pages and "the most recent one"

**Decision**: 106's `needsRecord` becomes an app-defined string, and back-office's `openRecord(kind)` handles 14 kinds (plus `finish`):
`order`, `round`, `customer`, `feedback`, `driver`, `vehicle`, `shop`, `product`, `import`, `review`, `promotion`,
`group`, `skin`, `address`.
- Each reads the first row of its own list's query (newest first where the list sorts by date, otherwise the list's
  default order) and navigates there.
- For `round`, it uses the first round on today's Dispatch.
- With none, it shows a toast ("There's no driver to show this tour on yet.") and starts nothing.

`finish` (Finish a product) opens the first Effy draft from Products' "Effy setting up" view.

## R7 - Analytics carry the role

**Decision**: `TourProvider` gets an optional `analyticsRole` and adds `role` to every tour event when it is set.
Back-office passes its role label (Administrator / Manager / Customer support, the account menu's own words). shop-web
does not pass it, so its events are unchanged. Back-office's `BackOfficeAnalyticsEvent` gains the four `tour_*` events
with `role` (FR-012).

## R8 - The two checks, shared

**Decision**: move 106's two shop-web tests into `@effy/web-kit/tour/testing` (Node-only, imported by tests alone).
- `checkToursAgainstSpec({ specPath, codeToKey, tours })` does the word-for-word comparison, now also comparing each
  step's role mark with the spec's "Shown when" column.
- `tourCoverage({ srcDir, routesDir, navFile, tours, ignoreRoutes })` follows every route to its screen and checks that
  it has a tour, that every step key exists, and that page-level keys are on their own screen.

shop-web's `tours.test.ts` and `tours.guard.test.ts` become thin callers, and back-office gets the same two. A third
back-office check walks every tour with `roles: ["csa"]` and fails if a step marked for another role would be shown
(SC-003).

**Rationale**: one guard for two consoles. Back-office's 45 routes are too many to check by eye.

## R9 - The words list

**Decision**: `apps/back-office/src/features/tours/tours.ts` holds `BACK_OFFICE_TOURS`, generated once from the spec's
tables like shop-web's. The words test keeps it identical afterwards. Back-office has no saved query cache, so
`registerTourMutationDefaults` is not wired. Writes are optimistic, and an offline write simply fails and is retried
on the next tour.

## R10 - Where steps point: keys

**Decision**: most steps use keys that already exist from 106:
- `page-title` (`PageHeader` 38 screens, `RecordHeader` 3), `page-more`, `page-activity`;
- `list.first-row`, `list.row-select`, `list.col.<id>` (`DataTable` 18 screens, `StaticTable` 10);
- `nav.<key>`, `header.*`;
- the `tour` prop on `Facet`, `ViewSelect`, `SearchBox`, `RecordSection` and `InspectorSection`.

The rest are named `<area>.<thing>` (`dispatch.needs-driver`, `delivery.checker`, `skin.readability`), about 150 in
all, added screen by screen. The guard (R8) proves each exists.

## R11 - The scan step with nothing to point at

**Decision**: Welcome step 5 ("Scan from anywhere") is a centred card (`target: null`). Back-office scanning is a
keyboard wedge (`ScanBox`) with no button. A scan that navigates mid-tour ends it as closed (106 R13).

## As built (2026-11-03)

- **`openRecord` follows the list, not a query** (supersedes R6's "first row of its list query"). It opens the record
  kind's list page in its own default order, waits for it to load, and follows the first link to a record of that
  kind, or clicks the list's first row (`list.first-row`). Fifteen hand-written list queries with their parameters would
  each drift from their screens. With no record, a toast says so and nothing starts.
- **Some steps point at a shared control**: round "take back" and "let it go ahead" are both in its More menu
  (`round.more`); a customer's "Remove points" and "Points activity" share `customer.more`; the shop's and the
  promotion's activity are in their More menus (`page-more`).
- **More shared parts take a `tour` prop**: `Panel`, `RecordNav`, `EditorSection` (web-kit), alongside 106's.
- **"On screen" now needs a size** (`isPresent`, both consoles): an empty wrapper (a notices box with nothing in it)
  is no longer something a step can point at.
- **Column steps use `list.col.<id>`** on `DataTable` / `StaticTable` headers: status, cleared, scanning, margin,
  waiting, set, missing, key, looks, usedIn, postcode, distance, today, window, account, action, points.
- **The checks are shared** (`@effy/web-kit/tour/testing`): shop-web's two tests now call them too. The guard was
  proven by deleting `hub.scan`.
