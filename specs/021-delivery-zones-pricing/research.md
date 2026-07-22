# Research: Delivery Zones & Pricing (021)

**Date**: 2026-07-21 · **Feeds**: [plan.md](./plan.md) · **Spec**: [spec.md](./spec.md)

Phase 0 decisions. Each records what was chosen, why, and what was rejected. Findings marked ⚠ change a
direction the spec or an assumption leaned toward. All grounded in the actual 019/020 code, verified by
three parallel探査 passes (checkout money path · both customer surfaces · back-office + schema).

---

## R1 — Path assignment: quote/checkout on the **hot path**, management on the **cold path**

**Decision**: Two homes, by audience and latency, exactly as 020 established.
- **Per-package quote, serviceability, and the extended intent** → **core-api (hot path)**, extending
  `internal/features/checkout`. Rule 1 (customer critical path — the customer stares at delivery options
  while they load, and this is the paid transaction).
- **Zone / offering / shop-location management** → **edge-api/admin (cold path)**, mirroring 009's
  `shops/` slice. Rule 2 (internal ops CRUD, latency-tolerant).

**Both paths share the `public` config tables** — the hot path *reads* zones/offerings at quote time; the
cold path *writes* them from back-office. This is **not** cross-path proxying (which the doctrine forbids)
— it is a shared database, which every slice already does. No API calls one path to the other.

**Rationale**: `docs/api/path-assignment.md` rule 1 puts "checkout reads, anything a customer stares at
while it loads" on core-api; rule 2 puts "back-office tasks, admin CRUD" on edge-api. The quote is
latency-critical and already lives where 019's checkout lives; the management surface is the 009 pattern
verbatim.

**Rejected**: *management on the hot path* (needless — it is low-frequency admin CRUD); *quoting on the
cold path* (a cold-start on the customer's delivery step is exactly rule 1's prohibition).

**Mandatory plan line (Principle III)**: recorded in [plan.md](./plan.md).

---

## R2 — Zone model: postcode → zone, keyed **origin-zone × destination-zone** (from `/speckit-clarify`)

**Decision**: A serviced area is a **set of AU postcodes** (`delivery_zone` + `delivery_zone_postcode`,
one postcode → at most one zone). **Both** a shop's origin and a customer's destination resolve to a zone
by postcode. Offerings are keyed **per (origin zone → destination zone, method)** — small table, not
per-shop.

**Rationale**: the operator's 2026-07-20 decision (no geocoding dependency, no external latency,
auditable, customers know their postcode) plus the clarify answer that pricing is origin×destination.
The customer address already carries `postal_code` (019, `customer_address`), and shops will gain one
(R4) — so both sides of a leg resolve the same way. Same-day exists only where the zone-pair offers it
(typically metro→metro), which falls out of the data with no special-casing.

