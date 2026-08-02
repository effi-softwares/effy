# Feature Specification: Customer Account Centre — Detail-Row Editing, Sectioned Account & Account Deletion

**Feature Branch**: `034-customer-account-center`

**Created**: 2026-08-02

**Status**: Draft

**Input**: User description: "Redesign the profile details page in the account section of the mobile
apps. Remove the direct link to personal details — open it by tapping the name / email / profile
picture header. Replace inline input fields with detail rows that open a bottom sheet to edit one
field at a time (Save button, Cancel beneath it). Email cannot be changed. Restructure the account
page and its other sections to follow the Uber Eats shape. Security follows the same per-field sheet
pattern. In the address book, list all saved addresses, mark the default, and replace the floating
action button with a full-width primary button at the bottom that opens a drawer to add an address.
Saved items and notifications become icon buttons. Move sign out off the account root into personal
details or security. Add account deletion (soft delete, permanent after 30 days — the purge itself is
out of scope) placed somewhere deliberately non-obvious such as the bottom of the privacy or security
page, blocked while the customer has active orders or other active obligations."

---

## Context: what this feature is, and what it is not

This is **an information-architecture and editing-model change to the customer account area, plus one
genuinely new capability (account deletion)**. It is not a re-theme, and it is not a rebuild of the
capabilities the account area already hosts — the address book, saved items, orders, help and password
management all already exist and keep working. What changes is **where they live, how they are reached,
and how a value is edited**.

Three separate problems are being solved, and only one of them is cosmetic:

1. **The account root is a flat, ungrouped list of eleven rows**, with a single blank gap doing the work
   of grouping. Identity sits at the top as decoration with no affordance on it. A shopper looking for
   "where do I change my name" gets no signal that the header relates to the "My details" row.
2. **Editing is a whole-screen form for one field.** Changing a name means a pushed screen with two
   inputs and a Save button. The current value is not visible until the screen loads, and there is no
   dirty-check — Save is live whether or not anything changed.
3. **⚠ There is no way to delete an account, and that is a shipping blocker.** Apple has required in-app
   account deletion since **30 June 2022**; Google Play requires **both** an in-app path **and** a
   declared public web URL. Effy's customer app has open self-registration, so both rules bite, and
   neither is satisfiable today: `public.customer` has no deletion concept of any kind — no `deleted_at`,
   no closed status, no delete path.

### The store rules, stated precisely

The requirement is routinely mis-cited, so this spec states it as the research found it:

- **Apple's guideline is a single sentence.** 5.1.1 subsection **(v) is titled "Account Sign-In"**, and
  the whole mandate reads: *"If your app supports account creation, you must also offer account deletion
  within the app."* **Every testable detail** — easy to find, deactivation insufficient, regulated
  industries, permitted friction — lives on the linked support page, not in the guideline. A plan citing
  only the guideline will not carry the requirements.
- **Google requires a second, independent channel Apple does not**: *"Users must have a readily
  discoverable option to initiate app account deletion from within your app **and outside of your app**
  (for example, by visiting your website)"*, declared in the Play Console Data safety form. **An
  Apple-compliant app can be Play-non-compliant**, and a missing web URL is the single most reported
  Play rejection in this area.
- **⚠ Guest accounts are in scope.** Apple's FAQ is explicit: *"Users should have the option to delete
  automatically generated accounts (sometimes called 'guest' accounts) and the data associated with those
  accounts."* Effy is deliberately guest-first, and a guest's saved list survives a restart — so this is
  not hypothetical (FR-046).
- **Compliance with GDPR is not a substitute**: *"All users should be allowed to delete their accounts,
  regardless of where they're located."*

### ⚠ Correction on record: blocking deletion during an active order IS defensible

An earlier reading of the policies suggested the brief's blocking requirement was a rejection risk. The
completed research **does not support that conclusion**, and the brief is followed as written:

- **Neither store has any rule permitting or prohibiting an obligation-block.** The only governing text
  is Apple's limit that *"apps that make it unnecessarily difficult for a user to delete their account
  will not pass review."*
- **Both of Effy's named reference platforms block.** Uber: *"You won't be able to delete your Uber
  account if you have an outstanding payment."* Instacart: *"Wait until any active orders have been
  delivered/picked up."* eBay blocks on fees, funds and open transactions. The practice is universal,
  long-standing and unchallenged.
- **What actually gets rejected is a dead end, not a block.** The rejections on record are
  *deactivation-only* flows with **a support agent standing between the tap and erasure** — a different
  shape entirely.

So a block is permitted, and it survives review only as **a signposted detour**: name the specific
blocker, link straight to the thing that resolves it, and say when it clears (FR-042). Two hard limits
follow, and they are requirements rather than advice:

- **Never block on anything that requires leaving the app to resolve** — a support call or an email
  silently becomes the "contact support" flow Apple forbids.
- **Every blocker MUST either be resolvable by the shopper, or self-clear within a short, stated
  period.** Waiting is acceptable — Instacart's *"wait until any active orders have been
  delivered/picked up"* is exactly that — but waiting **without a bounded end** is not.

*(⚠ The second limit was originally written as "never block on something the shopper cannot resolve
inside the app", which is too strong: it would forbid the in-flight-order block that every reference
platform ships. The corrected form is what actually distinguishes an acceptable detour from a dead end.
See FR-042.)*

### ⚠ Soft delete is defensible, but it rests on practice, not on a ruling

The brief's 30-day soft delete is industry-standard, but the evidence is behavioural, not official, and
the spec should not pretend otherwise:

- **Instagram shipped a 30-day, login-cancellable window on 30 June 2022 — the exact day Apple's rule
  took effect** — stating it was *"in line with Apple's guidelines as the company says it's acceptable if
  account deletion takes time after the initiation."* Four years of review cycles since.
