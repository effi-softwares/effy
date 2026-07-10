# Feature Specification: Shop Web Foundation (Bootstrap)

**Feature Branch**: `007-shop-web`

**Created**: 2026-07-09

**Status**: Draft

**Input**: User description: "next spec is that i want to boostrap the shop side web application. it must use the same tech as the back office webapp. but different user pool. also have the RBAC. this app is the web version of the KMP app for shop. so that they both should have same features."

> Technology-specific directives from the description (the shared web stack, the identity
> pool, the surface naming reconciliation, and the parity note) are recorded in
> [operator-directives.md](./operator-directives.md) as **plan-phase input** — this spec
> stays free of implementation detail per constitution Principle I.

This slice **bootstraps the platform's second web surface**: the **shop operator console**,
used by Effy staff working inside a shop (a hidden internal fulfillment node customers never
see). Like the back-office bootstrap (005), the deliverable is a *foundation*, not product
features — it proves the shop audience end to end: passwordless sign-in against a **different
identity pool**, hard cross-pool isolation, a **shop role model the platform does not have
yet**, backend-authoritative role gating, and the platform's own record of shop staff scoped
to the platform's **first shop record**. It is also the first proof that the shared web
foundation built for one surface is genuinely **reusable by a second** rather than
accidentally back-office-shaped.

It is, in addition, the **web half of a two-surface audience**: the shop audience is served
by both this console and the `shop` mobile app, which must be kept at feature parity.

## Clarifications

### Session 2026-07-09

