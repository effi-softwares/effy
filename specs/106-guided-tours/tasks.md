---
description: "Task list for 106 - Guided Tours in the Shop Console"
---

# Tasks: Guided Tours in the Shop Console

**Input**: Design documents from `specs/106-guided-tours/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md),
[contracts/tours-api.md](contracts/tours-api.md), [contracts/tour-ui.md](contracts/tour-ui.md), [quickstart.md](quickstart.md)

**Tests**: The spec makes three checks requirements (FR-001 and FR-019 "caught before release", FR-017 limits,
SC-001 "an automatic check fails…"), so guard and unit tests are included where they enforce a requirement. No
other test suites are added.

**Organization**: Grouped by user story. US1 and US2 (both P1) make up the MVP.

**Words**: Every step title and text comes **verbatim** from spec.md › Tour Inventory. Copy it; never paraphrase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US6 from spec.md

---

## Phase 1: Setup (shared contracts and exports)

- [X] T001 [P] Create `packages/shared-types/src/tours.ts` with `ConsoleTourSeenDTO`, `ConsoleTourStateDTO`, `ConsoleTourPatch`, `TOUR_OUTCOMES`, `TOUR_KEY_RE = /^[a-z0-9][a-z0-9-]{0,39}$/`, `TOUR_VERSION_MAX = 1000`, `TOUR_STATE_MAX_KEYS = 100`, `EMPTY_TOUR_STATE`, per data-model.md, and export it from `packages/shared-types/src/index.ts`
- [X] T002 [P] Add the `"./tours": "./src/tours/index.ts"` export to `apis/edge-api/shared/package.json`
- [X] T003 [P] Add the `"./tour": "./src/tour/index.ts"` export to `packages/web-kit/package.json`, mirroring the existing `./activity-log` entry

---

## Phase 2: Foundational (blocks every story)

**Purpose**: storage, routes, the step component and the tour engine. No page has a tour yet.

### Storage and routes

- [X] T004 Write the migration `db/migrations/20261103120000_console_tour_state.sql` (`-- +goose Up` only, header comment saying what it is for): table `public.console_tour_state (audience text NOT NULL CHECK (audience IN ('shop','admin')), subject text NOT NULL, offer_tours boolean NOT NULL DEFAULT true, seen jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(seen)='object'), updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (audience, subject))`; no foreign key; no grants (the baseline default privileges cover it). Do not edit any committed migration.
- [X] T005 [P] Implement `parseTourPatch(body)` in `apis/edge-api/shared/src/tours/validate.ts`: exactly one of {tour+version+outcome} / {offerTours} / {reset:true}; key per `TOUR_KEY_RE`, version an integer from 1 to `TOUR_VERSION_MAX`, outcome in `TOUR_OUTCOMES`; returns `{ value } | { error: string }` naming the field (contracts/tours-api.md 400 rows)
- [X] T006 [P] Unit-test every 400 case and every accepted shape in `apis/edge-api/shared/src/tours/validate.test.ts`
- [X] T007 Implement the one reader/writer in `apis/edge-api/shared/src/tours/store.ts` using `query` from `@effy/edge-shared` with raw SQL: `readTourState(audience, subject)` (no row → `EMPTY_TOUR_STATE`); `writeTourState(audience, subject, patch)` as an `INSERT … ON CONFLICT (audience, subject) DO UPDATE` that merges `seen || jsonb_build_object($tour, jsonb_build_object('v',$v,'outcome',$o,'at',now()))`, or sets `offer_tours`, or sets `seen='{}'`, with `updated_at=now()`, `RETURNING offer_tours, seen`; refuse a merge that would exceed `TOUR_STATE_MAX_KEYS` by checking the key count inside the statement (`WHERE` on the `DO UPDATE`) and returning a `full` result; map rows to `ConsoleTourStateDTO` explicitly (no row type leaks)
- [X] T008 Add `apis/edge-api/shared/src/tours/service.ts` (research R15): `getTourState(audience, sub)` and `changeTourState(audience, sub, body)` (parse → write → `{ ok, state } | { refused: "invalid", message } | { refused: "full" }`); export the service functions, `parseTourPatch` and the types from `apis/edge-api/shared/src/tours/index.ts` (handlers never import `store.ts`)
- [X] T009 [P] Container test in `apis/edge-api/shared/src/tours/store.container.test.ts`: no row reads empty; first write creates the row; two tours merge without loss; a later outcome overwrites the earlier one; reset empties `seen` but keeps `offer_tours`; the 101st key is refused; an `admin` row is not read with `shop` (local Postgres per memory "container tests without Docker")
- [X] T010 [P] Guard in `apis/edge-api/shared/src/tours/tours.guard.test.ts`: fail any file under `apis/edge-api/` other than `shared/src/tours/store.ts` (and its tests) that contains `console_tour_state`
- [X] T011 [P] Handler `apis/edge-api/shop/src/functions/shop-tours-v1-get.ts`: `preamble`, `subject` (401 if absent), `getTourState('shop', sub)`, `json(200, …)`, catch → `scope.log.error({ err, sub })` + `unavailable(scope)` (shape of `shop-me-v1-get.ts`)
- [X] T012 [P] Handler `apis/edge-api/shop/src/functions/shop-tours-v1-patch.ts`: `parseJsonBody` → `changeTourState('shop', sub, body)`: `invalid` → 400 `ValidationFailed` with its message; `full` → 409 problem type `https://effyshopping.com/problems/tour-state-full` (kebab-case like every other problem type); ok → 200 with the new state; 401/503 as GET
- [X] T013 Add `shopToursV1Get` (GET) and `shopToursV1Patch` (PATCH) at path `/shop/v1/me/tours`, with the shop JWT authorizer (`${ssm:/effy/${sls:stage}/edge/authorizer/shop_id}`) and descriptions citing 106, to `apis/edge-api/shop/serverless.yml`, next to `shopNotificationPrefsV1*`
- [X] T014 [P] Handler tests in `apis/edge-api/shop/src/functions/shop-tours-v1.test.ts` (service mocked): 401 without subject; 400 on two changes / none / bad key / bad version; 409 on full; 200 passes `'shop'` as the audience (never from the body)
- [X] T015 Run `apis/edge-api/shared/src/lib/gateway-capacity.contract.test.ts` and confirm shared reads 167 / 300; add the two routes to `docs/api/path-assignment.md` under the shop service

