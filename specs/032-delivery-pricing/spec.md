# Feature Specification: Delivery Pricing & Same-Day Coverage

**Feature Branch**: `032-delivery-pricing`

**Created**: 2026-08-01

**Status**: Planned

**Input**: Operator description: "We need to implement same-day delivery and standard delivery
properly. If the customer and the shop are in the same zone, or the customer is in the list of zones
that shop provides same-day delivery to, we should offer same-day. On the shop side there should be a
way to configure whether that shop provides same-day delivery and which zones it provides it to — it
is a decision of the shop. But shops should not be able to change it without admin approval, so the
back office needs a way to approve it. The delivery fee is not the shop's decision; the back office
defines how same-day and standard delivery are priced. This cannot be a simple thing because the fee
can change according to distance and the weight of the packages, so we need a way to consider that.
The fee does not need to be an exact value — we can snap it to an upper rounded value to keep it
user-friendly. Since we have the list of zones/suburbs/postcodes for Australia, we can use the same
list when admins or shops define things, so everything is well integrated."

---

## Context: what is broken, and why 031 could not fix it

### The platform cannot answer "can we get this there today?"

Same-day delivery exists as a row in a rate table keyed on **(origin zone → destination zone,
method)**. Whether it is offered is decided by whether that row exists. Nothing in that decision knows
where the shop actually is, only which zone its postcode falls in.

⚠ **Live proof of how little that says.** Zone `REGIONAL` contains both Ballarat and Bendigo. Enabling
same-day for **Ballarat** was permitted because a shop in **Bendigo** shares the zone — **98 km away**,
essentially as far as Melbourne (107 km). The check reported "a shop is nearby" and carried no
information at all.

### 031 removed the axis this needs

Feature 031 collapsed per-origin pricing into a single fee per area, reasoning that a shopper can never
perceive which shop serves them (hidden fulfilment). ⚠ **That is true for PRICE and false for
ELIGIBILITY.** Whether same-day is possible depends *entirely* on which shop is fulfilling. That work
has been withdrawn; this feature restores the distinction properly rather than by accident:

- **Eligibility is per shop.** Which areas a shop will serve same-day is the shop's operational
  judgement — it knows its own vans, staff and hours.
- **Price is not.** What a shopper pays is a platform decision, and no shop may set it.

### Distance was always available

Research in 031 justified the crude zone check with "the platform has no routing or distance
capability." ⚠ **That was wrong.** The address dataset the platform already loaded ships a latitude and
longitude for **every** locality, under the licence already accepted — the load simply discarded them.
Distance between any two places is therefore computable today, with no new dependency and no external
service.

⚠ **It is straight-line distance, not road distance, and this specification does not pretend
otherwise.** Melbourne to Ballarat is 107 km in a straight line and roughly 115 km by road. That gap is
absorbed by pricing in bands and rounding upward, and the difference is never shown to a shopper as a
distance.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The platform decides what delivery costs (Priority: P1)

An admin defines how delivery is priced: what a delivery costs at different distances, how much the
weight of a package adds, and how the result is rounded so a shopper sees a sensible number rather than
$7.4392. They do it once, as rules — not by filling in a grid of zone pairs.

**Why this priority**: Nothing else can be quoted without it, and it is the half the platform must own.
It is also independently valuable: better pricing on the delivery the platform *already* offers, with
no shop involvement at all.

**Independent Test**: Define one set of rules, then confirm two shoppers at different distances with
different basket weights are quoted different, sensible, rounded fees.

**Acceptance Scenarios**:

1. **Given** an admin defining pricing, **When** they set what a delivery costs at each distance band,
   **Then** a shopper further away is quoted more than a shopper nearer, for the same basket.
2. **Given** pricing that accounts for weight, **When** two shoppers at the same distance order baskets
   of different weight, **Then** the heavier basket costs more to deliver.
3. **Given** a computed fee of an awkward amount, **When** it is shown to a shopper, **Then** it has
   been rounded **upward** to a friendly value, and the shopper is never charged less than the rule
   produced.
4. **Given** an admin changes a pricing rule, **When** an order was already quoted, **Then** that order
   is fulfilled at the fee it was quoted.
