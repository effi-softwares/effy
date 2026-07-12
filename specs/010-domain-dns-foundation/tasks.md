---

description: "Task list — 010 Platform Domain & Per-Environment Namespaces"
---

# Tasks: Platform Domain & Per-Environment Namespaces

**Input**: Design documents from `/specs/010-domain-dns-foundation/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md),
[data-model.md](./data-model.md), [contracts/](./contracts/dns-and-address.contract.md),
[quickstart.md](./quickstart.md)

**Tests**: No unit tests. This slice ships **zero application code** — a DNS delegation, a TLS
handshake, and an email's DKIM signature cannot honestly be unit-tested. Verification is
`make lint` (fmt/validate/tflint/trivy) plus two live verification scripts, matching the posture 007
established with `scripts/`.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: The user story this task serves (US1–US4)
- 🧑‍💻 = **operator-run** (live cloud state, the registrar, or AWS support) per CLAUDE.md

## ⚠ The ordering constraint that governs this whole list

**Steps after the GoDaddy repoint physically cannot succeed before it.** ACM validation and SES DKIM
verification both require AWS to *publicly resolve a record in the dev zone*, which requires the
parent to delegate to it, which requires the registrar to point at the parent zone. Apply the dev
root early and `aws_acm_certificate_validation` blocks for 45 minutes and then fails with an error
that looks like Terraform's fault and is actually DNS's (research **R6**).

This is why **T017 (GoDaddy) sits between two applies** and why no amount of parallelism can move it.

**A second gate was discovered during implementation** (research R5, amended): **Cognito rejects a
`source_arn` whose SES identity is not yet verified**, and verification is asynchronous — it lands
minutes *after* the apply that creates the DKIM records returns. So the pool switch is its own stage,
gated behind `ses_sender_enabled` (**T028a**). Same shape as the registrar gate: name the wait rather
than hide it inside an apply that will fail.

---

## Phase 1: Setup

**Purpose**: The new Terraform root and the Makefile plumbing that reaches it. Nothing here touches
cloud state.

- [X] T001 Create the new root's backend config in `infra/global/backend.tf` — S3 remote state in the existing `effy-apse2-tfstate` bucket, key `global/terraform.tfstate`, `use_lockfile = true` (matching the four env roots' `backend.tf`)
- [X] T002 [P] Create `infra/global/versions.tf` — `required_version >= 1.11.0`, AWS provider `~> 6.0` (identical pins to the env roots)
- [X] T003 [P] Create `infra/global/providers.tf` — region `var.aws_region`, `allowed_account_ids = [var.aws_account_id]` (the same wrong-account guard the env roots use), and `default_tags` with `Slice = "010-domain-dns-foundation"`. **Do NOT call `infra/envs/_shared`** — it validates `env ∈ {dev,qa,staging,prod}` and `global` is deliberately not an environment (research R1)
- [X] T004 [P] Create `infra/global/variables.tf` — `aws_region`, `aws_account_id`, `root_domain` (default `effyshopping.com`)
- [X] T005 [P] Create `infra/global/global.tfvars` — `aws_region = "ap-southeast-2"`, `aws_account_id = "724289623101"`, `root_domain = "effyshopping.com"`
- [X] T006 Add the global root to the Makefile: `TF_ROOTS += infra/global` (so `make lint` validates it) and three new targets `global-init` / `global-plan` / `global-apply` / `global-output` in `Makefile`, following the existing `init`/`plan`/`apply` shape but with `-var-file=global.tfvars`. `global-apply` is OPERATOR-marked and never auto-approved

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The two reusable modules every environment will instantiate. **Blocks all four user
stories** — nothing else can be written until these exist.

- [X] T007 [P] Create module `infra/modules/dns-env-zone/variables.tf` — `env`, `parent_zone_id`, `parent_domain`, `tags`
- [X] T008 Create module `infra/modules/dns-env-zone/main.tf` — (a) `aws_route53_zone` for `<env>.<parent_domain>`; (b) the `aws_route53_record` of type **`NS`** in the **parent** zone delegating to it — *this record lives in the ENV's state, which is what makes destroy remove the delegation and the zone together (FR-005, data-model E2)*; (c) `aws_acm_certificate` for `*.<env>.<parent_domain>` with `validation_method = "DNS"` and `lifecycle { create_before_destroy = true }`; (d) the validation `aws_route53_record`s in the child zone; (e) `aws_acm_certificate_validation`
- [X] T009 [P] Create module `infra/modules/dns-env-zone/outputs.tf` — `zone_id`, `zone_name`, `name_servers`, `certificate_arn`
- [X] T010 [P] Create module `infra/modules/ses-domain-identity/{variables.tf,outputs.tf}` — in: `domain`, `zone_id`, `region`, `dmarc_policy`, `tags`; out: `identity_arn`, `domain`, `from_address`, `mail_from_domain`. **Amended in implementation**: the module does **not** take `cognito_user_pool_arns` — see T011
- [X] T011 Create module `infra/modules/ses-domain-identity/main.tf` — `aws_sesv2_email_identity` (Easy DKIM) + the **3 DKIM `CNAME`** records + `aws_sesv2_email_identity_mail_from_attributes` for `mail.<domain>` + its **`MX`** and **SPF `TXT`** records + the **`_dmarc` `TXT`** at **`p=none`** (monitor — `p=reject` on day one silently destroys all sign-in mail on any misconfiguration; data-model E4). **Amended in implementation**: the `aws_ses_identity_policy` granting `cognito-idp.amazonaws.com` `ses:SendEmail` **cannot live in this module** — it needs the pool ARNs while the pools need this module's `identity_arn` for their `source_arn`, which is a **module cycle**. It is hoisted into the env root (`infra/envs/dev/dns.tf`), making the dependency a clean line: `ses → pools → policy`

**Checkpoint**: `make lint` passes. Both modules validate. Nothing has been applied.

---

## Phase 3: User Story 1 — The platform is the authority for its own namespace (P1) 🎯 MVP

**Goal**: `effyshopping.com` answers from Route 53; `dev.effyshopping.com` is a separately-managed,
delegated namespace. Independently valuable even with no endpoint attached — it converts a purchased
domain into a platform-controlled asset.

**Independent test**: `dig +short NS effyshopping.com` returns the Route 53 name-servers (not
GoDaddy's), and `dig +short NS dev.effyshopping.com` returns the **dev zone's own** name-servers.

- [X] T012 [US1] Create `infra/global/dns.tf` — the parent `aws_route53_zone` for `var.root_domain`, with a comment stating it is a **platform asset, not an environment's**, and that recreating it mints **new name-servers** requiring a manual registrar repoint (research R1)
- [X] T013 [US1] Create `infra/global/outputs.tf` — `parent_zone_id`, `parent_zone_name`, and `name_servers` (the four values the operator pastes into GoDaddy)
- [X] T014 [US1] Add `root_domain` to `infra/envs/dev/variables.tf` (default `effyshopping.com`) and `api_subdomain` (default `api`); set neither in `dev.tfvars` unless overriding
- [X] T015 [US1] Create `infra/envs/dev/dns.tf` — a `data "aws_route53_zone" "parent"` lookup **by name** (never a remote-state import — research R1) + the `dns-env-zone` module instantiation. Export `zone_id`, `zone_name`, `certificate_arn` as root outputs
- [ ] T016 🧑‍💻 [US1] **Apply the global root**: `make global-init && make global-plan` (expect exactly 1 hosted zone to add) then `make global-apply`; record the four name-servers from `make global-output`
- [ ] T017 🧑‍💻 [US1] **Repoint GoDaddy** — replace the name-servers for `effyshopping.com` with the four from T016. *The registration stays at GoDaddy; you are changing authority, not transferring.* **Then WAIT** and verify: `dig +short NS effyshopping.com` must return the Route 53 name-servers. **Do not proceed to T018 until it does** — everything downstream depends on public resolution (research R6)
- [ ] T018 🧑‍💻 [US1] **Apply the dev root** (first pass): `make plan ENV=dev` → **ABORT if any Cognito pool shows `must be replaced` / `-/+`** → `make apply ENV=dev`. This creates the dev zone, the parent's `NS` delegation, and the wildcard certificate (which blocks a few minutes while ACM validates)

**Checkpoint**: The platform owns its namespace. US2/US3 can now proceed.

---

## Phase 4: User Story 2 — The dev API on a stable, trusted, platform-owned address (P1)

**Goal**: `https://edge-api.dev.effyshopping.com` serves the shared cold-path API over a trusted
connection; the raw `execute-api` URL still works; no client config holds a provider-generated
hostname.

