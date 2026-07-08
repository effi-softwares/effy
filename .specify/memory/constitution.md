<!--
SYNC IMPACT REPORT
==================
Version change: 1.3.1 → 1.4.0
Bump rationale: MINOR — materially updates the locked Web Technology Standard: adopts the
                TanStack client suite for the web surfaces and replaces Zustand with TanStack
                Store as the web client-state library. No principle added or redefined; no
                existing plan is invalidated (no shipped surface used Zustand yet).

Modified in this amendment (operator-directed, feature 005):
  - Technology Standards (Locked) → Web: named the **TanStack suite** (Router, Query, Table,
    Form, Store, Virtual, DevTools, Hotkeys) as the web client spine; **client state via
    TanStack Store — Zustand removed** platform-wide (superseded by TanStack Store); pinned
    Tailwind **v4** and shadcn/ui **Radix base**. TanStack DB is explicitly NOT adopted yet
    (revisit when a real product-collection / optimistic-UI need exists — 005 research A3).
  - ARCHITECTURE.md → "Operator / admin web (SPA)" wording softened: "server-state cache for
    all server data; a minimal client store (TanStack Store) for genuine client state only"
    (was "no separate client store"), consistent with Principle VI.

Unchanged: Principles I–VII (bodies + rationale); Governance; all other Technology Standards
           (Mobile, Hot path, Cold path, Database, Infrastructure, Observability).

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — Constitution Check defers dynamically; no edit needed.
  ✅ .specify/templates/spec-template.md   — WHAT/WHY-only specs; unaffected.
  ✅ .specify/templates/tasks-template.md  — unaffected.
  ✅ CLAUDE.md                             — Web-stack line updated (Zustand → TanStack Store).
  ✅ ARCHITECTURE.md                        — admin-web client-store wording softened (above).

Follow-up TODOs: none.

Prior history:
  1.3.1 (2026-07-08) — PATCH: Cold path runtime "Node 20" → "Node 22 (current Lambda-supported LTS)".
  1.3.0 (2026-06-28) — Added Principle VII (Observability & Telemetry) + Technology Standards
                       "Observability & notifications" group; Quality Gates telemetry gate.
  1.2.0 (2026-06-28) — Added Principle VI (Layered Architecture & Explicit Wiring); new file
                       ARCHITECTURE.md as its binding elaboration.
  1.1.0 (2026-06-28) — Reframed Effy as a new, original platform (no rewrite/rebuild framing);
                       Principle IV pinned to passwordless EMAIL_OTP across all four pools;
                       Mobile standard set to Clean Architecture + MVVM (was MVI).
  1.0.0 (2026-06-25) — Initial ratification: template placeholders replaced with concrete,
                       project-specific governance (five principles, Technology Standards,
                       Quality Gates).
-->

# Effy Constitution

Effy is a single-brand, vertically-integrated grocery + e-commerce delivery platform spanning
four audiences — customers, drivers, stores, and admin/back-office. Customers buy from one brand
("Effy"); stores are hidden internal fulfillment nodes (dark-store-like) that customers never see;
drivers and back-office staff are Effy employees on internal apps. This document encodes the
non-negotiable rules every spec, plan, and implementation MUST obey. It governs how the platform
is built.

## Core Principles

### I. Spec-Driven Development (NON-NEGOTIABLE)

Every feature MUST flow through the pipeline: Brief → spec → plan → tasks → implement.

- Specs describe **WHAT and WHY only** — zero technology, no implementation detail.
- Plans describe **HOW** — they cite this constitution and choose concrete technology
  within the locked Technology Standards.
- Tasks are ordered, checkable units derived from the plan.
- A gap or contradiction discovered downstream MUST be fixed by returning to the earliest
  affected artifact (spec or plan), not patched silently in code.
- No code is merged without a committed `spec.md`, `plan.md`, and `tasks.md` living alongside
  it for that feature.

**Rationale**: A solo/small team needs the platform to be documented and intentional as it grows.
Discipline at the artifact level is what keeps the six surfaces from drifting apart.

### II. Monorepo with Shared Contracts

All apps, services, and infrastructure live in ONE monorepo.

