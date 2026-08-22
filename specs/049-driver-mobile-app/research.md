# Research: Driver Delivery App (049)

Phase 0 decisions. Each: **Decision · Rationale · Alternatives rejected.** All spec-level unknowns are
resolved here; open items are recorded as bounded carry-forwards, not blockers.

## R13 — US4 map: no geodata exists; navigate hand-off is the deliverable (found during implementation)

**Finding**: the data model has **coordinates for the hub only** (047 `delivery_settings.hub_latitude/longitude`).
The `shop` table is deliberately minimal (007) — it stores **no address and no coordinates at all** — and a
customer order's destination is an **immutable jsonb address snapshot** (`order.delivery_address`) with **no
lat/lng**. So an interactive **pinned map canvas cannot plot shops or customer drops** — there is nothing to
plot them from.

**Decision**: build the genuinely useful, buildable part of US4 and record the rest as blocked-on-geodata:
- ✅ **External navigate hand-off (FR-022)** — a customer drop *has* an address string, so
  `MapLauncher` (`expect/actual`: Android `geo:` intent, iOS `maps.apple.com`) opens the device maps app to
  the drop address. This is the operational essence of "get me there" and is wired into the drop detail.
- ✅ **Masked contact (FR-023)** — endpoint built, **capability-flagged 503 `contact_unavailable`** (the
  relay does not exist, R6); the client hides/disables the affordance.
- ⛔ **Pinned in-app map + MapLibre canvas (T038/T040, FR-029/030)** — **deferred, blocked on geodata**:
  shops need an address/coordinates column and orders need a geocoded destination before a map can plot
  them. Recorded, not faked (a map with no real positions would mislead).
- ⚠ **Navigate-to-shop is also blocked** — shops have no address, so the collection run cannot hand off to
  maps for a shop stop until `shop.address` exists. Navigate works for customer drops only.

**Carry-forward**: add `shop.address` (+ optional coords) and geocode `order.delivery_address`; then the
map-data endpoint (`GET /runs/{id}/map`) and the MapLibre canvas become buildable against real positions.

## R1 — Backend path: cold path for the whole driver backend

**Decision**: Put the entire driver backend on the **cold path** — a new `apis/edge-api/driver` service
(driver-pool authorizer, `/driver/v1/*`) for reads/writes, plus a scheduled assignment worker. No
`core-api` (hot path) change.

**Rationale**: Principle III reserves the hot path for **latency-sensitive customer** traffic. The driver
audience is internal, low-frequency (tens of drivers), and workflow-shaped — the exact profile 020 (shop
fulfillment) and 009 (back-office provisioning) placed on the cold path. Driver writes transition
`public.shop_fulfillment` (`collected`/`delivered`) and order status — 020 already established cold-path
Lambdas writing `shop_fulfillment`. Keeping a driver authorizer off the customer-scoped hot path also keeps
auth isolation (Principle IV) clean.

**Alternatives rejected**: (a) hot path — would add a second pool authorizer to a customer-scoped service
and pay Fargate for low-frequency internal traffic, contradicting Principle III; (b) split (reads hot,
writes cold) — needless complexity for no latency benefit.

## R2 — Auto-assignment: a scheduled sweep worker, not an event consumer

**Decision**: Auto-assignment is an **EventBridge-scheduled Lambda** (~every 30 s) in `edge-api/driver`
that, in one pass: (1) finds `shop_fulfillment` portions at `ready_for_pickup` with no open collection
task, groups them into collection work per zone, and assigns to eligible on-duty drivers; (2) finds
same-day packages checked in at the hub not yet in a delivery task, groups by order/customer address into
drops, and assigns delivery work. Assignment selects candidate work `FOR UPDATE SKIP LOCKED` so a package
is never double-assigned; nearest-driver preference uses the driver's last **location snapshot** when
present, else round-robin/load-balance within zone.

**Rationale**: The **SNS/SQS event backbone is not built** (only an `event_outbox` table + `outbox.go`
exist). A scheduled worker is Principle III's "async worker on the cold path," needs no new infrastructure,
and meets SC-003 (assignment visible ≤30 s) combined with the app's poll/pull-to-refresh. It is trivially
idempotent (re-running assigns only still-unassigned work). When the event bus lands, the same assignment
service becomes an event consumer with no model change.

**Alternatives rejected**: (a) event-bus consumer — the bus doesn't exist; building it is its own slice;
(b) assign-on-read (lazy, when the app polls) — scatters assignment logic across read paths and races
between drivers; (c) hot-path trigger at fulfilment transition — no bus, and it's customer-scoped.

**Carry-forward**: sub-30 s or push-instant assignment arrives with the event backbone; the sweep cadence
is env-configurable.

