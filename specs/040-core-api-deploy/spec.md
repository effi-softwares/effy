# Feature Specification: Core-API Cloud Deployment (Hot Path, Cheapest Fargate + ALB)

**Feature Branch**: `040-core-api-deploy`

**Created**: 2026-08-08

**Status**: Draft

**Input**: User description: "now let's deploy the go backend in aws. after careful consideration i think we should use fargate with alb to deploy this. otherwise it won't work as i expected! so you need to select cheapest option/attributes/configs/settings for fargate and ALB. i'm totally ok to sacrifice things over price. so select cheapest configs. then we need to attach core-api.dev.effyshopping.com, like we have in edge-api. (so when we deploy prod it should be just core-api.effyshopping.com) remember that do not have auto scaling or anything. it needs to be cheapest."

## Context & Framing

The **hot path** — the Go backend the platform calls `core-api` — is the latency-sensitive customer
backend (storefront reads, cart, checkout/payment, orders, favourites/saved items). It has been built
and proven across many slices (019, 027, 028, 029, 033…) but has **only ever run locally in Docker**.
Every "operator run pending" item that depends on it and every live customer-facing walk has been
blocked on the same missing thing: **core-api has no cloud home.** The constitution names its go-live
as its own slice; this is that slice.

This feature gives the hot path a durable, publicly reachable cloud presence at a **stable, branded
HTTPS address, one per environment** — `core-api.dev.effyshopping.com` today, `core-api.effyshopping.com`
when production is stood up — mirroring how the cold path already lives at `edge-api.dev.effyshopping.com`.
Its consumers are the **customer web storefront** (server-side rendering calls) and the **customer
mobile app** (direct calls from devices), so the address must be reachable from the public internet
over trusted TLS.

**The overriding constraint is cost.** The operator has stated, explicitly and repeatedly, that this
must be the **cheapest** viable deployment and that they are willing to **sacrifice robustness,
redundancy and elasticity for price**. Concretely that means: **a single fixed instance, no
autoscaling, the smallest compute size, and none of the optional managed extras** — accepting the
consequences (brief unavailability during a deploy or a crash, no horizontal headroom) as a deliberate
trade. The load balancer is retained (the operator's firm decision — the deployment "won't work as
expected" without it) even though it is the single largest fixed line item, because it is what provides
trusted HTTPS at a stable address and only routes traffic to a healthy instance.

**What this feature is:** an infrastructure and delivery slice. It stands up the runtime, the front
door, the branded address, the health-gated routing, secure runtime configuration, and a repeatable way
to ship a new version — **parameterised by environment** so production is the same shape with different
values. It does **not** change core-api's application behaviour, its API surface, its database schema,
or any client.

**Explicitly out of scope:** any change to the hot-path application code beyond what deployment strictly
requires (e.g. binding to the expected port, honouring a health signal); autoscaling or elasticity of
any kind; a CDN/edge cache in front of the API; the production environment's actual provisioning (this
slice makes production a **configuration change**, but standing prod up — including its distinct
apex-level hostname, certificate and private-database posture — is a separate operator action tracked as
a dependency); and the cold path, which already has its own cloud presence.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The hot path is reachable in the cloud over a trusted, branded HTTPS address (Priority: P1)

The customer web storefront (server-side) and the customer mobile app can call the hot path at a single,
stable, branded HTTPS hostname and receive real responses from the running Go backend — the same
responses they get locally today — with a valid, trusted TLS certificate and no browser or client
security warning.

**Why this priority**: This is the entire point of the slice. Without a reachable cloud address for the
hot path, every downstream customer-facing capability that has been built but "not walked live" stays
blocked. Everything else in this spec exists to make this one outcome cheap, safe and repeatable.

**Independent Test**: From outside AWS, request the service's health signal and a representative
read endpoint at `https://core-api.dev.effyshopping.com`; confirm a valid TLS handshake against a
publicly trusted certificate for that exact hostname, and a correct response body from the running
backend (not a load-balancer error page, not a certificate-name mismatch).

**Acceptance Scenarios**:

1. **Given** the deployment is live, **When** a client requests the service over HTTPS at the branded
   hostname, **Then** the TLS certificate is publicly trusted and matches the hostname exactly, and the
   running backend answers.
2. **Given** the mobile app configured for this environment, **When** it calls a hot-path endpoint,
   **Then** it reaches the same backend and receives the same contract-shaped response it received from
   the local backend, with no client-side change beyond the base URL.