- **Uber's is documented verbatim**: *"your account will be immediately deactivated and then permanently
  deleted after 30 days… If you sign back into your account during this period, your account will be
  restored."*
- **Apple's own FAQ permits delay**: *"If your process for account deletion is manual or otherwise takes
  time to complete, this is acceptable. Inform the user how long it will take."*
- **⚠ Apple has never answered the soft-delete question on the record.** Three Developer Forums threads
  ask it precisely; **all three have zero replies from Apple.**
- **⚠ Google's wording is the weakest link**: *"Temporary account deactivation, disabling, or 'freezing'
  the app account does not qualify as account deletion."* The defensible reading is that this bars
  deactivation *as a substitute*, not deferred erasure that runs automatically — but no Google text
  resolves it.

**The design consequence is specific and load-bearing**: the difference between the shape that ships and
the shape that gets rejected is **whether a human stands between the shopper's tap and erasure**. So this
feature **must** label the control "Delete account", **must never** surface a "deactivated" state or
offer reactivation as a feature, and erasure **must** run automatically with no support step (FR-037).

### Scope boundary: the purge itself is out of scope

Per the brief, this feature builds the **soft delete** — the request, the immediate refusal of access,
the grace window, and the customer-facing account of what happens. **The scheduled job that performs
permanent erasure at day 30 is explicitly NOT built here.**

**⚠ That boundary has a consequence which must be written down rather than discovered later.** A shopper
told "your data will be permanently deleted after 30 days" will, on day 31, still have a row. **These
apps therefore MUST NOT be submitted to either store until the erasure slice ships** — until then the
disclosure required by FR-040 is a promise the platform cannot keep. Recorded as **FR-041** and
**SC-011**.

---

## Reference and doctrine

Per constitution Principle V, **Uber Eats is the named reference platform**, and the operator supplied
four screenshots of its account area. The research both confirmed and **corrected** the reference; the
corrections are recorded so a later reader does not "restore" a detail that was never real.

| Treated as fact | Basis |
|---|---|
| Three-level spine: **root (identity + shortcuts) → named single-topic screens** | Converged across Uber, Instacart, DoorDash, eBay, Amazon, Woolworths, Just Eat |
| **One field at a time, with an explicit Save** | Uber's own wording: *"Tap the specific detail you want to change and enter updated information. Click 'Save'."* |
| **Deletion sits under Privacy** | Uber's verified path: `Account → Settings → Privacy → Account Deletion`. It is a data-rights action, not a credential action |
| **Add must not out-shout Edit in an address book** | Baymard: shoppers nudged to *"Add"* rather than *"Edit"* *"accumulate outdated addresses, increasing the chance that the user will select the wrong address during subsequent checkout"* |
| **Re-authentication before deletion is permitted** | Apple FAQ: *"You may add steps to verify the identity of the person making the request… such as by entering a code from an email or phone number already associated with the account."* |

| ⚠ NOT treated as fact | Why |
|---|---|
| That Uber's detail rows open a **bottom sheet** | Unverified. Uber's docs are equally consistent with a pushed screen; one UI index says "Edit **screen**". **The sheet is the operator's decision and is specified on that authority — not on Uber's** |
| A **green verified tick** on email/phone | No evidence. Uber's "verified badge" is ID verification of the *person* — a different concept, and conflating the two would be a security-meaningful error |
| **"Connected social apps"** as a Security item | Uber documents *"Third-party app access"*, and places it under **Privacy** |
| **Save-above-Cancel** as a settled pattern | Genuinely contested in the literature. Specified below as a reasoned choice with an explicit mis-tap mitigation |
| The exact **Favorites / Wallet / Orders** tile row | Unverified in any source; taken from the operator's screenshot, which is sufficient authority |
| That a **data-only** deletion option is mandatory | Google's language is permissive throughout — *"gives developers a way"*, *"opportunity"*. It earns a store-listing badge; it is not an obligation |

**⚠ Uber is a poor reference in exactly one place, and it is the place that matters most.** Uber has no
fully passwordless consumer account. Effy's customer pool has **three credential routes** —
email+password, email OTP, and Google federated sign-in — so a Security screen built from a fixed row
list will be **wrong for a large share of customers**. This is the presentation half of the defect
feature 012 found in the identity provider's semantics. The Security screen is therefore specified as
**rendered from the credentials the account actually holds** (FR-025), and the same rule binds the
deletion re-authentication gate (FR-043) — a password prompt shown to a Google-only shopper is a dead
end, and therefore *"unnecessarily difficult"*.

**⚠ One placement risk is accepted deliberately.** The brief places deletion at the bottom of the privacy
screen. Both stores endorse *"account settings"* as the canonical home, and Apple's interface guidance
warns against burying the link. `Account → Privacy & data → bottom` is **one level deep and matches the
verified Uber path**, so it is judged acceptable — but it is a judgement, not a certainty, and the plan
should note that a reviewer with a fresh account and no map is the test (SC-007).

**No-card doctrine (Principle V)**: the account area is lists, detail rows and section headings
throughout. The one place a card-like container appears is the **quick-action tile row**, which the
operator's screenshot shows as three filled tiles. **The plan MUST record a justification.** The honest
one is that these are *navigation controls*, not content containers — the doctrine bars cards used *"to
lay out content"*. A container-free alternative (icon + label, no fill) satisfies the brief equally, and
the plan MUST choose deliberately rather than by default.

---

## User Scenarios & Testing *(mandatory)*

