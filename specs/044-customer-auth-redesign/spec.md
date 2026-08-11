# Feature Specification: Customer Storefront Authentication — Visual Redesign & Input Repair

**Feature Branch**: `044-customer-auth-redesign`

**Created**: 2026-08-11

**Status**: Draft

**Input**: User description: "as the next spec we need to re design and change the UI of authentication related screen in customer web app. current implementation have some UX issues and Ui isses. so do a good deep dive and find good desgin which is modern and professional. then we can refer that. then understand the current implementation, do a review and identify the bugs we have. (for example: otp screen is not good, no otp fields, email is not validated, we can enter wrong format or we can go forward without typing any, like wise there can be serveral bugs. identify them) then redesign all the authentication related screens (login, register, onboarding, password reset etc...) you need to follow best practices of UI design and follow the theme. create mobile responsive authentication screens. you can take time a do a goood review first."

---

## Context: what this changes and why

The storefront's sign-in, sign-up and password-recovery screens were given their **flow** by slice
036 — one decision per screen, the emailed code first, the name asked last. That flow is right and
this slice does not reopen it.

What 036 did **not** do was give those screens a **look**, or give their inputs a **voice**. They
were assembled from a small set of local primitives written for that slice, and the result is the
only part of the storefront that does not look like the storefront: a bare white column, a
poster-weight all-caps heading over 8-point helper text, three different text alignments on one
screen, and a one-time-code field whose six character positions are drawn as three-pixel hairlines
in the border colour — pushed off-centre against the right edge of the column, with nothing to type
into that a person can see. The operator's screenshot of that screen is the reason this slice exists.

The input behaviour has the same shape of problem. Every field on these screens delegates its
validation to the browser. Nothing is checked as the customer types or leaves a field; nothing is
said in the platform's own error style; nothing stops a syntactically-legal-but-unreachable address
from being accepted, a code being emailed into the void, and the shopper being parked on a code
screen for an inbox that will never receive anything.

**This slice is presentation, validation and responsiveness only.** It introduces no new credential,
no new route through the flow, no new stored data, and no change to how a code is generated, sent or
verified. The step order, the security refusals, the enumeration defences and the copy rules
established by 011, 012, 035, 036 and 037 are **inherited unchanged** and are constraints on this
work, not subjects of it.

### The design reference

The storefront already has an established visual language — General Sans, the monochrome neutral ramp
with an accent that inverts between appearances, pill controls at 44px, image-led merchandising
(039). The auth screens are the one customer surface that inherits none of it. The redesign's job is
to make them read as **the same shop**, at the level of quality the reference platforms set:

- **Uber Eats and Instacart** for the mobile-first stepped identity flow — a full-height column, one
  question per screen, the committing action anchored where the thumb already is, and a code screen
  whose input is the loudest thing on it.
- **Stripe, Shopify and Airbnb** for the desktop treatment — a composed, deliberately narrow form
  column that is *placed* on the page rather than floating in the middle of white space, with the
  brand carrying the other half of a wide window.
- **eBay** — Principle V's named reference for this platform — for the plain-spoken, unfussy field
  and error treatment.
- **GOV.UK** for the mechanics of the code field and for error messaging: one logical input, errors
  stated in words next to the thing that is wrong, and a summary that names what to fix.

The common thread, and the standard this slice is held to: **the customer always knows where they
are, what is wrong, and what to press next** — and the screen looks like it was designed rather than
assembled.

### What is in scope

Every screen a signed-out or newly-registered customer can reach in the storefront's authentication
journey: **sign in** (email step, password step, code step), **sign up** (email step, password step,
code step), **the name step that completes registration**, **password reset** (email, code, new
password), the **federated-return screen**, and the **shared chrome** those screens sit in.

### What is deliberately not in scope

- The mobile apps. `customer-mobile` runs the same journeys and will drift from web until its own
  slice; the parity register records the gap rather than hiding it.
- The two internal consoles (`shop-web`, `back-office`). They share the code field today and must be
  provably undisturbed by this work.
- Google sign-in. It remains a present-but-unavailable route with its existing refusal message; this
  slice restyles the control and does not connect it.
- The flow itself: no step is added, removed or reordered.
- Any change to what the platform will and will not tell a shopper about a refused code.

---

## Defect register — what is wrong today

This is the review the operator asked for. Items marked **[confirmed]** were established by reading
the shipped code; items marked **[to confirm]** are reported or suspected and must be reproduced
against a running build during the plan's baseline before being treated as fact. Non-normative
technical causes are collected in the Appendix so they cannot be lost.

### A. The one-time-code screen

