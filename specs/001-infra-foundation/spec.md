# Feature Specification: Platform Infrastructure Foundation & Four-Pool Authentication

**Feature Branch**: `001-infra-foundation`

**Created**: 2026-06-29

**Status**: Draft

**Input**: User description: "Bootstrap the platform's infrastructure-as-code with multiple environments (dev, qa, staging, prod). Only dev is applied initially; the other environments are authored in code but left unapplied. Provide a consistent command workflow for init / plan / apply, each scoped to the designated AWS access profile (`ef`). Dev resources live in the Singapore region, with a path to relocate to Sydney later. The first resources are the four isolated authentication pools (customer, driver, shop, back-office); only customers can self-register, the other three audiences are provisioned manually. Author the infrastructure code only — nothing is applied automatically; the operator runs every apply by hand."

## Overview

This is the platform's **foundation slice**: the reproducible, multi-environment infrastructure
backbone and the **four isolated authentication pools** for Effy's four audiences. It unblocks every
later slice (starting with customer onboarding) by establishing *where* the platform runs, *how* it is
stood up safely and consistently, and *who* is allowed to hold an identity in it.

Two capabilities are delivered together because they are inseparable for a first slice: there is no
point provisioning identity pools without an environment to hold them, and no point standing up an
environment with nothing in it. The authentication pools are the **first resources** the environment
backbone provisions, proving the backbone end-to-end with the platform's most foundational concern.

**Out of scope** (deliberately deferred): any in-platform UI/flow for adding internal users; backend
JWT validation and per-pool token rejection at the service layer; catalog, profile, orders, or any
product surface; databases, compute, networking, and observability stacks beyond what the
authentication foundation itself requires. Those arrive in later slices.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Reproducible, safe multi-environment provisioning (Priority: P1)

The platform operator can stand up a complete environment from version-controlled code using one
consistent, documented command workflow, scoped to the designated access profile. The development
environment is provisioned now; the quality-assurance, staging, and production environments are fully
authored in code but deliberately left unprovisioned until the team chooses to promote them. Every
change is previewed before it is applied, and **nothing is ever applied automatically** — a human runs
each apply by hand.

**Why this priority**: This is the backbone. Without a safe, repeatable way to provision isolated
environments, no other resource — including the authentication pools — can exist. It is also the
control that keeps a solo/small team from corrupting an environment by accident.

**Independent Test**: From a clean checkout, run the documented initialize and preview commands for the
development environment and observe a valid creation plan; run the preview command for qa, staging, and
prod and observe each produces a valid plan while owning zero live resources. Confirm no command applies
changes without an explicit, separate human apply step.

**Acceptance Scenarios**:

1. **Given** a clean checkout and a configured access profile, **When** the operator runs the
   initialize-then-preview workflow for the development environment, **Then** a valid plan is produced
   describing exactly the resources to be created, and no resources are created until a separate apply is
   run.
2. **Given** the development environment has been applied, **When** the operator previews the
   qa / staging / prod environments, **Then** each produces a valid plan and **none** of them holds any
   live resources (they are authored-but-unapplied).
3. **Given** any environment, **When** a change is requested, **Then** the operator can preview the full
   set of additions / changes / removals **before** any apply, and the apply is always a deliberate,
   separate, human-run step.
4. **Given** two operators acting on the same environment at once, **When** both attempt to apply,
   **Then** the second attempt is blocked from proceeding concurrently so the environment's recorded
   state cannot be corrupted.

---

### User Story 2 - Customer self-service registration & sign-in (Priority: P1)

A prospective customer can register themselves using only an email address and sign in by entering a
one-time passcode delivered to that email — no password is ever set or requested. The customer audience
has its own isolated identity foundation that permits self-registration.

**Why this priority**: Customer self-signup is the gateway to the entire customer experience and the
first product slice (customer onboarding) depends on it. It is the concrete first resource that proves
the environment backbone actually produces working identity infrastructure.

**Independent Test**: In the development environment, a brand-new email address can complete
self-registration and then sign in by entering a one-time passcode sent to that email, with no password
involved at any step.

