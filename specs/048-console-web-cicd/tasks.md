---
description: "Task list — 048 Internal Console Continuous Deployment (Shop-Web & Back-Office, dev)"
---

# Tasks: Internal Console Continuous Deployment (Shop-Web & Back-Office, dev)

**Input**: Design documents from `/specs/048-console-web-cicd/`

**Prerequisites**: plan.md, spec.md, research.md (D1–D12), data-model.md (E1–E7),
contracts/{amplify-build,config}.contract.md, quickstart.md

**Tests**: No automated test tasks are added — this is an infra/deploy slice. "Tests" here are the
consoles' own existing gates run **inside** the Amplify build (typecheck/vitest) plus Terraform
`validate`/`fmt` and the operator SC walk. No new unit suite is requested by the spec.

**Organization**: grouped by user story (US1–US6 from spec.md), in priority order.

## Format: `[ID] [P?] [Story] Description`
- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1..US6; Setup/Foundational/Polish carry no story label

## Path conventions
Repo root `/Users/janith/Projects/effy`. Infra under `infra/`; consoles under `apps/{shop-web,back-office}`.

---

## Phase 1: Setup (repo-root build spec) — shared, blocks the pipeline

- [X] T001 Edit `amplify.yml` (repo root): update the header comment from 042's "EXACTLY ONE application"
  to the per-app-root selection rule (each Amplify app builds only the `applications[]` entry matching
  its own `AMPLIFY_MONOREPO_APP_ROOT`), per `contracts/amplify-build.contract.md` § "Corrected invariant".
  Leave the existing `apps/customer-web` entry byte-unchanged (FR-008/SC-010).
- [X] T002 Edit `amplify.yml`: append the `apps/shop-web` `applications[]` entry — `buildPath: '/'`;
  preBuild `corepack enable` / `corepack prepare pnpm@10.28.2 --activate` / `pnpm install --frozen-lockfile`;
  build `pnpm --filter @effy/shop-web typecheck` → `test` → `build` (NO `size` step);
  `artifacts.baseDirectory: apps/shop-web/dist`; cache `node_modules/**/*`. Exact shape per the contract.
- [X] T003 Edit `amplify.yml`: append the `apps/back-office` `applications[]` entry — same shape as T002
  with `@effy/back-office` and `artifacts.baseDirectory: apps/back-office/dist`.
- [X] T004 Confirm the repo-root `.npmrc` already contains `node-linker=hoisted` (added by 042); no edit
  if present. Do NOT re-add or duplicate. (Contract § `.npmrc`.)

**Checkpoint**: `amplify.yml` declares three applications; each is self-contained and gate-ordered.

---

## Phase 2: Foundational (generalise the reusable module) — BLOCKS all stories

⚠ Every new module variable is DEFAULTED to its 042 value so the customer-web app's resources stay
byte-identical (SC-010). Verify with `terraform plan` on `infra/envs/dev` showing **no change** to
`module.amplify_customer_web` after these edits.

- [X] T005 Edit `infra/modules/amplify-web-app/variables.tf`: add `platform` (string, default
  `"WEB_COMPUTE"`), `subdomain_prefix` (string, default `""`), and `custom_rules`
  (`list(object({source=string, target=string, status=string}))`, default `[]`). Document each per
  `contracts/config.contract.md` § "New module variables".
- [X] T006 Edit `infra/modules/amplify-web-app/main.tf`: set `aws_amplify_app.this.platform = var.platform`
  (was the literal `"WEB_COMPUTE"`).
- [X] T007 Edit `infra/modules/amplify-web-app/main.tf`: make the SSR service role conditional on
  `var.platform == "WEB_COMPUTE"`. When platform is `"WEB"` (static): create NO `aws_iam_role.amplify`
  / policy and set `iam_service_role_arn = null` on the app. Guard `local.service_role_arn` so the
  `count`-ed role reference is not evaluated for static. (research D2.)
- [X] T008 Edit `infra/modules/amplify-web-app/main.tf`: add a `dynamic "custom_rule"` block on
  `aws_amplify_app.this` iterating `var.custom_rules` (source/target/status) — the SPA rewrite carrier
  (research D3, FR-011).
- [X] T009 Edit `infra/modules/amplify-web-app/main.tf`: replace the hard-coded apex `prefix = ""` in the
  domain association's first `sub_domain` with `prefix = var.subdomain_prefix`. Keep `enable_www` behaviour
  as-is (consoles will pass `enable_www = false`). (research D4, FR-010/FR-012.)
