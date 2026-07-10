# Feature Specification: First Admin Bootstrap + Account Teardown (Operator Break-Glass)

**Feature Branch**: `006-first-admin-bootstrap`

**Created**: 2026-07-08

**Status**: Draft (amended 2026-07-08 — added account teardown)

**Input**: User description: "now since we have back-office frontend and backend apis in edge api /admin we need a way to create the first admin user who has the super admin permission (all the permission). to do that we can not have api, or ui element. we need some sort of make command or cli tool for create the first admin by giving only the initial data (email, name etc..)"

> **Amendment (2026-07-08)**: "modify 006 spec so that we also have script and a command to
> **completely delete an admin account**!" — 006 now covers the operator break-glass admin
> **lifecycle**: bootstrap (create) **and** complete teardown (hard delete from every system). The
> create half (US1–US3) is already implemented; this amendment adds the delete half (US4).

> Technology-specific directives from the description (the command-line / make-target delivery, and
> which systems it touches) are recorded in [operator-directives.md](./operator-directives.md) as
> **plan-phase input** — this spec stays free of implementation detail per constitution Principle I.

The back-office console (005) requires an authenticated **administrator**, but the platform has no
way to create the *first* one: the console itself would require an existing admin, and the platform
**forbids self-signup for privileged audiences** (Principle IV — driver/shop/admin are
admin-provisioned). This slice breaks that chicken-and-egg with an **operator-run, out-of-band**
means to establish the **first back-office super-administrator** (all permissions) from initial
data, so the console becomes usable. It is an **operator tool, not a product feature** — no public
API, no UI element.

The same trust boundary needs its inverse: a way to **completely delete** an admin account —
removing it from *every* system so the person can no longer authenticate and holds no authority
anywhere. This is for tearing down a bootstrap/test admin, undoing a mistake, or removing an
administrator entirely — again **out-of-band, operator-only** (never a product API/UI). Together the
two commands are the platform's **break-glass admin lifecycle** (create ↔ delete).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator establishes the first super-admin, who can then sign in and do everything (Priority: P1)

An operator with platform access runs a single command, supplying only the new administrator's
initial data (their work email and name). The platform establishes that person as a **back-office
super-administrator** — an account that can sign in through the platform's normal passwordless
flow and is authorized for **every** administrative capability. The operator then hands the person
their email; the person signs in to the back-office and can reach everything an administrator can,
with no further setup. This is the moment the back-office becomes usable.

**Why this priority**: Without it, the back-office console (005) is unreachable by anyone — there
is no admin to log in and no way to make one. This single capability unlocks the entire
administrative surface. It is independently valuable and demonstrable on its own.

**Independent Test**: On a fresh environment, run the command with an email + name; then, as that
person, complete passwordless sign-in to the back-office and confirm every admin-gated area is
reachable.

**Acceptance Scenarios**:

1. **Given** an environment with no back-office administrator, **When** the operator runs the
   command with a valid email and name, **Then** a back-office super-administrator account is
   established and the command reports success with what it created.
2. **Given** the newly established account, **When** that person signs in to the back-office via
   the platform's passwordless one-time-code flow, **Then** they are admitted and authorized for
   **all** administrative capabilities — with no password anywhere and no additional setup.
3. **Given** the account, **When** its authority is inspected, **Then** it holds
   super-administrator (all-permissions) authority in the platform's authorization system of
   record, not merely a pending or partial grant.

---

### User Story 2 - Safe and repeatable (Priority: P2)

Running the bootstrap is safe: it validates the data it is given, and re-running it for an email
that already exists does not create a duplicate account, a second conflicting record, or any
corruption — it recognizes the existing account, reports that plainly, and leaves it a valid,
active super-administrator. Bad or missing input (a malformed email, no name) is rejected clearly,
before anything is created, so there is never a half-made account.

**Why this priority**: A bootstrap that can double-create administrators or leave half-made
accounts is a security and operability hazard. Operators must be able to re-run it without fear
(e.g., after a partial failure, or as a break-glass).

**Independent Test**: Run the command twice with the same email and confirm exactly one account
exists and the second run reports "already exists"; run it with a malformed email and confirm it
refuses without creating anything.

**Acceptance Scenarios**:

