# Feature Specification: Platform-Wide Six-Digit One-Time Codes

**Feature Branch**: `035-six-digit-otp`

**Created**: 2026-08-03

**Status**: Draft

**Input**: User description: "Fix the OTP flow in the whole platform (all the apps, web apps and
everything). When a user uses email-OTP login or signup it gives the user an 8-digit OTP, but in
other places we need an OTP it gives us a 6-digit OTP. The normal standard for OTPs is 6 digits. So
change every place in the platform that uses an 8-digit OTP to use a 6-digit OTP — every app and web
app in the platform uses only 6-digit OTPs whenever one is needed. Custom auth challenges may be
written if needed, but always use best practices and the official way to do this."

---

## Context: what this feature is, and what it costs

This feature makes **one promise**: every one-time code Effy sends anyone, on any surface, is **six
digits**. After it, there is exactly one code length on the platform.

That promise is small to state and expensive to keep, and this spec is written so the cost is visible
now rather than discovered during implementation.

### The problem is real and has already broken a shipped surface

Effy issues one-time codes through five distinct doors, and they do not agree:

| Door | Length today |
|---|---|
| Passwordless **sign-in** (all four audiences) | **8** |
| Sign-**up** confirmation (customer only) | 6 |
| Password reset (customer only) | 6 |
| Set-first-password step-up (customer only) | 6 |
| Account-closure step-up (customer only) | 6 |

The same person, in the same app, gets a different length depending on which door they came through.

⚠ **This is not cosmetic — the mismatch has produced a live defect on a shipped surface.** The shop
mobile app filters and truncates code input to six characters on every keystroke and paste, and gates
its submit control on a length of exactly six. A shop operator who receives their real 8-digit sign-in
code has it silently cut to the first six digits and submitted. **Passwordless sign-in on shop-mobile
cannot succeed today.** The customer mobile app carries the same misplaced assumption in a milder
form: its sign-in code screen shows the placeholder "6-digit code" while the code that arrives has
eight.

Both are the same root cause. **The platform's own surfaces already assume six.** This feature makes
the world match them, rather than teaching five surfaces to expect eight.

### The constraint that shapes the whole feature

⚠ **The identity provider's code length is not configurable — by any setting, on any object.** This
was checked against the provider's own documentation, its API reference, its infrastructure-provider
schema, and the client SDK issue tracker. There is no length field on the user pool, on the
application client, in the sign-in policy, in the multi-factor email configuration (which exposes
exactly two fields — a message and a subject), in the message templates (whose placeholder token
carries no length meaning), or in the hosted sign-in branding. The SDK vendor's own engineers closed
the standing feature request as a provider-side limitation, and no release since has added one.

⚠ **Rewriting the email is also not a route.** The provider offers a hook that lets the platform send
the message itself — but that hook *receives the code the provider already generated* and has **no
response field through which to hand a different one back**. The provider still verifies the answer
against its own stored value. Sending our own six-digit code from there would email every user a code
the service will always reject. The message-customisation hook is likewise contractually required to
include the code token it was handed: the prose can change, the digits cannot.

**Therefore the only route that delivers a six-digit sign-in code is for the platform to own the code
itself** — generating, storing, sending, expiring and verifying it, inside the provider's supported
extension points built for exactly this purpose. That capability is supported on all three client SDKs
the platform uses, so no surface is left behind.

### This reverses a recorded operator decision, deliberately

`specs/011-customer-storefront-web/research.md` records **D23 — "The 6-vs-8 digit OTP mismatch
(2026-07-15) — accepted, not fixed"**, which evaluated this exact approach and rejected it as *"~600
lines of security-critical code to delete two digits."*

**D23's analysis was correct and remains correct.** Its constraint findings have been independently
re-verified for this spec and every one holds. What has changed is the evidence on the other side of
the ledger:

1. The mismatch has since **broken sign-in on a shipped surface** (shop-mobile), which was not known
   in July.
2. **Two of the platform's own UIs already tell users the code is six digits.** The platform is
   already making the promise; it is simply not keeping it.
