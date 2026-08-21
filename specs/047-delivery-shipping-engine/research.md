# Research: Delivery Zones & Shipping-Fee Engine (047)

Decisions taken before implementation, with rejected alternatives and the reason. ⚠ marks a risk carried
into the slice, not a settled question. This feature **rebuilds** a capability withdrawn on 2026-08-02
(021 zones + rate grid, 030 locality lookup, 031 area decisions, 032 banded pricing + a shop-proposes /
admin-approves same-day workflow). The withdrawal's recorded reason — *"so many independent terms that
nobody could say which one refused"* — is the constraint every decision below answers to.

---

## R1 — The place dataset

**Decision**: commit a **G-NAF-derived, open, redistributable** Australian postcode/locality dataset to
`db/reference/au-localities.csv` — the same lineage as the withdrawn `au-localities.csv` — with columns
**postcode, locality name, state, latitude, longitude, address_count**, and load it with an idempotent
operator Go command `cmd/load-localities` (the `create-first-admin` precedent). Provenance + the required
attribution live in `db/reference/README.md`.

**Rationale**: FR-012 requires whole-of-Australia coverage; only a real dataset satisfies it. G-NAF is
the authoritative government-maintained source, released as **Open G-NAF under an EULA based on CC BY
4.0** via data.gov.au (verified 2026-08-21). A community wrapper such as `joelkoen/postcodes-au`
publishes exactly the six columns we need (postcode, locality, state, lat, lng, address_count), derived
from G-NAF and distributed MIT over the underlying Open-G-NAF terms — either that release or a direct
re-derivation is acceptable, provided the committed file carries the attribution *"Incorporates or
developed using G-NAF © Geoscape Australia"*.

- **`latitude`/`longitude`** are what make automatic ring suggestion (R4) possible without a geocoding
  service. Nullable — G-NAF's locality point does not cover every row; a null simply does not contribute
  to a postcode's representative point.
- **`address_count`** lets the platform pick a postcode's **primary** locality (the most-addressed one)
  for display when a bare postcode is entered (the 030 R11 display rule).

