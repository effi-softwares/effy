# Feature Specification: Customer Sign-in & Sign-up — A Stepped Flow

**Feature Branch**: `036-auth-step-flow`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "improve the UI for login and sign up pages. Login: default methods are Email/OTP and Sign in with Google (button only — the full Google feature comes later). A link to sign in with email + password shows the password step next, with forgot-password. Both ways carry a 'don't have an account, Join' link. The OTP screen's UI is broken — it needs a proper 6-digit code field, a login button at the bottom, a timer and a resend trigger, red errors, and lands on home on success. Sign-up mirrors this: Email/OTP + SSO first, a way to reach email/password (email, password, confirm password), and the OTP step. First and last name are NOT asked at the start — they are the LAST step of sign-up in every path. It should read like a step form where we only collect details once the person has successfully signed up. Keep it simple and easy to understand. Research the industry standard first, then examine the current implementation. Do not change the existing style or theme — improve the steps to make it more UX friendly."

---

## Context: what this changes and why

Effy's customer sign-in and sign-up screens ask for everything at once and then hand the person a code screen that does not carry its own weight. Three things are wrong today, and they compound:

1. **The code screen is a dead end.** It shows a bare field and a button. It does not say which address the code went to, it offers **no way to send another code**, and it has **no countdown or expiry hint** — yet its own error copy tells the shopper to *"Ask for a new one"*, an instruction the screen provides no control for. The only escape is to go back and retype the email.
2. **Sign-up asks for a name before the person exists.** First name and last name sit above the email field, so the very first thing a stranger is asked for is personal data, before they have any reason to trust the form.
3. **The alternative credential is presented as a footnote, not a step.** Password is revealed by a small text link that swaps fields in place, with no sense of having moved anywhere.

The remedy is a **step form** in both journeys: one decision per screen, the emailed code as the default route, password as a deliberate second step, and the name asked **last — after the account exists**.

This slice is **presentation and flow only**. It introduces no new credential, no new pool, and no change to how a code is generated, sent, or verified.

### What the research says (summary; full citations belong in the plan)

- **Identifier-first, code-by-default is the mainstream pattern.** Instacart signs customers in with an emailed code and documents no password route at all; Shopify's customer accounts state that "a password isn't required to sign in"; Google, Amazon and eBay all split identifier from credential across two screens.
- **A one-time code field should be ONE input, not six boxes.** The GOV.UK Design System researched this and uses a single input with letter-spacing to separate characters visually — getting the per-digit legibility without the screen-reader and paste problems segmented inputs introduce. This matches the platform's existing shared code field, which already carries a written rule to that effect.
- **Do not auto-submit on the sixth digit.** Effy's codes die after **three** wrong attempts, and three of the four audiences have no password to fall back on. A mistyped last digit that submits itself burns an attempt the shopper never chose to spend. An explicit action at the bottom — which is what was asked for — is also the safer design.
- **Resend belongs on the code screen with a 30–60 second cooldown and a visible countdown.** GOV.UK's guidance additionally auto-resends when a code has expired rather than making the person ask.
- **Collecting the name after verification has real precedent** (Notion, Airbnb and Booking all verify the identifier before asking who you are), and the argument is *perceived effort*, not raw field count — the evidence that fewer fields always converts better is genuinely contested. The mitigation is to make the name step short, obviously final, and impossible to lose.
- **The known hazard of stepped auth is password managers.** Splitting the email and the password across screens breaks fill-and-save unless the email is carried into the credential step in a form the manager can see.

### The constraints this spec must respect (established facts, not choices)

- **A refused code cannot be explained.** On the code sign-in route the platform deliberately cannot tell the shopper apart: a wrong code, an expired code, a superseded code, and a code that was never delivered all look identical, because distinguishing them would disclose whether an account exists. This spec therefore does **not** ask for messages the platform cannot honestly produce.
- **A code that was never sent looks exactly like a code that was sent.** When the per-address hourly limit is hit, or delivery fails, the shopper is still shown the code screen. The **only** honest mitigation available at the UI is a visible resend and a clearly-worded "didn't get it?" path.
- **A wrong code on the first or second attempt raises no error at all.** The platform simply asks for the code again. The screen must read that signal and say so; today the storefront ignores it and navigates a still-signed-out shopper away, showing nothing.
- **A code is valid for five minutes and dies after three wrong attempts.**
- **Google is not connected.** The sign-in provider is configured but switched off, and there is no address for the browser to be sent to. A button that attempted a real Google sign-in today would fail with a generic error.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Sign in with an emailed code, and be able to finish (Priority: P1)

