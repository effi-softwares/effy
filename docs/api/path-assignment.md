# Service Assignment Rule — which service does a new endpoint belong to?

Effy has **one backend**: serverless TypeScript services behind one shared HTTP gateway
(constitution v3.0.0, Principle III). Every endpoint is assigned to exactly **one service**, and
the owning feature's `plan.md` records the assignment and its reason.

> **History.** Until feature 070 the backend was two paths — an always-on Go service (`core-api`,
> the "hot path") for shopper traffic and this serverless fleet (the "cold path") for everything
> else — and this document chose between them. 070 retired the Go service. Plans from 004 to 069
> that record "Path: core-api | edge-api" are history, not live law.

## The rule

Ask, in order:

1. **Whose credential does the route take?** A service holds one audience where it can:
   public, customer, driver, shop, or back-office. The gateway has one JWT authorizer per pool,
   and an authorizer is per-route and all-or-nothing.
2. **Which domain owns the data it writes?** Put the route with the code that already owns the
   rule. A rule has exactly one implementation.
3. **Would it take the service past its limits?** A service is one CloudFormation stack, capped at
   500 resources (roughly five per route). A new domain, or a service nearing the cap, gets a new
   `apis/edge-api/<service>/`.

## The services

| Service | Audience | Owns |
|---|---|---|
| `storefront` | public | catalogue reads, search, facets, promotions, serviceability, localities |
| `commerce` | customer (+ public cart preview/policy and the payment webhook) | saved items, lists, cart, promo, checkout, payment, customer order reads, customer cancel and refund request |
| `customer` | customer (+ a few public account routes) | profile, addresses, password, sessions, closure, feedback, newsletter, devices, receipt resend |
| `shop` | shop | shop console: fulfilment, pick lists, products, insights, shop-manager refund |
| `inventory` | shop and back-office (per route) | stock |
| `driver` | driver | driver app |
| `admin` | back-office | staff, shops, catalogue admin, promotions, delivery configuration |
| `catalog` | back-office | product review and margin |
| `fleet` | back-office | drivers, wave planning, delivery slots and days |
| `orders` | back-office | order console, handovers, arrivals, refunds, cancellation |
| `notifications` | none (workers) | push and receipt drains |
| `auth` | none (Cognito triggers) | one-time-code issuance |

## Rules that follow from having one backend

- **Shopper-facing services** (`storefront`, `commerce`) connect to the database as a dedicated,
  connection-limited role, so a shopper burst cannot starve staff, shop or driver traffic. A new
  shopper-facing service uses the same role.
- **Money logic lives once**, in the shared library's payments module. A service that moves money
  imports it and is granted the payment secret; it never re-implements a refund.
- **A capability offered to guests and to signed-in shoppers is two routes**, one with the
  authorizer and one without.
- **A service that mixes audiences or carries unauthenticated routes records why** in its plan
  (Principle III).

## Process

A feature's `plan.md` MUST contain a line: *"Service: `<name>` — because <audience + domain>."* An
endpoint placed without one is a Constitution Check failure (Principle III). Paths are
`/<service>/v<major>/...`; see [versioning-policy.md](./versioning-policy.md) and
[shared-gateway.md](./shared-gateway.md).
