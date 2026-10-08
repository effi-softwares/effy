# Feature Specification: Effy Delivery Coverage

**Feature Branch**: `076-effy-delivery-coverage`

**Created**: 2026-10-08

**Status**: Draft

**Input**: "Effy Delivery Coverage. Effy decides, alone and independently of any shop, which places it
delivers to with its own drivers. Back-office staff maintain a list of postcodes Effy delivers to,
found by searching real place names. Postcodes can optionally be grouped under a name purely to make
the list easier to manage. Every listed postcode has a distance from Effy's hub, worked out by the
platform or entered by hand. An address on the list is 'Delivered by Effy'; an address not on it is
'Courier delivery' where courier delivery reaches; an address neither reaches is refused with one
plain sentence, the same wherever the customer meets it. Distance tiers, same-day zones and per-shop
same-day exceptions are removed from configuration. Removing a postcode never changes an order already
placed. Staff can see, for any postcode, which it is and why. Customers never see group names,
distances or the hub's location."

## Why This Exists

Effy is replacing "same-day vs standard" with a simpler question: **who delivers** — Effy's own
drivers, or a courier (`docs/prd/2026-10-delivery-model-v2-backlog.md`, epic E2; decisions D1, D2, D9).
Everything after this — the new fee, the delivery windows, the checkout, the courier hand-off — needs
one fact first: **for this address, does Effy deliver, does a courier, or does nobody?**

Today that fact is tangled. Where Effy delivers is expressed as zones sitting inside distance tiers,
with a per-zone "same-day" switch and per-shop exceptions on top. Three consequences:

- staff must understand tiers to add a suburb;
- a **shop's** settings can change what a **customer** is offered, which the single-brand model says
  must never happen — customers buy from Effy, not from a shop;
- nobody can answer "do we deliver to 3121, and why?" in one place.

This feature replaces all of it with **one flat list of postcodes** that Effy alone owns, and one
answer per address with three possible values.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Staff decide where Effy delivers (Priority: P1)

A back-office manager wants Effy to start delivering to Richmond. They open Coverage, search
"Richmond", pick the right one (there are several in the country, told apart by state and postcode),
and add it. The list now shows the postcode, the places it covers, and its distance from the hub.
Later they remove a postcode Effy has stopped serving.

**Why this priority**: the list *is* the feature. Every other answer is read from it.

**Independent Test**: add a place by name, see its postcode on the list with a distance; remove it,
see it gone; at no point type a postcode or a distance for a place with a known location.

**Acceptance Scenarios**:

1. **Given** a postcode not on the list, **When** a manager searches a place name and adds it,
   **Then** its postcode appears on the list with every place that postcode covers and a distance
   from the hub.
2. **Given** a place name shared by several places, **When** staff search it, **Then** each result
   shows its state and postcode so the right one can be chosen.
3. **Given** a postcode already on the list, **When** staff try to add a place in it, **Then** they
   are told it is already covered and nothing is duplicated.
4. **Given** a place whose location is unknown, **When** staff add it, **Then** they must enter a
   distance by hand before it is listed, and the list shows that the distance was entered by a person.
5. **Given** a listed postcode, **When** a manager removes it, **Then** it leaves the list, and every
   order already placed to that postcode is unchanged.
6. **Given** a customer-service agent, **When** they open Coverage, **Then** they can read everything
   and change nothing.

---

### User Story 2 - One answer for any address (Priority: P1)

A customer adds a delivery address. The platform tells them one of three things: Effy delivers there
("Delivered by Effy"), a courier delivers there ("Courier delivery"), or Effy cannot deliver there.
They get the same answer, in the same words, when they add the address and when they check out.

**Why this priority**: this is what the list is for, and what every later feature in the programme
reads.

**Independent Test**: with one postcode on the list, one off it but within courier reach, and one
excluded from courier reach, check an address in each — on the address screen and at checkout, on web
and on mobile — and get three different answers, each identical across the places it appears.

**Acceptance Scenarios**:

1. **Given** an address whose postcode is on the list, **When** it is checked, **Then** the answer is
   "Delivered by Effy".
2. **Given** an address whose postcode is not on the list and courier delivery is offered there,
   **When** it is checked, **Then** the answer is "Courier delivery".
3. **Given** an address neither reaches, **When** it is checked, **Then** the customer sees one plain
   sentence saying Effy cannot deliver there — the same sentence when adding the address and at
   checkout, on every customer surface.
4. **Given** any answer, **When** the customer sees it, **Then** no group name, distance or hub
   location is shown or can be worked out from what is shown.
5. **Given** a saved address whose postcode has since left the list, **When** the customer next uses
   it, **Then** they get today's answer, not the one given when it was saved.
6. **Given** a basket from any shop or shops, **When** the address is checked, **Then** the answer is
   the same as for any other basket — what is in the basket and who fulfils it play no part.