**Acceptance Scenarios**:

1. **Given** the development environment is provisioned, **When** a new person self-registers as a
   customer with an email address, **Then** an account is created in the customer identity pool and a
   one-time passcode is delivered to that email.
2. **Given** a registered customer, **When** they request to sign in and enter the one-time passcode sent
   to their email, **Then** they are signed in successfully without ever providing a password.
3. **Given** the sign-in flow, **When** at any point a password is expected, **Then** none is — the
   customer pool never requests or shops a password.

---

### User Story 3 - Manually-provisioned internal audiences (Priority: P2)

Driver, shop (shop/operator), and back-office (admin) audiences each have their own isolated identity
foundation in which **self-registration is disabled**. Accounts for these audiences are created only by
authorized staff — initially through the cloud provider's console, and later through an in-platform admin
flow (a future slice). The back-office foundation additionally supports role groupings so a person's role
can be conveyed at sign-in.

**Why this priority**: The internal audiences are needed for the platform to operate, but they do not
gate the first customer-facing slice and require no self-service path. Establishing their pools now (with
self-signup firmly off) sets the correct trust boundaries from day one without building any UI.

**Independent Test**: In the development environment, confirm that a self-registration attempt against
the driver, shop, or back-office foundation is rejected; then confirm that an account created by staff in
one of those pools can sign in via one-time passcode. Confirm the back-office foundation exposes the
defined role groupings.

**Acceptance Scenarios**:

1. **Given** the driver, shop, or back-office identity foundation, **When** anyone attempts to
   self-register, **Then** the attempt is rejected — these foundations permit account creation only by
   authorized staff.
2. **Given** an account created by staff in the driver, shop, or back-office pool, **When** that person
   signs in with a one-time passcode delivered to their email, **Then** they are signed in successfully
   without a password.
3. **Given** the back-office identity foundation, **When** an account is assigned a role grouping
   (admin / manager / csa), **Then** that role is associated with the account so it can be conveyed at
   sign-in.

---

### User Story 4 - Region portability (Priority: P3)

The development environment runs in the Singapore region today, and the foundation is structured so that
relocating an environment to a different region (e.g., Sydney) later is a **configuration change, not a
redesign**.

**Why this priority**: Region placement is a real near-term constraint (dev in Singapore now, a likely
move to Sydney later), but it does not block any functionality today. Designing for portability now
avoids costly rework later at near-zero present cost.

**Independent Test**: Inspect the environment configuration and confirm a single, environment-scoped
configuration value controls the region in which resources are placed, such that changing it would
relocate the environment without restructuring the infrastructure code.

**Acceptance Scenarios**:

1. **Given** the development environment, **When** its resources are provisioned, **Then** they are
   created in the Singapore region (`ap-southeast-1`).
2. **Given** the foundation, **When** a future move to another region (e.g., `ap-southeast-2`) is needed,
   **Then** it is achievable by changing environment configuration rather than redesigning or rewriting
   the infrastructure code.

---

### Edge Cases

- **Wrong account/profile**: An apply attempted without the designated access profile, or against the
  wrong cloud account, must not silently provision into an unintended account — the workflow is scoped to
  the designated profile so misdirected applies are prevented or fail loudly.
- **Self-registration against an internal pool**: Rejected for driver, shop, and back-office (see US3).
- **Same email across audiences**: Because the four pools are fully isolated, the same email address may
  hold a separate, independent identity in more than one pool; an identity in one pool grants nothing in
  another.
- **Previewing a never-applied environment**: Previewing qa / staging / prod (which own no live
  resources) produces a complete creation plan rather than an error.
- **Partial / interrupted apply**: Re-running the workflow after an interrupted apply converges the
  environment to the intended state without manual cleanup (provisioning is repeatable/idempotent).
- **Concurrent applies**: Two simultaneous applies on one environment cannot both proceed (locking — see
  US1 scenario 4).
- **One-time passcode expiry / retry**: A passcode that expires or is entered incorrectly can be re-requested,
  and an unused passcode cannot be reused after sign-in.
- **Tearing down an environment**: Removing an environment affects only that environment's isolated state
  and resources, never another environment's.

