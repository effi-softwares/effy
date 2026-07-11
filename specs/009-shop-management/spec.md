# Feature Specification: Back-Office Shop Management

**Feature Branch**: `009-shop-management`

**Created**: 2026-07-10

**Status**: Draft

**Input**: User description: "as the next feature i hope to create the full shop management feature
in back office app. here back office user can do. 1) create shops: by getting shop name, contact
person data (name, email) and other relevant details and create shops. 2) manage all the shops.
edit, delete, change status (disable, activate, suspend) and you should list down more than 20
features we can have back-office. then when new store create we create that store entity and create
new shop admin user in db and cognito shop pool. so that that shop owner can login to shop web
application with that email (passwordless)... identify all the data table and data model we should
have there... here also shop and shop users are separate entities. shop can multiple shop users, but
no shop user can have multiple shops. so do a deep dive and make a deep multi entity scope and data
models... we can also have these apis in edge-api. no need to have them in core-api."

> Technology-specific directives from the description (the cold-path/`edge-api` placement, the
> back-office surface, the Cognito shop-pool provisioning, the specific tables to evolve, and the
> cross-slice sign-off consequence) are recorded in [operator-directives.md](./operator-directives.md)
> as **plan-phase input** — this spec stays free of implementation detail per constitution
> Principle I.

This slice delivers the platform's **shop-management capability** inside the back-office console:
the first way to **create a shop**, to **provision the people who work at it**, and to **govern a
shop's lifecycle**. It is the capability every prior slice deferred to — most directly
**007-shop-web**, which shipped code-complete but only *partially* signed off precisely because no
shop and no shop user could be created. When this slice lands, back-office staff create shops and
their operators as **product data**, and a newly created shop owner can immediately sign in to the
shop console (007) passwordlessly and be **served** — closing 007's deferred criteria against data
the product itself produced, not hand-inserted rows.

Two entities, deliberately separate, anchor the whole slice: a **shop** (a hidden internal
fulfillment node) and a **shop user** (a person who works at exactly one shop). A shop has many
users; a user belongs to one shop. Everything else — creation, lifecycle, roles, access — hangs off
that relationship.

## Clarifications

### Session 2026-07-10 (informed defaults — see Assumptions)

The description was detailed enough that no blocking ambiguities remained; the following decisions
were made as **documented informed defaults** rather than open questions. Any of them can be revised
with `/speckit-clarify` before planning.

- **Who may manage shops** → back-office `admin` and `manager` may perform all shop-management
  actions; `csa` gets **read-only** visibility (browse/view), no mutations. (Assumption A1)
- **Shop creation always provisions a first user** → creating a shop requires exactly one **primary
  contact**, who becomes the shop's first user with the elevated **shop manager** role and a
  passwordless shop-pool account. A shop never exists with zero users. (Assumption A2)
- **Three shop statuses** → `active`, `suspended`, `disabled`; `suspended` and `disabled` both
  block their operators' privileged access, differing in intent/reversibility. (Assumption A5)
- **"Delete" means safe removal** → removal preserves referential integrity and audit history
  (archival), and a shop with dependent users/history cannot be hard-erased — it is disabled
  instead. (Assumption A6)
- **No moving a user between shops** in this slice → the one-shop invariant is enforced by
  deactivate-and-re-provision, not reassignment. (Assumption A8)

### Session 2026-07-10 (clarification pass)

- Q: When a shop is suspended/disabled, or a shop user is disabled, what happens to their
  passwordless sign-in account in the identity provider? → A: **Asymmetric.** Disabling a *user*
  also **disables their identity account** (they cannot obtain a session at all — defense in depth
  for the irreversible-intent case); suspending/disabling a *shop* leaves its users' identity
  accounts **sign-in-capable** but the gate refuses privileged access (shop status stays a cheap,
  reversible platform-record flip). Re-enabling a user re-enables the identity account.
- Q: Which back-office roles may manage shops? → A: **`admin` and `manager` may perform all
  shop-management mutations; `csa` is read-only** (browse/view, no mutations). Confirms A1.
- Q: What administrative details does the shop record itself carry (beyond the contact person, who
  becomes the first manager)? → A: **code, name, lifecycle status, timestamps, plus an optional
  contact phone and an optional notes/description.** No address, hours, capacity, zones, or
  inventory (deferred to the fulfillment slice). Refines A7/FR-017.
- Q: What does "delete a shop" do? → A: **Hard-delete is allowed only for a dependent-free shop**
  (no users, no operational history), behind explicit confirmation; any shop that has ever operated
  is **disabled** instead (retained for audit). Confirms A6.
- Q: What scale should the register/roster be designed for? → A: **Up to hundreds of shops and low
  thousands of shop users total** (tens of users per shop), with **server-side** pagination, search,
  and filter. Grounds SC-011.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create a shop and provision its first operator (Priority: P1)

