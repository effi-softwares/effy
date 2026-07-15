# Feature Specification: Shop Mobile Foundation (Bootstrap)

**Feature Branch**: `014-shop-mobile-foundation`

**Created**: 2026-07-15

**Status**: Draft

**Input**: User description: "Bootstrap the shop mobile app (`apps/shop-mobile`, currently the base
template) — same tech and architecture as the customer mobile app (Clean Architecture + MVVM), with the
Amplify SDKs used natively for authentication. But: shop users **cannot self-register**, and the **only**
sign-in method is **email one-time code**, exactly like the shop-web app. Use the **shop** Cognito pool the
web app already uses, and create a **new app client** for the mobile app."

> **Note on this document.** The request carries technology and infrastructure directives (the tech stack,
> the Amplify SDK strategy, the pool, the new app client). Per Principle I, **specs carry zero technology**.
> Those directives are preserved verbatim in [planning-inputs.md](planning-inputs.md) — binding input to
> `/plan`, not to this document. Nothing was discarded; it was moved to the artifact allowed to hold it.

---

## Why this slice exists

The shop is one of the platform's four audiences, and — like the customer — it is served by **two**
surfaces that must stay at parity. The web half exists ([007](../007-shop-web/),
[009](../009-shop-management/)). The mobile half is **still the empty scaffold it was generated as**.

The platform has already written down, in
[docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md), exactly what the shop
audience can do and which surface delivers it. **Every mobile cell in that register reads ⬜ outstanding**,
and the register even names, row by row, what this bootstrap slice must build. That register is this
feature's definition of done.

**The shop audience is not the customer audience, and the difference is the whole point of this spec.**
The customer self-registers, arrives from a search engine, and mostly never signs in. A shop operator is
the opposite in every way:

- **An Effy employee, provisioned by staff.** There is **no self-registration**, and there never will be —
  a shop operator's account is created by the back-office when a shop is set up ([009](../009-shop-management/)).
- **One credential, and it is passwordless.** The only way in is an **emailed one-time code**. There is
  **no password on this audience, anywhere** — no password field, no "set a password", no "forgot
  password". (Constitution Principle IV: the internal audiences are strictly passwordless EMAIL_OTP.)
- **Login-first, not guest-first.** There is nothing to browse without an account. The app opens to
  sign-in (or straight to the app if a session is remembered); there is **no guest experience**.
- **Governed by a role, and the role does not decide access.** A shop operator is a `shop_manager` or a
  `shop_staff` (or neither, yet). The interface adapts to the role, but **the platform's own record — not
  the role claim — decides what the operator may actually do.**

This is a **bootstrap slice**, in the same sense as 007 (shop-web) and 013 (customer-mobile): a narrow
amount of *product* and a large amount of *foundation*. It proves the shop audience's second surface can
authenticate, read its record, and honour the platform's authorization — the foundation every later shop
mobile slice (fulfillment, inventory, orders) stands on.

---

## Clarifications

### Session 2026-07-15

- **Q: What is the sign-in method?** → **A: Email one-time code only, and nothing else.** No password, no
  self-registration, no account recovery, no federated sign-in. A shop operator receives a code at their
  work email and enters it. This mirrors the shop-web surface exactly, and it is the constitution's rule
  for the platform's internal audiences (Principle IV).

- **Q: Crash reporting and product analytics — the shop parity register (row 9) scopes them into this
  bootstrap slice, and Principle VII requires both on every mobile surface. In scope?** → **A: Deferred to
  a later slice.** This is a **knowing deviation from Principle VII**, taken to keep the two mobile surfaces
  consistent — the sibling customer-mobile slice (013) deferred the same, and shipping one mobile surface
  with telemetry and one without would be its own inconsistency. It is recorded in *Constitution Impact*
  below and **MUST** be carried into the plan's Complexity Tracking with a justification and a named closing
  slice. **⚠ The shop parity register MUST be reconciled in this change** — row 9 moves from an implied
  mobile deliverable to explicitly deferred, so the register does not overstate what mobile delivers.

- **Q: How far does the app travel to be "done"?** → **A: It runs.** Builds and runs on an Android
  device/emulator **and** an iOS device/simulator, and completes every flow in this spec against the **real
  development environment** (the dev shop pool). Store enrolment, signing identities, provisioning profiles,
  and TestFlight / Play distribution are **out of scope** — a distribution slice of their own.