## Requirements *(mandatory)*

### Functional Requirements

**Authentication foundation**

- **FR-001**: The platform MUST define four distinct, fully isolated identity pools — one each for the
  **customer**, **driver**, **shop** (shop/operator), and **back-office** (admin) audiences.
- **FR-002**: The **customer** identity pool MUST permit self-service registration (self-signup).
- **FR-003**: The **driver**, **shop**, and **back-office** identity pools MUST NOT permit self-service
  registration; accounts in these pools are created only by authorized staff.
- **FR-004**: All four identity pools MUST authenticate using **passwordless email one-time passcode** —
  no password is ever set, requested, or stored anywhere.
- **FR-005**: A person MUST be able to self-register as a customer with an email address and complete
  sign-in by entering a one-time passcode delivered to that email.
- **FR-006**: The four identity pools MUST be mutually isolated, such that an identity or credential valid
  in one pool conveys no access in any other pool.
- **FR-007**: The **back-office** identity foundation MUST support the role groupings **admin**,
  **manager**, and **csa**, so an account's role can be conveyed at sign-in.
- **FR-008**: Each identity pool MUST register the application client(s) needed for its corresponding
  surface(s) to authenticate against it.

**Environment backbone**

- **FR-009**: All infrastructure MUST be defined as version-controlled code; the code — not manual
  console changes — is the source of truth for every resource the platform creates.
- **FR-010**: The infrastructure MUST support four named, independent environments — **dev**, **qa**,
  **staging**, **prod** — provisionable separately without affecting one another.
- **FR-011**: Only the **dev** environment is provisioned (applied) initially; **qa**, **staging**, and
  **prod** MUST be authored in code but left unapplied until the team chooses to promote them.
- **FR-012**: Each environment MUST maintain its own isolated provisioning state, so planning or applying
  one environment cannot alter another.
- **FR-013**: Provisioning state MUST be stored durably and protected against concurrent modification
  (locking), so simultaneous operations cannot corrupt it.
- **FR-014**: Identity pools MUST be reproducible per environment — each environment provisions its own
  four pools, independent of every other environment's.

**Operational workflow & safety**

- **FR-015**: No infrastructure change MUST ever be applied automatically; every apply is a deliberate,
  separate step run by a human operator. (Authoring of the code is automated; applying is not.)
- **FR-016**: Any change MUST be previewable — a plan showing the exact additions, changes, and removals —
  **before** any apply.
- **FR-017**: The repository MUST provide consistent, documented commands for **initialize**, **preview
  (plan)**, and **apply**, parameterized by environment, and each scoped to the designated cloud access
  profile (`ef`).
- **FR-018**: The command workflow MUST be scoped to the designated access profile (`ef`) so changes
  cannot be accidentally applied to an unintended cloud account.

**Placement, naming & traceability**

- **FR-019**: The **dev** environment's resources MUST be created in the Singapore region
  (`ap-southeast-1`).
- **FR-020**: The region in which an environment's resources are placed MUST be controlled by
  environment-scoped configuration, so an environment can be relocated (e.g., to `ap-southeast-2`) by
  changing configuration rather than redesigning the infrastructure.
- **FR-021**: Every provisioned resource MUST carry consistent identifying metadata — at minimum the
  environment name, the owning brand/platform, and an indicator that it is managed by infrastructure code
  — for traceability and cost attribution.
- **FR-022**: Resource names MUST encode brand, environment, and purpose so that resources are
  unambiguous across environments and accounts and cannot be confused between environments.

### Key Entities *(include if feature involves data)*

- **Environment**: An isolated, independently-provisioned deployment target (one of dev / qa / staging /
  prod). Owns its own provisioning state, configuration (including region), and its own set of resources.
  Provisioning or removing one Environment never affects another.
- **Audience**: One of the four consumer groups of the platform — customer, driver, shop (shop/operator),
  back-office (admin) — each with a distinct trust level.
- **Identity Pool**: An isolated authentication directory bound to exactly one Audience within one
  Environment. Key attributes: whether self-registration is allowed (customer: yes; others: no), sign-in
  method (passwordless email one-time passcode), and the application client(s) registered to it. Pools are
  mutually isolated.
