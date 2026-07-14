# Feature Specification: Customer Profile Management

**Feature Branch**: `012-customer-profile-management`

**Created**: 2026-07-14

**Status**: Draft

**Input**: User description: "full profile management feature for customer web app: (1) show name, email and avatar (from name initials), (2) change name, (3) change or set password, (4) sign out button. Modern industry-standard UI. Research UI, features and best practices first."

---

## Why this feature is not as small as it looks

Four controls on one page. Three of them are ordinary. The third is not, and the research that
preceded this spec is the reason the requirements below are shaped the way they are.

Effy's customers arrive by **two credential routes** (a third, Google, is built but parked): they
either **chose a password at sign-up**, or they **signed up with an emailed one-time code and have
never had a password at all**. So "change or set a password" is **not one flow** — it is two, serving
two different people, and the second one has a sharp edge:

> **A customer who has never had a password has no current password to prove.** If the platform lets
> them set one on the strength of a live session alone, then anyone holding that session — a borrowed
> phone, a shared family laptop, a shoulder-surfed tab, a stolen token — can **silently plant a
> permanent password** on the account. A *transient* foothold becomes *durable, credentialed* access,
> and the true owner, who only ever signs in with an emailed code, would **never notice**.

That is an account-takeover primitive, not a convenience. It is the same shape as the account-linking
prohibition the constitution already carries (Principle IV: linking on an unverified email is
forbidden), and this spec treats it the same way: **establishing a new credential must be paid for by
re-proving control of the verified email — never by merely holding a session.**

Everything else here is table stakes. This one requirement is the feature.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See who I am (Priority: P1)

A signed-in customer opens their account page and sees, immediately and unambiguously, **who Effy
thinks they are**: their name, the email their account is keyed on, and an avatar built from their
initials. Nothing to click, nothing to load, no ambiguity about which account they are in.

**Why this priority**: It is the foundation the other three stories are edited *from*, and it is the
only one useful on its own. A customer who cannot confirm which account they are signed into cannot
safely be offered a control that changes it. Shipped alone, it already answers the most common
account-page question ("is this the right account?").

**Independent Test**: Sign in as a customer with a name on record; open the account page; confirm the
name, the email, and an initials avatar are all present and correct. Then sign in as a customer with
**no** name on record (an emailed-code signup that never supplied one) and confirm the page is still
correct and complete rather than showing a blank or a broken avatar.

**Acceptance Scenarios**:

1. **Given** a signed-in customer named "Janith Madarasinghe", **When** they open the account page,
   **Then** they see that name, their email address, and an avatar showing "JM".
2. **Given** a signed-in customer with a first name but no last name, **When** they open the account
   page, **Then** the avatar shows a **single** initial and the page renders correctly.
3. **Given** a signed-in customer with **no name at all** on record, **When** they open the account
   page, **Then** the avatar falls back to a neutral person symbol (never a blank circle, never a
   letter guessed from the email), and the page invites them to add their name.
4. **Given** a customer whose name is in a script whose "initials" are not meaningful (or is an emoji),
   **When** the avatar is generated, **Then** the platform falls back to the neutral symbol rather than
   displaying a mangled or meaningless glyph.
5. **Given** a signed-out visitor, **When** they navigate directly to the account page, **Then** they
   are sent to sign in and returned to the account page afterwards.
6. **Given** a **barred** customer holding a perfectly valid credential, **When** they open the account
   page, **Then** they are refused — the record decides, not the credential.

---

### User Story 2 - Change my name (Priority: P2)

A customer corrects or completes the name Effy holds for them, and the change is reflected
**everywhere the platform greets them** — not just on the page they typed it on.

**Why this priority**: The lowest-risk edit on the page and the one most likely to be needed — the
emailed-code and Google routes may capture no name at all, so a large share of customers arrive here
with an *empty* name. It carries no security weight, so it can ship ahead of the password work.

**Independent Test**: Change the name, save, and confirm the new name persists across a reload **and**
appears in the storefront header greeting — without signing out and back in.

