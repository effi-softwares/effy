# Research & Decisions: Infrastructure Foundation & Four-Pool Auth

Phase 0 output. Every decision below resolves a "how" left open by the spec, within the
constitution's locked standards and [ARCHITECTURE.md](../../ARCHITECTURE.md). Format per decision:
**Decision → Rationale → Alternatives considered**.

---

## D1 — Multi-environment layout: module + per-environment-root (no workspaces, no wrapper)

**Decision**: Use the standard **"reusable modules composed by per-environment roots"** layout:
`infra/modules/*` (one concern each) wired together by `infra/envs/<env>/` roots (`dev`, `qa`,
`staging`, `prod`). Each env root is a full Terraform root directory with its own backend, provider,
variables, and `.tfvars`. This is mandated verbatim by ARCHITECTURE.md §Infrastructure and is the
industry-standard "terralith-avoiding" structure.

**Rationale**:
- **Strong environment isolation** — each env has its own state file and is `plan`/`apply`-ed
  independently. You physically cannot apply `dev` and mutate `prod` (spec FR-012, FR-010).
- **Authored-but-unapplied is trivial** — `qa`/`staging`/`prod` roots exist as code and `plan`
  cleanly, but are simply never `apply`-ed (spec FR-011). No flags, no conditional logic.
- **Greppable + explicit** — modules take inputs and emit outputs; composition is visible in the env
  root. Matches Constitution VI ("explicit, greppable wiring; modules never call modules").
- **Per-env divergence is natural** — `prod` can differ (tier, email config, MFA) by changing its
  `.tfvars`/root without leaking into other envs.

**Alternatives considered**:
- **Single root + Terraform workspaces** — *Rejected.* One state, one backend; environment differences
  become `terraform.workspace` conditionals; a fat-finger `apply` in the wrong workspace hits the wrong
  env. ARCHITECTURE.md explicitly forbids it ("deliberately not one monolithic root with workspaces").
- **Terragrunt (wrapper tool)** — *Rejected.* Adds a dependency and a DSL; ARCHITECTURE.md explicitly
  rejects "a wrapper tool". The Makefile gives us the DRY command surface without it.
- **Branch-per-environment** — *Rejected.* Drift and merge hell; the same code should describe all envs.

---

## D2 — Remote state backend: S3 with native lockfile (no DynamoDB)

**Decision**: Remote state in **S3**, locked with the **native S3 lockfile** (`use_lockfile = true`),
requiring **Terraform ≥ 1.11**. One bucket for all envs; per-env isolation via a distinct state **key**
(`envs/<env>/terraform.tfstate`). Bucket hardening: versioning **on**, default SSE (SSE-S3 or
SSE-KMS), `BlockPublicAccess` all-on, a bucket policy that **denies non-TLS** requests, and
`prevent_destroy` on the bucket.

**Rationale**:
- **S3-native locking is the current recommended mechanism.** DynamoDB-based state locking was
  deprecated in Terraform 1.11 in favour of the lockfile; for a greenfield 2026 build, "most reliable
  industry-standard" now means S3-native locking. **One fewer resource** to provision, pay for, and
  IAM-scope, while still satisfying ARCHITECTURE.md's "remote, with a lock" (spec FR-013).
- **Versioning + isolation** give safe rollback and per-env blast-radius (spec FR-012).
- **Single bucket, many keys** is simpler than a bucket-per-env and is the common pattern; env
  isolation comes from the key + IAM, not bucket boundaries.

**Alternatives considered**:
- **S3 + DynamoDB lock table** — *Rejected.* The historical default, now deprecated; an extra resource
  and IAM surface for no benefit over the lockfile. (If a future constraint forces Terraform < 1.11,
  this is the documented fallback — but we pin ≥ 1.11 to avoid it.)
- **Terraform Cloud / HCP remote state** — *Rejected for now.* External SaaS dependency and cost; the
  constitution's "remote state" standard is satisfied self-managed on S3, and CLAUDE.md keeps us
  AWS-native.

---

## D3 — Bootstrap of the state backend (the chicken-and-egg)

**Decision**: A dedicated `infra/bootstrap/` root that runs on **local state** (default backend) and
creates **only** the S3 state bucket (hardened per D2). It is `apply`-ed **once**, manually, before any
env. Its own `terraform.tfstate` is committed-ignored and kept locally / in the bucket it created
(documented in its README). Env roots then reference the bucket by name in their `backend.tf`.

**Rationale**: You can't store state remotely in a bucket that doesn't exist yet. A small local-state
bootstrap root is the standard, reliable solution and is exactly what ARCHITECTURE.md prescribes
("`bootstrap/` — one-time, LOCAL state: creates the remote-state bucket + lock"). Keeping it minimal
(just the bucket) keeps the irreversible, privileged step tiny and auditable.