3. **Given** a plain HTTP (non-TLS) request to the address, **When** it arrives, **Then** the client is
   directed to the secure address rather than served insecurely (no cleartext API responses).
4. **Given** a request for a hostname the certificate does not cover, **When** it arrives, **Then** it is
   not served as if valid (no silent wrong-certificate behaviour).

---

### User Story 2 - One address pattern, per environment, flipped by configuration only (Priority: P1)

The branded address follows a single naming pattern keyed on the environment, so bringing up a new
environment (production) yields `core-api.effyshopping.com` with the same machinery and **no application
code change and no per-environment bespoke wiring** — only environment configuration differs.

**Why this priority**: The operator called this out directly ("when we deploy prod it should be just
`core-api.effyshopping.com`"). Parity between environments is what makes dev a faithful rehearsal of
prod and keeps promotion a config change rather than a rewrite; it is also a constitution principle
(region/identifiers are config, never literals).

**Independent Test**: Inspect the deployment definition; confirm the hostname, environment name, compute
size and all environment-specific values are supplied as configuration (not hard-coded), and that
producing the production hostname requires only changing the environment's configuration, not editing
application source or the deployment templates' logic.

**Acceptance Scenarios**:

1. **Given** the dev configuration, **When** the deployment is applied, **Then** the address resolves to
   `core-api.dev.effyshopping.com`.
2. **Given** the same templates with production configuration, **When** they are read, **Then** they
   would produce `core-api.effyshopping.com` with no change to application code or template logic — only
   configuration values differ.
3. **Given** the deployment definition, **When** it is reviewed, **Then** no environment-specific literal
   (hostname, region, account, secret) is embedded in a way that a promotion would silently carry the
   wrong value; unknown required values fail loudly rather than defaulting to a guess.

---

### User Story 3 - Lowest sustainable cost, no autoscaling, documented spend (Priority: P1)

The deployment runs at the lowest sustainable cost: a **single fixed instance** of the smallest workable
compute size, **no autoscaling** and **no optional managed add-ons**, reusing shared platform resources
(database, DNS zone, certificate, secret store) rather than provisioning new ones. The recurring AWS cost
attributable to this slice is known and documented before it is applied.

**Why this priority**: Cost is the operator's stated overriding constraint and the explicit reason for
every "sacrifice" they pre-authorised. Getting the cheapest posture right (and proving no accidental
cost — no NAT gateway, no autoscaling group, no second instance, no unused managed feature) is a
first-class deliverable, not an afterthought.

**Independent Test**: Enumerate every billable resource the slice creates and confirm each is the
cheapest option that still satisfies the other requirements (single smallest instance; no autoscaling
resource exists; no NAT gateway; no redundant instance count; no optional paid feature enabled); compute
and record the expected monthly cost and confirm it is at or below the agreed target for the environment.

**Acceptance Scenarios**:

1. **Given** the deployment, **When** its resources are enumerated, **Then** exactly one running instance
   of the service exists and no autoscaling mechanism is present.
2. **Given** the deployment, **When** the network path is inspected, **Then** no cost-additive network
   component (e.g. a managed address-translation gateway) is present that the accepted dev posture does
   not require.
3. **Given** the deployment, **When** its recurring cost is estimated, **Then** the figure attributable
   to this slice (compute + load balancer + image registry) is at or below the agreed dev target and is
   recorded in the feature's documentation.
4. **Given** the cost-driven trade-offs, **When** a deploy or an instance crash occurs, **Then** a brief
   unavailability is the accepted, documented consequence (single instance, no rolling redundancy) and is
   not treated as a defect of this slice.

---

### User Story 4 - Only a healthy instance receives traffic; a bad version does not silently serve errors (Priority: P2)

The front door checks the service's health and routes customer traffic to the instance **only while it is
healthy**. A deploy that comes up unhealthy, or an instance that becomes unhealthy, is kept out of (or
taken out of) the traffic path rather than silently serving broken responses to customers.

**Why this priority**: With a single instance and no redundancy, health-gated routing is the one cheap
safety property that keeps a broken deploy from becoming a customer-visible outage-with-errors. It costs
nothing extra beyond honouring the health signal the backend already exposes.

**Independent Test**: Bring up the service in a deliberately unhealthy state (e.g. its critical dependency
unreachable); confirm the front door reports it unhealthy and does not route customer traffic to it as if
it were serving correctly; then restore health and confirm traffic resumes.

**Acceptance Scenarios**:

1. **Given** a freshly started instance whose dependencies are reachable, **When** the front door checks
   its health, **Then** it is marked healthy and begins receiving traffic.
2. **Given** an instance that has become unhealthy, **When** the front door next checks it, **Then** it is
   removed from the traffic path within a bounded, documented interval.
3. **Given** a new version that comes up failing its health signal, **When** it is deployed, **Then** it
   does not replace the traffic-serving state with a broken one silently (the failure is observable, not
   masked as success).

---

### User Story 5 - Runtime configuration and secrets delivered securely, never baked in (Priority: P2)

The running service receives everything it needs to run in this environment — database connection, payment
provider secret, authentication issuer settings, region and other environment values — **from the
platform's existing configuration and secret contract at runtime**, with **no secret material baked into
the shipped image or exposed in logs**.

**Why this priority**: The hot path holds the most sensitive material on the platform (the payment
provider secret, database credentials). Deployment must not become the place those leak. Reusing the
existing SSM/secret contract also keeps the slice cheap (no new secret store) and consistent with how the
cold path is already configured.

**Independent Test**: Inspect the shipped image and the running instance's logs for secret material;
confirm none is present in the image or emitted to logs, and that the service reads its secrets and
configuration from the existing platform contract at start-up, resolving the correct per-environment
values.

**Acceptance Scenarios**:

1. **Given** the shipped image, **When** it is inspected, **Then** it contains no secret values (database
   password, payment secret, tokens) — secrets are supplied to the running instance at runtime.
2. **Given** the running service, **When** it starts, **Then** it resolves its database, payment,
   authentication and region configuration from the existing per-environment platform contract.
3. **Given** the service's logs, **When** they are reviewed, **Then** no secret material (payment secret,
   database credentials, tokens, one-time codes) appears.

