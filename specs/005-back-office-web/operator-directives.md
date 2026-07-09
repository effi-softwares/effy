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

## Verbatim user directive — default dashboard layout (this session, 2026-07-08)

> "i want to modify the 005 spec again. when we boostrap the application we need to have
> default dashboard layout. for that you should follow
> https://ui.shadcn.com/blocks#sidebar-07 block from shadcn. you can install it and use it
> or can copy the code."

**Binding plan-phase input** (NOT re-litigated in `spec.md`):

- The authenticated console shell (US1) ships a **default dashboard layout** at bootstrap —
  the "established groove" every future back-office screen slots into.
- Use the shadcn **`sidebar-07`** block as the layout source of truth:
  https://ui.shadcn.com/blocks#sidebar-07 — the collapsible-to-icon sidebar shell
  (brand/switcher header, primary nav, user menu at the sidebar footer, an inset header with
  sidebar trigger + breadcrumb, and a main content region).
- Acquisition is operator's choice: **install the block** (e.g. `pnpm dlx shadcn@latest add
  sidebar-07`, resolving through the pinned preset `b2BnwlLOK`) **or copy the block source**
  into the console. Either way it consumes the shared `design-system` (jade brand, dark mode)
  — no bespoke re-implementation, no hardcoded styling.
- Wire the shell's navigation/user-menu to the real console state established by US1–US4:
  the signed-in staff identity + sign-out in the sidebar user menu, and role-aware nav
  visibility (FR-006) so the frame respects least-privilege from day one.

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
  - `GET /admin/v1/me` — records (JIT upsert) + returns the platform staff record
    (FR-005/019).
  - `GET /admin/v1/admin-ping` — administrator-only; **authorizes from the DB record
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

- `GET /admin/v1/ping` on `edge-api` — behind the **back-office** JWT authorizer;
  enforces RBAC groups `admin` / `manager` / `csa` (`cognito:groups`); returns
  `{ audience, subject, groups, message }`; group-less callers get the shared
  `forbidden` problem. See `apis/edge-api/admin/src/functions/back-office-ping-v1-get.ts`
  and `docs/api/` (error-envelope, versioning-policy). **This slice adds a sibling
  administrator-only endpoint** (see slice-scope decisions above).

## Verbatim user directive — theme + responsiveness (this session, 2026-07-09)

> "1) i think we need to chage the theme for back office app. currently it like have
> green-black in darkmode and grenn-white in light mode blend color in background of sign in
> page, and the sidebar and all the hover colors. i do want to remove that. we should follow
> the colors seting up according to the sidebar-07 example block from shadcn. we only should
> use emerald color as the primary color.
>
> 2) and the second thing is we need to have improve responsiveness. in small screen like
> laptop it is seems like ok all the things are in correct size. but when it comes to wide
> larger screen, compoenents are small and feels empty. what we need to do is have a some way
> that is responsive to the screensize where in small screen have normal compoenents but when
> it comes to larger wider screen we make the compoenent bit bigger. you should find industry
> standard way to do this first."

**Binding plan-phase input (Amendment D2) — NOT re-litigated in `spec.md`:**

### D2-a — Neutral theme, single emerald accent (remove the jade-tinted surfaces)

- **Adopt the shadcn `sidebar-07` example block's color setup** — a **neutral base color** for
  ALL surfaces: page/sign-in backgrounds, the sidebar, cards, popovers, borders, and **hover**
  states use neutral grays (the shadcn `neutral`/`zinc` default scale), **not** green tints.
- **Remove the jade-tinted surface tokens** introduced earlier (the green-tinted `--accent`
  `#e6f7f0`/`#063a2b`, `--accent-foreground` `#047857`/`#6ee7b7`, and the green `--sidebar*`
  surfaces `#f4f8f6`/`#111815`). The "green-black" (dark) / "green-white" (light) blends the
  user dislikes go away — surfaces become neutral in both appearances.
- **Emerald is the ONLY brand/accent color** — used sparingly for the primary (buttons, the
  active nav item, focus ring, brand mark). Use the Tailwind **`emerald`** palette (e.g.
  `emerald-600` light / `emerald-500` dark for primary). Everything else is neutral.
- **Constitution reconciliation (flag for `/plan`)**: the constitution/CLAUDE.md currently lock
  the brand as **Jade `#0FB57E` / fill `#047857`**. Jade is an emerald shade, but "use emerald +
  neutral surfaces (drop fill `#047857` as a surface tint)" is a **brand-token change** to the
  design-system SSOT. `/plan` MUST decide whether to (a) redefine the brand token to the Tailwind
  emerald scale, and (b) whether a **constitution amendment** (Principle V brand hex) is required,
  or whether Jade `#0FB57E` is retained as the "emerald" primary with only the surfaces neutralized.
  Keep the accent green; the settled change is **neutral surfaces + one accent**.
- Applies design-system-wide (the SSOT), so both the sign-in screen and the dashboard shell
  inherit it; consistent light **and** dark.

### D2-b — Proportional UI scaling on large / wide screens

- Problem: at laptop/standard widths the UI is correctly sized; on **wide, large monitors**
  components look small and the layout feels empty.
- **Find the industry-standard approach first** (research mandate for `/plan`). The recommended,
  widely-used technique is **fluid root font-size scaling**: increase the root (`:root`/`html`)
  font size at large-viewport breakpoints so **all `rem`-based** type, spacing, control, and
  component sizing scale up **proportionally together** (small/laptop = today's size; larger =
  bigger). Optionally combine with **`clamp()`-based fluid tokens** for smoothness and/or a
  **capped, centered max content width** so ultrawide screens don't over-stretch line lengths.
  Alternatives to weigh: extra Tailwind breakpoints (`2xl`/a custom `3xl`) with larger spacing/type
  utilities; container queries for component-local scaling. `/plan` picks and cites the standard.
- Constraints: must stay **legible** and **not overflow/clip** at any width; the small-screen
  (laptop) presentation is the baseline and must not shrink; scaling kicks in **above** a defined
  large-width threshold. Design-system-wide (both sign-in and the shell benefit).

**Scope**: **presentation-only** (Amendment D2). No backend / data / auth / API change.
