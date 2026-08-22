# Feature Specification: Internal Console Continuous Deployment (Shop-Web & Back-Office, dev)

**Feature Branch**: `048-console-web-cicd`

**Created**: 2026-08-22

**Status**: Draft

**Input**: User description: "as the next spec i would like to deploy the shop app and back-office app in amplify. (like we did for customer web app). identify everything we should have and make the plans"

## Context & Constraints (decision-locked facts, not choices made here)

This slice does not re-decide platform infrastructure; it consumes what the constitution and prior
slices (notably **042-customer-web-cicd**) already locked, and the spec is written against those
facts:

- **Managed hosting is AWS Amplify Hosting** (constitution: "Infra … Amplify Hosting"). 042 proved
  the pattern for the **public storefront**; this slice applies it to the two **internal operator
  consoles**: `apps/shop-web` (007 — shop operator console) and `apps/back-office` (005 — internal
  admin). Both are **local-only today** — their `package.json` descriptions still say "LOCAL-ONLY".
- **These two surfaces are fundamentally different from the storefront**, and the differences drive
  this spec:
  - **They are Vite + React SPAs, not a Next.js SSR app.** There is no server runtime, no
    `WEB_COMPUTE`, and therefore **no SSR service role** and none of 042's "role must exist at
    CreateApp time" hazard. The hosted artifact is static files; a client-side router (TanStack
    Router) means the host must serve `index.html` for unknown deep-link paths (a SPA rewrite).
  - **They are internal, login-gated, and must not be publicly discoverable.** Every visitor is an
    Effy employee; the surfaces serve no anonymous audience, must not be indexed by search engines,
    and carry no SEO/canonical/sitemap concerns (the opposite of the storefront's whole reason to
    exist).
  - **They live on subdomains, not the zone apex.** The apex (`dev.effyshopping.com`) is the
    storefront's (042). These take dedicated subdomains, so there is **no apex takeover and no
    email-record cutover** — the delicate part of 042 does not recur here.
- **The repository is a monorepo** (Turborepo + pnpm). `apps/shop-web` and `apps/back-office` are
  workspace members alongside `apps/customer-web`, the three KMP apps, and shared packages
  (`@effy/design-system`, `@effy/shared-types`, `@effy/api-client`, `@effy/web-kit`).
- **The repo-root `amplify.yml` already exists** (042) and declares exactly one application
  (`apps/customer-web`). Amplify monorepo mode selects, per Amplify app, the single `applications[]`
  entry whose `appRoot` matches that app's `AMPLIFY_MONOREPO_APP_ROOT`. Adding a surface is therefore
  **its own Amplify app plus its own `applications[]` entry** — never a second surface bolted onto an
  existing app's build.
- **The shared HTTP API gateway is Terraform-owned** (004/A3) and its CORS `allow_origins` currently
  lists only localhost dev origins (`:5173` back-office, `:5174` shop-web, `:3000` storefront). The
  consoles call `/shop/v1/*` and `/admin/v1/*` on that gateway from the browser; the **deployed
  origins must be added to the allowlist** or every authenticated call fails CORS.
- **The four Cognito pools exist** (001); shop-web authenticates against the **shop** pool and
  back-office against the **back-office (admin)** pool, via the Amplify SDK using passwordless
  EMAIL_OTP — **not** the Cognito Hosted UI / OAuth redirect flow.
- **Configuration is build-time for a Vite SPA.** Each console reads `VITE_*` values
  (`VITE_COGNITO_USER_POOL_ID`, `VITE_COGNITO_CLIENT_ID`, `VITE_API_BASE_URL`, optional PostHog) that
  Vite inlines into the bundle at build. All are **public-safe** (a pool id, a client id, a gateway
  address) — there is **no secret** in either console's client bundle by design.
- **Mode of work**: the platform is built spec-first with all infrastructure expressed as code; the
  operator runs every outward-facing / cloud-mutating step. This slice authors the deployment
  definitions; it does not itself provision cloud resources or connect third-party accounts.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Each console redeploys automatically when the dev branch advances (Priority: P1)