> **Every story below applies to BOTH customer surfaces (FR-058).** They are narrated from the mobile
> app because that is where the brief originates and where the interaction is most constrained. On the
> web storefront the same capability appears in that surface's native container — a dialog on larger
> screens, a drawer on smaller — and gestures named here (swipe-to-dismiss, system back) read as their
> web equivalents (backdrop click, escape, browser back). A story demonstrated on one surface only is
> **not** complete.

### User Story 1 - Change one detail without a form (Priority: P1)

A signed-in shopper wants to correct their name. They open the Account tab, tap their own name at the
top — the obvious thing to tap — and land on a screen listing their details with the current values
visible. They tap the name row. A sheet rises with just that one value, already focused. They fix it,
tap Save, the sheet closes, and the new value is visible on the row behind it.

**Why this priority**: This is the core of the brief and it replaces the most-used editing path in the
account area. It also establishes the pattern every other screen here reuses, so nothing else can be
built coherently before it. On its own it already delivers a better editing experience than exists today.

**Independent Test**: From the account root, reach personal details **without using a "My details" row**,
change the name via the sheet, confirm the row behind updates, then fully close and reopen the app and
confirm it persisted. Deliverable value: editing one detail is a two-tap, in-context action.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper on the Account tab, **When** they activate the identity header (name,
   email, or avatar), **Then** the personal details screen opens.
2. **Given** the personal details screen, **When** it renders, **Then** each detail appears as a row
   showing its label and its **current value**, with no editable input field on the screen.
3. **Given** the personal details screen, **When** the shopper activates an **editable** row, **Then** a
   sheet opens containing only that field, pre-filled, focused, with the keyboard raised.
4. **Given** an open edit sheet with a changed value, **When** the shopper activates Save, **Then** the
   sheet closes, the row behind shows the new value, and the change survives an app restart.
5. **Given** an open edit sheet, **When** the shopper activates Cancel, **Then** the sheet closes and
   **no** change is recorded.
6. **Given** an open edit sheet whose value **has** been changed, **When** the shopper attempts to
   dismiss it by swiping, tapping outside, or the system back gesture, **Then** they are asked to confirm
   discarding the change before it is lost.
7. **Given** an open edit sheet whose value has **not** been changed, **When** the shopper dismisses it
   by any means, **Then** it closes immediately with no confirmation prompt.
8. **Given** an open edit sheet, **When** the shopper enters a value the platform refuses, **Then** the
   error appears **inside the sheet**, against the field, and the typed value is preserved.
9. **Given** an open edit sheet, **When** the change cannot be delivered, **Then** the sheet stays open,
   the typed value is preserved, and the failure is distinguishable from a refusal of the value.
10. **Given** the email row, **When** the shopper activates it, **Then** they are told plainly that the
    email cannot be changed — it does **not** open an edit sheet and does not appear editable.

---

### User Story 2 - An account page that is grouped, not eleven rows (Priority: P1)

A shopper opens the Account tab and sees who they are signed in as, a small row of icon shortcuts to the
things they use most, and the account's topics gathered into labelled groups. Sign out is not on this
screen — it lives with the other credential actions, where a stray tap cannot reach it while browsing.

**Why this priority**: It is the structural half of the brief and what makes every other screen here
reachable. It also removes a live hazard: two destructive sign-out rows currently sit on the account
root immediately below ordinary navigation rows.

**Independent Test**: Open the Account tab and confirm the identity header, the icon shortcut row, and
labelled sections; confirm sign out is absent from the root and present on its new home; confirm every
previously reachable destination is still reachable. Deliverable value: an account area a shopper can
scan.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper, **When** they open the Account tab, **Then** they see their name and
   avatar in a header, a row of icon shortcuts, and the remaining destinations grouped under headings.
2. **Given** the account root, **When** it renders, **Then** **Saved items** and **Notifications** appear
   as icon shortcuts rather than text rows.
3. **Given** the account root, **When** it renders, **Then** **no sign-out control of any kind appears**.
4. **Given** the account root, **When** it renders, **Then** there is **no** "My details" text row — the
   identity header is the only route to it.
5. **Given** any account sub-screen, **When** the shopper uses the back affordance, **Then** they return
   to the account root with the tab bar intact.
6. **Given** every destination reachable from the account root before this change, **When** the redesign
   ships, **Then** each is still reachable — none is orphaned.
7. **Given** an icon shortcut, **When** a shopper using a screen reader or the largest supported text
   size encounters it, **Then** it exposes a text label; an icon alone is not sufficient.

---

### User Story 3 - Delete my account (Priority: P1)

A shopper decides to leave. They find the control at the bottom of the privacy screen — not on the
account root, and not somewhere they could hit by accident. Before committing they are shown exactly
what deleting means: what goes, what is kept and why, and what happens to anything still in flight. If
something genuinely blocks it, they are told what and how to clear it. They prove who they are, confirm
deliberately, and the account is closed immediately.

**Why this priority**: **The apps cannot be published without it** — required by Apple since 30 June 2022
and by Google in two places. It is also the only genuinely new capability here; everything else
rearranges things that already work.

**Independent Test**: From a signed-in account, reach the deletion control from within the app, complete
the flow, and confirm the account is immediately refused on every customer surface. Deliverable value:
the app becomes publishable, and a shopper can exercise a right they currently cannot.

**Acceptance Scenarios**:

1. **Given** a signed-in shopper, **When** they navigate the account area, **Then** the deletion control
   is reachable and completable **entirely within the app** — no email, phone call, or support ticket.
2. **Given** the privacy screen, **When** it renders, **Then** the deletion control is its **last** item,
   and it does **not** appear on the account root.
3. **Given** a shopper who activates it, **When** the flow begins, **Then** before any irreversible step
   they are shown: what is deleted, what is **retained and why**, the effect on anything in flight, and
   the date after which recovery is impossible.