1. **Given** an email that already has a back-office account, **When** the command is run again for
   it, **Then** no duplicate account or record is created, the outcome is reported clearly
   (created vs already-exists), and the account remains a valid, active super-administrator.
2. **Given** invalid or missing input (malformed email, empty name), **When** the command is run,
   **Then** it fails with a clear message and creates **no** partial state.
3. **Given** the two places platform access control depends on — where a person authenticates and
   where they are authorized — **When** the bootstrap completes, **Then** the account exists and
   agrees in both; there is **no** half-created state (able to sign in but unauthorized, or
   authorized but unable to sign in).

---

### User Story 3 - Out-of-band, operator-only, and auditable (Priority: P3)

The capability exists **only** as an operator action, run with the platform's existing operator
access, per environment — it introduces **no** new public or network-facing surface, and it does
not weaken the platform's no-self-signup, admin-provisioned trust model. The establishment of a
super-admin is **recorded** in the platform's system of record (that the account exists, is active,
is super-admin, and when it was established), so the highest-privilege grant on the platform is
auditable. No secret or credential material is ever committed, echoed, or logged.

**Why this priority**: The first admin is the platform's root of administrative trust; how it is
minted must itself be trustworthy — out-of-band, least-exposed, and on the record. It builds on
US1/US2 (it governs *how* they are delivered), so it follows them.

**Independent Test**: Confirm no new API endpoint or UI element exists for this; confirm the
super-admin's establishment is visible in the platform record; grep the repo/logs/output for
secret material and find none.

**Acceptance Scenarios**:

1. **Given** the platform's surfaces, **When** they are enumerated, **Then** creating the first
   admin is reachable **only** as an operator command — there is no public API endpoint and no UI
   element for it.
2. **Given** a completed bootstrap, **When** the platform record is inspected, **Then** the
   super-admin account and the fact/time of its establishment are recorded and auditable.
3. **Given** the whole workflow, **When** the repository, logs, and command output are inspected,
   **Then** **zero** secret or credential material appears anywhere.

---

### User Story 4 - Operator completely deletes an admin account (Priority: P2)

An operator with platform access runs a single command, supplying the account's email, and — after
an explicit confirmation, because this is irreversible — the platform **completely removes** that
administrator: they can no longer authenticate (gone from the identity provider) and hold no
authority anywhere (their staff record and all role grants are removed). The command reports exactly
what it removed. The account ceases to exist across the whole platform.

**Why this priority**: Creating accounts without a way to remove them leaves orphaned
super-administrators (test/bootstrap accounts, mistakes, offboarded people) holding the platform's
highest privilege indefinitely — a real security liability. Complete teardown is the necessary
counterpart to bootstrap. It is destructive, so it must be careful (P2, after the create MVP).

**Independent Test**: Bootstrap a throwaway admin, then run the delete command for its email;
confirm the account is absent from **both** the identity provider and the platform record, and that
the person can no longer sign in. Run delete again for the same email and confirm it reports
"already removed" cleanly.

**Acceptance Scenarios**:

1. **Given** an existing back-office admin account, **When** the operator runs the delete command
   for its email and confirms, **Then** the account is removed from **both** the identity provider
   and the platform's staff/role record, the person can no longer authenticate, and the command
   reports what was removed.
2. **Given** an email with no back-office account (or one already partly removed), **When** the
   delete command is run, **Then** it completes cleanly reporting "not found / already removed" and
   reconciles any residue — it never errors out on a missing account, and leaves **no** half-deleted
   state.
3. **Given** the account is the **last remaining active super-administrator**, **When** the operator
   runs the delete command, **Then** it **refuses** (naming the lock-out risk) unless the operator
   explicitly overrides — so the platform is never accidentally left with zero administrators.

---

### Edge Cases

- **Email already exists as a back-office account** → recognized, not duplicated; reported clearly;
  ensured to be an active super-admin (US2).
- **Half-created prior state** (the person exists in one place but not the other) → re-running
  reconciles both into agreement rather than erroring or duplicating.
- **Malformed / missing input** → refused before any change; no partial state.
- **The account is later disabled** (platform-owned status) → the tool can restore an existing
  super-admin to active as part of its safe re-run, so a lock-out is recoverable (break-glass).
- **Run against the wrong environment** → the tool operates on exactly the environment the operator
  targets and names it clearly; it never silently acts on a different environment.