**Acceptance Scenarios**:

1. **Given** a customer on the account page, **When** they edit their first and last name and save,
   **Then** the change is confirmed on the page and persists across a reload.
2. **Given** a customer who has just changed their name, **When** they browse back to the storefront,
   **Then** the header greeting and the avatar initials show the **new** name — **without** requiring
   them to sign out and back in.
3. **Given** a customer who submits an empty name, **When** they save, **Then** the platform accepts it
   (a name is optional) and the avatar falls back to the neutral symbol.
4. **Given** a customer who submits a name longer than the permitted length, **When** they save, **Then**
   they are told so before the request is sent — and the platform refuses it too, if they bypass the page.
5. **Given** a save that fails (network or platform), **When** the failure occurs, **Then** the customer
   is told plainly, their typed input is **not lost**, and they can retry.
6. **Given** a customer who has changed nothing, **When** they look at the save control, **Then** it is
   inert — the page never invites a write that would change nothing.

---

### User Story 3 - Change or set my password (Priority: P1)

Two different customers, two different journeys, **one control that knows which is which**:

- The customer who **has** a password changes it, and must prove the **current** one to do so.
- The customer who has **never had** a password sets their first one — and must **re-prove control of
  their verified email** before the platform will let them, because they have no current password to
  offer and a live session alone is not enough.

**Why this priority**: P1 alongside Story 1, and the reason this feature exists at all. It is also the
only part of this feature that can *lose* a customer their account if it is built the obvious way.

**Independent Test**: Run it twice against two different customers — one who signed up with a password,
one who signed up with an emailed code — and confirm each is offered the correct journey, that neither
can reach the other's, and that the passwordless customer cannot set a password without a fresh emailed
code.

**Acceptance Scenarios**:

1. **Given** a customer **with** a password, **When** they open the account page, **Then** the password
   section offers **"Change password"** and states when it was last changed.
2. **Given** a customer with **no** password, **When** they open the account page, **Then** the password
   section explains that they currently sign in with an emailed code and offers **"Set a password"** as
   an optional convenience — never as a warning, a nag, or an error state.
3. **Given** a customer changing an existing password, **When** they submit an incorrect current
   password, **Then** the change is refused and they are told which field was wrong.
4. **Given** a customer with **no** password who asks to set one, **When** the flow begins, **Then** the
   platform sends a one-time code to their **verified email** and will not accept a new password until
   that code is entered correctly.
5. **Given** a person who holds a session but **cannot read the account's email inbox**, **When** they
   attempt to set a first password, **Then** they **cannot complete it** — the session alone buys them
   nothing.
6. **Given** a step-up code that has expired, been used already, or was issued for a different purpose
   (a sign-in code, say), **When** it is submitted, **Then** it is refused.
7. **Given** any successful password set or change, **When** it completes, **Then** the platform
   **notifies the account's email address**, and that notification contains **no reset link** (a link
   there is itself a phishing primitive) — only a route to contact support.
8. **Given** any successful password set or change, **When** it completes, **Then** **every other session
   on every other device is signed out**, the customer's **current** session survives, and the page says
   so plainly.
9. **Given** a customer choosing a new password, **When** they type it, **Then** they may **paste** it,
   they may **reveal** it, their password manager may fill it, and they are **never** asked to type it a
   second time to confirm.
10. **Given** a customer who chooses a password that is too short, or one known to have been exposed in a
    public breach, **When** they submit it, **Then** it is refused with a reason they can act on.
11. **Given** a customer who has just set their **first** password, **When** they next sign in, **Then**
    **both** routes work — the new password **and** the emailed code. Setting a password **adds** a way
    in; it never takes one away.

---

### User Story 4 - Sign out (Priority: P2)

A customer ends their session deliberately, from anywhere in the storefront, and lands somewhere that
makes it obvious they are signed out.

