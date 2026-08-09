# Sign-off: 042-customer-web-cicd — Customer Storefront Continuous Deployment (dev)

**Status**: ✅ **DEPLOYED & LIVE in dev** — `https://dev.effyshopping.com` serves the storefront over
a valid cert; the app auto-builds from the `dev` branch. Terraform-managed. Commit pending. Date:
2026-08-10.

## Live outcome

- **App**: `effy-dev-customer-web` (Amplify, `WEB_COMPUTE`), **Terraform-managed** via
  `infra/modules/amplify-web-app`, connected to `github.com/effi-softwares/effy` branch `dev`,
  monorepo-scoped to `apps/customer-web`. Auto-builds on push.
- **Domain**: `dev.effyshopping.com` (apex + `www`) live over **HTTPS** (ACM cert auto-issued in
  `us-east-1`; Route53 records auto-managed by Amplify in-account). The apex→gateway alias records
  (037) were removed in the cutover apply with no resolution gap.
- **Config**: env vars wired from Terraform refs + SSM (Cognito ids, URLs, Stripe publishable key);
  `/effy/dev/web/site_url` published; **edge-customer redeployed** so the newsletter confirm link uses
  the live URL (039 item closed).

## ⚠ Hard-won lessons (READ before prod bring-up)

1. **AWS profile**: every hand-run `aws`/`terraform` command must use `AWS_PROFILE=ef` (account
   `724289623101`). The default profile is a different account — SSM params written without the profile
   went to the wrong account and the plan couldn't find them.
2. **SSR service role must exist at `CreateApp` time.** "Unable to assume specified IAM Role" was NOT a
   trust/permission or Terraform-vs-console problem — it was that the role was *added to an existing
   app*. Amplify only registers the role association at create time. **Recreate the app if the service
   role must change; never bolt it on.** Deleting + recreating the app fresh (with the role) fixed it.
3. **`amplify.yml` gate order**: `build` must precede `size` (bundle-budget reads build output).
4. **The Terraform domain association works** — Amplify auto-manages the in-account Route53 records;
   no console step or manual record wiring was needed.
5. **Never remove the `module` block and apply casually** — doing so destroyed the working app once.

## Machine verification (Terraform)

- ✅ `terraform validate` (module) · `terraform fmt -recursive infra/` clean.
- ✅ `amplify.yml` single-application invariant.

## Open (operator)

- **T035 — commit** the slice's infra changes (module, `amplify-customer-web.tf`, `variables.tf`,
  `dev.tfvars`, `edge-domain.tf` apex gating, docs). ⚠ `amplify.yml` + `.npmrc` are already on `dev`.
- **SC walk** not yet formally done: SC-004 (a `back-office`-only push exposes no console — inherently
  true, own app), SC-005 (failed-gate keeps last good version — Amplify-native), SC-007 (no secret in
  the browser bundle sweep). SC-001/002/003/006/009 effectively demonstrated by the live deploy.
- **Cleanup (optional)**: the now-unused `amplify_service_role_arn` / `stripe_publishable_key_ssm`
  variables can be pruned; the `amplify-web-app` module still creates its own service role (works —
  fresh create), so no change needed there.

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