- **Q: What does an operator do once signed in, given there are no fulfillment features yet?** → **A: the
  same as shop-web's bootstrap (007).** They see who the platform says they are (identity, role, status,
  assigned shop), the interface adapts to their role, and the platform's **manager gate** is proven —
  exactly the ⬜ rows of the parity register, nothing more. Fulfillment, inventory, and order handling are
  later slices.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — An operator signs in with a code emailed to them (Priority: P1)

A shop operator opens the app. Because they are staff, not a self-registering member of the public, the app
does not offer to create an account and never asks for a password. It asks for their **work email**, sends a
**one-time code** to that address, and lets them enter it to sign in. That is the only way in.

**Why this priority**: This is the app's existence and its first law. The shop audience is passwordless,
admin-provisioned, login-first (parity rows 1, 4). An app that shows a password field, a "sign up" link, or
a guest home has already broken the audience's rules before it has a single feature. Everything else is
reachable only after the operator is signed in.

**Independent Test**: On a provisioned shop account, enter the email, receive a code, enter it, and reach the
signed-in app — on both Android and iOS. Confirm there is **no** password field, **no** sign-up affordance,
and **no** guest content anywhere.

**Acceptance Scenarios**:

1. **Given** a provisioned shop operator, **When** they enter their work email and request a code, **Then** a
   one-time code is sent to that email and the app prompts them to enter it.
2. **Given** the emailed code, **When** the operator enters it, **Then** they are signed in and reach the app.
3. **Given** the app at any point in the sign-in flow, **When** it is inspected, **Then** there is **no
   password field, no "create account" / "sign up", and no "forgot password"** — the only credential is the
   emailed code.
4. **Given** an email that is **not** a provisioned shop operator, **When** a code is requested, **Then** the
   response **does not disclose whether the email is registered** — it behaves the same as for a real
   operator (the message is uniform).
5. **Given** repeated code requests or wrong-code attempts, **When** they continue, **Then** the platform
   throttles them, and the app explains the wait rather than looping or appearing broken.
6. **Given** the app renders on iOS, **When** the operator navigates, **Then** it follows the platform's
   conventions (and Android conventions on Android); it is not a web page in a frame, and it works in dark
   mode.

---

### User Story 2 — The app remembers the operator (Priority: P2)

Having signed in, the operator stays signed in — closing the app, killing it, or coming back tomorrow does
not force them to enter another code. When they deliberately sign out, the session is gone. And if the app
sends them to sign in from somewhere specific, it returns them there afterwards.

**Why this priority**: Parity rows 2, 3. An operator who must request a fresh code every time they open the
app cannot do their job. It is also where credential storage becomes a security requirement — on a phone, a
session is a file on a device that can be lost.

**Independent Test**: Sign in. Force-quit the app. Reopen — confirm still signed in with no code required.
Sign out — confirm the next launch requires signing in again, and that no usable session remains on the
device.

**Acceptance Scenarios**:

1. **Given** a signed-in operator, **When** the app is force-quit and relaunched, or the device restarted,
   **Then** they are still signed in with no interaction required.
2. **Given** a signed-in operator whose session has aged, **When** they use the app, **Then** it is renewed
   silently while renewal is possible; they are asked for a new code only when it genuinely is not.
3. **Given** a signed-out operator who opens a protected destination directly (deep link, notification),
   **When** the app loads, **Then** they are sent to sign in, and **returned to that destination** after
   signing in.
4. **Given** a signed-in operator, **When** they sign out, **Then** the session ends, the next launch
   requires signing in, and **no usable session credential remains on the device**.
5. **Given** a signed-in operator's device is inspected, **When** the stored session is examined, **Then** it
   is held in the device's **protected credential storage** — not plain files or app preferences, and not
   readable by another app.

---

### User Story 3 — The operator sees who the platform says they are (Priority: P3)

Signed in, the operator sees their own identity as the **platform records it** — their name/email, their
role, their status, and the shop they are assigned to. If they have no role yet, or no shop yet, the app
shows that as a normal, expected state — not an error, not a broken screen.