---

### User Story 6 - Repeatable, operator-run deploy that ships a new version (Priority: P3)

The operator can build the backend for the target architecture, publish it, and roll a new version into
the running environment through a documented, repeatable flow, and can bring the whole thing up from
nothing on a clean environment following a written runbook. Risky, live-AWS steps remain the operator's to
run by hand (per the platform's mode of work).

**Why this priority**: A one-off hand-built deployment is not a deliverable; a repeatable, documented flow
is what makes production promotion and future updates tractable. It is P3 because the first live bring-up
(US1) is what unblocks the platform; repeatability hardens it immediately after.

**Independent Test**: Following the runbook on a clean environment, an operator provisions the deployment,
publishes an image, and reaches a healthy live service at the branded address; then publishes a second
version and rolls it in, confirming the new version serves without manual, undocumented steps.

**Acceptance Scenarios**:

1. **Given** a clean environment and the runbook, **When** the operator follows it end to end, **Then**
   they reach a healthy, reachable service at the branded HTTPS address.
2. **Given** a running deployment, **When** the operator publishes and rolls in a new version, **Then**
   the new version serves traffic and the previous one is retired, via documented steps.
3. **Given** the platform's mode of work, **When** the slice is delivered, **Then** all steps that
   provision or mutate live AWS are handed to the operator as exact commands rather than run automatically.

---

### Edge Cases

- **Deploy / crash gap.** With a single instance and no redundancy, a deploy or a crash causes a brief
  window where the service is unavailable. This is the accepted, documented cost trade — not a defect.
  During that window the front door returns an honest error, never a stale or insecure response.
- **Unhealthy start-up (dependency down).** If the database or another critical dependency is unreachable
  at start-up, the instance reports unhealthy and is kept out of the traffic path rather than serving
  errors as if healthy.
- **Certificate / hostname mismatch.** A request for a hostname not covered by the environment's
  certificate must not be served as if valid.
- **Long-running request.** A slow but legitimate request (e.g. a checkout round-trip) must not be
  severed by an unreasonably short front-door timeout; the front door's timeout must accommodate the
  hot path's real request durations.
- **Wrong-architecture image.** An image built for the wrong CPU architecture must fail the deploy
  loudly (health never goes green), not run degraded or crash-loop silently.
- **Production hostname differs in shape.** Production's address sits directly under the platform apex
  (`core-api.effyshopping.com`), not under a `prod.` child namespace like dev's — so production needs its
  own certificate coverage and apex-level DNS record. This is a known production dependency, flagged, not
  solved here.
- **Production database is private.** The accepted cheap dev posture (public database, no NAT) is
  explicitly invalid for production; production must reach a private database over a private path, which
  changes production's network cost and shape. Flagged as a production dependency, not solved here.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The hot-path backend MUST run in the cloud as a continuously running service reachable from
  the public internet (its consumers include mobile devices and server-side web rendering).
- **FR-002**: The service MUST be reachable over HTTPS at a single stable hostname per environment,
  following the pattern `core-api.<environment-namespace>` — `core-api.dev.effyshopping.com` for dev and
  `core-api.effyshopping.com` for production.
- **FR-003**: The HTTPS certificate MUST be publicly trusted and match the served hostname exactly; a
  request to an uncovered hostname MUST NOT be served as if valid.
- **FR-004**: Plain HTTP requests to the address MUST NOT return API responses in cleartext; they MUST be
  redirected to the secure address.
- **FR-005**: The deployment MUST run **exactly one** instance of the service with a **fixed** instance
  count and MUST NOT include any autoscaling mechanism.
- **FR-006**: The deployment MUST use the **smallest compute size** that runs the service acceptably, and
  MUST NOT enable optional paid features that are not required by another requirement here.
- **FR-007**: The deployment MUST NOT provision cost-additive components the accepted environment posture
  does not require (specifically: no address-translation/NAT gateway in dev, no redundant instance, no
  second availability-zone instance, no CDN).
- **FR-008**: The front door MUST route customer traffic to the instance **only while it reports
  healthy**, using the health signal the backend already exposes, and MUST remove an unhealthy instance
  from the traffic path within a bounded, documented interval.
- **FR-009**: A newly deployed version that fails its health signal MUST NOT silently become the
  traffic-serving state; its failure MUST be observable.
- **FR-010**: The front-door request timeout MUST accommodate the hot path's real request durations
  (including checkout round-trips) and MUST NOT impose a limit shorter than the backend needs.
- **FR-011**: The running service MUST obtain its per-environment configuration and secrets (database
  connection, payment provider secret, authentication issuer settings, region) from the platform's
  **existing** configuration/secret contract at runtime; it MUST NOT introduce a new secret store.
- **FR-012**: No secret material MUST be baked into the shipped image or emitted to logs.
- **FR-013**: The deployment MUST reuse shared platform resources where they exist (the environment's DNS
  zone, its wildcard certificate, the database, the secret/parameter contract) rather than duplicating
  them.
- **FR-014**: Every environment-specific value (hostname, environment name, region, account, compute
  size, secret references) MUST be supplied as configuration; producing the production deployment MUST
  require **only** changing environment configuration, not editing application source or the deployment
  templates' logic. Where a required value is unknown, configuration MUST fail loudly rather than default
  to a guess (constitution: Real-World Identifiers).
- **FR-015**: The build MUST produce an image for the **target CPU architecture**; a wrong-architecture
  image MUST fail the deploy loudly (never go healthy) rather than run degraded.
- **FR-016**: The slice MUST provide a documented, repeatable operator runbook covering first bring-up on
  a clean environment and rolling in a subsequent version.
- **FR-017**: All steps that provision or mutate live AWS (applying infrastructure, publishing images,
  rolling deployments) MUST be handed to the operator as exact commands, not executed automatically
  (platform mode of work).
- **FR-018**: The deployment MUST NOT alter the hot path's API surface, database schema, or any client;
  the only application-side changes permitted are those strictly required to run in the cloud (e.g.
  binding to the expected port, honouring the health signal, reading runtime config from the existing
  contract).
- **FR-019**: The service MUST NOT be publicly reachable other than through the front door on its intended
  secure port(s); the running instance MUST NOT expose its application port directly to the public
  internet.
- **FR-020**: The recurring AWS cost attributable to this slice MUST be estimated and recorded in the
  feature's documentation before it is applied, and MUST be at or below the agreed environment target.

### Key Entities *(include if feature involves data)*

- **Deployed service instance**: the single running copy of the hot-path backend in an environment;
  attributes: environment, compute size (fixed, smallest workable), health state, version.
- **Front door (load balancer)**: the internet-facing entry point that terminates TLS, redirects
  cleartext, health-checks the instance and routes only healthy traffic; attributes: hostname, certificate,
  health-check target, timeout.
- **Branded address**: the per-environment hostname (`core-api.<namespace>`) resolving to the front door,
  backed by the environment's certificate.
- **Image**: the shipped, architecture-specific build artefact of the backend, free of secret material;
  attributes: version/tag, target architecture.
- **Runtime configuration/secret references**: the per-environment values (database, payment secret, auth
  issuers, region) resolved from the existing platform contract at start-up — referenced, never embedded.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A client outside AWS can reach the hot path over HTTPS at `core-api.dev.effyshopping.com`,
  completing a valid TLS handshake against a publicly trusted certificate for that exact hostname and
  receiving a correct response from the running backend.
- **SC-002**: The customer mobile app and the customer web storefront (server-side) both successfully call
  the hot path in the environment with **no application-code change beyond the base URL**.
- **SC-003**: Producing the production deployment requires changing **only** environment configuration —
  reviewers confirm zero application-source or template-logic edits are needed to yield
  `core-api.effyshopping.com`.
- **SC-004**: Exactly **one** running instance exists and **no** autoscaling resource is present; an audit
  of billable resources finds no NAT gateway, no redundant instance and no optional paid feature enabled.
- **SC-005**: The recurring AWS cost attributable to the slice in dev is at or below the agreed target and
  is recorded in the feature documentation.
- **SC-006**: When the instance is made unhealthy, the front door stops routing customer traffic to it
  within the documented interval; when health is restored, traffic resumes — observed, not inferred.
- **SC-007**: A plain HTTP request to the address is redirected to HTTPS; no API response is ever served in
  cleartext.
- **SC-008**: Inspection of the shipped image and the running instance's logs finds **no** secret material
  (payment secret, database credentials, tokens, one-time codes).
- **SC-009**: Following the runbook on a clean environment, an operator reaches a healthy live service at
  the branded address and then rolls in a second version, with no undocumented manual steps.
- **SC-010**: A request for a hostname the certificate does not cover is not served as if valid, and a
  legitimate long-running request (checkout round-trip) completes without being severed by a front-door
  timeout.

## Assumptions

- **Dev is the immediate deliverable; production is a configuration-ready follow-on.** This slice brings
  the hot path live in **dev** at `core-api.dev.effyshopping.com` and makes production a configuration
  change. Actually standing production up — including its apex-level hostname/certificate and its
  mandatory private-database network posture — is a separate operator action, tracked as a dependency.
- **The load balancer is retained by operator decision**, despite being the largest fixed cost, because it
  provides trusted HTTPS at a stable address and health-gated routing. It is not to be replaced with a
  cheaper front door in this slice.
- **Robustness is knowingly traded for cost.** A single fixed instance with no autoscaling and no
  redundancy means a deploy or crash causes brief unavailability. The operator has pre-authorised this
  trade ("totally ok to sacrifice things over price").
- **Reuse of existing shared resources.** The environment's DNS zone and its already-issued regional
  wildcard certificate (which covers `core-api.<namespace>` as a single label in dev), the existing
  database, and the existing SSM/secret parameter contract are reused as-is — no new zone, certificate,
  database or secret store is created for dev.
- **The dev cheap network posture is the already-accepted one.** Dev's database is reachable over its
  public endpoint (forced TLS), so the running instance can reach it **without a NAT gateway** — the
  cheapest network path, and the same accepted dev trade the cold path already relies on. This posture is
  explicitly **not** valid for production.
- **The backend already exposes the primitives deployment needs**: a health signal (liveness/readiness)
  the front door can check, a well-known listening port, and configuration read from the existing platform
  contract. Any gap here is closed with the minimal application change permitted by FR-018.
- **Region and identifiers are configuration.** The environment, region and hostname flow from the
  existing configuration contract, never hard-coded; unknown required values fail loudly.
- **No new outward-facing identifier is invented** (constitution: Real-World Identifiers). Only the
  approved platform namespaces/hostnames and operator-supplied values are used.

## Dependencies

- **Production bring-up (out of scope here):** production's apex-level hostname `core-api.effyshopping.com`
  needs certificate coverage at the apex and an apex-level DNS record, and production must run against a
  **private** database over a private network path (no public DB, no `0.0.0.0/0`). These change
  production's cost and network shape and are the subject of the production promotion action.
- **The environment's DNS namespace and wildcard certificate** must already exist (dev's do).
- **The platform configuration/secret contract** must already hold this environment's hot-path values
  (database connection, payment provider secret, authentication issuer settings, region). Any missing
  value is supplied by the operator, not guessed.
- **Operator-run live-AWS steps** (infrastructure apply, image publish, deployment roll) per the platform
  mode of work.
