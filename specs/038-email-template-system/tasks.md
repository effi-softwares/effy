---

description: "Task list for 038 Platform Email Template System"
---

# Tasks: Platform Email Template System

**Input**: Design documents from `/specs/038-email-template-system/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md),
[data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Test tasks ARE included — the spec explicitly requires them (FR-042 automated verification,
FR-045 the config-contract test, SC-010 every guard proven by deliberately breaking it, SC-011,
SC-016). This is not an optional TDD preference; the guards *are* the deliverable for User Story 2.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: `[US1]`…`[US6]` — maps to the user stories in [spec.md](spec.md)
- 🧑‍💻 **= OPERATOR-RUN.** Deploys, migrates, touches live AWS, or requires a human looking at an
  inbox. Claude writes the code; the operator runs these.

## Path Conventions

Monorepo. New shared package at `packages/email-kit/`; edits to `apis/edge-api/{auth,customer,admin}/`,
`infra/`, `db/migrations/`, `Makefile`, `turbo.json`.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Bring `@effy/email-kit` into the workspace with nothing in it yet.

- [X] T001 Create the `packages/email-kit/` directory tree per [plan.md](plan.md) § Project Structure — `src/{layouts,components,templates,text,fixtures,generated}/`, `dist/`, `scripts/`, `test/`
- [X] T002 Create `packages/email-kit/package.json` — name `@effy/email-kit`, private, `type: module`, exports `.` (pure) and `./send` (SESv2), scripts `email:gen` · `email:check` · `email:preview` · `lint` · `typecheck` · `test`
- [X] T003 [P] Add dependencies to `packages/email-kit/package.json`: runtime `handlebars`, `@aws-sdk/client-sesv2`; devDependencies `mjml`, `@effy/design-system` (token source only), `typescript`, `vitest`
- [X] T004 [P] Create `packages/email-kit/tsconfig.json` and `vitest.config.ts` matching the conventions in `apis/edge-api/shared/`
- [X] T005 [P] Register `email-kit` in `turbo.json` so `typecheck` and `test` run for it in the workspace graph
- [X] T006 [P] Add `email-gen`, `email-check` and `email-preview` targets to `Makefile`, alongside the existing `brand-gen`/`brand-check` pair, and add them to `.PHONY`
- [X] T007 Run `pnpm install` and confirm the workspace resolves `@effy/email-kit` (depends on T002, T003)

**Checkpoint**: the package exists and the workspace knows about it.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the mechanism every message depends on — tokens, layout, components, the catalogue type
system, rendering, and sending.

**⚠️ CRITICAL**: no user story can begin until this phase is complete.

### Tokens — generated from the design system

- [X] T008 Write `packages/email-kit/scripts/gen-email.mjs` step 1: parse `packages/design-system/src/tokens.css` (`:root` and `.dark` blocks) using the same zero-dependency approach as `design-system/scripts/check-tokens.mjs`
- [X] T009 Extend `gen-email.mjs` to emit `packages/email-kit/src/generated/tokens.generated.ts` — the email role map from [contracts/email-tokens.contract.md](contracts/email-tokens.contract.md) §1, with every value resolved to **literal hex** (⚠ no `var()` may reach the output — CSS custom properties are unsupported across essentially the whole audience)
- [X] T010 Extend `gen-email.mjs` to emit `packages/email-kit/src/generated/theme.mjml` — an `<mj-attributes>` + `<mj-style>` block carrying the light palette inline, the `@media (prefers-color-scheme: dark)` block, and the `[data-ogsc]`/`[data-ogsb]` mirror, **all three from the one token map** (spec FR-025)
- [X] T011 [P] Encode the three email-specific deviations in the generator: page ground `#F5F5F5` not `#FFFFFF`, authored dark ground `#1A1A1A` never `#000000`, and the `#707070`–`#909090` band rejected for text and dividers (contract §1)
- [X] T012 [P] Encode the type scale and font stack in `theme.mjml` — `'General Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif`; weights 400/500/600 only; ⚠ `mso-line-height-rule: exactly` on every element carrying a line-height (contract §2)
- [X] T013 [P] Add the `@font-face` block wrapped in `<!--[if !mso]><!-->…<!--<![endif]-->` with `mso-font-alt: Arial`, plus the `<!--[if mso]>` font override — ⚠ the Word engine does not walk a font stack past an unknown first family; it falls back to Times New Roman (contract §2)

### Layout and the shared building blocks

- [X] T014 Create `packages/email-kit/src/layouts/base.mjml` — the one layout: HTML5 doctype, `lang`/`dir`, the meta block (`charset`, `viewport`, `format-detection`, `x-apple-disable-message-reformatting`, `color-scheme`, `supported-color-schemes`), the 96-DPI `OfficeDocumentSettings` block, `role="article"`, the preheader slot, and `theme.mjml` included
- [X] T015 [P] Create `packages/email-kit/src/components/header.mjml` — ⚠ the wordmark as **live text**, not an image (spec FR-013; research R15: Outlook blocks images by default, SVG is now blocked across Gmail/Outlook/Yahoo, and a dark PNG disappears when the surface darkens)
- [X] T016 [P] Create `packages/email-kit/src/components/{heading,paragraph,link,divider}.mjml`
- [ ] T017 [P] Create `packages/email-kit/src/components/button.mjml` — the bulletproof pattern: `<v:roundrect>` for the Word engine plus a real `<a>` for everyone else; 48px minimum target achieved with `<td>` padding, not `height`
- [X] T018 [P] Create `packages/email-kit/src/components/code.mjml` — the 36/44 code display on the code surface at radius 8px. ⚠ Record the "this is a value treatment, not a card" justification as a comment (constitution Principle V; spec FR-014)
- [ ] T019 [P] Create `packages/email-kit/src/components/notice.mjml` — ⚠ the only block permitted a semantic colour, and it MUST carry the meaning in words as well (spec FR-028: under naive inversion the error red becomes cyan)
- [ ] T020 [P] Create `packages/email-kit/src/components/image.mjml` — `alt` mandatory, `display:block`, both HTML attributes and CSS dimensions, no `.svg`
- [X] T021 [P] Create `packages/email-kit/src/components/footer.mjml` — ⚠ one footer, not per-message: sender identity, the operator-supplied postal address, and the audience-derived support contact
- [X] T022 Apply the four generated-style rules to every component (contract §4): inline-or-it-does-not-exist, every text colour paired with its own background on the same element, inline styles express the 600px desktop layout, and no CSS custom properties (depends on T014–T021)

### The catalogue type system