**Why this priority**: It is currently **missing entirely** from the storefront, which makes it a real
gap rather than an enhancement — but it is simple, and it blocks nothing else.

**Independent Test**: Sign out; confirm the session is gone (a reload does not restore it, and protected
pages redirect); confirm any other open tab stops showing the customer as signed in.

**Acceptance Scenarios**:

1. **Given** a signed-in customer anywhere in the storefront, **When** they look for a way out, **Then**
   sign-out is reachable from the account menu **on every page**, and also from the account page itself.
2. **Given** a customer who signs out, **When** it completes, **Then** they land on a **public** page, the
   header shows them as a guest, and they are told they have been signed out.
3. **Given** a customer who has signed out, **When** they press Back or reload, **Then** the session is
   **not** restored and no personalized content is served from cache.
4. **Given** a customer signed in **in two tabs**, **When** they sign out in one, **Then** the other tab
   stops presenting them as signed in.
5. **Given** a customer who wants to end sessions they cannot reach (a hotel PC, a lost phone), **When**
   they use **"Sign out on all devices"**, **Then** every session everywhere is ended, including the
   current one.
6. **Given** a signed-out customer, **When** they browse the storefront, **Then** everything they could do
   as a guest before, they can still do — signing out costs them nothing but their session.

---

### Edge Cases

- **A customer with no password clicks "Forgot password?"** — reachable **today**, from the live sign-in
  page, and what happens is **unverified** (see Dependencies). Whatever it does, it must not be a dead
  end or a confusing error.
- **A name change races the session.** The customer's greeting is drawn from their credential in some
  places and from the platform record in others; after a name change these must not disagree.
- **The step-up code arrives late.** Email is not instant. The flow must tolerate a slow inbox without
  discarding the customer's progress, and must let them request another code (rate-limited).
- **The customer abandons the set-password flow half-way** (code sent, never entered). Nothing changes,
  the code expires, no partial state is left behind, and the account still has no password.
- **The session expires mid-edit.** The customer is told to sign in again and returned to the account
  page — their typed name is not silently discarded into a redirect.
- **A barred customer** reaches any of these controls. Every one is refused, however valid their
  credential.
- **The account page is opened by a signed-out visitor, or by a crawler.** It must never be indexed and
  never served from a shared cache.
- **A customer signed in via Google** (parked, but designed for) opens the password section. They are a
  *linked* customer with one identity, so the page must decide what to offer them from **whether the
  account has a password**, not from **how they happened to sign in**.
- **Two initials cannot be derived** — a single-word name, a non-Latin script, an emoji, an empty name.
  The avatar degrades to a neutral symbol rather than guessing.
- **A password is changed on one device while the customer is signed in on another.** The other device's
  access must end promptly and predictably (see FR-024's bounded window).

---

## Requirements *(mandatory)*

### Functional Requirements

#### Identity display

- **FR-001**: The account page MUST display the customer's **name**, **email address**, and an **avatar**,
  all drawn from the **platform's own record** of that customer — not from the credential they signed in
  with.
- **FR-002**: The avatar MUST be generated from the customer's **initials**, at most **two** (first +
  last). A single-word name MUST yield a **single** initial, never two letters taken from one word.
- **FR-003**: The avatar MUST fall back to a **neutral person symbol** when initials cannot be derived
  meaningfully — no name, a non-Latin script, an emoji, or a leading character that is not a letter. The
  platform MUST NOT guess a letter from the email address.
- **FR-004**: The avatar's appearance MUST be **stable** for a given customer and MUST NOT change when
  they edit their name.
- **FR-005**: The avatar MUST meet the platform's contrast requirements in **both** light and dark
  appearance, and MUST NOT announce redundant information to assistive technology when the customer's name
  is already displayed beside it.
- **FR-006**: The email address MUST be displayed and MUST NOT be editable in this feature. Changing an
  email is an **identity** operation, not a profile edit, and is explicitly **out of scope**.

#### Name

