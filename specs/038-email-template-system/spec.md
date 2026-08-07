# Feature Specification: Platform Email Template System

**Feature Branch**: `038-email-template-system`

**Created**: 2026-08-07

**Status**: Draft

**Input**: User description: "as the next spec i would like to fully implement a service or feature where we have a centralize place manage all the email templates, that uses when platfrom send mails to it users… currently we have only otp emails, but in future we may have hundrads of email templates… do a deep dive in to the code and understand the current way… do internet reseach on how industry implement this kind of service in production apps… then find email template design rules that people follow. we need to strictly follow them… then try to find a good email template design that we can use. it should be match with our mobile app theme and design… all the email clients should be able to load our email tempalates without issue… then finaly update email template of sending otp with this new services and design"

---

## What is actually true today (the deep dive)

The premise of the request needs one correction before anything is designed, because it changes what
this slice is.

> **⚠ The platform has never sent an HTML email. There is no template to replace.**

Both emails the platform's own code sends are **plain text only**. `apis/edge-api/auth/src/otp/mailer.ts`
and `apis/edge-api/customer/src/password/notify.ts` each assemble a `string[]`, `join("\n")` it, and
put the result in the message's **text** body. Neither has ever had an HTML part, a logo, a colour, a
typeface, or a layout. A shopper who asks Effy for a sign-in code receives an unstyled block of text
that is visually indistinguishable from a message sent by a script.

Six message types reach real people today. They are governed in **three different places**, and none
of the three knows about the other two:

| # | Message | Sent by | Appearance today | Copy lives in |
| --- | --- | --- | --- | --- |
| 1 | Sign-in code (all four audiences) | Platform code (035) | Plain text | `otp/mailer.ts`, inline `string[]` |
| 2 | Your password was changed / added | Platform code (012) | Plain text | `password/notify.ts`, inline `string[]` |
| 3 | Sign-up confirmation code | **Cognito** | Cognito's built-in default | Cognito pool configuration |
| 4 | Password reset code | **Cognito** | Cognito's built-in default | Cognito pool configuration |
| 5 | Attribute (email) verification code | **Cognito** | Cognito's built-in default | Cognito pool configuration |
| 6 | Step-up / MFA code | **Cognito** | Cognito's built-in default | Cognito pool configuration |

What follows from that table is the actual problem statement:

- **There is no shared anything.** Not a layout, not a footer, not a signature, not a security
  sentence, not a sender identity in the body. Message 1 says `— Effy`; message 2 says nothing.
  Messages 3–6 say whatever Cognito says. At six messages this reads as sloppiness; at sixty it is a
  platform that looks like six different companies.
- **The only per-audience branding that exists is four words in a subject line.**
  `audience.ts` carries `productName` (`Effy` / `Effy Driver` / `Effy Shop` / `Effy Back-Office`) and
  a single `internal` boolean that swaps one sentence. Nothing else differs, and nothing else can.
- **Nobody has ever seen these emails before they were sent.** There is no preview, no fixture, no
  snapshot, no visual review step. The only way to look at an Effy email is to trigger a real sign-in.
- **Message-level policy has nowhere to live.** `mailer.ts` throws when a send fails; `notify.ts`
  swallows. Both are *correct* — a code that never arrived is a sign-in that cannot complete, whereas
  a password has already changed by the time its notification fails — but that reasoning is recorded
  as a comment in two files rather than as a property of the message. The seventh message will have
  to guess.
- **The platform is one slice away from copy-paste.** The next email that needs sending has exactly
  one precedent: paste `mailer.ts` and edit the strings. Both existing files already show what that
  produces — two mailers, two client constructions, two failure policies, two footers, zero shared code.

This slice is therefore not "improve the OTP email." It is: **give the platform one place where every
email it will ever send is defined, designed, reviewed, previewed, verified and sent — and prove it by
moving all six of today's messages onto it.**

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A shopper receives a sign-in code that looks like Effy sent it (Priority: P1)

A customer enters their email address to sign in. Seconds later a message arrives. It carries the Effy
wordmark, the platform's typography, its monochrome palette and its spacing — recognisably the same
product they were just looking at. The code is large, unmistakable, and readable at a glance from a
lock-screen notification. One sentence says how long it lasts. One sentence says what to do if they
did not ask for it. Nothing else competes for attention, and there is nothing to click.

**Why this priority**: This is the platform's single highest-volume message and, for three of the four
audiences, the **only credential that exists** — there is no password to fall back on. It is also the
first email most customers will ever receive from Effy, so it sets the trust baseline for every message
after it. And it is the message the operator explicitly asked to land on the new system.

**Independent Test**: Trigger a sign-in on a live pool; confirm the received message renders with the
Effy design in a real inbox, that the code is correct and usable, and that sign-in completes.

**Acceptance Scenarios**:

1. **Given** a customer requesting a sign-in code, **When** the email arrives, **Then** it displays the
   Effy wordmark, the six-digit code as the visual focus, an expiry statement, and a
   "if this wasn't you" line — and the code entered from it signs the customer in.
2. **Given** the same email opened in a client that blocks images by default, **When** it renders,
   **Then** the wordmark, the code and every sentence are still fully legible, because none of them is
   carried by an image.
3. **Given** the same email opened in a client that forces dark appearance, **When** it renders,
   **Then** text remains legible against its surface at every point in the message, with no
   dark-on-dark or light-on-light region.
4. **Given** a driver, shop operator or back-office staff member, **When** they request a code,
   **Then** they receive the same design, addressed to their audience, and the message identifies which
   Effy application it is for.
5. **Given** a recipient whose email client shows only plain text, **When** they open the message,
   **Then** they receive a purposely written text version — not a stripped-down transcript of the
   HTML — containing the code and the same two facts.

---

### User Story 2 — An engineer adds the platform's next email without inventing anything (Priority: P1)

An engineer needs to send a new message. They add one entry to the catalogue, write the content using
the existing building blocks, supply example data, and run the preview. The layout, the header, the
footer, the typography, the colours, the compliance footer and the plain-text discipline all come for
free. The system refuses to build if they have forgotten the text version, if the message would exceed
the size at which a major client truncates it, if it uses a technique known to fail in a major client,
or if any sending code passes it the wrong information.

**Why this priority**: This is the requirement the operator actually asked for — the difference between
"we have some email templates" and "we have an email system." If adding email number seven is easier by
copy-paste than by using the system, the system has failed no matter how good the first template looks.
Everything in User Story 1 decays within three slices without this.

**Independent Test**: Add a new message end to end using only the system's own building blocks, with no
new layout or styling authored; confirm it previews correctly and that removing its text version or
oversizing it fails the build with a message naming the offending template.

**Acceptance Scenarios**:

1. **Given** a new message added to the catalogue, **When** the engineer builds, **Then** its rendered
   output, its text version and its preview all exist without any layout or styling being written by hand.
2. **Given** sending code that supplies the wrong information for a message, **When** the project is
   checked, **Then** it fails before deployment and names both the message and the missing information.
3. **Given** sending code that names a message that does not exist, **When** the project is checked,
   **Then** it fails before deployment rather than failing when a customer triggers it.
4. **Given** a message whose stored output no longer matches its source, **When** the drift check runs,
   **Then** it fails and names the stale message.
5. **Given** a message missing its text version, exceeding the size budget, or using a prohibited
   technique, **When** the checks run, **Then** each fails independently with a specific reason.

---

### User Story 3 — Every email the platform sends shares one identity (Priority: P1)

A person interacting with Effy receives a sign-up confirmation, later a sign-in code, later a
"your password changed" notice, later an order confirmation. All four look like the same company,
because all four are produced by the same system.

**Why this priority**: Four of the six messages sent today are produced by the identity provider using
its own built-in templates, which the platform does not control and cannot style. Leaving them behind
means shipping two visual identities and calling the slice done — the platform's *most* customer-facing
message (sign-up confirmation, seen by every new customer before anything else) would remain the
unbranded one. That is the exact inconsistency this feature exists to remove.

**Independent Test**: Complete a sign-up and a password reset on a live pool; confirm both messages
arrive in the platform's design, and that both codes work.

**Acceptance Scenarios**:

1. **Given** a new customer signing up, **When** the confirmation code email arrives, **Then** it is
   visually identical in structure to the sign-in code email and its code completes the sign-up.
2. **Given** a customer using password recovery, **When** the reset code arrives, **Then** it carries
   the platform design and its code completes the reset.
3. **Given** any message type the platform has not brought under the system, **When** it is sent,
   **Then** the system still delivers a working message rather than an empty or broken one.
4. **Given** the interception of a provider-sent message fails for any reason, **When** the person
   attempts the action, **Then** they still receive a usable message and can still complete sign-up or
   recovery.

---

### User Story 4 — A message survives the inbox it actually lands in (Priority: P2)

The same message is opened on an iPhone, in Gmail on Android, in the Gmail app configured with a
non-Google address, in classic Outlook on Windows, and in Outlook on the web with dark appearance
enabled. It is correct in all of them. Nothing is cut off, no text is invisible, the layout does not
collapse, and no font falls back to a serif.

**Why this priority**: The operator's requirement was explicit — "all the email clients should be able
to load our email templates without issue." This is a distinct risk from design quality: an email can be
beautiful in the preview and structurally broken in the client where a quarter of recipients read it.
It is P2 only because it is verified against User Story 1's template, not because it is optional.

**Independent Test**: Send one message to a seed inbox on each target client and inspect it.

**Acceptance Scenarios**:

1. **Given** the message opened in a client whose engine does not support modern layout, **When** it
   renders, **Then** the layout holds, the width is correct, and the typeface is a sans-serif.
2. **Given** the message opened in a client that strips embedded stylesheets entirely, **When** it
   renders, **Then** it is still completely correct, because no visual property depended on the
   stylesheet.
3. **Given** the message opened in a client that partially rewrites colours for dark appearance,
   **When** it renders, **Then** no text and its surface end up with insufficient contrast.
4. **Given** the message opened on a phone, **When** it renders, **Then** body text is at least 16px,
   nothing scrolls horizontally, and any tappable element is at least 48px.

---

### User Story 5 — A data-heavy message proves the system scales past a code (Priority: P2)

An order confirmation is produced by the same system: a line-item table, quantities, prices, totals, a
delivery address and a link to the order. It stays within the size at which a major client truncates
messages even with a large basket.

**Why this priority**: A six-digit code is the easiest possible email. Nearly every hard constraint in
this feature — tables that survive a legacy engine, money and date formatting, size budgets, the
plain-text version of tabular data — only appears once a message carries real data. Building this now
means the receipt components are *proven*, not designed on paper for a future commerce slice to
discover are wrong.

**Independent Test**: Render an order confirmation against a fixture with a large basket; confirm the
table renders correctly in every target client and the output stays inside the size budget.

**Acceptance Scenarios**:

1. **Given** an order with many line items, **When** the message renders, **Then** the table is correct
   in every target client and the total is unambiguous.
2. **Given** the largest basket the fixture covers, **When** the message renders, **Then** its size
   remains inside the budget at which a major client truncates.
3. **Given** the same order, **When** the plain-text version is read, **Then** the line items and total
   are legible as text rather than as collapsed table debris.
4. **Given** product or shop names containing characters with markup meaning, **When** the message
   renders, **Then** they appear as written and cannot alter the message's structure.

---

### User Story 6 — Nobody can email a real customer from a non-production environment (Priority: P2)

An engineer working in development triggers a flow that sends email. It reaches a local or simulated
inbox. It cannot reach a real person, no matter what data is in the environment.

**Why this priority**: The canonical failure of every in-house email system is one environment variable
away, and its blast radius is external and irreversible. This platform has already been bitten four
times by configuration that tests supplied to themselves, so the guard belongs in the system's own
behaviour rather than in a convention.

**Independent Test**: In a non-production environment, attempt to send to an address outside the
allowlist and confirm the send is refused and reported.

**Acceptance Scenarios**:

1. **Given** a non-production environment, **When** any message is addressed to an unapproved recipient,
   **Then** the send is refused and the refusal is recorded.
2. **Given** a non-production environment, **When** a message is addressed to an approved test recipient,
   **Then** it is sent normally.
3. **Given** production, **When** a message is sent, **Then** no allowlist restricts it.

---

### Edge Cases

- **A recipient's client shows only the preview line.** Every message must state its purpose in the
  preview text, without repeating the subject line and without leaking a code or an amount.
- **Images are blocked.** The message must lose no information — including brand identity. Nothing
  load-bearing may live in an image.
- **A client forces full colour inversion.** The palette must remain a correct, legible design.
- **A client forces *partial* inversion**, rewriting some values and not others. This is the harder
  case, and the one that produces black text on a black surface.
- **A message would exceed the client truncation threshold.** It must fail the build, not truncate in
  a customer's inbox with the total below the cut.
- **A send fails.** The consequence differs per message — for a sign-in code it is a failed sign-in
  with no fallback; for a security notice the underlying change has already happened. The system must
  let each message declare which, rather than picking one policy for all.
- **Interception of a provider-sent message fails.** Sign-up and password recovery must remain
  completable.
- **A person's address has previously hard-bounced.** The platform already tracks this (037); the
  system must not silently claim to have delivered a message to an address it knows is undeliverable.
- **Interpolated values contain markup or unusual characters.** They must never be able to alter the
  message's structure — product, shop and customer names are user-influenced.
- **A code arrives in a message whose recipient cannot read HTML.** The text version must be complete
  and purpose-written.
- **A subject line contains non-ASCII characters.** It must display correctly rather than as escaped text.
- **The same message is sent twice for one action.** Duplicate suppression is out of scope, but the
  system must not itself introduce duplicates when a send is retried.

---

## Requirements *(mandatory)*

### A. The catalogue — one place, and it is the only place

- **FR-001**: The platform MUST have exactly one catalogue that names every email it can send. A message
  that is not in the catalogue MUST NOT be sendable.
- **FR-002**: Each catalogue entry MUST declare: a stable identifier, a subject line, preview text, the
  information the message needs, the audience it addresses, whether it is transactional or lifecycle,
  and what MUST happen when its send fails (fail the caller, or record and continue).
