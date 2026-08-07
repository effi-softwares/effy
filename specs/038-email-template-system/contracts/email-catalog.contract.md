# Contract — the email catalogue (`@effy/email-kit`)

**Producer**: `packages/email-kit/src/catalog.ts` — the single source of truth for message identity.
**Consumers**: `edge-api/auth` (sign-in code + the Cognito interceptor), `edge-api/customer`
(password-changed), the preview harness, every guard script, and every future sender.

Adding a message is a catalogue edit. **Sending a message that is not in the catalogue is not
expressible.**

---

## 1. `TemplateId`

A closed string-literal union. ⚠ **Grammar: `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`** — lowercase, digits and
single hyphens only.

⚠ **This is not a naming preference.** SES message tag values permit only `[A-Za-z0-9_-]`, and message
tags are how a delivery outcome is attributed to a message (`mail.tags` → 037's
`email_delivery_event.template_id`). A dotted id would need sanitising, and **two ids could sanitise
onto one tag** — silently merging the bounce statistics of two different messages. Restricting the
grammar makes the id **tag-safe by construction**, so no sanitiser exists to get wrong.

**Rules**
1. The grammar is asserted by a test over every id.
2. Ids are unique — asserted, not assumed.
3. ⚠ An id is **permanent once shipped**. It is written into delivery records; renaming one orphans
   every historical row. A message that changes meaning gets a *new* id.

---

## 2. `MessageDefinition`

```ts
type MessageDefinition<V> = {
  readonly id: TemplateId;
  readonly schema: Schema<V>;                       // validates V
  readonly subject: (v: V, a: AudienceProfile) => string;
  readonly preheader: (v: V, a: AudienceProfile) => string;
  readonly audiences: readonly Audience[];          // which of the four may receive it
  readonly sentBy: "platform" | "cognito";          // ⚠ determines which budget applies
} & Category & FailurePolicy;
```

### 2.1 ⚠ `Category` — a discriminated union, not a flag

```ts
type Category =
  | { readonly category: "transactional" }                          // NO unsubscribe field exists
  | { readonly category: "lifecycle"; readonly unsubscribeUrl: (v) => string };
```

**The wrong combination MUST NOT compile.** A transactional definition has nowhere to put an
unsubscribe URL; a lifecycle definition cannot omit one.

⚠ **Why this is structural rather than a lint rule**: a person who unsubscribes from
`auth-sign-in-code` **cannot sign in**, and driver, shop and back-office have **no other credential**.
That is an account lockout with no recovery path. Sources genuinely disagree about whether transactional
mail may carry `List-Unsubscribe` — Google scopes the requirement to marketing and subscribed mail,
RFC 8058 imposes no message-type restriction, and **AWS's own blog does not draw the distinction at
all**. The platform draws it here, in the type system, where it cannot be forgotten.

**Consequences at send time**
- `transactional` → `List-Unsubscribe` and `List-Unsubscribe-Post` MUST NOT be set. The rendered body
  MUST contain no unsubscribe affordance. Asserted by a guard.
