<!--
SYNC IMPACT REPORT
==================
Version change: 1.9.0 → 1.10.0
Bump rationale: MINOR — Principle V (Native-Feel, Consistent Design): the brand constant is replaced.
                The single accent changes from Jade #0FB57E (fill #047857) to Effy Emerald —
                accent #065f46 (emerald-800), white label both modes — with a terracotta
                accent #d0735a over neutral-scale surfaces, and the design-system SSOT now additionally carries the Nunito Sans typeface,
                a spacing scale, and a radius scale. Dark mode remains REQUIRED and becomes
                user-selectable (Light / Dark / Follow-System) on every surface.
                Not MAJOR: no principle is removed and no committed plan's STRUCTURE is invalidated — every
                surface still consumes the one design-system package; only the brand VALUES change. Prior
                surfaces are rebranded by feature 017, not left non-compliant.
                Operator decision (2026-07-17), feature 017-platform-theme-tokens: a richer, more
                professional multi-role palette supplied as design tokens, applied identically to all web
                and mobile surfaces, with a runtime appearance switcher.

Modified in this amendment (operator-directed, feature 017-platform-theme-tokens):
  - Principle V (Native-Feel, Consistent Design) → the brand-color bullet: Jade #0FB57E / fill #047857
    replaced by Effy Emerald #065f46 (emerald-800, white label) + terracotta #d0735a over neutral
    surfaces; a note added that the Nunito Sans
    typeface + spacing + radius scales are part of the design-system SSOT; dark mode is now user-selectable.

