# Feature Specification: Back-Office Web Foundation (Bootstrap)

**Feature Branch**: `005-back-office-web`

**Created**: 2026-07-08

**Status**: Draft

**Input**: User description: "Now let's plan the back-office web application. we should use following technologies vite, react, Tanstack router, Tanstack query, Tanstack table, tanstask form, tanstask db and tanstask store, and also tanstask devtools, and hotkeys. for the UI we should use shadcn ui … `pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix --template vite --pointer` … we should use shadcn preset b2BnwlLOK. … as this specs let's boostrap the react app"

> Technology-specific directives from the description (build tooling, the client library
> suite, the UI toolkit and its exact init command, and the research references) are
> recorded verbatim in [operator-directives.md](./operator-directives.md) as **plan-phase
> input** — this spec stays free of implementation detail per constitution Principle I.

This slice **bootstraps the first web surface** of the platform: the internal **back-office**
admin console. Like the backend bootstrap (004), its deliverable is a *foundation*, not
product features — it proves the platform's web architecture, admin identity model, the
platform's own back-office identity/RBAC system of record, and the shared cross-surface
foundation end to end, using minimal proving screens rather than real administrative
capabilities (there is no product data to administer yet). The three other web surfaces
inherit everything this slice establishes.

## Clarifications

### Session 2026-07-08

- Q: For US3 (role-aware console), how deep should back-office role differentiation go this slice, given the existing proving endpoint authorizes any back-office role equally? → A: **Option B** — demonstrate *backend-authoritative* inter-role gating now. The cost-optimized back-office backend gains **one minimal admin-only proving endpoint** (in addition to the any-role proving read); the console proves that an administrator is served while a manager/customer-service account is **refused by the backend itself** (not only hidden in the interface). This intentionally expands scope beyond "consume only the existing endpoint."
- Q: Should back-office RBAC rely solely on the external identity provider (Cognito groups), or should the platform keep its own record of staff and roles? → A: **The platform keeps its own system of record.** The back-office backend persists a staff record (keyed to the verified identity subject) with the member's email, roles, and a platform-owned **active/disabled status**, created on first authenticated contact (staff are provisioned in the identity provider; the backend meets them on first request) and refreshed idempotently thereafter. Authorization for privileged access is decided from this record — including status — so a disabled staff member is refused even with a valid credential. The identity provider remains the authentication authority and the origin of role assignment this slice; the platform database becomes the authorization/audit system of record. This adds the first real tables (the back-office staff/role schema, in the `admin` data area) via the established migration workflow — a further scope expansion (new **User Story 4**).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - An Effy staff member signs in passwordlessly and reaches the console (Priority: P1)

The platform gains its first internal web application. An Effy back-office staff member —
whose account was provisioned for them (there is no public sign-up) — opens the console,
enters their work email, receives a one-time code, enters it, and lands in an authenticated
console shell that greets them by their verified identity. Their session persists across a
page reload, protected areas are unreachable until they are signed in, and they can sign
out to end the session cleanly. The codebase itself is the deliverable: it exhibits the
platform's binding layered web architecture and native-quality, dark-mode-capable interface
so every future screen has an established groove to follow.

**Why this priority**: Authenticated entry is the irreducible core of an internal console —
without it there is no console. It is also the first live proof of the admin identity pool
(passwordless, admin-provisioned) driving a real client, and it is independently valuable
and demonstrable on its own.

**Independent Test**: From a fresh clone, start the app locally against the live development
environment, request a code for a provisioned back-office account, complete the code entry,
and confirm arrival in the authenticated shell; reload and confirm the session persists;
sign out and confirm protected areas become unreachable.

**Acceptance Scenarios**:

1. **Given** a provisioned back-office account and the running console, **When** the staff
   member submits their work email, **Then** a one-time code is sent and the console prompts
   for it — never asking for a password (no passwords exist anywhere).
2. **Given** a correct, unexpired one-time code, **When** it is submitted, **Then** the
   staff member is admitted to the authenticated console shell, which displays their verified
   identity.