3. D23's binding consequence — *"do not hardcode a length"* — was **not actually honoured** on mobile.
   The rule survived only on the web surfaces. A rule that two of five surfaces silently break is not
   holding the line.

D23 also left a cheaper alternative on the record: route new sign-ups through the sign-in flow so one
code type serves the whole platform. That unifies on **eight**, not six, and so does not satisfy this
feature. It is dismissed on the record, not by omission.

### What this feature accepts in exchange

Six digits is **less secure than eight**, and self-managed codes are less secure than service-managed
ones. Both are accepted deliberately, in exchange for consistency and usability, and both are paid for
with compensating controls that are **requirements in this spec, not implementation detail**:

- The guess space shrinks **one hundredfold** (10⁸ → 10⁶). Recognised guidance permits six digits at
  roughly 20 bits of entropy but *mandates* throttling at that strength; other recognised guidance
  explicitly prefers eight or more where usability allows. Six is compliant, and simultaneously the
  less-preferred of the two positions.
- Everything the identity provider was doing for free becomes the platform's to build and operate:
  generation, expiry, single-use enforcement, per-address send throttling, per-user request rate
  limiting, and secure storage.
- **Two capabilities are forfeited**: passkeys as a future first factor on the affected pools, and
  automatic sign-in immediately after sign-up.
- **One silent-failure hazard must be closed explicitly**: the managed flow marks a person's email
  address verified and moves a new account out of its unconfirmed state when they enter a correct
  code. A platform-owned flow does not do this by itself, and missing it would leave accounts
  unverified — which, under the platform's rule that federated linking requires a verified email,
  would silently break Google sign-in linking.

### What is explicitly NOT in scope

- The four codes that are **already six digits** do not change length, behaviour, or delivery. They
  keep working exactly as they do.
- No change to which credential routes each audience has. Internal audiences stay passwordless and
  admin-provisioned; the customer keeps all three routes converging on one profile.
- No change to authorization, roles, pool isolation, or how any backend validates a token.
- No new user-facing capability. Nobody can do anything after this feature that they could not do
  before — they can just do one thing that is currently broken, and do it consistently.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop operator can sign in at all (Priority: P1)

A shop operator opens the shop mobile app on the store tablet, enters their work email, receives a
code, types it in, and is signed in. Today this is impossible: the app truncates their code and
submits the wrong value, and no amount of retyping helps.

**Why this priority**: This is the only story that fixes something *broken* rather than something
*inconsistent*. A shop operator locked out of the shop app cannot receive orders, pick them, or hand
them off — the entire fulfilment half of the platform. Every other story here improves consistency;
this one restores a capability.

**Independent Test**: Provision a shop operator, request a sign-in code on shop-mobile, enter the code
exactly as received, and confirm the session is established. Fully testable on one surface with no
other surface changed.

**Acceptance Scenarios**:

1. **Given** a provisioned shop operator on the shop mobile app, **When** they enter their work email
   and request a code, **Then** they receive a six-digit code by email.
2. **Given** that code, **When** they type or paste all six digits, **Then** the sign-in control
   becomes available and submitting it signs them in.
3. **Given** the code is pasted with surrounding whitespace or separators, **When** it is pasted,
   **Then** the six digits are accepted and nothing is silently discarded.
4. **Given** an incorrect code, **When** it is submitted, **Then** the operator is told the code is
   wrong, their input is preserved, and they may try again within the attempt limit.

---

### User Story 2 - Every sign-in code on every surface is six digits (Priority: P1)

Anyone signing in passwordlessly — a customer on the storefront web or mobile app, a shop operator on
either shop surface, a back-office user on the console, and a driver once that app exists — receives a
six-digit code, and the field they type it into expects six.

**Why this priority**: This is the feature's central promise. It is P1 alongside Story 1 because a
partial rollout leaves the platform with *three* code lengths instead of two, which is worse than
where it started.

**Independent Test**: On each surface in turn, request a sign-in code, count the digits received, and
confirm the code is accepted. Each surface is independently verifiable.

**Acceptance Scenarios**:

1. **Given** any of the six client surfaces, **When** a person requests a passwordless sign-in code,
   **Then** the code delivered is exactly six digits.
2. **Given** a correct six-digit code, **When** it is submitted on any surface, **Then** a valid
   session is established with the same audience isolation and role information as before.
3. **Given** a person signs in on one surface and then another, **When** they compare the two codes,
   **Then** both are six digits and the flows behave identically.
4. **Given** a customer signs in with a code, **When** they later reset their password or confirm an
   account change, **Then** every one of those codes is also six digits.
5. **Given** the driver mobile app gains a sign-in screen in a later feature, **When** it does,
   **Then** it inherits the six-digit requirement without further decision.

---

### User Story 3 - A guessed code is refused, and a farmed code is refused too (Priority: P1)

An attacker who wants to break into an account by guessing a six-digit code, or by requesting endless
codes to a victim's address, is stopped — and cannot learn from the sign-in form whether an email
address belongs to an Effy account.

**Why this priority**: P1, and non-negotiable. The whole point of shortening the code is that the
platform now owns the defence. Shipping Stories 1 and 2 without this story would ship a materially
weaker authentication system, not a more consistent one. This story is what makes the trade-off
acceptable rather than reckless.

**Independent Test**: Adversarially — submit wrong codes past the attempt limit, request codes past
the send limit, submit an expired code, replay a used code, and request codes for an address that has
no account. All verifiable without any UI.

**Acceptance Scenarios**:

1. **Given** a sign-in attempt in progress, **When** an incorrect code is submitted more times than
   the attempt limit allows, **Then** the attempt is failed and the code cannot be tried again.
2. **Given** a code has been used successfully, **When** the same code is submitted again, **Then**
   it is refused.
3. **Given** a new code has been requested, **When** the previously sent code is submitted, **Then**
   it is refused.
4. **Given** a code older than its lifetime, **When** it is submitted, **Then** it is refused and the
   person is told to request a new one.
5. **Given** repeated code requests for one email address, **When** the rate exceeds the issuance
   limit, **Then** further requests are refused for a cooling-off period and no further email is sent.
6. **Given** an email address with no Effy account, **When** a code is requested for it, **Then** the
   response is indistinguishable in content, shape and timing from one for a real account, **and** no
   email is sent.
7. **Given** any system record — logs, traces, stored state, telemetry — **When** it is inspected,
   **Then** no one-time code appears in readable form anywhere.

---

### User Story 4 - A new customer's account is properly verified (Priority: P2)

A person who creates an Effy account and signs in with an emailed code ends up with a fully confirmed
account and a verified email address — and can later link their Google sign-in to that same account.

**Why this priority**: P2 because it is invisible when it works and catastrophic when it does not.
Taking ownership of the code flow removes an automatic behaviour that new-account verification quietly
depends on. If it is not deliberately reinstated, accounts accumulate in an unverified state and
Google linking breaks — with **no error at the time it breaks**, only later.

**Independent Test**: Create a new account through the code route, complete sign-in, and inspect the
resulting account's confirmation and email-verification state.

**Acceptance Scenarios**:

1. **Given** a brand-new account created through the passwordless route, **When** the person enters a
   correct code, **Then** the account is confirmed and its email address is marked verified.
2. **Given** such an account, **When** the person later signs in with Google using the same verified
   email, **Then** the identity links into the existing account and one person still has one account.
3. **Given** an existing account created before this feature, **When** the person signs in, **Then**
   their confirmation and verification state is unchanged and they are not asked to re-verify.

---

### User Story 5 - The platform's own words are true (Priority: P2)

Everywhere a person is told about a code — placeholder text, helper copy, error messages, screen
reader labels — the platform says six, means six, and accepts exactly six.

**Why this priority**: P2. This closes the loop between the two existing surfaces that already claim
six and the four that say nothing. It is also where a partially-done job is most visible to users and
least visible to tests.

**Independent Test**: Walk every code-entry screen on every surface and confirm the stated and
enforced length agree with what was sent.

**Acceptance Scenarios**:

