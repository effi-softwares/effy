# Contract: Cutover

**Feature**: 008-shop-naming-unification | **Status**: Normative | **Audience**: the operator

Per `CLAUDE.md`'s mode-of-work rule, Claude authors every file but runs **no** command that mutates live
AWS or the database. Every step marked 🧑‍💻 below is yours.

The rename is one atomic commit. Two of the three cloud steps must happen **before** it lands and three
**after**. Getting that bracket wrong is the only way this feature can hurt anything, which is why the
ordering is a contract rather than a suggestion.

---

## Why the order matters

`serverless remove` reads `serverless.yml` from `apis/edge-api/store/` to know which CloudFormation stack
to tear down. **The rename deletes that directory.** Merge first, and the tool that retires the old stack
no longer exists in your working tree.

Everything else follows from a single happy fact: the tables, the Cognito groups, and 007's routes have
never been applied to any environment. Steps **A1** and **A2** exist to prove that is still true before
you rely on it.

---

## Phase A — before the merge (on the current `main`)

### A1 🧑‍💻 Prove the migration is unapplied — **BLOCKING**

```bash
make db-status ENV=dev
```

**Expect**: `20260710050004` listed as **Pending**.

- **Pending** → proceed. [research.md](../research.md) R1 Strategy A (edit in place) is authorized.
- **Applied** → **stop.** Strategy A is void. The feature must be re-planned onto Strategy B (the forward
  rename migration, pre-written in [data-model.md](../data-model.md) § Strategy B). Say so before any
  implementation starts.

### A2 🧑‍💻 Prove the Cognito groups do not exist — **BLOCKING**

```bash
POOL=$(aws ssm get-parameter --name /effy/dev/auth/shop/user_pool_id \
        --query Parameter.Value --output text --profile "$AWS_PROFILE")
aws cognito-idp list-groups --user-pool-id "$POOL" \
        --query 'Groups[].GroupName' --profile "$AWS_PROFILE"
```

**Expect**: an empty list, or at least neither `store_manager` nor `store_staff`.

- **Absent** → proceed. Terraform will plan two *creates*, zero destroys.
- **Present** → **stop.** A Cognito group name is immutable; renaming it plans as destroy + create, which
  strips every member's group membership and strands their tokens (FR-017). Switch to research R4's
  three-step fallback: create the new groups, re-add members, deploy the code, *then* delete the old.

### A3 🧑‍💻 Retire the live `store` stack

The one genuinely live artifact. `effy-edge-store-dev` was deployed by 004 and currently answers
`/store/healthz`, `/store/v1/status`, `/store/v2/status`, and `/store/v1/ping`. All four are proving
routes with no consumer. 007's `/store/v1/me` and `/store/v1/manager-ping` were never deployed.

```bash
cd apis/edge-api/store
AWS_PROFILE="$AWS_PROFILE" pnpm exec serverless remove --stage dev
```

**Removes**: 6 Lambdas, their log groups, 6 CloudWatch alarms, the stack's routes and integrations on the
shared HTTP API, and the stack's own `ServerlessDeploymentBucket`.

**Does not touch**: the shared HTTP API itself (attached by external id, Terraform-owned), the four JWT
authorizers, any SSM parameter, the shop Cognito pool, or the database.

**Expect**: `Service store has been removed`. Confirm with:

```bash
aws cloudformation describe-stacks --stack-name effy-edge-store-dev --profile "$AWS_PROFILE"
# → an error: Stack with id effy-edge-store-dev does not exist   ← this is the pass condition
```

> **Recovery if you already merged.** `serverless remove` needs the old config. Restore it temporarily
> without disturbing your branch:
> ```bash
> git worktree add /tmp/pre-rename <the-commit-before-008>
> cd /tmp/pre-rename/apis/edge-api/store && pnpm install && \
>   AWS_PROFILE="$AWS_PROFILE" pnpm exec serverless remove --stage dev
> cd - && git worktree remove /tmp/pre-rename
> ```
> Do **not** reach for `aws cloudformation delete-stack` — CloudFormation refuses to delete the stack's
> non-empty deployment bucket, and you will be left with a half-deleted stack to clean up by hand.

---

## Merge

The rename commit lands. `make verify-naming` exits 0. `pnpm typecheck` and `pnpm test` (**159 tests**)
are green. `terraform validate` and `terraform fmt -check` are clean. `shellcheck` is clean.

---

## Phase B — after the merge

### B1 🧑‍💻 Apply the infrastructure

```bash
make apply ENV=dev
```

**Read the plan output before confirming.** Expect exactly:

- `+ aws_cognito_user_group.this["shop_manager"]` — create
- `+ aws_cognito_user_group.this["shop_staff"]` — create
- no other resource, in particular **no `aws_cognito_user_pool` action of any kind**

> 🛑 **Abort** if `aws_cognito_user_pool` appears with `~` (update-in-place), `-/+` (replace), or `-`
> (destroy). FR-016 forbids replacing the pool, its app client, or any provisioned account. This is the
> same discipline 007's T009 established.

### B2 🧑‍💻 Apply the migration