3. **Given** an authenticated session, **When** the page is reloaded, **Then** the staff
   member remains signed in without re-entering a code, until the session legitimately
   expires.
4. **Given** an unauthenticated visitor, **When** they navigate directly to a protected area
   (including via a deep link or the browser back/forward buttons), **Then** they are sent
   to sign-in and, after authenticating, returned to their intended destination.
5. **Given** an authenticated session, **When** the staff member signs out, **Then** the
   session is cleared and every protected area becomes unreachable until they sign in again.

---

### User Story 2 - The console proves an identity-scoped read against the back-office backend (Priority: P2)

From inside the authenticated shell, the console performs a real call to the platform's
back-office backend service and displays the result: the caller's verified identity and the
back-office roles their account carries. The call carries the staff member's back-office
credential; the backend admits it because it is scoped to the back-office audience, and a
credential minted for any other audience could never be produced by this console. A staff
member whose account carries no back-office role is shown a clear "access denied" state
rather than data. When the backend is unreachable or slow to wake, the console shows a clear
degraded state and recovers gracefully rather than breaking. This proves the entire vertical
— client → cost-optimized backend → identity + role enforcement → back — on the smallest
possible surface.

**Why this priority**: A console that cannot talk to its backend is inert. This story proves
the full request loop and the role model against the endpoint that already exists for it,
without needing any product feature — the reference pattern every future data screen copies.

**Independent Test**: Signed in as a staff member with a back-office role, open the proving
screen and confirm it renders the verified identity and roles returned by the backend; sign
in as a role-less account and confirm a clear no-privileges state with no privileged data;
simulate the backend being unreachable and confirm a clear, recoverable degraded state with no
broken interface.

**Acceptance Scenarios**:

1. **Given** an authenticated staff member with at least one back-office role, **When** the
   proving screen loads, **Then** the console calls the back-office backend with the
   member's back-office credential and displays the verified identity and role list the
   backend returns.
2. **Given** a staff member whose account carries no back-office role, **When** the proving
   screen loads, **Then** the console shows a clear **no-privileges / no-access** state and
   **never any privileged data** — whether the backend denies the read (role-claim gate) or, after
   US4, returns an empty-role record.
3. **Given** the backend is unreachable, slow to wake, or returns an error, **When** the
   proving screen loads, **Then** the console shows a clear, human-readable degraded state
   and offers a way to retry, without exposing internal error detail and without leaving a
   broken interface.
4. **Given** a session whose credential has expired, **When** a protected read is attempted,
   **Then** the console handles it uniformly — recovering the session or returning the
   member to sign-in — rather than surfacing a raw failure.

---

### User Story 3 - Role-aware console proves backend-authoritative inter-role gating (Priority: P3)

The console adapts to the back-office role each account carries — the platform's back-office
roles (administrator, manager, customer-service). What a staff member can see and reach is
governed by their role, surfaced from their verified identity, so a lower-privilege member is
never shown controls they cannot use, and a role-less member is admitted to nothing
privileged. Crucially, this is defense in depth, not interface theater: the console reaches
an **administrator-only** proving read on the back-office backend and demonstrates that an
administrator is served while a manager or customer-service account is **refused by the
backend itself** — the interface's role-awareness is a least-privilege layer *over* an
authoritative backend gate, never a substitute for it.

**Why this priority**: The four-audience model plus back-office roles is a platform rule, and
"never trust the client" means the highest-privilege distinction must be enforced at the
backend and merely *reflected* in the interface. It builds directly on the verified identity
and any-role proving read of US2, so it follows them.

**Independent Test**: Sign in as an administrator and confirm the administrator-only area and
its backend read succeed; sign in as a manager/customer-service account and confirm the same
area is hidden in the interface *and* that the backend refuses the administrator-only read if
it is attempted directly; sign in as a role-less account and confirm no privileged area is
reachable.

**Acceptance Scenarios**:

1. **Given** accounts carrying different back-office roles, **When** each signs in, **Then**
   the console reveals exactly the areas that role permits and hides those it does not.
2. **Given** a manager or customer-service member who attempts the administrator-only read
   directly (bypassing the hidden interface control), **When** the request reaches the
   backend, **Then** the backend **independently refuses it** with the uniform access-denied
   contract — proving the gate is authoritative, not interface-only.