- Q: The shop identity pool has **no role groups** today (unlike the back-office pool's admin/manager/csa). What is the shop role model, and where does role assignment originate? → A: **Mirror the back-office pattern.** The shop audience gains **two roles — `shop manager` (higher privilege) and `shop staff` (baseline operator)** — defined as **role groups on the shop identity pool**, exactly as the back-office pool defines its own. Role **assignment originates in the identity provider** and is surfaced on the verified identity; the shop backend **reconciles** those roles into the platform's own shop staff record on every visit, while the **active/disabled status stays platform-owned**. The access decision is made from the platform record (role **and** status), never from the credential alone. This expands scope: the shop identity pool must be **amended to carry role groups**, and constitution Principle IV — which today names role groups only on the admin pool — must be **reconciled at `/plan`**.
- Q: A shop operator works *at a shop*, but the platform has **no shop record of any kind** (the customer-operational data area has zero tables). Does this slice introduce a shop entity and scope staff to it? → A: **Yes — a minimal shop entity, with each operator assigned to one shop.** The platform gains a **minimal shop record** (a stable identity, an operator-facing code, a name, and an active flag) in the **customer-operational data area** — the platform's **first** record there — and every shop staff record is **scoped to exactly one shop**. The authorization decision therefore becomes **role AND status AND shop scope**: an operator with no shop assignment, or one assigned to an inactive shop, reaches nothing privileged. The shop staff/role schema lives in the **customer-operational** data area alongside the shop entity (**not** the back-office data area, whose designated purpose is back-office accounts + audit). This expands scope beyond a staff-only record. Shop records are **operator-seeded** this slice; shop *management* (creating and editing shops from the back-office console) is a later slice.
- Q: The `shop` mobile app is currently an empty scaffold, so "same features" cannot mean porting existing features. How is parity with the mobile surface delivered in this slice? → A: **A parity contract; the web surface is built now.** This slice builds the **web console only** and records the shop audience's **capability baseline** as a single-source **parity register** that both shop surfaces are held to — each capability marked *delivered* on web and *outstanding* on mobile. Bootstrapping the `shop` KMP app to that same baseline is **its own later slice**, which closes the mobile column. This keeps the slice to one surface, as every prior slice has been, while making the mobile gap explicit rather than silent.

### Session 2026-07-10 — shop creation removed (revises Q2 above)

- Q: Q2's answer said shop records would be **operator-seeded** this slice, via an administrative command. Should that manual creation path ship? → A: **No — remove it entirely.** Shop creation belongs to the platform's **back-office shop-management capability**, which is the next slice. Shipping a seed command and a seed file now would create tooling that is dead the day that slice lands, and would allow shop rows to exist that the product never created. **This slice therefore ships the shop schema and the authorization that depends on it, but no way to create a shop.**

  **Consequence, accepted deliberately:** the manager gate's authorization predicate inner-joins the shop, so with no shop in existence **no operator can hold a shop assignment**. The gate's *negative* half is fully provable now (a `shop_staff`, a role-less operator, and an unassigned `shop_manager` are each refused). Its *positive* half — a manager at an active shop being **served** — and the disabled-staff and inactive-shop denials each require shop data that only the back-office slice can create. Those success criteria are therefore **verified as part of that slice**, against data the product itself produced. This slice ships **code-complete and partially signed off**, which is a stronger position than shipping fully signed off against rows inserted by hand.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A shop operator signs in passwordlessly and reaches the console (Priority: P1)

The shop audience gains its first web application. A shop operator — whose account was
provisioned for them (there is no public sign-up) — opens the console, enters their work
email, receives a one-time code, enters it, and lands in an authenticated console shell: the
same standard dashboard layout the platform established for internal consoles, with a
persistent collapsible side-navigation rail (brand, primary navigation, and a user menu
showing their verified identity and offering sign-out), a top bar showing their current
location, and a main content region into which every screen renders. Their session persists
across a page reload, protected areas are unreachable until they are signed in, and they can
sign out cleanly.

**Why this priority**: Authenticated entry is the irreducible core of an operator console —
without it there is no console. It is the first live proof of the **shop** identity pool
driving a real client, and it is independently valuable and demonstrable on its own.

**Independent Test**: From a fresh clone, start the app locally against the live development
environment, request a code for a provisioned shop account, complete the code entry, and
confirm arrival in the authenticated shell; reload and confirm the session persists; sign out
and confirm protected areas become unreachable.

**Acceptance Scenarios**:

1. **Given** a provisioned shop account and the running console, **When** the operator
   submits their work email, **Then** a one-time code is sent and the console prompts for it —
   never asking for a password (no passwords exist anywhere).
2. **Given** a correct, unexpired one-time code, **When** it is submitted, **Then** the
   operator is admitted to the authenticated console shell — the standard dashboard layout
   with its persistent side navigation, top location bar, and main content region — and their
   verified identity is displayed in the sidebar user menu.
3. **Given** an authenticated session, **When** the page is reloaded, **Then** the operator
   remains signed in without re-entering a code, until the session legitimately expires.
4. **Given** an unauthenticated visitor, **When** they navigate directly to a protected area
   (including via a deep link or the browser back/forward buttons), **Then** they are sent to
   sign-in and, after authenticating, returned to their intended destination.
5. **Given** an authenticated session, **When** the operator signs out, **Then** the session is
   cleared and every protected area becomes unreachable until they sign in again.
6. **Given** the authenticated shell, **When** the operator collapses or expands the
   side-navigation rail, **Then** the layout responds cleanly (navigation remaining reachable
   in its collapsed form) and the main content region reflows without a broken interface, in
   both light and dark appearances.

---

### User Story 2 - The console proves an identity-scoped read, and cross-audience credentials are structurally refused (Priority: P2)

From inside the authenticated shell, the console performs a real call to the platform's
cost-optimized **shop** backend service and displays the result: the caller's verified
identity and the shop roles their account carries. The call carries the operator's **shop**
credential; the backend admits it because it is scoped to the shop audience. Crucially, this
story proves the *negative* half of the platform's four-pool isolation rule as well: a
credential minted for the **back-office** audience is **structurally refused** by the shop
backend, and a shop credential is refused by the back-office backend — neither service
brokers, forwards, or trusts the other's tokens. When the backend is unreachable or slow to
wake, the console shows a clear degraded state and recovers gracefully rather than breaking.

**Why this priority**: A console that cannot talk to its backend is inert. This story proves
the full request loop, and it is the platform's **first live, two-sided demonstration** that
pool isolation is real rather than assumed — something the single-surface back-office slice
could not show. It is the reference pattern every future shop data screen copies.

**Independent Test**: Signed in as a shop operator, open the proving screen and confirm it
renders the verified identity and roles returned by the shop backend; present a back-office
credential to the shop backend and confirm it is refused; present a shop credential to the
back-office backend and confirm it is refused; simulate the backend being unreachable and
confirm a clear, recoverable degraded state with no broken interface.

**Acceptance Scenarios**:

1. **Given** an authenticated shop operator, **When** the proving screen loads, **Then** the
   console calls the shop backend with the operator's shop credential and displays the
   verified identity and role list the backend returns.
2. **Given** a valid credential minted for the **back-office** audience, **When** it is
   presented to the **shop** backend, **Then** the request is refused before any handler
   logic runs — the token is structurally unusable there, not merely unauthorized.
3. **Given** a valid **shop** credential, **When** it is presented to the **back-office**
   backend, **Then** it is likewise refused — proving the isolation holds in both directions.
4. **Given** the backend is unreachable, slow to wake, or returns an error, **When** the
   proving screen loads, **Then** the console shows a clear, human-readable degraded state and
   offers a way to retry, without exposing internal error detail and without leaving a broken
   interface.
5. **Given** a session whose credential has expired, **When** a protected read is attempted,
   **Then** the console handles it uniformly — recovering the session or returning the operator
   to sign-in — rather than surfacing a raw failure.

---

### User Story 3 - The shop role model exists and the backend enforces it (Priority: P3)

The shop audience gains a **role model it does not have today**: **shop manager** (higher
privilege) and **shop staff** (the baseline operator). Role assignment originates in the
identity provider — the shop identity pool is amended to carry these roles, mirroring how the
back-office pool carries its own — and the console adapts to the role each account carries.
What an operator can see and reach is governed by their role, so a shop staff member is never
shown controls they cannot use, and a role-less operator is admitted to nothing privileged.
This is defense in depth, not interface theater: the console reaches a **manager-only** proving
read on the shop backend and demonstrates that a shop manager is served while a shop staff
account is **refused by the backend itself** — the interface's role-awareness is a
least-privilege layer *over* an authoritative backend gate, never a substitute for it.

**Why this priority**: RBAC on the shop surface is the operator's explicit requirement and a
platform rule ("never trust the client"). It builds directly on the verified identity and
proving read of US2, so it follows them. It is the first role model the platform defines for a
non-back-office audience, and the first amendment of a second identity pool to carry roles.

**Independent Test**: Sign in as a shop manager and confirm the manager-only area and its
backend read succeed; sign in as a shop staff account and confirm the same area is hidden in
the interface *and* that the backend refuses the manager-only read if it is attempted directly;
sign in as a role-less account and confirm no privileged area is reachable.

**Acceptance Scenarios**:

1. **Given** the shop identity pool, **When** its role model is inspected, **Then** it defines
   the shop roles (**shop manager**, **shop staff**) and surfaces an account's roles on the
   verified identity — the identity provider being the origin of role assignment.
2. **Given** shop accounts carrying different shop roles, **When** each signs in, **Then** the
   console reveals exactly the areas that role permits and hides those it does not.
3. **Given** a shop staff account that attempts the manager-only read directly (bypassing the
   hidden interface control), **When** the request reaches the backend, **Then** the backend
   **independently refuses it** with the uniform access-denied contract — proving the gate is
   authoritative, not interface-only.
4. **Given** a shop manager, **When** they open the manager-only area, **Then** the backend
   serves the manager-only proving read and the console renders it — the positive half of the
   same gate.
5. **Given** a role-less authenticated account, **When** they are in the console, **Then** no
   privileged area is reachable and the state is communicated clearly rather than as a silent
   empty screen.

---

### User Story 4 - The platform keeps its own record of shops and the staff assigned to them (Priority: P4)

The platform stops relying solely on the external identity provider for who its shop staff
are and what they may do — and gains, for the first time, a record of the **shops themselves**.
A minimal shop record (stable identity, operator-facing code, name, active flag) is seeded, and
because staff are provisioned in the identity provider, the shop backend meets an operator on
their **first authenticated request** — and at that moment records them in the platform's **own
system of record**: their stable identity, contact email, the roles they carry, the **shop they
are assigned to**, and an **active/disabled status the platform owns**. On later visits the
record is kept current, idempotently, with no duplicates. Authorization for privileged actions
is then decided from the platform's own record — **role, status, and shop scope together** — so
an operator the platform has marked **disabled**, or one with no shop assignment, is refused
even while holding an otherwise-valid credential. This mirrors the back-office staff record
established in 005 and extends it with the shop scope the audience demands.

**Why this priority**: Real RBAC needs a system of record the platform controls — for audit, for
the ability to revoke access independent of the identity provider, and as the foundation every
future shop capability authorizes against. Shop scoping is what makes it meaningful for an
audience whose members work at exactly one hidden fulfillment node. It builds on the verified
identity (US1) and the backend gate (US3), which now consults the platform's own record.

**Independent Test**: Seed a shop; sign in as a provisioned shop operator and confirm the
platform now holds a record of them (identity, email, roles, assigned shop, active status)
created on that visit and refreshed without duplication on repeat visits; have the platform mark
an operator disabled and confirm they are refused privileged access despite a valid credential;
confirm an operator with no shop assignment reaches nothing privileged.

**Acceptance Scenarios**:

1. **Given** the platform's data, **When** the shop entity is introduced, **Then** a minimal
   shop record exists — stable identity, an operator-facing code unique across shops, a name,
   and an active flag — seeded by the operator, with no shop-management interface in this slice.
2. **Given** a provisioned operator seen for the first time by the shop backend, **When** they
   make their first authenticated request, **Then** the platform creates a record of them in its
   own system of record — stable identity, email, roles, shop assignment, and active status — and
   the operation is idempotent (no duplicate records on concurrent or repeat first contact).
3. **Given** an existing shop staff record and a subsequent authenticated request, **When** it
   is handled, **Then** the record is refreshed (roles reconciled from the verified identity,
   last-seen updated) without creating a duplicate, and the shop assignment is preserved.
4. **Given** an operator the platform has marked **disabled**, **When** they attempt privileged
   access with an otherwise-valid credential, **Then** the platform refuses them from its own
   record — independent of the identity provider — with the uniform access-denied contract.
5. **Given** an operator with **no shop assignment**, or one assigned to an **inactive shop**,
   **When** they attempt privileged access, **Then** they are refused and the state is
   communicated clearly rather than as a silent empty screen.
6. **Given** the manager-only gate (US3), **When** it decides access, **Then** it authorizes from
   the platform's own shop staff/role record — **role, status, and shop scope** — not solely
   from the credential.
7. **Given** the shop entity and the shop staff/role schema, **When** they are introduced,
   **Then** they arrive through the platform's established, forward-only data-migration workflow,
   in the **customer-operational** data area.

---

### User Story 5 - The shop audience's two surfaces are held at parity (Priority: P5)

The shop audience is served by **two** surfaces — this console and the `shop` mobile app — and
the platform commits to keeping them at feature parity rather than letting them drift. Because
the mobile app is today an empty scaffold, this slice builds the **web surface only** and
records the commitment as a **parity register**: the capabilities this bootstrap delivers for
the shop audience — passwordless sign-in against the shop pool, the authenticated shell, the
identity-scoped proving read, role-aware access, the backend-authoritative role gate, and the
shop-scoped staff record — become the shop audience's **first parity baseline**, each marked
*delivered* on web and *outstanding* on mobile. Bootstrapping the `shop` mobile app to this same
baseline is its own later slice, which closes the mobile column. Thereafter, adding a capability
to one surface makes the gap on the other visible instead of silent.

**Why this priority**: Parity is the operator's explicit requirement and the reason a
*bootstrap* slice exists rather than a one-off app: everything US1–US4 establish must be
inheritable by the mobile surface, and every future shop capability must land on both. It
documents and packages what the earlier stories build, so it completes last.

**Independent Test**: Confirm the shop audience's capability baseline is recorded in one
place that both surfaces reference; confirm each capability this slice ships is marked
delivered on web and outstanding on mobile; confirm the record is positioned such that a
future capability cannot be added to one surface without its parity state on the other being
explicit.

**Acceptance Scenarios**:

1. **Given** the shop audience's capability baseline, **When** it is located, **Then** it lives
   in exactly one place addressable by both the web and mobile surfaces, with no per-surface
   duplicate.
2. **Given** a capability this slice delivers on the web console, **When** the baseline is
   inspected, **Then** its state on the mobile surface is explicit — recorded as outstanding,
   never unstated.
3. **Given** the mobile surface remains an empty scaffold at the end of this slice, **When** the
   baseline is read, **Then** the outstanding mobile work is enumerated precisely enough to scope
   the later mobile bootstrap slice without re-deriving it.
4. **Given** only the repository documentation, **When** a developer adds a practice shop
   screen, **Then** they produce correctly placed files conforming to conventions on the first
   attempt, and the parity implication for the mobile surface is surfaced to them.
5. **Given** the shared web foundation (design system, backend interface, shared types,
   configuration), **When** this console is inspected, **Then** it **consumes** each shared
   concern from its single source with **zero** surface-local re-implementation or fork — proving
   the foundation is reusable by a second surface.

---

### Edge Cases

- **Unrecognized or unprovisioned email at sign-in** → the console neither confirms nor denies
  whether an account exists; it responds uniformly (accounts are admin-provisioned, and the flow
  must not become an account-existence oracle).
- **Wrong, expired, or repeatedly failed one-time code** → clear, non-technical feedback; a way
  to request a new code; repeated failures are throttled per the identity provider's rules and
  communicated as such, without leaking why.
- **A back-office credential presented to the shop backend** (or the reverse) → structurally
  refused before any handler logic runs; the refusal is uniform and reveals nothing about the
  other audience's existence.
- **A shop operator navigating to the back-office console** (or the reverse) → each console
  authenticates only against its own pool; a session in one grants nothing in the other, and no
  session material is shared between surfaces served from the same machine.
- **Session expiry mid-use** → the console detects it on the next protected action and either
  transparently recovers the session or returns the operator to sign-in with their place
  preserved — never a raw error.
- **Authenticated but role-less** → admitted to the console frame but to nothing privileged; the
  state is explained, not a blank screen; the platform still records the operator (with no roles).
- **Authenticated but assigned to no shop** → admitted to the console frame but to nothing
  privileged; the state is explained as a missing shop assignment, and the operator is recorded
  with no shop. Shop assignment is an operator-run provisioning step this slice, so this is an
  expected state, not an error.
- **Operator assigned to an inactive shop** → treated as unassigned for authorization purposes;
  privileged access is refused and the state is communicated clearly.
- **First contact / concurrent first requests** → the shop staff record is created exactly once
  (idempotent upsert); two simultaneous first requests never produce duplicate records.
- **Operator disabled in the platform while holding a valid credential** → privileged access is
  refused from the platform record, independent of the identity provider (US4).
- **Role drift between credential and platform record** → roles are reconciled from the verified
  identity on each visit (the identity provider is the origin of role assignment this slice);
  **status and shop assignment** remain platform-owned; the platform record is authoritative for
  the **access decision**, so record and credential never silently diverge on what access is
  granted.
- **An operator's roles removed in the identity provider between visits** → reconciled down on the
  next visit; their record persists (for audit) but grants nothing privileged.
- **Backend cold start or transient unavailability** → treated as an expected degraded state with
  a clear message and retry, not a crash (the cost-optimized backend is allowed to be slow on
  first wake).
- **Direct deep-link / browser back-forward into a protected route while signed out** →
  redirected to sign-in and returned to the intended place after authenticating.
- **Light vs dark appearance** → the console is legible and on-brand in both; dark mode is a
  requirement. Surfaces are **neutral** with the brand green as the **single accent**, inherited
  from the shared design system — the console defines no theme of its own.
- **Wide / large / ultrawide displays** → the interface scales up proportionally, inherited from
  the shared design system; the laptop-width baseline is unchanged.
- **Served from an unapproved origin** → the backend refuses the call; the console is served only
  from the platform's approved development origin, which is per-environment configuration, not
  hard-coded.
- **Telemetry hygiene** → product-analytics and error signals carry no personal information
  beyond the verified subject identifier; no code, token, or credential ever appears in analytics,
  logs, or error reports. Shop-audience events are distinguishable from back-office events.
- **Secret and configuration hygiene** → no secret or credential is committed or bundled;
  per-environment values (backend location, identity pool identifiers, approved origin) are
  supplied as configuration, and a missing required value fails clearly rather than silently
  mis-targeting an environment — including mis-targeting the **wrong pool**.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST gain a **shop operator web console** — its second web surface —
  that is independently buildable, runnable, and testable, and that runs **locally against the
  live development environment** this slice (hosted deployment is explicitly OUT of scope here;
  it arrives in a later slice).
- **FR-002**: The console MUST authenticate operators via **passwordless one-time-code sign-in
  against the shop (shop) identity pool only** (feature 001); it MUST NOT offer self-sign-up,
  and MUST NOT collect or accept a password anywhere.
- **FR-003**: The console MUST maintain an authenticated session that persists across page
  reloads until legitimate expiry, MUST gate all protected areas behind authentication, and MUST
  provide an explicit sign-out that clears the session.
- **FR-004**: An unauthenticated visitor reaching a protected area (including by deep link or
  browser navigation) MUST be redirected to sign-in and, upon success, returned to the intended
  destination.
- **FR-005**: The console MUST perform at least one **proving read** against the platform's
  cost-optimized shop backend, carrying the operator's shop credential, and MUST render the
  verified identity, the shop roles, and the **assigned shop** the backend returns —
  demonstrating the full client → backend → identity/role enforcement → platform record → back
  loop without any product feature.
- **FR-006**: The platform MUST define a **shop role model** for the shop audience, comprising
  **`shop manager`** (higher privilege) and **`shop staff`** (the baseline operator). These roles
  MUST be defined as **role groups on the shop identity pool** — mirroring how the back-office
  pool defines its own — so that the identity provider is the **origin of role assignment** and an
  account's roles are surfaced on its verified identity. Amending the shop identity pool to carry
  role groups is in scope for this slice.
- **FR-006a**: The shop backend MUST **reconcile** an operator's roles from the verified identity
  into the platform's own shop staff record on every authenticated visit, while the operator's
  **active/disabled status and shop assignment remain platform-owned**. The platform record MUST
  be authoritative for the **access decision**, so record and credential MUST NOT silently diverge
  on what access is granted.
- **FR-007**: The console MUST consume the verified shop **role** information and present a
  **role-aware** interface: it reveals only what a role permits, admits a role-less or
  shop-unassigned account to nothing privileged, and relies on the backend as the authoritative
  gate (interface role-awareness is least-privilege UX and defense in depth, never the sole guard).
- **FR-008**: The console MUST demonstrate **backend-authoritative inter-role gating** by
  reaching a **manager-only** proving read on the shop backend: a `shop manager` MUST be served,
  and a `shop staff` account MUST be refused **by the backend** (with the uniform access-denied
  contract) even if the request is issued directly, past the hidden interface control.
- **FR-009**: A credential the console presents to the shop backend MUST be scoped to the shop
  audience such that it is structurally usable only there. The shop backend MUST refuse a
  credential minted for any other audience, and services of other audiences MUST refuse a shop
  credential — verified **in both directions** against the back-office surface (constitution
  Principle IV; there is no auth proxy).
- **FR-010**: The console MUST present all backend failures through the **single, documented
  client error-handling contract** established by the shared web foundation — human-readable
  states with no internal detail, stack traces, or credential material ever shown to the user.
- **FR-011**: The console MUST handle the platform's expected failure and degraded states
  gracefully — unreachable/slow backend, expired session, role-less account, throttled or failed
  code entry, wrong-audience credential — each with a clear state and, where applicable, a
  recovery path; it MUST never present a broken interface.
- **FR-012**: The console MUST be built on the platform's **existing shared cross-surface web
  foundation** (established in 005) — the one brand design system and the shared, typed building
  blocks (backend interface, shared types, per-environment configuration). It MUST **consume**
  them from their single source and MUST NOT fork, copy, or re-implement any shared concern
  locally (constitution Principle II). Where the foundation proves back-office-shaped rather than
  audience-neutral, it MUST be **generalized in the shared package**, not worked around per
  surface.
- **FR-013**: The console MUST inherit the shared design system's brand, **dark mode**, neutral
  surfaces with a single brand accent, and proportional large-display scaling — defining **no**
  theme of its own — and MUST meet the platform's interaction-quality bar (adequate touch/click
  targets, responsive layout, accessible interactions).