**Independent test**: the same authenticated request against the branded address and the raw address
returns identical responses, with no TLS warning on either.

- [X] T019 [US2] Create `infra/envs/dev/edge-domain.tf` — `aws_apigatewayv2_domain_name` for `<api_subdomain>.<zone_name>` (regional endpoint, `TLS_1_2`, the module's `certificate_arn`) + `aws_apigatewayv2_api_mapping` to `aws_apigatewayv2_api.edge` on the `$default` stage **with no mapping key** (so `/admin/v1/...` paths are preserved unchanged) + Route 53 **`A` and `AAAA` alias** records pointing at the domain's regional target
- [X] T020 [US2] In `infra/envs/dev/edge-domain.tf`, add the SSM parameter `/effy/dev/edge/api_default_endpoint` = `aws_apigatewayv2_api.edge.api_endpoint` (the raw URL — the published fallback that makes the cutover additive; contract §2)
- [X] T021 [US2] Edit `infra/envs/dev/edge-gateway.tf` — change the **value** of the existing `/effy/dev/edge/api_endpoint` parameter to `https://<the custom domain>`. **Do not rename the key** (a rename is a breaking change to the 001 contract; changing the value hands every existing reader the branded address for free — R4). Add a comment on `aws_apigatewayv2_api.edge` stating that **`disable_execute_api_endpoint` MUST remain `false`** — setting it true silently kills the raw URL and violates FR-011/SC-004
- [ ] T022 🧑‍💻 [US2] Re-apply dev (`make plan ENV=dev` → review → `make apply ENV=dev`) to create the custom domain, the aliases, and the two SSM values
- [X] T023 [P] [US2] Create `scripts/dns-verify.sh` — asserts in one run: parent NS delegated to Route 53 (SC-001); `dev.` NS delegated to its own zone (SC-001); `api.dev…` resolves and serves over TLS with a valid chain (SC-002); **the raw `execute-api` URL still answers** (SC-004); and both return the same status for the same request. Fail loudly with a diagnostic per assertion; `shellcheck`-clean
- [X] T024 [US2] Add `make dns-verify ENV=dev` to the `Makefile`, wired to `scripts/dns-verify.sh`, reading both addresses from the SSM contract (never hard-coded)
- [ ] T025 🧑‍💻 [US2] Re-read `VITE_API_BASE_URL` from `/effy/dev/edge/api_endpoint` into `apps/back-office/.env` and `apps/shop-web/.env` (**SC-003** — zero provider-generated hostnames left in client config). Then `make bo-dev` / `make shop-dev` and confirm sign-in and an authorized read still work. **No CORS change is needed** and none should be made — CORS keys on the caller's origin (still `localhost`), not the target host (research **R7**)

**Checkpoint**: The API is on its branded address; the old one still works; the consoles are on the contract.

---

## Phase 5: User Story 3 — Sign-in email comes from the platform (P2)

**Goal**: OTP mail arrives from `no-reply@dev.effyshopping.com`, passes DKIM/SPF/DMARC, and is no
longer capped by Cognito's ~50/day built-in sender.

**Independent test**: request an OTP on any surface; the mail arrives from the branded sender, passes
the receiving system's domain-authorization checks, and lands in the inbox rather than spam.

- [ ] T026 🧑‍💻 [US3] **File the SES production-access request FIRST** (AWS Console → SES → Account dashboard). It takes **~24h**; filing it now means it lands before you need it. Until granted you are in the **sandbox**: 200/day, 1/sec, **verified recipients only** — enough to prove the mechanism (and already past Cognito's ~50/day, so **SC-011 is met on the sandbox alone**), but SC-010 on a real consumer inbox needs either production access or a verified test recipient
- [X] T027 [US3] Extend `infra/envs/dev/dns.tf` — instantiate `ses-domain-identity` for the env's own namespace (`dev.effyshopping.com`, **never the apex** — dev's sending reputation must stay contained; FR-018/SC-014). Also add, **in the root** (cycle-break, see T011), the `aws_ses_identity_policy` + `aws_iam_policy_document` letting `cognito-idp.amazonaws.com` send through the identity, conditioned on `aws:SourceAccount` and the four pool ARNs
- [X] T028 [US3] Wire the pools' sender via a `locals.pool_email_configuration` in `infra/envs/dev/dns.tf` (`DEVELOPER` + `source_arn = module.ses.identity_arn` + `from_email_address = module.ses.from_address`), point all four `auth-*.tf` at it, and keep `var.email_configuration` (`COGNITO_DEFAULT`) as the fallback branch. **No `reply_to_email_address`** — the platform cannot receive mail, and an address that bounces replies is worse than none (FR-022). *The `cognito-user-pool` module already accepts all four fields — no module change (research R5).*
- [X] T028a [US3] **Discovered in implementation** — add `var.ses_sender_enabled` (default `false`) to `infra/envs/dev/variables.tf` + `dev.tfvars`, selecting between the two branches of `locals.pool_email_configuration`. **Cognito REJECTS a `source_arn` whose SES identity is not yet VERIFIED**, and verification is asynchronous (AWS polls for the DKIM records *after* the apply that creates them returns). A single-apply design therefore fails, and fails confusingly — the Cognito error names the identity, not the DNS records that have not propagated. The flag makes the gate **explicit**, exactly as the registrar repoint does for ACM. Folded back into [research.md](./research.md) R5 and [quickstart.md](./quickstart.md) step 5
- [ ] T029 🧑‍💻 [US3] **Stage 1 apply** (flag `false`): creates the SES identity + DKIM/SPF/DMARC records; the pools stay on the built-in sender. Then `make mail-verify ENV=dev` until it reports **verified** (minutes). **Stage 2**: set `ses_sender_enabled = true` in `dev.tfvars` → `make plan ENV=dev` → **⚠ ABORT IF ANY COGNITO POOL SHOWS `must be replaced` / `-/+`** — a replaced pool destroys every account in it, including the 006 first admin and the shop users 009 just provisioned → `make apply ENV=dev`. The four pools switch sender **in place**
- [X] T030 [P] [US3] Create `scripts/mail-verify.sh` — asserts the 3 DKIM `CNAME`s, the MAIL FROM `MX`, the SPF `TXT`, and the `_dmarc` `TXT` all resolve, and that the SES identity reports **verified** and DKIM **SUCCESS**. `shellcheck`-clean
- [X] T031 [US3] Add `make mail-verify ENV=dev` to the `Makefile`, wired to `scripts/mail-verify.sh`
- [ ] T032 🧑‍💻 [US3] Request an OTP on `:5173` or `:5174` and confirm the mail arrives **from `no-reply@dev.effyshopping.com`**, passes DKIM + SPF, and lands in the **inbox, not spam** (SC-010). In the sandbox this requires a verified recipient

**Checkpoint**: Sign-in email is the platform's own, on all four pools, past the old ceiling.

---

## Phase 6: User Story 4 — A new environment is a repetition, not a redesign (P3)

**Goal**: qa/staging/prod are a variable, not a design. Proven without applying anything.

**Independent test**: instantiate the module with `env = "qa"` and `terraform plan` — it plans clean,
with no structural change and no edit to the dev namespace.

- [ ] T033 [US4] Prove FR-007 by **plan only**: copy `dns.tf` into `infra/envs/qa/`, run `make plan ENV=qa`, and confirm it plans a complete qa namespace (zone + delegation + certificate) with **zero** structural change to any module and **zero** diff to dev's resources. **Do not apply.** Record the outcome in this file, then revert the qa file (qa is not being stood up in this slice)
- [ ] T034 [US4] Prove FR-005 by **plan only**: `cd infra/envs/dev && terraform plan -destroy` and confirm the parent's `NS` delegation record is destroyed **together with** the child zone — no dangling delegation (**SC-008**). **Do not apply.** Record the outcome

---

## Phase 7: Polish & Cross-Cutting

- [X] T035 [P] Add the two alarms to `infra/envs/dev/dns.tf` (research **R9**, Principle VII): **ACM `DaysToExpiry < 30`** — renewal is automatic *only while the validation record still resolves*; delete it and renewal fails **silently** until the endpoint goes untrusted, so this alarm is what makes SC-006's "zero human actions" claim safe to rely on — and **SES bounce > 5% / complaint > 0.1%** — breaching AWS's thresholds **pauses sending**, which on a platform whose only credential is an emailed code means **nobody on any of the four audiences can sign in at all**
- [X] T036 [P] Update `infra/envs/README.md`: (a) the **4th region-pinned value outside Terraform** — a CloudFront/Amplify-fronted name needs a **`us-east-1`** certificate and its provider alias, while the regional API Gateway domain needs an `ap-southeast-2` one (research **R2**); (b) the **GoDaddy registrar dependency** (FR-024) — Terraform can rebuild every zone and record but cannot recover the domain; (c) the **two-apply ordering** with the registrar repoint as a hard gate; (d) `infra/global/` — what it is, why it is not an environment, and why destroying it requires a manual repoint to recover
- [X] T037 [P] Update `CLAUDE.md` — the Decisions-locked region note gains the `us-east-1` certificate as a fourth hand-maintained region-pinned value; add 010 to the Active-feature / status section
- [X] T038 [P] Update `README.md` — the `EDGE_URL` example (line ~115) now yields the branded address automatically (it reads `/effy/dev/edge/api_endpoint`); note `api_default_endpoint` as the raw fallback
- [X] T039 Full code-verifiable gate: `make lint` (fmt-check + validate **every** root incl. `infra/global` + tflint + trivy) and `shellcheck scripts/dns-verify.sh scripts/mail-verify.sh` — all green. Secret/PII sweep: **no** registrar credentials, no AWS keys committed
- [ ] T040 🧑‍💻 Live acceptance sign-off — run the [quickstart.md](./quickstart.md) table: SC-001…SC-014. Confirm the cost delta is ≈ **$1.00/mo** (2 hosted zones; SC-012's bar is $5)
- [ ] T041 🧑‍💻 Commit the slice (spec/plan/tasks alongside the code, per the constitution's Quality Gates)

---

## Dependencies

```
Phase 1 (Setup: the global root + Makefile)
        ↓
Phase 2 (Foundational: the two modules)   ← BLOCKS EVERYTHING
        ↓
Phase 3 — US1 (namespace authority)  🎯 MVP
        ↓  ⚠ T017 (GoDaddy) is a HARD GATE — public resolution is required by
        ↓     ACM validation (US2) and SES DKIM (US3). Nothing routes around it.
        ├─────────────────────┬──────────────────────┐
        ↓                     ↓                      ↓
Phase 4 — US2 (API address)   Phase 5 — US3 (email)  Phase 6 — US4 (repeatability,
   depends on the cert          depends on the zone      plan-only, no apply)
   from US1                     from US1
        └─────────────────────┴──────────────────────┘
                              ↓
                    Phase 7 (Polish)
```

**US2 and US3 are independent of each other** — both need only US1's zone. Once the registrar
repoint (T017) has propagated, they can be built in parallel; they touch different files
(`edge-domain.tf` vs the SES module + tfvars) and are applied in the same `make apply ENV=dev`.

**US4 applies nothing.** It is two `terraform plan` proofs — that a new environment is a variable
(SC-007) and that teardown leaves no dangling delegation (SC-008).

## Parallel opportunities

- **Phase 1**: T002, T003, T004, T005 — four independent new files
- **Phase 2**: T007, T009, T010 (variables/outputs) run parallel to each other; T008 and T011 are the
  substantive `main.tf` bodies
- **Phase 4/5**: T023 (`dns-verify.sh`) and T030 (`mail-verify.sh`) are independent scripts
- **Phase 7**: T035–T038 all touch different files

## Implementation strategy

**MVP = Phase 1 + 2 + 3 (US1).** That alone converts a parked GoDaddy domain into a
platform-controlled, delegated namespace — genuinely valuable even before a single endpoint moves
onto it, and it is the prerequisite for everything else.

**Then US2** (the API address — the visible payoff, and it removes a live fragility: a hard-coded
provider hostname that silently changes if the resource is recreated, as it did during the region
relocation).

**Then US3** (branded email — the largest *functional* payoff, lifting a hard ceiling on the only
credential the platform issues). **T026 (the SES production-access request) should be filed on day
one regardless of where US3 sits in the order** — it has a ~24h external lead time and nothing else
blocks on it.

**US4 last**, as two cheap plan-only proofs that the pattern generalizes.
