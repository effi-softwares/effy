# Feature Specification: Platform Email Delivery — Branded, Authenticated, Accountable Mail

**Feature Branch**: `037-platform-email-delivery`

**Created**: 2026-08-05

**Status**: Draft

**Input**: User description: "as the next spec i would like to setup the email related things in AWS. i have the domain effyshopping.com which is bought in godaddy and it is setup in hosted zones (effyshopping.com and delegated dev.effyshopping.com). then i also have google workspace account which has the inbox for hello@effyshopping.com. now currently when we send otps i can only send to the email address that i have put in SES identities. this is not good to continue. for the dev environment all the mails should send using dev.effyshopping.com to all the users who are eligible for getting an email. so basically you have to setup all the email, ses, domain related setup with terraform or backends to complete the email services. at the end any one should be able to receive otp and other mails in the future that is eligible. do a deep dive on current state of the platform, and do a good research on internet about how this SES need to be setup with domains to send emails."

---

## Why this slice exists

Email is not a notification channel on this platform. **It is the credential.** Three of the four
audiences — driver, shop and back-office — have no password and no federated route; a code delivered
to an inbox is the *only* way they can sign in at all. For customers it is one of three routes, and it
is the one that gates sign-up confirmation and password recovery for the other two.

So "can we send email?" is not an infrastructure question here. It is the question *"can this person
use the product at all?"* — and today the honest answer is **"only for some people, and we would not
find out which."**

---

## Current state — MEASURED, not assumed (2026-08-05)

The premise in the feature request, and the blocker recorded in `CLAUDE.md` and
[specs/035-six-digit-otp/SIGNOFF.md](../035-six-digit-otp/SIGNOFF.md), is **out of date**. Both say
sending is confined to individually registered recipients. It is not. Live inspection of the account
and of public DNS says otherwise.

### ✅ Better than recorded — the recipient restriction is already gone

| Fact | Measured value |
| --- | --- |
| Unrestricted sending | **Granted** — review status `GRANTED`, case `178578384200127` |
| Daily send allowance | **50,000 / day**, 14 per second (used in last 24h: 6) |
| Sending enabled | **Yes** |
| `dev.effyshopping.com` as a sending identity | **Verified**, signing enabled, 2048-bit keys, all three signature records published |
| Bounce-return namespace (`mail.dev.effyshopping.com`) | **Verified** — single mail-exchanger record and sender-policy record both correct |
| Per-address block list | **Empty** — nobody is blocked today |
| Inbound mail on the parent namespace | **Working** — one mail-exchanger record, `1 smtp.google.com`, resolving |
| Ownership proof for the operator's mail service | **Published** on the parent namespace |

> **Re-checked 2026-08-05, later the same day.** The parent namespace's mail-exchanger and
> ownership-proof records appeared between the first and second sweep. `workspace-admin@effyshopping.com`
> is the operator's account and **`hello@effyshopping.com` is an alias on it**, so mail addressed to
> `hello@` lands in the admin mailbox. **Inbound is solved** — the gap recorded below has narrowed to
> outbound authentication and to the fact that these records exist **only in the console**.

**⚠ This means the headline "blocking for production" item on the platform is already resolved, and
nobody has re-tested since.** The very first thing this slice must do is *prove* it: send a code to an
address that has never been registered anywhere in the mail configuration, from a real client, and
watch it arrive. Every requirement below assumes that proof succeeds; if it fails, the cause is one of
the gaps listed next, not the recipient restriction.

### ❌ The gaps that are real

1. **The identity provider's own messages do not come from Effy at all.** The platform-issued sign-in
   code (feature 035) is sent by the platform and carries `no-reply@dev.effyshopping.com`. But
   **sign-up confirmation, password recovery, email-change verification and both step-up codes (012,
   034) are still sent by the identity provider's built-in sender** — a generic third-party address,
   unbranded, and **capped at roughly 50 messages per day per pool**. The switch to send them under the
   platform's own domain exists in configuration and is **turned off**. So the product currently speaks
   with **two different voices**, one of which is a stranger's, and its onboarding ceiling is ~50
   people/day.

2. **⚠ The human mailbox can receive but cannot legitimately send.** Inbound now works — the parent
   namespace publishes a mail-exchanger record and an ownership proof, so `workspace-admin@` and its
   `hello@` alias receive mail. But the parent publishes **no sender-authorisation record, no signing
   record for the operator's mail service, and no alignment policy.** Measured: apex `TXT` holds the
   ownership proof and nothing else; `google._domainkey` and every other common selector are **absent**.
   Three consequences, in ascending order of severity:
   - Mail *sent from* `hello@effyshopping.com` — including every reply to a customer — **fails both
     authentication checks at Gmail and Outlook**, because nothing authorises it and nothing signs it.
     Effy's own support replies are the least trustworthy mail the platform produces.
   - Because the parent publishes no alignment policy, **anyone can send mail claiming to be
     `@effyshopping.com`** and no receiver has been told to distrust it.
   - **⚠ These two interact, and the ordering is a trap.** Publishing an alignment policy on the parent
     before authorising and signing the operator's mail service would cause Effy's own human replies to
     be quarantined by the very policy meant to protect the brand. Authorisation and signing MUST land
     first (FR-020), and only then the policy (FR-014).
   Also still absent: any address record on the apex or `www`.

