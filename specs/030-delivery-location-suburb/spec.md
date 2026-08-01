# Feature Specification: Suburb-Aware Delivery Location

**Feature Branch**: `030-delivery-location-suburb`

**Created**: 2026-08-01

**Status**: Draft

**Input**: User description: "Delivery location: suburb-aware entry and a legible location display.

Today the customer app asks 'do we deliver to you?' by demanding a 4-digit postcode typed into an alert
dialog, and shows the answer back as bare digits ('Deliver to 3121'). Two problems: many shoppers do not
know their postcode, and a signed-in shopper who has already saved a default address is still asked for
it. This slice closes both, and re-presents the result as something a person can read.

Scope (three things, no more): 1) Suburb-aware location entry — one input accepts either a postcode or a
suburb name; because one suburb can span several postcodes and suburb names repeat across states, the
shopper picks a specific (suburb, state, postcode) locality, never a bare name. 2) Seed from the
account's default address, with an explicit device choice outranking it and nothing ever written back to
the account. 3) Presentation on the customer mobile Home screen — the entry surface becomes a BOTTOM
SHEET, and the set location is displayed as meaningful place information rather than the postcode alone.

Rules that must not regress: 'we could not check' and 'we do not deliver there' are never rendered the
same way; a malformed or unrecognised input is never reported as a refusal; browsing is never blocked;
and the up-front answer never quotes a delivery fee, a delivery window, or the name of a delivery zone."

---

## Context: what 025 left unfinished

Feature 025 gave the storefront its up-front delivery answer (FR-012 / FR-013 / FR-014): a persistent
affordance that tells a shopper whether Effy delivers to them **before** a cart exists, rather than at
payment. That capability works and its hardest rule holds — a failed check and a genuine refusal are
different answers and are rendered differently.

Three gaps remain, and together they mean a large share of shoppers cannot use the capability at all.

1. **The only way in is a postcode the shopper has to already know.** The question is asked with a
   4-digit numeric field and nothing else. A shopper who does not know their postcode — new to the
   area, renting, recently arrived, or simply someone who thinks in suburb names — cannot answer at
   all. For that person the store's first interaction is a dead end, which is the precise opposite of
   what the affordance was built for.

2. **025 FR-013's account half was never built.** It requires the storefront to "reuse a signed-in
   shopper's existing default address where one exists". A seeding function exists on **both** customer
   surfaces and is called by **neither**, so a shopper who has already told Effy where they live is
   still asked to type a postcode. The requirement has been unmet since 025 shipped, on every surface.

3. **The answer is displayed as bare digits.** "Deliver to 3121" is a form receipt, not a place. A
   shopper cannot verify at a glance that the store is answering about the right location, which
   matters most for exactly the shoppers who were least sure of the postcode.

This feature closes all three. It does **not** revisit how delivery zones are defined, priced, or
decided — the answer still comes from the same zones checkout uses (025 FR-014b), and this slice only
changes how a shopper names a place and how the answer is presented back.

### Surfaces in scope

**Both customer surfaces**, at parity of capability. All three gaps above exist identically on customer
mobile and on the customer web storefront — the same postcode-only entry, the same unwired seeding, the
same bare-digit display. Fixing one and not the other would add a fifth entry to a list of customer-web
carry-forwards that is already long enough to be a pattern.

Parity is of **capability**, not of form factor. A shopper must be able to do the same things on either
surface; how each surface presents them follows its own platform's conventions:

- **Customer mobile** — the entry surface becomes a **bottom sheet**, replacing today's centre-screen
  dialog (operator direction).
- **Customer web** — keeps the modal panel it already has. Its form factor is not changed here; only
  what the panel can accept and what the storefront displays back.

⚠ **The web half carries a constraint the mobile half does not.** The web affordance renders in the
storefront chrome on *every* public page, and those pages are byte-budgeted and machine-guarded. Two
routes currently sit within a kilobyte of that budget. Whatever the web entry surface gains must
therefore cost a shopper who never opens it nothing at all, and must be built without adding an
interface library to the guest path — see FR-045/FR-046 and Dependencies.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find my place by name (Priority: P1) — both surfaces