### The step component (design-system)

- [X] T016 Build `packages/design-system/src/ui/tour.tsx` per contracts/tour-ui.md: `TourStepView` (props `open, target, above, side, title, text, step, of, onBack, onNext, onClose`) made of `TourSpotlight` (fixed full-screen layer with `overlayClassName` look, `clip-path` polygon with a 6px-padded rounded hole for `target` and one hole per `above` element; catches pointer events except over `above` holes), `TourCard` (Radix `Popover` with `open`, `PopoverAnchor virtualRef={{ current: target }}`, the existing `PopoverContent` classes plus `w-80 max-w-[calc(100vw-32px)]`, `onInteractOutside`/`onPointerDownOutside` prevented, `onEscapeKeyDown` → `onClose`), a centred variant using the design system's `Dialog` content when `target` is null, and the parts `TourTitle`, `TourDescription`, `TourFooter`, `TourPrev` (ghost, hidden at step 1), `TourNext` ("Next" / "Done"), `TourClose` (icon ✕, `aria-label="Close tour"`), `TourStepCounter` ("Step N of M"); `role="dialog"` `aria-modal` labelled and described; ←/→ bound while open; hole re-measured on `resize`, `scroll` (capture) and a `ResizeObserver` on the target; tokens only
- [X] T017 Export the tour parts from `packages/design-system/src/ui/index.ts` and run `pnpm --filter @effy/design-system test` (token, shape and usage guards) until green

### The engine (web-kit)

