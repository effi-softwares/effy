# Feature Specification: Backend Service Foundations (Dual-Path Bootstrap)

**Feature Branch**: `004-backend-bootstrap`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "as for the next spec we need to boostrap the backend. for this platfrom i am thinking of having two separate backends. 1) go server --> which i hope to call core-api 2) aws lambda serverelss functions behind the AWS API Gateway --> i hope to call it edge-api. core-api: this api will be use to serve the apis that is MUST be resolve very fast for lot's of users. reliable high preformace, low latency apis. for example loading all the prodcuts in customer app/webapp, serching and filter. edge-api: will be use to serve the apis that not nessary server very fast, which we can compromize the speed over cost. the apis that does not need work in low latency MUST written in edge-api. for example: changing profile data, or all the back-office tasks etc... for the core-api: we should use a go with following technolgoies: go, Gin, gin-contrib/cors, go.uber.org/zap, google/uuid, joho/godotenv, caarlos0/env/v11, MicahParks/keyfunc/v3, golang-jwt/jwt/v5, pgx/v5, AWS SDK for Go v2, AWS SDK — Cognito Identity Provider. for the edge-api: we should use serverless framework 3.4 with TypeScript, postgres, pino, and with AWS api gateway. both core-api and edge-api services should be strictly use clean architecture, and should separate concern into files in nessary places. for core-api, we can initailly run in locally in a docker and in later i hope to deploy to fargate. but we do not need to setup it right now! but we can deploy the edge-api in AWS Lambda and use API gateway to do the REST api calls. NOTE that both core and edge apis are REST apis. do a deep dive in internet and find good architectures, industry practices and write the spec to create very professional, industry ready, standard codebases."

**Input (addendum, same session)**: "also we need to think about how we can have versioning for each and every api endpoint in both core and edage api. sincce we have mobile app we need to have api versionning so that backend can serve all the apps that are updated or not updated at same time" — "so research on ow industry do api verssioning and follow that architecture here!"

**Input (addendum, 2026-07-08 — cold-path decomposition revision)**: "i want to change the architecture of edge-api. currently … everything is served in one serverless yml file. i want to divide the edge api into multiple services (like admin, store). … AWS api gateway which is the www.edge-api/… and multiple services like www.edge-api/<service name>/… each api is one serverless yml file and API gateway manages the request. move core-api out of services into an apis folder (./apis/core-api), edge-api in apis/edge-api with multiple services inside; follow layered clean architecture separating the services for edge-api." (Verbatim tech specifics recorded in operator-directives.md.)

> Technology-specific directives from the description (service names, stacks, deployment
> targets, and the internet research mandates — including the API-versioning research **and the
> 2026-07-08 cold-path decomposition**) are recorded verbatim in
> [operator-directives.md](./operator-directives.md) as **plan-phase input** — this spec stays
> free of implementation detail per constitution Principle I.

## Clarifications

### Session 2026-07-08 (revision — cold-path decomposition)

- Q: Should the cost-optimized (cold) path be one deployable service, or several? → A: **Several
  independently deployable domain services behind one shared public entry point.** This slice is
  revised so the cost-optimized path is a *family* of services split **by domain** (e.g., an
  administrative/back-office domain, a store/operator domain), each its own independently
  deployable unit, all fronted by **one** stable public entry point that routes each request to
  its owning service by a per-service path segment (`<entry-point>/<service>/…`). Rationale: the
  cold path serves several audiences with different change/deploy lifecycles; decomposing now —
  before endpoints accumulate in one deployable — avoids a costly later migration and shrinks each
  deploy's blast radius. The latency-critical (hot) path stays a **single** service. The backend
  codebases are also reorganized under one consistent top-level home with a uniform per-service
  layout. (Tech specifics — folder names, shared-gateway/authorizer sharing, path/version scheme —
  are plan-phase input in [operator-directives.md](./operator-directives.md).)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Latency-critical service foundation runs locally, end to end (Priority: P1)

The platform gains its first backend service: the foundation for all latency-critical,
high-traffic customer functionality (the future home of catalog browsing, search, and
checkout reads). A developer clones the repository, follows the documented prerequisites,
and starts the service on their own machine with a single command in an isolated,
reproducible local runtime. Once running, a health check answers and reports whether the
service's dependencies (the development database) are reachable, and a minimal proving
endpoint travels the complete internal path — thin edge, business logic, data access — to
the development database and back. Every handled request produces a structured, correlated
log record. The codebase itself is the deliverable: it exhibits the platform's binding
layered shape so every future feature has an established groove to follow.