---

### User Story 3 - Staff can ask "what about this postcode, and why?" (Priority: P1)

A customer-service agent has a customer on the line asking why they cannot get Effy delivery. The
agent types the postcode (or a place name) into a checker and reads the answer and its reason: "On
Effy's list — group Inner Melbourne, 6.2 km", or "Not on Effy's list; courier delivery is offered",
or "Not on Effy's list; excluded from courier delivery — remote island".

**Why this priority**: without it, every coverage question becomes a question to the operator.

**Independent Test**: check one postcode of each kind and one that does not exist; each returns the
answer and a reason a person can repeat to a customer.

**Acceptance Scenarios**:

1. **Given** any real postcode, **When** staff check it, **Then** they see which of the three answers
   applies and the reason.
2. **Given** a postcode that does not exist, **When** staff check it, **Then** they are told it is not
   a known postcode.
3. **Given** a listed postcode, **When** staff check it, **Then** they also see its group (if any), its
   distance, and whether the distance was worked out or entered by hand.

---

### User Story 4 - Where courier delivery is offered (Priority: P2)

The business offers courier delivery everywhere in the country by default, and keeps a short list of
places it excludes (somewhere a courier will not take chilled food, say), each with a reason. Until
courier ordering itself is built, the business keeps courier delivery switched off entirely, so no
customer is promised something they cannot yet order.

**Why this priority**: the Effy list alone delivers value; the courier rule decides only the second
and third answers, and courier ordering arrives in a later feature.

**Independent Test**: with courier delivery switched off, an unlisted postcode is refused; switched
on, it is "Courier delivery"; added to the exclusions, it is refused again.

**Acceptance Scenarios**:

1. **Given** courier delivery is switched off, **When** an unlisted address is checked, **Then** it is
   refused.
2. **Given** courier delivery is switched on, **When** an unlisted, non-excluded address is checked,
   **Then** the answer is "Courier delivery".
3. **Given** a manager excludes a postcode with a reason, **When** an address there is checked,
   **Then** it is refused, and staff see the reason.
4. **Given** a postcode is both on Effy's list and excluded from courier delivery, **When** it is
   checked, **Then** the answer is "Delivered by Effy" — the exclusion only concerns couriers.

---

### User Story 5 - Groups keep a long list manageable (Priority: P2)

With a few hundred postcodes, the manager groups them: "Inner Melbourne", "Bayside", "Geelong". They
filter the list by group, move postcodes between groups, rename a group. Nothing a customer sees or
pays changes when they do.

**Why this priority**: convenience for staff; the list works without it.

**Independent Test**: create a group, put postcodes in it, move one to another group, rename and
remove a group — and confirm the answer for every affected address is unchanged throughout.

**Acceptance Scenarios**:

1. **Given** listed postcodes, **When** a manager selects several and assigns a group, **Then** each
   belongs to that group and to no other.
2. **Given** a postcode in a group, **When** it is assigned to another, **Then** it moves; it is never
   in two.
3. **Given** a group is removed, **When** staff view the list, **Then** its postcodes are still listed,
   ungrouped, and still "Delivered by Effy".
4. **Given** any group change, **When** an address is checked, **Then** the answer is unchanged.

---

### User Story 6 - Distances stay right (Priority: P2)

The hub moves to a new warehouse. Every distance the platform worked out is worked out again from the
new location; distances a person entered are left alone, and staff are told how many changed and
which hand-entered ones they may want to review.

**Why this priority**: the next feature prices delivery by distance; a stale distance is a wrong fee.

**Independent Test**: change the hub's location; worked-out distances change, hand-entered ones do
not, and the count of each is reported.

**Acceptance Scenarios**:

1. **Given** listed postcodes with worked-out distances, **When** the hub's location changes, **Then**
   each is worked out again and staff see how many changed.
2. **Given** a hand-entered distance, **When** the hub's location changes, **Then** it is unchanged and
   is flagged for review.
3. **Given** a worked-out distance, **When** a manager overrides it by hand, **Then** it becomes
   hand-entered and is no longer recalculated; the manager can later return it to worked-out.
4. **Given** the hub has no location set, **When** staff add a place, **Then** a distance must be
   entered by hand.

---

### User Story 7 - The old arrangement leaves the console, and nobody loses delivery (Priority: P1)

On the day this ships, every postcode Effy delivers to today is on the new list, in a group named
after its old zone, with a distance. The screens for distance tiers, same-day zones and per-shop
same-day exceptions are gone. Customers in the delivery area notice nothing.

**Why this priority**: a coverage feature that silently drops a suburb on release day is an outage.

**Independent Test**: compare the set of postcodes served before and after release — identical; open
the delivery console — no tier, same-day-zone or shop-exception control exists; an order in progress
at release completes as it would have.

