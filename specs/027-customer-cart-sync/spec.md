# Feature Specification: Customer Cart — Persistent, Synced & Complete

**Feature Branch**: `027-customer-cart-sync`

**Created**: 2026-07-30

**Status**: Draft

**Input**: User description: "Customer Cart — Persistent, Synced & Complete. Effy's customer cart is presently ephemeral and effectively unsynced… make it durable, cross-device, honest about price and availability, and give it the things a shopper expects: clear cart, save for later, reorder, promotional codes, a minimum order value, and guardrails. Both customer surfaces, full parity. The mobile cart's existing look is accepted as-is."

---

## Why this exists

The cart is the only place in Effy where a shopper's own work accumulates. Everything else the
platform shows — the catalogue, a product page, a past order — the platform can rebuild at any time.
A cart cannot be rebuilt: it is a list of decisions the shopper made, one tap at a time, and it is the
last thing standing between browsing and revenue.

Today Effy loses it. On the mobile app the cart exists only for the lifetime of the running process:
switch apps for long enough, or close the app, and every decision is gone with no warning and no
recovery. On the web storefront it survives in that one browser and nowhere else. A shopper who fills
a cart on their phone and later opens the storefront on a laptop finds it empty; a shopper who fills a
cart before signing in can have it silently overwritten by whatever their account happened to be
holding. And nothing in the cart ever admits that an item became unavailable or changed price — the
shopper finds out at payment.

That is not a missing nicety. A cart that forgets is a cart that has to be rebuilt, and shoppers do
not rebuild carts; they leave. This slice makes the cart durable, account-level, honest, and complete.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - My cart is still there (Priority: P1)

A shopper adds items, then leaves — switches to another app, closes the app, restarts the phone, or
closes the browser tab. When they come back, their cart is exactly as they left it: same items, same
quantities, same order. This holds whether or not they have an account.

**Why this priority**: This is the defect that motivated the slice. Without it, every other cart
capability is built on something that evaporates. It is also the single largest silent loss of shopper
intent in the product today.

**Independent Test**: Add three items, force-quit the app (and separately, restart the device), reopen
it, and confirm the cart and the cart count are unchanged. Repeat as a guest and as a signed-in
shopper, and on the web storefront.

**Acceptance Scenarios**:

1. **Given** a guest with 3 items in their cart, **When** they force-quit the app and reopen it,
   **Then** the cart shows the same 3 items with the same quantities and the cart count reads the same
   total.
2. **Given** a guest with items in their cart, **When** they restart the device and reopen the app,
   **Then** the cart is unchanged.
3. **Given** a signed-in shopper with items in their cart, **When** they close and reopen the app,
   **Then** the cart is unchanged.
4. **Given** a shopper on the web storefront with items in their cart, **When** they close the tab and
   return later, **Then** the cart is unchanged.
5. **Given** a shopper whose cart is restored on launch, **When** the cart appears, **Then** it shows
   current prices and availability, not the values captured when the items were added.

---

### User Story 2 - One cart, whichever way I shop (Priority: P1)

A signed-in shopper's cart belongs to their account, not to a device. Items added on the phone appear
on the web storefront, and the other way round. Two devices open at once never double a quantity,
lose an item, or bring back something the shopper removed.

**Why this priority**: Effy deliberately runs two customer surfaces at parity. A cart that does not
cross between them makes the second surface a dead end and quietly punishes the shopper for owning
two devices.

**Independent Test**: Sign in on the app and the web storefront as the same shopper. Add an item on
one, and confirm it appears on the other on next view without any manual refresh gesture beyond
opening the cart. Change a quantity on each in turn and confirm both converge on the same cart.

**Acceptance Scenarios**:

1. **Given** the same shopper signed in on mobile and web, **When** they add an item on mobile,
   **Then** opening the cart on web shows that item within seconds.
2. **Given** the same shopper signed in on two devices with the same 2-item cart, **When** they raise
   a quantity to 3 on device A, **Then** device B shows 3 — not 5, and not 2 — the next time it shows
   the cart.
3. **Given** the same shopper on two devices, **When** they remove an item on device A and then view
   the cart on device B, **Then** the item is gone on device B and does not return.
4. **Given** a shopper who signs out on one device, **When** they view the cart there, **Then** they
   see a guest cart and their account cart is untouched — signing in again restores it.
5. **Given** a shopper whose account cart is empty and who has never used this device, **When** they
   sign in, **Then** they see their account cart, not an empty one.

---

### User Story 3 - Signing in keeps everything (Priority: P1)

A shopper browses as a guest, builds a cart, and signs in (because Effy only requires an account to
check out). Signing in combines what they had on the device with what their account already held.
Nothing from either side is dropped, and signing in twice does not multiply anything.

**Why this priority**: Effy is guest-first by design, so this transition happens on the majority of
first purchases. It is also the exact path that loses items today.

