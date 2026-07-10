# Operator Directives — 007-shop-web (plan-phase input)

Technology-specific directives from the operator's feature description. Recorded **verbatim
in intent** here so that [spec.md](./spec.md) stays free of implementation detail per
constitution Principle I (specs are WHAT/WHY only). These are **inputs to `/plan`**, not
requirements of the spec.

## Verbatim description

> next spec is that i want to boostrap the shop side web application. it must use the same
> tech as the back office webapp. but different user pool. also have the RBAC. this app is
> the web version of the KMP app for shop. so that they both should have same features.

## Directives extracted

### D1 — Same technology stack as the back-office console (005)

The shop console MUST be built on the identical web stack established by
`005-back-office-web`, not a new or divergent one:

- Vite + React 19 + TypeScript.
- The TanStack suite: Router, Query (server-state cache = source of truth), Table, Form,
  Store (client state), Virtual, DevTools, Hotkeys. (Constitution v1.4.0 — no Zustand.)
- shadcn/ui on the Radix base + Tailwind v4, initialised from the same preset the
  back-office used (`pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix
  --template vite --pointer`), with the same `sidebar-07` dashboard layout as the
  authenticated shell.
- AWS Amplify v6 for the passwordless EMAIL_OTP client flow.

**Implication for `/plan`:** the shared web packages `@effy/design-system`,
`@effy/shared-types`, and `@effy/api-client` already exist (005). This slice **consumes and
extends** them (Principle II, single source of truth) — it MUST NOT fork, copy, or
re-implement them per surface. The design-system work of Amendment D2 (neutral surfaces +
single jade accent, `scale.css` proportional scaling) is inherited automatically.

### D2 — A different identity pool

The console authenticates against the **shop** Cognito pool (`effy-<env>-shop`, feature 001),
**not** the back-office pool. Relevant existing infrastructure:

- SSM: `/effy/<env>/auth/shop/user_pool_id`, `/effy/<env>/auth/shop/app_client_id`,
  `/effy/<env>/auth/shop/user_pool_arn`. (Note the un-hyphenated `shop` slug, unlike
  `back-office`.)
- The shared HTTP API gateway (004 / A3) already exposes a **shop** JWT authorizer by id at
  `/effy/<env>/edge/authorizer/shop_id`.
- `apis/edge-api/shop/` already attaches to that gateway and has one shop-authorized
  proving route, `GET /shop/v1/ping`.

**Constraint (constitution Principle IV):** a back-office credential MUST be structurally
rejected by the shop service, and vice versa. There is no auth proxy.

### D3 — RBAC on the shop surface

The shop pool currently has **`groups = []`** (`infra/envs/dev/auth-shop.tf:13`) — it has no
role model at all, unlike the back-office pool's `admin` / `manager` / `csa`. This slice must
establish one. The role model itself, its origin (identity-provider groups vs. platform
record), and its system of record are **spec-level scope decisions**, resolved in
[spec.md](./spec.md) Clarifications — not chosen here.

**Governance note for `/plan`:** constitution Principle IV currently states that *"the admin
pool defines RBAC groups (admin / manager / csa)"*. Introducing a role model on a second pool
may require a constitution reconciliation (an amendment note, or a clarification that the
sentence enumerates the admin pool's groups rather than restricting groups to it). `/plan`
MUST resolve this in its Constitution Check rather than proceeding silently.

### D4 — Surface parity with the `shop` KMP mobile app

The web console is "the web version of the KMP app for shop", and the two "should have same
features". Today `apps/shop-mobile/` is still the **base KMP template** (commonMain
`Greeting` / `Platform` stubs) — there are no features to port. Parity is therefore a
**forward-looking contract**, and how it is expressed is a spec-level scope decision (see
spec Clarifications).

### D5 — Surface directory naming

`CLAUDE.md` names the planned web surface **`shop-web`** ("Vite SPA, shop operator
console"), while the operator's description and the mobile app say **`shop`**. The audience is
"shop/operator"; the mobile app is `shop`; the pool is `shop`; the edge service was `store`
with `/store/v1/*` paths at the time of this directive (renamed to `shop` by 008). `/plan` MUST pick one directory name and reconcile `CLAUDE.md`
accordingly, rather than introducing a third convention.

### D6 — Deploy target

Mirror 005: **local-only** this slice (the console runs on the developer's machine against
the live dev environment from an approved origin). Hosted deployment is a later slice.