**Why this priority**: Parity row 5. This is the record-backed identity every later capability reads, and it
is where the "claim is the origin, the record is the authority" rule first shows up on this surface. A
role-less or shop-unassigned operator is a **legitimate state** (an account provisioned but not yet fully
set up), and the app must not treat it as a failure.

**Independent Test**: Sign in as a fully-provisioned manager assigned to a shop — confirm the identity, role,
and shop are shown. Sign in as an operator with **no role** and **no shop** — confirm the app shows them
signed in with an "unassigned" state, not an error.

**Acceptance Scenarios**:

1. **Given** a signed-in operator, **When** the app shows their identity, **Then** it shows what the
   **platform's record** says — their name/email, role(s), status, and assigned shop — **not** what their
   credential claims.
2. **Given** an operator the platform has **no email for yet**, **When** their identity is shown, **Then**
   the app handles the missing email gracefully — it does **not** invent one or show a raw identifier.
3. **Given** an operator with **no role** and/or **no assigned shop**, **When** they sign in, **Then** the
   app presents this as an **expected, in-progress state**, not an error or a dead end.
4. **Given** the first time an operator appears on this surface, **When** the platform sees them, **Then** it
   records them (so the audience's own account system knows them), and doing so twice records **one** person,
   not two.

---

### User Story 4 — The interface adapts to the role, but the platform decides access (Priority: P4)

The app shows a `shop_manager` more than it shows a `shop_staff` — manager-only areas simply are not offered
to staff. But hiding a control is a courtesy, not a lock. When the operator actually reaches for a
manager-only capability, the **platform** decides whether to allow it — from its own record of the
operator's role, their status, **and** the shop they are assigned to — and a refusal looks the same no matter
which of those failed.

**Why this priority**: Parity rows 6, 7 — the security core of this surface. This is where a second surface
most easily goes wrong: by trusting the hidden control, or by trusting the role in the token. The platform's
**manager gate** decides from the record (role **and** status **and** shop scope); the hidden UI is never the
guard.

**Independent Test**: Sign in as `shop_staff` — confirm manager-only areas are not shown. Sign in as a
`shop_manager` assigned to an **active** shop — confirm the manager capability is granted. Sign in as a
`shop_manager` with **no assigned shop** (or an inactive one) — confirm the manager capability is **refused**
despite the manager role, with a denial that does not reveal which term failed.

**Acceptance Scenarios**:

1. **Given** a `shop_staff` (or role-less) operator, **When** the app renders, **Then** manager-only
   destinations and controls are **not shown**.
2. **Given** any operator, **When** a manager-only capability is exercised, **Then** the **platform** decides
   access from its record — the operator's **role AND status AND assigned-shop scope** — and the app never
   treats the hidden control as the authorization.
3. **Given** a `shop_manager` served at an **active** shop, **When** they exercise the manager capability,
   **Then** it is **granted**.
4. **Given** a `shop_manager` with **no assigned shop**, or an **inactive** shop, or a **disabled** operator
   status, **When** they exercise the manager capability, **Then** it is **refused** — the manager role alone
   is not enough.
5. **Given** any refusal, **When** it is shown, **Then** it is **uniform** — it does not disclose which of
   role, status, or shop scope caused the denial.
6. **Given** the operator's role, **When** its source is traced, **Then** the role is the **origin** of what
   is offered, but the **platform record is the authority** on what is allowed — a stale or altered role
   claim never grants access the record denies.

---

### User Story 5 — A shop credential works nowhere else, and failures are handled gracefully (Priority: P5)

The credential the operator holds is a **shop** credential. It gets them into the shop app and its services,
and it is refused, structurally, by every service built for another audience. When the network is down, the
session has expired, or a request is denied, the app says so plainly and lets the operator recover — it never
shows a raw error or leaks internal detail.

**Why this priority**: Parity rows 8, 10. Cross-pool isolation is an audience-level guarantee this surface
must not weaken, and graceful degraded/expired/denied states are what make the app usable in a warehouse with
patchy signal.

**Independent Test**: Present a shop credential to a service scoped to another audience — confirm structural
refusal. Kill the network mid-use — confirm a plain degraded state with retry, nothing lost. Let the session
expire — confirm a clean path back to signing in.

**Acceptance Scenarios**:

1. **Given** a shop credential, **When** it is presented to any service scoped to customers, drivers, or
   back-office staff, **Then** it is **structurally refused** — not by a check that could be forgotten.
2. **Given** the app needs data, **When** its requests are traced, **Then** it presents its credential
   **only** to the shop audience's own services.
3. **Given** the network is unavailable or a backend is unreachable, **When** the operator uses the app,
   **Then** it shows a **degraded state with a way to retry**, loses nothing already entered, and does not
   show a raw error.
4. **Given** the operator's session has expired, **When** they act, **Then** the app routes them cleanly back
   to signing in — not to a broken or blank screen.
5. **Given** any error the app surfaces, **When** it is shown, **Then** it carries **no internal detail** and
   no information about which internal check failed.

---

### User Story 6 — A developer builds the app for an environment without holding a secret (Priority: P6)

A developer checks out the repository and builds the app for the development environment. Every value the app
needs comes from **configuration supplied at build time**, none of it in version control. Pointing the app at
a different environment is a **change of configuration, not code**. Nothing that grants capability is baked
into the shipped application.

**Why this priority**: It is last because it is invisible to operators — and it is *in* this spec because a
mobile app is the one surface where a leaked build is a file in a stranger's hands, permanently, with no way
to revoke it.

**Independent Test**: Search the working tree for environment-specific values and secrets; find none. Build
fresh for the development environment from configuration alone. Inspect the built application for any value
whose disclosure grants capability; find none.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** the repository is searched for environment endpoints, identifiers,
   and secrets, **Then** none are found — and any generated configuration is likewise absent from version
   control.
2. **Given** a developer wants a different environment, **When** they build for it, **Then** they change
   **configuration only** — no source file is edited, and no backend address is a literal in the code.
3. **Given** a build, **When** the shipped application is inspected, **Then** it contains **no value whose
   disclosure grants capability** — no shared secret of any kind. Public identifiers a mobile client must
   carry, which grant nothing on their own, are permitted and are **not** secrets.
4. **Given** required configuration is missing, **When** a build is attempted, **Then** it **fails at build
   time** naming what is missing — it does not produce an app that runs against the wrong environment.

---

### Edge Cases

- **The operator requests a code and it doesn't arrive.** How long do they wait, what are they told, and can
  they ask for another without being throttled into a corner?
- **The operator's account is disabled while they are signed in.** A disabled operator cannot even get a
  session — but if disabled mid-session, what happens on their next action?
- **The operator's shop is suspended or disabled** while they are signed in. Sign-in still works; manager
  capabilities refuse. Is that legible to the operator?
- **A `shop_manager` has no shop assigned yet** (provisioned but not placed). They can sign in and see their
  identity; the manager gate refuses. Is the "not yet" state clear rather than looking like a bug?
- **The role claim and the platform record disagree** (a role was changed in the back-office but the token is
  stale). The record wins; does the app reflect it on the next read?
- **The device has no network** at sign-in, or loses it mid-session in a warehouse.
- **The device is reinstalled.** The operator is signed out (their credential storage went with it) — handled
  as a normal state, not an error.
- **The largest accessibility font size / a screen reader** — the sign-in and identity flows remain
  completable.
- **The same operator signs in on the phone and the web** at the same time — two sessions, one identity, one
  record; nothing forks.

---

## Requirements *(mandatory)*

### Functional Requirements

#### The app as a surface

- **FR-001**: The platform MUST deliver a shop mobile app that **builds and runs on both Android and iOS**,
  from one shared body of application logic. A capability MUST NOT exist on one platform and be silently
  missing on the other.
- **FR-002**: The app MUST be **login-first**: it opens to sign-in (or straight to the app if a session is
  remembered). There is **no guest experience** — nothing is browsable without an account.
- **FR-003**: The app MUST **feel native on each platform** in **behaviour** — scroll physics, the back gesture,
  text editing, and accessibility MUST be the platform's own, on both platforms — and it MUST NOT port the web
  console's layout.
  - **⚠ Bounded exception (a recorded Principle V deviation — see Constitution Impact row V, inherited from
    013).** **Visual chrome is exempt for now**: the app renders the shared UI framework's default design
    language on **both** platforms, so iOS chrome is not Apple's and does not receive HIG component parity.
    Behaviour (the clause above) is **not** exempt. HIG component parity is deferred to the `iOS native shell`
    slice (shared with 013).
- **FR-003a** *(form factor — tablet-first)*: The app's **primary target is a large-screen tablet** (Android
  tablet / iPad), typically used in **landscape** at a counter or in a back room — **not** a handset. Every
  screen MUST be **designed tablet-first**: it MUST make deliberate use of the available width and height —
  two-pane / master-detail, side-by-side regions, or a content column with a bounded max width on a comfortable
  background, **whichever serves the task** — and MUST NOT ship as a single phone-width column stretched across
  a tablet. Layouts MUST **adapt to the available window size** (respond to size/orientation changes and split-
  screen) rather than assume a fixed one. The app MUST **remain fully usable on a phone** (it is not a
  phone-hostile app), but the phone is the *secondary, compact* case — a graceful reflow of the tablet design,
  never the design the tablet inherits. This governs **every later shop-mobile UI slice**, not just this one.