A returning shopper opens sign-in, sees an email field and one obvious action — *email me a code* — and enters their address. The next screen tells them **which address the code went to**, gives them a clear six-digit field, and puts the sign-in action at the bottom where their thumb already is. If the email is slow, a countdown tells them when they can ask for another; when it reaches zero they can. If they type the wrong code, the screen says so in the error colour without wiping what they typed. When the code is right, they land where they were headed.

**Why this priority**: This is the platform's **default and, for most shoppers, only** way in. It is also the journey that is broken today — a shopper whose email is delayed or undelivered has no recovery at all except abandoning the flow. Everything else in this slice is an improvement; this one is a repair.

**Independent Test**: Shipped alone, a shopper can sign in with a code, request a replacement code, recover from a typo, and reach the storefront. Fully testable without touching sign-up, password, or Google.

**Acceptance Scenarios**:

1. **Given** a signed-out shopper on the sign-in screen, **When** they enter their email and choose the code action, **Then** they are moved to a code step that names the address the code was sent to.
2. **Given** the code step, **When** it first appears, **Then** the resend control is unavailable and a visible countdown shows how long until it becomes available.
3. **Given** the countdown has finished, **When** the shopper asks for another code, **Then** a new code is sent, the countdown restarts, and the screen confirms a new code is on its way.
4. **Given** the code step, **When** the shopper enters a correct six-digit code and takes the action at the bottom, **Then** they are signed in and returned to whatever they were doing — or to the home screen if they came to sign in deliberately.
5. **Given** the code step, **When** the shopper submits a code the platform refuses, **Then** an error is shown in the platform's error colour, **and** the digits they typed remain in the field for correction.
6. **Given** the shopper has submitted three codes the platform refuses, **When** the third is refused, **Then** the screen explains the attempt is over and offers to start again with a fresh code, rather than leaving them typing into a dead session.
7. **Given** the code step, **When** the shopper realises they mistyped their email, **Then** an explicit control returns them to the email step **with their address still in the field**.
8. **Given** the shopper pastes a code longer than six digits, **When** it is pasted, **Then** it is **not** silently shortened, and the sign-in action stays unavailable until exactly six digits are present.

---

### User Story 2 - Reach a password as a deliberate second step (Priority: P2)

A shopper who set a password wants to use it. From the first sign-in screen they choose *use a password instead*, and the flow **moves forward a step** to a password screen that already knows their email. Forgot-password lives there, where it is needed. At any point they can go back without retyping anything, and a link to join is present throughout.

**Why this priority**: Password is a real credential route for customers and must not become second-class in practice just because it is second in the ordering. It is P2 because the code route already covers every customer, including those who have a password.

**Independent Test**: A shopper with a password can sign in via the password step, reach password reset from it, and return to the code route — all without the sign-up or name work existing.

**Acceptance Scenarios**:

1. **Given** the first sign-in screen, **When** the shopper chooses the password option, **Then** the flow advances to a password step that carries their email forward and does not ask for it again.
2. **Given** the password step, **When** the shopper goes back, **Then** they return to the first step with the email still populated.
3. **Given** the password step, **When** the shopper cannot remember their password, **Then** a reset link is present on that step and starts the existing reset journey.
4. **Given** the password step, **When** the shopper decides against it, **Then** a control returns them to the code route without retyping the email.
5. **Given** any step of sign-in, **When** the shopper looks for a way to register, **Then** a "don't have an account? Join" link is present.
6. **Given** a password manager, **When** the shopper reaches the password step, **Then** it can fill the credential and, on success, save it against the correct email.

---

### User Story 3 - Create an account in steps, and be asked who you are last (Priority: P3)

A new shopper opens sign-up and is asked for **one thing: an email**. They get a code, confirm it, and only then — with an account that already exists — are they asked what to call them. If they would rather set a password, that is a step they choose, and it asks for the password only; the name still comes last.

**Why this priority**: This is the flow change with the widest blast radius and the most product judgement in it, and it depends on the code step from US1 being right. It is genuinely valuable but not a repair.

**Independent Test**: A new shopper can register through both the code route and the password route, and in both cases is asked for their name as the final screen, with the name reaching their account.

**Acceptance Scenarios**:

1. **Given** the sign-up screen, **When** it first appears, **Then** it asks for an email and offers the code route and Google, and **does not** ask for a name.
2. **Given** the sign-up screen, **When** the shopper chooses to set a password, **Then** the flow advances to a step asking for a password only, with the rules stated before they type and matching the rules the platform actually enforces.
3. **Given** either sign-up route, **When** the emailed code is confirmed, **Then** the account exists and the shopper is taken to a final step asking for their first and last name.
4. **Given** the name step, **When** the shopper completes it, **Then** the name is saved to their account and appears wherever the platform addresses them by name.
5. **Given** any sign-up step, **When** the shopper already has an account, **Then** an "already have an account? Sign in" link is present.
6. **Given** the shopper reaches the name step, **When** they arrive, **Then** they are already signed in — the name step is not a barrier to being an account holder.
7. **Given** the name step, **When** the shopper tries to continue without giving a name, **Then** they are asked for one — the step is required.
8. **Given** a shopper who closed the app or tab on the name step, **When** they return, **Then** they are still signed in, are asked for their name once more, and are shown nothing suggesting their account is broken.
9. **Given** the password route at sign-up, **When** the shopper reaches the password step, **Then** they are asked for the password **once**, with a control to reveal what they typed — and are **not** asked to type it a second time.
10. **Given** a shopper who registered as a guest with items in their basket, **When** sign-up completes by **any** route, **Then** their basket and saved items are carried into the new account.

---

### User Story 4 - See that Google is a way in (Priority: P4)

A shopper who expects to sign in with Google can see that option on both the sign-in and the sign-up screen, in its correct place, without being misled about whether it works yet.

**Why this priority**: Explicitly requested as UI-only, with the working feature deferred to a later slice. Presence has real value — it tells shoppers they will not be forced to invent a password — but it delivers no sign-in, so it ranks last.

**Independent Test**: The control is present and correctly placed on both screens, and choosing it produces an honest, non-alarming outcome rather than a generic failure.

**Acceptance Scenarios**:

1. **Given** the first sign-in screen and the first sign-up screen, **When** they appear, **Then** a Google option is visible alongside the email route, separated from it.
2. **Given** the Google option while the capability is not yet connected, **When** the shopper chooses it, **Then** they are told plainly that this way in is not available yet and are pointed at the email route — **not** shown a generic error.
3. **Given** the Google capability is later connected, **When** it becomes available, **Then** the same control begins working without its position or wording changing.

---

### Edge Cases

- **The email never arrives** (hourly send limit reached, or delivery failed). The shopper sees a normal code screen. The resend control and a plainly-worded "didn't get the email?" note are the only recovery; the screen must not imply the code definitely arrived.
- **The shopper asks for a code repeatedly.** After the platform's hourly ceiling, further requests achieve nothing. The screen must not present an endlessly clickable resend that quietly does nothing.
- **A new code arrives while the old one is on screen.** The older code no longer works. Because the platform cannot say so, the refusal reads as a wrong code — the resend confirmation must therefore make clear that the newest email is the one to use.
- **Two emails arrive out of order.** Same as above; the wording must point at the most recent.
- **The code expires** (five minutes). Indistinguishable from a wrong code on the sign-in route. The screen's recovery is always the same: send another.
- **Back, at every step**, including the device back gesture and the browser back button — must never lose the typed email, and must never leave the shopper on a step whose session is spent.
- **The shopper abandons at the name step.** They already have a working, signed-in account. The step is required, so they are asked again on their next arrival — but they must never be locked out, and the account must never be presented as broken or half-made.
- **The shopper closes the app or tab on the code step** and comes back. The session may be gone; the screen must send them to the start of the flow rather than accepting a code that can no longer be checked.
- **An address is typed with different capitalisation or stray spaces** than last time — it must be treated as the same person.
- **Sign-in is reached from the middle of a purchase.** Success must return the shopper to the purchase, not to home.
- **The shopper has no account and enters an unknown address.** The flow must behave identically to a known address, disclosing nothing.
- **Assistive technology and large text**: the countdown must be announced without stealing focus, and the code field must remain a single labelled control.

---

## Requirements *(mandatory)*

### The code step (shared by every journey that asks for an emailed code)