- **D-01 [confirmed] — The code field is invisible.** Its six character positions are drawn as
  hairline rules in the low-contrast border tone against the page ground. There is no box, no fill,
  no placeholder and no caret target a person can identify. The operator's report — *"no otp fields"*
  — is an accurate description of what the screen shows.
- **D-01a [confirmed by measurement — ADDED after the baseline walk] — On desktop the code field
  renders at roughly half its intended size.** Measured character advance implies a ~14px face at
  ≥768px where a 30px one was intended, so the six positions are not merely faint, they are *small*
  as well. This was invisible to code reading and fell out of measuring the rendered geometry; it is
  a large part of why the operator's screenshot reads as an empty screen. See
  [BASELINE.md](BASELINE.md).
- **D-02 [confirmed by measurement] — The code field is not where it appears to belong.** It is
  pushed hard against the right edge of the column while its own label sits at the left, so the label
  and the field it labels do not read as one control. Measured: at 375px it begins 88px inside the
  column and **overflows the column's right edge by 16px**; at 1440px it begins 270px inside and
  overflows by 12px.
- **D-03 [confirmed] — Three alignments on one screen.** The heading and label are left-aligned, the
  code field floats right, and the resend countdown, the spam-folder note and the support line are
  centred. Nothing establishes a reading order.
- **D-04 [confirmed] — The disabled primary action does not look disabled.** Reduced to 60% opacity,
  the near-black action renders as a mid-grey that reads as an ordinary enabled button. A shopper
  presses it, nothing happens, and the screen offers no explanation.
- **D-05 [confirmed] — Two competing error regions.** The screen can show an error owned by the code
  step and, simultaneously, a second error owned by the surrounding journey, rendered *above* the
  Back control and outside the step's layout entirely. Both announce themselves to a screen reader.
- **D-06 [confirmed — RESOLVED BY REMOVAL 2026-08-11] — Three stacked advisory lines under the
  field.** Countdown, spam-folder note and support address were given equal visual weight, and
  together out-massed the input. On operator direction the spam-folder note and the support address
  were **deleted outright** rather than subordinated; only the countdown/resend line remains.

  ⚠ **THIS WITHDRAWS 037's FR-030a, AND THE WITHDRAWAL HAS A COST WORTH STATING.** That escape hatch
  was uniform and unconditional by design: because the platform deliberately cannot tell a shopper
  *"we can't reach that address"* — saying so would answer *"does this person have an Effy account?"*
  to anyone who asked — the support address was the **only** route to a human for someone whose code
  never arrives. It is now absent, and such a shopper has no route out of the code screen except
  abandoning the flow. Recorded as an operator decision rather than an oversight.

  ⚠ `app/(auth)/_components/enumeration.test.ts` still asserts that the escape hatch is rendered
  unconditionally, and now fails. The assertion is not wrong — the requirement behind it was
  withdrawn. Left in place per the no-unit-test direction; flagged here so the failure is not read as
  a regression.
- **D-07 [confirmed] — Nothing indicates work in progress.** Submitting replaces the button's words
  with "Please wait…" and nothing else changes.

### B. Input validation, across every screen

- **D-08 [confirmed live] — No email format check beyond the browser's.** The browser's own rule
  accepts addresses with no dot after the `@`. Such an address is accepted, a code is dispatched to
  it, and the shopper is moved to a code screen for a mailbox that cannot exist. Nothing on the
  platform will ever tell them why — by design, the code screen cannot distinguish "not delivered"
  from "wrong code". **Observed against a running build**: `person@example` produces a real
  `POST` to Cognito from all three email entry points, and on **sign-up it advances the shopper to
  the code step**. See [BASELINE.md](BASELINE.md).
- **D-09 [confirmed] — No inline, platform-styled field errors.** The shared storefront field
  primitive supports an error message under the input; the authentication screens use a *different*,
  locally-written field that has no error slot at all. Every refusal on these screens is therefore
  either a browser-drawn bubble or a block at the top of the form — never a message beside the field
  that caused it.
- **D-10 [confirmed] — Nothing is validated until submit.** No field is checked when the customer
  leaves it, so an error is never raised at the moment it is cheapest to fix.
- **D-11 [PARTIALLY CONFIRMED — amended 2026-08-11 after the baseline walk] — A step can be advanced
  with an empty email, on the password steps only.** The original entry read "empty **or** malformed".
  Walking all ten cases against a running build splits it in two:
  - **Empty, on the first step of each journey** — **not reproduced.** The browser's own enforcement
    blocks it and no request leaves the page. There is no silent block (no
    `An invalid form control … is not focusable` was logged anywhere). The refusal is a browser-drawn
    bubble, which is why nothing appears in the page — easy to miss, but present.
  - **Empty, on the sign-in and sign-up password steps** — **confirmed.** The email field there is
    `readOnly`, and a read-only control is barred from constraint validation altogether, so reaching
    the password step without ever filling the email and submitting produces **"Something went wrong.
    Please try again."** The address never existed; the shopper is told the system failed.
  - **Malformed, everywhere** — **confirmed**; see D-08.

  The register is amended rather than left implying more than was seen. FR-009 is unaffected: it
  replaces the browser's enforcement on every step regardless, and the password steps are where it
  is load-bearing.