A shopper opens the store, wants to know whether Effy delivers to them, and does not know their
postcode. They open the delivery affordance. On mobile a sheet rises from the bottom of the screen; on
web the header panel opens. Either way they are asked where they want their order delivered. They type
the first few letters of their suburb. A short list of matching places appears, each one identified
fully enough to pick the right one — the suburb, its state or territory, and its postcode. They tap
theirs. The answer appears immediately, in the surface they asked in: Effy delivers there, or it does
not yet. Either way they can close it and keep shopping.

**Why this priority**: This is the whole feature. Without it the capability is unusable by anyone who
does not already know their postcode, and no amount of better presentation fixes that. It is also
independently shippable: with only this story built, every shopper can answer the question.

**Independent Test**: On each surface, set a delivery location without typing a single digit — type a
suburb name, choose a place from the list, and receive a serviceability answer. Fully testable with no
account.

**Acceptance Scenarios**:

1. **Given** a shopper with no delivery location set, **When** they open the entry sheet and type at
   least two letters of a suburb name, **Then** a bounded list of matching places appears, each showing
   suburb, state or territory, and postcode.
2. **Given** a list of matching places, **When** the shopper taps one, **Then** the platform answers
   whether Effy delivers to that place, and the answer is shown without leaving the entry surface.
3. **Given** a shopper who does know their postcode, **When** they type four digits into the same input,
   **Then** they get the same answer they get today, with no mode to switch and no extra step.
4. **Given** a suburb name that occurs in more than one state, **When** the shopper types it, **Then**
   each state's place is offered as a separate, distinguishable choice.
5. **Given** a suburb served by more than one postcode, **When** the shopper types it, **Then** each
   postcode is offered as a separate, distinguishable choice, and the platform never guesses one.
6. **Given** input matching no known place, **When** the shopper stops typing, **Then** they are told
   the place was not recognised — never that Effy does not deliver there.
7. **Given** the place lookup is unavailable, **When** the shopper types, **Then** they are told the
   lookup could not run and are still able to enter a postcode directly — and are never told Effy does
   not deliver to them.
8. **Given** a shopper anywhere in the flow, **When** they dismiss the entry surface without choosing,
   **Then** any location set previously is unchanged and browsing continues uninterrupted.
9. **Given** the same shopper task performed on customer mobile and on the web storefront, **When** both
   are compared, **Then** the same places are findable by the same input and produce the same verdict —
   the surfaces differ in presentation only.
10. **Given** a web shopper who never opens the delivery affordance, **When** they browse any public
    page, **Then** they download nothing that exists only to serve the place lookup.

---

### User Story 2 - Don't ask me what you already know (Priority: P2) — both surfaces

A shopper who has an account with a saved default delivery address opens the store. They are not asked
where they want their order delivered — the store already knows, and the delivery answer for their
default address is present the first time they see the storefront. If they want to shop for somewhere
else today, they can change it, and their change wins for as long as it is set.

**Why this priority**: It removes the question entirely for returning customers, it completes a
requirement 025 already committed to and never built on either surface, and it is small. It is second
only because a shopper without an account — the majority of first-time visitors — gets nothing from it.

**Independent Test**: On each surface, sign in as a customer with a default address and open the
storefront. The delivery location is already set to that address's place and already carries a verdict,
with no interaction.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper with a default delivery address and no location set on the device,
   **When** they open the storefront, **Then** the delivery location is already set from that address
   and the serviceability answer is already present.
2. **Given** a shopper who has explicitly set a location on this device, **When** they sign in and their
   account default names a different place, **Then** their explicit choice is kept — the default does
   not override it.
3. **Given** a location that came from the account, **When** the shopper changes or clears it, **Then**
   it behaves exactly like one they set themselves.
4. **Given** a guest who sets a location, **When** they later sign in, **Then** no address is created or
   modified on their account, and their address book is unchanged.
5. **Given** a signed-in shopper whose account default names a place Effy does not serve, **When** they
   open the storefront, **Then** they are plainly told so — the location is not hidden, and no other
   address is silently substituted.