- **Secret hygiene under failure** → however the run fails, no credential/secret appears in output,
  logs, or the repository.
- **(Delete) account does not exist** → reported as "not found / already removed"; clean exit, not
  an error (idempotent teardown).
- **(Delete) half-deleted residue** (present in the identity provider but not the record, or vice
  versa) → re-running removes whatever remains in either system; converges to fully gone.
- **(Delete) last active super-admin** → refused unless explicitly overridden, so the platform is
  never left with zero administrators.
- **(Delete) confirmation** → because deletion is irreversible, it requires explicit operator
  confirmation before removing anything.
- **(Delete) re-create after delete** → after a complete teardown, bootstrapping the same email
  produces a fresh account (a new identity subject and a new record) — no stale linkage remains.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The platform MUST provide an **operator-run command-line** means to establish the
  **first back-office super-administrator** from initial data (at least a work **email** and a
  **name**). It MUST NOT be exposed as a public API endpoint or a UI element.
- **FR-002**: The created account MUST be established in the platform's **back-office identity
  audience** as an **admin-provisioned** account able to sign in through the platform's
  **passwordless one-time-code** flow (no password), consistent with the four-audience model
  (Principle IV).
- **FR-003**: The account MUST be granted **super-administrator authority (all back-office
  permissions)** in the platform's **authorization system of record**, so it is authorized to every
  admin-gated capability **immediately** — not only after a first sign-in.
- **FR-004**: The tool MUST be **idempotent/safe**: for an email that already exists it MUST NOT
  create a duplicate account or conflicting record, MUST clearly report the outcome (created vs
  already-exists), and MUST leave the account a valid, **active** super-administrator.
- **FR-005**: The tool MUST **validate its inputs** (well-formed email; required name) and, on
  invalid or missing input, fail clearly **without creating partial state**.
- **FR-006**: The account MUST be established **consistently across both** places the platform's
  access control depends on — the identity provider (so the person can authenticate) **and** the
  platform's own staff/role record (so the person is authorized) — kept in agreement, with **no
  half-created state** (able to sign in but unauthorized, or authorized but unable to sign in).
- **FR-007**: The tool MUST be run by the **operator per environment** using the platform's existing
  operator access; it MUST NOT introduce any new public/network surface and MUST NOT weaken the
  **no-self-signup, admin-provisioned** trust model.
- **FR-008**: The establishment of a super-admin MUST be **recorded in the platform's system of
  record** (at least: the account exists, is active, is super-admin, and when it was established),
  so the highest-privilege grant is **auditable**.
- **FR-009**: **No secret or credential material** MUST be committed, written to the repository,
  echoed to output, or logged by the tool.
- **FR-010**: The tool set's scope is the operator **break-glass admin lifecycle** — **bootstrap**
  (create the first / an emergency super-admin) and **complete teardown** (delete an admin account).
  Ongoing self-service admin management via the console (listing, editing, changing roles of many
  admins) remains a **later back-office capability**, explicitly out of scope here.

- **FR-011**: The platform MUST provide an **operator-run command-line** means to **completely
  delete** a back-office admin account identified by its **email** — removing it from **both** the
  identity provider (so the person can no longer authenticate) **and** the platform's staff/role
  record (the account and **all** its role grants). It MUST NOT be exposed as a public API endpoint
  or a UI element.
- **FR-012**: Because deletion is **irreversible**, the tool MUST require **explicit operator
  confirmation** before removing anything, and MUST clearly report **what was removed** (from which
  systems).
- **FR-013**: The delete tool MUST be **idempotent**: deleting an account that is absent (from one
  or both systems) MUST complete cleanly reporting "not found / already removed" — never erroring —
  and MUST **reconcile any residue** (remove whatever remains in either system).
- **FR-014**: The delete tool MUST **refuse to delete the last remaining active
  super-administrator** unless the operator **explicitly overrides**, and the refusal MUST clearly
  name the lock-out risk — so the platform can never be *accidentally* left with zero administrators.
- **FR-015**: Deletion MUST leave the two systems **consistent** — the account gone from **both**,
  with **no half-deleted state** (still able to authenticate but no record, or a record but unable
  to authenticate); a re-run reconciles any partial removal.
