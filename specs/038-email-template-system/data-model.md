# Data Model — 038 Platform Email Template System

**Phase**: 1 · **Plan**: [plan.md](plan.md) · **Research**: [research.md](research.md)

⚠ **Almost nothing in this slice is persisted.** Templates live in the repository (research R3), the
palette is generated from the design system, and rendering is pure. The whole persistence footprint is
**one nullable column on an existing table**. Everything else below is a *code* entity — a type — and
is documented here because it is the shape every future email depends on.

---

## Part 1 — The persisted change

### One forward-only migration

```
db/migrations/<timestamp>_email_template_attribution.sql
```

| Table | Change |
| --- | --- |
| `public.email_delivery_event` | **ADD COLUMN** `template_id text NULL` |

Nothing else. No new table, no new index in this slice, no change to
`public.email_delivery_status`.

### Why this column exists

037 records every delivery outcome SES reports, keyed `(message_id, event_type, address)`. It can
answer *"is this address undeliverable?"* It cannot answer **"which message is bouncing?"** — and once
the platform sends sixty message types, that is the question an operator will actually ask.

Platform-sent messages carry an SES message tag `effy-template`, which surfaces in the event payload as
`mail.tags`. 037's existing consumer reads it and writes it here. See
[research R8](research.md#r8--attribution-ses-message-tags-over-tag-safe-ids).

### ⚠ Why it is nullable, permanently

Two independent reasons, either of which alone is sufficient:

1. **Rows written before this slice have no template.** A backfill would have to invent one.
2. **⚠ Messages Cognito sends can never have one.** The four intercepted messages are sent by Cognito
   itself (research R7), so the platform cannot attach a tag, a configuration set, or a header to them.
   A `NOT NULL` column would either require a fabricated value or break that path.

**Attribution is therefore partial by construction, not by omission.** A `NULL` here means *"sent by
Cognito, or sent before 038"* — it does not mean the data is missing. Any read model MUST present it
that way rather than as an unknown.

### Why not `email_delivery_status`

That table holds **one row per address** — the current conclusion about a person. A template is a
property of a **message**, and one address receives many message types. Putting `template_id` there
would make the last message to bounce overwrite the record of every previous one.

---

## Part 2 — Code entities (the types that matter)

Full field-level rules live in
[`contracts/email-catalog.contract.md`](contracts/email-catalog.contract.md). This section describes
what each entity *is* and the invariants that bind it.

### `TemplateId` — the closed set

A string-literal union of every message the platform can send. **Closed by construction**: a value not
in the union does not typecheck, which is what removes "template not found" from the runtime failure
classes (spec FR-003).

⚠ **Grammar: `[a-z0-9-]+` only.** Not a style preference — SES message tag values permit only
`[A-Za-z0-9_-]`, so a dotted id would need sanitising, and two ids could sanitise onto one tag. The
restriction makes the id **tag-safe by construction**. A catalogue test pins the grammar and asserts
uniqueness.

**At ship (7):**

| Id | Sent by | Category | On send failure |
| --- | --- | --- | --- |
| `auth-sign-in-code` | Platform (035 custom challenge) | transactional | ⚠ **throw** |
| `auth-sign-up-code` | Cognito (`CustomMessage_SignUp` / `_ResendCode`) | transactional | n/a — Cognito sends |
| `auth-password-reset-code` | Cognito (`CustomMessage_ForgotPassword`) | transactional | n/a |
| `auth-email-verification-code` | Cognito (`CustomMessage_VerifyUserAttribute` / `_UpdateUserAttribute`) | transactional | n/a |
| `auth-step-up-code` | Cognito (`CustomMessage_Authentication`) | transactional | n/a |
| `account-password-changed` | Platform (012) | transactional | **swallow + log** |
| `order-confirmation` | ⚠ **nothing** — template only (spec FR-062) | transactional | n/a |

### `MessageDefinition` — one catalogue entry

The record for one message: its id, subject builder, preview-text builder, variable schema, audience
scope, category, and failure policy.

**Invariants:**

- **⚠ The category is a discriminated union, not a flag.** A `lifecycle` entry *requires* an
  unsubscribe URL; a `transactional` entry has **no field to put one in**. The wrong combination
  cannot be expressed (spec FR-034, research R16). An unsubscribable sign-in code is an account
  lockout, so it is made unrepresentable rather than forbidden by review.
- **⚠ The failure policy is declared data, not handler behaviour.** Today `otp/mailer.ts` throws and
  `password/notify.ts` swallows. Both are *correct* — a code that never arrived is a sign-in that
  cannot complete, whereas a password has already changed by the time its notification fails — but
  that reasoning lives as a comment in two files, and the seventh message would have to guess. It
  becomes a property of the message (spec FR-051).
- Every declared variable MUST appear in both the HTML and the text form, and every placeholder in
  either form MUST be declared. Checked in both directions (research R10).
- Subject and preview text are **functions of the variables**, so a code can appear in the subject
  (spec FR-049) while the preview text is forbidden from restating it (spec FR-032).

### `Variables` — per-message payload

Schema-validated. **Validated twice, deliberately**: statically at every call site (spec FR-004), and
again at runtime wherever the payload crossed a boundary that is not statically checked — a queue, a
trigger event, another service (spec FR-005).

⚠ **Locale-dependent values arrive pre-formatted.** Money, dates and quantities are strings by the time
they reach a message. This is forced by having no formatting helpers at substitution time, and it is
also correct: formatting is the caller's domain knowledge, not the template's.

⚠ **Every value is escaped on substitution.** Product, shop and customer names are user-influenced;
SES's own engine does not escape and its documentation says so.

### `BuildingBlock` — the 12 shared components

`header · heading · paragraph · button · link · code · rows · line-items · divider · notice · image ·
footer`. Messages compose these and **author no layout of their own** (spec FR-016, SC-003).

⚠ **`notice` is the only block that may use a semantic colour**, and it must carry the meaning in words
as well — under naive inversion the error red becomes cyan (research R13).

⚠ **`footer` is not optional and is not per-message.** One footer, one place. Two hand-rolled mailers
already produced two different sign-offs at a scale of *two*.

### `EmailTokenSet` — generated, never authored

The mapping from `packages/design-system/src/tokens.css` to email roles, in both appearances. **A
generated artifact**; a hand-edited email colour is a build failure.

⚠ **Three constraints beyond the design system's own** (research R13, full table in
[`contracts/email-tokens.contract.md`](contracts/email-tokens.contract.md)):
- The page ground is `#F5F5F5`, **not** `#FFFFFF` — pure white inverts to pure black.
- The authored dark ground is `#1A1A1A`, **never** `#000000`.
- ⚠ `#707070`–`#909090` is **banned** for text and dividers: it is the fixed point of lightness
  inversion and the ambiguity zone of partial inversion.

