# Feature Specification: Customer Storefront Continuous Deployment (dev)

**Feature Branch**: `042-customer-web-cicd`

**Created**: 2026-08-09

**Status**: Draft

**Input**: User description: "as the next spec i would like to create CI/CD for customer-web app. so when we push/merged to dev branch we need to deploy customer web app in amplify with domain dev.effyshopping.com note that this is a mono repo you need find the best way to setup CI/CD for this. do not deploy any other web apps. do a research in the internet and find the standard way to do this! note that when we create prod enviroment this should deploy to effyshopping.com easyly"

## Context & Constraints (decision-locked facts, not choices made here)

This slice does not re-decide platform infrastructure; it consumes what the constitution and prior
slices already locked, and the spec is written against those facts:

- **Managed hosting is AWS Amplify Hosting** (constitution: "Infra … Amplify Hosting"). The
  customer storefront is the platform's **first hosted web deployment** — until now `customer-web`
  has been **local-only** (its own `package.json` says "LOCAL-ONLY this slice (no hosted deploy)").
- **The repository is a monorepo** (Turborepo + pnpm; `apps/customer-web` is one workspace member
  alongside `apps/shop-web`, `apps/back-office`, three KMP apps, and shared packages).
- **`dev.effyshopping.com` already exists** as this environment's delegated DNS namespace (010), and
  its **zone apex currently resolves to the shared API gateway** — A/AAAA alias records added by 037
  purely so the email *sender* domain resolves (RFC 5321 §2.3.5). Those records serve API 404s and
  were explicitly marked "NOT A WEBSITE … a real landing page is out of scope." This slice provides
  that website.
- **The hot path is deployed** (040) at `core-api.dev.effyshopping.com`, so the storefront's product
  reads have a real cloud origin to point at — a precondition for a hosted storefront to function.
- **The apex `effyshopping.com` is production's and reserved.** Every environment owns a delegated
  child namespace. Production deployment must reach the apex with the same shape used here for the
  child namespace.
- **Mode of work**: the platform is built spec-first with all infrastructure expressed as code; the
  operator runs every outward-facing / cloud-mutating step. This slice authors the deployment
  definition; it does not itself provision cloud resources or connect third-party accounts.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The storefront redeploys automatically when the dev branch advances (Priority: P1)

A change lands on the repository's **dev integration branch** (by direct push or by a merge). Without
anyone running a manual deploy command, the customer storefront is rebuilt from that exact commit and
the new version is served at the environment's public storefront address. The person who merged can
watch the build progress to completion and see the result live shortly after.

**Why this priority**: This is the entire point of the feature — the customer storefront moves from a
laptop-only application to a continuously delivered public site. Nothing else in the slice has value
without it. It is also the MVP: even if every later refinement is dropped, "merge to dev → the site
updates itself" is a complete, demonstrable capability.

**Independent Test**: Merge a visible, harmless change (e.g. a copy tweak on the home page) into the
dev branch; confirm a build starts automatically, completes, and the change is visible at the
storefront address without any manual deploy step.

**Acceptance Scenarios**:

1. **Given** a working storefront deployed from commit A, **When** commit B is pushed/merged to the
   dev branch, **Then** a new build is triggered automatically for commit B and, on success, commit
   B is what the public storefront serves.
2. **Given** an in-progress deployment, **When** the operator looks at the deployment history,
   **Then** they can see the commit, the build status (running / succeeded / failed), and the build
   logs for that attempt.
3. **Given** a build that fails (e.g. a type error), **When** the build fails, **Then** the
   previously deployed working version remains live and unchanged, and the failure is visibly
   reported (not silently swallowed).

---

### User Story 2 - The storefront is served at the environment's branded address over HTTPS (Priority: P1)

A visitor navigates to the environment's storefront address (`dev.effyshopping.com`) and reaches the
Effy customer storefront over a valid, trusted HTTPS connection — not an API 404, and not an
un-branded provider-generated hostname.

**Why this priority**: A CI/CD pipeline that publishes to an anonymous, throwaway URL does not
deliver the requested outcome. The branded address on a trusted certificate is half of what the user
asked for, and it is the piece that makes the deployment usable by real people and by the rest of the
platform (e.g. links in email). It also reconciles a real conflict: the apex today points at the API.

