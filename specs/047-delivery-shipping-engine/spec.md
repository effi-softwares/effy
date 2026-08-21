# Feature Specification: Delivery Zones & Shipping-Fee Engine

**Feature Branch**: `047-delivery-shipping-engine`

**Created**: 2026-08-21

**Status**: Draft

**Input**: Operator description: "We have delivery zones defined by generic towns/areas, suburbs and
postal-code areas — using an Australian dataset, Victoria/Melbourne first. Effy has two delivery
methods: same-day (fast, always dearer) and standard (up to ~5 working days, cheaper); same-day
factor `a` ≥ standard factor `b`. Shipping fee depends on the delivery method and on the package
weight in **slabs** (not a linear relationship). Add other factors if needed. Snap the final fee to a
slab value by rounding **up, never down** — but check the Australian legal position first. Before we
quote, we must be able to check and show whether we do same-day for the customer's address or standard
only. Back-office defines which zones get same-day (all shops by default), and can set shop-specific
rules (shop A: no same-day in zone X, yes in Y and Z). All those decisions are the back-office admin's
alone. Pricing values and factors are a back-office rule set; back-office can hold multiple shipping-fee
plans/templates and activate one at a time. Effy does all delivery — drivers collect packages from
shops on a configurable schedule (e.g., 2 pm). We need the freedom to control shipping fees in a
logical, reasonable and legal way, and we cannot lose money on a single delivery."

---

## Context: this was built once, withdrawn whole, and is being rebuilt deliberately simpler

The platform previously built this capability across **four stacked slices** — serviced zones + a rate
grid, a suburb/locality lookup, per-area service decisions, and a banded pricing engine with a
shop-proposes/admin-approves same-day workflow. On **2026-08-02** the operator **withdrew all of it**,
including the delivery fee, the serviceability check and the underlying Australian place data. The
recorded reason is the north star for this rebuild:

> "a configuration surface with so many independent terms that when a shopper was told 'we don't deliver
> here', nobody could say **which** term refused — postcode-not-in-zone, no origin zone on the shop, no
> active offering on the leg, or no active pricing rule for the method."

So today the platform has **no delivery fee and no serviceability**: every address is implicitly
deliverable and checkout charges items minus discount. This feature restores delivery zones and a
shipping-fee engine **from scratch**, and the single most important design rule below exists to prevent
the failure that killed the last attempt.

### The governing rule: one serviceability decision, one legible refusal

**Whether Effy delivers to an address is decided by exactly one thing: does the address's postcode
belong to a served delivery zone.** If it does, **standard delivery is always available and always
priceable** — the fee engine is designed so a served zone can never produce "no price". If it does not,
the shopper is told plainly "we don't deliver to your area yet", and that is the *only* reason there
ever is. Same-day is a strictly *additive* offer layered on top of a served zone; its absence never
makes an address unserved, it only means "standard only". A shopper is never invited in and then stopped.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Effy delivers to real places, at a fee that never loses money (Priority: P1)

