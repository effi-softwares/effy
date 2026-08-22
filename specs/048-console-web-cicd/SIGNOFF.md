# Sign-off: 048-console-web-cicd — Internal Console Continuous Deployment (Shop-Web & Back-Office)

**Status: ✅ CONCLUDED — DEPLOYED TO DEV AND LIVE ON BOTH SURFACES.** 2026-08-22.

Both internal operator consoles now have the same managed, Git-driven CI/CD the storefront got in 042,
adapted to their reality (static Vite SPAs on subdomains, not a public SSR app on the apex).

## What is live

- **`https://shop.dev.effyshopping.com`** — `apps/shop-web` (shop pool), and
  **`https://back-office.dev.effyshopping.com`** — `apps/back-office` (admin pool) — both serving over a
  valid TLS certificate. Confirmed working by the operator.
- **CI/CD proven**: each Amplify app auto-builds on a push/merge to `dev` and builds **only its own
  `appRoot`**. This is not theoretical — both sites received their content from `dev`-branch builds.
- Amplify app ids: shop-web `djjaj6nj4se6`, back-office `d3cu4od3kgw5sk`.
- Committed to `dev`: `bd79e5f` (tasks) + `7e49856` (domain cutover). Working tree clean.

## How it was built (deltas from 042)

- **Static `platform = WEB`** — no SSR service role; 042's "Unable to assume IAM role at CreateApp"
  hazard is designed out.
- **SPA rewrite** (`custom_rule`: unknown non-asset path → `/index.html`, status 200) so client-router
  deep links survive a refresh.
- **Subdomains, not the apex** — no apex takeover, no email-record cutover (042's highest-risk task does
  not recur).
- **One generalised module, not a fork** (`infra/modules/amplify-web-app` gained `platform`,
  `subdomain_prefix`, `custom_rules`, all defaulted) — the customer-web app's resources are byte-identical.
- **One `amplify.yml`, three applications** — each Amplify app builds only the entry matching its
  `AMPLIFY_MONOREPO_APP_ROOT`.
- **Gateway CORS extended** (config-derived) with both deployed origins.
- **`noindex` + `robots.txt`** in each console's own source (internal surfaces; Cognito login is the gate).
- **One EventBridge FAILED rule → existing alerts SNS** for both apps.

## Two-stage cutover (as executed)

1. **Stage A** (`amplify_consoles_domain_enabled = false`): both apps created and built on their
   `…amplifyapp.com` hostnames. ✅
2. **Stage B** (`amplify_consoles_domain_enabled = true`): subdomains attached; Amplify created + verified
   the Route 53 records and issued each `us-east-1` cert. ✅

## Machine-verified before deploy

- `terraform validate` (dev env) + `fmt` clean · module generalised with `module.amplify_customer_web`
  intended byte-identical.
- shop-web **139 tests + typecheck** green · back-office **79 tests + typecheck** green.
- Banned-address sweep clean · secret sweep of new source clean · `robots.txt` tracked.

## Open (optional live verification — the capability is already live; 6/41 tasks)

None of these block the conclusion; they are belt-and-braces walks:

- **T022** — deep-link refresh on each console returns the view (SPA rewrite), not a host 404.
- **T024** — push touching only one console rebuilds only that console (scope negative test).
- **T025** — customer-web still builds only `apps/customer-web` and serves `dev.effyshopping.com` (SC-010).
- **T030** — fetch `/robots.txt` (→ `Disallow: /`) + view-source shows the `noindex` meta; unauth visit
  hits the Cognito gate.
- **T034** — sweep each **deployed** bundle for secrets (source sweep already clean).
- **T039** — deliberately fail a build → last good version stays live + the FAILED alert reaches the
  alerts topic.

## Carry-forwards / notes

- **Access posture is Cognito-only + `noindex`** (per the decision at spec time). An Amplify HTTP
  basic-auth gate was deferred and remains a values-only add if wanted later.
- **Prod** is a second instantiation with prod values (`shop.effyshopping.com` /
  `back-office.effyshopping.com`, prod branch, prod pools) — 0 pipeline-logic edits (FR-020/FR-021).
- Per-PR preview environments remain out of scope.
- Confirm-don't-assume item resolved by the live deploy: Cognito EMAIL_OTP on the new subdomains needs
  no callback/allowed-origin registration (SDK custom-auth, not Hosted UI).

Spec/artifacts: [specs/048-console-web-cicd/](.). Parity register: §048 in
[docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md).
