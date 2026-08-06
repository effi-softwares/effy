# Quickstart — 037 Platform Email Delivery (operator runbook)

Every step that provisions cloud resources, publishes DNS or mutates live state is **operator-run**.
This file is the exact order and the exact commands.

⚠ **The order is load-bearing.** Four of the steps below break things if run early, and **three of
those break them silently**. Read § 0 before running anything.

**Defaults**: `AWS_PROFILE=ef`, `AWS_REGION=ap-southeast-2`, `ENV=dev`.
Parent zone `Z0506267W447QBDSL13U` · apex `effyshopping.com` · sending namespace
`dev.effyshopping.com`.

---

## 0. The six ordering rules

| # | Rule | What happens if you break it |
| --- | --- | --- |
| 1 | Adopt the two hand-added apex records **before** declaring anything on those names | Route 53 holds one record set per (name, type). A second declaration **clobbers** the live mail-exchanger record — ⚠ `hello@` stops receiving |
| 2 | Publish sender-authorisation **and** the signing key **before** the alignment policy | ⚠ The policy quarantines Effy's own support replies. Silent — you find out from a customer |
| 3 | `terraform apply` **before** `serverless deploy` | The deploy fails resolving SSM parameters. Loud, harmless |
| 4 | Commit the migration **before** `make db-up` | The 003 commit guard refuses. Loud, harmless |
| 5 | Confirm the alert email subscription **by hand** | ⚠ Apply reports success while the alert path is dead. Silent — and it reproduces the exact defect this slice exists to fix |
| 6 | Click **Start authentication** in Workspace only **after** the signing record resolves | Google checks DNS at that moment; clicking early fails and must be retried. Loud, harmless |

---

## 1. Baseline — prove the premise before changing anything

```bash
export AWS_PROFILE=ef AWS_REGION=ap-southeast-2

# (a) Unrestricted sending — expect ProductionAccessEnabled: true
aws sesv2 get-account --query '{Production:ProductionAccessEnabled,Sending:SendingEnabled,Max:SendQuota.Max24HourSend}'

# (b) The sending identity — expect VerificationStatus SUCCESS, MailFromDomainStatus SUCCESS
aws sesv2 get-email-identity --email-identity dev.effyshopping.com \
  --query '{Verified:VerificationStatus,Dkim:DkimAttributes.Status,MailFrom:MailFromAttributes}'

# (c) Inbound on the apex — MUST return "1 smtp.google.com." BEFORE and AFTER every apex change (SC-022)
dig +short MX effyshopping.com @8.8.8.8

# (d) SC-001's real proof: send a code to an address never registered anywhere, from a real client.
#     If this ALREADY works, R1 is confirmed and the recipient restriction is genuinely gone.
```

⚠ Record (d)'s result before proceeding. Everything below assumes it passed; if it did not, the cause
is in the gaps this slice fixes, not in a sandbox.

---

## 2. Workspace — generate the signing key (operator, in Google's console)

Already done — the value is in [operator-inputs.md](./operator-inputs.md) §1 (2048-bit, selector
`google`, 410 characters, verified to parse as a valid RSA public key).

⚠ **Do not click "Start authentication" yet.** Google checks DNS at that moment and the record does
not exist until § 4.

---

## 3. Adopt the hand-added apex records

```bash
make global-init
cd infra/global && AWS_PROFILE=ef terraform plan -var-file=global.tfvars
```

⚠ **CORRECTED 2026-08-06.** This section originally said to expect
`0 to add, 0 to change, 0 to destroy / 2 to import`. That was written for a sequence where adoption
was a separate commit from the new records; the config declares all four records in one file, so a
single plan does everything. The expectation below is what this config actually produces.

```
Plan: 2 to import, 2 to add, 2 to change, 0 to destroy.
```

**Read the two changes carefully — they are the whole point of this step:**

| Resource | Expected | ⚠ If you see anything else |
| --- | --- | --- |
| `apex_mx` | **`ttl 300 -> 3600` and NOTHING ELSE** | A change to `records` means the declaration does not match the live value. **STOP.** Applying would clobber the only route to the company's mailbox. |
| `apex_txt` | ttl change + the sender-policy string **added** beside the existing ownership proof | The proof being *replaced* rather than kept means all four records would collapse into one. **STOP.** |

The usual cause of a mismatch is TXT quoting: the value in HCL is the record's *content*
(`google-site-verification=…`), never wrapped in escaped quotes.

### ⚠ Stage the apply — do not apply the whole plan at once

The plan creates the alignment policy in the same run as the authorisation and signing records,
which is ordering rule 2 in reverse. At `p=none` the consequence does not bite (a monitor-only policy
tells receivers to take no action, and the sender-policy record is live immediately), but stage it
anyway — the habit is what protects you when the policy is later tightened to quarantine or reject.

