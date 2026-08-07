# `@effy/email-kit`

The one place every email the platform sends is defined, designed, and rendered.

Before this package, email was plain-text strings assembled inside two Lambdas. Now every message
lives in a **typed catalogue**, is authored in **MJML**, compiled at build time to **committed
artifacts**, and rendered with **Handlebars** at send. The design is **generated from the
design-system tokens**, so it matches the app and updates when the palette does — no hand edits.

> **New to this?** Run `make email-preview` from the repo root, then open
> `packages/email-kit/dist/preview/index.html` in a browser. You'll see every template rendered. That
> is the fastest way to understand what this package produces.

---

## The 30-second mental model

```
design-system/tokens.css ─┐
                          ├─(make email-gen)─→  dist/*.html   ← committed, drift-guarded
src/templates/*.mjml ─────┘                     dist/*.txt
                                                dist/templates.generated.ts  ← what the app ships

app code ──sendEmail("id", vars, {to, audience})──→ renders the committed artifact + sends via SES
```

Two rules that explain almost everything:

1. **You author templates; a generator compiles them.** You never hand-write the final HTML. You edit
   `.mjml` source and run `make email-gen`. The compiled output in `dist/` is committed and checked.
2. **A message that isn't in the catalogue can't be sent.** `src/catalog.ts` is the single source of
   truth. The template id, its variables, and who it's for are all typed — a wrong call won't compile.

---

## Common tasks

### ➕ Add a new email