**Alternatives considered**:
- **Click-create the bucket in the console** — *Rejected.* Violates "code is the source of truth"
  (spec FR-009); not reproducible.
- **Bootstrap then migrate its own state into the bucket** (`-migrate-state`) — *Optional, documented*
  in the bootstrap README as a follow-up, but not required for correctness; the bootstrap state is tiny
  and rarely changes.

---

## D4 — Cognito passwordless EMAIL_OTP via the Essentials tier (managed, no custom Lambda triggers)

**Decision**: Each pool is an `aws_cognito_user_pool` on the **`ESSENTIALS`** feature tier
(`user_pool_tier = "ESSENTIALS"`), with:
- `sign_in_policy { allowed_first_auth_factors = ["EMAIL_OTP"] }` — passwordless email OTP as the
  first (and only) factor;
- `username_attributes = ["email"]`, `auto_verified_attributes = ["email"]`;
- an `aws_cognito_user_pool_client` whose `explicit_auth_flows` includes **`ALLOW_USER_AUTH`** (the
  choice-based flow that carries EMAIL_OTP) plus `ALLOW_REFRESH_TOKEN_AUTH`. **No** `*_PASSWORD_AUTH`
  flows are enabled — there are no passwords (spec FR-004).

**Rationale**: Passwordless EMAIL_OTP is only available through Cognito's **choice-based
authentication** (`ALLOW_USER_AUTH`), and that capability requires the **Essentials** feature tier or
higher (Lite does not support `sign_in_policy`). This is the **managed** path — no
`DefineAuthChallenge`/`CreateAuthChallenge`/`VerifyAuthChallenge` Lambda triggers — which matches
CLAUDE.md's "managed passwordless EMAIL_OTP" and keeps the slice infra-only (no cold-path code).
Amplify on the clients drives this flow directly against Cognito (no auth proxy — Principle IV).

**Provider support**: `user_pool_tier` and `sign_in_policy.allowed_first_auth_factors`
(values `PASSWORD | EMAIL_OTP | SMS_OTP | WEB_AUTHN`) are supported by `hashicorp/aws` provider
**v6.x** (and late v5.x). We pin `~> 6.0`.

**Amendment (apply-time discovery, 2026-07-05)**: `CreateUserPool` **rejects** an
`AllowedFirstAuthFactors` list without `PASSWORD`
(`InvalidParameterException: Password should be configured as one of the allowed first auth
factors.`) — the API mandates PASSWORD in the pool-level list; passwordless factors are additive.
**Decision**: the module appends `PASSWORD` to the pool-level list itself (callers still pass only
passwordless factors and are validated against passing PASSWORD). Passwordlessness is enforced at
the layers where it actually binds, unchanged: the app clients enable **no password auth flow**
(`ALLOW_USER_AUTH` + refresh only), self-signup uses the password-less `SignUp` call, and no user
is ever created with a password credential — so no password sign-in can succeed. Spec FR-004 and
constitution Principle IV remain satisfied as written (no passwords exist anywhere on the
platform); only the literal pool-level API shape recorded here and in the module contract changed.

**Alternatives considered**:
- **Custom-auth Lambda triggers (the classic pre-2024 passwordless recipe)** — *Rejected.* More moving
  parts, cold-path code in an infra slice, and superseded by native EMAIL_OTP. CLAUDE.md history shows
  the team already moved to the managed approach.
- **`PLUS` tier** — *Rejected for now.* Adds threat-protection features we don't need yet; Essentials
  is the minimum that unlocks passwordless. (Tier is a per-env variable, so `prod` can opt up later.)
- **Passwords + optional OTP** — *Rejected.* Constitution IV forbids passwords anywhere.

---

## D5 — Self-signup: customer open, the other three admin-only

**Decision**: Toggle self-registration with
`admin_create_user_config { allow_admin_create_user_only = <bool> }`, exposed as a module variable
`self_signup_enabled`:
- **customer** → `self_signup_enabled = true` (`allow_admin_create_user_only = false`).
- **driver / shop / back-office** → `self_signup_enabled = false`
  (`allow_admin_create_user_only = true`).

**Rationale**: This is the canonical Cognito switch for "only admins create users" and directly encodes
spec FR-002/FR-003. With it set, the `SignUp` API is rejected for those pools (spec SC-003) — staff add
users via the console (or `admin-create-user`) for now; an in-platform admin flow comes later.

**Alternatives considered**:
- **A pre-sign-up Lambda that rejects signups** — *Rejected.* Reinvents a built-in flag with code.
- **Same pool, different app clients** — *Rejected.* Violates Principle IV's hard four-pool isolation.