- **Role Grouping**: A role label within the **back-office** Identity Pool — one of admin, manager, csa —
  associated with an account so it can be conveyed at sign-in.
- **Provisioning State**: The durable, lock-protected record of what an Environment has provisioned;
  isolated per Environment and the basis for previewing changes safely.
- **Access Profile**: The named, scoped cloud credential set (`ef`) the operator's commands run under, so
  every action targets the intended cloud account.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An operator can provision the complete development environment — including all four identity
  pools — from a clean checkout using only the documented commands, with **zero** manual console steps
  required to create those pools.
- **SC-002**: A brand-new customer can self-register and sign in using only an email address and a
  one-time passcode in **under 2 minutes**, with **no** password ever requested.
- **SC-003**: Self-registration attempts against the driver, shop, and back-office pools are rejected
  **100%** of the time.
- **SC-004**: Previewing the qa, staging, and prod environments each produces a valid creation plan with
  **zero** errors, while **none** of the three holds any live resources — demonstrating they are
  authored-but-unapplied.
- **SC-005**: An identity issued by one pool is rejected by each of the other three pools in **100%** of
  cross-pool attempts.
- **SC-006**: **Zero** infrastructure changes reach the cloud without an explicit, separate human apply —
  no change is ever applied automatically.
- **SC-007**: Relocating an environment to a different region requires changing **only** configuration
  (one environment-scoped value controlling placement) and **no** restructuring of the infrastructure
  code.
- **SC-008**: Two concurrent apply attempts on the same environment never both proceed — the second is
  blocked by a lock, in **100%** of attempts.
- **SC-009**: Every provisioned resource carries the required identifying metadata (environment, brand,
  managed-by), verifiable by inspecting any resource in the development environment.

## Assumptions

- **Locked technology is inherited, not re-decided here**: The concrete provisioning tool
  (infrastructure-as-code), cloud provider, identity service, and remote-state mechanism are the
  platform's constitution-locked standards (Terraform, AWS, AWS Cognito, remote state). This spec states
  capabilities and constraints; the concrete *how* (module/environment layout, remote-state design,
  one-time-passcode email delivery mechanism) is decided in the plan, which must follow the most reliable
  industry-standard approach to multi-environment infrastructure.
- **Mode of work**: Claude authors all infrastructure code; the operator runs every risky / outward-facing
  command (initialize, apply, anything that provisions or mutates live cloud state) by hand. Nothing in
  this slice is applied automatically.
- **Access profile**: A cloud access profile named `ef` is configured on the operator's machine with
  sufficient permissions; all documented commands run under it.
- **Region**: The development environment targets `ap-southeast-1` (Singapore); a likely future move to
  `ap-southeast-2` (Sydney) is anticipated and the design accommodates it via configuration.
- **Greenfield**: There are no production users or data yet; only the development environment will hold
  live resources until the team decides to promote others. qa / staging / prod are authored now and
  applied later.
- **Internal user provisioning**: Adding driver / shop / back-office accounts via the cloud provider's
  console is acceptable for this slice; an in-platform admin flow for provisioning internal users is a
  later feature and is out of scope here.
- **One-time passcode email delivery**: A mechanism capable of delivering one-time passcodes by email is
  available (or provisioned) for the development environment; its concrete form is a plan decision.
- **Backend token validation is deferred**: Per-pool JWT validation and structural rejection of
  cross-pool tokens at the service layer are properties of later backend slices; this slice establishes
  the isolated pools that make that enforcement possible, not the enforcement itself.

## Dependencies

- **Constitution alignment**: This slice realizes constitution Principle IV (Auth Isolation — four
  isolated pools, passwordless EMAIL_OTP, customer-only self-signup, back-office RBAC groups) and the
  locked Infrastructure standard (Terraform, multi-environment, remote state).
- **Foundational ordering**: This is the first slice; it depends on no other feature and unblocks the
  customer onboarding slice (and every subsequent slice) by providing the environment and the customer
  identity pool.