- **D-12 [confirmed] — Whitespace-only input satisfies "required".** A single space passes the
  browser's presence check on the name fields.
- **D-13 [confirmed] — No password strength feedback.** The rule is stated once as a hint and never
  reflected back as the customer types; the only signal that a password is too short is that the
  action stays disabled, with nothing saying why.

- **D-22 [confirmed — ADDED during implementation] — Password reset had no resend cooldown at all.**
  Sign-in and sign-up both start the cooldown clock when they send a code; the reset route never did.
  So its code step showed **no countdown** and offered *"Send another code"* immediately and
  repeatedly — against a platform budget of **five sends per address per clock hour**, after which the
  trigger silently refuses while still returning a normal-looking challenge. Three impatient taps
  spend the whole hour, and the shopper then waits for a code that was never sent.

  ⚠ **The test that should have caught this has asserted the countdown since 035, and reaches the code
  step through this very route.** It never ran: Playwright is not part of `pnpm test` — it needs a
  built server, and this repository runs it by hand. The test was right the whole time.

### C. Journey and copy

- **D-14 [confirmed] — After changing or resetting a password the customer is signed out and
  returned to sign-in with no explanation.** Two separate places send the shopper to sign-in carrying
  a reason for the interruption, and **nothing on the sign-in screen reads it**. The customer
  experiences a successful password change as being unexpectedly logged out.
- **D-15 [confirmed] — The name step offers no way past it.** It is documented as a step that must
  never gate access, yet the only exit for a customer who does not want to give a name is to close
  the tab. What is meant to be a courtesy reads as a wall.
- **D-16 [confirmed] — The loading placeholder does not resemble the form it replaces.** The screen
  visibly re-lays-out when the real form arrives.

### D. Layout, responsiveness and theme

- **D-17 [confirmed] — The screens do not use the storefront's own type, control or field
  primitives.** They re-declare their own, with different padding, a different field ground and a
  different focus treatment, so they are already visibly out of step with every other page and will
  drift further with each change to either copy.
- **D-18 [confirmed] — The heading treatment is wrong for the content.** These screens use the
  poster-weight all-caps display face that the storefront reserves for merchandising. Applied to
  "Enter your code" it is loud, and it is the same size on a 320px phone as on a desktop.
- **D-19 [confirmed] — The name step is a two-column grid at every width.** On a small phone that
  gives each name field roughly half a cramped column.
- **D-20 [confirmed] — A wide window is mostly empty.** The form is a narrow column centred in an
  otherwise blank page; nothing occupies or composes the rest of the viewport.
- **D-21 [NOT REPRODUCED — withdrawn as a defect 2026-08-11] — The bottom-anchored action and the
  on-screen keyboard.** Measured at 360×640, at 360×340 (a keyboard-reduced viewport) and at 740×360
  (short landscape), on the sign-in step and on the code step at two widths: **the committing action
  was inside the viewport without scrolling in every case.** The document does overflow in the two
  short viewports, so the *footer* link falls below the fold — but the action does not.

  FR-027 is retained, with its justification corrected: it is a **robustness measure** for real
  devices with real keyboards (`vh` genuinely does not shrink when a keyboard opens), not a fix for
  an observed failure. A requirement that claims to fix something nobody saw fail is a requirement
  nobody can evaluate.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Enter a code on a screen that shows me where to type (Priority: P1)

A shopper who has just asked for a sign-in code arrives at the code screen. The six positions the
code goes into are the most prominent thing on the page — visible, obviously interactive, and
directly under their own label. Typing fills them one position at a time. The action that signs them
in is unmistakably unavailable until six digits are present, and unmistakably available the moment
they are. If the code is refused, the reason appears beside the field in the platform's error
treatment, and the digits stay put.

**Why this priority**: This is the screen the operator reported, and it terminates **every**
authentication journey on the platform — sign-in, registration and recovery all end here. A shopper
who cannot see where to type cannot get in at all, and for most customers there is no password to
fall back on.

**Independent Test**: Shipped alone, a person on a phone and on a desktop can find the code field
without being told where it is, type six digits, watch each one land in its own position, see the
action become available exactly at the sixth, recover from a refusal without retyping, and reach the
storefront.