- **FR-014**: The authenticated console MUST present the platform's standard **dashboard layout**
  — a persistent, collapsible side-navigation rail (brand, primary navigation, and a user menu
  exposing the verified identity and sign-out), a top bar indicating the current location, and a
  main content region into which all protected screens render — **role-aware** per FR-007, built
  from the shared design system rather than re-styled per surface.
- **FR-015**: The console MUST treat the backend's responses as the **authoritative source of
  server state** and MUST NOT hand-duplicate server data into ad-hoc interface state; genuine
  client-only state is kept separately (constitution Principle VI, unidirectional client state).
- **FR-016**: The console MUST emit **product-analytics and runtime-error telemetry** through the
  platform's shared, typed event approach, carrying no personal information beyond the verified
  subject identifier and never any secret or credential; shop-audience events MUST be
  distinguishable from other surfaces' events (constitution Principle VII).
- **FR-017**: All environment-specific values (backend location, identity pool identifiers,
  approved origin) MUST be supplied as **per-environment configuration**; a missing or wrong
  required value MUST fail clearly rather than silently targeting the wrong environment **or the
  wrong identity pool**, and no secret or credential MUST ever be committed or bundled.
- **FR-018**: The console codebase MUST follow the platform's **binding layered web
  architecture** — thin presentation → application/use-case → data access to the backend — with
  the mandated dependency direction, each concern in its own clearly named place, and explicit,
  greppable wiring (constitution Principle VI; ARCHITECTURE.md).
