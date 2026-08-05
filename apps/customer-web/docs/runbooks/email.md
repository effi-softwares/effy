# Runbook — Email delivery

**Owner**: platform · **Introduced by**: [037-platform-email-delivery](../../specs/037-platform-email-delivery/)

⚠ **Email is not a notification channel on this platform. It is the credential.** Driver, shop and
back-office have no password and no federated route — an emailed code is the *only* way they sign in.
For customers it is one of three routes and the one that gates sign-up and password recovery.

So every question below is really the same question: *can this person use the product at all?*

---

## How a message gets sent

| Flow | Sent by | Sender |
| --- | --- | --- |
| Sign-in code | the platform (035 custom challenge, `edge-api/auth`) | `/effy/<env>/ses/sender` |
| Sign-up confirmation · password recovery · email change · step-up codes | the identity provider, through the platform's SES identity | the same |
| "Your password changed" | the platform (`edge-api/customer`) | the same |

**One sender, defined once**, in `/effy/<env>/ses/*` (see
[the contract](../../specs/037-platform-email-delivery/contracts/ssm-mail.contract.md)). ⚠ Nothing may
hardcode it — before 037 it existed in three places in two shapes and had already drifted. A
config-contract test in each service fails the build if a literal comes back.

Every send attaches the environment's **configuration set**, which is what makes per-message outcomes
exist at all.

---

## ⚠ The failure this runbook is mostly about

When an address hard-fails once, the mail service records it and thereafter **accepts every send and
delivers nothing**. The caller gets a success response and a message id. The sign-in screen says
"we've sent you a code." No code will ever arrive again.

There is no error anywhere. Rate alarms cannot catch it — **one person never moves a rate**.

That is why the outcome pipeline exists: SES → SNS → the consumer in `edge-api/admin` →
`public.email_delivery_{status,event}` → the back-office **Deliverability** view.

---

## "A customer says they never get their code"

1. **Back office → Deliverability**, search their address.
2. **Not listed?** The platform has no failed outcome for them. The problem is elsewhere — spam
   folder, a typo in the address on file, or the per-address hourly ceiling (5 sends/hour).
3. **Listed as `undeliverable`?** Their mail is being permanently rejected. Read *Server said* — the
   receiving server's own words — to judge whether it is recoverable (a deleted mailbox is not; a
   temporarily suspended one is).
4. **Listed as `complained`?** Someone marked a message as spam. ⚠ This does **not** bar them from
   signing in, and must not be treated as one. It usually means a stranger's address was typed into
   sign-in.

---

## Repairing a locked-out person

**Requires `admin` or `manager`.** A CSA can see everything and repair nothing — the repair
re-enables mail to an address that previously hard-failed, and a fresh bounce spends the platform's
shared sending reputation, which every audience's sign-in depends on.

1. Confirm out-of-band that the mailbox works again. ⚠ Do not skip this: repairing a still-dead
   address produces another bounce and moves the account-wide rate toward the threshold where AWS
   pauses sending — which is a **total sign-in outage for four audiences**.
2. Deliverability → the address → **Mark as repaired…**, with a note saying what you checked. The
   note is required: an unexplained repair is indistinguishable from a mistake six months later.
3. Confirm the person can sign in.

**⚠ The repair has two halves and half a repair is a failed repair.** It clears the mail service's
suppression entry *and* the platform's own record. Doing only the first leaves the console still
reporting them broken; doing only the second leaves the mail service still silently dropping every
send. The console does both, in that order — do not do half of it by hand at the CLI.

**⚠ Case matters.** The suppression API is case-sensitive: `User@Example.com` and
`user@example.com` are one address for *sending* but need an exact match to *delete*. The platform
stores the exact bytes the mail service reported and uses those. A hand-run
`aws sesv2 delete-suppressed-destination` with a lowercased address **silently succeeds at nothing**.

---

## Alarms, and what each one means

| Alarm | Means | Do |
| --- | --- | --- |
| `mail-hard-bounce` | someone was just permanently locked out | open Deliverability; contact them by another route |
| `mail-from-unhealthy` | the bounce-return route is broken **or the hourly probe stopped running** | check `aws sesv2 get-email-identity`; ⚠ the `Failed` state is TERMINAL — SES stops retrying after 72h and setup must be restarted by hand |
| `mail-consumer-errors` | the outcome consumer is down | ⚠ while it is down the platform is **blind again** |
| `ses-bounce-rate` / `ses-complaint-rate` | account-wide reputation is at risk | ⚠ past AWS's threshold **sending is PAUSED and nobody can sign in** |

⚠ **No alarm is wired to anything that disables sending**, deliberately. Auto-pausing mail here means
auto-disabling all authentication.

⚠ **Gmail reports no complaints to SES at all.** A healthy complaint metric is not evidence of a
healthy product; Google Postmaster Tools is the only source for that, and it is not set up.

---

## Verifying the whole setup

```bash
make mail-verify ENV=dev
```

Checks inbound routing on the apex, both apex TXT strings, exactly one sender-policy record, the
signing key **reassembled from DNS and compared byte-for-byte** with the operator-supplied value,
both alignment policies, the configuration set's suppression override, and that an event destination
is actually **enabled** (the provider defaults it to `false`, and an inert destination looks
perfectly healthy).

---

## ⚠ Things that will bite you

- **The apex mail-exchanger record is live and load-bearing.** Route 53 holds one record set per
  (name, type), so declaring a second resource for the same name **clobbers** it and all inbound mail
  to the company stops. It is *adopted* into Terraform, never re-created. Check `dig +short MX
  effyshopping.com` before and after any change to the parent zone.
- **Two `v=spf1` strings on one name breaks every message from the domain**, permanently. Adding a
  future sender means *editing* the existing string, never adding a record.
- **Order matters when tightening DMARC**: authorisation and signing for the human mailbox must be
  live *first*, or the policy quarantines Effy's own support replies — silently. You find out from a
  customer who never got an answer.
- **Dev cannot poison production**, because the non-production configuration set cancels suppression
  (`ses_suppressed_reasons = []`). ⚠ If that ever reverts, a mistyped address in dev makes that real
  person unreachable in prod. Verify with
  `aws sesv2 get-configuration-set --configuration-set-name effy-dev-mail --query 'SuppressionOptions'`.
- **Never log an address.** SES's rejection text embeds the recipient. The consumer logs a SHA-256
  fingerprint; a test fails the build if an `@` appears in its log output.
