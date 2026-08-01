# Feature Specification: Delivery Areas — Locality-Driven Zones & Per-Area Service Levels

**Feature Branch**: `031-delivery-areas`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "When we create delivery zones in back office, the admin should be able to
select the areas the platform delivers to. And we should improve the full back-office delivery feature
so we can set same-day delivery, standard delivery, and the fees for each area."

---

## Context: a defect, and a mismatch

### The defect

Today a back-office admin composes a delivery zone by typing **raw 4-digit postcodes into a free-text
box**. The interface checks the *shape* (four digits) and that the postcode is not already in another
zone. **Nothing checks the postcode exists.**

That is how postcode **3001** entered the Melbourne Metro zone. 3001 is Melbourne's **PO Box / GPO**
code: it has no street addresses, and groceries cannot be delivered to a post-office box. It sat there
undetected until a coverage query found it — and the only symptom would ever have been deliveries that
silently never happened. A typo of `3122` for `3121` would be equally invisible, and would quietly
serve the wrong suburb while refusing the right one.

Feature 030 gave the platform a record of **every Australian locality** and let a *shopper* name where
they live by suburb. This slice hands the same record to the *operator*, so a zone can only be
composed of places that actually exist.

### The mismatch

Operations thinks **per area**: *"what does Ballarat get?"*

The system stores **per zone pair**: *"what does Melbourne Metro → Regional get, for each method?"*

With two zones that is four pairs and it is fine. With ten it is ninety pairs across three methods,
and no operator can answer the question they actually have without reading a grid. Worse, the
per-origin dimension expresses a distinction **no shopper can ever perceive** — the customer never
learns which shop fulfils their order, because hidden fulfilment is a founding rule of the platform.

So this slice moves the *decision* to the area, where operations already thinks, while leaving the
underlying rate storage that checkout depends on alone.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Build a delivery area out of real places (Priority: P1)

An admin opens a delivery zone and adds the areas the platform serves. They search the same locality
record a shopper uses — "ballarat", "richmond" — and pick real places from a list, each shown with its
state and postcode. They are told, before they confirm, exactly which places will become serviceable
as a result. They save, and the zone contains only postcodes that exist.

**Why this priority**: It closes a live defect with a demonstrated instance. A wrong postcode in a zone
produces deliveries that never happen and refusals to customers we could serve, and neither has a
visible symptom. US2 is the larger operator win, but it rests on areas meaning something.

**Independent Test**: Compose a zone without typing a single digit, and confirm a nonsense postcode can
no longer enter one silently.

**Acceptance Scenarios**:

1. **Given** an admin editing a zone, **When** they search for part of a place name, **Then** matching
   places appear, each identified by locality, state and postcode.
2. **Given** an admin has chosen a place, **When** the selection is confirmed, **Then** the zone
   contains that place's postcode.
3. **Given** an admin chooses a place whose postcode covers other places, **When** they are about to
   confirm, **Then** they are told plainly how many other places this also makes serviceable, and can
   see them. *(⚠ See FR-006 — this is the single most important interaction in the story.)*
4. **Given** an admin enters a postcode that matches no known place, **When** they try to add it,
   **Then** they are warned that it is not a recognised delivery destination and must confirm
   explicitly before it is accepted.
5. **Given** an admin adds a place already covered by another zone, **When** they confirm, **Then**
   they are told which zone already has it and the addition is refused.
6. **Given** an admin removes an area from a zone, **When** they confirm, **Then** every place sharing
   that postcode stops being serviceable, and they are told so before it happens.

---

### User Story 2 - Decide what each area gets, and what it costs (Priority: P2)

An admin picks an area and sets what the platform offers there: standard delivery on or off with its
fee and lead time; same-day on or off with its fee and cutoff; or the area is **explicitly not
served**. The decision is recorded as a decision, so that later nobody has to guess whether an
unserved area was a choice or an oversight.

**Why this priority**: This is the larger operator win and the thing that was actually asked for. It is
second only because configuring areas that may not exist is configuring nothing.

**Independent Test**: Set standard-only for one area and same-day for another, then confirm a shopper
in each is offered exactly that.

**Acceptance Scenarios**:

1. **Given** an area in a zone, **When** the admin enables standard delivery with a fee and lead time,
   **Then** a shopper in that area is offered standard delivery at that fee.