- [X] T010 [P] Edit `infra/modules/amplify-web-app/outputs.tf`: the existing `storefront_url` already
  resolves from `domain_name`; confirm it returns the subdomain form when `subdomain_prefix` is set
  (adjust to `https://${var.subdomain_prefix != "" ? "${var.subdomain_prefix}." : ""}${var.domain_name}`
  if needed) so the console apps report a correct URL. Add no breaking rename.
- [X] T011 Run `terraform -chdir=infra/envs/dev validate` and `fmt`, and `terraform plan` (operator) to
  confirm **zero diff** on `module.amplify_customer_web` (SC-010 guard). Author-side: `validate`/`fmt` only.

**Checkpoint**: the one module now serves both SSR (default) and static-SPA-on-subdomain (consoles),
with 042 provably unchanged.

---

## Phase 3: User Story 1 — Each console redeploys automatically on a dev-branch push (Priority: P1) 🎯 MVP

**Goal**: merge to `dev` → each affected console rebuilds and serves on the Amplify default hostname.
**Independent test**: merge a label tweak touching `shop-web`; its build auto-starts, gates run, and the
change is live on `…​.amplifyapp.com` with no manual deploy. Repeat for back-office.

- [X] T012 [US1] Create `infra/envs/dev/amplify-consoles.tf`: read the reused GitHub token via
  `data "aws_ssm_parameter" "amplify_github_token"` if not already in scope (042 declares one in
  `amplify-customer-web.tf` — reference it or add a distinct data source name to avoid a duplicate).
- [X] T013 [US1] In `amplify-consoles.tf`: define `locals` for the deployed edge origin
  (`https://${var.api_subdomain}.${module.dns.zone_name}`) and the two `VITE_*` env maps per
  `contracts/config.contract.md` — shop-web from `module.shop_pool.{user_pool_id,app_client_id}`,
  back-office from `module.back_office_pool.{user_pool_id,app_client_id}`.
- [X] T014 [US1] In `amplify-consoles.tf`: instantiate `module "amplify_shop_web"` from
  `../../modules/amplify-web-app` — `name = "${module.shared.name_prefix}-shop-web"`, `platform = "WEB"`,
  `app_root = "apps/shop-web"`, `framework = "Web"`, `deploy_branch = var.amplify_deploy_branch`,
  `repository_url = var.amplify_repository_url`, `access_token = <token>`, `env_vars = <shop map>`,
  `custom_rules = [<SPA rewrite>]`, `enable_www = false`, `domain_name = ""` (domain added in US2),
  `service_role_arn = ""` (unused for static).
- [X] T015 [US1] In `amplify-consoles.tf`: instantiate `module "amplify_back_office"` the same way with
  `apps/back-office`, `${name_prefix}-back-office`, and the back-office `env_vars`.
- [X] T016 [US1] Add outputs `shop_web_app_id`, `back_office_app_id`, `shop_web_url`, `back_office_url`
  in `amplify-consoles.tf` (per config contract § Outputs).
- [X] T017 [US1] `terraform validate`/`fmt` on `infra/envs/dev`. **Operator (quickstart §1)**: stage-A
  `terraform apply`, then push a change and confirm each console builds green on its Amplify hostname
  (SC-001), gates ran (SC-006 half), merge-to-live < 15 min (SC-002).

**Checkpoint**: MVP — two consoles auto-deploy on `dev` push, on Amplify hostnames.

---

## Phase 4: User Story 2 — Served at internal subdomains over HTTPS with working deep links (Priority: P1)

**Goal**: `shop.dev.effyshopping.com` / `back-office.dev.effyshopping.com` over valid TLS; SPA deep-link
refresh loads the view, not a 404. **Independent test**: visit each subdomain over HTTPS; refresh a deep
route; both work; neither resolves to the other or the storefront.

- [X] T018 [US2] Add `amplify_consoles_domain_enabled` (bool, default `false`), `shop_web_subdomain`
  (default `"shop"`), `back_office_subdomain` (default `"back-office"`) to `infra/envs/dev/variables.tf`
  (config contract § New env-root variables).
- [X] T019 [US2] In `amplify-consoles.tf`: wire each module's `domain_name = var.amplify_consoles_domain_enabled ? module.dns.zone_name : ""`
  and `subdomain_prefix = var.shop_web_subdomain` / `var.back_office_subdomain` (two-stage cutover,
  research D4). `enable_www = false` for both.
- [X] T020 [US2] Define the SPA rewrite rule once as a `local` in `amplify-consoles.tf`
  (`source`/`target=/index.html`/`status="200"`, exact regex from `contracts/amplify-build.contract.md`
  § "SPA rewrite") and pass it as `custom_rules` to both modules (referenced from T014/T015).