3. **Given** an administrator, **When** they open the administrator-only area, **Then** the
   backend serves the administrator-only proving read and the console renders it — the
   positive half of the same gate.
4. **Given** a role-less authenticated account, **When** they are in the console, **Then**
   no privileged area is reachable and the state is communicated clearly rather than as a
   silent empty screen.

---

### User Story 4 - The platform keeps its own record of back-office staff and their roles (Priority: P4)

The platform stops relying solely on the external identity provider for who its back-office
staff are and what they may do. Because staff are provisioned in the identity provider, the
back-office backend meets a staff member on their **first authenticated request** — and at that
moment records them in the platform's **own system of record**: their stable identity, contact
email, the roles they carry, and an **active/disabled status the platform owns**. On later
visits the record is kept current, idempotently, with no duplicates. Authorization for
privileged actions is then decided from the platform's own record — a staff member the platform
has marked **disabled is refused even while holding an otherwise-valid credential**, and roles
are read from the record. This gives the platform an auditable, manageable basis for access
control that outlives any single token and does not depend on the identity provider alone.
Concretely, this story introduces the **record-backed identity read** (the console's identity
screen graduates to it from the P2 token-echo read) and **upgrades the administrator gate (US3)**
from a role-claim decision to a decision the backend makes from the platform record.

**Why this priority**: Real RBAC needs a system of record the platform controls — for audit, for
the ability to revoke or adjust access independent of the identity provider, and as the
foundation every future back-office capability authorizes against. It builds on the verified
identity (US1) and the backend gate (US3), which now consults the platform's own record; it is
foundational but not the irreducible sign-in core, so it follows the first proofs.

**Independent Test**: Sign in as a provisioned staff member and confirm the platform now holds a
record of them (identity, email, roles, active status) created on that visit and refreshed
without duplication on repeat visits; have the platform mark a staff member disabled and confirm
they are refused privileged access despite a valid credential.

**Acceptance Scenarios**:

1. **Given** a provisioned staff member seen for the first time by the back-office backend,
   **When** they make their first authenticated request, **Then** the platform creates a record
   of them in its own system of record — stable identity, email, roles, and active status — and
   the operation is idempotent (no duplicate records on concurrent or repeat first contact).
2. **Given** an existing staff record and a subsequent authenticated request, **When** it is
   handled, **Then** the record is refreshed (roles reconciled from the verified identity,
   last-seen updated) without creating a duplicate.
3. **Given** a staff member the platform has marked **disabled**, **When** they attempt
   privileged access with an otherwise-valid credential, **Then** the platform refuses them from
   its own record — independent of the identity provider — with the uniform access-denied
   contract.
4. **Given** the administrator-only gate (US3), **When** it decides access, **Then** it
   authorizes from the platform's own staff/role record (role **and** status), not solely from
   the credential's claim.
5. **Given** the back-office staff/role schema, **When** it is introduced, **Then** it arrives
   through the platform's established, forward-only data-migration workflow, in the back-office
   data area (not the customer-operational area).

---

### User Story 5 - The first shared web foundation and its conventions are established (Priority: P5)

This slice births the shared cross-surface web foundation that the other web surfaces will
inherit rather than duplicate: the one brand design system (the platform's jade brand,
dark-mode support required) and the typed, shared building blocks (a single interface to the
backend, shared type definitions, per-environment configuration) — the single source of
truth, never copy-pasted per surface. It ships with the documentation that makes the
foundation self-propagating: a structure guide explaining where every concern lives and why,
an "add a screen/route" walkthrough, and the shared error-handling contract as experienced by
a client. A developer new to the codebase can add a screen correctly on their first attempt
using only the repository's documentation.

**Why this priority**: The foundation is only worth building if every future web surface and
screen lands in it consistently. It documents and packages what US1–US4 establish, so it
completes last — but it is the reason a *bootstrap* slice exists rather than a one-off app.