1. **Given** any code-entry field on any surface, **When** a person reads its label, placeholder and
   helper text, **Then** any stated length is six.
2. **Given** any code-entry field, **When** a person enters six digits, **Then** the submit action
   becomes available; **when** they enter fewer, **then** it does not.
3. **Given** a code-entry field, **When** a person uses a screen reader, **Then** the field is
   announced as a single one-time-code field, not as several separate inputs.
4. **Given** a device that offers to autofill a code from a message, **When** it does, **Then** the
   field accepts the autofilled value in one action.

---

### Edge Cases

- **A person is mid-sign-in when the change ships.** A code issued under the old flow must either
  still complete, or fail with a clear "request a new code" message — never a dead end and never a
  generic error.
- **A person has both an old 8-digit code and a new 6-digit code in their inbox.** The most recently
  issued code is the only one that works; the older one is refused as superseded.
- **The email fails to send** (delivery outage, suppressed address, sending quota exhausted). The
  person is told a code could not be sent and invited to retry — never left on a code-entry screen
  waiting for a message that will never arrive, and never told the code was sent when it was not.
- **A person requests a code and closes the app**, then returns after it has expired. Entering it
  produces a clear expiry message with a way to request a new one.
- **A person pastes a code with spaces, dashes, or trailing text** (as email clients often produce).
  The six digits are recovered; anything else is ignored.
- **A person pastes an 8-digit value** (an old code, or one from another service). It is refused as
  incorrect — never silently truncated to its first six digits, which is precisely today's defect.
- **Two devices request codes for the same account at once.** The behaviour is deterministic and
  stated: the later request supersedes the earlier one, and only the most recent code works.
- **An attacker requests codes for many different addresses from one source.** Issuance is limited by
  source as well as by address, so the per-address limit cannot be sidestepped by spreading the attack.
- **The rate limit is reached by a legitimate person** (a bad inbox, several honest retries). They are
  told when they can try again, not simply refused.
- **A barred or disabled account requests a code.** The platform record remains authoritative — a
  correct code never overrides a barred status — and the refusal reveals nothing about the account.
- **The store holding in-flight codes is briefly unavailable.** The flow fails closed: nobody is
  signed in without a verified code.

---

## Requirements *(mandatory)*

### Functional Requirements — the promise

- **FR-001**: Every one-time code the platform issues MUST be exactly six decimal digits, on every
  surface and for every audience.
- **FR-002**: The passwordless **sign-in** code MUST change from eight digits to six for all four
  audiences — customer, driver, shop, and admin/back-office.
- **FR-003**: The four codes that are already six digits — sign-up confirmation, password reset,
  set-first-password step-up, and account-closure step-up — MUST remain six digits and MUST continue
  to work exactly as they do today, with no change to their behaviour, delivery, or refusal messages.
- **FR-004**: No surface may truncate, pad, or otherwise alter a code before submitting it. Input
  normalisation MUST be limited to discarding non-digit characters and surrounding whitespace.
- **FR-005**: A submitted value that is not exactly six digits MUST be refused as invalid rather than
  reshaped into six digits.
- **FR-006**: The requirement MUST bind the driver mobile app when it gains a sign-in screen, without
  needing a further decision at that time.

### Functional Requirements — the compensating controls

Each of these is a **testable requirement**, present because the platform is taking ownership of a
secret that the identity provider previously protected.

- **FR-007**: Codes MUST be generated with a cryptographically secure random source, uniformly across
  the full six-digit space including values with leading zeros.
- **FR-008**: A code MUST expire no later than **five minutes** after issue, and expiry MUST be
  enforced at verification time — not only by the surrounding session's own lifetime.
- **FR-009**: A code MUST be single-use. A correct code MUST be invalidated the moment it is accepted.
- **FR-010**: Issuing a new code for an account MUST invalidate any code previously issued to it.
- **FR-011**: A single sign-in attempt MUST allow at most **three** verification attempts, after which
  the attempt fails and the code is dead. The person must start a new sign-in to continue.