- [X] T021 [US2] `terraform validate`/`fmt`. **Operator (quickstart §2)**: set
  `amplify_consoles_domain_enabled = true`, `apply`; Amplify creates+verifies the two Route 53 records +
  `us-east-1` certs. Confirm SC-003 (each subdomain serves its own console over valid TLS; no cross-resolve;
  apex/`api.` untouched).
- [ ] T022 [US2] **Operator (quickstart §3)**: on each live console, load a deep route and **refresh** /
  open in a fresh tab → the view loads via the 200 rewrite, not a host 404 (SC-004).

**Checkpoint**: consoles live on their branded subdomains with correct SPA routing.

---

## Phase 5: User Story 3 — Each app builds only its own surface; storefront untouched (Priority: P1)

**Goal**: shop-web app builds only `apps/shop-web`, back-office only `apps/back-office`, customer-web
unchanged. **Independent test**: push touching only one console → only it redeploys; push touching a
shared package → each dependent console rebuilds; customer-web pipeline unchanged.

- [X] T023 [US3] Verify (author, by inspection) that each `applications[]` entry's `appRoot` equals its
  app's `AMPLIFY_MONOREPO_APP_ROOT` (the module derives it from `app_root`, so T014/T015 guarantee this).
  Record the FR-006/FR-009 mechanical guarantee in a comment in `amplify-consoles.tf`.
- [ ] T024 [US3] **Operator (quickstart §1)**: push a change touching ONLY `apps/shop-web`; confirm the
  back-office and customer-web apps produce **no** new deploy, and no other surface appears at
  `shop.dev.effyshopping.com` (SC-005). Then push a shared-package change and confirm each dependent
  console rebuilds successfully (FR-007).
- [ ] T025 [US3] **Operator**: confirm the customer-web app still builds only `apps/customer-web` and still
  serves `dev.effyshopping.com` unchanged after this slice's apply (SC-010) — cross-checks T011's plan-diff.

**Checkpoint**: monorepo isolation proven live; storefront demonstrably unaffected.

---

## Phase 6: User Story 4 — Internal consoles are not publicly discoverable (Priority: P2)

**Goal**: `noindex` + robots-disallowed; unauthenticated visit hits the Cognito gate only.
**Independent test**: robots directive disallows indexing; an unauthenticated visitor reaches sign-in and
can do nothing privileged.

- [X] T026 [P] [US4] Edit `apps/shop-web/index.html`: add `<meta name="robots" content="noindex, nofollow">`
  in `<head>` (research D10, FR-013).
- [X] T027 [P] [US4] Create `apps/shop-web/public/robots.txt` with `User-agent: *` / `Disallow: /`.
- [X] T028 [P] [US4] Edit `apps/back-office/index.html`: add the same `robots` meta tag.
- [X] T029 [P] [US4] Create `apps/back-office/public/robots.txt` with the same disallow-all content.
- [ ] T030 [US4] **Operator (quickstart §3)**: fetch `/robots.txt` on each console (→ `Disallow: /`),
  view-source shows the meta tag, and an unauthenticated visit lands on the Cognito login exposing no
  privileged read/action (SC-008 / FR-014). Confirms the Cognito-only access posture (no basic-auth gate).

**Checkpoint**: consoles present but not discoverable; login-gated as designed.

---

## Phase 7: User Story 5 — Correct backend, pool, and CORS (Priority: P2)

**Goal**: each console reaches the deployed gateway on its own namespace, authenticates against the
correct pool, browser calls pass CORS, no secret in either bundle. **Independent test**: sign in on each
live console (correct pool), load a data-backed view; call succeeds; bundle sweep is clean.

- [X] T031 [US5] Edit `infra/envs/dev/edge-gateway.tf`: change `cors_configuration.allow_origins` to
  `concat([existing localhost origins], [https://${var.shop_web_subdomain}.${module.dns.zone_name},
  https://${var.back_office_subdomain}.${module.dns.zone_name}])` — config-derived, existing origins
  preserved (research D9, FR-017/FR-020). Leave methods/headers/expose/max_age unchanged.
- [X] T032 [P] [US5] Edit `apps/shop-web/.env.example` and `apps/back-office/.env.example` (docs): record
  the deployed dev values as the reference (pool ids, gateway origin), noting they are build-time
  `VITE_*` and public-safe. No real secrets committed.
- [X] T033 [US5] `terraform validate`/`fmt`. **Operator (quickstart §3)**: `apply` the CORS change, then
  sign in on each console with a valid staff account for its pool (EMAIL_OTP) and load a data-backed view
  — 0 CORS pre-flight failures, 0 wrong-pool 401s (SC-007). Confirms D11 (no callback-URL registration
  needed) live.