**Acceptance Scenarios**:

1. **Given** the postcodes served before release, **When** the feature goes live, **Then** exactly
   those postcodes are on the list, each with a distance.
2. **Given** the back-office delivery console, **When** staff open it after release, **Then** there is
   no control for distance tiers, for marking a zone same-day, or for a shop's same-day exception.
3. **Given** any shop setting, **When** it is changed, **Then** no address's coverage answer changes.
4. **Given** orders placed before release, **When** they are fulfilled, **Then** they proceed exactly
   as they were sold.

---

### Edge Cases

- **A postcode covers several suburbs.** Adding any one of them lists the whole postcode; staff are
  shown every place that comes with it before confirming.
- **A place name spans more than one postcode.** Staff see each postcode as its own result and choose.
- **A postcode with no known location** (a post-office-box postcode, a new estate): it can be listed
  only with a hand-entered distance.
- **An address with a postcode the platform does not know**: refused with the standard sentence;
  staff checking it are told it is not a known postcode.
- **A postcode removed while a customer is mid-checkout**: the next step re-checks and gives today's
  answer; nothing already paid for is affected.
- **Two staff edit the list at once**: both changes are kept where they do not conflict; adding the
  same postcode twice results in one entry.
- **The last postcode is removed**: the list may be empty; every address is then courier or refused.
- **A hand-entered distance of zero or an implausibly large one**: zero is allowed (the hub's own
  postcode); a distance beyond a sensible maximum is refused with the limit stated.
- **Courier delivery switched on before courier ordering exists**: prevented by the switch being off
  by default; see Assumptions.

## Requirements *(mandatory)*

### Functional Requirements

**The Effy list**

- **FR-001**: The platform MUST hold one list of postcodes Effy delivers to with its own drivers. Being
  on the list is the only thing that makes an address "Delivered by Effy".
- **FR-002**: Staff MUST add to the list by searching place names; results MUST show enough (state,
  postcode) to tell same-named places apart. Typing a raw postcode MUST also find it.
- **FR-003**: Before a postcode is added, staff MUST be shown every place it covers.
- **FR-004**: A postcode MUST appear on the list at most once.
- **FR-005**: Staff MUST be able to remove a postcode. Removal MUST NOT change any order already
  placed.
- **FR-006**: The list MUST be searchable and filterable (by place, postcode, group, and whether the
  distance was hand-entered).

**Distance**

- **FR-007**: Every listed postcode MUST have a distance from Effy's hub.
- **FR-008**: Where the postcode's location is known and the hub's location is set, the platform MUST
  work the distance out itself, as the straight-line distance between the two.
- **FR-009**: Where it cannot, staff MUST enter a distance by hand before the postcode can be listed.
- **FR-010**: The list MUST show, for each distance, whether it was worked out or hand-entered.
- **FR-011**: Staff MUST be able to override a worked-out distance by hand, and to return a
  hand-entered one to worked-out where that is possible.
- **FR-012**: When the hub's location changes, every worked-out distance MUST be worked out again,
  hand-entered distances MUST be left unchanged, and staff MUST be told how many of each there are.

**Groups**

- **FR-013**: Staff MAY create named groups and assign listed postcodes to them. A postcode MUST belong
  to at most one group, or to none.
- **FR-014**: A group MUST NOT affect any answer, price, or service a customer receives.
- **FR-015**: Staff MUST be able to rename and remove a group. Removing a group MUST leave its
  postcodes listed and ungrouped.

**Courier reach**

- **FR-016**: The business MUST be able to switch courier delivery on or off as a whole. It MUST be off
  until the business turns it on.
- **FR-017**: While on, courier delivery MUST be offered to every postcode in the country that is not
  on Effy's list and not excluded.
- **FR-018**: Staff MUST be able to maintain a list of postcodes excluded from courier delivery, each
  with a reason.

**The answer**

- **FR-019**: For any address, the platform MUST give exactly one of three answers: *Delivered by
  Effy*, *Courier delivery*, or *cannot deliver*. On Effy's list always means *Delivered by Effy*.
- **FR-020**: The answer MUST be decided in one place and be identical wherever it is asked — adding
  or editing an address, checkout, and the staff checker — on every surface.
- **FR-021**: The answer MUST be worked out from the list as it is at the moment of asking, never
  from a stored earlier answer.
- **FR-022**: The refusal MUST be one plain sentence that says Effy cannot deliver to that address. It
  MUST be the same sentence everywhere a customer meets it.
- **FR-023**: Customers MUST NOT be shown, or be able to derive, a group name, a distance, the hub's
  location, or the reason a place is excluded.
- **FR-024**: The answer MUST NOT depend on the contents of the basket, on which shop or shops would
  fulfil it, or on any shop's settings.