- **FR-003**: Naming a message that does not exist MUST be caught before deployment, not when a person
  triggers it. "Message not found" MUST NOT be a runtime failure class.
- **FR-004**: Supplying the wrong or incomplete information for a message MUST be caught before
  deployment. Sending code MUST NOT be able to omit a required value.
- **FR-005**: Information arriving from outside the sending service (from another service, a queue, or
  any boundary that is not statically checked) MUST additionally be validated at the moment of use, and
  a failure MUST be reported with the message identifier rather than producing a message with gaps in it.
- **FR-006**: Every message MUST be reviewable as source before it ships — visible in a change review
  alongside the code that sends it.
- **FR-007**: Rolling a message back MUST be possible without a data change: reverting the source and
  redeploying MUST fully restore the previous message.
- **FR-008**: A message's stored output MUST be verifiably derived from its source. A check MUST fail
  and NAME the stale message when they diverge. *(The pattern the platform already uses for design
  tokens and brand assets — and which 024 proved by deliberately breaking it three ways.)*
- **FR-009**: The catalogue MUST be complete: every entry MUST have output, a text version, a subject,
  preview text, and example data that satisfies its declared information. A check MUST fail on any gap.
- **FR-010**: Every message MUST carry its identifier in a way that survives to delivery reporting, so
  that the delivery records built in 037 can attribute a bounce or complaint to the message that caused it.

### B. Design — one identity, derived from the platform's own

- **FR-011**: The email design MUST derive from the platform design system: the monochrome neutral ramp,
  General Sans with a declared fallback, and the pinned radius scale. It MUST NOT introduce a colour,
  typeface, radius or spacing value that the design system does not already define. **No third hue may
  be introduced** — the two semantic colours (error, success) remain the only ones.
- **FR-012**: Email colour values MUST be derived from the design system's token source, not
  transcribed. A change to the platform palette MUST be able to reach email without a hand edit.
- **FR-013**: Brand identity MUST be carried by live text, colour and typography — **not by an image**.
  A recipient with images blocked MUST see a fully branded message. *(This is nearly free for a hueless
  design and is the single strongest recommendation in the compatibility research.)*
- **FR-014**: The design MUST NOT use card-style containers to lay out content (constitution Principle V).
  Structure MUST come from sections, hairline rules and typographic hierarchy. *A single filled surface
  used to present one value — the code block — is a value treatment, not a card layout, and is permitted;
  the justification is recorded here rather than deferred.*
- **FR-015**: The design MUST be correct when the platform typeface does not load. Roughly three-quarters
  of opens will render in a fallback face, so the fallback is the design, not a degradation.
- **FR-016**: A defined set of reusable building blocks MUST exist and MUST be the only way message
  content is composed: header, heading, paragraph, primary action, text link, code display, detail rows,
  line-item table, divider, notice, image, footer. Messages MUST NOT author layout of their own.
- **FR-017**: Type sizes, line heights, spacing and section rhythm MUST be defined once and shared by
  every message.
- **FR-018**: Every message MUST end with the same footer: who sent it, how to reach a person, and any
  legally required content.

### C. Rendering correctly in real email clients

- **FR-019**: Messages MUST render correctly in the platform's declared target clients. The target set
  MUST include the client family whose rendering engine is not a browser engine and MUST NOT treat it as
  legacy — it is supported by its vendor into 2029 and skews toward desktop users acting on
  transactional mail.
- **FR-020**: Every visual property that matters MUST survive the loss of the embedded stylesheet
  entirely. A message opened in a client that strips embedded styles MUST be completely correct.
- **FR-021**: Messages MUST NOT use layout or styling techniques that are unsupported in a target client.
  The prohibited set MUST be enforced automatically rather than by reviewer memory.
- **FR-022**: Rendered message size MUST stay within a budget below the threshold at which a major
  client truncates messages. Exceeding it MUST fail the build. Legally required footer content MUST fall
  inside that budget.
- **FR-023**: Every message MUST be sent with both a rich and a plain-text version. The text version
  MUST be **purpose-written**, not derived by stripping the rich one, and MUST be checked for
  non-emptiness and for absence of markup artefacts.
- **FR-024**: The message MUST declare its colour-scheme support so clients that honour that declaration
  do not apply their own transformation.
- **FR-025**: An explicit dark-appearance restatement of the palette MUST ship with every message, and
  MUST be generated from the same token source as the light one so the two cannot drift.
- **FR-026**: No text may appear on an undeclared surface. Every element carrying a text colour MUST
  also declare its background, so a client that rewrites one cannot orphan the other. *(This is the only
  defence against partial inversion, which is a more dangerous failure than full inversion.)*
- **FR-027**: The palette MUST avoid the mid-tone band that sits at the fixed point of lightness
  inversion for any load-bearing text or divider.