- **FR-007**: A customer MUST be able to change their **first name** and **last name**, and MUST be able to
  leave either or both **empty** — a name is optional, and the platform MUST NOT invent one it was never
  given.
- **FR-008**: A name change MUST be reflected **everywhere the platform greets or identifies the customer**
  — including the storefront header — **without** the customer having to sign out and back in.
- **FR-009**: The platform MUST enforce the name-length limit **itself**, and MUST NOT rely on the page to
  do so.
- **FR-010**: A failed save MUST NOT lose the customer's typed input, and MUST offer a retry.
- **FR-011**: The save control MUST be inert until something has actually changed.
- **FR-012**: The name the customer sees, the name used to greet them, and the name on the platform record
  MUST NOT disagree after a successful save.

#### Password — the shape of the control

- **FR-013**: The platform MUST **know** whether a given customer's account has a password, and MUST NOT
  infer it from which credential route they last used to sign in.
- **FR-014**: The account page MUST offer **"Change password"** to a customer who has one, and **"Set a
  password"** to one who does not. A customer MUST NOT be able to reach the flow that does not apply to
  them, and the platform MUST refuse it even if they contrive to submit it.
- **FR-015**: Having no password MUST be presented as a **legitimate, complete state** — an optional
  convenience on offer, not a deficiency. The platform MUST NOT nag, warn, or mark the account incomplete.

#### Password — changing an existing one

- **FR-016**: Changing an existing password MUST require the **current** password. Holding a session MUST
  NOT be sufficient.

#### Password — setting a first one (the security core)

- **FR-017**: Setting a **first** password MUST require the customer to **re-prove control of the account's
  verified email** by entering a **fresh one-time code** sent to it at the time of the request. A valid
  session MUST NOT, on its own, be sufficient to establish a password. **This is the requirement the
  feature exists to get right**: without it, any borrowed session becomes permanent, silent account access.
- **FR-018**: The step-up code MUST be **single-purpose** (never interchangeable with a sign-in code),
  **single-use**, and **short-lived**. A code that is expired, already used, or issued for another purpose
  MUST be refused.
- **FR-019**: The authority to set a password, once the code is proven, MUST be **short-lived** and MUST
  apply to that operation only.
- **FR-020**: Requests for step-up codes MUST be rate-limited, and repeated failures MUST be refused rather
  than allowed to continue indefinitely.
- **FR-021**: An abandoned set-password flow MUST leave the account **exactly as it was** — no password, no
  partial state, no lingering authority.

#### Password — rules and consequences (both flows)

- **FR-022**: A new password MUST be at least **12 characters** long, and MUST be **screened against passwords
  known to have been exposed in public breaches**. It MUST be refused, with an actionable reason, if it fails
  either check. The platform MUST NOT impose composition rules (mandatory symbols, digits, or mixed case), and
  MUST NOT expire passwords on a schedule — both are now considered harmful rather than helpful.
- **FR-022b**: These rules MUST apply to **every path that establishes a password — including account
  recovery** ("forgot password"), which the storefront already offers. A rule enforced on the account page but
  not on the recovery page is not a rule; it is a **detour sign**. Equally, a password established by recovery
  MUST update what the platform knows about that account's password state (FR-013) — otherwise recovery
  silently makes the platform's own record wrong.
  > **Added during planning (2026-07-14).** The recovery flow is 011's and was not in this feature's original
  > scope. Planning exposed it as a **bypass of FR-022 and a corruption of FR-013**, so it is pulled in
  > deliberately. See Scope.
- **FR-022a**: The breach check MUST NOT transmit the customer's password. It MUST be performed in a way that
  reveals neither the password nor enough of it to identify it, and a failure or timeout of the breach-list
  service MUST NOT silently admit an exposed password — the platform MUST decide, and state, whether it fails
  open or closed.
- **FR-023**: The password field MUST permit **pasting**, MUST offer a **reveal** toggle, MUST be fillable by
  a password manager, and MUST NOT ask the customer to re-type the password to confirm it.