A change lands on the repository's **dev integration branch** (by direct push or by a merge). Without
anyone running a manual deploy command, whichever console(s) the change affects are rebuilt from that
exact commit and served at their internal addresses. The person who merged can watch each build to
completion and see the result live shortly after.

**Why this priority**: This is the point of the feature — the two consoles move from laptop-only
applications to continuously delivered internal sites, exactly as 042 did for the storefront. "Merge
to dev → the console updates itself" is the complete, demonstrable MVP; every later refinement is
secondary.

**Independent Test**: Merge a visible, harmless change (e.g. a label tweak) that touches `shop-web`
into the dev branch; confirm the shop-web build starts automatically, completes, and the change is
visible at the shop console address with no manual deploy step. Repeat for `back-office`.

**Acceptance Scenarios**:

1. **Given** a working console deployed from commit A, **When** commit B is pushed/merged to the dev
   branch, **Then** a new build is triggered automatically for commit B and, on success, commit B is
   what that console serves.
2. **Given** an in-progress deployment, **When** the operator looks at the deployment history for
   that console's app, **Then** they can see the commit, the build status (running / succeeded /
   failed), and the build logs for that attempt.
3. **Given** a build that fails (e.g. a type error), **When** the build fails, **Then** the previously
   deployed working version of that console remains live and unchanged, and the failure is visibly
   reported (not silently swallowed).

---

### User Story 2 - Each console is served at its internal branded address over HTTPS with working deep links (Priority: P1)

An operator navigates to a console's internal address (`shop.dev.effyshopping.com` /
`back-office.dev.effyshopping.com`) and reaches the correct Effy console over a valid, trusted HTTPS
connection — not an un-branded provider hostname. Refreshing on a deep route (e.g. an order detail
URL) or opening such a URL directly loads that view, not a 404.

**Why this priority**: A pipeline that publishes to anonymous throwaway URLs, or that 404s on every
client-side route, does not deliver a usable console. The branded internal address on a trusted
certificate, plus correct SPA routing, is what makes each deployment usable by real operators and
linkable from internal tooling.

**Independent Test**: In a browser, visit `https://shop.dev.effyshopping.com` and confirm the shop
console loads over a valid certificate for that name; navigate to a deep route and refresh, confirming
the same view reloads rather than a host 404. Repeat for `https://back-office.dev.effyshopping.com`.

**Acceptance Scenarios**:

1. **Given** a console is deployed, **When** an operator requests its `https://` address, **Then** the
   correct console is served over HTTPS with a certificate valid for that subdomain.
2. **Given** a client-side deep-link route, **When** the operator loads or refreshes that URL directly,
   **Then** the host serves the application shell (which routes to the view) rather than a not-found
   error.
3. **Given** the shop and back-office addresses, **When** either is requested, **Then** it resolves to
   its **own** console and never to the other console or to the storefront.

---

### User Story 3 - Each Amplify app builds and deploys only its own surface (Priority: P1)

A change is pushed to the dev branch. The shop-web Amplify app builds and publishes **only**
`apps/shop-web`; the back-office Amplify app builds and publishes **only** `apps/back-office`. Neither
app builds the other console, the storefront, or any mobile app — including when a push touches files
that belong only to another surface or to shared packages.

**Why this priority**: In a monorepo the default behaviour of a naïve connection is to build whatever
it finds at the repo root. The mechanical guarantee that each app is confined to its own `appRoot` is
what prevents one console's pipeline from shipping another surface — a correctness and (given these are
privileged internal consoles) a security requirement. It also protects the storefront: this slice must
not alter what the customer-web app builds.

**Independent Test**: Push a change that only edits `apps/shop-web`; confirm the back-office and
customer-web apps do not publish a new version and no other surface's content appears at
`shop.dev.effyshopping.com`. Then push a change touching a **shared package** both consoles depend on;
confirm each console rebuilds correctly (the shared dependency resolves in each build).