**Staff visibility and control**

- **FR-025**: Staff MUST be able to check any postcode or place and see the answer and its reason;
  for a listed postcode also its group, distance and how the distance was obtained.
- **FR-026**: Managers and admins MUST be able to change the list, groups, distances, the courier
  switch and exclusions. Customer-service agents MUST be able to read all of it and change none.
- **FR-027**: Every change MUST be recorded: who, when, what it was and what it became.
- **FR-028**: An open Coverage screen MUST show another staff member's change without being reloaded.

**Replacing the old arrangement**

- **FR-029**: At release, every postcode served immediately before MUST be on the list with a
  distance, grouped under its former zone's name. No postcode may gain or lose Effy delivery because
  of the release itself.
- **FR-030**: Controls for distance tiers, for marking a zone same-day, and for per-shop same-day
  exceptions MUST be removed from the back-office and from the shop console.
- **FR-031**: No shop-facing setting may influence coverage.
- **FR-032**: Orders placed before release MUST be fulfilled as sold. How new orders are sold
  (same-day or standard) MUST continue unchanged until the programme's checkout feature replaces it;
  see Assumptions.

### Key Entities

- **Covered postcode**: a postcode Effy delivers to. Has the places it covers, a distance from the hub,
  how that distance was obtained (worked out / hand-entered), an optional group, who added it and when.
- **Coverage group**: a name staff give to a set of covered postcodes. Organisational only.
- **Courier reach**: whether courier delivery is offered at all, and the excluded postcodes, each with
  a reason.
- **Coverage answer**: for an address — *Delivered by Effy*, *Courier delivery*, or *cannot deliver* —
  with a staff-only reason. Never stored against the address.
- **Coverage change record**: who changed what, when, from what to what.
- **Hub**: Effy's single operating hub; its location is what distances are measured from (existing).
- **Place**: a suburb or town with its postcode, state and, usually, a location (existing).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A manager adds a new suburb to Effy's delivery area in under 1 minute without typing a
  postcode or a distance.
- **SC-002**: The set of postcodes with Effy delivery is identical immediately before and after
  release — zero gained, zero lost.
- **SC-003**: For 100% of test addresses, the answer shown when adding the address equals the answer
  at checkout and the answer in the staff checker, on web and mobile.
- **SC-004**: The refusal wording is identical, character for character, everywhere a customer can
  meet it.
- **SC-005**: Staff answer "do we deliver to this postcode, and why?" in under 15 seconds from the
  back-office.
- **SC-006**: 100% of listed postcodes have a distance at all times.
- **SC-007**: After a hub move, 100% of worked-out distances reflect the new location and 0% of
  hand-entered distances have changed.
- **SC-008**: Changing any shop setting changes the coverage answer for zero addresses.
- **SC-009**: Zero orders placed before a postcode was removed are altered by its removal.
- **SC-010**: No customer-visible screen or message contains a group name, a distance or the hub's
  location.

## Assumptions

- **Courier delivery starts switched off.** Customers cannot yet place a courier order — that arrives
  with the programme's checkout and courier features (E5, E6). Until the business switches courier
  delivery on, an address off Effy's list gets the refusal, exactly as an out-of-area address does
  today. This keeps the three-answer rule complete now without promising anything that cannot be
  ordered.
- **Same-day and standard keep selling as they do today** until the programme's checkout feature (E5)
  and cutover (E9). This feature removes the *controls* for tiers, same-day zones and shop exceptions;
  the settings as they stood at release stay in force, frozen, for the live checkout until then. New
  work must not build on them.
- **Drivers are still cleared for work per group until the driver-operations feature (E8).** A group
  changes nothing a customer sees, is offered or pays (FR-014). But inside the business, a postcode
  with no group can only be delivered by a driver cleared for everywhere. Staff are shown how many
  drivers can deliver to each group and to ungrouped postcodes, and must confirm before leaving
  postcodes with none. (Found while planning; recorded here so the spec and the plan agree.)
- **Coverage is by postcode, not by street.** Every address in a listed postcode is covered.
- **Distance is straight-line**, hub to the postcode's central point (decision D2). Where a postcode
  covers several places, its most populous place stands for it.
- **One hub** (as today).
- **The country's place and postcode data already exists** on the platform (047) and is reused.
- **"Courier reach" is a national default with exclusions** (the feature description); a per-courier
  service map belongs to the courier feature (E6).
- **The fee is out of scope.** Distance is recorded here and priced by the next feature (E3). Until
  then fees are calculated as today.
- **Delivery windows are out of scope** (E4).
- **Roles** follow the existing back-office pattern: admin and manager change, customer-service reads.
- **Wording**: "Delivered by Effy" and "Courier delivery" are the customer-facing names; the refusal
  sentence is written once and reused.