- **FR-024**: A successful password set or change MUST **end every session on every device — including the
  one that made the change**. The customer MUST be returned to sign-in, told plainly why, and invited to
  sign in with their new password.
  > **Amended during planning (2026-07-14).** This originally read "end every *other* session while
  > preserving the customer's current one". That is **not expressible**: the platform's identity service
  > revokes sessions all-or-nothing, and the other devices' sessions cannot be enumerated in order to be
  > revoked selectively. Rather than quietly weaken the requirement to "revoke nothing" — which is how
  > ghost sessions ship — the requirement is **strengthened**: everything goes. The cost is one extra
  > sign-in, on a rare and deliberate action. The benefit is that it is *true*, and it makes SC-007 fall
  > out for free: the customer immediately proves the new password works.
- **FR-024a**: Revoking a session does **not** instantly invalidate credentials already issued to it. The
  platform MUST **state** that residual window rather than assume it is zero, and MUST NOT claim an
  immediacy it does not deliver. (Measured and stated in the plan; see `research.md` R7.)
- **FR-025**: A successful password set or change MUST **notify the account's email address**. That
  notification MUST contain **no reset link** — only a route to contact support if it was not them.
- **FR-026**: Setting a first password MUST **add** a way to sign in without **removing** the emailed-code
  route. A customer who sets a password MUST still be able to sign in with a code afterwards.
- **FR-027**: Password errors MUST be presented **in the form**, next to what went wrong — never as a
  transient notification the customer can miss.

#### Sign out

- **FR-028**: Sign-out MUST be reachable from **every page** of the storefront while signed in, and also from
  the account page.
- **FR-029**: Signing out MUST clear the session such that a reload or a Back-button press does **not**
  restore it, and no personalized content is served from any cache.
- **FR-030**: Signing out in one tab MUST cause other open tabs to stop presenting the customer as signed in.
- **FR-031**: After signing out, the customer MUST land on a **public** page and be told they are signed out.
  The destination MUST NOT be taken from an untrusted parameter — the storefront's existing refusal of open
  redirects applies here unchanged.
- **FR-032**: A customer MUST be able to **sign out on all devices** as a distinct, deliberate action.
- **FR-033**: Signing out MUST cost the customer nothing but their session — everything available to a guest
  remains available.

#### Cross-cutting

- **FR-034**: Every control in this feature MUST be refused for a **barred** customer, no matter how valid
  their credential. The record is authoritative; the claim is not.
- **FR-035**: Every write MUST re-verify the session **at the platform**, and MUST derive the customer's
  identity from their proven credential — **never** from an identifier supplied in the request.
- **FR-036**: The account page MUST NOT be indexed by search engines and MUST NOT be served from a shared
  cache.
- **FR-037**: This feature MUST NOT regress the storefront's guest performance budget — the cost of these
  authenticated controls MUST NOT be paid by visitors who never sign in.
- **FR-038**: Every flow MUST be operable by keyboard and screen reader: errors announced and associated with
  their field, focus moved to what went wrong, pending states named rather than shown only as a spinner.
- **FR-039**: No password, code, or credential MUST ever appear in logs, telemetry, or analytics.

### Key Entities

- **Customer record**: The platform's existing record of a customer — the authority on their name, their
  email, and their standing. This feature adds one thing it must know: **whether the account has a
  password**, which cannot be inferred from anywhere else (FR-013).
- **Step-up verification**: A short-lived, single-use, single-purpose proof that the person driving a session
  can still read the account's verified email. It exists solely to pay for establishing a new credential
  (FR-017 – FR-021). It is not a session, not a sign-in, and not reusable.
- **Password state**: Whether a password exists, and when it last changed — the latter being what the account
  page reports back to the customer.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A signed-in customer can identify which account they are in — name, email, avatar — **within 5
  seconds** of the account page appearing, with no interaction.
- **SC-002**: A customer can change their name and see it reflected in the storefront greeting **without
  signing out**, in **under 30 seconds** end to end.