- **FR-001**: There MUST be **one** code-entry experience, used everywhere the customer is asked to type an emailed code, so that the field cannot behave differently on one screen than another.
- **FR-002**: The code field MUST accept exactly **six digits** and MUST present six visually distinguishable character positions while remaining **a single labelled field** for assistive technology and for autofill.
- **FR-003**: The field MUST request a numeric keypad on touch devices and MUST offer the operating system's one-time-code autofill.
- **FR-004**: Pasting a whole code MUST work. A value longer than six digits MUST NOT be silently shortened — the extra input is a signal something is wrong and must stay visible to the shopper, with the submit action withheld until exactly six digits are present.
- **FR-005**: The step MUST NOT submit itself when the sixth digit is entered. Submission MUST be an explicit action, placed at the **bottom** of the step.
- **FR-006**: The step MUST show the address the code was sent to.
- **FR-007**: The step MUST offer a resend control. It MUST be unavailable for a cooldown period after each send, MUST display a live countdown of the remaining time, and MUST become available when the countdown ends.
- **FR-008**: A successful resend MUST be confirmed on screen, and the confirmation MUST direct the shopper to the **most recent** email.
- **FR-009**: When the platform's limit on how many codes may be sent to one address has been reached, the screen MUST say so rather than offering a resend that achieves nothing.
- **FR-010**: A refusal MUST be shown inline, in the platform's error colour, and MUST NOT clear what the shopper typed.
- **FR-011**: Refusal wording MUST be honest about what the platform can actually tell. On the code sign-in route it MUST NOT claim to know whether a code was wrong, expired, or superseded, and MUST NOT reveal whether an account exists. Where the platform genuinely can distinguish a cause — as it can during sign-up confirmation and password reset — the message MUST say which.
- **FR-012**: When the platform asks for the code again rather than refusing outright, the step MUST tell the shopper the code was not accepted and MUST keep them on the step. It MUST NOT treat this as success.
- **FR-013**: When the attempt allowance is exhausted, the step MUST say the attempt is over and MUST offer a single, obvious way to start again with a fresh code.
- **FR-014**: The step MUST offer an explicit way to correct the email address, returning to the identifier step with the address still populated.
- **FR-015**: The countdown and any refusal MUST be announced to assistive technology without moving focus away from the field.

### Sign-in

- **FR-016**: The first sign-in step MUST offer exactly two ways forward — **email me a code** and **Google** — with the code route as the primary action.
- **FR-017**: Password MUST be reachable from the first step as a clearly-labelled secondary option that **advances the flow to its own step**, rather than changing the current step in place.
- **FR-018**: The password step MUST carry the email forward and MUST NOT ask for it a second time.
- **FR-019**: The password step MUST contain the route to password reset.
- **FR-020**: The password step MUST offer a way back to the code route without retyping the email.
- **FR-021**: Every step of sign-in MUST carry a link to registration, worded as an invitation to join.
- **FR-022**: Moving backwards — by the in-flow control, the device back gesture, or the browser back button — MUST preserve every value the shopper has already typed and MUST NOT strand them on a step whose session is spent.
- **FR-023**: The flow MUST remain usable by password managers across the step boundary: the credential step MUST expose the email in a form a manager can associate with the password it fills and saves.
- **FR-024**: The flow MUST behave identically for an address that has an account and one that does not.
- **FR-025**: On success the shopper MUST be returned to whatever they were doing before sign-in was required. When sign-in was entered deliberately rather than demanded, they MUST land on the home screen.

### Sign-up

- **FR-026**: The first sign-up step MUST ask for an email only, and MUST offer the same two ways forward as sign-in — **email me a code** (primary) and **Google**.
- **FR-027**: The first sign-up step MUST NOT ask for a name.
- **FR-028**: Setting a password MUST be a chosen step that advances the flow, and that step MUST ask for the password only — the email is already known.
- **FR-029**: The password step MUST state the platform's real password rule before the shopper types, and that statement MUST match what the platform actually enforces.
- **FR-030**: The password field MUST permit pasting and MUST offer a reveal control that shows and hides what has been typed. It MUST NOT ask for the password a second time for confirmation — the reveal control is what lets the shopper check it. *(Confirmed 2026-08-05: a "confirm password" field was originally requested and has been deliberately dropped. Feature 012's FR-023 forbids one, the platform's account page already omits it, and the GOV.UK Design System removed theirs on the same reasoning. The existing sign-up screens on both surfaces disagree with each other on this today — web asks for a confirmation, mobile does not — and this feature settles it. No amendment to 012 is needed.)*
- **FR-031**: The code step for sign-up MUST be the same experience as for sign-in (FR-001 … FR-015).
- **FR-032**: A customer's name MUST be collected **after** the account exists, as the **final step** of registration, on **every** route into an account — the code route, the password route, and the federated route when it is connected.
- **FR-033**: The name step MUST collect a first name and a last name.
- **FR-034**: On arrival at the name step the shopper MUST already be signed in — the step completes a profile, it does not gate account creation.
- **FR-035**: The name captured at that step MUST be saved to the customer's account and MUST appear wherever the platform addresses the customer by name, including after leaving and returning.
- **FR-035a**: The name step MUST be completed before the shopper leaves the registration flow — it is required, not skippable. *(Confirmed 2026-08-05.)* Because the account already exists and the shopper is already signed in by this point (FR-034), the step completes a profile rather than gating access. A shopper who abandons the app or browser here MUST NOT be locked out; on their next arrival the platform MUST ask for the name once more before they continue, and MUST NOT present the account as broken or incomplete.
- **FR-036**: Every step of sign-up MUST carry a link to sign-in for a shopper who already has an account.
- **FR-037**: Completing sign-up by **any** route MUST carry a guest's basket and saved items into the new account, exactly as signing in does.