A back-office admin builds the map of where Effy delivers by searching a record of **real Australian
places** — "Richmond", "Werribee", "Ballarat" — and adding them to named delivery zones, without typing
raw postcodes. Each zone is placed in a **distance ring** (how far it sits from Effy's operating hub),
which the platform suggests automatically and the admin can override. The admin sets the active
**shipping-fee plan**: what standard delivery costs per ring, how package weight adds cost in **slabs**,
the rounding step, a minimum floor and a maximum cap. A shopper then enters their address, is told
whether Effy delivers there, and at checkout is quoted a **single, GST-inclusive, rounded-up** standard
delivery fee that reflects how far their zone is and how heavy their basket is — shown in full before
they pay.

**Why this priority**: It is the whole foundation — serviceability and a sound standard fee. It is also
independently valuable and shippable on its own: Effy can deliver, everywhere it chooses, at a price
that is legal and never below cost, with no same-day machinery at all.

**Independent Test**: Compose one served zone and one unserved area; define one fee plan; confirm a
shopper in the served zone is quoted a sensible rounded fee that rises with distance ring and with
basket weight, and a shopper in the unserved area is told plainly that Effy does not deliver there.

**Acceptance Scenarios**:

1. **Given** an admin composing a zone, **When** they search a place name, **Then** matching real places
   appear identified by locality, state and postcode, and can be added without typing a postcode.
2. **Given** an admin has added a place whose postcode also covers other places, **When** they confirm,
   **Then** they are told plainly how many other places become serviceable as a result, before it takes
   effect.
3. **Given** a served zone, **When** a shopper enters an address in it, **Then** they are told Effy
   delivers there; **Given** an address in no served zone, **Then** they are told plainly Effy does not
   deliver to that area yet — and that is the only reason given.
4. **Given** two shoppers with identical baskets whose zones are in different distance rings, **When**
   each is quoted, **Then** the farther-ring shopper pays at least as much as the nearer one.
5. **Given** two shoppers in the same zone with baskets of materially different weight, **When** each is
   quoted, **Then** the heavier basket costs at least as much, moving in weight **slabs** rather than
   continuously.
6. **Given** any computed fee, **When** it is shown to a shopper, **Then** it has been rounded **up** to
   the plan's step, is never below what the rules produced, is never below the plan's floor, is never
   above the plan's cap, is GST-inclusive, and is shown in full before payment.
7. **Given** a served zone with a fully defined active plan, **When** any address in it is quoted,
   **Then** a standard fee is always produced — a served zone can never answer "no price".

---

### User Story 2 — A shopper is told, before checkout, whether same-day is possible today (Priority: P1)

A shopper wants to know "can I get this today?" before they invest in a basket. The platform can answer
because a back-office admin has marked which zones are **same-day eligible** and has configured when
Effy's drivers **collect** from shops. If the shopper's zone is eligible and it is still early enough in
the day to make a collection run, same-day is offered — at its own, higher fee. Otherwise the shopper is
shown standard delivery only, with no dead-end and no confusion about why.

**Why this priority**: Same-day is Effy's premium promise and the reason the two-method model exists;
knowing it up front is a first-class UX outcome. It sits at P1 with US1 because "can we get it there
today?" is the question this whole feature was reintroduced to answer honestly.

**Independent Test**: Mark one zone same-day-eligible and one not; configure a collection schedule;
confirm a shopper in the eligible zone before the cutoff is offered same-day + standard, a shopper in
the eligible zone after the cutoff is offered standard only, and a shopper in the non-eligible zone is
offered standard only.

**Acceptance Scenarios**:

1. **Given** a same-day-eligible zone and a shopper ordering early enough for a remaining collection run,
   **When** they check their address or reach checkout, **Then** same-day is offered alongside standard.
2. **Given** a same-day-eligible zone but a shopper ordering after the last collection run's cutoff for
   today, **When** they check, **Then** same-day is not offered and standard still is.
3. **Given** a zone not marked same-day-eligible, **When** a shopper there checks, **Then** same-day is
   never offered and standard is, and the absence of same-day is never expressed as "we don't deliver".
4. **Given** same-day is offered, **When** the shopper sees both options, **Then** the same-day fee is
   greater than or equal to the standard fee for the same basket and zone.
5. **Given** the admin configures more than one collection run in a day, **When** a shopper orders after
   an earlier run's cutoff but before a later run's cutoff, **Then** same-day is still offered against the
   later run.
6. **Given** the platform's operating timezone, **When** the same-day cutoff is evaluated, **Then** it is
   judged on the platform's wall clock (Australia/Melbourne), never the shopper's device clock.

---

### User Story 3 — Back-office tailors same-day per shop, and no one else can (Priority: P2)

Same-day is possible only if a shop that actually holds the goods can be reached in time, and shops
differ — one has a van and staff for it in a given area, another does not. A back-office admin sets these
exceptions directly: by default every shop does same-day in every same-day-eligible zone, but the admin
can switch a specific shop **off** for a specific zone (shop A stops offering same-day in zone X while
still doing Y and Z) or **on** for a zone it otherwise would not serve. Every such decision is the
admin's alone — a shop cannot set, propose or approve any of it. A shopper's same-day offer then reflects
whether the shop fulfilling *their* goods does same-day in *their* zone.

**Why this priority**: It is what makes same-day an honest promise rather than a blanket toggle, but it
depends on US2 existing to have something to tailor. It also enforces the operator's explicit rule that
these are back-office decisions only.

**Independent Test**: In a same-day-eligible zone, switch one shop off for that zone; confirm a shopper
fulfilled by that shop is offered standard only while a shopper fulfilled by another shop in the same
zone is offered same-day; confirm no shop-facing surface can change the setting.

**Acceptance Scenarios**:

1. **Given** a same-day-eligible zone with no exceptions, **When** any shop fulfils an order there,
   **Then** same-day is offered (subject to the cutoff).
2. **Given** an admin switches shop A off for zone X, **When** shop A fulfils an order in zone X, **Then**
   same-day is not offered for that package, and standard still is.
3. **Given** shop A is off for zone X but on for zones Y and Z, **When** shop A fulfils orders in Y and Z,
   **Then** same-day is offered there.
4. **Given** a basket fulfilled from two shops in a same-day-eligible zone where only one shop does
   same-day there, **When** it is quoted, **Then** same-day is offered on **only** that shop's package.
5. **Given** any shop operator, **When** they look for a control over same-day coverage or delivery fees,
   **Then** there is none — these are back-office decisions, verified by attempting the change directly
   and not only through the interface.
6. **Given** any same-day exception, **When** it is recorded, **Then** it names which admin made it and
   when.

---

### User Story 4 — Back-office keeps several fee plans and activates one (Priority: P2)

A back-office admin maintains more than one **shipping-fee plan** — a launch plan, a seasonal plan, a
"fuel surcharge" plan — each a complete set of pricing values (per-ring prices, weight slabs, the
same-day and standard factors, rounding step, floor, cap). Exactly one plan is **active** at any time.
The admin can prepare a plan in advance and switch to it in a single action; the switch changes what
**new** quotes cost, and touches neither the zone map nor the same-day eligibility settings. An order
already quoted keeps the fee it was quoted at.

**Why this priority**: It gives the operator real, safe control over pricing without editing live rules
in place, and it is how the platform adapts fees to cost without ever losing money. It is P2 because US1
must exist (a plan to price against) before multiple plans matter.

**Independent Test**: Create two plans with different prices, activate one and quote a basket, activate
the other and quote the same basket; confirm the fee changes, that zones and same-day eligibility are
unchanged, and that a basket quoted under the first plan retains its original fee.

**Acceptance Scenarios**:

1. **Given** several fee plans, **When** an admin views them, **Then** exactly one is marked active and
   the rest are clearly inactive.
2. **Given** an admin activates a different plan, **When** a new basket is quoted, **Then** it is priced
   by the newly active plan.
3. **Given** a plan switch, **When** the admin inspects the zone map and same-day eligibility, **Then**
   both are unchanged — a fee plan carries pricing only.
4. **Given** an order quoted under one plan, **When** a different plan is later activated, **Then** that
   order is fulfilled at the fee it was quoted.
5. **Given** an admin attempts to activate a plan that is missing a required value (a ring with no price,
   a gap in the weight slabs), **When** they try, **Then** activation is refused with the gap named,
   because an active plan must never be able to produce "no price" for a served zone.
6. **Given** any plan change or activation, **When** it is recorded, **Then** it names which admin made
   it and when.

---

### User Story 5 — Every product has a weight, honestly labelled (Priority: P3)

Because weight drives the fee in slabs, every package must have a weight, which means every product must.
A shop operator can record a product's **real, measured** weight; a product no one has weighed still has
an **assumed** weight so it is never priced as weightless and never delivered free — but the two are
always distinguishable, so anyone can see which products still need attention.

**Why this priority**: It is what makes the weight factor real rather than arithmetic, but the engine
functions on assumed weights alone, so it can follow the pricing work rather than block it.

**Independent Test**: Create a product without a weight and confirm it still quotes (on an assumed
weight) and is flagged as assumed; record a real weight and confirm it is now marked measured and the
quote reflects it.

**Acceptance Scenarios**:

1. **Given** a product with no recorded weight, **When** it is added to a basket and quoted, **Then** a
   fee is still produced using a stated assumed weight, never a zero weight and never free delivery.
2. **Given** a shop operator, **When** they record a product's real weight, **Then** it is marked as
   measured rather than assumed, and later quotes use it.
3. **Given** a mix of products, **When** an operator reviews them, **Then** measured and assumed weights
   are distinguishable, so the ones still needing a real weight are visible.
4. **Given** a multi-item basket, **When** it is quoted, **Then** the package weight is the sum of its
   items' weights and the weight slab is chosen from that sum.

---

### Edge Cases

- **A postcode covering many places** — one postcode can cover a dozen or more suburbs; adding any one of
  them makes them all serviceable. The admin must be shown this before confirming (US1 scenario 2), so a
  narrow-looking choice is never secretly broad.
- **A place name recurring across states** — there are several "Richmond"s; a place is always chosen fully
  identified (locality + state + postcode), never by bare name.
- **A postcode with no place behind it** — a PO-box-only code, or one created after the last data refresh.
  It must be warned about and require explicit confirmation, never silently accepted (deliveries that
  never happen) and never hard-blocked (the record can lag reality).
- **An address in no served zone** — the single "we don't deliver here yet" outcome; standard and same-day
  alike are simply absent, with one reason.
- **A served zone with same-day eligible but every collection run for today already missed** — same-day is
  withdrawn for today only; standard is unaffected; tomorrow it returns.
- **A basket from two shops in the same zone** — priced and offered per package; each package may get a
  different same-day answer (US3 scenario 4); the shopper pays one combined, GST-inclusive total.
- **A product with no measured weight** — priced on an assumed weight, never free, never zero-distance.
- **A very heavy or very far order** — the fee stays sane because the plan defines a maximum cap; the cap
  itself is a multiple of the rounding step so a capped fee is still a clean number.
- **A gap in the plan** — a distance ring with no price, or a weight above the top slab, must never yield
  "no price" or "free". This is prevented at plan activation (US4 scenario 5) and by a top slab that is
  open-ended.
- **A quoted order held while the active plan changes** — the quoted fee stands; a plan switch never
  re-prices work already quoted.
- **A zone moved between distance rings, or its ring override changed** — affects only new quotes, never
  captured ones.
- **The place record is refreshed and a place disappears** — the affected zone entry is flagged for an
  admin, never silently dropped.
- **A shopper changes their delivery address mid-session** — the serviceability answer, the available
  methods and the fee are all re-evaluated for the new address.

---

## Requirements *(mandatory)*

### Serviceability — the one decision

- **FR-001**: The platform MUST decide whether it delivers to an address by a single rule: whether the
  address's postcode belongs to a **served delivery zone**. No other condition may make an address
  unserved.
- **FR-002**: When an address is not in any served zone, the platform MUST tell the shopper plainly that
  Effy does not deliver there yet, and MUST give no other or competing reason.
- **FR-003**: The platform MUST be able to answer serviceability **before checkout** — while the shopper is
  entering or has set an address — so they learn where they stand before investing in a basket.
- **FR-004**: The up-front serviceability answer and the answer used at checkout MUST be decided by the
  same rule, so the two can never disagree (a shopper told "yes" up front is never refused at payment).
- **FR-005**: The platform MUST distinguish, for the operator, a zone that is **served** from an area that
  is simply **not configured**, so an unserved area is never ambiguous between a decision and an oversight.

### Delivery zones — composed from real places

- **FR-006**: A back-office admin MUST be able to compose a delivery zone by searching the platform's
  record of real Australian places and choosing them by name, without typing a postcode.
- **FR-007**: Every place offered for selection MUST be identified by locality name, state/territory and
  postcode together; a bare name MUST NOT be selectable.
- **FR-008**: Before a place is added, the admin MUST be shown every **other** place its postcode also makes
  serviceable, and how many there are, because serviceability is decided at postcode grain.
- **FR-009**: A postcode belonging to a place already in another zone MUST be refused, naming the zone that
  holds it — a postcode belongs to at most one zone.
- **FR-010**: An admin MUST be able to add a postcode directly for a place absent from the record, but such
  a postcode MUST raise an explicit warning and require deliberate confirmation; it MUST NOT be silently
  accepted and MUST NOT be hard-blocked.
- **FR-011**: Removing a place or postcode from a zone MUST state which places stop being serviceable before
  it takes effect.
- **FR-012**: The platform MUST cover the whole of Australia in its place record even though only Victoria /
  Greater Melbourne is served at launch, so expanding coverage later is composing new zones, not loading new
  data.
- **FR-013**: A shopper MUST NEVER be shown, or able to infer from anything this feature adds, which shop
  fulfils their order (hidden fulfilment is unchanged).

### Distance rings — how "far vs near" is decided objectively

- **FR-014**: Every served zone MUST belong to exactly one **distance ring** — an ordered band expressing how
  far the zone is from Effy's operating hub (e.g., inner, middle, outer, extended). Rings are the unit the
  fee's distance factor is priced on, not individual zones.
- **FR-015**: The platform MUST **suggest** a zone's distance ring automatically from the zone's
  representative location relative to a configurable reference hub, so the admin is not left guessing which
  places are far. ⚠ This directly answers the operator's stated difficulty: "how can we say which are far and
  which are closer".
- **FR-016**: An admin MUST be able to **override** a suggested ring, and the override MUST be recorded as
  the zone's ring.
- **FR-017**: The reference hub and the ring boundaries MUST be configurable by a back-office admin.
- **FR-018**: The distance used to place a zone in a ring MUST be an internal operational input only; no
  distance figure, at any granularity, may be shown to a shopper.
- **FR-019**: Because the fee's distance factor is banded by ring rather than continuous, a ring MUST span a
  wide enough range that a fee never resolves to a single shop or a single street — the coarse distance a
  banded fee implies is about the shopper's own area, never about fulfilment.

### The shipping-fee engine — factors, snapping, and never losing money

- **FR-020**: The delivery fee MUST be derived from at least three factors: the **delivery method**
  (same-day vs standard), the **package weight** in slabs, and the **destination zone's distance ring**.
- **FR-021**: The relationship between weight and fee MUST be **slab-based (stepped), not linear** — a basket
  a little heavier does not cost a little more; it costs more only when it crosses into the next slab.
- **FR-022**: The same-day factor MUST be greater than or equal to the standard factor for the same weight
  and ring — same-day is never cheaper than standard.
- **FR-023**: Each delivery method MUST be priceable independently, so same-day can cost materially more
  than standard at the same weight and ring.
- **FR-024**: Every computed fee MUST be **snapped upward** to a configurable step (e.g., to the next
  $0.50), **never rounded down**. Rounding down would make the platform silently absorb the remainder on
  every order.
- **FR-025**: The rounding step MUST be configurable within the active fee plan.
- **FR-026**: The fee MUST have a configurable **minimum floor** so a delivery is never free and never
  priced below what it costs Effy to make it — the operator's "cannot lose money on a single delivery" rule
  made mechanical.
- **FR-027**: The fee MUST have a configurable **maximum cap** so an extreme weight or ring cannot produce
  an absurd figure; the cap MUST itself be a multiple of the rounding step so a capped fee is still a clean
  value.
- **FR-028**: The weight slabs MUST have an **open-ended top slab**, so a package heavier than any named
  slab is still priced (at the top slab, up to the cap) and never yields "no price".
- **FR-029**: A served zone MUST always yield a standard fee. It MUST NOT be possible for a served zone with
  an active plan to answer "no delivery option" — this is the anti-pattern that motivated the rebuild.
- **FR-030**: A package MUST be priced on **its own** weight and its destination ring, and in a multi-shop
  basket each package MUST be priced independently; the shopper pays one combined total.
- **FR-031**: ⚠ **No shop MUST be able to see, set or influence any delivery fee, factor, slab, ring price,
  floor, cap or rounding step.** Fees are the platform's decision, structurally.

### Legal & pricing-integrity constraints (Australia)

- **FR-032**: Every delivery fee shown to a shopper MUST be **GST-inclusive**, because domestic delivery is
  a taxable supply.
- **FR-033**: The shopper MUST be shown the **full, final delivery fee and order total before they pay**;
  the fee MUST NOT be introduced or increased only at the last step of checkout (no drip pricing).
- **FR-034**: The shopper MUST be charged **exactly** the fee they were shown, and **never more**; upward
  snapping happens **before** the fee is shown, never after acceptance.
- **FR-035**: That a delivery fee applies MUST be disclosed early in the shopping journey (the serviceability
  answer is the natural place), not sprung at checkout — aligning with current and forthcoming Australian
  consumer-law expectations on early disclosure of mandatory charges.
- **FR-036**: The fee shown at quote time MUST be **captured** and MUST remain the fee for that order even if
  plans, rings, zones or eligibility later change — a quoted order keeps its quoted fee.

### Same-day availability — eligibility and the collection schedule

- **FR-037**: A back-office admin MUST be able to mark which zones are **same-day eligible**. By default a
  same-day-eligible zone is offered same-day by **every** shop.
- **FR-038**: Same-day MUST be a strictly **additive** offer over standard: a zone's same-day eligibility, or
  loss of it, MUST never change whether the zone is served or whether standard is offered.
- **FR-039**: The platform MUST offer same-day for an order only when there is still a **collection run**
  today that the order can make, allowing a configurable **pick/prep buffer** before the run for the shop to
  assemble the package.
- **FR-040**: The collection schedule MUST be configurable: an admin MUST be able to define **one or several**
  collection runs per day and the pick/prep buffer, and same-day availability MUST follow from that schedule
  rather than from a separately maintained cutoff time. ⚠ With one run configured this behaves as a single
  daily cutoff; with several, same-day availability extends through the day, run by run (the hybrid the
  operator asked for).
- **FR-041**: The same-day cutoff MUST be evaluated on the platform's operating wall clock
  (Australia/Melbourne), never the shopper's device clock and never UTC.
- **FR-042**: When same-day is not available for an order (zone not eligible, shop exception, or cutoff
  passed), standard MUST remain available and the shopper MUST simply see "standard only" — never a refusal.

### Same-day exceptions — back-office only, per shop

- **FR-043**: A back-office admin MUST be able to override same-day for a specific **(shop, zone)** pair:
  switch a shop **off** for an otherwise-eligible zone, or **on** for a zone where it otherwise would not do
  same-day.
- **FR-044**: Same-day for an order MUST be decided per package against the **fulfilling** shop: it is offered
  only where that shop does same-day in the shopper's zone (default eligibility, minus off-exceptions, plus
  on-exceptions).
