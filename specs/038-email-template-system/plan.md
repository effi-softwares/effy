# Implementation Plan: Platform Email Template System

**Branch**: `main` (no branch — only an `after_specify` hook is registered) | **Date**: 2026-08-07 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/038-email-template-system/spec.md`

---

## Summary

Give the platform **one place** where every email it will ever send is defined, designed, previewed,
verified and sent — and prove it by moving **all six** of today's live messages onto it.

**The approach**, in one paragraph: a new shared package `@effy/email-kit` holds a **typed catalogue**
of every message plus its content authored in **MJML**. MJML is compiled **at build time** into
committed, drift-guarded artifacts with `{{variable}}` placeholders intact; nothing compiles MJML at
runtime. The email palette is **generated** from `packages/design-system/src/tokens.css`, so email
cannot hold a colour the platform does not. At send time a small **Handlebars** substitution over the
committed artifact produces the message; `@effy/email-kit/send` wraps SESv2, enforces the
non-production recipient allowlist, and applies each message's declared failure policy. The four
messages Cognito sends itself are intercepted by **one new `CustomMessage` trigger** on all four
pools, which fails safe to Cognito's default template rather than breaking sign-up.

**Why this shape**: the constraint that dominates every other is the **five-second Cognito wall** on
the auth triggers. Three of four audiences have no password, so a slow or failed render is a sign-in
outage. That single fact rules out runtime MJML compilation (100 MB+ of transitive deps), React Email
(a documented ~80 MB per-function bundle regression), a queue hop on the sign-in path, and any design
where a template is fetched over the network before a code can be emailed.

---

## Technical Context

**Language/Version**: TypeScript on Node 22 (cold path, locked). Build-time tooling is Node stdlib +
two libraries. No Go, no Kotlin, no SQL beyond one column.

**Primary Dependencies**:
- `mjml` — **build-time only**, never bundled into a Lambda. Compiles to table-based, Outlook-safe HTML.
- `handlebars` — **runtime**, the substitution engine. Escapes by default.
- `@aws-sdk/client-sesv2` — already in use by both existing mailers.
- `@effy/design-system` — devDependency, the origin of every colour and radius (token source only; no
  React, no CSS is imported).

**Storage**: **No new table.** One forward-only Goose migration adds a single nullable column,
`public.email_delivery_event.template_id`, so 037's existing consumer can attribute an outcome to the
message that caused it. Templates live in the repository, not in the database (operator decision).

**Testing**: Vitest (workspace standard) for the catalogue, render, sender and the Cognito trigger;
Node-stdlib guard scripts for the generated-artifact drift check, the authoring lint, the contrast
check and the size budget — following `design-system/scripts/check-tokens.mjs` and
`brand/scripts/check-brand-assets.mjs`, which are deliberately zero-dependency.

**Target Platform**: AWS Lambda arm64 (Node 22) for sending; the *recipients'* email clients are the
real target surface — Apple Mail, Gmail (web/iOS/Android **and the non-Google-account configuration**),
classic Outlook for Windows (the Word rendering engine), Outlook.com, Outlook mobile, Yahoo.

**Project Type**: A shared library plus changes to three existing cold-path services, one Terraform
module, and one migration. **No new service, no new HTTP route, no UI.**

**Performance Goals**:
- Render (substitute + assemble) **< 5 ms** warm; the whole `createAuthChallenge` path must stay well
  inside Cognito's **5-second, unchangeable** trigger timeout on a ~1 s cold start.
- Zero change to sign-in timing parity (035 FR-016 / this spec's FR-052).

**Constraints**:
- **Rendered HTML ≤ 90 KB soft / 102 KB hard** — Gmail clips at ~102 KB and hides everything past the cut.
- ⚠ **≤ 20,000 characters for any template routed through Cognito's `CustomMessage`** — a much
  tighter, separate budget (confidence: medium; must be confirmed against a live pool — see research R14).
- **No embedded stylesheet may be load-bearing** — the Gmail app configured with a non-Google address
  supports no `<style>` at all, so every visual property must be inline.
- **The Word rendering engine is a hard target through 2029.** Microsoft delayed the enterprise opt-out
  phase to March 2027 and supports classic Outlook to at least 2029. It is not legacy.
- **Lambda bundle**: nothing that inflates the auth service. MJML must never reach it.

**Scale/Scope**: 6 messages migrated + 1 commerce proof = **7 templates** at ship. Designed for the
platform's realistic ceiling of ~60 distinct messages composed from ~12 shared blocks — **not** for
500 independently authored files, which is how you get 500 subtly divergent footers.

---

## Constitution Check

*GATE: evaluated before Phase 0, re-evaluated after Phase 1 design. Constitution v1.12.0.*

| Principle | Verdict | How this plan satisfies it |
| --- | --- | --- |
| **I — Spec-Driven Development** | ✅ PASS | `spec.md` committed; this plan; `tasks.md` next. Three scope forks were resolved with the operator during `/specify` rather than discovered in code. The spec's two premise corrections (no HTML email has ever been sent; four of six messages come from Cognito) were fixed **in the spec**, not patched here. |
| **II — Monorepo with Shared Contracts** | ✅ PASS | `@effy/email-kit` is a shared package and the **single source of truth** for message identity, content and sending. The email palette is **generated** from the design-system token SSOT, not transcribed. ⚠ This slice **removes** existing copy-paste: two hand-rolled mailers with two client constructions, two failure policies and two footers collapse into one. |
| **III — Dual-Path Backend Discipline** | ✅ PASS (justified below) | **Cold path only.** No latency-sensitive customer read or transaction is added. The senders are Cognito-invoked Lambdas that already live on the cold path (035) plus one existing customer Lambda. **The hot path sends no email today and this slice adds none** (spec Out of Scope). Rendering is a pure library with no I/O, so it adds no path at all. |
| **IV — Auth Isolation** | ✅ PASS | The new `CustomMessage` trigger follows the **exact** shape of the four triggers 035 already ships: one deployment serving all four pools, branching on `event.userPoolId`, **failing closed on an unknown pool**. It accepts no token, brokers no authentication, and crosses no pool boundary. It lives in `edge-api/auth` — not `edge-api/customer` — for the reason 035 R9 records: a role reaching all four pools must not be attached to the customer service. |
| **V — Native-Feel, Consistent Design** | ⚠ PASS with one recorded exception | Monochrome ramp only; **no third hue**; General Sans with a mandatory fallback stack; radii from the pinned scale; **no card layouts** (the code block is a value treatment, justified in spec FR-014 and again below). Dark mode ships in both appearances — but **cannot be user-selectable in an inbox**. See Complexity Tracking. |
| **VI — Layered Architecture & Explicit Wiring** | ✅ PASS | Three layers, dependency direction preserved: **catalogue (domain — depends on nothing)** → **render (use-case — pure, no I/O)** → **send (adapter — SESv2)**. No DI framework; the sender is wired explicitly at each call site. No ORM, no query builder; the single SQL change is one column consumed by 037's existing repository. |
| **VII — Observability & Telemetry** | ✅ PASS | Declared in full below. Structured send logs (template id, audience, outcome — **never** the address, the code, or message content), a CloudWatch metric filter and alarm on send failure, and template attribution flowing into 037's `email_delivery_event`. |
| **Real-World Identifiers** | ⚠ PASS — two operator inputs, both fail-loud | The **postal address** in the compliance footer and the **non-production recipient allowlist** are operator-supplied. Both MUST fail the build/deploy when unset; neither may be guessed. Only the two approved mailboxes appear (`hello@` customer-facing, `workspace-admin@` operational), derived from the message's audience so no send site can invent a third. |
| **Quality Gates** | ✅ PASS | Every guard fails **and names the offending template**, proven by deliberately breaking each (spec SC-010) — the method 024 established. A config-contract test reads the **real `serverless.yml`** (spec FR-045). |

### Principle III — path justification (required by the constitution)

**Cold path, exclusively.** Email is asynchronous, low-frequency, ops-shaped work: it is the cold
path's definition. Two of the three send sites are **Cognito Lambda triggers**, which are not HTTP
services at all and already sit in `edge-api/auth`; the third is an existing customer Lambda. The hot
path (`core-api`) sends no email now and none is added — when order notifications need sending, that
slice publishes to the existing event backbone and a Node worker renders and sends, so **one language
owns rendering**. That last point is not a preference: this platform has been bitten **four times**
(027 R13, 029, 033, 035) by two implementations of one contract drifting, and a second renderer would
put that failure mode in customers' inboxes.

### Principle V — the two design judgements, recorded

1. **The code block is not a card.** Constitution V forbids card-style containers *laying out content*.
   The OTP code sits on a filled surface because it is a **single value given emphasis** — the same
   role a chip or an input field plays — not a tile in a grid of tiles. No other block in the system
   uses a container. Recorded here because the constitution requires the justification in the plan.
2. **Email commits to the light appearance and ships an explicit dark restatement.** The app's accent
   inverts by appearance; email cannot reliably learn the appearance (the mechanism is unsupported
   across roughly a quarter of opens). See Complexity Tracking for the user-selectability exception.

### Principle VII — telemetry declaration (required by the constitution)

| What | Detail |
| --- | --- |
| **Structured logs** | One event per send: `template_id`, `audience`, `outcome`, `duration_ms`, SES `message_id`. ⚠ **Never** the recipient address, the code, or any rendered content — 035's rule, and the reason `mailer.ts` has no logging at all today. |
| **Metrics** | CloudWatch metric filters over those logs → `effy_email_sent_total{template,audience}` and `effy_email_send_failed_total{template,audience}`, surfaced in Grafana through the existing CloudWatch datasource. Labels are low-cardinality by construction: the template id set is closed. |
| **Alarms** | One alarm on email send failures, routed to the existing `/effy/<env>/alerts/topic_arn`. ⚠ It is severity-1 by nature: on driver, shop and back-office a failed send **is** a failed sign-in. This complements 037's four delivery alarms rather than duplicating them — 037 watches what happened *after* SES accepted a message; this watches SES refusing it. |
| **Attribution** | `template_id` on 037's `email_delivery_event`, so "which message is bouncing?" is answerable without a join through application state. ⚠ **Covers platform-sent messages only** — see research R8. |
| **Product analytics** | **None.** There is no client surface in this slice; PostHog is a client concern. |

---

## Project Structure

### Documentation (this feature)

```text
specs/038-email-template-system/
├── spec.md                       # committed
├── plan.md                       # this file
├── research.md                   # Phase 0 — 18 decisions
├── data-model.md                 # Phase 1 — entities + the one migration
├── quickstart.md                 # Phase 1 — the operator runbook
├── contracts/
│   ├── email-catalog.contract.md         # the typed catalogue (app ↔ app)
│   ├── email-tokens.contract.md          # design-system ↔ email (generated)
│   └── cognito-custom-message.contract.md # inbound: Cognito → the platform
├── research-inputs/              # gathered during /specify, consumed by research.md
│   ├── html-email-rulebook.md
│   └── industry-template-systems.md
├── checklists/requirements.md
└── tasks.md                      # /speckit-tasks — NOT created here
```

### Source code (repository root)

```text
packages/email-kit/                       # ⭐ NEW — @effy/email-kit
├── package.json                          # scripts: email:gen · email:check · email:preview · test
├── src/
│   ├── index.ts                          # `.` entrypoint — catalogue + render. NO AWS, NO I/O.
│   ├── catalog.ts                        # ⭐ THE SSOT: id union, var schemas, audience,
│   │                                     #   category (transactional|lifecycle), failure policy
│   ├── render.ts                          # (id, vars) -> { subject, html, text } — pure
│   ├── send.ts                           # `./send` entrypoint — SESv2 + allowlist + failure policy
│   ├── audience.ts                       # audience -> product name, reply-to, wording
│   ├── tokens.generated.ts               # ⚠ GENERATED from design-system/src/tokens.css
│   ├── layouts/base.mjml                 # the ONE layout every message uses
│   ├── components/                       # the 12 blocks (FR-016) — mj-include partials
│   │   ├── header.mjml   ├── heading.mjml    ├── paragraph.mjml
│   │   ├── button.mjml   ├── link.mjml       ├── code.mjml
│   │   ├── rows.mjml     ├── line-items.mjml ├── divider.mjml
│   │   ├── notice.mjml   ├── image.mjml      └── footer.mjml
│   ├── templates/                        # ONE .mjml per message
│   │   ├── auth-sign-in-code.mjml        ├── auth-sign-up-code.mjml
│   │   ├── auth-password-reset-code.mjml ├── auth-email-verification-code.mjml
│   │   ├── auth-step-up-code.mjml        ├── account-password-changed.mjml
│   │   └── order-confirmation.mjml       # the commerce proof (template only — FR-062)
│   ├── text/<id>.txt.hbs                 # ⚠ HAND-AUTHORED, never stripped from HTML
│   └── fixtures/<id>.json                # example data, schema-validated
├── dist/                                 # ⚠ COMMITTED + drift-guarded
│   ├── <id>.html                         # review/diff/lint artifact ({{vars}} + {####} intact)
│   ├── <id>.txt
│   ├── templates.generated.ts            # runtime artifact — what the bundler sees
│   └── manifest.json                     # id -> subject, sizes, sha256
├── scripts/
│   ├── gen-email.mjs                     # tokens -> mjml -> dist/  (make email-gen)
│   ├── check-email.mjs                   # drift + lint + contrast + size (make email-check)
│   └── preview.mjs                       # dist/preview/*.html      (make email-preview)
└── test/                                 # catalogue, render, sender, lint-rule tests

