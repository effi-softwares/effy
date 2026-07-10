# Quickstart — Shop Web Foundation (Bootstrap)

**Feature**: 007-shop-web · **Audience**: the operator · **Date**: 2026-07-09

This is the runbook for the steps **Claude does not run**: anything touching live AWS, the database,
or a real identity. Everything else (`make shop-lint`, `shop-test`, `edge-test`, `bo-test`) is
code-verifiable and green before you start.

It doubles as the **verification script for SC-001…SC-016**. §5 and §6 are the two proofs that
cannot be unit-tested (research R9) — they are the point of the slice, not a formality.

**Prerequisites**: the `ef` AWS profile, the dev DB allowlist applied (002), `psql`, `jq`, `goose`,
`pnpm`, Node 22.

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

make shop-seed-store CODE=CMB-01 NAME="Colombo 01" ENV=dev
```

Verify (SC-011 groundwork):

```bash
psql "$(infra/scripts/db-dsn.sh dev)" -c "\dt public.*"
# → store, store_role, store_staff, store_staff_role
psql "$(infra/scripts/db-dsn.sh dev)" -c "SELECT key FROM public.store_role ORDER BY key;"
# → store_manager, store_staff
```

---

## 3. Provision three store accounts

Three, because the gate has three failure modes worth proving. Cognito first; the platform record
comes later (it is created by the JIT upsert on their first sign-in).

```bash
make shop-create-account EMAIL=sam.manager@effy.test ROLE=store_manager ENV=dev
make shop-create-account EMAIL=ravi.staff@effy.test  ROLE=store_staff   ENV=dev
make shop-create-account EMAIL=nobody@effy.test                          ENV=dev   # no role
```

Each account is created with **no temporary password** and a **suppressed invite**, so it lands
`CONFIRMED` on the passwordless pool and can request a one-time code immediately — the same trick
006's `create-first-admin` uses. The target is idempotent: re-running it on an existing account
just re-applies the group.

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

At this point Sam has **no store assignment**. The dashboard says so plainly and `/manager` is
refused. That is correct — the record is created before anyone knows where they work. Now assign,
having signed each account in once so its row exists:

```bash
make shop-provision-staff EMAIL=sam.manager@effy.test STORE=CMB-01 ENV=dev
make shop-provision-staff EMAIL=ravi.staff@effy.test  STORE=CMB-01 ENV=dev
```

`shop-provision-staff` resolves the operator's `cognito_sub` from Cognito rather than matching on
email — because `email` starts NULL (research R6). It refuses clearly if the account has never
signed in, or if the store code is unknown.

Reload. Sam now sees Management; `/store/v1/me` returns the store.

### Verify the token claims (research R6, ~2 minutes)

In the browser console, signed in as Sam:

```js
(await (await import('aws-amplify/auth')).fetchAuthSession()).tokens.accessToken.toString()
```

Then:

```bash
make shop-token-claims TOKEN=eyJ...
```

It prints the claim set and tells you which world you are in. **Record the verdict in
[research.md](./research.md) R6.** If it reports `username` is an opaque id, that **confirms the 005
defect** — `/admin/v1/me` is writing UUIDs into `admin.staff.email`. 007 is correct either way,
by construction.

---

## 5. SC-004 — cross-pool isolation, both directions ⭐

**The proof this slice exists for**, and the first time the platform's four-pool claim is
demonstrated rather than assumed. Grab two real access tokens: one from `shop-web` (Sam) and one
from the back-office console (your bootstrap admin, per 006).

```bash
make shop-verify-isolation SHOP_TOKEN=eyJ... BO_TOKEN=eyJ... ENV=dev
```

**Pass = `200 200 401 401`**: each token is served by its own audience and refused by the other's.

The script explains any failure in place, but the short version: a **403** where a 401 belongs means
a route lost its authorizer and fell through to a handler check; a **200** on a cross-pool call means
a route was attached with the *wrong authorizer id* — the one mistake this design still permits,
since the id is an opaque SSM string that type-checks and deploys fine either way.
(See [cross-pool-isolation.contract.md](./contracts/cross-pool-isolation.contract.md).)

---

## 6. SC-005 / SC-005a / SC-012 — the manager gate, from the platform record ⭐

Collect the three tokens (sign in as each account), then:

```bash
make shop-verify-gate MANAGER_TOKEN=eyJ... STAFF_TOKEN=eyJ... NOBODY_TOKEN=eyJ... ENV=dev
```

This asserts that `/store/v1/me` admits **everyone** (its job is to record them) while
`/store/v1/manager-ping` serves only the manager — and that the `403` body **never names which term
failed**. Every request bypasses the interface entirely: a `store_staff` operator who never sees the
Management link is refused exactly like one who types the URL.

Now flip each **platform-owned** term and re-run. Each must turn the manager's `200` into a `403`
**while Sam's token stays perfectly valid** — that is the entire claim of FR-021.

```bash
DSN="$(infra/scripts/db-dsn.sh dev)"