- **FR-004**: The app MUST render exclusively from **the platform's design tokens** and MUST support **dark
  mode**.
- **FR-005**: Every interactive control MUST meet the platform's **minimum touch-target size** and give
  visible feedback.
- **FR-006**: Every flow MUST remain completable with a **screen reader** and at the device's **largest
  accessibility text size**, without content being cut off or controls unreachable.
- **FR-007**: The app MUST behave **predictably without a network** and when a backend is unreachable: it MUST
  state the condition plainly, offer recovery, and MUST NOT lose input already entered.

#### Identity and credential

- **FR-008**: The **only** credential route MUST be **email one-time code**. The app MUST NOT offer a
  password field, self-registration, account recovery, or any federated route.
- **FR-009**: A shop operator MUST be able to sign in by entering their **work email** and then the **one-time
  code** sent to it.
- **FR-010**: Shop operators MUST NOT be able to **create their own account** from the app — accounts are
  provisioned by the back-office (009), and the app MUST NOT expose any provisioning path.
- **FR-011**: Every authentication failure — unknown email, wrong or expired code, abandoned attempt — MUST
  be reported **without disclosing whether an email is a provisioned operator**.
- **FR-012**: Code-sending and code-entry MUST be **rate-limited**, and the app MUST explain a throttled state
  rather than retry silently or appear broken.
