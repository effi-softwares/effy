# Quickstart — 005 Back-Office Web Foundation

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-07-08

Run + validation guide. Developer steps run locally; steps marked **🧑‍💻 OPERATOR** touch live
cloud (edge-api deploy, provisioning a test account) and are operator-run per the mode of work.
This slice is **local-only** — there is no hosted console URL.

## Prerequisites

1. Repo bootstrapped (`pnpm install` at root; Node 22, pnpm 10).
2. **🧑‍💻 OPERATOR** — the back-office staff/RBAC migration applied: `make db-up ENV=dev`
   (the **first real `db-up`**; creates `admin.staff`/`role`/`staff_role` — staff-schema
   contract). Verify `make db-status` shows it applied.
3. **🧑‍💻 OPERATOR** — edge-api redeployed with the new `/me` + `/admin/ping` routes **and** the
   `localhost:5173` CORS origin: `make edge-deploy ENV=dev` (contracts/admin-ping, back-office-me).
4. **🧑‍💻 OPERATOR** — the dev DB allowlist / edge-api VPC path already live from 004. SES email
   delivery live for the admin pool (from 001).
5. **🧑‍💻 OPERATOR** — at least three provisioned **admin-pool** test accounts:
   one in group `admin`, one in `manager` (or `csa`), one with **no** group. (Admin-provisioned;
   no self-sign-up.)
6. `apps/back-office/.env.local` filled from the config contract:
   ```
   VITE_COGNITO_USER_POOL_ID=…   # ssm /effy/dev/auth/back-office/user_pool_id
   VITE_COGNITO_CLIENT_ID=…      # ssm /effy/dev/auth/back-office/app_client_id
   VITE_API_BASE_URL=…           # edge-deploy output
   ```

## Run

```bash
make bo-dev            # → vite dev on http://localhost:5173 (or: pnpm --filter back-office dev)
make bo-test           # vitest (component/hook/unit) — should be green
make bo-lint bo-build  # typecheck + lint + production build
```

## Validate against acceptance criteria

### US1 — Passwordless sign-in → console shell (SC-001, SC-002, SC-010)

1. Open `http://localhost:5173` → redirected to sign-in (unauthenticated). ✅ FR-004
2. Enter the **admin** test account's email → "check your email for a code" (no password field
   anywhere). ✅ FR-002
3. Enter the emailed code → land in the authenticated shell, greeted by identity. ✅ (< 2 min → SC-002)
4. **Reload** the page → still signed in (session persists). ✅ FR-003 / SC-010
5. Deep-link directly to a protected route in a fresh tab while signed out → redirected to
   sign-in, then returned to that route after auth. ✅ FR-004 / SC-010
6. Sign out → protected routes unreachable. ✅ FR-003

### US2 — Staff-identity proving read (SC-003, SC-005)

7. Signed in (any grouped account), open the proving screen → it calls `/v1/back-office/ping`
   (the P2 token-echo read) and renders the verified identity + roles. (US4 graduates this screen
   to the record-backed `/me`.) ✅ FR-005 / SC-003
8. Temporarily point `VITE_API_BASE_URL` at an unreachable host (or stop connectivity) → the
   screen shows a **clear degraded state + retry**, no broken UI, no raw error. ✅ FR-009 / SC-005

### US3 — Backend-authoritative role gating (SC-004) — the Option-B proof

9. As the **admin** account: the admin-only area is visible; opening it calls
   `/v1/back-office/admin/ping` → **200**, renders. ✅ FR-006a
10. As the **manager/csa** account: the admin-only nav is **hidden**; if you force the route
    (paste its URL), the console blocks it **and** — the real proof — a direct call to
    `/v1/back-office/admin/ping` returns **403 forbidden** from the backend, surfaced as
    access-denied. ✅ FR-006a / SC-004 (backend refuses, not just the UI)
11. As the **role-less** account: admitted to the shell, but no privileged area is reachable; the
    proving read shows a **no-privileges** state (no privileged data) and `/admin/ping` denies
    clearly (not a blank screen). ✅ FR-006 / US2·US3

### US4 — Platform-owned staff & RBAC records (SC-011, SC-012) — the "not solely Cognito" proof

12. After the admin account's **first** `/me` call, inspect the DB: exactly one `admin.staff`
    row (its `cognito_sub`, `email`, `status='active'`) + its `admin.staff_role`. Sign in again →
    same single row, `last_seen_at` updated, **no duplicate**. ✅ FR-019 / SC-011
13. **🧑‍💻 OPERATOR** — set that admin's `admin.staff.status='disabled'` (a SQL update). With the
    admin **still holding a valid token**, open the admin-only area → `/admin/ping` returns
    **403** from the backend. ✅ FR-020 / SC-012 (authorization the platform owns, independent of
    Cognito). Re-enable to restore.
14. Confirm the admin gate reads role **from the DB record**, not the token (disabling denies even
    though `cognito:groups` still says `admin`). ✅ FR-022

### US5 — Shared foundation + conventions (SC-006, SC-008, SC-009)

15. Toggle **dark mode**: sign-in + proving screens are legible and on-brand (Jade) in both. ✅
    FR-011 / SC-006
16. Confirm the brand token exists **once** in `packages/design-system` and the app imports it
    (no hardcoded `#0FB57E` in `apps/back-office`). ✅ FR-010 / SC-009
17. Confirm `shared-types` + `api-client` are imported by the app, not re-implemented. ✅ SC-009
18. Follow `apps/back-office/README.md` "add a screen" walkthrough to add a throwaway screen in
    the correct layers (`features/<x>/{repo,queries,model,Screen}` + a route) → conforms on the
    first attempt; then revert. ✅ FR-016 / SC-008

### Hygiene (SC-007)

19. `grep -ri "0FB57E\|Bearer\|password" apps/back-office/src` → brand only via design-system;
    **no** secret/token literal; no password anywhere. ✅ FR-014 / SC-007
20. Inspect a network request: `Authorization: Bearer <access token>` (not ID token); telemetry
    events carry `subject` only (no `email`/PII). ✅ contracts / Principle VII

## edge-api delta check (FR-018–022)

```bash
make edge-test         # staff repo tests (upsert idempotency, reconcile, disabled-denial) + /me & /admin/ping handlers
# 🧑‍💻 OPERATOR (post-deploy, with tokens per 004 quickstart Prereq 3):
curl -H "Authorization: Bearer <ADMIN access>"   $VITE_API_BASE_URL/v1/back-office/me           # 200 StaffRecord
curl -H "Authorization: Bearer <ADMIN access>"   $VITE_API_BASE_URL/v1/back-office/admin/ping   # 200 (active admin)
curl -H "Authorization: Bearer <MANAGER access>" $VITE_API_BASE_URL/v1/back-office/admin/ping   # 403 problem+json
```

## Done / sign-off

Slice is done when US1–US5 validate above, `bo-test`/`bo-lint`/`bo-build` + `edge-test` are
green, and the operator confirms the live sign-in→record→refusal flow (incl. the disabled-staff
denial). The constitution amendment (v1.4.0) is already ratified. Not done at "it compiles"
(Quality Gates).