- **FR-019**: The platform MUST gain a **minimal shop record** — a stable identity, an
  operator-facing code unique across shops, a name, and an **active flag** — as the entity shop
  staff are assigned to. This slice defines the record and the authorization that depends on it;
  it ships **no way to create one**. Shop records are created by the platform's **back-office
  shop-management capability** (a later slice). **No manual seeding path ships** — no
  administrative command, script, or seed file — so that no shop row can ever exist that the
  product did not create. (Revised 2026-07-10; see Clarifications.)
- **FR-020**: The shop backend MUST maintain the platform's **own system of record** for shop
  staff — keyed to the verified identity subject — capturing at least each member's identity,
  contact email, assigned roles, the **shop they are assigned to**, and an **active/disabled
  status the platform owns**. Each operator MUST be assigned to **at most one shop**. An operator
  MUST be recorded the **first time** the backend sees them and the record MUST be kept current on
  later visits **idempotently** — no duplicate records under repeat or concurrent first contact,
  and the shop assignment preserved across refreshes.
- **FR-021**: Authorization for privileged shop access MUST be decidable from the platform's
  **own shop staff/role record**, combining **role AND active/disabled status AND shop scope** —
  so an operator the platform has disabled, one with no shop assignment, or one assigned to an
  inactive shop MUST be refused even with an otherwise-valid credential. The manager-only gate
  (FR-008) MUST consult this record for all three.