- **FR-013**: The app MUST authenticate against the **shop audience's own identity system** and no other, so
  one operator is one identity on this surface and the web surface alike.

#### Session

- **FR-014**: A signed-in operator's session MUST **survive app termination and device restart** — they MUST
  NOT be asked for a new code merely because the app was closed.
- **FR-015**: The session MUST be **renewed in the background** while renewal remains possible; the operator
  MUST be asked to sign in again only when it genuinely is not.
- **FR-016**: Session credentials MUST be stored in the **device's protected credential storage**, MUST NOT be
  readable by another application, and MUST NOT be present in plaintext in any device backup.
- **FR-017**: An operator reaching a **protected destination while signed out** MUST be sent to sign in and
  **returned to that destination** afterward.
- **FR-018**: Signing out MUST leave **no usable session credential on the device**.

#### Record-backed identity

- **FR-019**: The app MUST show the operator's identity from the **platform's own record** — name/email,
  role(s), status, and assigned shop — **never** from the contents of their credential.
- **FR-020**: The platform MUST **record** each operator the first time they appear on this surface, and doing
  so MUST be **idempotent** — repeated sign-ins MUST NOT create a second record, and the operator MUST land on
  the **same** record the web surface uses for them.
- **FR-021**: A **role-less** operator and an operator with **no assigned shop** MUST be presented as
  **expected, in-progress states** — not errors, not dead ends. A **missing email** MUST be handled
  gracefully, never invented or shown as a raw identifier.

#### Role and authorization

- **FR-022**: The interface MUST be **role-aware**: manager-only destinations and controls MUST NOT be shown
  to `shop_staff` or role-less operators.
- **FR-023**: Access to a manager-only capability MUST be decided **by the platform**, from its own record of
  the operator's **role AND status AND assigned-shop scope** — **never** from the role claim in the credential,
  and **never** by treating the hidden control as the guard.
- **FR-024**: A manager capability MUST be **granted** only to a `shop_manager` whose operator status is active
  **and** who is assigned to an **active** shop; it MUST be **refused** if any of those three is not met — the
  manager role alone is insufficient.
- **FR-025**: An authorization **refusal MUST be uniform** — it MUST NOT disclose which of role, status, or
  shop scope caused it.
