# Feature Specification: Flexible Standard Delivery — a Day, "As Soon As Possible", or a Time

**Feature Branch**: `085-flexible-standard-delivery`

**Created**: 2026-10-13

**Status**: Draft

**Input**: "In Standard delivery, let the customer choose only the day by default — we do not show a time
to select; we deliver within that day, no time limit. Also give a button meaning 'no special date to
deliver' — then we deliver the order as soon as possible. Also give a small, explained control so the
customer can select a time slot if they want one; if they select one, delivery happens that day in that
time slot. Selecting something under Same-day un-selects Standard and the other way round; nothing is
selected by default; the customer cannot continue without selecting."

**Builds on**: the one delivery model (083) — an order is *Delivered by Effy* or sent by *Courier
delivery*. This feature changes only what a customer may be promised when Effy itself delivers on a
day after today.

## The gap this closes

Today an order Effy delivers **must carry exactly one time window on one day**. Standard delivery
therefore makes every customer open a day and pick a two-hour window, even when all they care about is
the day — or do not care about the day at all. There is no way to buy "Thursday, any time" or "whenever
you can".

That single assumption — *every Effy order has a window* — runs through the whole operation, and each
place is something this feature must give an answer for:

| Where | What it assumes today |
|-------|-----------------------|
| Checkout | An order with no window is refused. |
| Capacity | Room is counted per window per day; a place is held at payment. A day has no limit of its own. |
| The fee | Can include a surcharge for the chosen window, and a fixed surcharge for delivery today. |
| Collection from suppliers | A parcel is collected on the latest run that still makes its window. |
| Delivery rounds | Planned per window, on the window's day, to the window's end. |
| Hub check-in, driver and dispatch screens | Effy parcels are grouped by day and window. |
| Back-office "move this order to Effy" | Asks for a window. |
| What the customer is told | Arrival is said from the window. |

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A customer chooses a day and nothing else (Priority: P1)

A customer whose address Effy delivers to reaches the delivery step. Under **Standard delivery** they
see the next delivery days. They tap **Thursday 15 Oct**. That is a complete choice: the page says the
order will arrive during Thursday, the order summary shows the delivery fee, and they can continue to
payment. They were never shown a list of times.

**Why this priority**: it is the request, and the common case — most customers buying for a later day
care about the day, not the hour. Forcing a window on all of them is friction, and it crowds demand
into a few popular windows.

**Independent Test**: at an Effy address, choose a later day and nothing else; confirm payment can be
reached, the order is placed, and the confirmation, order page and receipt all say the day with no time.

**Acceptance Scenarios**:

1. **Given** the delivery step at an Effy address, **When** it is first shown, **Then** nothing is
   chosen — no window, no day, no "as soon as possible" — and continuing to payment is not possible.
2. **Given** nothing is chosen, **When** the customer picks a later day, **Then** that day alone is the
   order's delivery choice, the page says delivery is during that day, the fee is shown, and the
   customer can continue.
3. **Given** a day is chosen, **When** the customer picks a different day, **Then** the first is
   un-chosen and the second is the choice.
4. **Given** an order placed with a day only, **When** the customer reads the confirmation, the order
   page, the receipt or the email, **Then** each says the day and that it arrives during the day, and
   none shows a time.
5. **Given** a day that can take no more orders, or that is not a delivery day, **When** the days are
   shown, **Then** that day is shown as unavailable with its reason and cannot be chosen.

---

### User Story 2 - A customer who needs a specific time can still have one (Priority: P1)

Having picked Thursday, the customer notices a small line under the days: **"Need a specific time?"**
with one sentence explaining that they can choose a window and the order will arrive in it. They open
it, Thursday's windows appear, and they pick **4 pm – 6 pm**. The order is now promised for Thursday,
4–6 pm — exactly what a Standard order is today. They change their mind, close the option, and the
order is back to "during Thursday".

**Why this priority**: taking the window away from people who are only home for two hours would be a
regression. It ships with Story 1 or Story 1 cannot ship.

**Independent Test**: choose a day, open the time option, choose a window, and place the order; confirm
it is promised and delivered in that window. Repeat, closing the option before paying, and confirm the
order is promised for the day only.

**Acceptance Scenarios**:

1. **Given** no day is chosen, **When** the Standard section is shown, **Then** no windows are shown and
   the time option cannot be used until a day is chosen.
