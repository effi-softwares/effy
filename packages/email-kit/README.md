# `@effy/email-kit`

Every email the platform sends is defined, designed and rendered here.

- **`src/catalog.ts`** lists every email: its id, variables, subject, preview line, audiences, who
  sends it and what happens when sending fails. An id or variable that isn't in the catalogue does
  not compile.
- **Templates** are written in [MJML](https://mjml.io) (the HTML part) and Handlebars (the plain-text
  part). A generator compiles them into email-safe HTML, with colours taken from
  `packages/design-system/src/tokens.css`.
- At send time the compiled template is filled with the values and sent through Amazon SES.

> To see every email, run `make email-preview` and open `packages/email-kit/dist/preview/index.html`.

## How it fits together

```
design-system/tokens.css ─┐
src/templates/*.mjml ─────┼─ make email-gen ─→ dist/<id>.html, dist/<id>.txt   (committed, reviewed)
src/text/*.txt.hbs ───────┘                     dist/templates.generated.ts      (what services bundle)
                                                dist/manifest.json               (sizes)

sendEmail("id", vars, { to, audience }) ─→ checks vars ─→ fills the template ─→ SES
```

## Add a new email

Example: an `order-ready` email telling the customer their order is packed.

### 1. Declare it in the catalogue

Add an entry to `CATALOG` in `src/catalog.ts`:

```ts
"order-ready": {
  vars: { orderNumber: "string", orderUrl: "string" },
  subject: (v, p) => `Your ${p.productName} order ${v.orderNumber} is ready`,
  preheader: () => "It's packed and waiting for its delivery round.",
  audiences: CUSTOMER_ONLY,
  sentBy: "platform",
  onSendFailure: "swallow",
},
```

| Field | Meaning |
|---|---|
| id (`"order-ready"`) | Lowercase words joined by `-`. Permanent once sent - delivery records keep it. A message that changes meaning gets a new id. |
| `vars` | The values the email needs: `"string"`, `"number"`, `"boolean"`, or a list of rows `{ of: { name: "string", … } }`. Format money and dates before passing them. |
| `subject`, `preheader` | Built from the vars and the audience (`p.productName`). The preheader is the inbox preview line; it must not repeat the subject. |
| `audiences` | Who may receive it: `CUSTOMER_ONLY` or `ALL_AUDIENCES`. |
| `sentBy` | `"platform"` (we send it) or `"cognito"` (Cognito sends it; see below). |
| `onSendFailure` | `"throw"` when an unsent email must stop the request (a sign-in code); `"swallow"` when the change already happened and the failure is only logged. |

### 2. Write the HTML part - `src/templates/order-ready.mjml`

Copy a similar template (e.g. `order-delivered.mjml`) and change the content:

```xml
<mjml lang="en" dir="ltr">
  <mj-head>
    <mj-include path="../generated/theme.mjml" />
    <mj-title>Your {{effyProductName}} order {{orderNumber}} is ready</mj-title>
    <mj-preview>It's packed and waiting for its delivery round.</mj-preview>
  </mj-head>

  <mj-body width="600px">
    <mj-include path="../components/header.mjml" />

    <mj-section padding="0 32px 32px 32px">
      <mj-column>
        <mj-text mj-class="h1" css-class="e-ink e-h1">Your order is ready</mj-text>
        <mj-text mj-class="muted" css-class="e-muted" padding="12px 0 24px 0">
          Order {{orderNumber}} is packed and waiting for its delivery round.
        </mj-text>
        <mj-button href="{{orderUrl}}" css-class="e-btn-bg e-btn-fg">View your order</mj-button>
      </mj-column>
    </mj-section>

    <mj-include path="../components/footer.mjml" />
  </mj-body>
</mjml>
```

- Keep `<mj-title>` and `<mj-preview>` the same as `subject` and `preheader` in the catalogue.
- Exactly one heading: `mj-class="h1"` with `css-class="e-ink e-h1"`.
- Style text only with the recipes below - never write a colour, font or font size.
- Every value is HTML-escaped. Never use `{{{ }}}`.
- No HTML comments.

### 3. Write the plain-text part - `src/text/order-ready.txt.hbs`

Hand-written, no markup, at least 80 characters. Values are not escaped here, so links work:

```
Your order is ready

Order {{orderNumber}} is packed and waiting for its delivery round.

View your order: {{orderUrl}}

--
{{effyProductName}}{{#if effyPostalAddress}}
{{effyPostalAddress}}{{/if}}
Questions? Reply to this email or write to {{effySupportEmail}}.
```

### 4. Add example data - `src/fixtures/order-ready.json`

Used by the preview and the tests, never by a real send:

```json
{ "orderNumber": "EFY-10234", "orderUrl": "https://dev.effyshopping.com/orders/abc" }
```

### 5. Generate, check and look

From the repo root:

```bash
make email-gen       # compile into dist/
make email-check     # fails and names the problem if a rule is broken
make email-preview   # open packages/email-kit/dist/preview/index.html
```

Commit the source files **and** the regenerated `dist/` files together.

### 6. Add a test - `test/order-ready.test.ts`

Copy `test/order-delivered.test.ts`: render the fixture, check the values appear in both parts and
that nothing the email must never say is there. Run `pnpm --filter @effy/email-kit test`.

### 7. Send it

Directly, from the service that owns the change:

```ts
import { sendEmail } from "@effy/email-kit/send";

await sendEmail("order-ready", { orderNumber, orderUrl }, { to: customer.email, audience: "customer" }, logger);
```

The service needs the `MAIL_*` settings in its `serverless.yml` (its config-contract test checks
them). For an email that follows an order event, queue a `notification_request` row with
`channel = 'email'` in the same transaction as the change (see
`apis/edge-api/shared/src/delivery/consignment.ts`), then add the type to `EMAIL_TEMPLATES` and a
branch in `apis/edge-api/notifications/src/worker/email-sender.ts`.

Every service that sends email bundles the compiled templates, so redeploy it to ship the change.

## Change or remove an email

- **Change:** edit the `.mjml`, the `.txt.hbs` or the catalogue entry, then
  `make email-gen && make email-check`. Changing `vars` makes every call site that no longer matches
  fail to compile.
- **Remove:** delete `src/templates/<id>.mjml`, `src/text/<id>.txt.hbs`, `src/fixtures/<id>.json`,
  its test and its catalogue entry, then `make email-gen`. Any remaining `sendEmail("<id>", …)` stops
  compiling.

## What `make email-gen` writes

| File | Use |
|---|---|
| `src/generated/theme.mjml` | Colours, text recipes, dark-mode rules and Outlook fixes, built from the tokens. Every template includes it. |
| `dist/<id>.html` | The compiled HTML part, placeholders intact. Reviewed in diffs and checked by `email-check`. |
| `dist/<id>.txt` | A copy of the text part. |
| `dist/templates.generated.ts` | Every compiled email as strings. This is what the services import and bundle. |
| `dist/manifest.json` | The size of each email, used by the preview. |

`make email-preview` writes `dist/preview/` (git-ignored): each email filled with its fixture.

All generated files are committed. `email-check` regenerates them and fails if anything changes, so a
forgotten `email-gen` is caught by the tests.

## Building blocks

**Components** - `<mj-include path="../components/<name>.mjml" />`:

| Component | What it is |
|---|---|
| `header.mjml` | The product name as the wordmark |
| `footer.mjml` | Product name, postal address and support contact |
| `divider.mjml` | A hairline rule |
| `line-items.mjml` | A receipt's item rows (`items`) |
| `rows.mjml` | A receipt's totals |

**Text recipes** - `mj-class="…"`:

| Recipe | Use for | Also add |
|---|---|---|
| `h1` | The one heading | `css-class="e-ink e-h1"` |
| `body` | Normal text | `css-class="e-ink"` |
| `muted` | Secondary text | `css-class="e-muted"` |
| `small` | Fine print | `css-class="e-muted"` |
| `code` | A one-time code | `css-class="e-ink e-bg-code"` |
| `wordmark` | The header's product name | - |

The `css-class` values are what dark mode recolours, so keep them. Buttons take
`css-class="e-btn-bg e-btn-fg"`.

Raw HTML inside `mj-table` (as in `line-items.mjml`) cannot use a recipe: write its colour as a role,
e.g. `color:%ink%` or `color:%mutedInk%`, and the generator fills in the token.

**Values every template gets** (set by the platform, never by the caller): `{{effyProductName}}`,
`{{effySupportEmail}}` (the reply address for the audience) and `{{effyPostalAddress}}` (may be empty).

## Rules `email-check` enforces

- Generated files match the sources (no drift).
- Templates and components have no colour, font, `{{{ }}}` or HTML comment of their own.
- The HTML has the doctype, `lang`/`dir`, the colour-scheme and Outlook tags, exactly one `<h1>` and
  only layout tables; no flex/grid, floats, positioning, CSS variables, SVG, web fonts or external
  stylesheets.
- The HTML stays under Gmail's ~102 KB clip.
- The text part has at least 80 characters and no markup or HTML entities.
- Every template has a valid fixture.
- The colours pass WCAG AA in light, dark and force-inverted light.

`pnpm --filter @effy/email-kit test` runs the unit tests and then `email-check`. The tests also check
that every placeholder is declared and every declared variable is used, the size budgets, and that no
email offers an unsubscribe.

## Cognito-sent emails

`auth-sign-up-code`, `auth-password-reset-code`, `auth-email-verification-code` and
`auth-step-up-code` have `sentBy: "cognito"`. Cognito sends them; the auth service's `custom-message`
trigger only renders them (`apis/edge-api/auth/src/functions/custom-message.ts`).

- Write `{####}` where the code goes; Cognito fills it in. Declare no `code` variable.
- Keep the HTML under ~20,000 characters (Cognito's limit).
- Never pass them to `sendEmail` - it refuses.

## Where things live

```
packages/email-kit/
├── src/
│   ├── catalog.ts            the catalogue and variable validation
│   ├── audience.ts           audiences, reply address, platform values
│   ├── config.ts             MAIL_* settings
│   ├── render.ts             fills a compiled template (no AWS, no I/O)
│   ├── send.ts               sends through SES (`@effy/email-kit/send`)
│   ├── templates/<id>.mjml   HTML parts
│   ├── text/<id>.txt.hbs     plain-text parts
│   ├── fixtures/<id>.json    example data
│   ├── components/*.mjml     shared blocks
│   └── generated/theme.mjml  generated - do not edit
├── dist/                     generated - do not edit, but commit
├── scripts/                  gen-email, check-email, preview
└── test/
```