**Acceptance Scenarios**:

1. **Given** the two console Amplify apps are connected to the monorepo, **When** any push to the dev
   branch occurs, **Then** the shop-web app's artifact is `apps/shop-web` and the back-office app's is
   `apps/back-office`, and neither builds a third surface.
2. **Given** each console depends on shared workspace packages, **When** it is built, **Then** those
   packages are resolved and compiled correctly within the monorepo's workspace layout.
3. **Given** the existing customer-web pipeline (042), **When** this slice is applied, **Then** the
   storefront app still builds only `apps/customer-web` and its deployment is unchanged.

---

### User Story 4 - The internal consoles are not publicly discoverable (Priority: P2)

The consoles are reachable at their addresses (they must be, for employees), but they are not indexed
by search engines and expose nothing usable to an unauthenticated visitor — the Cognito login gate
stands in front of all console function.

**Why this priority**: These surfaces are internal admin tooling deployed on the public internet. A
console that shows up in search results, or that leaks structure/behaviour before authentication, is a
disclosure risk. It is P2 because P1 makes the consoles work; this makes them appropriately private.

**Independent Test**: Request each console's robots directive and confirm it disallows indexing;
confirm an unauthenticated visit lands on (or is redirected to) the Cognito login and exposes no
privileged data or action.

**Acceptance Scenarios**:

1. **Given** a deployed console, **When** a crawler or a person inspects its indexing directives,
   **Then** indexing is disallowed (the console is `noindex` / robots-disallowed).
2. **Given** an unauthenticated visitor, **When** they load any console route, **Then** they reach the
   sign-in gate and can perform no privileged read or action without a valid staff session.

---

### User Story 5 - Each deployed console talks to the right backend and identity pool (Priority: P2)

Each hosted console reaches the shared edge gateway on its own path namespace (`/shop/v1/*` for
shop-web, `/admin/v1/*` for back-office), authenticates against the correct Cognito pool (shop pool
for shop-web, admin pool for back-office), and does so from configuration — with browser calls
succeeding across origins (CORS) and no secret embedded in either bundle.

**Why this priority**: A console that loads but cannot call its backend (CORS-blocked, wrong pool, or
localhost origin) is not delivered. Each console already reads every backend address and pool id from
`VITE_*` configuration (by design, 005/007); this slice must supply the **deployed** values and open
the gateway to the deployed origins. It is P2 because P1 proves the pipeline; this proves the deployed
console is functional.

**Independent Test**: On each live console, sign in with a valid staff account (correct pool) and load
a data-backed view, confirming the browser call to the gateway succeeds (not CORS-blocked, not 401
from a mismatched pool). Inspect the delivered bundle and confirm it contains only public-safe values.

**Acceptance Scenarios**:

1. **Given** a deployed console, **When** it makes an authenticated request, **Then** the request
   targets the deployed edge gateway on the console's own path namespace and the gateway permits the
   deployed origin (CORS), returning data rather than a CORS/pre-flight failure.
2. **Given** shop-web and back-office, **When** each signs a user in, **Then** each authenticates
   against its own pool (shop vs admin), and a token minted for one is not accepted by the other's
   backend scope.
3. **Given** either console's delivered bundle, **When** it is inspected, **Then** it contains only
   values intended to be public (pool id, client id, gateway address) and no server-only secret.

---

### User Story 6 - Production reaches the prod subdomains the same way, by configuration not rework (Priority: P2)

When the production environment is created later, the same deployment definitions are reused with
production values so the consoles are served at `shop.effyshopping.com` and
`back-office.effyshopping.com`, driven by the production release branch — with no redesign of the
pipeline and no per-environment literal in build logic.

