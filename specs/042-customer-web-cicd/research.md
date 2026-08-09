# Research: Customer Storefront Continuous Deployment (dev)

Feature: 042-customer-web-cicd · Date: 2026-08-09

All NEEDS CLARIFICATION from the plan's Technical Context are resolved below. Format per decision:
**Decision → Rationale → Alternatives considered.**

---

## D1 — CI/CD mechanism: Amplify's native Git pipeline (not a separate CI runner)

**Decision**: Use AWS Amplify Hosting's built-in Git-based continuous deployment. Connecting the
`dev` branch of the GitHub repo to an Amplify app makes every push/merge automatically build and
deploy; Amplify owns build compute, artifact hosting, TLS, custom domains, deploy history, and atomic
rollback on failure.

**Rationale**: Amplify Hosting is constitution-locked as the web hosting platform. Its native Git
integration is the vendor-standard way to get CI/CD for a hosted web app and satisfies FR-001..FR-005
out of the box (auto-trigger, per-commit history + logs, last-good-version-on-failure, latest-wins).
Adding an external runner would duplicate build/deploy responsibilities Amplify already owns.

**Alternatives considered**:
- *GitHub Actions builds → `aws amplify start-deployment` (manual/CI deploy)*: needed only if the Git
  provider were unsupported. The repo is on **github.com** (`gp` SSH alias → `github.com`,
  `effi-softwares/effy`), which Amplify supports natively, so this adds complexity for no benefit.
  Kept on file as the fallback if the org disallows the Amplify GitHub App.
- *Self-managed container on ECS/Fargate (like `core-api`, 040)*: rejected — re-implements hosting,
  CDN, TLS and SSR compute that Amplify provides, and contradicts the locked platform choice.

---

## D2 — Monorepo scoping: Amplify monorepo mode, exactly one declared application

**Decision**: Add a repo-root `amplify.yml` that declares a **single** application with
`appRoot: apps/customer-web` and `buildPath: '/'` (install/build from the monorepo root), and set the
app-level env var `AMPLIFY_MONOREPO_APP_ROOT=apps/customer-web`. No other app is declared anywhere.

**Rationale**: This is AWS's documented pattern for monorepos. Declaring only `customer-web` means the
pipeline structurally cannot build `shop-web`, `back-office`, or the mobile apps (FR-006/FR-008), while
`buildPath: '/'` lets pnpm install the whole workspace so shared packages resolve (FR-007). The
`appRoot` **must** equal `AMPLIFY_MONOREPO_APP_ROOT` or Amplify errors with "Invalid monorepo spec, no
appRoot matching path found."

**Build spec shape** (final YAML in `contracts/amplify-build.contract.md`):
```
version: 1
applications:
  - appRoot: apps/customer-web
    frontend:
      buildPath: '/'            # install + build from monorepo root
      phases:
        preBuild:  { commands: [ corepack enable, corepack prepare pnpm@10.28.2 --activate, pnpm install --frozen-lockfile ] }
        build:     { commands: [ pnpm --filter @effy/customer-web typecheck, pnpm --filter @effy/customer-web test, pnpm --filter @effy/customer-web size, pnpm --filter @effy/customer-web build ] }
      artifacts:
        baseDirectory: apps/customer-web/.next
        files: [ '**/*' ]
      cache:
        paths: [ node_modules/**/*, apps/customer-web/.next/cache/**/* ]
```

**Alternatives considered**:
- *One Amplify app per surface (three apps)*: unnecessary now and risks accidental exposure of internal
  consoles; the module can create the others later if ever wanted. Explicitly out of scope (FR-021).
- *`buildPath` at `apps/customer-web`*: breaks workspace resolution — shared packages live above the
  app root; install must run at the repo root.

---

## D3 — SSR platform: `platform = WEB_COMPUTE`

**Decision**: Set `aws_amplify_app.platform = "WEB_COMPUTE"`.

**Rationale**: `customer-web` is Next.js 16 with SSR/PPR (`cacheComponents: true`, Suspense islands,
server routes). Amplify requires `WEB_COMPUTE` for Next.js 14+ regardless of SSR vs SSG; `WEB` (static)
would fail to detect the SSR app and serve a broken/static-only site.

**Alternatives considered**: `platform = "WEB"` — rejected; incompatible with the app's SSR model.

---

## D4 — Package manager: pnpm installed in-build + root `.npmrc node-linker=hoisted`