**Alternatives rejected**: the unlicensed `matthewproctor/australianpostcodes` (no licence = all rights
reserved — the exact trap 030's T002 hit); ABS SAL (clean CC BY 4.0 but carries no postcode); a
commercial geocoding API (rejected by Principle II and by Out-of-Scope). ⚠ **A migration of ~15k
`INSERT`s is rejected** (030 R2): a reference table's *contents* are not schema history, and a refresh
would mean a new multi-MB forward-only migration each time. Schema by migration, rows by loader.

⚠ **Carried risk**: the dataset is a ~1.7 GB download to re-derive, or a ready CSV from the wrapper repo.
The committed CSV is the source of truth; the derivation procedure is documented, not automated in CI.

---

## R2 — ⚠ Shop location is NOT required (the biggest simplification)

**Decision**: **do not re-add `shop.postcode`.** The customer fee depends on the **destination** zone's
distance ring and the **package weight** only; same-day is a back-office **eligibility** decision. Neither
needs to know where the fulfilling shop is.

**Rationale**: the old design used the shop's postcode twice — for origin→destination rate-grid pricing
(021) and for shop→customer straight-line same-day distance (032). Both are gone:

- **Pricing** is keyed on the destination ring (hub→customer), identical for every shop serving that
  customer — which is exactly what SC-017 requires (same fee regardless of fulfilling shop) and what
  hidden fulfilment demands (a shop-specific fee would leak origin).
- **Same-day** is an operator eligibility decision (zone flag + per-shop exception + collection cutoff),
  not a computed feasibility. The operator encodes their operational knowledge of which shop can serve
  which zone; no distance arithmetic substitutes for it (the 032 US2 insight, kept — but without the
  proposal/approval machinery).

**Consequence, accepted**: origin cost variance (a far shop serving a near customer) becomes **internal
margin**, absorbed because Effy chooses which shop fulfils and can pick the nearest (031's recorded
assumption, retained). The floor (R3) keeps the destination leg from ever losing money.

**Spec reconciliation (Principle I)**: the spec's Dependency *"shops must carry a location so their
packages can be priced by the shopper's ring"* and the matching Assumption were **narrowed** — a shop
needs only its **identity** (already known from the fan-out) to resolve its same-day exception, not a
location. FR-013 (never reveal the shop) is unaffected and, if anything, easier.

---

## R3 — The fee engine: additive slabs × a method factor

**Decision**: the active plan computes, for a (method, ring, package-weight):

```
raw  = method_factor[method] × ( ring_price[ring] + weight_add[weight_slab] )
fee  = clamp( roundUpToStep(raw, rounding_step), floor_amount, cap_amount )
```

where `method_factor` is `same_day_factor` (≥ `standard_factor`), `ring_price` is the distance slab
value for the destination ring, and `weight_add` is the upper-bound weight-slab value. All money is
`numeric(12,2)` integer-cents-safe; factors are `numeric(6,3)`.

**Rationale**: this matches the operator's own words almost verbatim — *"delivery type → factor a or b,
always a ≥ b"* (the multiplier), *"weight … slabs → fee factor x/y"* and *"zone … slabs for that too"*
(the two additive slab components) — while guaranteeing every invariant mechanically:

- **a ≥ b** (FR-022) is a single CHECK `same_day_factor >= standard_factor`.
- **Monotonic in weight and distance** because both components are non-negative and slab-stepped
  (FR-021: stepped, never linear).
- **Snap up, never down** (FR-024) → `roundUpToStep`; **never free / never below cost** (FR-026) → the
  floor; **never absurd** (FR-027) → the cap.
- **Every fee is a clean multiple of the step** (SC-005) because `cap` and `floor` are themselves
  multiples of the step (CHECKs), so all three of {snapped, floored, capped} land on the grid — *including
  the capped fee*, the case 032 SC-003 warned betrays an un-rounded cap.
- **A served zone always prices** (FR-029): the innermost is a real `ring_price`, the lightest slab a
  real `weight_add`, the top weight slab is **open-ended** (a package heavier than the last band takes the
  last band — a pure-engine rule, never a `99999` sentinel row), and activation refuses a plan with a hole
  (FR-051). There is no code path from a served zone to "no price".

**Alternatives considered**:
- *Fully per-method bands* (032's shape: distance/weight bands duplicated per method). Rejected as more
  operator workload and more config to keep gap-free, for no expressive gain the method factor doesn't
  give. The operator accepted *some* extra workload (rings) but not double the pricing grid.
- *Purely additive (no multiplier), same-day priced by its own bands.* Rejected: it hides the a≥b
  relationship the operator thinks in and cannot enforce it by a CHECK.
- *Continuous distance × rate.* Rejected — FR-021/FR-019: a continuous fee both loses the slab UX and
  narrows the coarse-distance leak toward a single origin.

⚠ **This is the one modelling choice the spec deliberately left open** (additive vs multiplicative). It
is fixed **here, in the plan**, per Principle I; if the operator prefers per-method bands, that is a
data-model change confined to `delivery_ring_price` / `delivery_weight_band` (gain a `method` column) and
the engine's read — the customer contract and the invariants are unchanged.

---

## R4 — Distance rings, suggested from coordinates, overridable

**Decision**: a small ordered set of **rings** (e.g. Inner / Middle / Outer / Extended). Every served
zone is assigned **exactly one** ring, a **stored attribute of the zone**. On composition the platform
**suggests** the ring by computing the zone's representative point (mean of its postcodes' locality
coordinates) and its **Haversine** straight-line distance from a configurable **hub** (`delivery_settings`),
mapping it to the ring whose `suggest_upper_km` it falls under; the admin may **override** (recorded).

**Rationale**: this is the standard concentric-ring courier model, and it answers the operator's stated
difficulty — *"how can we say which are far and which are closer"* — objectively and with low guesswork,
while leaving control (override) and honoring "more admin workload is acceptable if the method is sound".

- **The ring is read at quote time, not the distance.** The quote does `postcode → zone → ring →
  ring_price`; no Haversine runs on the customer path. The suggestion math runs **once**, admin-side
  (cold path, `suggest.ts`), when a zone is composed or its rings reviewed.
- **Distance measured hub→zone, never shop→customer** — so a banded fee implies only "how far the
  shopper's own area is from the hub", never which shop fulfils (FR-019 leak bound; the mistake 032's
  shop-relative distance risked). FR-018/SC-007: no distance figure ever enters a shopper DTO.
