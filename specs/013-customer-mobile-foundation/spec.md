# Feature Specification: Customer Mobile Foundation (Bootstrap)

**Feature Branch**: `013-customer-mobile-foundation`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "Set up the customer mobile app (`apps/customer-mobile`, currently the
base template) for Android and iOS — the mobile counterpart of the customer web storefront. It needs
its dependency baseline, authentication against the customer identity pool the web app already uses,
per-environment configuration and secrets that never enter version control, and the platform's layered
architecture (Clean Architecture + MVVM in the presentation layer). Follow industry-standard patterns
for Kotlin Multiplatform, Android, and iOS."

> **Note on this document.** The feature request arrived with a detailed technology stack (a library
> list, a native-SDK authentication strategy, a build-time configuration mechanism). Per Principle I,
> **specs carry zero technology**. That input is preserved verbatim and unedited in
> [planning-inputs.md](planning-inputs.md) and is binding input to `/plan`, not to this document.
> Nothing was discarded; it was moved to the artifact that is allowed to hold it.

---

## Why this slice exists

The customer is the only audience Effy does **not** employ, and it is the only audience served by
**two** surfaces that must stay at parity. The web half of that pair exists
([011](../011-customer-storefront-web/), [012](../012-customer-profile-management/)). The mobile half
is **still the empty scaffold it was generated as** — three template files that print a greeting.

The platform has already written down, in
[docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md), exactly what
the customer audience can do and which surface delivers it. Every mobile cell in that register reads
**⬜ outstanding**. That register is this feature's definition of done, and it says something this spec
must not soften:

> *"A mobile app that lets a passwordless customer set a password **from a bare session** would
> re-open, on a second surface, the exact account-takeover primitive [012] was built to close. Whatever
> the mobile slice does, **the emailed-code step-up is not optional** — it is the capability, not an
> implementation detail of the web one."*

A second surface is where a security property quietly dies. It is re-implemented by a different person,
against a different SDK, under different constraints — and the property that was argued for and proven
on the first surface is reduced to a behaviour nobody remembered to copy. This spec therefore states the
customer audience's **security properties as first-class requirements of this surface**, not as
inherited context.

This is a **bootstrap slice**, in the same sense as 005 (back-office) and 007 (shop-web): it delivers a
narrow amount of *product* and a large amount of *foundation*. The foundation it proves is the one every
later mobile slice — catalog, cart, checkout, orders — stands on.

---

## Clarifications

### Session 2026-07-14

- **Q: Should the mobile app offer Google sign-in?** → **A: No — parked, mirroring the web surface.**
  The parity register records Google as **⏸ PARKED** on web as of 2026-07-14: built, tested, dormant
  behind a flag, because un-parking it **requires the account-linking trigger in the same change** —
  federation without it hands an existing customer a *second* account, and **there is no retroactive
  merge**. Mobile ships the two native routes (email+password, email one-time code). Google un-parks on
  **both** customer surfaces together, in one change, or on neither.

- **Q: Crash reporting and product analytics — Constitution Principle VII requires both on every mobile
  surface. Are they in this slice?** → **A: Deferred to a later slice.** This is a **knowing deviation
  from Principle VII** — **one of two** this feature takes (the other is the iOS-chrome deviation
  below). It is recorded in *Constitution Impact* below and **MUST** be carried into the plan's
  Complexity Tracking with a justification and a named slice that closes it. It is not a silent omission,
  and it is not permission to ship the platform's first mobile surface permanently unmeasured.