2. **Given** an area with standard enabled, **When** the admin disables it, **Then** a shopper in that
   area is no longer offered standard delivery.
3. **Given** an area, **When** the admin marks it **not served**, **Then** the record states that this
   was a deliberate decision, distinguishable from an area nobody has configured yet.
4. **Given** an area nobody has configured, **When** an admin views it, **Then** it is shown as
   **unconfigured** — not as "not served".
5. **Given** an admin sets a fee for an area, **When** a shopper in that area reaches checkout,
   **Then** they are charged that fee regardless of which shop fulfils the order.
6. **Given** an admin changes an area's fee, **When** an order was already quoted at the old fee,
   **Then** that order keeps the fee it was quoted.

---

### User Story 3 - Enabling same-day is an informed decision, never a blind toggle (Priority: P2)

An admin about to enable same-day for an area is shown which shops could actually serve it and where
those shops are. They make the call knowing what they are promising.

**Why this priority**: Same the priority as US2 because it is inseparable from it — an unqualified
same-day toggle is worse than no toggle. Split out as its own story because it is the one place where
this feature can cause customer-facing harm rather than operator confusion.

**Independent Test**: Attempt to enable same-day for a remote area and confirm the interface shows the
distance problem rather than accepting silently.

**Acceptance Scenarios**:

1. **Given** an admin enabling same-day for an area, **When** the control is opened, **Then** the
   shops that could serve it are listed with their own locations.
2. **Given** an area no shop is near, **When** the admin enables same-day, **Then** they must
   acknowledge that no shop is nearby before it takes effect.
3. **Given** same-day is enabled for an area, **When** a shopper there shops after the cutoff,
   **Then** same-day is not offered for that order.
4. **Given** same-day is enabled, **When** the admin views the area later, **Then** the acknowledgement
   and who made it are visible.

---

### User Story 4 - Spot a configuration that has quietly gone wrong (Priority: P3)

An admin sees, without hunting, which areas are misconfigured: an area whose postcode no longer matches
any known place, an area in a zone with no service level set, a zone with no areas at all.

**Why this priority**: It is the feature that stops the next 3001 lasting weeks. It delivers least on
its own because a correctly built configuration has nothing to show.

**Independent Test**: Introduce each defect deliberately and confirm each is surfaced.

**Acceptance Scenarios**:

1. **Given** an area whose postcode matches no known place, **When** an admin views delivery
   configuration, **Then** that area is flagged with what is wrong.
2. **Given** an area in a zone with no service level configured, **When** an admin views the zone,
   **Then** the area is flagged as unconfigured.
3. **Given** a zone with no areas, **When** an admin views the zone list, **Then** it is flagged as
   serving nobody.
4. **Given** a correctly configured zone, **When** an admin views it, **Then** no warning is shown.

---

### Edge Cases

- **A postcode covering many places** — 3350 covers twenty Ballarat localities; 3550 covers twelve in
  Bendigo. Adding any one of them adds all of them. ⚠ The single most likely way for this feature to
  mislead an operator.
- **A place name recurring across states** — there are six Richmonds. Choosing must always be from a
  fully identified place, never a bare name.
- **A postcode spanning states** — 0872 legitimately appears in NT, SA **and** WA. It is one
  serviceability decision, and the interface must not imply three.
- **A postcode with no locality behind it** — a PO-box code, or one created after the last reference
  refresh. Warn and require explicit confirmation; never silently accept, never hard-block (the
  reference record can lag reality).
- **The reference record is refreshed and a locality disappears** — the area must be flagged, not
  silently dropped.
- **An area moved between zones** — its service levels must not silently follow or silently vanish.
- **An order already quoted when a fee changes** — the quoted price stands.
- **A shop's own location changes** — any same-day acknowledgement made on the old location is stale.
- **A zone deleted while areas are configured** — configuration must not be orphaned in place.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Composing an area

- **FR-001**: An admin MUST be able to add a delivery area by searching the platform's locality record
  and choosing a place, without typing a postcode.
- **FR-002**: Every place offered MUST be identified by locality name, state or territory, and
  postcode together. A bare name MUST NOT be selectable.
- **FR-003**: Choosing a place MUST make its postcode serviceable in that zone.
- **FR-004**: An admin MUST still be able to enter a postcode directly, for the case where the place
  is not in the reference record.