6. **Given** a location that came from the account, **When** the shopper signs out, **Then** it is
   cleared; **Given** a location the shopper set themselves, **When** they sign out, **Then** it is kept.
7. **Given** a signed-in shopper with no default address, **When** they open the storefront, **Then**
   they are asked as a guest is asked, with no error and no empty state peculiar to signed-in shoppers.
8. **Given** a guest on the web storefront, **When** they browse without signing in, **Then** the
   seeding behaviour costs them nothing — no account read is performed and no page they see is slowed
   by a capability that cannot apply to them.

---

### User Story 3 - See where I'm shopping (Priority: P3) — both surfaces

A shopper who has set a delivery location sees the place they chose — recognisable as a place, not as
four digits — together with whether Effy delivers there. A glance is enough to confirm the store is
answering about the right location. On mobile that is the Home affordance; on web it is the header
affordance and the notice shown to a shopper Effy cannot yet serve.

**Why this priority**: It is presentation over an answer the other two stories already produce, so it
delivers least on its own. It is nonetheless what makes the answer trustworthy: a shopper who was unsure
of their postcode cannot verify a bare number, and this is exactly that shopper.

**Independent Test**: Set a location by choosing a named place, then read the affordance on each surface
without opening anything — the suburb, its state or territory, and the delivery verdict are all legible.

**Acceptance Scenarios**:

1. **Given** a shopper who chose a named place, **When** they look at the storefront, **Then** the
   affordance names that place — suburb and state or territory — alongside its postcode.
2. **Given** a shopper who entered a bare postcode covering several localities, **When** they look at
   the storefront, **Then** the affordance shows the postcode and its state or territory and does
   **not** invent or pick a suburb on their behalf.
2a. **Given** a shopper who entered a bare postcode covering exactly one locality, **When** they look
   at the storefront, **Then** the affordance may name that locality — there is no other candidate to
   choose between.
3. **Given** any set location, **When** the shopper looks at the storefront, **Then** the delivery
   verdict is shown alongside the place, and "we could not check" is visibly different from "we do not
   deliver here yet".
4. **Given** the narrowest supported phone width and the largest supported system text size, **When**
   the affordance is displayed, **Then** neither the place nor the verdict is truncated to the point of
   ambiguity.
5. **Given** a screen-reader user, **When** the verdict changes, **Then** the new verdict is announced,
   and the announcement names the place in the same terms the display uses.
6. **Given** a web shopper Effy does not yet serve, **When** the notice is shown in the page body,
   **Then** it names the place rather than repeating the bare postcode.

---

### Edge Cases

- **A suburb name that occurs in several states** (there are many) — every candidate is listed with its
  state, and no candidate is preferred; picking is the shopper's, not the platform's.
- **A suburb spanning several postcodes** — each is a separate choice. The platform never picks one,
  because picking wrong produces a confident answer about the wrong place.
- **A postcode covering several suburbs** — the shopper who typed digits told us a postcode and nothing
  more, so the display must not name one of its suburbs as though they had chosen it.
- **An unrecognised place name** — reported as unrecognised. This is the single most important
  separation in the feature: a list limited to places Effy serves would make "we have never heard of
  that place" and "we do not deliver there" the same message, which is the exact conflation the whole
  capability exists to prevent.
- **The place lookup fails or times out** — reported as "could not check". Postcode entry must still
  work, so a failed lookup never removes the shopper's ability to get an answer.
- **The account default address has no state recorded** — the state is derivable from the postcode, so
  the location is still usable; the display falls back to postcode plus derived state.
- **The account default address names a place with no delivery coverage** — shown as a plain refusal,
  never hidden and never swapped.
- **A shopper changes place while a previous answer is still in flight** — the late answer for the
  abandoned place must never be shown against the new one.
- **A shopper on a slow or absent connection** — an unanswered location renders as unanswered, and
  browsing is unaffected.
- **A shared device** — an account-derived location does not outlive the session that produced it.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Locality reference data

- **FR-001**: The platform MUST hold its own record of Australian localities, each identified by a
  locality name, a state or territory, and a postcode.
- **FR-002**: That record MUST cover Australia in full — **not** only the areas Effy serves. A record
  limited to served areas would make an unrecognised place indistinguishable from an unserved one, and
  FR-009/FR-011 would become unenforceable.