2. **Given** a day is chosen, **When** the customer opens the time option, **Then** that day's windows
   are shown, none chosen, and the order's choice is still the day alone.
3. **Given** the windows are shown, **When** the customer picks one, **Then** the order is promised for
   that day in that window, and the fee shown includes anything that window adds.
4. **Given** a window is chosen, **When** the customer closes the time option or picks another day,
   **Then** the window is let go; the order is promised for the (new) day only, and the fee follows.
5. **Given** a window that is full or closed, **When** the day's windows are shown, **Then** it is shown
   as unavailable and cannot be chosen — and the day itself can still be chosen without a time, if the
   day has room.

---

### User Story 3 - A customer who does not mind when chooses "as soon as possible" (Priority: P2)

A customer who just wants the order, with no day in mind, taps one button under Standard delivery —
worded to mean *no particular day; as soon as you can*. Nothing else needs choosing. Effy delivers the
order at the earliest opportunity — today, if today still has room — and the customer is told roughly
how long that usually takes, as an estimate and not as a promise.

**Why this priority**: a real and distinct need, but a smaller group than Story 1, and the one with the
most operational questions. Stories 1 and 2 are valuable without it.

**Independent Test**: choose "as soon as possible", place the order, and confirm it is sold in those
words with the estimate, is planned onto the earliest day with room, and is delivered.

**Acceptance Scenarios**:

1. **Given** the Standard section, **When** the customer chooses "as soon as possible", **Then** it is
   the order's whole delivery choice — any chosen day or window is un-chosen — and they can continue.
2. **Given** "as soon as possible" is chosen, **When** the customer picks a day or a same-day window,
   **Then** "as soon as possible" is un-chosen.
3. **Given** an order placed "as soon as possible", **When** the customer reads the confirmation, the
   order page, the receipt or the email, **Then** each says "as soon as possible" with the business's
   estimate (for example "usually within 2–3 days"), always worded as an estimate — never a day, never
   a guarantee.
4. **Given** an "as soon as possible" order is paid, **When** the platform plans it, **Then** it is put
   on the earliest delivery day that has room for an untimed order and can still be collected for —
   **today included** — and it is charged the ordinary delivery fee, with no delivery-today surcharge
   even when it goes today.
5. **Given** an "as soon as possible" order planned for a day, **When** that day turns out not to be
   achievable, **Then** staff may move it to another day without that being a broken promise to the
   customer. The platform does not move it by itself; to staff it is late when its planned day ends.
6. **Given** an "as soon as possible" order goes out for delivery, **When** the round starts, **Then**
   the customer is told it is on its way, as for any Effy order.
7. **Given** no delivery day on offer has room, **When** the section is shown, **Then** "as soon as
   possible" is not offered, and the customer is told in one sentence.

---

### User Story 4 - One choice across the whole delivery section (Priority: P1)

Same-day delivery still offers today's windows, unchanged. A customer taps a same-day window, then
changes their mind and taps Thursday under Standard: the same-day window is no longer highlighted. They
tap the same-day window again: Thursday is no longer highlighted. At no point are two things selected.

**Why this priority**: the page is one question — *when does this order arrive* — with one answer. Two
highlighted things is the defect that prompted this feature.

**Independent Test**: make each kind of choice in turn (a same-day window, a day, a window on a day,
"as soon as possible") and confirm that after each, exactly one thing is highlighted and the order
summary reflects exactly that one.

**Acceptance Scenarios**:

1. **Given** a same-day window is chosen, **When** the customer chooses anything under Standard,
   **Then** the same-day window is un-chosen.
2. **Given** anything under Standard is chosen, **When** the customer chooses a same-day window,
   **Then** the Standard choice is un-chosen and nothing under Standard is highlighted.
3. **Given** any sequence of choices, **When** the page is looked at, **Then** at most one choice is
   highlighted, and the fee and total shown belong to it.
4. **Given** the customer changes the delivery address, **When** the section is shown again, **Then**
   nothing is chosen, whatever was chosen for the previous address.

---

### User Story 5 - Drivers and dispatch deliver an order that has a day and no time (Priority: P1)

On Thursday, the hub has parcels for Thursday's windows and parcels promised only "during Thursday".
Dispatch and drivers see the untimed parcels as their own group for the day — "Any time" — beside the
windows. They are collected from suppliers in time to go out that day and are delivered on that day's
rounds, wherever there is room, before the day's deliveries end.