**Independent Test**: Build a guest cart with items A and B. Sign in as a shopper whose account cart
holds items B and C. Confirm the resulting cart holds A, B and C with the expected quantity for B, and
that signing out and back in leaves it unchanged.

**Acceptance Scenarios**:

1. **Given** a guest cart with A×1 and B×2 and an account cart with B×3 and C×1, **When** the shopper
   signs in, **Then** the cart holds A, B and C, with B at the higher of the two quantities, and
   nothing else.
2. **Given** the merge just completed, **When** the shopper signs out and signs in again on the same
   device, **Then** quantities are identical to after the first merge — nothing has doubled.
3. **Given** a guest cart that is empty, **When** the shopper signs in, **Then** their account cart is
   shown untouched and is not emptied by the sign-in.
4. **Given** a guest cart containing an item that has since become unavailable, **When** the shopper
   signs in, **Then** the merge completes and the item appears flagged as unavailable rather than
   being dropped without explanation.
5. **Given** a merge is interrupted (connectivity lost part-way), **When** the shopper retries or the
   app retries automatically, **Then** the outcome is the same as a single successful merge.

---

### User Story 4 - The cart keeps up with me (Priority: P2)

Tapping plus, minus, or remove registers immediately — the line, the total and the cart count all move
at once, with no spinner and no waiting on the network. Holding down a quantity control through several
taps does not produce a stutter or a queue of visible work. If connectivity drops mid-change, the
change is not lost: it takes effect once connectivity returns, exactly once.

**Why this priority**: Grocery carts are edited heavily — a shopper adjusts quantities far more often
than they add items. Latency here reads as the app being broken, and Effy's mobile mandate is
native-feel responsiveness.

**Independent Test**: Tap the quantity stepper ten times rapidly and confirm the displayed quantity
tracks every tap with no lag and the cart converges on the final value. Then enable airplane mode,
make several changes, re-enable connectivity, and confirm the cart matches what was done offline with
no duplicated quantities.

**Acceptance Scenarios**:

1. **Given** a cart with a line at quantity 1, **When** the shopper taps plus, **Then** the line, the
   subtotal and the cart count update immediately with no loading indicator.
2. **Given** a shopper taps plus ten times in two seconds, **When** they stop, **Then** the line shows
   10 and the cart settles on 10 without visibly counting up or flickering back.
3. **Given** no connectivity, **When** the shopper adds an item and changes a quantity, **Then** the
   cart shows the changes and indicates that they are not yet saved rather than failing.
4. **Given** changes were made without connectivity, **When** connectivity returns, **Then** the cart
   reflects those changes once, and re-opening the app confirms the same result.
5. **Given** a change cannot be saved even after retrying, **When** the shopper views the cart,
   **Then** they are told plainly which change did not stick and the cart shows the platform's actual
   contents rather than a false success.

---

### User Story 5 - The cart never lies to me (Priority: P2)

Whatever is in the cart is shown at today's price and today's availability. If an item went away, the
cart says so and does not charge for it. If an item's price changed since it was added, the cart says
so and shows what it was, so a shopper is never surprised at payment.

**Why this priority**: Discovering a price change or a vanished item at the payment step is the most
expensive possible moment to discover it, and it is the moment Effy currently chooses.

**Independent Test**: Put an item in the cart, have the catalogue mark it unavailable, and confirm the
cart flags it, excludes it from the total, and blocks paying for it. Separately change an item's price
and confirm the cart shows both the new price and the previous one.

**Acceptance Scenarios**:

1. **Given** an item in the cart becomes unavailable, **When** the shopper opens the cart, **Then**
   the item is clearly marked unavailable, is excluded from the total, and the shopper is offered a way
   to remove it.
2. **Given** a cart containing only unavailable items, **When** the shopper views it, **Then**
   checkout is not offered and the reason is stated.
3. **Given** an item's price rose after it was added, **When** the shopper opens the cart, **Then**
   the line shows the current price and states the previous price.
4. **Given** an item's price fell after it was added, **When** the shopper opens the cart, **Then**
   the shopper pays the lower current price and is told the price changed.
5. **Given** the cart displays a total, **When** the shopper proceeds to pay, **Then** the amount
   charged equals the platform's own computation of that total for available items, never a figure
   supplied by the shopper's device.

---

### User Story 6 - Set it aside, or start over (Priority: P2)

A shopper who is unsure about an item can set it aside without deleting it, and bring it back later.
A shopper who wants to start over can empty the cart in one deliberate, confirmed action instead of
removing items one at a time.

**Why this priority**: Both are the standard escape valves in every major cart. Without them, "I'm not
sure" and "start again" both resolve to destructive removal — which shoppers avoid, so they abandon the
whole cart instead.

