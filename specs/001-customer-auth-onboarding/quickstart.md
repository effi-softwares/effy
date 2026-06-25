# Quickstart: Customer Auth & Onboarding (validation guide)

How to bring up the slice end-to-end and prove it against the spec's acceptance criteria. This
is a run/validation guide — implementation detail lives in `tasks.md` and the code itself.

## Prerequisites

- AWS access via **`AWS_PROFILE=ef`** and region **`ap-southeast-1`** (every AWS-touching step
  assumes both; the Makefile sets `AWS_PROFILE=ef` + `AWS_REGION=ap-southeast-1`). The `ef`
  profile's default region is `ap-southeast-2`, so region MUST be set explicitly or commands hit
  the wrong region. Confirm: `aws sts get-caller-identity --profile ef`.
- Terraform, Go 1.25, JDK 17+ & Android SDK, Xcode (for iOS), Node 20 (trigger Lambdas),
  `goose`, `pnpm` (reserved for later web).
- A test email address **verified in SES** (dev SES is in sandbox — see research.md D4).

## One-time setup

```bash
make tf-bootstrap     # creates the effy S3 state bucket + DynamoDB lock table (AWS_PROFILE=ef)
make tf-dev-apply     # provisions dev: Cognito customer pool + triggers, RDS Postgres, SSM params
make migrate          # runs Goose migrations (customers + profiles) against the dev DB
```

After `tf-dev-apply`, confirm the config landed in SSM (read by the Go service, never hardcoded):

```bash
aws ssm get-parameters --profile ef --region ap-southeast-1 --with-decryption \
  --names /effy/dev/cognito/customer_pool_id /effy/dev/cognito/customer_app_client_id /effy/dev/db/url
```

## Run the service + app

```bash
make api-run          # Go hot-path service on :8080, config from SSM
make android          # build/run the KMP app on an Android emulator/device
make ios              # build/run the KMP app on an iOS simulator
```

## Validation scenarios (map to spec acceptance criteria)

> Use the SES-verified test email. The OTP arrives by email; enter it in the app.

| # | Scenario | Steps | Expected (acceptance criterion) |
|---|----------|-------|---------------------------------|
| 1 | **New customer signs up & lands signed in** (US1) | Launch app → enter a brand-new email → enter the emailed code | App reaches signed-in home stub; `GET /v1/profile` returns a profile (just lazy-created). Verify a `customers` + `profiles` row now exist. |
| 2 | **Wrong code** (FR-012) | At code entry, type a wrong code | "That code isn't right" message; can retry. |
| 3 | **Expired code + resend** (FR-010/011) | Wait past expiry (or exhaust), tap Resend | "Expired / new code sent"; new code works; old code rejected. |
| 4 | **Returning sign-in** (US2) | Sign out, then sign in again with the same email + fresh code | Reaches signed-in state; same profile returned (no duplicate row). |
| 5 | **Stay signed in across restart** (US3) | While signed in, force-quit the app, reopen | Still signed in (silent refresh); lands on home without re-entering a code. |
| 6 | **Session expired** (US3 #3) | Revoke/expire the refresh token, reopen app | Gracefully returns to signed-out; prompts sign-in. |
| 7 | **Sign out** (US4) | Tap sign out | Returns to signed-out; protected screens require sign-in again. |
| 8 | **Cross-pool rejection** (Principle IV) | Call `GET /v1/profile` with a non-customer-pool JWT | `401 unauthorized`. |
| 9 | **Parity** (FR-016) | Repeat 1–7 on both Android and iOS | Equivalent outcomes on both. |

### Quick API checks (without the app)

```bash
# No token → 401
curl -i http://localhost:8080/v1/profile

# With a valid customer access token → 200 + profile (lazy-creates on first call)
curl -s -H "Authorization: Bearer $ACCESS_TOKEN" http://localhost:8080/v1/profile | jq
```

## Teardown

```bash
make tf-dev-destroy   # tears down dev resources (AWS_PROFILE=ef)
# bootstrap (state bucket + lock table) is intentionally left; destroy manually if truly resetting
```

## Notes

- **SES sandbox** is the most common dev snag: if no email arrives, verify the recipient address
  in SES **(in `ap-southeast-1` — sandbox status is per-region)** or request production access.
  See research.md D4.
- Token lifetimes (≈30-day refresh) are set on the Cognito app client; adjust there to test
  scenario 6 quickly.
- The **customer-web** app is a later slice; it will consume `contracts/profile-api.yaml` and the
  same brand tokens to keep parity (FR-016).