**Why this priority**: an order that can be sold and not delivered is worse than the friction it
removes. Stories 1 and 3 cannot be switched on without this.

**Independent Test**: place a day-only order for a later day; on that day confirm it is collected, shown
at hub check-in and to dispatch under the day with no time, placed on a round that day, and delivered
before the day's deliveries end.

**Acceptance Scenarios**:

1. **Given** a day-only parcel, **When** collection from its supplier is planned, **Then** it is
   collected in time to be delivered on its day.
2. **Given** parcels checked in at the hub, **When** the driver sees the check-in summary, **Then**
   untimed parcels are counted under their day as a group of their own, and the driver classifies nothing.
3. **Given** a day's rounds are planned, **When** untimed parcels for that day exist, **Then** they are
   delivered on that day's "Any time" round — a round of their own, so no windowed parcel is pushed
   outside its window.
4. **Given** a day-only parcel, **When** the day's last delivery round ends, **Then** it has been
   delivered or it is shown to staff as late — never silently carried to another day.
5. **Given** an "as soon as possible" order planned for a day, **When** drivers and dispatch see it,
   **Then** it sits in that day's untimed group and is handled exactly like a day-only parcel.

---

### User Story 6 - Staff see, limit and adjust these orders (Priority: P2)

Back-office staff set how many untimed orders a delivery day may take. In Orders they can tell at a
glance whether an order was promised a window, a day, or "as soon as possible", and filter by it. When
a customer rings to ask for a time after all, staff can give a day-only or "as soon as possible" order
a window, or move it to another day, and the customer is told. The emergency move of a courier order
to Effy can now be made onto a day without a window.

**Why this priority**: the business must be able to control load before the choice is offered widely,
but a sensible starting limit lets Stories 1–5 run without every staff tool being finished.

**Independent Test**: set a day's limit to one, place one day-only order for it and confirm a second
customer sees the day as unavailable for a day-only choice; then, as staff, give the first order a
window and confirm the customer's order page says the window.

**Acceptance Scenarios**:

1. **Given** the delivery settings, **When** staff set how many untimed orders a day may take, **Then**
   checkout offers the day for a day-only choice only while it has room.
2. **Given** the Orders list, **When** staff look at an Effy order, **Then** they see whether it was
   promised a window, a day, or "as soon as possible", and can filter by each.
3. **Given** a day-only or "as soon as possible" order not yet out for delivery, **When** staff give it
   a window or another day, **Then** the change is recorded with who and why, the customer is told, and
   the order page says the new promise.
4. **Given** staff move an order to Effy, **When** they choose where it goes, **Then** they may choose a
   day with or without a window, under the same rules as checkout.

---

### Edge Cases

- **The chosen day fills or closes between seeing it and paying.** Never substituted: payment is not
  taken, the customer is told the day is no longer available, the days are shown afresh with nothing
  chosen, and they choose again. The same holds for a window, as it does today.
- **A day whose windows are all full.** The day may still have room for an untimed order, and the
  reverse: a day at its untimed limit may still have a window with room. Each is offered on its own
  terms and says which.
- **A day-only order for tomorrow placed late tonight.** A day stops being offered when its parcels
  could no longer be collected in time for it; the customer never buys a day that cannot be met.
- **"As soon as possible" and today.** It may go today when today has room for an untimed order and
  its parcels can still be collected and delivered today; otherwise the next day that can. It never
  pays the delivery-today surcharge. A customer who must have it today still buys a same-day window.
- **"As soon as possible" that cannot go on its planned day.** The place it was planned into is held
  for it. If the day cannot be met, staff move it; the platform never re-plans it by itself. Staff see
  it as late when its planned day ends — the customer was given an estimate, not that day.
- **Today is not offered as a day-only choice.** A customer cannot pick "today, any time": the days
  under Standard start from the next delivery day.
- **An untimed parcel that is not delivered on its day.** It is shown to staff as late and handled as a
  late delivery is today; the customer is not silently moved.