- **Rings are standing config, priced by the plan.** The ring *definition* and each zone's *assignment*
  persist across plan switches (the operator's "plan = pricing only" answer); only `ring_price` lives in
  the plan.

**Alternatives rejected**: pricing each individual zone (too much config, and a per-zone fee narrows the
leak); pure manual tiering with no suggestion (the guesswork the operator flagged); live routing (external
dependency on the price path — rejected in 030/031 and again here).

⚠ **Edge**: a zone whose postcodes have **no** coordinate (rare) gets **no** suggestion — it is flagged
for the admin to assign a ring by hand, never defaulted to the nearest ring (that would under-charge a
possibly-remote area). A postcode spanning states (0872 — NT/SA/WA) is a served-zone composition the
admin sees and decides; its representative point is meaningless and the admin assigns the ring
deliberately.

---

## R5 — Same-day eligibility: a flag and exceptions, no workflow

**Decision**: same-day is decided by **back-office data only**:

```
sameday_offered(shop, zone) =
    exception(shop, zone) exists ? (exception.mode == 'on')
                                 : zone.sameday_eligible
```

`delivery_zone.sameday_eligible` (default false) is the platform baseline — *"which zones WE do same-day,
all shops by default."* `shop_sameday_exception(shop_id, zone_id, mode ∈ {on, off})` is the per-shop
override — shop A **off** in zone X while **on** (default) in Y, Z; or a shop **on** where the zone
default is off. **All of it is set by a back-office admin; there is no shop-side surface** (FR-045).

**Rationale**: this is the operator's explicit model and the deliberate simplification over 032, whose
`shop_sameday_declaration` carried a five-state lifecycle (`pending → approved | declined | revoked |
superseded`), append-only versioning, two partial-unique in-force guards, a distance-in-approval screen,
and a cutoff-per-declaration. **All of that is deleted.** With back-office as the sole authority there is
no proposal to hold in force, no approval to race, and no decline reason to render — which removes most of
the "independent terms" the withdrawal blamed. Same-day is now: *is the zone eligible for this shop, and
is it before today's cutoff.* Two terms, both legible.

**Alternatives rejected**: keeping the propose/approve workflow (the operator explicitly moved the
decision wholly to back-office); a single `sameday_eligible` per shop with no zone dimension (cannot
express "shop A: not X but yes Y,Z").

⚠ Per-package resolution (FR-044): same-day is decided per fulfilling shop, so a two-shop basket can offer
same-day on one package and standard on the other (SC-011). The quote is per package (R13).

---

## R6 — The same-day cutoff, derived from the collection schedule (the hybrid)

**Decision**: same-day availability is **derived** from a configurable collection schedule, not a
separately-stored cutoff time:

- `delivery_collection_run` — one **or several** runs per day, each a wall-clock `run_time`
  (Australia/Melbourne).
- `delivery_settings.sameday_prep_buffer_minutes` — the shop's pick/prep lead time before a run.
- **Same-day is offered iff there is still a run today with `now ≤ run_time − buffer`.**

With one run this is a single daily cutoff (the operator's option 1/3); with several, availability
**extends through the day**, run by run (option 2) — the "best of 1 and 2" hybrid the operator asked for.
The customer-facing cutoff is the latest still-makeable run minus the buffer, and it moves automatically
as the operator adds later runs.

**Rationale**: the collection schedule is the real-world fact ("drivers start at 2pm"); making the cutoff
a *derivation* of it means the operator configures one thing (when drivers collect) and the cutoff can
never drift from it. FR-041: evaluated on the platform wall clock — ⚠ `time.Now()` on a UTC container is
10–11 h wrong depending on daylight saving, visible only in the evening and only in summer (the 032 R-note,
retained). The comparison converts to `Australia/Melbourne` explicitly.

**Alternatives rejected**: a standalone `sameday_cutoff` field (drifts from the actual collection time; two
sources for one fact); per-run buffers (extra config for no requested benefit — one global buffer).

⚠ **Working days**: standard delivery is quoted as "up to N working days"; same-day means "today". The
promised window is derived from the method + schedule; public/observed holidays are **out of scope** for
v1 (the window is advisory copy, not a hard SLA) — recorded, not hidden.

---

## R7 — Path split, and the engine's single home

**Decision**: as in the Constitution Check — customer reads/quote on the **hot path** (`core-api`),
back-office config on the **cold path** (`edge-api/admin`), product weight on the **cold path**
(`edge-api/shop`), reference load by an operator **Go command**.

**The fee engine lives in exactly one place**: `core-api/internal/platform/delivery/engine.go`, a **pure**
function (no I/O, table-testable). The admin console **validates** a plan (every ring priced, no weight-slab
gap, both factors present, cap/floor multiples of step) but **never computes a customer fee** — so there is
no second implementation to drift (the 032 "exactly one source for a delivery fee" invariant, generalised).

**Rationale**: the quote is latency-sensitive commerce (hot path, 011). Config is low-frequency operator
CRUD (cold path). Putting the engine in Go beside the quote keeps the one place a fee is computed on the
customer path; the TS admin side does structural validation only, which is not fee computation.

⚠ **`core-api` has no cloud deploy until 040's Fargate service** — which now exists (dev-live at
`core-api.dev.effyshopping.com`). So the customer half is provable in dev, not only locally (an
improvement over the 030-era constraint).

---

## R8 — Legal: rounding up is lawful, with disclosure (researched 2026-08-21)

**Decision**: snapping the delivery fee **up** to the plan's step is used and is **lawful in Australia**,
under these conditions the design enforces:

1. The fee is Effy's **own** charge — not GST rounding, not cash rounding — so no statutory maximum
   applies beyond the general prohibitions on misleading/unconscionable conduct.
2. It is **GST-inclusive** (domestic delivery is a taxable supply → 10% GST) — FR-032.
3. The **exact** snapped-up fee and order total are shown **before payment** and charged **unchanged**;
   the fee is never introduced or increased at the last step (no **drip pricing**, unlawful under ACL s18)
   — FR-033/FR-034.
4. That a delivery fee applies is disclosed **early** (the serviceability answer is the natural place) —
   FR-035, which also anticipates the reforms consulted on **Feb 2026** (effective **1 Jul 2027**)
   requiring mandatory transaction charges to be disclosed with the price.

**Rationale**: the ACCC's price-display and drip-pricing guidance treats a location/weight-variable
delivery charge as not required *in the advertised price* but **prohibits** adding it late; enforcement is
active (Dendy, $19,800, 2025). Rounding up serves "cannot lose money on a single delivery" and is
invisible to the shopper as anything but a clean number.

**Sources**: ACCC *Price displays*; ACCC drip-pricing enforcement; ATO — domestic freight/delivery a
taxable supply; Treasury Feb-2026 unfair-trading/drip-pricing consultation.

**Alternatives rejected**: rounding to nearest (silently absorbs the remainder on every order — FR-024);
excluding GST from the shown fee (unlawful for a consumer price); showing the fee only at the final step
(drip pricing).

---

## R9 — One serviceability rule, one refusal (the withdrawal lesson, made structural)

**Decision**: serviceability = *does the postcode belong to a `delivery_zone_postcode` of an `active`
zone.* One boolean. The up-front read (`storefront/serviceability`) and the checkout quote share the
**same predicate** (a shared SQL const / Go function), so they can never disagree (FR-004/SC-002). A
served zone with an active plan **always** yields a standard fee (R3), so "serviced but un-quotable" — the
`REGIONAL` defect that motivated the whole rebuild — is unrepresentable.

**Rationale**: the previous design's refusal could come from four independent places (postcode-not-in-zone,
no origin zone, no active offering, no active pricing rule). Collapsing to one predicate, and making the
fee engine total over served zones, means the only refusal is "your postcode is in no served zone" —
FR-002.