- **SC-003**: **100%** of customers are offered the correct password journey for their account — change for
  those who have one, set for those who do not — with **zero** cases of the wrong control being offered.
- **SC-004**: A person holding a valid session but **without access to the account's email** **cannot** set a
  password on an account that has none. Demonstrated adversarially, not asserted.
- **SC-005**: A person **without** the current password **cannot** change an existing one, even holding a
  valid session.
- **SC-006**: After any password set or change, **every other device** is signed out within the stated bounded
  window, and the account's email address receives a notification containing **no link**.
- **SC-007**: A customer who sets a first password can subsequently sign in **both** with that password **and**
  with an emailed code — **100%** of the time.
- **SC-008**: A customer can sign out from **any page** of the storefront in **at most two interactions**, and
  the session does not survive a reload or a Back-button press.
- **SC-009**: A barred customer is refused by **every** control in this feature — **100%**, no exceptions —
  while holding a valid credential.
- **SC-010**: The avatar renders correctly for **every** name case tested: two names, one name, no name,
  non-Latin script, emoji. **Zero** blank circles, mangled glyphs, or letters guessed from the email.
- **SC-011**: The guest performance budget is **unchanged** — a visitor who never signs in downloads **no
  more** than they did before this feature shipped.
- **SC-012**: Every flow is completable by **keyboard alone** and is intelligible to a screen reader; contrast
  passes in **both** light and dark appearance.
- **SC-013**: **No** password, code, or credential appears in any log, telemetry event, or analytics payload —
  verified by sweep, not by inspection.
- **SC-014**: The customer capability register is updated so that **no** capability's state on either customer
  surface is left unstated.

---

## Scope

### In scope

- The customer account page: identity display, name editing, password set/change, sign out, sign out
  everywhere.
- The platform knowing, and correctly reporting, whether an account has a password.
- Step-up email verification, existing solely to pay for establishing a first password.
- **The existing account-recovery ("forgot password") flow, pulled into scope during planning** — but only
  so far as FR-022b requires: it must obey the same password rules, and it must not leave the platform's
  password-state knowledge wrong. Its user journey is otherwise unchanged.
- Correcting the customer capability register (see Dependencies — it currently **overstates** what the
  storefront delivers).

### Out of scope

- **Changing the email address.** An identity operation with its own takeover risks and its own verification
  design; it deserves its own slice. Here the email is displayed, and read-only.
- **Uploaded avatar images.** Initials only — no upload, no storage, no moderation.
- **Deleting the account**, and any data-export / right-to-erasure flow.
- **Multi-factor authentication**, passkeys, and any credential route beyond the three the platform already
  has.
- **Un-parking Google sign-in.** This feature must be *correct* for a Google-linked customer, but it does not
  enable the route.
- **A session/device list** ("you are signed in on 3 devices"). "Sign out everywhere" ships; enumerating and
  individually revoking sessions does not.
- Addresses, payment methods, order history, notification preferences — later slices.

---

## Assumptions

- **The customer audience's credential routes are as the constitution defines them** (Principle IV, v1.7.0):
  email+password, email one-time code, and Google, all converging on one identity. Google is currently
  **parked**, so in practice every customer today is either a password customer or a never-had-a-password
  customer. This feature is designed to be correct for all three.
- **No password is a normal, permanent, first-class state.** A large share of customers will never set one, and
  the product does not want them to. The set-password control is a convenience on offer, not a remediation.
- **Setting a password is a credential-establishing act, and is priced accordingly** (FR-017). The research
  behind this spec was unanimous, and the platform's underlying identity service will *cheerfully permit the
  unsafe version* if the platform simply asks it to — the safety here is entirely the platform's to impose.
  The cost (one email round-trip, for a one-time optional action) is accepted deliberately in exchange for
  closing a silent, permanent account-takeover path.
- **A password change signs out other devices; the current device stays signed in.** Signing the customer out
  of the device they just used would be gratuitous.