apis/edge-api/auth/
├── serverless.yml                        # + customMessage function; + allowlist env var
└── src/
    ├── functions/custom-message.ts       # ⭐ NEW — intercepts Cognito's four messages, 4 pools
    ├── otp/mailer.ts                     # ⚠ REWRITTEN — delegates to @effy/email-kit/send
    └── lib/audience.ts                   # extended: reply-to + the fields email needs

apis/edge-api/customer/src/password/notify.ts   # ⚠ REWRITTEN — delegates; keeps swallow-on-failure
apis/edge-api/admin/src/functions/ses-event-consumer.ts  # + read mail.tags -> template_id
apis/edge-api/admin/src/deliverability/                  # + template_id surfaced in the read model

db/migrations/<ts>_email_template_attribution.sql        # ⭐ NEW — one nullable column

infra/
├── modules/cognito-user-pool/main.tf     # + custom_message in lambda_config (+ 1 permission)
├── modules/cognito-user-pool/variables.tf
└── envs/dev/
    ├── auth-{customer,driver,shop,back-office}.tf   # wire the ARN on all four pools
    ├── dns.tf                            # + /effy/<env>/mail/nonprod_allowlist
    │                                     # + /effy/<env>/mail/postal_address  (operator input)
    └── variables.tf                      # validation: refuse an unset/placeholder postal address