## R3 — Reuse 047 + 020 data; define the package/drop mapping

**Decision**:
- **Hub** = 047's `public.delivery_settings` singleton (`hub_latitude`/`hub_longitude`). Single central hub
  (spec clarification). No new hub table in v1.
- **Collection runs (schedule)** = 047's `public.delivery_collection_run` (Melbourne wall-clock run times).
  Driver collection runs align to these; same-day cutoff stays 047's derived rule.
- **Package** = a `public.shop_fulfillment` row (`UNIQUE(order_id, shop_id)` — one per shop portion).
- **Package method** = `public.order_package_delivery.method` (`same_day`|`standard`) for the same
  `(order_id, shop_id)`. Known at checkout → no manual sorting (spec clarification).
- **Drop** = an order's **same-day** packages, grouped by the order's `customer_address`; a customer with
  same-day packages from several shops = **one drop** (SC-006).
- Driver writes advance `shop_fulfillment.status`: `ready_for_pickup → collected` (at shop) and
  `collected → delivered` (at drop), replacing 020's dev stubs.

**Rationale**: Both keys are `(order_id, shop_id)`, so package↔method is a 1:1 join; the model needs no new
"package" table. Reusing 047's hub/schedule honours Principle II and keeps one source of truth.

**Alternatives rejected**: a new `package`/`hub`/`collection_schedule` table — duplicates 047/020 and
invites drift; a manual sort step — contradicts the settled model.

**Verify at implementation**: whether `shop_fulfillment.status` CHECK already includes the full driver
lifecycle (020 widened it to `…collected, delivered` for the stubs). The migration re-affirms the enum and
adds the driver-side transition guards.

## R4 — Runs and typed tasks (data shape)

**Decision**: `driver_run` (type `collection`|`same_day_delivery`, driver_id, status, business_date) groups
tasks. `collection_task` references one `shop_fulfillment` (the package to collect). `delivery_task` (a
drop) references an `order` + its `customer_address`, and joins the same-day packages via
`delivery_task_package`. Status timelines in `driver_task_event`. Proof in `proof_of_delivery`
(1:1 with a delivered `delivery_task`). See data-model.md.

**Rationale**: Collection and delivery are structurally different (one-package vs many-packages-one-drop),
so two task tables under one run grouping is clearer than a polymorphic table, and it makes the phase-aware
home (FR-021) and the two history record types (FR-033) fall out directly. Typed tasks, no driver roles
(spec clarification).

**Alternatives rejected**: one polymorphic `driver_task` — forces nullable columns and CHECK gymnastics; a
route-optimised batch model — out of scope (single active run, ordered stops).

## R5 — In-app map (US4/P2): MapLibre behind expect/actual

**Decision**: The in-app **map is a P2 capability** (US4), not on the P1 path. Implement it as a
`commonMain` `MapDriver` `expect/actual` rendering a native map (`UIKitView`/`AndroidView`), using
**MapLibre** with a **custom monochrome style** (pins + route line + hub square pin). Turn-by-turn always
hands off to the device maps app (`geo:`/`maps://` intents behind the same driver). No live GPS streaming.

**Rationale**: Effy's design is strictly monochrome (Principle V) — MapLibre lets us author a fully
monochrome vector style with no per-load billing and no third hue; it works on both platforms. It is the
platform's first map, so isolating it behind a driver keeps P1 shippable without it.

**Alternatives rejected**: Google Maps SDK — monochrome requires a style JSON and carries per-load cost and
a coloured default; acceptable fallback if MapLibre integration proves heavy on iOS. A static map image —
can't show live location or an interactive stop sheet.

**Carry-forward**: confirm MapLibre KMP/iOS integration effort in a Phase-0 spike during `/tasks`; Google
Maps is the recorded fallback.

## R6 — Masked customer contact (US4/P2): affordance now, relay is a dependency

**Decision**: Build the **Contact customer** affordance on the drop (FR-023) but treat the **masking relay
as a platform dependency that does not exist yet**. v1 ships the affordance behind a capability flag; the
real masked call/SMS relay is a recorded follow-on (a provider integration — e.g. a number-masking
service — or routing through the notifications path for in-app messaging).

**Rationale**: The platform has no telephony/relay infrastructure. Exposing real customer phone numbers
would violate the spec's masking requirement and customer privacy; better to ship the affordance disabled
than to leak numbers. This mirrors how earlier slices shipped an affordance whose backend was a later slice.

**Alternatives rejected**: expose the raw number — privacy violation, non-compliant; block the whole drop
flow on masking — masking isn't needed to complete a delivery, so it must not gate P1/P2 completion.

## R7 — Proof of delivery: private S3 presign, four methods

