# Contract: Feedback Emails (046)

Two new entries in the `@effy/email-kit` catalogue (`packages/email-kit/src/catalog.ts`), each with an
MJML template + a `.txt.hbs` plain-text part, generated to committed artifacts and covered by
`make email-check`. Both are `sentBy: "platform"`, `audiences: ["customer"]`, `category:
"transactional"`. Sender/reply-to use the approved mailboxes already in `email-kit` config — **no new
real-world identifier** (constitution: Real-World Identifiers).

## `feedback-received` — acknowledgement (on submission)

```ts
"feedback-received": {
  vars: { referenceCode: "string", category: "string" },   // category = human label, pre-formatted
  subject: (v, p) => `We got your feedback — ${p.productName}`,
  preheader: () => "Thanks for taking the time. Here's your reference.",
  audiences: ["customer"],
  sentBy: "platform",
  category: "transactional",
  onSendFailure: "swallow",   // ⚠ the submission is ALREADY stored; failing would tell a lie (FR-015)
}
```
Content: a short thank-you, the `referenceCode` for their records, and the `category` they chose. No
code, no PII beyond what they gave, no internal data (FR-038). No third-party asset (guard-enforced).

## `feedback-reply` — staff reply

```ts
"feedback-reply": {
  vars: {
    replyBody:       "string",   // the staff message, escaped by the render path
    originalMessage: "string",   // a quote/reference of what they sent
    category:        "string",   // human label
    referenceCode:   "string",
  },
  subject: (v, p) => `Re: your ${p.productName} feedback (${v.referenceCode})`,
  preheader: () => "A reply from the Effy team.",
  audiences: ["customer"],
  sentBy: "platform",
  category: "transactional",
  onSendFailure: "throw",   // ⚠ staff must learn it failed so the submission isn't marked replied (FR-030)
}
```
Content: the staff reply prominently, then a quoted reference to the original message so the shopper
has context. Identifies Effy via the approved customer-facing reply identity (`hello@…`); never
exposes staff personal contact details (FR-032) or internal notes (FR-038).

## Guards (existing `make email-check`, applied to both)

- Committed-artifact **drift** check; **size** budgets; **missing text part** ban; **banned
  techniques**; **contrast** in light / dark / forced-invert; **no third-party asset** (Google Fonts
  auto-injection stripped); placeholder integrity.
- Because both are `sentBy: "platform"` (not `cognito`), the tighter ~20,000-char Cognito budget does
  **not** apply; the ~102 KB Gmail-clip budget does.
- ⚠ 039 caveat: the shared render path HTML-escapes the plain-text part. Neither template carries a
  URL query parameter (the reference code is opaque alphanumeric), so the `token&#x3D;` escaping trap
  does not arise here — but any future link var must be re-checked.

## Failure-policy rationale (why one of each)

`feedback-received` **swallows**: the write already happened irreversibly and the shopper's on-screen
confirmation already said "received" — a thrown failure would contradict a true fact (the
`account-password-changed` pattern). `feedback-reply` **throws**: nothing irreversible has happened
yet, and the whole point of the action is that the shopper receives it — a swallowed failure would
mark the submission `replied` while the shopper got nothing (the `newsletter-confirmation` pattern).
This is precisely the per-message discriminator `email-kit` exists to carry.
