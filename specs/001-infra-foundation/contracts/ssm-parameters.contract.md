# Contract: App↔Infra Parameter Store

The **runtime contract** between infrastructure (writer) and the apps/backends (readers), per
ARCHITECTURE.md ("the infra ↔ app contract is the parameter store"). Renaming or removing a key is a
**breaking change** to every consumer.

## Naming scheme

```
/effy/<env>/auth/<audience>/user_pool_id
/effy/<env>/auth/<audience>/app_client_id
/effy/<env>/auth/<audience>/user_pool_arn
/effy/<env>/region
```

- `<env>` ∈ `dev | qa | staging | prod`
- `<audience>` ∈ `customer | driver | shop | back-office`  (hyphenated form in the path)

## Parameters written by this slice (per env, ×4 audiences + 1 region)

| Key | Tier/Type | Secret? | Example |
|---|---|---|---|
| `/effy/dev/auth/customer/user_pool_id` | Standard / `String` | no | `ap-southeast-2_ABC123` |
| `/effy/dev/auth/customer/app_client_id` | Standard / `String` | no | `1h57kf5...` |
| `/effy/dev/auth/customer/user_pool_arn` | Standard / `String` | no | `arn:aws:cognito-idp:ap-southeast-2:…` |
| `/effy/dev/auth/driver/*` | … | no | (same triplet) |
| `/effy/dev/auth/shop/*` | … | no | (same triplet) |
| `/effy/dev/auth/back-office/*` | … | no | (same triplet) |
| `/effy/dev/region` | Standard / `String` | no | `ap-southeast-2` |

## Rules

- **`String` only** — pool ids, client ids, ARNs and region are **not secrets**; no `SecureString`/KMS
  in this slice. (Telemetry/DB secrets, when they exist, go to **Secrets Manager**, per ARCHITECTURE.md
  — out of scope here.)
- One writer: the env root's `ssm-parameters` module. No app writes these.
- Readers (future slices): the Go hot path, Lambdas, and client config bootstrap read by key — never by
  Terraform remote-state introspection.
- Adding a key is backward-compatible; renaming/removing is **breaking** and must go back to this
  contract (Principle I).