---

## D6 — OTP email delivery: Cognito default sender for dev, SES path documented for higher envs

**Decision**: `dev` uses **`email_configuration { email_sending_account = "COGNITO_DEFAULT" }`** (the
built-in Cognito sender). The module exposes `email_configuration` as a variable so `qa`/`staging`/`prod`
can switch to **`DEVELOPER`** mode with a verified **SES** identity (`source_arn`,
`from_email_address`) when promoted. SES setup (domain/email verification, leaving the sandbox) is
captured as a documented prerequisite for those envs, **not** built in this slice.

**Rationale**: The Cognito default sender needs **zero extra setup** and keeps `dev` a true one-command
apply, which is the whole point of the foundation slice. Its ~50 emails/day cap is fine for dev testing
(spec SC-002). SES (higher volume, custom From) is genuinely needed only when real users arrive, i.e.
the environments we are **not** applying now — so deferring it removes a setup dependency without
blocking anything.

**Alternatives considered**:
- **SES from day one in dev** — *Rejected.* Forces SES identity verification + sandbox handling before
  the first apply; friction with no dev benefit. Easy to add later via the existing variable.

---

## D7 — Region parametrization (Singapore now, Sydney-ready)

**Decision**: Region is a single per-env variable `aws_region`, set to `ap-southeast-1` in `dev.tfvars`.
The provider block uses `region = var.aws_region`; **no module hardcodes a region**. Relocating an env =
change one `.tfvars` value (and re-provision). Cognito-issuer URLs and SSM parameters are derived from
the region/account at plan time, never pinned literally.