**Independent Test**: Set an item aside, confirm it leaves the total and survives a restart, bring it
back, and confirm it is payable again. Separately, clear a full cart and confirm the confirmation step
and the empty result.

**Acceptance Scenarios**:

1. **Given** a cart with 3 items, **When** the shopper sets one aside, **Then** it leaves the payable
   items, the total drops accordingly, and it appears in a set-aside list.
2. **Given** an item is set aside, **When** the shopper closes and reopens the app, **Then** it is
   still set aside — not lost and not silently back in the cart.
3. **Given** an item is set aside, **When** the shopper moves it back, **Then** it becomes a normal
   payable line at its current price.
4. **Given** an item is set aside and later becomes unavailable, **When** the shopper views the
   set-aside list, **Then** it is shown as unavailable and cannot be moved back until it is available
   again.
5. **Given** a cart with items, **When** the shopper chooses to empty it, **Then** they are asked to
   confirm, and on confirming the cart is empty and the set-aside list is untouched.
6. **Given** a signed-in shopper who set items aside on one device, **When** they sign in on another,
   **Then** the same set-aside list is there.

---

### User Story 7 - Order that again (Priority: P3)

From their order history a shopper can put a whole past order back into the cart in one action —
Effy's shoppers buy the same groceries repeatedly, and re-finding fifteen items is work nobody will
do. Anything from that order that no longer exists, or is currently unavailable, is reported rather
than quietly skipped.

**Why this priority**: Genuinely valuable and cheap to add once the cart is solid, but nobody is
blocked without it. It depends on the cart being durable first.

**Independent Test**: Place (or seed) an order, then use reorder from history and confirm every still-
available item lands in the cart at the ordered quantity, with a clear report of anything that could
not be added.

**Acceptance Scenarios**:

1. **Given** a past order with 5 available items, **When** the shopper reorders it, **Then** all 5
   are in the cart at their ordered quantities and the shopper is taken to (or offered) the cart.
2. **Given** a past order where 2 of 5 items are no longer available, **When** the shopper reorders,
   **Then** the 3 available items are added and the shopper is told plainly that 2 items could not be
   added, without naming or implying any shop.
3. **Given** the cart already holds one of the ordered items, **When** the shopper reorders, **Then**
   quantities combine sensibly and never exceed the per-item ceiling.
4. **Given** a past order where nothing is still available, **When** the shopper reorders, **Then**
   the cart is unchanged and the shopper is told nothing could be added.
5. **Given** a shopper taps reorder twice, **When** the second attempt completes, **Then** the cart
   does not contain double the quantities of the first.

---

### User Story 8 - Use my promotional code (Priority: P3)

A shopper types a promotional code into the cart and immediately sees the discount reflected in the
total, or a clear reason why the code does not apply. They can remove it. The discount they see is the
discount they get. Separately, an Effy operator can create codes and govern them — how much, for how
long, how many times, and a minimum spend — and can switch one off.

**Why this priority**: A marketing capability rather than a shopping blocker, and the only part of this
slice that introduces a genuinely new concept to the platform. It goes last so the cart's foundations
are settled first.

**Independent Test**: With a set of operator-created codes covering valid, expired, not-yet-started,
used-up, and below-minimum cases, apply each in the cart and confirm the exact outcome. Then confirm
the amount charged at payment matches the discounted total the cart displayed.

**Acceptance Scenarios**:

1. **Given** a valid percentage code and a qualifying cart, **When** the shopper applies it, **Then**
   the discount is shown as its own line in the summary and the total drops by exactly that amount.
2. **Given** a valid fixed-amount code worth more than the cart, **When** the shopper applies it,
   **Then** the discount is capped so the payable total never goes below zero.
3. **Given** an unknown, expired, not-yet-started, disabled, or fully-used code, **When** the shopper
   applies it, **Then** it is refused with a reason that says which of those it is, and the total is
   unchanged.
4. **Given** a code with a minimum spend the cart does not meet, **When** the shopper applies it,
   **Then** they are told the minimum and how much more is needed — with no mention of any shop.
5. **Given** a code limited to one use per shopper that this shopper already used, **When** they
   apply it again, **Then** it is refused as already used.
6. **Given** an applied code, **When** the shopper removes it, **Then** the total returns to the
   undiscounted amount and the code can be applied again.
7. **Given** an applied code and a cart the shopper then changes so it no longer qualifies, **When**
   they view the cart, **Then** the code is shown as no longer applying, with the reason, and the total
   is correct.
8. **Given** a cart with an applied code, **When** the shopper pays, **Then** the amount charged is
   the platform's own discounted computation, and the code's usage is counted exactly once even if
   payment is attempted more than once.
9. **Given** an operator, **When** they create a code with a type, value, validity window, overall and
   per-shopper usage caps and a minimum spend, **Then** shoppers can use it within those limits, and
   disabling it stops new uses immediately without affecting orders already paid for.

---