```bash
cd infra/global
AWS_PROFILE=ef terraform apply -var-file=global.tfvars \
  -target=aws_route53_record.apex_mx \
  -target=aws_route53_record.apex_txt \
  -target=aws_route53_record.workspace_dkim

dig +short MX effyshopping.com @8.8.8.8    # ⚠ must still return 1 smtp.google.com.
```

---

## 4. Apex — authorisation and signing (NOT yet the policy)

Adds the sender-policy string to the existing apex `TXT` record set, and the Workspace signing record.
⚠ The alignment policy is deliberately **not** in this apply (rule 2).

```bash
make global-plan      # review: apex TXT gains one string; google._domainkey is created
make global-apply

# Verify — the signing value must come back as ONE record rendered as TWO adjacent quoted strings
dig +short TXT google._domainkey.effyshopping.com @8.8.8.8
dig +short TXT effyshopping.com @8.8.8.8      # expect BOTH the ownership proof AND v=spf1
```

⚠ If the signing value comes back as **two separate records**, it was published as two `records`
elements instead of one element containing an embedded `" "`. That is valid DNS and a **broken key** —
fix it before the next step.

Then, in the Workspace admin console: **Start authentication**.

```bash
# Prove it end-to-end: send from hello@effyshopping.com to a Gmail AND an Outlook address,
# then open the received message's "show original" / message header and confirm SPF=pass, DKIM=pass.
# This is SC-009a. It MUST pass before § 5.
```

---

## 5. Apex — the alignment policy

Only now. Creates `_dmarc.effyshopping.com` at `p=none; sp=none; rua=…; fo=1`.

⚠ Prerequisite: the operator creates the `dmarc@effyshopping.com` alias in Workspace first (same
one-click as `hello@`), or reports land nowhere.

```bash
make global-plan && make global-apply
dig +short TXT _dmarc.effyshopping.com @8.8.8.8
dig +short MX effyshopping.com @8.8.8.8       # ⚠ inbound check again (SC-022)

# Re-run the § 4 send test. A pass BEFORE the policy and a fail AFTER means rule 2 was violated.
```

---

## 6. Dev environment — events, alerts, the sending namespace, and Cognito

⚠ Two applies, not one. The Cognito switch is staged separately so a pool-replacement plan can be
aborted without also reverting the event pipeline.

### 6a. Infrastructure

```bash
make plan ENV=dev      # review: ses-events module, alerts topic, dev.effyshopping.com A/AAAA,
                       #         alarm_actions on the 3 existing + 4 from 035
make apply ENV=dev
```

**Then, immediately — rule 5:**

```bash
# Confirm the subscription from the email AWS just sent, then prove it:
aws sns list-subscriptions-by-topic \
  --topic-arn "$(aws ssm get-parameter --name /effy/dev/alerts/topic_arn --query Parameter.Value --output text)" \
  --query 'Subscriptions[?SubscriptionArn==`PendingConfirmation`]'
# ⚠ MUST be []. Anything else means every alarm in this slice notifies nobody.
```

**And verify the suppression override actually took (research R3, open item 1):**

```bash
aws sesv2 get-configuration-set --configuration-set-name effy-dev-mail --query 'SuppressionOptions'
# {"SuppressedReasons": []}  → override ACTIVE, dev cannot poison production ✅
# null / absent             → INHERITING. FR-041 is NOT met. Stop and fix.
```

```bash
dig +short A dev.effyshopping.com @8.8.8.8    # must resolve (FR-013)
```

### 6b. Cognito onto the platform's own sender

```bash
# dev.tfvars: ses_sender_enabled = false → true
make plan ENV=dev
```

⚠ **Read the plan. If ANY pool shows `-/+` (replacement), ABORT** — pool replacement destroys every
account on the platform. Expected: four in-place updates to `email_configuration` only.

```bash
make apply ENV=dev
make verify-pool-credentials ENV=dev    # the audience rules must be unchanged by this slice
```

---

## 7. Database

```bash
make db-status ENV=dev
git add db/migrations && git commit -m "feat(037): email delivery outcome tables"   # rule 4
make db-up ENV=dev
```

---

## 8. Deploy the cold path

```bash
make edge-test                              # typecheck + vitest, every cold-path service (5)
make edge-deploy SERVICE=auth ENV=dev       # sender/reply-to/config-set now from SSM
make edge-deploy SERVICE=customer ENV=dev   # same, plus the narrowed ses:SendEmail
make edge-deploy SERVICE=admin ENV=dev      # + SNS consumer, health probe, 3 routes
```

⚠ `auth` and `customer` are deployed **before** `admin`: the consumer is useless without senders that
attach the configuration set, and deploying it first means its first minutes look (correctly) idle,
which is easy to misread as broken.

