I have what I need. Here's the report.

---

# In-House Transactional Email Template Systems: Industry Practice Report

**Prepared for:** Effy — AWS-native, no third-party ESP, TypeScript Lambdas + Go/Gin, Postgres, pnpm/Turborepo monorepo
**Date:** 2026-08-06

---

## 0. Executive summary of findings

Four findings dominate everything else, and they should drive the spec:

1. **SES managed templates are a rendering bridge, not a template system.** They have real quotas (20,000/region, 500 KB each) but the killer is operational: `CreateEmailTemplate`/`UpdateEmailTemplate` are throttled at **1 request per second**, there is **no versioning, no rollback, no diff, no audit, and no preview beyond a 1-TPS `TestRenderEmailTemplate`**. An entire third-party tooling market (Semplates, Sesquatch, Sovy, AWS SES Template Editor) exists *solely* to paper over these gaps — that market is the evidence.
2. **The dominant production pattern is: author in MJML → compile to HTML **at build time** → commit the artifact → substitute variables at runtime.** MJML preserves `{{handlebars}}` tags through compilation, which is what makes this work. Artsy, thoughtbot, and Fanatics Commerce all land here.
3. **Only one language should own rendering.** MJML is a Node library; the Go ports are WASM wrappers that are explicitly slower. The clean fix is architectural, not linguistic: the Go service publishes an event, a Node worker renders and sends. Fanatics Commerce did exactly this — they own the full delivery path with "rendered email HTML stored in-house."
4. **One-click unsubscribe is required for marketing/subscribed mail and is actively harmful on transactional mail.** Adding `List-Unsubscribe` to a sign-in OTP gives a user a button that locks them out of their own account. Sources are muddy here; the AWS blog notably does *not* draw the distinction. Draw it yourself.

---

## 1. Where templates live

### 1.1 SES managed templates — the hard numbers

