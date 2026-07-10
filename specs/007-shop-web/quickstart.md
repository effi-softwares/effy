# Quickstart — Shop Web Foundation (Bootstrap)

**Feature**: 007-shop-web · **Audience**: the operator · **Date**: 2026-07-09

This is the runbook for the steps **Claude does not run**: anything touching live AWS, the database,
or a real identity. Everything else (`make shop-lint`, `shop-test`, `edge-test`, `bo-test`) is
code-verifiable and green before you start.

It doubles as the **verification script for SC-001…SC-016**. §5 and §6 are the two proofs that
cannot be unit-tested (research R9) — they are the point of the slice, not a formality.

**Two criteria are deliberately deferred.** This slice ships the store schema but **no way to create
a store** (FR-019) — that is back-office store management, the next slice. So SC-005b (a manager
*served* at an active store) and SC-012 (a *disabled* operator refused) are verified there, against
data the product created. Everything else is verifiable today, including the whole negative half of
the gate. See §6.

**Prerequisites**: the `ef` AWS profile, the dev DB allowlist applied (002), `psql`, `goose`,
`pnpm`, Node 22, `python3` (for `shop-token-claims`).

---

## 0. Preflight

```bash
make preflight ENV=dev           # asserts the resolved AWS account matches dev.tfvars
pnpm install                     # links @effy/web-kit + @effy/shop-web into the workspace
make shop-lint shop-test         # the new console
make bo-lint bo-test bo-build    # the refactored back-office — MUST still be 20/20 (Phase 5 gate)
make edge-test                   # the store service's new staff module
```

If `bo-test` is not green, **stop**. The shared extraction regressed the first surface, and no
amount of shop-web progress is worth that.

---

## 1. Governance and infrastructure

The constitution amendment (v1.5.0) lands as a committed doc change **before** this apply — the
Terraform below is what it authorizes.

```bash
make plan  ENV=dev               # review: 2 new aws_cognito_user_group; 1 CORS origin added
make apply ENV=dev               # OPERATOR — interactive approval
```

**Expect exactly**:
- `+ aws_cognito_user_group.this["store_manager"]`
- `+ aws_cognito_user_group.this["store_staff"]`
- `~ aws_apigatewayv2_api.edge` — `cors_configuration.allow_origins` gains `http://localhost:5174`

**Do not expect** a pool replacement. Adding groups is additive. If the plan shows
`aws_cognito_user_pool.this must be replaced`, **abort** — every existing user would be destroyed.

---

## 2. Database

The migration must be **committed first** — `make db-up` refuses uncommitted migrations
(`Makefile:119-125`).

```bash
git add db/migrations && git commit -m "feat(db): store staff RBAC schema"
make db-status ENV=dev           # read-only; confirms the pending migration
make db-up ENV=dev               # OPERATOR — y/N confirm
```

Verify the schema landed:

```bash
psql "$(infra/scripts/db-dsn.sh dev)" -c "\dt public.*"
# → store, store_role, store_staff, store_staff_role
psql "$(infra/scripts/db-dsn.sh dev)" -c "SELECT key FROM public.store_role ORDER BY key;"
# → store_manager, store_staff
```

> **`public.store` is empty, and stays empty.** This slice ships the store schema and the
> authorization that depends on it, but **no way to create a store** (FR-019) — no interface, no
> command, no seed file. Stores are created by **back-office store management**, the next slice, so
> that no store row ever exists that the product did not create.
>
> Everything below is written for that reality. It is not a gap to work around: an operator with no
> store assignment is a **required** state the console and the gate must both handle correctly, and
> you are about to verify that they do.

---

## 3. Provision three store accounts

Three, because the gate has three ways to refuse. Identity only — Cognito, no database. The
`store_staff` row appears by itself on each account's first sign-in (the JIT upsert).

```bash
POOL=$(aws ssm get-parameter --profile ef --name /effy/dev/auth/shop/user_pool_id \
        --query Parameter.Value --output text)

for E in sam.manager@effy.test  ravi.staff@effy.test  nobody@effy.test; do
  aws cognito-idp admin-create-user --profile ef \
    --user-pool-id "$POOL" --username "$E" \
    --user-attributes Name=email,Value="$E" Name=email_verified,Value=true \
    --message-action SUPPRESS
done

aws cognito-idp admin-add-user-to-group --profile ef --user-pool-id "$POOL" \
  --username sam.manager@effy.test --group-name store_manager
aws cognito-idp admin-add-user-to-group --profile ef --user-pool-id "$POOL" \
  --username ravi.staff@effy.test   --group-name store_staff
# nobody@effy.test gets NO group — the role-less case.
```

