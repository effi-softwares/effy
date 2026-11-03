# Research: Guided Tours in the Shop Console (106)

Every decision below resolves an unknown in [plan.md](plan.md)'s Technical Context.

## R1 - The tour component: our own `Tour` primitive on Radix Popover

**Decision**: Build one small primitive, `packages/design-system/src/ui/tour.tsx`. It is made from:
- **Radix `Popover`**, already in the design system. `PopoverAnchor`'s `virtualRef` anchors the step card to any
  element on the page (`@radix-ui/react-popper` 1.3.3 declares `virtualRef?: React.RefObject<Measurable>`). It gives
  us collision-aware placement, a portal, Escape handling and focus handling, all styled by our existing
  `PopoverContent`.
- **A spotlight**: one fixed, full-screen layer with the shared backdrop look (`overlayClassName`: `bg-scrim/60` plus
  the 2px blur), cut by a `clip-path` polygon with a hole around the target, and holes for anything marked
  "above the tour" (R7).
- **A centred step**: when a step has no target, the same card is anchored to a virtual point in the middle of the
  window (Welcome step 1, and the fallback when every step would be skipped). *(Built this way rather than as the
  design system's `Dialog`, which turns into a bottom drawer with its own backdrop on a phone.)*

Its anatomy and prop names follow Dice UI's Tour (`TourStep`, `TourSpotlight`, `TourTitle`, `TourDescription`,
`TourFooter`, `TourPrev`, `TourNext`, `TourClose`, `TourStepCounter`), so anyone who knows shadcn-ecosystem tours
can read it. No code is copied.

**Rationale**: The console rule (CLAUDE.md "OVERLAYS: shadcn only, on ONE blurred backdrop", constitution "shadcn/ui
(Radix base)", and the operator's "design-system shadcn as-is") leaves one acceptable shape: a primitive inside
`@effy/design-system/ui` built on Radix. This adds **no dependency**.

**Alternatives considered**:

| Option | Why not |
|---|---|
| **Dice UI Tour** (`npx shadcn add @diceui/tour`, MIT) - recommended in the spec turn | Its source (`diceui.com/r/tour.json`, read 2026-11-03) depends on **`@base-ui/react` + `@base-ui/utils`**, a second primitive family beside Radix, which the locked standard does not allow. It also has no centred (no-target) step. When a target selector matches nothing, it **renders a full dark overlay with no step and no way on** except Escape. It scrolls `window` only, while our consoles can scroll inner containers. In controlled mode (which we need, to skip steps), it does not scroll at all. We would rewrite most of it. |
| react-joyride 3.x (MIT, React 19) | Brings its own floater and overlay engine (~40 KB). Even with a custom tooltip component, the overlay and positioning are not ours, so it would be a second popover system beside Radix. |
| driver.js 1.x (MIT) | Imperative DOM: it draws its own popover markup outside React and our components, so it would need restyling by CSS override. |
| Shepherd.js / Intro.js | Their own DOM and styling. They are AGPL with commercial licences (per their projects), which is not acceptable for a closed product. |
| Onborda / NextStep | Built for Next.js routing and `motion`. Neither fits a TanStack Router SPA without adapters. |

## R2 - How a step finds what it points at: `data-tour` keys

**Decision**: A step names a **target key** (`"orders.lane-new"`, `"nav.orders"`, `"page-more"`). The thing it points
at carries `data-tour="<key>"`. A key is looked up at the moment the step is shown, with
`document.querySelectorAll('[data-tour="key"]')`, and the **first present** element wins. One key can sit on
responsive twins (the More menu's dropdown and phone triggers, the sidebar and the tablet rail), and only one of
them is visible. An element is **present** only if it is connected, has a non-empty client rect, and is not inside
`[hidden]` or `[inert]`. `aria-hidden` is deliberately **not** a test: Radix modal layers set it on the whole page
while they are open or closing (R7, "When a tour starts").

- **Shared parts carry fixed keys**, set once in web-kit: `nav.<item key>` on every sidebar item, `header.search`,
  `header.account`, `header.help`, and `page-title` on the title block of **both** page heads: `PageHeader` (list and
  settings pages) and `RecordHeader` (the order and product pages). `MoreActions` takes
  `tour="page-more"` from the page.
- **Narrow-screen stand-ins** (FR-011): a step lists alternative keys (`["orders.filters", "orders.filters-button"]`).
  The first present one is used.

**Rationale**: String keys keep the words list (R5) free of React refs and readable on its own (FR-016). They can be
checked statically (R9), and the same mechanism works in back-office.

**Alternatives**: refs registered through context (rejected: every target component would need tour code, and the
list could no longer be checked by a static scan); CSS selectors (rejected: fragile, since any class change would
break a tour without anyone noticing).

## R3 - Where "offered" is remembered: one row per person, one writer

**Decision**: A new table, `public.console_tour_state`, with one row per **(audience, subject)**. It holds
`offer_tours` and a `seen` jsonb map `{ tourKey: { v, outcome, at } }`. Its one writer and reader is
`@effy/edge-shared/tours` (`store.ts`), used by the shop service now and the admin service in the back-office slice.

**Rationale**: FR-004 asks for per person, across devices. A person is read whole (one row) on every console load,
and written one tour at a time. A jsonb merge (`seen || jsonb_build_object(...)`) is atomic, needs no row lock, and
two tabs writing different tours cannot lose each other's write. `audience` is set by the **service** (`'shop'` in
the shop service), never by the client, and the subject comes from the caller's own token. A shop token therefore
can only ever reach rows with `audience = 'shop'` and its own `sub`, which keeps pool isolation (Principle IV).

**Alternatives**: columns on `shop_staff` / `admin.staff` (rejected: two schemas and two writers for one fact, with
the back-office copy written later from scratch); a row per tour (rejected: the GET becomes a list for no benefit);
browser storage (rejected: FR-004, because a shared bench computer would hide tours from the second person).

## R4 - The routes: two on each gateway

**Decision**: `GET /shop/v1/me/tours` and `PATCH /shop/v1/me/tours` in the **shop** service (shared gateway; the shop
service already owns `/shop/v1/me`). Back-office's slice adds `/admin/v1/me/tours` to the admin service (staff
gateway).

