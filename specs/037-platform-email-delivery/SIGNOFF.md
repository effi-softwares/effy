# Sign-off — 037-platform-email-delivery

**Status: ⚠ DRAFT — NOT SIGNED OFF.** Authored 2026-08-06 from the machine-verifiable evidence.
Every claim below marked **UNWALKED** is exactly that: nobody has observed it. This document is
written *before* the live walks deliberately, so that the walks record results into a structure that
already names what they were supposed to prove — rather than being summarised afterwards by whoever
remembers what happened.

**Do not mark this feature concluded until §5's table has real results in it.**

---

## 1. What this slice was for

`CLAUDE.md` and 035's sign-off both named **"SES is in SANDBOX"** as the platform's headline
production blocker. **It was already false when this slice began, and nobody had re-tested.**
Unrestricted sending had been granted (review case `178578384200127`, 50,000/day at 14/sec) and
`dev.effyshopping.com` was verified with DKIM and a working custom MAIL FROM.

⚠ **A stale blocker is worse than no note at all — it hides the real ones.** Of the three items that
entry listed: production access was **already granted**; a website on the apex was **never a
prerequisite** (the request was approved without one); and **bounce visibility was real**, which is
what this slice built.

**The defect underneath it:** a send to an address that has hard-bounced returns **success and a
message id and delivers nothing**. For driver, shop and back-office — no password, no federated
route — that is a **permanent, silent account lockout**, invisible to every existing alarm, because
one person never moves a *rate*.

---

## 2. Proven live

| What | Evidence | Date |
| --- | --- | --- |
| Terraform applied — configuration set, both topics, alarms, DNS | T032 | 2026-08-05 |
| Suppression override active (FR-041) | T033 — `get-configuration-set` → `{"SuppressedReasons": []}` | 2026-08-05 |
| Cognito switched to the platform's own sender on all four pools | T034 — four in-place updates, **no pool replaced** | 2026-08-05 |
| Apex inbound mail still routes (SC-022) | T047 — `dig MX` → `1 smtp.google.com.` | 2026-08-05 |
| Workspace signing key published as one record, correctly split | T048/T049 | 2026-08-05 |
| DMARC published on apex and dev, with `rua` | T060/T062 | 2026-08-05 |
| `hello@` and `dmarc@` and `support@` aliases exist | T040/T054 | 2026-08-05 |
| Migration applied — `public.email_delivery_{status,event}` | T103 | 2026-08-06 |
| `auth`, `customer`, `admin` deployed to dev | T035/T104 | 2026-08-06 |
| **Per-audience credential rules unchanged by this slice** | T036 — full pass, see below | 2026-08-06 |
| ⚠ **A sign-in code sent by the platform ARRIVES** — customer pool, customer-mobile on iOS | T149, after the §4b fix | 2026-08-06 |
| ⚠ **The outcome pipeline recorded a real event end to end** (`delivery` → `reachable`) | consumer logs, §4b | 2026-08-06 |

**T036 in full**, because it is the check that would have caught a sender change quietly altering an
auth flow: driver / shop (including the mobile client) / back-office all report no password flow
(`ALLOW_CUSTOM_AUTH` + refresh only), no `ALLOW_USER_AUTH`, no federated providers, admin-provisioned.
Customer keeps SRP and open self-registration. **The `email_sending_account` switch touched no
audience's credentials.**

---

## 3. Machine-verified (2026-08-06)

- `pnpm -r typecheck` — **13/13 packages**. ⚠ Counted, because 029 found `pnpm -r test` green while
  `typecheck` failed: **vitest does not run `tsc`**.
- `pnpm -r test` — **13/13 suites green**: admin 141 · auth 114 · customer 98 (+8 skipped) ·
  edge-shared 49 · shop 170 · back-office 77 · customer-web 235 · shop-web 138 · web-kit 48 ·
  shared-types 7, plus brand / design-system / api-client.
