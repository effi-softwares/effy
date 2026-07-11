# Operator Directives — 009-shop-management

These are the **technology-specific directives** the operator gave in the `/speckit-specify`
description. Per constitution Principle I the `spec.md` stays free of implementation detail, so
these are recorded here as **plan-phase input**. `/speckit-plan` MUST resolve each one in `plan.md`
(with its Constitution Check), not the spec.

## Directives captured (verbatim intent)

1. **Surface** — the capability is built into the **back-office console** (`apps/back-office`, the
   005 surface, Vite + React 19 SPA), consuming the shared web foundation
   (`@effy/{design-system,web-kit,shared-types,api-client}`). No new surface is created.

2. **Backend path — cold path only.** "We can also have these APIs in edge-api. No need to have
   them in core-api." → Shop-management endpoints live in the **cold path** (`apis/edge-api`),
   Node + TypeScript Lambdas behind the shared HTTP gateway. This is consistent with Principle III
   (low-frequency admin/operator CRUD belongs on the cold path). The plan chooses whether they
   attach to the existing `apis/edge-api/admin` service (back-office pool authorizer) or a new
   sibling — but the caller is the **back-office** audience, so the endpoints are gated by the
   **back-office (admin) pool** authorizer, NOT the shop pool.

3. **Identity provisioning — Cognito shop pool.** Creating a shop provisions its first shop user
   (and later user-management provisions additional ones) as a **Cognito account in the shop pool**
   (001), passwordless EMAIL_OTP, admin-created with no password (`AdminCreateUser` +
   `AdminAddUserToGroup`), mirroring the two-consistent-writes pattern proven in
   **006-first-admin-bootstrap** (which did this for the admin pool). The back-office service holds
   the shop pool's id/ARN as per-environment configuration and calls the Cognito Admin API
   server-side. This is a **cross-pool provisioning write** (a back-office-authenticated caller
   creating a *shop*-pool identity) — NOT cross-pool *authentication*; Principle IV's no-auth-proxy
   / cross-pool-rejection rules concern token acceptance and are not violated by an authorized
   admin API call. The plan MUST state this explicitly in its Constitution Check.

4. **Data — extend `public.shop` + `public.shop_staff` (007 tables).** The 007 migration created
   `public.{shop,shop_staff,shop_role,shop_staff_role}`. This slice **evolves** them via the 003
   forward-only Goose workflow:
   - `shop` gains a **lifecycle status** (active / suspended / disabled) — 007 shipped only
     `is_active boolean`; the 007 manager gate joins on shop activeness, so the plan MUST reconcile
     the gate predicate to the new status without breaking 007's tests.
   - `shop` gains the **administrative/contact attributes** the create form collects (the plan
     decides exact columns; operational attributes — address, hours, capacity, zones, inventory —
     remain **out of scope**, deferred to the fulfillment slice per 007 FR-025).
   - a **shop-management audit trail** (who did what to which shop/user, when) — the plan decides
     whether it reuses/extends an admin-audit facility or adds a table.

5. **Entity cardinality (hard invariant).** "Shop and shop users are separate entities. A shop can
   have multiple shop users, but no shop user can have multiple shops." → `shop_staff.shop_id` is a
   single FK (already so in 007); the plan MUST enforce and test the one-shop-per-user invariant,
   including refusing to provision an email already bound to another shop.

6. **JIT reconciliation continuity.** 007's `GET /shop/v1/me` does a JIT upsert keyed on the
   Cognito `sub`, treating `shop_id`/`status` as platform-owned (never written from token data).
   This slice pre-creates the `shop_staff` row **at provisioning time, keyed on the `sub` returned
   by `AdminCreateUser`**, so the operator's first shop-web sign-in reconciles against an existing,
   shop-assigned, role-bearing record rather than creating an unassigned JIT duplicate. The plan
   MUST verify the two paths converge (no duplicate, assignment preserved).

7. **"List 20+ back-office capabilities."** Captured in the spec as the **Capability Catalog**
   (spec § Scope), each marked in-scope for this slice or deferred, so the slice stays a bounded
   vertical while the broader roadmap is explicit.

## Cross-slice consequence (why this slice matters)

007-shop-web shipped **code-complete + partially signed off** precisely because it had no way to
create a shop or manage a shop user. This slice ships that capability, and therefore **completes the
live sign-off of 007's deferred criteria**:

- **007 SC-005b** — a `shop_manager` active at an active shop is *served* the manager-only read, and
  *refused* once the shop is suspended/disabled (the gate's positive half + inactive-shop denial).
- **007 SC-012** — an operator the platform marks *disabled* is refused despite a valid credential.

The plan should note this and route those two criteria to be exercised here against
**product-created** data (not hand-inserted rows).

## Operator-run steps (mode of work)

Per CLAUDE.md, Claude authors all code/SQL/config; the **operator personally runs** anything
touching live cloud state — the migration (`make db-up ENV=dev`), the `edge-deploy`, any Cognito
configuration, and the live sign-off. The feature's *runtime* Cognito writes (creating shop users)
are product behavior, not dev-time operator actions, but exercising them in dev is operator-run.