- **FR-045**: ⚠ **A shop MUST NOT be able to set, propose, approve or view these exceptions.** Unlike a prior
  design, there is no shop-side declaration and no approval workflow — the back-office admin is the sole
  authority for all zone eligibility and all shop exceptions.
- **FR-046**: Every same-day eligibility change and every shop exception MUST record which admin made it and
  when.

### Shipping-fee plans — multiple templates, one active

- **FR-047**: A back-office admin MUST be able to maintain **several** shipping-fee plans, each a complete set
  of pricing values (per-ring prices, weight slabs, the same-day and standard method factors, rounding step,
  floor, cap).
- **FR-048**: **Exactly one** plan MUST be active at any time, and which one MUST be visible at a glance.
- **FR-049**: An admin MUST be able to prepare an inactive plan and **activate** it in a single action; the
  switch MUST change only what **new** quotes cost.
- **FR-050**: Activating a plan MUST NOT alter the zone map or same-day eligibility — a fee plan carries
  pricing only. (Zones and eligibility are standing configuration that persist across plan switches.)
- **FR-051**: Activation MUST be **refused** if the plan is incomplete in a way that could yield "no price"
  for a served zone (a ring with no price, a hole in the weight slabs, a missing method factor), naming the
  gap.
- **FR-052**: Every plan creation, edit and activation MUST record which admin made it and when.