Makefile                                  # + email-gen · email-check · email-preview
turbo.json                                # email-kit joins the test/typecheck graph
```

**Structure Decision**: a **new shared package plus targeted edits to three existing cold-path
services**. No new service is created, because email is not a service — it is a cross-cutting concern,
which Principle II says must be a shared package. `@effy/email-kit` deliberately splits its entrypoints:
`.` is **pure** (catalogue + render, no AWS, no I/O) so preview, lint and every unit test run with zero
cloud access, and `./send` is the only place the SES client exists. The generator/checker pair mirrors
`design-system`'s `tokens:gen`/`tokens:check` and `brand`'s `brand:gen`/`brand:check` — a third
instance of a pattern this repository has already proven twice, and which 024 proved by deliberately
breaking three ways.

---

## Phase 0 — Research

**Output**: [research.md](research.md) — 18 decisions with rationale and rejected alternatives.

Two research reports gathered during `/specify` are committed in
[`research-inputs/`](research-inputs/) and are the primary inputs: an industry survey of in-house
template systems (with AWS quota numbers, the Fanatics Commerce and GOV.UK Notify case studies, and
cost modelling) and an HTML-email authoring rulebook (55 testable rules, 31 lint checks, a client
matrix dated May 2026, and the dark-mode inversion mathematics).

Headline decisions:

| # | Decision |
| --- | --- |
| R1 | **MJML, compiled at build time.** Rejected React Email (bundle regression), raw tables (unmaintainable at scale), Maizzle (does not emit Outlook ghost tables), runtime MJML (100 MB+ deps on a 5-second path). |
| R2 | **Handlebars at runtime**, compiled lazily and cached at module scope. Escapes by default — SES's own engine does **not**, and its docs say so. |
| R4 | **SES managed templates rejected as the source of truth** — 1 TPS create/update, no versioning, no rollback, no escaping, unreadable diffs. |
| R7 | **One `CustomMessage` trigger on all four pools**, fail-safe to Cognito's default. ⚠ We never see the code — we emit Cognito's `{####}` placeholder. |
| R8 | **Attribution via SES message tags**, and **ids are tag-safe by construction** (`[a-z0-9-]` only) so no sanitisation can collide. ⚠ Cognito-sent messages cannot be tagged — attribution is partial, and that is recorded rather than papered over. |
| R14 | **Two size budgets**, not one: 90/102 KB for Gmail, and ⚠ 20,000 characters for anything Cognito sends. |

---

## Phase 1 — Design & Contracts

**Outputs**: [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md).

### Entities → [data-model.md](data-model.md)

The catalogue, message definition, building block, token set, fixture, audience profile and send
record — plus the **one** persistence change: `public.email_delivery_event.template_id`, nullable,
forward-only.

### Contracts → [contracts/](contracts/)

| Contract | Direction | Why it exists |
| --- | --- | --- |
| [`email-catalog.contract.md`](contracts/email-catalog.contract.md) | app ↔ app | The typed catalogue: id rules, the transactional/lifecycle discriminated union that makes an unsubscribable sign-in code **unrepresentable**, and the per-message failure policy that today lives as a comment in two files. |
| [`email-tokens.contract.md`](contracts/email-tokens.contract.md) | design-system → email | Which token feeds which email role, in both appearances; the banned mid-tone band; the contrast obligation in **both** passes. Terraform-free, generated, drift-guarded. |
| [`cognito-custom-message.contract.md`](contracts/cognito-custom-message.contract.md) | **inbound** — Cognito → platform | The trigger event subset relied upon, the seven trigger sources, `{####}` handling, the 20,000-character limit, and the **fail-safe rule** that stops a broken interceptor from breaking sign-up. |

⚠ **Reused, not redefined**: [037's `ssm-mail.contract.md`](../037-platform-email-delivery/contracts/ssm-mail.contract.md)
governs the sender, reply address and configuration set. This slice **reads** it and must not
reintroduce the hardcoded copies 037 removed. Two new keys are *added* to it
(`nonprod_allowlist`, `postal_address`), documented in the tokens contract.

### Quickstart → [quickstart.md](quickstart.md)

The operator runbook, in ordering that is load-bearing: generate → check → preview → migrate → deploy
`auth` → **two-stage Terraform dance for the trigger ARN** (apply with `null` → deploy → set the ARN →
apply again, exactly as 035 and the pre-sign-up trigger required) → seed-inbox walk across the target
client matrix.

---

## Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| **Principle V: dark mode is not user-selectable** | The constitution requires dark mode to be "user-selectable (Light / Dark / Follow-System)" on every surface. **An inbox has no Effy setting.** The medium provides no mechanism for the sender to offer an appearance choice; the recipient's client decides, and roughly a quarter of opens come from clients that report nothing and rewrite colours anyway. | There is no alternative — this is a property of email, not of the design. What the plan *can* do, and does: ship both appearances generated from one token source, declare colour-scheme support so clients that honour it leave the palette alone, and mirror the dark restatement for the clients that use a proprietary mechanism instead. The hueless ramp then survives forced inversion by construction (research R13), which is the closest the medium allows to "follow-system." |
| **A generated artifact is committed to the repository** (`dist/`) | Compiling MJML at runtime would put 100 MB+ of transitive dependencies on a path with a hard 5-second timeout where a failure is a sign-in outage. | Not actually a deviation — it is the established repository pattern, on its third instance: `design-system`'s Compose theme and `@effy/brand`'s 57 assets are both generated, committed and drift-guarded. Reusing it is *less* complex than inventing a fourth convention. |
| **Two committed artifacts per template** (`.html` for review/lint, `templates.generated.ts` for the bundler) | esbuild bundles JavaScript, not `.html`. A readable HTML artifact is what makes a design change reviewable in a diff; a TS module is what makes it bundler-agnostic and testable. | Rejected a `.html` esbuild loader: it would need identical, correct configuration in three `serverless.yml` files, and a wrong one fails at runtime — precisely 035's failure mode. Rejected a TS-only artifact: escaped HTML in a TS string is the unreadable diff that disqualified SES managed templates in R4. **Mitigation**: both are written by one generator pass and byte-compared by `email-check`, so they cannot drift. |

---

## Post-Design Constitution Re-check

Re-evaluated after Phase 1. **No new violations.** Three notes:

1. **Principle II strengthened, not merely satisfied.** The design deletes more duplication than it
   adds: two hand-rolled mailers, two SES client constructions, two divergent failure policies and two
   footers become one package. The email palette becomes *derived* from the design-system SSOT, so a
   platform colour change reaches email with no hand edit (spec SC-020).
2. **Principle IV re-checked against the new trigger.** `CustomMessage` reads `event.userPoolId` and
   fails closed on an unknown pool, identical to 035's `audience.ts`. It receives no token, and its
   IAM adds nothing — it neither sends mail nor calls Cognito; it returns a string. It is strictly
   *less* privileged than the four triggers already deployed beside it.
3. **⚠ One honest limitation, surfaced by the design and recorded rather than hidden**: because
   Cognito sends the intercepted messages itself, the platform cannot attach message tags,
   a configuration set, or a custom header to them — so **template attribution (FR-010) and the
   non-production recipient allowlist (FR-043) cover platform-sent messages only**. This is a property
   of the mechanism, not a gap in the implementation. It is written into research R7/R8, the Cognito
   contract, and must be carried into `tasks.md` as a stated limitation rather than discovered later.
