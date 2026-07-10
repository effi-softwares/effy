# Quickstart: Shop Naming Unification

**Feature**: 008-shop-naming-unification | **Plan**: [plan.md](plan.md)

How to validate that the rename is complete and correct. The cloud steps and their ordering live in
[contracts/cutover.contract.md](contracts/cutover.contract.md) — this file is the **validation** guide:
what to run, and what "green" looks like.

Steps marked 🧑‍💻 are operator-run (they touch live AWS or the database). Everything else runs locally
and needs no credentials.

---

## Prerequisites

| Need | Why |
|---|---|
| `pnpm install` at the repo root | workspace + Turborepo |
| `terraform` ≥ the version pinned in `infra/` | `validate` / `fmt` |
| `shellcheck` | the three verification scripts + the new guard |
| 🧑‍💻 `AWS_PROFILE` with dev access | cutover phases A and B only |
| 🧑‍💻 An OTP-reachable inbox for three shop accounts | B4/B5 sign-in |

---

## Baseline — capture this **before** touching anything

Two numbers make SC-003 and SC-006 checkable rather than assertable.

```bash
pnpm test 2>&1 | tail -20     # record the total. Expect 159.
```

```
edge-shared 26 · edge-admin 7 · edge-store 39 · web-kit 38 · back-office 20 · shop-web 29  = 159
```

🧑‍💻 And record what is live:

```bash
aws cloudformation list-stacks --profile "$AWS_PROFILE" \
  --stack-status-filter CREATE_COMPLETE UPDATE_COMPLETE \
  --query "StackSummaries[?contains(StackName,'effy-edge')].StackName"
# → ["effy-edge-admin-dev", "effy-edge-store-dev"]
```

---

## 1. The guard is the worklist

Written first, before any renaming (plan § Phase Plan, surface 1). Its output *is* the definition of done.

```bash
make verify-naming
```

**Before the rename**: exits **1** and prints every occurrence still to be fixed — roughly 60 files.
Read this list. It is more trustworthy than any grep you write by hand, because it already subtracts the
four exclusion categories.

**After the rename**: exits **0**, silently.

```bash
shellcheck scripts/verify-no-store.sh    # clean
```

**The trap the guard exists to catch.** Confirm by hand that these four survived — a naive
find-and-replace destroys all of them, and only one of the four is caught by the type checker:

```bash
grep -rn 'ui-store\|@tanstack/react-store' packages/web-kit/src apps/*/src | head
grep -rn 'storefront'      CLAUDE.md platform-brief.md
grep -rn 'Parameter Store' ARCHITECTURE.md infra/README.md
grep -rn 'no-store'        ARCHITECTURE.md
```

---

## 2. Static verification (no credentials)

```bash
pnpm typecheck            # workspace-wide tsc --noEmit
pnpm test                 # MUST report 159 — not 158, not 160
terraform -chdir=infra/envs/dev validate
terraform fmt -check -recursive infra/
shellcheck scripts/*.sh
make verify-naming
```

**`pnpm typecheck` is the safety net for surfaces 2, 3, and 5** — rename a symbol in
`@effy/shared-types` and every consumer that missed the memo fails to compile. It is *not* a safety net
for the SQL string literals in `apis/edge-api/shop/src/staff/repository.ts`; those are covered only by
that package's 39 tests and, finally, by step 5's live join. See [data-model.md](data-model.md)
§ Consequences for the repository layer.

**`pnpm test` reporting 159 is SC-003.** A rename that drops a test file silently reports 155 and looks
green. Read the number.

```bash
pnpm --filter @effy/edge-shop  test    # 39 — the service
pnpm --filter @effy/shop-web   test    # 29 — the console
pnpm --filter @effy/back-office test   # 20 — untouched; proves the rename didn't leak
```

That last one matters: `back-office` shares `@effy/web-kit` and `@effy/design-system` with `shop-web`.
Twenty green tests there is the evidence that the rename stayed inside its audience.

---

## 3. 🧑‍💻 Cutover

Follow [contracts/cutover.contract.md](contracts/cutover.contract.md) exactly. In brief:

```
A1  make db-status ENV=dev            → 20260710050004 must be Pending      (BLOCKING)
A2  aws cognito-idp list-groups …     → no store_manager / store_staff      (BLOCKING)
A3  cd apis/edge-api/store && pnpm exec serverless remove --stage dev
    ─────────────────────── merge 008 ───────────────────────
B1  make apply ENV=dev                → +2 groups, ZERO pool changes  (abort otherwise)
B2  make db-up ENV=dev                → four shop* tables
B3  make edge-deploy SERVICE=shop ENV=dev
B4  re-add accounts to shop_manager / shop_staff; sign out and back in
```