5. **Given** pricing rules exist, **When** a shop is asked, **Then** no shop can see or change them.
6. **Given** an order containing items from two shops, **When** it is quoted, **Then** each shop's
   package is priced on its own distance and its own weight.

---

### User Story 2 - A shop says where it can deliver today (Priority: P1)

A shop operator opens their own console and states whether they offer same-day delivery at all, and
which areas they will serve. They choose those areas from the same list of real Australian places the
rest of the platform uses. Their choice is recorded as a **proposal**; it changes nothing for shoppers
until it is approved.

**Why this priority**: It is the operational knowledge only the shop has, and no amount of distance
arithmetic substitutes for it. Independently testable because a proposal that changes nothing is safe
to ship on its own.

**Independent Test**: A shop declares same-day coverage, and confirm that no shopper's options change
until an admin acts.

**Acceptance Scenarios**:

1. **Given** a shop operator, **When** they open delivery settings, **Then** they can say whether the
   shop offers same-day delivery at all.
2. **Given** a shop offering same-day, **When** they choose the areas they will serve, **Then** they
   pick from real named places, not by typing postcodes.
3. **Given** a shop has made a declaration, **When** nothing else happens, **Then** ⚠ **no shopper is
   offered same-day as a result** — the declaration is a proposal, not a switch.
4. **Given** a shop changes an already-approved declaration, **When** they save it, **Then** the
   previously approved version stays in force until the change is approved.
5. **Given** a shop operator, **When** they look for delivery pricing, **Then** there is nothing to
   change — fees are not theirs to set.
6. **Given** a shop with no location recorded, **When** they try to declare same-day coverage,
   **Then** they are told the shop's location must be set first, because distance cannot be judged
   without it.

---

### User Story 3 - An admin approves what a shop proposed (Priority: P2)

An admin sees the shops waiting for a decision, what each is asking for, and **how far each requested
area actually is from that shop**. They approve or decline, with a reason. Only then does anything
change for a shopper.

**Why this priority**: It is what makes US2 safe rather than merely recorded. Second only because US2
must exist to have something to approve.

**Independent Test**: Approve one declaration and decline another; confirm the approved shop's shoppers
gain same-day and the declined shop's do not.

**Acceptance Scenarios**:

1. **Given** pending declarations, **When** an admin opens the queue, **Then** they see which shop,
   which areas, and **the distance from that shop to each area**.
2. **Given** a declaration covering an implausibly distant area, **When** the admin reviews it,
   **Then** the distance is stated plainly enough that they can decline on that basis.
3. **Given** an admin approves a declaration, **When** a shopper in one of those areas shops from that
   shop, **Then** same-day is offered.
4. **Given** an admin declines, **When** the shop looks, **Then** they see it was declined and why.
5. **Given** an approved declaration, **When** the admin later revokes it, **Then** same-day stops
   being offered for that shop, and the shop is told.
6. **Given** any approval or decline, **When** it is recorded, **Then** it names who decided and when.

---

### User Story 4 - A shopper is offered what can actually be delivered (Priority: P2)

A shopper reaches checkout and is offered same-day only where a shop that is actually holding their
goods has been approved to serve their area — at a fee that reflects how far it is coming and how heavy
it is.

**Why this priority**: It is where the whole feature becomes visible, and it is last because it
consumes the other three. It is also where the risk of harm sits: an offer the platform cannot honour.

**Independent Test**: Two shoppers, one inside an approved same-day area and one outside, with
otherwise identical baskets.

**Acceptance Scenarios**:

1. **Given** a shopper in an area a fulfilling shop is approved to serve, **When** they check out,
   **Then** same-day is offered.
2. **Given** a shopper outside every approved area for their fulfilling shop, **When** they check out,
   **Then** same-day is **not** offered, and standard delivery still is.
3. **Given** a shopper past the same-day cutoff, **When** they check out, **Then** same-day is not
   offered for that order.
4. **Given** a basket from two shops where only one is approved for same-day, **When** it is quoted,
   **Then** ⚠ same-day is offered **only** on that shop's package.
5. **Given** any quoted delivery, **When** the shopper sees the fee, **Then** it is a rounded,
   sensible figure with no distance or shop identity disclosed.
