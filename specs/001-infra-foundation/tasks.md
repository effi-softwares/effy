---

description: "Task list for Platform Infrastructure Foundation & Four-Pool Authentication"
---

# Tasks: Platform Infrastructure Foundation & Four-Pool Authentication

**Input**: Design documents from `/specs/001-infra-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: No automated test framework (Terratest etc.) was requested. For this IaC slice, "tests" are
`terraform fmt`/`validate`/`plan`, the `make lint` static analysis (tflint + checkov/trivy), and the
operator-run validations in [quickstart.md](./quickstart.md). Those are the acceptance tasks below.

**Organization**: Tasks are grouped by user story. Each pool lives in its **own file** under
`infra/envs/dev/` so the stories stay independently buildable and testable.

**⚠️ Mode of work (CLAUDE.md)**: Claude **authors** all Terraform/Makefile/scripts. The **operator runs
every `init`/`apply`/`bootstrap`** by hand — tasks that mutate live AWS are marked **🧑‍💻 OPERATOR** and
hand off exact commands; Claude never runs them.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 / US2 / US3 / US4 (Setup / Foundational / Polish have no story label)
- All paths are repo-root-relative.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repo-level scaffolding and shared tooling — no AWS calls, nothing applied.

- [ ] T001 Create the `infra/` tree per plan.md: `infra/bootstrap/`, `infra/modules/cognito-user-pool/`, `infra/modules/ssm-parameters/`, `infra/envs/_shared/`, `infra/envs/{dev,qa,staging,prod}/`, `infra/scripts/` (add `.gitkeep` where empty)
- [ ] T002 [P] Add Terraform ignores to root `.gitignore` (`.terraform/`, `*.tfstate`, `*.tfstate.*`, `crash.log`, `override.tf`, `*_override.tf`; keep `.terraform.lock.hcl` and `*.tfvars` committed — no secrets live in tfvars)
- [ ] T003 [P] Author shared naming + base-tags locals in `infra/envs/_shared/tags.tf` (name prefix `effy-<env>`; base tags `Project=effy`, `ManagedBy=terraform`, `Slice=001-infra-foundation`, `Owner=platform`) per research.md D9
- [ ] T004 [P] Author the root `Makefile` (ENV-parameterized; every target wraps `AWS_PROFILE=ef`; targets `bootstrap-init`, `bootstrap-apply`, `init`, `plan`, `apply`, `destroy`, `output`, `fmt`, `validate`, `lint`; **no `-auto-approve`**) per [contracts/makefile-targets.contract.md](./contracts/makefile-targets.contract.md)
- [ ] T005 [P] Add static-analysis config: `infra/.tflint.hcl` and a `checkov`/`trivy config` invocation wired into the `make lint` target

**Checkpoint**: Tree + Makefile + lint config exist; `make fmt` runs (no resources yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: State backend, the reusable modules, and the `dev` env-root skeleton — required before ANY
user story can be provisioned or validated.

**⚠️ CRITICAL**: No user-story pool work begins until this phase is complete.

- [ ] T006 Author `infra/bootstrap/` (`versions.tf` with `required_version >= 1.11.0`, `aws ~> 6.0`, default local backend; `main.tf` hardened S3 state bucket — versioning on, default SSE, `BlockPublicAccess` all-on, bucket policy denying non-TLS, `prevent_destroy = true`; `variables.tf`; `outputs.tf` bucket name/arn; `README.md` "run once, first") per research.md D2/D3 + [data-model.md](./data-model.md) E2
- [ ] T007 [P] Author `infra/modules/cognito-user-pool/` (`main.tf`: `aws_cognito_user_pool` on `ESSENTIALS` tier, `sign_in_policy.allowed_first_auth_factors=["EMAIL_OTP"]`, `username_attributes=["email"]`, `auto_verified_attributes=["email"]`, `admin_create_user_config.allow_admin_create_user_only = !var.self_signup_enabled`, optional `aws_cognito_user_group` from `var.groups`, `aws_cognito_user_pool_client` with `explicit_auth_flows=["ALLOW_USER_AUTH","ALLOW_REFRESH_TOKEN_AUTH"]` and **no** password flow; `variables.tf`; `outputs.tf`; `README.md`) per [contracts/cognito-user-pool.module.md](./contracts/cognito-user-pool.module.md)
- [ ] T008 [P] Author `infra/modules/ssm-parameters/` (`main.tf`: `aws_ssm_parameter` `String` set writing one audience's `user_pool_id`/`app_client_id`/`user_pool_arn` under `/effy/<env>/auth/<audience>/…`; `variables.tf`; `outputs.tf`) per [contracts/ssm-parameters.contract.md](./contracts/ssm-parameters.contract.md)
- [ ] T009 Author `infra/envs/dev/versions.tf` (`required_version >= 1.11.0`; `aws ~> 6.0`)
- [ ] T010 Author `infra/envs/dev/providers.tf` (aws provider `region = var.aws_region`; `allowed_account_ids = [var.aws_account_id]` wrong-account guard; `default_tags` from `_shared` base tags) per research.md D8/D9
- [ ] T011 Author `infra/envs/dev/backend.tf` (S3 backend: bucket = bootstrap bucket name, `key = "envs/dev/terraform.tfstate"`, `region`, `use_lockfile = true`) per research.md D2
- [ ] T012 Author `infra/envs/dev/variables.tf` + `infra/envs/dev/dev.tfvars` (`env="dev"`, `aws_region="ap-southeast-1"`, `aws_account_id`, `user_pool_tier="ESSENTIALS"`, `email_configuration` = `COGNITO_DEFAULT`, per-audience callback/logout URLs as dev placeholders) per [data-model.md](./data-model.md) E1

**Checkpoint**: `make init ENV=dev` then `make plan ENV=dev` 🧑‍💻 produce a clean "no changes" plan (empty
but valid root); modules and bootstrap authored and `terraform validate`-clean.

---

## Phase 3: User Story 1 — Reproducible, safe multi-environment provisioning (Priority: P1) 🎯 MVP

**Goal**: The backbone — `dev` provisionable; `qa`/`staging`/`prod` authored-but-unapplied; one consistent
`AWS_PROFILE=ef` command workflow; preview-before-apply; account guard + state lock; nothing auto-applied.

**Independent Test**: `make plan ENV=dev|qa|staging|prod` each produce a valid plan; bootstrap creates the
state bucket; only `dev` is applied; the wrong-account guard and the S3 lock both trigger (quickstart
Steps 0–1, 5–6).

### Implementation for User Story 1

- [ ] T013 [P] [US1] Author `infra/envs/qa/` root (`versions.tf`, `providers.tf`, `backend.tf` with `key="envs/qa/terraform.tfstate"`, `variables.tf`, `qa.tfvars`) — authored, **NOT applied**
- [ ] T014 [P] [US1] Author `infra/envs/staging/` root + `staging.tfvars` (same shape, `key="envs/staging/terraform.tfstate"`) — authored, **NOT applied**
- [ ] T015 [P] [US1] Author `infra/envs/prod/` root + `prod.tfvars` (same shape, `key="envs/prod/terraform.tfstate"`; note tier may opt up to `PLUS` later via tfvars) — authored, **NOT applied**
- [ ] T016 [US1] Author `infra/scripts/preflight.sh` (assert `aws sts get-caller-identity` account == expected before mutating targets) and wire an optional call into the Makefile `apply`/`destroy` targets
- [ ] T017 [US1] Run `make fmt` + `make validate ENV=dev` and `terraform validate` for `bootstrap`, `qa`, `staging`, `prod`; confirm `make plan ENV=<each>` yields a valid plan (Claude runs `fmt`/`validate`/`plan` only — no apply)
- [ ] T018 [US1] 🧑‍💻 OPERATOR: run `make bootstrap-init && make bootstrap-apply`, then `make init ENV=dev` (exact commands in [quickstart.md](./quickstart.md) Steps 0–1). Acceptance: state bucket exists; dev backend initialized
- [ ] T019 [US1] Verify safety guarantees against [quickstart.md](./quickstart.md) Step 6: no `-auto-approve` in any target (FR-015/SC-006); wrong-account guard errors on mismatch (D8); concurrent apply blocked by S3 lock (FR-013/SC-008)

**Checkpoint**: Multi-env workflow proven; `dev` initialized; `qa`/`staging`/`prod` plan cleanly with zero
live resources (SC-004).

---

## Phase 4: User Story 2 — Customer self-service registration & sign-in (Priority: P1) 🎯 MVP

**Goal**: The customer pool exists with self-signup ON and passwordless EMAIL_OTP; a new email can
self-register and sign in with an OTP, no password.

**Independent Test**: In `dev`, a brand-new email completes `sign-up` → `USER_AUTH` EMAIL_OTP →
`respond-to-auth-challenge` returns tokens, with no password ([quickstart.md](./quickstart.md) Step 4).

### Implementation for User Story 2

- [ ] T020 [US2] Author `infra/envs/dev/auth-customer.tf`: instantiate `modules/cognito-user-pool` (`audience="customer"`, `self_signup_enabled=true`, `user_pool_tier="ESSENTIALS"`, `allowed_first_auth_factors=["EMAIL_OTP"]`, `groups=[]`, callback/logout URLs from `var`); include the customer `output` blocks in this file
- [ ] T021 [US2] In `infra/envs/dev/auth-customer.tf`, call `modules/ssm-parameters` for the customer audience (writes `/effy/dev/auth/customer/{user_pool_id,app_client_id,user_pool_arn}`) per [contracts/ssm-parameters.contract.md](./contracts/ssm-parameters.contract.md)
- [ ] T022 [US2] Run `make fmt` + `make validate ENV=dev`; confirm `make plan ENV=dev` shows the customer pool + app client + 3 SSM params to create
- [ ] T023 [US2] 🧑‍💻 OPERATOR: `make apply ENV=dev`, then run [quickstart.md](./quickstart.md) Step 4 (self `sign-up` → EMAIL_OTP → tokens). Acceptance: registration + OTP sign-in succeed with no password (SC-002, FR-002/004/005)

**Checkpoint**: A customer can self-register and sign in passwordlessly in `dev` — the MVP money path.

---

## Phase 5: User Story 3 — Manually-provisioned internal audiences (Priority: P2)

**Goal**: Driver, shop, and back-office pools exist with self-signup OFF; back-office carries the
`admin`/`manager`/`csa` groups. Accounts added by staff (console for now).

**Independent Test**: In `dev`, `sign-up` against driver/shop/back-office is rejected; back-office lists
the three groups; `AllowAdminCreateUserOnly = true` on all three ([quickstart.md](./quickstart.md) Step 3
+ negative check).

### Implementation for User Story 3

- [ ] T024 [P] [US3] Author `infra/envs/dev/auth-driver.tf`: `modules/cognito-user-pool` (`audience="driver"`, `self_signup_enabled=false`, `groups=[]`) + customer-style app client + `modules/ssm-parameters` for `driver` + `output` blocks
- [ ] T025 [P] [US3] Author `infra/envs/dev/auth-shop.tf`: `modules/cognito-user-pool` (`audience="shop"`, `self_signup_enabled=false`, `groups=[]`) + app client + `ssm-parameters` for `shop` + `output` blocks
- [ ] T026 [P] [US3] Author `infra/envs/dev/auth-backoffice.tf`: `modules/cognito-user-pool` (`audience="back_office"`, `self_signup_enabled=false`, `groups=[{admin},{manager},{csa}]`) + app client + `ssm-parameters` for `back-office` + `output` blocks per FR-007
- [ ] T027 [US3] Run `make fmt` + `make validate ENV=dev`; confirm `make plan ENV=dev` shows 3 pools + the 3 back-office groups + their SSM params to create
- [ ] T028 [US3] 🧑‍💻 OPERATOR: `make apply ENV=dev`, then run [quickstart.md](./quickstart.md) Step 3 (groups exist; `AllowAdminCreateUserOnly=true`) and the negative `sign-up` check. Acceptance: self-signup rejected on all three (SC-003); back-office groups present (FR-007)

**Checkpoint**: All four pools live; isolation + signup rules + RBAC groups verified (FR-001/003/006).

---

## Phase 6: User Story 4 — Region portability (Priority: P3)

**Goal**: `dev` runs in `ap-southeast-1`; region is a single per-env variable so relocating (e.g. to
`ap-southeast-2`) is a config change, not a redesign.

**Independent Test**: No module hardcodes a region; changing `aws_region` in a scratch plan re-targets;
`dev` resources are confirmed in `ap-southeast-1` ([quickstart.md](./quickstart.md) Step 5 region check).

### Implementation for User Story 4

- [ ] T029 [US4] Audit `infra/modules/*` and all `infra/envs/*` for hardcoded regions; confirm region flows only via `var.aws_region`; add `infra/envs/dev/region.tf` writing `/effy/dev/region` SSM param per [contracts/ssm-parameters.contract.md](./contracts/ssm-parameters.contract.md)
- [ ] T030 [US4] Document the region-relocation runbook (`ap-southeast-1` → `ap-southeast-2`) in `infra/envs/README.md`, noting Cognito pools are regional (relocation = re-provision, not in-place move) per research.md D7
- [ ] T031 [US4] Acceptance: confirm `dev` resources placed in `ap-southeast-1`; demonstrate that flipping `aws_region` in a throwaway `*.tfvars` re-targets the plan (SC-007, FR-019/020)

**Checkpoint**: Region is config-driven and Sydney-ready.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Documentation, hygiene, and full-slice validation.

- [ ] T032 [P] Author `infra/README.md` (layout, "bootstrap first", env model, `AWS_PROFILE=ef`, links to this spec/plan/quickstart)
- [ ] T033 [P] Ensure `make lint` passes across `infra/` (`terraform fmt -check`, `validate`, `tflint`, `checkov`/`trivy config`) per research.md D12
- [ ] T034 Verify `default_tags` (`Project`/`Environment`/`ManagedBy`/`Slice`/`Owner`) appear on every resource via `terraform plan`/state inspection (SC-009, FR-021)
- [ ] T035 🧑‍💻 OPERATOR: run the full [quickstart.md](./quickstart.md) end-to-end and check every acceptance criterion against the spec's Success Criteria (SC-001…SC-009)
- [ ] T036 [P] (Optional) Add `.github/workflows/infra.yml` running `fmt`/`validate`/`lint`/`plan` on PRs — **never `apply`** (CI parity with `make lint`)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup — **BLOCKS all user stories** (modules + dev root + bootstrap).
- **US1 (Phase 3)**: Depends on Foundational. The backbone; its operator apply (T018) provisions the state
  bucket every other story's apply relies on.
- **US2 (Phase 4)**: Depends on Foundational (needs the cognito + ssm modules and the dev root). Independent
  of US1's qa/staging/prod roots; its own apply needs the bootstrap bucket (T018).
- **US3 (Phase 5)**: Depends on Foundational. Independent of US2 — different files (`auth-driver/shop/backoffice.tf`).
- **US4 (Phase 6)**: Depends on Foundational; best validated after at least one pool exists (US2 or US3).
- **Polish (Phase 7)**: Depends on the desired user stories being complete.

### User Story Dependencies

- **US1 (P1)**: After Foundational. No dependency on other stories.
- **US2 (P1)**: After Foundational. No dependency on US1's extra roots; provisioning requires the bootstrap
  bucket (T018) and a `dev` apply.
- **US3 (P2)**: After Foundational. Independent of US1/US2 (separate `.tf` files); shares the `dev` apply.
- **US4 (P3)**: After Foundational. Cross-cuts; verify once region-bearing resources exist.

### Within Each User Story

- Author `.tf` → `fmt`/`validate`/`plan` (Claude) → 🧑‍💻 operator `apply` + quickstart validation.
- Modules before env-root instantiation; SSM wiring alongside each pool's file.

### Parallel Opportunities

- Setup: T002, T003, T004, T005 in parallel.
- Foundational: T007 and T008 (the two modules) in parallel; T009–T012 (dev root files) are same-directory
  and best done together but touch different files (can parallelize T009/T010/T011/T012 carefully).
- US1: T013, T014, T015 (qa/staging/prod roots) fully parallel — different directories.
- US3: T024, T025, T026 fully parallel — different files (`auth-driver.tf`/`auth-shop.tf`/`auth-backoffice.tf`).
- US2 and US3 can be built in parallel by different people — disjoint files in `infra/envs/dev/`.

---

## Parallel Example: User Story 3

```bash
# The three internal pools are independent files — author together:
Task: "Author infra/envs/dev/auth-driver.tf (driver pool, self-signup off)"
Task: "Author infra/envs/dev/auth-shop.tf (shop pool, self-signup off)"
Task: "Author infra/envs/dev/auth-backoffice.tf (back-office pool + admin/manager/csa groups)"
```

## Parallel Example: User Story 1 (extra env roots)

```bash
Task: "Author infra/envs/qa root (authored, not applied)"
Task: "Author infra/envs/staging root (authored, not applied)"
Task: "Author infra/envs/prod root (authored, not applied)"
```

---

## Implementation Strategy

### MVP First (US1 + US2 — both P1)

1. Phase 1 Setup → Phase 2 Foundational (modules + dev root + bootstrap authored).
2. Phase 3 US1: author qa/staging/prod + safety; 🧑‍💻 operator bootstraps state and inits dev.
3. Phase 4 US2: author the customer pool; 🧑‍💻 operator applies dev and validates passwordless sign-in.
4. **STOP & VALIDATE**: dev is live, a customer can self-register and sign in — demoable MVP.

### Incremental Delivery

1. Setup + Foundational → foundation ready.
2. US1 → backbone proven (multi-env workflow, safety, state) → Demo.
3. US2 → customer passwordless sign-in in dev → **MVP demo**.
4. US3 → internal pools + RBAC groups → Demo.
5. US4 → region portability verified → Demo.
6. Polish → docs, lint, full quickstart sign-off.

### Parallel Team Strategy

After Foundational: one person takes US1 (env roots + Makefile/safety) while another takes US2 (customer
pool); US3's three pool files split cleanly across people. All converge on a single `dev` apply run by the
operator.

---

## Notes

- 🧑‍💻 **OPERATOR** tasks (T018, T023, T028, T035) and any `bootstrap-apply`/`apply`/`destroy` are run by the
  user, never by Claude (CLAUDE.md mode of work). Claude stops at `fmt`/`validate`/`plan` and hands off
  exact commands.
- [P] = different files, no incomplete-task dependency.
- Four pools = four files in `infra/envs/dev/` (`auth-customer/driver/shop/backoffice.tf`) → maximal story
  independence and clean diffs.
- Commit after each task or logical group; keep `qa`/`staging`/`prod` authored-but-unapplied until promoted.
- Every acceptance task maps to a spec Success Criterion — see the SC references inline.