- **FR-026**: Authorization MUST **fail closed** — if the platform cannot determine access, it MUST refuse,
  never grant.
- **FR-027**: The role claim is the **origin** of role assignment; the platform record is the **authority** on
  access. A stale or altered role claim MUST NOT grant access the record denies.

#### Isolation, errors, and the record as authority

- **FR-028**: A **shop** credential MUST be **structurally refused** by every service scoped to customers,
  drivers, or back-office staff.
- **FR-029**: The app MUST present its credential **only** to the shop audience's own services.
- **FR-030**: A **disabled** operator MUST be refused. **Normally they are refused at the earliest point** — a
  disabled operator cannot obtain a session at all, and if disabled mid-session they are refused at the identity
  read (→ the *Refused* state). The disabled term also appears in the manager gate (US4 scenario 4) as
  **defense-in-depth** — a redundant backstop, not the primary check. Either way, the record is authoritative;
  the claim is not.
- **FR-031**: The app MUST map backend error conditions to a small set of legible states — **re-authenticate**
  (expired/absent session), **denied** (authorization refusal), **degraded + retry** (backend unavailable) —
  and MUST surface **no internal detail** in any of them.
- **FR-032**: The address of every backend MUST be **configuration, never a literal in code**.

#### Configuration, secrets, and contracts

- **FR-033**: Every environment-specific value the app needs MUST be supplied as **build-time configuration**
  and **MUST NOT be committed to version control** — neither the configuration input nor anything generated
  from it.
- **FR-034**: Switching the app to a different environment MUST be a change of **configuration only** — no
  source edit.
- **FR-035**: A build with **missing or incomplete configuration MUST fail at build time**, naming what is
  missing.
- **FR-036**: The shipped application MUST contain **no value whose disclosure grants capability** — no shared
  secret of any kind. Public identifiers a mobile client must carry, which grant nothing on their own, are
  permitted and are **not** secrets; the distinction MUST be stated explicitly.
- **FR-037**: The shapes the app exchanges with the platform MUST be derived from the platform's **existing
  shared contracts** (the same shop contracts the web surface is typed from), not hand-redefined for this
  surface. Where the surface cannot consume the contract artifact directly, the plan MUST state **how the
  single source of truth is preserved** and how drift is detected.

#### Recording what was built

- **FR-038**: The **shop capability register**
  ([docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md)) MUST be updated in this
  change so that **no** capability's state on the mobile surface is left unstated. A row this feature does not
  deliver MUST say so — including the **telemetry** row, which this slice **defers** (see Constitution Impact),
  so the register does not overstate what mobile delivers.

---

### Key Entities

- **Shop operator identity**: The single identity an operator holds with Effy's shop audience, reached by the
  emailed-code route and shared with the shop-web surface. **One person is one identity** across both.
- **Operator record**: The platform's own record of the operator — the authority on their **role**, their
  **status** (a *disabled* operator is refused), their **assigned shop**, and their email. Distinct from the
  credential; the credential is the origin of identity, the record is the authority on access.
- **Role**: `shop_manager` or `shop_staff` (or none, yet). It shapes what the interface offers; it does **not**
  decide what the platform allows.
- **Manager gate**: The platform's authorization decision for a manager capability — a conjunction of **role**,
  **operator status**, and **assigned-shop scope**, decided from the record, failing closed, refused uniformly.
- **Session**: The device-held proof of a signed-in operator — on a phone, a file on an object that can be
  stolen, which is why its storage, renewal, and destruction are requirements.
- **Environment configuration**: The values binding a build to one environment; supplied at build time, never
  committed, containing nothing that grants capability.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The app **builds and runs on both Android and iOS**, and **every** flow in this spec is
  completable on **both** — zero capabilities present on one platform and missing on the other.
- **SC-002**: A provisioned operator can go from app-open to signed-in **in under 90 seconds** by the emailed
  code, on either platform — with **zero** password fields, sign-up affordances, or guest content anywhere in
  the app.
- **SC-003**: An email that is **not** a provisioned operator produces the **same** response as a real one —
  **zero** disclosure of whether an email is registered, verified adversarially.
- **SC-004**: A signed-in operator force-quits the app, relaunches, and is **still signed in** with **zero**
  interactions — **100%** of the time, on both platforms.