### Product weight

- **FR-053**: Every product MUST have a weight available for pricing — a real measured weight where known,
  otherwise a stated assumed weight; a product MUST NEVER be priced as weightless or delivered free for lack
  of a weight.
- **FR-054**: A shop operator MUST be able to record a product's real weight, and doing so MUST mark it as
  **measured** rather than assumed.
- **FR-055**: Measured and assumed weights MUST be distinguishable, so products still needing a real weight
  are identifiable.
- **FR-056**: A package's weight MUST be the sum of its items' weights, and the weight slab MUST be chosen
  from that package total.

### Accountability

- **FR-057**: Every operator decision this feature introduces — zone composition, ring assignment, plan edits
  and activation, same-day eligibility and shop exceptions — MUST be attributable to a named admin with a
  timestamp.

### Key Entities

- **Place** — a real Australian locality, identified by the triple of locality name, state/territory and
  postcode. Sourced from an open, redistributable dataset covering all of Australia. Read-only to this
  feature; the source of truth for "what places exist".
- **Delivery zone** — a named, served area made of postcodes chosen by place. A postcode belongs to at most
  one zone. Serviceability is decided solely by zone membership. Never shown to shoppers by name.
- **Distance ring** — an ordered band grouping zones by how far they are from Effy's operating hub. The unit
  the distance factor is priced on. Suggested automatically, overridable by an admin.
