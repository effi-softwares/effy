# Quickstart — 009 Back-Office Shop Management

Validation/run guide. Details live in [plan.md](./plan.md), [data-model.md](./data-model.md),
[contracts/](./contracts/shop-management.contract.md). Code steps are Claude-authored; **operator-run**
steps (marked 🧑‍💻) touch live cloud state per CLAUDE.md.

## Prerequisites

- 001 (four pools, EMAIL_OTP), 002/003 (DB + migration workflow), 004 (shared gateway + `edge-api`),
  005 (back-office console + shared web foundation), 007 (shop tables, roles, gate, shop console) —
  all present. `public.shop` exists and is **empty**.
- A provisioned back-office account with role `admin` or `manager` (006 first-admin, or added since),
  and a `csa` account for the read-only check.
- Local tooling: `pnpm` workspace installed; the shop console (`apps/shop-web`, :5174) runnable for the
  cross-slice sign-off.

## Build (code-verifiable, no cloud)

```bash
pnpm install
pnpm --filter @effy/shared-types --filter @effy/api-client --filter @effy/design-system \
     --filter @effy/web-kit --filter @effy/back-office --filter effy-edge-admin --filter effy-edge-shop \
     run typecheck
pnpm test        # vitest across the workspace — admin shops slice, shop gate (R2), api-client, back-office
turbo run build  # bundles must be clean
```

Expected: typecheck + tests green, including the updated 007 shop-gate tests (R2) and the new
`admin` `shops/` unit tests (provisioning idempotency, one-shop invariant, authz predicates, delete
guard). Migration SQL passes `db-status` dry parse; shellcheck/secret-PII sweep clean.

## Operator run (🧑‍💻 — live dev)

1. 🧑‍💻 **Apply infra delta** (`make apply ENV=dev`): the admin service's new IAM (Cognito Admin
   actions scoped to the shop pool ARN) + `SHOP_USER_POOL_ID` env wiring. *Abort if a Cognito pool
   would be replaced.*
2. 🧑‍💻 **Commit + run the migration** (`make db-up ENV=dev`): `public.shop` gains `status`,
   `contact_phone`, `notes` (drops `is_active`); adds `admin.audit_log`. (003 commit-guard: commit the
   file first.)
3. 🧑‍💻 **Deploy both services** (`make edge-deploy SERVICE=admin ENV=dev` and `SERVICE=shop ENV=dev`)
   — admin gains the shops routes; shop ships the reconciled gate.
4. 🧑‍💻 **Run the console** (`pnpm --filter @effy/back-office dev`, :5173) and sign in as `admin`/`manager`.

## Acceptance validation (maps to spec SC)

| Scenario | Steps | Expect | SC |
|---|---|---|---|
| Create shop + manager | Create a shop with a primary contact email | shop + `shop_staff(shop_manager)` created; `201` | SC-001 |
| Owner signs in & served | On :5174 request an OTP for that email, sign in, open manager area | **served** the manager read | SC-001, SC-007 |
| Consistency under retry | Simulate a DB failure after Cognito create, re-run | no orphan account, no dup/ownerless record | SC-002 |
| One-user-one-shop | Add an email already used at another shop | `409` refusal | SC-003 |
| Duplicate code | Create with an existing code (incl. concurrent) | `409`, exactly one wins | SC-004 |
| Suspend/disable shop | Suspend the shop; re-check the manager on :5174 | refused; re-activate → served | SC-005, SC-007 |
| Disable user | Disable the manager; they attempt access | refused despite valid credential; re-enable → served | SC-008 |
| Role read-only | Sign in as `csa` | list/detail visible; **no** mutating controls; backend `403` on direct mutate | SC-006 |
| First sign-in reconcile | Inspect `shop_staff` after provision + first `/shop/v1/me` | single row, assignment+role preserved | SC-009 |
| Audit | After each mutation, open the shop/user history | entry with actor/action/target/time | SC-010 |
| Scale/list | Seed many shops; page/search/filter | correct, responsive, server-side | SC-011 |
| Failure states | Force backend/identity-provider errors | clear recoverable states, no leak | SC-012 |
| Hygiene | Grep repo/bundle; inspect telemetry | no secrets; events carry sub only | SC-013 |
| Shared reuse | Locate each shared concern's single source | app forks nothing; additions in packages | SC-014 |
| No operational attrs | Inspect `public.shop` columns | only code/name/status/phone/notes/timestamps | SC-015 |

> **FR-015 note**: rejection of any non-back-office caller and the uniform access-denied contract are
> **inherited** — the routes carry the back-office JWT authorizer (004) and the shared `problem(...)`
> contract (005), both already proven; this slice adds no separate cross-pool isolation test for them.

## Cross-slice sign-off (closes 007)

SC-007 (007 SC-005b) and SC-008 (007 SC-012) are exercised here against **product-created** data. Update
[docs/audiences/shop-capabilities.md](../../docs/audiences/shop-capabilities.md) only if a shop-web
capability's verification state changes; shop **management** itself is a back-office capability, not a
shop-audience one.