**Independent Test**: Confirm the design system carries the brand and supports dark mode and
is consumed (not re-implemented) by the console; confirm the shared building blocks live in
one place both this surface and a hypothetical second surface could import; then have a
developer follow only the documentation to add a practice screen and confirm it conforms to
conventions on the first attempt.

**Acceptance Scenarios**:

1. **Given** the console, **When** its visual foundation is inspected, **Then** it consumes
   the shared design system (brand identity, dark-mode support) rather than re-implementing
   styling locally.
2. **Given** the shared building blocks (backend interface, shared types, configuration),
   **When** they are located, **Then** each lives in one shared place addressable by any web
   surface, with no surface-local duplicate.
3. **Given** only the repository documentation, **When** a developer follows the
   "add a screen/route" walkthrough, **Then** they produce correctly placed files in the
   correct layers, conforming to conventions, on the first attempt.
4. **Given** failure responses from the backend, **When** the console renders them, **Then**
   every one is presented through the single documented client error-handling contract —
   never as raw internal detail.

---

### Edge Cases

- **Unrecognized or unprovisioned email at sign-in** → the console neither confirms nor
  denies whether an account exists; it responds uniformly (accounts are admin-provisioned,
  and the flow must not become an account-existence oracle).
- **Wrong, expired, or repeatedly failed one-time code** → clear, non-technical feedback; a
  way to request a new code; repeated failures are throttled per the identity provider's
  rules and communicated as such, without leaking why.
- **Session expiry mid-use** → the console detects it on the next protected action and either
  transparently recovers the session or returns the member to sign-in with their place
  preserved — never a raw error.
- **Authenticated but role-less** → admitted to the console frame but to nothing privileged;
  the state is explained, not a blank screen (see US2/US3); the platform still records the
  member (with no roles).
- **First contact / concurrent first requests** → the staff record is created exactly once
  (idempotent upsert); two simultaneous first requests never produce duplicate records.
- **Staff disabled in the platform while holding a valid credential** → privileged access is
  refused from the platform record, independent of the identity provider (US4).
- **Role drift between credential and platform record** → roles are reconciled from the verified
  identity on each visit (the identity provider is the origin of role assignment this slice);
  **status** remains platform-owned; the platform record is authoritative for the access
  decision, so the two never silently diverge on what is granted.
- **Backend cold start or transient unavailability** → treated as an expected degraded state
  with a clear message and retry, not a crash (the cost-optimized backend is allowed to be
  slow on first wake).
- **Direct deep-link / browser back-forward into a protected route while signed out** →
  redirected to sign-in and returned to the intended place after authenticating.
- **Light vs dark appearance** → the console is legible and on-brand in both; dark mode is a
  requirement, not optional polish.
- **Served from an unapproved origin** → the backend refuses the call; the console is served
  only from the platform's approved development origin, which is per-environment
  configuration, not hard-coded.
- **Telemetry hygiene** → product-analytics and error signals carry no personal information
  beyond the verified subject identifier; no code, token, or credential ever appears in
  analytics, logs, or error reports.
- **Secret and configuration hygiene** → no secret or credential is committed or bundled;
  per-environment values (backend location, identity pool identifiers, approved origin)
  are supplied as configuration, and a missing required value fails clearly rather than
  silently mis-targeting an environment.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST gain a **back-office web console** — its first internal web
  surface — that is independently buildable, runnable, and testable, and that runs **locally
  against the live development environment** this slice (hosted deployment is explicitly OUT
  of scope here; it arrives in a later slice).
- **FR-002**: The console MUST authenticate staff via **passwordless one-time-code sign-in
  against the back-office (admin) identity pool only** (feature 001); it MUST NOT offer
  self-sign-up, and MUST NOT collect or accept a password anywhere.
- **FR-003**: The console MUST maintain an authenticated session that persists across page
  reloads until legitimate expiry, MUST gate all protected areas behind authentication, and
  MUST provide an explicit sign-out that clears the session.
- **FR-004**: An unauthenticated visitor reaching a protected area (including by deep link or
  browser navigation) MUST be redirected to sign-in and, upon success, returned to the
  intended destination.