### User Story 9 - Tell me before I try to pay (Priority: P3)

Where Effy requires a minimum spend, the cart says so up front and says how much more is needed.
Checkout is not offered until it is met — the shopper is never allowed to walk into a refusal at the
payment step. The message never reveals anything about which shops are fulfilling the order.

**Why this priority**: A commercial guardrail with a real UX consequence, but the platform functions
without it. Bundled here because it shares the cart's totals and gating logic with promotional codes.

**Independent Test**: Configure a minimum, build a cart below it, and confirm the cart states the
shortfall and refuses checkout; add items to cross the threshold and confirm checkout unlocks.

**Acceptance Scenarios**:

1. **Given** a minimum spend is configured and a cart below it, **When** the shopper views the cart,
   **Then** the minimum and the remaining amount are stated and checkout is not available.
2. **Given** such a cart, **When** the shopper adds enough to reach the minimum, **Then** the message
   clears and checkout becomes available without a reload.
3. **Given** a cart at or above the minimum, **When** the shopper views the cart, **Then** no minimum
   message is shown at all.
4. **Given** unavailable items in the cart, **When** the minimum is evaluated, **Then** only payable
   items count towards it.
5. **Given** any minimum-spend message, **When** it is displayed, **Then** it names no shop, no shop
   count, and no location.

---

### User Story 10 - Run a promotion (Priority: P3)

An Effy operator sets up a promotional campaign from the back-office console: creates the code, decides
whether it takes a percentage or a fixed amount off, when it runs, how many times it may be used
overall and per shopper, and the minimum spend it requires. Later they check how much it has been used,
and switch it off when the campaign ends.

**Why this priority**: Promotional codes are worthless to the business if only an engineer can create
one, so this is the other half of User Story 8 rather than an optional extra — but no shopper is
blocked while it is being built, so it sits at the same priority.

**Independent Test**: From the console, create a code, verify a shopper can use it within its limits,
verify its usage count rises, disable it, and verify the next shopper is refused — all without touching
the database directly.

**Acceptance Scenarios**:

1. **Given** an authorised operator, **When** they create a code with a type, value, window, caps and
   minimum spend, **Then** it appears in the console's list and a shopper can apply it within those
   limits.
2. **Given** a code in use, **When** the operator views it, **Then** they see how many times it has
   been used, against its caps.
3. **Given** a code that has never been used, **When** the operator edits its value, **Then** the
   change is accepted.
4. **Given** a code that has already been used, **When** the operator tries to change its type or
   value, **Then** the change is refused — its window, caps and state remain editable.
5. **Given** an active code, **When** the operator disables it, **Then** the next shopper to apply it
   is refused, and orders already paid for with it are unaffected.
6. **Given** a code that has been used, **When** the operator tries to delete it, **Then** deletion is
   refused and disabling is offered instead.
7. **Given** an operator submits a code that duplicates an existing one, has an end before its start,
   a non-positive value, or a percentage above 100, **When** they save, **Then** it is refused with the
   specific reason and nothing is created.
8. **Given** any code, **When** an operator reviews it, **Then** they can see who created it, who last
   changed it, and when.
9. **Given** internal staff without authorisation to manage promotions, **When** they attempt to reach
   the management area, **Then** they are refused.

---

### Edge Cases

- **Two devices, same second**: two devices change the same line at the same moment. The cart must
  converge on one value on both devices — never sum them, never resurrect a removed line.
- **A stale device**: a device that has been offline for a week and reconnects must not overwrite a
  cart the shopper has since built elsewhere with its own out-of-date contents.
- **The same change sent twice**: a retry after an ambiguous failure (the request arrived, the
  response did not) must not apply twice.
- **Per-item ceiling**: a shopper raises a quantity beyond the per-item ceiling, or reorders a past
  order that would push a line past it. The cart clamps to the ceiling and says so.
- **Cart size ceiling**: a shopper (or a reorder) tries to exceed the maximum number of distinct items.
  The add is refused with an explanation; the existing cart is untouched.
- **Quantity zero**: setting a quantity to zero removes the line, and is undoable in the same way a
  removal is.
- **An item disappears entirely** (not merely unavailable — deleted from the catalogue): the line is
  removed and reported, and never becomes an unnamed blank row.
- **A set-aside item becomes unavailable, then available again**: it becomes movable back into the
  cart, at its current price.
- **Abandoned checkout**: a shopper enters checkout, gets a payment intent, and abandons. Their cart
  must be exactly as they left it — not empty, and not holding a previous attempt's items.
- **Paid order**: the cart empties only when payment actually succeeds, and only the payable items
  that were purchased leave the cart; set-aside items stay.
- **Sign-out**: the account cart survives sign-out untouched; the device returns to a guest cart.
- **A barred customer**: cart operations are refused for a barred account, in the same way as every
  other customer capability, with no partial writes.
