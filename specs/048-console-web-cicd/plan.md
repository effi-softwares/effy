# Implementation Plan: Internal Console Continuous Deployment (Shop-Web & Back-Office, dev)

**Branch**: `048-console-web-cicd` | **Date**: 2026-08-22 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `/specs/048-console-web-cicd/spec.md`

## Summary

Give the two internal operator consoles — `apps/shop-web` (Vite SPA, shop pool) and `apps/back-office`
(Vite SPA, admin pool), today both local-only — the **same managed, Git-driven CI/CD** that 042 gave
the storefront: a push/merge to the `dev` branch auto-builds each affected console from that exact
commit and serves it over HTTPS at its own subdomain — `shop.dev.effyshopping.com` and
`back-office.dev.effyshopping.com` — with the same definitions reaching `shop.effyshopping.com` /
`back-office.effyshopping.com` for production by supplying different values.

**Technical approach** (from research): reuse AWS Amplify Hosting's native Git pipeline in monorepo
mode, exactly as 042, but adapted to the consoles' realities. The 042 `infra/modules/amplify-web-app`
module is **generalised** (not forked) to carry three new parameters — `platform` (default
`WEB_COMPUTE`, so the storefront is byte-unchanged; consoles pass `WEB`), `subdomain_prefix` (default
`""` = apex, so the storefront is unchanged; consoles pass `shop` / `back-office`), and `custom_rules`
(default `[]`; consoles pass the SPA rewrite `</^…$/>` → `/index.html` `200`). Because the consoles
are static (`WEB`), the SSR service role and 042's "role-must-exist-at-CreateApp-time" hazard **do not
apply** — the module skips the role entirely when the platform is static. A new env-root file
`infra/envs/dev/amplify-consoles.tf` instantiates the module **twice**, wiring each console's `VITE_*`
config from Terraform refs (the correct pool per console) and the shared gateway address. The repo-root
`amplify.yml` gains two more `applications[]` entries; each Amplify app still builds **only** the entry
matching its own `AMPLIFY_MONOREPO_APP_ROOT`, so nothing cross-builds and the storefront's app is
untouched. The shared edge gateway's Terraform-owned CORS `allow_origins` is extended (config-derived,
not literal) with the two deployed origins. Each console gets `noindex` (a `robots` meta + `robots.txt`
in its own source) because internal consoles must not be discoverable. Build failures route to the
existing alerts SNS topic (037/042). No apex takeover, no email-record cutover, no database, no
migration.

## Technical Context

**Language/Version**: HCL (Terraform, AWS provider ~> 6.0); YAML (`amplify.yml`); tiny static-source
edits in each console (`index.html` meta, `public/robots.txt`). No React/TS application-logic changes —
`shop-web` (007) and `back-office` (005) are already built.

**Primary Dependencies**: AWS Amplify Hosting (constitution-locked); AWS provider resources
`aws_amplify_app`, `aws_amplify_branch`, `aws_amplify_domain_association`, `aws_cloudwatch_event_rule`
/`_target`, `aws_ssm_parameter` (data); existing modules/roots — `dns-env-zone` (010), the shared edge
gateway `edge-gateway.tf` (004/A3), the `shop_pool` and `back_office_pool` Cognito modules (001/005/007),
the `amplify-web-app` module + repo-root `amplify.yml`/`.npmrc` (042), the alerts SNS topic (037).

**Storage**: None. No database, no migration. Configuration lives in the existing `/effy/<env>/…` SSM
contract, Terraform references, and Amplify's env-var store.

**Testing**: Terraform `validate` + `fmt`; each console's existing gates (`typecheck`, `vitest`) run
**inside its Amplify build** so a failing gate fails that deploy; the shared-package config-contract
test (`packages/web-kit/src/runtime/config.test.ts`) stays green; a full-workspace re-verify since the
repo-root `.npmrc` already sets `node-linker=hoisted` (042 — no new change, but re-confirmed). Operator
live walks: merge → live per console, monorepo-scope proof (touch-one-console), SPA deep-link refresh,
sign-in + data-load via the deployed gateway (CORS), `noindex` check, secret sweep of each bundle.

**Target Platform**: AWS `ap-southeast-2` (Sydney) for both Amplify apps; Amplify provisions each
console's custom-domain ACM cert in `us-east-1` automatically (decision-locked, satisfied by Amplify).

**Project Type**: Infrastructure / deployment slice (Terraform + build config + trivial static-source
edits). No new client surface, no backend service, no schema.

**Performance Goals**: Merge-to-live under ~15 min per console for a typical change (SC-002). Console
runtime performance is unchanged (no bundle-budget gate exists for the consoles — that is customer-web
specific — so none is added).

**Constraints**: Each console builds only its own `appRoot` (FR-006/FR-009); the storefront pipeline is
untouched (FR-008/SC-010); no secret in either bundle (FR-018); SPA deep links must not 404 (FR-011);
consoles must be `noindex` (FR-013); gateway CORS must admit the deployed origins without dropping
existing ones (FR-017); no literal `dev` in module logic (FR-020); no operator-unsupplied identifier
anywhere (constitution — the 042 GitHub token is reused, not a new one inferred).