- **Orders placed before this feature.** Every one carries a window and keeps reading exactly as sold.
- **An address Effy does not deliver to.** Courier delivery is unchanged: nothing to choose.
- **A fee that changes because the choice changed** (a window's surcharge added or removed): the total
  shown always belongs to the current choice, and payment is refused if the total the customer saw is
  not the total that would be charged.
- **Small screens and assistive technology.** The choices are one group: a screen reader hears one
  question with one answer, and the time option announces that it is optional.

## Requirements *(mandatory)*

### Functional Requirements

**What the customer may choose**

- **FR-001**: At an address Effy delivers to, the delivery step MUST offer exactly these kinds of
  choice, and the order MUST carry exactly one of them: (a) a window today; (b) a later day with no
  time; (c) a later day with a window; (d) "as soon as possible".
- **FR-002**: Same-day delivery MUST be unchanged: today's windows, each with its time to order by and
  what it adds to the fee.
- **FR-003**: Standard delivery MUST show the offered later delivery days, and choosing a day MUST be a
  complete choice on its own, with no window shown or required.
- **FR-004**: Standard delivery MUST offer a single "as soon as possible" choice, worded so a customer
  understands it means *no particular day — at the earliest opportunity*.
- **FR-005**: Standard delivery MUST offer an optional, clearly explained control that, once a day is
  chosen, reveals that day's windows; choosing one MUST promise the order for that day in that window.
- **FR-006**: The time option MUST say in one sentence what choosing a time does and that it is
  optional, and MUST NOT be usable before a day is chosen.
- **FR-007**: Nothing MUST be chosen for the customer on arrival, on returning to the step, or after
  the address changes — no window, no day, and not "as soon as possible".
- **FR-008**: The choices MUST exclude each other across the whole section: making one un-makes any
  other, so at most one is highlighted at any time.
- **FR-009**: Closing the time option or choosing another day MUST let go of a chosen window, leaving
  the day as the choice.
- **FR-010**: The customer MUST NOT be able to continue to payment until one choice is made.
- **FR-011**: The customer website and the customer app MUST offer the same choices, in the same words,
  with the same rules.

**What is promised and said**

- **FR-012**: A day-only order MUST be promised for delivery on that day, at any time during the day's
  delivery hours, and MUST be said that way everywhere the customer reads it.
- **FR-013**: An "as soon as possible" order MUST be sold with the business's estimate of how long it
  usually takes (a setting staff keep, e.g. "within 2–3 days"), always said as an estimate, and MUST
  NOT be promised a day.
- **FR-013a**: The platform MUST plan an "as soon as possible" order, at payment, onto the earliest
  delivery day — today included — that has room for an untimed order and can still be collected for,
  and from then on MUST treat it exactly as a day-only order for that day. Only staff re-plan it.
- **FR-014**: The confirmation, order page, receipt and emails MUST say what was sold, in one of four
  forms: today and its window; a day and its window; a day; or "as soon as possible" with the estimate
  it was sold. An order MUST keep the words it was sold.
- **FR-015**: A choice the platform can no longer keep at payment — a day or window that has filled,
  closed, or stopped being a delivery day — MUST be refused, never replaced with another, and the
  customer MUST be told and asked to choose again with nothing pre-chosen.
- **FR-016**: The customer MUST still never be told how many suppliers fill the order, nor how full a
  day or window is.

**The fee**

- **FR-017**: A day-only order and an "as soon as possible" order MUST be charged the order's delivery
  fee with no window surcharge. An "as soon as possible" order MUST NOT be charged the delivery-today
  surcharge, whichever day it is delivered.
- **FR-018**: Choosing a window through the time option MUST add exactly what that window adds today,
  shown before it is chosen.
- **FR-019**: The fee and total shown MUST always belong to the current choice, and payment MUST be
  refused if the total the customer was shown is not the total that would be charged.

**Capacity**

- **FR-020**: Each delivery day MUST have its own limit on untimed orders, set by staff, separate from
  the limits of that day's windows. Day-only orders and "as soon as possible" orders planned for the
  day both count against it; windowed orders do not.
- **FR-021**: A day MUST stop being offered for an untimed order when it has no room, when it is not a
  delivery day, or when its parcels could no longer be collected in time — independently of whether any
  of its windows can still be chosen.
- **FR-022**: A place on a day MUST be held for an untimed order at the same moment a window's place is
  held today, and released on the same terms.

**Collecting and delivering**

- **FR-023**: An untimed parcel MUST be collected from its supplier in time to be delivered on its day.
- **FR-024**: Untimed parcels MUST be delivered on a round of their own on their day — the day's "Any
  time" round, whose hours staff set — so they never cause a windowed parcel to miss its window.
- **FR-025**: Hub check-in, the driver app and dispatch MUST show untimed parcels under their day as a
  group of their own, beside the day's windows. The driver classifies nothing.
- **FR-026**: An untimed parcel — day-only or "as soon as possible" — not delivered by the end of its
  day's "Any time" hours MUST be shown to staff as late.
- **FR-027**: Shops MUST still be told only "Effy driver" or "Courier" — nothing about a day, a time or
  "as soon as possible".

**Back-office**

- **FR-028**: Staff MUST be able to see, for any Effy order, whether it was promised a window, a day,
  or "as soon as possible", and to filter orders by that.
- **FR-029**: Staff MUST be able to give a day-only or "as soon as possible" order a window, or move it
  to another day, until it is out for delivery; each change MUST be recorded with who and why, and the
  customer MUST be told.
- **FR-030**: Moving an order to Effy MUST allow a day without a window, under the same availability
  rules as checkout.

**Orders that already exist**

- **FR-031**: Every order placed before this feature MUST read, and be delivered, exactly as it was
  sold.

### Key Entities

- **Delivery promise**: what an Effy-delivered order was sold — one of *window today*, *day and
  window*, *day only*, *as soon as possible*. One per order; kept as sold.
- **Delivery day**: a day Effy delivers on. Gains its own limit on untimed orders, beside its windows'.
- **"As soon as possible" estimate**: the business's one statement of how long such an order usually
  takes; the order keeps the text it was sold.
- **Delivery window**: unchanged — a start, an end, a time to order by, and room, on a day.
- **Untimed parcel**: a parcel of a day-only or "as soon as possible" order: it has a day and no window.
- **Promise change**: a staff change to an order's day or window — who, when, why, from what, to what.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A customer who wants a later day can complete the delivery step with **one** tap under
  Standard delivery (today: at least two, a day and a window).
- **SC-002**: In every state of the delivery step, at most one choice is highlighted, and the total
  shown is the total charged — on the website and in the app.
- **SC-003**: 100% of day-only and "as soon as possible" orders are shown to drivers and dispatch on
  their delivery day; none is missing from hub check-in or from the day's rounds.
- **SC-004**: At least 95% of untimed orders are delivered on their promised day.
- **SC-005**: On-time delivery of windowed orders does not fall after untimed orders are introduced.
- **SC-006**: No customer is ever charged for, or told, a day or window they did not choose: a choice
  that has gone is refused and re-offered every time.
- **SC-007**: Every order placed before the feature reads identically before and after it ships.
- **SC-008**: Within a month of launch, the share of Standard orders concentrated in the single busiest
  window falls, as customers with no time preference stop being forced into one.
- **SC-009**: Staff can find all untimed orders for a given day, and give one a time, in under a minute.

## Assumptions

- **Scope is Effy-delivered orders on days after today.** Same-day delivery, courier delivery, who
  delivers to an address, and the single hub are unchanged.
- **Today is never sold untimed by the customer's own choice.** Today is a same-day window. An "as
  soon as possible" order may nevertheless be delivered today, at the ordinary fee (decided
  2026-10-13). ⚠ Accepted consequence: it can be a cheaper way to receive an order today than a
  same-day window — without the certainty, which is what the same-day surcharge buys.
- **"During the day" means the "Any time" hours staff set for untimed deliveries** (for example midday
  to 9 pm) — not midnight to midnight. Until staff set them, neither a day-only choice nor "as soon as
  possible" is offered, and Standard delivery works as it does today.
- **A day-only order costs less than or the same as a windowed one**: the order's delivery fee without
  any window surcharge. No new discount or premium is introduced.
- **The platform, not a person, plans an "as soon as possible" order's day**, at payment; the customer
  is told the estimate, not the day. The estimate's wording and numbers are the business's to set.
- **The exact customer wording** for the "as soon as possible" button, the "during the day" promise and
  the time-option sentence is settled once, shared by the website and the app, and is not decided in
  this document beyond its meaning.
- **The interim behaviour shipped ahead of this feature** — a day under Standard opens that day's
  windows, and opening a day lets go of a same-day window — is replaced by this one: choosing a day
  becomes a choice in itself.
- **Driver and shop apps already installed keep working**; anything they are newly shown is added
  without breaking what they read today.
- **Notifying the customer of a staff change** uses the channels order updates already use.
