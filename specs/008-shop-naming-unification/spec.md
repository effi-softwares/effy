# Feature Specification: Shop Naming Unification

**Feature Branch**: `008-shop-naming-unification`

**Created**: 2026-07-10

**Status**: Approved

**Input**: User description: "in here some files and folders have name "store" and some have "shop". i want to have one name. everthing need to be streamline. so i think we need to rename every file, folder and any place that has mentioned or named as "store" to "shop". modify correct specs."

## Overview

Effy's third audience is currently addressed by two different words. The client surfaces, the identity
pool, and its gateway authorizer are called **shop**. The backend service, its route namespace, its
database tables, its role names, its shared types, and most written prose are called **store**. The
split was deliberate once and is now a tax: every reader, every author, and every automated agent must
know the mapping before they can find anything.

This feature retires **store** as a name for the audience, the entity, and everything that serves them.
After it lands, **shop** is the only word — in the constitution, in the brief, in the database, in the
routes, in the code, and in the specifications.

Four categories of the word "store" are explicitly **out of scope** and stay exactly as they are: the
TanStack Store library and client-state terminology, the customer "storefront", the AWS "Parameter
Store" product name, and the ordinary English verb.

## Clarifications

### Session 2026-07-10

- Q: How deep should the rename go — does the product concept become "shop", or only the technical
  naming? → **A**: Everything, including the domain noun. The audience, the entity, and the prose all
  become "shop".
- Q: Do the RBAC role keys and Cognito group names get renamed too? → **A**: Yes. `store_manager` and
  `store_staff` become `shop_manager` and `shop_staff`, across the group names, the claim values carried
  in tokens, the persisted role keys, and the role types.
- Q: Which "store" occurrences are off-limits? → **A**: All four proposed exclusions — TanStack Store /
  client store, "storefront", AWS "Parameter Store", and the English verb "store" (including the
  `no-store` cache directive and `.DS_Store` files).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A contributor finds all shop-audience work under one name (Priority: P1)

A developer (human or AI agent) is asked to add a capability to the shop operator console. They search
the repository for "shop" and find the console, its backend service, the routes it calls, the tables it
reads, the roles it checks, and the specification that governs it. They do not have to know that the
backend half answers to a different word, and they do not silently miss half the system because their
search term was the wrong one.

**Why this priority**: This is the whole point of the request, and it is the failure mode that costs
time on every future shop slice. Every other story is a consequence of this one. Delivered alone, it
already removes the mapping tax.

**Independent Test**: Search the repository case-insensitively for "store". Every surviving hit falls
into one of the four documented exclusion categories. Search for "shop" and confirm the shop backend
service, its routes, its tables, its roles, and its console all appear.

**Acceptance Scenarios**:

1. **Given** a contributor who knows only the word "shop", **When** they search the repository for it,
   **Then** they find the shop console, the shop backend service, the shop routes, the shop tables, the
   shop roles, and the shop specification without needing a second search term.
2. **Given** the repository after the rename, **When** a case-insensitive search for "store" is run,
   **Then** every result is a TanStack Store reference, a "storefront" reference, an AWS "Parameter
   Store" reference, or the English verb — and nothing else.
3. **Given** the shared type definitions consumed by the shop console, **When** a contributor reads the
   role type, **Then** it names exactly the two roles the identity provider issues, spelled the same way
   in both places.
4. **Given** the automated test suite before the rename, **When** the suite is run after the rename,
   **Then** the same number of tests run and all of them pass — no test is dropped, renamed away, or
   skipped.

---

### User Story 2 - An operator runs the platform with one vocabulary (Priority: P2)

An operator deploys the shop backend, applies the identity groups, runs the database migration, and
executes the verification checks. Every command, every resource name, every route they call, and every
table they inspect uses the word "shop". The word "store" never appears in a command they must type or
a name they must recognise.

**Why this priority**: The operator surface is where a naming mismatch becomes an outage rather than an
annoyance — a wrong service name deploys nothing, a wrong route returns not-found, a wrong table name
fails a migration. It ranks below P1 only because it depends on P1's renames already being in place.