**Independent Test**: In a browser, visit `https://dev.effyshopping.com` and confirm the Effy
storefront home page loads over a valid certificate; confirm the certificate covers the storefront
address; confirm the address no longer resolves to the API gateway's 404 for storefront paths.

**Acceptance Scenarios**:

1. **Given** the storefront is deployed, **When** a visitor requests `https://dev.effyshopping.com`,
   **Then** the storefront home page is served over HTTPS with a certificate valid for that name.
2. **Given** the apex previously resolved to the API gateway (email-resolution alias), **When** the
   storefront takes over the apex, **Then** the sender-domain-must-resolve property required by email
   deliverability is still satisfied (the name still resolves to a live, valid endpoint).
3. **Given** a request to a non-`www` and a `www` form of the address, **When** the visitor uses
   either, **Then** both reach the storefront (one canonical, the other redirecting to it), with no
   certificate warning.

---

### User Story 3 - Only the customer storefront is built and deployed (Priority: P1)

A change is pushed to the dev branch. The deployment pipeline builds and publishes **only**
`apps/customer-web`. The other web surfaces (`shop-web`, `back-office`) and the mobile apps are **not**
built, **not** deployed, and are unaffected — including when a push touches files that only belong to
those other surfaces or to shared packages.

**Why this priority**: The user stated this explicitly ("do not deploy any other web apps"). In a
monorepo, the default behaviour of a naïve connection is to build from the repository root and
deploy whatever it finds. Getting the monorepo scoping right is what prevents the pipeline from
shipping internal consoles to the public internet — a correctness and security requirement, not a
nicety.

**Independent Test**: Push a change that only edits `apps/back-office`; confirm no customer-web
deployment is produced for the internal consoles and no console is exposed at the storefront address.
Then push a change touching a **shared package** that customer-web depends on; confirm customer-web
rebuilds correctly (the shared dependency is resolved during its build).

**Acceptance Scenarios**:

1. **Given** the pipeline is connected to the monorepo, **When** any push to the dev branch occurs,
   **Then** the artifact built and published is `apps/customer-web` and no other web surface.
2. **Given** `customer-web` depends on shared workspace packages, **When** it is built in the
   pipeline, **Then** those shared packages are resolved and compiled correctly (the build is not
   broken by monorepo/workspace resolution).
3. **Given** a push that changes only files under `apps/shop-web` or `apps/back-office`, **When** the
   pipeline evaluates it, **Then** no internal-console content is ever published to the public
   storefront address.

---

### User Story 4 - Production reaches the apex the same way, by configuration not rework (Priority: P2)

When the production environment is created later, the same deployment definition is reused with
production values so the storefront is served at the reserved apex `effyshopping.com`, driven by the
production release branch — with no redesign of the pipeline and no per-environment special-casing in
code.

**Why this priority**: The user called this out ("when we create prod environment this should deploy
to effyshopping.com easily"). It does not need to *run* in this slice (there is no production
environment yet), but the design must not paint prod into a corner. It is P2 because it is a
design-integrity requirement realised now and exercised later.

**Independent Test**: Review the deployment definition and confirm every environment-specific value
(the domain, the deployment branch, the backend origins, the account/region) is a parameter, not a
hard-coded literal; confirm producing the production deployment is a matter of supplying production
values, not editing pipeline logic.

**Acceptance Scenarios**:

1. **Given** the deployment definition, **When** it is read, **Then** the storefront address, the
   deployment branch, and every backend origin are configuration inputs with no literal
   `dev`/`dev.effyshopping.com` baked into build logic.
2. **Given** a future production environment, **When** it is stood up with production values, **Then**
   the storefront deploys to `effyshopping.com` from the production release branch using the same
   pipeline shape as dev.

---

### User Story 5 - The deployed storefront talks to the right backends and carries the right public settings (Priority: P2)

The hosted storefront reaches the deployed hot path (product/catalog/search/cart/checkout) and the
cold path (customer profile), authenticates against the correct customer identity pool, and reports
its own public address as its canonical site URL — all from environment configuration, with no
secret embedded in the code shipped to browsers.

