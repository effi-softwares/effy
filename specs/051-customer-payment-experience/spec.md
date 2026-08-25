# Feature Specification: Customer Payment Experience

**Feature Branch**: `051-customer-payment-experience`

**Created**: 2026-08-25

**Status**: Draft

**Input**: User description: "Customer Payment Experience — rebuild the checkout payment step on customer-web and customer-mobile so that paying is its own focused screen carrying no repeated order content beyond the exact amount due; offer every payment option the platform can actually accept in Australia (card, Apple Pay, Google Pay, Link, and the buy-now-pay-later options Klarna, Zip and Afterpay); let a returning shopper pay with a card they have already used and choose whether to keep a new one; stop asking for billing details the platform already holds (country, postcode, name); and present all of it in Effy's own interface and design language rather than the payment provider's default UI, in both light and dark appearance, at parity across web and mobile."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Pay by card, on a page that is only about paying (Priority: P1)

A shopper has finished choosing an address and a delivery speed and now wants to hand over money. They
reach a screen whose entire job is that. It states one number — the exact amount that will be charged —
and then asks for the fewest details that can complete the payment: a card number, an expiry and a
security code. Nothing else on the screen restates the basket, the address or the delivery choice,
because the shopper just confirmed all of it and a second telling invites a second review rather than a
payment. The screen looks and reads like the rest of Effy — same typeface, same controls, same
appearance setting — rather than like a form borrowed from somewhere else.

**Why this priority**: This is the whole conversion event. Every other story on this list is an
optional route to the same outcome; this one is the outcome. It also removes three fields the platform
was asking for and already knew the answers to, which is the largest single reduction in work the
shopper has to do. Shipping only this story is a complete, releasable improvement.

**Independent Test**: Reach the payment step with a priced basket, enter card details, and complete a
payment. Verifiable on its own: the order reaches a paid state, the fields asked for are exactly three,
and no basket line, address or delivery row appears anywhere on the screen.

**Acceptance Scenarios**:

1. **Given** a shopper on the payment step with a serviceable address and a priced basket, **When** the
   screen loads, **Then** it shows the exact amount that will be charged, stated as one figure, and no
   basket lines, delivery address or delivery-speed control.
2. **Given** the shopper is paying by card, **When** they look at the card form, **Then** it asks for a
   card number, an expiry and a security code, and does NOT ask for a country, a postal code or a name
   on the card.
3. **Given** the shopper completes the card details, **When** they confirm payment, **Then** the amount
   charged equals the amount that was shown, to the cent, with no figure added or changed after
   confirmation.
4. **Given** the shopper has set their appearance to dark, **When** they reach the payment step,
   **Then** every element of the screen — including the fields where card details are typed — renders
   in the dark appearance, with no light-mode panel embedded in it.
5. **Given** the shopper is on the payment step, **When** they compare it to any other Effy screen,
   **Then** the typeface, control heights, corner radii, field shape, focus treatment and spacing are
   the platform's own, not a third party's defaults.
6. **Given** the shopper wants to change something about the order, **When** they look for a way back,
   **Then** one clearly-labelled route returns them to the checkout step they came from, with the
   basket intact.

---

### User Story 2 - Pay in one tap with a wallet (Priority: P2)

A shopper arrives at the payment step on a device that already holds their card — an iPhone, an Android
phone, a browser signed in to a saved-card service. Rather than typing sixteen digits on a phone
keyboard, they authenticate with their face, their fingerprint or a single confirmation, and the
payment completes. The options offered are only the ones that device can actually complete.

**Why this priority**: It is the single biggest reduction in effort available on a phone, and mobile is
where card entry hurts most. It ranks below card entry because it can never be the only route — a
shopper on an unsupported device must always have a way to pay — but above every other story because it
removes the most work for the most people.

**Independent Test**: Open the payment step on a device with a wallet configured, confirm the wallet
option appears, complete a payment through it, and confirm the order reaches a paid state without any
card details being typed.