- `terraform validate` — **both roots** (`infra/envs/dev`, `infra/global`). `fmt -check -recursive`
  clean.
- `customer-web` bundle — **within budget on all 9 routes**; the tightest are `/search` and `/cart`
  at 172.0 KB against 174 KB. `EmailDeliveryNotice` is on an authenticated route and costs the guest
  bundle nothing.
- `shellcheck` clean on both mail scripts.

---

## 4. ⚠ Three tasks were ticked and had not been built

Found by auditing the ticked code tasks against the repository on 2026-08-06 — the failure mode this
project has now recorded in 027, 029, 033 and 035. All three are now built.

1. **T132 — `docs/runbooks/email.md` did not exist.** The runbook is the whole point of the alarms:
   an alert that reaches a person who then has nowhere to look is not observability. ⚠ Its first
   draft told operators to search the `auth` logs by `addressFingerprint` — **that correlator exists
   only in the admin consumer**. The auth service logs `otp send failed` with a stage and an error
   name and nothing per-person, by design (035's rule). So those logs can answer *"are sends
   failing?"* and never *"did this person's send fail?"*. The limitation is now stated in the
   runbook instead of being papered over by a command that would return nothing.
2. **T134 — none of its three parts existed.** `scripts/mail-events-verify.sh` + its target are now
   written; `customer` added to `edge-health`; `mail-verify`'s help text retargeted (it cited
   **SC-010**, which is *feature 010's* SC-010, not this feature's).
   ⚠ **`auth` was deliberately NOT added to `edge-health`, and must stay out** — it is
   Cognito-triggers-only with no HTTP surface, so it would report DOWN forever and train everyone to
   ignore a red row. `scripts/edge-health.sh` already carried that reasoning; the task asked for it
   anyway. Instruction refused, reason recorded.
3. **T119's alarm exists under a different name than the spec uses.** It is
   `effy-edge-admin-<env>-ses-event-consumer-errors` in `serverless.yml`, not
   `effy-<env>-mail-consumer-errors` in `dns.tf` — because **only the service that deploys the
   Lambda can `!Ref` it**, and a Terraform alarm would have to hardcode a function name Terraform
   does not own. It carries `AlarmActions`, which is the load-bearing half. Quickstart §9d and T123
   now say so.

**Also corrected: T121(a) named a file with no alarms in it.** `apis/edge-api/auth/serverless.yml`
contains **zero** `AWS::CloudWatch::Alarm` resources. The sign-in-path alarms live in Terraform
(`infra/envs/dev/otp-store.tf`) and were wired by T114, so the *intent* is met — but the instruction
as written was unbuildable, and anyone following it would have concluded the alarms were missing.

**T099 was verified genuinely built on all five surfaces** (the check that most often fails here):
customer-web `CodeStep`, customer-mobile `AuthScreens`, shop-mobile `SignInScreen`, and shop-web +
back-office together through `@effy/web-kit`'s `OtpSignInCard`.

---

## 4b. ⚠ THE FIRST DEPLOY BROKE SIGN-IN ON ALL FOUR POOLS

Found on 2026-08-06 by the operator running the iOS customer app — **not** by any check in this
slice. ⚠ **`mail-verify` reported 17/17 green throughout.** Being *authorized* to send (DKIM, SPF,
DMARC, verified identity, production access) and being *permitted* to send (IAM) are different
facts; it only checks the first. That gap is now the first thing `mail-events-verify` is for.

**Defect 1 — `ses:SendEmail` granted on the identity alone.** The action is authorized against every
resource the request touches. 037 made every send name a configuration set, so each touches **two**
resources. Every send failed with `AccessDeniedException` — which names neither, so it reads like a
verification or sandbox problem. ⚠ **T126 completed the defect rather than causing it**: narrowing
`edge-customer` from `"*"` to the identity looked like tightening, and was breaking, because `"*"`
had been covering the configuration set by accident.