- **SC-005**: A `shop_staff` (or role-less) operator sees **zero** manager-only controls; a `shop_manager` at
  an **active** shop is **granted** the manager capability — **100%** correct role-aware rendering.
- **SC-006**: A `shop_manager` with **no assigned shop**, an **inactive** shop, or a **disabled** status is
  **refused** the manager capability **100%** of the time — the manager role alone never suffices —
  **demonstrated, not asserted**.
- **SC-007**: Every authorization refusal is **uniform** — **zero** refusals disclose which of role, status, or
  shop scope failed.
- **SC-008**: A shop credential is refused by **every** service scoped to another audience — **100%**,
  structurally.
- **SC-009**: After sign-out, **no usable session credential remains on the device** — verified by inspection,
  not asserted.
- **SC-010**: A role-less / shop-unassigned operator signs in and sees an **expected in-progress state** —
  **zero** error screens or dead ends for that legitimate state.
- **SC-011**: A repository sweep finds **zero** environment-specific values or secrets in version control, and
  an inspection of the built application finds **zero** values whose disclosure grants capability.
- **SC-012**: A build attempted with configuration missing **fails at build time** naming what is missing —
  **100%** of the time, never producing a runnable app pointed at the wrong environment.
- **SC-013**: A sweep of logs, diagnostics, and crash records finds **zero** codes or credentials, and no PII
  beyond the authenticated subject id.
- **SC-014**: Every flow is completable with a **screen reader** and at the device's **largest text size**;
  contrast passes in **both** light and dark appearance.
- **SC-014a** *(tablet-first)*: On a **large-screen tablet in landscape** (Android tablet **and** iPad), every
  screen makes deliberate use of the available space — **zero** screens render as a single stretched phone-width
  column — and the layout **reflows gracefully** across tablet-portrait, phone, and split-screen without content
  cut off or controls unreachable. Verified on the device matrix.
- **SC-015**: The shop capability register has **no unstated cell** for the mobile surface, and the deferred
  telemetry row is explicitly marked as deferred rather than implied delivered.

---

## Scope

### In scope

- The shop mobile app on **Android and iOS** as a running, **login-first** app with the platform's design
  language and dark mode.
- **Passwordless EMAIL_OTP sign-in** against the shop audience's identity system — the only credential route.
- **Session** persistence, background renewal, protected on-device storage, destruction, and return-to-intent.
- **Record-backed identity** read: name/email, role(s), status, assigned shop; role-less and unassigned as
  expected states; idempotent recording.
- **Role-aware interface** and the **backend-authoritative manager gate** (role AND status AND shop scope),
  with a uniform, fail-closed refusal.
- **Cross-pool isolation** and **graceful degraded / expired / denied** error states.
- **Per-environment configuration and secrets** handling with a build-time failure that enforces it.
- Updating the **shop capability register** (including marking telemetry deferred).

### Out of scope

- **Self-registration, passwords, account recovery, federated sign-in** — none exist for this audience, by
  constitution. The app ships none of them.
- **Crash reporting and product analytics** — deferred to a named later slice. **A knowing Principle VII
  deviation** (see Constitution Impact); the plan MUST carry it in Complexity Tracking, and the parity
  register is reconciled to say so.
- **Any shop-operations capability** — picking, packing, inventory, order handling, fulfillment. None exist
  for any shop surface yet; this app has a shell and an identity, not a workflow.
- **Shop or shop-user management** — creating shops, assigning staff, enabling/disabling operators. That is
  the back-office's job (009); this app consumes the record, it does not manage it.
- **Store distribution** — Apple Developer / Play Console enrolment, signing, provisioning, privacy manifests,
  TestFlight / Play internal testing. Its own slice.
- **The customer and driver mobile apps.** Customer-mobile is its own slice (013); driver-mobile remains the
  base template.

---

## Constitution Impact

**No amendment is required.** This feature is built entirely inside the constitution as it stands (v1.8.0).
One deviation is taken knowingly and recorded.