- **Password policy follows current NIST guidance, with one deliberate deviation.** Breach screening: yes. No
  composition rules, no scheduled expiry: correct, both are now considered harmful. **Length: 12, not NIST's
  15** — a knowing trade-off (see Clarifications), and one that is only defensible **while breach screening and
  rate limiting are both in place**. If either is ever dropped, the length floor must be revisited.
- **The name on the platform record is the name the platform uses.** Where the customer's credential also
  carries a name, the record is the authority, and the two must be reconciled rather than allowed to drift
  (FR-012).
- **The storefront's existing laws still bind**: the guest-first performance budget, the refusal of open
  redirects, the barred-customer refusal, and the rule that a valid credential is never permission.

---

## Dependencies

- **The existing customer record and identity read** (011) — this feature extends both. It adds the
  password-state knowledge the record does not currently hold (FR-013).
- **A working transactional email path.** Two requirements here are **email-delivery dependent**: the step-up
  code (FR-017) and the change notification (FR-025). Branded, production-grade customer email is the subject
  of **010**, whose operator steps (SES production access, the domain identity) are **still open**. **If email
  does not send, the set-password flow does not work at all** — a hard dependency, not a nicety.
- **A breached-password screening service** (FR-022 / FR-022a) — a **new external dependency**, accepted
  knowingly (see Clarifications). It must be queried without transmitting the password, and its outage behavior
  must be a decision the platform states rather than a default it inherits.
- **⚠ Two open questions inherited from 011 must be settled before this feature can be trusted**, and both can
  change its design. Both are already recorded as that slice's operator spikes:
  - **T053** — whether a never-had-a-password customer can set one, and by what means. The research performed
    for this spec indicates the platform's identity service **permits it from a bare session**, which is
    precisely the hazard FR-017 exists to close. **This must be proven live, not assumed.**
  - **T052** — whether a first Google sign-in links into the existing profile or creates an orphan. An orphaned
    federated account **cannot be merged retroactively**, and for such a customer the entire password section of
    this page would be a lie. Google is parked, so this is not blocking — but it is binding the day it is
    un-parked.
- **⚠ A live gap that exists right now, before this feature ships**: a customer who has never had a password can
  already click **"Forgot password?"** on the live sign-in page, and what the platform does in response is
  **unverified**. This spec does not create that gap, but it sits next to it, and it should be settled in the
  same breath.
- **⚠ The customer capability register currently overstates the storefront.**
  `docs/audiences/customer-capabilities.md` row 10 records "sign-out clears it" as **delivered (✅)** on
  `customer-web`. **There is no sign-out in the storefront at all** — it was never built. This feature makes
  that row true; the register must be corrected as part of it (SC-014).

---

## Clarifications

### Session 2026-07-14

Two decisions were the product owner's — both security-versus-conversion trade-offs on the password rules,
where no default was obviously right. Both are now settled and folded into **FR-022 / FR-022a**.

- **Q: What minimum password length does Effy enforce?**
  **A: 12 characters.** A deliberate, documented deviation from current NIST guidance, which sets the floor at
  **15** for a password used as a *single* factor — which Effy's is, since no second factor is in scope. 15 was
  judged too costly on a storefront where a password is an **optional** convenience in the first place (a
  customer who finds it onerous can simply keep using the emailed code, which is the safer route anyway). The
  deviation is defensible **because** it is paired with the two controls below, and it stops being defensible if
  either is dropped: **breach screening** (FR-022) and **rate limiting** (FR-020).

- **Q: Are new passwords screened against known-breached password lists?**
  **A: Yes, in this slice.** NIST requires it and the platform's identity service does not provide it, so this
  takes a new external dependency — accepted knowingly. Without it, a customer could set a password that appears
  in a public breach corpus and the platform would have no idea; credential-stuffing feeds on exactly that.
  **FR-022a** constrains how: the password itself is never transmitted, and a breach-service outage must not
  silently wave an exposed password through.
