# Implementation Plan: Platform Email Delivery — Branded, Authenticated, Accountable Mail

**Branch**: `037-platform-email-delivery` | **Date**: 2026-08-05 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/037-platform-email-delivery/spec.md`

---

## Summary

Make every message the platform sends come from Effy, reach anyone, be trusted by receivers, and —
when it cannot be delivered — be **known about**.

Four moves, in dependency order:

1. **DNS**: publish what is missing on the parent namespace (sender authorisation, the Workspace
   signing key, an alignment policy) and **adopt** the two records added by hand; give the dev
   sending namespace an address record so it resolves.
2. **Cognito onto the platform's own sender**: flip `ses_sender_enabled`, attach a configuration set
   and a reply-to, and remove the last generic third-party sender and its ~50/day ceiling.
3. **Per-message outcomes**: an SES configuration set with an SNS event destination, consumed by a new
   idempotent worker in the cold path that writes an address-keyed delivery record — closing the
   silent-lockout defect.
4. **Visibility and repair**: an operator console view, an audited three-part repair action, alarms
   that reach a person, and a customer-facing banner on the one surface where saying it out loud does
   not create an account-enumeration oracle.

**Everything is on the cold path.** No hot-path change, no client-latency work, one Goose migration,
no new AWS service beyond SNS.

⚠ **Two spec amendments fall out of design and are recorded below** (§ Spec Amendments): FR-030's
"tell the person plainly" is scoped away from the unauthenticated sign-in screen, because saying it
there is an enumeration oracle; and FR-032's "no automatic retry" is read as forbidding machine
retries, not a person pressing "send code".

---

## Technical Context

**Language/Version**: TypeScript on Node 22 (cold path, Lambda arm64); HCL (Terraform ≥ 1.11, AWS
provider ~> 6.0 — pinned **6.53.0** in `infra/envs/dev`, **6.54.0** in `infra/global`); SQL
(PostgreSQL 16 via Goose); React 19 + TypeScript (back-office console, customer-web).

**Primary Dependencies**: `@aws-sdk/client-sesv2` (already in `edge-api/auth` and `edge-api/customer`,
pinned `3.1086.0`); `pg` (already in `edge-api/admin`); Serverless Framework 3.40.0. **One new SDK
client**: `@aws-sdk/client-cloudwatch` for the MAIL FROM health metric. **No new runtime framework, no
new AWS service beyond SNS.**

**Storage**: PostgreSQL — two new tables in `public` (`email_delivery_status`,
`email_delivery_event`). One forward-only Goose migration. No DynamoDB change. No schema change to
`customer`, `shop_staff` or `admin.staff`.

**Testing**: Vitest for the edge services (`src/**/*.test.ts`), including a **config-contract test**
in the 035 style that parses the real `serverless.yml` — the defence against the "env var the
deployment never declared" failure that has now recurred four times (027 R13 / 029 / 033 / 035).
Vitest for the console slices. `terraform validate` + `fmt`. `scripts/mail-verify.sh` extended.

**Target Platform**: AWS `ap-southeast-2`; Route 53 (parent zone `Z0506267W447QBDSL13U` + the
delegated `dev.effyshopping.com` child); SESv2; Lambda; SNS; CloudWatch.

**Project Type**: Infrastructure + cold-path service + one migration + two thin client surfaces.

**Performance Goals**: Not latency-sensitive. The event consumer is an async worker; target is
**a delivery outcome recorded within 5 minutes of the failure** (SC-010), which SES event publishing
comfortably meets. No change to any sign-in path's latency — see the timing-parity constraint below.

**Constraints**:
- ⚠ **Timing parity must not regress.** 035 sends a phantom message to
  `success@simulator.amazonses.com` for unknown users so that an attacker cannot distinguish "account
  exists" from "account does not". Any branch that *skips* a send introduces a third timing class.
  **This plan therefore does not skip sends** (research R7).
- ⚠ **No enumeration oracle.** Delivery status is a property of an address the platform has emailed,
  so disclosing it to an unauthenticated caller discloses that the address has an account.
- ⚠ **No address in logs or metrics.** 035's `logFailure` logs `err.name` only, never `err.message`,
  because SES's rejection text embeds the recipient. The same rule binds every line of this feature.
- ⚠ **Cognito pools must not be replaced.** The Cognito change is verified in-place (research R6);
  the operator aborts on any `-/+`.
- ⚠ **Inbound mail on the apex is already load-bearing.** `hello@` works today. Every apex change is
  bracketed by an inbound check (SC-022).

**Scale/Scope**: 4 audiences · 6 client surfaces (2 touched) · ~50k/day send allowance against
single-digit current volume · 2 DNS zones · 1 environment.

---

## Constitution Check

*GATE: evaluated before Phase 0 and re-evaluated after Phase 1. Constitution v1.11.1.*

| Principle | Verdict | Evidence |
| --- | --- | --- |
| **I. Spec-Driven Development** | ✅ **PASS** | `spec.md` + `checklists/requirements.md` committed before this plan. Two design findings that contradict the spec are **amended in the spec**, not patched in code — see § Spec Amendments. |
| **II. Monorepo with Shared Contracts** | ✅ **PASS** | The sender address, reply-to, configuration-set name and events-topic ARN become **SSM contract values written once by Terraform** (`/effy/<env>/ses/*`), replacing three hardcoded literals in two `serverless.yml` files that had already drifted into two different shapes. The customer-facing delivery flag is added to the existing `CustomerDTO` in `@effy/shared-types`, not redefined per surface. |
| **III. Dual-Path Backend Discipline** | ✅ **PASS** | **Cold path, entirely.** Justification in § Path Justification. Nothing here is customer-latency work; the two pieces are an **async event worker** and **operator CRUD**, which are the cold path's two named purposes. The hot path (`core-api`) is untouched — it sends no email and gains none. |
| **IV. Auth Isolation** | ✅ **PASS** | No change to pools, issuers, validation, or credential routes. The Cognito change is an `email_configuration` swap (who sends the mail), not an auth change. The operator repair is gated by the **existing record-authoritative back-office gate** (`admin`/`manager` from `admin.staff` + `admin.staff_role`, never from the claim). ⚠ One **narrowing**: `edge-api/customer`'s `ses:SendEmail` on `Resource: "*"` is scoped to the environment's identity (FR-043). |
| **V. Native-Feel, Consistent Design** | ✅ **PASS** | Console UI uses `@effy/design-system/ui` + `@effy/web-kit/console` (`DataTable`, `AlertDialog`, `ErrorState`) exactly as `features/shops/` does. **No card layout** for the delivery view — a table and detail rows, per Principle V's no-cards rule. No new colour: the undeliverable state uses the existing error token and is **never conveyed by colour alone** (it carries a text label). |
| **VI. Layered Architecture & Explicit Wiring** | ✅ **PASS** | The new `admin` slice follows the established three layers — `src/functions/<handler>.ts` (thin) → `src/deliverability/service.ts` → `src/deliverability/repository.ts` (raw SQL) — mirroring `src/shops/`. No DI framework; no ORM. Console server state lives only in the TanStack Query cache. |
| **VII. Observability & Telemetry** | ✅ **PASS** | Declared in § Telemetry. This feature is *itself* an observability fix: it exists because a per-address failure is currently invisible. New namespace `Effy/Mail`, five metrics, three new alarms — and **every alarm gets a notification target**, including the previously silent inherited ones. |

**Quality Gates**: `spec.md` ✅, `plan.md` (this file) ✅, `tasks.md` → `/speckit-tasks`. Verification
commands are enumerated in [quickstart.md](./quickstart.md).

**Result: PASS — no violations. Complexity Tracking is empty.**

Re-evaluated after Phase 1 design: **still PASS.** The design added no new project, no new framework,
no ORM, no DI container and no third path. The one thing that grew is the SSM contract surface, which
is Principle II working as intended.

---

## Path Justification (Principle III)

**Cold path (`apis/edge-api/*`), 100%.** Three components, three reasons:

1. **The delivery-outcome consumer** is an *async event worker* — the constitution's own second
   example of cold-path work. It is triggered by SNS, not by a user, and nothing waits on it.
2. **The operator view and repair action** are *back-office CRUD* — the cold path's first named
   purpose — and they belong in `apis/edge-api/admin`, where the back-office authorizer, the
   record-authoritative role gate, the `admin.audit_log` writer and the pg pool already live.
3. **The customer's own delivery notice** rides the existing `GET /customer/v1/me`, which 011's
   routing law (**011's** FR-028) already assigns to the cold path: *commerce → hot path; profile/account →
   cold path.* A reachability flag on the account record is profile data.

**The hot path is deliberately untouched.** `apis/core-api` sends no email today and gains none here.
Order and receipt mail are out of scope (spec § Out of Scope); when they arrive they will sit on
whichever path owns orders and will reuse this feature's configuration set and outcome pipeline rather
than re-solving delivery.

**⚠ One thing that is NOT a service change:** `apis/edge-api/auth` (035's Cognito triggers) gains no
new logic. It gains three env vars read from SSM instead of a literal, and two extra fields on the
existing `SendEmailCommand`. Its send path, its timing, its phantom-send defence and its error
handling are untouched — deliberately (research R7).

---

## Project Structure

### Documentation (this feature)

```text
specs/037-platform-email-delivery/
├── spec.md                 # /speckit-specify (amended by this plan — see § Spec Amendments)
├── operator-inputs.md      # operator-supplied DKIM key + the hand-added records to import
├── plan.md                 # this file
├── research.md             # Phase 0 — R1…R14
├── data-model.md           # Phase 1 — the two new tables + the DTO delta
├── quickstart.md           # Phase 1 — the operator runbook, in strict order
├── contracts/
│   ├── ses-event.contract.md           # the SNS envelope this platform consumes
│   ├── deliverability-api.contract.md  # /admin/v1/deliverability/*
│   └── ssm-mail.contract.md            # /effy/<env>/ses/* — the app↔infra contract
├── checklists/requirements.md
└── tasks.md                # Phase 2 — /speckit-tasks, NOT created here
```

### Source Code (repository root)

```text
infra/
├── global/
│   ├── dns.tf                        # ± apex mail records (adopt MX + site-verification; add SPF,
│   │                                 #   Workspace DKIM, DMARC). Currently declares ONLY the zone.
│   ├── imports.tf                    # NEW — import {} blocks for the two hand-added records
│   └── variables.tf / global.tfvars  # + workspace_dkim_public_key, dmarc_rua, dmarc_policy
├── modules/
│   ├── ses-domain-identity/          # ± dmarc_rua; ± default configuration set on the identity
│   └── ses-events/                   # NEW — configuration set + SNS topic + event destination
└── envs/dev/
    ├── dns.tf                        # ± module "ses_events"; ± alarm_actions on the 3 alarms;
    │                                 #   ± pool email_configuration (configuration set + reply-to)
    ├── alerts.tf                     # NEW — the operator SNS topic + email subscription
    ├── otp-store.tf                  # ± alarm_actions on the 035 alarms (FR-037)
    ├── edge-domain.tf                # ± A/AAAA on the zone apex so the From domain resolves
    └── dev.tfvars                    # ses_sender_enabled: false → true

db/migrations/
└── <ts>_email_delivery.sql           # NEW — public.email_delivery_status + email_delivery_event

apis/edge-api/
├── auth/serverless.yml               # ± OTP_SENDER / REPLY_TO / CONFIG_SET from SSM, not literals
├── auth/src/otp/mailer.ts            # ± ConfigurationSetName + ReplyToAddresses (no logic change)
├── auth/src/lib/audience.config.test.ts  # ± assert the three new env vars are declared
├── customer/serverless.yml           # ± same three from SSM; ± ses:SendEmail scoped off "*"
├── customer/src/password/notify.ts   # ± ConfigurationSetName + ReplyToAddresses
├── customer/src/customer/{model,repo}.ts # ± emailDelivery on CustomerDTO (read-only join)
└── admin/
    ├── serverless.yml                # + 2 functions (SNS consumer, scheduled identity health)
    │                                 # + 3 httpApi routes + their alarms
    └── src/
        ├── functions/
        │   ├── ses-event-consumer.ts            # NEW — SNS trigger
        │   ├── ses-identity-health.ts           # NEW — scheduled MAIL FROM probe
        │   ├── deliverability-list-v1-get.ts    # NEW
        │   ├── deliverability-detail-v1-get.ts  # NEW
        │   └── deliverability-repair-v1-post.ts # NEW
        └── deliverability/
            ├── authz.ts  handler-support.ts  service.ts  repository.ts  types.ts
            └── *.test.ts

packages/shared-types/src/customer.ts # ± EmailDeliveryState + the DTO field

apps/back-office/src/
├── routes/deliverability.tsx         # NEW
├── components/layout/nav.ts          # ± one nav item
└── features/deliverability/          # NEW — repo/queries/screens, mirroring features/shops

apps/customer-web/app/(account)/account/
└── EmailDeliveryNotice.tsx           # NEW — the authenticated-only honest statement

scripts/mail-verify.sh                # ± apex coverage, DKIM reassembly, configuration set + topic
Makefile                              # ± mail-events-verify target
```

**Structure Decision**: no new top-level project and no new deployable service. The event consumer and
the operator routes both land in the **existing `apis/edge-api/admin`** service, because that is where
the back-office authorizer, the `admin.staff` role gate, the audit-log writer and the pg pool already
are; a new service would duplicate all four and add a deploy target for two functions. The **only new
Terraform module** is `ses-events`, extracted so that a second environment is a module call rather than
a copy (FR-040).

---

## Design decisions that shape the work

Full reasoning in [research.md](./research.md); the load-bearing five:

### 1. Per-message outcomes come from a configuration set, attached two ways (R2)

An SES configuration set with an SNS event destination is the *only* mechanism that reports **which
address** failed. It is attached **both** as the identity's default *and* explicitly on every
`SendEmail` call. Belt and braces on purpose: the identity default means no send is ever unattributed
even if a caller forgets, and the explicit parameter makes the attachment visible in code and
assertable in a test. Cognito attaches it via `email_configuration.configuration_set`.

### 2. Dev must not be able to lock a real customer out of production (R3)

The account-level block list is account-wide and region-wide, so a mistyped address in dev would make
that person unreachable in production. The environment's configuration set therefore declares
`suppression_options { suppressed_reasons = [] }`, which cancels both halves — dev sends neither add
to nor are blocked by the shared list.

⚠ **Three traps, all recorded**: (a) the provider's create path tests for *null*, not *empty*, so an
empty `suppression_options {}` block silently inherits — the explicit `= []` is load-bearing; (b) the
update path may send the field omitted, and AWS does not document whether that means "override with
nothing" or "clear the override", so the quickstart **verifies against the live API after apply**
rather than trusting the plan; (c) AWS's own global list still applies regardless.

⚠ And the cost is real: with suppression cancelled, dev keeps sending to genuinely dead addresses and
each attempt counts toward account bounce rate. That is why the value is a **variable**, defaulting to
account-inheriting, and set to `[]` only for non-production.

### 3. SES tenants were evaluated and rejected (R4)

`aws_sesv2_tenant` exists in the pinned provider — but pointing a configuration set at a tenant's own
suppression list requires `SuppressionOptions.SuppressionScope`, which **the provider does not
expose**, and tenant-scoped sending requires a tenant name on every `SendEmail` call, which
**Cognito's managed sender cannot supply**. Tenants would therefore isolate everything except the mail
that matters most. Rejected; revisit when both gaps close.

### 4. The delivery record is keyed by ADDRESS, not by person (R8)

A bounce event carries an address, not an identity. One address may have no account (a driver — there
is still no driver table), may pre-date an account, or may outlive one. Keying the store by address
makes every event recordable; the **per-person** answer FR-027 asks for is derived by join, and that
is what the console and the account read actually show.

⚠ The row stores the address **twice**: `address citext` for lookup (matching `public.customer.email`'s
own case-insensitivity) and `raw_address text` exactly as SES reported it — because the suppression
API is **case-sensitive**, and a repair that normalises case silently fails to remove an entry that
demonstrably exists, leaving the operator believing they fixed something they did not (FR-035).

### 5. Repair is three-part, and partial repair is a failed repair (R9)

Restoring a person means clearing (1) the SES suppression entry and (2) the platform's own status row,
in one audited action, with the audit row written **inside the same transaction as the status change**
per `src/shops/`'s established rule. Clearing only the platform half leaves SES still swallowing sends;
clearing only the SES half leaves the platform still showing the person as unreachable. SC-013
requires this be *demonstrated* by doing half of it and observing the person is still locked out.

---

## Spec Amendments

Principle I: a gap found in planning goes **back to the spec**. Two do.

### FR-030 — narrowed, because the original creates an account-enumeration oracle

**As written**: *"When an account is marked undeliverable, any flow that would email it MUST tell the
person plainly that the address cannot be reached, and MUST NOT claim a message was sent."*

**The problem**: the sign-in screen is **unauthenticated**. Delivery status is only knowable for an
address the platform has emailed, which implies an account. Saying "we can't reach that address" to
whoever typed it therefore answers *"does this person have an Effy account?"* to anyone who asks — and
035 spent real design effort (phantom sends to the mailbox simulator, timing parity, its FR-016) to
ensure that question has no answer. Honouring FR-030 literally would spend that defence on copy.

**The amendment** — FR-030 is split:

- **FR-030** now binds the surfaces where the person has **proven** the account is theirs: the
  customer account page shows an explicit notice, and the operator console shows it per person.
- **FR-030a** (new) binds the unauthenticated sign-in screen to a **uniform** escape hatch shown to
  *everyone* regardless of status — "still not arriving? write to hello@effyshopping.com" — which
  gives the locked-out person a route out while telling an attacker nothing. The code screen's copy
  MUST NOT vary with delivery status.

This preserves the outcome the spec was reaching for (nobody is stuck with no way forward) without
trading away a defence the platform already paid for. SC-011 is re-scoped to the account page, and a
new **SC-011a** requires the sign-in copy be **proven invariant** across a reachable and an
unreachable address.

### FR-032 — clarified, because "retry" was ambiguous

**As written**: *"The platform MUST NOT automatically retry an address recorded as permanently
undeliverable."*

**The problem**: read literally it would forbid sending when a *person* presses "send code", which is
not a retry — it is a human request, and refusing it would (a) require the branch that creates the
oracle above and (b) introduce a third timing class, breaking 035's parity property.

**The amendment**: FR-032 forbids **machine-initiated** resends — scheduled retries, queue redrives,
bulk re-sends, any loop the platform runs on its own. A person's own explicit request is always
attempted. The waste is bounded and the parity property is preserved.

---

## Telemetry (Principle VII)

**Metrics** — EMF on stdout in the 035 style, namespace **`Effy/Mail`**, dimension **`env` only**
(low cardinality; ⚠ never the address, never its domain):

| Metric | Emitted when |
| --- | --- |
| `mail_event_received` | any SES event consumed (`eventType` as a *property*, not a dimension) |
| `mail_hard_bounce` | a permanent failure is recorded |
| `mail_complaint` | a complaint is recorded |
| `mail_repair_performed` | an operator repair completes |
| `mail_from_domain_healthy` | 1/0, published hourly by the scheduled probe |

**Alarms** (all with `alarm_actions` → the new operator topic):

| Alarm | Condition | Why |
| --- | --- | --- |
| `mail-hard-bounce` | ≥ 1 in 5 min | a single lockout never moves a rate — this is the alarm the platform was missing |
| `mail-from-unhealthy` | `mail_from_domain_healthy` < 1, `treat_missing_data = breaching` | ⚠ no AWS metric exists for this (R11); a probe that stops running must trip, not silence |
| `mail-consumer-errors` | consumer Lambda errors > 0 | a dead consumer means blindness again |
| **inherited** | `ses_bounce_rate`, `ses_complaint_rate`, `cert_expiry`, and 035's four | they exist today and **notify nobody** (FR-037) |

**Product analytics**: none. Nothing here is a shopper-facing funnel; the customer notice is a state,
not an action. ⚠ The platform-wide gap that PostHog has never been initialised on customer-web is
**not** fixed here and remains 033's carry-forward.

**⚠ Logging rule, inherited from 035 and binding on every line of this feature**: never log a full
address, and never log SES's rejection text. The consumer logs `messageId`, `eventType`, `subType`
and a **SHA-256 prefix** of the address. The database stores the address because the product needs it;
CloudWatch does not.

---

## Phase 0 — Research

Complete: [research.md](./research.md). Fourteen decisions (R1–R14), each with alternatives and the
evidence that settled it. Nothing is marked NEEDS CLARIFICATION. The two questions that could not be
settled from documentation — the provider's suppression-*update* semantics, and whether Outlook accepts
the sending domain on an address record alone — are resolved by **operator verification steps in the
quickstart** rather than by assumption, and both are written so a wrong guess is visible immediately
rather than silently.

## Phase 1 — Design & Contracts

Complete:

- [data-model.md](./data-model.md) — `public.email_delivery_status`, `public.email_delivery_event`,
  the state machine, the idempotency key and the `CustomerDTO` delta.
- [contracts/ses-event.contract.md](./contracts/ses-event.contract.md) — the SNS envelope consumed,
  the fields relied on, and what is deliberately ignored.
- [contracts/deliverability-api.contract.md](./contracts/deliverability-api.contract.md) — the three
  back-office routes, their gate and their refusals.
- [contracts/ssm-mail.contract.md](./contracts/ssm-mail.contract.md) — `/effy/<env>/ses/*`, the
  app↔infra contract that ends the duplicated sender literals.
- [quickstart.md](./quickstart.md) — the operator runbook, in the **only** order that works.

## Phase 2 — Tasks

Not produced here. `/speckit-tasks` next.

---

## Ordering — the part that breaks if ignored

Six hard sequencing rules, all justified in [quickstart.md](./quickstart.md):

1. **Workspace authorisation + signing (FR-020) BEFORE the apex alignment policy (FR-014/FR-021)** —
   reversed, the policy quarantines Effy's own support replies.
2. **Adopt the two hand-added apex records BEFORE declaring anything else on those names** — a second
   declaration collides with the console entry instead of adopting it, and the apex `TXT` record set
   is shared between the site-verification proof and the new SPF string.
3. **Terraform apply BEFORE `serverless deploy`** — the functions resolve the topic ARN, sender and
   configuration-set name from SSM at deploy time. Reversed, the deploy fails on an unresolvable
   parameter.
4. **Migration committed BEFORE `db-up`** — the 003 commit guard refuses otherwise.
5. **Confirm the SNS email subscription by hand** — `terraform apply` reports success while the
   notification path is silently dead until a human clicks the link. ⚠ For a slice whose entire
   purpose is visibility, an unconfirmed subscription reproduces the exact defect it exists to fix.
6. **Click "Start authentication" in Workspace only AFTER the signing record resolves** — Google checks
   DNS at that moment.

---

## Risks

| Risk | Mitigation |
| --- | --- |
| ⚠ The apex change breaks `hello@`, which works today and is now load-bearing | Adopt-first, then add; inbound is checked **before and after** every apply (SC-022); the mail-exchanger record is never re-declared, only adopted |
| ⚠ The 410-char signing value is split wrongly and silently corrupts | Published as **one record with two character-strings**, never two records; a test asserts the reassembled value is byte-identical to `operator-inputs.md`; `mail-verify.sh` reassembles from live DNS and compares |
| ⚠ The suppression override does not actually take effect | Verified against the live API after apply, not inferred from the plan (R3) |
| ⚠ The Cognito switch replaces a pool | Confirmed in-place in the provider source (R6); the operator still aborts on `-/+`, per the standing rule |
| ⚠ The dev sending domain is still rejected by Outlook with an address record alone | Explicit acceptance test (SC-004/SC-005) on all three providers; if it fails, add a mail-exchanger record — the decision and its trigger are written down (R5) |
| The consumer double-writes on redelivered events | Idempotency key `(message_id, event_type, address)` with `ON CONFLICT DO NOTHING`; SES event publishing is explicitly at-least-once and unordered |
| Scope creep into order/receipt mail | Out of scope in the spec; the configuration set and the outcome pipeline are built so a later slice adds a *sender*, not a *system* |

---

## Complexity Tracking

**Empty — the Constitution Check passes with no violations.**

No new project, no new framework, no ORM, no DI container, no third backend path, no new locked
technology. The single new Terraform module exists to satisfy FR-040 (a second environment is a module
call, not a copy), which is Principle II applied to infrastructure.