4. **Given** the final step, **When** the shopper reaches it, **Then** they must prove control of the
   account with a **freshly issued verification code** — a valid session alone is not sufficient.
5. **Given** a shopper whose only credential is a federated identity, **When** they reach the
   verification step, **Then** it is completable — the gate never demands a credential they do not have.
6. **Given** a shopper who completes the flow, **When** it succeeds, **Then** the account is closed
   immediately, every session ends, and they are returned to the signed-out storefront.
7. **Given** a closed account, **When** its credentials are used on any customer surface, **Then** access
   is refused.
8. **Given** a shopper who abandons the flow before final confirmation, **When** they leave, **Then**
   nothing is changed.
9. **Given** the flow, **When** a shopper reads it, **Then** the action is called **"Delete"** — it never
   offers to deactivate, disable, freeze, or pause instead.
10. **Given** a shopper with an active order, **When** they enter the flow, **Then** they are told
    **which** obligation blocks deletion, given a direct route to it, and told when it will clear.
11. **Given** a blocked shopper who resolves the obligation, **When** they return, **Then** deletion
    proceeds with no further obstacle.

---

### User Story 4 - Manage how I sign in, in one place (Priority: P2)

A shopper opens Security and sees only what is true of their account: a password row if they have one, an
invitation to set one if they don't, the Google account linked to their sign-in if there is one, and the
controls that end their sessions.

**Why this priority**: It gives sign out a principled home (US2 depends on one existing) and fixes a
correctness problem, not just a layout one — the current single "Change password" / "Set a password" row
is the presentation half of the passwordless hazard feature 012 identified.

**Independent Test**: Sign in by each of the three credential routes and confirm Security shows only rows
that apply; confirm both sign-out actions work from their new home. Deliverable value: a screen that
never offers a credential action meaningless for that account.

**Acceptance Scenarios**:

1. **Given** a shopper **with** a password, **When** Security renders, **Then** a password row is shown
   with when it last changed, and no "set a password" invitation appears.
2. **Given** a shopper **without** a password, **When** Security renders, **Then** they are invited to set
   one, and **no** "change password" row appears.
3. **Given** a shopper who signed in with Google, **When** Security renders, **Then** the linked account
   is shown, identified as the provider's, and is not presented as an editable Effy value.
4. **Given** Security, **When** it renders, **Then** **Sign out** and **Sign out on all devices** appear,
   visually distinguished from one another by consequence.
5. **Given** sign out on **all** devices, **When** the shopper activates it, **Then** they are asked to
   confirm, because it affects sessions they cannot see.
6. **Given** a completed password change, **When** it succeeds, **Then** the shopper is told all sessions
   ended, including this one, before being returned to sign-in.

---

### User Story 5 - Add an address without hunting for the button (Priority: P2)

A shopper opens the address book, sees every saved address with the default clearly marked, and finds a
full-width **Add address** button pinned at the bottom. Tapping it opens a drawer. Tapping an existing
address opens the same drawer to edit it.

**Why this priority**: Independent of every other story and small, but it carries a measured risk if done
carelessly. P2 rather than P1 because the address book works today; this changes its add affordance.

**Independent Test**: Open the address book with several saved addresses, confirm the default is marked
and the floating button is gone, add an address from the bottom button, then edit an existing one by
tapping its row. Deliverable value: a labelled, reachable add action that does not cover the list.

**Acceptance Scenarios**:

1. **Given** the address book, **When** it renders, **Then** every saved address is listed and the default
   is unmistakably marked.
2. **Given** the address book, **When** it renders, **Then** **no floating action button is present**, and
   a **full-width primary button at the bottom** offers to add an address.
3. **Given** the add button, **When** it is activated, **Then** a drawer opens to enter a new address.
4. **Given** a saved address row, **When** the shopper activates its body, **Then** the same drawer opens
   to edit that address.
5. **Given** a list long enough to scroll, **When** the shopper scrolls to the last address, **Then** the
   add button does **not** obscure it.
6. **Given** the marked default, **When** a shopper who cannot distinguish colours views the list,
   **Then** the default is still identifiable.

---

### User Story 6 - Understand what the platform knows and holds (Priority: P3)

A shopper opens Privacy & data and finds, in one place, the privacy policy and terms, control over what
Effy sends them, and — at the bottom, after all of it — the deletion control.

**Why this priority**: It is the host screen US3 needs, and an in-app privacy policy link is itself
required by **both** stores. P3 because only the parts US3 and the store rules depend on are strictly
required now; richer contents can follow.

**Independent Test**: Open Privacy & data, confirm the policy and terms are reachable in-app, confirm
marketing messages can be declined, and confirm the deletion control sits last. Deliverable value: the
legal surface a published app is required to have.

**Acceptance Scenarios**:

1. **Given** the account area, **When** a shopper opens Privacy & data, **Then** the privacy policy and
   the terms of service are reachable from inside the app.
2. **Given** Privacy & data, **When** it renders, **Then** the account deletion control is the **last**
   item on the screen.
3. **Given** Privacy & data, **When** a shopper reads it, **Then** it states what is retained after
   deletion and why.
4. **Given** a shopper who has consented to promotional messages, **When** they open Privacy & data,
   **Then** they can withdraw that consent without leaving the app.

---

### Edge Cases

- **A shopper clears their name entirely.** Both name parts are nullable today; the sheet must not imply
  otherwise, and the header must still render something.
- **A shopper opens an edit sheet, backgrounds the app, and returns.** The sheet and the typed value must
  survive, or work is silently lost.
- **An edit sheet on a tablet in landscape.** A full-bleed sheet becomes a very wide strip holding one
  field; width must be bounded.
- **The session expires while an edit sheet is open.** The save fails; the typed value must not be
  discarded on the way to sign-in.