- [X] T018 [P] `packages/web-kit/src/tour/define.ts`: `TourDef` / `TourStepDef` types (data-model.md) and `defineTours()` (identity; in dev, asserts unique keys, `TOUR_KEY_RE`, ≤ 12 steps, title ≤ 40, text ≤ 220)
- [X] T019 [P] Pure helpers in `packages/web-kit/src/tour/engine.ts`: `isPresent(el)` (connected, non-empty `getClientRects`, not inside `[hidden]` or `[inert]`; **`aria-hidden` is deliberately not tested**, research R2/R7); `resolveTarget(target)` (for each key in order, `document.querySelectorAll('[data-tour="…"]')` and take the **first present** element, so responsive twins resolve to the visible one; `null` target → centred); `stepVisible(step, { manager })`; `nextShown(tour, from, dir, ctx)`; `shouldOffer(tour, state)` and `isRevised(tour, state)` (data-model.md offer rule; `welcome` uses the same rule, the switch suppresses it and a raised version re-offers it); `welcomeFirst(tours, state)` (precedence); `tourStatus(query)` → `"loading" | "ready" | "error"` (`isSuccess` → ready, `isError` → error)
- [X] T020 [P] Unit tests in `packages/web-kit/src/tour/engine.test.ts` (jsdom): manager-only skipped for staff; absent and hidden targets skipped; stand-in key used when the first is hidden; **twins**: two elements with one key, the first hidden, resolves to the second; an element under `aria-hidden` still counts as present; counter counts only shown steps; all steps absent → the empty card (`EMPTY_TOUR_SENTENCE`); offer rule for absent / lower version / equal version / `offerTours=false`, including `welcome` under the switch and with a raised version; `tourStatus` for pending / success / error
- [X] T021 `packages/web-kit/src/tour/store.ts`: a TanStack Store `{ page: { key, status } | null, active: { key, via, index, shown } | null, invitation: { key, revised } | null, pendingStart: { key, via } | null, allToursOpen: boolean }` with action functions (no React)
- [X] T022 `packages/web-kit/src/tour/TourProvider.tsx`: props per contracts/tour-ui.md (`tours, roles, state, write, openRecord, onEvent`); `start(key, via)` (sets `pendingStart`; runs only once `page.status === "ready"` **and** the opener has closed: after the caller's `onCloseAutoFocus`, or two animation frames after its `open=false`, whichever comes first (research R7); writes `outcome: "closed"` **at once** (research R13); then resolves the first shown step, or shows the empty card with `EMPTY_TOUR_SENTENCE` and only Done when every step is skipped; `scrollIntoView({ block: "center", inline: "nearest", behavior })` honouring `prefers-reduced-motion`, renders `TourStepView`); Next/Back via `nextShown`; Done → `write({ tour, version, outcome: "finished" })`; ✕/Esc ends it (already recorded as closed); a change of `page.key` or the provider unmounting ends a running tour as closed (R13); a centred step's `Dialog` must be gone before the next step resolves; restores focus on end; collects `[data-tour-above]` elements for `above`; a `MutationObserver` on `main` advances (or ends) when the current target stops being present; computes the invitation from `welcomeFirst` / `shouldOffer` once `state.isSuccess` and `page.status === "ready"` (no invitation when the state read failed or the page errored)
- [X] T023 [P] `packages/web-kit/src/tour/useTourPage.ts`: `useTourPage(key, { status })` sets `page` on mount and on change, and clears it on unmount; screens pass `status: tourStatus(mainQuery)`
- [X] T024 [P] `packages/web-kit/src/tour/TourInvitation.tsx`: a fixed bottom-right card (design-system `Button`s; on a phone, a bottom drawer-style card within the safe area) saying "Take a quick tour of {title}?" (revised: "This page has changed. Take the new tour?"), with **Take the tour** · **Not now**; Not now → `write({ outcome: "declined" })`; a `pointerdown` inside `main` outside the card, or a key that types or activates (`Enter`, `Space`, a printable character) while focus is in `main`, also counts as declined; **`Tab`, `Shift+Tab`, arrows, `Escape` and lone modifier keys do not** (research R7, FR-014); never focus-steals; `data-tour-above` is not set on it
- [X] T025 [P] `packages/web-kit/src/tour/TourHelpButton.tsx`: header icon button (`CircleHelp`, `aria-label="Help"`, `data-tour="header.help"`) opening the design-system `DropdownMenu`: **Tour this page** (disabled while the page is loading; when it errored, disabled with the hint "The tour is available once this page loads."; the start is queued as `pendingStart` and runs after the menu has closed), **Welcome tour**, **All tours…**, a checkbox item **Offer tours on new pages** (`write({ offerTours })`), **Show every tour again** (`write({ reset: true })`)
- [X] T026 [P] `packages/web-kit/src/tour/AllToursDialog.tsx`: the design-system `Dialog` listing every tour (title, "Seen" / "New", **Start**); Start on another page's tour → `openRecord(kind)` for `needsRecord` tours, or navigation via the tour's `path`, then `start(key, "all-tours")`, which runs once the dialog has closed and that page is ready
- [X] T027 `packages/web-kit/src/tour/index.ts`: export `defineTours`, the types, `TourProvider`, `useTourPage`, `useTours`, `TourHelpButton`, `TourInvitation`, `AllToursDialog`
- [X] T028 [P] Shared keys in web-kit: `data-tour="page-title"` on `PageHeader`'s title block in `packages/web-kit/src/patterns/Page.tsx` **and** on `RecordHeader`'s title block in `packages/web-kit/src/patterns/Record.tsx` (the order and product pages), and an optional `tour?: string` prop on `MoreActions` in `packages/web-kit/src/patterns/MoreActions.tsx` rendered as `data-tour` on its trigger (both the dropdown and the phone-drawer trigger)

### shop-web plumbing

- [X] T029 [P] Shared state (research R14): `packages/web-kit/src/tour/state.ts` exports `tourStateQueries({ load, save })` → `stateQuery` (key `["tours","me"]`, `staleTime: Infinity`), `useTourWrite()` (`mutationKey: ["tours","write"]`, optimistic `setQueryData`, replaced by the response, rolled back on error) and `registerTourMutationDefaults(queryClient)` (`setMutationDefaults(["tours","write"], { mutationFn: save })`). In shop-web: `apps/shop-web/src/features/tours/repo.ts` holds only the two fetch functions (`GET`/`PATCH /shop/v1/me/tours`, typed with `ConsoleTourStateDTO`) and calls `tourStateQueries`; `apps/shop-web/src/lib/query-persist.ts` calls `registerTourMutationDefaults` before `persistQueryClient` and `queryClient.resumePausedMutations()` once its restore promise resolves, so an offline decline survives a reload (research R11)
- [X] T030 Create `apps/shop-web/src/features/tours/tours.ts` exporting `SHOP_TOURS = defineTours([])` and `TOUR_PATH` (tour key → route path for All tours), filled per story below

**Checkpoint**: routes, component and engine exist; the shop service returns `{ offerTours: true, seen: {} }`.

---

## Phase 3: User Story 1 - A new team member learns a page from its tour (P1) 🎯 MVP

**Goal**: every shop-web page offers its own tour once, and the tour outlines and explains each part.

**Independent test**: as a person with no history, open Orders, take the tour through all steps, and reload; it is
not offered again, on any device.

- [X] T031 [US1] Wire the provider in `apps/shop-web/src/routes/app.tsx`: `TourProvider` inside `LiveProvider` with `tours={SHOP_TOURS}`, `roles={{ manager: roles.includes("shop_manager") }}`, `state={useQuery(stateQuery)}`, `write={useTourWrite().mutate}`, `onEvent={() => {}}` (US5 replaces it); `<TourInvitation />` in `overlays`
- [X] T032 [P] [US1] Orders · Queue tour (`orders-queue`, OQ 1–7): add `data-tour` keys `orders.view-switch` (the `Segmented` in `apps/shop-web/src/features/fulfillment/OrderListScreen.tsx`), `orders.collection` (the `QueueDescription` line), `orders.lane-new` / `orders.lane-picking` / `orders.lane-ready` (lane sections in `apps/shop-web/src/features/fulfillment/components/OrderQueue.tsx`), `orders.left-shop` (`apps/shop-web/src/features/fulfillment/components/LeftShop.tsx`), `MoreActions tour="page-more"`; call `useTourPage(view === "table" ? "orders-table" : "orders-queue", { status: tourStatus(query) })`; add the tour to `tours.ts`
- [X] T033 [P] [US1] Orders · Table tour (`orders-table`, OT 1–6): keys `orders.status` (ViewSelect), `orders.search` (`apps/shop-web/src/features/fulfillment/components/OrderSearchBox.tsx`), `orders.filters` (wrapper around the three Facets, `max-lg:hidden` kept) with the stand-in `orders.filters-button` (the Filters button), `orders.row-select` and `orders.first-row` (first row's tick box and first row in `apps/shop-web/src/features/fulfillment/components/OrderTable.tsx`); tour in `tours.ts` with step 3 `target: ["orders.filters", "orders.filters-button"]`
- [X] T034 [P] [US1] Today tour (`today`, T 1–9): `useTourPage("today", { status: tourStatus(today) })` in `apps/shop-web/src/features/today/TodayScreen.tsx`; keys `today.quick-actions`, `today.print` on the two buttons, `MoreActions tour="page-more"`; `today.collection` in `apps/shop-web/src/features/today/CollectionBand.tsx`; `today.next` (Do this next), `today.now` (Now bar), `today.later` (Later today), `today.yesterday` in `apps/shop-web/src/features/today/DayLine.tsx`; tour in `tours.ts`
- [X] T035 [P] [US1] An order tour (`order`, OD 1–12, all of them; steps 4, 7 and 11 are skipped by presence until their parts appear): `useTourPage("order", { status: tourStatus(detailQuery) })` in `apps/shop-web/src/features/fulfillment/OrderDetailScreen.tsx`; keys `order.next-step` (`apps/shop-web/src/features/fulfillment/components/StateControl.tsx`), `order.pick-list`, `order.bags`, `order.where`, `order.money`, `order.notes`, `order.tags` on their sections (OrderDetailScreen / `PackBags.tsx` / `OrderNotesAndTags.tsx`), `order.cant-supply` (the "Can't supply…" control, first line only, in `apps/shop-web/src/features/fulfillment/components/PickLine.tsx` or `StateControl.tsx`), `order.courier-pickup` (`apps/shop-web/src/features/fulfillment/components/CourierPickup.tsx`), `order.refund` (the Refund entry rendered only when `canRefund`, in `OrderDetailScreen.tsx`), `MoreActions tour="page-more"`; step 1 targets `page-title` (on `RecordHeader`, T028); step 11 `managersOnly`; tour `needsRecord: "order"` in `tours.ts`
- [X] T036 [P] [US1] Catalog · Products tour (`catalog`, C 1–8): `useTourPage` in `apps/shop-web/src/features/catalog/CatalogListScreen.tsx`; keys `catalog.new`, `catalog.search`, `catalog.status`, `catalog.review`, `catalog.category-section` (wrapper of both facets; stand-in `catalog.filters-button` if the screen folds them), `catalog.storefront` (column header), `MoreActions tour="page-more"`; tour in `tours.ts`
- [X] T037 [P] [US1] New product tour (`product-new`, N 1–6): `useTourPage("product-new", …)` in `apps/shop-web/src/features/catalog/ProductCreateFlow.tsx`; keys `product-form.steps` (`packages/web-kit/src/product-form/StepRail.tsx`), `product-form.category` (`NameCategoryStep.tsx`), `product-form.photo` (`PhotoStep.tsx`), `product-form.price` (the "Your price" column in `VariantEditor.tsx`), `product-form.preview` (`LivePreview.tsx`), `product-form.send` (the send button in `ProductCreateFlow.tsx`); tour in `tours.ts` (back-office reuses these keys later)
- [X] T038 [P] [US1] A product tour (`product`, P 1–11): `useTourPage("product", …)` in `apps/shop-web/src/features/catalog/ProductDetailScreen.tsx`; keys `product.status`, `product.preview` (`packages/web-kit/src/product-page/ShopperPreview.tsx`), `product.sizes` (`apps/shop-web/src/features/catalog/ProductSizes.tsx`), `product.stock` (`StockControls.tsx`), `product.pictures` (`MediaGallery.tsx`), `product.description`, `product.details`, `product.facts`, `product.quality` (`packages/web-kit/src/product-page/ListingQuality.tsx`), `product.sections` (`SectionAssignment.tsx`), and `tour="page-more"` on the `MoreActions` in `apps/shop-web/src/features/catalog/ProductActions.tsx`; `useTourPage` status from the product detail query; `needsRecord: "product"`
- [X] T039 [P] [US1] Availability tour (`availability`, A 1–5): `useTourPage` and keys `availability.show`, `availability.search`, `availability.switch` (first row's switch) in `apps/shop-web/src/features/catalog/AvailabilityScreen.tsx`; steps 1 and 5 target `page-title`
- [X] T040 [P] [US1] Insights tours (`insights`, `insights-sales`, `insights-products`, `insights-service`; I, IS, IP, IV): `useTourPage(page === "overview" ? "insights" : \`insights-${page}\`, { status: tourStatus(q) })` in `apps/shop-web/src/features/insights/InsightsScreen.tsx`; keys `insights.pages` (nav), `insights.range`, `insights.figures`, `insights.view-toggle`, `MoreActions tour="page-more"`; `insights.measure`, `insights.rhythm`, `insights.behind`, `insights.best`, `insights.up`, `insights.slipping`, `insights.oos`, `insights.found`, `insights.cant`, `insights.ready`, `insights.missed` in `apps/shop-web/src/features/insights/pages.tsx` and `Rhythm.tsx`
- [X] T041 [P] [US1] Team tour (`team`, TM 1–4, no step flagged: the Shown when column is blank for 1–2 and presence covers 3–4; the route renders `ManagerOnlyScreen` → `TeamRoster`): `useTourPage("team", { status: tourStatus(teamQuery) })` and keys `team.invite`, `team.role` (column header), `team.actions` (first row's actions) in `apps/shop-web/src/features/team/TeamRoster.tsx`; a Staff member's refused roster read is `error`, so no tour is offered there
- [X] T042 [P] [US1] Notifications tour (`settings-notifications`, NS 1–5): `useTourPage` and keys `notifications.device`, `notifications.test`, `notifications.types`, `notifications.sound`, `notifications.home-screen` (the iPad/iPhone note) in `apps/shop-web/src/features/notifications/NotificationSettings.tsx`
- [X] T043 [P] [US1] Printing tour (`settings-printing`, PS 1–5): `useTourPage` and keys `printing.printer`, `printing.size`, `printing.resolution`, `printing.test` in `apps/shop-web/src/features/printing/PrintingSettings.tsx`; step 1 targets `page-title`
- [X] T044 [US1] *(As built: each tour carries its own `path` / `search` in `tours.ts`; no separate map.)* Fill `TOUR_PATH` in `apps/shop-web/src/features/tours/tours.ts` for every non-record tour (`orders-table` → `/orders?view=table`, insights pages → their paths, …)
- [X] T045 [US1] `apps/shop-web/src/features/tours/tours.test.ts`: every **defined** tour passes the FR-017 limits, keys are unique, and every defined tour's steps (titles, texts, count, order) equal the spec's Tour Inventory (parse `specs/106-guided-tours/spec.md` tables by tour code → key map, so a word changed in one place fails until changed in both); tours not yet defined are skipped here, and T061 asserts all 16 are defined

**Checkpoint**: MVP part 1. Every page offers and runs its tour.

---

## Phase 4: User Story 2 - Anyone replays a tour when they need it (P1) 🎯 MVP

**Goal**: Help in the header, ⌘K commands, All tours, offer switch and reset.

**Independent test**: on any page, Help → Tour this page runs it from step 1; All tours starts a tour for another page
(opening a record when needed); ⌘K "tour" offers both commands.

- [X] T046 [US2] Add `<TourHelpButton />` after `<ScanButton />` in `headerActions`, and `<AllToursDialog />` in `overlays`, in `apps/shop-web/src/routes/app.tsx`
- [X] T047 [P] [US2] `apps/shop-web/src/features/tours/openRecord.ts`: `order` → first row of `orderListQuery({ dir: "desc" })` via `queryClient.fetchQuery`, then navigate to `/orders/$fulfillmentId`; `product` → first row of the catalog list query, then navigate to `/catalog/$productId`; none → `toast("There's no order to show this tour on yet.")` / `"…no product…"` and return false; pass it to `TourProvider`
- [X] T048 [P] [US2] Add **Tour this page** (`CircleHelp`, runs `startPage("search")`) and **All tours** (opens the dialog) with keywords "tour", "help", "guide" to the Actions group in `apps/shop-web/src/components/console/CommandPalette.tsx`; both close the palette first, and the tour runs through `pendingStart` after it has closed (T022)
- [X] T049 [US2] Verify in `packages/web-kit/src/tour/TourProvider.tsx` that `offerTours=false` suppresses the invitation but not Help or search, and that reset makes every page offer again on its next visit (cover both in `engine.test.ts` via `shouldOffer`)

**Checkpoint**: MVP complete (US1 + US2). Deployable.

---

## Phase 5: User Story 3 - The Welcome tour on first sign-in (P2)

**Goal**: a one-minute tour of the console, offered before any page tour.

**Independent test**: a person with no history is offered Welcome first; Staff sees 9 steps, Manager 10.

- [X] T050 [P] [US3] Shell keys in web-kit: `data-tour="nav"` on the sidebar and `data-tour={\`nav.${item.key}\`}` on every item and group in `packages/web-kit/src/console/StaffSidebar.tsx` (tablet rail included); `header.search` and `header.account` in `packages/web-kit/src/console/StaffHeader.tsx`
- [X] T051 [P] [US3] `data-tour="header.sound"` in `apps/shop-web/src/components/console/SoundChip.tsx` and `data-tour="header.scan"` in `apps/shop-web/src/components/console/ScanButton.tsx`
- [X] T052 [US3] Add the `welcome` tour (W 1–10; step 1 `target: null`; step 4 `managersOnly`; step 2 → `nav`, 3 → `nav.orders-group`, 4 → `nav.manager`, 5 → `nav.settings-group`, 6 → `header.search`, 7 → `header.scan`, 8 → `header.sound`, 9 → `header.account`, 10 → `header.help`) to `apps/shop-web/src/features/tours/tours.ts`
- [X] T053 [US3] Precedence in `packages/web-kit/src/tour/TourProvider.tsx` via `welcomeFirst`: while `welcome` would be offered (unseen, or a raised version, and only while "Offer tours on new pages" is on), the invitation offers Welcome (on any page) and no page tour; once Welcome is seen, the page's own invitation follows on the next page visit; on a phone, where the sidebar is closed, the `nav.*` steps are skipped by presence (no sidebar opening)

---

## Phase 6: User Story 4 - A tour fits the page as it is now (P2)

**Goal**: conditional steps, narrow-screen stand-ins, urgent work kept above the tour.

**Independent test**: the order tour as Staff on an Effy order vs as Manager on a courier-pickup order with
something refundable differs exactly by steps 4, 7 and 11; a new-order banner stays bright and clickable mid-tour.

- [X] T054 [P] [US4] Conditional steps across states, in `apps/shop-web/src/features/fulfillment/OrderDetailScreen.tsx` and `apps/shop-web/src/features/catalog/ProductDetailScreen.tsx`: confirm the keys from T035/T038 render only when their part does (Can't supply only while picking; Courier pickup only for supplier-pickup courier orders; Refund only for a Manager with something refundable; Listing quality only when shown), and that the Staff/Effy vs Manager/courier-pickup runs differ exactly by OD 4, 7 and 11; move any key that renders while its part is empty
- [X] T055 [P] [US4] `data-tour-above` on the root of `apps/shop-web/src/components/console/NewOrderAlert.tsx` and on the offline and update banners in `apps/shop-web/src/components/console/PwaBanners.tsx`
- [ ] T056 [US4] *(Open: needs a browser walk at the three widths - quickstart walk steps 6, 7, 13.)* Check stand-ins and fold-aways at 375px, 768px and 1280px in `apps/shop-web` dev: orders filters → Filters button; catalog filters; the Today `Yesterday:` inline variant; fix any key that sits on an element hidden at that width by moving it to the visible counterpart; at each width, trigger an error toast mid-tour and confirm it shows above the dim layer (FR-013)
- [X] T057 [US4] In `packages/web-kit/src/tour/TourProvider.tsx`, re-resolve the current step on `resize`/orientation change (advance if its target is now absent) and confirm the `MutationObserver` advance from T022 against a live update moving an order out of a lane

---

## Phase 7: User Story 5 - The operator sees which tours help (P3)

- [X] T058 [P] [US5] Add `tour_started { tour, version, via }`, `tour_finished { tour, version }`, `tour_closed { tour, version, step, of }` and `tour_declined { tour, version }` to `ShopAnalyticsEvent` in `apps/shop-web/src/lib/telemetry.ts`
- [X] T059 [US5] Emit the four events from `packages/web-kit/src/tour/TourProvider.tsx` through `onEvent` (`via`: invitation / help / search / all-tours; `step` = the 1-based shown index), and pass `onEvent={track}` in `apps/shop-web/src/routes/app.tsx`

---

## Phase 8: User Story 6 - A changed page is offered its tour again (P3)

- [X] T060 [US6] Use `isRevised` in `packages/web-kit/src/tour/TourProvider.tsx` to set `invitation.revised`, and show "This page has changed. Take the new tour?" in `TourInvitation.tsx`; mark the tour "Updated" (not "Seen") in `AllToursDialog.tsx`; the same applies to `welcome`; add a case to `engine.test.ts`; document "raise `version` when a tour is rewritten" at the top of `apps/shop-web/src/features/tours/tours.ts`

---

## Phase 9: Polish & cross-cutting

- [X] T061 Guard `apps/shop-web/src/features/tours/tours.guard.test.ts` (R9): (1) every screen component rendered by a route under `apps/shop-web/src/routes/` (all except `auth.tsx`), **following one level of wrapper components** (`ManagerOnlyScreen` → `TeamRoster`), calls `useTourPage(` with keys in `SHOP_TOURS`; (2) every `SHOP_TOURS` key is used or is `welcome`; (3) every step target appears as `data-tour="key"` / `tour="key"` in `apps/shop-web/src` or `packages/web-kit/src`, or is `nav.<key>` for a key in `apps/shop-web/src/components/layout/nav.ts`, or `nav`, `page-title`, `header.*` set by web-kit; (4) **per screen** for shared keys: a tour that targets `page-more` must have `tour="page-more"` in its own screen's files (screen + the components it imports from its feature folder), and one that targets `page-title` must render `PageHeader` or `RecordHeader` there; (5) all 16 tours of the spec's inventory are defined; prove it by deleting one attribute and watching it fail
- [X] T062 [P] Dev-only warning in `packages/web-kit/src/tour/TourProvider.tsx`: when a page reaches `ready` and a non-conditional step's key is absent, `console.warn` the tour and key (stripped in production)
- [X] T063 Run `pnpm --filter @effy/design-system test`, `pnpm --filter @effy/web-kit test`, `pnpm --filter @effy/shop-web test`, `pnpm --filter @effy/shop-web typecheck`, `pnpm --filter @effy/edge-shared test`, `pnpm --filter @effy/edge-shop test`, `pnpm --filter @effy/shop-web build`, `scripts/check-no-refresh-timers.sh`; fix until green
- [X] T064 [P] Add a `106-guided-tours` entry to `FEATURE-HISTORY.md` (what was built; the Dice UI rejection; operator order: commit → `AWS_PROFILE=ef make db-up-one ENV=dev` → `AWS_PROFILE=ef make edge-deploy SERVICE=shop` → shop-web; "a redesign re-reads its page's tour and raises `version`"), and a line in the CLAUDE.md feature list plus a short ⚠ rule under Architecture: "EVERY CONSOLE PAGE HAS A TOUR (106) - `useTourPage` + `data-tour` keys; words in the app's `tours.ts`; `tours.guard.test.ts`"
- [X] T065 Hand the operator the quickstart steps and the 16-step walk in `specs/106-guided-tours/quickstart.md` (Claude runs no migration or deploy)

---

## Dependencies & execution order

- **Setup (T001–T003)** → **Foundational (T004–T030)**. Inside it: T004 → T007; T005 ∥ T006; T007 → T008 (service) → T009/T011/T012; T011/T012 → T013 → T014/T015; T016 → T017; T018/T019 → T020; T019/T021 → T022 → T023–T027; T029 needs T001/T027 (it adds `state.ts` to web-kit); T030 needs T027.
- **US1 (T031–T045)** needs Foundational. T031 first; T032–T043 are parallel (different screens; each appends its own tour to `tours.ts`, so merge appends with care); T044/T045 last.
- **US2 (T046–T049)** needs T031 (provider wired). It can run beside the US1 screen tasks.
- **US3 (T050–T053)** needs Foundational and T031; independent of US1's page tours.
- **US4 (T054–T057)** needs T035/T038 (all order and product keys) and T032/T033.
- **US5 (T058–T059)** and **US6 (T060)** need only T022/T031.
- **Polish (T061–T065)** last; T061 needs every `useTourPage` call in place.

## Parallel examples

```text
Foundational:   T005 validate.ts ∥ T016 tour.tsx ∥ T018 define.ts ∥ T019 engine.ts ∥ T028 Page/MoreActions keys
US1 screens:    T032 Orders queue ∥ T034 Today ∥ T036 Catalog ∥ T039 Availability ∥ T040 Insights ∥ T041 Team ∥ T042 Notifications ∥ T043 Printing
US2 + US3:      T047 openRecord.ts ∥ T048 CommandPalette ∥ T050 StaffSidebar/StaffHeader keys ∥ T051 SoundChip/ScanButton keys
```

## Implementation strategy

1. **MVP = US1 + US2** (Phases 1–4): every page has an offered, replayable tour. Run T061 and T063 early, so the
   guard is green before the MVP is called done.
2. **Then US3 + US4** (Welcome, conditional steps, urgent work above the tour): the quality bar for the walk.
3. **Then US5 + US6**: measurement and re-offer.
4. The operator runs migration → `SERVICE=shop` → shop-web, then the quickstart walk. Back-office tours are the next
   spec (107), on the same `tour.tsx`, `@effy/web-kit/tour` and `@effy/edge-shared/tours`.