**Acceptance Scenarios**:

1. **Given** a shopper on a device with a supported wallet configured, **When** the payment step loads,
   **Then** the wallet options that device can complete are offered before, and more prominently than,
   the card form.
2. **Given** a shopper on a device with no wallet configured, **When** the payment step loads, **Then**
   no wallet option is shown and the card form is the first thing they see, with no empty space, broken
   control or explanatory apology where the wallet would have been.
3. **Given** the shopper pays with a wallet, **When** the wallet returns a success, **Then** the order
   reaches a paid state and the shopper sees the same confirmation as any other route.
4. **Given** the shopper opens a wallet and dismisses it without paying, **When** they return to the
   payment step, **Then** nothing has been charged, the basket is intact, and they may choose any
   payment option including the same wallet again.

---

### User Story 3 - Pay with a card already used, and decide whether to keep a new one (Priority: P3)

A shopper who has bought before should not retype a card they have already given. On reaching the
payment step they see the cards they chose to keep, identified well enough to tell apart — the network,
the last four digits and the expiry — with their usual one already selected. A shopper paying with a new
card is asked, once and plainly, whether to keep it for next time, and their answer is respected: a card
they did not agree to keep is not kept.

**Why this priority**: It compounds — its value grows with each order a shopper places, and it is what
turns a weekly grocery shop from a typing exercise into two taps. It sits below wallets because a
shopper without a stored card loses nothing, and because it is the only story here that requires the
platform to hold a new piece of information about a person.

**Independent Test**: Pay once with a new card and agree to keep it; return to the payment step in a new
session and confirm the card is offered, is selected by default, and completes a payment without any
detail being retyped.

**Acceptance Scenarios**:

1. **Given** a shopper with at least one kept card, **When** the payment step loads, **Then** their kept
   cards are listed with network, last four digits and expiry, and one is already selected.
2. **Given** a shopper with kept cards, **When** they choose to use a different card instead, **Then**
   the card form appears and the kept cards remain available to switch back to.
3. **Given** a shopper paying with a new card, **When** they are offered the choice to keep it, **Then**
   the choice is explicit, its meaning is stated in plain words, and declining it completes the payment
   normally.
4. **Given** a shopper declined to keep a card, **When** they return for a later order, **Then** that
   card is NOT offered and they are not asked to explain why.
5. **Given** a shopper has a kept card that has since expired, **When** the payment step loads, **Then**
   the card is shown as unusable with the reason stated, and is not selectable.
6. **Given** a shopper removes a kept card, **When** they return for a later order, **Then** it is no
   longer offered on any surface.

---

### User Story 4 - Pay over time (Priority: P4)

A shopper doing a large grocery shop wants to spread the cost. The payment step offers the pay-over-time
options Effy can actually accept, each stating what the shopper is agreeing to — how many payments, how
much each, and whether interest applies — before they commit to it. Choosing one hands them to that
provider and brings them back to Effy when they are done.

**Why this priority**: It is a genuine reason a basket gets abandoned, and grocery baskets are exactly
the size where paying in instalments changes the decision. It ranks last of the payment routes because
it serves fewer shoppers than card or wallet, adds a provider hand-off that every other route avoids,
and depends on account eligibility outside the team's control.

**Independent Test**: Choose a pay-over-time option on a qualifying basket, complete it at the provider,
return, and confirm the order reaches a paid state with the full amount recorded against it.

**Acceptance Scenarios**:

1. **Given** a basket that qualifies, **When** the payment step loads, **Then** each available
   pay-over-time option states the number of payments, the amount of each, and whether interest applies,
   before the shopper selects it.
