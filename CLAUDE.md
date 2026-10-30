# Effy (CLAUDE.md)

Effy is a **single-brand, vertically-integrated grocery + e-commerce delivery platform**. We build
it **spec-first** using **GitHub Spec Kit**. Read this before doing anything.

## What Effy is (the product model)
- Customers buy from **one brand: "Effy."** There is no marketplace of named storefronts.
- **Shops are hidden internal fulfillment nodes** (dark-store-like). Customers never see or pick a
  shop — the platform decides fulfillment behind the scenes.
- **Drivers and back-office staff are Effy employees**, working in internal apps (no public signup).
- Four audiences, each with its own trust level: **customer, driver, shop/operator, admin/back-office.**

### Delivery model (one model since 083 — who delivers, then when)
Every order is one of two things, decided from the delivery address:
- **Delivered by Effy** — the postcode is on Effy's list. The customer picks **ONE window for the whole
  order**: today's (shown under **"Same-day delivery"**) or one on the next N delivery days
  (`effy_lookahead_days`, 3 — shown under **"Standard delivery"**). Effy's own drivers deliver it.
- **Courier delivery** — the postcode is not on the list and courier delivery is on (or, if the business
  allows it, an in-area address with no window left). Nothing to choose: an **estimate** and one fee.
- Neither → refused with the one sentence.

⚠ **THE OLD ARRANGEMENT IS GONE (083).** Until then an order could also be sold a same-day slot or a
"standard day" a carrier delivered, chosen per package. That checkout, its settings and its columns were
removed; what it was, and how to read an order sold that way, is
[docs/archive/delivery-model-v1.md](docs/archive/delivery-model-v1.md). ⚠ `same_day` / `standard` on a
package are **not** legacy: for an Effy order they are the customer's words for *a window today* / *a
window on a later day*.
- ⚠ **THE GO-LIVE PAGE, SWITCH AND "OLD ORDERS STILL OPEN" ARE GONE (cleanup, 2026-10-23).** Dev was
  wiped and the 92 migrations were collapsed into ONE baseline (`db/migrations/20261023000000_baseline.sql`).
  A paid order always has a type (`order_paid_delivery_type_ck`); the type is set by checkout before
  payment, so the column itself stays nullable.

