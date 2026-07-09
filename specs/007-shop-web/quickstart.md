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

Three accounts, because the gate has three failure modes worth proving. Cognito first, then the
platform record.

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

> `--message-action SUPPRESS` and no temporary password: the pool is passwordless, so the user lands
> `CONFIRMED` and can request an OTP immediately. Same trick as 006's `create-first-admin`.

The **store assignment comes after first sign-in** (§4), because the `store_staff` row is created by
the JIT upsert on `/store/v1/me`.

---

## 4. Deploy the backend, run the console, sign in

```bash
make edge-deploy SERVICE=store ENV=dev    # OPERATOR — y/N confirm
make shop-dev                             # vite on http://localhost:5174
```

Sign in as **`sam.manager@effy.test`** → OTP to the inbox → land in the dashboard shell.

**SC-002**: request-code → enter-code → console in under 2 minutes, **zero** password prompts.
**SC-013**: sidebar + top location bar + main region present; identity and sign-out in the sidebar
user menu; rail collapses/expands cleanly in light **and** dark.
**SC-007**: neutral surfaces, single jade accent, proportional scaling — all inherited, nothing
local.

At this point Sam has **no store assignment**. The dashboard shows the "no store assigned" state
(FR-007) and `/manager` is refused. That is correct — now assign:

```bash
make shop-provision-staff EMAIL=sam.manager@effy.test STORE=CMB-01 ENV=dev
make shop-provision-staff EMAIL=ravi.staff@effy.test  STORE=CMB-01 ENV=dev
```

Reload. Sam now sees Management; `/store/v1/me` returns the store.

### Verify the token claims (research R6, 2 minutes)

```bash
# In the browser console, signed in as Sam:
#   (await (await import('aws-amplify/auth')).fetchAuthSession()).tokens.accessToken.toString()
echo "<paste>" | cut -d. -f2 | base64 -d 2>/dev/null | jq '{sub, username, "cognito:groups"}'
```

**Record the result in [research.md](./research.md) R6.** If `email` is absent (expected), nothing
changes — `store_staff.email` is operator-authoritative. If `username` is a UUID rather than the
email, that **confirms the 005 defect** flagged in R6, and `admin.staff.email` should be
re-checked in a 005 reconciliation.

---

## 5. SC-004 — cross-pool isolation, both directions ⭐

**The proof this slice exists for.** Grab two real access tokens: one from `shop-web` (Sam) and one
from the back-office console (an admin, per 006).

```bash
API=$(aws ssm get-parameter --profile ef --name /effy/dev/edge/api_endpoint \
       --query Parameter.Value --output text)
SHOP_TOKEN=...        # from shop-web,     signed in as sam.manager@effy.test
BO_TOKEN=...          # from back-office,  signed in as your bootstrap admin

# 1. Same-pool, happy path — both 200
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $SHOP_TOKEN" "$API/store/v1/me"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $BO_TOKEN"   "$API/admin/v1/me"

# 2. Cross-pool, both directions — BOTH MUST BE 401
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $BO_TOKEN"   "$API/store/v1/me"
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $SHOP_TOKEN" "$API/admin/v1/me"
```

**Pass**: `200 200 401 401`.

A `403` instead of `401` means a route lost its authorizer. A `200` means a route was attached with
the **wrong authorizer id** — the one mistake this design still permits, since the id is an opaque
SSM string (see [cross-pool-isolation.contract.md](./contracts/cross-pool-isolation.contract.md)).

---

## 6. SC-005 / SC-005a / SC-012 — the manager gate, from the platform record ⭐

Every denial below returns `403` with the **uniform** access-denied body. None discloses *which*
term failed.

```bash
M="$API/store/v1/manager-ping"

# a) Active manager, active store            → 200
curl -s -o /dev/null -w 'manager   %{http_code}\n' -H "Authorization: Bearer $SHOP_TOKEN" "$M"

# b) store_staff, direct request past the hidden nav item → 403   (SC-005)
curl -s -o /dev/null -w 'staff     %{http_code}\n' -H "Authorization: Bearer $STAFF_TOKEN" "$M"

# c) Role-less account                        → 403
curl -s -o /dev/null -w 'roleless  %{http_code}\n' -H "Authorization: Bearer $NOBODY_TOKEN" "$M"
```

Now flip each platform-owned term and re-run (a). Each must turn `200` → `403` **while Sam's token
stays perfectly valid** — that is the whole claim of FR-021.

```bash
DSN="$(infra/scripts/db-dsn.sh dev)"

# SC-012 — disabled staff
psql "$DSN" -c "UPDATE public.store_staff SET status='disabled' WHERE email='sam.manager@effy.test';"
# → re-run (a): 403.  Restore: status='active'

# SC-005a — no store assignment
psql "$DSN" -c "UPDATE public.store_staff SET store_id=NULL WHERE email='sam.manager@effy.test';"
# → re-run (a): 403.  Restore via: make shop-provision-staff EMAIL=... STORE=CMB-01 ENV=dev

# SC-005a — inactive store
psql "$DSN" -c "UPDATE public.store SET is_active=false WHERE code='CMB-01';"
# → re-run (a): 403.  Restore: is_active=true
```

**SC-011 — idempotency.** Reload the console several times, then:

```bash
psql "$DSN" -c "SELECT count(*) FROM public.store_staff WHERE email='sam.manager@effy.test';"   # → 1
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
| **SC-009** | `git grep -n "components/ui" apps/shop-web` → nothing (primitives come from `@effy/design-system/ui`). Every shared concern resolves to exactly one source. `@effy/api-client` is **unchanged** by this slice |
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