- **A shopper is barred mid-session inside the account area.** The existing refusal takes over; no
  account screen may present an editable control to a barred customer.
- **A barred shopper requests deletion.** Barring is a platform sanction; deletion is a shopper right.
  These conflict, and the outcome must be decided deliberately rather than by whichever gate runs first.
- **A shopper deletes their account with an order out for delivery.** Blocked by FR-042 — but the block
  must resolve on its own once the order completes, without the shopper needing support.
- **A shopper completes deletion, then signs in during the grace window.** Whether this restores the
  account is a deliberate choice with compliance consequences (FR-037).
- **A shopper deletes, then registers again with the same email.** The new registration must not collide
  with or resurrect the closed record.
- **A guest deletes their local data.** A guest has no server record but does hold a device-local saved
  list that survives restarts — and Apple's FAQ names guest accounts explicitly.
- **App review deletes the demo account.** A documented, repeatedly reported trap: the *next* submission
  is rejected as a login bug. This must be designed for before the flow is built, not discovered.
- **A shopper's only credential is Google.** Deletion must still be provable and completable, and any
  provider-side revocation obligation met.
- **The device is offline** when Save is activated. Must be distinguishable from a refusal.

---

## Requirements *(mandatory)*

### Functional Requirements

#### The account root (US2)

- **FR-001**: The account root MUST present the signed-in shopper's identity — avatar, name and email —
  as a header at the top of the screen.
- **FR-002**: The identity header MUST be a single activation target opening the personal details screen.
- **FR-003**: The account root MUST NOT contain a text row duplicating the identity header's destination.
- **FR-004**: The account root MUST present **Saved items** and **Notifications** as icon shortcuts
  rather than text rows.
- **FR-005**: Each icon shortcut MUST carry a visible text label and expose an accessible name.
- **FR-006**: The account root's remaining destinations MUST be gathered under **labelled section
  headings**, not presented as one undifferentiated list.
- **FR-007**: The account root MUST NOT contain any sign-out control.
- **FR-008**: Every destination reachable from the account root before this feature MUST remain reachable
  after it.
- **FR-009**: Every account sub-screen MUST provide a back affordance to the account root.

#### Personal details and the per-field editing model (US1)

- **FR-010**: The personal details screen MUST present each detail as a row showing its **label** and its
  **current value**.
- **FR-011**: The personal details screen MUST NOT contain an editable input field.
- **FR-012**: Activating an **editable** detail row MUST open a sheet containing **only that field**.
- **FR-013**: The edit sheet MUST pre-fill the field with the current value, focus it, and raise the
  keyboard without further interaction.
- **FR-014**: The edit sheet MUST offer **Save** and **Cancel**, with Cancel placed below Save.
- **FR-015**: Cancel MUST be **visually de-weighted relative to Save** — never a second equally-prominent
  filled action. *(Rationale: with Cancel directly beneath Save in the thumb's resting zone, equal
  weighting turns a mis-tap into silent data loss.)*
- **FR-016**: The edit sheet MUST remain above the on-screen keyboard; neither Save nor the field's error
  may be obscured by it.
- **FR-017**: The edit sheet MUST be dismissible by an explicit visible control **in addition to** any
  drag or swipe gesture. *(Rationale: a path-based gesture cannot be the only route to a function, and
  the drag handle is widely missed.)*
- **FR-018**: If the value has changed, any dismissal that is not Save MUST ask the shopper to confirm
  discarding it.
- **FR-019**: If the value has not changed, dismissal MUST be immediate with no confirmation.
- **FR-020**: Validation errors MUST appear inside the sheet, against the field, preserving the typed
  value.
- **FR-021**: A failed save MUST leave the sheet open with the typed value intact, and MUST distinguish
  "the platform refused this value" from "the change could not be delivered".
- **FR-022**: The **email** MUST be shown as a detail row and MUST NOT be editable. Activating it MUST
  explain why rather than doing nothing.
- **FR-023**: Sheets MUST NOT be stacked — no edit sheet may open a second sheet on top of itself. A
  **multi-step** flow (for example a value requiring a verification step) MUST become a full screen
  rather than a second sheet.
- **FR-023a**: FR-018's discard confirmation is **exempt** from FR-023 and MUST be an alert-style
  confirmation, not a sheet. *(It is a two-button question about the sheet that raised it, and the
  platform guidance that requires the confirmation is the same guidance that prescribes this shape. The
  exemption is stated because otherwise FR-018 and FR-023 appear to forbid each other.)*
- **FR-024**: The edit sheet's width MUST be bounded on large screens rather than filling the display.

#### Security (US4)

- **FR-025**: The Security screen MUST be composed from the credentials the account **actually holds**,
  and MUST NOT present a credential action that does not apply to that account.
- **FR-026**: A shopper with a password MUST see a password row; a shopper without one MUST see an
  invitation to set one; **never both**.
- **FR-027**: A linked federated identity MUST be shown, identified as the provider's, and MUST NOT be
  presented as an editable Effy value.
- **FR-028**: **Sign out** and **Sign out on all devices** MUST live on the Security screen.
- **FR-029**: **Sign out on all devices** MUST require confirmation; ordinary sign out MUST NOT.
- **FR-030**: The two sign-out actions MUST be visually distinguished by consequence, and this feature
  MUST settle the existing disagreement between the customer surfaces over whether sign out is styled
  destructive. *(Web deliberately does not; mobile currently does.)*
- **FR-031**: Security actions expressible as a single field MUST use the same edit-sheet pattern.
  Multi-step credential flows MUST NOT be forced into a sheet.

#### The address book (US5)

- **FR-032**: The address book MUST offer adding an address via a **full-width primary button at the
  bottom of the screen**, and MUST NOT use a floating action button.
  **⚠ This AMENDS feature 022's FR-007**, which mandates *"a bottom-sheet drawer raised by a floating
  action button"*. The amendment MUST be recorded in 022's spec, not only here.