⚠ **`active` vs `configured`** (FR-005): a zone that exists but is `disabled` is *configured, not served*
— distinct from a postcode in no zone at all (unconfigured). The admin can tell a decision from an
oversight; the shopper sees the same single "not delivered yet" either way.

---

## R10 — Product weight: measured vs assumed

**Decision**: re-add `product.weight_grams int NOT NULL DEFAULT 500 CHECK (weight_grams > 0)` and
`weight_is_assumed boolean NOT NULL DEFAULT true`; backfill measured values from the existing `net_weight`
product attribute in the same migration. Shop operators set/measure weight via the existing products
domain (FR-054); the package weight is the **sum** of item weights (FR-056).

**Rationale**: weight drives a slab, so every product must have one and none may be weightless
(FR-053/`>0`, not `>=0` — a zero weight is free-delivery-by-arithmetic). Assumed-vs-measured
(`weight_is_assumed`) makes "we weighed it" distinguishable from "nobody has said" (FR-055) — the 032
design, retained wholesale because it was correct.

⚠ **Backfill assertion** (032 R-note, retained): the backfill joins `product_attribute_value.value_number`
on `attribute_definition.key = 'net_weight'`; if the resulting measured-row count comes back as *all* or
*none*, the column/key name is wrong and the migration silently updated nothing — the count is asserted in
quickstart, not assumed.