- **FR-005**: A postcode matching no known place MUST produce an explicit warning naming the risk, and
  MUST require deliberate confirmation before being accepted. It MUST NOT be silently accepted, and
  MUST NOT be hard-refused — the reference record can lag reality.
- **FR-006**: ⚠ **Before confirming, the admin MUST be shown every other place the chosen postcode
  also makes serviceable, and how many there are.** Serviceability is decided by postcode, so choosing
  "Alfredton" serves all twenty Ballarat localities. Without this, an admin believes they made a narrow
  decision when they made a broad one, and learns otherwise from an order out of an area they never
  meant to serve.
- **FR-007**: Removing an area MUST likewise state which places stop being serviceable, before it
  takes effect.
- **FR-008**: A place already served by another zone MUST be refused, naming the zone that has it.
- **FR-009**: Every change to a zone's composition MUST be attributable — who changed it and when.

#### Deciding what an area gets

- **FR-010**: For any area an admin MUST be able to configure each available delivery method
  independently: enabled or not, with its fee and its timing.
- **FR-011**: An admin MUST be able to record that an area is **deliberately not served**.
- **FR-011a**: ⚠ **Marking an area not served MUST actually stop serving it**, not merely annotate it.
  The area is withdrawn from its zone in the same action that records the decision.

  *Why this needs saying*: serviceability is decided by whether a postcode belongs to a zone. A
  decision recorded **beside** that membership changes nothing — the storefront would still answer
  "we deliver here" for an area an admin had explicitly marked unserved. That is the REGIONAL defect
  inverted, introduced by the very feature meant to prevent it.
- **FR-011b**: The recorded decision MUST **survive** the withdrawal, so an area that is not served
  still shows *who* decided it, *when*, and *why*. A decision that vanishes with the thing it decided
  about leaves the next admin with the same unanswerable question this feature exists to remove.
- **FR-011c**: Re-adding a previously withdrawn area MUST surface the earlier decision and its note,
  so an admin re-enabling somewhere learns why it was switched off.
- **FR-012**: ⚠ **"Deliberately not served" and "not yet configured" MUST be distinguishable.** Today
  an unserved destination is expressed by the *absence* of a row, which cannot tell a decision from an
  oversight — the same ambiguity that let 3001 survive.
- **FR-013**: An area's fee MUST apply regardless of which shop fulfils the order.
- **FR-014**: A quoted order MUST keep the fee it was quoted at, even if the area's fee later changes.
- **FR-016**: Every service-level and fee change MUST be attributable — who changed it and when.

#### Same-day, which is a promise rather than a price

- **FR-017**: ⚠ **Enabling same-day for an area MUST show which shops could serve it, and where those
  shops are.** A fee is a business choice the platform can absorb; same-day is a **physical claim about
  time**, true only if a shop holding the goods can reach that area today.
- **FR-018**: Where no shop is near an area, enabling same-day MUST require an explicit
  acknowledgement. Same-day MUST NOT be a blind toggle.
- **FR-019**: The acknowledgement, and who made it, MUST remain visible afterwards.
- **FR-020**: Same-day MUST continue to be withdrawn from new orders after its cutoff time.
- **FR-021**: The platform MUST NOT offer a shopper a service level that no shop can fulfil.

#### Seeing the configuration

- **FR-022**: An admin MUST be able to see everything a single area is offered, in one place, without
  reading a grid.
- **FR-023**: An admin MUST be able to see, for a zone, which places it serves — by name, not only by
  postcode.
- **FR-024**: An area whose postcode matches no known place MUST be flagged.
- **FR-025**: An area with no service level configured MUST be flagged as unconfigured.
- **FR-026**: A zone with no areas MUST be flagged as serving nobody.
- **FR-027**: A correctly configured zone MUST show no warning — a health indicator that is always
  lit tells an operator nothing.

#### What must not change

- **FR-028**: The shopper's experience of delivery MUST NOT change: the up-front serviceability answer,
  the checkout quote, and the address book behave exactly as they do today.
- **FR-029**: No new delivery method MUST be introduced. The set an admin can configure MUST equal the
  set the platform already supports, exactly — ⚠ verified rather than asserted, since this feature is
  the first interface to expose all three together.
- **FR-030**: A shopper MUST NOT be able to learn which shop fulfils their order from anything this
  feature adds.
- **FR-031**: Existing orders, quotes and their captured prices MUST be unaffected.

### Key Entities