- **FR-012**: Code issuance MUST be rate-limited **per email address** — no more than five codes per
  address per hour — so that per-attempt limits cannot be sidestepped by restarting the flow, and so
  that an inbox cannot be flooded.
- **FR-013**: Code issuance MUST additionally be rate-limited **per request source**, so that the
  per-address limit cannot be sidestepped by spreading requests across many addresses.
- **FR-014**: A code MUST be stored only as a keyed one-way hash. The code MUST NOT be stored, logged,
  traced, or emitted in telemetry in readable form anywhere.
- **FR-015**: Code comparison MUST be performed in constant time.
- **FR-016**: A code request for an address with no account MUST be **indistinguishable** from one for
  a real account — same response content, same shape, and comparable timing — and MUST NOT send an
  email. Verification against a non-existent account MUST always fail.
- **FR-017**: When code storage, delivery, or verification is unavailable, the flow MUST fail closed —
  no session is ever established without a verified code.
- **FR-018**: A code MUST be valid only for the audience and account that requested it. A code issued
  for one audience MUST NOT be accepted by another.
- **FR-019**: A code issued for sign-in MUST NOT be accepted by any other code-consuming flow, and a
  code issued for password reset, first-password step-up or account closure MUST NOT be accepted for
  sign-in. Each code serves exactly one purpose.

### Functional Requirements — correctness of the account itself

- **FR-020**: On successful verification of a sign-in code, a new account MUST be moved to its
  confirmed state and its email address MUST be marked verified — reinstating explicitly the behaviour
  the managed flow performed automatically.
- **FR-021**: An existing account's confirmation and email-verification state MUST be unchanged by this
  feature. Nobody is asked to re-verify anything.
- **FR-022**: Federated (Google) sign-in MUST continue to link into the existing native account on a
  verified email, and one person MUST still resolve to one account across all credential routes.
- **FR-023**: The platform record MUST remain authoritative for the access decision. A correct code
  MUST NOT grant access to a barred, suspended or disabled account.

### Functional Requirements — the copy and the input

- **FR-024**: Every user-visible reference to a code's length, on every surface, MUST say six.
- **FR-025**: Every code-entry field MUST present as **one** logical field for assistive technology,
  announced as a one-time-code field, regardless of its visual treatment.
- **FR-026**: Every code-entry field MUST support platform one-time-code autofill and MUST accept a
  pasted code in a single action, including when the paste carries whitespace or separators.
- **FR-027**: ⚠ **UNMET, AND UNMEETABLE AS BUILT — recorded 2026-08-05 during 036 (research R10).**
  This requirement and **FR-028** below are in direct tension, and FR-028 won in the implementation.
  On the code SIGN-IN route the platform cannot distinguish these cases at the client, by design:
  `VerifyAuthChallenge` computes a reason (`malformed | expired | mismatch | no-envelope`) and
  **discards it**, returning only a boolean, so the response cannot be used to tell whether an account
  exists. Worse, a **rate-limited** send returns a normal-looking challenge with a masked destination,
  so "we couldn't send one" is indistinguishable from "we sent one". Attempts 1 and 2 raise **no
  exception at all** — Cognito simply re-issues the challenge — and only the third produces
  `NotAuthorizedException`.
  Where the platform genuinely CAN distinguish a cause — sign-up confirmation and password reset, which
  use Cognito's managed flow and emit real `CodeMismatchException` / `ExpiredCodeException` /
  `LimitExceededException` — 036 FR-011 requires the message to say which. On the sign-in route it
  requires the opposite: that no message claims knowledge the platform does not have.
  ~~Refusals MUST be distinguishable to the person: a wrong code, an expired code, a superseded code,
  too many attempts, and too many requests MUST each produce a different message telling them what to
  do next.~~
- **FR-028**: No refusal message may disclose whether an email address corresponds to an existing
  account.
- **FR-029**: The stale comments on the web sign-in and sign-up surfaces that instruct future authors
  *not* to constrain code length — correct under the old mismatch, wrong after this feature — MUST be
  replaced rather than left to mislead.

### Functional Requirements — safety of the change itself