- **FR-033**: The add button MUST NOT obscure the last row of the list.
- **FR-034**: Activating the add button MUST open a drawer to enter the address.
- **FR-035**: Editing MUST remain **as reachable as adding** — activating an address row's body opens the
  same drawer. *(Rationale: measured usability research finds that nudging shoppers toward Add over Edit
  makes them accumulate stale addresses and mis-address orders. For a delivery platform that is a
  delivery-failure risk, not a tidiness one.)*
- **FR-036**: The default address MUST be marked by more than colour alone.

#### Account deletion (US3)

- **FR-037**: The flow MUST be presented as **deletion**, and MUST NOT offer deactivation, disabling,
  freezing or pausing as an alternative or an intermediate state. No "deactivated" state may be surfaced.
  **Erasure MUST proceed automatically once requested — no human step and no support agent may stand
  between the request and it.** *(Rationale: both documented App Review rejections were
  deactivation-with-a-human-in-the-loop; that is the specific shape that fails.)*
- **FR-038**: Deletion MUST be initiable **and** completable entirely within the app — never by email,
  phone, or support ticket.
- **FR-039**: The deletion control MUST be the **last item on the Privacy & data screen** and MUST NOT
  appear on the account root.
- **FR-040**: Before any irreversible step the shopper MUST be shown: what is deleted, what is retained
  **and the reason**, the effect on anything in flight, and the date after which recovery is impossible.
- **FR-041**: The account MUST be marked closed immediately on confirmation, all sessions MUST end, and
  the credentials MUST be refused on every customer surface thereafter — **with exactly one exception:
  the sign-in path itself, which restores the account during the grace window (FR-041a).** Every request
  other than that restoring sign-in MUST be refused.
- **FR-041a**: Signing in during the grace window MUST restore the account, and the restore MUST be a
  **deliberate, auditable act** — never a side effect of the platform's ordinary identity lookup. A
  closed shopper's authenticated request MUST NOT be silently treated as a restore simply because it
  carried a valid token.
  *(⚠ Without this, FR-041 and the grace window contradict each other outright: the same authenticated
  request would be required both to be refused and to restore.)*
  **⚠ Permanent erasure at day 30 is NOT built by this feature, and these apps MUST NOT be submitted to
  either store until the erasure slice ships** — until then FR-040's disclosure is unkeepable.
- **FR-042**: An active order MUST block deletion, and the block MUST: name **which** order blocks it,
  offer a **direct route** to it, and state **when it will clear**. A refusal without a route forward is
  prohibited.
  **⚠ AMENDED TWICE. Read both, because the first amendment was itself wrong.**

  **Amendment 1 (Phase 0 research R1)** — as originally written the requirement had **no exit in
  production**: an order's only terminal state is a fulfilment reaching `collected`, and that transition
  ships behind a dev-only stub with no route in any environment. Every shopper who had ever paid would
  have been permanently undeletable. A bound was added.

  **Amendment 2 (cross-artifact analysis)** — the bound chosen was **30 days, and that was a second dead
  end wearing the first one's clothes.** Effy is a **weekly-re-buy grocery platform**; a shopper who buys
  every week is *always* within 30 days of an order, so "ever paid ⇒ never deletable" was merely replaced
  by "**still shopping ⇒ never deletable**". For the platform's most active customers the outcome is
  identical, and it is squarely Apple's *"unnecessarily difficult"*. The window was 30 days only because
  it matched the grace period — **the two answer completely different questions and should never have
  been the same number.**

  The blocking condition is therefore:
  - **An order awaiting payment blocks.** The shopper resolves it by completing or abandoning checkout —
    genuinely shopper-resolvable, in-app.
  - **A paid order blocks only while goods are plausibly in transit** — that is, while its fulfilment has
    not reached a terminal state **and** the order is less than **7 days** old. A grocery delivery
    completes in hours; 7 days is generous for it, short enough that even a weekly shopper has ample
    windows in which to delete, and it is a **backstop**, not the primary exit — once the delivery
    lifecycle can report completion, almost every order will clear in hours instead.
- **FR-042a**: The platform MUST NOT name as a blocker any obligation it does not actually model. *(No
  balance and no refund concept exists; telling a shopper an unsettled balance blocks them would be a
  refusal they could never act on.)*
- **FR-043**: Final confirmation MUST require proof of control by a **freshly issued verification code**;
  an existing session MUST NOT be sufficient. The gate MUST be completable by **every** credential route
  the platform supports, including a federated-only account.
- **FR-044**: The shopper MUST be able to abandon the flow at any point before final confirmation with no
  effect.
- **FR-045**: Records retained for legal, fraud-prevention, security or accounting reasons — including
  completed orders and payment records — MUST be retained under a **disclosed** basis readable in-app.
- **FR-046**: A **guest** MUST be able to delete the data held for them on the device.
- **FR-047**: Deletion MUST revoke the account's federated sign-in linkage where the identity provider
  requires it. *(⚠ A no-op today, and stated as one rather than silently skipped: this obligation is
  Apple's and attaches to **Sign in with Apple**, which the platform does not offer. Google federated
  sign-in carries no equivalent requirement. Adding Sign in with Apple makes this real work.)*
- **FR-048**: **After erasure**, the erased account's email MUST NOT block a fresh registration, and that
  registration MUST create a genuinely new record — it MUST NOT resurrect or collide with anything.