A back-office administrator opens the shop-management area and creates a new shop: they enter the
shop's details (its operator-facing code, name, and administrative/contact details) and the
**primary contact person** who will run it (that person's name and work email). On submission the
platform, in **one coherent operation**, brings a shop into existence, creates the primary contact
as the shop's first **shop manager** — both as the platform's own record and as a passwordless
account in the shop audience's identity provider — and scopes that user to the new shop. The new
shop owner can then immediately go to the shop console (007), request a one-time code with that
email, sign in, and — because they are an active manager assigned to an active shop — be **served**.

**Why this priority**: This is the irreducible core. It is the first time a shop or a shop operator
can exist at all, and it is what unblocks every downstream shop capability and the deferred live
sign-off of 007. Delivered alone, it is already a complete, demonstrable MVP: create a shop, and its
owner can log in and work.

**Independent Test**: In the back-office console as an authorized admin, create a shop with a
primary contact email; confirm the shop and the shop-manager user both appear in the platform's
records scoped to that shop; then, in the shop console, request a code for that email, sign in, and
confirm the operator reaches the manager-gated area (007's positive gate) — all without any
password and without hand-inserting a single row.

**Acceptance Scenarios**:

1. **Given** an authorized back-office admin, **When** they submit a valid new-shop form (unique
   code, name, contact details, and a primary contact name + work email), **Then** the platform
   creates the shop, creates the primary contact as a **shop manager** scoped to that shop in the
   platform's own record, and provisions a passwordless account for that email in the shop
   audience's identity provider with the manager role — as one operation with a single success
   confirmation.
2. **Given** a shop just created this way, **When** its primary contact goes to the shop console and
   requests a one-time code for their email, **Then** they receive it, sign in with no password, and
   are **served** the manager-gated area — because they are an active manager assigned to an active
   shop (007's positive gate, exercised here against product-created data).
3. **Given** the create-shop operation, **When** either the identity-provider write or the
   platform-record write cannot complete, **Then** the operation does not leave a half-created
   result — no shop with a missing owner account, and no identity account with no platform record —
   and the administrator sees a clear failure they can safely retry.
4. **Given** a code that is already in use by an existing shop, **When** an admin submits it,
   **Then** creation is refused with a clear message and no partial data is written.
5. **Given** a contact email that already belongs to a shop user (at any shop), **When** an admin
   submits it as a new shop's primary contact, **Then** creation is refused — a person works at
   **one** shop — with a clear message, and no shop or account is created.
6. **Given** a back-office user without shop-management permission (e.g. a read-only role), **When**
   they attempt to create a shop, **Then** the action is unavailable in the interface **and**
   refused by the backend if attempted directly.

---

### User Story 2 - Browse, search, and view all shops (Priority: P2)

A back-office user opens the shop-management area and sees **all shops** in one place: a searchable,
filterable, paginated register showing each shop's code, name, current lifecycle status, and how
many users it has. They can filter by status (e.g. only suspended shops) and search by code or name,
and open any shop to a detail view showing its full details, its lifecycle status, and the list of
users assigned to it (each with their role, status, and when they were last seen).

**Why this priority**: A registry you cannot see is unmanageable. This is the read foundation every
other management action navigates from, and it is independently valuable to any back-office user —
including the read-only role — the moment even one shop exists.

**Independent Test**: With several shops of differing statuses present, open the register and
confirm all appear with correct code/name/status/user-count; filter by a status and confirm the list
narrows correctly; search a code and confirm the match; open a shop and confirm its detail and its
user list render accurately.

**Acceptance Scenarios**:

1. **Given** multiple shops exist, **When** a back-office user opens the shop register, **Then** all
   shops are listed with code, name, lifecycle status, and user count, in a stable order, paginated
   when numerous.
2. **Given** the register, **When** the user filters by a lifecycle status or searches by code/name,
   **Then** only matching shops are shown, and clearing the filter restores the full list.
3. **Given** a shop in the register, **When** the user opens it, **Then** a detail view shows the
   shop's full details, its current status, and the list of its users with each user's role, status,
   and last-seen indication.
4. **Given** the read-only back-office role, **When** they use the register and detail views,
   **Then** everything is visible but no mutating control (create/edit/status/delete/user
   management) is offered or accepted.

---

### User Story 3 - Govern a shop's lifecycle: activate, suspend, disable (Priority: P3)

An authorized back-office user changes a shop's lifecycle status. They can **suspend** an active
shop (a temporary, reversible hold), **disable** a shop (a longer-term deactivation), and
**re-activate** a suspended or disabled shop. The change takes effect on the shop's operators'
access immediately: while a shop is suspended or disabled, its operators are **refused privileged
access** even with a valid credential; on re-activation they are served again. Each transition is
recorded (who, when, from-status, to-status), and the interface makes the current status and the
allowed transitions clear.

**Why this priority**: Lifecycle control is the operator's explicit requirement and the mechanism
that makes a shop registry a *governed* one rather than an append-only list. It also directly
exercises 007's shop-scope gate term against product data (a manager served at an active shop,
refused once it is suspended/disabled).

**Independent Test**: Take a shop with an active manager who is currently served on the shop console;
suspend the shop and confirm that operator is now refused privileged access; re-activate and confirm
they are served again; confirm each transition is recorded and that disallowed transitions are not
offered.

**Acceptance Scenarios**:

1. **Given** an active shop, **When** an authorized user suspends it, **Then** its status becomes
   suspended, the transition is recorded, and its operators are refused privileged access on their
   next attempt despite valid credentials.
2. **Given** an active or suspended shop, **When** an authorized user disables it, **Then** its
   status becomes disabled and its operators are likewise refused privileged access.
3. **Given** a suspended or disabled shop, **When** an authorized user re-activates it, **Then** its
   status becomes active and its (active) operators are served again.
4. **Given** any status change, **When** it is applied, **Then** it is recorded with actor, time,
   and the from/to statuses, and is visible in the shop's history.
5. **Given** a shop in a given status, **When** the interface presents its controls, **Then** only
   valid transitions are offered, and an attempt at an invalid transition is refused with a clear
   message.

---

### User Story 4 - Manage the people at a shop (Priority: P4)

An authorized back-office user manages a shop's roster from the shop's detail view: they **add more
users** to the shop (each provisioned with a passwordless identity account and a platform record
scoped to that shop, as either a **shop manager** or a baseline **shop staff** member), **change a
user's role**, and **disable or re-enable** a user. A disabled user is refused privileged access on
the shop console immediately, independent of the identity provider; a re-enabled active user is
served again. The one-shop invariant is preserved throughout: a user always belongs to exactly one
shop, and an email already bound to a shop user cannot be added to a second shop.

**Why this priority**: A shop is only as useful as the people who can operate it. This generalizes
US1's single-owner provisioning into full roster management and unblocks 007's disabled-operator
denial against product data. It builds on US1 (the same provisioning mechanics) and US2 (the detail
view it operates from), so it follows them.

**Independent Test**: On a shop's detail view, add a shop-staff user by email and confirm they can
sign in to the shop console with the staff (non-manager) privilege; promote them to manager and
confirm the elevated access; disable them and confirm they are refused privileged access despite a
valid credential; re-enable and confirm access returns; attempt to add an email already used at
another shop and confirm refusal.

**Acceptance Scenarios**:

1. **Given** a shop and an authorized back-office user, **When** they add a user by name, work
   email, and role, **Then** the platform provisions a passwordless account in the shop audience's
   identity provider and creates the matching platform record scoped to that shop with the chosen
   role — as one coherent, retry-safe operation.
2. **Given** an email already belonging to any shop user, **When** it is submitted as a new user
   for a shop, **Then** the operation is refused (one user, one shop) with a clear message and no
   account or record is created.
3. **Given** an existing shop user, **When** an authorized user changes their role between shop
   manager and shop staff, **Then** the change is reflected in the platform's record and on the
   user's identity, and their access on the shop console changes accordingly.
4. **Given** an active shop user, **When** an authorized user disables them, **Then** they are
   refused privileged access on the shop console on their next attempt despite a valid credential,
   and the platform records the change.
5. **Given** a disabled shop user, **When** an authorized user re-enables them, **Then** an active
   user is served again (subject to their shop still being active).
6. **Given** a user provisioned by this flow, **When** they sign in to the shop console for the
   first time, **Then** the console reconciles against the **pre-existing** platform record (correct
   shop assignment and role preserved) rather than creating a fresh, unassigned record — no
   duplicate results from first contact.

---

### User Story 5 - Edit a shop's details (Priority: P5)

An authorized back-office user edits a shop's mutable details — its name, contact details, and other
administrative attributes — from the shop's detail view. The operator-facing code, being the shop's
stable handle that other records and people refer to, is treated as immutable after creation (or
changeable only under an explicit, guarded rule). Edits are validated and recorded.

**Why this priority**: Details drift and must be correctable, but editing is lower-stakes than
creation, lifecycle, and roster management, so it follows them.

**Independent Test**: Open a shop, change its name and contact details, save, and confirm the
updated values persist and appear in the register and detail views; confirm the code cannot be
freely changed; confirm an invalid edit (e.g. empty name) is refused.

**Acceptance Scenarios**:

1. **Given** a shop, **When** an authorized user edits its name or contact details with valid
   values, **Then** the changes persist, are recorded, and appear in the register and detail views.
2. **Given** a shop, **When** a user attempts to change its operator-facing code, **Then** the
   interface treats the code as the stable handle it is (immutable, or changeable only under the
   explicit guarded rule the plan defines) rather than a routine edit.
3. **Given** an edit with an invalid value (e.g. a blank name), **When** it is submitted, **Then**
   it is refused with a clear message and no change is written.

---

### User Story 6 - Remove a shop safely (Priority: P6)

An authorized back-office user removes a shop that should no longer exist. Removal never orphans or
silently destroys history: a shop that has users or operational history cannot be hard-erased — the
correct action for a shop that has been operating is to **disable** it (US3), which retains it for
audit. Only a shop with no dependents (e.g. one created in error) may be fully removed, and the
action is confirmed and recorded.

**Why this priority**: Removal is real but rare and the most destructive action, so it is last and
deliberately constrained to protect referential integrity and the audit trail.

**Independent Test**: Attempt to remove a shop that has users and confirm it is refused with the
disable-instead guidance; create a shop in error with no users, remove it, and confirm it is gone
and the removal recorded; confirm the removed shop no longer appears in the register.

**Acceptance Scenarios**:

1. **Given** a shop with one or more users or any operational history, **When** an authorized user
   attempts to remove it, **Then** the removal is refused with clear guidance to disable it instead,
   and nothing is destroyed.
2. **Given** a shop with no dependents, **When** an authorized user confirms its removal, **Then**
   it is removed, no longer appears in the register, and the removal is recorded with actor and time.
3. **Given** any removal, **When** it is requested, **Then** it requires an explicit confirmation
   step so it cannot be triggered accidentally.

---

### Edge Cases

- **Half-completed provisioning** — the identity-provider write succeeds but the platform-record
  write fails (or vice versa) → the operation is recoverable and idempotent; re-running it converges
  to one consistent result with no orphaned identity account and no ownerless shop, and no duplicate
  identity account or record for the same email/subject.
- **Duplicate shop code** → refused at creation; the code is unique across all shops.
- **Email already bound to a shop user** (same or different shop) → refused; the one-user-one-shop
  invariant holds, and an email is never provisioned twice.
- **Concurrent creation with the same code or email** → exactly one succeeds; the other is refused
  cleanly with no partial or duplicate data.
- **Suspending/disabling a shop with active operators** → those operators are refused privileged
  access on their next attempt; sessions already open do not retain privileged access past the
  status change; the state is communicated clearly rather than as a raw error.
- **Disabling a user who is the shop's only manager** → allowed, but the interface surfaces that the
  shop is left with no manager (a warning, not a hard block), so it is a deliberate choice.
- **Re-enabling a user whose shop is suspended/disabled** → the user becomes active but is still
  refused privileged access because their shop is not active (both the shop-scope and status terms
  must hold), and this is communicated clearly.
- **Removing vs disabling** → a shop that has ever had users/history is disabled, not erased;
  attempting to erase it is refused with guidance.
- **Editing the immutable code** → not offered as a routine edit; if a guarded change rule exists it
  is explicit and recorded, never silent.
- **First shop-console sign-in of a pre-provisioned user** → reconciles against the existing record
  (assignment and role preserved), never creating an unassigned duplicate (continuity with 007's
  just-in-time reconciliation).
- **A back-office user without shop-management permission** → mutating actions are neither offered in
  the interface nor accepted by the backend; read-only visibility (if their role permits) still works.
- **Identity provider unreachable or slow** during provisioning → a clear, recoverable state; no
  partial platform record is committed that would drift from the identity provider.
- **Very large numbers of shops or users** → the register and roster paginate and remain responsive;
  no operation assumes a small fixed count.
- **Telemetry hygiene** → shop-management actions emit product-analytics and error signals carrying
  no personal data beyond the authenticated subject identifier; no email, code, token, or credential
  ever appears in analytics, logs, or error reports.
- **Secret & configuration hygiene** → identity-pool identifiers and backend locations are supplied
  as per-environment configuration; a missing required value fails clearly rather than silently
  targeting the wrong environment or pool; no secret is committed or bundled.

## Requirements *(mandatory)*

### Functional Requirements

**Shop lifecycle**

- **FR-001**: A back-office user with shop-management permission MUST be able to **create a shop** by
  supplying its operator-facing code, name, optional contact phone, optional notes/description, and
  exactly one primary contact person (name + work email). The operator-facing code MUST be unique
  across all shops.
- **FR-002**: On creation the platform MUST, as **one coherent operation**, (a) create the shop
  record, (b) create the primary contact as the shop's first **shop manager** in the platform's own
  record scoped to that shop, and (c) provision a passwordless identity account for that email in the
  shop audience's identity provider carrying the manager role — such that the new owner can sign in
  to the shop console immediately with no password.
- **FR-003**: A back-office user MUST be able to **browse all shops** in a searchable, filterable,
  paginated register showing at least each shop's code, name, lifecycle status, and user count, and
  MUST be able to **open a shop's detail** showing its full details, status, and roster.
- **FR-004**: A back-office user MUST be able to **edit** a shop's mutable details (name, contact
  details, other administrative attributes). The operator-facing code MUST be treated as the shop's
  stable handle — immutable after creation, or changeable only under an explicit guarded rule the
  plan defines — never a routine edit.
- **FR-005**: A back-office user MUST be able to change a shop's **lifecycle status** among
  **active**, **suspended**, and **disabled**, with only valid transitions offered, and MUST be able
  to re-activate a suspended or disabled shop.
- **FR-006**: A back-office user MUST be able to **remove a shop safely**: a shop with any users or
  operational history MUST NOT be hard-erased (it is disabled instead), a shop with no dependents MAY
  be removed, and every removal MUST require explicit confirmation.

**Shop users (roster)**

- **FR-007**: A back-office user MUST be able to **add users to a shop** as either a **shop manager**
  or **shop staff** member, each provisioned as a passwordless identity account in the shop pool plus
  a platform record scoped to that shop — the same coherent, retry-safe operation as FR-002.
- **FR-008**: A back-office user MUST be able to **change a shop user's role** (between shop manager
  and shop staff) and to **disable or re-enable** a shop user. Disabling a user MUST set the
  platform-owned status to disabled **and disable their identity account** so they cannot obtain a
  session at all (defense in depth); a disabled user MUST be refused privileged access on the shop
  console immediately even if a session already exists (the platform record is authoritative). A
  re-enabled active user MUST have their identity account re-enabled and be served again (subject to
  their shop being active). Changing a **shop's** status (suspend/disable) MUST **not** disable its
  users' identity accounts — those remain sign-in-capable and are refused privileged access by the
  gate's shop-scope term (FR-013).
