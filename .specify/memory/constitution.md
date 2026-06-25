<!--
SYNC IMPACT REPORT
==================
Version change: (uninitialized template) → 1.0.0
Bump rationale: Initial ratification — the template placeholders are replaced with
                concrete, project-specific governance for the first time. MINOR/PATCH
                do not apply to a first adoption; this is the 1.0.0 baseline.

Modified principles (placeholder → concrete):
  [PRINCIPLE_1] → I. Spec-Driven Development (NON-NEGOTIABLE)
  [PRINCIPLE_2] → II. Monorepo with Shared Contracts
  [PRINCIPLE_3] → III. Dual-Path Backend Discipline
  [PRINCIPLE_4] → IV. Auth Isolation
  [PRINCIPLE_5] → V. Native-Feel, Consistent Design

Added sections:
  - Technology Standards (Locked)   [was SECTION_2 placeholder]
  - Quality Gates                   [was SECTION_3 placeholder]

Removed sections: none

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — Constitution Check defers to this file
        dynamically ("[Gates determined based on constitution file]"); no edit needed.
  ✅ .specify/templates/spec-template.md   — already enforces WHAT/WHY-only specs with
        no tech sections; aligned with Principle I.
  ✅ .specify/templates/tasks-template.md  — tests-optional, story-organized structure
        aligns with the Quality Gates (verify-against-acceptance, no mandated TDD).
  ✅ CLAUDE.md                             — already consistent with all five principles.
  n/a .specify/templates/commands/*.md     — directory does not exist; nothing to reconcile.
  n/a README.md / docs/quickstart.md       — do not exist; nothing to reconcile.

Follow-up TODOs: none — all placeholders resolved; ratification date supplied (2026-06-25).
-->

# Effy Constitution

Effy is a grocery-delivery platform spanning four audiences — customers, drivers, stores,
and admin/back-office. This document is a clean-rebuild charter: "same product, better built."
It encodes the non-negotiable rules every spec, plan, and implementation MUST obey. Product
context lives in `platform-brief.md`; this constitution governs how that product is built.

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

**Rationale**: A solo/small team rebuilding for a clean foundation needs the platform to be
documented and intentional as it grows. Discipline at the artifact level is what keeps the six
surfaces from drifting again.

### II. Monorepo with Shared Contracts

All apps, services, and infrastructure live in ONE monorepo.

- Cross-cutting concerns — shared types, design tokens, API client, configuration — MUST be
  shared packages. Copy-paste of cross-cutting logic across surfaces is prohibited.
- Shared contracts (DTOs) are the **single source of truth**. Clients MUST be typed from or
  generated from those contracts, never hand-redefined per surface.
- A change to a shared contract is a single, atomic edit that all consumers pick up.

**Rationale**: Consistency across the six surfaces is the primary reason for the rebuild.
Shared packages are the mechanism that makes cross-cutting changes happen once.

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

- Each pool is validated independently, with per-pool JWT validation.
- Frontends authenticate against Cognito directly; backends validate tokens per pool.
- There is **no auth proxy** — backends do not forward or broker authentication on behalf of
  another pool.
- A token issued for one pool MUST NOT be accepted by a surface or service scoped to another.

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

## Technology Standards (Locked)

These are kept from the prior platform and are not open for per-feature reinvention. Changing
any entry requires a constitution amendment (see Governance).

- **Mobile**: Kotlin Multiplatform + Compose; Clean Architecture + MVI.
- **Web**: React 19 + TypeScript; shadcn/ui + Tailwind; TanStack Query; Zustand.
- **Hot path**: Go 1.25; Gin; pgx/v5; raw SQL. **No ORM.**
- **Cold path**: Node 20 + TypeScript; Serverless Framework; Lambda on arm64.
- **Database**: PostgreSQL 16; Goose migrations; **forward-only** (no down migrations relied on).
- **Infrastructure**: Terraform; multi-environment; remote state.

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
  per Principle V) before implementation begins.
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

**Version**: 1.0.0 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-06-25
