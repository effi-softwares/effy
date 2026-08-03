# Data Model — Platform-Wide Six-Digit One-Time Codes

**Feature**: 035-six-digit-otp · **Date**: 2026-08-03

⚠ **This slice adds NO PostgreSQL table and NO Goose migration.** That is deliberate and is the
headline of this document: the design was shaped so that the secret itself is never persisted
anywhere. See [research.md](research.md) R1 and R3.

Three of the four entities in the spec turn out to need **no storage at all** — they live inside
Cognito's own authentication session. Only the issuance counter outlives a sign-in, and it is one
atomic integer with a native expiry.

---

## Entity 1 — One-time code

**Storage: NONE. It is never written to any database.**

The code exists in exactly three places, for at most five minutes:

| Where | Form | Visible to |
|---|---|---|
| The email in the shopper's inbox | 6 plaintext digits | the shopper |
| `response.privateChallengeParameters` (Create → Verify, same attempt) | keyed hash | the verify trigger only |
| `response.challengeMetadata` (Create → next Create, via `session[]`) | keyed hash + issued-at | trigger code only |

### Representation

```
challengeMetadata = "v1:" <issuedAtEpochSeconds> ":" <hmacSha256Hex(code, OTP_HMAC_KEY)>
privateChallengeParameters = { digest: <same hmac hex>, issuedAt: <same epoch seconds> }
publicChallengeParameters  = { maskedDestination: "j••••@example.com" }
```

⚠ `publicChallengeParameters` **is** returned to the client as the API's `ChallengeParameters`. It
carries the masked destination and **nothing else** — never the code, never the digest, never the
unmasked address.

### Fields

| Field | Type | Rule | Source requirement |
|---|---|---|---|
| `code` | 6 decimal digits, `000000`–`999999` | CSPRNG, uniform, **leading zeros preserved** (zero-padded string, never an int) | FR-001, FR-007 |
| `digest` | HMAC-SHA256 hex | key from Secrets Manager; the code itself is never stored | FR-014 |
| `issuedAt` | epoch seconds | set once, on the first `CreateAuthChallenge` of a session | FR-008 |
| `attemptsUsed` | derived, not stored | `session.filter(challengeName === "CUSTOM_CHALLENGE").length` | FR-011 |

### Lifecycle

```
InitiateAuth(CUSTOM_AUTH)
  └─ DefineAuthChallenge      session=[]            → issue CUSTOM_CHALLENGE
     └─ CreateAuthChallenge   session=[]            → GENERATE code, HMAC it, send email,
                                                      set challengeMetadata + private params
        └─ (client shows the field)
RespondToAuthChallenge(answer)
  └─ VerifyAuthChallengeResponse                    → recompute HMAC(answer), constant-time compare,
                                                      check issuedAt + 300s > now
     └─ DefineAuthChallenge   session=[r1]
          ├─ r1.result === true  ────────────────→  issueTokens (⚠ only if challengeName is ours)
          ├─ session.length >= 3 ────────────────→  failAuthentication
          └─ otherwise           ────────────────→  issue CUSTOM_CHALLENGE again
             └─ CreateAuthChallenge  session=[r1] →  ⚠ REUSE the digest from
                                                      session[last].challengeMetadata.
                                                      Do NOT generate. Do NOT send another email.
```

### State transitions

| From | Event | To | Notes |
|---|---|---|---|
| — | first `CreateAuthChallenge` | **issued** | one email sent; counter incremented |
| issued | correct answer within TTL | **consumed** | session ends; the code cannot recur (FR-009) |
| issued | wrong answer, attempts < 3 | **issued** (same code) | no new email (FR-010 does not fire — nothing new was issued) |
| issued | wrong answer, attempts = 3 | **dead** | `failAuthentication`; a new sign-in is required (FR-011) |
| issued | `issuedAt + 300s` elapsed | **expired** | refused at verification, not merely by session expiry (FR-008) |
| issued | a new sign-in is started | **superseded** | the old session's code is unreachable — a new session has a new `challengeMetadata` (FR-010) |

⚠ **Single-use (FR-009) is structural, not enforced by a flag.** A consumed code belongs to a
completed authentication session; there is no API by which that session can be answered again. This is
stronger than a `used` boolean, which could be checked and then raced.

⚠ **Superseded (FR-010) is likewise structural.** Each `InitiateAuth` mints a new `Session` with its
own `challengeMetadata`. An older code cannot be submitted against a newer session, and the older
session cannot be resumed without its own `Session` string — which the client has already discarded.
**T002 confirms this empirically**; the spec edge case ("two devices request codes at once") depends on
it.

---

## Entity 2 — Sign-in attempt

**Storage: NONE. It is Cognito's `request.session[]`.**

| Field | Source |
|---|---|
| ordered attempt history | `session[]`, chronological, failures appended |
| attempt count | `session.length` |
| last outcome | `session[session.length - 1].challengeResult` |
| carried secret | `session[session.length - 1].challengeMetadata` |

⚠ `MAX_ATTEMPTS = 3` means `session.length >= 3` fails. Lengths 0, 1 and 2 each issue a challenge —
exactly three tries. Asserted by test, because reading it wrong is a silent off-by-one.