**Coverage (076).** Where Effy delivers is **one flat list of postcodes**; "who delivers to this address" —
`effy` | `courier` | `none` — is decided by `public.coverage_for_postcode` **only** (read through
`coverageForPostcode`): never stored against an address, never re-derived by a join.
- ⚠ **`delivery_zone_postcode` IS the list and `delivery_zone` IS an optional GROUP** (047's names, kept).
  A group organises the list and scopes driver clearances; its `status` decides nothing about coverage,
  and removing a group never removes its postcodes.
- ⚠ **"COURIER" MEANS A COURIER ORDER CAN BE PLACED THERE NOW (079):** courier delivery on, a courier fee
  table active, a default courier service — `public.courier_reaches_postcode` / `courier_delivery_state`
  are the one definition.
- ⚠ **DELIVERY TODAY IS OFFERED PER LISTED POSTCODE (097)** — `delivery_zone_postcode.today_offered` (default true,
  never per group), read only through `coverage_for_postcode` (`Coverage.todayOffered`). Where it is off, the Effy
  calendar for that address does NOT CONTAIN today (`effyDays`'s fifth, required argument): no Same-day section, no
  today surcharge, ASAP on a later day, back-office move/re-time refuse today. Never listed as closed — that would be
  new customer wording.
- ⚠ **The refusal is ONE sentence in ONE file** — `COVERAGE_REFUSAL_SENTENCE` in
  `packages/shared-types/src/delivery.ts`, mirrored in the customer app's `CoverageWords.kt` and held to it
  by a test. `coverage.guard.test.ts` fails a second wording, a customer contract that carries a
  group/distance/reason, or a new reader of the list's table.

**The fee (077).** ⚠ **DELIVERY IS PRICED ONCE PER ORDER, NEVER PER SHOP.** base + distance band (the
postcode's own distance) + weight band (the whole basket) + window surcharge, rounded UP, clamped; $0 at
the plan's free-delivery amount (surcharge included); + a small-order fee below its amount. **One sum**:
`effyFee` / `courierFee` in `shared/src/delivery/engine.ts` (`fee.guard.test.ts`). A window today costs
more by the plan's **fixed "Delivery today" surcharge**. The order stores its breakdown
(`delivery_fee_breakdown`; customers get `->'lines'` only); the intent refuses a total the client did not
show (409 `delivery_fee_changed`). A package carries no fee; a shop never sees delivery money.

**Windows (069, 078).** Back-office defines daily windows (start, end, cutoff, capacity).
- ⚠ **ONE WINDOW RULE**: `judgeWindow(now, date, …)` in `slots.ts` — its cutoff has not passed (any day), a
  collection run can still reach the hub before it starts (**today only**), and it has room per
  `(window, date)`. The quote, the hold and back-office's move to Effy all call it. The calendar is
  `effyDays` / `openWindows` (`windows.ts`).
- A place is **held at the payment-intent call** (the client confirms payment with the provider directly,
  so that is the last server moment before the charge) and confirmed at payment. ⚠ A window is never
  substituted: one that has gone is a refusal (`slot_unavailable`, `slot_required`, …) and the customer chooses again.
- ⚠ **AN ORDER WITH NO TIME IS AN ORDER IN THE "ANY TIME" WINDOW (085).** Standard delivery sells a
  **day with no time** (the default), **"as soon as possible"**, or — opt-in — a window. ⚠ **NOT A
  SWITCH**: THE `any_time` window is created by its migration, is always active, and no API sets the flag
  or turns it off (staff edit its hours and limit only). A day-only order holds a place in it on its day, and an ASAP order is put in it at the
  payment-intent call on the first day it is open (today included; `resolveAsap`) and told only the
  business's estimate — **never the day**. ⚠ `judgeWindow`, the fee sum, the hold, `collectionRunFor`, the
  planner and `round_opens_at` do not know the flag: it is a LABEL ("Any time", written by the server for
  drivers and dispatch) and a filing rule (`EffyDay.anyTime`, never in `windows[]`, never on the wire for
  today). It pays the plain fee — no window surcharge, no "Delivery today" surcharge. ⚠ What was sold is
  `order.delivery_promise` (`window` | `day` | `asap`; NULL before 085 reads as `window`), TWO writers:
  checkout and `override.ts` (`delivery-type.guard.test.ts`). The customer DTO carries no hours for `day`
  and no arrival at all for `asap` (`soldArrivals`). The estimate (`delivery_settings.asap_estimate`,
  Delivery days) is always set — reworded, never emptied. A day asks for a time only when its untimed
  room is taken. Staff re-time an Effy order through `changeEffyWindow`.
- ⚠ **WHAT A CLIENT IS OFFERED, THE QUOTE SAYS**: `effyWindows` → send `deliveryWindow {slotId, date}`;
  `courier` → send `deliveryType: "courier"`. A serviced address answers exactly one. ⚠ The quote carries
  **no package list** — nothing tells a customer how many suppliers fill the order.
- ⚠ **THE CLIENT SAYS WHICH TYPE IT SHOWED** (`deliveryType` on the intent); a mismatch is 409
  `delivery_type_changed`, nothing written.
- ⚠ **ONE WORDING**: the picker's words are `effyWindowsView`'s (`packages/shared-types/src/effy-windows.ts`)
  and its Kotlin twin, pinned to `effy-windows.fixtures.json`; the sentences are `DELIVERY_WINDOW_WORDS`;
  `DELIVERY_TYPE_WORDS` / `courierLines` / `deliverySummary` (`delivery-type.ts`) say who delivers, Kotlin
  twins pinned to `delivery-type.fixtures.json`. A courier estimate is ALWAYS said as an estimate; an order
  keeps the text it was sold. An order's arrivals are said once per DISTINCT promise (`distinctArrivals`).

**Who delivers an order (079).** ⚠ `order.delivery_type` (`effy` | `courier`), read directly — never
re-derived from a method or window; `delivery-type.guard.test.ts` fails a reader that decides from `slot_id`. A courier package is stored `standard`, no window, no
day — that word is ROUTING; a courier order's customer DTO carries `delivery` and **empty**
`arrivalEstimates`. ⚠ **THE TYPE'S HISTORY HAS ONE WRITER** — `recordDeliveryType` / `changeDeliveryType`
(`shared/src/delivery/delivery-type.ts`); `order_delivery_type_change` is append-only.
- ⚠ **SHOPS ARE TOLD "Effy driver" / "Courier" AND NOTHING ELSE** (`deliveredBy`, `DELIVERED_BY_WORDS`);
  `scripts/check-shop-delivery-words.sh` fails "same-day"/"standard" on a shop screen. Drivers and dispatch
  likewise: `scripts/check-driver-delivery-words.sh`.
- ⚠ **NO COMPATIBILITY FIELDS (cleanup, 2026-10-23).** With no installed builds, every field kept only for an
  older app or server was removed (a driver round's kind is `delivery`; no `deliveryMethod` for shops; no
  `home.banners`). A contract field is required unless it is genuinely absent in some state. There is
  still no app-update mechanism: once builds are in people's hands, a removal needs a compatibility plan.

**Courier parcels (080).** A courier order's parcels reach the courier **via the hub** or by **pickup from
the supplier** (`order.courier_collection`; staff may switch one order until its first parcel leaves). The
business keeps **courier services** (operator-entered, never seeded; ONE default — checkout tells its
timeframe, the order keeps it and `courier_service_id`). Each parcel handed over gets a
`courier_consignment`.
- ⚠ **ONE WRITER** — `@effy/edge-shared/delivery` `consignment.ts` writes the consignment, its events,
  `carrier_handoff` and the mode; "delivered" still writes `package_arrival` through it.
  `consignment.guard.test.ts` fails a second writer, and `courier_parcel_collection(` outside its one fragment.
- ⚠ **A supplier-pickup parcel is never driver work.** A hub parcel is **due out by its service's next
  pickup** (`nextCourierPickup`) — the only due-out rule there is.
- ⚠ **Customers get ONE link or "by email", never a count** (`trackingOf`). Shops see their own pickup
  only. Labels live under `courier-label/` in the media bucket, read only through presigned URLs.
- ⚠ **BACK-OFFICE CAN MOVE A PAID ORDER BETWEEN EFFY AND COURIER (081)** — an emergency tool, through ONE
  function: `override.ts` (`moveToCourier` / `moveToEffy`), one transaction through the one writers.
  `delivery_override` is append-only. Compensation is staff's choice, previewed and confirmed with the
  expected amount (409 `compensation_changed`). Only typed orders move; a parcel out for delivery blocks it.

**Driver operations (049, 063, 072, 082) — hub and spoke.** Effy's drivers are **not per-delivery
couriers**. They are Effy employees working typed tasks, not roles:
- **Collection run (shops → hub):** on the configurable collection schedule, a driver collects assigned
  parcels from fulfilment shops and **checks them in at the one hub**. ⚠ A parcel is collected on the
  **latest run that makes its window** — `collectionRunFor` (`shared/src/lib/collection-deadline.ts`).
- **Hub check-in** shows what the customer already chose — `effyGroups` (by day and window, `dueToday`)
  and `courierCount`. The driver classifies nothing.
- **Delivery round (hub → customers):** planned **per window, on its window's day**, to the window's end; a
  later-day parcel waits at the hub on no round. ⚠ Driver work asks `o.delivery_type = 'effy'` —
  never a method (`fleet/src/driver-method.guard.test.ts`).
- ⚠ **A clearance is (function, area), one row each** — collection or delivery, in a group or everywhere
  (`zone_id` NULL, including groups created later). An ungrouped postcode is cleared by any clearance for
  the function.
- **Work is assigned the moment a driver can take it, and OPENS on time (072).** Every 5-minute pass gives
  ready work to a qualifying driver. A round opens at its run time — or window start — less
  `planning_lead_min`; before that the driver service refuses every action (409 `round_not_open`). ⚠ The
  opening time is derived by `public.round_opens_at` only.
- **One hub** (multi-hub is deferred).
- ⚠ **THE BAG IS THE UNIT OF HANDLING (096).** A package (one shop's share) travels as one or more bags
  (`package_parcel`; bag 1's code is the package's 089 code, made at payment by `createFirstParcels` — no trigger).
  Every driver step accounts for EVERY bag (`expectedParcels` + `accountFor`, 409 `parcels_unaccounted`); one bag
  missing holds that bag, all missing hold the package. Every read is recorded by ONE writer (`recordReads` →
  `label_read`); every hand-over by ONE writer (`recordHandovers`, per bag, by driver, shop staff or hub staff).
  `label_read`, `label_print`, `package_handover` and `tax_document` are append-only (`labels.guard.test.ts`).
  The hub station closes a run through the driver's own `closeRunCheckin`.
- **One package status, nine words, everywhere (073).** Preparing · Ready · With driver · At hub · Out for
  delivery · With carrier · Delivered · Problem · Cancelled — derived by `packageStatus` from the dispatch
  rows, never from `shop_fulfillment.status` alone, and shown only through `STATUS_WORD` /
  `PackageStatusPill`. Back-office can **Assign to…** or **Unassign**; area clearance and "may run late"
  are a person's call, the rest are refused.

### Catalogue (101 — one category tree decides each product's form)
⚠ **THERE ARE NO PRODUCT TYPES (101).** The only classification is ONE category tree (≤ 5 levels, staff-managed in
back-office › Categories & attributes, the `catalog` service on the staff gateway). Every product sits in exactly ONE
**home leaf** (`product.primary_category_id`, a category with no active children); staff may add up to five extra
"also shown in" leaves (`product_placement`) that never change its form. `catalog.guard.test.ts` (a) fails any
`product_type` / `productTypeId` anywhere in the tree.
- ⚠ **INHERITANCE IS DEFINED ONCE** — `public.rebuild_category_derived()` writes `category_ancestor` (the closure),
  `category_resolved` (depth, leaf, paths, resolved storage/GST/18+ defaults) and `category_form` (each leaf's
  resolved form: set → tighten → hide down the tree, never loosen). Readers read those tables; nothing re-derives
  inheritance. The ONE writer of the taxonomy is `@effy/edge-shared/catalog` `taxonomy.ts` (lock, rules, rebuild in
  the same transaction); the service audits and calls `announceTaxonomy()` (live kind `taxonomy`).
- ⚠ **STORAGE, GST AND 18+ ARE COLUMNS, NOT ATTRIBUTES** — `product.storage` (frozen | chilled | ambient, said
  "Room temperature" through `STORAGE_WORDS`), `gst_status`, `age_restricted`, defaulted from the leaf; a change is
  the shop's and review sees it. 18+ is a LABEL only (`AGE_RESTRICTED_LABEL`; Kotlin twin `AgeWords`) — no age check yet.
  Stock dates (expiry, packed, batch) are never details (`isStockDateName`).
- ⚠ **ONE WRITER PER FACT**: `writeProductDetails` (a product's details, typed, per variant where an attribute
  "may differ by size") and `applyVariantSet` (options: ONLY library attributes the leaf offers as a variant option —
  its values are also each variant's detail). A value's label is copied to `product_option_value.value` for order
  lines; a rename rewrites the copy.
- ⚠ **VARIANTS COME ONLY FROM THE CATEGORY (105)** — there is no platform option ("Pack size" and `product_option.kind`
  are gone): a product varies by the attributes its category offers, nothing else. A variant's `pack_quantity` /
  `pack_unit` is its **net quantity**, a fact for unit pricing, never an option. The seeded clothing Size is removed.
- Submission (and approval) is refused while a required detail is empty (`missing_required_details`); a
  requirement added later leaves products on sale and lists them (back-office › Product review › Missing details,
  the shop's Missing details filter). Category icons are keys from `CATEGORY_ICONS` (one list: the migration CHECK,
  `@effy/web-kit/category-icon`, the app's `CategoryIcons.kt`, all pinned to `category-icons.fixtures.json`).

### Back-office products (102)
- ⚠ **A HOLD IS A STATUS, GUARDED BY A CHECK** — Effy's hold sets `status = 'unavailable'` and
  `product_held_not_active_ck` keeps a held product off sale whichever route writes; no storefront reader knows holds.
- ⚠ **ONE WRITER OF A NEW PRODUCT** — `@effy/edge-shared/catalog` `authoring.ts` (`insertProduct`; shop form, Effy's
  form, imports). `authoring.guard.test.ts` fails an `INSERT INTO public.product` elsewhere.
- ⚠ **AN EFFY-CREATED PRODUCT IS EFFY'S DRAFT UNTIL COMPLETE** (`content_owner = 'effy'`): never in the queue, the shop
  can only see it; `completeIfReady` approves it and hands it to the shop. The product form lives in
  `@effy/web-kit/product-form` for both consoles.
- ⚠ **AN IMPORT FETCHES UNTRUSTED LINKS ONLY THROUGH `fetchPicture`** (`@effy/edge-shared`, address checked in the DNS
  lookup) into private `imports/` — never a public prefix.

## Platform shape (the vision)
The full platform is **five active client surfaces + one backend + DB migrations + infrastructure**.
The customer audience gets **two surfaces kept at parity** (a native mobile build and a native web
build); the shop audience has **one — `shop-web`**.

⚠ **THERE IS NO SHOP MOBILE APP.** It was stopped on 2026-10-21 and deleted on 2026-10-23 (with its
Kotlin contract, Cognito app client and brand assets); git history has it. Every shop feature is built
for `shop-web` only.

- **Mobile (2 active):** `customer` / `driver` — Kotlin Multiplatform + Compose Multiplatform
  (shared iOS/Android), **Clean Architecture + MVVM**, Ktor client, AWS Amplify (Cognito).
- **Web (3):** `customer-web` (Next.js 16 SSR, customer storefront), `shop-web` (Vite SPA, shop
  operator console), `back-office` (Vite SPA, internal admin) — React 19 + TypeScript, shadcn/ui +
  Tailwind v4, the TanStack suite (Router/Query/Table/Form/Store/Virtual/DevTools/Hotkeys),
  client state via TanStack Store (no Zustand; constitution v1.4.0), AWS Amplify.
- **Backend — ONE path, serverless** (constitution **v3.2.0**, Principle III; features 070, 075): Node +
  TypeScript Lambdas (Serverless Framework v3) behind **two HTTP gateways** (below), **one service per
  audience and domain** under `apis/edge-api/` — `storefront` (public catalogue), `commerce`
  (cart, checkout, payment, customer orders), `customer`, `shop`, `inventory`, `driver`, `admin`,
  `catalog`, `fleet`, `orders`, plus the `notifications` and `auth` workers and `live` (the
  live-update channel's authorizer — no route). Which service a route
  belongs to: [docs/api/path-assignment.md](docs/api/path-assignment.md).
  - ⚠ **EVERY API IS WRITTEN IN `apis/edge-api`. THERE IS NO OTHER BACKEND, AND NONE MAY BE
    ADDED.** A new endpoint goes into the existing service that owns its audience and domain, or
    into a new `apis/edge-api/<service>/`; every client calls the gateway for its audience. A plan MUST NOT
    introduce always-on compute (a container service, a load balancer, a persistent-connection
    server) or a second backend runtime — that needs a constitution amendment first.
    ⚠ **One managed exception (constitution v3.1.0, feature 071):** AWS AppSync Events holds the
    live-update connections. It is a pay-per-use managed service, not compute of ours; an update
    carries only the KIND of thing that changed, clients never publish, and holding connections
    in anything the platform runs is still prohibited.
  - ⚠ **ONE BACKEND, TWO GATEWAYS (075).** The **shared** gateway (`edge-api.<zone>`) serves
    customers, shops, drivers and public routes; the **staff** gateway (`staff-api.<zone>`) serves
    back-office only — `admin`, `fleet`, `orders`, `catalog` and `inventory-staff` — and carries
    **only** the back-office authorizer, while the shared one carries none for back-office. ⚠ Why:
    an HTTP API holds at most **300 integrations, a limit the provider does not raise**, and on
    2026-10-08 the shared gateway was full (074's deploy was refused). A plan states which gateway a
    new service attaches to; a **third** gateway needs a constitution amendment.
    - ⚠ **`inventory` is TWO stacks from one directory** — `serverless.yml` (shop routes, shared) and
      `serverless.staff.yml` (`/inventory/v1/admin/…`, staff), deployed as `SERVICE=inventory` and
      `SERVICE=inventory-staff`. A guard that needs "every stack" asks `listStacks()`
      (`shared/src/lib/serverless-stacks.ts`), never `<dir>/serverless.yml`.
    - ⚠ **A gateway's fullness is measured three ways**: `gateway-capacity.contract.test.ts` (what
      the tree would deploy — fails past 300), `make gateway-usage ENV=dev` (what is deployed), and
      an hourly function with alarms at 75% / 90%. At 90% stop adding routes; **never merge routes
      to fit**. The rule: [docs/api/path-assignment.md](docs/api/path-assignment.md).
  - ⚠ **THERE WAS A SECOND BACKEND, AND IT IS GONE (070, 2026-10-05).** A Go service on Fargate
    behind a load balancer carried shopper traffic until then; its routes moved here, its
    infrastructure was destroyed and its source deleted. "Hot path" / "cold path" / "Path:" in
    specs 004–069 are history, never a reason for anything now. What it was, how it was built and
    how to recover its code: [docs/archive/core-api.md](docs/archive/core-api.md).
  - ⚠ **Shopper-facing services connect as a connection-limited database role** (`effy_shopper`),
    so a shopper burst is refused at the database instead of starving staff, shop and driver traffic.
  - ⚠ **A SHOPPER PICTURE HAS ONE PUBLIC ADDRESS (086)** — the media CDN (`media.<zone>`), built only by
    `publicImageUrl` (`@effy/edge-shared`), for `PUBLIC_MEDIA_PREFIXES` only (= `local.public_media_prefixes`
    in `media.tf`, guarded). The same bucket holds courier labels and delivery proof: those are NEVER public
    and are read only through presigned links (`presignRead`, `imageUrlOrNull`). Smaller WebP copies are
    made at upload by the route-less `media` worker and recorded in `media_rendition` (its one writer);
    clients name a copy only via `renditionUrl` and only when `imageWidths` lists it.
  - ⚠ **Money logic lives once** — `@effy/edge-shared/payments`. Three services move money
    (`commerce`, `orders`, `shop`); none re-implements a refund.
  - ⚠ **Promotions live once** (094) — `@effy/edge-shared/promotions`: ONE evaluator (`engine.ts`), ONE
    reader of the promotion tables (`candidates.ts`, plus the admin service), ONE writer of `promotion_use`
    (`uses.ts`, held at the intent under a row lock, confirmed at payment). A promotion's state is never
    stored (`public.promotion_state`). Where promotions are shown is a **display group** asked for by key;
    a shop never sees which promotion applied. `promotions.guard.test.ts` holds all of it.
    ⚠ **How a promotion looks is a SKIN (095)** — a layout + settings declared once in
    `@effy/shared-types/promotion-skins.ts`, chosen per group member (else the group's default; `classic` =
    as before 095). Staff may use ANY colour: the admin service refuses an unreadable skin (`skinContrast`;
    constitution v3.6.0 — skins are content, confined to their frame). ONE web renderer
    (`@effy/web-kit/promo-skin`) for customer-web and back-office's previews; the app's `PromoSkinView.kt`
    is pinned to `promotion-skins.fixtures.json` and decodes a skin leniently (an unknown layout costs the
    skin, never the promotion).
  - ⚠ **Points logic lives once** (074) — `@effy/edge-shared/points` is the only writer of the
    append-only points ledger; the balance is `public.points_usable`, never stored, never recomputed
    elsewhere. Points are a **way of paying**, not a discount: `order.grand_total_amount` is unchanged
    and `payment.amount` is the **card** amount. A shop never sees points.
  - **Event backbone: NOT BUILT.** The planned domain-event topic was never delivered; its unread
    outbox table was removed in the cleanup (2026-10-23). Add it back when a consumer needs it.
- **Data:** PostgreSQL 16, **raw SQL**, Goose migrations, **no ORM.** Two schemas: `public`
  (operational) and `admin` (back-office accounts + audit).
- **Infra:** Terraform, multi-env, remote state (S3-native lockfile — ⚠ **no DynamoDB lock table**;
  the platform's only DynamoDB table is 035's OTP issuance counter). AWS-native: Cognito, RDS,
  Lambda, API Gateway, AppSync Events (071), S3, SNS/SQS, SES, Amplify Hosting. ⚠ No ECS, ECR or
  load balancer (070).
- **Observability & telemetry:** CloudWatch metrics + alarms (⚠ a Prometheus + Grafana stack was
  documented here for months and **never built**); Crashlytics (mobile crash reporting); PostHog (product analytics + web error tracking on all
  clients); push via FCM (+ APNs for iOS) through the notifications path.

## Architecture rule
**Clean Architecture everywhere.** In the KMP apps, the presentation layer is **MVVM**
(`ViewModel` + lifecycle-aware state, coroutines/Flow). Cross-cutting concerns (types, design
tokens, API client, config) are **shared packages** — the single source of truth — never copy-pasted
per surface.

## Architecture (the spine)
Every surface is organized the same way internally. The full, **binding** reference is
[ARCHITECTURE.md](ARCHITECTURE.md) (constitution Principle VI) — read it before building any feature.
The spine in five rules:
- **Three-layer slice per feature:** thin edge (handler / UI) → service / use-case → repository.
  Clean-Architecture direction — domain depends on nothing, data implements it, presentation consumes it.
- **Repository pattern, raw SQL, no ORM.** Wire shapes (DTOs / rows) are mapped explicitly to domain
  models and never leak past the data layer.
- **No DI framework** — dependencies are wired explicitly and greppably (by hand at the entry point,
  one mobile container, or cached module singletons).
- **Unidirectional client state** — mobile MVVM (a ViewModel exposing immutable, observable state; the View calls its functions for user actions);
  web treats the server-state cache as the source of truth, with a client store only for genuine
  client state. Never hand-cache server data in component state.
- **One event language** (when the event backbone is built) — one envelope; consumers are idempotent.
- ⚠ **EVERY ACTIVITY LOG IS ONE DRAWER (104)** — `@effy/web-kit/activity-log` `ActivityLogDrawer`, opened from the page head
  (More menu, else an Activity button), answered by `@effy/edge-shared` `activityResponse` over an *activity source*
  (raw SQL + server-side words). No page draws a log inline (`activity-logs.guard.test.ts`; conversations — feedback
  threads, order notes — are named exceptions); no route answers a log another way (`activity.guard.test.ts`).
- ⚠ **A LOADING STATE IS THE PAGE'S OWN SHAPE (2026-10-29).** A skeleton is drawn from the same containers the loaded
  screen uses, with every label it already knows written out and a bone where a value will be — never one grey slab,
  never "Loading…". Consoles: `@effy/web-kit/patterns` Skeletons (`DetailPageSkeleton`, `PanelSkeleton`,
  `DetailRowsSkeleton`, `TableSkeleton`, `StaticTable loading`). customer-web: `@/components/ui/skeletons` (plus each
  component's own `…Skeleton` beside it). One bone rule for both: `@effy/design-system/skeleton.css`. Mobile:
  `EffySkeletonText` / `EffyLoading` (customer), `DriverSkeletonText` / `DriverLoading` / `DriverRunSkeleton` (driver).
  Guards: `skeletons.guard.test.ts` in back-office, shop-web and customer-web.
- ⚠ **EVERY CONSOLE LIST IS `@effy/web-kit/data-table` AND `parseListQuery` (103); THE URL IS A LIST'S STATE.** A
  list is `DataTable` over a route that parses with `@effy/edge-shared` `parseListQuery` (whitelisted sort ending in
  the id, no fixed `LIMIT`); a bounded or capped set is `StaticTable`. The raw `Table` is for named boards, editors,
  reviews and timelines only (`list-screens.guard.test.ts`, `list-query.guard.test.ts`).

## Observability & telemetry
Observable and measurable from day one (constitution Principle VII; full detail in
[ARCHITECTURE.md](ARCHITECTURE.md)):
- **Backend:** structured logs + CloudWatch embedded-format metrics through one shared helper;
  alarms declared in Terraform, delivered to the alerts topic. No `/metrics` endpoint, no dashboards stack.
- **Mobile:** Crashlytics crash reporting via a `core/platform/` native driver.
- **Clients (all six):** PostHog product analytics through a shared, typed event taxonomy; web apps
  also route runtime errors to PostHog. No PII in telemetry beyond the auth subject id; analytics is
  consent-respecting.
- **Push:** device tokens registered via the audience's own service; the notifications worker sends push (FCM/APNs)
  alongside email — never ad hoc per feature.

## Decisions locked
- **Region: `ap-southeast-2` (Sydney).** Moved from `ap-southeast-1` (Singapore) on 2026-07-12 — dev
  was destroyed and re-provisioned from scratch (no data kept), and the Terraform state bucket moved
  with it (`effy-apse2-tfstate`). `ap-southeast-1` is empty. Region is config, never a literal: it
  flows from `var.aws_region` / the `/effy/<env>/region` SSM contract. **Four values pin a region
  outside Terraform** and must be changed by hand on any future move — the Lambda
  Parameters-and-Secrets **layer ARN** (its AWS-owned account id differs per region), the embedded
  **RDS CA bundle** (`apis/edge-api/shared/src/lib/rds-ca.ts`, region-rooted chain), each
  `serverless.yml` `provider.region`, and (010) any **ACM certificate behind CloudFront/Amplify**,
  which **must** live in **`us-east-1`** regardless of the platform's region — the regional API
  Gateway certificate correctly follows `var.aws_region`, but a CloudFront-fronted one cannot.
  **Route 53 hosted zones are global and have no region** — they survive a region move untouched.
  Runbook: [infra/envs/README.md](infra/envs/README.md).
- **Domain: `effyshopping.com`** (registered at **GoDaddy**; DNS authority delegated to Route 53).
  The apex is **production's, and reserved** — nothing is deployed there. Every environment gets a
  **delegated child namespace** it fully owns (`dev.effyshopping.com`), created by its own env root
  along with its own `NS` delegation record in the parent — so destroying an env removes both
  together and leaves no dangling delegation. The parent zone lives in a **new `infra/global/`
  root** (`make global-apply`), deliberately outside the `ENV=` workflow so `make destroy ENV=dev`
  can never take the platform's apex with it. Registrar control is an **out-of-code dependency**:
  Terraform can rebuild every zone and record, but not the domain.
- **Repo shape:** MONOREPO (Turborepo + pnpm for JS/TS — the backend, the web apps and the shared packages; each
  KMP app is its own Gradle build). Reason: solo/small team → consistency across surfaces is the #1
  need; shared packages (design-system, api-client, shared-types, config) are the whole point.
- **Methodology:** Spec Kit (official CLI), with a product Brief up front.
- **Mode of work:** Claude WRITES all the code — scaffolding plus app/service/infra source, task by
  task per the plan. The USER runs every risky / outward-facing operation manually: deployments,
  `terraform apply`/`tf-bootstrap`, DB migrations, and anything touching live AWS. Claude authors
  Terraform, migration SQL, and Lambda source but does NOT run `terraform apply`, migrations, or any
  command that provisions cloud resources or mutates live state — it hands those steps to the user
  with exact commands to run.

## Prohibited values (hard rules)

- ⚠ **`techsupport+claudeone@phantm.com` MUST NEVER appear anywhere in this project.** Not in
  Terraform variables or `.tfvars`, not in `serverless.yml`, not as an SNS/alarm endpoint, not as a
  test fixture, seed, doc example, spec, or commit message. It is the address attached to the
  assistant's session — **not** an address the operator chose for this platform.
- **The general rule it stands for:** a real-world identifier — an email address, a phone number, a
  domain, an account id, a notification endpoint — is **asked for**, never inferred from session
  metadata, the git user, or anything else the environment happens to expose. An identifier being
  *visible* is not consent to *use* it.
- **When the value is unknown, fail loudly.** A required variable with no default, or a validation
  that refuses a placeholder, is correct. Filling the gap with a plausible guess is not — a wrong
  outward-facing value that silently works is worse than a build that stops, because it reaches real
  people before anyone notices.
- **The approved Effy mailboxes**, when a feature needs one:
  - **`workspace-admin@effyshopping.com`** — the operator's own account. **Operational** endpoints:
    alarm notifications, vendor/account contacts, anything aimed at whoever runs the platform.
  - **`hello@effyshopping.com`** — an alias on that same account, and the **customer-facing** one.
    Anywhere a person outside Effy will see it: reply-to on automated mail, support contact in the UI.
  - Both land in one inbox, so the choice is about what the address *says*, not where it goes. ⚠ They
    are approved for platform use — not a licence to invent a **third** address. Anything else is
    asked for.
- Enforced mechanically in `infra/envs/dev/variables.tf` (a validation block on `alert_email` that
  rejects the banned address) and by constitution v1.12.0.

## Workflow (the method)
```
Brief (product framing, user-authored)  →  /constitution (technical law, once)
   →  /specify <feature>  (WHAT/WHY, zero tech)
   →  /plan <feature>     (HOW, tech, cites constitution)
   →  /tasks <feature>    (ordered, checkable)
   →  /implement          (build task by task, verify vs acceptance criteria)
```
Discipline: specs have ZERO tech. A gap found later sends you BACK to fix the earlier artifact.

## Order of operations
1. The **Brief** (platform-brief.md) captures the product.
2. **/constitution** encodes the technical law (one serverless backend, monorepo, no-ORM, native-feel mobile,
   a MONOCHROME neutral ramp with no brand hue (v1.11.0; retired Effy Emerald #065f46 + terracotta
   #d0735a, and Jade #0FB57E before it), 4-pool auth isolation with passwordless EMAIL_OTP).
3. First slice: **Auth + customer onboarding** end-to-end (proves 4-pool auth + the backend +
   monorepo, and unblocks everything else). Catalog browse is the recommended second slice.
4. Do NOT pre-build the monorepo scaffold ahead of the specs — let each feature's plan drive what
   gets scaffolded.

## Auth
AWS Cognito, **four isolated pools**: customer / driver / shop / admin. **Credentials are
per-audience** (constitution v1.7.0, amended by 011):
- **Driver / shop / admin** — **strictly passwordless email one-time code**, admin-provisioned (no
  self-signup). **There are no passwords on the platform's internal audiences.** ⚠ Since **035** the
  code is **issued by the platform itself** (a Cognito custom challenge), not by Cognito's managed
  `EMAIL_OTP` factor — whose length is fixed at **eight** digits and configurable by nothing. Every
  code on the platform is now **six** digits (constitution v1.11.1: the phrase names the credential,
  not the vendor mechanism).
- **Customer** — the only audience Effy does not employ, and the only one open to the public: **open
  self-registration** with **three credential routes — email+password, email OTP, and Google
  federated sign-in**. All three MUST converge on **one profile / one `sub`** (a federated identity is
  **linked into the native profile**), and **linking requires a provider-asserted *verified* email** —
  linking on an unverified email is an account-takeover primitive, not a convenience.

⚠ **THE CUSTOMER STOREFRONT'S SESSION IS THREE `HttpOnly` COOKIES, SET ONLY BY ITS OWN SERVER (084).**
The browser signs in with Cognito through Amplify (confined to `app/(auth)`, working in the tab's
`sessionStorage`) and hands the tokens to `startSessionAction` (a Server Action) once; nothing
token-shaped stays in the browser. ONE read (`getSession`, `lib/session.ts` — verifies the id token), ONE refresher (`proxy.ts`),
sign-out revokes the refresh token. ⚠ There is **no Amplify on the server** and no
`@aws-amplify/adapter-nextjs`: its token check gave the pool's key download 1.5s and silently treated a
slow one as "signed out". "Could not check" is an error here, never a sign-out.

**Pools MAY define RBAC groups** surfaced via the `cognito:groups` JWT claim: the
admin pool defines `admin` / `manager` / `csa`; the shop pool defines `shop_manager` /
`shop_staff`; customer and driver define none. The claim is the **origin of role assignment**;
where a platform staff record exists it is **authoritative for the access decision** (role, status,
scope). Frontends authenticate against Cognito directly via Amplify; backends
validate JWTs per pool and pin the issuer — there is **no auth proxy**, and a token issued for one
pool is structurally rejected by services scoped to another.

## Design system (one source of truth)
⚠ **ONE THEME FOR EVERY APP (constitution v4.0.0, 2026-10-25).** `packages/design-system/src/tokens.css` is the
only token file: customer-web imports it, the consoles import it through `console.css`, and the customer and driver
apps, the emails and the Stripe card fields are generated from it. Every colour is a **Tailwind palette value** (zinc,
blue, emerald, rose, orange; violet / pink / red only in the `--promo-*` set). ⚠ **(2026-10-25, operator) EACH COLOUR IS
A FILL AND A TEXT SHADE**: `--primary-fill` blue-600 `#2563eb`, `--brand-fill` emerald-600 `#059669`, `--destructive-fill`
rose-500 `#f43f5e` carry a **white label in BOTH appearances** (`bg-*-fill text-*-foreground`, held to 3:1 by the
operator's choice); `--primary` / `--brand` / `--destructive` are the readable text shade (dark: blue-400, emerald-500
`#10b981`, rose-400). Orange (`--accent2`) is attention only. Problems are rose. Mobile: Material `primary` is the fill,
`EffyRoles.brandFill` the green under a white tick. One guard: `check-tokens.mjs`.
⚠ **OVERLAYS (2026-10-25, operator): shadcn only, on ONE blurred backdrop** (`ui/overlay.ts`). `Dialog` and
`AlertDialog` ARE shadcn's responsive dialog — centred from 768px, a bottom Drawer below (`ResponsiveModal` is now
an alias). Side panels are the Drawer `direction="left|right"`, FLOATING (8px inset, rounded on all four corners);
there is no Sheet. customer-web guest routes fetch them on demand (`components/overlays/lazy.ts`);
`dependency-cruiser.first-load.cjs` fails a static path from a guest route to radix/vaul/sonner. The two-identity history below (console vs storefront) is superseded.
⚠ **THE PLATFORM IS NO LONGER MONOCHROME.** On operator direction (design project `951bb710`,
`theme-adoption-prompt.md`) the **"Effy Shop Console" appearance identity was adopted PLATFORM-WIDE**,
reversing constitution v1.10.0 → v1.13.0 and features 026 / 041. One file carries it —
`packages/design-system/src/tokens.css` — and 057's shop-scoped `tokens/shop.css` was **DELETED**
rather than left restating the same values (two files declaring one palette is the
two-sources-for-one-fact shape this repo has shipped five defects through). ⚠ **Recorded win**: 017's
SC-004 web-px == mobile-dp parity, which 057 broke for shop-web, is **restored**.
- ⚠ **THE DARK BASE IS NEAR-BLACK NEUTRAL, NOT THE ADOPTED NAVY INK** (2026-09-17). The `.dark`
  block now carries **the design's own values**, read from `Effy Shop Console.dc.html` via DesignSync
  — **not** `dark-theme-update-prompt.md`, which the design has since moved past. Ground `#151515`,
  rail `#111111` (**recessed**, darker than the content ground), muted/secondary `#212121`, hover
  `#232323`, **border `#2a2a2a`**, input `#383838`, text `#fafafa`/`#a3a3a3`. **No blue tint in any
  neutral**; the light block is byte-identical throughout.
  ⚠ **THE PROMPT'S RAMP WAS BUILT AND REJECTED IN BETWEEN**: it bound `--muted`, `--border`,
  `--accent` and every hover to **one** value (`#404040`) on a `#262626` ground, so nothing had a
  hierarchy and everything had an edge — the operator report was *"borders are too much"*. The design
  steps those four roles by ~12 points each, and `--border` is a **1.27:1 hairline** again. Borders
  are deliberately **not** contrast-tested; a 3:1 border is a slab on every surface.
  The **light block is byte-identical** to before. Hues lifted to their 400-level equivalents so they
  carry on grey, and every `-soft` is now grey mixed with the hue rather than a saturated dark, so a
  tinted chip sits on the base instead of reading as a coloured card.
- **`--brand` / `--primary` — cobalt `#1d4ed8` light / `#60a5fa` dark — THE one action colour.** Both
  names resolve to the same value on purpose (`--primary` is the shadcn vocabulary the primitives
  consume, `--brand` the role name screens read). ⚠ The hue **LIFTS** in dark rather than inverting —
  unlike the retired neutral accent, a hue reads against both grounds. Plus `--brand-soft/-mid/-ink`.
  ⚠ The grey rebase also **ended the dark-only split** between them (the navy ground had needed a
  brighter `#7a9cff` for brand TEXT); they are now one value in **both** appearances.
- ⚠ **TWO VALUES DEVIATE FROM THE DESIGN'S DARK BLOCK, both forced by a guard.** `--ring`
  `#5a5a5a`→`#636363` (the design's is **2.65:1** on its own ground, under the 3:1 WCAG 1.4.11 bar —
  the same correction the light ring already carries). And `--success`, specified as green-400, is
  **byte-identical to the retired 024 customer splash ground** and turns `check-no-emerald.sh` red —
  057 hit the same collision on the same token and refused it too — so it is `#4cd97b`. ⚠ Naming the
  retired hex **in a comment** is itself a hit; the sweep does not strip comments.
- ⚠ **`check-tokens.mjs` GAINED TWO GUARDS, each from a defect committed during this change.**
  (1) **The residue after comment-stripping must still be CSS**: a glob written as `--chart-` + `*/`
  inside a comment **closes it**, and the remaining prose became stylesheet source — every token guard
  passed (they all strip comments first) and only the customer-web **production build** failed, quoting
  a phrase several lines past the fault. (2) **Every ratio written in a comment must match the
  recomputed one**: the dark block was re-derived three times and on one pass **thirteen** annotations
  were stale — plausible numbers describing pairs that had moved. Both proven by breaking them.
- **Three bounded non-brand hues**: `--accent2` (orange) is **attention and time pressure ONLY** —
  notification dots, unread badges, cut-off chips, deliberately rare; `--violet` and `--teal` are the
  second and third data-viz series and the avatar tints, **never interactive**.
- **Four state semantics**, each with a `-soft` tint it is written on: `--destructive`, `--success`,
  `--warning`, plus the neutral `muted`. The closed status mapping is **in-progress → brand ·
  complete → success · waiting/at-risk → warning · failed/refunded → destructive · inert → muted**.
  ⚠ `--success` and `--warning` keep **NO `-foreground` pair**: they may be text ON THEIR TINT but
  never a fill with a label on it (`check-tokens.mjs` enforces the absence).
- ⚠ **FOUR VALUES TUNED from the source, all for contrast**, all required by the adoption prompt's own
  4.5:1 rule: `--accent2` light `#d6650c`→`#b4550a` (3.36:1 on its own tint), `--teal` light
  `#0b8577`→`#0a7d70` (4.08:1), `--ring` light `#8eadee`→`#7993ca` (2.24:1 — failed even the 3:1 UI
  bar). Dark passes unchanged at every pair. ⚠ The sign-in panel fills with `--primary`, **not**
  `--brand`: the reference's `background:var(--brand); color:#fff` measures **2.62:1 in dark**.
- **Radius (the consoles):** **sm 4 (menu rows) / md 6 (buttons, inputs, selects, badges, checkboxes) /
  lg 8 (cards, dialogs, panels)**. Avatars, switches, radios, dots and progress are `rounded-full`.
  ⚠ **The console look lives IN the shared components** (`@effy/design-system/ui`, 2026-10-25) — one
  button definition (sizes `default` 44 / `sm` 40 / `icon` 44), one badge, one input. The console stylesheet (`src/console.css`, which imports its tokens from `src/tokens.css`, the one console token file) only
  restyles what customer-web also renders (dialog, drawer, OTP cells), the toasts, and the `ef-*` patterns (one set for both consoles; no `bo-`/`sh-` split)
  and shell. A rule in `@layer components` cannot restyle a component: its own classes always win.
- ⚠ **WHERE A CONSOLE STYLE GOES (back-office + shop-web) — one rule, no exceptions:**
  1. **Both consoles use it** (or a shared `@effy/web-kit` component does) → it MUST go in
     `packages/design-system/src/console.css`. Every common style lives there and nowhere else.
  2. **Only one console uses it, in two or more places** → that app's own file:
     `apps/back-office/src/styles.css` or `apps/shop-web/src/styles.css`.
  3. **Used in one place only** → no CSS class at all: write Tailwind classes inline in that JSX.
  Shared classes in `console.css` are `ef-*`. Classes in an app's `styles.css` have **no prefix** (`ticket`,
  `link`); where a bare name would clash, prefix it `bo-` (back-office) or `sh-` (shop-web). A variant of a shared class (`ef-meter--lg`, `ef-st--done`) stays
  beside it in `console.css` even if one app uses it. When a class's usage changes, move it to match.
- **NO GRADIENTS. Flat fills only.** Cards are **bordered, never shadowed**; the only shadows are on
  floating layers (dialog, popover, sheet, select, dropdown, chart tooltip).
- **Type: Geist / Geist Mono.** ⚠ NOT self-hosted (no woff2 to commit) — loaded from Google Fonts by
  the two consoles' `index.html`. `--font-sans` names **self-hosted General Sans second**, which is
  what keeps `customer-web`'s typography intact without adding a request to a public storefront.
- **Theme mechanics**: `data-theme="light"|"dark"` on the document element is the persisted,
  authoritative switch; the `.dark` class is **derived from it in the same statement** (Tailwind's
  `dark:` variants resolve off a class). Restored **before first paint** by an inline script in each
  console's `index.html`. Dark mode required, user-selectable (Light / Dark / Follow-System).
- **RETIRED**: Effy Emerald `#065f46` + terracotta `#d0735a`, Jade `#0FB57E` / `#047857`, and the
  041 monochrome ramp. The first two are still swept by `scripts/check-no-emerald.sh` /
  `check-no-jade.sh`.
- **Guards** (`pnpm --filter @effy/design-system test`): `check-tokens.mjs` (key-set parity, the
  four-step radius scale, **WCAG AA on every pair incl. each solid against its own `-soft` tint**,
  the no-`-foreground` rule), `check-component-shape.mjs` (controls and badges never pills,
  cards one step above controls, surfaces ≥ their rows), and ⚠ **`check-token-usage.mjs`** — scans 306 files and fails if
  a colour utility names a token `@theme` does not declare, because **Tailwind emits no rule at all
  for an unknown utility** and the element renders as nothing with no error anywhere.
- **Mobile**: the shop Compose theme regenerates from `tokens.css` and takes the cobalt accent and the
  neutral-grey ground; ⚠ the new hues (`--brand-*`, `--accent2`, `--violet`, `--teal`, `--warning`) are
  **web-only** for it. ⚠ **THE DRIVER APP WEARS THE STOREFRONT IDENTITY (092, constitution v3.5.0)** — like
  the customer app below: generated from `tokens.css`, Geist, Lucide, blue actions, green only for
  done, problems black with an icon (no red), light and dark; its kit is `apps/driver-mobile/.../core/presentation/`
  and `scripts/driver-guard.sh` holds it. Mobile must still feel native (iOS HIG / Android
  Material); fat-finger targets + micro-animations are requirements. Design refs: Uber / Bolt /
  foodpanda / eBay.
- ⚠ **THE CUSTOMER MOBILE APP WEARS THE STOREFRONT IDENTITY (087)** — like customer-web: Geist (bundled
  TTFs), Lucide icons, Effy blue for actions, Effy green for savings / "Delivered by Effy", no red. ⚠ **It
  has LIGHT AND DARK (constitution v3.4.0)**: the dark palette is the `.dark` block of
  `tokens.css`, read ONLY by the mobile generator — the website stays light only and sets no
  dark class. The shopper picks Match my phone / Light / Dark in Account → Appearance (stored on the
  device, `AppearanceMode`); colour roles without an M3 slot are read through `EffyRoles` (which follows
  the appearance), and promo panels with white type use the fixed `promoGround` / `promoBlue`. `gen-compose-theme.mjs` has a **per-target source** (customer → `tokens.css`,
  shop/driver → `tokens.css`) and `tokens:check` fails an undeclared hex in the customer theme. Its UI is the customer kit in `apps/customer-mobile/.../core/presentation/`
  (customer-local, never mobile-kit), drawn from the design canvas
  `docs/reference-screens/Effy Customer Mobile/`. ⚠ **No centred dialogs and no drop-down menus** —
  every overlay is `EffySheet` / `EffyConfirmSheet`; `scripts/mobile-guard.sh` enforces it, plus no
  colour literal in a screen, no raw Material control the kit replaces, no Effy address but `hello@`,
  and no package count in cart/checkout. Five tabs: Home · Search · Cart · Orders · Account.

**Design reference & layout doctrine (constitution v1.9.0, Principle V):**
- **Reference platforms** — Effy is **"Uber Eats + eBay, food-first."** For any feature's business
  logic, data model, entities, or UI/UX, look to how Uber Eats (food, menus, modifiers, discovery)
  and eBay (rich product entities, item-specifics, category taxonomy, search/filter) solve the same
  problem; adapt to Effy's single-brand hidden-fulfillment model; prefer the industry-standard,
  production-grade pattern. Food and food-related products get priority.
- **No card layouts** — do NOT use card-style containers or metric/summary cards to lay out content,
  and no metric cards at the top of pages, **unless a card is genuinely the right pattern and no
  better layout exists** (record the justification in the plan). Prefer tables, lists, sectioned
  pages, tabs, and detail rows.

## Mobile apps (scaffolded)
Two KMP + Compose Multiplatform apps live under `apps/`, each an **independent Gradle build** with
the standard three-module layout (`shared` + `androidApp` + `iosApp`) and package root
`com.effyshopping.<app>.mobile`:
- `apps/customer-mobile` — `com.effyshopping.customer.mobile` — the customer shopping app.
- `apps/driver-mobile` — `com.effyshopping.driver.mobile` — the driver delivery app.

Baseline stack: **Kotlin 2.4.0, Compose Multiplatform 1.11.1, AGP 9.0.1, minSdk 24 /
compileSdk + targetSdk 36**. ⚠ **BOTH APPS MUST PIN THE SAME TRIO — `composeMultiplatform`,
`kotlin` AND `material3` — AND THE DRIVER APP ONCE DID NOT.** Commit `6c7beaf` bumped it to CMP 1.12.0
/ Kotlin 2.4.20 and left `material3` at 1.11.0-alpha07; material3 1.11 calls
`foundation.style.StyleScope.border(Dp, Color)`, whose signature changed in foundation 1.12, so every
screen with an `OutlinedTextField` — starting with **sign-in** — died at launch with
`kotlin.internal.IrLinkageError`. Gradle resolved, Kotlin compiled, host tests passed: Kotlin/Native
defers an unresolved symbol to RUNTIME.

## Current status
Built so far: the **infrastructure** (four Cognito pools, dev DB, the shared and staff HTTP gateways), the
**migration workflow**, the **backend** (twelve services and a shared library under `apis/edge-api/`), and **all
three web surfaces** — `apps/back-office` (005), `apps/shop-web` (007) and **`apps/customer-web`
(011 — the first PUBLIC surface, Next.js 16 SSR)** — on the shared packages
`@effy/{design-system,shared-types,api-client,web-kit}`.

**Both KMP mobile apps are built** (KMP + Compose, Clean Architecture + MVVM, native Amplify auth behind
a `commonMain` `AuthDriver`; a formal `ViewModel → UseCase → Driver/Repository` domain layer):
**`apps/customer-mobile` (013)** and **`apps/driver-mobile`** —
049 gave it the full hub-and-spoke operation and **060 gave it its appearance** (all 45 design screens,
cobalt). ⚠ **MapLibre was ADOPTED AND THEN REMOVED in the same feature** — it aborted the app under
Xcode's debug build (SIGABRT on its own render thread) and `MapLibreAbsentGuardTest` keeps it out; the
map is a **schematic**, not cartography. This sentence said "OpenStreetMap via MapLibre + OpenFreeMap"
and had been false since that removal. Both apps share a **production navigation shell** (015 —
`packages/mobile-kit`: adaptive bottom-bar/rail + per-tab back stacks; customer guest-first with deferred sign-in;
built on stable Material 3, Nav3-migration-ready).

**The commerce path is built and live in dev**: catalogue, search and facets, cart and promo, saved
items and lists, checkout and payment, orders, refunds and cancellation, delivery zones, slots and
days, stock, the shop and back-office consoles, the driver operation. ⚠ **Delivery is ONE model since 083**
— Delivered by Effy in a window, or Courier delivery (see "Delivery model" above). ⚠ **Since 070 all of it is
served by the one serverless backend** — `storefront` and `commerce` for shoppers, beside the staff,
shop and driver services — at `edge-api.dev.effyshopping.com`, with back-office at
`staff-api.dev.effyshopping.com` (075, moved 2026-10-08). The Go service that 040 deployed at
`core-api.dev.effyshopping.com` no longer exists. Still ahead: **the event backbone**
(not built) and sweeping abandoned unpaid orders.

⚠ **NO SCREEN REFRESHES ITS DATA ON A TIMER (071).** All six apps are told when something they show
has changed — over a managed channel (AWS AppSync Events), independent of push notifications — and
re-read through the routes they already use; an app that was away reads once when it is back.
- **An update carries one word**, the kind of thing (`{"k":"orders"}`) — no id, no status, no
  amount — so a duplicate or late update cannot show anything wrong and a customer's update cannot
  name a shop.
- **Backend:** after a transaction COMMITS, call `announce` / `announceMoves` / `announceOrder`
  from `@effy/edge-shared/live`. They never throw. ⚠ A new route that changes an order, a round, a
  slot or stock and announces nothing fails `change-map.guard.test.ts`; a customer's update may be
  built only by the three shared functions (`customer-announce.guard.test.ts`).
- **Clients:** web consoles map kinds to query keys in `features/live/routes.ts`; mobile ViewModels
  collect `LiveClient.changes(…)`. ⚠ Do not add `refetchInterval` or a `delay` loop —
  `scripts/check-no-refresh-timers.sh` fails the build.
- ⚠ **The channel name carries a ten-minute epoch**: the channel authorizes a subscription once
  and never re-checks, so every app re-subscribes — and is re-checked — each epoch. That is what
  stops updates reaching someone whose access has ended.
- ⚠ **Mobile uses CIO (Android) / Darwin (iOS) for the socket** — never OkHttp (it clashes with the
  auth SDK's), and never the data client's engine (it cannot hold a WebSocket).

Everything gets built **slice by slice**, each driven by its own spec → plan → tasks. Don't build all
surfaces in parallel: one vertical slice proves the foundation before the pattern scales.

## Feature history (read on demand)

Every feature's build record — what changed, defects found, what was verified, and the operator
steps still open (deploy order, migrations, walks) — lives in [FEATURE-HISTORY.md](FEATURE-HISTORY.md),
newest first. ⚠ **Before working on or near a feature, read its entry there** (search for its number);
the entries carry gotchas and deploy-ordering rules that the code does not. Slices 001–003 are under
"Previous slices" at the end of that file. Per-feature artifacts are in `specs/<feature>/`.

Features recorded:

- **105-category-driven-variants** — Variants Only From Category Attributes (no platform "Pack size" option; net quantity per variant; clothing Size removed; import columns renamed) — built 2026-10-30; not migrated, deployed or walked
- **104-activity-log-drawer** — Every Activity Log in One Drawer (twelve logs; one server helper; search, type, dates, paging, CSV export; state in the address) — built 2026-10-29; not deployed or walked
- **103-console-data-tables** — One Data Table for Every Console List (server-driven search/filter/sort/paging in the address; fills the window; capped sets refuse past 500; no silent truncation) — MVP deployed to dev; the rest built 2026-10-28, not deployed or walked
- **102-backoffice-product-catalogue** — Back-Office Product Catalogue (every shop's products in one list; holds; Effy creates products for a shop and imports a shop's list; one writer of a new product) — built 2026-10-27; not applied, migrated, deployed or walked
- **101-category-driven-catalogue** — Category-Driven Catalogue (no product types; one ≤5-level tree; attribute library and attachments; facts as columns; per-variant details; library options; placements; 18+ label) — built 2026-10-26; not migrated, deployed or walked
- **099-shop-floor-signals** — Shop Floor Signals (next collection per shop and order, pick list in walking order, Availability, quality figures on Insights) — built 2026-10-24, spec signed off; not migrated, deployed or walked
- **098-product-variants** — Product Variants (up to two options, per-variant price/codes/weight/stock, one margin per product, unit pricing, sizes on every surface; carts from before 098 dropped) — complete in dev (migrated, deployed, walked)
- **096-parcel-labels-scanning** — Order Package Labels, Scanning & Printed Documents (a code and carrier-style label per bag; every hand-over per bag; scan-to-find and the hub station; hand-over report; delivery note; GST status; tax invoice on request) — complete in dev (migrated, deployed, walked)
- **097-same-day-by-postcode** — Delivery Today, Postcode by Postcode (staff switch "today" off for far postcodes; the calendar leaves today out; no new customer wording) — complete in dev (migrated, deployed, walked)
- **095-promotion-skins** — Promotion Skins (staff-designed skins on six layouts, any colour AA-checked on the server, chosen per group placement; pictures on promotions; `mega-nav` in the aisles menu; Classic = as before) — complete in dev, signed off; promotion routes deploy as stack `admin-promotions`
- **094-promotions-rebuild** — Promotions Rebuilt (four kinds, automatic or by code, targeting and limits; display groups replace banner placements; uses held at the intent) — complete in dev (migrated, deployed, walked), stage C applied
- **093-driver-work-sequence** — Driver Work in One Order (server-enforced steps; collector delivers; missing packages held; run stage; vehicle check off by default) — complete in dev (migrated, deployed, walked)
- **092-driver-mobile-redesign** — Driver App Redesign (storefront identity; three tabs; two-tap drops; scanning screens) — complete in dev (deployed, walked)
- **091-handover-visibility** — Scan Versus Manual Visibility (order, round and shop views of the hand-over record) — complete in dev (deployed, walked)
- **090-scanning-foundation** — Package Scanning: Foundations (one scan rule, the camera reader, hand-over records, hub sort, load the van; no screens) — complete in dev (migrated, deployed, walked)
- **089-package-labels** — Package Labels (a permanent code per package; shops print QR + Code 128 labels; EFFY/COURIER only) — complete in dev (migrated, deployed, walked)
- **088-failed-parcel-return** — Return Failed Parcels to the Hub (driver backlog A4; custody now sees delivery parcels) — complete in dev (migrated, deployed, walked)
- **087-customer-mobile-redesign** — Customer Mobile Redesign (storefront identity; five tabs with Cart; sheets not dialogs; iOS transitions) — complete (walked)
- **086-catalogue-image-delivery** — Catalogue Pictures That Load Once (one permanent CDN address; WebP copies made at upload) — complete in dev (applied, migrated, deployed, walked)
- **085-flexible-standard-delivery** — Flexible Standard Delivery (a day with no time, "as soon as possible", a time opt-in — all through one "Any time" window) — complete in dev (migrated, deployed, walked)
- **084-customer-storefront-redesign** — Customer Storefront Redesign (its own identity; session re-implemented; aisles include their sub-aisles) — built, `storefront` + `commerce` deployed to dev; not walked or signed off
- **083-delivery-model-cutover** — Delivery Model Cutover (the switch; the old same-day/standard arrangement removed) — both stages deployed to dev, marked complete; not walked
- **082-driver-operations-realignment** — Driver Operations Realignment (Effy delivery on its own day; permissions without a method) — signed off, deployed to dev
- **081-courier-override-compensation** — Back-Office Courier Override & Compensation — signed off, migrated and deployed to dev
- **080-courier-fulfilment** — Courier Fulfilment: via the hub or pickup from the supplier — signed off, deployed to dev
- **079-effy-vs-courier-checkout** — Checkout & Orders: Delivered by Effy vs Courier delivery — migrated and deployed to dev; not walked or signed off; rides 078's switch
- **078-effy-delivery-windows** — Effy Delivery Windows: today + the next delivery days — signed off, deployed to dev, switched off until the cutover
- **077-delivery-fee-engine-v2** — Delivery Fee Engine v2 (one fee per order; Pricing tab) — deployed to dev
- **076-effy-delivery-coverage** — Effy Delivery Coverage (one postcode list, one answer per address)
- **075-staff-gateway** — A Second Front Door for Back-Office (the staff gateway)
- **074-customer-points** — Customer Points (store credit)
- **073-order-dispatch-control** — Simple Order Status & Driver Assignment in Orders
- **072-immediate-driver-assignment** — Immediate Driver Work Assignment (assign early, open on time)
- **071-live-updates** — Live Updates Without Polling (all six apps)
- **070-retire-core-api** — One Backend: Retire the Always-On Shopper Service
- **069-delivery-slots-dates** — Delivery Time Slots & Standard Delivery Date
- **068-customer-lists** — Customer Lists (named lists over saved items)
- **067-product-approval-margin** — Product Approval & Effy Margin
- **066-delivery-instructions** — Customer Delivery Instructions
- **065-driver-item-manifest** — Driver Item Manifest & Temperature Classes
- **063-driver-work-assignment** — Driver Work Assignment & Wave Planning
- **059-shop-web-pwa** — Shop Console as an Installable, Notifying Production App
- **058-shop-today-insights** — Shop Console: Today & Insights
- **057-shop-web-redesign** — Shop Console Redesign
- **056-driver-management** — Back-Office Driver Management
- **055-refunds-cancellation** — Refunds & Cancellation
- **054-product-inventory** — Product Inventory (Shop-Managed Stock)
- **053-order-lifecycle-completion** — Order Lifecycle Completion
- **052-order-confirmation-invoice** — Order Confirmation & Emailed Receipt
- **050-observability-push-foundation** — Platform Observability & Push Notification Foundation
- **049-driver-mobile-app** — Driver Delivery App (the 6th & final client surface)
- **048-console-web-cicd** — Internal Console Continuous Deployment (Shop-Web & Back-Office)
- **047-delivery-shipping-engine** — Delivery Zones & Shipping-Fee Engine
- **046-customer-feedback** — Customer Feedback (listening channel)
- **042-customer-web-cicd** — Customer Storefront Continuous Deployment (dev)
- **041-monochrome-console-redesign** — Monochrome Consoles & Shop Mobile: Unified Dashboard Identity
- **039-customer-home-redesign** — Customer Web Home: Merchandised Landing Redesign
- **038-email-template-system** — Platform Email Template System
- **035-six-digit-otp** — Platform-Wide Six-Digit One-Time Codes
- **033-customer-saved-items** — Customer Saved Items: a watchlist
- **029-promotional-banner-carousel** — Promotional Banners: Fixed Canvas, Template & Offers Carousel
- **028-mobile-home-merchandising** — Customer Mobile Home: Sectioned Merchandising & Search Entry
- **027-customer-cart-sync** — Customer Cart Synchronisation, Promotions & Order Rules
- **024-brand-icons-splash** — Brand Marks: App Icons, Splash Screens & Favicons
- **020-shop-order-fulfillment** — Shop Order Fulfillment (Receive → Pick → Handoff)
- **019-customer-commerce-flow** — Customer Commerce Flow (Browse → Order)
- **017-platform-theme-tokens** — Platform Theme & Design Tokens Refresh
- **015-mobile-app-shell** — Mobile App Shell & Navigation (Customer + Shop)
- **014-shop-mobile-foundation** — Shop Mobile Foundation (Bootstrap) — app deleted 2026-10-23
- **013-customer-mobile-foundation** — Customer Mobile Foundation
- **012-customer-profile-management** — Customer Profile Management
- **011-customer-storefront-web** — Customer Storefront (Bootstrap)
- **010-domain-dns-foundation** — Platform Domain & Per-Environment Namespaces
- **009-shop-management** — Back-Office Shop Management
- **007-shop-web** — Shop Web Foundation (Bootstrap)
- **006-first-admin-bootstrap** — First Admin Bootstrap (Operator Break-Glass)
- **004-backend-bootstrap** — A3 cold-path decomposition (implemented + live in dev)
- **005-back-office-web** — Back-Office Web Foundation (Bootstrap)

<!-- SPECKIT START -->
For additional context about technologies to be used, project structure,
shell commands, and other important information, read the current plan
at specs/105-category-driven-variants/plan.md
<!-- SPECKIT END -->