- **FR-003**: Locality data MUST be treated as reference data: readable by any shopper including guests,
  never written by a shopper, and containing no personal information about anyone.
- **FR-004**: The locality record MUST be maintainable without a shopper-visible change — locality
  boundaries change at the pace of postal administration, not of shopping.

#### Finding a place

- **FR-005**: A shopper MUST be able to find their delivery location by typing part of a locality name
  and choosing from the matching places.
- **FR-006**: A single input MUST accept either a postcode or a locality name. The shopper MUST NOT have
  to declare which they are entering.
- **FR-007**: Entering a valid postcode MUST continue to produce the answer it produces today, by the
  same rules, with no additional step.
- **FR-008**: Every offered place MUST be identified unambiguously by locality name, state or territory,
  and postcode together. A bare locality name MUST NOT be selectable, because a name alone does not
  identify a place in Australia.
- **FR-009**: Matching MUST be case-insensitive, MUST work from a partial name, and MUST begin offering
  places from the second character entered.
- **FR-010**: The number of places offered at once MUST be bounded so the list remains scannable, and
  where matches exceed that bound the shopper MUST be able to narrow them by typing more.
- **FR-011**: The list of places MUST NOT indicate whether Effy delivers to any of them. Serviceability
  is stated once, for the place the shopper actually chose, so the list can never pre-empt or contradict
  the answer.

#### Keeping the three answers distinct

- **FR-012**: Input matching no known place MUST be reported as unrecognised, and MUST NEVER be rendered
  as, or mistakable for, "we do not deliver there".
- **FR-013**: A place lookup that fails MUST be reported as "we could not check", MUST NEVER be rendered
  as a refusal, and MUST leave direct postcode entry working.
- **FR-014**: A recognised place with no delivery coverage MUST be stated plainly and without blame,
  MUST offer a way to change it, and MUST NOT block browsing.
- **FR-015**: An answer that arrives for a place the shopper has since moved away from MUST be discarded
  rather than displayed against the current place.
- **FR-016**: The up-front answer MUST remain limited to whether Effy delivers there. It MUST NOT quote a
  delivery price, MUST NOT quote a delivery window, and MUST NOT name or number a delivery zone or a
  fulfilment location.
- **FR-017**: Serviceability MUST continue to be decided by the same delivery zones that decide it at
  checkout, so the two answers can never disagree.

#### Reusing what the account already knows

- **FR-018**: A signed-in shopper who has a default delivery address MUST have their delivery location
  taken from it, and the serviceability answer for it MUST be present the first time they see Home,
  without being asked.
- **FR-019**: Seeding from the account MUST occur only when no delivery location is set. A location the
  shopper set explicitly on the device MUST outrank the account default.
- **FR-020**: A location taken from the account MUST be changeable and clearable in exactly the same way
  as one the shopper set.
- **FR-021**: Setting, changing, or clearing a delivery location MUST NEVER create, modify, or delete an
  address on the shopper's account. A delivery location is a device preference; it becomes an address
  only through the address book.
- **FR-022**: The platform MUST record how a location was arrived at — chosen on this device, or taken
  from the account — and MUST use that only for the FR-023 rule and for display provenance, never as an
  input to any authorization or pricing decision.
- **FR-023**: On sign-out, a location that came from the account MUST be cleared; a location the shopper
  set explicitly on the device MUST be kept. An account-derived place MUST NOT outlive the session that
  produced it, because the device may not be the shopper's alone.
- **FR-024**: If the account default names a place Effy does not serve, that MUST be shown as an
  ordinary refusal. The location MUST NOT be hidden, and another address MUST NOT be substituted.
- **FR-025**: A shopper without an account MUST retain full use of the capability. Nothing here may make
  the answer conditional on signing in.

#### The entry surface — customer mobile Home

- **FR-026**: The entry surface MUST be a sheet that rises from the bottom edge of the screen, replacing
  the centre-screen dialog used today.
- **FR-027**: The sheet MUST carry everything needed to name a place — the input and the matching places
  — so the shopper never leaves it to complete the task.