⚠ Every element must be `CUSTOM_CHALLENGE`. A session containing any other challenge type is not a
state this platform authored, and tokens are never issued for it.

---

## Entity 3 — Issuance record  ⚠ the only stored entity

**Storage: DynamoDB — one new table.** The platform's first DynamoDB usage; justified in
[plan.md](plan.md) § Complexity Tracking.

**Table**: `effy-<env>-otp-issuance`

| Attribute | Type | Notes |
|---|---|---|
| `pk` (partition key) | `S` | `"<userPoolId>#<hmacSha256Hex(lowercased email)>"` — ⚠ **the address is hashed, never stored in plaintext** (FR-014, and it keeps PII out of a store that does not need it) |
| `windowStart` | `N` | epoch seconds, truncated to the hour |
| `count` | `N` | codes issued in this window |
| `sends` | `SS` | auth-session markers already counted, for retry-idempotence (R6) |
| `expiresAt` | `N` | **TTL attribute** — `windowStart + 7200` |

**Capacity**: on-demand. **Encryption**: AWS-owned key at minimum; customer-managed not required for a
hashed counter. **PITR**: off — the data is ephemeral by construction and worthless once expired.

### Rules

| Rule | Value | Requirement |
|---|---|---|
| Window | rolling hour, keyed on the truncated hour | FR-012 |
| Limit | **5** issuances per address per window | FR-012 |
| Written for unknown addresses too | **yes** ⚠ | FR-016 — otherwise the row's absence is an existence oracle and unknown addresses get unlimited free probes |
| Increment | conditional `UpdateItem`, retry-idempotent via `sends` | R6 — Cognito *may retry* a trigger, and a naive `ADD 1` would burn a shopper's budget for one email |
| Expiry | native TTL at `windowStart + 7200` | no cleanup job; ⚠ DynamoDB TTL deletion is not prompt, so the **window check is always evaluated in code**, never inferred from row presence |
| Store unavailable | ⚠ **fail OPEN + alarm** | R3 — this is anti-abuse, not authorization. FR-017's fail-closed rule governs *verification*, which is unaffected |

⚠ The two-hour TTL against a one-hour window is deliberate: it leaves the previous window readable
long enough that a request arriving on an hour boundary cannot reset a shopper's budget early.

---

## Entity 4 — Account

**Storage: unchanged.** No column added, no migration.

| Attribute | Owner | Change |
|---|---|---|
| `UserStatus` | Cognito | ⚠ May need `PreSignUp` `autoConfirmUser: true` — **pending spike T003** (R4a) |
| `email_verified` | Cognito | ⚠ Now set **explicitly** by the `PostAuthentication` trigger. Managed `EMAIL_OTP` did this automatically; `CUSTOM_AUTH` does not (R7, FR-020) |
| `public.customer.has_password` | platform | **Untouched.** ⚠ Recorded because the rejected throwaway-password design (R4b) would have desynchronised it and broken 012's set-first-password flow |
| `sub` | Cognito | Unchanged — which is what keeps one person one identity across all three credential routes (FR-022) |

⚠ `autoVerifyEmail` stays **false** in the pre-sign-up trigger. Auto-verifying would mark an address
verified that nobody has proved control of — under Principle IV that is an account-takeover primitive,
not a convenience.

---

## What is deliberately NOT modelled

| Not modelled | Why |
|---|---|
| A `code` / `otp` / `verification_code` table in PostgreSQL | The code is never persisted (R1). A table would be a place for it to leak from. |
| A `used` boolean | Single-use is structural — a consumed session cannot be answered twice (Entity 1). |
| An attempts counter row | `session[]` already holds it, authoritatively, inside the flow it governs. |
| A per-source/IP counter | ⚠ **The trigger event contains no IP.** FR-013 is delivered by an AWS WAF rate-based rule instead (R2). |
| Anything for the four already-6-digit codes | FR-003 — sign-up confirmation, password reset and both step-up codes stay entirely Cognito-managed and are untouched. |

---

## Configuration and secrets

| Name | Where | Notes |
|---|---|---|
| `OTP_HMAC_KEY` | Secrets Manager, read via the Parameters-and-Secrets extension already on these functions | ⚠ Rotating it invalidates every in-flight code — acceptable for a 5-minute secret; do not rotate during a sign-in spike |
| `OTP_TABLE_NAME` | env, from SSM | |
| `OTP_SENDER` | env | follows `NOTIFY_SENDER`'s existing shape (`no-reply@<stage>.effyshopping.com`) |
| `OTP_TTL_SECONDS` = `300`, `OTP_MAX_ATTEMPTS` = `3`, `OTP_SENDS_PER_HOUR` = `5` | code constants | ⚠ constants, not env — a rate limit that can be widened by an environment variable is a rate limit an incident will widen |

⚠ **`mobile-guard.sh` rejects any BuildKonfig key matching `SECRET|_KEY$|^KEY|PASSWORD|TOKEN|CREDENTIAL`.**
None of the above goes near a client. The HMAC key is server-side only, and there is no client-side
configuration change in this slice beyond the auth-flow constant.