2a. **⚠ The parent namespace's mail records exist only in the console.** The mail-exchanger record and
   the ownership proof were added by hand. The platform's definitions for the parent namespace declare
   the zone and **nothing else** — no record of any kind. So the platform's single source of truth
   does not know these records exist, cannot recreate them, and a future change that declares the same
   names would collide with the hand-made entries rather than adopt them.

3. **The sending namespace does not resolve.** `dev.effyshopping.com` — the domain in the visible
   sender of every code the platform sends — has **no address record and no mail-exchanger record**.
   Major receivers reject or penalise mail whose sender domain does not resolve. This is the most
   likely cause of silent partial delivery, and it is invisible from our side.

4. **⚠ A person whose address stops working is locked out permanently, silently, and nobody is told.**
   This is the sharpest defect in the slice. When an address hard-fails once, the mail service records
   it and thereafter **accepts every send and delivers nothing** — the platform receives a success
   response and a message id. The sign-in screen says "we've sent you a code." No code will ever arrive
   again. The person is permanently locked out of an account that, for three audiences, **has no other
   credential** — and no alarm fires, because a single address never moves a rate. The platform has
   **no per-message event stream, no record of which address failed, no way for an operator to see it,
   and no repair path.**

5. **The alarms notify nobody.** Two rate alarms exist and neither has any action attached — no topic,
   no subscriber. They turn red in a console nobody is watching.

6. **Replies go nowhere.** No message carries a reply address, by a deliberate decision recorded in
   feature 010 (FR-022): the platform could not receive mail, and a reply address that bounces is worse
   than none. That reasoning was correct then. Once the human mailbox works it stops being correct —
   and a person who cannot sign in and replies to their code email is the highest-intent support signal
   the platform will ever get.

7. **Non-production and production share one block list.** The list of addresses that can no longer be
   reached is account-wide and region-wide. A developer testing with a mistyped address in dev can
   therefore make a real customer unreachable in production, with no warning and no visible
   relationship between the two events.

8. **Sender addresses are duplicated literals with two different shapes.** The platform-issued code and
   the password-change notice each hardcode a bare address in their own deployment config; the
   identity-provider path is configured with a display-name form. Nothing publishes one sender to one
   place, so the three can drift — and one already has.

9. **One service may send as any identity in the account.** The customer service's permission to send
   is unbounded rather than scoped to its own environment's namespace — a deviation its neighbours'
   code comments explicitly call out and decline to copy, and which nobody has fixed.

10. **A leftover individually-registered address** remains registered as a sender identity from the
    restricted era. It grants nothing today, but it is stale permission that should not outlive the
    restriction that created it.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Anyone eligible receives their code, from Effy (Priority: P1)

A person who has never interacted with Effy — whose address appears in no configuration, no list, and
no prior test — enters their email on any surface and asks to sign in, sign up, or reset a password.
The message arrives, in the inbox, and it is unmistakably from Effy: the sender is an Effy address, the
name is Effy, and nothing in it mentions any third party.

**Why this priority**: This is the whole point. Until it holds the product cannot onboard a stranger,
which means it cannot launch. It also closes the largest measured gap — the identity provider's own
messages still come from a generic external address under a ~50/day ceiling.

**Independent Test**: Take an address never seen by the platform. Run every code-bearing flow on every
audience. Confirm each message arrives, and that every one carries the same Effy sender. Delivers value
on its own: the onboarding ceiling is removed even if nothing else in this slice ships.

**Acceptance Scenarios**:

1. **Given** an address that has never been registered as a permitted recipient, **When** a person
   signs up as a customer, **Then** the confirmation code arrives and the sender is an Effy address in
   the environment's own namespace.
2. **Given** that same address now holding an account, **When** the person requests a sign-in code,
   **Then** it arrives from the **same** sender address the confirmation code came from.
3. **Given** a driver, a shop operator and a back-office staff member on that same never-registered
   address, **When** each requests a sign-in code, **Then** each arrives, each is branded for its own
   audience, and all share the one sender address.
4. **Given** a customer who has forgotten their password, **When** they request recovery, **Then** the
   recovery code arrives from the Effy sender — not from a third-party address.
5. **Given** an email-change or account-closure step-up, **When** the code is requested, **Then** it
   arrives from the Effy sender.
6. **Given** more than fifty people request codes in one day, **When** each requests, **Then** every
   one receives it — no per-day ceiling is reached.

