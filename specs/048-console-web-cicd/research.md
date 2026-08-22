# Research: Internal Console Continuous Deployment (Shop-Web & Back-Office, dev)

Feature: 048-console-web-cicd. Phase 0. Every NEEDS-CLARIFICATION from the plan's Technical Context is
resolved here. Format per decision: **Decision / Rationale / Alternatives**.

The baseline is **042-customer-web-cicd**, already live at `dev.effyshopping.com`. This slice reuses
its mechanism; the research is about the **deltas** the two internal Vite SPAs impose.

---

## D1 — Reuse 042's managed pipeline; generalise the one module (do not fork)

**Decision**: Deploy both consoles via the same AWS Amplify Hosting native Git pipeline in monorepo
mode. Generalise `infra/modules/amplify-web-app` with new, defaulted parameters so the storefront's
resource graph is byte-identical and the consoles are a second instantiation; add a thin env-root file.

**Rationale**: Constitution Principle II — one source for the "Amplify web app" shape, never a copy.
042 already proved the mechanism (build + deploy + TLS + custom domain + atomic rollback in one managed
system). Defaulting every new variable to its 042 value means the change is inert for customer-web
(SC-010) and additive for the consoles.

**Alternatives**: (a) Fork a second `amplify-web-static` module — rejected; duplicates the resource
graph and drifts. (b) A separate GitHub Actions → S3/CloudFront pipeline for the SPAs — rejected; more
moving parts, a second TLS/domain story, and it abandons the managed rollback/history 042 relies on.

---

## D2 — Static web platform (`WEB`), not `WEB_COMPUTE`

**Decision**: Add a `platform` variable to the module (default `WEB_COMPUTE`, keeping 042 unchanged).
The consoles pass `WEB`. When `platform == "WEB"` the module creates **no** Amplify service role and
sets no `iam_service_role_arn`.

**Rationale**: `shop-web` and `back-office` are Vite + React **SPAs** — static assets, no server
runtime. Amplify's SSR service role (and its notorious "Unable to assume specified IAM Role at
CreateApp time" failure, which 042 hit and documented) exists **only** for `WEB_COMPUTE`. A static app
needs no role at all, so the whole hazard — and the "recreate the app if the role must change" landmine
— simply does not apply here. This is the single biggest simplification versus 042.

**Alternatives**: Keep `WEB_COMPUTE` and ship a trivial server — rejected; there is no server code and
inventing one adds cost, a role, and a build target for nothing.

---

## D3 — SPA rewrite rule (the deep-link 404 fix)

**Decision**: Add a `custom_rules` variable (list of `{source, target, status}`; default `[]`). Each
console passes Amplify's canonical single-page-app rewrite:

```
source = "</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>"
target = "/index.html"
status = "200"
```

**Rationale**: A client-side router (TanStack Router, used by both consoles) owns paths like
`/orders/123`. On static hosting, a direct visit or refresh of such a path asks the host for a file
that does not exist → a host 404 (FR-011/SC-004). The rewrite serves `index.html` (status **200**, a
rewrite not a redirect) for any path that is not a real static asset, letting the router take over;
the negative-lookahead on known extensions ensures genuine assets (`.js`, `.css`, images, fonts, maps,
`.json`) still serve directly. This is Amplify's documented SPA redirect and is expressed as an
`aws_amplify_app` `custom_rule` block. `status = "200"` matters — a `302` would change the URL and break
deep-link sharing.

**Alternatives**: (a) Hash routing (`/#/orders/123`) — rejected; the consoles already use history
routing and it would be a UX regression. (b) A per-route redirect list — rejected; unmaintainable and
can't anticipate dynamic segments.

---

## D4 — Subdomains, not the apex; no email-record cutover

**Decision**: Generalise the domain association from apex-only to a `subdomain_prefix` variable
(default `""` = apex, keeping 042). Consoles pass `shop` and `back-office` against the **same**
in-account root domain `dev.effyshopping.com`. Amplify manages each subdomain's Route 53 record and its
`us-east-1` ACM cert. A two-stage cutover flag (`amplify_consoles_domain_enabled`, mirroring 042's
`amplify_domain_enabled`) lets stage A build on the Amplify default hostname and stage B attach the
subdomain.