| Principle | How this feature stands |
|---|---|
| **I — Spec-Driven** | The request's technology/infra directives were moved, unedited, into [planning-inputs.md](planning-inputs.md). The spec stays WHAT/WHY. |
| **II — Shared Contracts** | This surface consumes the **same shop contracts** the web surface is typed from. FR-037 refuses to let a Kotlin surface become an excuse for hand-copying: the plan MUST state how one source of truth is preserved and how drift is detected. |
| **III — Dual-Path** | No new backend. The shop service already serves both surfaces; this app is a second consumer. No commerce traffic here. |
| **IV — Auth Isolation** | Honoured exactly: the **shop pool only**; **EMAIL_OTP only**, **no self-signup**, **no password**; the `cognito:groups` claim is the **origin** of role, the platform record is the **authority** on access (FR-023/FR-027); a shop credential is structurally refused elsewhere (FR-028). |
| **V — Design** | ⚠ **DEVIATION 1 — recorded, not waived.** Native feel is required (FR-003 – FR-006), but this app inherits 013's decision to render the shared UI framework's default design language on **both** platforms rather than full iOS HIG component parity. See Complexity Tracking. |
| **VI — Layered Architecture** | Clean Architecture per feature; **MVVM** (a ViewModel exposing immutable, observable state + action functions — constitution **v1.8.0**); no DI framework — one hand-wired container. Conforms to `ARCHITECTURE.md` § *Mobile apps*. |
| **VII — Observability** | ⚠ **DEVIATION 2 — recorded, not waived.** Crash reporting and product analytics are **deferred** (mirroring 013), and the shop parity register is reconciled to say so. The plan MUST record this in Complexity Tracking with a justification and a named closing slice. FR-013's no-credential-in-telemetry rule still binds whatever telemetry ships later. |

---

## Assumptions

- **`apps/shop-mobile` exists as a bare scaffold and is the starting point** — the generated template, with the
  app identity already fixed (`com.effyshopping.shop.mobile`). This feature builds *on* it.
- **The shop identity pool, the shop operator record, and the shop service already exist**, built by 007 and
  extended by 009. This surface is a **second consumer** of them, not a new system. **No backend change is
  required** — the shop parity register states this explicitly.
- **Shop operators are provisioned by the back-office (009), and only there.** A shop's creation always
  provisions its first user (a `shop_manager`). There is no self-signup, and the app must not pretend
  otherwise.
- **The two mobile surfaces (customer and shop) share tech and architecture.** Where this spec restates a rule
  013 already established, that is intentional: a security or architecture property that exists only as "the
  other app does it" is one that gets lost.
- **The manager gate cannot be fully signed off live yet** — its positive half (a manager *served* at an
  active shop) and the inactive-shop / disabled-operator denials depend on shop data the back-office creates.
  The gate's **negative half** (staff, role-less, and an unassigned manager all refused) can be proven live
  now, exactly as 007 did. This is a **partial-by-design** sign-off, inherited from 007.
- **The app is used primarily on large-screen tablets** (Android tablets / iPads), typically in **landscape**,
  in a shop's counter / back-room setting — a shared workplace device, not a personal handset. This is why the
  design is **tablet-first** (FR-003a) and the refresh window is shorter than the customer app's (research D6s).
  A phone remains fully supported as the secondary, compact form factor.
- **The definition of done is a running app on a real device and a simulator, against the real development
  environment** — not a store build (see Clarifications). The device matrix therefore leads with a **tablet**
  (Android tablet **and** iPad, in landscape) and includes a phone as the compact case.

---

## Dependencies

- **007-shop-web** — the shop identity pool, the operator record, the identity read (`shop/v1/me`), the
  manager gate (`shop/v1/manager-ping`), the error contract, and the cross-pool isolation guarantee. This app
  reproduces 007's auth natively and calls the **same** backend.
- **009-shop-management** — provisioning (a shop's creation makes its first operator), the operator/shop
  statuses, and the data the manager gate's **positive** half needs for live sign-off.
- **013-customer-mobile-foundation** — the tech and architecture this app mirrors (KMP + Compose, Clean +
  MVVM, the native auth-driver pattern, generated contracts/theme, build-time config discipline, the shared
  design tokens). The differences are the audience's: EMAIL_OTP-only, admin-provisioned, login-first, RBAC.
- **The shared shop contracts** — `packages/shared-types` shop types and the 007 endpoint/error contracts, the
  single source of truth both surfaces type from (Principle II, FR-037).
- **The shop parity register** — [docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md),
  binding, and updated by this change (FR-038).
</content>
