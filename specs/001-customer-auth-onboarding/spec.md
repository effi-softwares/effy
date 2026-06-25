# Feature Specification: Customer Auth & Onboarding

**Feature Branch**: `001-customer-auth-onboarding`

**Created**: 2026-06-25

**Status**: Draft

**Input**: User description: "Auth + customer onboarding — a new customer can sign up with email
and verify via a one-time code; a returning customer can sign in and stay signed in across app
restarts; a profile is created automatically on first sign-in; a customer can sign out; clear
feedback on every error. Customer surface only (mobile + web)."

## Clarifications

### Session 2026-06-25

- Q: When a returning customer signs in, how do they prove identity — passwordless emailed
  code, or a password? → A: Passwordless — a one-time code is emailed for every sign-in (same
  mechanism as sign-up); no password is ever set or stored.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create an account and land signed in (Priority: P1)

A first-time customer opens the app (mobile or web), enters their email address, receives a
one-time verification code by email, enters it, and is immediately signed in with a customer
profile that now exists. This is the entry point to the entire platform — nothing else a
customer does is reachable until this works.

**Why this priority**: Customers cannot browse, order, or do anything until they have an
account and an active signed-in session. This is the foundational flow every other feature
depends on, and the first end-to-end slice that proves the platform's structure.

**Independent Test**: Using a brand-new email, complete sign-up by entering the emailed code,
and confirm the app reaches the signed-in state with a profile present. Fully testable on its
own with no other story implemented.

**Acceptance Scenarios**:

1. **Given** a new (unregistered) email, **When** the customer requests to sign up and enters
   the verification code sent to that email, **Then** their account is created, a customer
   profile is created automatically, and they land in the signed-in state.
2. **Given** a customer has entered their email, **When** the verification code is delivered,
   **Then** it arrives at that email address and is usable to complete verification.
3. **Given** an email that is already registered, **When** the customer attempts to sign up
   with it, **Then** they see a clear "already registered" message that points them to signing
   in instead.

---

### User Story 2 - Returning customer signs in (Priority: P2)

A customer who already has an account returns later, enters their email, proves their identity,
and reaches the signed-in state.

**Why this priority**: Without repeatable sign-in, accounts are single-use. Required for any
returning customer, but depends on accounts existing (US1).

**Independent Test**: With a pre-existing account, complete the sign-in flow and confirm the
app reaches the signed-in state.

**Acceptance Scenarios**:

1. **Given** an existing account, **When** the customer enters the one-time code emailed to
   them at sign-in, **Then** they reach the signed-in state and their existing profile is
   available.
2. **Given** an existing account, **When** the customer enters an incorrect or expired code,
   **Then** they see a clear, specific message and can retry or request a new code.

---

### User Story 3 - Stay signed in across restarts (Priority: P2)

A signed-in customer closes/force-quits the app or browser and reopens it later, and is still
signed in without having to authenticate again.

**Why this priority**: A platform that signs customers out every time they close the app feels
broken and kills retention. High UX value; depends on a session existing (US1/US2).

**Independent Test**: Sign in, force-quit and reopen the app (and on web, close and reopen the
browser/tab), and confirm the customer is still signed in.

**Acceptance Scenarios**:

1. **Given** a signed-in customer, **When** they force-quit and reopen the app, **Then** they
   are still signed in and land in the signed-in state.
2. **Given** a signed-in customer on web, **When** they close and reopen the browser within the
   session lifetime, **Then** they remain signed in.
3. **Given** a customer whose session has expired, **When** they reopen the app, **Then** they
   are returned to the signed-out state gracefully and prompted to sign in again.

---

### User Story 4 - Sign out (Priority: P3)

A signed-in customer chooses to sign out and is returned to the signed-out state; signing back
in is required to continue.

**Why this priority**: Completes the auth loop and is required for shared devices and privacy,
but is the least frequent action and lowest complexity.

**Independent Test**: From the signed-in state, sign out and confirm the app returns to the
signed-out state and blocks access to signed-in functionality until the customer signs in
again.

**Acceptance Scenarios**:

1. **Given** a signed-in customer, **When** they sign out, **Then** they return to the
   signed-out state.
2. **Given** a customer who has just signed out, **When** they attempt to reach signed-in
   functionality, **Then** they are required to sign in again first.

---

### Edge Cases

- **Wrong code**: customer enters an incorrect verification code → clear "that code isn't
  right" message; the flow remains open to retry.
- **Expired code**: code is entered after it has expired → clear "this code has expired"
  message with an option to request a new code.
- **Resend / new code**: customer requests a new code → a fresh code is issued and any prior
  code for that attempt is invalidated.
- **Email already registered (sign-up)**: routed to sign-in rather than creating a duplicate.
- **Too many attempts**: repeated wrong codes or repeated code requests are rate-limited, with
  a clear message explaining when to try again.
- **Email never arrives / delayed**: customer can re-request a code after a short cooldown.
- **Abandoned mid-flow**: customer enters email but never enters a code → no account is created
  and they can restart cleanly.