---

## 9. Prove it — the checks that actually settle the success criteria

### 9a. Delivery and authentication (SC-002, SC-004, SC-005)

```bash
make mail-verify ENV=dev
```

Extended in this slice to also check: the apex mail-exchanger record, both apex TXT strings, the
signing record **reassembled and compared byte-for-byte** against `operator-inputs.md`, the alignment
policies on apex and dev, the configuration set's suppression override, and the events topic.

Then by hand — request a code at a **Gmail**, an **Outlook** and a **Yahoo** address:

- it arrives, **in the inbox** (SC-005);
- "show original" reports **SPF pass, DKIM pass, DMARC pass** (SC-004);
- the sender is `Effy <no-reply@dev.effyshopping.com>` on **all five** flows — sign-in, sign-up
  confirmation, password recovery, email-change, account-closure step-up (SC-002);
- ⚠ **replying to it lands in the operator's mailbox** (SC-009).

⚠ **If Outlook rejects or junks**, the cause is most likely the sending namespace having no
mail-exchanger record. The remedy is pre-decided (research R5): add one. Do not guess at other causes
first.

### 9b. The lockout path, end to end (SC-010, SC-011, SC-012, SC-013)

Use the simulator — it needs no verified recipient, does not touch reputation, and is **not** added to
the suppression list, so it can be run repeatedly.

```bash
# 1. Drive a hard bounce for a test account whose address routes to the simulator.
# 2. Within 5 minutes: the console's deliverability list shows it as undeliverable (SC-010).
# 3. Sign in as that customer → the account page states the address cannot be reached (SC-011).
# 4. ⚠ SC-013 — do HALF the repair first:
aws sesv2 delete-suppressed-destination --email-address '<raw address, exact case>'
#    …and confirm the console STILL shows undeliverable and the person is STILL blocked.
#    A "both or neither" rule that has never been tested by doing one half is decoration.
# 5. Now the real repair, through the console, with a note. Confirm the person signs in (SC-012),
#    and confirm admin.audit_log has the row.
```

### 9c. ⚠ The enumeration proof (SC-011a — the amended FR-030a)

```
Request a code for (a) a healthy address with an account and (b) an address recorded
undeliverable. Compare the sign-in and code screens on customer-web, customer-mobile,
shop-web, shop-mobile and back-office.

They MUST be indistinguishable — same copy, same affordances, no new hint.
Any difference is an account-enumeration oracle and a regression against 035's FR-016.
```

### 9d. Alarms (SC-014)

Force each into ALARM and confirm a person is notified out of band:

| Alarm | How to force |
| --- | --- |
| `mail-hard-bounce` | send to `bounce@simulator.amazonses.com` |
| `mail-from-unhealthy` | temporarily point the bounce-return mail-exchanger record elsewhere, or stop the probe (`treat_missing_data = breaching` must trip it) |
| `mail-consumer-errors` | publish a deliberately malformed message to the events topic |
| the four inherited from 035 | already exercised by that slice; confirm only that they now have a target |

### 9e. No secrets, no addresses (SC-020)

```bash
aws logs filter-log-events --log-group-name /aws/lambda/effy-edge-admin-dev-sesEventConsumer \
  --filter-pattern '"@"' --max-items 50
# ⚠ Expect ZERO matches. Any '@' in these logs is a recipient address that should not be there.
```

---

## 10. Sign-off

Update in the same change:

- `CLAUDE.md` — ⚠ the "SES is in SANDBOX / blocking for production" claim is **false** and has been
  since before this slice started (research R1). Correct it; do not leave a resolved blocker standing
  as the platform's headline risk.
- [specs/035-six-digit-otp/SIGNOFF.md](../035-six-digit-otp/SIGNOFF.md) — same correction, and mark its
  bounce-visibility carry-forward as closed here.
- `docs/` — the email runbook that has never existed (spec gap 6 of the codebase audit).

---

## Rollback

| Change | Reversible? | How |
| --- | --- | --- |
| Apex signing / authorisation / policy records | ✅ | `terraform destroy -target=…` on the specific record. ⚠ Removing the policy is instant; removing authorisation breaks mail *from* the mailbox |
| The adopted mail-exchanger record | ⚠ **Do not** | Removing it stops all inbound mail to `hello@`. It is adopted, never re-created |
| Cognito sender switch | ✅ | `ses_sender_enabled = false`, apply. ⚠ Returns the ~50/day ceiling and the generic sender |
| Configuration set / events topic | ✅ | destroy. Sends continue; per-message visibility is lost |
| The migration | ⚠ forward-only | `make db-down ENV=dev` exists for dev iteration only. The tables hold outcomes that cannot be re-derived — SES does not replay events |
| Cold-path deploys | ✅ | redeploy the previous commit |