**Why this priority**: A deployment that loads but cannot fetch products, sign a customer in, or emit
correct absolute links is not actually delivered. The storefront already reads every backend address
from configuration (by design, FR-029 of 011); this slice must supply the *deployed* values instead
of the localhost ones. It is P2 because P1 proves the pipeline exists; this proves the deployed site
is functional.

**Independent Test**: On the live storefront, browse the catalogue (hot path), attempt a customer
sign-in flow (identity pool), and inspect a canonical link / sitemap URL to confirm it uses the
public storefront address rather than `localhost`.

**Acceptance Scenarios**:

1. **Given** the deployed storefront, **When** it renders the catalogue, **Then** it fetches from the
   deployed hot-path origin (`core-api.dev.effyshopping.com`), not a local address.
2. **Given** the deployed storefront, **When** it generates canonical URLs, OG tags, and the sitemap,
   **Then** they use `https://dev.effyshopping.com`, not `http://localhost:3000`.
3. **Given** the code delivered to a browser, **When** it is inspected, **Then** it contains only
   values intended to be public (e.g. the publishable payment key, the identity pool id) and no
   server-only secret (e.g. any shared secret used by server-side routes).

---

### Edge Cases

- **A build fails** (type error, failed test gate, dependency resolution failure): the last good
  deployment stays live; the failure is reported with logs; no partial or broken version is served.
- **A push touches only non-customer-web files**: the public storefront is never replaced by, nor
  augmented with, any other surface's content (US3).
- **The dev branch does not yet exist / the default branch is `main`**: the branching model must be
  stated and the deployment branch made explicit, so "merge to dev" is unambiguous (see Assumptions).
- **The apex is mid-cutover** from API-gateway alias to storefront: there must be no window where the
  sender domain stops resolving (email deliverability depends on it), and no window where the
  storefront address is publicly claimable by nothing.
- **A concurrent double-merge** (two commits land close together): the latest successful build is what
  ends up live; an older, slower build cannot overwrite a newer one.
- **Backend origin is temporarily unreachable** at deploy time (e.g. hot path cold-starting): the
  storefront still deploys and serves its static/cached shell; it does not fail the deployment because
  a downstream API was briefly slow.
- **A secret needed by the build/runtime is missing** (e.g. the server-side revalidate secret): the
  affected server route fails loudly with a clear "not configured" response rather than accepting an
  unauthenticated caller or shipping a placeholder.
- **A pull request preview** is opened: this slice does not promise per-PR preview environments;
  such a push must not deploy to the environment's public address.

---

## Requirements *(mandatory)*

### Functional Requirements

**Trigger & pipeline**

- **FR-001**: A push or merge to the environment's designated deployment branch (dev: the `dev`
  integration branch) MUST automatically trigger a build-and-deploy of the customer storefront from
  that exact commit, with no manual deploy step.
- **FR-002**: Each deployment attempt MUST record the source commit, its status (running / succeeded
  / failed), and retrievable build logs.
- **FR-003**: A failed build MUST leave the previously deployed working version live and unchanged,
  and MUST surface the failure (it MUST NOT publish a broken artifact or fail silently).
- **FR-004**: The latest successful build for the deployment branch MUST be the version served; a
  slower, older build MUST NOT overwrite a newer successful one.
- **FR-005**: The build MUST run the storefront's existing quality gates (at minimum type-check and
  its test/bundle-budget checks) such that a failing gate fails the deployment rather than shipping.

**Monorepo scoping**

- **FR-006**: The pipeline MUST build and publish **only** `apps/customer-web`. `shop-web`,
  `back-office`, and the mobile apps MUST NOT be built or deployed by this pipeline.
- **FR-007**: The build MUST correctly resolve and compile the shared workspace packages that
  `customer-web` depends on (design-system, shared-types, api-client) within the monorepo's package
  manager / workspace layout.
- **FR-008**: A push that changes only files outside `apps/customer-web` and its dependency graph MUST
  NOT result in any non-customer-web content being served at the public storefront address.

**Address, TLS & DNS**

- **FR-009**: The deployed storefront MUST be served at the environment's branded storefront address
  (dev: `dev.effyshopping.com`) over HTTPS with a trusted certificate valid for that name.