- **Invalid email format**: rejected with a clear message before any code is sent.
- **Same email used on both mobile and web**: resolves to the same single account.
- **Network loss during verification**: customer sees a clear retry path; no partial/duplicate
  account is created.
- **Session expires while the app is open**: customer is moved to the signed-out state
  gracefully at the next protected action rather than seeing an opaque failure.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow a new customer to begin sign-up by providing an email address.
- **FR-002**: System MUST send a one-time verification code to the provided email address.
- **FR-003**: System MUST let the customer complete verification by entering the code, and on
  success create their customer account.
- **FR-004**: System MUST place the customer in the signed-in state immediately upon successful
  sign-up verification (no separate sign-in step is required right after sign-up).
- **FR-005**: System MUST automatically create a customer profile on the customer's first
  successful sign-in if one does not already exist.
- **FR-006**: System MUST allow a returning customer with an existing account to sign in by
  entering a one-time verification code emailed to them at sign-in time (passwordless). No
  password is set or stored at any point.
- **FR-007**: System MUST keep a signed-in customer signed in across app restarts and browser
  sessions until they sign out or their session expires.
- **FR-008**: System MUST allow a signed-in customer to sign out and return to the signed-out
  state.
- **FR-009**: After sign-out, System MUST require successful authentication before granting
  access to any signed-in functionality.
- **FR-010**: System MUST allow the customer to request a new verification code when the prior
  code was not received or has expired.
- **FR-011**: Verification codes MUST be single-use and MUST expire after a bounded time;
  requesting or using a new code MUST invalidate the prior one.
- **FR-012**: System MUST present clear, specific, actionable feedback for each failure case:
  wrong code, expired code, email already registered (sign-up), invalid email format, and
  too-many-attempts. (Wrong-password feedback applies only if the password-based option in
  FR-006 is chosen.)
- **FR-013**: System MUST treat the email address as the unique identifier for a customer
  account; a sign-up attempt with an already-registered email MUST NOT create a duplicate and
  MUST guide the customer to sign in.
- **FR-014**: System MUST rate-limit repeated code entries and repeated code requests to deter
  abuse, and communicate the limit to the customer.
- **FR-015**: This flow MUST apply to the customer audience only and MUST NOT grant access to
  driver, store, or admin surfaces.
- **FR-016**: Behavior and outcomes for all scenarios above MUST be equivalent on the mobile
  app and the web app (parity across the two customer surfaces).

### Key Entities *(include if feature involves data)*

- **Customer Account**: The customer's identity. Key attributes: unique email address,
  verification status, creation time. One account per email.
- **Customer Profile**: The customer's profile record, created automatically on first sign-in
  and linked one-to-one to the account. Holds basic profile information at creation (at minimum
  the email and creation time); richer profile fields are future slices.
- **Verification Code**: A short-lived, single-use code tied to a specific email/sign-up or
  sign-in attempt, with an expiry and an attempt count.
- **Session**: Represents the signed-in state for a customer on a device/surface; persists
  across restarts until sign-out or expiry.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A new customer can go from entering their email to being signed in within
  2 minutes, assuming the verification email arrives promptly.
- **SC-002**: 95% of verification codes are delivered to the customer's inbox within 30 seconds
  of being requested.
- **SC-003**: A returning customer can complete sign-in within 60 seconds.
- **SC-004**: 100% of force-quit-and-reopen events keep an active customer signed in, for the
  full session lifetime, until they sign out.
- **SC-005**: Every error condition listed in FR-012 produces a distinct, actionable message —
  zero ambiguous or generic errors for those cases.
- **SC-006**: After sign-out, 100% of attempts to reach signed-in functionality require
  re-authentication.
- **SC-007**: The listed scenarios produce equivalent outcomes on mobile and web, verified on
  both surfaces.

## Assumptions

- **Auth method default**: Unless FR-006 is resolved otherwise, sign-in is assumed to be
  passwordless (a one-time emailed code), consistent with the platform's established
  email-code authentication. The "wrong password" feedback is included only as a contingency
  if the password-based option is selected.
- **Session lifetime**: "Stay signed in" assumes a long-lived session with silent renewal; the
  exact duration and renewal behavior are an implementation decision for the plan, not a
  product requirement here. A reasonable default is on the order of weeks.
- **Profile minimalism**: The auto-created profile is intentionally minimal at this stage
  (identity + timestamps). Collecting additional profile details (name, phone, addresses) is a
  later slice.
- **Email delivery**: An email delivery mechanism is available to send verification codes;
  deliverability/spam handling is outside this feature's behavioral scope.
- **Single customer audience**: Only the customer audience is in scope; the other audiences
  (driver, store, admin) are explicitly separate and out of scope here.

### Out of Scope

- Social / third-party login (e.g., Google, Apple).
- Password reset / recovery (a separate slice).
- Account deletion.
- Driver, store, and admin authentication.
- Collecting extended profile details beyond the minimal auto-created profile.