- **FR-030**: No account data may be lost. Every infrastructure change MUST be verified as an in-place
  update before it is applied; if a change plan shows any identity pool or application client being
  replaced, **the work stops**.
- **FR-031**: Audience isolation MUST be unchanged — four separate pools, independent per-pool token
  validation with pinned issuers, no brokering of authentication between pools, and no acceptance of
  one audience's token by another's surface or service.
- **FR-032**: The credential routes available to each audience MUST be unchanged. Internal audiences
  (driver, shop, admin) remain strictly passwordless and admin-provisioned, with no password anywhere.
  The customer audience keeps email+password, email code, and federated sign-in.
- **FR-033**: The change MUST be reversible **per surface**, without an infrastructure change and
  without stranding anyone mid-sign-in. Both the old and new flows MUST be able to coexist during
  rollout.
- **FR-034**: An 8-digit code already in flight when the change ships MUST either complete normally or
  fail with an explicit instruction to request a new code — never a dead end or a generic error.
- **FR-035**: A one-time-code entry field MUST be provided as a **shared component** on web and on
  mobile, so that no surface re-implements length, normalisation, accessibility or autofill behaviour
  for itself. This feature's defect exists precisely because one surface implemented its own.
- **FR-036**: End-to-end coverage of code entry MUST exist for at least one web surface and both
  mobile apps. There is **none anywhere today**, which is why an unusable sign-in screen shipped.

### Functional Requirements — verify the premise, and record the decision

- **FR-037**: Before any implementation work begins, the current code lengths MUST be **measured**
  against the live development environment — one real sign-in code and one real password-reset code,
  digits counted. The eight-digit claim is not stated in any official vendor document; it rests on
  vendor engineers' statements and this platform's own observation. This platform has previously been
  misled by a test that agreed with an assumption instead of with the world.
- **FR-038**: This feature MUST explicitly supersede decision **D23** in
  `specs/011-customer-storefront-web/research.md`, recording what D23 established correctly, what
  evidence has changed, and why the decision is reversed.
- **FR-039**: The cheaper alternative D23 left on the record — unifying every code onto the *sign-in*
  flow — MUST be evaluated and dismissed on the record, on the grounds that it unifies on eight rather
  than six.
- **FR-040**: The governing principle's wording MUST be examined and settled. Its text names the
  vendor's managed factor by name; this spec's position is that the phrase describes the **credential**
  (a one-time code delivered by email) rather than one vendor mechanism, and that this feature
  therefore conforms. That reading MUST be either confirmed in the principle's own words or the
  principle amended, and every dependent document repeating the phrase MUST be updated in the same
  change.
- **FR-041**: The two capabilities forfeited by this change — passkeys as a future first factor on the
  affected pools, and automatic sign-in immediately after sign-up — MUST be recorded as accepted
  losses, with the second either preserved by other means or explicitly given up in a user-visible way
  (the person signs in with their new code rather than being carried straight in).
- **FR-042**: The audience capability registers MUST be updated to reflect the new credential behaviour
  for every affected audience.

### Key Entities

- **One-time code**: A six-digit secret issued to one account for one purpose, with an issue time, an
  expiry, a used/unused state, and a count of failed attempts against it. Held only as a keyed hash.
  Superseded when a newer code is issued to the same account.
- **Sign-in attempt**: A single person's attempt to sign in, spanning the request for a code and up to
  three attempts to answer it. Carries the attempt count that FR-011 limits.
- **Issuance record**: The per-address and per-source history that FR-012 and FR-013 throttle against,
  retained only long enough to enforce the window.
- **Account**: The existing person record, unchanged by this feature except that its confirmation and
  email-verification state must now be set explicitly on first successful sign-in (FR-020).

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shop operator can sign in to the shop mobile app and reach the order queue — a journey
  that **cannot be completed at all today**. Measured as a completed sign-in on a real device.
- **SC-002**: Every one-time code received across all five code-issuing flows and all six client
  surfaces is six digits. Measured by counting digits in received emails — **zero eight-digit codes
  observed**.
- **SC-003**: A person can sign in on every surface using the code exactly as it appears in their
  email, with no manual correction, on the first attempt.