**Acceptance Scenarios**:

1. **Given** the code screen on any supported width, **When** it is shown, **Then** the six character
   positions are drawn with a visible boundary and a fill distinct from the page ground, and are the
   largest interactive element on the screen.
2. **Given** the code screen, **When** the customer types, **Then** each digit appears in its own
   position, in order, with the next empty position visibly indicated.
3. **Given** fewer than six digits are present, **When** the customer looks at the committing action,
   **Then** it is visibly and unambiguously unavailable — distinguishable from the available state
   without relying on colour alone — and the screen states what is still needed.
4. **Given** exactly six digits are present, **When** the customer looks at the committing action,
   **Then** it is available, and pressing Enter in the field does the same thing as pressing it.
5. **Given** a submitted code is refused, **When** the refusal arrives, **Then** exactly one error is
   shown, it is announced once, it sits with the field it concerns, and the digits already typed
   remain.
6. **Given** the field and its label, **When** they are viewed, **Then** they share one alignment and
   read as a single control.
7. **Given** a submission is in flight, **When** the customer looks at the screen, **Then** progress
   is indicated and the action cannot be pressed a second time.
8. **Given** a code longer than six digits is pasted, **When** it lands, **Then** it is not silently
   shortened, the excess is visible, the action stays unavailable, and the screen says how many digits
   an Effy code has.
9. **Given** the code screen, **When** the resend countdown, the spam-folder note and the support line
   are shown, **Then** they are subordinate to the field and to the committing action, and do not
   collectively occupy more of the screen than either.

---

### User Story 2 - Be told about a bad email before a code is sent into the void (Priority: P1)

A shopper mistypes their address, or presses continue with the field empty. The screen tells them, in
words, beside the field, before anything is sent — not with a browser tooltip, and not by moving them
to a code screen for a mailbox that does not exist. The message says what is wrong and what to do.
Once corrected, the message clears.

**Why this priority**: A code sent to an unreachable address produces the single worst failure the
platform can produce — a shopper waiting on a screen that will never resolve, being told nothing,
because the platform deliberately cannot distinguish an undelivered code from a wrong one. Preventing
the bad address is the only place this is fixable. It is P1 alongside US1 because it is the entry
point to every journey.

**Independent Test**: On each of the screens that accepts an email, an empty submission and a
malformed submission are both refused with a visible message beside the field, and no code is
requested. Fully testable without any change to the code screen.

**Acceptance Scenarios**:

1. **Given** an email field, **When** the customer submits it empty, **Then** the step does not
   advance, no code is requested, and a message beside the field says an email address is needed.
2. **Given** an email field, **When** the customer enters a value that is not a plausible email
   address, **Then** the step does not advance, no code is requested, and a message beside the field
   says the address does not look right.
3. **Given** an email field containing a malformed address, **When** the customer leaves the field,
   **Then** the message appears at that moment rather than waiting for submission.
4. **Given** a field showing an error, **When** the customer corrects the value, **Then** the error
   clears without needing another submission.
5. **Given** a submission is refused for validation, **When** it is refused, **Then** focus moves to
   the first field that needs attention and the error is announced.
6. **Given** any field on any of these screens, **When** it is submitted containing only whitespace,
   **Then** it is treated as empty.
7. **Given** a password field with a stated minimum, **When** the customer types, **Then** the screen
   reflects whether the requirement is met, rather than only disabling the action.
8. **Given** any refusal on any of these screens, **When** it is displayed, **Then** it uses the
   platform's error treatment — never a browser-drawn bubble.

---

### User Story 3 - Screens that look like Effy, on any device (Priority: P2)

A shopper arriving at sign-in from the storefront sees the same shop: the same typeface, the same
control shapes, the same neutral palette, the same regard for spacing. On a phone the screen is a
comfortable full-height column with the action in the thumb's reach. On a laptop the form is
composed on the page rather than stranded in white space. Nothing depends on colour to be
understood.

**Why this priority**: This is the redesign the operator asked for and the reason the slice is
titled as it is. It is P2 rather than P1 only because a shopper can complete every journey once US1
and US2 land; this is what makes those journeys feel like they belong to a real business.

**Independent Test**: Every screen in the journey can be walked at 320px, at tablet width and at a
wide desktop, and compared side by side with the storefront home for a consistent identity. No
behavioural change is required to test it.

**Acceptance Scenarios**:

1. **Given** any authentication screen, **When** it is compared with the storefront's other pages,
   **Then** its typography, control shapes, field treatment, focus treatment and spacing are drawn
   from the same shared definitions rather than restated locally.
2. **Given** a 320px-wide phone, **When** any screen in the journey is shown, **Then** no content is
   clipped, nothing scrolls horizontally, and every interactive target meets the platform's minimum
   touch size.