---

### User Story 2 - Mail is trusted by the receiving world (Priority: P1)

The message does not merely leave Effy — it is accepted by Gmail, Outlook and Yahoo, lands in the inbox
rather than the spam folder, and passes every authentication check those providers apply. The domain it
claims to come from provably exists and provably authorised the message.

**Why this priority**: A code that is sent and filtered is indistinguishable, to the person waiting for
it, from a code that was never sent. Story 1 is not actually true until Story 2 holds. Two measured
gaps sit here: the sending namespace does not resolve, and the parent namespace publishes no policy at
all.

**Independent Test**: Send to a fresh mailbox at each of the three major providers and read the
received message's own authentication report. All three checks pass, alignment holds, and the message
is in the inbox.

**Acceptance Scenarios**:

1. **Given** a message sent from the environment's namespace, **When** a major provider receives it,
   **Then** the sender-authorisation check, the signature check and the alignment policy all report
   **pass**.
2. **Given** the sending namespace, **When** it is looked up, **Then** it resolves — the domain in the
   visible sender both exists and is reachable.
3. **Given** a message that claims to be from Effy but was not sent by Effy, **When** a major provider
   receives it, **Then** the published policy tells that provider to distrust it.
4. **Given** an environment namespace, **When** its alignment policy is looked up, **Then** it has one
   of its own and does not silently inherit whatever the parent may later publish.
5. **Given** a sign-in code, **When** it is examined, **Then** it carries **no unsubscribe affordance**
   — a person must never be able to opt out of their own ability to sign in.

---

### User Story 3 - Effy can be written to, and replies reach a person (Priority: P2)

Someone writes to `hello@effyshopping.com` and a human at Effy reads it. Someone who cannot sign in
hits reply on their code email, and that reply reaches the same human rather than vanishing.

**Why this priority**: Half of this now works and half of it is **backwards**. Inbound is live —
`hello@` is an alias on `workspace-admin@effyshopping.com` and mail reaches it. But the parent
namespace authorises and signs **nothing**, so mail Effy's own humans *send* — every reply to a
customer — fails authentication at Gmail and Outlook. The mailbox that exists to build trust is
currently the least trustworthy sender the platform has. It is also the only escape hatch for the
lockout in Story 4: a person who cannot receive mail at their own address can still write to Effy from
another one. P2 rather than P1 because a person who *can* receive codes does not need it.

**Independent Test**: Send a message to `hello@effyshopping.com` from an unrelated address and confirm
a person reads it. Reply to a delivered sign-in code and confirm the reply lands in the same place.
Then send *from* that mailbox to Gmail and Outlook and read the received message's authentication
report.

**Acceptance Scenarios**:

1. **Given** the platform's public contact alias, **When** anyone sends a message to it, **Then** it is
   delivered to the operator's monitored mailbox — and it still is after every change this feature
   makes to the parent namespace.
2. **Given** any automated message the platform sends, **When** the recipient replies, **Then** the
   reply reaches that same monitored mailbox and is not discarded.
3. **Given** the contact addresses already advertised inside the shipped product, **When** a customer
   writes to one, **Then** it is delivered rather than rejected.
4. **Given** mail sent *from* the monitored human mailbox, **When** a major provider receives it,
   **Then** it too passes authentication — the human mailbox and the automated sender do not undermine
   each other.

---

### User Story 4 - Nobody is silently locked out (Priority: P2)

A person's address stops accepting mail — the mailbox is deleted, an employer offboards them, they
mistyped it at sign-up. The platform notices, stops pretending the code was sent, tells them plainly,
and an operator can put it right.

**Why this priority**: This is the failure this platform is worst placed to survive, because for
driver, shop and back-office there is **no second credential to fall back on**. It is not a
deliverability metric — it is a permanent account lockout with no user-visible cause and no
operator-visible signal. It sits at P2 only because it affects individuals rather than everyone; by
severity per affected person it is the worst item in this document.

`CLAUDE.md` records that this "deserves its own slice." **That position is superseded here**: this
slice promises that anyone eligible receives their mail, and that promise cannot be *verified* — or
even *falsified* — without per-address delivery outcomes. A promise nobody can check is not a promise.

**Independent Test**: Drive a deliberate permanent delivery failure for a test account using the mail
service's failure-simulation addresses. Confirm the platform records it against that account, confirm
the sign-in screen stops claiming a code was sent, and confirm the documented operator repair restores
the account to working order.

**Acceptance Scenarios**:

1. **Given** a message that permanently fails to deliver, **When** the failure occurs, **Then** the
   platform records the outcome against the person's account, with the reason and the time.
2. **Given** an account marked undeliverable, **When** that person next asks for a code, **Then** the
   screen does **not** say a code was sent; it says plainly that the address cannot be reached and
   offers a route forward.
