# Contract — `/effy/<env>/ses/*` (app ↔ infra)

**Terraform writes. Backends read by key.** Renaming a key is a **breaking change to every consumer**,
in the same sense as
[001's SSM contract](../../001-infra-foundation/contracts/ssm-parameters.contract.md).

## Keys

| Key | Type | Written by | Example value (dev) | Read by |
| --- | --- | --- | --- | --- |
| `/effy/<env>/ses/identity_arn` | String | `infra/envs/dev/otp-store.tf` (**exists today**) | `arn:aws:ses:ap-southeast-2:…:identity/dev.effyshopping.com` | `edge-api/auth` IAM, `edge-api/customer` IAM |
| `/effy/<env>/ses/sender` | String | `infra/envs/dev/dns.tf` — **new** | `Effy <no-reply@dev.effyshopping.com>` | `edge-api/auth`, `edge-api/customer` |
| `/effy/<env>/ses/reply_to` | String | `infra/envs/dev/dns.tf` — **new** | `hello@effyshopping.com` | `edge-api/auth`, `edge-api/customer` |
| `/effy/<env>/ses/configuration_set` | String | `infra/modules/ses-events` — **new** | `effy-dev-mail` | `edge-api/auth`, `edge-api/customer` |
| `/effy/<env>/ses/events_topic_arn` | String | `infra/modules/ses-events` — **new** | `arn:aws:sns:ap-southeast-2:…:effy-dev-ses-events` | `edge-api/admin` (SNS subscription + IAM) |
| `/effy/<env>/alerts/topic_arn` | String | `infra/envs/dev/alerts.tf` — **new** | `arn:aws:sns:ap-southeast-2:…:effy-dev-alerts` | CloudWatch alarms in Terraform **and** in `serverless.yml` |

## The defect this contract closes

The sender address exists today in **three places with two different shapes**:

| Where | Value |
| --- | --- |
| `apis/edge-api/auth/serverless.yml:60` | `no-reply@${sls:stage}.effyshopping.com` |
| `apis/edge-api/customer/serverless.yml:54` | `no-reply@${sls:stage}.effyshopping.com` |
| `infra/modules/ses-domain-identity/outputs.tf:13` | `Effy <no-reply@${var.domain}>` |

They have **already drifted** — the Lambdas send with no display name, Cognito would send with one.
FR-005 requires them identical. One writer, many readers (Principle II).

## Environment-variable mapping

Both services declare the same three, resolved from SSM at deploy time:

```yaml
    MAIL_SENDER:            ${ssm:/effy/${sls:stage}/ses/sender}
    MAIL_REPLY_TO:          ${ssm:/effy/${sls:stage}/ses/reply_to}
    MAIL_CONFIGURATION_SET: ${ssm:/effy/${sls:stage}/ses/configuration_set}
```

⚠ `OTP_SENDER` and `NOTIFY_SENDER` are **replaced** by `MAIL_SENDER`, not kept alongside it. Leaving
the old names as fallbacks would preserve exactly the drift this contract exists to end.

## Rules

1. **⚠ Every one of these variables MUST be asserted by a config-contract test** that parses the real
   `serverless.yml` — the pattern already in `apis/edge-api/auth/src/lib/audience.config.test.ts`.
   This is the fourth recurrence of the same defect (027 R13 → 029 → 033 → 035, where the audience map
   read four variables `serverless.yml` never declared, every pool resolved "unknown", no email was
   ever sent, and **100 passing tests missed it because they set the variables themselves**). A unit
   test that mocks its own configuration can never notice that the configuration does not exist.
2. **`MAIL_SENDER` is required.** A mailer with no sender must throw at the call site, as
   `apis/edge-api/auth/src/otp/mailer.ts` already does — sending from a wrong address is worse than
   not sending.
3. **`MAIL_CONFIGURATION_SET` is optional at runtime.** If absent, the send still succeeds and is
   still observed, because the identity carries the same set as its default. The config-contract test
   is what makes its absence a build failure rather than a silent loss of visibility.
4. **`MAIL_REPLY_TO` is optional at runtime.** A missing reply address degrades support, not delivery.
5. **Terraform apply precedes `serverless deploy`.** These are resolved at deploy time; a missing
   parameter fails the deploy.
6. **No consumer may hardcode any of these values**, including in tests. A test that hardcodes
   `no-reply@dev.effyshopping.com` re-creates the drift in the one place nobody looks.