- Shared gateway: **165 → 167 / 300** (56%). Staff gateway later: **208 → 210 / 300** (70%; the alarm is at 75%).
  Measured with `gateway-capacity.contract.test.ts` on 2026-11-03.
- PATCH carries exactly one change: a tour's outcome, the offer switch, or a reset. Three routes would spend two more
  integrations on one resource.

## R5 - The one list of words (FR-016, FR-017)

**Decision**: `apps/shop-web/src/features/tours/tours.ts` exports `SHOP_TOURS`, written with `defineTours()` from
`@effy/web-kit/tour`. It is plain data: key, version, title, `needsRecord`, and steps (target key or keys, title,
text, side, `managersOnly`). The spec's Tour Inventory is copied into it word for word. A unit test enforces the
limits: title ≤ 40, text ≤ 220, ≤ 12 steps, unique keys, version ≥ 1. Back-office will have its own `tours.ts`.

**Rationale**: One file a reviewer can read top to bottom, with no JSX. Words change by editing it alone. Raising a
tour's `version` is the revision mechanism (FR-021).

## R6 - Pages say which tour is theirs, and when they are ready

**Decision**: Every routed screen calls `useTourPage(key, { status })`, where `status` is `"loading"`, `"ready"` or
`"error"` and comes from the page's own main query (`query.isSuccess` → ready, `query.isError` → error, otherwise
loading). **Only `ready` offers or runs a tour**: never on skeletons, and never on an error page (including a Staff
member at Team's address, whose roster read is refused). With `error`, Help's **Tour this page** is disabled with the
hint "The tour is available once this page loads.". Orders passes
`view === "table" ? "orders-table" : "orders-queue"`, and Insights passes its page's key. The provider keeps the
current page's key in a TanStack Store, so Help, search and the invitation all read the same fact.

**Rationale**: It is explicit and greppable, so a guard can prove every routed screen registers (FR-001). Team's
route renders `ManagerOnlyScreen`, which renders `TeamRoster`; the call lives in `TeamRoster`, and the guard follows
that one level of indirection. Looking up
the route's address would miss the Queue/Table split and could not know when a page is ready.

## R7 - Blocking the page without blocking urgent work

**Decision**:
- The spotlight layer catches every pointer event (FR-010), including over the hole: a tour explains, it does not
  let the person press the thing.
- **Holes for urgent things**: any element marked `data-tour-above` (the new-order banner `NewOrderAlert`, the offline
  and update banners in `PwaBanners`) gets its own cut-out, and pointer events pass through to it (FR-013). Toasts
  (sonner) already sit above z-50.
- Escape and ✕ close the tour. The Popover's `onInteractOutside` is prevented, so an accidental click on the dim
  layer does not end it.
- **When a tour starts** (U3): Help, ⌘K and All tours are Radix modal layers. While open or closing, they set
  `aria-hidden` on the page and hold focus. A tour started from one of them starts only **after the opener has
  closed** (its `onCloseAutoFocus` has run, or two animation frames after `open=false`, whichever comes first). The
  same rule applies between a centred step (a `Dialog`) and the next step.
- **Focus** (U7): the card traps Tab (Radix `FocusScope` with `trapped`, looping). Elements marked `data-tour-above`
  stay reachable with the mouse, and the new-order banner's own keyboard shortcut still works. Tab never leaves the card.
- **The invitation is not declined by moving around** (U5): only a `pointerdown` inside `main` outside the card, or a
  key that types or activates (`Enter`, `Space`, or a printable character) while focus is inside `main`, counts as
  starting work. `Tab`, `Shift+Tab`, arrows, `Escape` and modifier keys alone do not.
- Focus moves to the card's title. The card is `role="dialog"` with `aria-labelledby` / `aria-describedby`, and
  focus returns to the element that had it before. `prefers-reduced-motion` switches scrolling to `auto`.

## R8 - Scrolling a target into view

**Decision**: `target.scrollIntoView({ block: "center", inline: "nearest", behavior })`, then a re-measure on the
next frame. `scrollIntoView` scrolls every scrolling ancestor, unlike the `window.scrollTo` approach the libraries
use. A `ResizeObserver` on the target, plus window `resize`/`scroll` listeners, keep the hole and card aligned. A
`MutationObserver` on `main` re-checks that the target is still present. When it disappears (a live update moved the
order), the tour advances to the next step that is present, or ends.

## R9 - Proving every page has a tour, and no step points at nothing (FR-001, FR-019)

**Decision**: `apps/shop-web/src/features/tours/tours.guard.test.ts` (static, in the style of the repo's other
`*.guard.test.ts`) checks three things:
1. Every route component reachable from `router.tsx` (except sign-in and the manager-only fallback) calls
   `useTourPage(`, and every key it passes exists in `SHOP_TOURS`.
2. Every `SHOP_TOURS` key is used by some page (or is `welcome`).
3. Every step target key appears literally as `data-tour="key"` or `tour="key"` in `apps/shop-web/src` or
   `packages/web-kit/src`, or is a shared shell key that web-kit derives (`nav.<key>`, matched against `nav.ts` keys).

A runtime check in development logs a warning when a step's key is absent on its own page in every state. The
quickstart walk covers the rest.

## R10 - Telemetry (Principle VII)

**Decision**: Four events, added to `ShopAnalyticsEvent`, sent through the provider's `onEvent` callback so web-kit
stays app-agnostic:
- `tour_started` `{ tour, version, via: "invitation" | "help" | "search" | "all-tours" }`
- `tour_finished` `{ tour, version }`
- `tour_closed` `{ tour, version, step, of }`
- `tour_declined` `{ tour, version }`

No record ids or text. These are behaviour events, not operational ones, so no metric or alarm is added. The two
routes log through the service's standard `preamble` and get the default Lambda error alarm like every other route.

## R11 - Offline and failure

**Decision**: The tour state is a TanStack Query (`["tours","me"]`), and a write is a mutation with an optimistic
cache update. With the console offline, the mutation pauses (TanStack's `networkMode: "online"`) and resumes when the
console is back. shop-web already saves its query cache (`lib/query-persist.ts`). For a paused write to survive a
**reload**, the mutation has a fixed `mutationKey: ["tours","write"]`, the client registers
`queryClient.setMutationDefaults(["tours","write"], { mutationFn })` before restoring, and calls
`queryClient.resumePausedMutations()` after the restore. Without this, an offline decline is lost on reload. Meanwhile the cache already shows the tour as offered, so the invitation does not return on this
device (spec edge case). If the GET fails, **no invitation is shown**: Help still runs tours, and a failed read never
nags. Tour words ship in the bundle, so tours run offline.

## R12 - Opening a record for a record-dependent tour (FR-007)

**Decision**: The provider takes `openRecord(kind)` from the app. For shop-web: `order` reads the first row of
`orderListQuery({ dir: "desc" })` and navigates to `/orders/$id`; `product` reads the first row of the catalog list
sorted newest first (`sort: "created", dir: "desc"`, or the list's equivalent whitelisted sort) and navigates to
`/catalog/$id`. With no row, it shows the toast "There's no order to show this tour on yet." / "…no
product…", and no tour starts.

## R13 - When a tour starts and ends (FR-004)

**Decision**: Starting a tour writes `outcome: "closed"` for it **at once**. Finishing overwrites that with
`"finished"`, and closing early keeps `"closed"`. A reload, sign-out or crash mid-tour therefore still counts as
offered. A running tour **ends as closed** when the page's tour key changes (navigation, the Queue/Table switch,
following the new-order banner) or the provider unmounts.

## R14 - Tour state is shared code too (Principle II, FR-022)

**Decision**: The query and the optimistic, offline-resumable mutation (R11) live in `@effy/web-kit/tour` as
`tourStateQueries({ load, save })`. That returns `stateQuery`, `useTourWrite` and `registerTourMutationDefaults`, so
the fetch functions are the only thing an app supplies (shop-web: `/shop/v1/me/tours`; back-office later:
`/admin/v1/me/tours`). Nothing about tour state is written twice.

## R15 - A thin service between handler and store (Principle VI)

**Decision**: `apis/edge-api/shared/src/tours/service.ts` exports `getTourState(audience, sub)` and
`changeTourState(audience, sub, body)` (parse → write → map `full` to a typed refusal). Both handlers call only the
service, keeping the handler → service → repository shape.
