# Phase 0 Research: Shop Naming Unification

**Feature**: 008-shop-naming-unification | **Date**: 2026-07-10 | **Plan**: [plan.md](plan.md)

The spec left three questions to the plan (checklist § Open Questions For Planning). They are R1, R2,
and R3 below. R4–R8 are the further unknowns surfaced while resolving them.

---

## R1 — Migration strategy: edit in place, or append a forward rename migration?

**Decision**: **Strategy A — rewrite `20260710050004` in place**, and rename the file to
`20260710050004_shop_staff_rbac.sql` (timestamp preserved). **Gated** on a blocking precheck; falls back
to Strategy B if the gate fails.

**Rationale**:

1. **The migration has never been applied.** Verified live on 2026-07-10 via `make db-status ENV=dev`:
   the three earlier migrations (`20260705095817`, `20260708140000`, `20260708150000`) report as
   **Applied**, and `20260710050004` reports as **Pending**. No `store*` table exists in the dev database.

   > **Correction (2026-07-10).** An earlier draft of this section asserted that `make db-up` had never
   > been run in any environment, inferring it from 003's still-open T008. That inference was **wrong** —
   > `db-up` has run, and the `admin` schema is live. The load-bearing fact is narrower and was confirmed
   > directly rather than inferred: **`20260710050004` specifically is Pending.** Strategy A depends only
   > on that, so the decision stands; the reason given for it does not.
2. **Goose keys on the numeric version, not the filename.** `goose_db_version` records `20260710050004`.
   The descriptive suffix after the timestamp is free to change without affecting whether Goose
   considers the migration applied. So renaming the file is safe *independent* of whether the migration
   has run.
3. **A forward rename migration would encode a lie.** `ALTER TABLE public.store RENAME TO public.shop`
   describes a transition that no database ever made. On a fresh `db-up` it would create `store*` tables
   and immediately rename them — a permanent, confusing artifact in the schema's audit trail, present in
   every future environment, forever, to serve a name that existed for three days in one git branch.
4. **The constitution is not violated.** Technology Standards say "Goose migrations; **forward-only** (no
   down migrations relied on)". Strategy A relies on no down migration. What it *does* violate is 003's
   softer convention that a committed migration is append-only. That is recorded as the single entry in
   the plan's Complexity Tracking, with the precondition that makes it safe.

**The gate** (blocking, operator-run — see [contracts/cutover.contract.md](contracts/cutover.contract.md) step A1):

```bash
make db-status ENV=dev
```

`20260710050004` MUST report **Pending**. Any other state (`Applied`, or a timestamp in the applied
column) means a live database already carries `store*` tables, and Strategy A is abandoned.

**Alternatives considered**:

- **Strategy B — forward rename migration** (`2026071112xxxx_rename_store_to_shop.sql`, a sequence of
  `ALTER TABLE … RENAME TO`, `ALTER INDEX … RENAME TO`, `ALTER TABLE … RENAME CONSTRAINT`, plus an
  `UPDATE public.shop_role SET key = …` and a rewritten CHECK). **Rejected as the default, retained as
  the mandatory fallback** if the gate fails. Written out in full in [data-model.md](data-model.md)
  § Strategy B so it is ready rather than improvised.
- **Drop and recreate** — rejected outright: destructive, and would violate FR-016's spirit even though
  the tables carry no rows today.
- **Leave the DB alone, rename only code** — rejected: violates FR-005 and leaves the persisted role key
  (`store_manager`) disagreeing with the token's group claim (`shop_manager`), which is exactly the
  failure SC-007 exists to prevent.

---

## R2 — Cutover order for the live deployment unit

**Decision**: **Remove the old stack *before* the rename commit lands**, from the pre-rename working
tree. Then deploy the renamed service afterwards.

**Rationale**:

`serverless remove` reads `serverless.yml` from the service directory to know which stack to tear down.
The rename **deletes that directory**. If the commit lands first, the tool that removes the old stack no
longer exists in the tree. This is not a preference; it is a hard ordering constraint, and it is why the
naive "deploy new, then clean up old" instinct fails here.

Downtime is a non-issue, which is what makes remove-first affordable. Of the six `/store/*` routes, only
four are deployed today (`/store/healthz`, `/store/v1/status`, `/store/v2/status`, `/store/v1/ping` — from
004). The two that 007 added (`/store/v1/me`, `/store/v1/manager-ping`) have **never been deployed** (T041
open). All four live routes are proving/health endpoints with no consumer other than 004's own quickstart.
A gap of minutes in `dev` costs nothing.