3. **Given** a phone, **When** the committing action is shown, **Then** it is reachable without
   scrolling past the fields, including while a software keyboard is open.
4. **Given** a wide window, **When** any screen is shown, **Then** the form column is composed as part
   of a deliberate layout rather than left as a narrow column in an empty page.
5. **Given** the storefront's light appearance, **When** every screen and every state — including
   errors, unavailable actions and the code positions — is shown, **Then** all of them remain legible
   and meet the platform's contrast rule, and every colour used resolves from a design-system token
   rather than a literal. ⚠ Amended 2026-08-11: this scenario said "Given dark mode"; the storefront
   has none, by operator decision (see FR-029).
6. **Given** any screen, **When** its heading is shown, **Then** it is sized for its width and does not
   dominate the fields beneath it.
7. **Given** the name step on a small phone, **When** it is shown, **Then** its fields are laid out so
   each is comfortably usable.
8. **Given** a page still loading its form, **When** the placeholder is shown, **Then** it occupies
   approximately the same shape as the form that replaces it.
9. **Given** the internal consoles, which share the code control, **When** they are viewed after this
   work, **Then** they are unchanged.

---

### User Story 4 - Know why I am being asked to sign in again (Priority: P3)

A shopper who has just set a new password is returned to sign-in. The screen tells them their
password was changed and that signing in again is expected. A shopper who was sent to sign-in from
somewhere else in the shop is told why, and lands back where they were.

**Why this priority**: It is a small amount of copy that removes a genuinely alarming moment — a
successful security action currently presents as an unexplained logout. P3 because it affects one
journey rather than all of them.

**Independent Test**: Complete a password reset and observe the sign-in screen; the explanation is
present. Testable without any other part of this slice.

**Acceptance Scenarios**:

1. **Given** a customer who has just completed a password reset, **When** they arrive at sign-in,
   **Then** the screen states that their password was changed and that they need to sign in again.
2. **Given** a customer who changed their password from their account, **When** they arrive at
   sign-in, **Then** they see the same explanation.
3. **Given** a customer who arrived at sign-in for no stated reason, **When** the screen is shown,
   **Then** no explanation notice appears.
4. **Given** an explanation notice is shown, **When** it is displayed, **Then** it is presented as
   information rather than as an error.

---

### User Story 5 - Finish, or come back to it, without being trapped (Priority: P3)

A newly-registered shopper is asked what to call them. They can answer and finish, or they can go on
into the shop and be asked again next time — and the screen says so, so neither choice feels like a
mistake.

**Why this priority**: The account already exists by this point and the step is documented as one
that must never gate access. Making that true on screen removes the last dead end in registration.
P3 because abandoning already works; only the shopper cannot tell.

**Independent Test**: Reach the name step, decline it, and land in the shop signed in; return later
and be asked again with nothing suggesting the account is broken.

**Acceptance Scenarios**:

1. **Given** the name step, **When** it is shown, **Then** a clearly-labelled way to continue without
   answering is present, and it is visually subordinate to finishing.
2. **Given** the name step, **When** the customer continues without answering, **Then** they arrive in
   the shop signed in, and nothing suggests their account is incomplete or broken.
3. **Given** a customer who skipped the name step, **When** they next reach a place that asks, **Then**
   they are asked plainly, with no error framing.
4. **Given** the name step, **When** a name is entered with surrounding whitespace, **Then** it is
   accepted and stored trimmed.

---

### Edge Cases

- What is shown when a shopper's browser reports the field values as filled by a password manager —
  does validation run against the filled values, and does the committing action become available
  without a keystroke?
- What happens on the code screen when a phone's messaging autofill inserts all six digits at once —
  is the action available immediately, and is nothing auto-submitted?
- What is shown when the customer's window is short enough (a landscape phone) that a full-height
  column and a bottom-anchored action cannot both fit?
- What is shown when a screen is opened at 200% browser zoom, or with text-only zoom, where the code
  positions are sized from the typeface?
- What is shown when a screen reader user moves between steps — is the new step announced exactly
  once, without stealing focus from a field mid-typing?
- What happens when a validation error and a platform refusal are raised at the same time — which is
  shown, and is more than one thing announced?
- What happens when the shopper's connection fails mid-submission — is the in-progress indication
  cleared, and is the action pressable again?
- What is shown when a shopper reaches the code screen having already spent the platform's hourly
  send allowance elsewhere, so the resend is refused before it is offered?
- What is shown if a shopper navigates backwards with the browser's own control into a step whose
  underlying challenge is no longer live?
- What is shown when the page is opened with the operating system set to reduced motion, if any
  transition is introduced between steps?