**Rejected**: radius-from-point / PostGIS polygons (geocoding dependency the operator excluded); per-shop
rate tables (back-office can't maintain one per shop; the clarify session chose zone-pairs, Option B).

---

## R3 — Per-package quote capture: a **pending holder** consumed by 019's finalizer ⚠

**Decision**: The per-package delivery selection (method, fee, promised window) is captured at **intent
time** into a new `public.order_package_delivery` table (one row per (order, shop)), alongside a
`delivery_quote_expires_at` on the order. 019's `FinalizeSucceeded` transaction — already the atomic
fan-out — **reads that holder into new delivery columns on `shop_fulfillment`** in the same tx.

**⚠ This is the load-bearing structural decision.** The探査 confirmed `shop_fulfillment` rows do **not**
exist until finalization (the `GROUP BY shop_id` fan-out runs on `payment_intent.succeeded`). So the
per-package fee cannot live only on `shop_fulfillment` — there is no row to hold it between the customer
paying and the webhook arriving. It must be captured pre-payment, in a holder, and copied at finalize.

**Rationale**: mirrors how 019 already separates `order_item` (written at intent) from
`shop_fulfillment.subtotal_amount` (derived at finalize) — pending truth vs placed truth. `UpsertPendingOrder`
already deletes+reinserts `order_item` on every intent call; `order_package_delivery` follows the same
delete+reinsert lifecycle. The finalize path (`FinalizeSucceeded`) gains a JOIN from the fan-out to the
holder — a small extension of an existing transaction, satisfying FR-012a (atomic) for free because the
transaction boundary is already there.

**Rejected**: *storing the quote in Stripe PaymentIntent metadata* (50-key/500-char limits, unqueryable,
not platform-consistent); *re-deriving per-package fees at finalize from address+zones* (would ignore the
captured quote and drift if rates changed between intent and webhook — violates FR-011's honored window);
*putting delivery columns only on `shop_fulfillment`* (no row exists pre-finalize).

---

## R4 — Shop location: a **postcode column on `public.shop`** ⚠

**Decision**: `ALTER TABLE public.shop ADD COLUMN postcode text` (nullable — a shop with none is
undeliverable, FR-017). The postcode resolves to the shop's **origin zone** via
`delivery_zone_postcode`. Managed by back-office (US4).

**⚠ Shops have no location today.** 007 made `public.shop` deliberately minimal — its own comment:
*"no address, hours, capacity, zones, or inventory — those arrive with the slice that needs them."* 021
is that slice. 020's migration comment also explicitly hands 021 the delivery model
(*"021-delivery-zones-pricing owns the real model and may key it per-shop"*).

**Rationale**: a single postcode column matches the existing `customer_address.postal_code` convention and
the postcode-list zone model — no new table needed for shop location. `NULL` postcode = no origin zone =
undeliverable, the safe explicit state FR-017 requires. Never exposed to customers (FR-019).

**Rejected**: a separate `shop_location` table (over-modelled for one postcode); storing a zone_id
directly on the shop (couples the shop to zone identity and breaks if a postcode is re-zoned — the
postcode is the stable fact, the zone is derived).

---

## R5 — Package-aware cart: an **opaque package key** on the cart line ⚠

**Decision**: The cart line gains an **opaque `packageKey`** (a stable, meaningless-to-the-customer token
grouping items from the same shop) on both surfaces' device-local `GuestCartLine` and in the cart DTO.
The cart groups by it into anonymous "Package 1 / Package 2" sections. The token is **not** the raw shop
UUID and carries no name, location, or human-readable shop reference.

**⚠ This tensions with an existing invariant, and the resolution is deliberate.** 019's cart lines carry
**no shop identity at all** (documented FR-016: *"ONE unified Effy cart… NO shop identity"*). The
guest cart is device-local (localStorage / in-memory), so grouping *cannot* be server-computed for a
guest — the client needs a per-line grouping key. Adding an **opaque** key (not the shop id) groups the
cart while revealing nothing: "these two items ship separately" is exactly what the package breakdown the
customer asked for shows anyway, and it names no shop (SC-006).

**Rationale**: satisfies FR-005a (package-aware cart from the start, no address needed) without a server
round-trip for guests, and without leaking shop identity — the token is a grouping handle, not a shop.
The product detail already knows the product's shop; it exposes the opaque key at add-to-cart time.

**Rejected**: *raw shop UUID on the cart line* (reverse-correlatable across surfaces; unnecessary
exposure); *server-only grouping* (impossible for a guest cart that never hit the server); *no cart
grouping, split only at checkout* (rejected in `/speckit-clarify` Q4 — the split shows from the start).

---

## R6 — Fee injection: replace the flat constant in **both** consumers, thread the address in

**Decision**: `pricing.DeliveryFeeCents` is deleted. Its two consumers change:
- `checkout.computeAmounts` becomes per-package: it receives the resolved **destination zone** and the
  per-shop **selections**, groups lines by shop, prices each package via the offering table, and returns
  the summed delivery fee plus the per-package breakdown.
- `cart.Service.build` **drops the delivery fee entirely** — the cart shows item subtotal only and
  "delivery calculated at checkout" (there is no address at cart time, so no fee is knowable). The
  client mirrors: `cart-totals.ts` / `CartTotals.kt` stop adding `DELIVERY_FEE_CENTS`.

**Rationale**: the探査 found the flat fee enters in exactly these two places. The address is currently
**not** passed to `computeAmounts` (it's snapshotted separately) — so 021 threads a resolved zone into
the amounts computation. The cart has no address, so per-package *pricing* genuinely cannot happen there
(FR-005a says the cart shows the split and items, no price) — the fee moves wholly to the delivery step.

**Rejected**: *keeping a flat fee as a fallback* (FR-024 forbids any hardcoded fallback); *showing an
estimated fee in the cart* (misleading without an address; the clarify decision put prices at checkout).

---

## R7 — Quote freshness: capture with `expires_at`, honor within the window (from `/speckit-clarify`)

**Decision**: The quote endpoint captures the computed per-package fees server-side with a bounded
`delivery_quote_expires_at` (a few minutes). The intent endpoint honors the captured fees if within the
window; on expiry, or if a package became unavailable / same-day lapsed, it refuses and the client
re-quotes. The fee charged is always the server's captured quote, never client-supplied.

**Rationale**: FR-011/011a. The validity duration is a **`pricing`-package constant** (e.g.
`QuoteValidity = 10 * time.Minute`), matching the established convention that fixed commercial constants
live in `internal/platform/pricing`, not env config (the探査 noted `config.go` has no such knob and the
flat fee was a pricing constant). The same-day **cutoff** is per-offering data (R2), not a global
constant.

**Rejected**: recompute-fresh-at-payment (a cutoff lapse mid-checkout forces a re-confirm even when
nothing changed — rejected in clarify); trust-the-client-quote (the fee-drift/forgery attack SC-002/SC-004
forbid).

---

## R8 — Partial serviceability: auto-exclude + confirm (from `/speckit-clarify`)

**Decision**: When some packages are undeliverable to the address, those items are **auto-set-aside** with
an item-level notice; the customer **explicitly confirms** proceeding without them before payment.
Set-aside items are never priced, placed, or charged, and are restorable by choosing a reaching address.
All-undeliverable blocks entirely.

**Rationale**: FR-006b/006c, the AliExpress/Daraz-adjacent middle ground the operator chose. Mechanically:
the quote marks each package serviceable/not; the intent request must carry an explicit
`excludedShopKeys`/confirm flag that matches the server's serviceability verdict, or intent is refused —
so the customer cannot be charged for an unconfirmed exclusion, and a client cannot silently drop items.

**Rejected**: block-whole-order (rejected in clarify — one bad item stalls everything); silent-exclude
(charges/omits without consent — SC-011a forbids).

---

## R9 — Management surface: the **009 shops slice, copied** for zones/offerings/shop-location

**Decision**: A new `apis/edge-api/admin/src/delivery/` slice and an `apps/back-office/src/features/delivery/`
feature, both structural clones of 009's `shops/`. Reuse verbatim: `isActiveStaff` (read gate),
`canManageShops`-equivalent (mutate gate = admin/manager), `admin.audit_log` (new action/target values —
no new audit table), the `@effy/web-kit/console` `DataTable` + dialog patterns, the `@effy/api-client`
`get/post/patch/delete` (no client change), and the migration house style.

**Rationale**: 009 is the platform's proven admin-CRUD template; the探査 confirmed every piece is directly
reusable. Auth, audit, DTO organization (`shared-types` `PagedDTO<T>` + `AuditEntryDTO`), and routing all
carry over.

**⚠ Card-layout note (Principle V)**: the探査 found 009's `ShopDetailScreen` uses a "detail card." 021
MUST follow the constitution's **no-card doctrine** — sectioned pages, `DataTable`, and `<dl>` detail
rows — and NOT inherit any card usage. Zones and offerings are inherently tabular (a zone's postcodes;
the origin×destination×method rate grid), which is what tables are for. No card justification is claimed.

---

## R10 — Contracts: shared DTOs, regenerated to Kotlin (Principle II)

**Decision**: Two DTO groups, both single-sourced in `packages/shared-types/src/`:
- **Management** (admin): a new `src/delivery.ts` (`DeliveryZoneDTO`, `ShopLocationDTO`, `DeliveryOfferingDTO`,
  request DTOs, reusing `PagedDTO<T>` + `AuditEntryDTO`). Consumed by back-office only (no Kotlin gen).
- **Customer commerce**: additions to `src/cart.ts` (packageKey + per-package grouping), `src/checkout.ts`
  (the quote DTO, the extended intent request with selections + exclusions), and `src/order.ts` (per-
  package delivery on the receipt breakdown). These regenerate the customer Kotlin contract
  (`contract/CommerceDto.kt`) via `pnpm commerce-contract:check`.

**Rationale**: Principle II + the探査's confirmation that mobile DTOs are generated from
`src/customer-commerce-contract.ts`, never hand-written. FR-021 (parity) is satisfied by single-sourcing.

**Rejected**: hand-defining mobile DTOs (breaks the drift guard); a separate delivery contract package
(the customer commerce DTOs belong in the existing commerce aggregate).

---

## R11 — `shop_fulfillment` gains real per-portion delivery; 020 needs **no rework**

**Decision**: `shop_fulfillment` gains `delivery_service_level`, `delivery_method`, `delivery_fee_amount`,
and `promised_ready_at` (a real timestamp), populated at finalize from `order_package_delivery` (R3).
020's queue already orders by a `promiseFor(placedAt)` seam (uniform today); 021 makes `promised_ready_at`
real per portion, and 020's ordering consumes it.

**⚠ Verify the 020 seam**: 020's `promise.ts` derives the ready-by from `placedAt` + a constant. 021
repoints that single function to read `shop_fulfillment.promised_ready_at` when present, falling back to
the derivation when absent (pre-021 orders). This is the one 020 backend touch — a read swap in one file,
which is exactly what 020 built the seam for (020 FR-001b, SC-020).

**Rationale**: the promised readiness the shop sees is the customer's chosen window (FR-021/FR-021a). The
shop sees service level + ready-by, **not** the fee (FR-021a walls off the payment amount) — so the shop
queue/detail render `delivery_service_level` + `promised_ready_at` and never `delivery_fee_amount`.

**Rejected**: recomputing the promise in 020 (the seam exists precisely to avoid this); exposing the fee
to the shop (FR-021a, and 020 already walls off payment data).

---

## R12 — Telemetry & money discipline

**Decision**: New PostHog events for the customer delivery step (`delivery_options_viewed`,
`delivery_method_selected`, `delivery_address_unserviceable`, `delivery_items_excluded`) and back-office
management (`delivery_zone_created`, `delivery_rate_changed`, `shop_location_set`) — **no PII beyond the
subject id**, no address, no postcode in props (a postcode is location PII). Money stays **integer cents**
throughout (`platform/money`), decimal strings only at the DB/wire edge, per-package fees summed in cents
before the single Stripe amount.

**Rationale**: Principle VII, and the探査 confirmed `platform/money` is the integer-cents discipline every
amount already uses. Mobile telemetry remains deferred (013/014/015/020 pattern), recorded not skipped.