- **FR-016**: Both lifecycle events — an admin's **establishment and its complete removal** — MUST
  be **recorded** (at minimum in the tool's structured output/logs, carrying no secrets), so that
  even a hard deletion (which removes the in-table record) is itself **traceable**.

### Key Entities

- **First-Admin Bootstrap**: the operator action that establishes the first back-office
  super-administrator; the platform's root-of-administrative-trust event.
- **Admin Account Teardown**: the operator action that **completely removes** an admin account from
  every system (identity + authorization record + role grants); irreversible, confirmation-gated,
  and guarded against removing the last remaining administrator.
- **Back-Office Super-Admin**: the established account — a verified back-office identity + **all**
  administrative permissions + an active status; the account every admin-gated capability trusts.
- **Initial Admin Data**: the minimal input the operator supplies (email, name).
- **Staff/Authorization Record**: the platform's own record of the account and its super-admin
  authority + active status — the authorization system of record and the audit trail (established
  in 005).
- **Back-Office Identity Audience**: the admin identity pool the account is created in so it can
  authenticate (established in 001).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator with platform access establishes the first super-admin in **under 5
  minutes** with a **single command**, supplying only an email and a name.
- **SC-002**: The bootstrapped person completes passwordless sign-in to the back-office and reaches
  **100%** of admin-gated areas on their **first** sign-in, with **zero** password prompts.
- **SC-003**: Re-running the tool for the same email yields **zero** duplicate accounts or records
  and reports the existing state clearly in **100%** of attempts.
- **SC-004**: **Zero** new public API endpoints or UI elements are introduced for creating the
  first admin — verified by inspecting the platform's surfaces.
- **SC-005**: **Zero** secret or credential material appears in the repository, logs, or command
  output across the entire workflow.
- **SC-006**: After the bootstrap, the account is a super-admin in **both** the identity provider
  **and** the platform record, in agreement — **zero** half-created states across tested runs
  (including a re-run after a simulated partial failure).
- **SC-007**: An operator completely deletes an admin account with a **single confirmed command**;
  afterward the account is absent from **both** the identity provider and the platform record
  (verified), and that person can **no longer** sign in.
- **SC-008**: Deleting a non-existent (or partly-removed) account reports "not found / already
  removed" and exits cleanly in **100%** of attempts — **zero** half-deleted states across tested
  runs (including a re-run after a simulated partial deletion).
- **SC-009**: The delete tool **refuses** to remove the last remaining active super-administrator
  (absent an explicit override) in **100%** of attempts — the platform is never accidentally left
  with zero administrators.

## Assumptions

- **"Super-admin / all permissions" maps to the platform's existing back-office `admin` role**
  (Principle IV; the admin group is defined as full administrative access). No new privilege tier
  above `admin` is introduced here; if a distinct super-admin-above-admin tier is later wanted,
  that is its own change.
- **The account is established in BOTH places** — the back-office identity pool (001, so it can
  authenticate) **and** the platform's staff/role record (005 schema, so it is authorized
  immediately and auditable) — rather than relying on the first-sign-in just-in-time record
  creation. This guarantees no lock-out if the just-in-time path ever misbehaves.
- **Prerequisites**: 001 (back-office identity pool), the 005 staff/RBAC schema (002/003 data +
  migration workflow), and the operator's existing platform access (the same access used for
  deployments and migrations). Established for the **dev** environment now; higher environments run
  the same tool at promotion.
- **Mode of work**: this tool provisions/mutates platform state (identity + authorization records)
  and is therefore **operator-run**; it is never automated into a public or unattended flow.
- **Idempotent and re-runnable**, intended for the first admin and as an **emergency break-glass**
  if the platform is ever left with no usable administrator.
- **No product endpoints or screens ship** in this slice — it is purely an operator capability.
- **"Completely delete" means a hard removal from every system** — the identity-provider account
  and the platform staff record (with its role grants cascading away) — **not** a soft disable.
  Temporarily revoking access without deleting is the already-existing platform-owned *disabled*
  status (005), not this tool.
- **Last-admin guard** default: the delete tool refuses to remove the final active super-admin
  unless explicitly overridden. (Bootstrap is the recovery if it ever happens, but the guard avoids
  needing it.)
- **Auditing a hard delete**: because complete teardown removes the in-table record, the deletion
  event is captured in the tool's structured output/logs as the trace; a durable append-only audit
  table is a **future** concern (constitution: `admin` schema = accounts + audit), not this slice.