- **Area**: what an admin configures. ⚠ **An area is a postcode**, because that is what decides
  serviceability everywhere in the platform — but it is *presented and chosen* by the places it
  contains. This gap between how it is chosen and what it means is why FR-006 exists.
- **Place** (existing, from 030): an Australian locality — name, state, postcode. All three identify
  it; no two do. Read-only here.
- **Zone** (existing): a named group of areas. Retained because the platform's pricing and quoting are
  built on it.
- **Service level** (existing): a delivery method available to an area, with a fee and a timing rule.
- **Not-served decision** (new): a positive record that an area is deliberately unserved, distinct
  from the absence of any decision.
- **Shop location** (existing): where a shop is. Read-only here, and the input to the same-day
  judgement.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An admin can compose a complete delivery zone without typing a single postcode.
- **SC-002**: **Zero** postcodes with no matching place can enter a zone without the admin having
  explicitly confirmed a warning — verified by attempting the 3001 case that motivated this feature.
- **SC-003**: 5 of 5 admins, after adding one place from a multi-place postcode, correctly state how
  many places they just made serviceable.
- **SC-004**: An admin can state what a given area is offered within 30 seconds, without opening more
  than one screen.
- **SC-005**: **100%** of areas in the system resolve to one of exactly three states: configured,
  deliberately not served, or unconfigured. No area is ambiguous.
- **SC-005a**: An area marked **not served** is reported as **not serviceable** by the storefront —
  verified end to end, because a decision that does not change the answer is decoration.
- **SC-006**: 5 of 5 admins, shown an unconfigured area and a deliberately-unserved area, correctly
  tell them apart.
- **SC-007**: **Zero** same-day activations occur without the admin having seen which shops can serve
  the area.
- **SC-008**: Each of the three configuration defects (unknown place, unconfigured area, empty zone) is
  surfaced within one screen of where an admin would look, verified by introducing each deliberately.
- **SC-009**: A correctly configured zone raises **zero** warnings.
- **SC-010**: The shopper-facing delivery experience is byte-for-byte unchanged for an unchanged
  configuration — same serviceability answers, same quotes, same fees.
- **SC-011**: A shopper is charged the same fee for an area regardless of which shop fulfils, verified
  across at least two shops.
- **SC-012**: An order quoted before a fee change is fulfilled at the quoted fee.
- **SC-013**: Every composition and service-level change is attributable to a named admin.
- **SC-014**: **Zero** areas exist that the storefront reports as serviceable but for which checkout
  can offer no delivery option — verified against the live `REGIONAL` case that motivated this feature.
  The up-front answer and checkout agree for every area, or the disagreement is visible to an admin.

---

## Out of Scope

Named because each was considered and excluded; none may be smuggled in.

- **Any change to the shopper's experience of delivery** — the storefront answer, the checkout quote,
  the address book. This is an operator feature.
- **New delivery methods** beyond those the platform already has.
- **Rewriting the underlying rate storage.** Checkout and the captured quote depend on it; this feature
  changes how a decision is *made and shown*, not how it is stored and applied.
- **Distance or drive-time calculation.** The platform has no routing capability and adding a
  third-party geocoding dependency was rejected in 030. Same-day feasibility is an *informed human
  judgement*, not a computed one.
- **Sub-postcode granularity.** Serving one suburb of a postcode but not another would require
  serviceability to become locality-keyed, which touches checkout, the address model and the storefront
  read. FR-006 exists precisely because this is out of scope.
- **Automatic reaction to reference-data refreshes.** A locality that disappears is flagged (FR-024),
  never auto-removed.

---

## Assumptions

- **The platform's locality record is the source of truth for what places exist.** It covers all of
  Australia, so "no matching place" is a strong signal — but it can lag reality, which is why FR-005
  warns rather than blocks.
- **Zones remain the unit of pricing storage.** Areas are how decisions are made and shown; the
  existing structure keeps serving the quote.
- **Hidden fulfilment holds.** The shopper never learns which shop serves them, which is the entire
  reason per-origin pricing can be collapsed without loss to them.
- **Origin cost variance becomes internal margin.** Delivering to an area costs the platform differently
  from different shops; that difference stops being expressed in what the customer pays.
- **The existing audit trail covers these changes** — delivery configuration already records who
  changed what.
- **Admins are trusted operators**, so warnings are confirmable rather than forbidding. The controls
  here prevent mistakes, not misuse.