- **Currency**: the platform runs one currency; a cart never mixes currencies.
- **Empty cart**: no minimum-spend message, no promotional-code field left dangling, no total —
  just the route back into the catalogue.
- **A promotional code applied while offline**: never applied optimistically. A discount is only ever
  shown once the platform has validated it.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Durability and persistence

- **FR-001**: The cart MUST survive the client application being closed, force-quit, or killed by the
  operating system, and MUST survive a device restart.
- **FR-002**: A shopper without an account MUST have their cart persisted on that device, including
  quantities and the order of items.
- **FR-003**: A signed-in shopper's cart MUST be held by the platform against their account, so it is
  independent of any one device or surface.
- **FR-004**: A restored cart MUST be shown at current prices and current availability, never at the
  values captured when items were added.
- **FR-005**: Persisted cart data MUST NOT include anything the platform is authoritative for as if it
  were authoritative — a restored device copy is a starting point to be reconciled with the platform,
  not a substitute for it.

#### Account cart, sync, and merge

- **FR-006**: For a signed-in shopper the platform's cart MUST be the authority for contents,
  quantities, prices, availability and totals; a client copy exists only to make the interface
  immediate.
- **FR-007**: Every cart change made by a signed-in shopper MUST be recorded by the platform, and the
  platform MUST return the complete, re-priced cart in response so the client never has to guess the
  result.
- **FR-008**: Opening the cart, and returning to the app or storefront after it was backgrounded, MUST
  reconcile the displayed cart with the platform's.
- **FR-009**: Concurrent changes from two devices MUST converge deterministically on a single cart —
  never summing the same change twice, never restoring a removed line.
- **FR-010**: A change originating from a device that holds an out-of-date view of the cart MUST NOT
  silently discard newer changes made elsewhere; the platform MUST detect the staleness and the client
  MUST resolve it by reconciling rather than overwriting.
- **FR-011**: On sign-in the platform MUST combine the device cart with the account cart such that
  every distinct item from either side is present, and a line present on both takes the greater of the
  two quantities.
- **FR-012**: The merge MUST be repeatable with no additional effect — performing it twice MUST leave
  the same cart as performing it once.
- **FR-013**: Sign-out MUST leave the account cart intact and MUST return the device to an empty guest
  cart; the shopper's next sign-in MUST restore the account cart.

#### Responsiveness and resilience

- **FR-014**: Adding, changing a quantity, removing, setting aside and clearing MUST be reflected in
  the interface immediately, without a blocking wait on the platform and without a per-action loading
  indicator.
- **FR-015**: The cart count shown outside the cart MUST update at the same moment and MUST never
  require a network round trip to be correct.
- **FR-016**: Rapid repeated changes to the same line MUST be coalesced so that the platform receives
  the shopper's settled intent rather than one request per tap.
- **FR-017**: A change made without connectivity MUST be retained, MUST be visibly marked as not yet
  saved, and MUST be applied when connectivity returns.
- **FR-018**: A retained change MUST be applied exactly once, even if the client cannot tell whether
  an earlier attempt reached the platform.
- **FR-019**: A change that ultimately cannot be applied MUST be surfaced to the shopper with what
  failed, and the cart MUST then display the platform's actual contents rather than the failed
  optimistic state.
- **FR-020**: Repeated retries MUST NOT escalate into unbounded traffic; retrying MUST back off and
  MUST stop attempting a change the platform has definitively refused.

#### Honest pricing and availability

- **FR-021**: The cart MUST show each line's current authoritative unit price and line total.
- **FR-022**: An item that is no longer available MUST be shown as unavailable, MUST be excluded from
  the payable total, and MUST be removable in one action.
- **FR-023**: The platform MUST record the price a line was added at, and MUST report when the current
  price differs, including the previous amount, so the change can be shown rather than inferred.
- **FR-024**: A price change MUST NOT be applied silently in either direction: the shopper pays the
  current price and is told the price changed.
- **FR-025**: An item that has been deleted from the catalogue entirely MUST be removed from the cart
  and reported to the shopper.
- **FR-026**: Checkout MUST NOT be offered when a cart contains no payable items, and the reason MUST
  be stated.
- **FR-027**: The amount charged MUST be the platform's own computation from the platform's own cart;
  no client-supplied amount, discount, or total may influence it.

#### Managing cart contents

- **FR-028**: A shopper MUST be able to set an item aside: it leaves the payable items and total, and
  is kept in a distinct set-aside list.
- **FR-029**: A shopper MUST be able to move a set-aside item back into the cart at its current price.
- **FR-030**: Set-aside items MUST persist exactly as cart items do, MUST be account-level for a
  signed-in shopper, and MUST NOT be affected by clearing the cart or by completing an order.
- **FR-031**: Set-aside items MUST show current price and availability, and an unavailable one MUST
  NOT be movable back into the cart until it is available.