6. **Given** an approved same-day area, **When** the shop's location changes, **Then** the platform
   does not silently keep honouring approvals made against the old location.

---

### Edge Cases

- **A basket from two shops** — each package is priced on its own distance and weight, and may be
  offered different service levels.
- **A product with no recorded weight** — the fee must still be computable, and must not be free.
- **A shop with no recorded location** — cannot declare same-day coverage; distance is unknowable.
- **⚠ An area no locality names** — it has no coordinate, so it has no distance. It must not silently
  price as zero distance.
- **A postcode covering several localities** — its distance is not a single number. The platform must
  choose one basis and apply it consistently.
- **⚠ A postcode spanning states** — 0872 is in NT, SA and WA; distance from a single point is
  meaningless there.
- **A shop declares an area, then it is removed from every zone.**
- **A pricing rule with a gap** — a distance or weight that matches no band must not produce no fee.
- **An approval pending while the shop edits again.**
- **A very heavy or very distant order** — the fee must stay sane rather than growing without bound.
- **An approval that is never reviewed** — a proposal must not sit invisible forever.

---

## Requirements *(mandatory)*

### Pricing — the platform's decision alone

- **FR-001**: An admin MUST be able to define delivery pricing as **rules**, not as a fee per pair of
  zones.
- **FR-002**: Pricing MUST take account of **how far** a package travels.
- **FR-003**: Pricing MUST take account of **how heavy** a package is.
- **FR-004**: Distance and weight MUST be applied in **bands**, not as continuous formulas. A shopper
  moving one street further must not see a different fee.
- **FR-005**: Every computed fee MUST be **rounded upward** to a friendly value. ⚠ Upward, never
  nearest: rounding down means the platform absorbs the difference on every order, silently.
- **FR-006**: The rounding step MUST be configurable by an admin.
- **FR-007**: Each delivery method MUST be priceable independently — same-day may cost more than
  standard for the same distance and weight.
- **FR-008**: ⚠ **No shop MUST be able to see, set or influence a delivery fee.**
- **FR-009**: A package MUST be priced on **its own** distance and weight, not the order's total.
- **FR-010**: ⚠ **A quoted order MUST keep the fee it was quoted**, whatever later happens to the rules.
- **FR-011**: A distance or weight matching no band MUST still produce a fee. ⚠ A gap in the rules
  MUST NOT mean free delivery, and MUST NOT mean undeliverable.
- **FR-012**: The fee MUST be bounded, so an extreme distance or weight cannot produce an absurd figure.
- **FR-013**: Every pricing change MUST record who made it and when.

### Same-day coverage — the shop's declaration

- **FR-014**: A shop operator MUST be able to state whether the shop offers same-day delivery at all.
- **FR-015**: A shop offering same-day MUST be able to state **which areas** it will serve.
- **FR-016**: Areas MUST be chosen from the platform's record of real Australian places, by name — the
  same list customers and admins use.
- **FR-017**: ⚠ **A shop's declaration MUST have no effect on any shopper until it is approved.**
- **FR-018**: An already-approved declaration MUST remain in force while a change to it is pending.
- **FR-019**: A shop MUST be able to see the status of its own declaration: pending, approved, or
  declined with a reason.
- **FR-020**: ⚠ A shop with no recorded location MUST NOT be able to declare same-day coverage, and
  MUST be told why.
- **FR-021**: A shop MUST NOT be able to approve its own declaration.

### Approval — the admin's decision

- **FR-022**: An admin MUST be able to see every declaration awaiting a decision.
- **FR-023**: ⚠ **For each requested area, the admin MUST be shown how far it is from that shop.** An
  approval made without that is the zone-membership mistake repeated — the check that permitted
  same-day to Ballarat from 98 km away.
- **FR-024**: An admin MUST be able to approve or decline, and a decline MUST carry a reason the shop
  can read.
- **FR-025**: An admin MUST be able to revoke an approval already in force, and the shop MUST be told.
- **FR-026**: Every decision MUST record who made it and when.
- **FR-027**: A declaration awaiting a decision MUST be visible to admins rather than silently queued.

### What a shopper gets

- **FR-028**: Same-day MUST be offered only when the shop fulfilling that package is **approved** for
  the shopper's area.