## Requirements *(mandatory)*

### Functional Requirements

#### The one-time-code control

- **FR-001**: The code control MUST present six visible, individually distinguishable character
  positions, each with a boundary and a fill that are discernible against the page ground. The
  boundary MUST NOT use a token the design system marks as an untested hairline — that is what made
  the positions invisible (D-01). Because the control is shared, its colours MUST come from tokens
  that resolve in either appearance, even though this storefront renders only one (see FR-029).
- **FR-002**: The code control MUST remain **one logical input** for assistive technology and for
  focus — the visible positions are a presentation of a single field, not several fields. Exactly one
  labelled input MUST be exposed.
- **FR-003**: The code control MUST accept a full six-digit paste, and MUST accept a value supplied by
  the device's own message-autofill, in a single action.
- **FR-004**: The code control MUST NOT shorten a value longer than six digits. A longer value MUST
  remain visible in full, MUST prevent submission, and MUST be explained in words including how many
  digits an Effy code has.
- **FR-005**: The code control MUST NOT submit automatically when the sixth digit is entered.
- **FR-006**: The code control MUST indicate which position will receive the next character.
- **FR-007**: The code control MUST carry the error state visibly on the positions themselves when a
  code has been refused, in addition to the message.
- **FR-008**: The code control MUST be centred with its own label and MUST share the label's
  alignment, at every width.

#### Validation and refusal

- **FR-009**: Every screen in this journey MUST validate its fields before advancing a step or
  requesting anything from the platform, and MUST NOT rely on the browser's built-in enforcement to
  block an empty or malformed submission.
- **FR-010**: An email address MUST be checked against a stricter rule than the browser's default —
  at minimum it MUST require a local part, an `@`, and a domain containing a dot with a plausible
  final segment. Nothing may be sent to an address that fails.
- **FR-011**: A field MUST be validated when the customer leaves it after having entered something,
  and again on submission. A field the customer has not yet touched MUST NOT show an error.
- **FR-012**: An error MUST be displayed beside the field it concerns, in the platform's error
  treatment, and MUST NOT be delegated to a browser-drawn bubble.
- **FR-013**: An error MUST clear as soon as the value becomes valid, without a further submission.
- **FR-014**: A refused submission MUST move focus to the first field needing attention and MUST
  announce the problem to assistive technology.
- **FR-015**: All text input MUST be trimmed of leading and trailing whitespace before it is
  validated, submitted or stored; a whitespace-only value MUST be treated as empty.
- **FR-016**: A password field with a stated minimum MUST reflect, as the customer types, whether the
  requirement is met — and MUST state the requirement before they begin.
- **FR-017**: At most **one** error region MUST be visible for a given problem at a given moment; a
  step MUST NOT render a second, independently-owned error region for the same submission.
- **FR-018**: Copy for refused codes MUST remain exactly as constrained today: the sign-in code route
  MUST NOT claim to know why a code was refused, and MUST NOT reveal whether an account exists.

#### Action states

- **FR-019**: ⚠ **AMENDED 2026-08-11 (operator direction) — an unavailable committing action is NOT
  visually distinguished at all.** It renders as a normal primary button whether or not it can commit.

  The first implementation drew it as a dashed outline. That was visually honest and it made the
  primary action of every step look provisional and unfinished, which the operator rejected.

  ⚠ **What carries the requirement instead is FR-020, which becomes load-bearing rather than a
  nicety.** The original complaint (D-04) was never "the disabled state is badly styled" — it was "I
  press it and nothing happens". A button that always looks pressable **and always responds when
  pressed** does not have that problem. A button that looks pressable and silently does nothing is
  exactly the shipped defect. So every caller that passes a blocked state MUST also pass the handler
  that says what is missing; without it this is D-04 with better colours.
- **FR-020**: When an action is unavailable, pressing it MUST state what is still required. ⚠ Since
  the FR-019 amendment this is the **only** signal that an action cannot commit, so it is mandatory
  wherever a blocked state exists, not optional polish.
- **FR-021**: A submission in flight MUST be indicated on the screen, and the action MUST NOT be
  actionable a second time while it is in flight.
- **FR-022**: Every committing action MUST also be reachable by pressing Enter from within the fields
  it submits.

#### Layout, theme and responsiveness

- **FR-023**: Every screen in this journey MUST draw its typography, control shapes, field treatment,
  focus treatment and spacing from the storefront's existing shared definitions rather than restating
  them locally, so that the two cannot drift.
- **FR-024**: Headings MUST be sized responsively and MUST NOT use the storefront's merchandising
  display treatment; they must not visually outweigh the fields beneath them.
