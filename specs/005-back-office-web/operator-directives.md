# Operator Directives — 005 Back-Office Web (Bootstrap)

> **Plan-phase input, not spec content.** Per constitution Principle I, `spec.md` stays
> free of implementation detail. The technology choices, exact commands, and research
> mandates the user supplied for this slice are recorded **verbatim** here and are binding
> inputs to `/speckit-plan` — they are NOT requirements the spec re-litigates.

## Verbatim user directive (this session)

> "Now let's plan the back-office web application. we should use following technologies
> vite, react, Tanstack router, Tanstack query, Tanstack table, tanstask form, tanstask db
> and tanstask store, and also tanstask devtools, and hotkeys. for the UI we should use
> shadcn ui we should use `pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix
> --template vite --pointer` command. we should use shadcn preset b2BnwlLOK.
> … as this specs let's boostrap the react app"

## Pinned stack (cold-path web surface: `back-office`)

- **Build/runtime**: Vite + React (SPA). This is the `back-office` internal admin console
  named in CLAUDE.md ("Web (3): … `back-office` (Vite SPA, internal admin)").
- **TanStack suite** (the client spine):
  - **Router** — routing + route-level auth guards
  - **Query** — server-state cache (the source of truth for backend data)
  - **Table** — data grids
  - **Form** — form state + validation
  - **Store** — genuine client-only state · **LOCKED as the web client-state lib** (constitution
    v1.4.0; Zustand removed platform-wide — operator decision 2026-07-08)
  - **DB** — client-side collections / reactive data layer · **DROPPED this slice** (operator
    decision: beta/pre-1.0, no data surface in a bootstrap — research A3; revisit later)
  - **Virtual** — list/grid virtualization (foundation; first real use deferred)
  - **DevTools** — dev-only introspection for the above (unified panel)
  - **Hotkeys** — keyboard shortcuts · **`@tanstack/react-hotkeys` (ALPHA)**, operator-chosen
    over GA `react-hotkeys-hook` (accepted API-instability risk; isolated behind a `lib/` wrapper)
- **UI**: **shadcn/ui**, initialized with the **exact** command:
  ```bash
  pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix --template vite --pointer
  ```
  - Preset: **`b2BnwlLOK`**  ·  base: **radix**  ·  template: **vite**  ·  `--pointer`
- **Auth**: AWS Amplify against the **admin** Cognito pool (passwordless EMAIL_OTP) — per
  CLAUDE.md Auth section and feature 001.

## Research mandates (reference during `/plan`)

Consult current official docs for each before pinning versions and patterns:

- shadcn components — https://ui.shadcn.com/docs/components
- TanStack Virtual — https://tanstack.com/virtual/latest
- TanStack DevTools — https://tanstack.com/devtools/latest
- TanStack Hotkeys — https://tanstack.com/hotkeys/latest
- TanStack Form — https://tanstack.com/form/latest
- TanStack Table — https://tanstack.com/table/latest
- TanStack Store — https://tanstack.com/store/latest
- TanStack DB — https://tanstack.com/db/latest
- TanStack Router — https://tanstack.com/router/latest
- TanStack Query — https://tanstack.com/query/latest

## Slice-scope decisions (settled with the user)

- **Deploy target: LOCAL DEV ONLY this slice.** The app runs locally (an approved dev CORS
  origin) against the **already-live dev `edge-api`**. Amplify Hosting + its Terraform/
  runbook are **deferred to a later slice** — mirrors how `core-api` was "local only this
  slice, Fargate later."
- **No *product* features, but the back-office staff/RBAC data layer IS in scope** (operator
  decision 2026-07-08). The platform keeps its **own** record of back-office staff + roles — it
  does not rely solely on Cognito. New `admin`-schema tables (`admin.staff` / `admin.role` /
  `admin.staff_role`) via the 003 migration workflow (the first real `db-up`); a `staff` domain
  in `edge-api` (raw SQL). Real *product* CRUD (catalog/orders) still waits for later slices.
- **Backend additions this slice (clarify Option B + persistence).**
  - `GET /v1/back-office/me` — records (JIT upsert) + returns the platform staff record
    (FR-005/019).
  - `GET /v1/back-office/admin/ping` — administrator-only; **authorizes from the DB record
    (status active AND role admin)**, not the token claim, so a disabled staff row is refused
    despite a valid token (FR-018/020/022).
  - Both behind the existing back-office JWT authorizer; version + error-contract per
    `docs/api/`; mirror `back-office-ping-v1-get.ts` layering. Requires an operator `db-up` +
    `edge-deploy` (+ `localhost:5173` CORS origin).
- **First web surface + first shared web packages.** This slice births the shared web
  foundation (`design-system`, typed `api-client`, `shared-types`, `config`) that the other
  two web surfaces (`customer-web`, `store-web`) will inherit — only what US1/US2 need gets
  populated now.

## Existing backend contract this slice consumes

- `GET /v1/back-office/ping` on `edge-api` — behind the **back-office** JWT authorizer;
  enforces RBAC groups `admin` / `manager` / `csa` (`cognito:groups`); returns
  `{ audience, subject, groups, message }`; group-less callers get the shared
  `forbidden` problem. See `services/edge-api/src/functions/back-office-ping-v1-get.ts`
  and `docs/api/` (error-envelope, versioning-policy). **This slice adds a sibling
  administrator-only endpoint** (see slice-scope decisions above).