**Independent Test**: Walk the shop slice's operator runbook end to end. Confirm that no step requires
typing or recognising the word "store", and that each step succeeds.

**Acceptance Scenarios**:

1. **Given** the operator runbook, **When** the operator reads every command in it, **Then** no command
   contains the word "store".
2. **Given** the deployed backend, **When** the operator requests the shop identity route and the shop
   manager-gated route, **Then** both respond under a route namespace named "shop".
3. **Given** the identity pool, **When** the operator inspects the role groups defined on it, **Then**
   the groups are named for the shop audience and match the role names the platform persists.
4. **Given** the previously deployed backend deployment unit named for "store", **When** the rename is
   applied, **Then** the operator is given an explicit, ordered cutover instruction that leaves exactly
   one deployment unit serving the shop audience and no orphaned resources.
5. **Given** the verification checks that prove cross-pool isolation and the manager gate, **When** they
   are run after the rename, **Then** they pass with the same outcomes as before the rename.

---

### User Story 3 - Governance documents speak one word (Priority: P3)

Someone reading the constitution, the platform brief, the architecture reference, or any feature
specification encounters exactly one name for this audience. The governing documents do not describe a
"store audience" served by a "shop pool".

**Why this priority**: Documentation drift is the origin of the current split — the constitution says
"store pool" while the infrastructure has always named it "shop". Fixing the code without fixing the law
guarantees the split returns on the next slice. It is P3 because it blocks nobody today.

**Independent Test**: Read the constitution, the brief, and the architecture reference. Confirm each
describes the audience, its pool, its roles, and its surfaces with a single consistent word.

**Acceptance Scenarios**:

1. **Given** the constitution's authentication principle, **When** a reader reaches the clause naming the
   four audiences and their role groups, **Then** the audience and its pool and its groups all read
   "shop".
2. **Given** the platform brief and the architecture reference, **When** a reader looks for the hidden
   fulfillment-node concept, **Then** it is described with the same noun used everywhere else.
3. **Given** the specification artifacts of previously delivered slices, **When** they describe the
   current shape of the running system, **Then** they use the unified name.
4. **Given** the constitution changes its normative naming, **When** the change lands, **Then** it is
   recorded as a versioned amendment with a stated rationale, per the project's own governance rules.

---

### Edge Cases

- **A compound name mixes both words.** One analytics event name currently contains both at once. It
  must resolve to a single word rather than being left half-renamed.
- **The backend deployment unit is already live.** A deployment unit named for "store" exists in the dev
  environment. Renaming it creates a new unit rather than renaming the old one in place, so the old one
  must be explicitly retired or it will keep serving stale routes alongside the new one.
- **A database migration defining the tables is already written and committed, but not yet applied.** The
  rename must not leave the committed history and the live schema describing different names, and must
  not violate the project's forward-only migration rule.
- **Identity groups are defined in infrastructure code but not yet created in the identity provider.**
  Renaming them before they exist is free; renaming them afterwards would strand every already-issued
  token. The sequence matters.
- **The word appears inside an excluded term.** "Parameter Store", "storefront", "TanStack Store",
  "no-store", and `.DS_Store` all contain the target token and must survive untouched. A naive
  find-and-replace breaks all five.
- **The industry term "dark store"** appears in the product framing. It names an external retail concept,
  not an Effy entity.
- **A reader of the git history** will find the old name in commit messages and in the directory names of
  already delivered slices. History is not rewritten.
- **A partially renamed system is worse than either endpoint** — a route renamed without its caller, or a
  role key renamed without its group, produces a silent authorization failure rather than a loud one.

## Requirements *(mandatory)*

### Functional Requirements

#### Naming outcome

- **FR-001**: The platform MUST use exactly one word — "shop" — to name the third audience, the people who
  work for it, the roles they hold, the entity they are assigned to, the surfaces they use, the service
  that serves them, and the records that describe them.