3. **Given** an account marked undeliverable, **When** an operator looks it up, **Then** they can see
   that the address failed, when, and why.
4. **Given** a corrected or restored address, **When** an operator performs the documented repair,
   **Then** the person can sign in again — and the repair clears **both** the platform's own record
   **and** the underlying block, because clearing only one leaves the person still locked out.
5. **Given** a person marks an Effy message as spam, **When** that is reported to the platform,
   **Then** it is recorded and surfaced to an operator, and it does **not** by itself permanently bar
   that person from signing in to their own account.
6. **Given** a temporary delivery failure (mailbox full, transient refusal), **When** it occurs,
   **Then** it is **not** treated as permanent and the account is not marked undeliverable.
7. **Given** an address recorded as permanently undeliverable, **When** any flow would email it,
   **Then** the platform does not automatically retry it.

---

### User Story 5 - Operators find out before customers do (Priority: P3)

Delivery health degrades — failures climb, complaints climb, the sending configuration breaks. A person
at Effy is told, in a channel they actually watch.

**Why this priority**: Detection without notification is not detection. Two alarms already exist and
reach nobody. P3 because Story 4 covers the individual case, which is the one that hurts a named
person; this covers the systemic case.

**Independent Test**: Force each alarm condition and confirm a human is notified out-of-band.

**Acceptance Scenarios**:

1. **Given** the delivery-failure rate crosses the healthy threshold, **When** the alarm fires,
   **Then** a person is notified outside the console.
2. **Given** the complaint rate crosses its threshold, **When** the alarm fires, **Then** a person is
   notified.
3. **Given** the bounce-return configuration for a namespace breaks, **When** it does, **Then** a
   person is notified — because the platform keeps sending while quietly failing alignment, and that is
   exactly the fault nobody would otherwise see.
4. **Given** any alarm in this feature, **When** it is created, **Then** it has a notification target;
   an alarm with no target MUST NOT ship.

---

### User Story 6 - A second environment costs nothing and endangers nothing (Priority: P3)

A new environment is stood up. It gets its own sending namespace, its own authentication and its own
delivery-failure history — and a delivery failure in one environment cannot make a person unreachable
in another.

**Why this priority**: The platform's namespace model is already per-environment and mail must not be
the thing that breaks it. Cross-environment contamination of the block list is a real, measured hazard
today. P3 because only one environment exists.

**Independent Test**: Declare a second environment's mail configuration from the same definitions with
only the environment name changed, and confirm nothing environment-specific is hardcoded. Confirm a
delivery failure recorded in one environment does not suppress the same address in another.

**Acceptance Scenarios**:

1. **Given** a new environment, **When** its mail configuration is declared, **Then** it requires only
   the environment's name — no hand-edited addresses, domains or identifiers.
2. **Given** an address that permanently fails in a non-production environment, **When** production
   later sends to that same address, **Then** production delivers to it.
3. **Given** an environment is torn down, **When** it is, **Then** its mail records and sending
   identity go with it and leave nothing dangling behind.
4. **Given** the parent namespace, **When** any environment is created or destroyed, **Then** the
   parent's own mail records are unaffected.

---

### Edge Cases

- **The success that isn't.** A send to a blocked address returns success and a message id, and
  delivers nothing. Any logic treating "the send call succeeded" as "the person got it" is wrong, and
  every screen that says "check your inbox" on that basis is lying.
- **Two sender-authorisation records on one name.** Publishing a second policy record beside an
  existing one does not merge them — it makes *all* policy evaluation for that name fail permanently,
  breaking mail that previously worked. The parent namespace must carry exactly one, covering every
  legitimate sender.
- **The bounce-return route disappears.** If the return-path configuration fails, sending continues but
  alignment quietly degrades. Nothing user-visible happens; nothing fails loudly. It must be alarmed.
- **Case sensitivity when repairing.** Blocked addresses are stored exactly as received. A repair
  routine that normalises case will silently fail to find an entry that demonstrably exists, and the
  operator will believe they fixed something they did not.
- **Complaints from the largest consumer provider never arrive.** Gmail does not report spam-button
  presses back to the sender. The complaint signal is structurally blind to the majority of consumer
  addresses, so a healthy complaint metric is not evidence of a healthy product.
- **Someone else's address.** A person types a stranger's address into sign-in. The stranger receives
  an unrequested code and may report it as spam. Treating that complaint as a permanent bar would lock
  out an account the stranger might legitimately own later.
- **The audiences with no fallback.** For a customer a lockout is an inconvenience — password and
  federated routes remain. For driver, shop and back-office it is total. The same technical event has
  two very different severities and the response must reflect that.
- **A person unsubscribes from their own login.** If an unsubscribe affordance were ever attached to a
  code message, honouring it would permanently disable that person's ability to sign in.
- **The daily allowance is finite.** Sends that are accepted-and-dropped still consume it. A large
  blocked population burns allowance while delivering nothing.