- **FR-009**: The platform MUST enforce the **one-user-one-shop invariant**: every shop user is
  assigned to exactly one shop, an email already bound to any shop user MUST NOT be provisioned to
  another shop, and this slice provides **no** move-between-shops action (a move is achieved by
  disabling and re-provisioning).
- **FR-010**: A back-office user MUST be able to **view a shop's roster** — each user's identity,
  email, role(s), platform-owned status, and last-seen indication.

**Consistency, provisioning & continuity**

- **FR-011**: Every operation that provisions or mutates an identity account MUST keep the identity
  provider and the platform record **consistent**: it MUST be idempotent and recoverable, MUST NOT
  leave an orphaned identity account or an ownerless/duplicate platform record on partial failure,
  and MUST present a clear, safe-to-retry failure.
- **FR-012**: A shop user provisioned by this slice MUST be recorded keyed to the identity subject
  returned at provisioning time, so that the user's **first sign-in on the shop console reconciles
  against the pre-existing record** (shop assignment and role preserved) rather than creating a
  fresh, unassigned record — preserving continuity with the shop console's just-in-time
  reconciliation (007) with no duplicate.
- **FR-013**: Shop status and shop-user status MUST remain **platform-owned** and authoritative for
  access decisions — a valid credential never overrides them — consistent with the shop console's
  gate (role AND status AND active-shop scope, 007). Changing a shop's status to suspended/disabled,
  or a user's status to disabled, MUST cause that user to be refused privileged access on the shop
  console; the shop console's gate predicate MUST be reconciled to the shop's lifecycle status
  without regressing its existing behavior.