- **FR-022**: The **shop entity and the shop staff/role schema** MUST be introduced through the
  platform's established **forward-only data-migration workflow**, in the platform's
  **customer-operational data area** — which they are the **first records to occupy** — and **not**
  in the back-office data area, whose designated purpose is back-office accounts and audit. They
  MUST read and write only platform-owned objects.
- **FR-023**: The shop backend MUST gain the **minimal endpoints** needed to support FR-005,
  FR-008, and FR-020 — versioned per the platform's interface-versioning policy, returning **no
  product data**, and refusing unauthorized callers with the shared error contract.
- **FR-023a**: The shop audience's **capability baseline** MUST be recorded as a single-source
  **parity register** that both the web console and the `shop` mobile app are held to, listing each
  capability this slice establishes with its **explicit state on each of the two surfaces**
  (*delivered* on web, *outstanding* on mobile). It MUST enumerate the outstanding mobile work
  precisely enough to scope the later mobile bootstrap slice, and MUST be the single place a future
  capability's per-surface state is recorded, so that no capability can be added to one surface
  while leaving the other's state unstated. **Building the `shop` mobile surface is OUT of scope
  for this slice.**
- **FR-024**: The slice MUST ship its **conventions as documentation** — how a second surface
  consumes the shared foundation, an "add a screen/route" walkthrough for the shop console, and
  the shop audience's parity contract — sufficient for a newcomer to add a screen correctly on
  the first attempt.