- **FR-028**: The sheet MUST show the serviceability verdict for a chosen place **within the sheet**, so
  the shopper learns the answer where they asked the question rather than on the screen behind it.
- **FR-029**: After a verdict is shown, the shopper MUST be able to try a different place without
  reopening the sheet.
- **FR-030**: The sheet MUST be dismissible without setting anything, leaving any previously set location
  untouched.
- **FR-031**: A shopper with a location already set MUST be able to clear it from the sheet.
- **FR-032**: Every interactive element in the sheet, including each offered place, MUST meet the
  platform's touch-target minimum, and the whole task MUST be completable one-handed on a phone.

#### The entry surface — customer web

- **FR-048**: The web entry surface MUST keep the modal panel form factor it has today. Its shape is
  not changed by this feature; only what it accepts and what it shows back.
- **FR-049**: The web panel MUST offer the same single input accepting either a postcode or a locality
  name (FR-006), the same bounded list of matching places (FR-010), and the same unambiguous
  identification of each place (FR-008) as the mobile sheet.
- **FR-050**: The web panel MUST show the serviceability verdict within the panel, so a web shopper
  learns the answer where they asked the question rather than by closing it and reading the chrome.
- **FR-051**: The list of places MUST be operable by keyboard alone — reachable, navigable, and
  selectable — and MUST be announced to assistive technology as a list of choices.
- **FR-052**: The panel MUST retain the dismissal, focus, and background-inertness behaviour it has
  today; adding a list of choices MUST NOT weaken any of it.

#### The location display — customer mobile Home

- **FR-033**: Where the shopper chose a named place, the Home affordance MUST name it — locality and
  state or territory — alongside its postcode, rather than showing the postcode alone.
- **FR-034**: Where the shopper entered a bare postcode that covers more than one locality, the
  affordance MUST show the postcode with its state or territory and MUST NOT name a locality the shopper
  did not choose.
- **FR-034a**: Where a bare postcode covers **exactly one** locality, the affordance MAY name it. There
  is only one candidate, so naming it invents nothing — it states the single place the shopper's own
  input identifies. *(Added 2026-08-01. FR-034 forbids naming a locality only when the postcode covers
  several; this states the sole-candidate case explicitly rather than leaving it to be inferred.)*
- **FR-034b**: Where the place lookup fails, the affordance MUST fall back to showing the postcode
  alone, and the **delivery verdict MUST be unaffected**. Not knowing what a postcode is called is not
  a reason to stop answering whether Effy delivers there.
- **FR-035**: The affordance MUST show the delivery verdict alongside the place, and MUST continue to
  render "we could not check", "we do not deliver there yet", and "we deliver here" as three visibly
  distinct states.
- **FR-036**: The affordance MUST remain legible without truncation of the verdict at the narrowest
  supported phone width and at the largest supported system text size, in both light and dark
  appearance.
- **FR-037**: A change of verdict MUST continue to be announced to assistive technology.
- **FR-038**: The affordance MUST remain a single tap away from opening the entry sheet, and MUST
  continue to invite a first-time shopper to set a location when none is set.

#### The location display — customer web

- **FR-039**: The web header affordance MUST name the chosen place rather than showing the postcode
  alone, under the same rules as FR-033 and FR-034.
- **FR-040**: Where the storefront chrome cannot fit the full place name, the affordance MUST shorten it
  predictably and MUST keep the place identifiable; it MUST NOT drop the state or territory in a way
  that makes two different places read identically.
- **FR-041**: The body notice shown to a shopper Effy does not yet serve MUST name the place rather than
  repeating the bare postcode, so the refusal is about somewhere the shopper recognises.
- **FR-042**: The verdict announced to assistive technology MUST name the place in the same terms the
  visible display uses, so a screen-reader user and a sighted user are told about the same place in the
  same words.

#### What this may cost a shopper

- **FR-043**: A shopper who never opens the delivery affordance MUST NOT pay for the place lookup — no
  part of the storefront's public pages may grow to serve a capability that shopper did not use.
- **FR-044**: The public storefront's existing page-weight budget MUST continue to be met on every
  public route after this feature ships. A route that would exceed it MUST be treated as a defect in
  this feature, not as a pre-existing condition.
