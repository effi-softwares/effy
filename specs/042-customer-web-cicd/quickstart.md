# Quickstart / Operator Runbook: Customer Storefront CI/CD (dev)

Feature: 042-customer-web-cicd · Environment: dev · Domain: `dev.effyshopping.com`

This is the validation + operator runbook. Claude authors the Terraform, `amplify.yml`, and `.npmrc`;
**you** run every cloud-mutating step below (constitution: mode of work). Commands assume repo root
and `ENV=dev`.

---

## 0. Prerequisites (out-of-code, operator-owned)

1. **Git connection** — choose ONE:
   - *Preferred*: install the **AWS Amplify GitHub App** on `github.com/effi-softwares/effy`
     (grants Amplify read + webhook access; longest-lived).
   - *Or*: mint a **fine-grained GitHub PAT** with read on the repo (contents + webhooks).
   Store the resulting token:
   ```bash
   aws ssm put-parameter --name /effy/dev/amplify/github_access_token \
     --type SecureString --value '<TOKEN>' --overwrite
   ```
2. **Stripe test publishable key** (public, browser-safe):
   ```bash
   aws ssm put-parameter --name /effy/dev/stripe/publishable_key --type String --value 'pk_test_...'
   ```
3. **PostHog** (optional — leave unset for now; storefront hasn't initialised it, 039).
4. **Preconditions already met**: `dev.effyshopping.com` zone (010), `core-api.dev.effyshopping.com`
   live (040), `api.dev.effyshopping.com` live (010/037), customer Cognito pool (001).

---

## 1. Add the root build files (Claude-authored; verify locally BEFORE apply)

Files: repo-root `amplify.yml` (one app: `apps/customer-web`) and repo-root `.npmrc`
(`node-linker=hoisted`).

⚠ **Whole-monorepo re-verify gate** (research D4) — `.npmrc` changes install linking for every
package. From a clean tree:
```bash
rm -rf node_modules && pnpm install --frozen-lockfile
pnpm -r typecheck && pnpm -r test
pnpm --filter @effy/customer-web build           # SSR build succeeds
# spot-check the other web builds + mobile guards are unaffected:
pnpm --filter @effy/shop-web build && pnpm --filter @effy/back-office build
```
Expected: all green. If a package breaks under hoisted linking, fix before proceeding — do not weaken
another package's isolation silently.

---

## 2a. ⚠ The SSR service role (do this once, in the console)

A Next.js SSR (`WEB_COMPUTE`) app needs a service role Amplify can assume to run/log. **Amplify's build
orchestrator frequently cannot assume a Terraform-created role** — the build fails at step 0 with
`Unable to assume specified IAM Role`, even when the role's trust (`amplify.amazonaws.com`) and logs
permissions are correct. This is a known IaC limitation. The reliable path:

1. Amplify console → app `effy-dev-customer-web` → **App settings → IAM roles** (or **General →
   Service role**) → **Create and use a new service role** → save. Amplify generates a role AND
   registers it with its build service.
2. Trigger a build and confirm it gets **past step 0**:
   ```bash
   AWS_PROFILE=ef aws amplify start-job --region ap-southeast-2 \
     --app-id <APP_ID> --branch-name dev --job-type RELEASE
   ```
3. Read the ARN Amplify assigned and pin it in Terraform so IaC stops fighting it:
   ```bash
   AWS_PROFILE=ef aws amplify get-app --region ap-southeast-2 \
     --app-id <APP_ID> --query 'app.iamServiceRoleArn' --output text
   ```
   Put it in `infra/envs/dev/dev.tfvars` as `amplify_service_role_arn = "arn:aws:iam::…:role/…"`,
   then `make apply ENV=dev`. Terraform now references the working role and removes the one it had
   created. ⚠ Set the variable BEFORE re-applying — otherwise Terraform reverts the app to its own
   (unassumable) role.

Prod does the same one-time console step and pins its own ARN.

---

## 2. Apply the Amplify Terraform (stage A — app + branch, NO domain yet)

Recommended two-stage domain cutover for zero email-resolution overlap (research D6). Stage A creates
the app, connects `dev`, and triggers the first build on the Amplify default hostname:
```bash
make apply ENV=dev          # or: terraform -chdir=infra/envs/dev apply
```
⚠ On the plan, confirm **no Cognito pool shows "must be replaced"** (unrelated, but the standing rule).
Verify the first build:
- Amplify console → the app → the `dev` branch → build **SUCCEEDED**.
- Open the Amplify **default domain** (`https://<branch>.<appid>.amplifyapp.com`) → the Effy
  storefront loads, catalogue fetches from `core-api.dev.effyshopping.com`.

---

## 3. Cutover to `dev.effyshopping.com` (stage B — domain + apex reconciliation)

This apply adds the Amplify domain association (apex `""` + `www`) **and removes** the old apex alias
records (`edge-domain.tf` `zone_apex_a` / `zone_apex_aaaa`) that pointed the apex at the API gateway.
```bash
make apply ENV=dev
```
⚠ **The highest-risk step.** During/after apply verify:
```bash
# apex now resolves to Amplify (an A/ALIAS to a CloudFront target), not the API gateway
dig +short dev.effyshopping.com A
# the API subdomain is UNCHANGED
dig +short api.dev.effyshopping.com A
dig +short core-api.dev.effyshopping.com A
# storefront over a valid cert; www redirects to apex
curl -sSI https://dev.effyshopping.com | head -n1        # 200
curl -sSI https://www.dev.effyshopping.com | head -n1     # 301/308 → apex
```
- Amplify console → **Domain management** → status **Available**, cert issued.
- Sender-domain resolution preserved (SC-009): `dev.effyshopping.com` still resolves to a live valid
  endpoint (now the storefront) → email deliverability property intact.
- If domain provisioning hangs on "Creating records…", check for stale `_acm-validation` CNAMEs /
  conflicting apex records in the zone and reconcile (research D6).

---

## 4. Redeploy edge-customer so the newsletter uses the real site URL

This slice writes `/effy/dev/web/site_url = https://dev.effyshopping.com` (closes a 039 item):
```bash
make edge-deploy SERVICE=customer ENV=dev
```
Verify a newsletter double-opt-in confirm link now points at `https://dev.effyshopping.com/newsletter/confirm...`, not localhost.

---

## 5. Success-criteria walk

| SC | Check |
|---|---|
| **SC-001** | Merge a visible copy change to `dev` → a build auto-starts, succeeds, and the change is live at `https://dev.effyshopping.com` with **no** manual deploy command. |
| **SC-002** | Time the merge → build start → served: under ~15 min for a typical change. |
| **SC-003** | `https://dev.effyshopping.com` serves the storefront home over a trusted cert; storefront paths are NOT API 404s. |
| **SC-004** | Push a change touching only `apps/back-office` → **no** console content reachable at the storefront address (Amplify builds only `customer-web`). |
| **SC-005** | Introduce a deliberate type error on a branch build → build **FAILS**, previous version stays live, failure + logs visible in history. Revert. |
| **SC-006** | On the live site: catalogue loads from `core-api.dev.effyshopping.com`; view-source / a canonical link uses `https://dev.effyshopping.com` (no `localhost`). |
| **SC-007** | Inspect deployed browser assets: no server-only secret present (only `NEXT_PUBLIC_*` public values). |
| **SC-008** | Review the module: producing prod = instantiate in `infra/envs/prod/` with `deploy_branch`, `domain_name=effyshopping.com`, prod refs — **0** pipeline-logic edits. |
| **SC-009** | Throughout cutover, `dig dev.effyshopping.com` never returns empty. |

---

## Prod bring-up (later, by configuration — FR-019)

Instantiate `infra/modules/amplify-web-app` in `infra/envs/prod/` with production values:
`domain_name = "effyshopping.com"` (the reserved apex), `deploy_branch = "main"` (or the production
release branch), prod Cognito refs, prod `/effy/prod/*` SSM keys. Same `amplify.yml`, same `.npmrc`.
Then run stages 0–4 with `ENV=prod`.

---

## Carry-forwards (not done in this slice)

- **Playwright e2e in a dedicated CI** (kept out of the hosting build, research D8).
- **`REVALIDATE_SECRET` / `/api/revalidate`** — deferred until the "home composer" feature exists (D10).
- **PostHog initialisation on customer-web** — a pre-existing storefront gap (039), not opened here.
- **Per-PR preview environments** — out of scope; can be added without changing the pipeline shape.
