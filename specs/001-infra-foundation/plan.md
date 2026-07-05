# Implementation Plan: Platform Infrastructure Foundation & Four-Pool Authentication

**Branch**: `001-infra-foundation` | **Date**: 2026-06-29 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-infra-foundation/spec.md`

## Summary

Stand up the platform's **infrastructure-as-code foundation** — a reusable-module + per-environment-root
Terraform layout with remote, locked state — and provision its **first resources**: the four isolated
AWS Cognito user pools (customer, driver, shop, back-office), all passwordless **EMAIL_OTP**, with
self-signup enabled only for customers. Four environment roots are authored (`dev`, `qa`, `staging`,
`prod`); **only `dev` is applied**, in `ap-southeast-1` (Singapore), with region controlled by a single
per-environment variable so a later move to `ap-southeast-2` is a config change. A root `Makefile`
exposes `init` / `plan` / `apply` (and friends) per environment, every target run under
`AWS_PROFILE=ef`. **Claude authors all code; the operator runs every `init`/`apply` by hand** — nothing
is applied automatically. Pool ids and app-client ids are published to **SSM Parameter Store** as the
infra↔app contract for later slices.

**Technical approach** (all decisions detailed in [research.md](./research.md)):
- **Layout**: `infra/{bootstrap,modules,envs,scripts}` — the "module + env-root" pattern mandated by
  [ARCHITECTURE.md](../../ARCHITECTURE.md). No Terraform workspaces, no wrapper tool (Terragrunt).
- **State**: S3 remote backend with **native S3 lockfile** (`use_lockfile = true`, Terraform ≥ 1.11) —
  no DynamoDB lock table. The bucket is created once by `infra/bootstrap/` on **local state**
  (the chicken-and-egg solution), then every env uses it with a distinct state key.
- **Auth**: one reusable `cognito-user-pool` module, instantiated four times per env root. Pools run on
  the **Essentials** feature tier (required for passwordless), `sign_in_policy.allowed_first_auth_factors
  = ["EMAIL_OTP"]` (+ the API-mandated, inert `PASSWORD` entry — research.md D4 amendment), app clients
  with the `ALLOW_USER_AUTH` choice-based flow. Self-signup toggled via
  `admin_create_user_config.allow_admin_create_user_only` (false for customer, true for the other three).
  The back-office pool additionally declares the `admin` / `manager` / `csa` groups.
- **Safety**: provider pinned with `allowed_account_ids` so a misdirected apply fails loudly; consistent
  tagging + naming; `dev` email via Cognito default sender (sufficient for dev), with a documented SES
  path for higher environments.

## Technical Context

**Language/Version**: Terraform (HCL2), `required_version >= 1.11.0` (S3-native locking GA). AWS
provider `hashicorp/aws ~> 6.0` (≥ 6.0 — `user_pool_tier` + `sign_in_policy` supported).

**Primary Dependencies**: AWS provider (`~> 6.0`). No third-party Terraform modules — first-party modules
only, per ARCHITECTURE.md ("modules never call other modules; composition happens in env roots").

**Storage**: Terraform remote state in **S3** (versioned, SSE, public-access-blocked, TLS-enforced),
locked via the S3-native lockfile. Runtime app↔infra contract values written to **SSM Parameter Store**.

**Testing**: `terraform fmt -check`, `terraform validate`, and `terraform plan` per env (the plan is the
contract preview). `tflint` + `checkov`/`trivy` static checks via a `make lint` target. No live apply by
Claude — `dev` apply and validation are run by the operator per [quickstart.md](./quickstart.md).

**Target Platform**: AWS, region `ap-southeast-1` for `dev` (per-env `aws_region` variable; future
`ap-southeast-2`). Account access via the local `ef` named profile (`AWS_PROFILE=ef`).

**Project Type**: Infrastructure-as-code (Terraform monorepo subtree under `infra/`). Not an
application surface — no hot/cold backend code in this slice.

**Performance Goals**: N/A for provisioning. Operational target inherited from the auth domain:
customer self-register → OTP delivered → sign-in completes in **< 2 min** (spec SC-002), gated mostly by
email deliverability (Cognito default sender in dev).

**Constraints**:
- Nothing is auto-applied; the operator runs every `init`/`apply`/`bootstrap` (CLAUDE.md mode of work).
- `dev` is the only environment applied now; `qa`/`staging`/`prod` are authored-but-unapplied.
- Every command is scoped to `AWS_PROFILE=ef`; provider `allowed_account_ids` blocks wrong-account applies.
- Passwordless **EMAIL_OTP only** — no passwords anywhere; customer-only self-signup.
- Region is a single per-env variable (no region hardcoded in modules).

**Scale/Scope**: 1 bootstrap root + 1 reusable auth module (+ small shared tagging/SSM helpers) + 4 env
roots. Per env: 4 user pools + their app clients + SSM parameters. Initial live footprint: `dev` only.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Gate | Status |
|---|---|---|
| **I. Spec-Driven Development** | spec.md committed; this plan cites the constitution; tasks come next; gaps go back to the artifact | ✅ spec.md exists; plan derived from it. |
| **II. Monorepo + Shared Contracts** | Infra lives in the one monorepo; the app↔infra contract is single-sourced | ✅ `infra/` subtree; **SSM Parameter Store** is the single source of pool ids/ARNs for later slices. No copy-paste. |
| **III. Dual-Path Backend** | Plan declares which backend path(s) it targets | ✅ **N/A — neither path.** This slice provisions infrastructure only; no hot- or cold-path code. Explicitly recorded so the gate is satisfied, not skipped. |
| **IV. Auth Isolation** | 4 isolated pools, passwordless EMAIL_OTP, customer-only self-signup, back-office RBAC groups, no auth proxy | ✅ **Core of this slice.** Four independent `aws_cognito_user_pool` instances; EMAIL_OTP via Essentials tier; self-signup only on customer; `admin`/`manager`/`csa` groups on back-office. Per-pool JWT validation is a later backend slice (noted, not built here). |
| **V. Native-Feel, Consistent Design** | Design-system usage | ✅ **N/A** — no UI in this slice. |
| **VI. Layered Architecture & Explicit Wiring** | Conform to ARCHITECTURE.md | ✅ Exact "module + env-root" layout; modules never call modules; composition only in env roots; explicit module inputs/outputs (no hidden wiring). |
| **VII. Observability & Telemetry** | Plan declares telemetry for user-facing flows | ✅ No new user-facing product flow ships here (no clients/backends). The slice **provisions the home** for later telemetry (metrics-stack modules are listed in ARCHITECTURE.md but built in their own slice). No product events introduced. |

**Technology Standards (Locked)**: Uses the locked **Terraform / multi-environment / remote state** and
**AWS Cognito** standards exactly. No locked technology swapped. Decision to use S3-native locking
(instead of a DynamoDB lock table) is *within* the "remote state" standard — it is the current,
recommended Terraform mechanism, documented in research.md. **No constitution amendment required.**

**Result: PASS — no violations. Complexity Tracking is empty.**

## Project Structure

### Documentation (this feature)

```text
specs/001-infra-foundation/
├── plan.md              # This file (/speckit-plan output)
├── research.md          # Phase 0 — decisions & rationale
├── data-model.md        # Phase 1 — resource/module "entities" & their shapes
├── quickstart.md        # Phase 1 — operator run/validate guide (bootstrap → dev apply → verify)
├── contracts/           # Phase 1 — module & operational interface contracts
│   ├── cognito-user-pool.module.md   # reusable auth module inputs/outputs
│   ├── ssm-parameters.contract.md    # app↔infra parameter naming contract
│   └── makefile-targets.contract.md  # the make command surface
└── tasks.md             # Phase 2 — created by /speckit-tasks (NOT here)
```

### Source Code (repository root)

The `infra/` directory already exists (empty). This slice fills it with the binding ARCHITECTURE.md
layout. Files marked authored-now; `qa`/`staging`/`prod` roots are authored but **not applied**.

```text
infra/
├── bootstrap/                      # one-time, LOCAL state — creates the remote-state bucket
│   ├── main.tf                     #   S3 state bucket (versioned, SSE, public-access-block, TLS-only)
│   ├── variables.tf                #   bucket name, region, account id, tags
│   ├── outputs.tf                  #   bucket name/arn (referenced by env backend configs)
│   ├── versions.tf                 #   required_version + provider pins; LOCAL backend (default)
│   └── README.md                   #   "run me first, once" + exact commands
│
├── modules/
│   ├── cognito-user-pool/          # reusable — ONE concern: a single audience's pool + client(s)
│   │   ├── main.tf                 #   aws_cognito_user_pool (+ groups) + aws_cognito_user_pool_client
│   │   ├── variables.tf            #   audience, self_signup, tier, groups, callback/logout urls, tags…
│   │   ├── outputs.tf              #   user_pool_id, user_pool_arn, client_id(s), endpoint
│   │   └── README.md
│   └── ssm-parameters/             # reusable — writes the app↔infra contract values
│       ├── main.tf                 #   aws_ssm_parameter set under /effy/<env>/auth/…
│       ├── variables.tf
│       └── outputs.tf
│
├── envs/                           # per-environment roots — composition happens HERE
│   ├── _shared/                    # tiny shared locals (naming, base tags) consumed by each root
│   │   └── tags.tf                 #   (or a `globals` pattern via tfvars) — base tag map + name prefix
│   ├── dev/                        # APPLIED NOW
│   │   ├── main.tf                 #   instantiates cognito-user-pool ×4 + ssm-parameters
│   │   ├── variables.tf
│   │   ├── backend.tf              #   S3 backend, key = "envs/dev/terraform.tfstate", use_lockfile
│   │   ├── providers.tf            #   aws provider; region=var; allowed_account_ids guard
│   │   ├── versions.tf             #   required_version + provider pins
│   │   ├── outputs.tf              #   pool ids/clients (also mirrored to SSM)
│   │   └── dev.tfvars              #   region=ap-southeast-1, account id, env="dev", callback urls…
│   ├── qa/        # AUTHORED, NOT APPLIED  (same shape as dev/, qa.tfvars)
│   ├── staging/   # AUTHORED, NOT APPLIED
│   └── prod/      # AUTHORED, NOT APPLIED
│
└── scripts/                        # helper scripts invoked by the Makefile (guardrails, fmt, lint)

Makefile                            # root — init/plan/apply/destroy/fmt/lint/validate, ENV-parameterized,
                                    #   every target wraps the command with AWS_PROFILE=ef
```

**Structure Decision**: **Module + per-environment-root** (ARCHITECTURE.md §Infrastructure), realized
under the existing `infra/` directory. Each `envs/<env>` root is a self-contained Terraform root with
its **own backend state key** (`envs/<env>/terraform.tfstate`) in the shared bootstrap bucket, giving
per-environment state isolation (spec FR-012) without workspaces. Reusable concerns live in
`infra/modules/*` and are composed only by env roots (modules never call modules). The root `Makefile`
is the single operator entry point; it parameterizes on `ENV` and pins `AWS_PROFILE=ef`.

## Complexity Tracking

> No constitution violations. No entries required.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| _(none)_  | —          | —                                   |