- **The advertised support address.** Two shipped surfaces already print a `support@` address to
  customers. Mail to it is undeliverable today. Either it routes to a person, or the product stops
  advertising it.

---

## Requirements *(mandatory)*

### Functional Requirements

#### Reaching everyone (US1)

- **FR-001**: The platform MUST be able to deliver mail to any valid address without that address
  having been individually registered, permitted or allowlisted beforehand.
- **FR-002**: Every message the platform causes to be sent — whether composed by the platform or by the
  identity provider on its behalf — MUST originate from the environment's own namespace.
- **FR-003**: All code-bearing flows MUST use one sender address per environment: sign-in codes,
  sign-up confirmation, password recovery, email-change verification, and every step-up code.
- **FR-004**: The sender address MUST be defined once per environment and consumed by every sender from
  that single definition. No sender may carry its own copy of the address.
- **FR-005**: The sender's display name MUST be identical across every sending path.
- **FR-006**: No message may originate from an address outside Effy's own namespaces, and no message
  may name or expose any third-party mail provider to the recipient.
- **FR-007**: Message throughput MUST NOT be constrained by any per-day ceiling below the platform's
  expected onboarding volume; the ~50/day identity-provider ceiling MUST be removed.
- **FR-008**: Existing message content, wording, code length, expiry and rate limits MUST be preserved
  unchanged. This feature changes **who can receive** mail and **what happens when they cannot**, not
  what the mail says.

#### Being trusted (US2)

- **FR-009**: Each environment's sending namespace MUST publish sender authorisation, cryptographic
  signing, and an alignment policy of its own, such that a receiving provider can independently verify
  every message.
- **FR-010**: Signing MUST be aligned to the environment's own namespace so that alignment holds under
  the strictest published policy.
- **FR-011**: The bounce-return namespace MUST be dedicated to that purpose and used for nothing else —
  it MUST NOT be a namespace the platform sends from or receives at.
- **FR-012**: If the bounce-return route ever fails, the platform MUST continue delivering mail rather
  than refusing to send. Total sign-in failure is a worse outcome than degraded alignment, because the
  cryptographic signature keeps the alignment policy passing on its own. The degradation MUST be
  alarmed (FR-038).
- **FR-013**: Every namespace appearing in a visible sender address MUST resolve in public directory
  lookups.
- **FR-014**: The parent namespace `effyshopping.com` MUST publish an alignment policy, so that mail
  forged in Effy's name is distrusted by receiving providers.
- **FR-015**: Every environment namespace MUST publish its **own** alignment policy rather than relying
  on inheritance from the parent.
- **FR-016**: The parent namespace MUST carry exactly **one** sender-authorisation record, covering
  every legitimate sender for that namespace. Adding a second is prohibited.
- **FR-017**: Alignment policies MUST begin in observation mode with reporting enabled, and this
  feature MUST define the evidence required before tightening to enforcement.
- **FR-018**: Code-bearing messages MUST NOT carry an unsubscribe affordance of any kind.

#### The human mailbox (US3)

- **FR-019**: The parent namespace MUST keep exactly one published inbound route to the operator's mail
  service, so that `workspace-admin@effyshopping.com` and its `hello@` alias continue to receive mail.
  This route already exists and MUST NOT be interrupted by any change this feature makes.
- **FR-020**: The parent namespace MUST authorise the operator's mail service to send on its behalf and
  MUST publish that service's signing records, so mail sent **from** the human mailbox is itself
  trusted. This is currently absent and is a prerequisite of FR-014.
- **FR-021**: FR-020 MUST be published and verified **before** FR-014's alignment policy is published.
  Publishing the policy first would cause Effy's own human replies to be quarantined by it.
- **FR-022**: Every automated message MUST carry a reply address pointing at the customer-facing alias
  `hello@effyshopping.com`, not at the operator's account name. **This reverses feature 010's FR-022**,
  whose stated reason — that the platform could not receive mail — is removed: it now can. A reply
  address that reaches a person is strictly better than none; a reply address that bounces is what the
  original rule was protecting against, and inbound routing eliminates that risk.
- **FR-023**: Any contact address the product advertises to customers MUST be deliverable, or MUST be
  removed from the product.
- **FR-024**: The parent namespace's mail records MUST be described by the platform's own definitions
  rather than existing only in a provider console. Records already created by hand MUST be **adopted**
  into those definitions, not re-declared alongside them — a second declaration of the same name
  collides with the existing entry instead of taking ownership of it.
- **FR-025**: Values only the mail provider can issue — the ownership proof and the signing material —
  are operator-supplied inputs to those definitions and MUST NOT be treated as derivable.

#### Nobody locked out (US4)

- **FR-026**: The platform MUST receive a per-message outcome for every message it sends, covering at
  minimum: delivered, permanently failed, temporarily failed, complained, and rejected.