### Google

- **FR-038**: A Google option MUST be present on the first step of both sign-in and sign-up, visually separated from the email route, and using the provider's own mark.
- **FR-039**: While the capability is not connected, choosing it MUST produce a plain, specific explanation that this way in is not available yet, and MUST point the shopper at the email route. It MUST NOT produce a generic failure message.
- **FR-040**: Connecting the capability later MUST NOT require the control to move or be reworded.

### Cross-cutting

- **FR-041**: This feature MUST NOT change the platform's visual language — no new colour, no new typeface, no new spacing or corner scale. The only colour used for a refusal is the platform's existing error colour.
- **FR-042**: Every interactive control introduced or moved by this feature MUST meet the platform's minimum touch-target size.
- **FR-043**: At every step of both journeys the shopper MUST be able to tell where they are in the sequence and that going back is possible.
- **FR-044**: **Both customer surfaces are in scope** — the customer storefront (web) and the customer mobile app — and they MUST offer the same steps, in the same order, with the same wording for the same decisions. *(Confirmed 2026-08-05.)*
- **FR-044a**: The internal operator consoles (back-office, shop-web, shop-mobile) are **out of scope**. They have no sign-up, no password route and no federated route, so almost nothing in this feature applies to them. Where this feature changes a component those consoles also use, it MUST NOT change their behaviour or their wording; if a change to shared behaviour is unavoidable, the plan MUST say so and the consoles MUST be re-verified.
- **FR-044b**: Improving the operator consoles' own code screen — which today has the same missing resend and missing countdown, on audiences that have **no password to fall back on** — is recorded as a follow-on and is NOT delivered here.
- **FR-045**: The number of digits in a code MUST be stated from a single shared definition, never repeated as a literal in copy or in validation on any surface.
- **FR-046**: The parity register for the customer audience MUST be updated to record the state of these journeys on each surface — including correcting entries that are currently stale.

### Key Entities

