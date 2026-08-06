# Runbook — Email

How Effy sends mail, what breaks, and what to do about it.

> **Why this document exists.** Passwordless email codes are the **only** credential three of the
> platform's four audiences have. Driver, shop and back-office staff have no password and no
> federated route. When Effy's mail stops arriving, those people cannot sign in **at all** — there
> is no fallback, no workaround, and no self-service path. Mail is not a notification channel on
> this platform. It is the authentication system.

Owning slices: [010-domain-dns-foundation](../../specs/010-domain-dns-foundation/) (the domain and
the sending identity), [035-six-digit-otp](../../specs/035-six-digit-otp/) (who issues the code),
[037-platform-email-delivery](../../specs/037-platform-email-delivery/) (branding, authentication,
and per-address delivery outcomes).

---

## 1. How sending is wired

Two services send mail, and they are the only two.

| Sender | Path | Sends |
| --- | --- | --- |
| `apis/edge-api/auth` | `src/otp/mailer.ts` | Sign-in codes (all four pools, 035's custom challenge) |
| `apis/edge-api/customer` | `src/password/notify.ts` | Password-change notices |
| Cognito itself | pool `email_configuration` | Sign-up confirmation, password recovery, email-change, closure step-up |

All three read the same three values from SSM, resolved **at deploy time**:

```
/effy/<env>/ses/sender              → Effy <no-reply@<env>.effyshopping.com>
/effy/<env>/ses/reply_to            → hello@effyshopping.com
/effy/<env>/ses/configuration_set   → effy-<env>-mail
/effy/<env>/ses/events_topic_arn    → the outcome topic
/effy/<env>/ses/identity_arn        → what ses:SendEmail is scoped to
```

⚠ **Nothing hardcodes an address.** A literal `no-reply@…` anywhere in `apis/`, `packages/` or
`apps/` is a defect — it is how one environment silently sends as another. `mail-verify` and the
T030 sweep both check for this.

**The configuration set is the load-bearing part.** Without `ConfigurationSetName` on the send, SES
emits no per-message outcome, and the platform is blind to every delivery failure. A send that omits
it still returns success and a message id — it looks perfectly healthy.

### Why replies go to a different domain than the sender

Mail is sent from `no-reply@<env>.effyshopping.com` (the environment's own namespace, so a dev
mistake cannot spend the apex's reputation), but `Reply-To` is `hello@effyshopping.com`, which is a
real mailbox a person reads. A no-reply address that silently discards replies is how a customer
tells you they cannot sign in and nobody ever hears it.

---

## 2. The one thing to understand about delivery failure

**A send to a hard-failed address returns SUCCESS.**

SES records addresses that permanently bounce and thereafter accepts every send to them and delivers
nothing. The caller gets a `200` and a message id. The sign-in screen says "we've sent you a code."
Nothing in the send path can see it.

That is a **permanent, silent account lockout**, and no rate alarm can catch it — one person never
moves a bounce *rate*. Only the per-message outcome stream can, which is what the pipeline in §3
exists for.

---

## 3. The outcome pipeline

```
SES send (ConfigurationSetName: effy-<env>-mail)
  └─ bounce / complaint / delivery / reject / deliveryDelay
       └─ SNS topic  effy-<env>-ses-events
            └─ Lambda  effy-edge-admin-<env>-sesEventConsumer
                 └─ public.email_delivery_status   (one row per address, the conclusion)
                    public.email_delivery_event    (append-only history)
                      └─ back-office → Deliverability
```

Check the whole thing at once:

```bash
make mail-verify ENV=dev         # is the platform AUTHORIZED to send?  (DNS, DKIM, identity)
make mail-events-verify ENV=dev  # is the outcome pipeline RUNNING?      (subscription, alarms, logs)
```

Those answer different questions and both can be green while the other is red. Configured is not
running.

### Delivery states

| State | Meaning | Can they sign in? |
| --- | --- | --- |
| `reachable` | Last outcome was a delivery, or nothing bad has happened | Yes |
| `soft_failing` | Transient failure (mailbox full, out of office, deferral) | Usually — retries may succeed |
| `undeliverable` | **Permanent** bounce. The address does not work | **No. This is a lockout.** |
| `complained` | Marked as spam by the recipient | Yes — a complaint is not a lockout (FR-031) |

⚠ **`complained` deliberately does not block anyone.** Someone who reports a sign-in code as spam
still needs to sign in. Barring them would turn an annoyance into a lockout.

### Reading a delivery record

Back-office → **Deliverability**, defaulting to problems only. The detail page shows:

- **the address, case intact** — including any `+label`;
- **the subject** — the customer or staff member who owns it, or `—`. ⚠ `—` is an honest answer, not
  a bug: an address can bounce before its account exists, after it is deleted, or belong to the
  **driver** audience, which has a Cognito pool and no platform table at all;
- **`suppressedInSes`** — read **live** from SES on every request, never stored. ⚠ It can render
  "couldn't check", and that is correct. It must never default to "not suppressed", which is the
  more dangerous of the two lies;
- **the event history** — every outcome for that address, newest first.

⚠ **The diagnostic text is operator-only.** It contains the receiving server's own rejection
message, which embeds the recipient's address. It is never logged, never in a metric dimension,
never in a `problem+json` `detail`, and never in the customer's own account read.

---

## 4. Repairing a locked-out address

**The situation:** someone says they are not receiving their sign-in code, and Deliverability shows
their address as `undeliverable`.

**First, fix the underlying cause.** A repair re-enables mail to an address that previously hard
failed. If the mailbox still does not exist, it will bounce again — and this time against the
platform's shared sending reputation, which if breached **pauses sending for everyone on all four
audiences**. Confirm the address is now valid (they fixed a typo, the mailbox was recreated, the
domain came back) before repairing.

**Then repair through the console.** Back-office → Deliverability → the address → **Repair**, with a
note explaining why. The note is required.

### ⚠ The trap: a repair has two halves and doing one is worse than doing neither

```
1. SES:      delete the suppression entry          ← without this, mail is still discarded
2. Platform: set state = 'reachable'               ← without this, the console still says broken
```

The console does **both, in that order**. Order matters: if the SES call fails, nothing is written,
which leaves a true state. The reverse order could commit "repaired" while the address is still
blocked — the worst available outcome, because it *looks* fixed.

⚠ **Do not run `aws sesv2 delete-suppressed-destination` by hand and consider it done.** That is
half a repair. The person stays locked out of the platform's own view, and the next operator sees an
address the console calls broken and SES calls fine, with no way to know which is lying.

### ⚠ The case-sensitivity trap

SES's suppression API is **case-sensitive**. `public.email_delivery_status` stores both `address`
(lower-cased, for joining `public.customer.email`, which is `citext`) and `raw_address` (the exact
bytes SES reported). The repair sends `raw_address` **verbatim**.

If you ever do this by hand, use the exact case. A normalising delete returns success and removes
nothing, and you will be certain you fixed something you did not.

### Afterwards

The repair writes a row to `admin.audit_log` with the actor, the address and the note. It is the
only record that this happened, and it is why the note is mandatory.

**Who can do it:** `admin` and `manager` only. A `csa` can *see* deliverability (they are exactly
who is on the phone to the person who cannot sign in) but cannot repair — it re-introduces
reputation risk with blast radius well beyond one customer.

---

## 5. Alarms

| Alarm | What it means | What to do |
| --- | --- | --- |
| `effy-<env>-mail-hard-bounce` | ≥1 permanent bounce in 5 minutes. **Somebody may be locked out right now.** | Open Deliverability, find the address, work §4 |
| `effy-<env>-mail-from-unhealthy` | The custom MAIL FROM domain is not healthy. SPF alignment is at risk → mail starts landing in spam | Check the `mail.<env>.effyshopping.com` MX record; run `make mail-verify` |
| `effy-edge-admin-<env>-ses-event-consumer-errors` | The outcome consumer is failing. **The platform is blind again** — this is the exact condition 037 exists to remove | Check the consumer's logs; it only throws when the datastore is unreachable |
| `effy-edge-admin-<env>-ses-identity-health-errors` | The hourly MAIL FROM probe itself is broken | The earlier, more specific signal for the row above |
| `effy-<env>-ses-bounce-rate` | Approaching AWS's reputation threshold | ⚠ **Breaching this pauses sending — a total sign-in outage for all four audiences.** Stop sending to bad addresses immediately |
| `effy-<env>-ses-complaint-rate` | Same, for complaints | As above |
| `effy-<env>-cert-days-to-expiry` | The branded API's certificate is expiring | Renew before it lapses |

⚠ **`mail-from-unhealthy` treats missing data as breaching.** A probe that stops running trips the
alarm rather than silencing it. A monitor that goes quiet when it dies is not a monitor.

⚠ **No alarm is wired to any action that disables sending** (FR-039), and none may ever be.
Automatically pausing mail on this platform means automatically locking every audience out of their
accounts. Alarms notify a human; a human decides.

### If an alarm did not reach anyone

```bash
make mail-events-verify ENV=dev
```

It checks that every alarm in this feature's scope has an action **and** that the alerts topic has a
*confirmed* subscriber. ⚠ A subscription stuck in `PendingConfirmation` is the silent failure:
Terraform reports it created, the alarm reports an action, and no mail is ever sent because nobody
clicked the link.

⚠ **Carry-forward:** the alarms on the deliverability path carry notification targets. The other 76
alarms across the `admin` and `shop` services do **not** — they turn red in a console nobody has
open. Recorded under FR-037a, named and counted rather than quietly absorbed.

---

## 6. Diagnosing "the code never arrived"

Work in this order. Each step rules out everything above it.

1. **Is the whole platform sending?** `make mail-verify ENV=dev`. If SES reports the identity
   unverified, or the account is in the sandbox, nobody is receiving anything.
2. **Is this one address broken?** Back-office → Deliverability, search the address. If it is
   `undeliverable`, go to §4. This is the common case and the one that used to be invisible.
3. **Did the send even happen?** Filter the `auth` service's logs for `"otp send failed"`. Each
   carries a `stage` (`hmac-key`, `ses-send`) and the error's **name** only.

   ⚠ **There is no way to find one person's send in these logs, and that is a real limitation, not
   an oversight.** 035's rule is that no address, code or digest reaches CloudWatch, and the auth
   service carries no fingerprint to correlate by. So this step answers "are sends failing?" — never
   "did *this* send fail?". The delivery-outcome record in step 2 is the only per-person evidence
   there is. (The `addressFingerprint` correlator exists **only** in the admin consumer's logs, on
   the receiving side.)
4. **Did SES accept it and the outcome never arrive?** `make mail-events-verify ENV=dev`. A consumer
   that is down means the record you read in step 2 was stale.
5. **Is it in their spam folder?** Check DMARC alignment — `make mail-verify` covers SPF, DKIM and
   the policy record.

⚠ **Never confirm to the caller that an address does or does not have an account.** Every sign-in
and code screen on all five surfaces is deliberately identical regardless of delivery state
(SC-011a). Telling someone "that address is undeliverable" over the phone re-opens by voice the
account-enumeration oracle the UI was built to close.

---

## 7. Things that will bite you

- **Two `v=spf1` records on one domain fails SPF for every message from it** (RFC 7208 §4.5), and it
  happens by *adding* a record rather than editing the existing one. `mail-verify` counts them.
- **A DKIM key split into two TXT *records* instead of two character-strings in one record** is
  valid DNS and a broken key. Nothing errors; signatures just never verify. `mail-verify`
  reassembles and compares byte-for-byte.
- **The apex `MX` is the only route to `hello@`.** Route 53 holds one record set per name+type, so
  any apply against the parent zone can clobber inbound mail. It is checked first in `mail-verify`
  for that reason.
- **An SNS event destination defaults to `enabled = false`** in the Terraform provider. An inert
  destination looks completely healthy in every listing.
- **Dev's configuration set overrides suppression to `[]`** so a dev bounce cannot add someone to
  the account-wide list and lock them out of production too (FR-041). ⚠ Production should
  **inherit** — do not copy the dev value forward.
- **Simulator addresses (`…@simulator.amazonses.com`) are never added to the suppression list.**
  Useful for testing the pipeline; useless for testing suppression behaviour, and a check that
  "passes" against one proves nothing about the override.
- **No scheduled retry, queue redrive or bulk re-send exists** (FR-032), deliberately. Re-sending in
  bulk to addresses that already failed is how a sender's reputation dies.