**Why this priority**: This service is the spine of the customer experience and the
reference implementation of the platform's architecture rules. Nothing customer-facing can
be built until this foundation exists, runs, and demonstrably reaches the database through
all of its layers.

**Independent Test**: From a fresh clone on a machine with platform access, run the
documented start command; verify the health check reports ready, call the proving endpoint
and confirm a database round-trip, and review the codebase against the platform's
architecture reference.

**Acceptance Scenarios**:

1. **Given** a fresh repository clone and the documented prerequisites, **When** the
   developer runs the single documented start command, **Then** the service starts in its
   local isolated runtime and its health check reports ready, including database
   reachability.
2. **Given** the running service, **When** the proving endpoint is called, **Then** the
   response demonstrates a complete traversal of all three internal layers ending in a
   round-trip to the development database.
3. **Given** any handled request (success or failure), **When** it completes, **Then**
   exactly one structured log record carrying a request correlation identifier is emitted,
   containing no secret material.
4. **Given** the codebase, **When** it is reviewed against the platform's architecture
   reference, **Then** each concern — edge handling, business logic, data access,
   configuration, identity verification, logging — lives in its own clearly separated
   place with the dependency direction the platform mandates.

---

### User Story 2 - Cost-optimized path is a family of independently deployable services behind one entry point, live in dev (Priority: P2)

The platform gains its cost-optimized backend path — the latency-tolerant, pay-per-use home for
profile changes, back-office, and operator workflows. Rather than one monolithic deployable, this
path is composed of **multiple independently deployable domain services** (e.g., an
administrative/back-office domain and a store/operator domain), each owning its slice of the cold
path and each deployable on its own **without disturbing the others**. All of them sit behind
**one stable public entry point** that routes each request to its owning service by a per-service
path segment, so callers see a single coherent API surface while the platform evolves each service
independently. The operator deploys a service to the development cloud environment by a documented,
repeatable runbook; after deployment its health check and proving endpoint answer from the
internet, its request logs land in the platform's log store, and adding or redeploying one service
leaves the others untouched. Cross-cutting conventions — identity verification, the error
contract, versioning, structured logging — are shared across all services, never re-invented per
service.

**Why this priority**: The dual-path split is a constitutional commitment — the platform is not
"bootstrapped" until both paths exist. This one proves the deployed, pay-per-use path, its
**domain decomposition and independent-deploy loop**, and the operator's deployment runbook; it
builds on conventions the first service establishes.

**Independent Test**: Operator deploys the cost-optimized services to dev; from any
internet-connected machine, verify each service's health check + proving endpoint answer at the
**shared** entry point under its own path segment; redeploy ONE service and confirm the others are
undisturbed; confirm a NEW service can be added following the same pattern.

**Acceptance Scenarios**:

1. **Given** the authored services and their deployment runbook, **When** the operator deploys
   them, **Then** each is live in dev behind the **same** public entry point, reachable over
   encrypted transport under its own service path segment.
2. **Given** the deployed services, **When** each one's health check and proving endpoint are
   called from the public internet, **Then** they answer successfully and each request is captured
   as a structured log record in the platform's log store.
3. **Given** a change to **one** service, **When** the operator redeploys just that service,
   **Then** it goes live repeatably **without** redeploying or disturbing the sibling services.
4. **Given** the shared public entry point, **When** requests for different services arrive,
   **Then** each is routed to its owning service by its path segment, and a request to an unknown
   service path is rejected with the uniform error contract.
5. **Given** the documented pattern, **When** a developer adds a **new** cold-path domain service,
   **Then** it attaches to the shared entry point and follows the same layered structure and
   shared conventions with no bespoke, per-service re-wiring.

---

### User Story 3 - Both foundations verify caller identity per audience (Priority: P3)

Both services enforce the platform's four-audience identity model from day one. A
protected endpoint demands a valid identity for the specific audience(s) it serves; a
credential issued for one audience is structurally rejected by an endpoint scoped to
another, even if it is otherwise perfectly valid. Missing, expired, or tampered
credentials are rejected uniformly, revealing nothing about internals. Endpoints that are
deliberately public — the health checks — are explicitly declared so.