- **FR-027**: A permanent delivery failure MUST be recorded against the **person's account**, not
  merely against the address, including the reason and the time.
- **FR-028**: The consumer of these outcomes MUST be idempotent — outcomes may arrive more than once,
  out of order, or late.
- **FR-029**: Permanent and temporary failures MUST be distinguished. Only permanent failures may mark
  an account undeliverable.
- **FR-030**: ⚠ **AMENDED during planning 2026-08-05** — see
  [plan.md § Spec Amendments](./plan.md#spec-amendments). When an account is marked undeliverable, the
  surfaces on which the person has **proven the account is theirs** MUST say plainly that the address
  cannot be reached: the customer account page, and the operator console.
  *Originally this bound "any flow that would email it", including the sign-in screen. That screen is
  **unauthenticated**, and delivery state is only knowable for an address the platform has emailed —
  so saying it there answers "does this address have an Effy account?" to anyone who types one, which
  is exactly the question 035 spent its phantom-send and timing-parity design making unanswerable.*
- **FR-030a**: The unauthenticated sign-in and code screens MUST offer a **uniform** escape hatch —
  shown to **everyone**, regardless of delivery state — naming a way to reach a human when a code does
  not arrive. Their copy, timing and affordances MUST NOT vary with delivery state.
- **FR-031**: A complaint MUST be recorded and surfaced but MUST NOT by itself permanently bar a person
  from signing in to their own account.
- **FR-032**: ⚠ **CLARIFIED during planning 2026-08-05** — the platform MUST NOT **automatically**
  resend to an address recorded as permanently undeliverable: no scheduled retry, no queue redrive, no
  bulk re-send, no loop the platform runs on its own. *A person's own explicit request is not a retry
  and is always attempted — refusing it would require the status-dependent branch FR-030a forbids, and
  would add a third response-timing class, breaking 035's parity property.*
- **FR-033**: Operators MUST be able to see an account's delivery status, its last failure and its
  reason, through the back-office console rather than by inspecting infrastructure.
- **FR-034**: Operators MUST have a documented, audited repair action that restores a person's ability
  to receive mail. It MUST clear **both** the platform's own record **and** the underlying block;
  clearing either alone leaves the person locked out and MUST be treated as a failed repair.
- **FR-035**: The repair action MUST match the stored address exactly, including letter case.
- **FR-036**: Delivery-outcome records MUST NOT contain message contents or codes.

#### Being told (US5)

- **FR-037**: ⚠ **SCOPED 2026-08-05 (analysis F2).** Every alarm this feature **defines**, and every
  existing alarm **on the mail and sign-in path** (the SES reputation alarms, the certificate alarm,
  and 035's OTP alarms), MUST notify a person outside the console. An alarm in that scope with no
  notification target MUST NOT ship.
  *The original said "defines or inherits", which — read literally — obliged this slice to wire the
  **76** per-function Lambda error alarms in `apis/edge-api/{admin,shop}/serverless.yml`, none of which
  has ever had a notification target and none of which concerns mail. Rather than ship a knowing
  violation of a `MUST NOT`, the obligation is scoped to what this feature owns and the remainder is
  named as an explicit carry-forward (FR-037a) instead of being quietly absorbed.*
- **FR-037a**: The alarms outside FR-037's scope MUST be **counted and named** in the sign-off as an
  open carry-forward, with the measured number rather than an estimate. An unwired alarm that nobody
  has written down is indistinguishable from one nobody knows about.
- **FR-038**: Alarms MUST cover at minimum: delivery-failure rate, complaint rate, and failure of the
  bounce-return configuration.
- **FR-039**: Alarms MUST NOT be wired to any action that automatically disables sending. Automatically
  pausing mail on this platform means automatically disabling all sign-in.

#### Per-environment isolation (US6)

- **FR-040**: A new environment's mail configuration MUST require only the environment's name; no
  domain, address or identifier may be hardcoded per environment.
- **FR-041**: A permanent delivery failure recorded in one environment MUST NOT prevent another
  environment from sending to the same address.
- **FR-042**: Destroying an environment MUST remove its mail records and sending identity and leave
  nothing dangling in the parent namespace.
- **FR-043**: Each service's permission to send MUST be scoped to its own environment's namespace. The
  existing unbounded grant MUST be narrowed.
- **FR-044**: Sender identities left over from the restricted-recipient era MUST be removed once
  FR-001 is proven, so that no stale permission outlives the restriction that created it.

### Key Entities

- **Sending namespace** — the per-environment domain every outbound message claims to come from
  (`dev.effyshopping.com`). Owns its own authorisation, signing, alignment policy and reputation.
- **Bounce-return namespace** — a dedicated per-environment namespace used solely as the return path,
  so sender authorisation aligns with the visible sender. Never sends, never receives.
- **Parent namespace** — `effyshopping.com`. Hosts the human mailbox, publishes the anti-forgery
  policy, and is reserved: nothing automated is sent from it.
- **Human mailbox** — the operator's account `workspace-admin@effyshopping.com`, carrying the
  customer-facing alias `hello@effyshopping.com`. One inbox, two addresses. It is the reply target for
  every automated message, the escape hatch for a locked-out person, **and a sender in its own right**
  — which is why it needs the parent namespace's authorisation and signing, not just its inbound route.
- **Message class** — a named stream of mail (authentication codes, account-security notices, and
  later, order mail) whose delivery outcomes can be measured separately from other streams.
- **Delivery outcome** — one reported result for one message to one address: delivered, permanently
  failed, temporarily failed, complained, rejected, delayed. Carries reason and time. Contains no
  message content.
- **Account delivery status** — the per-person conclusion drawn from outcomes: reachable, temporarily
  failing, permanently undeliverable, complained. The thing screens and operators read.
- **Block entry** — the mail service's own record that an address must not be sent to. Invisible to the
  platform unless deliberately read, and the reason a send can succeed while delivering nothing.
- **Repair action** — the audited operator action that clears both the account delivery status and the
  block entry, restoring a person's ability to sign in.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: ⚠ **CORRECTED 2026-08-05 (analysis F1).** A person whose address has never been
  registered anywhere in the platform's mail configuration:
  - **on the customer audience** — completes sign-up, sign-in **and** password recovery, receiving
    every code;
  - **on driver, shop and back-office** — receives a **sign-in code**.
  *The original wording demanded sign-up and password recovery on all four audiences. Those three are
  **strictly passwordless and admin-provisioned** (constitution Principle IV) — they have no sign-up
  and no password to recover — so the original was unsatisfiable and contradicted this spec's own
  US1 acceptance scenario 3.* ⚠ **Driver has no client surface** (`apps/driver-mobile` is still the
  base template), so its half is proven against the driver pool directly rather than through an app.
- **SC-002**: 100% of code-bearing messages, across all five flows and all four audiences, arrive from
  the same single Effy sender address with the same display name. Zero messages arrive from a
  third-party address.
- **SC-003**: More than 50 codes are delivered within a single 24-hour period without any flow being
  throttled or refused.
- **SC-004**: A message received at each of Gmail, Outlook and Yahoo reports **pass** on sender
  authorisation, signature and alignment policy — verified by reading the received message's own
  authentication report, not by inference.
- **SC-005**: A message arrives in the **inbox**, not the spam folder, at all three providers, on a
  first-contact address with no prior interaction.
- **SC-006**: Every namespace appearing in a sender address resolves in a public lookup.
- **SC-007**: A message forged to claim Effy's parent namespace is rejected or quarantined by a major
  provider, demonstrated deliberately.
- **SC-008**: A message sent to `hello@effyshopping.com` from an unrelated address is delivered to the
  operator's mailbox and read by a person within one business day.
- **SC-009**: A reply to a delivered sign-in code arrives in that same mailbox.
- **SC-009a**: A message sent **from** `hello@effyshopping.com` to a Gmail and an Outlook address
  reports **pass** on sender authorisation and signature — verified from the received message's own
  authentication report, and re-verified **after** the parent's alignment policy is published.
- **SC-010**: A deliberately induced permanent delivery failure is recorded against the correct account
  within 5 minutes of the failure.
- **SC-011**: A person signed in to an account marked undeliverable sees, on their account page, a
  statement that names the delivery problem and a way forward. Confirmed by an observer who was not
  told what to look for. *(Re-scoped from the sign-in screen by the FR-030 amendment.)*
- **SC-011a**: ⚠ **The enumeration proof.** A code is requested for (a) a reachable address with an
  account and (b) an address recorded undeliverable. On all five sign-in surfaces the two are
  **indistinguishable** — same copy, same affordances, no new hint. Any difference is an
  account-enumeration oracle and a regression against 035's FR-016.
- **SC-012**: An operator, using only the back-office console and a written runbook, restores a
  locked-out account to working order — and the person then signs in successfully — in under 10
  minutes, without touching infrastructure directly.
- **SC-013**: A repair that clears only one of the two halves is demonstrated to leave the person still
  locked out, proving FR-034's "both or neither" rule is load-bearing rather than decorative.
- **SC-014**: Every alarm defined by this feature is forced into its alarm state and a person is
  notified out-of-band each time. Zero alarms **within FR-037's scope** lack a notification target
  after this slice, and the count outside that scope is recorded (FR-037a).
- **SC-015**: A permanent delivery failure recorded in the non-production environment does not prevent
  a production send to the same address.
- **SC-016**: A second environment's mail configuration is produced by changing only the environment's
  name, demonstrated by review or dry run.
- **SC-017**: Zero code-bearing messages contain an unsubscribe affordance.
- **SC-018**: Delivery-failure rate stays below 2% and complaint rate below 0.1% over the first 30 days
  of unrestricted sending.
- **SC-019**: No service holds permission to send as any namespace other than its own environment's,
  demonstrated by **inspecting the deployed IAM policy** — not by reading the source that produced it.
- **SC-020**: No delivery-outcome record, log line or operator view contains a one-time code or message
  body, verified by a deliberate sweep.
- **SC-021**: Every mail record on the parent namespace — including the two added by hand before this
  feature — is described by the platform's definitions, and a no-op dry run reports **no changes**,
  proving they were adopted rather than duplicated.
- **SC-022**: Inbound mail to `hello@effyshopping.com` is confirmed working immediately before **and**
  immediately after every change this feature makes to the parent namespace. Zero interruptions.

---

## Assumptions

- **Unrestricted sending is already granted and remains so.** Measured 2026-08-05: granted, 50,000/day,
  14/second. The first task of this feature is to re-prove it end-to-end; every requirement assumes it
  holds. If it has been revoked, this feature's scope grows to include re-applying — and a public
  website at the apex becomes blocking again.
- **The mailbox exists and inbound routing works — confirmed, not assumed.** The operator's account is
  `workspace-admin@effyshopping.com` and `hello@effyshopping.com` is an **alias** on it, so both
  addresses deliver to one inbox. The parent namespace's mail-exchanger record and ownership proof are
  published and resolving. What remains missing is everything on the **outbound** side: authorisation,
  signing and policy.
- **`hello@` is an alias, not a separate mailbox.** Mail sent *from* it originates from the same
  account, so authorising and signing that one account (FR-020) covers both addresses. If the operator
  later splits them into distinct accounts or adds a second sending service, FR-016's single-record
  rule means the existing authorisation record must be **edited**, never duplicated.
- **The two opaque values the mail provider issues — the ownership proof and the signing key — are
  supplied by the operator** as inputs to the platform's definitions. They cannot be derived.
- **Registrar authority stays delegated.** The parent namespace's authoritative servers already point
  at the platform's own directory service; this feature publishes records, it does not move authority.
- **Only the non-production environment is built.** Production namespaces get the same treatment when a
  production environment exists; this feature makes that a rename, not a redesign.
- **The apex website is out of scope.** A public site at `effyshopping.com` is a separate concern. It
  is no longer a blocker, because unrestricted sending is already granted — but the URL was declared
  during that grant, and a persistently empty apex is a risk at any future review.
- **Order, receipt and fulfilment mail are out of scope.** No such mail exists yet. This feature makes a
  future slice able to send it without re-solving delivery; it does not send it.
- **Message wording is out of scope.** Existing subjects and bodies are preserved verbatim (FR-008).
- **Customers retain two other credential routes**, so a customer lockout is recoverable by the person
  themselves. Driver, shop and back-office have none, which is why FR-033/FR-034's operator path is not
  optional for them.
- **Complaint signal from the largest consumer provider is structurally unavailable.** SC-018's
  complaint half is a floor, not a proof of health.
- **A `support@` address is already advertised in shipped product surfaces.** FR-023 forces a decision:
  route it or remove it. The default assumption is route it, alongside `hello@`.

## Dependencies

- **Operator-run steps.** Per the platform's mode of work, every step that provisions cloud resources,
  publishes DNS or mutates live state is run by the operator. This feature authors the definitions and
  hands over exact commands.
- **The mail provider's admin console** — creating the mailbox, generating the signing key and issuing
  the ownership proof happen there, by the operator, and cannot be automated from the platform.
- **The back-office console** (features 005/009) is where FR-033's delivery status and FR-034's repair
  action surface, and the existing audit log is where the repair is recorded.
- **The customer and staff records** (features 011, 007, 009) are where per-account delivery status is
  held.
- **Feature 035's sending path** is the platform's existing code mailer and the primary consumer of
  everything here.
- **Feature 010's namespace model** — parent zone, per-environment delegated child namespaces, and the
  rule that an environment owns and can destroy only its own — is the structure this feature extends.
  Its FR-022 (no reply address) is explicitly reversed by this feature's FR-022.
- **The operator's mail service** hosts `workspace-admin@effyshopping.com` and its `hello@` alias. It
  is both the reply target for automated mail and a *sender* in its own right, which is why the parent
  namespace must authorise and sign it (FR-020) before it is policed (FR-014).

## Out of Scope

- A public website at the apex.
- Order, receipt, shipping, fulfilment, marketing or any non-authentication mail.
- Inbound mail processing by the platform (parsing, routing or acting on received mail) — inbound is
  delivered to the operator's mail service and read by a human.
- Push notifications, SMS, or any non-email channel.
- Changing any message's wording, code length, expiry or rate limits.
- Production environment provisioning.
- Replacing the identity provider's built-in message templates with custom content — this feature
  changes who sends and how far it reaches, not what it says.
