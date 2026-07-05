# Feature Specification: Cost-Minimized Development Database

**Feature Branch**: `002-dev-database`

**Created**: 2026-07-05

**Status**: Draft

**Input**: User description: "as the next spec let's write about creating the RDS resource. db.t4g.micro instance with 20 GB gp2 or gp3 with single AZ on demand pricing. DO NOT enable database insights with cloudWatch. no expert support, no backup storage and no snapshot exports and DO NOT TURN ON RDS proxy. i need to this RDS be cheap as possible in initial weeks. later we can increase resources."

> Technology-specific provisioning directives from the description are recorded verbatim in
> [operator-directives.md](./operator-directives.md) as **plan-phase input** — this spec stays
> free of implementation detail per constitution Principle I.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A running development database at minimal cost (Priority: P1)

The platform operator provisions the platform's operational database in the development
environment entirely from committed code. The database runs continuously so the first
data-bearing feature slices (catalog, profiles, orders later) can be built against it — while
costing the absolute minimum the managed service allows, because during the initial weeks it
will hold only disposable development data and serve a tiny workload.

**Why this priority**: Every upcoming feature slice needs a database to exist; and as a
solo-funded project in its earliest weeks, recurring cloud spend is the binding constraint.
A database that exists AND is cheap is the MVP — everything else layers on top.

**Independent Test**: From a clean state, the operator provisions the database with one
reviewed approval and no console steps; a database is then reachable by authorized parties,
and its configuration shows the minimum size/capacity options selected.

**Acceptance Scenarios**:

1. **Given** the platform's dev environment foundation exists, **When** the operator applies
   the database provisioning code, **Then** a managed database instance is created in dev,
   running the platform's standard engine, at the smallest available instance size and the
   minimum permitted storage allocation.
2. **Given** the database is running, **When** an authorized party connects using the
   published connection details, **Then** the connection succeeds and the database accepts
   standard operations.
3. **Given** the database is running, **When** its configuration is inspected, **Then** it
   shows a single instance (no standby or replica) on pay-as-you-go pricing with no upfront
   commitment.

---

### User Story 2 - Zero spend on optional extras, verifiably (Priority: P2)

The operator can demonstrate that every separately-billed optional convenience of the managed
database service is switched off — premium monitoring/insights, extended engine support
surcharges, automated backup storage, snapshot export features, and any managed
connection-pooling middleware — so the monthly bill contains compute and storage for one small
instance, and nothing else.

**Why this priority**: The user's explicit mandate is "as cheap as possible in the initial
weeks". The base instance is cheap; it is the optional add-ons that silently multiply cost.
Making their absence provable is what protects the budget.

**Independent Test**: Inspect the database's live configuration and the billing breakdown:
every optional paid feature reads as disabled, and no billing line item exists for any of
them.

**Acceptance Scenarios**:

1. **Given** the provisioned database, **When** the operator reviews its configuration,
   **Then** premium monitoring/insights, extended support, automated backups, snapshot
   exports, and connection-pooling middleware are all disabled.
2. **Given** a full billing period, **When** the operator reviews the bill filtered by the
   platform's resource tags, **Then** the database's recurring cost consists only of instance
   hours and storage, within the agreed ceiling (see SC-001).

---

### User Story 3 - A documented grow-later path (Priority: P3)

The operator has a written runbook showing that each capacity or durability upgrade — a larger
instance, more storage, standby redundancy, automated backups — is an independent
configuration change that can be turned on later without redesign, because the initial
cost-floor choices were made as reversible settings, not architecture.

**Why this priority**: "Later we can increase resources" is half the user's mandate. The
cheap start must not paint the platform into a corner; the exit path needs to exist on paper
before it is needed.

**Independent Test**: Following the runbook, the operator previews (without applying) an
upgrade — e.g. a larger instance size — and the preview shows an in-place configuration change
rather than a rebuild or redesign.

**Acceptance Scenarios**:

1. **Given** the running minimal database, **When** the operator follows the runbook to
   preview one upgrade lever (size, storage, redundancy, or backups), **Then** the preview
   shows the change applied through configuration only.
2. **Given** the runbook, **When** a reader checks it, **Then** every cost-floor choice made
   in this feature has a documented reversal/upgrade step.

---

### Edge Cases

- **Instance or storage failure with no backups**: all data since provisioning is lost. This
  is **accepted** for the initial weeks — dev data is disposable and the schema is recreated
  from committed migration code. The acceptance and the recovery procedure (re-provision +
  re-run migrations) must be written down, so the risk is a decision, not a surprise.
- **Storage approaches capacity**: the operator can observe remaining capacity without paying
  for premium monitoring; growing storage is a documented configuration change.
- **Connection exhaustion**: with no pooling middleware and a small instance, simultaneous
  connections are limited. Consumers are responsible for client-side connection management;
  the connection ceiling is documented for future slices.