- **FR-005**: The console MUST perform at least one **proving read** against the platform's
  cost-optimized back-office backend, carrying the staff member's back-office credential,
  and MUST render the verified identity and the back-office roles the backend returns —
  demonstrating the full client → backend → identity/role enforcement → back loop without any
  product feature. This read MAY use the **existing** back-office proving endpoint (004) and is
  **independently deliverable at P2 without the persistence layer**; US4/FR-019 graduates the
  console's identity read to the record-backed touchpoint.
- **FR-006**: The console MUST consume the verified back-office **role** information
  (administrator / manager / customer-service) and present a **role-aware** interface: it
  reveals only what a role permits, admits a role-less account to nothing privileged, and
  relies on the backend as the authoritative gate (interface role-awareness is
  least-privilege UX and defense in depth, never the sole guard).
- **FR-006a**: The console MUST demonstrate **backend-authoritative inter-role gating** by
  reaching an **administrator-only** proving read on the cost-optimized back-office backend:
  an administrator MUST be served, and a manager or customer-service account MUST be refused
  **by the backend** (with the uniform access-denied contract) even if the request is issued
  directly, past the hidden interface control.
- **FR-007**: A credential the console presents to the back-office backend MUST be scoped to
  the back-office audience such that it is structurally usable only there; the console MUST
  never present a credential to a service of a different audience (constitution Principle
  IV).
- **FR-008**: The console MUST present all backend failures through a **single, documented
  client error-handling contract** aligned with the platform's shared error shape —
  human-readable states with no internal detail, stack traces, or credential material ever
  shown to the user.
- **FR-009**: The console MUST handle the platform's expected failure and degraded states
  gracefully — unreachable/slow backend, expired session, role-less account, throttled or
  failed code entry — each with a clear state and, where applicable, a recovery path; it
  MUST never present a broken interface.
- **FR-010**: The console MUST be built on the platform's **shared cross-surface web
  foundation** — one brand design system and shared, typed building blocks (backend
  interface, shared types, per-environment configuration) — established here as the single
  source of truth for all web surfaces and consumed, not re-implemented, by this console.
- **FR-011**: The design system MUST carry the platform brand and **MUST support dark mode**;
  the console MUST be legible and on-brand in both light and dark appearances and MUST meet
  the platform's interaction-quality bar (adequate touch/click targets, responsive layout,
  accessible interactions).
- **FR-012**: The console MUST treat the backend's responses as the **authoritative source
  of server state** and MUST NOT hand-duplicate server data into ad-hoc interface state;
  genuine client-only state is kept separately (constitution Principle V, unidirectional
  client state).
- **FR-013**: The console MUST emit **product-analytics and runtime-error telemetry** through
  the platform's shared, typed event approach, carrying no personal information beyond the
  verified subject identifier and never any secret or credential (constitution Principle
  VII).
- **FR-014**: All environment-specific values (backend location, identity pool identifiers,
  approved origin) MUST be supplied as **per-environment configuration**; a missing required
  value MUST fail clearly, and no secret or credential MUST ever be committed or bundled.
- **FR-015**: The console codebase MUST follow the platform's **binding layered web
  architecture** — thin presentation → application/use-case → data access to the backend —
  with the mandated dependency direction, each concern in its own clearly named place, and
  explicit, greppable wiring (constitution Principle VI; ARCHITECTURE.md).
- **FR-016**: The slice MUST ship its **conventions as documentation** — a structure guide,
  an "add a screen/route" walkthrough, and the client error-handling contract — sufficient
  for a newcomer to add a screen correctly on the first attempt.