The two route namespaces are distinct keys on the Terraform-owned shared HTTP API, so `/store/*` and
`/shop/*` could coexist without collision. They must not be *left* coexisting — SC-006 requires exactly
one deployment unit — but the absence of a collision means the sequence has no sharp edge if a step is
retried.

**Sequence** (full commands in [quickstart.md](quickstart.md)):

```
A3 (pre-merge)   cd apis/edge-api/store && pnpm exec serverless remove --stage dev
                 → tears down effy-edge-store-dev: 6 Lambdas, routes, integrations,
                   log groups, 6 alarms, and the stack's own deployment bucket.
                 → does NOT touch the shared HTTP API (external id) or any SSM parameter.
  ─── merge 008 ───
B3 (post-merge)  make edge-deploy SERVICE=shop ENV=dev
                 → creates effy-edge-shop-dev with the /shop/* routes.
```

**Alternatives considered**:

- **Deploy new, then `aws cloudformation delete-stack --stack-name effy-edge-store-dev`.** Rejected:
  Serverless v3 stacks own a `ServerlessDeploymentBucket`, and CloudFormation refuses to delete a
  non-empty S3 bucket. The operator would have to empty it by hand first, turning a one-liner into a
  three-step manual cleanup with a half-deleted stack in between.
- **Keep both stacks.** Rejected: violates SC-006 and leaves `/store/*` answering in `dev` indefinitely,
  which is precisely the confusion this feature exists to remove.
- **Run `serverless remove` after the merge from a git worktree pinned at the pre-rename commit**
  (`git worktree add /tmp/pre-rename HEAD~1`). Works, and is documented in the cutover contract as the
  **recovery path** if the operator merges before remembering step A3. Rejected as the primary because
  it asks the operator to reason about git plumbing during a cloud teardown.

**Also delivered**: a `make edge-remove SERVICE=<name> ENV=<env>` target with the same
`Continue? [y/N]` confirmation as `edge-deploy`. It cannot be used for *this* cutover (the target ships
in the same commit that deletes the directory it would operate on) but its absence is why this step is
awkward at all, and the next service retirement should not have to rediscover the raw command.

---

## R3 — Is renaming the telemetry event a breaking analytics change?

**Decision**: Rename `shop_store_assignment_missing` → **`shop_assignment_missing`**. No dual-emit, no
deprecation window, no historical data to preserve.

**Rationale**:

The event has **never fired**. `apps/shop-web` is local-only this slice (no hosted deploy; the Makefile
comment and 007's plan both say so), and 007's T034 — the first operator sign-in to the shop console —
has not been run. An event that requires an authenticated operator with no shop assignment cannot have
been emitted by a console nobody has ever signed into.

The name is also the spec's one **mixed compound** (FR-003): `shop_store_…` carries both words at once.
Any resolution requires picking one. `shop_assignment_missing` reads correctly and keeps the
`shop_`-prefix convention shared by the other six events in the taxonomy — the surface is already
stamped `surface: "shop-web"` by `createTelemetry`, so the second noun was always redundant.

**Alternatives considered**:

- **`shop_shop_assignment_missing`** — mechanical replacement, absurd output. The reason a blind
  find-and-replace cannot be trusted for this feature, in one example.
- **Dual-emit both names for a window.** Rejected: preserves continuity of a dataset that does not exist.
- **Keep the old name.** Rejected: violates FR-003 directly.

**Operator confirmation** (non-blocking, cheap): if a PostHog project for `shop-web` exists, confirm zero
events named `shop_store_assignment_missing` before merging. If any exist, the rename is still correct;
the operator simply knows to expect a series break.

---

## R4 — Cognito group rename: is it destructive?

**Decision**: Rename the two group names in `infra/envs/dev/auth-shop.tf`. Gate on a blocking precheck
that the groups do not yet exist.

**Rationale**:

`aws_cognito_user_group.name` is a **ForceNew** attribute: Terraform cannot rename a group in place, so a
name change plans as **destroy + create**. Destroying a group **removes every member's membership**,
which would strand any already-issued token's `cognito:groups` claim — exactly what FR-017 forbids.

This is free today because **the groups have never been applied**: they were added to `auth-shop.tf` by
007 and `make apply ENV=dev` (007 T009) is an open operator step. Terraform's plan will therefore show
two *creates* and zero destroys.

**The gate** (blocking — cutover contract A2):

```bash
POOL=$(aws ssm get-parameter --name /effy/dev/auth/shop/user_pool_id --query Parameter.Value --output text)
aws cognito-idp list-groups --user-pool-id "$POOL" --query 'Groups[].GroupName'
```

MUST NOT contain `store_manager` or `store_staff`.

A second, independent gate protects the pool itself (FR-016): the operator reads `terraform plan` and
**aborts if `aws_cognito_user_pool` appears with any action other than no-op**. This is the same
"abort if the pool would be replaced" discipline 007 already established for T009.

**Fallback if the groups already exist (with members)**: a three-step, non-destructive migration —
(1) `terraform apply` creating the two *new* groups alongside the old; (2) re-add each member to the new
group via `admin-add-user-to-group`; (3) only then flip the code's role union and delete the old groups.
The code must not be deployed between (1) and (3), because during that window a token can carry either
name.

**Alternatives considered**: `aws cognito-idp update-group` — cannot change `GroupName`, only description
and precedence. Not an option.

---

## R5 — How is SC-001 enforced mechanically?

**Decision**: Ship `scripts/verify-no-store.sh` plus a checked-in allowlist,
`scripts/store-token-allowlist.txt`. Expose as `make verify-naming` and wire it into `make lint`.

**Rationale**:

SC-001 requires that every surviving `store` hit be "individually attributable" to one of the four
exclusions. That is a property no human will re-verify on every future commit, and it is exactly the
property that decays first: the split this feature removes was itself introduced one reasonable-looking
commit at a time.

The guard greps the tree case-insensitively for the token, subtracts the allowlist, and fails on any
remainder. The allowlist is a file of extended-regex patterns, each preceded by a comment naming which
exclusion category it belongs to and why. Adding a pattern is therefore a reviewable act with a written
justification attached, rather than a silent widening.

Its second job is to be the **worklist**. Run against today's tree, `verify-no-store.sh` prints every
occurrence the rename must eliminate. Implementation is done when it exits 0. This is why the plan
schedules the guard as surface 1, before any renaming.

**Alternatives considered**:

- **An ESLint rule.** Rejected: covers only TypeScript. Most of the rename lives in SQL, HCL, YAML,
  Markdown, and the Makefile.
- **A bare `grep -ri store . | wc -l` in CI.** Rejected: no exclusion mechanism, so it fails permanently
  on `ui-store.ts` and "Parameter Store" and gets disabled within a week.
- **Nothing; rely on review.** Rejected: SC-001 would be unverifiable, and the spec would be shipping a
  success criterion nobody can execute.

---

## R6 — Which constitution version bump?

**Decision**: **v1.5.0 → v1.6.0 (MINOR)**.

**Rationale**: applied directly from the Governance versioning policy.

- **MAJOR** requires "a principle removed or redefined in a way that invalidates existing plans." No
  principle is removed. Principle IV's *substance* — four isolated pools, per-pool validation, no auth
  proxy, cross-pool rejection, claim-as-origin vs. record-as-authority — is untouched. The plans that
  cite it remain valid; 007's is reconciled in this same change, which is what Principle I requires.
- **PATCH** covers "clarifications, wording, and non-semantic refinements." This is not that.
  `shop_manager` is a **normative literal**: Terraform creates a group with exactly that string, Cognito
  puts exactly that string in a JWT claim, the database CHECK constraint admits exactly that string, and
  a TypeScript union compares against exactly that string. Changing it changes what conforming code must
  do.
- **MINOR** — "a new principle or section added, or **material expansion of guidance**" — is the residual
  and the correct one. The guidance in Principle IV materially changes: the pool it names and the two
  group literals it mandates are different after the amendment than before.

**Handling the audit trail.** The Sync Impact Report's *Prior history* line for v1.5.0 records that the
groups were introduced as `store_manager` / `store_staff`. That statement is **true of v1.5.0** and
rewriting it would falsify the changelog — a worse outcome than one annotated survival of the retired
word. Resolution: the line is reworded to name the fact and its supersession —

> `1.5.0 (2026-07-09) — MINOR: Principle IV generalized to "pools MAY define RBAC groups"; the shop pool gained its two role groups (introduced as store_manager / store_staff; renamed to shop_* in 1.6.0).`

— and the two literals on that line become the allowlist's one **historical-record** entry, category (e),
documented in [contracts/naming.contract.md](contracts/naming.contract.md).

This adds a fifth exclusion category the spec did not anticipate. It does not contradict FR-002, which
enumerates exclusions for *live* naming; it is a scoped, single-line carve-out for a changelog, and it is
flagged here rather than smuggled in.

---

## R7 — How far does spec-artifact reconciliation go (FR-014)?

**Decision**:

| Artifact class | Action |
|---|---|
| Spec directory names (`007-shop-web`, …) | **Unchanged.** They are historical identifiers. |
| Git history, commit messages | **Unchanged.** Never rewritten. |
| 007's `spec.md`, `plan.md`, `tasks.md`, `data-model.md`, `research.md`, `quickstart.md`, `operator-directives.md`, `contracts/*` | **Fully reconciled**, including the three contract file renames. 007 is not signed off; its runbook is about to be executed by an operator and must not name a route, table, or command that no longer exists. |
| 005's `plan.md`, `tasks.md`, `data-model.md`, `research.md`, `spec.md` | **Reconciled where they name the shop service, its routes, or the shop audience.** Their own `admin.*` subject matter is untouched. |
| 004's `spec.md`, `plan.md`, `tasks.md` | **Reconciled** where they name `apis/edge-api/store`, `effy-edge-store`, or `/store/v2/status`. |
| 001's `spec.md` | **Reconciled** — prose naming the "store pool". |
| 002, 003, 006 | **Untouched.** Their `store` hits are all "Parameter Store" or the English verb. |
| `docs/audiences/store-capabilities.md` | **Renamed + rewritten.** Its "Terminology" section currently *codifies the split as intentional*; it is replaced by a statement that one name is normative (FR-015). |
| `docs/api/shared-gateway.md` | **Reconciled** — route table. |

**Rationale**: FR-014's test is "no specification directs a reader to a name that no longer exists." A
spec's *narrative* about a past decision is not a direction; a spec's *runbook, contract, route table, or
file path* is. The dividing line is whether a reader would type it or open it.

**One trap found.** `scripts/verify-manager-gate.sh` and `scripts/README.md` refer to "008" as the future
slice that will create shop rows — e.g. *"Run with `EXPECT_STORE=0` (the default until 008)"* and *"Either
008 already shipped (re-run with `EXPECT_STORE=1`)"*. That "008" meant the back-office **shop-management**
slice, anticipated by number. This feature has now taken the number 008, so those comments are actively
misleading. They are reworded to name the slice, not a number: *"until the back-office shop-management
slice ships."* A number-free reference cannot go stale again.

---

## R8 — The `EXPECT_STORE` environment variable

**Decision**: `EXPECT_STORE` → **`EXPECT_SHOP`**. Same semantics: `0` (default) asserts the manager is
refused for lack of a shop assignment; `1` asserts they are served.

**Rationale**: FR-010 puts operator-facing environment variables in scope. The variable is consumed only
by `scripts/verify-manager-gate.sh`, documented only in `scripts/README.md`, and passed only through
`make shop-verify-gate`. It has no persisted state and no consumer outside the repo, so the rename is a
three-file edit with no migration concern.

---

## Summary of decisions

| # | Question | Decision | Gated on |
|---|---|---|---|
| R1 | Migration strategy | Edit `20260710050004` in place; rename file | `make db-status` shows **Pending** |
| R2 | Deployment cutover order | `serverless remove` **before** the merge | — |
| R3 | Telemetry event | `shop_assignment_missing`; no dual-emit | — |
| R4 | Cognito group rename | Destroy+create is free — groups unapplied | `list-groups` shows neither group |
| R5 | SC-001 enforcement | `verify-no-store.sh` + allowlist, in `make lint` | — |
| R6 | Constitution bump | **v1.6.0 (MINOR)**; one allowlisted changelog line | — |
| R7 | Spec reconciliation scope | Content, not directory names; 001/004/005/007 + docs | — |
| R8 | `EXPECT_STORE` | → `EXPECT_SHOP` | — |

**No NEEDS CLARIFICATION markers remain.** Three of the eight decisions (R1, R2, R4) depend on a
precondition that only an operator can observe; each carries a written fallback rather than an assumption.