⚠ **Cognito's own sends were never affected**, because the `effy-<env>-cognito-send` identity policy
grants on the identity alone and Cognito's request does not *name* a configuration set — it applies
as the identity's default. **Sign-up confirmation and password recovery kept working while
passwordless sign-in was completely dead.** A partial outage in the one flow with no fallback.

**Defect 2 — the alarm for exactly this could never fire.** All four 035 alarms declare no
dimensions; `observability.ts` published only `[["userPoolId"]]`. In EMF each dimension set is a
separate metric, so the dimensionless one never existed. `effy-dev-otp-send-failures` — *"a failed
send IS a failed sign-in"* — held **OK** through 7 recorded failures, reporting "no datapoints were
received". ⚠ Neither the emitter nor the alarm was wrong alone. The defect lived only in the
relationship between them, invisible to any unit test on either side: 027 R13's shape for the sixth
time in this repo.

**Both fixed, both guards proved by reverting** (T144–T147), **and both now DEPLOYED AND PROVEN LIVE**
(T148–T150, 2026-08-06):

- both Lambda roles name **both** ARNs, read back from the **deployed** policy with
  `aws iam get-role-policy` — not from the source that produced it;
- **a sign-in code arrives on customer-mobile (iOS)**, and zero `otp send failed` entries since;
- `Effy/Auth otp_code_issued` now lists **both** dimension sets — `[{userPoolId}]` and `[]` — so the
  aggregate the alarms watch will exist at its first datapoint. ⚠ `otp_send_failed`'s empty set is
  absent, and that is the *healthy* state: `list-metrics` returns only metrics with data, and
  nothing has failed since.

⚠ **AND THE OUTCOME PIPELINE RECORDED ITS FIRST REAL EVENT**, unprompted, from that sign-in:

```
{"eventType":"delivery","state":"reachable","recorded":true,"addr":"c66b7388c47d","msg":"delivery outcome"}
```

SES → SNS → consumer → `public.email_delivery_status`, end to end, with the address present **only**
as a fingerprint (SC-020 holding live rather than in a unit test). ⚠ **This is the `delivery` path
only.** The bounce path — the one the whole feature exists for — is still unproven; that is T105.

⚠ **What this says about the slice's own evidence.** 033 of these tasks were ticked before a single
code email had ever been sent through the new path. The machine gates were green, the DNS was
perfect, and the feature was **completely non-functional**. Nothing short of T037 would have caught
it, and T037 is still open.

---

## 5. ⚠ NOT PROVEN — 33 open tasks, every one of them a live walk

Nothing in this section has been observed by anyone.

### The two proofs that distinguish this feature from a plausible-looking one that does not work

- **T107 / SC-011a — the enumeration proof.** Request a code for a healthy address and for an
  undeliverable one; compare the sign-in and code screens on **all five** surfaces. They must be
  indistinguishable. A difference is an account-enumeration oracle and a regression against 035's
  FR-016. A unit test asserts no copy branches on delivery state (T100); **nobody has looked at the
  screens.**
- **T108 / SC-013 — the half-repair proof.** Run `delete-suppressed-destination` alone and confirm
  the person is **still** locked out and the console **still** shows undeliverable. ⚠ A "both or
  neither" rule that has never been tested by doing one half is decoration.

### The core lockout path — UNWALKED

T105 (SC-010, recorded within 5 min) · T106 (SC-011, the account-page notice, blind observer) ·
T109 (SC-012, real repair + `admin.audit_log` row) · T110 (complaint recorded but **not** barring —
FR-031) · T111 (transient → `soft_failing`, not undeliverable — FR-029) · T112 (SC-020, zero `@` in
consumer logs).

### Sending and authentication — UNWALKED