A3 must precede the merge: `serverless remove` reads a `serverless.yml` the rename deletes.

---

## 4. 🧑‍💻 Live route validation

```bash
API=$(aws ssm get-parameter --name /effy/dev/edge/api_endpoint \
       --query Parameter.Value --output text --profile "$AWS_PROFILE")

curl -s -o /dev/null -w 'healthz      %{http_code}\n' "$API/shop/healthz"       # 200
curl -s -o /dev/null -w 'status v1    %{http_code}\n' "$API/shop/v1/status"     # 200
curl -s -o /dev/null -w 'status v2    %{http_code}\n' "$API/shop/v2/status"     # 200
curl -s -o /dev/null -w 'me (no tok)  %{http_code}\n' "$API/shop/v1/me"         # 401
curl -s -o /dev/null -w 'OLD healthz  %{http_code}\n' "$API/store/healthz"      # 404  ← SC-006
```

The `404` on the retired namespace is the proof that exactly one deployment unit survives. A `200` there
means `effy-edge-store-dev` is still alive and step A3 did not happen.

---

## 5. 🧑‍💻 Behaviour is unchanged (the whole point)

Every one of these passed before the rename. Each must pass after it, with the *same* outcome — that is
SC-004, and it is what distinguishes a rename from a rewrite.

```bash
make shop-verify-isolation SHOP_TOKEN=eyJ… BO_TOKEN=eyJ… ENV=dev
```
→ `200 200 401 401`. A shop token is accepted by the shop service and refused by the admin service; a
back-office token, the reverse. Cross-pool isolation (constitution Principle IV) is untouched.

```bash
make shop-verify-gate MANAGER_TOKEN=eyJ… STAFF_TOKEN=eyJ… NOBODY_TOKEN=eyJ… ENV=dev
```
→ With `EXPECT_SHOP=0` (the default, and still correct — `public.shop` is empty), the manager is refused
**for lack of a shop assignment**. Staff and role-less are refused too. All three receive the same
uniform 403 that discloses nothing about which term failed. The gate is one SQL predicate over `role AND
status AND shop scope`, and it still fails closed.

Note the variable is now `EXPECT_SHOP`, not `EXPECT_STORE` (research R8).

```bash
make shop-token-claims ENV=dev
```
→ Unchanged by this feature; still settles 007's research R6.

```bash
make shop-dev     # → http://localhost:5174
```
→ Sign in with the manager account. The console calls `/shop/v1/me`, renders the identity card, and the
manager sees the **Shop** nav group. The role-less account signs in and sees no privileged nav.

---

## 6. 🧑‍💻 SC-007 — the four-system agreement

The invariant that would have silently broken if any one surface had been missed. The token's claim and
the database's role key must be the same bytes.

```bash
make shop-token-claims ENV=dev | grep 'cognito:groups'
# → ["shop_manager"]

DSN=$(AWS_PROFILE="$AWS_PROFILE" bash infra/scripts/db-dsn.sh dev)
psql "$DSN" -c 'SELECT key FROM public.shop_role ORDER BY key;'
# → shop_manager
#   shop_staff
```

Also confirm no relation kept the old name:

```bash
psql "$DSN" -c "\dt public.*"
# → shop, shop_role, shop_staff, shop_staff_role     — and nothing named store*
```

---

## Success-criteria map

| SC | How it is proven | Where |
|---|---|---|
| SC-001 | `make verify-naming` exits 0 | §1 |
| SC-002 | `grep -ril shop` reaches console, service, routes, tables, roles, spec | §1 |
| SC-003 | `pnpm test` reports **159** | §2 |
| SC-004 | isolation + gate scripts pass with identical outcomes | §5 |
| SC-005 | `terraform plan` showed no `aws_cognito_user_pool` action; account count unchanged | cutover B1 |
| SC-006 | `/store/healthz` → 404; one `effy-edge-*-dev` stack per service | §4 |
| SC-007 | token claim ≡ `shop_role.key` | §6 |
| SC-008 | read constitution v1.6.0, `platform-brief.md`, `ARCHITECTURE.md` | manual |
| SC-009 | every runbook command executed; none contains the retired word | cutover |
| SC-010 | 007's quickstart runs verbatim against the renamed system | 007 quickstart |

---

## If something goes wrong

Rollback per surface is tabulated in [contracts/cutover.contract.md](contracts/cutover.contract.md)
§ Rollback. The short version: **nothing here is irreversible.** `public.shop` ships empty, so `make
db-down ENV=dev` costs nothing; the Cognito pool is never in Terraform's change set by construction; and
the worst realistic outcome is a `dev` environment with no shop routes until you re-run `make edge-deploy
SERVICE=shop ENV=dev`.