- **Sign-in attempt**: a person's progress through the sign-in sequence — the address they gave, the route they chose, which step they are on, how many codes they have had refused, and when the next code may be requested. Exists only for the duration of the flow.
- **Registration attempt**: the same for sign-up, plus which route created the account and whether the name step has been completed.
- **Customer name**: the first and last name a customer chooses to be known by, held on their account, and absent until the final registration step supplies it.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper whose first code does not arrive can request another **without leaving the code screen** and without retyping their email — a recovery that is impossible today.
- **SC-002**: A shopper who mistypes one digit can correct that digit and succeed **without re-entering the other five**.
- **SC-003**: A shopper who submits an incorrect code is **never** navigated away from the code screen as though they had succeeded.
- **SC-004**: A new shopper reaches the point of having an account by supplying **one** piece of information — their email address — plus the code.
- **SC-005**: No screen shown before the account exists asks for the shopper's name.
- **SC-006**: In five observed sessions with people who have not seen the flow before, all five reach the code screen without assistance and can say aloud which address the code was sent to.
- **SC-007**: In the same sessions, all five can state, without prompting, how long until they may request another code.
- **SC-008**: A shopper who chooses the password route and then goes back finds their email address still present, in **100%** of attempts, on every surface and by every means of going back.
- **SC-009**: A password manager fills the credential step and saves it against the correct email address, on both a widely-used browser-native manager and one third-party manager.
- **SC-010**: Every refusal message shown on the code step is one the platform can honestly support — verified by walking each cause (wrong code, expired code, superseded code, undelivered code, exhausted attempts) and confirming no message claims knowledge the platform does not have.
- **SC-011**: A code longer than six digits, pasted into the field, is visible in full and cannot be submitted — on every surface.
- **SC-012**: An unknown email address and a known one produce an identical sequence of screens and identical wording throughout.
- **SC-013**: A shopper who signs in from the middle of a purchase returns to that purchase, not to the home screen.
- **SC-014**: A guest with items in their basket keeps every one of them after completing registration by any route.
- **SC-015**: The name a shopper gives at the final step is shown back to them the next time they open the app or site, after a full restart.
- **SC-015a**: A shopper who quits at the name step is still signed in on their return, is asked for their name again, and is never shown a message implying their account failed to be created.
- **SC-015b**: Sign-up asks for a password exactly once on every surface in scope — no screen asks for it to be typed twice.
- **SC-016**: The flow is completable end to end using only a keyboard, and separately using only a screen reader, on every surface in scope.
- **SC-017**: The flow is legible and operable at the platform's largest supported text size and in both light and dark appearance.
- **SC-018**: No colour value, typeface, spacing step or corner radius outside the existing design system appears in the delivered screens — verified by the platform's existing token drift checks passing unchanged.
- **SC-019**: A shopper reaching the third refused code is told the attempt is over and can start again in **one action**.

---

## Assumptions

- **Scope is presentation and flow.** No change is made to how codes are generated, delivered, verified, rate-limited or expired; to the identity pools; or to which credentials the customer audience may use. The code remains six digits and valid for five minutes, with three attempts.
- **Resend cooldown is 30 seconds** — the low end of the 30–60 second industry range, and the value already present in the platform's built-but-unused cooldown helper. The platform's hourly ceiling on codes per address is the harder limit and is unchanged.
- **Landing on success respects intent.** "Go to home" is read as the destination when sign-in was entered deliberately. Where sign-in was demanded mid-task, the shopper returns to that task — this preserves an existing, deliberate behaviour, and overriding it would regress a capability the platform already records as delivered on web.
- **Both customer surfaces move together** (FR-044). Shipping the storefront alone would leave the mobile app with the worse of the two code screens — it shows neither the address nor a countdown, offers no resend, and has no automated coverage of any auth screen at all — and would put a split into the parity register that a later slice has to undo.
- **The two surfaces currently disagree about confirm-password** — the storefront asks for a re-typed password at sign-up, the mobile app does not. This feature settles that on the side the platform's own rules already take (FR-030), so it removes a field from the web sign-up rather than adding one to mobile.
- **Names remain first and last**, as requested, rather than the single "full name" field international naming guidance prefers — because the platform already stores the two parts, greets the shopper by first name, and hands orders to a named person. The trade-off is recorded here rather than silently made.
- **The Google mark is an asset, not a new colour.** Using the provider's own colours in its sign-in mark is the one exception the platform's colour rule already allows.
- **The Google control ships visible-but-not-yet-working**, per the explicit request that the button land now and the capability later. This is a deliberate departure from the existing code's position that an unbacked button is worse than none; FR-039's honest, specific message is the mitigation.
- **Password reset itself is unchanged.** This feature relocates its entry point to the password step and reuses the existing reset journey as-is.
- **Persisting the name after account creation needs work beyond the screens.** The platform's customer record is seeded once, when the account is first seen, and is not refreshed afterwards; the profile-update path does not currently propagate a name back to the identity provider — so a name supplied after sign-up would not reach the place the greeting reads from. FR-035 requires the name to actually appear; closing that gap is in scope for the plan.
- **Two existing defects sit inside these screens and cannot be left standing** by a slice that rewrites them: the storefront treats a not-yet-accepted code as a successful sign-in (FR-012), and sign-up does not merge a guest's basket while sign-in does (FR-037).
- **Telemetry** for these journeys is specified as part of the plan, per the platform's observability principle. Product analytics has never been initialised on the customer storefront, so any event this feature emits is currently unmeasured — the plan must state whether it closes that or records it as a known gap.
- **Verifying the refusal taxonomy (SC-010) depends on an unrun observation** — the exact refusal the platform surfaces when the attempt allowance is exhausted has not been seen live. The plan must schedule that before the copy is finalised.