- **FR-048a**: **During the grace window**, presenting the same email is **not** a fresh registration —
  it is the same person returning, and it MUST be treated as the restore of FR-041a rather than as a
  second account.
  *(⚠ These two were originally one requirement forbidding resurrection outright, which the design
  contradicts: the platform keys a customer on the identity provider's subject, the provider account is
  deliberately left intact through the window so restore can work, and the account-linking rule converges
  one verified email onto one subject. So during the window the same email **necessarily** reaches the
  closing record. Forbidding that would forbid restore. The prohibition belongs after erasure, where it
  is both meaningful and enforceable.)*
- **FR-049**: The interaction between **barred** status and a deletion request MUST be decided explicitly
  and enforced by the platform, not left to gate ordering.
- **FR-050**: A **web-based** route to request account deletion MUST exist, reachable **without the app
  installed**, identifying Effy by name, with the request path prominently placed on the page and
  loading without error.
  *(Google Play requires this in addition to the in-app path, and the URL must be declared in the Play
  Console Data safety form.)*
- **FR-050a**: The web deletion route MUST be usable by someone who has **uninstalled the app** — it MUST
  NOT require any credential or step obtainable only inside the app.
  *(⚠ The web account area is session-gated, which is acceptable **because a customer can sign in on the
  web without the app**. The failure mode to avoid is a page whose only route to deletion depends on
  something the app alone can provide. Note: "the URL must not require a login at all" is a
  developer-reported rejection cause, **not** Google policy text — Google's stated criteria are
  functional, relevant in scope, and references the app or developer name.)*
- **FR-051**: The app-review demo account MUST be handled so that a reviewer deleting it does not break
  the next submission — by review-note instruction to register a throwaway account, **not** by a
  special-cased account in code.

#### Privacy & data (US6)

- **FR-052**: The privacy policy and the terms of service MUST be reachable from within the app.
  *(An in-app privacy policy link is required by both stores, not only in store metadata.)*
- **FR-052a**: ⚠ **Neither document exists on the platform today.** This feature delivers the routes and
  the in-app links; the **content is operator-owned and legally reviewed**, and MUST NOT be
  auto-generated. Placeholder legal text would defeat FR-045 and SC-010, both of which require the
  retention disclosure to be *true* — and Apple has demanded that developers cite the specific law
  behind a retention claim.
- **FR-053**: The Privacy & data screen MUST state what is retained after deletion and why.
- **FR-054**: A shopper MUST be able to withdraw consent to promotional messages from within the app,
  without that withdrawal disabling any app functionality.

#### Cross-cutting

- **FR-055**: Every interactive element MUST present a touch target of at least **48 dp** (48 pt on
  iOS), measured as the **activation area**, not the drawn glyph.
  *(⚠ The number is stated rather than left as "the platform minimum" because feature 033 shipped a
  32 dp control directly beneath a comment asserting it met the minimum. An unstated constant cannot be
  checked, and was not.)*
- **FR-056**: Opening a sheet MUST move assistive-technology focus into it, announce it, keep the content
  behind it inert, and return focus to the originating row on close.
- **FR-057**: Every state introduced here MUST be legible in both light and dark appearance, and MUST NOT
  use colour as the only carrier of meaning.
- **FR-058**: Every capability in this feature MUST be delivered on **both** customer surfaces —
  `customer-mobile` and `customer-web` — and recorded in the customer parity register. Each surface MUST
  remain native to itself: the single-field editing model is a **sheet** on mobile and the
  **surface-appropriate responsive container** on web (a dialog on larger screens, a drawer on smaller),
  per the precedent feature 022 already set.
- **FR-058a**: The web storefront's **guest** bundle budget MUST NOT regress. Every screen in this
  feature is behind a session, so none of it may reach a guest route.
  *(⚠ `/search` and `/cart` currently sit 0.5 KB and 0.2 KB from the gate — there is no headroom to
  spend, and this feature adds interactive editing containers to the signed-in tree.)*
- **FR-058b**: Where a requirement here changes behaviour a surface already has, **both** surfaces MUST
  change together — a requirement met on one surface only is not met.
- **FR-058c**: Every **publicly reachable** route this feature creates — the privacy policy, the terms,
  and the web deletion route — MUST be added to the guest bundle gate **in the same change that creates
  it**. *(A public route the gate does not measure is a blind spot: one such route previously sat 58.8 KB
  over budget for two features before anyone looked.)*
- **FR-059**: Account and deletion events MUST be observable, with **no personal data in telemetry**
  beyond the authenticated subject identifier.

#### Data the account area presents

- **FR-060**: The personal details screen MUST present the shopper's **phone number** as an editable
  detail row, edited through the same single-field sheet as every other detail.
  **This is net-new data** — no phone exists on the customer record today.
- **FR-060a**: The phone number is **NOT verified** by this feature. It MUST therefore **NOT** be
  displayed with any verified/confirmed indicator, and MUST NOT be used as an identity or recovery
  factor anywhere. *(Rationale: an unverified value shown with a confirmation mark is a lie the shopper
  will reasonably rely on. Verification is a later slice; until it exists the field is a convenience
  contact detail and nothing more.)*
- **FR-060b**: The profile phone MUST NOT silently replace the **delivery contact phone already carried
  on each address**. Where both exist their relationship MUST be explicit, so that two fields cannot
  disagree about who a driver should call.
- **FR-061**: The shopper's avatar MUST continue to be **generated from their initials**, with a neutral
  fallback when no name is set. **No image upload is introduced by this feature** — the header simply
  becomes activatable. Feature 012's FR-001–FR-005 therefore stand **unamended**.

### Key Entities

- **Customer**: the existing shopper record. Gains a **closure state**, the moment closure was requested,
  and an **unverified phone number**. It does **not** gain a stored image — the avatar stays derived from
  the name.
