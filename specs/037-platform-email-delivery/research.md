# Phase 0 Research — 037 Platform Email Delivery

Fourteen decisions. Each records what was chosen, why, and what was rejected. Everything measured is
dated; everything unconfirmed is labelled and given an operator verification step rather than an
assumption.

**Provider baseline**: `hashicorp/aws` pinned **6.53.0** (`infra/envs/dev`) and **6.54.0**
(`infra/global`), constraint `~> 6.0`; Terraform `>= 1.11.0`.

---

## R1 — The premise of the feature request was already false

**Decision**: Build on the assumption that unrestricted sending is **already granted**, and make
re-proving it the first task rather than the last.

**Evidence** (measured 2026-08-05, `ap-southeast-2`):

```
ProductionAccessEnabled: true        ReviewDetails.Status: GRANTED (case 178578384200127)
Max24HourSend: 50000                 MaxSendRate: 14                SentLast24Hours: 6
dev.effyshopping.com: VerificationStatus SUCCESS, DKIM SUCCESS (RSA_2048)
MailFromDomain: mail.dev.effyshopping.com, MailFromDomainStatus: SUCCESS
Suppressed destinations: (none)
```

**Why it matters**: `CLAUDE.md` and [035's sign-off](../035-six-digit-otp/SIGNOFF.md) both record the
sandbox as the platform's headline blocker for production. It is not. Planning against a stale blocker
would have produced a slice mostly about a request that has already succeeded, and would have missed
the gaps that actually exist.

**Rejected**: taking the request's premise at face value. The cost of checking was two API calls.

⚠ **Carry-forward**: `CLAUDE.md` and the 035 sign-off both need correcting. That is a documentation
task in this slice, not a footnote.

---

## R2 — Per-message outcomes require a configuration set; attach it twice

**Decision**: one configuration set per environment, attached **both** as the identity's default
(`aws_sesv2_email_identity.configuration_set_name`) **and** explicitly by every caller
(`ConfigurationSetName` on `SendEmailCommand`, `email_configuration.configuration_set` on each pool).

**Why**: without a configuration set, SES publishes no per-message events, and the platform's only
signal is an account-wide rate — which is exactly the state that lets one person be locked out
invisibly. With one, `Bounce`/`Complaint`/`Delivery`/`Reject`/`DeliveryDelay` carry the message id and
the recipient.

**Why twice**: the identity default is a **safety net** (a caller that forgets is still observed); the
explicit parameter is **visible in code** and therefore assertable in a unit test. Neither alone is
enough — a default is invisible and easy to lose in a refactor; an explicit parameter is easy to omit
in a new caller. ⚠ Note the precedence: an explicit value always beats the default, so the two must
name the *same* set, which the SSM contract guarantees.

**Event types selected**: `BOUNCE`, `COMPLAINT`, `DELIVERY`, `REJECT`, `DELIVERY_DELAY`. `SEND` is
omitted (it doubles the volume and tells us nothing we do not already know at the call site);
`OPEN`/`CLICK` are omitted deliberately — they require tracking pixels and link rewriting, which on a
one-time-code email is both useless and a privacy cost for nothing.

⚠ **`enabled` defaults to `false`** on `aws_sesv2_configuration_set_event_destination`. An event
destination created without it is inert and looks perfectly healthy. Set it explicitly.

**Rejected**: identity-level feedback notifications (the legacy mechanism) — per-identity rather than
per-stream, fewer event types, and not what suppression scoping keys off.

---

## R3 — ⚠ Dev must not be able to lock a real customer out of production

**Decision**: the environment's configuration set declares `suppression_options { suppressed_reasons
= [] }` in non-production, driven by a variable that defaults to account-inheriting so production can
keep the protection.

**The problem this solves (FR-041)**: the account-level block list is **account-wide and
region-wide**. A developer testing with a mistyped address in dev produces a hard bounce, the address
is blocked, and a later *production* send to that same person is accepted-and-dropped. A real customer
becomes unreachable because of a typo in a test.

**Evidence that `[]` fixes it**: AWS documents exactly three configuration-set suppression states, and
the second is *"Override account level settings — email sent with this configuration set will not use
any suppression settings at all."* The console procedure is titled *"Do not use any suppression"* and
states *"all suppression is cancelled."* The blocking half is symmetric with the reasons list: the
account-level page says a stored entry blocks a send only when its reason *matches* the configured
reasons — with none configured, nothing matches in either direction. So `[]` stops both the **add**
and the **block**.

**⚠ Three traps, all real:**

1. **`suppression_options {}` (empty block) is NOT `suppressed_reasons = []`.** The provider's create
   path reads the raw config and tests `IsNull()`, not emptiness, so an empty block sends nothing to
   the API and the set silently **inherits** account settings — the exact opposite of the intent, with
   no error. The explicit `= []` is load-bearing.
2. **The update path differs from the create path.** On update the provider calls
   `PutConfigurationSetSuppressionOptions` with `SuppressedReasons` **nil** when the list is empty, and
   AWS does not document whether that means "override with nothing" or "clear the override". ⚠ **Not
   confirmed from documentation.** Resolved operationally: the quickstart verifies against the live
   API after apply. `{"SuppressedReasons": []}` = override active; `null`/absent = inheriting, and the
   isolation is **not** in place.
3. **AWS's own global suppression list still applies.** `[]` buys no immunity from it. It is not
   customer-controlled and is not in scope.

**⚠ The accepted cost**: with suppression cancelled, dev keeps sending to genuinely dead addresses,
and each attempt counts toward the shared account bounce rate. At single-digit daily volume this is
negligible; at scale it would not be. The mitigation is that this feature *records* every such
failure, so a dead address in dev is visible rather than merely absorbed.

**Rejected**: leaving dev to inherit account suppression (protects reputation, but violates FR-041 and
puts a real customer's access at the mercy of a test typo); separate AWS accounts per environment
(correct long-term, disproportionate for a solo operator today, and a whole slice of its own).

---

## R4 — SES tenants evaluated and rejected

**Decision**: do not use SES tenants.

**Why it was tempting**: tenants (GA Aug 2025) provide genuine **per-tenant suppression lists**, which
is a cleaner answer to R3 than an override on a shared list. And `aws_sesv2_tenant` /
`aws_sesv2_tenant_resource_association` **do exist** in the pinned provider (added 6.28.0 and 6.29.0).

**Why it was rejected — two independent blockers**:

1. Pointing a configuration set at the tenant's suppression list requires
   `SuppressionOptions.SuppressionScope = TENANT`. That field is **absent from the provider schema at
   6.53.0** — `suppression_options` exposes `suppressed_reasons` and nothing else.
2. More decisively: *"If you set `SuppressionScope` to `TENANT`… all `SendEmail` requests that use
   this configuration set must include a tenant name. Requests without a tenant name are rejected."*
   **Cognito's managed sender cannot supply a tenant name.** So tenant-scoped suppression would
   isolate the platform's own Lambda sends and **reject every Cognito-sent message** — which is
   sign-up confirmation, password recovery and both step-up codes.

Tenants would isolate everything except the mail that matters most. **Revisit when both gaps close.**

---

## R5 — The sending namespace gets an address record, and (for now) no mail-exchanger record

**Decision**: publish `A`/`AAAA` on `dev.effyshopping.com` (alias to the existing regional API gateway
endpoint, the same target `edge-api.dev` already uses). Do **not** publish a mail-exchanger record on
it yet.

**The problem (FR-013)**: `dev.effyshopping.com` is the domain in the visible sender of every code the
platform sends, and measured 2026-08-05 it has **no address record and no mail-exchanger record** —
it does not resolve at all. RFC 5321 §2.3.5 requires a sender domain to exist and be queryable, and
deliverability practitioners report Microsoft and Yahoo rejecting outright on non-resolving sender
domains, sometimes wanting *both* records present.

**Why an address record alone**: RFC 5321's implicit-MX rule means a host with an address record is
mail-routable without an explicit mail-exchanger record. Adding one would require registering
`dev.effyshopping.com` as a domain in the operator's mail service (real operator cost) and would make
the sending domain accept mail nobody reads — while FR-022 already routes replies to
`hello@effyshopping.com`, which is monitored.

⚠ **Honest about the residual risk**: the "some receivers want both" claim is practitioner reporting,
not a specification, and I could not settle it from primary sources. So it is settled **empirically**:
SC-004/SC-005 test acceptance at Gmail, Outlook and Yahoo. **If Outlook rejects or junks, the fix is to
add the mail-exchanger record** — the trigger and the remedy are written down in advance rather than
discovered during an incident.

⚠ **Note what the address record is not**: it aliases the API gateway, so it resolves and serves API
404s. It is **not a website**, and this slice does not pretend otherwise. A real dev landing page is
out of scope.

**Rejected**: a null mail-exchanger record — RFC 7505 explicitly warns against publishing one on a
domain used in `From`, *"it risks having its mail rejected"*, so it is worse than nothing.

---

## R6 — The Cognito switch is in-place, but the operator still checks

**Decision**: set `ses_sender_enabled = true`, add `configuration_set` and `reply_to_email_address` to
each pool's `email_configuration`, and apply.

**Evidence**: `aws_cognito_user_pool`'s `email_configuration` block carries **no `ForceNew` on the
block or any member** at 6.53.0. Changing `email_sending_account` from `COGNITO_DEFAULT` to `DEVELOPER`
is an in-place `UpdateUserPool`.

⚠ **The operator still aborts on `-/+`.** A pool can be replaced by *another* attribute changing in the
same apply, and pool replacement would destroy every account on the platform. The standing rule from
007/011/012 holds unchanged.

**What this actually fixes**: today sign-up confirmation, password recovery, email-change verification
and both step-up codes are sent by Cognito's built-in sender — a generic third-party address, **capped
at roughly 50 messages per day per pool**. That cap, not the sandbox, is the platform's real onboarding
ceiling right now (FR-007), and the unbranded sender is the "two voices" defect (FR-002/FR-006).

**Prerequisite that is easy to miss**: Cognito rejects an unverified identity for `source_arn`. The
identity is already verified (R1), so this is satisfied — but it is why 010 staged the switch
separately, and the staging is preserved.

---

## R7 — ⚠ The send path does NOT branch on delivery status

**Decision**: `apis/edge-api/auth` gains no conditional. Every request to send a code results in a
send, exactly as today, regardless of whether the address is known-undeliverable.

**Two independent reasons**:

1. **Timing parity.** 035 sends a phantom message to `success@simulator.amazonses.com` for unknown
   users specifically so an attacker cannot distinguish "account exists" from "account does not" by
   response time. A branch that *skips* the send for undeliverable addresses creates a **third timing
   class** and reopens the hole from a new direction.
2. **Enumeration.** Any behaviour that varies with delivery status is observable, and delivery status
   implies an account. See the FR-030 amendment in [plan.md](./plan.md#spec-amendments).

**What is given up**: sends to blocked addresses still consume daily allowance and are still billed.
At this volume that is pennies, and it buys a defence the platform already paid for.

**How FR-032 is still met**: it is amended to forbid **machine-initiated** resends — scheduled
retries, redrives, bulk re-sends. The platform runs no such loop, and this feature adds none. A person
pressing "send code" is not a retry.

---

## R8 — The delivery record is keyed by address, not by person

**Decision**: two new tables keyed on the **email address**; the per-person view is derived by join.

**Why not a column on each person table**: a bounce event carries an address, not an identity. Keying
by person would mean:
- three tables to write (`public.customer`, `public.shop_staff`, `admin.staff`) with three different
  email column shapes — `citext NOT NULL UNIQUE`, `text` nullable un-indexed, `text NOT NULL`
  un-indexed;
- **nowhere at all to write a driver's outcome**, since there is still no driver table despite a
  driver pool existing;
- nothing to write when an address bounces before its account exists, or after it is deleted.

An address-keyed store records every event unconditionally. FR-027 asks that the failure be recorded
"against the person's account, not merely against the address" — that intent is met by **derivation**:
the console looks a person up and shows their delivery state, and the customer account read joins on
`public.customer.email`. The store is address-keyed because the *event* is; the *product* is
person-shaped, and the join is what makes it so.

⚠ **The address is stored twice, on purpose.** `address citext` for lookup (matching
`public.customer.email`, which is already `citext` because Cognito treats email case-insensitively)
and `raw_address text` exactly as SES reported it. The suppression-management API is **case-sensitive**
— `User@Example.com` and `user@example.com` are the same address for sending but require an exact case
match to delete. A repair that normalises case fails silently, and the operator believes they fixed
something they did not (FR-035). This is the single most likely way this feature ships broken.

---

## R9 — Repair is two writes plus one API call, and half of it is a failure

**Decision**: one audited operator action that (a) deletes the SES suppression entry using
`raw_address`, and (b) resets the platform status row — with the audit row written **inside the same
transaction** as the status change, per `src/shops/repository.ts`'s established rule.

**Why both**: clearing only the platform half leaves SES accepting-and-dropping every future send;
clearing only the SES half leaves the console and the customer's account page still reporting the
person as unreachable. Neither half alone restores anyone.

**Order**: SES first, then the database. If the SES call fails the transaction never opens and nothing
is recorded, which leaves a true state. The reverse order could commit "repaired" while the address is
still blocked — the worst possible outcome, because it looks fixed.

⚠ **SC-013 requires this be demonstrated**, by performing half the repair and observing the person is
still locked out. A "both or neither" rule that has never been tested by doing one is decoration.

**Rejected**: an automatic un-suppression on a schedule. A hard bounce means the mailbox is genuinely
gone; retrying it automatically is what damages sender reputation, and it is precisely what the
production-access acknowledgement commits the platform *not* to do.

---

## R10 — The consumer and the operator routes live in `apis/edge-api/admin`

**Decision**: no new service. The SNS consumer, the scheduled health probe and the three operator
routes are added to the existing `admin` cold-path service.

**Why**: `admin` already has everything this needs — the back-office JWT authorizer wired from SSM, the
record-authoritative `admin.staff` role gate, the `admin.audit_log` writer, the pg pool with the pinned
RDS CA, and the `/admin/v1/*` path prefix the console already calls. A new service would duplicate all
four, add a deploy target and a new path prefix, for two functions and three routes.

**Precedent**: `admin` already writes across schemas (`public.shop`, `public.shop_staff`,
`admin.audit_log`).

⚠ **The one real cost**: an `admin` deploy now also redeploys the event consumer. At this volume the
blast radius is a few minutes of buffered SNS retries, which SNS handles. Recorded, accepted.

**Rejected**: a new `apis/edge-api/mail` service — cleaner separation on paper, but it would either
serve `/mail/v1/*` (breaking the console's single-prefix assumption) or serve `/admin/v1/*` from a
service not called admin (breaking the 004 path scheme). Neither is worth it for two functions.

---

## R11 — ⚠ There is no AWS signal for a broken bounce-return configuration; build one

**Decision**: an hourly scheduled Lambda reads the identity's `MailFromAttributes.MailFromDomainStatus`
and publishes a `mail_from_domain_healthy` 1/0 metric; the alarm uses
`treat_missing_data = "breaching"`.

**Why it is needed**: with `behavior_on_mx_failure = USE_DEFAULT_VALUE` (the setting the platform
already uses, and the right one — see R12), a broken bounce-return route causes SES to silently fall
back to `amazonses.com`. **Mail keeps flowing.** No bounce, no reject, no metric moves. What breaks is
sender-authorisation alignment, so deliverability decays at the receiver over days and the existing
rate alarms fire only after the damage. This is the archetype of the failure this whole slice exists to
end: real, consequential, and invisible.

**Why it must be built**: verified absent — there is **no CloudWatch metric** for identity or
MAIL-FROM state, and **no EventBridge event** either (the `aws.ses` catalogue is per-message only:
delivered, bounced, complaint, rejected, sent, opened, clicked, delayed, subscribed, rendering-failed,
plus advisor and sending-status). The only documented signal is an email to the AWS **account root
address**, which on a solo-operator project is exactly as unmonitored as the gap this slice is fixing.

⚠ `treat_missing_data = "breaching"` is deliberate: a probe that stops running must trip the alarm, not
silence it. The same reasoning as `cert_expiry`'s existing setting.

---

## R12 — Keep `USE_DEFAULT_VALUE` on bounce-return failure

**Decision**: unchanged from 010. Do not switch to `REJECT_MESSAGE`.

**Why**: `REJECT_MESSAGE` turns a transient DNS fault on one subdomain into *"nobody on any of four
audiences can sign in"*, because email is the only credential on three of them. `USE_DEFAULT_VALUE`
degrades only sender-policy alignment — and the cryptographic signature still aligns, so the alignment
policy still passes. Degraded authentication beats total lockout.

⚠ The failure mode is silent, which is precisely why R11's probe is not optional. Choosing the safer
behaviour and then not alarming it would be choosing the *quietly* broken option.

⚠ Also worth recording: the `Failed` state is **terminal** — SES stops retrying after 72 hours and the
setup must be restarted by hand. So the alarm is not a nicety; it is the only thing standing between a
transient DNS blip and a permanently degraded sending identity.

---

## R13 — The apex records: adopt two, add three, in a specific order

**Decision**:

| Name | Type | Action | Value |
| --- | --- | --- | --- |
| `effyshopping.com` | `MX` | **adopt** (exists) | `1 SMTP.GOOGLE.COM.` |
| `effyshopping.com` | `TXT` | **adopt, then extend** | existing ownership proof **+ a new sender-policy string** |
| `google._domainkey.effyshopping.com` | `TXT` | **add** | the operator-supplied 2048-bit key, split |
| `_dmarc.effyshopping.com` | `TXT` | **add, LAST** | `v=DMARC1; p=none; sp=none; rua=…; fo=1` |
| `dev.effyshopping.com` | `A`/`AAAA` | **add** | alias (R5) |

**Four things that will go wrong if done naively:**

1. **⚠ The ordering.** Authorisation and signing must land **before** the alignment policy. Reversed,
   the policy quarantines Effy's own support replies — mail *from* `hello@` currently passes neither
   check, because nothing authorises the operator's mail service and no signing record exists. This is
   FR-021, and it is the least obvious failure in the slice.
2. **⚠ Adoption, not re-declaration.** The mail-exchanger record and the ownership proof were added by
   hand. Route 53 holds **one record set per (name, type)**, so declaring a second
   `aws_route53_record` for the same name+type does not merge — the apply clobbers. Both must be
   brought into state with `import` blocks before anything else touches those names. And because the
   ownership proof and the new sender policy share the apex `TXT` name, they are **two strings in one
   record set**, never two resources.
3. **⚠ Two sender-policy strings would break all mail from the domain.** RFC 7208 §3.2/§4.5: a verifier
   discards records not beginning `v=spf1`, then errors permanently if more than one remains. So the
   ownership proof beside the policy is **fine** (it is discarded), but a second `v=spf1` string is a
   permanent failure for *every* message. Adding a future sender means **editing the existing string**,
   and that rule belongs in a comment on the resource.
4. **⚠ The 410-character signing value must be one record with two character-strings.** Two `records`
   elements produce two separate TXT records, and a verifier sees two records neither of which is a
   valid key — valid DNS, silent corruption. One element containing an embedded `" "` produces one
   record with two strings, which resolvers concatenate **without adding spaces**. A test asserts the
   reassembled value is byte-identical to `operator-inputs.md`.

**Lookup budget**: `include:_spf.google.com` costs **1** DNS lookup (Google flattened its record in
December 2025 — the old nested `_netblocks*` chain is gone). The 10-lookup ceiling is not remotely
approached, and no flattening is needed.

**Alignment policy value**: starts at `p=none` with `rua=` reporting (FR-017), plus `sp=none` so no
future environment subdomain silently inherits enforcement before it is ready. ⚠ **A subdomain with
its own policy record is unaffected by the parent's** — receivers query the sender's domain first and
only fall back to the organisational domain when nothing is found. That is why `dev.effyshopping.com`
can stay at its own `p=none` while the apex is tightened later, and it is why every environment must
publish its own record (FR-015).

---

## R14 — Ending the duplicated sender literals

**Decision**: Terraform publishes four values to SSM; every consumer reads them from there.

```
/effy/<env>/ses/sender             "Effy <no-reply@dev.effyshopping.com>"
/effy/<env>/ses/reply_to           "hello@effyshopping.com"
/effy/<env>/ses/configuration_set  "effy-dev-mail"
/effy/<env>/ses/events_topic_arn   "arn:aws:sns:…:effy-dev-ses-events"
```

**The defect this fixes**: the sender address exists today in **three** places with **two** shapes —
`apis/edge-api/auth/serverless.yml` and `apis/edge-api/customer/serverless.yml` both hardcode the bare
`no-reply@${sls:stage}.effyshopping.com`, while the Terraform module outputs the display-name form
`Effy <no-reply@…>` for Cognito. They have already drifted, and FR-005 requires them identical. One
writer, many readers (Principle II).

⚠ **The failure mode this must not repeat**: 035's fourth defect was an audience map reading four env
vars that `serverless.yml` never declared — every pool resolved "unknown", no email was ever sent, and
**100 passing tests missed it because they set the variables themselves**. That is the same failure as
027 R13, 029 and 033. The countermeasure already exists in the repo
(`apis/edge-api/auth/src/lib/audience.config.test.ts` parses the real `serverless.yml`) and is
**extended here** to cover the three new variables in both services. A unit test that mocks its own
configuration can never notice that the configuration does not exist.

⚠ **The reply-to is a reversal of a recorded decision.** 010's FR-022 set `reply_to_email_address =
null` with the comment *"the platform cannot RECEIVE mail; an address that silently bounces replies is
worse than none."* That reasoning was correct and is now obsolete: the apex has a working
mail-exchanger record and `hello@` is an alias on the operator's account. Recorded as a reversal in the
spec (FR-022), not as a silent contradiction.

---

## Open items — resolved by verification, not assumption

| # | Question | How it is settled |
| --- | --- | --- |
| 1 | Does the provider's suppression **update** path actually leave the override active? | `aws sesv2 get-configuration-set` after apply; `{"SuppressedReasons": []}` = active, `null` = **not isolated** (R3) |
| 2 | Does Outlook accept the sending domain with an address record but no mail-exchanger record? | SC-004/SC-005 acceptance test; remedy pre-decided (R5) |
| 3 | Does the identity's default configuration set actually attach to **Cognito**-sent mail? | Cognito is configured with an explicit `configuration_set`, so it does not depend on the default; verified by observing a `Delivery` event for a sign-up confirmation (R2, R6) |
| 4 | Will a `p=none` apex policy produce usable aggregate reports? | Reports are checked one week after the alignment policy is published, before any tightening is considered (FR-017) |

⚠ None of these blocks implementation. All four are written so that a wrong guess is **visible
immediately** rather than silently absorbed — which is the property every one of this platform's
recurring defects has lacked.