> `--message-action SUPPRESS` with **no temporary password**: the pool is passwordless, so the user
> lands `CONFIRMED` and can request an OTP immediately. Same trick as 006's `create-first-admin`.

---

## 4. Deploy the backend, run the console, sign in

```bash
make edge-deploy SERVICE=store ENV=dev    # OPERATOR — y/N confirm
make shop-dev                             # vite on http://localhost:5174
```

Sign in as **`sam.manager@effy.test`** → OTP to the inbox → land in the dashboard shell.

- **SC-002**: request-code → enter-code → console in under 2 minutes, **zero** password prompts.
- **SC-013**: sidebar + top location bar + main region present; identity and sign-out in the sidebar
  user menu; the rail collapses/expands cleanly in light **and** dark.
- **SC-007**: neutral surfaces, single jade accent, proportional scaling — all inherited, nothing local.
- **SC-003**: the proving screen shows the backend-returned subject, roles, and a **"no store
  assigned"** state. That state *is* the expected result (FR-007) — the record was created before
  anyone could know where this operator works, and nothing exists yet to assign.

Sign in as the other two accounts as well, so their `store_staff` rows exist for §6.

### Verify the token claims (research R6, ~2 minutes)

In the browser console, signed in as Sam:

```js
(await (await import('aws-amplify/auth')).fetchAuthSession()).tokens.accessToken.toString()
```

Then:

```bash
make shop-token-claims TOKEN=eyJ...
```

It prints the claim set and states the verdict. **Record it in [research.md](./research.md) R6.** If
it reports `username` is an opaque id, that **confirms the 005 defect** — `/admin/v1/me` is writing
UUIDs into `admin.staff.email`. 007 is correct either way, by construction.

---

## 5. SC-004 — cross-pool isolation, both directions ⭐

**The proof this slice exists for**, and the first time the platform's four-pool claim is
demonstrated rather than assumed. Grab two real access tokens: one from `shop-web` (Sam) and one
from the back-office console (your bootstrap admin, per 006).

```bash
make shop-verify-isolation SHOP_TOKEN=eyJ... BO_TOKEN=eyJ... ENV=dev
```

**Pass = `200 200 401 401`**: each token is served by its own audience and refused by the other's.

The script explains any failure in place. The short version: a **403** where a 401 belongs means a
route lost its authorizer and fell through to a handler check; a **200** on a cross-pool call means a
route was attached with the *wrong authorizer id* — the one mistake this design still permits, since
the id is an opaque SSM string that type-checks and deploys fine either way.
(See [cross-pool-isolation.contract.md](./contracts/cross-pool-isolation.contract.md).)

This check is **complete today**. It needs no store.

---

## 6. SC-005 / SC-005a — the gate refuses, from the platform record ⭐

Collect all three tokens (sign in as each account), then:

```bash
make shop-verify-gate MANAGER_TOKEN=eyJ... STAFF_TOKEN=eyJ... NOBODY_TOKEN=eyJ... ENV=dev
```

`EXPECT_STORE` defaults to `0` — the pre-store-management world. The script asserts:

| Caller | `/store/v1/me` | `/store/v1/manager-ping` | Why |
|---|---|---|---|
| `store_manager` | `200` | **`403`** | **SC-005a** — a sufficient role, refused for lack of a store assignment. The store-scope term is doing real work. |
| `store_staff` | `200` | `403` | **SC-005** — refused by the *backend*, bypassing the hidden nav item entirely |
| role-less | `200` | `403` | recorded, granted nothing |

It also asserts the `403` body **never names which term failed** — that would leak the platform's
record state to a caller just told they may not read it.

Note what the first row proves. Sam holds `store_manager` in the `cognito:groups` claim and is
**still refused**, because the platform record — not the token — decides. That is FR-021 in one
line, and it is provable precisely *because* no store exists.