- Cross-cutting concerns — shared types, design tokens, API client, configuration — MUST be
  shared packages. Copy-paste of cross-cutting logic across surfaces is prohibited.
- Shared contracts (DTOs) are the **single source of truth**. Clients MUST be typed from or
  generated from those contracts, never hand-redefined per surface.
- A change to a shared contract is a single, atomic edit that all consumers pick up.

**Rationale**: Consistency across the six surfaces is a primary platform goal. Shared packages
are the mechanism that makes cross-cutting changes happen once.

### III. Dual-Path Backend Discipline

The backend is intentionally two paths, and every plan MUST justify which path a feature uses.

- **Hot path** — latency-sensitive customer reads and transactions run on Go (Gin + pgx/v5)
  on Fargate.
- **Cold path** — ops/admin CRUD and back-office workflows run on serverless TypeScript
  Lambdas.
- Every feature's `plan.md` MUST state which path(s) it targets and why. A feature MUST NOT
  place latency-sensitive customer traffic on the cold path, nor low-frequency admin CRUD on
  the hot path, without an explicit, justified exception recorded in the plan.

**Rationale**: The split exists to serve customer latency cheaply while keeping ops simple.
Forcing each plan to declare its path keeps the boundary honest.

### IV. Auth Isolation

Authentication uses four isolated Cognito pools: customer, driver, store, admin.

- All four pools use **passwordless EMAIL_OTP** — there are no passwords anywhere on the platform.
- Each pool is validated independently, with per-pool JWT validation.
- Frontends authenticate against Cognito directly; backends validate tokens per pool.
- There is **no auth proxy** — backends do not forward or broker authentication on behalf of
  another pool.
- A token issued for one pool MUST NOT be accepted by a surface or service scoped to another.
- The admin pool defines RBAC groups (admin / manager / csa), surfaced via the `cognito:groups`
  JWT claim. Driver, store, and admin users are admin-provisioned (no self-signup).

**Rationale**: Four audiences with different trust levels demand hard isolation. Direct
Cognito + per-pool validation keeps blast radius small and the trust model auditable.

### V. Native-Feel, Consistent Design

One design-system package drives every surface.

- Brand color is Jade `#0FB57E`; fill `#047857`. These tokens come from the design-system
  package, not hardcoded per surface.
- Dark mode is REQUIRED on every surface.
- Mobile MUST feel native: iOS follows Apple HIG, Android follows Material.
- Fat-finger-friendly touch targets and micro-animations are REQUIREMENTS, not optional
  polish.

**Rationale**: A single design system is how all surfaces stay visually and behaviorally
coherent; native feel and tactile quality are part of the product, not a finishing pass.

### VI. Layered Architecture & Explicit Wiring

Every surface is organized the same way internally, so any feature is predictable to build and
review. `ARCHITECTURE.md` is the binding elaboration of this principle; plans MUST conform to it.

- **Three-layer slice per feature**: a thin edge (handler / UI) → service / use-case → repository.
  Clean-Architecture dependency direction holds — the domain layer depends on nothing, data
  implements it, and presentation / handlers consume it.
- **Repository pattern with raw SQL** — no ORM and no query builder. Wire shapes (DTOs / rows) are
  mapped explicitly to domain models and MUST NOT leak past the data layer.
- **No DI framework** — dependencies are wired explicitly and greppably (by hand at the entry point,
  in a single mobile container, or via cached module singletons).
- **Unidirectional client state** — mobile uses MVVM as a strict state machine (immutable State +
  typed Intents + one-off Effects via a ViewModel base); web treats the server-state cache as the
  source of truth and keeps a client store only for genuine client state. Server data MUST NOT be
  hand-cached in component state.
- **One event language across backends** — both backends publish the same event envelope to the
  shared topic, and event consumers MUST be idempotent.

**Rationale**: One coherent shape across four languages and three runtimes is what lets a small team
move between surfaces freely and keeps features predictable to write, read, and review.

### VII. Observability & Telemetry

The platform MUST be observable and measurable from day one. `ARCHITECTURE.md` is the binding
elaboration of this principle.

- **Backends** emit structured logs and expose **metrics** (Prometheus); customer-facing flows have
  **dashboards and alerts** (Grafana).