- **FR-028**: Neither semantic colour may be the sole carrier of meaning. Every error and every success
  state MUST also be stated in words or a non-colour indicator.
- **FR-029**: Messages MUST meet WCAG 2.1 AA contrast in **both** the light and the dark restatement,
  and MUST be verified automatically in both. Body text MUST be at least 16px on mobile, line height at
  least 1.5×, and any tappable element at least 48px.
- **FR-030**: Messages MUST be structured for assistive technology: a declared language, semantic
  headings in order, layout structure marked as presentational, and no image without alternative text.
- **FR-031**: Interpolated values MUST be escaped so that markup in a product, shop or person's name
  cannot alter the message's structure.
- **FR-032**: Every message MUST carry preview text that states its purpose, MUST NOT duplicate the
  subject line, and MUST NOT contain a code or a monetary amount.

### D. Compliance and message classification

- **FR-033**: Every message MUST be classified as transactional or lifecycle.
- **FR-034**: A lifecycle message MUST carry one-click unsubscribe. A transactional message MUST NOT.
  **The combination MUST be impossible to express**, not merely discouraged. *(Rationale: an
  unsubscribe control on a sign-in code is an account lockout with no recovery path — three of four
  audiences have no other credential. Sources genuinely disagree here; the platform decides deliberately.)*
- **FR-035**: Transactional messages MUST NOT carry promotional content. Mixing the two changes a
  message's legal classification and attaches obligations the platform is otherwise exempt from.
- **FR-036**: The sender identity, reply address and per-message-stream configuration MUST come from the
  published configuration contract, never from a value written into code. *(The contract established in
  037 — this slice MUST NOT reintroduce the drift it removed.)*
- **FR-037**: Reply addresses MUST be derived from the message's audience: customer-facing messages
  reply to the customer-facing mailbox, internal messages to the operational one. A message MUST NOT be
  able to name a third address.
- **FR-038**: The system MUST NOT place a credential-recovery link in a security-notification message.
  *(An existing platform rule, now enforced by the system rather than by a comment in one file.)*
- **FR-039**: Subject lines MUST display correctly when they contain non-ASCII characters.

### E. Operating the system

- **FR-040**: Every message MUST be previewable against its example data without sending anything and
  without cloud access.
- **FR-041**: The preview MUST cover every message in the catalogue and MUST be produced by the same
  process that produces the real message, so a preview cannot show something a recipient will not receive.
- **FR-042**: Rendered output MUST be verified automatically against its expected form, so an unintended
  change is caught rather than discovered in an inbox.
- **FR-043**: In every non-production environment, the system MUST refuse to send to any recipient
  outside an approved allowlist, MUST fail loudly, and MUST NOT be bypassable by configuration alone.
- **FR-044**: The system MUST support sending to the provider's delivery-simulation addresses so that
  bounce and complaint handling can be exercised without damaging sending reputation.
- **FR-045**: Every configuration value the system reads MUST be asserted by a test that reads the
  **real deployment configuration file**, not a value the test supplies to itself. *(This is the fifth
  recurrence of one defect — 027, 029, 033, 035. In 035, four undeclared variables meant no email was
  ever sent and 100 passing tests missed it.)*
- **FR-046**: Sending MUST be observable per message: which message, to which audience, with what
  outcome — without recording the recipient's address or any credential.
- **FR-047**: No message content, recipient address or credential may be written to logs.
- **FR-048**: Localisation MUST be structurally possible — a message MUST be able to carry a locale —
  but only the platform's single current market ships. Values whose formatting is locale-dependent
  (money, dates, quantities) MUST be formatted before reaching the message.

### F. Moving the existing messages onto the system

- **FR-049**: The sign-in code message MUST be produced by the new system, in the new design, for all
  four audiences, and MUST continue to place the code in the subject line so it can be read from a
  notification without opening the message.
- **FR-050**: The sign-in code message MUST contain **no clickable link other than the support contact**.
  *(Consistent with the platform's existing refusal to train people to click links in unsolicited
  credential mail.)*
- **FR-051**: The sign-in code message MUST continue to fail the caller when its send fails. The
  password-change notification MUST continue to record and continue. This difference MUST be expressed
  as a declared property of each message, not as divergent handling in two files.
- **FR-052**: The existing timing-parity behaviour on the sign-in path MUST be preserved exactly: a
  request for an address with no account MUST take the same path and cost the same time as one with an
  account. Adding rendering work MUST NOT reintroduce a measurable difference. *(035 FR-016.)*
- **FR-053**: The password-change notification MUST be produced by the new system, and MUST retain its
  prohibition on any recovery link.
- **FR-054**: The four messages currently produced by the identity provider MUST be brought under the
  system so that every email the platform sends shares one design.
- **FR-055**: Interception of a provider-sent message MUST fail safe: if the system cannot produce a
  message, the person MUST still receive a usable one and MUST still be able to complete sign-up or
  recovery.