- **Account closure request**: what the shopper asked for and when, what proof was accepted, and the date
  after which recovery is impossible. **Deliberately distinct from the customer's existing
  `active`/`barred` standing**, which is a *platform sanction* — conflating a shopper's own decision with
  a sanction the platform imposed would make two very different things indistinguishable in the record,
  and FR-049 could not then be reasoned about at all.
- **Deletion blocker**: an obligation preventing closure — its kind, the thing that resolves it, and when
  it is expected to clear. It exists as an entity because FR-042 requires the shopper to be told all
  three, and a boolean cannot carry that.
- **Editable detail**: a label, a current value, whether it can be edited, and — where it cannot — the
  reason, so the screen can explain rather than ignore.
- **Retained-data disclosure**: the categories kept after closure and the stated reason for each.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A shopper can change their name in **no more than three taps** from the account root
  (header → row → Save), against five today.
- **SC-002**: 5 of 5 shoppers shown the account root and asked to change their name tap the identity
  header within 10 seconds, without being told where to go.
- **SC-003**: **Zero** single-field editors discard a changed value without explicit confirmation —
  verified on mobile across swipe-down, system back and tapping outside, and on web across the close
  control, the escape key, clicking the backdrop, and browser back.
- **SC-004**: The account root presents **no more than four** labelled groups, and no group holds more
  than six items.
- **SC-005**: **Zero** sign-out controls appear on the account root.
- **SC-006**: A shopper signed in by each of the three credential routes sees a Security screen containing
  **only** actions valid for that account — all three verified, **zero** inapplicable rows.
- **SC-007**: A reviewer following only the in-app path, with a fresh account and no guidance, reaches and
  completes account deletion in **under 2 minutes**.
- **SC-008**: A closed account's credentials are refused for **100%** of requests other than the
  restoring sign-in, immediately after closure — verified on **iOS, Android and the web storefront**, and
  across **both** the account service and the commerce service.
- **SC-009**: **Zero** occurrences of "deactivate", "disable", "freeze" or "pause" in shopper-facing
  deletion copy.
- **SC-010**: Every claim in the pre-deletion disclosure is true of the built system, verified item by
  item — no statement describes behaviour that does not yet exist.
- **SC-011**: The store-submission checklist records the erasure slice as an **unmet blocking dependency**
  until it ships.
- **SC-012**: A blocked deletion always names its blocker and offers a route to it — **zero** dead ends
  across every blocking condition.
- **SC-013**: The address book's add button obscures **no** list row at any supported text size, on both
  the shortest and tallest supported screens.
- **SC-014**: Every new screen and editor is legible and operable in **light and dark**, at the largest
  supported text size, on **phone, tablet and desktop**, on **iOS, Android and web** — including Android,
  which has not been visually checked across the three preceding features.
- **SC-015**: A screen-reader user can complete a full detail edit — open, change, save, confirm —
  without sighted assistance, on **both** surfaces.
- **SC-016**: Every capability in this feature is demonstrable on **both** customer surfaces, with
  **zero** entries in the parity register marked delivered on one surface only.
- **SC-017**: The web storefront's guest bundle is **no larger** than before this feature, measured
  against the same gate — none of this feature's code reaches a guest route.
- **SC-018**: The phone number appears with **no** verified indicator anywhere on either surface, and is
  accepted by **zero** identity, recovery or authentication paths.

---

## Assumptions

- **Surfaces**: this feature targets **both customer surfaces at parity — `customer-mobile` and
  `customer-web`** (operator decision, 2026-08-02). The **shop and driver apps are out of scope**: they
  serve admin-provisioned employees who cannot self-register, so the store deletion rules do not reach
  them, and they have neither an address book nor saved items.
- **Parity means equivalent capability, not identical layout.** Each surface stays native to itself —
  the same single-field editing model is a sheet on mobile and the surface-appropriate responsive
  container on web, exactly as feature 022 already established for the address form.
- **The 30-day permanent erasure job is out of scope** by explicit instruction, and is a **blocking
  dependency** for store submission (FR-041).
- **The grace period is 30 days**, matching Uber, Instagram, Snapchat, X and TikTok, and sitting inside
  the one-month statutory response window.
- **Signing in during the grace window restores the account**, following Uber's documented behaviour — no
  separate undo affordance to discover. This is a choice, not a given, and FR-037 constrains how it may
  be presented.
- **Deletion lives under Privacy, not Security.** The brief offered either; deletion is a data-rights
  action and the reference platform places it under Privacy.
- **Blocking obligations are** an order awaiting payment, and a paid order whose goods are plausibly in
  transit (fulfilment not terminal **and** placed within the last **7 days**) — **and nothing else**
  (FR-042, amended twice). ⚠ The order-block window is **7 days and the grace period is 30**; they
  answer different questions and must not be unified. Effy models no balance and no refund, and has no
  subscriptions, so Apple's subscription guidance does not apply.
- **Existing capabilities are re-hosted, not rebuilt.** The address book, saved items, orders, help and
  password flows keep their behaviour except where a requirement here changes it.
- **The notification entry remains the existing inbox**, which is fixture-backed and renders empty. This
  feature does **not** build notification preferences; it changes only how the inbox is reached.
  FR-054's consent withdrawal is a promotional-messaging control, not a notification-preferences centre.
- **No new appearance control** is introduced, though the customer app still lacks one.
- **Retained categories after closure** are assumed to be completed orders, payment records and fraud
  signals. **⚠ The exact list needs legal confirmation before the disclosure copy is final** — Apple has
  demanded that developers *"cite the specific laws"* behind retention claims.
- **A data-only ("delete my data but keep my account") option is NOT built.** Google's language is
  permissive, not mandatory; it earns a store-listing badge rather than satisfying a requirement.
- **Guest deletion (FR-046) is device-local only** — a guest has no server record to erase.