- **Shipping-fee plan** — a complete, named set of pricing values (per-ring prices, weight slabs, same-day
  and standard method factors, rounding step, floor, cap). Many exist; exactly one is active. Owned by the
  platform; invisible to shops.
- **Weight slab** — a stepped band of package weight with an associated cost contribution; the top slab is
  open-ended.
- **Same-day eligibility** — a zone-level flag (default: all shops), plus per-(shop, zone) exceptions (off or
  on). Set only by back-office.
- **Collection schedule** — the configurable set of daily collection runs and the pick/prep buffer, from
  which same-day cutoffs are derived. All in the platform's operating timezone.
- **Delivery quote** — the captured, method-specific fee(s) a shopper was shown, persisted so the order is
  honoured at the quoted fee regardless of later configuration changes.
- **Package** — the per-shop portion of a multi-shop order; the unit that is priced and given a delivery
  method.
- **Shop** — an existing fulfilment node; gains same-day exceptions (per zone, back-office set). ⚠ It does
  **not** need a location: the fee is decided by the **destination** zone's ring and the package weight, so
  it is identical for every shop serving that customer (reconciled during planning — see plan.md R2). A
  shop's identity (already known from the per-shop split) is all that is needed to resolve its same-day
  exception. Nothing about the shop is ever shown to shoppers.