**Scale/Scope**: One environment now (dev); the generalised module + a second env-root instantiation
is the vehicle for qa/staging/prod. Two apps, one shared branch mapping, two subdomains.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle / Rule | Status | Notes |
|---|---|---|
| **Infra is Terraform, multi-env, IaC** | ✅ | Two Amplify apps + domains + CORS + alert authored as Terraform, reusing/generalising the 042 module; qa/staging/prod are `env=` + a second instantiation. |
| **Mode of work — Claude authors, operator runs risky/outward-facing steps** | ✅ | Claude writes Terraform + `amplify.yml` + the static `noindex` edits; operator runs `terraform apply` and the (reused) Amplify↔GitHub connection. No `apply` by Claude. |
| **Real-World Identifiers (NON-NEGOTIABLE, v1.12.0)** | ✅ | The GitHub connection token is **reused** from 042 (`/effy/dev/amplify/github_access_token`), operator-supplied; no new identifier is inferred. Banned address appears nowhere. A missing SSM key fails the plan loudly. |
| **Principle II — shared packages are the single source, never copied** | ✅ | The generalised module is used by all three web surfaces (no fork); each `amplify.yml` app installs from the monorepo root so the consoles consume `@effy/{design-system,shared-types,api-client,web-kit}` from the workspace. |
| **Config, never a literal** | ✅ | Subdomains, branch, repo, pool ids, gateway origin, and the CORS origins are all vars / Terraform refs; no `dev`-specific literal in module logic. |
| **Principle IV — 4-pool auth isolation** | ✅ | shop-web authenticates against the **shop** pool, back-office against the **admin/back-office** pool; this slice supplies each console's own pool ids and changes no pool. A token for one is structurally rejected by the other's gateway authorizer. |
| **Principle V — design (monochrome, no card layouts)** | ✅ N/A | No UI change; both consoles' design (041) is untouched. |
| **Principle VII — observability from day one** | ✅ | Amplify emits build/access logs + CloudWatch metrics; a build-failure signal for **both** apps routes to the existing alerts topic. PostHog on the consoles stays optional/no-op (as today) — not this slice's job. |

**Result: PASS.** No violations; Complexity Tracking not required.

## Project Structure

### Documentation (this feature)

```text
specs/048-console-web-cicd/
├── plan.md              # This file
├── research.md          # Phase 0 — decisions D1..D12
├── data-model.md        # Phase 1 — configuration entities (no DB)
├── quickstart.md        # Phase 1 — operator runbook (apply → cutover → verify), per console
├── contracts/
│   ├── amplify-build.contract.md   # the amplify.yml (now 3 applications) + per-console env-var contract
│   └── config.contract.md          # /effy/<env>/… inputs + the two consoles' VITE_* wiring + CORS origins
├── checklists/
│   └── requirements.md  # spec quality checklist (already created by /specify)
└── tasks.md             # Phase 2 (/speckit-tasks — NOT created here)
```

### Source Code (repository root)

```text
amplify.yml                                    # EDIT — add applications[] for apps/shop-web and apps/back-office
                                               #   (each Amplify app still builds ONLY its own appRoot); update the
                                               #   "exactly one application" header comment → per-app-root selection

infra/modules/amplify-web-app/                 # EDIT (generalise, no fork — Principle II)
├── main.tf                                    #   platform var; service role only when platform==WEB_COMPUTE;
│                                              #   subdomain_prefix on the domain association; custom_rules (SPA rewrite)
├── variables.tf                               #   + platform, + subdomain_prefix, + custom_rules  (all defaulted to keep 042 identical)
└── outputs.tf                                 #   + console_url (== storefront_url shape) if helpful

infra/envs/dev/
├── amplify-consoles.tf                        # NEW — instantiate the module twice (shop-web, back-office);
│                                              #   VITE_* env from module.shop_pool / module.back_office_pool + edge origin;
│                                              #   two-stage domain cutover flag; one EventBridge FAILED rule for both appIds
├── edge-gateway.tf                            # EDIT — extend cors_configuration.allow_origins with the two deployed
│                                              #   console origins, config-derived from the zone + subdomain vars (keep existing)
└── variables.tf                               # EDIT — add shop_web_subdomain / back_office_subdomain (defaults) +
                                               #   amplify_consoles_domain_enabled (two-stage cutover). Reuse amplify_repository_url,
                                               #   amplify_deploy_branch, the github token SSM.

apps/shop-web/index.html                       # EDIT — <meta name="robots" content="noindex, nofollow"> (FR-013)
apps/shop-web/public/robots.txt                # NEW  — User-agent: * / Disallow: /
apps/back-office/index.html                    # EDIT — same noindex meta
apps/back-office/public/robots.txt             # NEW  — same disallow-all
apps/shop-web/.env.example                     # EDIT (docs) — record deployed dev values as the reference
apps/back-office/.env.example                  # EDIT (docs) — same
```