- **FR-056**: Bringing provider-sent messages under the system MUST NOT change any code's length,
  lifetime or validity. *(Content and appearance only.)*
- **FR-057**: After this slice, no email content may remain authored inside a request handler. Both
  existing hand-assembled mailers MUST be removed, not left alongside the system.

### G. The commerce proof

- **FR-058**: One data-heavy message — an order confirmation carrying line items, quantities, prices,
  totals, a delivery address and a link to the order — MUST be built with the system's own building blocks.
- **FR-059**: Its line-item table MUST render correctly in every target client, including the one whose
  engine is not a browser engine.
- **FR-060**: Its plain-text version MUST present line items and totals as readable text.
- **FR-061**: It MUST stay within the size budget at the largest basket its example data covers, and
  the example data MUST be large enough to be a real test of that.
- **FR-062**: It is a **template only**. Wiring it to a real order event is explicitly **out of scope**
  and belongs to the slice that owns order notifications.

---

## The design *(the concrete answer to "find a good email template design")*

This section specifies the visual outcome. It is derived entirely from the existing platform design
system — no new value is introduced.

### D1. Why email commits to the light appearance

The platform's accent **inverts between appearances** (near-black on light, near-white on dark). The
app can do this because it knows which appearance is active. **Email cannot** — the mechanism that
reports appearance preference is unsupported in the client family holding roughly a quarter of opens,
and several clients rewrite colours regardless of what the message asks for.

So the email design is **authored in the light appearance** and ships an explicit dark restatement
that mirrors the app's own dark tokens. Where a client honours the restatement, the recipient sees
Effy's dark appearance. Where a client forces its own inversion instead, the result is still correct —
and this is a genuine structural advantage of having no brand hue:

> For any colour with zero saturation, lightness-inversion and naive channel-inversion produce **the
> same value**. A pure-neutral ramp has no hue to shift, so it is mathematically immune to the colour
> distortion that mangles branded emails in forced dark mode. The ramp simply flips end-for-end and
> remains a correct greyscale design, with contrast preserved or improved.

The exposure is therefore **not** the ramp. It is (a) the two semantic colours, which is why FR-028
requires meaning to be carried in words as well; and (b) **partial** inversion, where a client rewrites
some values and not others and can leave dark text on a darkened surface — which is why FR-026 requires
every text colour to declare its own background.

### D2. Email tokens

| Role | Light | Dark restatement | Source | Note |
| --- | --- | --- | --- | --- |
| Page ground | `#F5F5F5` | `#0A0A0A` | ramp 50 / sidebar-dark | ⚠ deliberately **not** `#FFFFFF`, which inverts to pure `#000000` |
| Canvas | `#FFFFFF` | `#1A1A1A` | `--background` both modes | matches the app's white canvas |
| Ink | `#1A1A1A` | `#FFFFFF` | `--foreground` | 17.4:1 / 17.4:1 |
| Muted ink | `#666666` | `#B3B3B3` | `--muted-foreground` | 5.73:1 on white; ⚠ outside the inversion fixed-point band |
| Hairline | `#E6E6E6` | `#4D4D4D` | `--border` | dividers, table rules |
| Action fill | `#1A1A1A` | `#F5F5F5` | `--primary` | ⚠ **inverts**, exactly as the app does |
| Action label | `#FFFFFF` | `#1A1A1A` | `--primary-foreground` | 17.4:1 / 15.96:1 |
| Code surface | `#F5F5F5` | `#333333` | `--accent` / `--secondary` | the one filled value surface |
| Error | `#e01010` | `#FF6B6B` | `--destructive` | never the sole carrier of meaning |
| Success | `#0C9409` | `#22C55E` | `--success` | non-text indicator only, both modes |
| Radius | `8px` | — | `sm` | squared in the legacy engine; accepted |

⚠ **The band `#707070`–`#909090` is banned for text and dividers.** It is the fixed point of lightness
inversion and the ambiguity zone of partial inversion — a value there may or may not be rewritten, and
the design cannot know which.

### D3. Type

```
'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif
```

General Sans loads in roughly a quarter of opens. **The design is correct in Arial** (FR-015). Weights
are **400 / 500 / 600 only** — never 700, per the design system.

| Element | Size / line-height | Weight | Colour |
| --- | --- | --- | --- |
| Preview text | hidden | — | — |
| Wordmark | 22 / 28 | 600 | Ink |
| H1 | 24 / 32 | 600 | Ink |
| Body | 16 / 24 | 400 | Ink or Muted |
| **Code** | **36 / 44**, tracking `0.15em` | 500 | Ink |
| Small print | 14 / 21 | 400 | Muted |
| Footer | 14 / 21 | 400 | Muted |
| Action label | 16 / 20 | 600 | Action label |

### D4. Layout