- **FR-032**: A shopper MUST be able to empty the cart in one action, and MUST be asked to confirm
  first because it is not recoverable.
- **FR-033**: A removal MUST be undoable immediately after it happens, restoring the line as it was.
- **FR-034**: A shopper MUST be able to add every item of a past order to their cart in one action.
- **FR-035**: A reorder MUST report exactly what could not be added and why, in aggregate, without
  naming or implying any shop; it MUST NOT fail wholesale because some items are unavailable.
- **FR-036**: A reorder that would exceed the per-item or cart-size ceiling MUST clamp or refuse the
  affected items and say so, leaving the rest of the cart valid.

#### Guardrails

- **FR-037**: The platform MUST enforce a maximum quantity per line and MUST tell the shopper when a
  change was clamped to it.
- **FR-038**: The platform MUST enforce a maximum number of distinct items per cart and MUST refuse an
  add beyond it with an explanation, leaving the existing cart unchanged.
- **FR-039**: Every ceiling MUST be enforced by the platform, not only by the client, so a hostile or
  outdated client cannot exceed it.
- **FR-040**: Cart operations MUST be refused for a barred account, consistently with every other
  customer capability, and MUST leave no partial change behind.

#### Promotional codes

- **FR-041**: A shopper MUST be able to apply a promotional code from the cart and see the resulting
  discount before checkout, and MUST be able to remove it.
- **FR-042**: A code MUST be validated entirely by the platform. The client MUST NOT decide whether a
  code is valid, nor what it is worth.
- **FR-043**: The platform MUST refuse an invalid code with a specific reason, distinguishing at least:
  unknown, not yet started, expired, disabled, overall usage limit reached, already used by this
  shopper, minimum spend not met, and not applicable to this cart.
- **FR-044**: A discount MUST be expressed either as a percentage of the payable items or as a fixed
  amount, and a fixed amount MUST be capped so the payable total never falls below zero.
- **FR-045**: The discount MUST be shown as its own entry in the cart summary, so the shopper can see
  what they are getting rather than only a changed total.
- **FR-046**: At most one promotional code MAY apply to a cart at a time; applying a second replaces
  the first, and the shopper is told.
- **FR-047**: A code that stops qualifying because the cart changed MUST be reported as no longer
  applying, with the reason, and MUST NOT continue to reduce the total.
- **FR-048**: A code's usage MUST be counted once per completed order, at the moment payment succeeds
  — never when it is applied in the cart, and never twice for repeated payment attempts on one order.
- **FR-049**: The discount recorded against a paid order MUST be the platform's computation at the
  moment of payment, and MUST be visible on the receipt and in order history.
- **FR-050**: An Effy operator MUST be able to create a promotional code specifying its type
  (percentage or fixed amount), its value, a validity window, an overall usage cap, a per-shopper usage
  cap, and a minimum spend; and MUST be able to disable one.
- **FR-051**: Disabling a code MUST stop new uses immediately and MUST NOT affect orders already paid
  for.
- **FR-052**: Promotional code administration MUST be restricted to authorised internal staff and MUST
  be attributable — who created or changed a code, and when.

#### Minimum order value

- **FR-053**: The platform MUST support requiring a minimum payable amount before checkout is allowed,
  configurable by an operator rather than fixed in the product.
- **FR-054**: When a cart is below the minimum, the cart MUST state the minimum and the remaining
  amount, and checkout MUST be unavailable — not merely warned against.
- **FR-055**: Only payable items MUST count towards the minimum; unavailable items MUST NOT.
- **FR-056**: The requirement MUST also be enforced at checkout, so it cannot be bypassed by a client
  that ignores it.
- **FR-057**: When no minimum is configured, or a cart meets it, no minimum message MUST be shown.

#### Cart lifecycle

- **FR-058**: A cart MUST be emptied only when an order is actually paid for, and only of the items
  that were purchased.
- **FR-059**: An abandoned or failed checkout attempt MUST leave the cart exactly as the shopper left
  it — neither emptied nor holding items from a previous attempt.
- **FR-060**: A cart MUST NOT expire or be pruned on a timer; a shopper returning after a long absence
  finds their cart, re-priced.

#### Presentation and privacy

- **FR-061**: The cart MUST continue to present one unified Effy cart with a single total, split into
  anonymous packages when items come from more than one fulfilment node.
- **FR-062**: No cart message, notice, refusal, reorder report, promotional-code reason, or
  minimum-spend message may reveal a shop's name, identity, count, or location.
- **FR-063**: Delivery MUST remain priced at the delivery step once a destination is known; the cart
  MUST NOT show a delivery figure it cannot yet compute.
- **FR-064**: Both customer surfaces MUST offer the same cart capabilities, with equivalent
  behaviour — this slice does not leave one surface behind.
