# Operator Directives — 011 Customer Storefront Web

**Status**: plan-phase input (NOT part of the specification)

The feature description for this slice carried a large amount of **technology direction**.
Constitution Principle I forbids technology in a `spec.md`, so those directives are recorded
here verbatim-in-substance and are **binding input to `/plan`**. The plan MUST honour every
item below or record a justified exception in its Complexity Tracking.

---

## OD1 — Surface and framework

- The customer storefront is a **new web surface**: `apps/customer-web` (`@effy/customer-web`),
  the platform's **third** web surface and its **first public, unauthenticated-by-default** one.
- It is built with **Next.js** and is **SSR-first**. This is not a preference — it is the reason
  the surface exists in this form. The customer surface is the platform's only SEO-bearing
  surface; the two existing web surfaces (`back-office`, `shop-web`) are authenticated SPAs
  behind a login and are deliberately *not* indexable. `customer-web` MUST NOT be built as a
  client-rendered SPA.
- It uses **shadcn/ui** on the platform's existing Radix + Tailwind v4 base.

## OD2 — Scaffolding command (mandated, exact)

The project MUST be created with this exact command:

```
pnpm dlx shadcn@latest init --preset b2BnwlLOK --base radix --template next --pointer
```

The plan MUST verify what this preset actually produces **before** building on it (Next.js
major version, router shape, Tailwind version, the component base, the pointer behaviour) and
reconcile the result with the monorepo's locked standards (React 19, Tailwind v4, TypeScript,
Node 22, pnpm workspace member, Turborepo pipeline). Where the preset's output conflicts with a
locked standard, the **locked standard wins** and the deviation is recorded.

## OD3 — Authentication

- **AWS Amplify SDK, Gen 2, React flavour**, integrated into the storefront.
- Authenticates against the **customer** Cognito pool (created in 001, currently unused by any
  surface — this slice is its first real client).
- **Three credential routes**, all landing on **one** customer identity:
  1. **email + password** (new to the platform — see `Constitution Impact` in `spec.md`),
  2. **email one-time code** (the platform's existing EMAIL_OTP mechanism),
  3. **Google federated sign-in** (new to the platform; requires a Google OAuth client and a
     Cognito identity-provider configuration in Terraform).
- The customer is a **self-registering** entity — public sign-up is open, unlike every other
  audience on the platform, all of which are admin-provisioned.
- Amplify must be wired so that auth state is available to **server rendering**, not only in the
  browser. A client-only auth integration will break the SSR-first requirement for any
  personalised or gated route. The plan MUST state how the session is read on the server.

## OD4 — Backend routing law (binding)

This is the directive with the longest reach, and it survives beyond this slice:

- **Commerce traffic → the hot path (`core-api`, Go).** Product, catalog, search, cart, order and
  payment traffic MUST be served by `core-api`. Rationale given: speed, reliability and
  consistently low latency on the customer's critical path. This aligns with constitution
  Principle III, which reserves the hot path for latency-sensitive customer reads and
  transactions.
- **Customer profile-management traffic → the cold path (`edge-api`).** Profile and
  account-management style features MAY use the serverless cold path.
- **No commerce feature may be placed on the cold path**, in this slice or any later one,
  without an explicit justified exception in that feature's plan.

**Operative constraint for this slice**: `core-api` has **no cloud deployment** — no ECR, no ECS
cluster, no Fargate service, no load balancer exist in `infra/`. By operator decision (2026-07-14)
it **stays local-Docker-only for now**, and `core-api` **go-live is deferred to its own later
slice**. Development against the hot path therefore targets a **locally running Docker
`core-api`**, and the storefront must treat the hot-path base address as **configuration**, never
a literal, so that the go-live slice can repoint it with no code edit.

## OD5 — Client libraries

- The **TanStack suite** is available and may be used as needed, consistent with the locked
  Technology Standards (server-state cache as the source of truth; TanStack Store for genuine
  client state only; **no Zustand**).
- ⚠ The plan MUST NOT reflexively copy the SPA client spine from `back-office` / `shop-web`.
  **TanStack Router in particular is a client-side router and is incompatible with the SSR-first
  requirement** — Next.js owns routing on this surface. The plan must decide, per library, which
  members of the suite genuinely earn their bundle weight on a server-rendered, bundle-budgeted
  public storefront, and justify each one. Adopting a library merely because another surface uses
  it is a defect on this surface.
- Reuse of the platform's shared packages (`@effy/design-system`, `@effy/shared-types`,
  `@effy/api-client`, `@effy/web-kit`) is required where they fit — but `@effy/web-kit` was
  extracted from two **authenticated SPA consoles** and its console chrome, session guard and
  Amplify wiring are likely **SPA-shaped**. The plan MUST assess each shared package for SSR
  compatibility rather than assuming it, and extend or fork at the **package** level (Principle II)
  rather than copy-pasting into the app.

## OD6 — Mandatory research (pre-plan)

The operator explicitly required a **deep research pass** before implementation, on how the
industry builds high-performance e-commerce storefronts. `/plan` MUST produce a `research.md`
that settles, with cited reasoning and a decision recorded for each:

1. **Rendering strategy** — the correct mix of static generation, server rendering, incremental
   regeneration and streaming for catalog, product-detail, search and account pages; how the
   guest/authenticated split affects cacheability (a personalised page is an uncacheable page).
2. **Caching and revalidation** — CDN and edge caching, cache keys, stale-while-revalidate,
   tag-based invalidation when a product or price changes.
3. **Core Web Vitals** — concrete budgets for LCP, INP and CLS, and the techniques that meet
   them (image strategy, font strategy, priority hints, layout-shift prevention).
4. **Bundle size** — a hard client-JS budget, server-component-first discipline, code splitting,
   avoiding client-side hydration of static content, and how to keep the Amplify SDK (which is
   large) off the critical path for guest browsing.
5. **SEO** — indexable server-rendered content, metadata, canonical URLs, structured data
   (Product/Offer/BreadcrumbList), sitemaps, robots directives, pagination and faceted-navigation
   crawl control.
6. **Guest-to-authenticated transition** — how the industry defers the login demand to the point
   of purchase without losing the shopper's context or their cart.

The research is **binding**: its decisions become the surface's rules, not a set of suggestions.

## OD7 — Sequencing note (operator)

This slice bootstraps the **web** half of the customer audience. The operator's stated next slice
is the **customer KMP app** (Android + iOS). The customer audience is therefore a **two-surface
audience** held at parity, exactly like the shop audience (007). This slice MUST establish the
customer **capability parity register** that both surfaces are held to, with the mobile column
outstanding by design.