**Rationale**: The consoles are not the apex — the storefront is (042). Because each console takes a
fresh, previously-unused subdomain, there is **no record to reconcile and no window where a name stops
resolving**: 037's apex A/AAAA email-sender records were already handled by 042 and are irrelevant here.
This removes 042's highest-risk task. Multiple Amplify apps associating different sub_domain prefixes on
one in-account root domain is a supported pattern (each app's association manages only its own prefix);
this is re-verified at apply (quickstart), since it is the one Amplify behaviour worth confirming live.

**Alternatives**: (a) Path-based hosting under the apex (`dev.effyshopping.com/shop`) — rejected; mixes
the public storefront and internal consoles on one origin, complicates auth cookies/CORS, and defeats
`noindex` isolation. (b) A separate zone per console — rejected; unnecessary, and 010's per-env zone
already exists.

---

## D5 — Two Amplify apps sharing one `amplify.yml`; per-app-root selection

**Decision**: Add two `applications[]` entries (`apps/shop-web`, `apps/back-office`) to the existing
repo-root `amplify.yml`. Each Amplify app has its own `AMPLIFY_MONOREPO_APP_ROOT`, and Amplify builds
**only** the single `applications[]` entry whose `appRoot` matches. Update the 042 file's "exactly one
application" header comment to the accurate rule; update `amplify-build.contract.md`.

**Rationale**: In Amplify monorepo mode the `applications[]` array is a directory of app roots; the
per-app `AMPLIFY_MONOREPO_APP_ROOT` env var selects which one that app compiles. So three surfaces = one
`amplify.yml` with three entries and three Amplify apps, and **customer-web keeps building only
customer-web** — adding entries changes nothing for it (FR-008/SC-010). The mechanical isolation
guarantee (FR-006/FR-009) is preserved but restated: each app maps to exactly one entry by app root; a
mis-set `AMPLIFY_MONOREPO_APP_ROOT` fails loudly with "Invalid monorepo spec, no appRoot matching path
found" rather than cross-building. The module already derives `AMPLIFY_MONOREPO_APP_ROOT` from `app_root`
so the env var and the `amplify.yml` `appRoot` cannot drift.

**Alternatives**: (a) One `amplify.yml` per app in each app dir — rejected; Amplify monorepo mode uses a
single repo-root spec, and per-dir specs are the non-monorepo model. (b) Keep 042's single-entry file and
add console entries in separate files — not possible; Amplify reads one repo-root `amplify.yml`.

---

## D6 — Console build gates and artifact directory

**Decision**: Each console entry runs `pnpm --filter @effy/<app> typecheck` → `test` → `build`, with
`artifacts.baseDirectory: apps/<app>/dist` (Vite output) and `buildPath: '/'` (install from the monorepo
root so `@effy/*` workspace packages resolve). No `size` gate.

**Rationale**: The consoles' `package.json` already expose `typecheck` (`tsc --noEmit`), `test` (`vitest
run`), and `build` (`tsc --noEmit && vite build`). Running the three as gates means a type error or a
failing test fails the deploy and Amplify keeps the last good version (FR-003/FR-005). The `size` gate is
customer-web-specific (its 174 KB bundle budget); the consoles are login-gated internal tools with no
such budget, so adding one would invent a constraint the spec doesn't set. Vite emits to `dist/`, unlike
Next's `.next`.

**Alternatives**: Fold typecheck into `build` only — rejected; keeping the explicit gate order matches
042 and makes a type failure legible in the build log at its own step.

---

## D7 — Reuse the operator's GitHub connection

**Decision**: All three Amplify apps use the existing operator-supplied token in SSM
`/effy/dev/amplify/github_access_token` (042). No new token, no new connection.

**Rationale**: Constitution Real-World Identifiers — the connection is an operator-authorised out-of-code
input, and one already exists and authorises reads on the same repo. Inferring or minting a second is
neither needed nor permitted without the operator asking. (If the operator later wants per-app tokens,
that is a values change, not a design change.)

**Alternatives**: A distinct token per app — rejected as default; more secrets to rotate for no isolation
gain (all three read the same repo).

---

## D8 — Per-console configuration: the correct pool, public-safe values only

**Decision**: Wire each console's `VITE_*` from Terraform references:

| Console | `VITE_COGNITO_USER_POOL_ID` | `VITE_COGNITO_CLIENT_ID` | `VITE_API_BASE_URL` |
|---|---|---|---|
| shop-web | `module.shop_pool.user_pool_id` | `module.shop_pool.app_client_id` | deployed edge gateway origin |
| back-office | `module.back_office_pool.user_pool_id` | `module.back_office_pool.app_client_id` | deployed edge gateway origin |

Optional `VITE_POSTHOG_KEY`/`_HOST` stay unset (no-op, as today).

**Rationale**: Principle IV — shop-web must authenticate against the **shop** pool and back-office
against the **admin/back-office** pool; pasting the wrong pool id makes sign-in succeed and every
`/shop/v1/*` (or `/admin/v1/*`) call 401 from the mismatched authorizer (the exact trap the `.env.example`
files warn about). Every value is a pool id, a client id, or a gateway address — all **public-safe** and
build-time-inlined by Vite (FR-016/FR-018). There is no secret to leak: unlike the storefront (Stripe
publishable key), the consoles carry none.

**Alternatives**: Read pool ids from the `/effy/dev/auth/{shop,back-office}/*` SSM keys via data sources —
equivalent, but the in-account module refs are drift-free and need no operator step, so prefer them (042's
choice).

---

## D9 — Gateway CORS extension (config-derived)

**Decision**: Extend `edge-gateway.tf`'s `cors_configuration.allow_origins` with
`https://shop.<zone>` and `https://back-office.<zone>`, composed in a `local` from the zone name and the
subdomain variables — not string literals — preserving the existing localhost origins.

**Rationale**: The consoles call the shared gateway from the browser; API Gateway HTTP APIs enforce CORS
at the edge, and a service that attaches to an external HTTP API cannot set CORS itself (the gateway owns
it — the file already says so). Without the deployed origins, every authenticated console call fails at
the OPTIONS pre-flight — an otherwise-correct console that silently can't reach its backend (FR-017/SC-007).
Config-deriving the origins keeps FR-020 (prod supplies its own zone → its own origins with no logic edit).
Keeping the localhost origins preserves local dev.

**Alternatives**: (a) A permissive `*` origin — rejected; these are privileged internal APIs and a wildcard
with credentials is both insecure and disallowed by the CORS spec. (b) Drop localhost in favour of only the
deployed origins — rejected for dev (breaks local console development); prod can narrow via values.

---

## D10 — `noindex` in each console's own source

**Decision**: Add `<meta name="robots" content="noindex, nofollow">` to each console's `index.html` and a
disallow-all `public/robots.txt` (`User-agent: *` / `Disallow: /`). Keep Cognito login as the real gate;
do **not** add an Amplify HTTP basic-auth gate by default.

**Rationale**: Internal admin consoles on the public internet must not be search-discoverable (FR-013/US4).
Putting the directive in the app's own source (a) travels with the app to any host, (b) is code-reviewed,
and (c) needs no Amplify-specific header config. The meta tag covers rendered-page crawlers; `robots.txt`
covers well-behaved crawlers before they fetch. The Cognito EMAIL_OTP login already blocks all privileged
function pre-auth (FR-014); an extra shared-password basic-auth gate was considered (defense-in-depth,
hides the shell entirely) and **deferred** — it is a values-only add later if the operator wants it (spec
Assumptions), and imposes a shared secret to rotate + an extra step for every operator now.

**Alternatives**: (a) Amplify `X-Robots-Tag` custom response header — works, but Amplify-specific and less
visible than source. (b) Basic-auth gate now — deferred per the access-posture decision.

---

## D11 — Cognito EMAIL_OTP needs no callback/allowed-origin registration

**Decision**: No Cognito app-client change for the new subdomains. Confirm at the live sign-in walk.

**Rationale**: Both consoles sign in via the Amplify SDK's **custom-auth EMAIL_OTP** flow, which calls
the `cognito-idp` API directly (InitiateAuth / RespondToAuthChallenge). That flow has no browser redirect,
so the app client's allowed callback/logout URLs (which matter only for the **Hosted UI / OAuth** redirect
flow) are irrelevant, and `cognito-idp` imposes no per-origin CORS restriction on these calls. Therefore
the deployed subdomains need no registration. Because "confirm, don't assume" is the spec's own instruction
(FR-019), the operator verifies a real sign-in on each deployed console during the walk.

**Alternatives**: Pre-emptively register callback URLs — rejected; unnecessary for non-Hosted-UI auth and
would imply a redirect flow the consoles don't use.

---

## D12 — Build-failure observability: one signal, two apps

**Decision**: One `aws_cloudwatch_event_rule` matching `source = aws.amplify`,
`detail-type = "Amplify Deployment Status Change"`, `detail.jobStatus = ["FAILED"]`, and
`detail.appId = [shop_app_id, back_office_app_id]`, targeting the existing alerts SNS topic.

**Rationale**: Amplify natively preserves the last good deploy and lists build history/logs, but nobody is
notified on failure (the "detection without notification" gap 037 fixed). Routing both consoles' FAILED
events to the existing alerts topic reuses 042's SNS topic policy, which already grants
`events.amazonaws.com` publish — so no new topic or policy statement is needed. One rule with both appIds
is simpler than two rules and satisfies FR-023 for both surfaces.

**Alternatives**: A rule per app — equivalent but two resources for one concern; a new topic — rejected,
the alerts topic is the platform's single operator channel.

---

## Resolved unknowns summary

| Unknown (plan Technical Context) | Resolution |
|---|---|
| SSR vs static on Amplify | Static `WEB`; no service role (D2) |
| Deep-link 404 on refresh | SPA rewrite `custom_rule` 200 (D3) |
| Where consoles live (DNS) | `shop.` / `back-office.` subdomains; no cutover (D4) |
| One `amplify.yml`, three apps | per-app-root selection; customer-web unchanged (D5) |
| Build gates + artifact dir | typecheck→test→build; `dist/`; no size gate (D6) |
| GitHub connection | reuse 042's SSM token (D7) |
| Correct pool per console | shop_pool / back_office_pool refs (D8) |
| CORS for deployed origins | extend gateway allow_origins, config-derived (D9) |
| Not publicly discoverable | noindex meta + robots.txt; Cognito-only gate (D10) |
| Cognito callback URLs needed? | No — SDK EMAIL_OTP, not Hosted UI; verify live (D11) |
| Failure alerting | one EventBridge FAILED rule, both appIds → alerts SNS (D12) |