- **FR-025**: **No product shop-operations features ship in this slice.** The console proves the
  foundation with minimal proving screens only; real shop capabilities (picking, packing,
  inventory, order handling) arrive in later slices once the data they manage exists. The **shop
  staff and role records** established here are platform **account/RBAC data**, and the **shop
  record** (FR-019) is the minimal **identity of a fulfillment node** that those records must be
  scoped to — it is deliberately the smallest entity that makes shop-scoped authorization
  meaningful, carries **no** operational attributes (no address, hours, capacity, zones, or
  inventory), and ships with **no management interface**. Catalog, order, and inventory data remain
  out of scope.

### Key Entities

- **Shop Operator Console**: the runnable web application for the shop audience; the web half of
  a two-surface audience and the second consumer of the platform's shared web foundation.
- **Operator Session**: the authenticated, role-bearing context of a signed-in shop operator; the
  unit of protected-route and role-aware access. Structurally distinct from a back-office session
  and never interchangeable with it.
- **Verified Identity & Shop Roles**: the operator's subject identifier and shop roles as
  verified by the identity provider (the authentication authority and, this slice, the **origin of
  role assignment**); drives greeting and role-aware interface.
- **Shop Role Model**: the shop roles and their privilege ordering — **shop manager** over
  **shop staff** — the platform's first role model for a non-back-office audience, carried as role
  groups on the shop identity pool.
- **Shop**: the minimal record of a hidden internal fulfillment node — stable identity,
  operator-facing code, name, active flag. The platform's **first customer-operational record**,
  and the scope every shop staff record hangs from. Customers never see it.
- **Shop Staff Record**: the platform's **own** record of an operator — identity, email, roles,
  **assigned shop**, and a platform-owned **active/disabled status** — created on first backend
  contact and kept current; the authorization/audit system of record, independent of the identity
  provider.
- **Role Assignment**: the association of a shop staff record with its shop role(s); the
  normalized basis for authorization decisions and future role management.
