# Sign-off: 042-customer-web-cicd — Customer Storefront Continuous Deployment (dev)

**Status**: 🚧 Code-complete + machine-verified (what can be, without AWS). Operator applies + live
walk PENDING. Not deployed. Not committed. Date: 2026-08-09.

## What was built (Claude-authored)

- **Repo-root `amplify.yml`** — monorepo build spec declaring **exactly one** application
  (`apps/customer-web`), `buildPath: '/'`, corepack+pnpm preBuild, gates `typecheck→test→size→build`,
  artifacts `apps/customer-web/.next`. The single-application declaration is the mechanical guarantee
  only the storefront deploys (FR-006/FR-008/FR-021).
- **Repo-root `.npmrc`** — `node-linker=hoisted` (Amplify pnpm/Turborepo requirement).
- **`infra/modules/amplify-web-app/`** — reusable module: `aws_amplify_app` (`WEB_COMPUTE`,
  Git-connected, monorepo env var), `aws_amplify_branch` (auto-build), optional
  `aws_amplify_domain_association` (apex + `www`). Every env value is a variable (FR-018/FR-019).
- **`infra/envs/dev/amplify-customer-web.tf`** — instantiates the module; wires env vars from
  Terraform refs (Cognito ids, URLs) + operator SSM (GitHub token, Stripe publishable key); publishes
  `/effy/dev/web/site_url`; routes Amplify build FAILED → the existing alerts SNS topic (with a topic
  policy that preserves 037's alarm delivery).
- **`infra/envs/dev/edge-domain.tf`** — apex alias records gated on `amplify_domain_enabled` so the
  storefront takes over the apex at cutover with no resolution gap (FR-011/FR-012/SC-009).
- **Variables** (`variables.tf` + `dev.tfvars`): `amplify_repository_url`, `amplify_deploy_branch`,
  `stripe_publishable_key_ssm`, `amplify_domain_enabled` (two-stage cutover flag, default false).
- **Docs**: `.env.example` (deployed values reference + REVALIDATE_SECRET clarified/deferred),
  `infra/envs/README.md` (prod bring-up), `docs/audiences/customer-capabilities.md` §042, `CLAUDE.md`.

## Machine verification (done)

- ✅ `terraform validate` on `infra/modules/amplify-web-app/` → **Success! The configuration is valid.**
- ✅ `terraform fmt -check -recursive infra/` → clean (all formatted).
- ✅ `amplify.yml` parses; single-application invariant asserted (apps == 1, appRoot `apps/customer-web`).
- ⚠ Env-root `terraform validate` NOT run — it needs S3 remote-state access (403 without operator AWS
  creds). Expected per the mode of work; the module (the bulk of new HCL) is validated in isolation.

## Implementation decisions recorded (see research.md "Implementation amendments")

- **D6 flipped to Amplify-managed Route53 records** (apex ALIAS not cleanly derivable in TF; avoids
  verification deadlock; Amplify natively manages in-account zone records). Documented drift: the
  domain's records are not in Terraform state.
- **Apex reconciliation gated (`count`), not deleted** — no window where the apex stops resolving.
- **`EDGE_API_BASE_URL` → `edge-api.<zone>`** (the cold-path subdomain default), corrected from the
  plan's shorthand.

## Open — OPERATOR (⚠OP tasks in tasks.md)

- **T003** — ⚠ whole-monorepo re-verify under `node-linker=hoisted` (clean `pnpm install` +
  `pnpm -r typecheck`/`test` + all web builds). NOT run here (destructive to `node_modules`). Do this
  before trusting the build.
- **T014–T016** (US1) — supply GitHub token to SSM, `make apply ENV=dev` (stage A), verify auto-build
  + failure safety (SC-001/SC-002/SC-005).
- **T021–T022** (US2) — ⚠ highest risk: cutover apply (`amplify_domain_enabled = true`), verify apex
  resolves to Amplify + valid cert + `www` redirect + `api.`/`core-api.` unchanged (SC-003/SC-009).
- **T024** (US3) — prove a `back-office`-only push exposes no console; a shared-pkg push rebuilds
  customer-web (SC-004).
- **T028–T029** (US5) — `make edge-deploy SERVICE=customer` (newsletter site URL), verify catalogue
  from core-api + canonical URLs + no secret in the bundle (SC-006/SC-007).
- **T035** — commit once the live walk passes.

## Carry-forwards (deliberate scope boundaries)

- Playwright e2e in a dedicated CI (kept out of the hosting build).
- `REVALIDATE_SECRET` / `/api/revalidate` — deferred to the unbuilt "home composer" feature.
- PostHog initialisation on customer-web — a pre-existing 039 gap, not opened here.
- Per-PR preview environments — out of scope; addable without changing the pipeline shape.

## SC status

All SC-001..SC-009 are **operator-verifiable only** (they require a live deploy). None are asserted
green here; the quickstart §5 table is the walk.