- **FR-025**: Each screen MUST establish a single dominant alignment; supporting text MUST NOT be
  aligned against the fields it supports.
- **FR-026**: Every screen MUST be usable, with no clipping and no horizontal scrolling, from 320px
  wide upwards.
- **FR-027**: On small screens the committing action MUST remain reachable without scrolling past the
  fields, including while a software keyboard is open.
- **FR-028**: On wide screens the form MUST be composed within a deliberate layout rather than left as
  a narrow column in empty space.
- **FR-029**: Every element and state MUST meet the platform's contrast rule in the appearance the
  storefront actually renders, including unavailable actions, error text, and the code positions.

  ⚠ **AMENDED 2026-08-11 — the customer storefront is LIGHT-ONLY, by a recorded operator decision.**
  This requirement originally said "in both light and dark appearances", and several success criteria
  and acceptance scenarios said the same. That was written without checking the surface: unlike the
  two internal consoles, `customer-web` ships no appearance switcher, never applies the design
  system's dark class, and deliberately pins the browser's own `color-scheme` to light so native
  chrome cannot render dark over a light page. The decision is recorded in the storefront's root
  layout and in its global stylesheet.

  So a dark-mode obligation here was **untestable by construction** — there is no dark mode to test —
  and claiming to have verified one would have been a false claim in the sign-off. Building one would
  have been worse: reversing an operator decision as a side effect of a redesign nobody asked to
  change the appearance model.

  What still binds, and is unchanged: every colour used MUST come from the design-system tokens, so
  that any surface which *does* have a dark appearance (the consoles, or this storefront if the
  decision is ever revisited) resolves correctly with no further work. The shared code control is
  written against tokens for exactly this reason.
- **FR-030**: Every interactive target MUST meet the platform's minimum touch size.
- **FR-031**: The design MUST introduce no colour outside the platform's monochrome ramp and its two
  permitted semantic colours.
- **FR-032**: Loading placeholders MUST approximate the shape of the content they stand in for.
- **FR-033**: Multi-field steps MUST stack their fields on small screens rather than dividing a narrow
  column.

#### Journey and copy

- **FR-034**: When a customer is returned to sign-in because their password changed, the sign-in
  screen MUST say so, presented as information rather than as an error.
- **FR-035**: The name step MUST present a clearly-labelled way to continue without answering,
  visually subordinate to finishing, and taking that route MUST land the customer in the shop, signed
  in, with nothing suggesting their account is incomplete.
- **FR-036**: Each step MUST announce itself once to assistive technology when it becomes current,
  without moving focus away from a field the customer is typing in.
- **FR-037**: The back affordance MUST be present on every step that has a previous step, MUST return
  without losing what was already entered, and MUST behave identically to the browser's own back
  control.
- **FR-038**: A shopper who was sent to sign in from elsewhere in the shop MUST continue to be told
  why and MUST continue to be returned to where they were.

#### Constraints inherited, not chosen

- **FR-039**: No step MUST be added, removed or reordered; the flow established by 036 is unchanged.
- **FR-040**: The email field MUST remain present and identifiable to password managers on the
  credential steps of both journeys, so that filling and — more fragilely — saving continue to work.
- **FR-041**: The terms notice MUST continue to appear wherever an account is created, at full
  contrast, with distinguishable links, and MUST remain visible above the committing action on small
  screens.
- **FR-042**: The internal consoles that share the code control MUST be visually and behaviourally
  unchanged by this work, and that MUST be demonstrated rather than asserted.
- **FR-043**: The storefront's guest pages MUST NOT gain any weight from this work; the containment
  that keeps the authentication machinery off public pages MUST hold.
- **FR-044**: No screen MUST reveal whether an address belongs to an existing account, at any step,
  through copy, timing or the presence of a control.

### Key Entities

This feature stores nothing new. The only state it introduces is per-screen and transient:

- **Field validity**: for each field, whether the customer has interacted with it, whether its current
  value is acceptable, and the message to show if not. Exists only while the screen is open.
- **Step interruption reason**: why the customer was sent to sign-in — already produced by two places
  in the product today and currently read by none.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Five people shown the code screen, on a phone and unprompted, all identify where the
  code is typed within three seconds and enter it without asking where to type.
- **SC-002**: Zero of the same five describe the unavailable committing action as "pressable" when
  shown the screen with fewer than six digits entered.
- **SC-003**: An empty submission and a malformed-address submission are both refused with a visible
  message beside the field, at **every** email entry point in the journey, and no code is requested in
  either case.
- **SC-004**: An address of the form `name@example` — accepted today — is refused before anything is
  sent.
- **SC-005**: A shopper who mistypes one digit of a code corrects it and signs in without retyping the
  other five and without spending an extra attempt.
