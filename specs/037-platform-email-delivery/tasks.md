---
description: "Task list for 037 Platform Email Delivery"
---

# Tasks: Platform Email Delivery — Branded, Authenticated, Accountable Mail

**Input**: Design documents from `/specs/037-platform-email-delivery/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md),
[operator-inputs.md](./operator-inputs.md)

**Tests**: INCLUDED. The plan's Testing section requires them, and one class in particular —
the **config-contract test** that parses the real `serverless.yml` — is the countermeasure to a defect
that has now recurred four times (027 R13 → 029 → 033 → 035).

**Organization**: grouped by user story. Every phase is an independently deliverable increment.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: parallelizable — different files, no dependency on an incomplete task
- **[Story]**: US1…US6 from [spec.md](./spec.md)
- **🧑‍💻 OPERATOR**: the user runs this. Claude authors the code and hands over exact commands; it does
  **not** run `terraform apply`, `db-up`, `edge-deploy`, or anything touching live AWS.

---

## ⚠ Read this before starting

Three things about this slice are unusual and will cause damage if forgotten:

1. **`hello@effyshopping.com` works TODAY and is load-bearing.** Its mail-exchanger record was added by
   hand. Route 53 holds one record set per (name, type), so a second declaration **clobbers** it. Every
   apex record is **adopted first, extended second** (T041–T044), and inbound is checked before *and*
   after every apex apply.
2. **US3's apex authorisation + signing MUST land before US2's alignment policy.** This is the one
   place story independence genuinely breaks, and it is real — reversed, the policy quarantines Effy's
   own support replies, silently. See § Dependencies.
3. **The premise of this feature was already false.** Unrestricted sending is granted (research R1).
   T001 re-proves it before anything is built; `CLAUDE.md` and 035's sign-off still claim otherwise and
   are corrected in Phase 9.

---

## Phase 1: Setup

**Purpose**: prove the baseline, then declare the variables and module skeletons. No behaviour changes.

- [ ] T001 🧑‍💻 **OPERATOR — BLOCKING BASELINE.** Run [quickstart.md](./quickstart.md) § 1 (a)–(d) and record the output in a scratch note: `aws sesv2 get-account`, `aws sesv2 get-email-identity --email-identity dev.effyshopping.com`, `dig +short MX effyshopping.com`, and **a real sign-in code request to an address never registered anywhere**. ⚠ If (d) fails, stop and report — every task below assumes research R1 holds.
- [X] T002 [P] Add `workspace_dkim_public_key`, `dmarc_rua`, and `dmarc_policy` variables (with `description` and a validation block on the policy enum) to `infra/global/variables.tf`, following the `infra/modules/ssm-parameters/variables.tf` house style.
- [X] T003 [P] Set those three values in `infra/global/global.tfvars` from [operator-inputs.md](./operator-inputs.md) §1 — the 410-character key, `rua=mailto:dmarc@effyshopping.com`, policy `none`.
- [X] T004 [P] Create the `infra/modules/ses-events/` skeleton (`main.tf`, `variables.tf`, `outputs.tf`) with a file-head comment naming the slice and the contract it implements, per `infra/modules/ssm-parameters/main.tf`'s convention.
- [X] T005 [P] Add `dmarc_rua` (string, nullable) and `configuration_set_name` (string, nullable) variables to `infra/modules/ses-domain-identity/variables.tf`.
- [X] T006 [P] Create `apis/edge-api/admin/src/deliverability/types.ts` with `EmailDeliveryState`, the row types, and the DTO shapes from [contracts/deliverability-api.contract.md](./contracts/deliverability-api.contract.md).
- [X] T007 [P] Add `EmailDeliveryState` and the `CustomerDTO.emailDelivery` field to `packages/shared-types/src/customer.ts` per [data-model.md](./data-model.md) § Shared contract delta, including the ⚠ comment forbidding its exposure on unauthenticated surfaces.
- [X] T008 ⚠ Add **`@aws-sdk/client-sesv2`** (pin `3.1086.0`, matching `auth` and `customer`) and **`@aws-sdk/client-cloudwatch`** to `apis/edge-api/admin/package.json`, then `pnpm install`. ⚠ `client-sesv2` is **not currently a dependency of `admin`** — verified against its `package.json`, whose deps are cognito-idp, s3, s3-request-presigner, edge-shared, shared-types, pg, pino — yet T085, T086 and T115 all call SESv2. Without this the build fails on day one. ⚠ Do **not** add `@aws-sdk/client-sns`: the consumer is SNS-*triggered*, so it needs only the `@types/aws-lambda` event type, which is already a devDependency.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: the SSM mail contract, the configuration set, the events topic and the alerts topic.
**Every user story reads at least one of these.**

**⚠ CRITICAL**: no user story work lands before this phase.

- [X] T009 Implement `infra/modules/ses-events/main.tf`: `aws_sesv2_configuration_set` (name `${var.name_prefix}-mail`), `aws_sns_topic` for SES events, its `aws_sns_topic_policy` allowing `ses.amazonaws.com` to `sns:Publish` conditioned on `aws:SourceAccount`, and `aws_sesv2_configuration_set_event_destination` with `matching_event_types = ["BOUNCE","COMPLAINT","DELIVERY","REJECT","DELIVERY_DELAY"]` and an `sns_destination`.
- [X] T010 ⚠ In `infra/modules/ses-events/main.tf`, set `enabled = true` **explicitly** on the event destination and add a comment: the provider defaults it to `false`, and an inert destination looks perfectly healthy (research R2).
- [X] T011 ⚠ In `infra/modules/ses-events/main.tf`, write `suppression_options { suppressed_reasons = var.suppressed_reasons }` with a comment recording research R3: an **empty block is not an empty list** — the provider's create path tests `IsNull()`, so `suppression_options {}` silently inherits account settings, the exact opposite of the intent, with no error.
- [X] T012 Declare `suppressed_reasons` in `infra/modules/ses-events/variables.tf` as `list(string)` defaulting to `["BOUNCE","COMPLAINT"]` (account-inheriting, the safe production default), with a validation block accepting only `BOUNCE`/`COMPLAINT`, and a description stating that `[]` cancels all suppression for this configuration set.
- [X] T013 [P] Write `infra/modules/ses-events/outputs.tf`: `configuration_set_name`, `events_topic_arn`.
- [X] T014 Add `infra/envs/dev/alerts.tf`: `aws_sns_topic` `${module.shared.name_prefix}-alerts`, an `aws_sns_topic_subscription` of protocol `email` to an `alert_email` variable, an `aws_ssm_parameter` at `/effy/${var.env}/alerts/topic_arn`, and a ⚠ comment that an email subscription is inert until a human confirms it.
- [X] T015 [P] Declare `alert_email` in `infra/envs/dev/variables.tf` and set it in `infra/envs/dev/dev.tfvars`.
- [X] T016 Call `module "ses_events"` from `infra/envs/dev/dns.tf` with `suppressed_reasons = []` for dev, carrying an inline comment naming FR-041 and the accepted cost from research R3 (dev keeps sending to dead addresses; each attempt counts toward the shared bounce rate).
- [X] T017 In `infra/envs/dev/dns.tf`, publish the four new SSM parameters from [contracts/ssm-mail.contract.md](./contracts/ssm-mail.contract.md): `/effy/<env>/ses/{sender,reply_to,configuration_set,events_topic_arn}`.
- [X] T018 Wire `configuration_set_name` from `module.ses_events` into `module "ses"` in `infra/envs/dev/dns.tf`, and set it as the identity default via `aws_sesv2_email_identity.configuration_set_name` in `infra/modules/ses-domain-identity/main.tf` (research R2 — the safety net half).
- [X] T019 Run `terraform fmt -recursive infra/` and `terraform validate` in `infra/envs/dev` and `infra/global`; fix any finding.

**Checkpoint**: the contract exists on paper and validates. Nothing is applied yet.

---

## Phase 3: User Story 1 — Anyone eligible receives their code, from Effy (P1) 🎯 MVP

**Goal**: every code-bearing message — including the four still sent by Cognito's built-in sender —
comes from one Effy address in the environment's namespace, with no per-day ceiling.

**Independent Test**: take an address never seen by the platform; run sign-up, sign-in, password
recovery, email-change and account-closure step-up on all four audiences; every message arrives and
every one carries the same sender.

**⚠ This story is genuinely independent of the apex DNS work.** `dev.effyshopping.com` already has its
own verified signing and sender-authorisation records, so US1 can ship and be proven before US2/US3
touch the apex.

### Tests for User Story 1

- [X] T020 [P] [US1] Extend `apis/edge-api/auth/src/lib/audience.config.test.ts` to assert `MAIL_SENDER`, `MAIL_REPLY_TO` and `MAIL_CONFIGURATION_SET` are declared in the **real** `serverless.yml` and that each resolves from an `/effy/${sls:stage}/ses/*` SSM path. ⚠ Do not mock the file — see [contracts/ssm-mail.contract.md](./contracts/ssm-mail.contract.md) rule 1.
- [X] T021 [P] [US1] Create `apis/edge-api/customer/src/lib/notify.config.test.ts` — the same config-contract test for the customer service, parsing its real `serverless.yml`. This service has never had one.
- [X] T022 [P] [US1] Create `apis/edge-api/auth/src/otp/mailer.test.ts` — the file has **no direct unit test today**. Assert the `SendEmailCommand` input carries `FromEmailAddress` from `MAIL_SENDER`, `ReplyToAddresses` from `MAIL_REPLY_TO`, `ConfigurationSetName` from `MAIL_CONFIGURATION_SET`, and that a missing `MAIL_SENDER` **throws**.
- [X] T023 [P] [US1] Add a test asserting the mailer still routes to `success@simulator.amazonses.com` when `phantom: true`, so this slice cannot silently break 035's timing-parity defence.

### Implementation for User Story 1

- [X] T024 [US1] In `apis/edge-api/auth/serverless.yml`, replace `OTP_SENDER: no-reply@${sls:stage}.effyshopping.com` with `MAIL_SENDER`, `MAIL_REPLY_TO` and `MAIL_CONFIGURATION_SET` resolved from SSM. ⚠ **Remove** `OTP_SENDER` rather than keeping it as a fallback — a fallback preserves exactly the drift this contract ends.
- [X] T025 [US1] In `apis/edge-api/auth/src/otp/mailer.ts`, read the three new variables; add `ReplyToAddresses` and `ConfigurationSetName` to the `SendEmailCommand` input (both omitted when unset). ⚠ No other logic changes — the send path, the phantom branch and `logFailure` are untouched (research R7).
- [X] T026 [P] [US1] In `apis/edge-api/customer/serverless.yml`, replace `NOTIFY_SENDER` with the same three SSM-resolved variables.
- [X] T027 [P] [US1] In `apis/edge-api/customer/src/password/notify.ts`, read the three variables and add `ReplyToAddresses` + `ConfigurationSetName`. Keep its existing swallow-on-failure behaviour — the asymmetry with the auth mailer is deliberate and documented in its header.
- [X] T028 [US1] In `infra/envs/dev/dns.tf`, extend `local.pool_email_configuration`'s SES branch with `configuration_set = module.ses_events.configuration_set_name` and `reply_to_email_address` read from **the same local/variable that T017 publishes to `/effy/<env>/ses/reply_to`**, replacing the hardcoded `null`. ⚠ Do not write the address a second time — one literal, two consumers, or this re-creates in miniature the exact drift shape the slice exists to end. ⚠ Update the adjacent comment — it currently states the platform cannot receive mail, which is no longer true (research R14).
- [X] T029 [US1] Set `ses_sender_enabled = true` in `infra/envs/dev/dev.tfvars`, with a comment recording that this removes the ~50/day-per-pool ceiling on Cognito-sent mail (FR-007).
- [X] T030 [US1] Verify no literal `no-reply@` or `effyshopping.com` sender string remains in any `serverless.yml`, `.ts` source file or test fixture: `rg -n "no-reply@" apis/ packages/ apps/`. Expect hits only in `specs/` and comments.
- [X] T031 [US1] Run `pnpm --filter "@effy/edge-*" run typecheck && pnpm --filter "@effy/edge-*" run test`.
- [X] T032 🧑‍💻 [US1] **OPERATOR** — [quickstart.md](./quickstart.md) § 6a: `make plan ENV=dev`, review, `make apply ENV=dev`. Then confirm the SNS email subscription and prove it is not `PendingConfirmation`.
- [X] T033 🧑‍💻 [US1] **OPERATOR** — ⚠ verify the suppression override actually took: `aws sesv2 get-configuration-set --configuration-set-name effy-dev-mail --query 'SuppressionOptions'`. `{"SuppressedReasons": []}` = FR-041 met; `null` = **not isolated**, stop and fix (research R3, open item 1).
- [X] T034 🧑‍💻 [US1] **OPERATOR** — [quickstart.md](./quickstart.md) § 6b: `make plan ENV=dev` for the Cognito switch. ⚠ **If ANY pool shows `-/+`, ABORT.** Expected: four in-place `email_configuration` updates. Then `make apply ENV=dev`.
- [X] T035 🧑‍💻 [US1] **OPERATOR** — `make edge-deploy SERVICE=auth ENV=dev` then `SERVICE=customer ENV=dev`. ⚠ Terraform must be applied first; these resolve SSM at deploy time.
- [X] T036 🧑‍💻 [US1] **OPERATOR** — `make verify-pool-credentials ENV=dev`: the per-audience credential rules must be unchanged by this slice. ✅ **Run 2026-08-06, all checks ✓**: driver / shop (incl. mobile client) / back-office all passwordless, `ALLOW_CUSTOM_AUTH` only, no `ALLOW_USER_AUTH`, unfederated, admin-provisioned; customer keeps SRP + open self-registration. The sender switch changed no credential rule.
- [ ] T037 🧑‍💻 [US1] **OPERATOR — SC-001** (⚠ corrected 2026-08-05, analysis F1): from a never-registered address — on **customer**, complete sign-up, sign-in **and** password recovery; on **driver, shop and back-office**, receive a **sign-in code only**. ⚠ Those three are strictly passwordless and admin-provisioned (constitution Principle IV), so they have no sign-up and no password to recover — the original wording was unsatisfiable. ⚠ **Driver has no client surface** (`apps/driver-mobile` is the base template): prove it with a direct `aws cognito-idp initiate-auth --auth-flow CUSTOM_AUTH` against the driver pool, using an admin-provisioned test user. Record which arrived.
- [ ] T142 🧑‍💻 [US1] **OPERATOR — FR-008** (added post-analysis, F11): capture all four pools' Cognito message templates **before** T034's apply (`aws cognito-idp describe-user-pool --user-pool-id <id> --query 'UserPool.{v:VerificationMessageTemplate,i:AdminCreateUserConfig.InviteMessageTemplate}'`, all four pools), capture them again **after**, and assert byte-identical. ⚠ Switching `email_sending_account` from `COGNITO_DEFAULT` to `DEVELOPER` is precisely the change that could alter a template silently, and FR-008 says wording is preserved unchanged. Nothing else in this slice checks that.
- [ ] T038 🧑‍💻 [US1] **OPERATOR — SC-002**: confirm all five flows (sign-in, sign-up confirmation, password recovery, email-change, closure step-up) arrive from `Effy <no-reply@dev.effyshopping.com>` with an identical display name, and that **zero** arrive from a third-party address.
- [ ] T039 🧑‍💻 [US1] **OPERATOR — SC-003**: deliver more than 50 codes inside one 24-hour period with nothing throttled or refused.

**Checkpoint**: ⚠ **This alone removes the platform's onboarding ceiling and its second sender.** It is
a shippable MVP even if nothing below is built.

---

## Phase 4: User Story 3 — Effy can be written to, and replies reach a person (P2)

**⚠ Sequenced BEFORE US2 despite the lower priority.** US3's authorisation and signing records must be
live before US2's alignment policy, or the policy quarantines Effy's own support replies. This is the
one genuine cross-story ordering constraint in the slice (plan ordering rule 2, FR-021).

**Goal**: mail *from* `hello@effyshopping.com` passes authentication, and replies to automated mail
reach a person.

**Independent Test**: send from the mailbox to a Gmail and an Outlook address, open "show original",
confirm SPF and DKIM pass. Reply to a delivered sign-in code and confirm it lands.

- [X] T040 🧑‍💻 [US3] **OPERATOR** — create the `dmarc@effyshopping.com` alias in the Workspace admin console (same one-click as `hello@`). Without it, US2's aggregate reports land nowhere.
- [X] T041 [US3] Create `infra/global/imports.tf` with `import {}` blocks adopting the two hand-added records — the apex `MX` and the apex `TXT` — using the identity form (`zone_id` / `name` / `type`) against zone `Z0506267W447QBDSL13U`.
- [X] T042 [US3] Declare the apex `MX` in `infra/global/dns.tf` matching the live value `1 SMTP.GOOGLE.COM.` exactly. ⚠ Adopt, never re-create: this record is the only route to `hello@`.
- [X] T043 [US3] Declare the apex `TXT` record set in `infra/global/dns.tf` with **two `records` elements** — the existing ownership proof and a new `v=spf1 include:_spf.google.com ~all`. ⚠ Add a comment: two separate TXT records at one name is correct (a verifier discards non-`v=spf1` records first), but a **second `v=spf1` string is a permanent failure for every message from the domain** — a future sender is added by *editing* this string, never by adding another record.
- [X] T044 [US3] Declare `google._domainkey.effyshopping.com` in `infra/global/dns.tf` as **one `records` element containing an embedded `" "`**, splitting the 410-character value at exactly 255 characters via `substr()`. ⚠ Two elements would publish two separate TXT records — valid DNS, silently broken key (research R13).
- [X] T045 [P] [US3] Add a Terraform-independent guard to `scripts/mail-verify.sh` that fetches `google._domainkey.effyshopping.com`, **reassembles** the character-strings, and compares byte-for-byte with the value in [operator-inputs.md](./operator-inputs.md). Fail loudly on mismatch.
- [X] T046 🧑‍💻 [US3] **OPERATOR** — [quickstart.md](./quickstart.md) § 3: `make global-init`, then `terraform plan`. ⚠ Expect **`0 to add, 0 to change, 0 to destroy` / `2 to import`**. A non-empty change count means the config does not match live — stop; the usual cause is TXT quoting (config holds the *content*, never escaped outer quotes). Then `make global-apply`.
- [X] T047 🧑‍💻 [US3] **OPERATOR** — ⚠ `dig +short MX effyshopping.com @8.8.8.8` must still return `1 smtp.google.com.` (SC-022).
- [X] T048 🧑‍💻 [US3] **OPERATOR** — [quickstart.md](./quickstart.md) § 4: `make global-plan` (apex TXT gains one string; `google._domainkey` is created), then `make global-apply`. Re-check inbound.
- [X] T049 🧑‍💻 [US3] **OPERATOR** — `dig +short TXT google._domainkey.effyshopping.com`. ⚠ If it returns **two records** instead of one record rendered as two adjacent quoted strings, the split is wrong — fix before proceeding. Then run `make mail-verify ENV=dev` (T045's check).
- [ ] T050 🧑‍💻 [US3] **OPERATOR** — click **Start authentication** in the Workspace admin console. Only now: Google checks DNS at that moment.
- [ ] T051 🧑‍💻 [US3] **OPERATOR — SC-009a**: send *from* `hello@effyshopping.com` to a Gmail **and** an Outlook address; open "show original" and confirm **SPF=pass and DKIM=pass**. ⚠ This must pass before Phase 5.
- [ ] T052 🧑‍💻 [US3] **OPERATOR — SC-008**: send *to* `hello@effyshopping.com` from an unrelated address; confirm a person reads it within one business day.
- [ ] T053 🧑‍💻 [US3] **OPERATOR — SC-009**: reply to a delivered sign-in code; confirm the reply lands in the operator's mailbox (this exercises T028's `reply_to` and T025/T027's `ReplyToAddresses`).
- [X] T054 🧑‍💻 [US3] **FR-023 — OPERATOR**: add `support@effyshopping.com` as a Workspace alias on `workspace-admin@`, matching the spec's stated default (Assumptions: "the default assumption is route it"). It is advertised today in `apps/customer-web/app/delete-account/page.tsx:97` and `apps/customer-mobile/.../help/presentation/HelpScreens.kt:173`, and mail to it is currently undeliverable. ⚠ Then **verify** by sending to it from an unrelated address. If the operator declines the alias, the fallback is to change both surfaces to `hello@` — but one of the two MUST happen, because an advertised address that bounces is worse than none.

**Checkpoint**: the human mailbox both receives and sends trustworthily. US2's policy is now safe to
publish.

---

## Phase 5: User Story 2 — Mail is trusted by the receiving world (P1)

**Goal**: messages pass every authentication check at Gmail, Outlook and Yahoo; the sending namespace
resolves; and mail forged in Effy's name is distrusted.

**Independent Test**: send to a fresh mailbox at each of the three providers and read the received
message's own authentication report — all three checks pass, and the message is in the inbox.

**⚠ Depends on Phase 4** (T048–T051) for the ordering reason above.

- [X] T055 [US2] Declare `_dmarc.effyshopping.com` in `infra/global/dns.tf` as `v=DMARC1; p=${var.dmarc_policy}; sp=none; rua=${var.dmarc_rua}; fo=1`. ⚠ `sp=none` is deliberate: it stops any future environment subdomain silently inheriting enforcement before it is ready (FR-015).
- [X] T056 [P] [US2] Pass `dmarc_rua` from `infra/envs/dev/dns.tf` into `module "ses"`, and use it in `infra/modules/ses-domain-identity/main.tf`'s DMARC record so the dev namespace gains aggregate reporting (FR-017). It currently publishes `v=DMARC1; p=none;` with no `rua`, so monitor mode collects nothing.
- [X] T057 [US2] Add `A` and `AAAA` alias records for the zone apex `dev.effyshopping.com` in `infra/envs/dev/edge-domain.tf`, targeting the same regional API gateway domain `edge-api.dev` already uses. ⚠ Comment that this makes the From domain **resolve** (FR-013) and is deliberately **not a website** (research R5).
- [X] T058 [P] [US2] Extend `scripts/mail-verify.sh` to check: the apex mail-exchanger record, both apex TXT strings, `_dmarc` on apex **and** dev, that `dev.effyshopping.com` resolves, the configuration set's suppression override, and the events topic's existence.
- [X] T140 [P] [US2] **FR-018** (added post-analysis, F3): assert in `infra/modules/ses-events/` that the configuration set declares **no** subscription-management / list-management options, and add a comment stating why — an unsubscribe affordance on a sign-in code lets a person opt out of their own ability to sign in. ⚠ This matters *now* because Cognito's own messages are being routed through this configuration set for the first time (T028).
- [X] T059 [US2] Run `terraform fmt -recursive infra/` and `terraform validate` on both roots.
- [X] T060 🧑‍💻 [US2] **OPERATOR** — [quickstart.md](./quickstart.md) § 5: `make global-plan && make global-apply`; then `dig +short TXT _dmarc.effyshopping.com` and re-check inbound (SC-022).
- [ ] T061 🧑‍💻 [US2] **OPERATOR** — ⚠ re-run T051's send test *after* the policy is live. A pass before and a fail after means ordering rule 2 was violated; roll the policy back and fix authorisation/signing first.
- [X] T062 🧑‍💻 [US2] **OPERATOR** — `make apply ENV=dev` for the dev `A`/`AAAA` + `rua`, then `dig +short A dev.effyshopping.com` (SC-006).
- [ ] T063 🧑‍💻 [US2] **OPERATOR — SC-004**: request a code at a **Gmail**, an **Outlook** and a **Yahoo** address; open each received message's authentication report and confirm **SPF, DKIM and DMARC all pass**. ⚠ Read the report — do not infer from arrival.
- [ ] T141 🧑‍💻 [US2] **OPERATOR — SC-017** (added post-analysis, F3): while T063's messages are open in "show original", search the **raw headers** of one code message from each of the five flows for `List-Unsubscribe` and `List-Unsubscribe-Post`. ⚠ Expect **zero** occurrences. Folds into T063's step — no extra send needed.
- [ ] T064 🧑‍💻 [US2] **OPERATOR — SC-005**: confirm each landed in the **inbox**, not spam, on a first-contact address. ⚠ If Outlook rejects or junks, the remedy is pre-decided (research R5): add a mail-exchanger record to `dev.effyshopping.com`. Do not guess at other causes first.
- [ ] T065 🧑‍💻 [US2] **OPERATOR — SC-007**: send a message forged to claim `@effyshopping.com` from an unauthorised source; confirm a major provider rejects or quarantines it.
- [ ] T066 🧑‍💻 [US2] **OPERATOR** — one week after T060, read the first aggregate reports at `dmarc@effyshopping.com` and record whether all legitimate traffic aligns (FR-017's evidence gate before any future tightening).

**Checkpoint**: US1 + US2 + US3 complete — mail is branded, reaches anyone, is trusted, and can be
replied to. **Everything below is about knowing when it fails.**

---

## Phase 6: User Story 4 — Nobody is silently locked out (P2)

**Goal**: a permanent delivery failure is recorded against the right person within 5 minutes, visible
to operators and to the account's owner, and repairable in one audited action.

**Independent Test**: drive a hard bounce via the mailbox simulator; confirm the record, the account
notice, and that the documented repair restores sign-in.

### Data

- [X] T067 [US4] `make db-new name=email_delivery`, then write `public.email_delivery_status` and `public.email_delivery_event` per [data-model.md](./data-model.md), including every `COMMENT ON COLUMN`, the `CHECK` constraints, the partial attention index, the `(message_id, event_type, address)` unique index, and an exact `-- +goose Down`.
- [X] T068 [US4] ⚠ In the migration, comment why `raw_address` exists beside `address citext`: the suppression API is **case-sensitive**, and a repair that normalises case fails silently while appearing to succeed (FR-035). This is the single most likely way this feature ships broken.
- [X] T069 [US4] ⚠ Comment why there is **no foreign key** to `customer`/`shop_staff`/`admin.staff`: an address may bounce before its account exists, after it is deleted, or for the driver audience, which has a Cognito pool and no platform table at all.

### Tests for User Story 4

- [X] T070 [P] [US4] `apis/edge-api/admin/src/deliverability/consumer.test.ts` — parse each event type from [contracts/ses-event.contract.md](./contracts/ses-event.contract.md) and assert the state mapping, including ⚠ `Undetermined` → `soft_failing`, **not** `undeliverable`.
- [X] T071 [P] [US4] Idempotency test: the same event delivered twice inserts one row and increments `bounce_count` **once**. ⚠ Prove it by asserting the count, not by asserting the insert did not throw.
- [X] T072 [P] [US4] Out-of-order test: a `Delivery` whose `occurred_at` predates the stored `last_event_at` does **not** resurrect an `undeliverable` address.
- [X] T073 [P] [US4] Multi-recipient test: one event naming three recipients produces three independent records.
- [X] T074 [P] [US4] Resilience tests: an unknown `eventType`, and an unparseable message body, are each logged and dropped **without throwing** — throwing makes SNS retry forever and turns one bad message into a dead consumer.
- [X] T075 [P] [US4] ⚠ Log-hygiene test: assert no log line emitted by the consumer contains an `@`. This is 035's "never put a recipient in CloudWatch" rule, made mechanical.
- [X] T076 [P] [US4] `apis/edge-api/admin/src/deliverability/authz.test.ts` — read allows `csa`; mutate refuses `csa`; a DB error on the gate returns **503**, never a pass.
- [X] T077 [P] [US4] Repair-ordering test: when the SES call fails, **no** database write occurs; when SES returns `ResourceNotFoundException`, the repair **succeeds** (the address was never suppressed and the platform's half still needs clearing).
- [X] T078 [P] [US4] ⚠ Case-preservation test: the repair calls SES with the stored `raw_address` verbatim, **not** the path parameter and **not** a lowercased form. Prove it by storing a mixed-case address and asserting the exact argument.

### Backend implementation

- [X] T079 [US4] `apis/edge-api/admin/src/deliverability/repository.ts` — raw SQL for upsert-status, insert-event (`ON CONFLICT DO NOTHING`), list, detail, event history, and repair; audit row written **inside the same transaction** as the status change, per `src/shops/repository.ts`.
- [X] T080 [US4] `apis/edge-api/admin/src/deliverability/service.ts` — the event→state mapping, the "only advance status when a row was actually inserted" rule, and the subject resolution join across `public.customer` (citext), `public.shop_staff` and `admin.staff` (`lower(email)`), returning `null` when no record owns the address.
- [X] T081 [P] [US4] `apis/edge-api/admin/src/deliverability/authz.ts` — `isActiveStaff` for reads, `admin`/`manager` for the repair, decided from `admin.staff` and never from the claim.
- [X] T082 [P] [US4] `apis/edge-api/admin/src/deliverability/handler-support.ts` — `guard()` and the domain-error→`problem+json` map. ⚠ No refusal may echo the address in `detail`.
- [X] T083 [US4] `apis/edge-api/admin/src/functions/ses-event-consumer.ts` — the SNS handler: iterate records independently so one malformed record cannot discard the batch; emit the `Effy/Mail` metrics; log `messageId`/`eventType`/`subType` and a SHA-256 prefix of the address only.
- [X] T084 [P] [US4] `apis/edge-api/admin/src/functions/deliverability-list-v1-get.ts`
- [X] T085 [P] [US4] `apis/edge-api/admin/src/functions/deliverability-detail-v1-get.ts` — including the **live** `suppressedInSes` read. ⚠ On SES failure return `null`, never `false`.
- [X] T086 [P] [US4] `apis/edge-api/admin/src/functions/deliverability-repair-v1-post.ts` — required non-empty `note` ≤ 500 chars; SES delete first, transaction second. ⚠ Emit the `Effy/Mail` `mail_repair_performed` metric on success — the plan declares five metrics and this is the only one no other task emits.
- [X] T087 [US4] `apis/edge-api/admin/serverless.yml` — add the `sesEventConsumer` function with an `sns` event (`arn` from `${ssm:/effy/${sls:stage}/ses/events_topic_arn}` **plus** an explicit `topicName`; ⚠ omitting `topicName` with an `arn` is a common deploy failure), the three `httpApi` routes with the back-office authorizer id from SSM, and the IAM statements for `ses:GetSuppressedDestination` / `ses:DeleteSuppressedDestination` scoped to the identity ARN.
- [X] T088 [US4] ⚠ Add **no** SNS `filterPolicy`: SES publishes the discriminator in the message *body*, not in message attributes, so an attribute filter would silently match nothing. Filtering happens in the consumer, where it is visible and testable. Record this as a comment.
- [X] T089 [P] [US4] Add error alarms for the three new routes and the consumer in `apis/edge-api/admin/serverless.yml`'s `resources` block, following the existing `${self:service}-${sls:stage}-<slug>-errors` naming. ⚠ **Depart from the existing convention in one respect**: give each an `AlarmActions: [${ssm:/effy/${sls:stage}/alerts/topic_arn}]`. The 44 alarms already in this file have **none** — copying the convention wholesale would ship four brand-new alarms that notify nobody, in the slice whose entire purpose is that someone finds out (FR-037).
- [X] T090 [US4] `apis/edge-api/customer/src/customer/{repo,model}.ts` — `LEFT JOIN public.email_delivery_status` on `c.email` and map to `CustomerDTO.emailDelivery`, defaulting to `"reachable"` when no row exists. ⚠ `reason` and `diagnostic` are **not** exposed — they are operator data written for a postmaster.
- [X] T091 [P] [US4] Test that `CustomerDTO` gains exactly one field and that the key set matches the contract. ⚠ Write the expectation from `packages/shared-types`, **not** from the repository struct — writing it from the struct is 029's and 033's failure mode.

### Console and client surfaces

- [X] T092 [P] [US4] `apps/back-office/src/features/deliverability/{repo,queries,model}.ts` mirroring `features/shops/`.
- [X] T093 [US4] `apps/back-office/src/features/deliverability/DeliverabilityListScreen.tsx` — a `DataTable`, defaulting to problems only. ⚠ **No cards, no metric tiles** (Principle V); the undeliverable state carries a **text label**, never colour alone.
- [X] T094 [US4] `apps/back-office/src/features/deliverability/DeliverabilityDetailScreen.tsx` — detail rows, the event history table, and the live `suppressedInSes` field rendering "couldn't check" when `null`.
- [X] T095 [P] [US4] `apps/back-office/src/features/deliverability/components/RepairDialog.tsx` — `AlertDialog` with a **required** note field, stating plainly that this re-enables mail to an address that previously hard-failed.
- [X] T096 [P] [US4] `apps/back-office/src/routes/deliverability.tsx` + one entry in `apps/back-office/src/components/layout/nav.ts`, wired into `apps/back-office/src/router.tsx`.
- [X] T097 [P] [US4] `apps/back-office/src/features/deliverability/errorText.ts` — copy keyed off `DomainError.kind` and HTTP status only, never raw `detail`.
- [X] T098 [US4] `apps/customer-web/app/(account)/account/EmailDeliveryNotice.tsx` — the authenticated notice (FR-030), rendered from `CustomerDTO.emailDelivery`, naming the problem and a way forward. Wire into `account/page.tsx`.
- [X] T099 [US4] **FR-030a** — add a **uniform** "still not arriving? write to hello@effyshopping.com" affordance to the code step on all five sign-in surfaces: `apps/customer-web/app/(auth)/_components/CodeStep.tsx`, `apps/customer-mobile/.../auth/presentation/AuthScreens.kt`, `apps/shop-mobile/.../auth/presentation/SignInScreen.kt`, and `packages/web-kit/src/console/OtpSignInCard.tsx` (which serves shop-web **and** back-office). ⚠ Shown to **everyone**, never conditioned on delivery state.
- [X] T100 [US4] ⚠ Assert in a test that no sign-in or code-screen copy branches on delivery state. Any such branch is an account-enumeration oracle (SC-011a).
- [X] T101 [US4] Run `pnpm -r typecheck`, `pnpm --filter "@effy/edge-*" run test`, `make bo-test`, and the customer-web suite.
- [X] T102 [US4] Run `pnpm --filter @effy/customer-web run size` — the guest bundle must not regress. ⚠ `EmailDeliveryNotice` is on an authenticated route and should be byte-neutral on all guest routes; prove it rather than assuming.

### Operator validation

- [X] T103 🧑‍💻 [US4] **OPERATOR** — commit the migration, then `make db-up ENV=dev` (the 003 commit guard refuses uncommitted files).
- [X] T104 🧑‍💻 [US4] **OPERATOR** — `make edge-deploy SERVICE=admin ENV=dev`. ⚠ After `auth` and `customer` (T035), so the consumer's first minutes are correctly idle rather than looking broken.
- [ ] T105 🧑‍💻 [US4] **OPERATOR — SC-010**: send to `bounce+case1@simulator.amazonses.com` for a test account; confirm the console shows it undeliverable **within 5 minutes**, and that the label proves the consumer attributed the event to the right address.
- [ ] T106 🧑‍💻 [US4] **OPERATOR — SC-011**: sign in as that customer; confirm the account page states the address cannot be reached, verified by an observer not told what to look for.
- [ ] T107 🧑‍💻 [US4] **OPERATOR — SC-011a, THE ENUMERATION PROOF**: request a code for a reachable address and for the undeliverable one; compare the sign-in and code screens on all five surfaces. ⚠ They **must be indistinguishable**. Any difference is a regression against 035's FR-016.
- [ ] T108 🧑‍💻 [US4] **OPERATOR — SC-013, THE HALF-REPAIR PROOF**: run `aws sesv2 delete-suppressed-destination` alone and confirm the person is **still** locked out and the console **still** shows undeliverable. ⚠ A "both or neither" rule never tested by doing one half is decoration.
- [ ] T109 🧑‍💻 [US4] **OPERATOR — SC-012**: perform the real repair through the console with a note; confirm the person signs in, in under 10 minutes, without touching infrastructure — and that `admin.audit_log` holds the row.
- [ ] T110 🧑‍💻 [US4] **OPERATOR** — complaint path: send to `complaint@simulator.amazonses.com`; confirm it is recorded and surfaced and that the person is **not** barred from signing in (FR-031).
- [ ] T111 🧑‍💻 [US4] **OPERATOR** — transient path: send to `ooto@simulator.amazonses.com`; confirm `soft_failing`, and that the account is **not** marked undeliverable (FR-029).
- [ ] T112 🧑‍💻 [US4] **OPERATOR — SC-020**: `aws logs filter-log-events --log-group-name /aws/lambda/effy-edge-admin-dev-sesEventConsumer --filter-pattern '"@"'`. ⚠ Expect **zero** matches.

**Checkpoint**: the silent-lockout defect is closed and demonstrably so.

---

## Phase 7: User Story 5 — Operators find out before customers do (P3)

**Goal**: every alarm in this feature's blast radius notifies a human out of band.

**Independent Test**: force each alarm into ALARM and confirm a person is notified.

- [X] T113 [P] [US5] Add `alarm_actions` (and `ok_actions`) pointing at the alerts topic to the three existing alarms in `infra/envs/dev/dns.tf` — `cert_expiry`, `ses_bounce_rate`, `ses_complaint_rate`. ⚠ They exist today and **notify nobody**.
- [X] T114 [P] [US5] Add `alarm_actions` to the 035 alarms in `infra/envs/dev/otp-store.tf`, including `otp_send_failures` — under 035's design a failed send **is** a failed sign-in.
- [X] T115 [US5] `apis/edge-api/admin/src/functions/ses-identity-health.ts` — a scheduled probe reading `MailFromAttributes.MailFromDomainStatus` via `GetEmailIdentity` and publishing `Effy/Mail mail_from_domain_healthy` (1/0) to CloudWatch.
- [X] T116 [US5] Register it in `apis/edge-api/admin/serverless.yml` with a `schedule: rate(1 hour)` event and an IAM statement for `ses:GetEmailIdentity` scoped to the identity ARN.
- [X] T117 [US5] Add the `mail-from-unhealthy` alarm in `infra/envs/dev/dns.tf` with ⚠ `treat_missing_data = "breaching"` — a probe that stops running must **trip** the alarm, not silence it — plus a comment recording research R11: **no AWS metric or EventBridge event exists** for this, and the only native signal is an email to the AWS account root address.
- [X] T118 [P] [US5] Add the `mail-hard-bounce` alarm (≥ 1 in 5 minutes) — ⚠ a single lockout never moves a *rate*, which is precisely why the existing rate alarms could not catch this.
- [X] T119 [P] [US5] Add the `mail-consumer-errors` alarm on the consumer Lambda. ⚠ **Built in `apis/edge-api/admin/serverless.yml` as `effy-edge-admin-<env>-ses-event-consumer-errors`, not in `dns.tf` under the spec's shorthand name.** Only the service that deploys the Lambda can `!Ref` it; a Terraform alarm would have to hardcode a function name Terraform does not own. It carries `AlarmActions` → the alerts topic, which is the load-bearing half. Wherever this spec says `mail-consumer-errors`, that is the alarm.
- [X] T120 [US5] ⚠ Assert in review that **no** alarm is wired to any action that disables sending (FR-039). Automatically pausing mail on this platform means automatically disabling all sign-in.
- [X] T121 [US5] ⚠ **FR-037's scope boundary, made honest.** (a) Add `AlarmActions` to the alarms on the **mail and sign-in path** — the `auth` service's alarms in `apis/edge-api/auth/serverless.yml` — since a failed OTP send *is* a failed sign-in. (b) **Measure** the remainder rather than estimating it: `grep -c 'AWS::CloudWatch::Alarm' apis/edge-api/{admin,shop}/serverless.yml` (**44 + 32 = 76** as of 2026-08-05, **zero** carrying `AlarmActions`). ⚠ **Re-measured 2026-08-06: 43 + 32 = 75 unwired** (admin now holds 48 alarms, 5 of which carry actions). ⚠ **Part (a) named the wrong file** — `apis/edge-api/auth/serverless.yml` contains **zero** alarms; the sign-in-path alarms live in Terraform (`infra/envs/dev/otp-store.tf`) and were wired by **T114**, so the intent is met and the instruction as written was unbuildable. (c) Record that measured number in the sign-off as an open carry-forward under FR-037a. ⚠ The earlier draft of this task said "~30" and planned to ship them unwired as an acknowledged violation of a `MUST NOT`; the count was understated by 2.5× and the requirement has been scoped in the spec instead.
- [ ] T122 🧑‍💻 [US5] **OPERATOR** — `make apply ENV=dev` + `make edge-deploy SERVICE=admin ENV=dev`.
- [ ] T123 🧑‍💻 [US5] **OPERATOR — SC-014**: force each of `mail-hard-bounce`, `mail-from-unhealthy` and `mail-consumer-errors` into ALARM per [quickstart.md](./quickstart.md) § 9d, and confirm a person is notified out of band each time.
- [ ] T124 🧑‍💻 [US5] **OPERATOR** — confirm zero alarms in this feature's scope lack a notification target (FR-037).

---

## Phase 8: User Story 6 — A second environment costs nothing and endangers nothing (P3)

**Goal**: a new environment is a module call with an env name; one environment's failures cannot make a
person unreachable in another.

**Independent Test**: review or dry-run a second environment's configuration with only the env name
changed; confirm a dev failure does not suppress the address elsewhere.

- [X] T125 [US6] Audit every file this slice touched for a hardcoded `dev` or `dev.effyshopping.com`; everything must derive from `var.env` / `module.shared.name_prefix` (FR-040).
- [X] T126 [US6] Narrow `ses:SendEmail` in `apis/edge-api/customer/serverless.yml` from `Resource: "*"` to `${ssm:/effy/${sls:stage}/ses/identity_arn}` (FR-043). ⚠ Its neighbour in `apis/edge-api/auth/serverless.yml:85` already carries a comment declining to copy this deviation; it has simply never been fixed.
- [X] T127 [P] [US6] Confirm the `ses-events` module's resources are all env-scoped and removed on `terraform destroy`, and that nothing it creates lives in the parent zone (FR-042).
- [ ] T143 🧑‍💻 [US6] **OPERATOR — SC-019** (added post-analysis, F15): inspect the **deployed** policy, not the source that produced it — `aws iam get-role-policy` (or `aws lambda get-policy`) for the `auth`, `customer` and `admin` execution roles, and confirm every `ses:*` statement names the environment's identity ARN and **no `"*"` remains**. ⚠ T126 changes the source; only this proves what actually shipped.
- [ ] T128 🧑‍💻 [US6] **OPERATOR — SC-016**: dry-run a `qa` instantiation (module call with `env = "qa"`, plan only, no apply) and confirm no hand-edited value is required.
- [ ] T129 🧑‍💻 [US6] **OPERATOR — SC-015**: with T033 confirming the override is active, verify a dev hard bounce leaves the account-level suppression list untouched: `aws sesv2 list-suppressed-destinations` after T105. ⚠ Expect the address **absent** — its presence means FR-041 is unmet regardless of what the configuration reads.
- [ ] T130 🧑‍💻 [US6] **OPERATOR — FR-044**: delete the leftover individually-verified sender identity (`janithpm9991@gmail.com`) now that T037 has proven FR-001. ⚠ Do this **after** T037, not before — it is a working fallback until the general path is proven.

---

## Phase 8b: ⚠ THE FIRST DEPLOY BROKE SIGN-IN ON ALL FOUR POOLS (2026-08-06)

Found by the operator, not by any check: the customer iOS app requested a sign-in code and no email
arrived. **`mail-verify` reported 17/17 green throughout**, because being *authorized* to send (DKIM,
SPF, DMARC, a verified identity, production access) and being *permitted* to send (IAM) are
different facts, and it only checks the first.

**Defect 1 — `ses:SendEmail` was granted on the identity alone.** `ses:SendEmail` is authorized
against **every resource the request touches**. 037 added `ConfigurationSetName` to every send, so
each send now touches **two** resources — the identity *and* the configuration set. Every send
failed with `AccessDeniedException`, an error naming neither. ⚠ **T126 did not cause this so much as
complete it**: narrowing `edge-customer` from `"*"` to the identity looked like tightening and was
in fact breaking, because `"*"` had been covering the configuration set by accident.
⚠ **Cognito's own sends were unaffected** — the `effy-<env>-cognito-send` identity policy grants on
the identity alone, which is sufficient because Cognito's request does not *name* a configuration
set (it applies as the identity default). So sign-up confirmation and password recovery kept working
while passwordless sign-in was completely dead — which is exactly why this was hard to see.

**Defect 2 — the alarm that exists for this could never fire.** All four of 035's alarms in
`infra/envs/dev/otp-store.tf` declare **no dimensions**, while `observability.ts` published only
`Dimensions: [["userPoolId"]]`. In EMF **each dimension set is a separate metric**, so
`Effy/Auth otp_send_failed` *without dimensions* never existed. `effy-dev-otp-send-failures` — whose
description reads *"a failed send IS a failed sign-in"* — sat at **OK** through 7 recorded failures,
reporting "no datapoints were received". ⚠ Neither side was wrong alone; the defect lived only in
the relationship between them, which is 027 R13's shape for the sixth time in this repo.

- [X] T144 Publish `/effy/<env>/ses/configuration_set_arn` from `infra/envs/dev/dns.tf` (the module already output it and nobody consumed it), and add it to [contracts/ssm-mail.contract.md](./contracts/ssm-mail.contract.md) with the reason both keys exist.
- [X] T145 Grant `ses:SendEmail` on **both** ARNs in `apis/edge-api/{auth,customer}/serverless.yml`.
- [X] T146 ⚠ Rewrite the IAM assertion in `apis/edge-api/customer/src/lib/notify.config.test.ts` and add its twin to `auth`'s. **The existing test watched this happen**: it asserted the resource line `toContain("/ses/identity_arn")` and passed, because that was true and insufficient — the fixture agreeing with the code instead of with AWS. Both now assert **both** resources; proved by reverting the fix (`× must ALSO name the configuration set`).
- [X] T147 Emit `Dimensions: [["userPoolId"], []]` from `apis/edge-api/auth/src/lib/observability.ts`, and add `observability.test.ts` — which reads the **real** `otp-store.tf`, extracts every `Effy/Auth` alarm, and asserts each one's dimension set is actually published. Proved by reverting: **5 failures**, one per alarm plus the aggregate.
- [X] T148 🧑‍💻 **OPERATOR** — `make apply ENV=dev` (publishes the new SSM parameter), then `make edge-deploy SERVICE=auth ENV=dev` and `SERVICE=customer ENV=dev`. ⚠ Terraform **first** — the IAM statements resolve that parameter at deploy time and the deploy fails without it. ✅ **Done 2026-08-06.** Both deployed roles now name **both** ARNs (`identity/dev.effyshopping.com` + `configuration-set/effy-dev-mail`), verified with `aws iam get-role-policy` — the deployed policy, not the source that produced it.
- [X] T149 🧑‍💻 **OPERATOR** — request a sign-in code from customer-mobile and confirm it **arrives**. Then `aws logs filter-log-events --log-group-name /aws/lambda/effy-edge-auth-dev-createAuthChallenge --filter-pattern '"otp send failed"'` → expect **zero** new entries. ✅ **Done 2026-08-06 — the code arrives on customer-mobile (iOS), and zero send failures since the deploy.**
- [X] T150 🧑‍💻 **OPERATOR** — ⚠ confirm the alarm can now fire. ✅ **Done 2026-08-06, with a correction to what counts as proof.** The task named `otp_send_failed`, but `list-metrics` only returns metrics that have **received data** — and nothing has failed since the fix, so its dimensionless variant does not exist **yet**, which is the healthy state and not evidence of anything. The deployed emitter shape is proven instead by **`otp_code_issued`, which now lists BOTH dimension sets — `[{userPoolId}]` and `[]`.** Same `emit()`, same payload shape, so every `Effy/Auth` metric now publishes the aggregate the alarms watch, at its first datapoint. ⚠ **T123/SC-014 still has to force a real failure** — this proves the metric will exist, not that the notification arrives.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T131 ⚠ **Correct the stale blocker.** `CLAUDE.md` and [specs/035-six-digit-otp/SIGNOFF.md](../035-six-digit-otp/SIGNOFF.md) both name the SES sandbox as the platform's headline production blocker. It was granted before this slice began (research R1). Correct both, and mark 035's bounce-visibility carry-forward closed here.
- [X] T132 [P] Write `docs/runbooks/email.md` — the email runbook that has never existed: how sending is wired, what each alarm means, how to read a delivery record, and the **exact** repair procedure including the case-sensitivity trap. ⚠ **Was ticked and NOT built — the file did not exist; written 2026-08-06.** ⚠ Its first draft told operators to search the `auth` logs by `addressFingerprint`; that correlator exists **only** in the admin consumer, so the auth logs can answer "are sends failing?" and never "did *this* send fail?". Corrected, and the limitation is now stated in the runbook rather than papered over.
- [X] T133 [P] Update `docs/audiences/customer-capabilities.md` with a §037 entry, and note that the driver audience has a pool but **no platform record**, so its delivery outcomes are address-only.
- [X] T134 [P] Add `mail-events-verify` to the `Makefile` wrapping the new checks; add `auth` + `customer` to `edge-health`'s hardcoded `SERVICES="admin shop"` (both have been unprobed since they were built); and ⚠ while in that region, retarget `mail-verify`'s help text, which currently cites **SC-010** — that is feature *010*'s SC-010, not this feature's (which is "a permanent delivery failure is recorded within 5 minutes"). ⚠ **Was ticked and NOT built — none of the three parts existed; done 2026-08-06** (`scripts/mail-events-verify.sh` + target, help text retargeted). ⚠ **`auth` was deliberately NOT added to `edge-health`** and must stay out: it is Cognito-triggers-only with no HTTP surface, so it would report DOWN forever and train everyone to ignore a red row. `scripts/edge-health.sh` already carried that reasoning in a comment; only `customer` was missing from the Makefile default.
- [X] T135a ⚠ **FR-011 + FR-032 assertions**, folded into the sweep: confirm the bounce-return namespace `mail.dev.effyshopping.com` carries **exactly one** mail-exchanger record and appears in no `From` or recipient position anywhere in the repo (`rg -n 'mail\.dev\.effyshopping' apis/ packages/ apps/`); and confirm **no scheduled retry, queue redrive or bulk re-send** of a failed address exists (`rg -n 'retry|redrive|resend' apis/edge-api/admin/src/deliverability/`). Both are negative requirements that nothing else proves.
- [X] T135 ⚠ Secret/PII sweep across the whole diff: no address, no code, no `diagnosticCode` in any log line, metric dimension, problem `detail`, or test fixture committed to the repo.
- [X] T136 Full gate sweep: `pnpm -r typecheck` (count the reporting packages — ⚠ 029 found `pnpm -r test` green while `typecheck` failed, because **vitest does not run `tsc`**), `pnpm -r test`, `turbo build`, `terraform fmt -recursive` + `validate` on both roots, `depcruise`, `tokens:check` (must be **unchanged** — this slice adds no token), shellcheck on the modified scripts.
- [ ] T137 🧑‍💻 **OPERATOR** — walk the full SC table in [quickstart.md](./quickstart.md) § 9 and record every result, including the ones that fail.
- [ ] T138 🧑‍💻 **OPERATOR** — ⚠ **A DRAFT NOW EXISTS** ([SIGNOFF.md](./SIGNOFF.md), 2026-08-06), written *before* the walks so results land in a structure that already names what they were meant to prove. It carries §2 (proven live), §3 (machine-verified), §4 (the three ticked-and-unbuilt tasks) and §6 (carry-forwards) complete. **§5 is the operator's to fill and the feature is NOT concluded until it has real results.** Remaining: write `specs/037-platform-email-delivery/SIGNOFF.md`: what was proven live, what was not, and every carry-forward. ⚠ List unwalked items explicitly rather than implying completeness. Must include at minimum: **SC-018** (the 30-day bounce/complaint outcome, unownable at sign-off — and ⚠ its complaint half is structurally blind because Gmail reports no complaints to SES), **FR-037a**'s measured 76 unwired alarms, and the two weak staff email joins from [data-model.md](./data-model.md).
- [ ] T139 🧑‍💻 **OPERATOR** — commit on a feature branch (`037-platform-email-delivery`) and open the PR. ⚠ The repo is currently on `main`.

---

## Dependencies & Execution Order

### Phase dependencies

- **Phase 1 (Setup)** — T001 blocks everything; T002–T008 are parallel.
- **Phase 2 (Foundational)** — blocks all stories. Publishes the SSM contract every story reads.
- **Phase 3 (US1, P1)** — the MVP. Independent of all DNS work.
- **Phase 4 (US3, P2)** — ⚠ **must precede Phase 5.** See below.
- **Phase 5 (US2, P1)** — depends on Phase 4.
- **Phase 6 (US4, P2)** — its **build** work depends on Phase 2 only and is independent of Phases 3–5. ⚠ Its **operator validation** (T103–T112) additionally depends on **T032** (the apply that creates the configuration set and both topics — Phase 2's checkpoint explicitly says nothing is applied yet) and **T035** (the senders that attach the configuration set). Without those there are no events to consume.
- **Phase 7 (US5, P3)** — the alarms depend on Phase 6's consumer existing (T119) and Phase 2's topic.
- **Phase 8 (US6, P3)** — T129/T130 depend on Phase 6's T105 and Phase 3's T037.
- **Phase 9** — last.

### ⚠ The one place story independence genuinely breaks

**US3 (P2) is sequenced before US2 (P1).** US2's `_dmarc` policy (T055/T060) must land **after** US3's
apex sender-authorisation and signing records (T043/T044/T048). Reversed, the policy quarantines Effy's
own support replies — and it fails **silently**: you find out from a customer who never got a reply.

This is not a priority inversion; the P1 story is still the more valuable one. It is a physical
ordering constraint between two DNS records, and hiding it inside a phase would guarantee someone
eventually gets it wrong. T061 is the check that catches it if it happens anyway.

### Within each story

Tests before implementation. Migration before repository. Repository → service → handler.
Terraform apply before `serverless deploy` (SSM resolves at deploy time). Migration committed before
`db-up`.

### Parallel opportunities

- **Phase 1**: T002–T008 (seven files, no overlap).
- **Phase 3**: T020–T023 (four test files) run together; T026/T027 (customer service) run alongside
  T024/T025 (auth service).
- **Phase 6**: T070–T078 (nine test files) all parallel; T084–T086 (three handlers) parallel after
  T079/T080; T092/T095/T096/T097 parallel in the console.
- **Phase 7**: T113/T114 and T118/T119 are separate files.
- **Phase 9**: T132/T133/T134 parallel.

⚠ **Not parallelizable, despite appearances**: the `infra/global/dns.tf` tasks (T042–T044, T055) all
edit one file *and* must land in a specific order relative to each other's applies.

---

## Parallel Example: User Story 4 tests

```bash
Task: "Consumer event-mapping tests in apis/edge-api/admin/src/deliverability/consumer.test.ts"
Task: "Idempotency test (count asserted, not absence-of-throw)"
Task: "Out-of-order test — a stale Delivery must not resurrect an undeliverable address"
Task: "Multi-recipient fan-out test"
Task: "Unknown-eventType and unparseable-body resilience tests"
Task: "Log-hygiene test — no '@' in any consumer log line"
Task: "Authz test — csa reads, csa cannot repair, DB error is 503"
Task: "Repair-ordering test — SES failure writes nothing; ResourceNotFound succeeds"
Task: "Case-preservation test — repair calls SES with raw_address verbatim"
```

---

## Implementation Strategy

### MVP first (User Story 1 only)

1. Phase 1 → Phase 2 → Phase 3.
2. **STOP and VALIDATE**: T037–T039. At this point the ~50/day onboarding ceiling is gone and every
   message comes from one Effy address.
3. This is shippable on its own. Nothing below is required for it to hold.

### Incremental delivery

| Increment | Phases | What it buys |
| --- | --- | --- |
| MVP | 1 → 3 | Anyone can be onboarded; one sender |
| Trusted mail | 4 → 5 | Passes authentication; replies reach a person; brand not spoofable |
| No silent lockouts | 6 | The defect this slice exists for |
| Told before customers | 7 | Alarms that reach a human |
| Second environment | 8 | qa/prod is a module call |

### What is cuttable, and what is not

- **Cuttable**: Phase 8 (only one environment exists), and T066 (a one-week-later reading).
- **⚠ Not cuttable**: Phase 6. Without per-address outcomes this slice's central promise — that anyone
  eligible receives their mail — cannot be **verified or even falsified**. A promise nobody can check
  is not a promise, which is why `CLAUDE.md`'s "deserves its own slice" position was superseded in the
  spec.
- **⚠ Not cuttable**: T107 and T108. They are the two proofs that distinguish this feature from a
  plausible-looking one that does not work.

---

## Notes

- `[P]` = different files, no dependency on an incomplete task.
- 🧑‍💻 = operator-run. Claude authors the Terraform, the SQL and the source, and hands over exact
  commands; it does not apply, migrate, or deploy.
- Commit after each logical group; stop at any checkpoint to validate a story independently.
- ⚠ Six tasks record a *negative* proof (T033, T049, T061, T100, T108, T112). Those are the ones most
  likely to be skipped and most likely to matter.