600px content width, 32px side gutters (24px on phones), flat canvas, sections separated by 1px
hairlines. **No cards** (FR-014).

```
┌──────────────────────────────────────────────────┐  page ground #F5F5F5
│  ┌────────────────────────────────────────────┐  │
│  │  Effy                                      │  │  wordmark — LIVE TEXT, no image
│  ├────────────────────────────────────────────┤  │  hairline #E6E6E6
│  │                                            │  │
│  │  Your sign-in code                         │  │  H1 24/600
│  │                                            │  │
│  │  Enter this code to sign in. It expires    │  │  body 16/400 muted
│  │  in 5 minutes and can only be used once.   │  │
│  │                                            │  │
│  │  ┌──────────────────────────────────────┐  │  │  code surface #F5F5F5, r8
│  │  │           4 8 2 9 1 7                │  │  │  36/500, tracking .15em
│  │  └──────────────────────────────────────┘  │  │
│  │                                            │  │
│  │  If you didn't ask to sign in, you can     │  │  small print 14/400 muted
│  │  ignore this email — nobody can use the    │  │
│  │  code without it.                          │  │
│  │                                            │  │
│  ├────────────────────────────────────────────┤  │  hairline
│  │  Effy · <postal address>                   │  │  footer 14/400 muted
│  │  Questions? hello@effyshopping.com         │  │  the only link in this message
│  └────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────┘
```

### D5. The sign-in code message, in full

- **Subject** — `482917 is your Effy sign-in code` (per audience: `Effy` / `Effy Driver` /
  `Effy Shop` / `Effy Back-Office`). ⚠ Unchanged from today: reading the code from a lock-screen
  notification without opening the message is a real usability win and it is already shipped.
- **Preview text** — `Enter this code to sign in. It expires in 5 minutes.` ⚠ **Does not repeat the
  subject and does not restate the code** (FR-032).
- **Heading** — `Your sign-in code`
- **Body** — `Enter this code to sign in. It expires in 5 minutes and can only be used once.`
  For internal audiences: `Enter this code to sign in to your work account. It expires in 5 minutes and
  can only be used once.`
- **Code** — the six digits, spaced for legibility, on the code surface.
- **Security line** — `If you didn't ask to sign in, you can ignore this email — nobody can use the
  code without it.`
- **Footer** — sender identity, postal address, support contact. **No other link** (FR-050).

**Plain-text version** (purpose-written, not stripped — FR-023):

```
Your Effy sign-in code

482917

Enter this code to sign in. It expires in 5 minutes and can only be used once.

If you didn't ask to sign in, you can ignore this email — nobody can use the
code without it.

--
Effy
Questions? hello@effyshopping.com
<postal address>
```

⚠ The expiry duration is stated once in the message and MUST be derived from the same value that
governs the code's actual lifetime — a message that claims five minutes while the code lasts ten is a
support ticket the platform generated itself.

---

## Key Entities

- **Message definition** — one catalogue entry: identifier, subject, preview text, required information,
  audience, classification (transactional / lifecycle), send-failure policy, and its content.
- **Message content** — the rich and plain-text forms of a message, composed only from building blocks.
- **Building block** — a reusable, styled unit of message content (header, heading, paragraph, action,
  code display, detail rows, line-item table, divider, notice, footer).
- **Email token set** — the mapping from the platform design system's values to email roles, in both
  the light and dark restatements. Derived, never transcribed.
- **Example data** — one fixture per message, satisfying its declared information, used for preview
  and verification.
- **Audience profile** — which of the four audiences a message addresses; determines wording, product
  name and reply address. *(Extends the existing profile, which today carries only a product name and
  an internal flag.)*
- **Send record** — the observable outcome of a send, attributable to a message identifier, joining the
  delivery status and event records established in 037.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person signing in receives a message carrying the Effy design, and can complete sign-in
  using the code from it, on all four audiences.
- **SC-002**: All six message types the platform sends today are produced by the one system. **Zero**
  email content remains authored inside a request handler.
- **SC-003**: Adding a new message requires touching **one** catalogue entry plus its content, its text
  version and its example data — and **no** layout, styling, colour, typography or footer is authored.
- **SC-004**: Every message renders correctly, and is fully legible, in each declared target client —
  verified by inspecting a real message in each, including the non-browser rendering engine and the
  configuration that strips embedded styles.
- **SC-005**: Every message is fully legible with **all images blocked**, including its brand identity.
- **SC-006**: Every message meets WCAG 2.1 AA contrast on every text/surface pair in **both** the light
  and dark restatements, verified automatically with zero exemptions.
- **SC-007**: Every message renders correctly in a client that forces dark appearance, with no
  dark-on-dark or light-on-light region — verified by inspection in a client that inverts *fully* and
  one that inverts *partially*.
- **SC-008**: Every message ships a purpose-written plain-text version; a message missing one cannot be
  built.