**Why this priority**: The platform is explicitly built so every environment stands up from the same
code with different values (constitution; 010's per-env namespaces). The consoles must not paint prod
into a corner. It is P2 because it is a design-integrity requirement realised now and exercised later.

**Independent Test**: Review each deployment definition and confirm every environment-specific value
(the subdomain, the deployment branch, the backend origin, the pool ids, the account/region) is a
parameter, not a hard-coded literal.

**Acceptance Scenarios**:

1. **Given** the deployment definitions, **When** they are read, **Then** each console's address, the
   deployment branch, the gateway origin, and the pool ids are configuration inputs with no literal
   `dev`/`dev.effyshopping.com` in build logic.
2. **Given** a future production environment, **When** it is stood up with production values, **Then**
   the consoles deploy to `shop.effyshopping.com` and `back-office.effyshopping.com` from the
   production release branch using the same pipeline shape as dev.

---

### Edge Cases

- **A build fails** (type error, failed test gate, dependency resolution failure): that console's last
  good deployment stays live; the failure is reported with logs; no partial/broken version is served —
  and the *other* console's live version is unaffected.
- **A push touches only one console**: the other console and the storefront are not rebuilt/redeployed
  (US3), so an unrelated change never risks an unrelated surface.
- **A push touches only a shared package**: each console that depends on it rebuilds correctly and
  resolves the shared package during its own build (US3).
- **A client-side deep link is loaded or refreshed** (e.g. `/orders/123`): the host serves the SPA
  shell, not a 404 (US2) — the classic SPA-on-static-hosting failure this slice must configure away.
- **The dev branch is the same one 042 already auto-deploys**: adding two more apps on the same branch
  must not disturb the customer-web app; each app independently builds only its own `appRoot`.
- **A CORS origin is missing**: an authenticated console call from the deployed origin is rejected at
  pre-flight; the fix is data (an allowlisted origin), and the requirement is that the deployed origins
  are allowlisted before the consoles are declared live.
- **An unauthenticated visitor reaches a console**: they get the sign-in gate and no privileged
  capability; the console is not indexable (US4).
- **A concurrent double-merge**: the latest successful build per app is what ends up live; an older,
  slower build cannot overwrite a newer one.
- **A pull-request preview** is opened: this slice does not promise per-PR preview environments; such a
  push must not deploy to either console's internal address.

---

## Requirements *(mandatory)*

### Functional Requirements

**Trigger & pipeline (per console)**

- **FR-001**: A push or merge to the environment's designated deployment branch (dev: the `dev`
  integration branch) MUST automatically trigger a build-and-deploy of each affected console from that
  exact commit, with no manual deploy step.
- **FR-002**: Each deployment attempt MUST record the source commit, its status (running / succeeded /
  failed), and retrievable build logs, per console app.
- **FR-003**: A failed build MUST leave that console's previously deployed working version live and
  unchanged, MUST surface the failure, and MUST NOT affect the other console or the storefront.
- **FR-004**: The latest successful build for the deployment branch MUST be the version served per
  console; a slower, older build MUST NOT overwrite a newer successful one.
- **FR-005**: Each console's build MUST run that console's existing quality gates (at minimum its
  type-check and its test suite) such that a failing gate fails the deployment rather than shipping.

**Monorepo scoping**

- **FR-006**: The shop-web Amplify app MUST build and publish **only** `apps/shop-web`; the
  back-office Amplify app MUST build and publish **only** `apps/back-office`. Neither MUST build the
  other console, the storefront, or any mobile app.
- **FR-007**: Each console's build MUST correctly resolve and compile the shared workspace packages it
  depends on (`@effy/design-system`, `@effy/shared-types`, `@effy/api-client`, `@effy/web-kit`) within
  the monorepo's package-manager / workspace layout.
- **FR-008**: This slice MUST NOT alter what the existing customer-web Amplify app (042) builds or how
  it deploys; the storefront pipeline MUST remain confined to `apps/customer-web`.
- **FR-009**: Each console's confinement to its own `appRoot` MUST be a structural property of the
  build definition (each Amplify app selects only the `applications[]` entry matching its own app
  root), not a convention that a mis-edit could silently break into cross-surface builds.

**Address, TLS, DNS & SPA routing**