**Access control (back-office side)**

- **FR-014**: Shop-management **mutations** (create/edit/status/remove/roster) MUST require the
  back-office **`admin`** or **`manager`** role; the **`csa`** role (and any other back-office role)
  MUST get **read-only** access (browse/view) and MUST be refused every mutation **by the backend**
  (not merely hidden in the interface). The interface MUST hide controls a role cannot use (least
  privilege), over the authoritative backend gate — never as a substitute for it.
- **FR-015**: The shop-management backend MUST reject any caller not authenticated for the
  back-office audience, and MUST use the shared uniform access-denied contract that reveals nothing
  about why authorization failed.

**Accountability, data, and cross-cutting**

- **FR-016**: Every shop-management action that creates, changes, or removes a shop or a shop user
  MUST be **recorded** for accountability — at least the actor, the action, the target, the
  before/after where applicable, and the time — and a shop's and a user's history MUST be viewable.
- **FR-017**: The shop and shop-user data MUST evolve through the platform's established
  **forward-only data-migration workflow**, extending the existing customer-operational shop records
  rather than duplicating them, and MUST keep the shop deliberately free of operational attributes
  (address, hours, capacity, delivery zones, inventory) — those belong to the later fulfillment
  slice.
- **FR-018**: The capability MUST be built into the existing back-office console on the platform's
  **shared web foundation** (one brand design system with required **dark mode**, and the shared,
  typed building blocks), consuming them from their single source with **no** surface-local fork or
  re-implementation; where the foundation must grow to support this capability, it MUST be
  generalized **in the shared package**.