- **Product** — existing; gains a weight that is either measured or assumed.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: For **100%** of addresses, the serviceability answer resolves to exactly one of two outcomes —
  "delivered" or "not delivered yet" — with a single stated reason, verified by attempting addresses in a
  served zone, an unconfigured area, and a directly-added unknown postcode.
- **SC-002**: **Zero** addresses exist that the up-front check reports as deliverable but for which checkout
  can offer no delivery option — the two answers agree for every address (the failure that motivated the
  rebuild does not recur).
- **SC-003**: Two shoppers with identical baskets in different distance rings are quoted different fees, and
  the farther-ring shopper pays at least as much.
- **SC-004**: Two shoppers in the same zone with materially different basket weights are quoted different
  fees, moving in discrete slabs, and the heavier pays at least as much.
- **SC-005**: **100%** of quoted fees are exact multiples of the active plan's rounding step, none is below
  the value the rules produced, none is below the plan's floor, and none exceeds the plan's cap — **including
  a capped fee**, because a cap that is not a multiple of the step would betray this at exactly the moment it
  binds.
- **SC-006**: **100%** of shopper-facing delivery fees are GST-inclusive and are shown in full before
  payment; **zero** orders are charged a delivery fee higher than the one displayed.
- **SC-007**: **Zero** shopper-visible outputs disclose a distance figure or a shop's identity.
- **SC-008**: **Zero** shops can see or alter any delivery fee, factor, ring price, slab, floor, cap or
  rounding step, verified by attempting it directly and not only through the interface.
