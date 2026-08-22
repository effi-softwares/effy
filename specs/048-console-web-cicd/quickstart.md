# Quickstart / Operator Runbook: 048 Console Continuous Deployment (dev)

Feature: 048-console-web-cicd. How to bring `shop.dev.effyshopping.com` and
`back-office.dev.effyshopping.com` live, and how to prove each Success Criterion. Claude authors the
Terraform/build/source; **the operator runs every `apply` and cloud step** (constitution mode of work).

This mirrors 042's runbook; the deltas are: **no apex takeover / no email-record cutover**, **two apps**,
**a CORS edit**, and **static (no SSR service role)** — so the 042 "let Amplify auto-create the role"
dance does **not** apply.

Prereqs: `AWS_PROFILE=ef` (account 724289623101), `ENV=dev`, and the 042 GitHub connection token already
in SSM (`/effy/dev/amplify/github_access_token`). The dev zone (010), the edge gateway (004/A3), and the
shop/back-office pools (005/007) are already live.

---

## §0 — One-time: confirm the reused GitHub connection

No new connection is needed. Confirm the token exists (a missing key fails the plan loudly):

```bash
AWS_PROFILE=ef aws ssm get-parameter --name /effy/dev/amplify/github_access_token --with-decryption \
  --query 'Parameter.Name' --output text
```

If it is absent, (re)create it via the Amplify GitHub App / a fine-grained PAT with read on
`github.com/effi-softwares/effy` (see 042 §0).

---

## §1 — Stage A: create the two console apps on the Amplify default hostname

With `amplify_consoles_domain_enabled = false` (the default), apply the env root. This creates both
Amplify apps + branches, wires each console's `VITE_*`, adds the CORS origins, and the FAILED alert —
but does **not** attach the subdomains yet.

⚠ Always drive Terraform through the Makefile — it passes `-var-file=$(ENV).tfvars` (so `aws_account_id`
and every other value load) and `apply` runs a `preflight` account-match guard first. A bare
`terraform plan` in the dir will prompt for `var.aws_account_id` and every no-default variable.

```bash
# from the repo root, with AWS_PROFILE=ef in the environment
make plan ENV=dev      # review: 2 amplify apps (platform=WEB, NO iam_service_role), CORS +2 origins
make apply ENV=dev     # interactive approval; preflight asserts the account matches dev.tfvars
```

Then push a commit to `dev` (or trigger the first build in the Amplify console) and confirm **each** app
builds green from the monorepo root and serves on its `…​.amplifyapp.com` default hostname.

- ✅ **SC-005 (scope)**: in the build logs, the shop-web app builds `apps/shop-web` and the back-office
  app builds `apps/back-office`; neither builds the other or `customer-web`. The customer-web app did
  **not** produce a new deploy from this change unless the change touched it → **SC-010**.
- ✅ **SC-006 (gate)**: to prove the gate, push a deliberate type error into one console, confirm its
  build **fails**, its last good version stays live, and the FAILED event reaches the alerts topic; then
  revert.

⚠ Because `platform = WEB`, there is **no** "Unable to assume IAM role" step-0 failure to work around —
that was a `WEB_COMPUTE` (SSR) hazard. If a build fails at install, it is pnpm/workspace, not IAM.

---

## §2 — Stage B: attach the subdomains

Set `amplify_consoles_domain_enabled = true` in `infra/envs/dev/dev.tfvars` and apply. Amplify creates +
verifies the Route 53 records (apex zone is in-account) and issues each `us-east-1` ACM cert;
`wait_for_verification = true` blocks until done.

```bash
make apply ENV=dev   # attaches shop. and back-office. subdomains
```

⚠ If the apply hangs on "Creating records…", check the dev zone for a leftover/stale `_acm-validation`
CNAME or a conflicting record for the same prefix and reconcile (same failure mode as 042 §3, but here it
can only involve the `shop`/`back-office` labels — never the apex or `api.`).

- ✅ **SC-003 (address + TLS)**: in a browser, `https://shop.dev.effyshopping.com` serves the **shop**
  console and `https://back-office.dev.effyshopping.com` serves the **back-office** console, each over a
  valid cert for its own name; neither resolves to the other or to the storefront.

---

## §3 — Prove SPA deep links, sign-in, CORS, and privacy

On each live console:

- ✅ **SC-004 (SPA routing)**: navigate to a deep route (e.g. an order/detail URL), then **refresh** and
  also open the URL in a fresh tab — the same view loads (the rewrite serves `index.html` 200), not a
  host 404.
- ✅ **SC-007 (backend + pool + CORS)**: sign in with a valid staff account for that pool (shop staff on
  shop-web; admin/manager/csa on back-office) via EMAIL_OTP, then load a data-backed view. The browser
  call to the gateway succeeds — **0 CORS pre-flight failures**, **0 wrong-pool 401s** for a correctly
  credentialed user. This is also the live confirmation of **D11** (SDK EMAIL_OTP needs no callback-URL
  registration for the new subdomains).
- ✅ **SC-008 (privacy + no secret)**:
  - Fetch `https://shop.dev.effyshopping.com/robots.txt` (and back-office) → `Disallow: /`; view-source
    on the app shell shows `<meta name="robots" content="noindex, nofollow">`.
  - Sweep each deployed bundle for secrets (only pool ids / client ids / gateway URL should appear):
    ```bash
    # against the built dist, or the deployed assets
    grep -RInE "AKIA|secret|BEGIN [A-Z ]*PRIVATE KEY|sk_live|sk_test" apps/shop-web/dist apps/back-office/dist || echo "clean"
    ```
- ✅ **SC-002 (merge-to-live)**: time a trivial change from merge to serving — under 15 min per console.
- ✅ **SC-001 (no manual deploy)**: the above happened with **zero** manual deploy commands — only a merge.

---

## §4 — Prod readiness (design proof only; not run now)

- ✅ **SC-009**: review `infra/modules/amplify-web-app` and `infra/envs/dev/amplify-consoles.tf` — every
  environment value (subdomains, branch, gateway origin, pool ids, account/region) is a parameter/ref.
  Standing up prod is a second instantiation in `infra/envs/prod/` with `shop.effyshopping.com` /
  `back-office.effyshopping.com`, the production branch, and prod pools — **0 pipeline-logic edits**.

---

## Rollback

Each console rolls back natively in Amplify (redeploy a prior successful build). To detach a subdomain,
set `amplify_consoles_domain_enabled = false` and apply. To remove a console entirely, remove its module
block + its `applications[]` entry in `amplify.yml` + its CORS origin and apply (⚠ removing the module
block destroys that Amplify app — the same lesson 042 recorded; do it deliberately).

## Commit

Per the platform's rule, the operator commits. Nothing here is committed by Claude. The migration
commit-guard (003) is **N/A** — this slice has no migration.