- **FR-019**: The capability MUST emit **product-analytics and runtime-error telemetry** through the
  platform's shared, typed event approach, carrying no personal data beyond the authenticated subject
  identifier and never any email, code, token, or credential; back-office shop-management events MUST
  be distinguishable from other events.
- **FR-020**: All environment-specific values (identity-pool identifiers, backend location, approved
  origins) MUST be supplied as **per-environment configuration**; a missing or wrong required value
  MUST fail clearly rather than silently targeting the wrong environment or the wrong identity pool,
  and no secret MUST be committed or bundled.
- **FR-021**: The capability MUST present all backend failures and expected degraded states
  (unreachable/slow backend, identity-provider failure, validation refusals, permission denials)
  through the shared client error-handling contract — human-readable, recoverable where applicable,
  never a broken interface and never leaking internal detail or credentials.
- **FR-022**: The slice MUST complete the **deferred live sign-off of 007-shop-web** that it
  unblocks — a shop manager active at an active shop is served and refused once the shop is
  suspended/disabled (007 SC-005b), and a disabled operator is refused despite a valid credential
  (007 SC-012) — exercised against **product-created** shop and user data.

### Non-Functional / Scope Boundaries

- **FR-023**: **No product shop-operations features ship in this slice** — no picking, packing,
  inventory, order handling, delivery-zone, capacity, or scheduling capability. This slice delivers
  shop identity + lifecycle + people + governance only; operational capabilities arrive in later
  slices once the data they manage exists.