- **Q (raised during planning, 2026-07-14): iOS native feel — Principle V requires iOS to follow Apple
  HIG, but a shared Compose UI renders Material 3 (Android's design language) on iOS, and Apple's iOS 26
  "Liquid Glass" system look is painted only for native chrome.** → **A: Ship Material 3 on both
  platforms for now; record the deviation, do not amend the constitution.** iOS keeps native scroll
  physics, native back-swipe, native text editing, and native accessibility, but its **chrome is
  Material's, not Apple's** — a **knowing Principle V deviation**, bounded and reversible (the presentation
  layer is the only thing a later HIG pass touches; ViewModels/domain/data are shared). It is the
  **second** deviation in this feature, recorded in *Constitution Impact* row V and carried into the
  plan's Complexity Tracking with a named closing slice (`iOS native shell`). The HIG-conformant
  alternative (a SwiftUI shell hosting Compose content) is JetBrains' own documented pattern and is what
  that later slice adopts.

- **Q: How far does the app have to travel to be "done"?** → **A: It runs.** Done means: builds and runs
  on an Android device/emulator **and** an iOS device/simulator, and completes every flow in this spec
  against the **real development environment**. Store enrolment, code signing identities, provisioning
  profiles, privacy manifests, and TestFlight / Play internal distribution are **out of scope** — a
  distribution slice of their own.

- **Q: What raises the deferred sign-in demand, given the app has no cart or checkout?** → **A: the
  Account area.** A guest who taps **Account** is asked to sign in; on success they land on Account, and on
  declining they return to browsing having lost nothing. The web surface built a **placeholder checkout**
  for this purpose; mobile does **not** — a fake screen that lies about the product, and must be deleted
  when real checkout lands, is a worse proof than a real destination that genuinely requires an account.
  This makes US3 **testable**, which it was not.

- **Q: With no catalog anywhere in the platform, what does a guest actually see?** → **A: an honest empty
  state.** A home screen that says, in the product's voice, that the store is being stocked. **No mock
  products, no placeholder grid, no dummy data** — mock data has a habit of surviving into the slice that
  was supposed to replace it, and it would make SC-002 pass against something that does not exist. The home
  screen's job here is to prove the shell, the design tokens, and dark mode. It is thin **on purpose**.

- **Q: How long may a customer stay signed in without authenticating again?** → **A: 90 days from sign-in.**
  Originally answered "30 days of inactivity"; **planning proved that unbuildable** — the identity service has
  **no inactivity window at all** (see FR-019a). Restated in terms the platform can honour, and lengthened so the
  intent survives: a customer who keeps using the app is never signed out; one who wanders off for a month is not
  either; a **lost or stolen phone is still a bounded exposure**, not indefinite access. Carries an **operator
  step** (see Dependencies).

- **Q: What happens to a customer who is barred *while signed in* on the phone?** → **A: refused, then
  signed out.** The platform refuses their next action (FR-033) and the app **destroys the local session**
  and says why. A phone must not sit holding a credential that no longer means anything.

> **⚠ Correction made during clarification (2026-07-14).** FR-027 and US5 originally said a password change
> signs out *"every **other** device"*, preserving the current one. **That was inherited from 012's
> *pre-amendment* text.** 012's FR-024 was amended during its planning for a hard reason: the identity
> service revokes sessions **all-or-nothing** and cannot enumerate the others to spare the current one, so
> "sign out all but this device" **is not expressible**. The requirement was strengthened rather than quietly
> weakened to "revoke nothing". This spec now carries the **amended** requirement: **everything goes,
> including this phone.** (012's own SC-006 and Assumptions still carry the stale wording — that is drift in
> **that** artifact, and its FR-024 is the authority.)

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A shopper opens the app and is never asked who they are (Priority: P1)

Someone installs Effy, opens it, and uses it. The app does not greet them with a sign-in wall, does not
ask for an account, and does not treat "no account" as a broken state. It looks and behaves like an app
built for their phone — not a web page in a frame — and it works in dark mode because that is how most
people hold a phone at night.

**Why this priority**: This is the app's existence and its first law. The customer audience is
**guest-first** on web (parity row 1), and a mobile surface that opens with a login screen has already
broken parity before it has a single feature. Everything else in this spec is reachable only after the
app launches, runs on both platforms, and renders the platform's design language.

**Independent Test**: Install on an Android device and an iOS device. Launch. Confirm the app is usable
with no account, in both light and dark appearance, with no sign-in prompt anywhere in the guest
experience. This alone is a demonstrable, shippable milestone.

**Acceptance Scenarios**:

1. **Given** a freshly installed app and no account, **When** the shopper launches it, **Then** they land
   on usable content, are not asked to sign in, and can reach every guest area of the app.
1a. **Given** the platform has no catalog, **When** the guest reaches the home screen, **Then** it presents
   an **honest empty state** — the store is being stocked, said in the product's voice — and contains **no
   mock products and no placeholder grid**. Its job is to prove the shell, the tokens, and dark mode; it is
   thin on purpose, and it does not pretend to be a shop.
2. **Given** the device is set to dark appearance, **When** the app launches, **Then** it renders in dark
   mode using the platform's own colours — Effy's, not the operating system's defaults and not a
   hand-picked palette.
3. **Given** the app is running on iOS, **When** a shopper navigates, scrolls, and dismisses screens,
   **Then** the gestures, transitions, and controls are the ones an iOS user expects; the same is true of
   Android conventions on Android.
4. **Given** any interactive control in the app, **When** it is measured, **Then** its touch target meets
   the platform's accessibility minimum, and it responds with visible feedback.
5. **Given** the device has no network, **When** the shopper opens the app, **Then** it explains the state
   plainly and offers a way to retry — it does not hang, crash, or show a raw error.

---

### User Story 2 — A shopper creates an Effy account from their phone (Priority: P2)

A shopper decides to become a customer. They register on the phone, giving their first and last name and
their email, and choosing **either** a password **or** a one-time code sent to their email — with no
password ever set, permanently, if that is what they prefer. When they come back tomorrow, they sign in
by whichever of those routes they chose, and they land on **the same account** either way.

**Why this priority**: Registration is the gate to every account-bearing capability in the app (US4, US5)
and, later, to ordering. Parity rows 5, 6, 8 and 9. It is also where the audience's hardest rule lives:
**one person is one identity**.

**Independent Test**: Register a brand-new email by the password route; sign out; sign back in. Register a
second brand-new email by the one-time-code route; sign out; sign back in. Confirm each lands on its own
single account, and that the code-route customer was never asked to invent a password.

**Acceptance Scenarios**:

1. **Given** a shopper with no account, **When** they register with their name, email and a password,
   **Then** the account is created and they are **signed in immediately** — they are not made to sign in
   again with the credential they just chose.
2. **Given** a shopper with no account, **When** they register with their name and email and choose the
   one-time-code route, **Then** they prove control of the email with a code, are signed in immediately,
   and **no password is ever set** — this is a permanent, first-class state, not an unfinished one.
3. **Given** a registered customer, **When** they sign in from the app on a later day, **Then** they reach
   the same account and the same platform record they had before.
4. **Given** a customer who set a password and has forgotten it, **When** they use account recovery,
   **Then** they can regain access by proving control of their verified email, and the new password obeys
   the same rules as any other (US5).
5. **Given** any failed authentication attempt — wrong password, wrong code, expired code, unknown email —
   **When** the app reports it, **Then** the message **does not reveal whether the email is registered**.
6. **Given** repeated failed attempts from one device, **When** they continue, **Then** the platform
   throttles them; the app explains the wait rather than looping silently.
7. **Given** the app offers registration and sign-in, **When** its credential routes are enumerated,
   **Then** they are **exactly two** — email+password and email one-time code. There is **no third route**,
   and specifically no federated route, because federation without account linking creates a second,
   unmergeable account for a customer who already exists.

---

### User Story 3 — The app asks who you are only when it matters, and remembers you when you say (Priority: P3)

A shopper browses as a guest for as long as they like. The app asks them to sign in exactly once — at the
moment they try to do something that genuinely requires an account, which today is **opening their
Account**. If they do, they are put back **precisely where they were**. If they decline, they lose nothing
and carry on. And once signed in, they stay signed in — closing the app, killing it, or leaving it for a
week does not force them to sign in again.

**Why this priority**: Parity rows 10, 11, 12 and 13. A mobile session that evaporates on app restart is
the single most common way a mobile surface feels broken while every individual screen "works". It is also
the point at which credential storage becomes a security requirement, because on a phone, a session is a
file on a device that can be lost or stolen.

**Independent Test**: Sign in. Force-quit the app. Reopen. Confirm still signed in, with no interaction.
Separately, as a guest, tap **Account**, sign in from the prompt that raises, and confirm you land on
Account — then repeat and decline, and confirm you are returned to browsing with nothing lost.

**Acceptance Scenarios**:

1. **Given** a signed-in customer, **When** the app is force-quit and relaunched, or the device is
   restarted, **Then** they are still signed in with no interaction required.
2. **Given** a signed-in customer returning at any point **within 90 days of signing in**, **When** they open the
   app, **Then** they are still signed in — the session having been renewed in the background — and they are
   asked to authenticate again only once **90 days from sign-in** have elapsed.
3. **Given** a **guest** who taps **Account**, **When** the app raises the sign-in demand and they complete
   it, **Then** they land on **Account** — the destination they were reaching for — with their context
   intact.
4. **Given** the same guest, **When** they **decline** to sign in, **Then** they are returned to browsing,
   nothing they had done is lost, and they are not asked again for that same session.
4a. **Given** the app in its current state, **When** the actions that raise a sign-in demand are enumerated,
   **Then** there is exactly **one** — opening Account — and **no** other part of the app asks a guest to
   authenticate.
5. **Given** a signed-in customer's device is inspected, **When** the stored session credentials are
   examined, **Then** they are held in the device's protected credential storage — not in plain files, not
   in application preferences, and not readable by another app on the device.
6. **Given** a customer signs out, **When** the device is inspected, **Then** no usable session credential
   remains on it.

---

### User Story 4 — A signed-in customer is a real customer, and their credential works nowhere else (Priority: P4)

The first time a person signs in on the phone, the platform recognises them as a customer of Effy — the
same customer the web storefront knows, with the same record, because it is the same person and the same
identity. The app shows them **what the platform's record says**, not what their credential claims. If the
platform has barred them, a perfectly valid credential does not get them in. And the credential they hold
is refused, structurally, by every service built for Effy's employees.

**Why this priority**: Parity rows 14, 15, 17 and 18, and the two rules the parity register explicitly
binds this surface to. This is where a second surface most easily goes wrong — by trusting the token.

**Independent Test**: Sign in on the phone with a customer who already exists on the web storefront;
confirm one record, not two. Bar that customer at the platform; confirm the app refuses them while their
credential is still perfectly valid. Present a customer credential to an employee-facing service; confirm
structural refusal.

**Acceptance Scenarios**:

1. **Given** a customer signing in on the phone for the very first time, **When** the platform sees them,
   **Then** it creates its own record of them — and doing this twice creates **one** record, not two.
2. **Given** a customer who already exists because they used the web storefront, **When** they sign in on
   the phone, **Then** they land on **that same record** — one person, one identity, one record, across
   both surfaces.
3. **Given** a customer the platform has **barred**, **When** they sign in on the phone with a completely
   valid credential, **Then** the app refuses them and tells them plainly; the valid credential grants
   nothing.
4. **Given** the app displays the customer's name or email anywhere, **When** the source is traced, **Then**
   it is the platform's own record — never a value read out of the credential.
5. **Given** a customer credential issued to the app, **When** it is presented to any service scoped to
   drivers, shops, or back-office staff, **Then** it is refused structurally — not by a check that could be
   forgotten, but because the service cannot accept it at all.
6. **Given** the app needs data, **When** its requests are traced, **Then** commerce traffic goes to the
   platform's latency-sensitive path and account traffic to its operational path — the routing law the
   platform already committed to in 011 (FR-028), obeyed by this surface too.

---

### User Story 5 — A customer manages their account from the phone, safely (Priority: P5)

A signed-in customer opens their account. They see who Effy thinks they are — their name, their email, an
avatar built from their initials. They can change their name. They can set a first password if they never
had one, or change the one they have. They can sign out, from anywhere in the app, in a couple of taps.
And they can sign out of every device they have ever used.

**Why this priority**: Parity rows 21–29 — the entire 012 capability set, on the second surface. It is
**P5 rather than P1 because it depends on all of the above**, but it carries the feature's sharpest
security requirement, and the parity register calls out by name the three rows that "will bite".

**Independent Test**: On an account **with no password**, attempt to set one; confirm it is impossible
without a code freshly delivered to the account's email — including for someone holding the phone, unlocked,
signed in. On an account **with** a password, confirm the current one is required to change it. Confirm sign
out is reachable from every screen.

**Acceptance Scenarios**:

1. **Given** a signed-in customer opens their account, **When** the screen appears, **Then** they can tell
   immediately which account they are in — name, email, and an avatar derived from their initials.
2. **Given** a customer with a name of any shape — two names, one name, no name at all, non-Latin script,
   an emoji — **When** the avatar renders, **Then** it renders correctly: no blank circle, no mangled glyph,
   and **never** letters guessed from their email address.
3. **Given** a customer changes their name, **When** they save, **Then** the change is reflected everywhere
   the app greets them, without signing out and back in.
4. **Given** a customer who has **never had a password**, **When** they set one, **Then** the app **MUST**
   require a code **freshly sent to the account's verified email**, verified by the platform **in the same
   request that writes the password**. **A valid session alone MUST NOT be sufficient.** Holding an unlocked,
   signed-in phone MUST NOT be sufficient. There MUST be no stored grant, ticket, or "verified" flag that
   could be captured and reused.
5. **Given** a customer who **has** a password, **When** they change it, **Then** the platform requires the
   **current** password; a valid session alone is not sufficient.
6. **Given** any new password, **When** it is submitted, **Then** the platform enforces the length floor and
   screens it against public breach corpora, and refuses a breached password — and it does so **at the
   platform**, so that the app cannot skip it.
7. **Given** a password is set or changed, **When** it completes, **Then** **every session on every device is
   ended — including this phone**. The customer is returned to sign-in, told plainly why, and invited to sign
   in with the password they just chose. The account's email is notified, and that notification contains **no
   link**.
8. **Given** a customer who has just set their first password, **When** they next sign in, **Then** **both**
   routes work — the new password **and** an emailed code. Setting a password adds a route; it does not
   remove one.
9. **Given** a signed-in customer anywhere in the app, **When** they want to sign out, **Then** they can do
   so in **at most two interactions**, and afterwards the app treats them exactly as a guest — with
   everything a guest can do still available.
10. **Given** a customer signs out **on all devices**, **When** another device they were signed in on next
    acts, **Then** that device is signed out too.
11. **Given** a **barred** customer holding a valid credential, **When** they attempt **any** control in this
    story, **Then** every one of them refuses — 100%, no exceptions.
12. **Given** any of these flows, **When** logs, diagnostics, and any telemetry are swept, **Then** **no**
    password, code, or credential appears anywhere in them.

---

### User Story 6 — A developer builds the app for an environment without holding a single secret (Priority: P6)

A developer checks out the repository and builds the app for the development environment. Every value the
app needs to reach that environment comes from **configuration supplied at build time**, and none of it is
in version control. Pointing the app at a different environment is a **change of configuration, not a change
of code**. Nothing that grants capability is baked into the shipped application.

**Why this priority**: It is last because it is invisible to shoppers — and it is *in* this spec because a
mobile app is the one surface where a leaked build **is a file in a stranger's hands**, permanently, with no
way to revoke it. This slice is the moment that discipline is either established or lost. It is also the
mechanism that keeps environments honest for every mobile slice that follows.

**Independent Test**: Search the working tree for environment-specific values and secrets; find none.
Build the app fresh for the development environment from configuration alone. Then inspect the built
application for any value whose disclosure would grant capability; find none.

**Acceptance Scenarios**:

1. **Given** a clean checkout, **When** the repository is searched for environment endpoints, identifiers,
   and secrets, **Then** none are found — and the generated configuration the build produces is likewise
   absent from version control.
2. **Given** a developer wants to build against a different environment, **When** they do so, **Then** they
   change **configuration only** — no source file is edited, and no address of any backend appears as a
   literal in the code.
3. **Given** a build is produced, **When** the shipped application is inspected, **Then** it contains **no
   value whose disclosure grants capability** — no shared secret of any kind. (Public identifiers that a
   mobile client is required to carry, and which grant nothing on their own, are permitted and are not
   secrets.)
4. **Given** the required configuration is missing or incomplete, **When** a build is attempted, **Then** it
   **fails loudly at build time** with a message naming what is missing — it does not produce an app that
   compiles and then fails mysteriously against the wrong environment at runtime.

---

### Edge Cases

- **The session expires while the customer is mid-flight** (typing a new name, halfway through setting a
  password). Is the work lost? Are they told, or does the request simply fail?
- **The app is backgrounded while waiting for a code**, the customer opens their mail app, copies the code,
  and returns. Is the pending flow still there, or has the app been killed and restarted by the OS with the
  flow lost?
- **The OS kills the app for memory** while the customer is deep in a flow, then restores it. What survives?
- **Email does not arrive** — for registration, for the step-up code, for recovery. How long does the customer
  wait, what are they told, and can they ask for another without being throttled into a corner?
- **"Sign out everywhere" is invoked from device A** while device B is actively in use. When and how does B
  find out — and what is the **residual window** during which B's already-issued credentials still work
  (FR-027a)? The platform must **state** that window, not assume it is zero.
- **The device clock is wrong**, badly. Does session handling break, and does it break *confusingly*?
- **The same customer signs in on the phone and the web at the same time.** Two sessions, one record, one
  identity — nothing forks.
- **The customer registers on the phone with an email that already exists.** What are they told, given that
  the answer must not disclose whether the email is registered?
- **A code is requested repeatedly** — deliberately, or by an impatient customer tapping "resend".
- **The backend is unreachable** mid-flow (train tunnel). Does the app lose the customer's input?
- **The device is set to its largest accessibility font size**, or the customer is using a screen reader.
  Do the auth and account flows remain completable?
- **The keyboard covers the field** the customer is typing in — on both platforms, on small devices.
- **The app is reinstalled.** The customer is signed out (their credential storage went with it) — is that
  handled as a normal state rather than an error?

---

## Requirements *(mandatory)*

### Functional Requirements

#### The app as a surface

- **FR-001**: The platform MUST deliver a customer mobile app that **builds and runs on both Android and
  iOS**, from one shared body of application logic. A capability MUST NOT exist on one platform and be
  silently missing on the other.
- **FR-002**: The app MUST be **guest-first**: every part of it that does not genuinely require an account
  MUST be usable with no account, and the app MUST NOT open with, or otherwise force, a sign-in wall.
- **FR-002a**: With no catalog in the platform, the guest home screen MUST present an **honest empty state**
  and MUST contain **no mock products, no placeholder grid, and no dummy data**. Fabricated content would make
  SC-002 pass against something that does not exist, and mock data reliably outlives the slice that was meant
  to replace it.
- **FR-002b**: The app MUST raise the **deferred sign-in demand** from exactly **one** place: **opening
  Account**. On success the customer MUST land on Account; on declining they MUST be returned to browsing
  having lost nothing, and MUST NOT be asked again in that session. No other part of the app MUST ask a guest
  to authenticate.
- **FR-003**: The app MUST **feel native on each platform** in **behaviour** — scroll physics, the back gesture,
  text editing, and accessibility MUST be the platform's own, on both platforms.
  - **⚠ Bounded exception (a recorded Principle V deviation — see Clarifications and Constitution Impact row V).**
    **Visual chrome is exempt for now**: the app renders **Material 3 on both platforms**, so iOS chrome is not
    Apple's design language and does not receive HIG component parity or "Liquid Glass". This is knowing and
    reversible; **HIG component parity is deferred to the `iOS native shell` slice.** Behaviour (the clause above)
    is **not** exempt — it MUST be native on each platform from day one.
- **FR-004**: The app MUST render exclusively from **the platform's design tokens** — Effy's brand colour and
  its scale — and MUST NOT hardcode a colour, a spacing value, or a type ramp of its own.
- **FR-005**: The app MUST support **dark mode**, following the device's appearance setting.
- **FR-006**: Every interactive control MUST meet the platform's **minimum touch-target size**, and MUST give
  visible feedback when touched.
- **FR-007**: Every flow in this feature MUST remain completable with a **screen reader**, and at the device's
  **largest accessibility text size**, without content being cut off or controls becoming unreachable.
- **FR-008**: The app MUST behave **predictably without a network** and when a backend is unreachable: it MUST
  state the condition in plain language, MUST offer recovery, and MUST NOT lose input the customer has already
  typed.

#### Identity and credentials

- **FR-009**: A member of the public MUST be able to **register themselves** as a customer from the app, with
  no staff involvement.
- **FR-010**: Registration MUST collect the customer's **first name and last name** as two separate values,
  consistent with the storefront (011 FR-009a).
- **FR-011**: The app MUST offer **exactly two** credential routes: **email + password**, and **email one-time
  code**. It MUST NOT introduce a third, and specifically MUST NOT offer a **federated** route — federation
  without the platform's account-linking rule creates a second, **unmergeable** account for a customer who
  already exists.
- **FR-012**: A customer registering by the one-time-code route MUST end with **no password set**, and that
  MUST be treated as a **permanent, first-class, complete state** — never as an unfinished registration, and
  never nagged.
- **FR-013**: On completing registration by either route, the customer MUST be **signed in immediately** — they
  MUST NOT be sent back to a sign-in screen to re-enter the credential they just created.
- **FR-014**: Every credential route the app offers MUST converge on **one identity per person** — the same
  identity, and therefore the same platform record, that the web storefront uses for that person.
- **FR-015**: A customer who set a password MUST be able to **recover their account** by proving control of
  their verified email. Recovery MUST obey the same password rules as any other password write (FR-023), and
  MUST leave the platform's knowledge of the account's password state **correct** (011/012 FR-022b).
- **FR-016**: Every authentication failure — wrong password, wrong or expired code, unknown email, abandoned
  registration — MUST be reported **without disclosing whether an email is registered**.
- **FR-017**: Authentication, registration, and code-sending MUST be **rate-limited**, and the app MUST explain
  a throttled state rather than retry silently or appear broken.

#### Session

- **FR-018**: A signed-in customer's session MUST **survive app termination and device restart** — they MUST NOT
  be asked to sign in again merely because the app was closed.
- **FR-019**: The session MUST be **renewed in the background** while renewal remains possible; the customer MUST
  only be asked to authenticate again when it genuinely is not.
- **FR-019a**: A signed-in customer MUST remain signed in for **90 days from sign-in**, and MUST be asked to
  authenticate again once that has elapsed. This bound is a **security posture decision**, not an inherited
  default: a phone is a stealable object, and the figure is what makes a lost device a bounded exposure rather
  than indefinite access. It is a property of the identity pool's configuration, so it carries an **operator
  step** (see Dependencies).
  > **⚠ Corrected during planning (2026-07-14).** This originally said **"30 days of inactivity"**. **There is no
  > such thing.** The identity service's refresh credential expires a fixed period **after sign-in**, *not* after
  > last use — there is **no sliding window**, and enabling credential rotation does **not** extend it (a rotated
  > credential inherits only *the remaining duration of the original*). "30 days of inactivity" was therefore
  > **unbuildable**, and a daily-active customer would have been signed out on day 30 anyway — the exact opposite
  > of the intent. The bound is restated in the only terms the platform can actually honour, and lengthened to
  > **90 days** so that the *original intent* — "a customer who keeps using the app is never signed out, and one
  > who wanders off for a month is not" — is genuinely met.
- **FR-020**: Session credentials MUST be stored in the **device's protected credential storage**, MUST NOT be
  readable by another application, and MUST NOT be present in plaintext in any device backup.
- **FR-021**: Signing out MUST leave **no usable session credential on the device**.

#### Account management

- **FR-022**: A signed-in customer MUST be able to see **who the platform thinks they are** — name, email, and an
  avatar derived from their **initials** — sourced from the platform's record. The avatar MUST render correctly
  for every name shape (two names, one name, no name, non-Latin script, emoji) and MUST NEVER derive letters from
  the email address.
- **FR-023**: A customer MUST be able to **change their display name**, and the change MUST be reflected wherever
  the app greets them without signing out.
- **FR-024**: **Setting a *first* password MUST require a code freshly sent to the account's verified email**,
  verified by the platform **in the same request that writes the password**. **A valid session MUST NOT be
  sufficient**, and there MUST be **no stored grant** — no ticket, flag, or "verified" state that could be
  captured and reused. This requirement is **not negotiable on this surface**: without it, a borrowed or stolen
  phone becomes durable, credentialed access to an account whose owner would never notice.
- **FR-025**: **Changing an *existing* password MUST require the current password.** A valid session is not
  sufficient.
- **FR-026**: Every new password (set, changed, or recovered) MUST be enforced **at the platform** — never only in
  the app — against the platform's password policy: its **length floor** and **screening against public breach
  corpora**, refusing a breached password.
- **FR-027**: After any password is set or changed, **every session on every device MUST be ended — including
  the phone that made the change**. The app MUST return the customer to sign-in, tell them plainly why, and
  invite them to sign in with their new password. The account's email MUST be notified, and that notification
  MUST contain **no link** (a link there is itself a phishing primitive).
  > **This is 012's FR-024, and it is not a choice.** It originally read "every *other* session, preserving the
  > current one" — which is **not expressible**: the identity service revokes sessions all-or-nothing and cannot
  > enumerate the others to revoke them selectively. Rather than quietly weaken it to "revoke nothing" (which is
  > how ghost sessions ship), it was strengthened: everything goes. The mobile surface inherits the *amended*
  > requirement, not the original — and pays a **visible** price for it, because on a phone this means the app
  > returns to its sign-in screen. That moment must be **designed**, not discovered.
- **FR-027a**: Revoking a session does **not** instantly invalidate credentials already issued to it. The app
  MUST NOT claim an immediacy the platform does not deliver; the residual window MUST be **stated** (012 FR-024a),
  not assumed to be zero.
- **FR-028**: A customer who sets a first password MUST subsequently be able to sign in by **both** routes — the
  password **and** an emailed code. Setting a password **adds** a route; it MUST NOT remove one.
- **FR-029**: A signed-in customer MUST be able to **sign out** from anywhere in the app in **at most two
  interactions**, and MUST be able to **sign out on all devices** as a distinct, deliberate action.
- **FR-030**: Signing out MUST cost the customer **nothing but their session** — everything available to a guest
  MUST remain available.

#### The platform's record, and what a credential is worth

- **FR-031**: The platform MUST keep **its own record** of each customer, created the first time that customer
  appears on this surface, and creation MUST be **idempotent** — repeated sign-ins MUST NOT produce a second
  record, and a customer who already exists from the web MUST land on the **same** record.
- **FR-032**: The app MUST display the customer's details from **the platform's record**, never from the contents
  of their credential.
- **FR-033**: A **barred** customer MUST be refused — on sign-in and on **every** control in this feature — no
  matter how valid their credential. The record is authoritative; the claim is not.
- **FR-033a**: A customer barred **while already signed in** MUST be refused on their next action, and the app
  MUST then **destroy the local session** and tell them why. A phone MUST NOT be left holding a persisted
  credential that no longer means anything — otherwise a barred customer's device keeps working until the
  session simply ages out (FR-019a).
- **FR-034**: Every write MUST derive the customer's identity from their **proven credential**, never from an
  identifier supplied in the request.
- **FR-035**: A **customer** credential MUST be **structurally refused** by every service scoped to drivers, shops,
  or back-office staff.
- **FR-036**: The app MUST obey the platform's **routing law** (011 FR-028): commerce traffic — product, catalog,
  search, cart, order, payment — to the latency-sensitive path; customer profile and account traffic to the
  operational path.
- **FR-037**: The address of every backend MUST be **configuration, never a literal in code**.
- **FR-038**: **No password, code, or credential MUST ever appear** in any log, diagnostic, crash record, or
  telemetry payload.

#### Configuration, secrets, and contracts

- **FR-039**: Every environment-specific value the app needs MUST be supplied as **build-time configuration**, and
  **MUST NOT be committed to version control** — neither the configuration input nor anything generated from it.
- **FR-040**: Switching the app to a different environment MUST be a change of **configuration only** — no source
  edit.
- **FR-041**: A build with **missing or incomplete configuration MUST fail at build time**, naming what is missing.
  It MUST NOT produce an app that builds and then misbehaves at runtime against the wrong environment.
- **FR-042**: The shipped application MUST contain **no value whose disclosure grants capability** — no shared
  secret of any kind. Public identifiers a mobile client must carry, which grant nothing on their own, are
  permitted and are **not** secrets; the distinction MUST be stated explicitly rather than assumed.
- **FR-043**: The shapes the app exchanges with the platform MUST be derived from the platform's **existing shared
  contracts**, not hand-redefined for this surface (Principle II). Where the surface cannot consume the existing
  contract artifact directly, the plan MUST state **how the single source of truth is preserved** and how drift is
  detected — an unenforced convention is not an answer.

#### Recording what was built

- **FR-044**: The **customer capability register**
  ([docs/audiences/customer-capabilities.md](../../docs/audiences/customer-capabilities.md)) MUST be updated in
  this change so that **no** capability's state on the mobile surface is left unstated. A row this feature does
  not deliver MUST say so.

---

### Key Entities

- **Customer identity**: The single identity a person holds with Effy, reached by either credential route and
  shared with the web storefront. **One person is one identity** — this surface must not create a second.
- **Customer record**: The platform's own record of the customer — the authority on their name, their email, their
  **standing** (a barred customer holds a perfectly valid credential), and whether their account **has a password**
  (something the identity service cannot be asked, and the platform therefore owns).
- **Session**: The device-held proof of a signed-in customer. On a phone it is **a file on an object that can be
  stolen**, which is why its storage, its renewal, and its destruction are requirements rather than details.
- **Step-up verification**: A short-lived, single-use, single-purpose proof that the person driving the session can
  **still read the account's email**. It exists solely to pay for establishing a **first** password. It is not a
  session, not a sign-in, and not reusable.
- **Environment configuration**: The set of values binding a build to one environment. Supplied at build time, never
  committed, and containing nothing that grants capability.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The app **builds and runs on both Android and iOS**, and **every** flow in this spec is completable on
  **both** — zero capabilities present on one platform and missing on the other.
- **SC-002**: A person with no account can use every guest area of the app and is **never** prompted to sign in —
  **exactly one** action in the whole app raises a sign-in demand (opening Account), and **zero** others do.
  The guest home contains **zero** fabricated products.
- **SC-003**: A new customer can go from app-open to a created, signed-in account in **under 2 minutes** by either
  credential route, on either platform.
- **SC-004**: A customer who registers by the one-time-code route is **never** asked to create a password, at any
  point, ever — **zero** prompts, **zero** nags.
- **SC-005**: A signed-in customer force-quits the app, relaunches it, and is **still signed in** with **zero**
  interactions — **100%** of the time, on both platforms.
- **SC-006**: A person holding a **valid session but without access to the account's email** **cannot** set a
  password on an account that has none. **Demonstrated adversarially, on the device, not asserted.**
- **SC-007**: A person **without** the current password **cannot** change an existing one, even holding an unlocked,
  signed-in phone. **Demonstrated adversarially.**
- **SC-008**: A customer who sets a first password can afterwards sign in with **both** that password **and** an
  emailed code — **100%** of the time.
- **SC-009**: A **barred** customer is refused by **every** control in this feature — **100%**, no exceptions —
  while holding a valid credential.
- **SC-010**: A customer signing in on the phone who already exists from the web lands on **one** record — **zero**
  duplicate records created, across any sequence of sign-ins on either surface.
- **SC-011**: A customer credential is refused by **every** employee-facing service — **100%**, structurally.
- **SC-012**: A customer can sign out from **any** screen in **at most two interactions**, and afterwards **no
  usable session credential remains on the device** — verified by inspection, not asserted.
- **SC-013**: The initials avatar renders correctly for **every** name case tested — two names, one name, no name,
  non-Latin script, emoji: **zero** blank circles, mangled glyphs, or letters guessed from the email.
- **SC-014**: A repository sweep finds **zero** environment-specific values or secrets in version control, and an
  inspection of the built application finds **zero** values whose disclosure grants capability.
- **SC-015**: A build attempted with configuration missing **fails at build time**, naming what is missing — **100%**
  of the time, never producing a runnable app pointed at the wrong environment.
- **SC-016**: A sweep of logs, diagnostics, and crash records finds **zero** passwords, codes, or credentials.
- **SC-017**: Every flow is completable with a **screen reader** and at the device's **largest text size**;
  contrast passes in **both** light and dark appearance.
- **SC-018**: The customer capability register has **no unstated cell** for the mobile surface.
- **SC-019**: After a password is set or changed, **every** session on **every** device is ended — **including
  the phone that made the change**, which returns to sign-in and says why. **Zero** sessions survive, and the
  customer can immediately sign in with the password they just chose (which is what proves it works).
- **SC-020**: A signed-in customer returning **within 90 days of signing in** is **still signed in**, with **zero**
  interactions; past **90 days from sign-in** they are asked to authenticate. (Verified by shortening the bound in
  a scratch environment — not by waiting 90 days.)
- **SC-021**: A customer barred **while signed in** is refused on their next action, and afterwards **no usable
  session credential remains on the device** — verified by inspection.

---

## Scope

### In scope

- The customer mobile app on **Android and iOS** as a running, guest-first application with the platform's design
  language and dark mode.
- **Self-registration and sign-in** by the two native routes, converging on one identity; account recovery.
- **Session** persistence, background renewal, protected on-device storage, and destruction.
- The platform's **customer record**: identity read, idempotent creation, barred refusal, record-as-authority.
- **Account management** on the phone: identity display with initials avatar, name change, set-first-password
  (behind the emailed-code step-up), change-existing-password, sign out, sign out everywhere.
- **Per-environment configuration and secrets** handling, and the build-time failure that enforces it.
- Proof that the app obeys the **routing law** and that a customer credential is refused by employee-facing
  services.
- Updating the **customer capability register**.

### Out of scope

- **Google / federated sign-in** — **parked**, mirroring the web surface. It un-parks on both customer surfaces
  together, in one change, alongside the account-linking rule (see Clarifications). This feature must be *correct*
  for a customer who is later linked; it does not enable the route.
- **Crash reporting and product analytics** — deferred to a named later slice. **A knowing Principle VII deviation**
  (see Constitution Impact); the plan MUST carry it in Complexity Tracking.
- **Store distribution** — Apple Developer / Play Console enrolment, signing identities, provisioning profiles,
  privacy manifests, TestFlight / Play internal testing. Its own slice.
- **Push notifications** — depends on the notifications path and on store/APNs setup.
- **Catalog, cart, checkout, payment, orders, addresses, delivery.** None of these exist for **any** customer
  surface yet — there are no product tables anywhere in the platform. The app's guest experience therefore has
  nothing to *browse*; it has a home, not a shop. Payment SDK work in particular is premature and is explicitly
  excluded.
- **A placeholder checkout screen.** The web surface built one purely to prove the deferred-sign-in mechanism.
  Mobile deliberately does **not**: the mechanism is proven against **Account**, a destination that genuinely
  requires an account (FR-002b). A fake screen that misrepresents the product, and must be deleted the day real
  checkout arrives, is a **worse** proof than a real one.
- **Mock or seeded product data of any kind** (FR-002a).
- **Changing the email address**, uploaded avatars, account deletion, multi-factor authentication, passkeys, and a
  session/device list — all excluded on the web surface for stated reasons, all still excluded here.
- **The driver and shop mobile apps.** They remain the base template; this slice does not touch them, though the
  patterns it establishes are expected to serve them.

---

## Constitution Impact

**No amendment is required.** This feature is built entirely inside the constitution as it stands (v1.7.0). One
deviation is taken knowingly and recorded.

| Principle | How this feature stands |
|---|---|
| **I — Spec-Driven** | The request's technology stack was moved out of this spec, unedited, into [planning-inputs.md](planning-inputs.md). The spec stays WHAT/WHY. |
| **II — Shared Contracts** | **This surface stresses the principle.** The platform's shared contracts are consumed natively by the web surfaces; this one cannot consume them the same way. FR-043 refuses to let that become an excuse: the plan MUST state how one source of truth is preserved **and how drift is detected**. |
| **III — Dual-Path** | FR-036 binds the app to the routing law 011 already committed to (FR-028). No new backend path. |
| **IV — Auth Isolation** | Honoured exactly: the customer pool only (FR-011, FR-014); no third credential route; **no federation** while account linking is unbuilt; the record — not the claim — decides access (FR-033). |
| **V — Design** | ⚠ **DEVIATION, taken knowingly.** Tokens only, dark mode, and fat-finger targets hold (FR-004 – FR-007). But **iOS chrome ships as Material 3, not Apple HIG** — a shared Compose UI cannot render Apple's design language, and iOS 26 "Liquid Glass" is painted only for native chrome. iOS keeps native scroll physics, back-swipe, text editing, and accessibility; it does **not** get HIG component parity. Bounded and reversible (the presentation layer is all a later HIG pass touches). The plan **MUST** record this in **Complexity Tracking** with a justification and **name the slice that closes it** (`iOS native shell`). See FR-003's bounded exception. |
| **VI — Layered Architecture** | Binding, and the reason the request cited `ARCHITECTURE.md`. The *shape* (Clean Architecture; MVVM — a ViewModel with immutable observable state; no DI framework; one manual container) is **HOW** and belongs to `/plan`, which MUST conform to `ARCHITECTURE.md` § *Mobile apps*. |
| **VII — Observability** | **⚠ DEVIATION, taken knowingly.** Crash reporting and product analytics are **deferred**. Principle VII requires both on mobile, and requires a plan adding user-facing flows to state its telemetry. The plan **MUST** record this in **Complexity Tracking** with a justification and **name the slice that closes it**. Note that FR-038 (no credentials in telemetry) still binds whatever telemetry exists later. |

---

## Assumptions

- **`apps/customer-mobile` exists as a bare scaffold and is the starting point.** It is the generated template —
  a greeting screen — with the app identity already fixed. This feature builds *on* it; it does not re-generate it.
- **The customer identity pool and the platform's customer record already exist**, built by 011. This surface is a
  **second consumer** of them, not a new system.
- **No password is a normal, permanent state.** A large share of customers will never set one, and the product does
  not want them to. The set-password control is a convenience on offer, never a remediation, and never a nag.
- **Setting a password is a credential-establishing act and is priced accordingly** (FR-024). The identity service
  *will cheerfully permit the unsafe version* if simply asked — the safety is entirely the platform's to impose,
  and it must be imposed **again**, deliberately, on this surface.
- **The two customer surfaces are peers, not a primary and a mirror.** Where this spec restates a rule the web
  already obeys, that is intentional: a security property that exists only as "the other surface does it" is a
  property that will be lost.
- **Guest-first is real even with nothing to browse.** With no catalog anywhere in the platform, the app's guest
  experience is thin by necessity. It is still guest-*first*: the sign-in wall must not be built now "because
  there's nothing to see anyway", or it will never be removed.
- **The definition of done is a running app on a real device and a simulator, against the real development
  environment** — not a store build (see Clarifications).

---

## Dependencies

- **011-customer-storefront-web** — the identity pool, the customer record, the identity read, the barred-customer
  refusal, and the routing law. **⚠ Its operator run is still open** (`make apply`, `make db-up`, `make
  edge-deploy SERVICE=customer`), so the backend this app depends on **is not deployed yet**.
- **012-customer-profile-management** — the account capabilities this app must reach parity with, and the
  **step-up-verified set-password** path (FR-024) that the app calls rather than reinvents. **⚠ Also code-complete
  with an open operator run**, including **T062: SES must send** — *without working email, set-password does not
  work at all*, on either surface.
- **⚠ The two BLOCKING spikes from 012 (T001/T002) bind this surface too**, and both can change its design:
  whether the identity service permits setting a password from a bare session on our pool, and what "forgot
  password" does **today** for a passwordless customer. This app **cannot be signed off** on FR-024 / FR-025 /
  SC-006 / SC-007 until they are settled.
- **010-domain-dns-foundation** — branded transactional email. Every code this app sends a customer travels that
  path.
- **⚠ An operator step this slice introduces: the 90-day session bound (FR-019a).** Session lifetime is a property
  of the **identity pool's configuration**, not of the app — so it is a Terraform change applied by the operator
  (the app client's refresh-credential validity, **30 → 90 days**; an in-place update, no pool replacement), and
  the app cannot enforce it on its own. **SC-020 cannot be signed off until it is applied.**
- **The platform's design tokens** — the single source of Effy's brand for every surface. How this surface consumes
  them without copy-pasting is a **plan** question (Principle II, FR-043) and is expected to be a real one.
- **A breached-password screening service** — an external dependency introduced by 012, enforced at the platform, so
  this app inherits it without integrating it directly.
</content>