2. **Given** a basket that does not qualify for a pay-over-time option (for example, it is below that
   provider's minimum), **When** the payment step loads, **Then** that option either is not offered at
   all or is shown as unavailable with the reason stated — never offered and then refused after the
   shopper commits.
3. **Given** the shopper chooses a pay-over-time option, **When** they are handed to that provider,
   **Then** they can tell they are leaving Effy and will return, and the amount presented to them equals
   the amount Effy showed.
4. **Given** the shopper completes the payment at the provider, **When** they return to Effy, **Then**
   the order reaches a paid state and the receipt records the full amount as paid.
5. **Given** the shopper abandons the payment at the provider, **When** they return to Effy, **Then**
   nothing has been charged, the basket is intact, the reason is stated, and every payment option is
   available again.

---

### User Story 5 - Know what happened when a payment does not go through (Priority: P5)

Payments fail, and a shopper who is told only that "something went wrong" has no way to decide whether
to wait, try a different card, or give up. Every refusal on this screen names what happened and what the
shopper can do about it, and none of them costs the shopper their basket.

**Why this priority**: It has no standalone value — there is nothing to fail until the routes above
exist — but it is what stops a failed payment becoming a lost customer, and it is where the current
experience is weakest. It is listed separately because it is testable and shippable on its own once any
one route exists.

**Independent Test**: Force each failure — a declined card, a payment abandoned at a provider, a payment
needing the bank's approval, a lost connection mid-payment — and confirm that each produces a distinct,
actionable message and that the basket survives all four.

**Acceptance Scenarios**:

1. **Given** the shopper's card is declined, **When** the refusal returns, **Then** they are told the
   card was declined, told that nothing was charged, and offered another way to pay — and the basket is
   unchanged.
2. **Given** the shopper's bank requires them to approve the payment, **When** that step begins, **Then**
   they are told their bank will ask them to confirm and that they will be returned to Effy.
3. **Given** the shopper's connection drops after they confirm but before Effy hears back, **When** they
   return to the payment step, **Then** they are never charged twice for the same order, whatever they
   do next.
4. **Given** the shopper presses the pay control more than once, **When** the second press lands,
   **Then** it does not start a second payment.
5. **Given** any refusal, **When** the message is shown, **Then** it names the cause in words a shopper
   can act on, and never reads only "something went wrong" or shows a provider's raw error code.

---

### Edge Cases

- **The amount changes between reaching the payment step and paying.** A price, a delivery fee or a
  promotion can move while a shopper is typing. What is charged must equal what was last shown; if the
  figure changes, the shopper is told and re-confirms rather than being charged the new amount silently.
- **The shopper leaves the payment step open for a long time.** A stale amount must not be payable.
- **A kept card is removed or expires between sessions**, or is removed on one surface while the other
  surface is open.
- **A wallet is offered on a device that cannot complete it**, or the wallet is dismissed, times out, or
  returns an ambiguous result.
- **A pay-over-time provider returns the shopper to Effy without a clear outcome** — neither obviously
  paid nor obviously abandoned.
- **The shopper returns to the payment step after already paying** — by browser back, a stale tab, or a
  re-opened notification — and must not be able to pay twice for one order.
- **A payment succeeds but Effy has not yet been told.** The shopper must not be shown a failure for a
  payment that went through.
- **The device is offline** when the shopper presses pay, or goes offline mid-payment.
- **The shopper switches appearance** (light/dark/follow-system) while on the payment step.
- **A shopper using a screen reader or keyboard only** must be able to reach, understand and complete
  every payment route, including choosing between methods and kept cards.
- **A shopper whose account has been barred** reaches the payment step.
- **No payment method is available at all** for a device and basket combination.
- **The basket empties or becomes unpurchasable** (an item goes out of stock) while the shopper is on
  the payment step.
- **Text is enlarged to the largest supported setting**, or the screen is very narrow, and every method
  row, field and control must remain usable and unclipped.

## Requirements *(mandatory)*

### Functional Requirements

#### The payment step and what it shows

- **FR-001**: The payment step MUST be a distinct step reached after the shopper has confirmed address
  and delivery, and MUST NOT be merged into that earlier step.
- **FR-002**: The payment step MUST state the exact total the shopper will be charged, including all
  taxes and delivery, before any payment is authorised.
- **FR-003**: The payment step MUST NOT restate basket lines, the delivery address, the billing address
  or the delivery-speed choice. The amount due is the only order-derived content permitted on it.
- **FR-004**: The payment step MUST provide exactly one clearly-labelled route back to the preceding
  checkout step, and taking it MUST leave the basket and every prior choice intact.
- **FR-005**: The amount charged MUST equal the amount last shown to the shopper, to the cent. If it
  changes for any reason, the shopper MUST be shown the new amount and MUST re-confirm before being
  charged.
- **FR-006**: Effy MUST determine every figure charged. A figure supplied by the shopper's device MUST
  never be trusted as the amount to charge.

#### Which payment options are offered

- **FR-007**: The payment step MUST offer card payment on every device and in every supported browser.
  Card MUST always be reachable as a fallback when no other option is available.
- **FR-008**: The payment step MUST offer one-tap wallet payment where the shopper's device and browser
  can complete it, and MUST place those options ahead of the card form.
- **FR-009**: The payment step MUST offer the pay-over-time options Effy is eligible to accept for the
  shopper's country and the basket's amount.
- **FR-010**: The payment step MUST NOT offer any option Effy cannot accept, and MUST NOT offer an
  option that will be refused after the shopper commits to it.
- **FR-011**: Where an option exists but is unavailable for this shopper, device or basket, the step
  MUST either omit it entirely or show it as unavailable **with the reason stated**. An option that
  disappears without explanation is indistinguishable from a defect.
- **FR-012**: Each pay-over-time option MUST state the number of payments, the amount of each and
  whether interest applies, before the shopper selects it.
- **FR-013**: The set of options offered MUST be governed by configuration rather than by code changes,
  so that enabling or disabling one does not require a release.

#### What the shopper is asked for

- **FR-014**: The card form MUST ask only for the details the platform does not already hold: the card
  number, the expiry and the security code.
- **FR-015**: The payment step MUST NOT ask the shopper for a country, a postal code or a name on the
  card. Effy already holds a verified billing address and the shopper's name and MUST supply them
  itself when authorising the payment.
- **FR-016**: The billing details Effy supplies MUST be the billing address the shopper confirmed at
  checkout — the delivery address where the shopper did not diverge, and the divergent billing address
  where they did.
- **FR-017**: Removing these fields MUST NOT reduce the information sent to the shopper's bank for
  authorisation.

#### Cards a shopper keeps

- **FR-018**: A shopper MUST be able to pay with a card they previously chose to keep, without retyping
  any of its details.
- **FR-019**: Kept cards MUST be listed with enough detail to tell them apart: the network, the last
  four digits and the expiry date.
- **FR-020**: A card MUST be kept ONLY where the shopper explicitly agreed to keep it, in plain words,
  at the time they paid with it. Silent retention is prohibited.
- **FR-021**: Declining to keep a card MUST complete the payment normally and MUST NOT be re-asked as a
  condition of paying.
- **FR-022**: One kept card MUST be selected when the payment step loads, and the shopper MUST be able
  to change that selection before paying.
- **FR-023**: A kept card that can no longer be used (expired, or withdrawn by the issuer) MUST be shown
  as unusable with the reason, and MUST NOT be selectable.
- **FR-024**: A shopper MUST be able to remove a kept card, and a removed card MUST stop being offered
  on every surface. Removal MUST be available both inline at the payment step and from a payment-methods
  screen in the account area (Clarification Q1).
- **FR-024a**: The account area on both surfaces MUST offer a payment-methods screen listing the
  shopper's kept cards with network, last four digits, expiry, default status and, where a card is
  unusable, the reason. It MUST sit alongside the existing address book.
- **FR-024b**: Removing the card that was the default MUST leave a usable default selected where another
  kept card exists, and MUST fall back to the card form where none does.
- **FR-025**: Effy MUST NOT store, log or transmit a full card number, security code or magnetic-stripe
  data at any point, on any surface, in any environment. Effy holds only a reference to a card held by
  the payment provider.
- **FR-026**: A shopper's kept cards MUST be visible only to that shopper, and MUST be reachable only
  with that shopper's own credentials.
- **FR-027**: Deleting or barring a customer account MUST remove that shopper's kept cards.

#### How it looks and behaves

- **FR-028**: Every part of the payment step that Effy is permitted to draw MUST be drawn by Effy, in
  the platform's own design language: typeface, control shape and height, corner radii, field styling,
  focus treatment, spacing and error copy.
- **FR-029**: Where a payment provider's own interface must be used — because card details may not pass
  through Effy, or because a provider's brand rules require their own button — it MUST be styled to
  match the platform's design language as closely as that provider allows, and MUST follow the
  shopper's appearance setting.
- **FR-030**: The payment step MUST render correctly in light and dark appearance and MUST follow the
  shopper's Light / Dark / Follow-System choice, changing with it live.
- **FR-031**: Payment-provider brand marks (card networks, wallets, pay-over-time providers) MAY be
  shown in their own brand colours. This is an asset role, not a UI accent: Effy's own controls, icons,
  text and surfaces on this step MUST remain monochrome. **This requires the design principle's
  third-party-mark exception to be widened from sign-in marks to third-party marks generally — see
  Dependencies.**
- **FR-032**: Brand marks MUST be reproduced in accordance with each provider's published asset and
  usage rules.
- **FR-033**: Every interactive element MUST meet the platform's minimum touch-target size and MUST
  remain usable at the largest supported text size and the narrowest supported width.
- **FR-034**: The payment step MUST be completable using a keyboard alone and using a screen reader,
  including choosing between payment methods and between kept cards.
- **FR-035**: The payment step MUST NOT use card-style containers to lay out its content, per the
  platform's layout doctrine.

#### Failure, safety and honesty

- **FR-036**: Every refusal MUST name what happened in words the shopper can act on, and MUST NOT
  present a provider's raw error code or a generic failure message as the only explanation.
- **FR-037**: A failed or abandoned payment MUST leave the basket, the address and the delivery choice
  untouched, and MUST leave every payment option available to try again.
- **FR-038**: A shopper MUST NOT be able to be charged twice for one order, by any sequence of retries,
  double presses, page reloads, browser navigation or provider redeliveries.
- **FR-039**: A payment that has succeeded MUST NEVER be reported to the shopper as failed.
- **FR-040**: Where an outcome is genuinely not yet known, the shopper MUST be told it is being
  confirmed rather than being shown either a success or a failure.
- **FR-041**: The pay control MUST state that it is working while a payment is in progress and MUST NOT
  accept a second submission, and MUST return to a usable state on any outcome, including one that
  leaves the shopper on the payment step.
- **FR-042**: A shopper returning to the payment step for an order that is already paid MUST be taken to
  its confirmation rather than being offered the chance to pay again.
- **FR-043**: The confirmation the shopper sees after paying MUST itemise what was charged, including
  delivery, so that the total can be reconciled against what the payment step showed.

#### Both surfaces

- **FR-044**: Every requirement above MUST hold on both customer surfaces — the web storefront and the
  mobile app — except where a capability does not exist on a platform, in which case the difference MUST
  be recorded in the customer parity register with its reason.
- **FR-045**: A card kept on one surface MUST be offered on the other, for the same shopper.
- **FR-046**: The mobile app MUST follow its platform's native payment conventions where they differ
  from the web.

### Key Entities

- **Amount due**: The single, Effy-determined figure the shopper is being asked to pay, inclusive of
  tax and delivery, valid for a bounded period and re-confirmed if it changes.
- **Payment option**: A way to pay that is offered to this shopper for this basket on this device —
  card, a wallet, or a pay-over-time provider. Carries whether it is available, and if not, why.
- **Kept card**: A card a shopper explicitly agreed to keep, held by the payment provider and referenced
  by Effy. Carries only what is needed to tell it apart and to know whether it still works: network,
  last four digits, expiry, and usability. Belongs to exactly one shopper.
- **Payment attempt**: One try at paying for one order, with an outcome that is exactly one of
  succeeded, failed, abandoned, or not yet known. Repeated attempts for one order can never produce more
  than one charge.
- **Billing details**: The name and address Effy supplies on the shopper's behalf when authorising a
  payment, taken from what they already confirmed at checkout.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper with no stored card can complete a payment by entering exactly three pieces of
  card information, and no more.
- **SC-002**: A shopper with a kept card can complete a payment in **two** interactions from reaching
  the payment step — one to confirm the card, one to pay — typing nothing.
- **SC-003**: A shopper on a device with a wallet configured can complete a payment without typing any
  card information.
- **SC-004**: The payment step displays **no** basket line, delivery address or delivery-speed control.
  Verified by inspection on both surfaces.
- **SC-005**: The amount charged equals the amount displayed in **100%** of completed payments, verified
  across every payment option offered.
- **SC-006**: **Zero** shoppers are charged twice for one order across a test covering double
  submission, retry after timeout, browser back, page reload, and repeated provider notification.
- **SC-007**: **100%** of refusal states present a cause a shopper can act on. No refusal path shows only
  a generic failure message or a provider error code.
- **SC-008**: The payment step renders correctly in light and dark appearance on both surfaces, with no
  region that fails to follow the shopper's appearance setting.
- **SC-009**: Every interactive element on the payment step meets the platform's minimum touch-target
  size, verified by measurement rather than inspection.
- **SC-010**: The payment step can be completed end to end using a keyboard alone, and again using a
  screen reader, on both surfaces.
- **SC-011**: A five-person unmoderated test finds that at least **four of five** shoppers correctly
  state, before paying, what they will be charged and by which method.
- **SC-012**: No full card number or security code appears in any log, stored record, analytics event or
  crash report, in any environment. Verified by sweep.
- **SC-013**: A card the shopper declined to keep is absent from their options on a later order,
  verified on both surfaces.
- **SC-014**: Every payment option offered can be completed successfully at least once in a test
  environment; no option is offered that cannot be completed.
- **SC-015**: Both customer surfaces offer the same payment options and the same kept cards for the same
  shopper, with every difference recorded in the parity register.
- **SC-016**: A shopper who abandons a payment at an external provider returns to find their basket,
  address and delivery choice unchanged, in **100%** of trials.

## Assumptions

- **The shopper is signed in.** Checkout already requires an identified customer, so the payment step
  never serves a guest and kept cards always have an owner.
- **Australia only.** Effy sells in one country and one currency, which is what makes it correct to stop
  asking for a country and to offer only options available to an Australian business and shopper. A
  second country would reopen FR-015.
- **The payment provider is unchanged.** This feature reshapes what Effy asks for and how it looks; it
  does not change who processes the money.
- **Options are limited by account eligibility, not by design.** Some options require the payment
  account to be activated or the provider to grant access. Those that are not yet available are still
  specified here and are turned on by configuration when eligibility arrives (FR-013) — the feature does
  not block on them, and none of them may be shown before they work (FR-010).
- **Effy is paid in full and up front by pay-over-time providers.** The shopper's instalments are between
  them and that provider; Effy's order is paid or it is not.
- **Delayed-settlement bank debit is out of scope.** Methods that confirm days after the shopper pays
  cannot support a fulfilment flow that begins on payment, and a grocery order would sit unpicked.
- **Card details never touch Effy.** They are entered directly into the provider's own fields. This is
  the one place Effy does not draw the interface, and it is not negotiable (FR-025).
- **The confirmation screen and the order record are unchanged in substance**, except for itemising
  delivery on the receipt (FR-043), which is a defect this feature fixes in passing.
- **Basket, pricing, promotions, delivery quoting and address management are unchanged.** This feature
  begins where the amount is already known.
- **Anonymity of fulfilment is preserved.** Nothing on the payment step reveals which shop fulfils any
  part of the order.
- **Analytics on this step is consent-respecting and carries no payment detail** beyond the method
  chosen and the outcome.

## Dependencies

- **A constitution amendment (MINOR) is required before FR-031 can be implemented.** The design
  principle currently permits a third-party mark's own colours for **sign-in marks only**. Payment
  network, wallet and pay-over-time marks are the same asset role but are not covered by that wording.
  The exception must be widened to third-party marks generally, with the same bounds: an asset role,
  never a UI accent, never a design token, never surfaced to the mobile theme. Without the amendment,
  the payment marks must be monochrome and FR-031 is not met.
- **A new piece of stored customer information** is introduced: a reference linking a shopper to the
  cards they have chosen to keep. It is the first such reference the platform holds.
- **Payment-account eligibility** for several options in FR-009 is outside the team's control and is an
  operator action, not a build task.
- **Provider brand asset kits** are required for FR-032 and must be obtained rather than drawn.
- **The customer parity register** must be updated for FR-044.

## Out of Scope

- Changing who processes payments.
- Refunds, partial refunds, cancellations and disputes.
- Saving a payment method without making a payment.
- Recurring payments, subscriptions or scheduled orders.
- Paying with more than one method for one order.
- Gift cards, store credit and loyalty balances.
- Guest checkout.
- Any change to basket, pricing, promotions, delivery quoting or address management.
- The driver, shop and back-office surfaces.

## Clarifications

### Session 2026-08-25

- Q: Where can a shopper remove a card they have kept? → A: **Option B — both.** Removal is available
  inline on the payment step (where an expired card must be dealt with without abandoning checkout) AND
  from a "Payment methods" screen in the account area on both surfaces, which is where shoppers look for
  it and which mirrors the existing address book exactly (`app/(account)/addresses` on web,
  `features/addresses` on mobile).

  ⚠ **Adopted without an explicit answer from the operator** when `/speckit-plan` was run on 2026-08-25.
  It is the recommended option and it is purely additive: choosing Option A instead removes one screen
  per surface (US6 below) and changes nothing else in this spec.

---

### User Story 6 - Manage kept cards from the account (Priority: P6)

A shopper who wants to remove a card, or simply check which cards Effy can charge, should not have to
start a checkout to find out. A "Payment methods" screen in the account area lists the cards they have
kept, shows which one is used by default, and lets them remove any of them — the same shape as the
address book that already lives beside it.

**Why this priority**: It is the lowest-value story here for conversion and the highest for trust: it is
where a shopper goes when they are uneasy. It depends entirely on US3 — there is nothing to manage until
cards can be kept — which is why it is last.

**Independent Test**: With at least one kept card, open the account area, find the payment-methods
screen, remove a card, and confirm it is no longer offered at the payment step on either surface.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper with kept cards, **When** they open the account area, **Then** a
   payment-methods entry sits alongside their addresses and orders.
2. **Given** the payment-methods screen, **When** it loads, **Then** each kept card shows its network,
   last four digits, expiry and whether it is the default, and an unusable card says why.
3. **Given** the shopper removes a card, **When** they confirm the removal, **Then** it disappears from
   the list and is no longer offered at the payment step on either surface.
4. **Given** a shopper with no kept cards, **When** they open the screen, **Then** it explains that
   cards are kept when they choose to keep one while paying, and offers no dead controls.
5. **Given** the shopper removes the card that was the default, **When** they next reach the payment
   step, **Then** another kept card is selected, or the card form is shown if none remain.