- [ ] T034 [US5] **Operator (quickstart §3)**: sweep each deployed bundle (`apps/*/dist` or deployed
  assets) for secrets — only pool ids / client ids / gateway URL present (SC-008 / FR-018).

**Checkpoint**: both consoles are functional against the deployed backend, isolation intact, no secret shipped.

---

## Phase 8: User Story 6 — Production by configuration, not rework (Priority: P2)

**Goal**: prod is a second instantiation with prod values; 0 pipeline-logic edits. **Independent test**:
review confirms every env value is a parameter/ref.

- [X] T035 [US6] Review `infra/modules/amplify-web-app` and `infra/envs/dev/amplify-consoles.tf`: confirm
  the subdomains, branch, gateway origin, pool ids, and account/region are all vars/refs with no
  `dev`-specific literal in module logic (SC-009 / FR-020/FR-021). Fix any literal that slipped in.
- [X] T036 [US6] Add a short "prod bring-up" note to `quickstart.md` §4 confirming the prod path is a
  second instantiation in `infra/envs/prod/` (`shop.effyshopping.com` / `back-office.effyshopping.com`,
  prod branch, prod pools) with no module change. (Design proof only; not run.)

**Checkpoint**: prod-readiness recorded and reviewable.

---

## Phase 9: Observability & Polish

- [X] T037 In `amplify-consoles.tf`: add one `aws_cloudwatch_event_rule` matching `source aws.amplify`,
  `detail-type "Amplify Deployment Status Change"`, `detail.jobStatus ["FAILED"]`, and
  `detail.appId [module.amplify_shop_web.app_id, module.amplify_back_office.app_id]`, plus an
  `aws_cloudwatch_event_target` to `aws_sns_topic.alerts` (research D12, FR-023). Reuse 042's existing SNS
  topic policy — do NOT add a second policy resource.
- [X] T038 [P] `terraform validate`/`fmt` clean on `infra/envs/dev` and the module; confirm the full
  workspace still installs/builds with the hoisted linker (`pnpm -r typecheck` locally — .npmrc unchanged).
- [ ] T039 **Operator (quickstart §1)**: prove SC-006 fully — push a deliberate type error into one
  console, confirm its build FAILS, its last good version stays live, the OTHER console + storefront are
  unaffected, and the FAILED alert reaches the alerts topic; then revert.
- [X] T040 Update the shop parity register `docs/audiences/shop-capabilities.md` (and note back-office
  deploy status wherever 005/042 deployment status is tracked) with the §048 deployment. Author-side doc.
- [X] T041 **Operator**: commit all changes (Claude does not commit). No migration → 003 commit-guard N/A.

---

## Dependencies & completion order

- **Phase 1 (Setup)** and **Phase 2 (Foundational)** are strict prerequisites for every user story.
- **US1 (Phase 3)** = MVP; depends only on Phases 1–2 (deploys on Amplify hostnames).
- **US2 (Phase 4)** depends on US1 (apps+branches must exist to attach subdomains). Lower risk than 042 —
  no apex/email cutover.
- **US3 (Phase 5)** is satisfied structurally by Phase 1's per-app-root `amplify.yml`; its tasks are live
  verification + a guarantee comment. Can verify after US1.
- **US4 (Phase 6)** source edits (T026–T029) are independent of infra and can run anytime; live check after US2.
- **US5 (Phase 7)** CORS edit depends on the subdomain vars (T018); live check best after US2.
- **US6 (Phase 8)** is a review/doc pass; anytime after Phase 2.
- **Phase 9** last (T037 depends on the app ids from T014/T015).

### Parallel opportunities
- Phase 1: **T002, T003** in parallel (distinct `applications[]` entries); T004 independent.
- Phase 2: **T005** first; **T006–T009** touch `main.tf` (sequence to avoid edit conflicts); **T010** [P].
- Phase 6: **T026, T027, T028, T029** all [P] (four distinct files).
- Phase 7: **T032** [P] with T031.

### MVP scope
**Phases 1–3 (through US1)** = a working merge-to-live pipeline for both consoles on Amplify hostnames.
Adding **US2 (Phase 4)** puts them on `shop.dev…` / `back-office.dev…` — together the user's core ask.

## Notes
- No database, no migration, no new backend service. Author edits Terraform/build/source; the **operator**
  runs every `apply` and cloud step and the final commit (constitution mode of work).
- The single biggest simplification vs 042: static `WEB` platform → **no SSR service role**, so none of
  042's "Unable to assume IAM role at CreateApp" recovery applies here.
- Confirm-don't-assume item (D11): the Cognito EMAIL_OTP sign-in on the new subdomains is verified live in
  T033, not presumed.