- **SC-009**: **Zero** shops can see, set or approve any same-day eligibility or shop exception, verified
  directly — every such decision is attributable to a back-office admin.
- **SC-010**: A shopper in a same-day-eligible zone, ordering before the last makeable collection run for
  today, is offered same-day; the same shopper ordering after it is offered standard only — verified across
  a single-run and a multi-run schedule.
- **SC-011**: In a two-shop basket in a same-day-eligible zone where exactly one shop does same-day there,
  same-day appears on **exactly one** package.
- **SC-012**: A shopper whose fulfilling shop has no same-day in their zone still receives standard delivery
  — losing same-day never costs a shopper standard.
- **SC-013**: An order quoted before a plan switch (or a zone/ring/eligibility change) is fulfilled at the
  fee it was quoted.
- **SC-014**: **100%** of products resolve to a weight — measured or assumed — and **zero** are priced as
  weightless; a shop operator can change one from assumed to measured and see the quote reflect it.
- **SC-015**: An admin can compose a complete served zone without typing a single postcode, and after adding
  one place from a multi-place postcode can correctly state how many places they just made serviceable.
- **SC-016**: Attempting to activate a plan with a hole (an unpriced ring, a slab gap, a missing method
  factor) is refused with the gap named; **zero** active plans can produce "no price" for a served zone.
- **SC-017**: The delivery fee for a given zone and basket is the same regardless of which shop fulfils it
  (fees are ring- and weight-based, not shop-based), verified across at least two shops.

---

## Out of Scope

Named because each was considered and excluded; none may be smuggled in.

- **Road distance or drive-time routing.** Zones are placed in rings by a representative straight-line
  distance from a hub, used only to *band* zones; no live routing, no external geocoding service, no
  distance shown to shoppers. (A routing dependency on the customer-facing price path is rejected, as it was
  before.)
- **Shop-set fees or shop-proposed same-day with an approval workflow.** Deliberately removed; the
  back-office admin is the sole authority for fees and for all same-day decisions. This is a core
  simplification over the withdrawn design.
- **A third delivery method.** Only same-day and standard exist. (A prior "scheduled" method was configured
  nowhere and is not reintroduced here; it can be a later slice.)
- **Sub-postcode (per-suburb) serviceability.** Serviceability is postcode-grained everywhere, which is why
  FR-008 exists; serving one suburb of a postcode but not another is out of scope.