- **FR-010**: Each console MUST be served at its environment subdomain over HTTPS with a trusted
  certificate valid for that name — dev: `shop.dev.effyshopping.com` (shop-web) and
  `back-office.dev.effyshopping.com` (back-office).
- **FR-011**: Each console MUST serve the application shell for unknown deep-link paths under its
  domain (a SPA rewrite to `index.html` with a success status), so client-side routes load and survive
  a direct visit or refresh — while genuine static assets continue to serve normally.
- **FR-012**: Each subdomain MUST resolve only to its own console; no console subdomain MUST resolve to
  another console or to the storefront, and this slice MUST NOT alter the storefront's apex or the
  API's `api.`/`core-api.` records.

**Privacy of internal surfaces**

- **FR-013**: Each console MUST disallow search-engine indexing (`noindex` / robots-disallowed), so
  the internal consoles are not publicly discoverable.
- **FR-014**: An unauthenticated visitor to any console route MUST reach the sign-in gate and MUST be
  unable to perform any privileged read or action without a valid staff session (the existing Cognito
  gate stands; this slice adds no new authenticated capability).

**Configuration, backend wiring & secrets**

- **FR-015**: Every environment-specific value each console needs — its Cognito user-pool id and client
  id (correct pool per console), the edge gateway base address, and any optional analytics key — MUST
  be supplied to the build as configuration, not hard-coded, consistent with the consoles' existing
  `VITE_*` configuration rule.
- **FR-016**: Each deployed console MUST point at the **deployed** edge gateway address for this
  environment (not any localhost value), with shop-web using the `/shop/v1/*` namespace and
  back-office the `/admin/v1/*` namespace.
- **FR-017**: The shared edge gateway's CORS allowlist MUST include each deployed console origin
  (`https://shop.dev.effyshopping.com`, `https://back-office.dev.effyshopping.com`) so authenticated
  browser calls from the deployed consoles are permitted; existing origins MUST be preserved.
- **FR-018**: No server-only secret MUST be embedded in either console's delivered bundle; only
  public-safe values (pool id, client id, gateway address) may appear.
- **FR-019**: If either console's Cognito app client requires the deployed origin to be registered for
  its sign-in flow to function (e.g. an allowed-origin/callback registration), that registration MUST
  be made as configuration for the deployed subdomain; if the SDK-based EMAIL_OTP flow requires no such
  registration, this MUST be confirmed rather than assumed.

**Environment portability (prod-readiness)**

- **FR-020**: Each deployment definition MUST express the console subdomain, the deployment branch, the
  gateway origin, the pool ids, and the account/region as per-environment parameters, with no
  `dev`-specific literal in build logic.
- **FR-021**: Standing up the production consoles MUST be achievable by supplying production values
  (`shop.effyshopping.com`, `back-office.effyshopping.com`, the production release branch, production
  gateway origin and pools) to the same definitions, without redesigning the pipeline.
- **FR-022**: Each deployment definition MUST be expressed as code and reviewable/reproducible,
  consistent with the platform's infrastructure-as-code and operator-runs-apply mode of work; the
  operator performs any cloud-mutating or third-party-account step.

**Observability & governance**

- **FR-023**: A failed build/deploy for either console MUST be surfaced to the platform's existing
  operator alerting path (the alerts SNS topic used by 037/042), so a broken console pipeline notifies
  someone rather than only appearing in a build history nobody watches.
- **FR-024**: This slice MUST NOT deploy, expose, or alter any surface other than the two internal
  consoles, and MUST NOT create any public exposure beyond the two internal console subdomains.
- **FR-025**: Any real-world identifier or third-party connection required (e.g. the source-control
  connection authorising Amplify to read the repository) MUST be an explicit, operator-supplied input —
  never inferred from session/environment metadata — consistent with the constitution's Real-World
  Identifiers rule. The existing Amplify→GitHub connection (042) MAY be reused.

### Key Entities *(include if feature involves data)*