T001 (the blocking baseline — **never run**) · T037 (SC-001, ⚠ including the driver pool, which has
**no client surface** and must be proven by raw `initiate-auth CUSTOM_AUTH`) · T038 (SC-002) ·
T039 (SC-003, >50/day) · T051/T061 (SC-009a, before **and** after the policy) · T052 (SC-008) ·
T053 (SC-009) · T063 (SC-004) · T141 (SC-017) · T064 (SC-005, inbox not spam) · T065 (SC-007,
forgery rejected) · T066 (first aggregate reports).

### Alarms and environment portability — UNWALKED

T122 · T123 (SC-014, force all three into ALARM) · T124 · T143 (SC-019, inspect the **deployed** IAM
policy, not the source) · T128 (SC-016, `qa` dry run) · T129 · T130.

### ⚠ T142 may no longer be satisfiable

FR-008 requires the four pools' Cognito message templates be **byte-identical** across the sender
switch. That needs a **before** snapshot taken at T034's apply — which is already ticked. **If that
capture was not taken, the assertion cannot be made retroactively**, and T142 should be rewritten as
a carry-forward: compare the live templates against the wording recorded in 035 and accept it as
weaker evidence.

### ⚠ T129 proves nothing as written, and should not be recorded as a pass

It reads `list-suppressed-destinations` after T105's simulator bounce and expects the address
absent. **Simulator addresses are never added to the suppression list** (quickstart line 255), so
the check passes regardless of whether the configuration-set override works. **The actual proof of
FR-041 is T033**, already done. Either record T129 as *not independently proven*, or drive one hard
bounce to a **non-simulator** address to earn it.

### T139 is stale

It says "commit on a feature branch — the repo is currently on `main`." The branch exists and PR #12
merged as `925e776`. The remaining work is a follow-up commit, not a new branch.

---

## 6. Carry-forwards

- **SC-018 — the 30-day bounce and complaint outcome is unownable at sign-off.** It cannot be
  measured until 30 days of real traffic exist. ⚠ **Its complaint half is structurally blind**:
  Gmail reports no complaints to SES at all, so a clean complaint number partly reflects a channel
  that cannot report rather than customers who did not complain.
- **⚠ FR-037a — 75 alarms across `admin` and `shop` carry no notification target.** Re-measured
  2026-08-06: **43 + 32 = 75** (admin holds 48 alarms, 5 of which carry actions). The count recorded
  at task-authoring time was 44 + 32 = 76, before this slice's own alarms landed. They turn red in a
  console nobody has open. Named and counted rather than quietly absorbed — an earlier draft
  estimated "~30" and would have shipped them unwired as an acknowledged violation of a `MUST NOT`.
- **The two staff email joins are weak.** `public.customer.email` is `citext` and uniquely indexed,
  so subject resolution for customers is exact and cheap. `public.shop_staff.email` is nullable text
  with no index and `admin.staff.email` is text with no index — both are sequential scans, and both
  can miss.
- **The driver audience has a Cognito pool and no platform record at all**, so its delivery outcomes
  are address-only and the console will correctly render `—` for the subject. Not a defect; the
  honest answer.
- **`p=none` is monitor-only and deliberate.** `p=reject` on day one silently destroys all sign-in
  mail on any misconfiguration. Tightening is gated on T066's aggregate-report evidence (FR-017).
- **The apex is still bare.** No website on `effyshopping.com`. It was never an SES prerequisite,
  but it remains true.

---

## 7. What must be true before production

1. §5's two named proofs (T107, T108) observed, not reasoned about.
2. The lockout path walked end to end at least once (T105 → T109).
3. Every alarm in this feature's scope confirmed to reach a person (T123/T124), and the alerts topic
   confirmed to have a **confirmed** subscriber — ⚠ `PendingConfirmation` is the silent failure.
4. Production's configuration set must **inherit** account-level suppression. ⚠ Dev's `[]` override
   exists so a dev mistake cannot lock someone out of production; copying it forward removes the
   protection it was built to provide.
5. `make mail-verify ENV=prod` and `make mail-events-verify ENV=prod` both green.