- [X] T023 Create `packages/email-kit/src/catalog.ts` with the `TemplateId` union, the id grammar `^[a-z][a-z0-9]*(-[a-z0-9]+)*$`, and `MessageDefinition` per [contracts/email-catalog.contract.md](contracts/email-catalog.contract.md) §1–2
- [X] T024 Implement `Category` as a **discriminated union** in `catalog.ts` — ⚠ `transactional` has no field for an unsubscribe URL and `lifecycle` cannot omit one, so the wrong combination does not compile (spec FR-034)
- [X] T025 Implement `FailurePolicy` (`throw` | `swallow`) in `catalog.ts` and `sentBy` (`platform` | `cognito`) which selects the size budget (contract §2.2–2.3)
- [X] T026 [P] Create `packages/email-kit/src/audience.ts` — extend the profile with the reply address and wording variant; ⚠ the reply address is **derived** from audience (`hello@` customer-facing, `workspace-admin@` internal), never accepted as a parameter, so a third address is structurally impossible
- [X] T027 [P] Write `packages/email-kit/test/catalog.test.ts` — every id matches the grammar, all ids unique, and ⚠ a test that a `transactional` entry carrying an unsubscribe URL fails to typecheck

### Render and send

- [X] T028 Create `packages/email-kit/src/render.ts` — `(id, vars, audience) → { subject, preheader, html, text }`; pure, no I/O; Handlebars compiled lazily and cached at module scope, never per invocation
- [X] T029 Add runtime schema validation to `render.ts` for payloads that crossed an unchecked boundary, reporting failures **with the template id** (spec FR-005)
- [X] T030 Create `packages/email-kit/src/index.ts` — the `.` entrypoint exporting catalogue + render + tokens. ⚠ Assert by test that it pulls in **no** AWS SDK and performs no I/O (plan § R5)
- [X] T031 Create `packages/email-kit/src/send.ts` — the `./send` entrypoint: SESv2 `SendEmail` with `Simple` content carrying **both** `Html` and `Text`, `ConfigurationSetName`, `ReplyToAddresses`, the `effy-template` message tag and the `X-Effy-Template` header (contract §3)
- [X] T032 Read sender, reply address and configuration set in `send.ts` from the SSM-published contract via env — ⚠ never a literal; this slice must not reintroduce the hardcoded copies [037's ssm-mail contract](../037-platform-email-delivery/contracts/ssm-mail.contract.md) removed
- [X] T033 Apply the declared `FailurePolicy` inside `send.ts` so the caller does not choose (contract §3.4)
- [X] T034 Add structured send logging to `send.ts` — exactly `template_id`, `audience`, `outcome`, `duration_ms`, `message_id`. ⚠ **Never** the address, the code, or any rendered content
- [X] T035 [P] Write `packages/email-kit/test/render.test.ts` — substitution, ⚠ **escaping of markup-bearing values** (spec FR-031: SES's own engine does not escape and its docs say so), and audience-derived reply address
- [ ] T036 [P] Write `packages/email-kit/test/send.test.ts` with a mocked SESv2 client — tag and header present, both body parts present, failure policy honoured, and no PII in any log line

### Persistence

- [X] T037 [P] Create the Goose migration `db/migrations/<timestamp>_email_template_attribution.sql` — `ALTER TABLE public.email_delivery_event ADD COLUMN template_id text NULL`. ⚠ Nullable permanently; see [data-model.md](data-model.md) for both reasons
- [X] T038 [P] Extend `apis/edge-api/admin/src/functions/ses-event-consumer.ts` to read `mail.tags['effy-template']` and persist it to `template_id`, tolerating its absence
- [X] T039 [P] Surface `template_id` in the deliverability read model in `apis/edge-api/admin/src/deliverability/` — ⚠ present `NULL` as *"sent by Cognito, or sent before 038"*, not as unknown

**Checkpoint**: the mechanism exists. No message has been authored yet.

---

## Phase 3: User Story 1 — A shopper receives a sign-in code that looks like Effy sent it (Priority: P1) 🎯 MVP

**Goal**: the platform's highest-volume message — and, for three of four audiences, the only credential
that exists — arrives in the Effy design and works.

**Independent Test**: trigger a sign-in on a live pool; the received message renders with the Effy
design in a real inbox, the code works, and sign-in completes.

- [X] T040 [P] [US1] Author `packages/email-kit/src/templates/auth-sign-in-code.mjml` from the wireframe and copy in [spec.md](spec.md) § D5, composed **only** from the Phase 2 building blocks
- [X] T041 [P] [US1] Author `packages/email-kit/src/text/auth-sign-in-code.txt.hbs` — ⚠ **hand-written**, not stripped from the HTML (research R15: MJML output is nested layout tables, and several Android clients take the preview line from this part)
- [X] T042 [P] [US1] Create `packages/email-kit/src/fixtures/auth-sign-in-code.json`
- [X] T043 [US1] Add the `auth-sign-in-code` catalogue entry — `transactional`, `sentBy: platform`, ⚠ `onSendFailure: "throw"`, all four audiences; subject carries the code (spec FR-049), preheader must not (spec FR-032)
- [X] T044 [US1] Confirm the message contains **no clickable link other than the support contact** (spec FR-050) — consistent with the platform's existing refusal to train people to click links in unsolicited credential mail
- [X] T045 [US1] Derive the stated expiry from the same value that governs the code's real lifetime (`OTP_TTL_SECONDS`) — ⚠ a message claiming five minutes while the code lasts ten is a support ticket the platform generated itself
- [X] T046 [US1] Rewrite `apis/edge-api/auth/src/otp/mailer.ts` to delegate to `@effy/email-kit/send`, deleting the inline `string[]` body and the local SES client
- [X] T047 [US1] ⚠ Preserve the mailbox-simulator phantom path in `mailer.ts` **exactly** — it is a security control, not a test fixture: it keeps the same call on the same path so account existence cannot leak through latency (035 FR-016 / spec FR-052)
- [X] T048 [US1] Extend `apis/edge-api/auth/src/lib/audience.ts` with the fields email needs, keeping ⚠ fail-closed-on-unknown-pool behaviour unchanged
- [X] T049 [P] [US1] Add `@effy/email-kit` to `apis/edge-api/auth/package.json` and confirm the esbuild bundle stays lean — ⚠ MJML must not be reachable from this service (5-second Cognito wall)
- [X] T050 [P] [US1] Update `apis/edge-api/auth/src/otp/mailer.test.ts` for the new delegation, keeping the throw-on-failure and no-logging assertions
- [ ] T051 [US1] 🧑‍💻 `make edge-deploy SERVICE=auth ENV=dev`
- [ ] T052 [US1] 🧑‍💻 Sign in on the **customer** pool with a real dev account — confirm the design renders, the code works and sign-in completes (spec SC-001). ⚠ **Stop here if anything is wrong**; Phase 5 widens the blast radius to sign-up and recovery
- [ ] T053 [US1] 🧑‍💻 Repeat on **driver**, **shop** and **back-office** — each shows its own product name and the internal wording (spec SC-001)

**Checkpoint**: the sign-in code is live and branded on all four audiences. MVP delivered.

---

## Phase 4: User Story 2 — An engineer adds the platform's next email without inventing anything (Priority: P1)

**Goal**: the guards that make the system real. Without them User Story 1 decays within three slices,
because copy-paste is easier than a system nobody enforces.

**Independent Test**: add a message end to end using only the building blocks, authoring no layout or
styling; then break each guard and confirm each fails **and names the offending template**.

### The generator, checker and preview

- [X] T054 [US2] Complete `packages/email-kit/scripts/gen-email.mjs` — compile every `.mjml` through MJML and write `dist/<id>.html`, `dist/<id>.txt`, `dist/templates.generated.ts` and `dist/manifest.json` in **one pass**. ⚠ `{{vars}}` and `{####}` survive compilation intact (the thoughtbot pattern, research R1)
- [X] T055 [US2] ⚠ Ensure `gen-email.mjs` does **not** minify — minifying MJML output with a web-oriented minifier breaks email clients (Artsy, in production)
- [X] T056 [US2] Write `packages/email-kit/scripts/preview.mjs` — render every catalogue entry against its fixture into `dist/preview/`, plus an index page. ⚠ It MUST use the **same render path as production** (spec FR-041); a preview from a different path can show something no recipient will receive
- [X] T057 [US2] Create `packages/email-kit/scripts/check-email.mjs` as a zero-dependency guard in the style of `design-system/scripts/check-tokens.mjs`, with every failure **naming the template**

### The 12 checks (contract §4)

- [X] T058 [P] [US2] C-12 drift — regenerate `dist/` and byte-compare HTML, text, the runtime module and the manifest
- [X] T059 [P] [US2] C-11 — the committed `.html` and `dist/templates.generated.ts` carry byte-identical content (the two-artifact guard from plan § Complexity Tracking)
- [X] T060 [P] [US2] C-01/C-02 completeness in `packages/email-kit/scripts/check-email.mjs` — every id has HTML, text, subject, preheader and a schema-valid fixture; grammar and uniqueness asserted
- [X] T061 [P] [US2] C-09 size — ⚠ **two budgets**: 90 KB warn / 102 KB fail for every template, and **20,000 characters fail** for `sentBy: "cognito"` entries (research R14)
- [X] T062 [P] [US2] C-10 text part in `packages/email-kit/scripts/check-email.mjs` — present, non-empty, no HTML entities, no markup
- [X] T063 [P] [US2] C-03/C-04 placeholder integrity in `packages/email-kit/scripts/check-email.mjs` — every declared variable appears in both forms, **and** every placeholder in either form is declared (⚠ the reverse direction catches a renamed variable)
- [X] T064 [P] [US2] C-05/C-06 — `{####}` appears in exactly the `sentBy: "cognito"` templates, and ⚠ Handlebars does not consume it, proven by rendering and comparing rather than by reading the grammar
- [X] T065 [P] [US2] C-07/C-08 category in `packages/email-kit/scripts/check-email.mjs` — no unsubscribe affordance in a transactional message; present and inside the first 90 KB for a lifecycle one
- [X] T066 [P] [US2] Banned techniques — greppable: `display:flex|grid`, `float:`, `position:absolute|fixed|sticky`, `var(`, `--custom-prop:`, `@supports`, `clamp(`, `:has(`, `rem` in inline styles, `.svg`, inline `<svg>`
- [X] T067 [P] [US2] Structural checks — no `<style>` inside `<body>`; ⚠ no nested `@` rule (a nested at-rule makes Gmail discard the **entire** style block); balanced `<!--[if` / `<![endif]-->`; one `<h1>`; headings in order; `lang`/`dir`; `role="presentation"` on layout tables; `alt` on every image; the meta block complete
- [X] T068 [US2] Contrast over **three** passes — light, the authored dark restatement, and ⚠ the **algorithmically inverted** light palette. The third pass is valid only because the ramp is achromatic, and it models what a client that ignores the restatement will actually show (contract §5)
- [X] T069 [P] [US2] Mid-tone ban — no `#707070`–`#909090` on any text or divider (research R13)

### The second message — the proof that adding one is cheap

- [X] T070 [P] [US2] Author `packages/email-kit/src/templates/account-password-changed.mjml`, its `.txt.hbs` and its fixture. ⚠ **No recovery link, ever** — that link is itself a phishing primitive and may be arriving in an inbox an attacker already controls
- [X] T071 [US2] Add the `account-password-changed` catalogue entry — ⚠ `onSendFailure: "swallow"`, because the password has already been changed and failing the request would tell the customer a lie
- [X] T072 [US2] Rewrite `apis/edge-api/customer/src/password/notify.ts` to delegate to `@effy/email-kit/send`, keeping its loud log on failure
- [ ] T073 [US2] ⚠ Confirm **no email content remains authored inside any request handler** across the repository (spec FR-057, SC-002) — both hand-rolled mailers removed, not left alongside

### Config-contract and typecheck guards

- [X] T074 [US2] ⚠ Write `apis/edge-api/auth/src/lib/mail.config.test.ts` — parse the **real `serverless.yml`** and assert every variable `send.ts` reads is declared there. This is the **fifth** recurrence of one defect (027 R13 → 029 → 033 → 035, where 100 passing tests missed four undeclared variables because they set them themselves)
- [X] T075 [P] [US2] Mirror that config-contract test in `apis/edge-api/customer/`
- [X] T076 [P] [US2] Add `MAIL_*` and the allowlist variable to `apis/edge-api/{auth,customer}/serverless.yml`, resolved from SSM
- [X] T077 [US2] 🧑‍💻 **Prove every guard by breaking it** — walk the 12-row table in [quickstart.md](quickstart.md) §1a; each must fail and name the template, and the three typecheck rows must fail at `tsc`, not at lint (spec SC-010)
- [X] T078 [US2] 🧑‍💻 Demonstrate SC-003: add a throwaway message touching **only** a catalogue entry, a `.mjml`, a `.txt.hbs` and a fixture — no layout, styling, colour, typography or footer authored. ⚠ If it needs layout, the building-block set is incomplete and *that* is the defect. Revert afterwards

**Checkpoint**: the system enforces itself, and a second message has been added through it.

---

## Phase 5: User Story 3 — Every email the platform sends shares one identity (Priority: P1)

**Goal**: bring Cognito's four messages under the system, so the first email every new customer
receives is not the unbranded one.

**Independent Test**: complete a sign-up and a password reset on a live pool; both arrive in the
platform design and both codes work.

- [X] T079 [P] [US3] Author `packages/email-kit/src/templates/auth-sign-up-code.mjml` + text + fixture — ⚠ emits `{####}`, declares **no** `code` variable
- [X] T080 [P] [US3] Author `auth-password-reset-code.mjml` + text + fixture
- [X] T081 [P] [US3] Author `auth-email-verification-code.mjml` + text + fixture
- [X] T082 [P] [US3] Author `auth-step-up-code.mjml` + text + fixture. ⚠ This is **not** the passwordless sign-in code — that is 035's custom challenge, already `auth-sign-in-code`
- [X] T083 [US3] Add all four catalogue entries with `sentBy: "cognito"`, which selects the ⚠ 20,000-character budget
- [X] T084 [US3] Create `apis/edge-api/auth/src/functions/custom-message.ts` — resolve audience from `event.userPoolId`, map `triggerSource` to a template per [contracts/cognito-custom-message.contract.md](contracts/cognito-custom-message.contract.md) §2, render, set `response.emailMessage` and `response.emailSubject`
- [X] T085 [US3] ⚠ Use `request.codeParameter` **as given** — the platform never sees the code; Cognito substitutes the placeholder after the trigger returns (contract §3)
- [X] T086 [US3] ⚠⚠ Implement the **total** fail-safe: catch everything and return the event **unmodified** so Cognito falls back to its default template. A throw here fails sign-up and password recovery outright. No rethrow (contract §4)
- [X] T087 [US3] Fail closed on an unknown `userPoolId` and on an unmapped `triggerSource`, both by returning unmodified; pass `CustomMessage_AdminCreateUser` through untouched
- [X] T088 [US3] Log `triggerSource`, resolved audience and error name only — ⚠ never the address, `userAttributes`, or the rendered body
- [X] T089 [P] [US3] Write `apis/edge-api/auth/src/functions/custom-message.test.ts` — each trigger source maps correctly; ⚠ an unknown pool, an unmapped source, a render failure and an oversize output each return the event unmodified and **never throw**; the response carries only `emailMessage` and `emailSubject` (spec FR-056)
- [X] T090 [US3] Register the function in `apis/edge-api/auth/serverless.yml` with `timeout: 5` — ⚠ Cognito abandons a trigger at 5 seconds regardless
- [X] T091 [P] [US3] Add `custom_message` to `lambda_config` in `infra/modules/cognito-user-pool/main.tf` plus the matching `aws_lambda_permission`, and the variable in `variables.tf`
- [X] T092 [P] [US3] Wire the ARN variable through `infra/envs/dev/auth-{customer,driver,shop,back-office}.tf` — four new permissions, bringing the service's total from 16 to 20, no wildcards
- [ ] T093 [US3] 🧑‍💻 `make edge-deploy SERVICE=auth ENV=dev` — ⚠ **stage one**: the function must exist before its ARN is set, because Cognito validates the trigger on `UpdateUserPool`
- [ ] T094 [US3] 🧑‍💻 Set `custom_message_lambda_arn` for all four pools in `dev.tfvars`, then `make plan ENV=dev` — ⚠ **READ THE PLAN AND ABORT IF ANY POOL WOULD BE REPLACED**; a replaced pool destroys every account on the platform (035 FR-030)
- [ ] T095 [US3] 🧑‍💻 `make apply ENV=dev` — stage two
- [ ] T096 [US3] 🧑‍💻 Walk sign-up, resend, forgot-password and email-verification — ⚠ confirm each carries a **real code, not a literal `{####}`**, and each flow completes (spec SC-017)
- [ ] T097 [US3] 🧑‍💻 ⚠ **Prove the fail-safe by causing it** (spec SC-018): force a render failure, confirm the person still receives Cognito's default message and sign-up still completes, then revert immediately. This is the single most dangerous behaviour in the slice and the only way to confirm it is to break it

**Checkpoint**: all six live messages share one identity.

---

## Phase 6: User Story 5 — A data-heavy message proves the system scales past a code (Priority: P2)

**Goal**: force the receipt components to exist and be proven, rather than designed on paper for a
future commerce slice to discover are wrong.

**Independent Test**: render an order confirmation against a large-basket fixture; the table is correct
in every target client and the output stays inside the size budget.

> Sequenced before User Story 4 deliberately: the client walk should exercise the **hardest** template,
> and a line-item table in the Word engine is harder than a code.

- [X] T098 [P] [US5] Create `packages/email-kit/src/components/rows.mjml` — key/value detail rows for totals and addresses
- [X] T099 [P] [US5] Create `packages/email-kit/src/components/line-items.mjml` — ⚠ table-based, correct in the Word engine, degrading to a single column on narrow screens without a media query
- [X] T100 [US5] Author `packages/email-kit/src/templates/order-confirmation.mjml` + `.txt.hbs`, composed only from building blocks
- [X] T101 [US5] ⚠ Author `packages/email-kit/src/text/order-confirmation.txt.hbs` so line items and totals read as **text**, not collapsed table debris (spec FR-060)
- [X] T102 [US5] Add the `order-confirmation` catalogue entry. ⚠ **Template only — no call site** (spec FR-062); wiring belongs to the slice that owns order notifications
- [X] T103 [P] [US5] Create the **large-basket** fixture `packages/email-kit/src/fixtures/order-confirmation.json` — ⚠ big enough to be a real test of the 102 KB budget; three line items proves nothing (spec FR-061)
- [X] T104 [P] [US5] Create the **hostile** fixture `packages/email-kit/src/fixtures/order-confirmation.hostile.json` — product and shop names containing markup (spec SC-016)
- [X] T105 [US5] ⚠ Confirm money, dates and quantities arrive **pre-formatted as strings** (spec FR-048) — there are no formatting helpers at substitution time, and formatting is the caller's domain knowledge
- [X] T106 [P] [US5] Write `packages/email-kit/test/order-confirmation.test.ts` — the large-basket fixture stays inside budget, and the hostile fixture's markup appears as written without altering structure

**Checkpoint**: the receipt components exist and are proven.

---

## Phase 7: User Story 6 — Nobody can email a real customer from a non-production environment (Priority: P2)

**Goal**: make the canonical in-house-email disaster impossible.

**Independent Test**: in a non-production environment, a send to an unapproved recipient is refused; a
send to an approved one succeeds.

- [X] T107 [US6] Add the fail-closed allowlist to `packages/email-kit/src/send.ts` — refuse any recipient outside the allowlist whenever `EFFY_ENV !== 'prod'`; always permit `@simulator.amazonses.com`; refuse loudly and record it
- [X] T108 [P] [US6] Add `/effy/<env>/mail/nonprod_allowlist` and `/effy/<env>/mail/postal_address` to `infra/envs/dev/dns.tf`, and extend [037's ssm-mail contract](../037-platform-email-delivery/contracts/ssm-mail.contract.md) with both keys
- [X] T109 [P] [US6] ⚠ Add Terraform validations in `infra/envs/dev/variables.tf` that **refuse a placeholder** for both values — the mechanism 037's `alert_email` validation already establishes. Neither may be inferred (constitution: Real-World Identifiers)
- [X] T110 [P] [US6] Write `packages/email-kit/test/allowlist.test.ts` — refused outside the list, permitted inside it, permitted for the simulator, and ⚠ **not bypassable by configuration alone**
- [ ] T111 [US6] 🧑‍💻 Supply the two operator values in `dev.tfvars` and `make apply ENV=dev` ([quickstart.md](quickstart.md) §0)
- [ ] T112 [US6] 🧑‍💻 Walk the three allowlist rows in [quickstart.md](quickstart.md) §3b (spec SC-012)
- [ ] T113 [US6] 🧑‍💻 Prove attribution: send to `bounce+auth-sign-in-code@simulator.amazonses.com` and confirm a row lands in `public.email_delivery_event` with `template_id = 'auth-sign-in-code'`. ⚠ Simulator bounces do not touch the suppression list, the daily quota, or the bounce rate — but you are still billed
- [ ] T114 [US6] ⚠ Record in [quickstart.md](quickstart.md) that the allowlist **cannot** protect Cognito-sent messages — Cognito sends those itself. Dev pools containing only operator-created accounts is a mitigation, not a guarantee

**Checkpoint**: dev cannot mail a stranger from any platform-owned send path.

---

## Phase 8: User Story 4 — A message survives the inbox it actually lands in (Priority: P2)

**Goal**: the operator's explicit requirement — every email client loads the templates without issue.

**Independent Test**: send one message to a seed inbox on each target client and inspect it.

> ⚠ **Nothing open-source renders the Word engine.** This phase is a human walk and cannot be
> automated. This platform has a documented pattern of machine-verified work that was never walked on
> a device (028 recorded it and asked that it not be repeated; 029, 033 and 035 repeated it). These
> tasks are the deliverable, not a formality.

- [ ] T115 [US4] 🧑‍💻 Send `auth-sign-in-code` and `order-confirmation` to a seed inbox on **Apple Mail (iOS + macOS)** — the baseline, and the only bucket where the web font loads
- [ ] T116 [US4] 🧑‍💻 **Gmail web** and **Gmail Android** — ⚠ Android does **partial** inversion, the dangerous one; look specifically for dark-on-dark
- [ ] T117 [US4] 🧑‍💻 ⚠ **Gmail app with a non-Google address** — no `<style>` at all. The message must be completely correct on inline styles alone (spec FR-020). This is the strictest case in the matrix
- [ ] T118 [US4] 🧑‍💻 ⚠ **Classic Outlook for Windows** (Word engine) — layout holds, width correct, **typeface is sans-serif and not Times New Roman**, square corners are acceptable, and the line-item table is correct
- [ ] T119 [US4] 🧑‍💻 **Outlook.com with dark appearance** (partial inversion + the `[data-ogsc]` mirror) and one full-inversion client (Gmail iOS) — the ramp flips end-for-end and stays legible (spec SC-007)
- [ ] T120 [US4] 🧑‍💻 **Images blocked** — ⚠ the wordmark is still present because it is live text, and nothing is lost (spec SC-005)
- [ ] T121 [US4] 🧑‍💻 **Plain-text only** — the purpose-written text version, not table debris (spec SC-008)
- [ ] T122 [US4] 🧑‍💻 **Phone** — body text ≥ 16px, no horizontal scroll, tappable targets ≥ 48px (spec FR-029)
- [ ] T123 [US4] 🧑‍💻 **Preview line** on each client — states the purpose, does not repeat the subject, ⚠ does not leak the code (spec FR-032)
- [ ] T124 [US4] Record the results in [quickstart.md](quickstart.md) §5 and open a defect for anything that fails, rather than adjusting the expectation

**Checkpoint**: the templates are proven where recipients actually read them.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [ ] T125 🧑‍💻 ⚠ **Measure Cognito's `emailMessage` length limit** against a live pool and write the figure back into [research.md](research.md) R14 and the T061 guard — it is recorded at **medium confidence**, binds four of seven templates, and is ~5× tighter than the Gmail budget ([quickstart.md](quickstart.md) §6)
- [ ] T126 [P] Add the CloudWatch metric filters for `effy_email_sent_total` and `effy_email_send_failed_total` in `infra/envs/dev/`, with low-cardinality labels (the template id set is closed)
- [X] T127 [P] Add the send-failure alarm routed to `/effy/<env>/alerts/topic_arn` — ⚠ severity-1 by nature: on driver, shop and back-office a failed send **is** a failed sign-in. It complements 037's four delivery alarms (which watch what happens after SES accepts) rather than duplicating them
- [X] T128 [P] Run the secret/PII sweep — ⚠ no address, code or message content in any log (spec SC-019)
- [X] T129 [P] Confirm `check-no-emerald.sh`, `check-no-jade.sh`, `check-no-phantm` and `tokens:check` all pass unchanged — this slice introduces **no** token and **no** third hue
- [X] T130 [P] Update `docs/audiences/customer-capabilities.md` with a §038 entry
- [X] T131 [P] Update `CLAUDE.md` § Current status and § Active feature
- [X] T132 Full verification sweep: `pnpm -r typecheck` · `pnpm -r test` · `make email-check` · `terraform validate` + `fmt` · `make lint`. ⚠ Count the reporting packages — `pnpm -r test` was once green while `typecheck` failed, because vitest does not run `tsc`
- [ ] T133 🧑‍💻 Walk the [quickstart.md](quickstart.md) §7 sign-off checklist and record the four known limitations rather than leaving them to be discovered
- [ ] T134 🧑‍💻 Write `specs/038-email-template-system/SIGNOFF.md` and commit the slice

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 Setup** — no dependencies.
- **Phase 2 Foundational** — depends on Setup. ⚠ **BLOCKS every user story.**
- **Phase 3 (US1)** — depends on Foundational. **The MVP.**
- **Phase 4 (US2)** — depends on Foundational. Can run in parallel with US1 up to T077, which wants US1's template to exist to break.
- **Phase 5 (US3)** — depends on Foundational; ⚠ **should follow US1's live walk (T052)**. If the sign-in code is broken, do not widen the blast radius to sign-up and recovery.
- **Phase 6 (US5)** — depends on Foundational only. Fully parallel with US1/US2/US3.
- **Phase 7 (US6)** — depends on T031 (`send.ts`) only.
- **Phase 8 (US4)** — ⚠ depends on US1 **and** US5, because the walk should exercise the hardest template.
- **Phase 9 Polish** — depends on the desired stories being complete.

### Critical-path constraints (non-obvious)

- **T093 → T094 → T095 is a hard sequence.** Cognito validates a trigger on `UpdateUserPool`, so the function must be deployed before its ARN is set. One combined apply fails.
- **T052 gates T093.** Prove the code email before touching sign-up and recovery.
- **T098/T099 gate T100.** The line-item components must exist before the template composes them.
- **T037 → T038 → T113.** Column, then consumer, then the live attribution proof.
- **T125 could invalidate T079–T083.** ⚠ If Cognito's real limit is materially below 20,000, four templates need redesigning. Measuring it **early** — during Phase 5 rather than in Polish — is cheap insurance.

### Parallel opportunities

- **Phase 1**: T003, T004, T005, T006 together.
- **Phase 2**: T011–T013 together; T015–T021 (seven components, seven files) together; T026/T027 together; T035/T036 together; T037–T039 together.
- **Phase 4**: T058–T067 and T069 — ten independent checks in one file's test suite, authorable in parallel.
- **Phase 5**: T079–T082 (four templates) together; T091/T092 together.
- **Phase 6**: T098/T099 together; T103/T104 together.
- **Phase 9**: T126–T131 together.

---

## Parallel Example: Phase 2 building blocks

```bash
Task: "Create header.mjml — wordmark as live text, not an image"
Task: "Create heading/paragraph/link/divider.mjml"
Task: "Create button.mjml — VML roundrect + real <a>, 48px via td padding"
Task: "Create code.mjml — 36/44 on the code surface, radius 8"
Task: "Create notice.mjml — the only block with a semantic colour, meaning in words too"
Task: "Create image.mjml — alt mandatory, display:block, no .svg"
Task: "Create footer.mjml — one footer, operator-supplied postal address"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 Setup → Phase 2 Foundational → Phase 3 (US1).
2. **STOP and VALIDATE** at T052/T053: the sign-in code, live, on all four audiences.
3. That alone is shippable — it replaces a plain-text credential email with a designed one on the
   platform's highest-volume message.

### Incremental delivery

| Increment | Delivers |
| --- | --- |
| Setup + Foundational | The mechanism |
| **+ US1** | 🎯 **MVP** — the sign-in code, branded, live |
| + US2 | The guards; a second message added *through* the system |
| + US3 | One identity across all six live messages |
| + US5 | The receipt components, proven |
| + US6 | Dev cannot mail a stranger |
| + US4 | Proven where recipients actually read |
| + Polish | Telemetry, alarms, sign-off |

### ⚠ Where this slice is most likely to go wrong

1. **T125 measured too late.** If Cognito's limit is materially under 20,000, four templates need
   redesigning. Measure it during Phase 5.
2. **T077 skipped or done by reasoning.** A guard nobody has broken is a guard nobody knows works —
   028 marked six verification tasks complete on reasoning and three defects fell out of the re-audit.
3. **Phase 8 deferred "until later."** It is the one thing no test can substitute for, and it is the
   phase this repository has skipped four slices running.
4. **T073 left half-done.** Leaving either hand-rolled mailer alongside the system preserves exactly
   the duplication the slice exists to end.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- 🧑‍💻 = operator-run: deploys, migrations, live AWS, or a human looking at an inbox.
- Commit after each logical group; stop at any checkpoint to validate a story independently.
- ⚠ **Four limitations are known and must be recorded at sign-off, not discovered**: attribution and
  the allowlist cover platform-sent messages only; `order-confirmation` has no call site by design;
  full `caniemail` conformance, visual regression and Mailpit are deferred by decision; and Australia's
  Spam Act 2003 treatment of lifecycle mail is unverified (it blocks no part of this slice, which is
  entirely transactional, but must be settled before any lifecycle message is authored).

---

## Implementation status — update 5 (2026-08-07): Polish (Phase 9, non-operator)

**101 / 134 tasks complete. Every Claude-authorable task in the slice is now done.** What remains is
purely operator work: deploy, live walks, the client-matrix inspection, and sign-off/commit.

**Done this increment**: T127 (a `custom_message_fallback` CloudWatch alarm — the one blind spot the
interceptor introduces); T128 (PII-in-logs sweep, clean); T129 (retired-hue guards pass); T130 (the
§038 parity register entry); T131 (CLAUDE.md § Active feature); T132 (the full verification sweep).

**Verified**: `pnpm -r typecheck` **14/14** · `pnpm -r test` **1165 passed** · `make email-check` (7
templates) · `terraform validate`/`fmt` clean · `check-no-emerald`/`check-no-jade` pass · PII sweep
confirms every log line carries only `template_id`/`audience`/`outcome`/`duration_ms`/`message_id` (or
`err.name`) — never an address, code or body.

### ⚠ The fallback metric was made meaningful before it was alarmed

`custom_message_fallback` originally fired on **every** pass-through, including a benign unmapped
trigger (AdminCreateUser). An alarm on that would cry wolf on normal un-branded flows. The handler now
emits it ONLY on a genuine branding failure (a render error or a placeholder mismatch) — a benign
pass-through emits nothing, and an unknown pool emits the existing `otp_unknown_pool` (already
alarmed), not a double-count. So a non-zero `custom_message_fallback` is always actionable: a message
we were supposed to brand could not be, the person still got Cognito's default, and nothing else would
have said so. Three tests pin the semantics.

### ⚠ T126 (generic sent/failed metric filters) DEFERRED, with reason

The plan listed log-metric-filters for `effy_email_sent_total`/`effy_email_send_failed_total`. Not
built, deliberately: the sign-in send — the critical path — is **already** metered by `otp_send_failed`
(+ its 037-fixed alarm), and 037 has four delivery alarms. A generic per-template/per-audience metric
via log filters is untested infra prone to the exact "config that looks right and silently does
nothing" failure this platform keeps hitting (035's dimension bug), and there is no Grafana dashboard
or send volume to consume it yet. The honest time to build it is when there is data to measure. The
one real new blind spot — a Cognito message silently falling back — got its alarm (T127) instead.

### Component files left unbuilt, resolved-as-won't-build

T017 (`button.mjml`), T019 (`notice.mjml`), T020 (`image.mjml`): no shipping message needs them, and
MJML's own `mj-button` already covers the one button (update 4). Building unused blocks would be
designing against requirements that do not exist.

### What remains — ALL operator

Deploy + live walks (T051–T053, T093–T097, T111–T114); the client-matrix walk (Phase 8, T115–T124 —
nothing open-source renders the Word engine); ⚠ **T125** (measure Cognito's real char limit); and
sign-off + commit (T133–T134). The order-confirmation wiring belongs to a later slice by design.

---

## Implementation status — update 4 (2026-08-07): the commerce proof (Phase 6)

**95 / 134 tasks complete.** The seventh template — `order-confirmation` — is built from the system's
own blocks and proves the receipt components work: a line-item table that survives the Word engine,
a totals block, money formatting, and the size budget **under render with a 25-item basket**.

**Done this increment**: T098–T106 (the `line-items` and `rows` components as real `mj-include`s; the
`order-confirmation` template + hand-authored text part + catalogue entry; a 25-item large-basket
fixture and a hostile fixture; the render test proving budget + escaping). It is **template-only** —
no call site (FR-062); wiring belongs to the order-notifications slice.

**Verified**: `pnpm -r typecheck` **14/14** · `pnpm -r test` **1161 passed** (+7) · `make email-check`
green (7 templates) · **rendered order-confirmation with 25 items ≈ 33 KB, well under Gmail's 102 KB**
· `make email-preview` shows all seven.

### ⚠ The var system was extended (honestly) rather than the template left untyped

A receipt needs a **typed array of line-item objects** for `{{#each items}}`. The catalogue's `VarSpec`
gained an `ObjectArraySpec` (`{ of: { name, quantity, lineTotal } }`) with full type mapping and
runtime validation, so the order-confirmation's items are as type-safe at a (future) call site as any
scalar. Leaving it untyped would have handed the wiring slice an untyped template — the opposite of
the point of building the proof now.

### ⚠ Three defects the receipt surfaced, all fixed

1. **⚠ The static size guard is a floor, not the budget, for a looped template.** `order-confirmation`'s
   dist artifact is 28 KB with the `{{#each}}` loop written **once**; the real email expands it to 25
   rows. The true budget test — **rendered** HTML with the largest basket under 102 KB — lives in
   `order-confirmation.test.ts` (FR-061), and the catalogue tripwire was re-scoped to check the Gmail
   budget for platform templates and the Cognito budget for Cognito ones, not one limit for all.
2. **⚠ THE BUTTON WAS INVISIBLE IN DARK MODE.** MJML puts `css-class` on the button's outer padding
   `<td>`, but the fill (`background:#1a1a1a`) is on an **inner** `<td>`. The invert rule hit the
   padding cell, so in dark mode the fill stayed dark under a label that inverted to dark
   (dark-on-dark), and on a dark canvas the un-inverted button blended in. Fixed by targeting
   `.e-btn-bg td` (the fill) — the same nested-element class of defect the text-colour rules already
   had. Button now inverts cleanly: 17.4:1 light, 15.96:1 dark.
3. **The receipt tables needed `role="presentation"`.** A line-item table is a visual layout read
   linearly by a screen reader, not a `<th>`-headed data table. `mj-table role="presentation"` passes
   through; the guard (which requires it on every table) stays honest.

### ⚠ T017 (a hand-rolled `button.mjml`) is confirmed UNNECESSARY

MJML's own `mj-button` emits a table-based button with `mso-padding-alt` — functional and legible in
the Word engine (square corners there, rounded elsewhere, the same tradeoff already accepted for the
code block). A bespoke VML `<v:roundrect>` component would add markup for corners Outlook squares
anyway. Left open in the list but resolved-as-won't-build; `notice`/`image` (T019/T020) likewise
remain unbuilt because no shipping message needs them.

---

## Implementation status — update 3 (2026-08-07): the Cognito interceptor (Phase 5) + allowlist infra

**86 / 134 tasks complete.** All six of the platform's live message types now have a branded template
and a path to the recipient, and **every email the platform can send — its own two plus Cognito's
four — is defined in one catalogue.** Still no deploy.

**Done this increment**: T079–T083 (the four Cognito templates + text + fixtures + catalogue entries,
all `sentBy: "cognito"`, all emitting `{####}` and declaring no `code` variable); T084–T090 (the
`custom-message.ts` interceptor + its test + serverless registration); T091–T092 (Terraform: the
`custom_message` trigger in the cognito module, one `aws_lambda_permission` per pool, the ARN wired
through all four env pools, two-stage variable); plus Phase 7 infra T108–T109 (the three new SSM keys
— `ses/reply_to_internal`, `mail/nonprod_allowlist`, `mail/postal_address` — with a placeholder-
refusing validation on the postal address). T107/T110 (allowlist code + test) landed in update 2.

**Verified**: `pnpm -r typecheck` **14/14** · `pnpm -r test` **1154 passed** (+1 over update 2 net of
the interceptor's 17 new tests and re-tallied loops) · `make email-check` green (6 templates, all under
the 20,000-char Cognito budget: 15.5–15.8k) · `make email-preview` renders all six with `{####}`
visible · `terraform validate` + `fmt` clean · ⚠ **the interceptor bundle carries neither the MJML
compiler NOR the SES client** (0 and 0) — the config refactor below is what buys the second zero.

### ⚠ Decisions made building the interceptor (recorded)

1. **The pure env-config was split out of `send.ts` into `config.ts`.** The interceptor RENDERS and
   lets Cognito send, so it must not drag the SES client into a *second* Lambda behind the 5-second
   wall. `identityFromEnv`/`MailConfigError`/`MAIL_ENV_KEYS` moved to a pure module, re-exported from
   both `.` and `/send`. Proven: the interceptor bundle references the SES client **zero** times.
2. **The four Cognito templates carry a NARROW id union in the handler** (`CognitoTemplateId`), not the
   broad `TemplateId` — otherwise `VarsFor<TemplateId>` is the *intersection* of every template's vars
   and `render(id, {})` would not compile. All four have empty vars, so the narrow union's `VarsFor`
   is `{}`.
3. **⚠ A placeholder guard beyond the spec.** The templates bake in the literal `{####}`, but the
   handler also checks `event.request.codeParameter` matches it — if Cognito ever passed a different
   placeholder token, the baked-in one would never be substituted and the message would ship a literal
   `{####}` with no code. On mismatch it falls back. Cheap insurance for a decade-stable but
   documented-as-configurable value.
4. **`account-password-changed` and the Cognito templates share the audience-neutral footer**, so the
   footer's `{{#if effyPostalAddress}}` guard (added in update 2) matters for all six.

### ⚠ Two live defects the interceptor work surfaced (both in email-kit, both fixed)

Neither was introduced here — both were latent in the generated `theme.mjml` and only became visible
when a second family of templates exercised the head furniture:
- **A head-level HTML comment between two `<mj-raw>` blocks silently DROPPED the following raw block**
  under `keepComments:false` — deleting the `color-scheme` meta tags and the MSO Times-New-Roman
  override from every message. The guard caught it; the fix is that the generated `theme.mjml` now
  carries **no loose HTML comments in the head** (rationale lives in the generator's JS).
- These were fixed during update 2's regen but are noted here because the interceptor's four templates
  are what made the furniture's absence a six-way problem rather than a two-way one.

### Still not started

Phase 3 deploy + live walk (T051–T053), Phase 5 deploy + walk (T093–T097 — the two-stage trigger-ARN
dance and the fail-safe proof), Phase 6 (order-confirmation — needs the `line-items`/`rows` components,
T098–T106), Phase 7 operator apply + walks (T111–T114), Phase 8 (client matrix), Phase 9 (telemetry,
alarms, sign-off). ⚠ **T125 (measure Cognito's real char limit) is now the most valuable open
non-operator item** — all four Cognito templates are sized against the medium-confidence 20,000.

---

## Implementation status — update 2 (2026-08-07): the wiring increment

**68 / 134 tasks complete.** The two built messages are now **wired into the live services** (still
no deploy). Both hand-assembled mailers are gone — every email the platform's own code sends goes
through `@effy/email-kit`.

**Done this increment**: T037–T039 (the `template_id` migration + attribution through 037's consumer,
its parser, its repository, and the back-office detail screen — a null renders "Cognito / pre-038",
not blank); T046–T050 (`otp/mailer.ts` is a thin adapter; the phantom/timing-parity path preserved;
the mailer test rewritten to prove the delegation contract through the SES mock); T072
(`password/notify.ts` delegates, keeps swallow-on-failure); T074–T076 (config-contract tests in both
services, plus the two new mail env vars in both `serverless.yml`s).

**Verified**: `pnpm -r typecheck` **14/14** · `pnpm -r test` **1137 passed** (+25 net, no
regressions) · `make email-check` green · ⚠ **the auth Lambda bundle is 287 KB with the MJML compiler
absent** (`grep -c mjml-core` = 0) — only the Handlebars runtime and the inlined template strings
reach the 5-second sign-in path, which was the single largest risk in this wiring.

### ⚠ Decisions made while wiring (recorded, not silent)

1. **The email-kit → SES version skew was a real bug, fixed structurally.** email-kit pinned
   `@aws-sdk/client-sesv2` at a different patch than the edge services, so pnpm gave them **separate
   module instances** and `vi.mock` intercepted only one — every delegated mailer test failed against
   working code. Fixed by making the SES client a **peer dependency** (the consumer's one instance),
   matched to the repo version. This is the correct shape anyway: a library should not bundle a second
   copy of the platform's AWS SDK.
2. **`MAIL_POSTAL_ADDRESS` is OPTIONAL at runtime, not throwing** — a reversal of the first `send.ts`
   draft. It is operator-supplied and must never be *guessed* (constitution), but "must not be
   guessed" is not "must be present": every shipping message is transactional and CAN-SPAM-exempt from
   the address requirement, so making the only credential for three passwordless audiences depend on a
   not-yet-set value would be a self-inflicted outage. Unset → the footer omits the line (`{{#if}}`).
   ⚠ Lifecycle mail, which legally needs it, must enforce presence where such a message is authored.
3. **`MAIL_REPLY_TO_INTERNAL` added to the SSM contract, empty by default.** FR-037 (internal
   audiences reply to `workspace-admin@`) activates by config the day the operator publishes
   `/effy/<env>/ses/reply_to_internal`; until then internal mail falls back to the public reply, so
   behaviour is unchanged. No code edit needed to switch it on.
4. **The config-contract guard moved to `MAIL_ENV_KEYS`.** The env reads now live inside email-kit,
   so each service's contract test asserts it declares email-kit's exported key list — and that list
   is **self-checked against email-kit's real source** in `send.test.ts`, so it cannot drift from what
   the code reads. That is 035's defect closed at the shared boundary rather than per service.

### Still not started

Phase 3's deploy + live walk (T051–T053), all of Phase 5 (the Cognito trigger + its four templates),
Phase 6 (order-confirmation), Phase 7's allowlist wiring (T108–T114 — the code guard is built and
tested, the SSM/Terraform keys are not), Phase 8 (client-matrix walk) and Phase 9 (telemetry, alarms,
sign-off). ⚠ **T125 (measure Cognito's real message limit) should move into Phase 5.**

---

## Implementation status — update 1 (2026-08-07): the package build

**56 / 134 tasks complete.** `@effy/email-kit` exists, generates, verifies, previews and renders; two
of seven messages are authored and pass every guard. **Nothing is deployed and no service is wired
yet** — the platform still sends the two plain-text emails it sent yesterday.

**Verified**: `pnpm -r typecheck` **14/14** · `pnpm -r test` **1112 passed** (26 new, no regressions) ·
`make email-gen` · `make email-check` green · `make email-preview` renders both messages.

### ⚠ Five defects found by building, all fixed

1. **Internal commentary was being shipped inside customer email.** MJML's `keepComments` defaults to
   **true**, so every explanatory note in the `.mjml` source — including the reasoning about phishing
   primitives and account takeover — was compiled into the delivered HTML. Fixed (`keepComments:
   false`), and `check-email.mjs` now fails on any long comment. It also cost ~2 KB of a budget that
   turned out to be binding.
2. **⚠ Every message carried a request to `fonts.googleapis.com`.** MJML auto-injects a Google Fonts
   `<link>` **and** an `@import` for any family in its default map that appears in a `font-family` —
   and the platform's fallback stack names **Roboto**. That is an uninvited third-party dependency on
   the platform's most sensitive mail, a privacy leak (Google learns when a sign-in code is opened),
   and an `@import` one nesting mistake away from making Gmail discard the whole style block. Fixed
   (`fonts: {}`) and guarded.
3. **⚠ The dark-mode restatement did not work at all.** MJML puts `css-class` on the `<td>` but writes
   `color` on an inner `<div>`, and the divider's `border-top` on an inner `<p>`. So
   `.e-muted { color: … !important }` targeted the cell, lost to the div's own inline colour, and
   **every text colour in dark mode would have stayed light-mode grey** — visible only in a real
   dark-mode client. Found by reading the compiled output rather than reasoning about it. Selectors
   now reach the styled descendants.
4. **Overriding `css-class` silently dropped the dark rule.** `css-class` replaces the `mj-attributes`
   default rather than adding to it, so the heading and the code block lost `e-ink` and would have
   rendered near-black on a near-black surface.
5. **Messages had no semantic heading.** MJML renders every `mj-text` as a `<div>`, so a screen reader
   heard one undifferentiated run of text. The generator now promotes the heading cell to a real
   `<h1>` carrying the same inline style — semantics without putting font sizes back into templates.

### ⚠ Two amendments to recorded decisions

- **No `@font-face` ships, at all.** General Sans is self-hosted inside the web bundles and has no
  stable public URL; serving one is an infra task needing an operator-supplied hostname. The design is
  built to be correct in Arial (FR-015) — which ~three-quarters of opens would have seen anyway. The
  `<!--[if mso]>` override still ships and is still essential.
- **The code block is square, not `radius: 8px`** as the spec's wireframe drew. Rounding it requires
  its own section+column (`border-radius` is a column attribute) costing ~2.5 KB — **12% of the
  Cognito budget** — to buy corners the Word engine squares anyway.

### ⚠ The Cognito budget is real, and it binds NOW

Research R14 recorded ~20,000 characters at medium confidence. **The first compiled template came out
at 24,336 characters** — over the limit before a single Cognito message was authored. The cause is
MJML's **~2.5 KB per `mj-section`** scaffolding, so *section count* spends the budget, not word count.
Restructuring to three sections plus the two fixes above brought it to **~16,100**. Both templates now
sit ~19% under the limit, and the guard fails any Cognito-routed message that exceeds it.
⚠ **T125 (measuring the real limit) should move into Phase 5, not Polish.**

### Deviation: the "12 component files" are 3 files + 7 generated recipes

`mj-include` has **no parameters** — an include is spliced verbatim and cannot carry content. So
content-free structures are includes (`header`, `footer`, `divider`) and content-carrying blocks are
`mj-class` recipes generated into `theme.mjml` from the design tokens. A template still writes no hex
value, size or font; the rule is enforced by the linter instead of by file count, which is stronger.
`button`, `notice` and `image` (T017/T019/T020) are **not built** — no authored message needs one yet,
and building an unused block would be designing against requirements that do not exist.

### Not started

Phase 2's persistence (T036–T039), all of Phase 3's wiring and deploy (T046–T053), Phase 4's service
rewrites and config-contract tests (T072–T078), and **all of Phases 5–9** — the Cognito trigger, the
order-confirmation proof, the allowlist wiring, the client-matrix walk and Polish.