- **Hosted console application (×2)**: the managed Amplify representation of `apps/shop-web` and of
  `apps/back-office` — each its own source-control connection binding, monorepo app root, static-web
  platform, build settings, and SPA rewrite rule.
- **Deployment branch binding**: the mapping from a repository branch to an environment and each
  console's internal address (dev branch → dev → `shop.dev…`/`back-office.dev…`; production release
  branch → prod → `shop.effyshopping.com`/`back-office.effyshopping.com`).
- **Deployment / build record**: one build attempt per console — its commit, status, logs, and the
  resulting live version.
- **Domain association (×2)**: the binding of each console subdomain to its hosted app, including its
  TLS certificate.
- **Gateway CORS allowlist**: the shared edge gateway's set of permitted browser origins, extended to
  include the two deployed console origins.
- **Environment configuration set (per console)**: the collection of per-environment `VITE_*` values
  (pool id, client id, gateway address, optional analytics) supplied to each build, sourced from the
  platform's configuration contract.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a change is merged to the dev branch, the change is live at each affected console's
  address with **zero manual deploy commands** run by a person.
- **SC-002**: A merge-to-live cycle (build start to serving the new version) completes within **15
  minutes** for a typical console change under normal conditions.
- **SC-003**: `https://shop.dev.effyshopping.com` serves the shop console and
  `https://back-office.dev.effyshopping.com` serves the back-office console, each over a valid, trusted
  certificate for its own name, and neither resolves to the other or to the storefront.
- **SC-004**: Loading or refreshing a client-side deep-link route on either console returns that view
  (via the SPA shell), **not** a host 404.
- **SC-005**: A push touching only one console rebuilds **only** that console — the other console and
  the storefront produce **0** new deployments — and a push touching only a shared package rebuilds
  each dependent console successfully.
- **SC-006**: A build that fails a quality gate leaves that console's previously deployed version live
  — **0 broken versions** served — the failure is visible in that app's deployment history with logs,
  and it is delivered to the operator alert path.
- **SC-007**: Each deployed console signs a staff user in against the correct pool and successfully
  loads a data-backed view via the deployed gateway (**0** CORS/pre-flight failures, **0** wrong-pool
  401s from a correctly credentialed user).
- **SC-008**: No server-only secret is present in either console's delivered bundle (verified by
  inspection/sweep), and each console disallows search-engine indexing.
- **SC-009**: Standing up production requires **only** supplying production values — reviewers confirm
  **0** pipeline-logic edits are needed to target `shop.effyshopping.com` / `back-office.effyshopping.com`
  from the production branch.
- **SC-010**: The existing customer-web pipeline (042) is unchanged — the storefront still builds only
  `apps/customer-web` and still serves `dev.effyshopping.com` after this slice is applied.

## Assumptions

- **Managed platform**: AWS Amplify Hosting is the deployment target (constitution-locked), reusing the
  042 pattern — Amplify monorepo mode scoped per app root — rather than a general-purpose CI runner.
- **Static-web platform, not SSR**: both consoles are Vite SPAs, so each Amplify app uses the static
  web platform (no `WEB_COMPUTE`, no SSR service role, no SSR-role-at-create-time hazard). Each app
  needs an SPA rewrite rule (unknown path → `index.html`, 200) for client-side routing.
- **Subdomains, chosen by the operator**: shop-web → `shop.dev.effyshopping.com`; back-office →
  `back-office.dev.effyshopping.com`; production → `shop.effyshopping.com` /
  `back-office.effyshopping.com`. These are subdomains of the environment's delegated zone (010), so
  Amplify manages their Route 53 records and ACM certs in-account (same mechanism 042 used for the
  apex). No apex takeover, no email-record cutover.
- **Deployment branch model**: the same long-lived `dev` integration branch that 042 auto-deploys;
  production maps to the production release branch later. Branch names are configuration (FR-020).
- **Single-branch auto-deploy for now**: only the designated deployment branch auto-deploys; per-PR
  preview environments are out of scope (addable later without changing pipeline shape).