---

## Dependencies

- **030** — the locality record this feature searches. Read-only.
- **021** — the delivery zones, rate grid and shop locations this feature reconfigures.
- **009** — the shops whose locations inform the same-day judgement.
- **The back-office role model** — who may change delivery configuration is decided by the existing
  rules, unchanged here.

---

## ⚠ SCOPE REDUCED 2026-08-01 — the pricing half was withdrawn

**What this feature now is**: locality-driven zone composition, the postcode-coverage disclosure, the
three-state decision record, and the configuration health surface. All of it built, tested and live.

**What was removed, and why it was wrong rather than merely unfinished:**

US2's **per-area pricing projection** collapsed the origin dimension — one fee per area, from every
shop — on the reasoning that a shopper cannot perceive which shop serves them. ⚠ **That reasoning is
sound for PRICE and false for ELIGIBILITY.** Whether same-day is possible depends entirely on which
shop is fulfilling, so the axis this collapse removed is precisely the one the operator's actual model
is built on: *a shop declares which zones it will serve same-day, and an admin approves it.*

US3's **same-day guard** went with it. It asked "is any shop's postcode in this area's zone?" and read
yes as "a shop is nearby". Live data disproved it: same-day to **Ballarat** was permitted because a
shop in **Bendigo** shares zone REGIONAL — **98 km away**, essentially as far as Melbourne (107 km).
Not merely crude; here it carried no information at all.

⚠ **And research R6's premise was wrong.** It justified that crudeness with "the platform has no
routing or distance capability". G-NAF ships `LOCALITY_POINT` with a latitude and longitude for every
locality, in the same download and under the same licence 030 already accepted — **030's derivation
simply discarded it**. Distance was always available; it was never loaded.

FR-010, FR-013, FR-014, FR-017–FR-021 and SC-007/SC-011/SC-012 therefore **move to the successor
slice**, where they can be met over real distance and shop-declared eligibility rather than a
zone-membership proxy.

---

## Resolved Scope Decisions

- **Existing per-origin rates → the admin reconciles (settled 2026-08-01, from live data).** There is
  a real conflict: delivering to Melbourne Metro is priced **$5.00** from a Melbourne shop and
  **$8.00** from a Regional one. Collapsing to one fee per area therefore cannot be automatic without
  silently changing a price. The console will show both existing rates for an area and require the
  admin to choose. ⚠ The specific $5-vs-$8 decision is an **operator task at implementation**, not a
  spec decision — this document only requires that no price changes without someone choosing it.

- **Scheduled delivery is included (settled 2026-08-01).** All three methods are configured per area.
  ⚠ Worth knowing: **scheduled is currently configured nowhere** — dev has `same_day` and `standard`
  offerings only. Retiring it was rejected because 021 built the date-picking flow through checkout and
  removing a shipped capability to simplify a console is the wrong trade; leaving it in the old grid
  was rejected because two management surfaces for one concept is how configuration drifts.

---

## ⚠ The defect this feature already has to answer for

**Found in live dev data, 2026-08-01, while resolving the questions above.**

The `REGIONAL` zone contains **3350 (Ballarat)** and **3550 (Bendigo)**. It has **zero** active
offerings as a destination.

The consequence is the exact failure the up-front delivery answer exists to prevent:

- The storefront resolves 3350 to a zone, so a shopper in Ballarat is told **"We deliver here."**
- Checkout finds no offering for that destination, so **no delivery option can be quoted** and the
  order cannot complete.

The shopper is invited in and then stopped at payment — 025's FR-014b ("serviceability MUST be decided
by the same rules that decide it at checkout, so the two answers can never disagree") violated in
production data rather than in code.

⚠ **Feature 030 widened the blast radius.** Before it, a Ballarat shopper had to know the digits
"3350". Now they can type "Alfredton" and be told yes. Making the store easier to find made this
easier to hit.

**Why it is in this spec rather than fixed as a one-line data change**: nobody can currently tell
whether `REGIONAL` was *deliberately unpriced* or simply *never finished* — which is precisely the
ambiguity FR-012 exists to remove. Fixing the row without fixing the ambiguity guarantees a recurrence.
FR-021 and FR-025/FR-026 are the requirements that make this state visible instead of silent.

**This is the motivating example for the feature**, and SC-014 below measures it directly.