- **FR-010**: Both the bare and `www` forms of the address MUST reach the storefront with no
  certificate warning; one MUST be canonical and the other MUST redirect to it.
- **FR-011**: The storefront taking over the environment's zone apex MUST preserve the property that
  the sender domain resolves to a live, valid endpoint (required by email deliverability, 037), with
  no window during cutover in which the name stops resolving.
- **FR-012**: The existing apex A/AAAA alias records that point the environment's domain at the API
  gateway MUST be reconciled (replaced or superseded) so the storefront, not an API 404, answers
  storefront requests — while the separate API address (`api.dev.effyshopping.com` /
  `core-api.dev.effyshopping.com`) continues to resolve to the API unchanged.

**Configuration & secrets**

- **FR-013**: Every environment-specific value the storefront needs — public storefront URL, hot-path
  origin, cold-path origin, customer identity pool id and client id, publishable payment key,
  analytics keys, and any server-side secret — MUST be supplied to the build/runtime as configuration,
  not hard-coded, consistent with the storefront's existing "backend addresses are configuration"
  rule.
- **FR-014**: The deployed storefront MUST point at the **deployed** backends: the hot path at
  `core-api.dev.effyshopping.com` and the cold path at the environment's edge API address — not at any
  localhost value.
- **FR-015**: The storefront MUST report its own public address (`https://dev.effyshopping.com`) as
  its canonical site URL for canonical links, OG tags, and the sitemap.
- **FR-016**: No server-only secret MUST be embedded in the code delivered to browsers; only
  values intended to be public may appear in the client bundle.
- **FR-017**: Any server-side route that requires a secret (e.g. the cache-revalidation route) MUST
  fail loudly ("not configured") when that secret is absent, rather than accepting an unauthenticated
  request or using a guessed value.

**Environment portability (prod-readiness)**

- **FR-018**: The deployment definition MUST express the storefront address, the deployment branch,
  the backend origins, and the account/region as per-environment parameters, with no `dev`-specific
  literal in build logic.
- **FR-019**: Standing up the production deployment MUST be achievable by supplying production values
  (apex `effyshopping.com`, the production release branch, production backend origins) to the same
  deployment definition, without redesigning the pipeline.
- **FR-020**: The deployment definition MUST be expressed as code and reviewable/reproducible,
  consistent with the platform's infrastructure-as-code and operator-runs-apply mode of work; the
  operator performs any cloud-mutating or third-party-account step.

**Governance & isolation**

- **FR-021**: This slice MUST NOT deploy, expose, or alter any surface other than the customer
  storefront, and MUST NOT create any public exposure of the internal consoles.
- **FR-022**: Any real-world identifier or third-party connection required (e.g. the source-control
  connection authorising the hosting platform to read the repository) MUST be an explicit,
  operator-supplied input — never inferred from session/environment metadata — consistent with the
  constitution's Real-World Identifiers rule.

### Key Entities *(include if feature involves data)*

- **Hosted storefront application**: the managed representation of `apps/customer-web` on the hosting
  platform — its source-control connection, its monorepo app root, and its build settings.
- **Deployment branch binding**: the mapping from a repository branch to an environment and its public
  address (dev branch → dev → `dev.effyshopping.com`; production release branch → prod →
  `effyshopping.com`).
- **Deployment / build record**: one build attempt — its commit, status, logs, and the resulting live
  version.
- **Domain association**: the binding of the environment's storefront address (apex + `www`) to the
  hosted application, including its TLS certificate.
- **Environment configuration set**: the collection of per-environment values (URLs, pool ids, keys,
  secrets) supplied to the build/runtime, sourced from the platform's configuration contract.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: After a change is merged to the dev branch, the change is live at
  `https://dev.effyshopping.com` with **zero manual deploy commands** run by a person.
- **SC-002**: A merge-to-live cycle (build start to serving the new version) completes within **15
  minutes** for a typical storefront change under normal conditions.
- **SC-003**: `https://dev.effyshopping.com` serves the Effy storefront home page over a valid,
  trusted certificate, and does **not** return the API gateway's 404 for storefront paths.