- **SC-006**: Every screen in the journey renders with no clipping and no horizontal scrolling at
  320px, 375px, 768px and 1440px. ⚠ Amended 2026-08-11: "in both light and dark" removed — the
  storefront is light-only by operator decision (see FR-029).
- **SC-007**: Every text and interactive element on every screen and in every state passes the
  platform's contrast rule in the appearance the storefront renders, verified mechanically against
  the design-system tokens (which are checked in both appearances by the token gate regardless).
- **SC-008**: Every interactive target on every screen meets the platform's minimum touch size,
  verified mechanically.
- **SC-009**: A screen reader user completes sign-in by code start to finish: each step is announced
  once, the code field is announced as a single field, and every refusal is announced once.
- **SC-010**: Every screen remains fully understandable with colour removed — no state is signalled by
  colour alone.
- **SC-011**: The two internal consoles are byte-identical in their rendering of the shared code
  control, demonstrated by their existing tests passing unmodified.
- **SC-012**: The storefront's public pages are unchanged in weight, measured against the same budget
  they are held to today.
- **SC-013**: A password reset ends with the customer on a sign-in screen that explains why, observed
  live.
- **SC-014**: A newly-registered customer can decline the name step and arrive in the shop signed in,
  observed live.
- **SC-015**: No screen in the journey declares its own copy of a control, field, heading or spacing
  definition that the storefront already defines, verified by inspection.
- **SC-016**: Placed side by side with the storefront home, three observers judge the authentication
  screens to belong to the same shop.
- **SC-017**: Each defect in the register above is either fixed and demonstrated, or explicitly
  recorded as out of scope with a reason.

## Assumptions

- **The 036 flow is settled.** Step order, the code-first default, the name-last rule and the
  password-as-a-second-step arrangement are treated as decided. This slice changes how those steps
  look and how they respond to input, not what they are.
- **The code control stays one input.** The operator's report of "no otp fields" is read as *the
  positions are invisible*, not as a request for six separate inputs. Six separate inputs are a known
  accessibility regression and are ruled out by an existing platform requirement; the remedy is to
  make one input's six positions unmistakably visible. Recorded here because it is the one place this
  spec deliberately does not do the literal thing asked.
- **Desktop gets a composed two-part layout.** The assumed shape is a form column paired with a brand
  panel on wide screens, collapsing to a single full-height column below it. The exact composition is
  the plan's to settle; what is required is FR-028.
- **"Onboarding" means the name step.** The storefront has no separate onboarding journey; the step
  that completes registration is the whole of it.
- **Google stays parked.** The control is restyled with the rest; connecting it is a separate slice.
- **The mobile apps are out of scope** and will be recorded as a parity gap rather than silently
  diverging.
- **No new data, no migration, no backend change.** Validation is a client-side improvement to input
  quality; the platform's own refusals are authoritative and unchanged.
- **The platform's honesty constraints bind this work.** Where the platform cannot distinguish why a
  code failed, this redesign must not invent a reason to make a screen read better.
- **Two register items are unconfirmed** (D-11, D-21) and will be reproduced against a running build
  in the plan's baseline before being treated as defects.

---

## Appendix — engineering evidence (non-normative)

Recorded so the plan does not have to rediscover it. Nothing here is a requirement.

- **D-01/D-02**: the code control's six positions are painted as a repeating background rule using the
  border token at 3px, and the element carries both a centring class and an inline negative right
  margin. The inline margin wins over the class's `auto`, leaving `auto` on one side only — which is
  what pushes the control to the right edge. Both are in the shared control in
  `packages/design-system/src/ui/otp-input.tsx`; changes there reach the two internal consoles, hence
  FR-042 and SC-011.
- **D-05**: the code step owns an error, and `SignInForm` / `SignUpForm` / `ResetPasswordForm` each
  render a second one *outside* the step shell, above the back control.
- **D-08/D-09**: `app/(auth)/_components/AuthKit.tsx` declares its own `Field` with no error slot,
  while `components/storefront/kit.tsx` already exports a `Field` that takes one — the same divergence
  named in D-17.
- **D-11**: the five entry points to check are sign-in email, sign-in password, sign-up email, sign-up
  password, and reset-password email. The last renders its action outside the form it submits; the two
  password steps keep a required email input inside a hidden container.
- **D-14**: `app/(account)/account/actions.ts` and `ResetPasswordForm` both navigate to
  `/sign-in?reason=password-changed`; a repository-wide search finds no reader of that parameter.
- **D-17/D-18**: `StepShell` hardcodes the merchandising display treatment rather than composing the
  storefront's shared heading, which the operator moved off all-caps for section headings on
  2026-08-09.
