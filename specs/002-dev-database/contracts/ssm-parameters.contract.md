# Contract: App↔Infra Parameter Store — `db/*` additions

Extends the 001 contract (`specs/001-infra-foundation/contracts/ssm-parameters.contract.md`)
with the database namespace. Same law: **adding keys is backward-compatible; renaming or
removing is a breaking change** to every consumer.

## Naming scheme (additions)

```
/effy/<env>/db/endpoint
/effy/<env>/db/port
/effy/<env>/db/name
/effy/<env>/db/master_username
/effy/<env>/db/master_secret_arn
```

## Parameters written by this slice (dev only)

| Key | Tier/Type | Secret? | Example |
|---|---|---|---|
| `/effy/dev/db/endpoint` | Standard / `String` | no | `effy-dev-db.xxxx.ap-southeast-1.rds.amazonaws.com` |
| `/effy/dev/db/port` | Standard / `String` | no | `5432` |
| `/effy/dev/db/name` | Standard / `String` | no | `effy` |
| `/effy/dev/db/master_username` | Standard / `String` | no | `effy_admin` |
| `/effy/dev/db/master_secret_arn` | Standard / `String` | no — it's a **pointer** | `arn:aws:secretsmanager:ap-southeast-1:…:secret:rds!…` |

## Rules

- **No secret material in parameters.** The password lives ONLY in the Secrets Manager
  secret; consumers resolve `master_secret_arn` and fetch it with their own IAM permissions
  (`secretsmanager:GetSecretValue` on that ARN — granted per consumer in their own slices).
- **One writer**: the env root's `db.tf`. Apps never write.
- **Readers (future)**: Goose migration runner, Go hot path (pgx), Node workers — all
  compose their DSN from these values + the fetched secret. Never via Terraform state.
- The master credential is **operator/migration-only** long-term; app-scoped least-privilege
  DB users arrive with the first consumer slice and will add their own keys under
  `/effy/<env>/db/` (backward-compatible additions).