- **SC-004**: Pasting a code from an email client succeeds in a single action on every surface,
  including when the paste carries whitespace or separators.
- **SC-005**: A brute-force attempt is defeated: an attacker allowed unlimited network access cannot
  make more than three guesses against one code, nor cause more than five codes to be sent to one
  address in an hour.
- **SC-006**: A used code, a superseded code, and an expired code are each refused **100% of the time**
  across repeated trials.
- **SC-007**: A tester given the sign-in form and a list of addresses — some with accounts, some
  without — **cannot determine which is which** from response content, wording or timing.
- **SC-008**: A search of every log, trace and telemetry store produced during a full sign-in returns
  **zero readable one-time codes**.
- **SC-009**: A new account created through the code route is confirmed with a verified email, and that
  person can subsequently link Google sign-in to the same account — **one person, one account**.
- **SC-010**: Five people unfamiliar with the platform each complete a passwordless sign-in on first
  attempt without asking how many digits to enter.
- **SC-011**: A screen reader announces every code field as a single one-time-code field on every
  surface; device autofill populates it in one action on both mobile platforms.
- **SC-012**: Applying the change produces **zero replaced identity pools and zero replaced application
  clients**, verified from the change plan before it is applied, and no person loses their account or
  is signed out unexpectedly.
- **SC-013**: A single surface can be reverted to the previous flow and back again without an
  infrastructure change, and without any person being unable to sign in during either transition.
- **SC-014**: Every surface is verified on a real device or browser, on **both** mobile platforms.
  Android has gone unlooked-at across three consecutive features; that does not repeat here.
- **SC-015**: Sign-in success rate and time-to-signed-in are no worse after the change than before,
  measured on each surface.

---

## Assumptions

- **The eight-digit observation is treated as unverified until measured** (FR-037). Every requirement
  here holds regardless of the exact current length; the measurement exists to confirm the premise
  before building on it, not to decide the target.
- **Six digits is the operator's product decision**, made on the industry-standard convention. This
  spec records that it is a **reduction** in security strength relative to eight — one recognised
  standard permits it, another prefers eight — and treats the compensating controls in FR-007…FR-019
  as the price of the decision rather than as optional hardening.
- **The identity provider's supported extension points are the route.** Building an authentication path
  outside the provider entirely was considered and rejected: it would require the platform to broker
  authentication, which the governing principle forbids.
- **The three client SDKs in use all support the required flow.** This was confirmed against each
  vendor's current documentation. Surface parity is achievable; no surface is knowingly left behind. A
  historical defect in one SDK, where the flow could issue a session *without* presenting the
  challenge, is assumed fixed but MUST be regression-tested rather than trusted.
- **Rollout is per-surface, internal audiences first.** Admin and shop are small, employee-only
  populations where a failure is a support ticket; the customer audience is last and split between web
  and mobile. Sequencing is a planning concern, but the spec assumes it is not a single flip.
- **Email delivery is a hard dependency.** The platform's outbound mail path must be verified as
  production-capable before rollout: under this feature a failure to send a code is a failure to sign
  in, whereas today the identity provider's own sender is the fallback. Delivery capacity, sender
  reputation and any sending-mode restrictions must be confirmed before the customer audience is
  migrated.
- **Existing accounts are unaffected.** Nobody is migrated, re-verified, re-provisioned, or signed out
  by this change.
- **Backend token validation needs no change.** Nothing anywhere inspects how a person authenticated;
  issued tokens carry the same issuer, audience, subject, use and group information as before. This was
  verified across every consumer.
- **Five minutes, three attempts, five sends per address per hour** are the chosen values, set to sit
  inside the identity provider's own published bands for the equivalent managed controls so the change
  is not a loosening. They are stated in FR-008, FR-011 and FR-012 so they are testable, and are
  tunable in planning if measurement shows them to be user-hostile.
- **The shared code-input component (FR-035) is new work on both web and mobile.** Neither the web
  design system nor the mobile kit has one today, which is a direct cause of the defect this feature
  fixes.