**Why this priority**: Identity isolation is a constitutional rule and retrofitting it is
risky — but it can only be wired once the two services (US1, US2) exist to carry it.

**Independent Test**: Obtain a valid credential for one audience; call a protected proving
endpoint scoped to that audience (succeeds), call a protected endpoint scoped to a
different audience with the same credential (rejected), and call with missing/expired/
tampered credentials (rejected uniformly).

**Acceptance Scenarios**:

1. **Given** a protected endpoint and a valid identity credential for its audience,
   **When** it is called, **Then** the request succeeds and the authenticated subject's
   identifier is available to business logic and appears in logs as the only permitted
   identity detail.
2. **Given** a valid credential issued for a different audience, **When** the same
   endpoint is called, **Then** the request is rejected as unauthorized with the uniform
   error shape — the credential's validity for its own audience makes no difference.
3. **Given** a missing, expired, or tampered credential, **When** a protected endpoint is
   called, **Then** the request is rejected uniformly, with no detail that would help an
   attacker distinguish why.
4. **Given** the health check endpoints, **When** called with no credential at all,
   **Then** they answer normally — they are explicitly and deliberately public.

---

### User Story 4 - Versioned interfaces keep un-updated apps working (Priority: P4)

The platform serves mobile apps that cannot be force-updated: at any moment, older and
newer app builds are live in the field at the same time. Every externally consumed
endpoint on both services is therefore addressed through an explicit interface version
from day one, and the foundations can serve multiple versions of the same capability side
by side. This slice ships the mechanism, the first live version, and the written policy
governing when a new version is introduced, how old versions keep serving, and how
retirement is communicated — so backend evolution never strands a customer whose app has
not updated yet.

**Why this priority**: Version discipline is nearly impossible to retrofit once clients
depend on unversioned endpoints — but it is pure structure until US1/US2 give it endpoints
to govern.

**Independent Test**: Enumerate the exposed surface of both services and confirm every
non-health endpoint carries an explicit version; call two deliberately coexisting versions
of the proving capability and confirm each answers with its own behavior; request a
nonexistent version and confirm a clear, uniform rejection.

**Acceptance Scenarios**:

1. **Given** the exposed surface of both services, **When** it is enumerated, **Then**
   every endpoint except the health checks is addressed through an explicit interface
   version.
2. **Given** two versions of the proving capability deliberately published side by side,
   **When** an old-version call and a new-version call are made concurrently, **Then**
   each caller receives its own version's documented behavior — demonstrating that an
   un-updated app and an updated app are served correctly at the same time.
3. **Given** a request for a version that does not exist (or has been retired), **When**
   it is made, **Then** it is rejected with the uniform error contract and a clear
   unsupported-version meaning.
4. **Given** the written versioning policy, **When** a reviewer walks a hypothetical
   breaking change through it, **Then** the policy yields an unambiguous outcome: a new
   version introduced alongside the old, the old continuing to serve, and deprecation and
   retirement communicated in a defined way.

---

### User Story 5 - Conventions a newcomer can follow (Priority: P5)

Each service ships with the documentation that makes it self-propagating: a structure
guide explaining where every concern lives and why, a step-by-step "add an endpoint"
walkthrough, the shared error-response contract, the interface versioning policy, the
local development workflow, the deployment runbook (for the deployed service), and —
critically — the written decision rule that assigns any future endpoint to exactly one of
the two services. A developer new
to the codebase can extend either service correctly on their first attempt using only the
repository's documentation.

**Why this priority**: The foundations are only valuable if every future slice lands in
them consistently. Documentation binds the conventions, but it documents what US1–US4
build, so it completes last.

**Independent Test**: A developer unfamiliar with the codebase follows only the
documentation to add a practice endpoint to a service and to classify three hypothetical
endpoints into the correct service; review the result against the conventions.

**Acceptance Scenarios**:

1. **Given** only the repository documentation, **When** a developer follows the "add an
   endpoint" walkthrough, **Then** they produce correctly placed files in the correct
   layers, conforming to conventions, on the first attempt.
2. **Given** a new endpoint requirement, **When** the documented path-assignment decision
   rule is applied, **Then** it yields exactly one home (latency-critical or
   cost-optimized) with a recordable rationale.