- **Shop Assignment**: the association of a shop staff record with exactly one shop; the third
  term — alongside role and status — of every shop authorization decision.
- **Shop Audience Capability Baseline**: the single-source **parity register** of what the shop
  audience can do and the explicit state of each capability on each of its two surfaces; the
  mechanism that keeps the web console and the `shop` mobile app from drifting.
- **Proving Screen**: the minimal screen(s) — rendered inside the dashboard shell — that
  demonstrate a complete client → backend → identity/role enforcement → platform record → back
  loop; foundation-only, no product data.
- **Shared Web Foundation**: the brand design system plus shared, typed building blocks (backend
  interface, shared types, configuration) — established by 005, **consumed and generalized** here,
  never forked.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh repository clone on a machine with development access, a developer
  reaches a locally running shop console and completes a passwordless sign-in for a provisioned
  shop account in **under 15 minutes** using only repository documentation.
- **SC-002**: A provisioned operator completes the request-code → enter-code → land-in-console
  flow in **under 2 minutes**, with **zero** password prompts anywhere in the flow.
- **SC-003**: The proving screen demonstrably completes a full client → shop backend → back
  round-trip — verified by observing the backend-returned verified identity, shop roles, and
  shop assignment rendered in the console. Until shops exist, the assignment renders as the
  explicit **"no shop assigned"** state, which is itself a required outcome (FR-007), not a gap.
- **SC-004**: Cross-audience isolation holds in **100%** of tested attempts, in **both**
  directions: a back-office credential presented to the shop backend is refused, and a shop
  credential presented to the back-office backend is refused; **zero** cross-audience request
  succeeds.
- **SC-005**: The manager-only proving read is **refused by the backend** for `shop staff` accounts
  in **100%** of direct attempts, and a **role-less** account is denied **every** privileged read in
  **100%** of cases; **zero** manager-only data is ever shown to a non-manager. (A `shop staff`
  account retains its own identity-scoped read — the gate distinguishes privilege levels, it does
  not lock out the baseline role.)
- **SC-005a**: Shop-scoped authorization holds in **100%** of attempts: an operator with **no shop
  assignment** is refused privileged access despite carrying a valid credential **and a sufficient
  role** — demonstrating that the decision combines role, status, **and** shop scope, and that the
  role alone grants nothing.
- **SC-005b** *(verified in the back-office shop-management slice)*: with a shop in existence, a
  `shop manager` who is **active and assigned to an active shop** is **served** the manager-only
  read; and the same manager is **refused** once their shop is deactivated. This is the positive
  half of the gate plus the inactive-shop denial. Neither can be exercised here, because this slice
  ships no way to create a shop (FR-019) — they are proven against product-created data, not
  hand-inserted rows.
- **SC-006**: **100%** of sampled backend-failure states (unreachable, slow cold start, expired
  session, denied, wrong-audience credential) render as a clear, recoverable console state;
  **zero** present a broken interface or expose internal detail, stack traces, or credentials.
- **SC-007**: The console is legible and on-brand in **both** light and dark appearances —
  verified across the sign-in and proving screens and the dashboard shell — with neutral surfaces
  and a single brand accent, and it scales proportionally on a large display, **entirely by
  inheritance** from the shared design system (**zero** theme or scaling rules defined locally).
- **SC-008**: **Zero** secret or credential material is found in the repository or the built
  bundle, and **100%** of emitted telemetry events carry no personal data beyond the subject
  identifier, across the entire local-run workflow.
- **SC-009**: The console consumes the shared web foundation with **zero** surface-local
  re-implementation, copy, or fork of a shared concern — verified by locating a single source for
  each shared concern and confirming this surface imports it; every generalization the second
  surface required landed **in the shared package**, not in the console.
- **SC-010**: The console remains fully usable across page reloads and direct deep-links —
  **100%** of protected deep-links while signed out route to sign-in and return to intent after
  authentication; **zero** authenticated reloads force an unnecessary re-sign-in.
- **SC-011**: A provisioned operator seen by the backend is recorded in the platform's system of
  record on first contact — with identity, email, roles, assigned shop, and active status — and
  refreshed on repeat visits with **zero** duplicate records and the shop assignment preserved,
  verified by inspecting the record after first and subsequent requests, including concurrent
  first contact.
- **SC-012** *(verified in the back-office shop-management slice)*: an operator the platform marks
  **disabled** is refused privileged access in **100%** of attempts **despite holding a valid
  credential** — demonstrating an authorization decision the platform owns independently of the
  identity provider. Marking an operator disabled is a **shop-staff management** action, which this
  slice deliberately ships no way to perform (FR-019); the `status` term is implemented and
  unit-tested here, and exercised live there. The **role** and **shop scope** terms are proven live
  here (SC-005, SC-005a), so the record-is-authoritative claim is not left wholly unproven.
- **SC-013**: On completing sign-in, the operator lands in the standard dashboard layout —
  persistent side navigation, top location bar, and main content region present — with their
  verified identity and sign-out reachable from the sidebar user menu, and the navigation rail
  collapses/expands cleanly in **both** light and dark appearances with **zero** broken layout
  states; every proving screen renders **inside** this shell.
