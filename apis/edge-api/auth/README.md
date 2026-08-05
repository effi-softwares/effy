# `@effy/edge-auth` — the platform's sign-in code

Cold-path service for **035-six-digit-otp**. It issues, delivers and verifies the **6-digit one-time
code** that every Effy audience signs in with.

## What this service is

Four **Cognito Lambda triggers**. ⚠ **No HTTP route** — nothing here attaches to the shared gateway,
and no function has an `events:` block. The user pools are wired to these ARNs in
`infra/envs/<env>/auth-*.tf`, which is also where Cognito is granted permission to invoke them.

| Function | Job |
|---|---|
| `defineAuthChallenge` | The state machine — counts attempts, decides issue / fail / re-challenge |
| `createAuthChallenge` | Generates the code **once per sign-in**, emails it, counts the send |
| `verifyAuthChallenge` | Pure constant-time comparison plus TTL. No I/O |
| `postAuthentication` | Reinstates `email_verified` |

**One deployment serves all four pools.** Per-audience behaviour is a branch on `event.userPoolId`
(`src/lib/audience.ts`).

## The three facts that shape everything here

**1. ⚠ The code is never stored.** It lives in the shopper's inbox, and as a **keyed hash** in
`challengeMetadata` — which is the only channel that survives from one `createAuthChallenge`
invocation to the next. `privateChallengeParameters` does *not* persist across attempts: it is
response-only and starts empty on every invocation, including retries after a wrong answer.

⚠ The AWS-authored sample puts the **cleartext** code in `challengeMetadata`. We put a hash there.
`challengeMetadata` round-trips through the client's `Session` string, and while the API response
schema shows no field carrying it, **no AWS page states as a positive fact that it is withheld from
the client**. Designing so the answer does not matter is free.

**2. ⚠ There is a 5-second wall.** Cognito invokes triggers synchronously and *"it must respond
within 5 seconds… You can't change this five-second timeout value."* `createAuthChallenge` does a
DynamoDB update **and** an SES send inside that budget. Hence arm64, a lean bundle, module-scope
clients, and no Postgres on this path.

**3. ⚠ Cognito enforces none of the limits for us.** There is no quota on custom-challenge attempts
and none on `RespondToAuthChallenge` retries per session. The per-user rate of 10 req/sec permits
~3,000 guesses per 5-minute code lifetime against a 10⁶ space. **`defineAuthChallenge`'s 3-attempt
cap is the only thing standing between a shopper and brute force.**

## Layout

```
src/
├── functions/     # the four trigger handlers — thin edge (Principle VI)
├── otp/
│   ├── policy.ts    ⚠ ALL security logic. Pure. Zero AWS. Exhaustively tested.
│   ├── codec.ts     challengeMetadata encode/decode
│   ├── mailer.ts    SES adapter — also the mock seam
│   └── issuance.ts  DynamoDB counter — also the mock seam
└── lib/audience.ts  userPoolId → copy and limits
```

`policy.ts` holds every security decision and needs no AWS to test. That is deliberate: it is the
part where being wrong locks people out.

## Rules for anyone changing this service

- ⚠ **Never throw on a user-data condition.** Cognito returns trigger errors to the client as
  `{{[trigger]}} failed with error {{[error text]}}` — a thrown message is **user-visible** and an
  existence oracle. Return `answerCorrect: false` or an empty challenge. Throw only on genuine
  infrastructure failure, with a fixed opaque string.
- ⚠ **Never log the code, the digest, or a raw email address.** Not in a log line, not in a metric
  label, not in a trace (FR-014). `make` a habit of checking with
  `filter @message like /[0-9]{6}/` in Logs Insights.
- ⚠ **Never assert `issueTokens: true` without checking `challengeName`.** AWS: *"always check
  `challengeName` in your define auth challenge function and verify that it matches the expected
  value."* Otherwise tokens can be issued for a challenge this platform did not author.
- ⚠ **Treat an unknown user as a real one.** Same response shape, same attempt counting, same
  latency, and the counter is still written. The one difference is that no mail reaches a stranger —
  which is why the phantom path still calls SES, to the mailbox simulator.
- ⚠ The limits (`OTP_TTL_SECONDS`, `OTP_MAX_ATTEMPTS`, `OTP_SENDS_PER_HOUR`) are **code constants,
  not environment variables**. A rate limit an env var can widen is one an incident will widen.

## Deploy

```bash
make edge-test                      # unit tests + typecheck
make edge-deploy SERVICE=auth ENV=dev
```

⚠ **Deploy the Lambdas BEFORE Terraform references them** — Cognito validates the trigger on
`UpdateUserPool`, so the ARNs must already exist. The two-stage dance is the same one documented for
the 011 pre-sign-up trigger.

Full runbook: [`specs/035-six-digit-otp/quickstart.md`](../../../specs/035-six-digit-otp/quickstart.md).