**Structure Decision**: Mirror 042 exactly — generalise the **one** reusable module rather than fork
it (Principle II: one source for the Amplify web-app shape), and add a **thin env-root file** that
instantiates it per surface with this environment's values. Production is a second instantiation in
`infra/envs/prod/` (FR-020/FR-021), not a rewrite. The `amplify.yml` stays at the repo root (Amplify
requires it there); its per-app-root selection is the mechanical guarantee that each console builds
only itself and the storefront is unaffected (FR-006/FR-008/FR-009). The `noindex` edits live in each
console's own source so they travel with the app to any host, not just Amplify (FR-013).

## Key design decisions (detail in research.md)

- **D1 — Reuse the 042 pattern, one generalised module.** Same host, same monorepo mechanism, same
  operator-runs-apply mode. Generalise `amplify-web-app` with defaulted params so the storefront's
  resources are byte-identical and the consoles are a second use. (FR-008/SC-010)
- **D2 — Static web platform (`WEB`), not `WEB_COMPUTE`.** The consoles are Vite SPAs with no server
  runtime. `platform` becomes a variable (default `WEB_COMPUTE`); consoles pass `WEB`. When static,
  the module creates **no** service role and sets no `iam_service_role_arn` — 042's "Unable to assume
  IAM role at CreateApp" hazard cannot recur here. (spec Assumptions; US1)
- **D3 — SPA rewrite rule.** A client-router SPA on static hosting 404s on deep-link refresh unless the
  host rewrites unknown non-asset paths to `/index.html` with status `200`. Add `custom_rules` to the
  module (default `[]`); consoles pass Amplify's canonical SPA rule
  (`source = "</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"`,
  `target = "/index.html"`, `status = "200"`). (FR-011/US2/SC-004)
- **D4 — Subdomains, not the apex.** Generalise the domain association from apex-only to a
  `subdomain_prefix` var (default `""`). Consoles pass `shop` / `back-office` on the same in-account
  root `dev.effyshopping.com`; Amplify manages each subdomain's Route 53 record + `us-east-1` ACM cert.
  **No apex takeover, no email-record cutover** (037's records are the storefront's problem, already
  solved by 042) — the delicate part of 042 does not recur. (FR-010/FR-012; two-stage cutover flag
  like 042's `amplify_domain_enabled`)
- **D5 — Two Amplify apps, one `amplify.yml`.** Amplify monorepo mode selects, per app, the single
  `applications[]` entry whose `appRoot` equals that app's `AMPLIFY_MONOREPO_APP_ROOT`. Adding the two
  console entries does **not** change what customer-web builds. The 042 file's "exactly one
  application" comment is superseded by this per-app-root selection rule; the build contract is updated
  to state it and to keep the guarantee (each app ⇒ exactly one matching entry). (FR-006/FR-009/FR-008)
- **D6 — Console build gates: `typecheck` → `test` → `build`.** No `size` gate (that is the
  storefront's 174 KB budget; the consoles have none). Vite output artifact is `apps/<app>/dist`. A
  non-zero exit fails that console's deploy and Amplify keeps its last good version. (FR-005/FR-003)
- **D7 — GitHub connection reused, not re-minted.** The 042 operator-supplied token in SSM
  (`/effy/dev/amplify/github_access_token`) authorises all three apps. No new real-world identifier is
  inferred. (FR-025; constitution)
- **D8 — Config: refs + the correct pool per console.** shop-web ← `module.shop_pool.{user_pool_id,
  app_client_id}`; back-office ← `module.back_office_pool.{…}`; both ← the deployed edge gateway
  address; all are `VITE_*`, build-time-inlined, and **public-safe** (a pool id, a client id, a gateway
  URL). No secret reaches either bundle. (FR-015/FR-016/FR-018)
- **D9 — Gateway CORS extension, config-derived.** Add `https://shop.dev.effyshopping.com` and
  `https://back-office.dev.effyshopping.com` to `edge-gateway.tf`'s `allow_origins`, composed from the
  zone name + subdomain vars (not literals), preserving the existing localhost origins. A missing origin
  is the one way an otherwise-correct console call fails at pre-flight. (FR-017/SC-007)
- **D10 — `noindex` in each console's own source.** A `robots` meta tag in `index.html` plus a
  disallow-all `public/robots.txt` per console — host-agnostic, reviewable, travels with the app. Cognito
  login remains the real gate (FR-014); no Amplify HTTP basic-auth is added by default (spec Assumptions —
  deferrable as pure config). (FR-013/US4/SC-008)
- **D11 — Cognito EMAIL_OTP needs no callback/origin registration.** Both consoles use the Amplify SDK's
  custom-auth EMAIL_OTP against `cognito-idp` directly, not the Hosted UI / OAuth redirect, so no
  allowed-callback/logout URL or app-client change is required for the new subdomains. Confirmed by the
  auth mechanism, and re-verified at the live sign-in walk rather than assumed. (FR-019)
- **D12 — Build-failure observability = one signal for two apps.** A single EventBridge rule matching
  `source aws.amplify`, `jobStatus FAILED`, and either console's `appId`, targeting the existing alerts
  SNS topic (whose policy already permits `events.amazonaws.com`, from 042). No new topic/policy. (FR-023)

## Complexity Tracking

No constitution violations — section intentionally empty.