- **FR-045**: The place lookup MUST NOT require adding a general-purpose interface library to the public
  storefront's guest pages, which are contractually barred from carrying one.
- **FR-046**: Locality reference data MUST NOT be shipped to the client wholesale. A shopper looking up
  one suburb MUST NOT download a record of every suburb in Australia.

#### Privacy

- **FR-047**: A shopper's chosen place — locality name, state, or postcode — MUST NEVER be attached to
  analytics or telemetry. Where the platform records that a location was set, it MUST record only
  whether Effy delivers there. A suburb name is location data about an individual and is more
  identifying than the postcode this rule already protects.

### Key Entities

- **Locality**: an Australian place a shopper can name — a locality name, a state or territory, and a
  postcode. Reference data owned by the platform, not customer data. The three attributes together
  identify a place; no two of them reliably do. A locality name may occur in several states; a locality
  may span several postcodes; a postcode may cover several localities.
- **Delivery location** (existing, extended): the place the shopper wants their order delivered to. It
  already carries a postcode, a delivery verdict that may be unanswered, and how it was arrived at. This
  feature adds the locality name and state or territory, which may be absent when the shopper entered a
  bare postcode.
- **Default delivery address** (existing, read-only here): the address a signed-in shopper has marked as
  their default. This feature reads its place only, and never writes to it.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper who does not know their postcode can set a delivery location and receive a
  delivery answer, using only their suburb name, in under 20 seconds and without leaving the store.
- **SC-002**: Every postcode that Effy currently delivers to is reachable by typing at least one
  locality name — measured by resolving each served postcode back through the locality record with no
  gaps.
- **SC-003**: 5 of 5 test shoppers, shown each of the three states in turn, correctly distinguish "we
  could not check" from "we do not deliver here yet" from "we deliver here".
- **SC-004**: 20 unrecognised or malformed inputs produce 0 responses that a test shopper reads as "Effy
  does not deliver to me".
- **SC-005**: A signed-in shopper with a default delivery address is never shown the "set your delivery
  location" prompt on Home; the answer for their default place is present on first view.
- **SC-006**: 0 addresses are created or modified on any account as a result of setting, changing, or
  clearing a delivery location, verified over the full flow including the guest-then-sign-in path.
- **SC-007**: Matching places appear within 1 second of typing for 95% of lookups on a typical mobile
  connection.
- **SC-008**: 5 of 5 test shoppers, shown the Home affordance for a location they did not set
  themselves, correctly state which place the store is answering about.
- **SC-009**: The entire location-setting task is completable one-handed on a phone held in either hand,
  confirmed by observation with 5 testers.
- **SC-010**: The affordance and the entry sheet render without truncation or overlap at the narrowest
  supported phone width, at the largest supported system text size, in both light and dark appearance,
  and on a tablet.
- **SC-011**: A screen-reader user can complete the whole task — open, type, choose a place, hear the
  verdict, dismiss — without sighted assistance.
- **SC-012**: Browsing is uninterrupted in 100% of cases where the location is unanswered, unrecognised,
  or unserved.
- **SC-013**: 0 occurrences of a delivery price, a delivery window, a delivery zone name, or a
  fulfilment location anywhere in the affordance or the sheet.
- **SC-014**: Verified on both iOS and Android. *(Recorded explicitly because 028 and 029 each shipped
  having looked at iOS only, and 028 asked that it not be repeated.)*
- **SC-015**: Every acceptance scenario in User Stories 1 and 2 passes on **both** customer surfaces.
  A capability present on one and absent on the other is a failure of this feature, not a carry-forward.
- **SC-016**: Every public web route meets the storefront's page-weight budget after this feature ships,
  and a shopper who never opens the delivery affordance downloads no more than they did before it.
- **SC-017**: 0 occurrences of a locality name, state, or postcode in any analytics or telemetry event,
  verified by inspecting every event this feature emits or changes.
- **SC-018**: A keyboard-only web shopper can complete the whole task — open the panel, type, choose a
  place, read the verdict, dismiss — without using a pointer.

---

## Out of Scope