**Rationale**: Directly satisfies spec FR-019/FR-020 and SC-007 — region is config, not structure. A
future `ap-southeast-2` move is a `.tfvars` edit, not a redesign. (Note: relocating Cognito means new
pools in the new region — pools are regional and not movable in place — so the "move" is a re-provision +
data consideration, acknowledged for when real users exist; for `dev` it's free.)

**Alternatives considered**:
- **Hardcoded region in providers/modules** — *Rejected.* Breaks portability (SC-007).
- **Multi-region active now** — *Rejected.* Out of scope; dev is single-region.

---

## D8 — Account & profile guardrails (no accidental wrong-target apply)

**Decision**: Two layers:
1. **Profile scoping** — every Makefile target wraps the command in `AWS_PROFILE=ef`, so both the AWS
   provider and the S3 backend resolve credentials from the `ef` profile (spec FR-017/FR-018).
2. **Account pinning** — the provider sets `allowed_account_ids = [var.aws_account_id]` (account id in
   each env's `.tfvars`). If the resolved credentials point at a different account, Terraform **errors
   before any change** — covering the "wrong account/profile" edge case.

**Rationale**: Defense in depth for the single most dangerous mistake (applying to the wrong account).
`AWS_PROFILE` is the standard credential scoping for both provider and backend; `allowed_account_ids` is
the standard provider-level account assertion. Together they make a misdirected apply fail loudly.

**Alternatives considered**:
- **Hardcoding `profile = "ef"` in the provider** — *Rejected.* Less portable for CI and re-naming;
  the env-var approach (set by the Makefile) scopes provider **and** backend uniformly.
- **A pre-apply shell check of `aws sts get-caller-identity`** — *Kept as a belt-and-braces script*
  (`infra/scripts/`) the Makefile can call, but the provider assertion is the authoritative gate.

---

## D9 — Naming & tagging convention

**Decision**:
- **Name prefix**: `effy-<env>-<concern>` (e.g., `effy-dev-customer` user pool, `effy-dev-tfstate`
  bucket). Encodes brand + env + purpose (spec FR-022).
- **Base tags** applied to every resource via the provider `default_tags` block:
  `Project=effy`, `Environment=<env>`, `ManagedBy=terraform`, `Slice=001-infra-foundation`,
  `Owner=platform` (spec FR-021, SC-009).

**Rationale**: `default_tags` on the provider guarantees uniform tagging without per-resource repetition;
the name prefix makes cross-env confusion impossible at a glance. Low effort, high traceability/cost
attribution value.

**Alternatives considered**:
- **Per-resource tag blocks** — *Rejected.* Repetitive and easy to forget; `default_tags` is the modern
  standard.

---

## D10 — App↔infra contract via SSM Parameter Store

**Decision**: Each env writes its pool ids and app-client ids to **SSM Parameter Store** under a
predictable prefix, e.g. `/effy/<env>/auth/<audience>/user_pool_id` and
`/effy/<env>/auth/<audience>/app_client_id` (full contract in
[contracts/ssm-parameters.contract.md](./contracts/ssm-parameters.contract.md)). Non-secret values use
`String`; nothing here is secret (pool/client ids are not secrets), so no `SecureString`/KMS needed yet.

**Rationale**: ARCHITECTURE.md fixes the **parameter store as the infra↔app contract** — infra writes,
backends/clients read. Establishing it now (even with just auth ids) sets the pattern the customer
onboarding slice will consume, and keeps Principle II's "single source of truth" honest (no hand-copied
pool ids into client configs).

**Alternatives considered**:
- **Terraform remote-state `terraform_remote_state` data source** — *Rejected as the app contract.*
  Couples apps to Terraform state layout; SSM is the language-agnostic, runtime-readable contract.
- **Outputs only** — *Insufficient.* Outputs are dev-time; SSM is what running apps read.

---

## D11 — Makefile command surface (ENV-parameterized, `AWS_PROFILE=ef`)

**Decision**: A root `Makefile` with `ENV`-parameterized targets, each `cd`-ing into the env root and
wrapping the Terraform command in `AWS_PROFILE=ef`. Core targets: `init`, `plan`, `apply`, `destroy`,
`fmt`, `validate`, `lint`, `output`, plus `bootstrap-init` / `bootstrap-apply` for the one-time backend.
`apply`/`destroy` keep Terraform's interactive approval (no `-auto-approve`) so the human confirms.
Full surface in [contracts/makefile-targets.contract.md](./contracts/makefile-targets.contract.md).

**Rationale**: One memorable, consistent entry point (`make plan ENV=dev`) that bakes in the profile and
the per-env directory, eliminating the class of errors from running raw `terraform` in the wrong dir or
profile (spec FR-017). Keeping interactive approval enforces "human runs every apply" (spec FR-015) —
Claude never auto-applies.

**Alternatives considered**:
- **Raw `terraform` commands in docs** — *Rejected.* Error-prone; the user explicitly asked for Make
  targets prefixed with `AWS_PROFILE=ef`.
- **`-auto-approve` in targets** — *Rejected.* Would defeat the human-in-the-loop guarantee.

---

## D12 — Version pinning & static checks

**Decision**: Pin `required_version >= 1.11.0` (S3-native locking) and `aws ~> 6.0` in every root's
`versions.tf`. Add `make lint` running `terraform fmt -check`, `terraform validate`, `tflint`, and a
security scan (`checkov` or `trivy config`). These run locally (and in CI later); they do **not** apply.

**Rationale**: Reproducible plans across machines (Principle I/II discipline) and catching
misconfigurations (open security groups, unencrypted buckets) before the operator applies. Standard
hygiene for reliable IaC.

**Alternatives considered**:
- **Unpinned versions** — *Rejected.* Non-reproducible; provider drift can silently change behavior.

---

## Open items intentionally deferred (not blockers for this slice)

- **SES production setup** for `qa`/`staging`/`prod` OTP email (D6) — needed only when those envs are
  applied with real users.
- **Per-pool JWT validation & cross-pool rejection** at the backend — a later backend slice (the pools
  created here make it possible; the enforcement is not built here).
- **Metrics stack / network / DB / compute modules** — listed in ARCHITECTURE.md, built in their own
  slices; not part of the auth foundation.
- **CI pipeline** to run `fmt/validate/lint/plan` on PRs — recommended next, but the Makefile is the
  manual equivalent for now.

---

### Sources

- [Terraform Registry — `aws_cognito_user_pool` (hashicorp/aws)](https://registry.terraform.io/providers/hashicorp/aws/6.21.0/docs/resources/cognito_user_pool) — `user_pool_tier` (LITE/ESSENTIALS/PLUS) and `sign_in_policy.allowed_first_auth_factors` (PASSWORD/EMAIL_OTP/SMS_OTP/WEB_AUTHN); Essentials tier required for `sign_in_policy`.
- [Terraform Registry — `aws_cognito_user_pool_client`](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/cognito_user_pool_client) — `ALLOW_USER_AUTH` explicit auth flow.
- [AWS News Blog — Improve your app authentication workflow with new Amazon Cognito features](https://aws.amazon.com/blogs/aws/improve-your-app-authentication-workflow-with-new-amazon-cognito-features/) — passwordless EMAIL_OTP, choice-based auth, Essentials default tier.
- [AWS Cognito — Authentication flows](https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-authentication-flow-methods.html) — `ALLOW_USER_AUTH` choice-based flow carries EMAIL_OTP/SMS_OTP/PASSWORD challenges.
- [Amazon Cognito — Pricing](https://aws.amazon.com/cognito/pricing/) — feature tiers (Lite/Essentials/Plus) and what passwordless requires.