- **FR-029**: ⚠ Same-day MUST NOT be offered on the basis that a shop merely shares a delivery zone
  with the shopper. That is the rule this feature exists to replace.
- **FR-030**: Same-day MUST continue to be withdrawn after its cutoff time. ⚠ A shop offering same-day
  MUST have a cutoff — "same-day, no cutoff" is not a promise anyone can keep, and it makes the
  withdrawal rule undecidable. The cutoff is a wall-clock time in the platform's operating timezone
  (Australia/Melbourne), not the shopper's device clock and not UTC.
- **FR-030a**: ⚠ Same-day MUST NOT be offered into an area the platform no longer serves at all. A
  shop's approval is a statement about *its* reach, not a grant of serviceability — if an area is
  removed from every delivery zone, an approval covering it MUST stop producing an offer. Otherwise the
  approval outlives the service it depends on, silently.
- **FR-031**: In a basket from several shops, same-day MUST be offered only on the packages whose shop
  is approved for that area.
- **FR-032**: Standard delivery MUST remain available wherever the platform serves, independently of
  any same-day decision.
- **FR-033**: ⚠ **A shopper MUST NOT be able to identify which shop serves them** from a fee, a
  delivery window, or anything else this feature adds. Hidden fulfilment is unchanged.
- **FR-033a**: ⚠ **A banded fee does disclose a coarse distance, and this specification says so rather
  than pretending otherwise.** A fee that rises with distance is, by construction, a signal about
  distance — a shopper comparing two orders can tell one came from further away. What FR-033 forbids is
  *identifying the shop*, and the band is what bounds the leak: a band spanning many kilometres covers
  many possible origins, so it narrows nothing to a specific fulfilment node. **Bands MUST therefore be
  wide enough that a fee never resolves to one shop**, which is a constraint on how an admin configures
  pricing, not only on what the platform returns.
- **FR-034**: No distance MUST ever be shown to a shopper, at any granularity, as a number or a label.

### Data this depends on

- **FR-035**: The platform MUST hold a location for **every postcode it can deliver to**, so distance
  is computable without any external service. ⚠ Stated at postcode grain, not place grain, because
  serviceability is postcode-decided everywhere and the source dataset does not carry a point for every
  individual locality. A locality with no point simply does not contribute to its postcode's location.
- **FR-036**: ⚠ The platform MUST hold a **weight for every product**. Weight is currently optional and
  most products lack one, so this is a change to how products are described, not only to delivery.
- **FR-036a**: ⚠ **A shop operator MUST be able to record a product's real weight**, and doing so MUST
  mark it as measured rather than assumed. Without this the platform can only ever hold the assumed
  default for any product created after this feature, and "every product has a weight" would be true
  only as arithmetic — nobody could ever make it true as a fact.
- **FR-037**: A product whose weight is genuinely unknown MUST still be deliverable and MUST still be
  priced — by a stated assumption, never by treating it as weightless.
- **FR-037a**: A product's weight MUST be distinguishable as **measured** or **assumed**. ⚠ Without the
  distinction, "500 g" means both *"we weighed it"* and *"nobody has said"*, and no one can tell which
  products still need attention.
- **FR-038**: ⚠ An area with no known location MUST be handled explicitly. It MUST NOT be priced as
  though it were at zero distance.
- **FR-039**: Where a postcode covers several places, the platform MUST use one consistent basis for
  its distance, and that basis MUST be stated.

### Key Entities

- ⚠ **Area** — throughout this specification, an area **is a postcode, chosen by locality name**.
  Serviceability is postcode-decided everywhere on this platform, so an area cannot be finer, and
  choosing "Alfredton" commits to all twenty Ballarat localities. **"Place" and "locality" mean the
  named suburb; "area" and "postcode" mean the unit actually decided about.** The terms are not
  interchangeable and this specification does not use them as if they were.
- **Pricing rule** (new): how a fee is derived — distance bands, weight bands, a per-method basis, a
  rounding step, and a ceiling. Owned by the platform.
- **Same-day declaration** (new): a shop's statement of which areas it will serve same-day, in one of
  three states — pending, approved, declined — with the reason and the deciding admin.