3. **Given** error responses drawn from both services, **When** they are compared,
   **Then** every one of them conforms to the single documented error contract.

---

### Edge Cases

- **Database unreachable** (network allowlist, database asleep, wrong environment) → the
  health check distinguishes "process is up" from "dependencies are ready" and reports the
  degraded state with a clear cause; the proving endpoint fails with the uniform error
  shape; no credential material appears in any error or log.
- **Missing or invalid configuration at startup** → the service refuses to start (or to
  serve) and names the missing value plainly; it never half-boots into an undefined state.
- **Malformed request** (bad body, wrong types, unknown route) → answered with the uniform
  error shape and correct client-error semantics; internals and stack traces are never
  leaked to callers.
- **Cross-audience, expired, or tampered credentials** → rejected uniformly (see US3);
  rejection responses do not reveal which check failed.
- **Cold start on the cost-optimized path** → the first call after idleness is allowed to
  be slower within a documented tolerance; it is an accepted property of that path, not an
  error, and health verification accounts for it.
- **Request for an unsupported interface version** (a version that never existed, or one
  already retired) → rejected with the uniform error shape and an unmistakable
  unsupported-version meaning, so an outdated client fails clearly rather than
  mysteriously.
- **Browser call from an unapproved origin** → refused; calls from the platform's approved
  development web origins succeed. The approved-origin list is per-environment
  configuration, not code.
- **Secret hygiene under failure** → however a request or deployment fails, secrets,
  credentials, and tokens never appear in repository files, logs, error responses, or
  command output.
- **Both services evolve against one database** → both proving slices read only
  platform-owned objects; any schema they need arrives through the established migration
  workflow, never ad hoc.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST gain its two backend **paths**: one **latency-critical service**
  for high-traffic functionality, and one **cost-optimized path composed of multiple
  independently deployable domain services** (constitution Principle III). Every service MUST be
  independently buildable, runnable, and testable; every cost-optimized service MUST also be
  independently deployable.
- **FR-002**: Both foundations MUST follow the platform's binding layered architecture —
  thin edge → business logic → data access, with the mandated dependency direction, each
  concern separated into its own clearly named place, and explicit, greppable wiring
  (constitution Principle VI; ARCHITECTURE.md).
- **FR-003**: Each service MUST expose an unauthenticated health check that distinguishes
  process liveness from dependency readiness (including development-database
  reachability).
- **FR-004**: Each service MUST include one minimal proving endpoint that traverses all
  three layers to the development database and back, without introducing any product
  schema; any platform-owned object it needs MUST arrive via the established migration
  workflow (feature 003).
- **FR-005**: Every handled request in both services MUST produce exactly one structured
  log record carrying a request correlation identifier; logs MUST contain no secrets and
  no personal information beyond the authenticated subject identifier (constitution
  Principle VII).
- **FR-006**: The latency-critical service MUST expose operational metrics in the
  platform's standard scrapeable form; the cost-optimized service's invocations MUST be
  measurable through the platform's managed runtime telemetry (constitution Principle
  VII).
- **FR-007**: All configuration MUST be supplied per environment at startup/deploy time;
  a service missing required configuration MUST fail fast and name the missing value.
  Secret material MUST never be committed, written to disk in the repository, echoed to
  output, or logged.
- **FR-008**: Protected endpoints MUST verify caller identity against the platform's
  four-audience identity model (feature 001); each endpoint MUST be scoped to explicit
  audience(s), and a credential issued for one audience MUST be structurally rejected by
  an endpoint scoped to another (constitution Principle IV). Public endpoints MUST be
  explicitly declared public.
- **FR-009**: Both services MUST return failures in one shared, documented,
  machine-readable error contract with standard success/client-error/server-error
  semantics; internal details and stack traces MUST never reach a caller.
- **FR-010**: Browser-based clients served from the platform's approved per-environment
  web origins MUST be able to call each service; requests from unapproved origins MUST be
  refused.
- **FR-011**: The latency-critical service MUST run locally in an isolated, reproducible
  runtime started by a single documented command. Cloud deployment of this service is
  explicitly OUT of this slice's scope.