From [SES service quotas](https://docs.aws.amazon.com/ses/latest/dg/quotas.html) and [Using templates to send personalized email](https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-api.html):

| Quota | Value | Adjustable |
|---|---|---|
| Email templates per AWS Region | **20,000** | No |
| Max template size (Text + HTML combined) | **500 KB** | No |
| Replacement variables per template | Unlimited | N/A |
| Destinations per `SendBulkEmail` call | **50** | No |
| Inline template JSON payload | **1 MB** | No |
| Inline templates counting against the 20,000 | **They don't** | — |
| Message size, SES **v2** API / SMTP | **40 MB** (after base64) | No |
| Message size, SES **v1** API | **10 MB** | No |
| Configuration sets | **10,000** | No |
| Event destinations per configuration set | **10** | No |
| Max headers on `SendEmail` Simple content | **15** ([Message](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_Message.html)) | No |
| MIME parts | **500** | No |

**The quota nobody quotes, and the one that matters most:**

> "All actions (**except for `SendEmail`, `SendRawEmail`, and `SendTemplatedEmail`**) are throttled at **one request per second**."
> — [SES API sending quotas](https://docs.aws.amazon.com/ses/latest/dg/quotas.html)

`CreateEmailTemplate`, `UpdateEmailTemplate`, `DeleteEmailTemplate`, and `TestRenderEmailTemplate` are all in the throttled set. At "hundreds of templates," a full sync is a **multi-minute serial loop** in every environment on every deploy, with no transactionality — a failure halfway leaves prod in a mixed state with no rollback primitive. This is the single strongest argument against SES managed templates as your source of truth.

**Template syntax capability** ([Advanced email personalization](https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-advanced.html)) — it's a real Handlebars engine, better than most people assume:

- Nested paths: `{{contact.firstName}}`, arbitrarily deep
- `{{#each subscription}}…{{/each}}`
- `{{#if subscription}}…{{else}}…{{/if}}`
- Inline partials: `{{#* inline "fullName"}}…{{/inline}}` then `{{> fullName}}`

**But the limits are sharp:**
- **No custom helpers.** You cannot register a helper, so **currency and date formatting must be pre-formatted by the caller** and passed in as strings. For a grocery platform this is significant — every price, every delivery window, every order total becomes the sender's job.
- **Inline partials do not cross parts.** "Inline partials are not transferred between parts of the email… you must define it in both the `HtmlPart` and the `TextPart`." Every shared fragment is authored twice.
- **⚠ No HTML escaping.** "SES doesn't escape HTML content when rendering the HTML template for a message. This means if you're including user inputted data, such as from a contact form, you will need to escape it on the client side." That is an **HTML-injection primitive** in your email pipeline. On a platform where product names, shop names, and customer names are user-influenced, this is a security requirement, not a footnote.
- The template JSON **cannot contain literal line breaks** in `HtmlPart`/`TextPart` — everything must be single-line-escaped, which makes git diffs on stored templates unreadable.
- **No versioning, no rollback, no audit trail, no environment promotion.** There is no `GetEmailTemplateVersion`. An `UpdateEmailTemplate` is destructive.
- Preview is `TestRenderEmailTemplate` — returns the **complete rendered MIME message** as a string, rate-limited to **1/sec**, and requires the template already be uploaded to a real AWS account.

Terraform's [`aws_ses_template`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ses_template) exists (name ≤64 chars, HTML <500 KB) but inherits every one of these problems and adds Terraform state to the blast radius of a copy change.

### 1.2 The four storage options, ranked as the industry actually uses them

| Where | Who does it | Real tradeoff |
|---|---|---|
| **Code-as-templates in git** (compiled artifact committed) | Artsy, thoughtbot, Fanatics, GOV.UK Notify's engine | Review, diff, rollback, atomic deploy, typed. Cost: copy changes need a deploy. **This is the mainstream answer.** |
| **SES managed templates** | Small teams; anyone needing cross-language send | Free storage, cross-language rendering bridge, `SendBulkEmail`. Cost: 1 TPS sync, no versioning, no escaping, no helpers. |
| **DB-stored templates** | CMS-ish products, GOV.UK Notify (deliberately — non-engineers author) | Non-engineers can edit; runtime lookup. Cost: templates escape code review; a bad edit is a prod incident with no PR; "template not found" becomes a runtime error class. |
| **S3-stored** | Rare as a primary store | Decouples deploy from template; versioning via S3 object versions. Cost: a network fetch (and its failure mode) on the send path; still no type safety. |

The **Fanatics Commerce** case study is the most directly comparable production system and the strongest citation for your spec — [How Fanatics Commerce built a scalable email platform on Amazon SES](https://aws.amazon.com/blogs/messaging-and-targeting/how-fanatics-commerce-built-a-scalable-email-platform-on-amazon-ses/). They **do not use SES managed templates**. They own "the full delivery path, from provider through messaging queue, internal processing, and status store, with **rendered email HTML stored in-house**" — explicitly to strengthen support and debugging. They scaled sending **48× in five months** through Black Friday/Cyber Monday on this design, with per-stream tenants, independent configuration sets, dedicated IPs, and per-stream subdomains.

**GOV.UK Notify** is the honest counter-example — a large public in-house platform that *does* store templates in a database, because its users are non-engineers in government departments. Note what it gave up to make that safe: templates are **Markdown, not HTML**, with a deliberately restricted subset — [no bold, italics, underline, typefaces or fonts](https://www.notifications.service.gov.uk/using-notify/formatting) — and personalisation is `((name))` placeholders only. **DB-stored templates are only safe when the authoring language is too weak to break anything.** If you want non-engineers editing HTML, you have chosen the anti-pattern in §9.

---

## 2. Authoring format

### 2.1 The options

| Format | Runs where | Verdict for Effy |
|---|---|---|
| **MJML** | Node (build time) | **Best fit.** Compiles to table-based, Outlook-safe HTML. Handles responsive automatically. ~1M weekly npm downloads. Battle-tested. |
| **Maizzle** | Node (build time) | Tailwind-for-email. Excellent if you want your design tokens to flow into email. Build-time only, static output. |
| **React Email** | Node (build/runtime) | Best DX for React teams; ~500K weekly downloads. **Carries a real Lambda bundle risk (below).** |
| **Raw HTML tables** | Anywhere | Zero deps, total control, no build. Cost: every developer must know 1999 Outlook quirks forever. |
| **Handlebars / Go `html/template`** | Both | These are *substitution engines*, not layout systems. You need one **in addition to** a layout format. |

### 2.2 The concrete gotchas

**React Email's bundle problem is documented and severe.** [resend/react-email#3556](https://github.com/resend/react-email/issues/3556): after migrating to the unified `react-email` v6.5.0 package, serverless function bundles grew **~80 MB per function**, causing silent deploy hangs on Vercel. Cause: top-level side-effecting imports of `prismjs`, `marked`, and the full **Tailwind v4 engine**, with no `"sideEffects": false`. "Any function that imports a single email component (e.g. `import { Text }`) ends up pulling prismjs, marked, and the full tailwindcss v4 engine into its bundle." PR #3643 addressed it. **Mitigation if you go this route: import `@react-email/render` directly, never the unified `react-email` package.** For a Cognito custom-challenge Lambda on the sign-in critical path, an 80 MB bundle is a cold-start outage.

**MJML is Node-only, and the Go story is a compromise.** Per [Boostport/mjml-go](https://github.com/Boostport/mjml-go), the library is bundled with webpack and compiled to **WebAssembly via Javy**, run under Wazero. The maintainers state plainly that "the Node.js implementation is significantly faster than mjml-go." The other common pattern is [wrapping MJML in an Express HTTP server](https://github.com/danihodovic/mjml-server) — i.e. a network hop. **Neither is acceptable on a hot path.** This is decisive: MJML must run at **build time**, not in any request.

**CSS inlining is already solved inside MJML.** `<mj-style inline="inline">` runs [juice](https://github.com/Automattic/juice) internally; `<mj-include css-inline="inline">` handles external files. You do **not** need a separate juice/premailer stage. (See [mjmlio/mjml#1735](https://github.com/mjmlio/mjml/issues/1735).)

**The thoughtbot pattern is the key technique** — [Building Templated Emails with MJML](https://thoughtbot.com/blog/building-templated-emails-with-mjml). You author `{{firstName}}` directly inside the `.mjml` source. An MJML *preprocessor* (configured in `.mjmlconfig.js`) runs Handlebars over the MJML with **sample data** for local preview, and is **disabled for the production build** — so the compiled HTML ships with the `{{ }}` tags intact for runtime substitution. This eliminates the "re-add template tags after every design change" tax. Maizzle solves the same problem with `@{{ }}` escape syntax or [custom delimiters](https://maizzle.com/docs/expressions), so `{{ }}` passes through uncompiled.

**Artsy's reported pain points** ([How hard could it be to create an email?](https://artsy.github.io/blog/2018/11/19/mjml/)) are worth writing into the spec as known-accepted costs: MJML output HTML "is going to be large"; background images are "pretty poorly supported"; many mobile clients ignore media queries; and **minifying MJML output with a web-oriented minifier breaks email clients** — they use the Kangax minifier specifically. They now use MJML for all B2C, some B2B, and all new transactional email.

**Size matters because of Gmail.** Gmail clips messages at **102 KB of HTML source** ([hteumeuleu/email-bugs#41](https://github.com/hteumeuleu/email-bugs/issues/41), [Litmus](https://www.litmus.com/blog/how-to-keep-gmail-from-clipping-your-emails)), hiding everything past the cut behind "[Message clipped] View entire message". MJML output is verbose; a receipt with 30 line items can realistically approach this. **Put a size assertion in CI** — this is a cheap, high-value test that almost nobody writes.

### 2.3 Does the format work for both Node and Go?

No — and don't try. The three options:

1. **Go doesn't render.** It publishes a domain event (`{templateId, to, vars}`) to your existing SNS topic; a Node worker renders and sends. **Matches Effy's already-documented event backbone.** Recommended.
2. **SES stored templates as the bridge.** Compiled artifacts are uploaded to SES; Go calls `SendEmail` with `Content.Template.TemplateName` and never sees HTML. This is the **one genuinely good use** of SES managed templates: cross-language rendering. Costs you §1.1's whole list.
3. **Two renderers** (Handlebars in Node, `html/template` in Go) over one HTML artifact. Technically possible — the syntaxes differ (`{{.Name}}` vs `{{name}}`), so you'd need one dialect and a shim. **Reject this.** Effy has already been burned four times by two implementations of one contract drifting (027 R13, 029, 033, 035's `serverless.yml` env-var defect). Two email renderers is that failure mode with a customer-visible blast radius.

---

## 3. The registry / catalog pattern

There is **no industry-standard library** for this — I searched hard and found none. Every team rolls it, and the shape converges. What production teams do:

**The catalog is a single typed module, keyed by a string-literal union.**

```ts
// packages/email-templates/src/catalog.ts
export const EMAIL_TEMPLATES = {
  'auth.sign_in_code':      { version: 3, audience: 'all',      schema: SignInCodeVars },
  'order.confirmation':     { version: 7, audience: 'customer', schema: OrderConfirmVars },
  'fulfillment.ready':      { version: 2, audience: 'shop',     schema: ReadyVars },
} as const satisfies Record<string, TemplateDef>;

export type TemplateId = keyof typeof EMAIL_TEMPLATES;
export type VarsFor<T extends TemplateId> = z.infer<typeof EMAIL_TEMPLATES[T]['schema']>;

export function send<T extends TemplateId>(id: T, to: string, vars: VarsFor<T>): Promise<SendResult>;
```

The generic `send<T>` is the whole point: **the call site cannot compile with the wrong variables**, and "template not found" stops being a runtime error class because `TemplateId` is closed.

**The properties to specify:**

- **Runtime validation at the boundary too.** The Go publisher and any SQS message are untyped at the wire. Validate the payload against the same schema (Zod → JSON Schema) in the worker, and **fail loudly with the template id in the log** — SES's own answer to this is "configure Rendering Failure event notifications through SNS," which is an admission that silent render failure is the default.
- **A build-time completeness test.** Assert that every `TemplateId` has (a) a compiled HTML artifact, (b) a text artifact, (c) a subject, (d) fixture data that validates against its schema. This is exactly the shape of Effy's existing `tokens:check` and `brand-check` drift guards, and it's the guard that makes "hundreds of templates" survivable.
- **Codegen for Go.** Effy already generates Kotlin from `@effy/shared-types`. Generate Go template-id constants and payload structs from the same SSOT. A Go publisher that names a template that doesn't exist should then be a **compile error**, not a dead-letter queue entry.
- **Versioning and rollback come from git, not from the store.** The artifact is committed; rollback is a revert and a deploy. If you also mirror to SES stored templates, name them `effy-<env>-<id>-v<n>` so a rollback is a *different name*, not a destructive `UpdateEmailTemplate` — this recovers the rollback primitive SES doesn't give you, at the cost of template-count growth (you have 20,000 to burn; you will not run out).

**Reality check on "hundreds of templates."** In practice the count of distinct *messages* in a mature grocery/commerce platform is 40–90. The "hundreds" figure comes from multiplying by locales and audiences. That should change the design: **build for ~60 templates × N locales × 4 audience themes via composition** (one shared layout, per-audience theming, per-locale string bundles) — **not** 500 independently authored files. Designing for 500 hand-authored files is how you get 500 subtly divergent footers.

---

## 4. Rendering pipeline

### 4.1 Build-time vs runtime compilation

**Compile MJML at build time. Commit the artifact.** Non-negotiable given §2.2. Concretely:

```
packages/email-templates/
  src/
    layouts/base.mjml          # one layout
    templates/order.confirmation.mjml
    text/order.confirmation.txt.hbs   # hand-authored text part
    fixtures/order.confirmation.json
  dist/                        # COMMITTED, drift-guarded
    order.confirmation.html    # MJML-compiled, {{vars}} intact
    order.confirmation.txt
    manifest.json              # id → {html, txt, subject, sha256}
```

`make email-gen` / `make email-check` — the identical pattern to Effy's `tokens:gen`/`tokens:check` and `brand-gen`/`brand-check`. The check must **fail and name the stale template**. Effy's 024 slice proved this pattern works and proved it by deliberately breaking it three ways; reuse it rather than inventing a fourth convention.

**Runtime cost of this design:** Handlebars alone (~80 KB) in the Lambda bundle. MJML (100 MB+ of transitive deps), Tailwind, and the whole build toolchain stay out. That is the difference between a warm OTP Lambda and a sign-in outage.

### 4.2 The plain-text part

**Generate it? No — author it, or generate it with a guard.** HTML-only mail trips SpamAssassin's `MIME_HTML_ONLY` rule at **+0.7**. The `multipart/alternative` ordering is fixed: **text part first (least preferred), HTML last (most preferred)**.

Naive `html-to-text` over MJML output produces garbage, because MJML output is nested layout tables — you get the shell, not the content. Two workable approaches:

1. **Author the text part by hand** as a sibling `.txt.hbs` (my recommendation — a receipt's text version is a genuinely different document, not a stripped one), or
2. Generate from a **semantic intermediate** (the data + a text layout), never from the compiled HTML.

Either way: a CI test that the text part is non-empty, contains every `{{var}}` the HTML uses that carries meaning, and is not merely "View this email in your browser."

### 4.3 SES send API — Simple vs Raw

**Use SES v2 `SendEmail` with `Content.Simple`. You do not need `SendRawEmail`.**

Since **March 8, 2024**, SES v2 structured sending APIs support custom headers ([announcement](https://aws.amazon.com/about-aws/whats-new/2024/03/amazon-ses-headers-sending-email)): "Customers can now set headers… without the need to create fully MIME-compliant message content." Previously this required SMTP or raw sending, "which was complex and required detailed knowledge of internet mail format."

```json
{
  "FromEmailAddress": "Effy <no-reply@dev.effyshopping.com>",
  "Destination": { "ToAddresses": ["..."] },
  "Content": { "Simple": {
      "Subject": { "Data": "Your Effy order EFY-HVX2AE", "Charset": "UTF-8" },
      "Body": {
        "Html": { "Data": "<...>", "Charset": "UTF-8" },
        "Text": { "Data": "...",   "Charset": "UTF-8" }
      },
      "Headers": [ { "Name": "X-Effy-Template-Id", "Value": "order.confirmation" } ]
  }},
  "ConfigurationSetName": "effy-dev-transactional"
}
```

SES assembles the `multipart/alternative` MIME for you when both `Html` and `Text` are present. Constraints ([Message](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_Message.html), [header fields](https://docs.aws.amazon.com/ses/latest/dg/header-fields.html)):

- **Max 15 headers.** Header name ≤126 printable-ASCII chars (no colon); value ≤870 chars.
- **Disallowed as custom headers** on Simple/Templated `SendEmail` and on `SendBulkEmail`: `BCC`, `CC`, `Content-Disposition`, `Content-Type`, `Date`, `From`, `Message-ID`, `MIME-Version`, `Reply-To`, `Return-Path`, `Subject`, `To`.
- SES **overrides** any `Date` you supply, and **overrides** any `Message-ID` you supply.
- Subject must be 7-bit ASCII unless RFC 2047 encoded-word syntax is used — **relevant the moment you localize**.

A custom `X-Effy-Template-Id` header is cheap and worth specifying: it lands in the SES event payload, so your existing `public.email_delivery_event` table (built in 037) can answer "which template is bouncing?" without a join through application state.

---

## 5. Operations

### 5.1 Preview / dev harness

Three layers, all cheap:

1. **A static preview build.** `pnpm email:preview` renders every template against its committed fixture into `dist/preview/*.html` plus an index page. Zero infra. Works in CI as a build artifact. This is the single highest-value thing you can build in an afternoon.
2. **Watch mode** for authoring — MJML CLI `--watch`, or React Email's dev server if you go that way.
3. **[Mailpit](https://github.com/axllent/mailpit)** for full-loop local testing. Single Go binary, zero deps, SMTP server + web UI + JSON API, **actively maintained**. **MailHog is unmaintained (~4 years)** — do not specify it. Mailpit also does HTML-check and link-check. Given Effy already runs local Docker for `core-api`, adding Mailpit to the compose file is nearly free.

### 5.2 Testing

Layer them, in cost order:

| Layer | Tool | Catches |
|---|---|---|
| Type check | `tsc` | wrong/missing variables at every call site |
| Schema/fixture | Vitest + Zod | fixture drift from schema |
| **HTML snapshot** | Vitest `toMatchSnapshot()` | unintended markup change |
| **Size assertion** | custom | Gmail's 102 KB clip |
| **Link/asset assertion** | custom | relative URLs, `localhost` leaking into prod templates, missing `alt` |
| Visual regression | Playwright screenshot + diff | rendering change that snapshot misses |
| Client matrix | see below | Outlook/Gmail-app quirks |

The key distinction, well put in the [visual-regression-for-email](https://email-development-transactional-systems.com/email-testing-qa-workflows/automated-snapshot-testing/visual-regression-testing-emails-with-playwright/) writeup: "Snapshot tests catch HTML changes, while visual regression tests catch rendering changes — the actual pixels. Two different HTML strings can render identically, and identical HTML can render differently in different clients." Common guidance: **snapshot + typecheck catches ~80% for ~30 minutes of setup; add visual regression past ~10 templates.** You will be past 10 immediately.

### 5.3 Client-matrix testing — the honest answer

**There is no good free Litmus/Email on Acid replacement.** I looked. What exists:

- **[caniemail.com](https://www.caniemail.com/)** — free, open-source, the "caniuse for email." A *reference*, not a renderer. Genuinely useful as a lint source: you can assert against its dataset in CI.
- **Playwright screenshots in Chromium + WebKit** — free, catches layout regressions, but **Outlook's Word rendering engine is not reproducible in any browser**, so it cannot catch the class of bug that matters most.
- **[Testi@ (testi.at)](https://testi.at/)** — low-cost paid, screenshots across clients.
- **Mailpit / MailHog** — capture and inspect, not multi-client rendering.

**Recommendation:** rely on MJML to *avoid* client bugs rather than testing for them (that's what you're buying with MJML), spend nothing on a client matrix initially, and keep a real Outlook + Gmail-app + iOS Mail seed list for manual sign-off on the ~10 templates that actually matter (OTP, order confirmation, receipt, delivery). Given Effy's documented pattern of "machine-verified but never walked on a device," **write the seed-list walk into the tasks as an explicit operator task, not an aspiration.**

### 5.4 Staging safeguards — the part teams skip and regret

AWS gives you two purpose-built tools:

**The [mailbox simulator](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html)** — works even in the sandbox:

| Address | Simulates |
|---|---|
| `success@simulator.amazonses.com` | delivery |
| `bounce@simulator.amazonses.com` | SMTP 550 5.1.1 hard bounce, RFC 3464 compliant — **not added to the suppression list** |
| `complaint@simulator.amazonses.com` | spam complaint, RFC 5965 |
| `ooto@simulator.amazonses.com` | auto-responder, RFC 3834 |
| `suppressionlist@simulator.amazonses.com` | hard bounce as if globally suppressed |

Critically: simulator mail **does not count toward your daily quota, bounce rate, complaint rate, or Virtual Deliverability Manager metrics** — but **you are still billed for it**. It supports `+label` addressing (`bounce+order-123@simulator.amazonses.com`), which makes it a genuine end-to-end test for your 037 bounce-handling consumer. **This is how you prove the bounce path works without damaging reputation.**

**The [account-level suppression list](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html)** (`PutAccountSuppressionAttributes`, `PutSuppressedDestination`, `ListSuppressedDestinations`, `DeleteSuppressedDestination`). Notable behaviours worth writing down:

- On by default for accounts created after **2019-11-25**, for both `BOUNCE` and `COMPLAINT`.
- Only **hard** bounces are auto-added.
- **Case-sensitive for API management** — `User@Example.com` is stored as received, and management API calls require exact case match, even though sending treats them as equal. A silent footgun.
- Messages to suppressed addresses **still count toward your daily sending quota**.
- **Gmail does not report complaints to SES** — a Gmail user hitting "Spam" will *never* land on your suppression list. Do not build logic assuming otherwise.
- Configuration sets can override it (`PutConfigurationSetSuppressionOptions`), including "cancel all suppression" — which is exactly how a staging config set gets built wrong.

**Also specify a hard non-prod recipient allowlist in code.** The suppression list and sandbox are not enough. The canonical horror story — a dev triggering 500 welcome emails to the production user database because SMTP credentials weren't swapped — is one env var away in a Serverless Framework deploy. The guard should be: **in any env where `STAGE !== 'prod'`, refuse to send to any address not matching an allowlist regex or `@simulator.amazonses.com`, and fail loudly.** Effy's constitution already says "when the value is unknown, fail loudly"; this is that rule applied to recipients.

---

## 6. Localization, per-audience branding, per-environment identity

### 6.1 i18n

**The consensus pattern: externalize strings, keep one template per message — not one template per (message × locale).**

The most-cited mistake is "embedding translated text directly in HTML templates." The working structure ([Camillo Visini](https://camillovisini.com/coding/python-i18n-localizing-email-templates/)) is locale string files with a `globals` section (reusable strings — footer, greeting, legal) plus per-message keys, with **all logic in the template and only simple interpolation in the string files**. Translators must never see Handlebars conditionals.

**Practical consequences for the spec:**
- The subject line must be RFC 2047 encoded-word encoded once you have non-ASCII locales (SES requires 7-bit ASCII subjects otherwise).
- Currency, dates, and pluralization must be **formatted by the sender** into the vars — this is forced on you anyway by SES's no-custom-helpers rule (§1.1), so it's not extra cost. Use `Intl.NumberFormat`/`Intl.DateTimeFormat` in the worker.
- **RTL locales need a different layout, not a different string file.** Decide early whether they're in scope; MJML handles `dir="rtl"` poorly.
- If you mirror to SES stored templates, locale becomes part of the template *name* (`effy-prod-order.confirmation-en_AU-v7`) and your template count multiplies. Still nowhere near 20,000.

**Effy-specific:** you are single-market (`ap-southeast-2`, `effyshopping.com`, AUD). **Build the seam, ship one locale.** Put `locale` in the send envelope and in the catalog type from day one so it is never a migration; don't build a translation pipeline for a market you don't have.

### 6.2 Per-audience branding

Effy's four audiences (customer / driver / shop / admin) map cleanly onto **one layout, four theme token sets** — the same relationship `@effy/brand`'s three colourways already have to one mark.

Two things to get right:
- **The accent inverts between appearances in Effy's monochrome system, but email has no reliable dark-mode signal.** `prefers-color-scheme` support in email clients is inconsistent and Gmail actively rewrites colours. **Email should commit to the light appearance** and use the fixed-scrim technique 029 already landed for banners: type colour that doesn't depend on which mode won.
- Sender display name and reply-to differ by audience: customer-facing mail replies to `hello@effyshopping.com`; internal driver/shop/admin mail to `workspace-admin@effyshopping.com`. Per CLAUDE.md these are the **only two approved mailboxes** — the catalog should carry `audience` and derive the addresses, so no send site ever gets to invent a third.

### 6.3 Per-environment sender identity

Effy already has this right: each env owns a delegated child zone (`dev.effyshopping.com`) with its own SES identity, DKIM, SPF, DMARC and MAIL FROM. Extend it:

- **Separate the streams by subdomain, now, before volume exists.** AWS's own guidance and the Fanatics case study both say transactional gets "a dedicated subdomain with its own DKIM signing, SPF records, and DMARC policy." Yahoo states it directly: *"Don't send bulk/marketing email from the same IPs you use to send user mail, transactional mail, alerts, etc."* Suggested: `mail.effyshopping.com` (transactional) vs `news.effyshopping.com` (lifecycle/marketing). **Retrofitting this after reputation damage is not possible** — you cannot un-burn a domain.
- **One configuration set per stream** (`effy-<env>-transactional`, `effy-<env>-marketing`) with separate event destinations. You have 10,000 configuration sets; use them. This also gives per-stream suppression and per-stream VDM metrics for free.
- **Dedicated IPs: not yet.** À la carte is **$15/month/account** plus per-email fees, and a dedicated IP at low volume is *worse* than shared — it has no reputation and needs a 2–6 week warm-up. Revisit above roughly 100k/month.

---

## 7. Compliance mechanics

### 7.1 Gmail & Yahoo sender requirements (current)

From [Google's Email sender guidelines](https://support.google.com/a/answer/81126) and [Yahoo's Sender Best Practices](https://senders.yahooinc.com/best-practices/), both enforced since **February 2024** (one-click unsubscribe enforcement from **June 2024**):

**All senders:**
- SPF **or** DKIM
- Valid forward and reverse DNS (PTR)
- **TLS for transmission**
- Spam rate in Postmaster Tools **below 0.3%**
- RFC 5322 compliance; no Gmail `From:` impersonation

**Bulk senders (Google: 5,000+ messages/day to Gmail accounts):**
- SPF **and** DKIM
- **DMARC** with at least `p=none`
- **DMARC alignment** — the SPF or DKIM domain must align with the `From:` domain
- **One-click unsubscribe** for **"marketing messages and subscribed messages"** — plus a clearly visible unsubscribe link in the body
- Yahoo: honour unsubscribes **within 2 days**

**⚠ Sources disagree, and you must decide deliberately:**

| Source | Position |
|---|---|
| [Google](https://support.google.com/a/answer/81126) | Scopes the requirement to "marketing messages and subscribed messages" — silent on transactional |
| [RFC 8058](https://www.rfc-editor.org/rfc/rfc8058.html) | Imposes **no** restriction on message type; discusses broadcast marketing lists but doesn't forbid other use |
| Deliverability vendors (Mailgun, Valimail, Mailpro) | State transactional is **exempt** |
| [AWS's own blog](https://aws.amazon.com/blogs/messaging-and-targeting/using-one-click-unsubscribe-with-amazon-ses/) | **Does not draw the distinction at all** — a meaningful omission given it's the doc an SES team will follow |

**The correct engineering position: do not put `List-Unsubscribe` on transactional mail — and on OTP mail it is a defect.** A user who unsubscribes from `auth.sign_in_code` **cannot sign in**, and on a platform where four audiences have *no other credential*, that is an account lockout with no recovery path. This maps directly onto Effy's existing rule that the platform's mail is the only credential. Make the catalog enforce it: a `category: 'transactional' | 'lifecycle'` field where `lifecycle` **requires** an unsubscribe URL and `transactional` **forbids** the headers. Make the wrong combination unrepresentable in the type — the same technique 028 used for advertised-but-untitled promotions.

**RFC 8058 mechanics** when you do need it:
- `List-Unsubscribe` **MUST contain one HTTPS URI**; MAY additionally contain `mailto:`.
- `List-Unsubscribe-Post: List-Unsubscribe=One-Click` — exact literal, no variation.
- Order matters: AWS specifies `List-Unsubscribe` first, then `List-Unsubscribe-Post`.
- **Both headers must be covered by the DKIM signature's `h=` tag.** Easy to miss; SES handles this for headers it signs, but verify.
- The POST body is `List-Unsubscribe=One-Click`; the endpoint must act **without a confirmation page**.
- Note both headers are on SES's "can't appear more than once" list, and SES's built-in subscription management (`ListManagementOptions`) will **override** them if enabled.

**A neat property of SES v2:** because `Headers` works on Simple content, you can drive this entirely from the catalog with no raw MIME.

### 7.2 CAN-SPAM

Per the [FTC compliance guide](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business) (the page 403s to automated fetch; content confirmed via secondary sources):

- CAN-SPAM distinguishes **commercial** content from **transactional or relationship** content, via a **"primary purpose"** test.
- **Transactional/relationship messages are exempt from the commercial provisions**, including the **physical postal address** and the opt-out mechanism. They must still not contain false or misleading routing/header information.
- **⚠ The exemption is fragile.** If a transactional email carries promotional content sufficient to change its primary purpose, **the whole message becomes commercial** and every requirement attaches. For a grocery platform, "here's your order confirmation — and 20% off next week" is exactly the mixed-purpose case. **Write this into the spec as a rule about what may not be added to transactional templates**, because the pressure to add it will come from outside engineering.
- If you do include an address: a street address, a USPS-registered PO box, or a CMRA-registered private mailbox all qualify.

**GDPR/Australian note:** Australia's Spam Act 2003 is the governing law for Effy and is **stricter than CAN-SPAM on consent** (opt-in, not opt-out), though it likewise exempts purely transactional/factual messages. GDPR doesn't impose a postal-address requirement but does require identifying the controller; transactional mail sits under contract performance, not consent. **Flag: I did not find an authoritative primary source for the Spam Act 2003 treatment in this research — verify before shipping any lifecycle/marketing mail.**

---

## 8. Cost

### 8.1 SES pricing — with a caveat

**⚠ SES pricing changed on 2026-07-21** with the introduction of tiered plans. The [pricing page](https://aws.amazon.com/ses/pricing/) currently shows:

| | 0–10M/mo | 10–100M | >100M |
|---|---|---|---|
| **À la carte** | **$0.10 / 1,000** | — | — |
| Essentials | $0.16 / 1,000 | $0.14 | $0.11 |
| Pro (+$105/acct/region/mo) | $0.22 / 1,000 | $0.17 | $0.12 |
| Enterprise (+$500/mo) | $0.23 / 1,000 | $0.18 | $0.13 |

Plus **$0.12/GB of attachment data**. Dedicated IPs à la carte: **$15/month/account** + $0.02–0.08/1,000. Virtual Deliverability Manager: $0.02–0.07/1,000. Mail Manager (inbound): $0.15/1,000.

**Free tier: effectively gone.** The old 62,000/month-from-EC2 allowance was cut to **3,000 messages/month for the first 12 months on 2023-08-01**, and as of **2026-07-21 the SES-specific free tier is no longer available to new customers** — replaced by $200 in general AWS credits over 6 months for new accounts. **Verify which regime Effy's account falls under**; this materially changes the dev-environment cost model, and the CLAUDE.md notes production access was already granted at 50,000/day.

### 8.2 What each architecture costs

Assume 200k emails/month (a plausible year-2 grocery figure: order confirmations, dispatch, receipts, OTPs).

| | Send cost | Additional infra | Total/mo |
|---|---|---|---|
| **Code-as-templates, build-time MJML, Node worker** | $20 (à la carte) | $0 — no store, no extra Lambda | **~$20** |
| Same + SES stored templates mirrored | $20 | $0 storage; CI time only | **~$20** |
| S3-stored templates | $20 | ~$0.01 storage + GET per send (~$0.08/200k) | ~$20 |
| DB-stored templates | $20 | RDS already paid; +1 query per send | ~$20 |
| Runtime MJML compilation in Lambda | $20 | **+cold starts, +memory, +latency on the auth path** | ~$20 + outages |

**The financial differences are noise. Every option costs ~$20/month.** This is the most important cost finding in the report: **do not choose on price — choose on operational failure modes**, because they are the only thing that differs. The real costs are engineer-hours and the probability of a sign-in outage.

Costs that *do* differ:
- **Dedicated IP: +$15/mo minimum**, and negative value below ~100k/mo. Skip.
- **Pro plan: +$105/mo** for VDM + a bundled dedicated IP. Skip until deliverability is an actual problem.
- **Lambda cold start** is the real cost of runtime compilation, and it's paid in sign-in failures, not dollars.

---

## 9. Anti-patterns and horror stories

**1. Runtime MJML/React compilation on the send path.** MJML pulls 100 MB+ of transitive deps. React Email v6.5.0 added **~80 MB per function** via top-level `prismjs`/`marked`/`tailwindcss` imports, causing silent deploy hangs ([#3556](https://github.com/resend/react-email/issues/3556)). On a Cognito custom-challenge trigger this is a sign-in outage, not a slow email. **Compile at build time.**

**2. DB-stored HTML templates edited by non-engineers.** The failure is not the database — it's that **a template edit becomes a production deploy with no PR, no review, no test, no rollback, and no type check**. One unclosed `<td>` and Outlook renders nothing. GOV.UK Notify is the existence proof that it *can* work — and note what it costs: templates are restricted **Markdown**, deliberately incapable of bold, italics, fonts, or arbitrary HTML. **If your non-engineers get real HTML, you have a CMS with none of a CMS's safety rails.**

**3. Missing plaintext part.** Triggers SpamAssassin `MIME_HTML_ONLY` (+0.7). Worse, a *fake* plaintext part ("View this email in your browser") is arguably worse than none — filters read it.

**4. Generating plaintext by stripping compiled HTML.** MJML output is nested layout tables; naive `html-to-text` yields structural debris. Generate from a semantic source or author by hand.

**5. `SendTemplatedEmail` with unescaped user data.** SES explicitly does not escape. Product names, shop names, and customer names on a grocery platform are user-influenced. **This is HTML injection into your customers' inboxes**, and the SES docs tell you it's your problem.

**6. Deploying hundreds of templates through a 1 TPS API.** Serial, minutes-long, non-atomic, non-rollback-able. A partial failure leaves prod in a mixed state you cannot diff.

**7. Hardcoded HTML template literals in Lambdas** — Effy's current state. The specific failure isn't ugliness: it's that **the template is invisible to design review, untestable, unpreviewed, unversioned separately from code, and impossible to reuse**, so template #2 gets copy-pasted and the footer diverges immediately. At template #40 you have 40 footers.

**8. Deliverability streams sharing a domain.** A marketing campaign's complaint rate poisons order confirmations and password resets. Once a domain's reputation is damaged you cannot recover it quickly. **Split the subdomains before you have volume**, because the split is free now and impossible later.

**9. Adding `List-Unsubscribe` to transactional mail.** A user unsubscribes from their own sign-in codes and cannot log in. On a platform whose internal audiences have **no password at all**, this is a total lockout.

**10. Gmail's 102 KB clip.** Verbose MJML output plus a 30-line grocery order plus inline CSS gets there faster than anyone expects. The email doesn't fail — it silently truncates, often right where the total is. **Assert on size in CI.**

**11. Testing against real inboxes.** Use the mailbox simulator and a hard non-prod allowlist. The 500-welcome-emails-to-production story is one unswapped env var away — and Effy has already been bitten four times by config that tests set themselves (027 R13, 029, 033, and 035's undeclared `serverless.yml` env vars). **The email config-contract test should read the real `serverless.yml`**, exactly as 035's fix did.

**12. Templates that pass every test because the fixture agrees with the code.** This is Effy's single most-repeated documented failure mode. For email it appears as: a snapshot test regenerated after the bug, a fixture written from the struct instead of the contract, a "renders correctly" test that never crosses a real MIME boundary. **The mailbox simulator + a live seed-list walk are the only things that cross it.**

---

## 10. RECOMMENDATION

### Ranked architectures for Effy

**#1 — Code-as-templates, build-time MJML, runtime Handlebars in Node, one owning worker. ⭐ Recommended, and the cheapest reliable option.**

```
packages/email-templates/          # new shared package, @effy/email-templates
  src/layouts/base.mjml            # ONE layout, 4 audience themes
  src/templates/*.mjml             # {{vars}} authored inline (thoughtbot pattern)
  src/text/*.txt.hbs               # hand-authored text parts
  src/fixtures/*.json              # one per template, schema-validated
  src/catalog.ts                   # TemplateId union + Zod schemas + audience + category
  dist/                            # COMMITTED artifacts + manifest.json
```
- `make email-gen` / `make email-check` — drift guard, same shape as `tokens:check` and `brand-check`, must name the stale template.
- Runtime: **Handlebars only** (~80 KB). MJML never ships to Lambda.
- Send: SES v2 `SendEmail` with `Content.Simple` (Html + Text + `Headers`), per-stream `ConfigurationSetName`.
- **Go never renders.** It publishes `{templateId, to, vars, locale}` to the existing SNS topic → SQS → notifications worker. Template-id constants and payload structs are **codegen'd to Go** from `catalog.ts`, exactly as `@effy/shared-types` already generates Kotlin.
- Auth OTP renders **in-process** in the existing Node auth Lambda — no queue hop on the sign-in path.

**Cost: ~$20/month at 200k emails, which is just the SES send cost. Zero additional infrastructure.**

**Honest tradeoffs:**
- A copy change requires a PR and a deploy. **This is real friction and the pressure to remove it will be constant.** Mitigate with a fast preview build and by keeping copy in per-locale string files (a string edit is a one-line diff), not by moving templates to a database.
- Effy carries a new build step and a new drift guard. Given three already exist and work, marginal cost is low.
- HTML artifacts in git make diffs noisy. Accept it — reviewing the `.mjml` source is the point; the artifact is a build product with a guard.
- **Go cannot send synchronously.** For a grocery platform this is correct anyway (order confirmations are asynchronous by nature), but if a genuinely synchronous Go send appears, add option #2 for that one path.

**#2 — Same as #1, plus mirroring compiled artifacts to SES stored templates.** Add this **only if** a Go path must send synchronously. Name them `effy-<env>-<id>-v<n>` so rollback is a name change, not a destructive update. Costs: the 1 TPS sync loop in CI, plus a second substitution engine whose Handlebars dialect can drift from the Node one. Given Effy's four documented dual-implementation drift incidents, **only take this on with a cross-engine contract test** — the exact pattern 028 built with `wire_contract_test.go` + `BannerWireContractTest.kt`.

**#3 — SES managed templates as the source of truth.** Viable only at low template count with no non-ASCII, no formatting helpers, and no rollback requirement. At "hundreds of templates" the 1 TPS deploy, absent versioning, and unescaped rendering make it the wrong choice. **Rejected.**

**#4 — Database-stored templates.** Only justified when non-engineers author. If that becomes a requirement, do it GOV.UK Notify's way — a **restricted Markdown subset** with `((placeholder))` interpolation, not HTML. Never HTML in a DB column.

**#5 — Runtime MJML/React compilation.** **Rejected.** Bundle size and cold-start risk on the auth path.

### Non-negotiables to write into the spec regardless of architecture

1. `category: 'transactional' | 'lifecycle'` in the catalog; `List-Unsubscribe` **forbidden** on transactional, **required** on lifecycle. Make the wrong combination fail to typecheck.
2. Escape all interpolated values. SES does not.
3. Every template ships a real text part; CI asserts non-empty.
4. CI asserts rendered HTML **< 100 KB**.
5. Split `mail.` and `news.` subdomains + separate configuration sets **now**.
6. Non-prod recipient allowlist, fail-closed, plus mailbox-simulator coverage of the 037 bounce consumer.
7. A **config-contract test that reads the real `serverless.yml`** — 035's fix, applied here before the same defect happens a fifth time.
8. `X-Effy-Template-Id` header on every send, so `public.email_delivery_event` can attribute bounces to templates.
9. `locale` in the envelope and the catalog type from day one; ship `en-AU` only.
10. An operator seed-list walk on the ~10 templates that matter, written as a task — not left implicit.

---

## Sources

**AWS SES**
- [Service quotas in Amazon SES](https://docs.aws.amazon.com/ses/latest/dg/quotas.html)
- [Using templates to send personalized email](https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-api.html)
- [Advanced email personalization](https://docs.aws.amazon.com/ses/latest/dg/send-personalized-email-advanced.html)
- [Amazon SES header fields](https://docs.aws.amazon.com/ses/latest/dg/header-fields.html)
- [Message (SES v2 API)](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_Message.html) · [TestRenderEmailTemplate](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_TestRenderEmailTemplate.html) · [CreateEmailTemplate](https://docs.aws.amazon.com/ses/latest/APIReference-V2/API_CreateEmailTemplate.html)
- [Account-level suppression list](https://docs.aws.amazon.com/ses/latest/dg/sending-email-suppression-list.html)
- [Mailbox simulator](https://docs.aws.amazon.com/ses/latest/dg/send-an-email-from-console.html)
- [Amazon SES now offers support for headers when sending email (2024-03-08)](https://aws.amazon.com/about-aws/whats-new/2024/03/amazon-ses-headers-sending-email)
- [Using one-click unsubscribe with Amazon SES](https://aws.amazon.com/blogs/messaging-and-targeting/using-one-click-unsubscribe-with-amazon-ses/)
- [How Fanatics Commerce built a scalable email platform on Amazon SES](https://aws.amazon.com/blogs/messaging-and-targeting/how-fanatics-commerce-built-a-scalable-email-platform-on-amazon-ses/)
- [Optimize your sending reputation and deliverability with SES dedicated IPs](https://aws.amazon.com/blogs/messaging-and-targeting/optimize-your-sending-reputation-and-deliverability-with-ses-dedicated-ips/)
- [Amazon SES Pricing](https://aws.amazon.com/ses/pricing/) · [Revised free tier announcement](https://aws.amazon.com/blogs/messaging-and-targeting/amazon-simple-email-service-adds-email-delivery-analysis-features-to-revised-free-tier)
- [aws_ses_template — Terraform Registry](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/ses_template)

**Authoring formats & engineering write-ups**
- [Artsy: How hard could it be to create an email?](https://artsy.github.io/blog/2018/11/19/mjml/)
- [thoughtbot: Building Templated Emails with MJML](https://thoughtbot.com/blog/building-templated-emails-with-mjml)
- [MJML documentation](https://documentation.mjml.io/) · [mjmlio/mjml#1735 (inline styles)](https://github.com/mjmlio/mjml/issues/1735)
- [Boostport/mjml-go](https://github.com/Boostport/mjml-go) · [danihodovic/mjml-server](https://github.com/danihodovic/mjml-server)
- [Maizzle: Expressions](https://maizzle.com/docs/expressions) · [Maizzle: Introduction](https://maizzle.com/docs/introduction)
- [resend/react-email#3556 — 80 MB bundle bloat](https://github.com/resend/react-email/issues/3556)
- [Adam Quaile: Introducing Enveloper](https://adamquaile.medium.com/introducing-enveloper-e6d606fbbb40)

**Compliance**
- [RFC 8058 — Signaling One-Click Functionality for List Email Headers](https://www.rfc-editor.org/rfc/rfc8058.html)
- [Google Email sender guidelines](https://support.google.com/a/answer/81126)
- [Yahoo Sender Best Practices](https://senders.yahooinc.com/best-practices/)
- [FTC: CAN-SPAM Act Compliance Guide for Business](https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business)

**Testing & operations**
- [Mailpit](https://github.com/axllent/mailpit) · [Jeff Geerling: Local email debugging with Mailpit](https://www.jeffgeerling.com/blog/2026/mailpit-local-email-debugging/)
- [caniemail.com](https://www.caniemail.com/)
- [hteumeuleu/email-bugs#41 — Gmail 102 KB clipping](https://github.com/hteumeuleu/email-bugs/issues/41) · [Litmus: How to keep Gmail from clipping your emails](https://www.litmus.com/blog/how-to-keep-gmail-from-clipping-your-emails)
- [Visual regression testing emails with Playwright](https://email-development-transactional-systems.com/email-testing-qa-workflows/automated-snapshot-testing/visual-regression-testing-emails-with-playwright/)
- [Camillo Visini: Localizing transactional email templates](https://camillovisini.com/coding/python-i18n-localizing-email-templates/)
- [GOV.UK Notify: Templates](https://www.notifications.service.gov.uk/using-notify/templates) · [Formatting](https://www.notifications.service.gov.uk/using-notify/formatting)
- [Semplates](https://semplates.io/) · [Sovy](https://sovy.app/) · [AWS SES Template Editor](https://awssestemplateeditor.com/) — the SES-gap tooling market
- [Stefan Olaru: Debugging AWS SES templates](https://blog.stefanolaru.com/debugging-aws-ses-templates)