- **FR-017**: **No product administrative features ship in this slice.** The console proves
  the foundation with minimal proving screens only; real back-office capabilities arrive in
  later slices once the data they manage exists. The proving reads (any-role and
  administrator-only) are foundation demonstrations, not product functionality. The back-office
  **staff and role records** established here (FR-019) are platform **account/RBAC data** (the
  back-office data area's designated purpose: accounts + audit), **not** product data;
  catalog / order / store data remains out of scope.
- **FR-018**: The cost-optimized back-office backend MUST gain **one minimal
  administrator-only proving endpoint** to support FR-006a — versioned per the platform's
  interface-versioning policy, returning no product data, authorizing the administrator role
  only (per FR-020, from the platform's staff/role record), and refusing all other back-office
  roles with the shared error contract. (Revises the earlier "no new backend endpoints"
  boundary; see Clarifications.)
- **FR-019**: The back-office backend MUST maintain the platform's **own system of record** for
  back-office staff — keyed to the verified identity subject — capturing at least each member's
  identity, contact email, assigned roles, and an **active/disabled status the platform owns**.
  A staff member MUST be recorded the **first time** the backend sees them (they are provisioned
  in the identity provider; the backend records them on first authenticated contact) and the
  record MUST be kept current on later visits **idempotently** — no duplicate records under
  repeat or concurrent first contact.
- **FR-020**: Authorization for privileged back-office access MUST be decidable from the
  platform's **own staff/role record — including the active/disabled status** — so a staff
  member the platform has disabled MUST be refused even with an otherwise-valid credential. The
  administrator-only gate (FR-006a) MUST consult this record for both role and status —
  **upgrading** the US3 role-claim gate to a record-backed decision (the US3 gate is
  independently deliverable on the role claim before this record exists).
- **FR-021**: The back-office staff/role schema MUST be introduced through the platform's
  established **forward-only data-migration workflow**, in the platform's **back-office data
  area** (not the customer-operational area), reading/writing only platform-owned objects.
- **FR-022**: Back-office **roles** MUST be reconciled into the platform record from the
  verified identity (the identity provider remains the **origin of role assignment** this
  slice), while **status is owned by the platform**; the platform record is **authoritative for
  the access decision**, so record and credential MUST NOT silently diverge on what access is
  granted. (Platform-authoritative role *management* — editing roles in the platform and pushing
  them outward — is a later slice.)

### Key Entities

- **Back-Office Console**: the runnable web application embodying the platform's layered web
  architecture; the permanent home of internal administrative workflows and the reference
  implementation for the other web surfaces.
- **Staff Session**: the authenticated, role-bearing context of a signed-in back-office staff
  member; the unit of protected-route and role-aware access.
- **Verified Identity & Roles**: the staff member's subject identifier and back-office roles
  (administrator / manager / customer-service) as verified by the identity provider (the
  authentication authority and origin of role assignment); drives greeting and role-aware UI.
- **Back-Office Staff Record**: the platform's **own** record of a staff member — identity,
  email, roles, and a platform-owned **active/disabled status** — created on first backend
  contact and kept current; the authorization/audit system of record, independent of the
  identity provider.
- **Role Assignment**: the association of a staff record with its back-office role(s); the
  normalized basis for authorization decisions and future role management.
- **Proving Screen**: the minimal screen(s) that demonstrate a complete client → backend →
  identity/role enforcement → platform data → back loop; foundation-only, no product data.
- **Shared Web Foundation**: the brand design system plus shared, typed building blocks
  (backend interface, shared types, configuration) — the single source of truth every web
  surface consumes.
- **Client Error-Handling Contract**: the single documented way backend failures are
  surfaced to staff; the boundary that keeps internal detail from reaching the interface.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: From a fresh repository clone on a machine with development access, a developer
  reaches a locally running console and completes a passwordless sign-in for a provisioned
  back-office account in **under 15 minutes** using only repository documentation.
- **SC-002**: A provisioned staff member completes the request-code → enter-code → land-in-
  console flow in **under 2 minutes**, with **zero** password prompts anywhere in the flow.
- **SC-003**: The proving screen demonstrably completes a full client → back-office backend →
  back round-trip — verified by observing the backend-returned verified identity and roles
  rendered in the console.
- **SC-004**: Across every tested combination, a back-office-scoped credential is accepted by
  the back-office backend and a role-less account is denied privileged data in **100%** of
  cases; **zero** privileged data is ever shown to a role-less or wrong-role account.
  Specifically, the administrator-only proving read is served to an administrator and
  **refused by the backend** for manager and customer-service accounts in **100%** of direct
  attempts.
- **SC-005**: **100%** of sampled backend-failure states (unreachable, slow cold start,
  expired session, denied) render as a clear, recoverable console state; **zero** present a
  broken interface or expose internal detail/stack traces/credentials.
- **SC-006**: The console is legible and on-brand in **both** light and dark appearances —
  verified across the sign-in and proving screens — and meets the platform interaction bar.
- **SC-007**: **Zero** secret or credential material is found in the repository or the built
  bundle, and **100%** of emitted telemetry events carry no personal data beyond the subject
  identifier, across the entire local-run workflow.
- **SC-008**: A developer new to the codebase, using only the repository documentation, adds
  a practice screen that passes convention review on the **first attempt**.
- **SC-009**: The shared web foundation (design system + shared typed building blocks) is
  consumed by the console with **zero** surface-local re-implementation of shared concerns —
  verified by locating a single source for each shared concern.
- **SC-010**: The console remains fully usable across page reloads and direct deep-links —
  **100%** of protected deep-links while signed out route to sign-in and return to intent
  after authentication; **zero** authenticated reloads force an unnecessary re-sign-in.
- **SC-011**: A provisioned staff member seen by the backend is recorded in the platform's
  system of record on first contact and refreshed on repeat visits with **zero** duplicate
  records — verified by inspecting the record after first and subsequent requests.
- **SC-012**: A staff member the platform marks **disabled** is refused privileged access in
  **100%** of attempts **despite holding a valid credential** — demonstrating an authorization
  decision the platform owns independently of the identity provider.

## Assumptions

- **Feature 001 (four identity pools, passwordless EMAIL_OTP) is a prerequisite** and the
  sole identity source; this slice authenticates against the existing **admin** pool and
  introduces no new identity infrastructure. Back-office accounts are **admin-provisioned**
  (no self-sign-up), consistent with 001.
- **Feature 004's `edge-api` is the backend this console consumes**, live in the development
  environment, via its existing back-office proving endpoint and shared error contract. This
  slice's **bounded** backend additions are: the administrator-only gate (FR-018), a
  staff-identity/record read (FR-005/FR-019), and the back-office **staff/role persistence
  layer** (FR-019–022) — all **foundation** (back-office accounts + RBAC), no product
  endpoints. Any further needed interaction is a signal to extend `edge-api` in its own change,
  not to bypass it.
- **The platform database (002) and migration workflow (003) are prerequisites**, and this
  slice introduces the **first real tables** — the back-office **staff/role schema** in the
  back-office (`admin`) data area — through the 003 forward-only workflow. This is also the
  **first exercise of that workflow's `db-up`** (an open 003 operator item). The identity
  provider (001 admin pool) remains the **authentication** authority and the **origin of role
  assignment**; the platform database becomes the **authorization/audit system of record**,
  with **status platform-owned**. No customer-operational (`public`) data is touched.
- **Deploy target is local-only this slice.** The console runs on the developer's machine
  against the live development backend from an approved development origin; **hosted
  deployment (and its infrastructure/runbook) is deferred** to a later slice — mirroring how
  `core-api` was local-only in 004.
- **No product administrative features ship.** Catalog, order, store, and product user
  management are later slices that land on this foundation once the data they manage exists;
  this slice delivers auth, shell, the proving loop, role-awareness, the **platform-owned
  staff/RBAC record**, and the shared foundation only. (The staff/role tables are platform
  account/RBAC data, not product data.)
- **This is the first web surface and the first shared web packages.** The shared foundation
  is created here but populated only with what US1–US5 need; `customer-web` and `store-web`
  extend it in their own slices. Per the platform's order-of-operations, the monorepo web
  scaffold is not pre-built ahead of this spec.
- **The back-office roles are the platform's existing back-office RBAC groups**
  (administrator / manager / customer-service) surfaced via the verified identity claim, as
  defined in 001 and CLAUDE.md; this slice consumes them and defines no new role model.
- **Mode of work**: all code, configuration, and documentation are authored for the operator;
  the **operator personally runs** anything that touches live cloud resources. This slice's
  local-only scope keeps operator-run steps minimal (obtaining a provisioned test account and
  confirming the dev backend/origin allowances).