- **FR-065**: The mobile cart's existing visual design is accepted as-is; presentation changes MUST be
  limited to what the new capabilities require (new controls, notices, and states) and MUST use the
  established design language.
- **FR-065a** (added 2026-07-30, operator request): A shopper MUST be able to ask for the cart to be
  brought up to date by pulling it down, and MUST see that the request is in progress. The gesture MUST be
  available on an EMPTY cart too — "empty" is precisely the state a shopper doubts after adding something
  on another device, so refusing the gesture there would deny it exactly where it is most wanted. A
  refresh that fails MUST leave the cart exactly as it was.
- **FR-065b** (added 2026-07-30, operator request): The same gesture MUST be offered on every screen whose
  content can change on the platform while the shopper is looking at it — the order list and a receipt
  (fulfilment progress moves as a shop receives and picks), the catalogue and a product page (price and
  availability move), and saved items. It MUST NOT be offered where a refresh would be meaningless or
  disruptive: a search result follows a query the shopper controls, and checkout is a flow mid-commitment.
- **FR-065c**: A refresh MUST NOT replace the content with a loading state. The shopper is looking at
  something and asking for a newer version of it, not asking for it to disappear; and a failure MUST leave
  what is on screen exactly as it was.

#### Promotional code administration (internal)

- **FR-066**: Promotional code administration MUST be available to authorised internal staff in the
  back-office console as a managed area of that console — not through a command, a script, or direct
  data entry (resolved 2026-07-30).
- **FR-067**: An operator MUST be able to see every promotional code with its type, value, validity
  window, caps, minimum spend, state, and how many times it has been used.
- **FR-068**: An operator MUST be able to create a code and to edit a code that has not yet been used;
  a code that has been used MUST remain editable only in ways that cannot rewrite history — its state,
  its validity window, and its caps — never its type or value.
- **FR-069**: An operator MUST be able to disable and re-enable a code, and disabling MUST take effect
  for new uses immediately.
- **FR-070**: A code MUST NOT be deletable once it has been used; disabling is the removal path, so
  every paid order keeps a code it can still be explained by.
- **FR-071**: Code creation and every subsequent change MUST be attributable to the operator who made
  it, with the moment it happened, and MUST be visible to an operator reviewing the code.
- **FR-072**: The console MUST reject a code whose definition cannot be honoured — a duplicate code, an
  invalid window, a non-positive value, a percentage above 100, or caps below zero — with the reason.

### Key Entities

- **Cart**: The set of items one shopper intends to buy. Belongs to an account when signed in, and to
  a device when not. Carries a revision that increases with every change, so a device can tell whether
  what it holds is current.
- **Cart line**: One product in a cart, with a quantity, the price it was added at (for reporting a
  change), and the moment it was added (for stable ordering). Never stores a price to charge — the
  charge always comes from the catalogue at read time.
- **Set-aside line**: A line the shopper has moved out of the payable cart but wants to keep. Same
  shape as a cart line, excluded from every total.
- **Anonymous package**: A grouping of cart lines that will be fulfilled together, shown with an
  ordinal only. Already established; carries no shop identity.
- **Pending change**: A change the shopper has made that the platform has not yet accepted. Carries
  its own identity so applying it twice is impossible, and a status the shopper can see.
- **Promotional code**: An operator-created code with a type (percentage or fixed amount), a value, a
  validity window, an overall usage cap, a per-shopper usage cap, a minimum spend, and an enabled or
  disabled state. Attributable to the operator who created or last changed it.
- **Promotional code redemption**: The record that a specific shopper used a specific code on a
  specific paid order. The basis of both usage caps, and the reason a code cannot be counted twice.
- **Cart discount**: The platform's computed reduction for the currently applied code — recomputed
  whenever the cart changes, never stored as a client-supplied figure.
- **Order minimum policy**: The operator-configured minimum payable amount required before checkout.
- **Reorder outcome**: What happened when a past order was pushed back into the cart — what was added,
  and what could not be, in aggregate and without shop identity.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A cart of 3 or more items survives a force-quit and a device restart with identical
  items, quantities and order, on both mobile platforms and on the web storefront — 10 out of 10
  attempts.
- **SC-002**: An item added on one surface by a signed-in shopper is visible on the other surface
  within 5 seconds of opening the cart there, with no manual refresh gesture.
- **SC-003**: For a guest cart and an account cart that overlap, signing in yields the union of both
  with the greater quantity on overlapping lines, losing nothing; repeating the sign-in five times
  leaves quantities unchanged.
- **SC-004**: Two devices making conflicting changes to the same line converge on one identical cart on
  both within 5 seconds of each opening the cart — 10 out of 10 attempts, with no summed quantity and
  no resurrected line.
- **SC-005**: A quantity change is visible in the line, the total and the cart count within 100 ms of
  the tap, with no loading indicator; ten rapid taps settle on the correct final quantity and result in
  no more than two requests to the platform.