- **Sustained heavy load on a burstable-capacity instance**: temporary slowness in dev is
  acceptable and is not a defect; the runbook's size-upgrade lever is the remedy if it
  becomes chronic.
- **Accidental deletion**: recreation from code restores service (not data); acceptable under
  the same disposable-data decision.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The development environment MUST have a managed relational database instance
  running the platform's standard engine, provisioned entirely from committed code with no
  console steps.
- **FR-002**: The instance MUST use the smallest instance size the managed service offers
  that runs the standard engine, on pay-as-you-go pricing with no upfront commitment.
- **FR-003**: Storage MUST be provisioned at the minimum allocation the service permits,
  using the most cost-effective storage option suitable for a development workload.
- **FR-004**: The database MUST run as a single instance — no standby, no replicas, no
  multi-location redundancy.
- **FR-005**: Every separately-billed optional feature MUST be disabled, including: premium
  database monitoring/insights, extended engine-support surcharges, automated backup storage
  (retention set to none), snapshot export features, and managed connection-pooling
  middleware.
- **FR-006**: The database MUST NOT be reachable from the internet at large; connectivity is
  limited to explicitly authorized platform components and operator networks.
- **FR-007**: An administrative credential MUST be generated at provisioning time and held in
  the platform's secret storage — never committed to code, printed to logs, or hand-copied.
- **FR-008**: Connection details (endpoint, port, database name, and where the credential
  lives) MUST be published through the platform's established configuration contract so later
  slices consume them without human hand-off.
- **FR-009**: The database MUST carry the platform's standard resource tags so its cost is
  attributable in billing.
- **FR-010**: Each upgrade lever — larger instance, more storage, redundancy, automated
  backups — MUST be achievable as an independent configuration change, documented in a
  runbook alongside the accepted-risk statement for running without backups.
- **FR-011**: Provisioning MUST follow the platform's environment model: development only is
  applied now; the operator reviews and approves every change before it takes effect.

### Key Entities

- **Database Instance**: the single managed relational database serving the development
  environment; attributes: engine (platform standard), size class (minimum), storage
  (minimum), pricing model (pay-as-you-go), location (single).
- **Cost Posture**: the set of separately-billed optional features and their (all-disabled)
  states; the thing US2 verifies and the runbook reverses one lever at a time.
- **Access Credential**: the administrative secret; lives only in platform secret storage.
- **Connection Contract Values**: endpoint, port, database name, and credential location
  published via the platform configuration contract; consumed by later slices.
- **Network Boundary**: the definition of who may reach the database (authorized platform
  components and operator networks only).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: The database's steady-state recurring cost is **at or below US$25 per month**
  (instance hours + storage at current pricing), verified against the provider's pricing
  calculator at plan time and against the first full billing period.
- **SC-002**: **US$0** of recurring spend on optional add-ons: monitoring/insights, extended
  support, backup storage, snapshot exports, and pooling middleware each show as disabled in
  configuration and absent from the bill.
- **SC-003**: A fresh provision from committed code completes in **under 30 minutes** with
  exactly **one** human approval and **zero** console steps.
- **SC-004**: A consumer can obtain working connection details exclusively from the platform
  configuration contract — demonstrated by connecting using only values read from it.
- **SC-005**: Connection attempts from an unauthorized network fail; from an authorized
  network they succeed — both demonstrated.
- **SC-006**: One upgrade lever (e.g. instance size) is previewed via the runbook and shows
  as a configuration-only change — no redesign, no data-layer rework.
- **SC-007**: The database's cost is attributable in billing using the platform's standard
  tags (filtering the bill by tag isolates its line items).

## Assumptions

- **Development data is disposable.** During the initial weeks there is no recovery-point
  objective: data loss on failure is an accepted, documented risk. Schema is always
  recreatable from committed migration code.
- **Dev only.** Higher environments (qa/staging/prod) receive databases later via the
  platform's promotion model, with durability settings (backups, redundancy) revisited then —
  the cost-floor posture here is explicitly NOT the posture for production.
- **"Cheapest" is bounded by the platform's locked engine standard** (the standard relational
  engine, current major version) — cost optimization does not license an engine change.
- **Operator workstation access is required** during the initial weeks for schema migrations
  and verification, and remains restricted to explicitly allowlisted networks (FR-006). The
  concrete access mechanism is a plan-phase decision made under the cost mandate.
- **Consumers pool connections client-side**; no shared pooling middleware exists in this
  phase.
- **The cost ceiling (SC-001) covers steady-state recurring cost**; negligible one-time or
  request-based charges are excluded.
- **The dev environment foundation from feature 001** (environment roots, operator workflow,
  configuration contract, tagging) exists and is reused, not rebuilt.