- **Mobile ships crash reporting** (Crashlytics); **web ships error tracking** (PostHog).
- **Product analytics** (PostHog) is captured on every client through a shared, typed event taxonomy —
  kept conceptually distinct from operational metrics (behavior vs. system health).
- **No PII in telemetry** beyond the authenticated subject id; product analytics is
  **consent-respecting**, and metric labels MUST stay low-cardinality.
- **Push notifications** go through the platform notifications path (FCM + APNs), never ad hoc per
  feature.
- A plan that adds a user-facing flow MUST state its telemetry: the key product events, the metrics,
  and the alerts it introduces.

**Rationale**: A solo/small team can't watch the platform by hand. Baking in metrics, alerts, crash
reporting, and product analytics from the start is what makes the system debuggable and the product
decisions evidence-based.

## Technology Standards (Locked)

These are the locked platform standards and are not open for per-feature reinvention. Changing
any entry requires a constitution amendment (see Governance).

- **Mobile**: Kotlin Multiplatform + Compose; Clean Architecture + MVVM.
- **Web**: React 19 + TypeScript; shadcn/ui (Radix base) + Tailwind v4. Client spine: the
  **TanStack suite** — Router, Query (server-state cache = source of truth), Table, Form, Store,
  Virtual, DevTools, Hotkeys. **Client state via TanStack Store** (genuine client state only —
  **no Zustand**). TanStack DB is not adopted yet (revisit on a real product-collection need).
- **Hot path**: Go 1.25; Gin; pgx/v5; raw SQL. **No ORM.**
- **Cold path**: Node 22 (current Lambda-supported LTS) + TypeScript; Serverless Framework; Lambda on arm64.
- **Database**: PostgreSQL 16; Goose migrations; **forward-only** (no down migrations relied on).
- **Infrastructure**: Terraform; multi-environment; remote state.
- **Observability & notifications**:
  - **Metrics**: Prometheus + Grafana (self-hosted on ECS); Lambda metrics via CloudWatch datasource.
  - **Crash reporting**: Firebase Crashlytics (mobile).
  - **Product analytics + web error tracking**: PostHog (all clients).
  - **Push notifications**: Firebase Cloud Messaging (FCM); APNs for iOS.

A plan MAY introduce a new library only within these standards (e.g., a Go helper, a React
utility). It MUST NOT swap a locked technology (e.g., add an ORM, change the migration tool,
move the hot path off Go) without amending this constitution first.

## Quality Gates

Compliance is enforced at merge time, not discovered later.

- Every feature ships **verified against its spec's acceptance criteria** — implementation is
  done when those criteria are demonstrably met, not when code compiles.
- No feature merges without `spec.md`, `plan.md`, and `tasks.md` committed alongside the code.
- Every plan MUST pass the Constitution Check gate (path justification per Principle III,
  shared-contract usage per Principle II, auth isolation per Principle IV, design-system usage
  per Principle V, architecture conformance per Principle VI, telemetry declaration per
  Principle VII) before implementation begins.
- Any deviation from a principle MUST be recorded as a justified exception in the plan's
  Complexity Tracking; an undocumented deviation is a defect.

## Governance

This constitution supersedes all other practices and conventions. Where another document or
habit conflicts with it, this document wins.

- **Authority**: All plans and reviews MUST verify compliance with these principles. The
  Constitution Check in `plan-template.md` is the enforcement point.
- **Amendment procedure**: An amendment requires (1) a version bump per the policy below and
  (2) a note in the Sync Impact Report stating what changed and why. Dependent templates
  (`plan`, `spec`, `tasks`) MUST be re-checked for alignment as part of the same change.
- **Versioning policy** (semantic):
  - **MAJOR** — backward-incompatible governance change: a principle removed or redefined in a
    way that invalidates existing plans.
  - **MINOR** — a new principle or section added, or material expansion of guidance.
  - **PATCH** — clarifications, wording, and non-semantic refinements.
- **Compliance review**: Spec-driven artifacts are the audit trail. A feature whose committed
  spec/plan/tasks do not match its implementation is out of compliance and MUST be reconciled.
- **Runtime guidance**: `CLAUDE.md` provides day-to-day working guidance for agents and
  contributors; it elaborates but never overrides this constitution.

**Version**: 1.4.0 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-07-08