- **FR-002**: The word "store" MUST NOT appear anywhere in the repository except within these six
  excluded categories: (a) the TanStack Store library and client-state terminology, (b) the customer
  "storefront", (c) the AWS "Parameter Store" product name, (d) the ordinary English verb "store" and
  its inflections, including the `no-store` cache directive and `.DS_Store` files, (e) **historical
  records** whose rewriting would falsify them (the constitution's v1.5.0 changelog and v1.6.0 Sync
  Impact Report, 007's superseded research, and verbatim user quotes in `operator-directives.md` and
  each spec's `**Input**:` line), and (f) **meta** artifacts about the rename itself, which must quote
  the retired name (this feature's `specs/008-shop-naming-unification/` directory and the
  `scripts/verify-no-store.sh` / `scripts/store-token-allowlist.txt` guard files). Categories (e) and
  (f) are carve-outs for **records**, not live names. The authoritative category list is
  [contracts/naming.contract.md § 3](./contracts/naming.contract.md).
- **FR-003**: No name may mix both words. Any identifier, event name, label, or path that currently
  contains both MUST resolve to the single unified word.

#### Scope of the rename

- **FR-004**: Every file and directory named for the audience MUST be renamed — including the backend
  service directory and its function files, the console's identity feature directory, the shared type
  module, the database migration file, the audience capability register, and the contract documents.
- **FR-005**: The persisted records for this audience — the entity table, the staff table, the role table,
  and the staff-to-role table, together with their columns, constraints, and indexes — MUST be named for
  "shop".
- **FR-006**: The persisted role keys MUST be `shop_manager` and `shop_staff`, and the role groups defined
  on the identity pool MUST carry the same two names, so that the value a token asserts and the value the
  platform stores are spelled identically.
- **FR-007**: The route namespace serving this audience MUST be named for "shop", and every caller,
  verification script, contract document, and example configuration referencing those routes MUST be
  updated in the same change.
- **FR-008**: The backend deployment unit, its workspace package name, its tags, and its alarm names MUST
  be named for "shop".
- **FR-009**: Code identifiers naming the audience — types, constants, functions, variables, cache keys,
  and telemetry event names — MUST be named for "shop".
- **FR-010**: Operator-facing commands, their arguments, environment variables, and scripts MUST be named
  for "shop".
- **FR-011**: User-visible copy in the operator console MUST name the audience "shop".

#### Governance and documents

- **FR-012**: The constitution MUST be amended so that its authentication principle names the shop pool and
  its `shop_manager` / `shop_staff` groups, and so that no principle refers to a "store" audience. The
  amendment MUST be versioned and carry a stated rationale.
- **FR-013**: The platform brief, the architecture reference, and the root project instructions MUST
  describe the audience, the entity, and the fulfillment-node concept with the unified name.
- **FR-014**: Specification artifacts of previously delivered slices MUST be updated wherever they describe
  the *current* shape of the running system — its routes, tables, services, roles, and file paths — so that
  no specification directs a reader to a name that no longer exists.
- **FR-015**: The audience capability register that binds the two shop surfaces MUST be renamed, and its
  terminology rule — which currently *documents* the split as intentional — MUST be replaced with a
  statement that one name is now normative.

#### Safety and sequencing

- **FR-016**: The change MUST NOT destroy or replace the identity pool, its app client, its
  configuration-parameter contract, or any already-provisioned user account.
- **FR-017**: The role groups MUST be renamed before any token bearing the old group values is relied upon
  for an access decision, and the specification MUST state the ordering constraint explicitly.
- **FR-018**: The rename MUST leave exactly one backend deployment unit serving the shop audience. Any
  deployment unit left over from the previous name MUST be explicitly retired, and the retirement MUST be
  handed to the operator as an ordered instruction rather than performed automatically.
- **FR-019**: The database schema MUST end in a state where the committed migration history and the live
  schema agree, without violating the project's forward-only migration rule.
- **FR-020**: The automated test suite MUST cover the same behaviours after the rename as before it. No test
  may be deleted or skipped to accommodate a rename, and the total count MUST NOT decrease.
- **FR-021**: Every verification check that passed before the rename MUST pass after it, proving the same
  properties: cross-pool isolation, and the manager gate's three terms (role, status, and shop scope).
- **FR-022**: The still-pending operator steps of the shop console slice MUST remain runnable after this
  change, with their commands updated to the new names and no new blocker introduced.

### Key Entities

The entities themselves are unchanged. Only their names change.

- **Shop** *(was: Store)*: A hidden internal fulfillment node. Customers never see or select one. Created
  only by back-office shop management; no creation path ships in the current slices.
- **Shop Staff** *(was: Store Staff)*: An Effy employee who works at a shop. Keyed on the identity subject.
  Carries a status and an optional shop assignment, both platform-owned and never written from token data.
- **Shop Role** *(was: Store Role)*: The set of roles a shop staff member may hold — `shop_manager` and
  `shop_staff` *(was: `store_manager` and `store_staff`)*. The identity provider's group claim is the origin
  of role assignment; the platform's own staff record is authoritative for the access decision.
- **Shop Staff Role** *(was: Store Staff Role)*: The assignment of a role to a shop staff member.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A case-insensitive search of the repository for "store" returns **zero** results outside the
  six documented exclusion categories. Every surviving result is individually attributable to one of them.
- **SC-002**: A contributor who searches for a single word — "shop" — reaches the console, the backend
  service, the routes, the tables, the roles, and the governing specification, without needing a second
  term.
- **SC-003**: The automated test suite runs the same number of tests as before the rename and all of them
  pass. No test is deleted, renamed out of existence, or skipped.
- **SC-004**: Every verification check that passed before the rename passes after it, with identical
  outcomes — cross-pool isolation still rejects a token from the wrong pool, and the manager gate still
  refuses on each of its three terms independently.
- **SC-005**: No user account, identity pool, app client, or configuration-parameter contract is destroyed
  or replaced. The count of provisioned accounts before and after the change is identical.
- **SC-006**: Exactly one backend deployment unit serves the shop audience when the change is complete.
  Zero orphaned deployment units remain.
- **SC-007**: The value a token asserts for a role and the value the platform persists for that role are
  byte-for-byte identical, verified against a real token and a real record.
- **SC-008**: The constitution, the platform brief, and the architecture reference each describe the
  audience, its pool, its roles, and its fulfillment-node concept using one word, with zero internal
  contradictions.
- **SC-009**: Every operator command in the shop slice's runbook executes successfully, and none of them
  contains the retired word.
- **SC-010**: A reader of any specification artifact that describes the running system is never directed to
  a file path, route, table, service, or role name that does not exist.

## Assumptions

- **The rename is best done now, before the pending operator steps run.** The four shop tables, the two
  identity groups, and the shop console's backend routes are all defined in committed code but **not yet
  applied to any environment** — the corresponding operator steps of the shop console slice remain open.
  Renaming before they run reduces this from a data-and-identity migration to a set of file edits. This
  spec assumes those steps have still not been run when the work begins; if they have, the safety and
  sequencing requirements (FR-016 through FR-019) become materially more expensive and the plan must say
  so.
- **One backend deployment unit is already live** under the retired name, from an earlier slice. Retiring it
  is an outward-facing operation and therefore belongs to the operator, not to the implementation, per the
  project's mode-of-work rule.
- **"dark store" is retained** as an industry term of art describing an external retail concept, in the same
  way "Parameter Store" is retained as an AWS product name. It does not name an Effy entity.
- **Git history is not rewritten.** Commit messages, and the directory names of previously delivered slices
  (`007-shop-web` and earlier), keep whatever words they were created with. Only the *content* of
  specification artifacts is reconciled, and only where it describes the system as it currently stands.
- **The identity pool is already correctly named** and needs no change. So do its authorizer, its
  configuration-parameter paths, and the shared API-client package — the last of which contains no reference
  to the retired name at all, which is itself evidence that the shared foundation was already
  audience-neutral.
- **The customer, driver, and admin audiences are untouched.** This change is scoped to the third audience
  only.
- **This is a rename, not a redesign.** No behaviour changes: the same routes exist, the same gate decides
  the same way on the same three terms, the same records carry the same meaning, and no capability is added
  or removed.
- **A constitution amendment is required and expected.** The constitution currently names a "store" pool and
  "store" groups in its authentication principle; changing normative naming is a versioned amendment, not an
  editorial pass.