- **Dimensional / volumetric weight.** Actual weight only.
- **Live shop capacity.** Whether a shop has a driver free right now is not modelled; same-day eligibility is
  a standing configuration plus the collection schedule, not a real-time promise.
- **Automatic reaction to place-data refreshes.** A place that disappears from the record is flagged for an
  admin, never silently removed.
- **Notifying shops of a delivery-config change by email or push.** In-console visibility only.
- **Free-delivery thresholds, promo-code interaction with delivery, and delivery-fee refunds.** The fee
  interacts with existing promotions only insofar as the order total already does; bespoke delivery
  promotions are a later concern.

---

## Assumptions

- **The dataset is an open, redistributable, G-NAF-derived Australian postcode/locality record** (locality
  name, state, postcode, a representative coordinate per locality, and an address count per locality),
  available under the Open G-NAF terms based on CC BY 4.0. This is the same lineage as the record the
  platform used before it was withdrawn; the coordinate is what makes automatic ring suggestion (FR-015)
  possible, and the address count is what lets the platform pick a postcode's primary locality. Attribution
  ("Incorporates or developed using G-NAF © Geoscape Australia") travels with it.
- **The whole-of-Australia record is loaded, but only Victoria / Greater Melbourne is served at launch** —
  every postcode outside a composed zone is simply "not delivered yet", the ordinary unserved outcome.
- **Rounding the delivery fee upward to a friendly value is lawful in Australia** provided the exact
  GST-inclusive fee is shown before payment and charged unchanged (FR-032/033/034). It is Effy's own fee, not
  a government charge or cash/GST rounding, so no maximum applies beyond not being misleading — confirmed by
  research before this spec (ACCC price-display and drip-pricing guidance; delivery treated as a taxable
  supply for GST). Forthcoming 2027 reforms tighten *early disclosure*, which FR-035 already anticipates.
- **Every delivered order splits into one package per fulfilling shop**, and the package is the unit priced
  and given a method — the existing multi-shop fan-out model stands.
- **Hidden fulfilment holds**: the shopper never learns which shop serves them, which is exactly why a
  distance factor can be banded by a hub-relative ring (about the shopper's area) without revealing origin.
- **The platform's operating timezone is Australia/Melbourne**, and the same-day cutoff is judged on that
  wall clock.
- **Back-office admins are trusted operators**: warnings (e.g., an unknown postcode, a multi-place postcode)
  are confirmable rather than forbidding, because the controls prevent mistakes, not misuse.
- **Products can be given a weight**: where a real weight is unavailable, a single stated assumed default is
  used and recorded as an assumption, not as fact.
- **Effy's operating hub location is known/configurable** and is the reference point for ring suggestion; it
  is an internal operational value, never shown to shoppers.

---

## Dependencies

- **A record of Australian places** — a G-NAF-derived postcode/locality dataset, loaded into the platform and
  refreshable, covering all of Australia. (The predecessor record and its loader were removed at withdrawal;
  this feature reintroduces one.)
- **Shops (identity only)** — a package is attributed to its fulfilling shop so that shop's same-day
  exception can be resolved. ⚠ **Shop location is not required** — the fee is destination-ring based, so a
  shop with no location still fulfils priced deliveries normally (narrowed during planning; see plan.md
  R2). Origin cost variance (a far shop serving a near customer) is absorbed as internal margin, since Effy
  chooses which shop fulfils.
- **The product catalogue** — gains a weight (measured or assumed) on every product.
- **Checkout and the order/quote model** — consume the serviceability answer, the available methods and the
  captured fee; a multi-shop order already splits per shop.
- **The back-office console and its role model** — who may change delivery configuration is decided by the
  existing back-office rules; this feature adds no new audience.
- **The address book / storefront address entry** — where a shopper sets the address that resolves to a zone.

---

## Notes for planning (non-binding)

- This spec deliberately consolidates what was previously four stacked slices into **one coherent
  capability**. The plan may still sequence delivery across multiple build slices, but the **user-facing
  contract and the serviceability rule (FR-001) must not fragment** — the whole reason the prior attempt was
  withdrawn was a fragmented decision no one could explain.
- The three P1/P1/P2 pillars — (US1) serviceability + standard fee, (US2) same-day gated by the collection
  schedule, (US3) per-shop exceptions — form a natural build order, with plans (US4) and product weight
  (US5) supporting them. US1 alone is a shippable MVP: Effy delivers, priced soundly, with no same-day.