Adding a message is **four files, nothing else** — no layout, no styling, no footer. If you find
yourself writing a colour or a font size, stop: something is wrong (see [Design rules](#design-rules)).

Say you want a `welcome` email. From `packages/email-kit/`:

**1. The catalogue entry** — `src/catalog.ts`, add to the `CATALOG` object:

```ts
"welcome": {
  vars: { firstName: "string" },              // the data this email needs (typed)
  subject: (v, p) => `Welcome to ${p.productName}`,
  preheader: () => "Your account is ready.",  // ⚠ must NOT repeat the subject or restate a code
  audiences: CUSTOMER_ONLY,                    // or ALL_AUDIENCES
  sentBy: "platform",                          // "platform" = we send it; "cognito" = see below
  category: "transactional",
  onSendFailure: "swallow",                    // "throw" (a lockout if unsent) or "swallow" (log + continue)
},
```

**2. The HTML** — `src/templates/welcome.mjml`. Copy an existing one (e.g. `account-password-changed.mjml`)
and change the content. Use only the shared blocks (see [Building blocks](#building-blocks)):

```xml
<mjml lang="en" dir="ltr">
  <mj-head>
    <mj-include path="../generated/theme.mjml" />
    <mj-title>Welcome to {{effyProductName}}</mj-title>
    <mj-preview>Your account is ready.</mj-preview>
  </mj-head>
  <mj-body width="600px" background-color="#f5f5f5" css-class="e-bg-page">
    <mj-include path="../components/header.mjml" />
    <mj-section padding="0 32px 32px 32px">
      <mj-column>
        <mj-text mj-class="h1" css-class="e-ink e-h1">Welcome, {{firstName}}</mj-text>
        <mj-text mj-class="muted" css-class="e-muted" padding="12px 0 0 0">
          Your {{effyProductName}} account is ready.
        </mj-text>
      </mj-column>
    </mj-section>
    <mj-include path="../components/footer.mjml" />
  </mj-body>
</mjml>
```

**3. The plain-text version** — `src/text/welcome.txt.hbs`. Hand-written, not stripped from the HTML.
Same variables, no markup:

```hbs
Welcome, {{firstName}}

Your {{effyProductName}} account is ready.

--
{{effyProductName}}{{#if effyPostalAddress}}
{{effyPostalAddress}}{{/if}}
Questions? Reply to this email or write to {{effySupportEmail}}.
```

**4. The example data** — `src/fixtures/welcome.json`, used for preview and the size/render checks:

```json
{ "firstName": "Alex" }
```

Then:

```bash
make email-gen      # compile — creates dist/welcome.html, .txt, updates the bundle + manifest
make email-check    # verify — drift, size, contrast, structure, text part, placeholders
make email-preview  # look at it — dist/preview/welcome.html
```

To actually **send** it from app code:

```ts
import { sendEmail } from "@effy/email-kit/send";

await sendEmail("welcome", { firstName: "Alex" }, { to: user.email, audience: "customer" });
//                  ^ id       ^ vars (typed)          ^ recipient + which audience
```

If you get the id wrong, the variables wrong, or the audience wrong, **it won't compile.** That's the
point.

---

### ✏️ Modify an existing email

Edit the `.mjml` (design/content), the `.txt.hbs` (plain-text), and/or the catalogue entry
(subject, variables). Then:

```bash
make email-gen && make email-check
```

⚠ **`make email-check` will fail if you forget `make email-gen`** — the committed `dist/` would be
stale. That's the drift guard; it names the template that's out of date. Just run `email-gen` and
commit the result alongside your source change.

**Changing what data an email uses?** Edit `vars` in the catalogue entry. TypeScript then forces every
call site to match — you'll see the compile errors telling you exactly what to fix.

---

### 🗑️ Remove an email

Delete its four files and the catalogue entry:

```bash
rm src/templates/<id>.mjml src/text/<id>.txt.hbs src/fixtures/<id>.json
# remove the "<id>": { … } block from src/catalog.ts
make email-gen && make email-check
```

⚠ If any app code still calls `sendEmail("<id>", …)`, it **won't compile** — the closed `TemplateId`
union no longer includes it. Fix or remove those call sites first. (Again: the point.)

⚠ **Never rename an id in place.** Ids are written into delivery-tracking records; renaming orphans the
history. A message that changes meaning gets a *new* id.

---

## Building blocks

A template composes these and **authors no layout of its own.** Two kinds:

**Includes** (structure) — `<mj-include path="../components/X.mjml" />`:

| Block | What it is |
|---|---|
| `header.mjml` | The Effy wordmark (live text, never an image) |
| `footer.mjml` | The one footer — sender, address, support contact. Same on every email. |
| `divider.mjml` | A hairline rule |
| `line-items.mjml` | A receipt's item table (`{{#each items}}`) — see `order-confirmation` |
| `rows.mjml` | A totals block (subtotal / delivery / total) |

**Text recipes** (`mj-class`) — pick one, never write a size or colour:

| `mj-class="…"` | Use for |
|---|---|
| `wordmark` | The brand mark |
| `h1` | The one heading (also add `css-class="e-ink e-h1"`) |
| `body` | Normal paragraph text |
| `muted` | Secondary text (also add `css-class="e-muted"`) |
| `small` | Fine print |
| `code` | A large one-time code |

> **Why `mj-class` instead of writing styles?** The sizes and colours live in one generated file
> (`src/generated/theme.mjml`), built from the design tokens. That's how every email stays consistent
> and updates when the palette does. Writing your own would break both.

---

## Design rules

These are enforced by `make email-check`, which **fails and names the template**. You don't have to
memorise them — the check will tell you. The important ones:

- **No colours or font sizes in templates.** Use `mj-class` recipes. The palette is generated from
  `design-system/tokens.css`.
- **Every email has a plain-text version** (`.txt.hbs`), hand-written, no markup.
- **Size budgets.** Gmail clips at ~102 KB. Messages sent by Cognito (see below) have a *much* tighter
  ~20,000-character limit — the check enforces the right one per message.
- **Preheader must not repeat the subject** or restate a code/amount.
- **No unsubscribe link on transactional mail** — the type system makes it impossible anyway.
- **Interpolated values are auto-escaped**, so a product name containing `<script>` renders as text,
  not markup. (Don't use Handlebars' triple-brace `{{{ }}}`, which would disable that.)

Dark mode, the Word-engine (Outlook) fallbacks, and colour contrast are all handled by the generated
theme and checked automatically — you don't author any of it.

---

## ⚠ The two message kinds: `platform` vs `cognito`

Every catalogue entry declares `sentBy`. It matters:

- **`sentBy: "platform"`** — the platform sends it (via `sendEmail(...)`). Normal. Full attribution,
  the Gmail size budget. Examples: `auth-sign-in-code`, `account-password-changed`, `order-confirmation`.

- **`sentBy: "cognito"`** — **AWS Cognito sends it**, not us. These are sign-up confirmation, password
  reset, email verification, and MFA. We only supply the *design*; Cognito substitutes the code and
  sends. Consequences you must respect:
  - The template emits the literal `{####}` where the code goes — **Cognito fills it in, we never see
    the real code.** Declare **no `code` variable.**
  - The ~20,000-character size limit applies (five times tighter than Gmail's).
  - These get no delivery attribution (Cognito owns the send).
  - You do **not** call `sendEmail` for these — the `custom-message` Lambda trigger renders them
    automatically. (See `apis/edge-api/auth/src/functions/custom-message.ts`.)

If you're adding an ordinary email the platform sends itself, you want `"platform"`.

---

## Commands

| Command | What it does |
|---|---|
| `make email-gen` | Compile every `.mjml` → committed `dist/` artifacts. Run after any source change. |
| `make email-check` | Verify: drift, size, contrast, structure, text part, placeholders. Fails and names the template. |
| `make email-preview` | Render every template against its fixture → `dist/preview/index.html`. No cloud, no send. |

`make email-check` also runs automatically as part of `pnpm test`.

---

## Where things live

```
packages/email-kit/
├── src/
│   ├── catalog.ts              ← THE catalogue. Add/remove/modify a message's definition here.
│   ├── templates/<id>.mjml     ← the HTML source you author
│   ├── text/<id>.txt.hbs       ← the plain-text version you author
│   ├── fixtures/<id>.json      ← example data for preview + checks
│   ├── components/*.mjml        ← the shared building blocks (includes)
│   ├── generated/              ← ⚠ GENERATED from tokens — never hand-edit
│   ├── render.ts               ← (id, vars) → { subject, html, text }. Pure.
│   ├── send.ts                 ← the SES sender (`@effy/email-kit/send`)
│   └── config.ts               ← reads MAIL_* env from SSM
├── dist/                       ← ⚠ COMMITTED, drift-guarded. Regenerate with make email-gen.
└── scripts/                    ← gen-email / check-email / preview
```

The full design rationale, the client-compatibility research, and the operator deploy runbook are in
[`specs/038-email-template-system/`](../../specs/038-email-template-system/).