**Decision**: Install pnpm during `preBuild` (`corepack enable && corepack prepare pnpm@10.28.2
--activate`, matching the repo's `packageManager` pin) and add a **repo-root `.npmrc`** containing
`node-linker=hoisted`.

**Rationale**: Amplify's default build image does not ship pnpm, and its docs state Turborepo/pnpm
monorepos require an `.npmrc` with the hoisted node-linker at the project root — otherwise the build
cannot resolve the workspace the way Amplify expects.

**⚠ Risk / Phase-1 gate**: A root `.npmrc` with `node-linker=hoisted` changes install linking for the
**entire monorepo** (flat `node_modules` instead of pnpm's symlinked, strictly-isolated layout). This
can surface phantom-dependency or hoisting differences in *other* packages. **Before relying on it,
re-run the full workspace verification locally** (`pnpm install` fresh + `pnpm -r typecheck` +
`pnpm -r test` + the three web builds + the mobile guards). If it breaks something, prefer `corepack`
+ a build that still succeeds under hoisted linking; do not silently weaken another package's
isolation. This re-verification is a task in Phase 2.

**Alternatives considered**:
- *`npm install -g pnpm`* (per AWS example): works, but `corepack` pins the exact repo version and
  avoids version drift between local and CI.
- *No `.npmrc` (rely on auto-detect)*: rejected — documented to fail for pnpm/Turborepo.

---

## D5 — GitHub connection: operator-supplied token in SSM, read via data source

**Decision**: The operator establishes the Git connection out-of-code — **preferably by installing the
AWS Amplify GitHub App** on `effi-softwares/effy` (the AWS-recommended, longest-lived method), or by
minting a **fine-grained GitHub PAT** with read (contents + webhooks) on the repo. The credential is
stored in SSM `SecureString` at `/effy/<env>/amplify/github_access_token`. Terraform reads it with a
`data "aws_ssm_parameter"` and passes it as `aws_amplify_app.access_token`. The repository URL
(`https://github.com/effi-softwares/effy`) is a variable.

**Rationale**: The token is a real-world credential granting access to a real account — exactly what
the constitution's Real-World Identifiers rule says must be **operator-supplied, never inferred**
(FR-022). Best practice (confirmed in research) is to keep the PAT in SSM and read it via a data
source rather than hard-code it; Amplify uses the token once to create a webhook + read-only deploy
key and does not persist it. Missing key → the plan fails loudly (correct).

**Alternatives considered**:
- *`oauth_token`*: the classic OAuth path is deprecated in favour of `access_token`.
- *Token in `dev.tfvars`*: rejected — a secret in a committed file; `dev.tfvars` is deliberately
  non-secret. SSM SecureString keeps it out of state-adjacent files.

---

## D6 — Custom domain: apex takeover + reconciling 037's alias records

**Decision**: Associate `dev.effyshopping.com` to the Amplify app via
`aws_amplify_domain_association` with two `sub_domain` blocks — prefix `""` (apex) and prefix `"www"`,
both bound to the `dev` branch — and **remove the existing apex alias records**
(`aws_route53_record.zone_apex_a` / `.zone_apex_aaaa` in `edge-domain.tf`) that point the apex at the
edge API gateway. The API keeps its own `api.dev.effyshopping.com` (and 040's
`core-api.dev.effyshopping.com`) records untouched.

**Why the old apex records exist and why removing them is safe**: 037 added the apex A/AAAA aliases
**only** so the email *sender* domain resolves (RFC 5321 §2.3.5) — its own comment says "THIS IS NOT A
WEBSITE … serves API 404s … a real landing page is out of scope." This slice **is** that website.
Once the Amplify apex record resolves to the storefront, the sender-domain-resolves property is
preserved (FR-011/SC-009) — actually improved (a real page instead of a 404).

**DNS record mechanics (the risk to verify at apply)**: `aws_amplify_domain_association` exposes the
ACM validation record and per-subdomain DNS records as attributes. Two viable wirings, decided at
implementation against the installed provider version:
1. **Terraform-managed records (preferred, IaC-pure)** — create `aws_route53_record`s from the
   association's outputs: the ACM validation CNAME, the `www` CNAME → Amplify's CloudFront target, and
   the **apex as a Route53 ALIAS A record** to the same CloudFront target (apex cannot be a CNAME;
   CloudFront's zone id is the global `Z2FDTNDATAQYW2`). No state drift.
2. **Amplify-managed records (fallback)** — let Amplify write the records into the in-account Route53
   zone; accept that those records are not in Terraform state. Simpler but drifts from strict IaC.

Preferred = option 1. ⚠ **This is the highest-risk part of the slice**: apex + ACM + provider-version
behaviour vary, so the operator verifies resolution + a valid cert live during the cutover apply
(quickstart §Cutover). `wait_for_verification = true` keeps the apply blocking until the association is
verified rather than returning on a half-provisioned domain.

**Cutover ordering (no-downtime for email resolution)**: The apply that adds the Amplify apex record
also removes the old API apex aliases in the same change set; Route53 applies changes per record.
There is at most a brief propagation overlap, never a state where the name resolves to nothing. If the
operator wants zero overlap, add the Amplify records first (separate apply), confirm resolution, then
remove the old ones — documented in the quickstart.

**Certificate region**: Amplify custom domains front CloudFront and Amplify **auto-provisions the ACM
certificate in `us-east-1`** itself. The decision-locked "CloudFront-fronted cert must live in
us-east-1" is thereby satisfied without us creating a cert. The `dns-env-zone` wildcard cert (010,
regional) is unaffected and still serves the API gateway.

**Alternatives considered**:
- *Serve the storefront at a subdomain (e.g. `shop.dev.effyshopping.com`) and leave the apex on the
  API*: rejected — the user explicitly asked for `dev.effyshopping.com`, and the storefront **is** the
  brand's front door; the apex is its natural home (and production's apex is reserved for exactly this).

---

## D7 — Environment configuration: Terraform refs + operator SSM secrets, nothing secret in the bundle

**Decision**: Supply the storefront's values as Amplify env vars, sourced as follows:

| Variable | Public? | Source |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | public | `https://${module.dns.zone_name}` |
| `NEXT_PUBLIC_CORE_API_BASE_URL` | public | `https://${var.core_api_subdomain}.${module.dns.zone_name}` |
| `NEXT_PUBLIC_COGNITO_USER_POOL_ID` | public | `module.customer_pool.user_pool_id` (ref) |
| `NEXT_PUBLIC_COGNITO_CLIENT_ID` | public | `module.customer_pool.app_client_id` (ref) |
| `NEXT_PUBLIC_COGNITO_DOMAIN` | public | blank until Google federation is enabled |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | public | SSM `/effy/<env>/stripe/publishable_key` (operator) |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST` | public | SSM (operator); blank acceptable — not yet initialised (039) |
| `EDGE_API_BASE_URL` | server-only | `https://${var.api_subdomain}.${module.dns.zone_name}` (or SSM `/effy/<env>/edge/api_endpoint`) |
| `AMPLIFY_MONOREPO_APP_ROOT` | build | `apps/customer-web` |
| `REVALIDATE_SECRET` | server-only | **deferred** (D10) |

**Rationale**: Cognito ids and the API/site URLs are in-account, non-secret platform facts →
Terraform references (no drift, no operator step). `NEXT_PUBLIC_*` are compiled into the browser
bundle by Next at build time, so they must be **build** env vars and must be values intended to be
public (FR-016); every one above is (a pool id, a client id, a publishable key are all public by
design). The only genuine secrets are external keys, kept in SSM and operator-supplied
(constitution). PostHog is optional — the storefront never initialised it (039), so a blank key is
honest, not a gap this slice must close.

**This slice publishes** `aws_ssm_parameter "/effy/<env>/web/site_url" = https://dev.effyshopping.com`
— which `apis/edge-api/customer/serverless.yml` already reads for the newsletter confirm link
(currently falling back to `http://localhost:3000`). So 042 closes 039's open site-URL item.

**Alternatives considered**:
- *All vars in SSM read via data sources*: more indirection for values Terraform already knows in the
  same root. Reserved for the genuinely external/secret ones.
- *`REVALIDATE_SECRET` now*: see D10.

---

## D8 — Quality gates run inside the Amplify build

**Decision**: The `build` phase runs `typecheck`, `vitest` (`test`), and the bundle-budget (`size`)
before `next build`. Any non-zero exit fails the Amplify build.

**Rationale**: FR-005 requires the deploy to fail rather than ship when a gate fails; a failed Amplify
build leaves the previous version live (FR-003) and is recorded with logs (FR-002). These three gates
are fast and already exist as `customer-web` scripts. Playwright **e2e is excluded** — it needs
browsers and a running server, is slow, and is better run in a dedicated CI stage; excluding it is a
recorded carry-forward, not a silent omission.

**Alternatives considered**:
- *Run e2e in-build*: rejected — build-time cost and flakiness on a deploy-critical path.
- *No gates (build only)*: rejected — violates FR-005; a type error would ship.

---

## D9 — Rollback + observability

**Decision**: Rely on Amplify's native behaviour — the last successful deployment stays live on a
failed build, and prior deployments are redeployable from history — and add a **build-failure
notification** to the existing `aws_sns_topic.alerts` (the same topic 037's alarms use), plus keep the
010 ACM `cert_expiry` alarm (Amplify's own cert is separate; note it is AWS-managed).

**Rationale**: Satisfies FR-003/FR-004 natively and Principle VII (observable from day one) with one
signal on the failure mode this slice introduces (a broken build/deploy). Amplify exposes build logs +
access logs; deep runtime metrics can be added later.

**Alternatives considered**: A bespoke CloudWatch dashboard — deferred; not warranted for a single app.

---

## D10 — `REVALIDATE_SECRET` deferred

**Decision**: Do **not** introduce `REVALIDATE_SECRET` or a `/api/revalidate` route in this slice.

**Rationale**: No such route exists in `apps/customer-web` today; the `.env.example` entry is
anticipatory, tagged for a separate, unspecced "home composer" feature (which also collided on the
`042` number — see spec Notes). Wiring a secret for an unbuilt route would be guessing at another
feature's shape. When that route ships, it adds the secret (from Secrets Manager) as a server-only env
var, and the edge-case rule "server routes needing a secret fail loudly when it is absent" applies then.

**Alternatives considered**: Provision a placeholder secret now — rejected; a placeholder real-world
value is exactly what the constitution forbids, and an unused secret is dead configuration.

---

## Open items carried into tasks / operator verification

- **Full-workspace re-verify under `node-linker=hoisted`** (D4) — must be green before trusting the
  build.
- **Live apex/TLS verification during cutover** (D6) — the record-wiring option is confirmed against
  the installed AWS provider version at apply time.
- **Amplify GitHub App vs PAT** (D5) — operator chooses; both supported, App preferred.
- **e2e in a separate CI** (D8) — carry-forward, not in the hosting build.

---

## Implementation amendments (2026-08-09, during /speckit-implement)

- **D6 record management — FLIPPED to Amplify-managed (option 2), with reason.** The plan preferred
  Terraform-managed Route53 records (option 1). During implementation this was reversed to **let
  Amplify manage the apex + subdomain records** in the in-account zone, because: (a) the apex cannot
  be a CNAME and `aws_amplify_domain_association` does not cleanly expose the CloudFront target needed
  to build a Route53 **ALIAS** across provider versions; (b) creating the ACM-validation record in
  Terraform while `wait_for_verification = true` risks the classic verification **deadlock**; (c)
  Amplify natively creates + maintains these records for a domain whose hosted zone is in the same
  account (it is — `module.dns`'s zone). The cost is that the domain's records are not in Terraform
  state (documented drift). `wait_for_verification = true` is kept — safe now that Amplify owns the
  records. Recorded in `infra/modules/amplify-web-app/main.tf`.
- **Apex reconciliation is GATED, not deleted (better than the task text).** `edge-domain.tf`'s
  `zone_apex_a`/`zone_apex_aaaa` are made `count = var.amplify_domain_enabled ? 0 : 1` rather than
  removed outright. Stage A (flag false) keeps the apex→gateway alias so the name resolves during
  first-build verification; the cutover apply (flag true) removes them as Amplify claims the apex —
  **no window where the apex stops resolving** (FR-011/SC-009). The `api.`/`core-api.` records are
  untouched.
- **Two-stage cutover via `amplify_domain_enabled`** (in `dev.tfvars`, default false) — same explicit
  two-stage shape as `ses_sender_enabled`, so no code is edited between the two applies.
- **Cold-path env var uses the real subdomain**: `EDGE_API_BASE_URL = https://edge-api.<zone>` (the
  `api_subdomain` default is `edge-api`, not `api`) — corrected from the plan's shorthand.
- **⚠ Service role added (WEB_COMPUTE requirement — found on first apply).** The first Amplify build
  failed at step 0 with "Unable to assume specified IAM Role": a Next.js SSR (`WEB_COMPUTE`) app
  cannot build/run without an `iam_service_role_arn`. The module now creates an IAM role trusted by
  `amplify.amazonaws.com` with CloudWatch Logs on `/aws/amplify/*` and sets it on the app. This was a
  gap in the originally authored module.
- **Build-failure alarm** (D9) implemented as an EventBridge rule (`aws.amplify` /
  `jobStatus = FAILED`) → the existing `aws_sns_topic.alerts`, plus an `aws_sns_topic_policy` that
  **preserves the default account-owner statement** and adds EventBridge + CloudWatch publish rights —
  so 037's sign-in-outage alarms keep delivering.