- **Access posture — Cognito only (default; can be revisited)**: the consoles rely on their existing
  per-pool Cognito EMAIL_OTP login as the access gate, paired with `noindex` (FR-013/FR-014). An extra
  Amplify HTTP basic-auth gate in front of the login was considered as defense-in-depth and is **not**
  included by default; it can be added later purely as configuration if the operator wants it.
- **The repo-root `amplify.yml` gains two more `applications[]` entries** (`apps/shop-web`,
  `apps/back-office`) alongside the existing `apps/customer-web` entry. This does not change what any
  app builds — each Amplify app builds only the entry matching its own `AMPLIFY_MONOREPO_APP_ROOT`;
  the 042 file's "exactly one application" comment reflected there being one surface then, and is
  superseded by the per-app-root selection rule (to be recorded in the build contract).
- **Backends are already deployed**: the shared edge gateway (004/A3) with the shop and admin
  authorizers, and the underlying services, are live in dev; this slice consumes the gateway address
  and adds the deployed origins to its CORS allowlist — it does not deploy or redesign the backend.
- **Cognito EMAIL_OTP needs no callback/allowed-origin registration**: the consoles use the Amplify
  SDK's custom-auth EMAIL_OTP against cognito-idp directly (not the Hosted UI), so no OAuth
  callback/logout URL is expected to need the new subdomains — to be confirmed during planning, not
  assumed (FR-019).
- **Configuration source**: environment values flow from the platform's existing configuration
  contract (`/effy/<env>/…` parameters and Terraform references), matching every other surface. All
  console config is browser-public `VITE_*` — no secret ships to the browser.
- **The Amplify→GitHub connection from 042 is reused**: the operator-authorised source-control token
  already exists (`/effy/dev/amplify/github_access_token`); no new third-party connection is required
  unless the operator prefers separate apps to use separate tokens.
- **Out of scope**: deploying any mobile app; changing the storefront (042) or any backend service
  logic; per-PR previews; a CDN/image redesign; creating the production environment (only ensuring the
  design reaches it trivially); adding an HTTP basic-auth gate (deferred, see access posture).

## Dependencies

- **AWS Amplify Hosting** in the platform account/region, and the existing **operator-authorised
  source-control connection** granting Amplify read access to the monorepo (FR-025) — reused from 042.
- **The dev DNS namespace** `dev.effyshopping.com` and its in-account hosted zone (010); Amplify custom
  domains front CloudFront and require the certificate in `us-east-1` — handled by Amplify's own domain
  management, as in 042.
- **The deployed shared edge gateway** (004/A3) with the shop and admin JWT authorizers, and its
  Terraform-owned CORS configuration, which this slice extends.
- **The shop and back-office Cognito pools and app clients** (001/005/007) for each console's sign-in.
- **The pnpm/Turborepo monorepo build correctness** for each single app root (Amplify does not ship
  pnpm by default; corepack pins the exact version, as 042's `amplify.yml` already establishes).
- **The platform configuration contract** (`/effy/<env>/…`) and Terraform references as the source of
  each console's `VITE_*` values.

## Notes

- This slice is the natural sequel to **042-customer-web-cicd**: same host, same monorepo mechanism,
  same operator-runs-apply mode, same alert path — but adapted to **two internal Vite SPAs** instead of
  one public Next SSR storefront. The material deltas the plan must handle: the **static-web platform**
  (no SSR role), the **SPA rewrite rule**, **subdomains instead of apex** (no email-record cutover),
  **two Amplify apps sharing one `amplify.yml`**, **gateway CORS** extension, and **`noindex`** for
  internal surfaces.
- The 042 Amplify module (`infra/modules/amplify-web-app`) currently hard-codes `WEB_COMPUTE` and an
  SSR service role, and has no SPA rewrite rule. The plan must decide whether to generalise that module
  (make platform, service role, and custom rewrite rules parameters) or introduce a static-web variant;
  either way the storefront's behaviour (FR-008/SC-010) must not change.