Named here because each was considered and deliberately excluded; none may be smuggled in.

- **Device geolocation** — no "use my current location", no location permission request, no coordinates.
- **Third-party address autocomplete or geocoding** — no external address, place, or geocoding service.
- **Full street-address capture** — this feature names a place, not an address. Capturing an address
  remains the address book's job.
- **"Notify me when you deliver here"** — no demand capture on the refusal path. It is a good idea and
  it is a different slice.
- **Any change to delivery zones** — how zones are defined, which postcodes they contain, how they are
  priced, and how serviceability is decided are all untouched.
- **Persisting the mobile delivery location across app restarts** — see Assumptions; this is a
  pre-existing 025 gap and is not closed here.
- **Writing a delivery location back to the account** — explicitly forbidden by FR-021, not deferred.
- **Changing the web entry surface's form factor** — the bottom sheet is a mobile change. The web panel
  keeps the shape it has (FR-048).
- **The shop, driver, and back-office surfaces** — none of them ask a shopper where to deliver.

---

## Assumptions

- **Australia only.** The platform serves Australian postcodes (four digits) and Australian states and
  territories. A locality record is meaningful in that context and this feature does not attempt to
  generalise it.
- **Locality reference data is obtainable from an open Australian source** and changes rarely enough
  that refreshing it is an operations task, not a product capability. No requirement here depends on
  real-time locality data.
- **A default delivery address already carries a suburb, a postcode, and usually a state.** The state is
  recorded as optional on existing addresses, so the feature must tolerate its absence — hence FR-033's
  fallback via the postcode.
- **The mobile delivery location still does not survive an app restart.** 025's FR-013 persistence half
  is met on web and unmet on mobile, and this slice does not close it. ⚠ **A consequence worth stating:
  on mobile, a signed-in shopper who deliberately changes to a different place will be re-seeded from
  their account default on the next launch, because the explicit choice that was supposed to outrank it
  did not survive.** FR-019 is honoured within a session; across restarts on mobile it cannot be. This
  is a carry-forward, recorded rather than hidden.
- **The existing serviceability answer is reused unchanged.** This feature adds a way to name a place
  and a way to display it; the verdict itself comes from the capability 025 built and 025 FR-014b's
  shared-with-checkout guarantee continues to hold.
- **Guests remain first-class.** The capability is public, needs no account, and none of this changes
  that.
- **The web storefront already persists the delivery location across visits**, so User Story 2's
  seeding interacts correctly there: an explicit choice genuinely outranks the account default, across
  sessions as well as within one. The asymmetry with mobile noted above is a mobile limitation, not a
  design inconsistency.
- **The web entry surface can be extended without a new interface library.** It is built today on
  browser-native behaviour precisely because of the guest-path prohibition, and a list of choices is
  within what that allows. If it turns out not to be, the correct response is to reduce the web
  presentation — not to widen the dependency (constitution Principle II, and the existing contract).

---

## Dependencies

- **025** — the delivery-location affordance and the up-front serviceability answer this feature
  extends.
- **022 / 019** — the customer address book and the address model that supplies the default address for
  User Story 2.
- **021** — the delivery zones that decide the answer. Read-only here; unchanged.
- **The public storefront's page-weight budget and its interface-library prohibition** — an existing,
  machine-enforced constraint on the guest path, not something this feature introduces. It binds the
  web half of User Story 1 (FR-043 … FR-046) and is the single largest reason the web entry surface is
  harder than the mobile one, despite looking like the same work.
- **The customer parity register** — records what each customer surface can do. Both columns move
  together in this slice; that is the point of the scope decision below.

---

## Resolved Scope Decisions

- **Surface scope (settled 2026-08-01, operator direction)** — **both customer surfaces, full parity of
  capability.** The alternative considered was mobile-only with web recorded as a carry-forward. It was
  rejected: customer-web already carries recorded carry-forwards from 027, 028 and 029, and adding
  another for a defect this very slice is fixing on the other surface would make the parity register a
  record of intentions rather than of capabilities. The cost accepted with that choice is the web
  page-weight problem, which is therefore **in scope** (FR-043 … FR-046) rather than deferred.