- **SC-014**: **100%** of the capabilities this slice delivers for the shop audience appear in
  the single parity register with an explicit per-surface state (web and mobile), and **zero**
  capability is recorded for one surface while silent on the other. The register's outstanding
  mobile column is specific enough that the later mobile bootstrap slice can be scoped from it
  **without re-deriving** the capability list.
- **SC-015**: A developer new to the codebase, using only the repository documentation, adds a
  practice shop screen that passes convention review on the **first attempt**.
- **SC-016**: The shop role model is live on the shop identity pool — an account granted the
  `shop manager` or `shop staff` role has that role visible on its verified identity in
  **100%** of sign-ins, and the platform's staff record reflects it after reconciliation.

## Assumptions

- **Feature 001 (four identity pools, passwordless EMAIL_OTP) is a prerequisite** and the sole
  identity source; this slice authenticates against the existing **shop** pool. Shop accounts are
  **admin-provisioned** (no self-sign-up), consistent with 001. The pool is **amended** to carry the
  shop role groups (FR-006) — the only identity-infrastructure change in this slice.
- **The shop pool has no role model today.** Unlike the back-office pool, it carries no role
  groups. This slice therefore *creates* the shop audience's RBAC rather than consuming an
  existing one — the single largest difference from the back-office bootstrap (005).
- **Constitution reconciliation IS required.** Principle IV currently states that *"the admin pool
  defines RBAC groups (admin / manager / csa)"*. This slice introduces role groups on a **second**
  pool, so `/plan` MUST resolve the tension in its Constitution Check — either by amendment or by
  clarifying that the sentence enumerates the admin pool's groups rather than restricting groups to
  it. Flagged in [operator-directives.md](./operator-directives.md); it MUST NOT be resolved
  silently in code.
- **Provisioning a shop operator is a two-part identity step** this slice: create the account in the
  shop pool and grant it a shop role. Both happen in the identity provider (there is no
  self-service), and this slice ships **no tooling** for either — the operator uses the provider's
  own administrative commands. The third part — **assigning the operator to a shop** — cannot happen
  here at all, because no shop can exist (FR-019). It arrives with back-office shop management.
- **The shop schema lands before anything can write to it.** Defining `shop` and its authorization
  predicate here, and creating shop rows in the next slice, is deliberate: it lets the shop service
  and the console be built and proven against the *absence* of a shop (the unassigned denial, the
  "no shop assigned" console state), which are real required behaviours rather than placeholders.
- **Feature 004's shop service is the backend this console consumes**, live in the development
  environment, reachable through the platform's shared gateway with the shop pool's authorizer,
  and speaking the shared error contract. This slice's **bounded** backend additions are the
  proving reads, the manager-only role gate, and the shop/staff/role persistence layer — all
  **foundation** (shop accounts + RBAC), no product endpoints.
- **Feature 005 established the shared web foundation**, and this slice is its **first reuse
  test**. Anything the second surface cannot consume as-is is a defect in the shared package to be
  fixed there, not a reason to fork. *(Corrected at `/plan`, research R5: this assumption
  originally read "no new shared packages are assumed necessary." Inspection showed the reusable
  half of the back-office console — config, Amplify wiring, the EMAIL_OTP flow, session/guard,
  query-client, telemetry, client store, console shell, sign-in card, and the shadcn primitives —
  lives **inside the app**, not in a package. Satisfying FR-012/SC-009 therefore requires growing
  `@effy/design-system` and adding one new shared package. Per Principle I the assumption is fixed
  here rather than worked around downstream.)*
- **The platform database (002) and migration workflow (003) are prerequisites**; the shop entity
  and the shop staff/role schema arrive through the 003 forward-only workflow. The
  customer-operational data area currently has **zero tables**, so this slice introduces the
  **first records there** — a boundary worth naming, since every prior table lives in the
  back-office area.
- **The `shop` mobile app is an empty scaffold**, and **this slice does not build it.** "Same
  features" cannot mean porting features that do not exist; parity is delivered as a **register**
  (FR-023a) whose mobile column this slice leaves outstanding by design. The mobile bootstrap is a
  later slice, scoped from that register.
- **The shop record carries no operational attributes.** No address, hours, capacity, delivery
  zones, or inventory — those belong to the fulfillment slice that first needs them. This slice's
  shop record exists solely to make shop-scoped authorization meaningful.
- **Deploy target is local-only this slice.** The console runs on the developer's machine against
  the live development backend from an approved development origin; **hosted deployment (and its
  infrastructure/runbook) is deferred** to a later slice — mirroring 004's `core-api` and 005's
  back-office console.
- **No product shop-operations features ship.** Picking, packing, inventory, and order handling
  are later slices that land on this foundation once the data they manage exists; this slice
  delivers auth, shell, the proving loop, the shop role model, the platform-owned staff/RBAC
  record, the isolation proof, and the parity contract only.
- **Surface naming** (`shop-web` vs. the `shop-web` named in CLAUDE.md) is a plan-phase decision,
  flagged in [operator-directives.md](./operator-directives.md).
- **Mode of work**: all code, configuration, and documentation are authored for the operator; the
  **operator personally runs** anything that touches live cloud resources (pool provisioning of
  test accounts, migrations, deploys). This slice's local-only scope keeps operator-run steps
  minimal.