Dependent updates in THIS change:
  ✅ CLAUDE.md — § Design system + the /constitution order-of-operations note rebranded (Jade → Forest).
  ✅ packages/design-system/src/tokens.css + package.json — the brand SSOT rewritten to the new palette.
  ✅ specs/017-platform-theme-tokens/* — spec/plan/tasks carry the amendment as FR-016 / research R9.
  ⏳ Historical D2 notes in CLAUDE.md (feature 005) are retained as history, not rewritten.

Unchanged: Principles I, II, III, IV, VI, VII (bodies + rationale); Governance; Technology Standards;
           Quality Gates; the rest of Principle V (design-system single-source, dark mode REQUIRED,
           native feel, touch targets, micro-animations, reference-platform + no-card doctrines).

Follow-up TODOs: none.

--- prior amendment (retained for history) ---
Version change: 1.8.0 → 1.9.0
Bump rationale: MINOR — Principle V (Native-Feel, Consistent Design) gains two platform-wide design
                doctrines that were previously unwritten:
                (1) a REFERENCE-PLATFORM doctrine — Effy is "Uber Eats + eBay, food-first"; feature
                    business logic, data models, entities, and UI SHOULD be modelled on how those
                    production platforms solve the same problem, adapted to Effy's single-brand,
                    hidden-fulfillment model, favouring the industry-standard pattern over a bespoke one,
                    with food and food-related products prioritised.
                (2) a NO-CARD-LAYOUT doctrine — card-style containers and metric/summary cards MUST NOT
                    be used to lay out content unless a card is demonstrably the right pattern for that
                    content and no better layout exists, in which case the plan MUST record the
                    justification. Prefer tables, lists, sectioned pages, tabs, and detail rows.
                Not MAJOR: no existing principle is removed or redefined in a way that invalidates a
                committed plan; this is additive guidance under an existing principle. Surfaces already
                built predate the doctrines and are not retroactively out of compliance, though the
                no-card rule SHOULD guide their future changes.
                Operator decision (2026-07-15), raised while specifying 016-shop-product-catalog, where
                both rules first bite: a rich product entity modelled on eBay item-specifics + Uber Eats
                menus, and a product-details page the operator required to be sectioned/tabbed, never
                carded, with no metric cards at the top of pages.

Modified in this amendment (operator-directed, feature 016-shop-product-catalog):
  - Principle V (Native-Feel, Consistent Design) → two bullets added: the reference-platform doctrine
    and the no-card-layout doctrine.

Dependent updates in THIS change:
  ✅ CLAUDE.md — a "Design reference & layout doctrine" note added under § Design system (elaboration,
     not override) so day-to-day agent guidance carries both rules.
  ✅ specs/016-shop-product-catalog/spec.md — already carries both as DOCTRINE-1 / DOCTRINE-2; the
     spec's "SHOULD be promoted" note is now satisfied.
  ✅ .specify/templates/{plan,spec,tasks}-template.md — Constitution Check defers to Principle V
     dynamically; no structural edit needed.

Unchanged: Principles I, II, III, IV, VI, VII (bodies + rationale); Governance; all Technology
           Standards; Quality Gates; the rest of Principle V (design-system single-source, Jade tokens,
           dark mode, native feel, touch targets, micro-animations).

Follow-up TODOs: none.

--- prior amendment (retained for history) ---
Version change: 1.7.0 → 1.8.0
Bump rationale: MINOR — Principle VI's mobile presentation standard is changed from the strict
                State/Intent/Effect (MVI-style) "state machine via a ViewModel base" to plain,
                method-based MVVM: a ViewModel exposing immutable, observable UI state that the View
                renders, with user actions invoking ViewModel functions (state flows down, events flow
                up). This resolves a long-standing internal inconsistency — the constitution already
                LABELLED the standard "MVVM" (v1.1.0, "was MVI") but continued to DESCRIBE MVI mechanics
                (typed Intents, one-off Effects, a reducer, a BaseViewModel state machine).
                Operator decision (2026-07-15), after building 013-customer-mobile-foundation: the
                platform's first mobile surface shipped classic MVVM, and the platform standardises on
                that as the simpler, Compose-idiomatic pattern across its three mobile apps.
                Not MAJOR: no principle is removed, and the unidirectional / immutable-observable-state
                discipline is retained — only the typed-Intent + one-off-Effect + reducer mechanics are
                dropped.
Dependent updates in THIS change:
  ✅ ARCHITECTURE.md § Mobile apps — the State/Intent/Effect sketch + BaseViewModel base rewritten to
     method-based MVVM (it is the binding elaboration of Principle VI).
  ✅ CLAUDE.md — the "immutable State + typed Intents + one-off Effects" phrasing corrected to MVVM.
  ✅ apps/customer-mobile — the unused `BaseViewModel<State,Intent,Effect>` MVI base class deleted.
  ✅ specs/013-customer-mobile-foundation — plan/research/tasks/data-model MVI references reconciled.

--- prior amendment (retained for history) ---
Version change: 1.6.0 → 1.7.0
Bump rationale: MINOR — Principle IV's credential rule is materially expanded. Until now the
                principle said "All four pools use passwordless EMAIL_OTP — there are no passwords
                anywhere on the platform." That sentence is now FALSE as a description of the
                platform we are building: the customer audience (011-customer-storefront-web) is a
                self-registering member of the PUBLIC, and gets three credential routes —
                email+password, email OTP, and Google federated sign-in.
                Not PATCH: it changes what conforming code must do. A password policy, an account-
                recovery flow, a Cognito hosted domain, a Google identity provider, and a pre-sign-up
                account-linking trigger all become permitted (indeed required) on the customer pool
                where they were previously forbidden outright.
                Not MAJOR: no principle is removed or redefined in a way that invalidates an existing
                plan. Every prior slice (001, 005, 006, 007, 009) targets the driver/shop/admin
                audiences, whose rule is UNCHANGED and re-affirmed: strictly passwordless EMAIL_OTP,
                strictly admin-provisioned, no self-signup. Four-pool isolation, per-pool validation,
                the pinned issuer, the no-auth-proxy rule, the cross-pool rejection rule, and the
                claim-as-origin / record-as-authority distinction are all untouched in substance.

Modified in this amendment (operator-directed, feature 011-customer-storefront-web):
  - Principle IV (Auth Isolation) → the blanket "all four pools use passwordless EMAIL_OTP / there
    are no passwords anywhere" is replaced by a per-audience credential rule:
      * CUSTOMER  — MAY offer email+password, email OTP, and federated (Google) sign-in; OPEN
                    self-registration. Federated identities MUST be linked into the native profile
                    so one person is one identity (one `sub`), and linking MUST require a
                    provider-asserted VERIFIED email — linking on an unverified email is an
                    account-takeover primitive, not a convenience.
      * DRIVER / SHOP / ADMIN — remain STRICTLY passwordless EMAIL_OTP and admin-provisioned.
    The "no passwords" guarantee therefore narrows from "the platform" to "the platform's INTERNAL
    audiences", and is stated as such rather than quietly dropped.

Why now: the customer is the first audience the platform does not employ. A provisioned employee and
         a self-registering shopper have different threat models and different expectations; the
         security stance that is right for staff (no password to steal, no reset flow to attack)
         should not be traded away platform-wide in order to serve the public one. Leaving the text
         unchanged would make the constitution false as a description of the platform, which the
         Quality Gates define as a defect. See specs/011-customer-storefront-web/research.md § D13–D18
         and specs/011-customer-storefront-web/plan.md § Constitution Check.

Unchanged: Principles I, II, III, V, VI, VII (bodies + rationale); the SUBSTANCE of Principle IV's
           isolation model; Governance; all Technology Standards; Quality Gates.

Templates requiring updates:
  ✅ .specify/templates/plan-template.md   — Constitution Check defers dynamically; no edit needed.
  ✅ .specify/templates/spec-template.md   — WHAT/WHY-only specs; unaffected.
  ✅ .specify/templates/tasks-template.md  — unaffected.
  ⚠ CLAUDE.md                              — the "Auth" section's "All four pools use passwordless
                                             EMAIL_OTP (no passwords anywhere)" sentence MUST be
                                             updated in the same change (011 task).
  ⚠ ARCHITECTURE.md                         — § "Customer web (SSR)" says the auth guard is edge
                                             middleware; Next 16 renames middleware → proxy and its
                                             own guide forbids relying on it for authorization
                                             (research D20). Amended by 011.

Follow-up TODOs: none.

Prior history:
  1.6.0 (2026-07-10) — MINOR: the third audience, its pool, and its two RBAC groups unified onto the
                       single name `shop`; the retired token was removed platform-wide (feature 008).
  1.5.0 (2026-07-09) — MINOR: Principle IV generalized from "the admin pool defines RBAC groups"
                       to "pools MAY define RBAC groups"; the shop pool gained its two role groups
                       (introduced as `store_manager` / `store_staff`; renamed to `shop_*` in
                       1.6.0). Added the claim-as-origin / record-as-authority distinction.
  1.4.0 (2026-07-08) — MINOR: TanStack suite locked for web; Zustand removed platform-wide in
                       favour of TanStack Store; Tailwind v4 + shadcn/ui Radix base pinned.
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
four audiences — customers, drivers, shops, and admin/back-office. Customers buy from one brand
("Effy"); shops are hidden internal fulfillment nodes (dark-store-like) that customers never see;
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

Authentication uses four isolated Cognito pools: customer, driver, shop, admin.

**Isolation (applies to all four pools, without exception):**

- Each pool is validated independently, with per-pool JWT validation and a pinned issuer.
- Frontends authenticate against Cognito directly; backends validate tokens per pool.
- There is **no auth proxy** — backends do not forward or broker authentication on behalf of
  another pool.
- A token issued for one pool MUST NOT be accepted by a surface or service scoped to another.
- Pools MAY define **RBAC groups**, surfaced via the `cognito:groups` JWT claim. The **admin** pool
  defines `admin` / `manager` / `csa`; the **shop** pool defines `shop_manager` / `shop_staff`.
  The customer and driver pools define none. In every case the claim is the **origin of role
  assignment**; where the platform keeps its own record of that person, that record is
  **authoritative for the access decision** (role, status, and any scope it owns) — a valid claim
  never overrides it.

**Credentials — the rule is per-audience, because the audiences differ in kind:**

- **Internal audiences (driver, shop, admin)** — **strictly passwordless EMAIL_OTP**, and strictly
  **admin-provisioned** (no self-signup). **There are no passwords on the platform's internal
  audiences.** They are Effy employees; a password is a credential to steal and a reset flow to
  attack, in exchange for nothing they need.
- **The customer audience** — the only audience the platform does not employ, and the only one open
  to the public. The customer pool MAY offer **email + password**, **email OTP**, and **federated
  (Google) sign-in**, and it is **open to self-registration**.
  - **One person is one identity.** All credential routes MUST converge on a **single** pool profile
    (a single `sub`); a federated identity MUST be **linked into the native profile**, never left to
    stand as a second account.
  - **Linking MUST require a provider-asserted verified email**, matched against a verified email on
    the native profile. Linking on an unverified email is an **account-takeover primitive**, not a
    convenience, and is forbidden.
  - The platform record remains authoritative for the access decision (status), per the isolation
    rules above — a valid credential never overrides a barred customer.

**Rationale**: Four audiences with different trust levels demand hard isolation; direct Cognito +
per-pool validation keeps blast radius small and the trust model auditable. The credential rule
splits because the threat model splits: a provisioned employee and a self-registering member of the
public are not the same kind of principal, and forcing one credential policy onto both would either
cripple the storefront or needlessly widen the attack surface on the internal consoles.

### V. Native-Feel, Consistent Design

One design-system package drives every surface.

- Brand color is Effy Emerald — accent `#065f46` (emerald-800) with a white label in both modes, over
  neutral-scale surfaces (no brand tint), with a terracotta accent `#d0735a`. The full token set —
  this palette (light + dark), the Nunito Sans typeface, and the spacing + radius scales — comes from the
  design-system package (the SSOT), never hardcoded per surface. (Superseded Jade `#0FB57E` / fill
  `#047857` as of v1.10.0.)
- Dark mode is REQUIRED on every surface, and MUST be user-selectable (Light / Dark / Follow-System).
- Mobile MUST feel native: iOS follows Apple HIG, Android follows Material.
- Fat-finger-friendly touch targets and micro-animations are REQUIREMENTS, not optional
  polish.
- **Reference platforms**: Effy is **"Uber Eats + eBay, food-first."** When deciding business logic,
  data models, entities, or UI/UX for a feature, the team SHOULD look to how **Uber Eats** (food,
  menus, modifiers, discovery) and **eBay** (rich product entities, attributes/item-specifics,
  category taxonomy, search/filter) solve the same problem, adapt it to Effy's single-brand,
  hidden-fulfillment model, and favour the industry-standard, production-grade pattern over a
  bespoke one. Food and food-related products get priority.
- **No card layouts**: Card-style containers (bordered/elevated boxes tiling content; "metric cards";
  dashboard summary cards) MUST NOT be used to lay out content, and pages MUST NOT show metric/summary
  cards at the top — **unless a card is demonstrably the right pattern for that specific content and no
  better layout exists**, in which case the plan MUST record the justification. Prefer tables, lists,
  sectioned pages, tabs, and detail rows.

**Rationale**: A single design system is how all surfaces stay visually and behaviorally
coherent; native feel and tactile quality are part of the product, not a finishing pass. The two
doctrines keep that coherence *directional*: a shared reference for how features should look and
behave, and a standing bias away from the card-tiled dashboard aesthetic the team has rejected —
so consistency is decided once, in the constitution, not re-litigated per surface.

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
- **Unidirectional client state** — mobile uses **MVVM**: a `ViewModel` exposes a single **immutable,
  observable UI-state object** that the View renders, and the View invokes `ViewModel` functions for
  user actions (state flows down, events flow up). Web treats the server-state cache as the source of
  truth and keeps a client store only for genuine client state. Server data MUST NOT be hand-cached in
  component state.
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

**Version**: 1.10.0 | **Ratified**: 2026-06-25 | **Last Amended**: 2026-07-17