**Decision**: Reuse the private media bucket + the `@effy/edge-shared` **presign** helper. Photo and
signature (captured as a PNG) upload via a **presigned PUT**, then the proof record stores the object key;
delivery-code proof verifies a code server-side; contactless stores method + optional note. A
`delivery_task` cannot reach `delivered` without a completed `proof_of_delivery` row (FR-026), enforced in
the writing transaction. Proof media is private (signed GET only).

**Rationale**: The presign pattern is established (product media, 029 banners) and lives in edge-shared
(Principle II). Keeping proof private protects customer PII in images.

**Alternatives rejected**: base64 in the DB — bloats rows, no CDN/signed access; public objects — leaks
delivery photos.

## R8 — Auth: reuse driver pool; add a driver_mobile app client; single token

**Decision**: Reuse the existing **driver Cognito pool** (passwordless 6-digit EMAIL_OTP via the 035 custom
challenge — already configured on the pool). Add a dedicated **`driver_mobile` app client**
(`auth-driver.tf`, mirroring `shop_mobile`), register it in the driver authorizer's `extra_client_ids`
(`edge-gateway.tf`). The app sends a **single access-token bearer** to `/driver/v1/*` (shop-mobile D2s
pattern — driver hits only the cold path). The platform **`driver` record is authoritative** (status/zone/
hub); a valid token never overrides a disabled driver. AuthDriver interface is structurally passwordless
(no password/sign-up/recovery), like shop's.

**Rationale**: The pool and its custom challenge already exist; only a client + authorizer registration are
needed. Single-token because the driver never calls the two-token hot path. Record-authoritative access is
the platform's standing rule (Principle IV).

**Alternatives rejected**: a new pool — violates the four-pool model; two-token protocol — unnecessary
(no hot-path calls); trusting the claim for status — forbidden by Principle IV.

## R9 — Provisioning: minimal admin/drivers domain

**Decision**: Add a minimal `drivers/` domain to `apis/edge-api/admin` (back-office authorizer):
create/list/disable a driver, provisioning a driver-pool Cognito user **Cognito-first → record** (006/009
idempotent pattern), setting name/zone/hub/vehicle. RBAC: read = any active staff; mutate =
`admin`/`manager`. A full driver-management console UI is **out of scope** (spec) — this is the minimal
adjunct so US1 has an account to sign in as; back-office UI can be a later slice.

**Rationale**: US1 is untestable without a provisioned driver; 009 already proved the Cognito-first
provisioning pattern for shop users. Keeping it minimal respects the spec's scope boundary.

**Alternatives rejected**: a full driver-management console now — scope creep beyond the spec; a CLI
break-glass only (like 006) — insufficient for ongoing driver onboarding.

## R10 — Idempotency & the reassignment race

**Decision**: Every driver write carries a per-action **`changeId`** (027 cart pattern) so the offline
queue (FR-039/040) and network retries apply exactly once. The assignment worker selects work `FOR UPDATE
SKIP LOCKED` and writes the task in the same transaction, so two sweeps (or two drivers) never double-claim
a package. Returning ineligible drivers' work to the pool (FR-011) is a status flip guarded by the task's
current owner; an in-progress step cannot be silently reassigned mid-action.

**Rationale**: 027 showed absolute quantities + per-action ids make offline sync safe; `SKIP LOCKED` is the
standard Postgres claim pattern. Idempotent consumers are Principle VI.

## R11 — Telemetry (Principle VII)

**Decision**: Backend — structured logs + metrics: `assignment_latency`, `unassigned_work` gauge (age of
oldest unassigned ready package), `proof_upload_failed`, `duty_on/off` counts; an alert on stale
unassigned work. Mobile — Crashlytics via `core/platform`. **PostHog product events are declared** (duty
toggled, run started, stop collected, hub checked in, drop delivered, drop failed) **but emission is
deferred**, matching every prior mobile slice (PostHog is not initialised on any mobile surface). No PII
beyond the auth subject id; no currency ever.

**Rationale**: The worker's health is the one thing a small team can't watch by hand — hence the
unassigned-work alert. Deferring mobile PostHog is the standing platform reality, recorded not hidden.

## R12 — Reconciling 047's "Effy does all delivery"

**Decision**: This slice **evolves** 047: Effy drivers own **collection + same-day delivery**; **standard**
delivery is (mostly) an **external carrier's** job and a standard package's driver-app lifecycle ends at
hub check-in. Recorded in CLAUDE.md ("Driver logistics model") and the spec; 047's concluded spec is not
rewritten (its input quote is historical).

**Rationale**: The operator restated the model during clarification; the living platform description
(CLAUDE.md) is the right place to record the evolution without disturbing a signed-off spec.