# SC-012 — disabled staff
psql "$DSN" -c "UPDATE public.store_staff SET status='disabled' WHERE email='sam.manager@effy.test';"
# → re-run shop-verify-gate: manager now 403.  Restore: status='active'

# SC-005a — no store assignment
psql "$DSN" -c "UPDATE public.store_staff SET store_id=NULL WHERE email='sam.manager@effy.test';"
# → 403.  Restore: make shop-provision-staff EMAIL=sam.manager@effy.test STORE=CMB-01 ENV=dev

# SC-005a — inactive store
psql "$DSN" -c "UPDATE public.store SET is_active=false WHERE code='CMB-01';"
# → 403.  Restore: is_active=true
```

Three different columns, three different owners, one uniform refusal. The token never changed.

**SC-011 — idempotency.** Reload the console several times, then:

```bash
psql "$DSN" -c "SELECT count(*) FROM public.store_staff WHERE email='sam.manager@effy.test';"     # → 1
psql "$DSN" -c "SELECT last_seen_at FROM public.store_staff WHERE email='sam.manager@effy.test';" # advances
```

---


## 7. Remaining success criteria

| SC | How to check |
|---|---|
| **SC-001** | Fresh clone → running console + OTP sign-in in **under 15 min** using only `apps/shop-web/README.md` |
| **SC-003** | Proving screen renders the backend-returned subject, roles, **and assigned store** |
| **SC-006** | Sample each failure: stop the backend (or use a bad `VITE_API_BASE_URL`) → degraded + Retry; expire a session → sign-in; `403` → access-denied. **Zero** stack traces, raw detail, or credentials on screen |
| **SC-008** | `git grep -nE '(us-east-1_|AKIA|eyJ)' -- apps/shop-web` → nothing; inspect `make shop-build` output; confirm PostHog events carry only `subject` |
| **SC-009** | `git grep -n "components/ui" apps/shop-web` → nothing (primitives come from `@effy/design-system/ui`); `grep -rn "function ErrorState" apps/` → nothing (the error contract has ONE implementation, in `@effy/web-kit`). Every shared concern resolves to a single source, and **`@effy/api-client` is unchanged by this slice** — the cleanest evidence the foundation was already audience-neutral |
| **SC-010** | Deep-link `/manager` while signed out → sign-in → returned to `/manager`. Reload while signed in → no re-auth |
| **SC-014** | `docs/audiences/store-capabilities.md` lists every capability with an explicit web **and** mobile state; no capability is silent on either |
| **SC-015** | A newcomer adds a practice screen from `shop-web.contract.md` §7 alone, correct on the first attempt |
| **SC-016** | Sign in as each account; `/store/v1/me` returns the expected `roles` for each; the platform record matches after reconcile |

---

## 8. Cleanup

```bash
psql "$DSN" -c "UPDATE public.store_staff SET status='active' WHERE email='sam.manager@effy.test';"
psql "$DSN" -c "UPDATE public.store SET is_active=true WHERE code='CMB-01';"
make shop-provision-staff EMAIL=sam.manager@effy.test STORE=CMB-01 ENV=dev
make dev-stop ENV=dev        # park the RDS instance if you're done for the day
```

Leave the three test accounts in place — §5 and §6 are worth re-running whenever a route's
authorizer changes.

---

## Rollback

| Step | Undo |
|---|---|
| Terraform (groups + CORS) | revert the `.tf` change, `make apply ENV=dev`. Removing a group deletes group membership, not users. |
| Migration | `make db-down ENV=dev` (dev-only, one step). Forward-only in every other environment. |
| Edge deploy | redeploy the previous commit: `make edge-deploy SERVICE=store ENV=dev` |
| Shared extraction | `git revert` the Phase 5 commits — `back-office` and `shop-web` both depend on them, so revert together |