### `Fixture` — example data, one per message

Schema-valid sample data. Drives preview (spec FR-040) and verification (spec FR-042).

⚠ **The order-confirmation fixture must carry a genuinely large basket** (spec FR-061). A fixture with
three line items proves nothing about the 102 KB budget, and this repository's most-repeated failure is
a fixture that agreed with the code instead of with the world.

⚠ **A hostile fixture is required** — values containing markup, to prove escaping (spec SC-016).

### `AudienceProfile` — extended, not replaced

Today `apis/edge-api/auth/src/lib/audience.ts` carries `productName` and an `internal` boolean. It
gains what email needs: the reply address and the wording variant.

⚠ **The reply address is DERIVED from the audience, never passed in**: customer-facing messages reply
to `hello@effyshopping.com`, internal ones to `workspace-admin@effyshopping.com`. These are the only
two approved mailboxes; deriving rather than accepting a parameter is what makes it structurally
impossible for a send site to invent a third (constitution: Real-World Identifiers).

⚠ **Fail closed on an unknown pool** — the existing rule, preserved.

### `SendRecord` — observability, not a table

Not persisted by this slice. It is the structured log line plus the SES message tag, which together let
037's `email_delivery_event` answer "which message?".

Fields: `template_id`, `audience`, `outcome`, `duration_ms`, SES `message_id`.
⚠ **Never** the recipient address, the code, or any rendered content — which is why `otp/mailer.ts`
has no logging at all today, and why the replacement logs only these five fields.

---

## Part 3 — Two operator-supplied values

Neither may be inferred (constitution: Real-World Identifiers). Both **fail loudly** when unset.

| Value | Key | Why it cannot be guessed |
| --- | --- | --- |
| **Postal address** for the compliance footer | `/effy/<env>/mail/postal_address` | A real-world identifier naming a physical place. A wrong one is printed on every email the platform sends. |
| **Non-production recipient allowlist** | `/effy/<env>/mail/nonprod_allowlist` | Determines who *can* be emailed from dev. A guessed entry is a stranger receiving platform mail. |

⚠ Enforced the way 037's `alert_email` is: a Terraform validation that **refuses a placeholder**, plus
a config-contract test that reads the real `serverless.yml`. The mechanism already exists in
`infra/envs/dev/variables.tf`; this slice extends it rather than inventing a second one.

---

## What is deliberately NOT modelled

| Not built | Why |
| --- | --- |
| A `email_template` table | Templates are code (research R3). A database column holding HTML is the anti-pattern GOV.UK Notify avoided by restricting its authoring language instead. |
| Template version rows | Version history is git. Rollback is a revert and a deploy (spec FR-007). |
| A send queue / outbox table | The platform sends single-digit volumes per day and both senders are synchronous by nature — a Cognito trigger cannot await a queue inside a 5-second wall. When a Go caller needs email, the **existing** SNS backbone carries it (research R6). |
| Per-person notification preferences | Out of scope; and meaningless for transactional mail, which cannot be opted out of (research R16). |
| A suppression table | SES's account-level suppression list already exists, and 037 already derives per-address state from delivery events. A third store would be a third opinion. |
| Retention on `email_delivery_event` | 037 recorded this as a carry-forward and it remains one. Adding a retention policy while there is still no data to measure would be guessing. |