- **FR-012**: Each cost-optimized **domain service** MUST be independently deployable to the
  development cloud environment behind **one shared, stable public entry point**, over encrypted
  transport, via a documented, repeatable, one-command deployment executed by the **operator**
  (per the platform's mode of work); deploying one service MUST NOT require redeploying or
  disturbing the others.
- **FR-013**: Each service MUST ship its conventions as documentation: structure guide,
  "add an endpoint" walkthrough, local development workflow, the shared error contract,
  and (for the deployed service) the deployment runbook.
- **FR-014**: The feature MUST record a written decision rule that assigns any future endpoint
  **first to one of the two paths** (latency-critical vs cost-optimized), based on latency
  criticality, traffic volume, and cost tolerance, **and then — for cost-optimized endpoints — to
  exactly one domain service** — so both path and service placement are documented decisions, not
  habits (constitution Principle III).
- **FR-015**: Every externally consumed endpoint on both services (health checks
  excepted) MUST be addressed through an explicit interface version from day one, and the
  foundations MUST be able to serve multiple versions of the same capability
  simultaneously — because fielded mobile apps cannot be force-updated, the backend MUST
  correctly serve updated and non-updated clients at the same time. A request for an
  unsupported version MUST be rejected with the uniform error contract and a clear
  unsupported-version meaning.
- **FR-016**: The feature MUST record a written interface versioning policy, aligned with
  prevailing industry practice: how versions are identified, what kinds of change require
  a new version versus a compatible in-place change, how old and new versions coexist,
  and how deprecation and retirement are decided and communicated to client teams.
- **FR-017**: The cost-optimized path MUST be **decomposed by domain into separate services**,
  each a self-contained deployable owning its domain's endpoints; a service MUST be addable or
  removable **without restructuring the others**, and each MUST follow the platform's binding
  layered architecture internally (FR-002).
- **FR-018**: All cost-optimized services MUST share **one public entry point** that routes each
  request to its owning service by a stable per-service path segment (`<entry-point>/<service>/…`),
  presenting callers a single coherent API surface; a request to an unknown service path MUST be
  rejected with the uniform error contract. The cross-cutting conventions (identity verification,
  error contract, interface versioning, structured logging) MUST be **consistent across all
  services and MUST NOT be re-invented per service**.
- **FR-019**: All backend codebases MUST be organized under **one consistent top-level home** with
  a uniform per-service layout, so any service is predictable to locate and extend; the
  latency-critical service MUST sit alongside the cost-optimized services under that home. (This
  supersedes the earlier single-location assumption; any slice already built on the previous shape
  is reconciled into the new layout during implementation.)

### Key Entities

- **Latency-Critical Service**: the single runnable/deployable backend for high-traffic
  functionality, embodying the platform's layered architecture; local-only this slice.
- **Cost-Optimized Path**: the **family** of independently deployable domain services for
  latency-tolerant work, all behind one shared public entry point and sharing common conventions.
- **Cold-Path Domain Service**: one self-contained, independently deployable service owning a
  domain's cold-path endpoints (e.g., administrative/back-office, store/operator); attaches to the
  shared entry point and follows the layered architecture + shared conventions.
- **Shared Public Entry Point**: the single stable public address that fronts all cost-optimized
  services and routes each request to its owning service by path segment.
- **Proving Slice**: the minimal endpoint in each service that demonstrates a full
  edge → logic → data traversal to the development database; platform-owned, no product
  schema.
- **Health Report**: each service's public statement of process liveness and dependency
  readiness; the primary verification instrument for local runs and deployments.
- **Error Contract**: the single machine-readable failure shape shared by both services;
  the boundary that keeps internals from leaking.
- **Identity Context**: the verified caller identity (audience + subject) attached to a
  protected request and available to business logic; the unit of Principle IV enforcement.
- **Path Assignment Rule**: the written decision rule mapping any future endpoint to a **path**
  (latency-critical vs cost-optimized) and, for cold-path endpoints, to a specific **domain
  service**.
- **Interface Version & Versioning Policy**: the explicit version identifier every
  non-health endpoint carries, plus the written rules for introducing, coexisting,
  deprecating, and retiring versions — the platform's guarantee to un-updated clients.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh repository clone on a machine with platform access, a developer
  reaches a locally running latency-critical service with a passing health check in
  **under 15 minutes** using only repository documentation.
- **SC-002**: The operator deploys the cost-optimized service to the development
  environment in **under 15 minutes** following only the runbook, and its health check and
  proving endpoint answer from the public internet immediately after.
- **SC-003**: Both proving endpoints demonstrably complete a full three-layer round-trip
  to the development database — verified by calling each and observing the returned
  database-derived value.
- **SC-004**: Across every tested combination of protected endpoint × wrong-audience
  credential, **100%** are rejected; **zero** cross-audience acceptances. Valid same-
  audience credentials succeed in **100%** of tests.
- **SC-005**: **100%** of sampled failure responses from both services conform to the
  single documented error contract, and **zero** of them contain stack traces or internal
  details.
- **SC-006**: **Zero** secret or credential material is found in the repository, in logs,
  or in command output across the entire local-run and deployment workflow; **100%** of
  sampled request logs carry a correlation identifier.
- **SC-007**: The locally running latency-critical service answers its proving read in
  **under 100 milliseconds** in typical local conditions, demonstrating the foundation
  itself adds negligible overhead.
- **SC-008**: A developer new to the codebase, using only the repository documentation,
  adds a practice endpoint that passes convention review on the **first attempt**, and
  correctly classifies three hypothetical endpoints using the path-assignment rule.
- **SC-009**: **100%** of externally consumed endpoints on both services (health checks
  excepted) are addressed through an explicit interface version — **zero** unversioned
  endpoints exist.
- **SC-010**: Two versions of the same proving capability serve callers **simultaneously**,
  each answering with its own documented behavior — demonstrating that a non-updated app
  and an updated app are both served correctly at the same time; a request for an
  unsupported version is rejected clearly in **100%** of attempts.
- **SC-011**: A single cost-optimized domain service is redeployed to dev and goes live
  **without redeploying or disturbing** its sibling services — verified by observing the siblings
  remain continuously reachable across the deploy.
- **SC-012**: All cost-optimized services answer under **one shared public entry point**, each at
  its own service path segment; **100%** of sampled requests route to the correct service, and a
  request to an unknown service path is rejected with the uniform error contract.

## Assumptions

- **The development database (002) and migration workflow (003) are prerequisites** and
  the only data infrastructure used; both proving slices read platform-owned objects, and
  any object they need ships as a forward migration per the 003 workflow.
- **The operator's network is on the development database's allowlist** (002) — required
  for the local latency-critical service to reach the database; a documented
  prerequisite, not something this feature manages.
- **The four audience identity pools (001) are the sole identity source**; this feature
  wires verification against them and introduces no new identity infrastructure. Each
  service verifies the audiences it serves — endpoint-level audience scoping is decided
  per endpoint, since latency-tolerant customer actions (e.g., profile changes) belong to
  the cost-optimized path.
- **Cloud deployment of the latency-critical service is deferred** to a later slice; this
  slice delivers its isolated local development loop only. The cost-optimized
  service does deploy, to the development environment only; higher environments arrive at
  promotion.
- **No product endpoints ship here.** Catalog, search, profile, and back-office
  functionality named in the description are illustrations of the path split; each
  arrives in its own future slice on top of these foundations.
- **The shared event backbone is out of scope** for this bootstrap; it arrives with the
  first feature that publishes a domain event, per its own slice.
- **Cold-path decomposition (2026-07-08 revision).** The cost-optimized path is split into
  multiple independently deployable domain services behind one shared public entry point. The
  exact split (which domains become services now), the shared-entry-point + identity-verification
  sharing mechanism, the per-service path/version scheme, and the codebase's top-level layout are
  **plan-phase** decisions (operator-directives.md), selected via industry research. Reorganizing
  the backend codebases' top-level home is a **structural** move, not a behavior change. **Any
  slice already built on the previous single-service shape (notably 005-back-office-web) is
  reconciled into the new layout as part of this revision's implementation** — 005's back-office
  endpoints become the first real content of the administrative cold-path service.
- **Versioning ships as structure, policy, and proof — not history.** One live interface
  version exists for real use; the side-by-side coexistence demonstration (US4) uses a
  deliberately published second version of the proving capability. No genuinely
  deprecated versions exist yet; the deprecation/retirement rules take effect as the
  platform evolves. The concrete versioning scheme follows prevailing industry practice
  and is selected during planning.
- **Mode of work**: all code, configuration, and documentation are authored for the
  operator; the **operator personally runs** every deployment and any command that
  provisions or mutates live cloud resources.