**SC-011 — idempotency.** Reload the console several times, then:

```bash
DSN="$(infra/scripts/db-dsn.sh dev)"
psql "$DSN" -c "SELECT count(*) FROM public.store_staff;"                    # → 3, one per account
psql "$DSN" -c "SELECT cognito_sub, email, status, store_id, last_seen_at
                  FROM public.store_staff ORDER BY created_at;"
# every store_id NULL · status 'active' · last_seen_at advancing on each reload
```

### Deferred to the store-management slice — SC-005b and SC-012

These need store data, and this slice can create none:

| Criterion | What it asserts | Blocked on |
|---|---|---|
| **SC-005b** | an active manager at an **active store** is *served* (`200`) | a store existing |
| **SC-005b** | the same manager is refused once the store is **deactivated** | a store existing |
| **SC-012** | a **disabled** operator is refused despite a valid credential | a way to disable one |

All three terms are implemented and unit-tested here (`apis/edge-api/store/src/staff/`). When
back-office store management ships, create a store through it, assign Sam, and re-run:

```bash
make shop-verify-gate MANAGER_TOKEN=… STAFF_TOKEN=… NOBODY_TOKEN=… EXPECT_STORE=1 ENV=dev
```

Then flip `status` and `is_active` from that console and watch a valid token stop working.

---


## 7. Remaining success criteria

| SC | How to check |
|---|---|
| **SC-001** | Fresh clone → running console + OTP sign-in in **under 15 min** using only `apps/shop-web/README.md` |
| **SC-003** | Proving screen renders the backend-returned subject, roles, and the **"no store assigned"** state — the expected result until store management ships (FR-007) |
| **SC-006** | Sample each failure: stop the backend (or use a bad `VITE_API_BASE_URL`) → degraded + Retry; expire a session → sign-in; `403` → access-denied. **Zero** stack traces, raw detail, or credentials on screen |
| **SC-008** | `git grep -nE '(us-east-1_|AKIA|eyJ)' -- apps/shop-web` → nothing; inspect `make shop-build` output; confirm PostHog events carry only `subject` |
| **SC-009** | `git grep -n "components/ui" apps/shop-web` → nothing (primitives come from `@effy/design-system/ui`); `grep -rn "function ErrorState" apps/` → nothing (the error contract has ONE implementation, in `@effy/web-kit`). Every shared concern resolves to a single source, and **`@effy/api-client` is unchanged by this slice** — the cleanest evidence the foundation was already audience-neutral |
| **SC-010** | Deep-link `/manager` while signed out → sign-in → returned to `/manager`. Reload while signed in → no re-auth |
| **SC-014** | `docs/audiences/store-capabilities.md` lists every capability with an explicit web **and** mobile state; no capability is silent on either |
| **SC-015** | A newcomer adds a practice screen from `shop-web.contract.md` §7 alone, correct on the first attempt |
| **SC-016** | Sign in as each account; `/store/v1/me` returns the expected `roles` for each; the platform record matches after reconcile |

**Deferred to the back-office store-management slice** (they need store data this slice cannot
create — see §6): **SC-005b** (manager served at an active store; refused once it is deactivated)
and **SC-012** (a disabled operator refused despite a valid credential). Both terms are implemented
and unit-tested here.

---

## 8. Cleanup

Nothing to undo: this slice writes no store rows and flips no platform-owned columns, so there is no
fixture state to restore. The only rows that exist are the three `store_staff` records the JIT upsert
created, and they are the real thing, not test data.

```bash
make dev-stop ENV=dev        # park the RDS instance if you're done for the day
```

Leave the three test accounts in place — §5 and §6 are worth re-running whenever a route's
authorizer changes, and §6 gets its `EXPECT_STORE=1` half once store management ships.

---

## Rollback

| Step | Undo |
|---|---|
| Terraform (groups + CORS) | revert the `.tf` change, `make apply ENV=dev`. Removing a group deletes group membership, not users. |
| Migration | `make db-down ENV=dev` (dev-only, one step). Forward-only in every other environment. |
| Edge deploy | redeploy the previous commit: `make edge-deploy SERVICE=store ENV=dev` |
| Shared extraction | `git revert` the Phase 5 commits — `back-office` and `shop-web` both depend on them, so revert together |