- **SC-006**: Changes made with connectivity disabled are applied exactly once when it is restored —
  verified over 10 trials with no duplicated or lost quantity.
- **SC-007**: An item made unavailable while in the cart is flagged in the cart, excluded from the
  total, and cannot be paid for; a cart of only unavailable items offers no checkout.
- **SC-008**: A price change on an item in the cart is surfaced with the previous amount, and the
  amount charged always equals the platform's computed total — verified for both a rise and a fall.
- **SC-009**: An item set aside stays set aside across a restart and across devices for a signed-in
  shopper, contributes nothing to any total, and returns to the cart at its current price.
- **SC-010**: Clearing the cart requires an explicit confirmation, empties the cart completely, and
  leaves set-aside items untouched.
- **SC-011**: Reordering a past order of 5 items where 2 are unavailable adds exactly the 3 available
  items and reports exactly 2 as unaddable; reordering twice never doubles quantities.
- **SC-012**: Every invalid promotional-code case — unknown, not started, expired, disabled, cap
  reached, already used by this shopper, below minimum, not applicable — is refused with the correct
  specific reason, 8 for 8.
- **SC-013**: The amount charged for a cart with an applied code equals the discounted total the cart
  displayed, to the cent, and the code's usage count increases by exactly 1 per paid order even when
  payment is attempted repeatedly.
- **SC-014**: A cart below the configured minimum states the shortfall and offers no checkout; a
  checkout attempted anyway is refused by the platform.
- **SC-015**: Per-line quantity and cart-size ceilings hold when exceeded directly, via reorder, and
  via a client that ignores them — the platform refuses or clamps in all three cases.
- **SC-016**: An abandoned checkout leaves the cart byte-for-byte as the shopper left it; a paid order
  empties only the purchased items and leaves set-aside items in place — 5 for 5 attempts each.
- **SC-017**: An adversarial review of every cart string — notices, refusals, reorder reports, code
  reasons, minimum messages — finds no shop name, shop count, or location, on either surface.
- **SC-018**: Both customer surfaces offer every capability in this specification, recorded as parity
  in the customer capability register with no column left outstanding.
- **SC-019**: A shopper can go from opening a saved cart to placing the order without re-adding a
  single item — measured end to end on a real device, on both platforms.
- **SC-020**: An operator can take a promotion from nothing to live and back off again entirely from the
  back-office console — create, verify a shopper redeems it, watch the usage count rise, disable it,
  confirm the next shopper is refused — with no direct data access at any point.
- **SC-021**: Every invalid code definition — duplicate, inverted window, non-positive value, percentage
  above 100, negative cap — is refused by the console with the specific reason, 5 for 5, creating
  nothing; and a used code cannot have its type or value rewritten, nor be deleted.

---

## Assumptions

- **The platform tracks no stock.** Availability is the catalogue's published status and nothing more.
  This slice promises no reservation, no "only N left", and no holding of inventory; those need an
  inventory capability of their own.
- **Item notes and substitution preferences are out of scope**, by explicit decision, even though the
  fulfilment flow has a shortfall path that would eventually consume them. They are a later slice.
- **One currency.** The platform runs a single currency, so no cart ever mixes currencies and no
  conversion is required.
- **Sign-in is required only to check out.** A guest builds a cart freely; the account cart begins to
  exist at sign-in.
- **The minimum order value applies to the whole cart**, not per anonymous package. A per-package
  minimum is a plausible future refinement and is deliberately not attempted here, because it
  complicates the shopper's mental model of one Effy cart with one total.
- **The back-office console is a third surface in this slice** (resolved FR-066). It gains a promotions
  management area, built on the console's existing conventions; nothing else about the console changes.
  Effy's internal audiences are employees, so promotions management is an internal capability with no
  customer-facing administration anywhere.
- **At most one promotional code per cart.** Stacking, automatic promotions, free-delivery codes,
  product-specific or category-specific codes, and first-order-only codes are out of scope; the code
  model is deliberately the simplest one that is honestly enforceable.
- **Set-aside items are available to guests too**, held on the device, and merge on sign-in the same
  way cart lines do.
- **No cart expiry.** Carts persist indefinitely and are re-priced on read. Abandoned-cart reminders
  and recovery messaging belong to the notifications capability, not here.
- **The delivery step is unchanged.** This slice touches what the cart holds and what it costs before
  delivery; the quote, the address flow, and payment remain as they are, except that they must now read
  the platform's cart and its discount rather than anything the client supplies.
- **Order history already exists** and is the source for reorder; no new order data is introduced by
  this slice beyond recording a discount and a redemption against an order.
- **The existing anonymous-package split is correct** and is carried forward unchanged.
- **Telemetry for cart events** follows the platform's existing position: web analytics is in place;
  mobile analytics remains deferred platform-wide and this slice does not resolve that.