- **Place** (existing, from 030, extended): an Australian locality. **Gains a location.**
- **Product** (existing, extended): **gains a required weight.**
- **Shop** (existing): already has a location; it becomes load-bearing rather than informational.
- **Package** (existing): the per-shop portion of an order — the unit that is priced.

---

## Success Criteria *(mandatory)*

- **SC-001**: Two shoppers at materially different distances, with identical baskets, are quoted
  different fees, and the further one pays more.
- **SC-002**: Two shoppers at the same distance with baskets of materially different weight are quoted
  different fees, and the heavier one pays more.
- **SC-003**: **100%** of quoted fees are exact multiples of the configured rounding step (at a $0.50
  step: every fee ends `.00` or `.50`); none is below what the rule produced. ⚠ **Including a capped
  fee** — a ceiling that is not itself a multiple of the step would produce an unrounded fee at exactly
  the moment the cap binds.
- **SC-004**: **Zero** shops can see or alter any delivery fee, verified by attempting it directly
  rather than only through the interface.
- **SC-005**: **Zero** shopper-visible outputs disclose a distance or a shop's identity.
- **SC-006**: A shop's declaration changes **nothing** for any shopper until approved — verified end to
  end.
- **SC-007**: **Zero** same-day offers are made for a (shop, area) pair with no approval in force.
- **SC-008**: ⚠ The Ballarat/Bendigo case is refused, or approved only after an admin was shown
  **98 km** — verified against that exact pair, because it is what motivated this feature.
- **SC-009**: 5 of 5 admins, shown a pending declaration, correctly state how far the furthest
  requested area is from the shop.
- **SC-010**: An order quoted before a pricing change is fulfilled at the quoted fee.
- **SC-011**: In a two-shop basket where one shop is approved for same-day, same-day appears on exactly
  one package.
- **SC-012**: **100%** of products have a weight, or a stated assumed weight; **zero** are priced as
  weightless. ⚠ **And a shop operator can change one from assumed to measured** — otherwise this
  criterion is satisfied by a database default and measures nothing.
- **SC-013**: **Every** postcode the platform delivers to has a location; zero are priced at zero
  distance.
- **SC-014**: Every pricing change and every approval decision is attributable to a named person.
- **SC-015**: A shopper served by a shop with no same-day approval still gets standard delivery.

---

## Out of Scope

- **Road distance or drive time.** ⚠ Straight-line distance is used, and it under-states real journeys
  — Melbourne to Ballarat is 107 km straight and roughly 115 km by road. Bands and upward rounding
  absorb the difference. A routing provider was rejected in 030 and is rejected again here: it is an
  external dependency on the customer-facing price path.
- **Live capacity.** Whether a shop has a van free right now is not modelled; a declaration is a
  standing statement, not a real-time promise.
- **Per-shop pricing.** Fees are the platform's, and this feature makes that structural.
- **Dimensional or volumetric weight.** Actual weight only.
- **A new delivery method.** Same-day, scheduled and standard remain the set.
- **Changing how zones are composed** — 031 owns that and it stands.
- **Notifying shops by email or push** when a decision is made; in-console status only.

---

## Assumptions

- **Distance is straight-line, between the shop's place and the shopper's place.** Stated in the spec
  because it will be visible to admins in approval screens, and someone will eventually ask what it
  means.
- **A postcode's location is one representative point.** A postcode covering several localities is
  reduced to one; ⚠ this is wrong at the edges, and **0872 spans three states**, which is why FR-039
  requires the basis to be stated rather than assumed.
- **Most products can be given a weight.** Where a real weight is unavailable, an assumed weight is
  used and recorded as an assumption rather than as fact (FR-037).
- **Shops act in good faith.** Approval exists to catch mistakes and over-reach, not fraud.
- **The existing package model stands** — an order splits per shop, and that is the unit priced.
- **Hidden fulfilment holds**, and nothing here weakens it.

---

## Dependencies

- **030** — the record of Australian places, which gains a location here.
- **031** — locality-driven zone composition and the area decision record, which stand unchanged.
- **021** — the zone and rate model this replaces the pricing half of.
- **016** — the product catalogue, which gains a required weight.
- **009** — shops and their locations, which become load-bearing.
- **019/023** — checkout and the captured quote, which consume the result.