- **FR-024**: The slice MUST document its **conventions** — how a back-office capability that spans
  the console and the cold-path backend is structured, and how shop-user provisioning stays
  consistent across the identity provider and the platform record — sufficient for a newcomer to
  extend it correctly.

### Key Entities *(the deep multi-entity model — conceptual; physical schema is a plan artifact)*

- **Shop**: a hidden internal fulfillment node. Attributes: a **stable identity**; a unique
  **operator-facing code** (the provisioning/reference handle); a **name**; an **optional contact
  phone**; an **optional notes/description**; a **lifecycle status** (active / suspended /
  disabled); and audit timestamps. Carries **no operational attributes** (no address, hours,
  capacity, zones, inventory) in this slice. Customers never see it. *Relationship*: **one shop has
  many shop users**.

- **Shop User (Shop Staff)**: a person who works at a shop, and a separate entity from the shop.
  Attributes: a **stable identity subject** (from the shop audience's identity provider); a **work
  email**; a **name**; a platform-owned **status** (active / disabled); a **last-seen** indication;
  and the **one shop** they are assigned to. *Relationship*: **each shop user belongs to exactly one
  shop** (the hard invariant — a shop has many users, but no user has many shops).

- **Shop Role**: the privilege level a shop user holds — **shop manager** (elevated: operates the
  shop plus shop-level administration) over **shop staff** (baseline operator). Assignment originates
  in the identity provider and is reconciled into the platform record (007). *Relationship*: a shop
  user holds one or more shop roles.

- **Shop User ↔ Shop Role Assignment**: the association of a shop user with the role(s) they carry —
  the normalized basis for the shop console's authorization decisions.

- **Shop Lifecycle Status**: the governed state of a shop (active / suspended / disabled) that,
  together with the shop user's own status and role, determines whether that user is served on the
  shop console. **Suspended** = temporary reversible hold; **disabled** = longer-term deactivation
  retained for audit; both deny operator privileged access.

- **Shop-Management Audit Entry**: an accountability record of a privileged shop-management action —
  who did what, to which shop or shop user, before/after where applicable, and when — the trail that
  makes governance reviewable.

- **Identity Account (shop pool)**: the passwordless account provisioned for a shop user in the shop
  audience's identity provider, created admin-side (no self-signup, no password). Kept **consistent**
  with the platform's shop-user record; the identity subject links the two.

- **Provisioning Operation**: the coherent, idempotent, recoverable unit that creates or mutates an
  identity account **and** its platform record together — the entity that guarantees the two never
  drift into an orphaned account or an ownerless record.

- **Primary Contact**: the person supplied at shop creation who becomes the shop's first shop
  manager; the seed of the roster. (Not a separate stored entity if the shop can point at its
  primary manager — a modeling choice for the plan; conceptually it is "the shop's first/owning
  manager".)

*Entity relationships in one line*: **Shop** —(1:N)→ **Shop User** —(N:1)→ exactly one **Shop**;
**Shop User** —(M:N)→ **Shop Role**; every mutation of a **Shop** or **Shop User** emits a
**Shop-Management Audit Entry**; every **Shop User** is mirrored by exactly one **Identity Account**
kept consistent through a **Provisioning Operation**.

### Scope — Back-Office Shop-Management Capability Catalog (the "20+ features")

The description asked for a broad capability list. The catalog below scopes this slice explicitly:
**In** = delivered here; **Later** = deferred to a future slice (mostly the fulfillment/catalog
slices), named so the roadmap is visible without bloating this slice.

| #  | Capability | Scope |
|----|------------|-------|
| 1  | Create a shop (with primary-contact provisioning) | **In** (US1) |
| 2  | Provision the shop's first manager account (Cognito + record) | **In** (US1) |
| 3  | Browse all shops (searchable, filterable, paginated) | **In** (US2) |
| 4  | View a shop's detail (details + status + roster) | **In** (US2) |
| 5  | Filter shops by lifecycle status | **In** (US2) |
| 6  | Search shops by code / name | **In** (US2) |
| 7  | Activate a shop | **In** (US3) |
| 8  | Suspend a shop (temporary hold) | **In** (US3) |
| 9  | Disable a shop (deactivate) | **In** (US3) |
| 10 | Remove a shop safely (guarded) | **In** (US6) |
| 11 | Edit a shop's details | **In** (US5) |
| 12 | Add a shop user (manager or staff) | **In** (US4) |
| 13 | View a shop's roster | **In** (US4) |
| 14 | Change a shop user's role | **In** (US4) |
| 15 | Disable a shop user | **In** (US4) |
| 16 | Re-enable a shop user | **In** (US4) |
| 17 | Enforce one-user-one-shop on provisioning | **In** (US4/FR-009) |
| 18 | Consistent Cognito↔record provisioning (idempotent, recoverable) | **In** (FR-011) |
| 19 | Shop & shop-user audit history (who/what/when) | **In** (FR-016) |
| 20 | Role-gated back-office access to shop management | **In** (FR-014) |
| 21 | Complete 007's deferred live gate sign-off | **In** (FR-022) |
| 22 | Designate/replace a shop's primary manager | **In** (US1/US4) |
| 23 | Move a shop user between shops | **Later** (invariant: disable + re-provision) |
| 24 | Bulk status changes / bulk actions | **Later** |
| 25 | Export the shop register | **Later** |
| 26 | Shop operational attributes (address, geolocation) | **Later** (fulfillment) |
| 27 | Shop operating hours / availability schedule | **Later** (fulfillment) |
| 28 | Shop capacity / throughput limits | **Later** (fulfillment) |
| 29 | Shop → delivery-zone / service-area mapping | **Later** (fulfillment) |
| 30 | Shop inventory management | **Later** (catalog) |
| 31 | Shop order queue / fulfillment monitoring | **Later** (orders) |
| 32 | Shop performance dashboard / metrics | **Later** (observability) |
| 33 | Shop tagging / categorization | **Later** |
| 34 | Resend / manage a user's sign-in access | **Later** (OTP needs no invite) |

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized back-office admin creates a shop and its primary manager in **one
  submission**, and that manager signs in to the shop console and is **served** the manager-gated
  area **without any password** and **without any manually inserted data** — end to end in **under 5
  minutes**.
- **SC-002**: **100%** of shop-creation and user-provisioning operations leave a **consistent**
  result: after any single simulated partial failure and a retry, there are **zero** orphaned
  identity accounts and **zero** ownerless or duplicate platform records for the same email/subject.
- **SC-003**: The one-user-one-shop invariant holds in **100%** of attempts: every attempt to
  provision an email already bound to a shop user is refused, and **no** shop user is ever assigned
  to more than one shop.
- **SC-004**: Shop-code uniqueness holds in **100%** of attempts: duplicate-code creation is refused
  with no partial data, including under concurrent submissions where exactly one succeeds.
- **SC-005**: A shop's lifecycle status change takes effect on its operators' access in **100%** of
  cases: after suspend/disable, its operators are refused privileged access on their next attempt;
  after re-activate, active operators are served again — verified live on the shop console.
- **SC-006**: A back-office role without shop-management permission is refused **every** mutating
  action **by the backend** in **100%** of direct attempts (not merely hidden), while a permitted
  read-only role can browse and view in **100%** of attempts.
- **SC-007** *(closes 007 SC-005b)*: With a product-created shop, a shop manager who is active and
  assigned to an **active** shop is **served** the manager-gated read, and the **same** manager is
  **refused** once the shop is suspended or disabled — **100%** of attempts.
- **SC-008** *(closes 007 SC-012)*: A shop user the platform marks **disabled** is refused
  privileged access on the shop console in **100%** of attempts **despite holding a valid
  credential**, and is served again after re-enable (with an active shop).
- **SC-009**: A first-time sign-in of a pre-provisioned shop user reconciles against the
  **pre-existing** record with the correct shop assignment and role in **100%** of cases, producing
  **zero** duplicate or unassigned records — including under concurrent first contact.
- **SC-010**: **100%** of shop-management mutations produce an audit entry with actor, action,
  target, before/after (where applicable), and time; a shop's and a user's history is viewable and
  complete.
- **SC-011**: The shop register and any shop's roster remain responsive and correct at the design
  target — **up to hundreds of shops and low thousands of shop users total** — with **server-side**
  search, filter, and pagination returning correct results with **zero** incorrect or missing rows
  in sampled queries.
- **SC-012**: **100%** of sampled backend and identity-provider failure states render as clear,
  recoverable console states with **zero** broken interfaces and **zero** exposure of internal
  detail, stack traces, or credentials.
- **SC-013**: **Zero** secret or credential material is found in the repository or built bundle, and
  **100%** of emitted telemetry events carry no personal data beyond the subject identifier, across
  the entire workflow.
- **SC-014**: The capability consumes the shared web foundation with **zero** surface-local fork or
  re-implementation of a shared concern; every generalization it required landed **in the shared
  package**, verified by locating a single source for each shared concern.
- **SC-015**: The shop record acquires **no** operational attributes in this slice — verified by
  confirming the shop carries only identity, code, name, optional contact phone, optional
  notes/description, lifecycle status, and timestamps, and no address/hours/capacity/zone/inventory
  field.

## Assumptions

- **A1 — Back-office authorization.** Shop-management **mutations** require the back-office `admin`
  or `manager` role; `csa` (or any other read-only role) gets **read-only** visibility, no
  mutations. This mirrors the back-office RBAC established in 005 and is enforced backend-side
  (FR-014).
- **A2 — Creation always provisions a first user.** A shop is created together with exactly one
  primary contact who becomes its first **shop manager** and receives a passwordless shop-pool
  account. A shop never exists with zero users; additional users are added later (US4).
- **A3 — Identity source is the existing shop pool (001).** Shop users authenticate against the
  existing shop audience identity provider with passwordless one-time codes; accounts are
  admin-provisioned by this capability (no self-signup, no password), reusing the two-consistent-
  writes provisioning pattern proven in 006 for the admin pool.
- **A4 — Back-office caller, cold-path backend.** The capability's callers are back-office staff
  authenticated for the back-office audience; the backend is placed on the platform's cost-optimized
  path per Principle III (low-frequency admin CRUD). Creating shop-pool identities from a
  back-office-authenticated call is an **authorized admin provisioning write**, not cross-pool
  authentication — it does not violate the four-pool isolation rule (detailed in
  [operator-directives.md](./operator-directives.md); resolved in the plan's Constitution Check).
- **A5 — Three shop statuses.** `active` (operating), `suspended` (temporary, reversible hold), and
  `disabled` (deactivated, retained for audit). Both suspended and disabled deny operator privileged
  access via the shop console's shop-scope gate term; they differ in intent and expected
  reversibility. The 007 gate currently keys on a boolean active flag and MUST be reconciled to this
  status without regressing (FR-013).
- **A6 — Removal is safe by default.** "Delete" preserves referential integrity and audit history:
  a shop with users or history is **disabled**, not erased; only a dependent-free shop (created in
  error) may be hard-removed, always behind explicit confirmation (US6/FR-006).
- **A7 — Shop carries light administrative details, not operational ones.** Beyond code, name,
  status, and timestamps, the shop record carries only an **optional contact phone** and an
  **optional notes/description** (the contact *person* is stored as the first manager, a shop user).
  Operational attributes (address, hours, capacity, zones, inventory) remain **out of scope** and
  are deferred to the fulfillment slice, preserving 007's deliberate minimal-shop boundary
  (FR-017/FR-023).
- **A8 — No move-between-shops.** Because a user belongs to exactly one shop, this slice provides no
  reassignment action; a "move" is disable-and-re-provision. Reassignment is a `Later` catalog item.
- **A9 — The operator-facing code is the stable handle** and is immutable after creation (or
  changeable only under an explicit guarded rule the plan defines), because other records and the
  operator reference it (US5/FR-004).
- **A10 — Builds on shipped foundations.** Features 001 (four pools), 002/003 (database + forward-
  only migrations), 004 (cold-path shared gateway), 005 (back-office console + shared web
  foundation), and 007 (the shop tables, roles, gate, and shop console) are prerequisites and are
  extended, not duplicated. This slice **completes 007's deferred live sign-off** (FR-022).
- **A11 — Mode of work.** Claude authors all code, SQL, configuration, and documentation; the
  **operator personally runs** anything touching live cloud state (migrations, deploys, any Cognito
  configuration, and the live sign-off), per CLAUDE.md.
- **A12 — Scale target.** The register and roster are designed for **up to hundreds of shops and
  low thousands of shop users total** (tens of users per shop), with server-side pagination,
  search, and filter (SC-011). Larger multi-region scale is not a design constraint this slice.
- **A13 — Deactivation is asymmetric between shop and user.** Disabling a *shop user* also disables
  their identity account (no session at all); suspending/disabling a *shop* leaves its users'
  identity accounts sign-in-capable and relies on the gate's shop-scope term to refuse privileged
  access (FR-008/FR-013).