Commit the renamed migration first (003's commit-guard refuses uncommitted migration files), then:

```bash
make db-status ENV=dev   # 20260710050004_shop_staff_rbac  → Pending
make db-up     ENV=dev
make db-status ENV=dev   # → Applied
```

Verify the schema landed under the new names:

```sql
\dt public.*
-- → shop, shop_role, shop_staff, shop_staff_role   (and no store* relation)
SELECT key FROM public.shop_role ORDER BY key;
-- → shop_manager, shop_staff
```

`public.shop` is created **empty and stays empty** — no shop-creation path exists in any slice yet
(007 FR-019). That is expected, not a failure.

### B3 🧑‍💻 Deploy the renamed service

```bash
make edge-deploy SERVICE=shop ENV=dev
```

**Expect**: stack `effy-edge-shop-dev` created; six routes published under `/shop/`.

```bash
API=$(aws ssm get-parameter --name /effy/dev/edge/api_endpoint \
       --query Parameter.Value --output text --profile "$AWS_PROFILE")
curl -s -o /dev/null -w '%{http_code}\n' "$API/shop/healthz"    # → 200
curl -s -o /dev/null -w '%{http_code}\n' "$API/shop/v1/me"      # → 401 (no token)
curl -s -o /dev/null -w '%{http_code}\n' "$API/store/healthz"   # → 404 — the old namespace is gone
```

That last line is SC-006's evidence: exactly one deployment unit, and the retired namespace answers to
nothing.

### B4 🧑‍💻 Re-point the operator accounts

The three shop accounts from 007's T034 (manager / staff / role-less) — if you already created them —
carry membership in groups that no longer exist. Re-add the two that need roles:

```bash
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" \
  --username <manager-email> --group-name shop_manager --profile "$AWS_PROFILE"
aws cognito-idp admin-add-user-to-group --user-pool-id "$POOL" \
  --username <staff-email>   --group-name shop_staff   --profile "$AWS_PROFILE"
```

If you have **not** yet created them, do it now per 007's quickstart — the group names are the only thing
that changed.

**Sign out and back in.** Group membership is baked into the token at issue time; a token minted before B1
carries the old claim (or none) and will be refused by the gate — correctly, and confusingly, if you
forget this step.

### B5 🧑‍💻 Verify

```bash
make shop-verify-isolation SHOP_TOKEN=eyJ… BO_TOKEN=eyJ… ENV=dev
# → 200 200 401 401   (SC-004, unchanged by the rename)

make shop-verify-gate MANAGER_TOKEN=eyJ… STAFF_TOKEN=eyJ… NOBODY_TOKEN=eyJ… ENV=dev
# → EXPECT_SHOP=0 (default): the manager is refused for lack of a shop assignment.
#   All three gate terms still fail closed; the 403 still never discloses which term failed.

make shop-token-claims ENV=dev
# → settles 007's research R6 (the email-as-username claim shape), unchanged by this rename

make shop-dev   # sign in at :5174, confirm the console reads /shop/v1/me
```

Then confirm SC-007 by hand — the one invariant that spans four systems:

```bash
# the token says…
make shop-token-claims ENV=dev | grep cognito:groups     # → ["shop_manager"]
# …and the database agrees, byte for byte
DSN=$(AWS_PROFILE="$AWS_PROFILE" bash infra/scripts/db-dsn.sh dev)
psql "$DSN" -c "SELECT key FROM public.shop_role;"       # → shop_manager, shop_staff
```

---

## Rollback

| If it fails at | Blast radius | Recovery |
|---|---|---|
| **A1 / A2** (prechecks) | none — read-only | Re-plan onto the documented fallback. Nothing has changed. |
| **A3** (`serverless remove`) | `/store/*` routes gone | Re-deploy from the pre-rename tree: `pnpm exec serverless deploy --stage dev`. These are proving routes; nothing consumes them. |
| **B1** (`terraform apply`) | two groups may exist | `terraform destroy -target` the two groups, or simply leave them — an unused Cognito group grants nothing. The pool is untouched by construction. |
| **B2** (`make db-up`) | four empty tables exist | `make db-down ENV=dev` (dev-only, single-step; the migration's `Down` block drops them in FK-safe order). The tables carry no rows. |
| **B3** (`make edge-deploy`) | partial stack | Serverless rolls the CloudFormation stack back automatically. Re-run after fixing. |
| **B5** (verification) | none — read-only | A failure here means the rename is *incomplete*, not that the cloud is broken. Fix the code and redeploy B3. |

**The database and the pool are the only irreversible surfaces, and neither is at risk**: `public.shop`
ships empty, and the pool is never in Terraform's change set. The worst realistic outcome of a botched
cutover is a `dev` environment with no shop routes for as long as it takes to re-run B3.

---

## Definition of done

- [ ] A1 — `20260710050004` was Pending
- [ ] A2 — neither retired group existed in the shop pool
- [ ] A3 — `effy-edge-store-dev` no longer exists
- [ ] merge — `make verify-naming` exits 0; 159 tests green
- [ ] B1 — two groups created; pool untouched
- [ ] B2 — four `shop*` tables; two `shop_*` role keys; no `store*` relation
- [ ] B3 — `effy-edge-shop-dev` live; `/store/healthz` → 404
- [ ] B4 — accounts re-grouped; fresh tokens minted
- [ ] B5 — isolation, gate, and claims all pass; console signs in
- [ ] SC-001…SC-010 signed off in `specs/008-shop-naming-unification/spec.md`