- `lifecycle` → both headers MUST be set, `List-Unsubscribe` first, and the visible link MUST fall
  inside the first 90 KB (⚠ past Gmail's clip point it does not exist for the recipient).
- ⚠ `transactional` messages MUST carry **no promotional content**. Under CAN-SPAM's "primary purpose"
  test, enough promotional content reclassifies the whole message as commercial and attaches every
  requirement it was exempt from. "Here's your order — and 20% off next week" is exactly that case.

**At ship**: all seven messages are `transactional`. The `lifecycle` arm exists **unused, on purpose**,
so the distinction is enforceable from the first day rather than retrofitted after the first campaign.

### 2.2 ⚠ `FailurePolicy` — declared, not remembered

```ts
type FailurePolicy =
  | { readonly onSendFailure: "throw" }    // the caller must handle it
  | { readonly onSendFailure: "swallow" }; // record and continue
```

This exists because the two behaviours already in the codebase are **both correct and irreconcilable
as a default**:

| Message | Policy | Why |
| --- | --- | --- |
| `auth-sign-in-code` | ⚠ **throw** | A code that was never sent is a sign-in that cannot complete, and three of four audiences have no password fallback. The caller turns it into an opaque refusal. |
| `account-password-changed` | **swallow + log loudly** | The password has **already** been changed and the write cannot be unwound. Failing the request would tell the customer their change failed when it did not — a worse lie than a missing email. But its silent absence is exactly the condition under which a takeover goes unnoticed, so the log must be loud. |

⚠ Today this reasoning lives as a comment in two files. The seventh message would have to guess.

### 2.3 `sentBy` — which size budget applies

| Value | Sender | Budget |
| --- | --- | --- |
| `"platform"` | `@effy/email-kit/send` via SESv2 | 90 KB warn / **102 KB hard** (Gmail clipping) |
| `"cognito"` | ⚠ Cognito itself, via the `CustomMessage` trigger | **20,000 characters hard** *and* the Gmail budget |

⚠ **The Cognito budget is roughly five times tighter and applies to four of the seven templates.**
Discovering it after authoring means redesigning them. It is a build gate.

⚠ `sentBy: "cognito"` also means the platform **cannot** attach a message tag, choose a configuration
set, or set a header on that message — so it gets **no delivery attribution** and is **not covered by
the non-production allowlist**. Both follow from Cognito owning the send.

---

## 3. The send API

```ts
send<T extends TemplateId>(
  id: T,
  to: string,
  vars: VarsFor<T>,
  audience: Audience,
): Promise<SendResult>;
```

1. **⚠ The generic is the whole point.** A call site cannot compile with the wrong variables (spec
   FR-004), and `TemplateId` being closed means "template not found" is not a runtime failure class
   (spec FR-003).
2. **Runtime validation as well**, wherever the payload crossed a boundary the compiler did not check —
   a trigger event, a queue message, another service (spec FR-005). A failure is reported **with the
   template id**, never as a message with gaps in it.
3. **Escapes every substituted value.** ⚠ SES's own engine does not, and its documentation says so.
   Product, shop and customer names are user-influenced.
4. **Applies the declared failure policy.** The caller does not choose.
5. **Derives the reply address from `audience`** — never accepts one. Customer-facing → `hello@`;
   internal → `workspace-admin@`. ⚠ These are the only two approved mailboxes, and deriving is what
   makes inventing a third structurally impossible.
6. **Reads sender, reply address and configuration set from the SSM contract**
   ([037's `ssm-mail.contract.md`](../../037-platform-email-delivery/contracts/ssm-mail.contract.md)),
   never from a literal. ⚠ This slice MUST NOT reintroduce the hardcoded copies 037 removed.
7. **Refuses non-allowlisted recipients whenever `EFFY_ENV !== 'prod'`**, fail-closed and loudly.
   `@simulator.amazonses.com` is always permitted.
8. **Tags the message** `effy-template: <id>` and sets an `X-Effy-Template` header.
9. **Logs exactly five fields**: `template_id`, `audience`, `outcome`, `duration_ms`, SES `message_id`.
   ⚠ **Never** the address, the code, or any content.

### 3.1 ⚠ Timing parity is a property of this API

035 FR-016 / spec FR-052: a request for an address with no account must be indistinguishable in
duration from one with an account. The existing mechanism — sending to
`success@simulator.amazonses.com` so the *same call on the same path* is made either way — is a
**security control, not a test fixture**, and MUST survive this refactor unchanged. Rendering happens
identically on both paths.

---

## 4. Completeness — what `email-check` asserts

Every check fails the build and **names the offending template** (spec SC-010, proven by breaking each).

| # | Assertion |
| --- | --- |
| C-01 | Every `TemplateId` has HTML, text, a subject, preview text and a schema-valid fixture |
| C-02 | Every id matches the grammar; all ids unique |
| C-03 | Every declared variable appears in **both** the HTML and text forms |
| C-04 | Every placeholder in either form is a declared variable *(the reverse direction — catches a renamed variable)* |
| C-05 | ⚠ `{####}` appears in exactly the `sentBy: "cognito"` templates, and nowhere else |
| C-06 | ⚠ Handlebars does not consume `{####}` — asserted by rendering and comparing |
| C-07 | `transactional` → no unsubscribe affordance anywhere in either form |
| C-08 | `lifecycle` → unsubscribe present in both forms and inside the first 90 KB |
| C-09 | Size within the budget for that entry's `sentBy` |
| C-10 | Text part non-empty, no HTML entities, no markup |
| C-11 | The committed `.html` and the runtime `templates.generated.ts` are byte-identical in content |
| C-12 | Regenerating `dist/` from source changes nothing |

---

## 5. Rules

1. **⚠ A message may not be sent from outside this catalogue.** After this slice, no email content may
   remain authored inside a request handler (spec FR-057). Both existing hand-rolled mailers are
   **removed**, not left alongside — leaving them would preserve exactly the duplication this contract
   exists to end.
2. **⚠ Every configuration value the sender reads MUST be asserted by a test that parses the real
   `serverless.yml`.** This is the **fifth** recurrence of one defect (027 R13 → 029 → 033 → 035). In
   035 the audience map read four variables `serverless.yml` never declared: every pool resolved
   "unknown", no email was ever sent, and **100 passing tests missed it because they set those
   variables themselves.** A unit test that supplies its own configuration can never notice that the
   configuration does not exist.
3. **An id is permanent.** See §1.
4. **The catalogue holds no secrets and no real-world identifiers.** The postal address and the
   allowlist come from SSM; the two mailboxes are derived from audience.
5. **Adding a message touches**: one catalogue entry, one `.mjml`, one `.txt.hbs`, one fixture.
   **Nothing else** — no layout, styling, colour, typography or footer (spec SC-003). If a new message
   requires authoring layout, the building-block set is incomplete and *that* is the defect.