- **SC-004**: A push that touches only `shop-web` or `back-office` results in **no** internal console
  being reachable at the public storefront address (0 exposed consoles).
- **SC-005**: A build that fails a quality gate leaves the previously deployed version live —
  **0 broken versions** served — and the failure is visible in the deployment history with logs.
- **SC-006**: The deployed storefront successfully loads catalogue data from the deployed hot path and
  produces canonical links using the public storefront address (no `localhost` reachable in
  browser-delivered code or generated URLs).
- **SC-007**: No server-only secret is present in the browser-delivered bundle (verified by
  inspection/sweep of the deployed client assets).
- **SC-008**: Standing up production requires **only** supplying production values — reviewers confirm
  **0** pipeline-logic edits are needed to target `effyshopping.com` from the production branch.
- **SC-009**: Throughout the apex cutover, the environment's domain resolves continuously to a live,
  valid endpoint (email sender-domain resolution is never broken).

## Assumptions

- **Managed platform**: AWS Amplify Hosting is the deployment target (constitution-locked). "Best way
  to set up CI/CD for a monorepo" is therefore realised as Amplify Hosting's monorepo mode scoped to a
  single app root, rather than a general-purpose CI runner — this is the vendor-standard approach for
  Amplify + Turborepo/pnpm monorepos and keeps build, deploy, TLS, and custom-domain management in one
  managed system.
- **Deployment branch model**: a long-lived `dev` integration branch maps to the dev environment; the
  repository's current default branch is `main`. The production release branch (assumed `main`, or a
  dedicated `production` branch) maps to production later. The exact branch names are configuration
  (FR-018); if the operator prefers a different mapping, only values change.
- **Single-branch auto-deploy for now**: only the designated deployment branch auto-deploys. Per-pull-
  request preview environments are **out of scope** for this slice (they can be added later without
  changing the pipeline's shape).
- **Backends are already deployed**: the hot path (040, `core-api.dev.effyshopping.com`) and the cold
  path (edge API) are live in dev; this slice consumes their addresses and does not deploy or modify
  them.
- **Apex is the storefront's home**: the storefront takes over the zone apex (`dev.effyshopping.com`),
  superseding the API-gateway alias records that existed only for email resolution; the API keeps its
  own `api.`/`core-api.` subdomains.
- **Configuration source**: environment values flow from the platform's existing configuration
  contract (the `/effy/<env>/…` parameter contract and the platform secret store), matching how every
  other surface is wired; browser-public values are marked public and server-only secrets are not.
- **This slice unblocks 039's site-URL gap**: 039's newsletter double-opt-in link needs a real
  `/effy/dev/web/site_url`; giving the storefront a public address here supplies it.
- **Out of scope**: deploying `shop-web`, `back-office`, or any mobile app; per-PR previews; a CDN/image
  optimization redesign; changing any backend; creating the production environment (only ensuring the
  design reaches it trivially).

## Dependencies

- **AWS Amplify Hosting** availability in the platform account/region, and an **operator-authorised
  source-control connection** granting Amplify read access to the monorepo (an out-of-code operator
  step, like the domain registrar — FR-022).
- **The dev DNS namespace** `dev.effyshopping.com` and its wildcard/managed certificate posture (010);
  Amplify custom domains front CloudFront and require the certificate in `us-east-1` — handled by
  Amplify's own domain management (decision-locked note in the constitution).
- **The deployed hot path** (040) and **cold path** edge API for the storefront to be functional once
  hosted.
- **The pnpm/Turborepo monorepo build correctness** for a single app root (Amplify does not ship pnpm
  by default and expects monorepo/workspace configuration) — a build-configuration dependency the
  plan must satisfy.
- **The platform configuration contract** (`/effy/<env>/…`) and secret store as the source of the
  storefront's environment values.

## Notes

- ⚠ **Numbering**: `apps/customer-web/.env.example` contains a stray reference to "042 home composer"
  (a `REVALIDATE_SECRET` / `/api/revalidate` block) but **no `specs/042` directory or spec exists** for
  it. This feature took `042` as the next available number per the deterministic numbering rule. If the
  operator intends `042` for a different feature, this directory can be renumbered before planning.