---

## R11 — Quote capture & immutability

**Decision**: at quote time, the per-package method options + fees the shopper is shown are **captured** —
`order.delivery_quote` (jsonb, what was shown) + `order.delivery_quote_expires_at`, and on finalize the
chosen per-package fee is written to `order_package_delivery` and summed into `order.delivery_fee_amount`
and each `shop_fulfillment`. The client **never sends a fee**; intent validates the selection against the
captured quote and uses **its** fee (FR-036/SC-013). A later plan/ring/eligibility change cannot re-price a
captured order.

**Rationale**: the 021 R3/R7 capture pattern, retained — it is how "an order keeps the fee it was quoted"
holds against a live-editable rule set, and how the platform is protected from a client-supplied fee.

---

## R12 — Telemetry & privacy

**Decision**: hot-path metrics — a **serviceability** counter labelled `serviced` only, and a **quote**
counter by outcome (`same_day_and_standard` / `standard_only` / `unserviced`) and by chosen method;
plus the **invariant alarm**: a served zone that fails to produce a standard fee (must never fire).
Config changes are attributed through `admin.audit_log`. Product events
(`delivery_serviceability_checked`, `delivery_method_selected`). **No postcode, address or coordinate ever
becomes a label or a property** (025/030 R13 — "Effy delivers to <suburb>" + a session ≈ a home address).

⚠ **Carry-forwards**: PostHog is still not initialised on customer-web (039) — web events are wired but a
no-op until then; mobile telemetry stays deferred. Recorded, not hidden.

---

## R13 — Checkout latency: one wave, not N round trips

**Decision**: the quote reads in **one wave-parallel block** — active plan (+ ring prices + weight bands),
destination `postcode → zone → ring + sameday_eligible`, the fulfilling shops' exceptions for that zone,
and the cart lines' weights (already joined for pricing) — then the engine runs purely in memory.

**Rationale**: 029 measured 8 serial Sydney-RDS queries at ~1.08 s of pure latency and 503'd the
storefront; the same mistake in checkout would be worse. The engine adds no round trip (it is arithmetic).

---

## R14 — Proving the wire contract across languages

**Decision**: the customer-facing shapes — `ServiceabilityDTO`, `LocalityDTO`, and the `DeliveryQuoteDTO`
(per-package method + fee, GST-inclusive cents as `WireInt`) — are declared once in `@effy/shared-types`,
generated to Kotlin, and pinned by a **Go↔Kotlin wire-contract test** sharing one byte-identical JSON
literal (the 028 mechanism, and the 027 R13 lesson — Kotlin serialising cents as `1.0` broke a Go `int`).

**Rationale**: the quote is the highest-risk cross-language shape (money + enums); a rename or a
number-type drift must fail a test, not a shopper's checkout.