- **SC-009**: Every message stays inside the size budget; a message exceeding it cannot be built.
- **SC-010**: Each guard fails **and names the offending message** when deliberately broken: stale
  output, missing text version, oversize, prohibited technique, missing example data, contrast failure,
  and a send site supplying wrong information. *(Proven by breaking each, as 024 proved its drift check.)*
- **SC-011**: A configuration-contract test reads the real deployment configuration and fails when a
  value the system reads is not declared there.
- **SC-012**: In a non-production environment, a send to an unapproved recipient is refused; a send to
  an approved one succeeds.
- **SC-013**: Every message is previewable locally with no cloud access and no send.
- **SC-014**: Sign-in timing parity is preserved: a request for a non-existent address remains
  indistinguishable in duration from one for a real address.
- **SC-015**: The order-confirmation message renders correctly with a large basket, in every target
  client, inside the size budget, with a readable text version.
- **SC-016**: Values containing markup cannot alter a message's structure — verified with a hostile
  fixture.
- **SC-017**: Bringing provider-sent messages under the system changes no code's length, lifetime or
  validity; sign-up and password recovery still complete.
- **SC-018**: If message production fails for a provider-sent message, the person still receives a
  usable message and can still complete the action.
- **SC-019**: No message content, recipient address or credential appears in any log — verified by sweep.
- **SC-020**: A change to a platform design-system colour reaches email without any hand edit to an
  email colour value.

---

## Assumptions

**Settled by the operator during specification:**

1. **Templates are authored by engineers, in the repository**, reviewed as source, with output committed
   and guarded by a drift check. Rollback is a revert and a deploy. Non-engineer editing, stored
   templates and an editing console are **out of scope**. *(Chosen over a console; the research is
   emphatic that stored templates are only safe when the authoring language is too weak to break
   anything, and the platform has no non-engineer authors today.)*
2. **The identity provider's four messages are brought under the system**, so the platform ships one
   visual identity rather than two.
3. **Scope is the auth/account set plus one data-heavy commerce template**, which exists to prove the
   receipt building blocks rather than to be wired to real orders.

**Reasonable defaults taken:**

4. The platform ships **one locale** (its single market). Locale is carried structurally so adding a
   second is not a migration, but no translation pipeline is built.
5. **Only transactional messages ship in this slice.** The lifecycle classification and its unsubscribe
   obligation exist in the catalogue so the distinction is enforceable from day one, but no lifecycle
   message is authored, and no marketing sending stream is established.
6. **The hot path does not send email in this slice.** It sends none today. The system is owned by one
   language so two rendering implementations cannot drift — a lesson this platform has already paid for
   four times. When a service in another language needs to send, it publishes an event to the existing
   backbone and the owning worker renders and sends. That worker is built by the slice that needs it.
7. **Delivery, bounce and complaint handling are not rebuilt.** 037 owns them; this slice consumes them
   and adds message attribution.
8. **No dedicated sending IP.** At the platform's volume a dedicated IP has no reputation and would be
   worse than a shared one.
9. **Separate sending streams for transactional and marketing mail are established as configuration
   only**, because splitting them is free before volume exists and impossible after reputation damage.
   No marketing mail is sent.
10. **Real-client verification is a human step.** No open-source tool renders the non-browser engine;
    the target-client walk is an explicit operator task, not an aspiration. *(This platform has a
    documented pattern of machine-verified work that was never walked on a device.)*
11. **The postal address required in the footer is an operator input**, not a value this specification
    may infer. Per the platform's prohibited-values rule, a real-world identifier is asked for and never
    guessed.
12. **Duplicate-send suppression, scheduling, digests, batching and per-person notification preferences
    are out of scope.**

**Dependencies:**

13. The published mail configuration contract from **037** (`/effy/<env>/ses/*`) — sender, reply
    address, and per-stream outcome configuration. This slice reads it and MUST NOT reintroduce the
    hardcoded copies 037 removed.
14. The delivery status and event records from **037**, extended with message attribution.
15. The design-system token source in `packages/design-system` — the origin of every colour, type and
    radius value used in email.
16. The audience profile from **035**, extended beyond a product name and an internal flag.
17. **An operator-supplied postal address** for the compliance footer, and an approved non-production
    recipient allowlist.

---

## Out of Scope

- A template-editing console, stored templates, or non-engineer authoring.
- Marketing or lifecycle campaigns, audience segmentation, and unsubscribe preference management
  (the classification and its rules are built; no such message is authored).
- Wiring the order-confirmation template to a real order event.
- Push, SMS and in-app notifications. *(This is the email system; a broader notification system is a
  later slice that would consume it.)*
- Translation into a second language.
- Rebuilding delivery, bounce or complaint handling (037).
- Sending email from the hot path.
- Per-person notification preferences, digests, batching or scheduling.
