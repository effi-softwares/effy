# Service Assignment Rule — which service does a new endpoint belong to?

Effy has **one backend**: serverless TypeScript services under `apis/edge-api/`, reached through
**two HTTP gateways** — the **shared** gateway (customer, shop, driver, public) and the **staff**
gateway (back-office only) (constitution v3.2.0, Principle III; feature 075). Every endpoint is
assigned to exactly **one service**, every service stack to exactly **one gateway**, and the owning
feature's `plan.md` records both and why.

> **History.** Until feature 070 the backend was two paths — an always-on Go service (the "fast"
> path) for shopper traffic and this serverless fleet (the "cold path") for everything
> else — and this document chose between them. 070 retired the Go service. Plans from 004 to 069
> that record a choice between the two as their "Path:" are history, not live law.

## The rule

Ask, in order:

1. **Whose credential does the route take?** That decides the **gateway** and narrows the service:

   | Credential | Gateway |
   |---|---|
   | back-office staff | **staff** |
   | customer, shop, driver, or none (public) | **shared** |

   A service holds one audience where it can. An authorizer is per-route and all-or-nothing, and the
   staff gateway has only one — so a back-office route cannot be put on the shared gateway, or the
   other way round, even by mistake: `gateway-placement.contract.test.ts` fails.
2. **Which domain owns the data it writes?** Put the route with the code that already owns the
   rule. A rule has exactly one implementation.
3. **Is the capability used by two audiences on two gateways?** Then it is **one service, two
   stacks**: a second `serverless.<name>.yml` in the same directory, attached to the other gateway,
   bundling the same handlers. `inventory` is the model (`serverless.yml` for shops,
   `serverless.staff.yml` for back-office). Never a second directory, never the rule written twice.
4. **Would it take the service past its limits?** A service is one CloudFormation stack, capped at
   500 resources (roughly five per route). A new domain, or a service nearing the cap, gets a new
   `apis/edge-api/<service>/` — and a line in the placement table of
   `gateway-placement.contract.test.ts`, which refuses a stack nobody has placed.

### Three examples

| New capability | Service | Gateway | Why |
|---|---|---|---|
| A back-office screen to edit courier settings | `admin` (delivery configuration) | staff | staff credential; `admin` owns delivery configuration |
| A customer route listing their delivery windows | `commerce` (checkout) | shared | customer credential; checkout owns slot rules |
| "Mark a product unavailable", used by shops for their own shop and by staff for any shop | `inventory` — shop route in `serverless.yml`, staff route in `serverless.staff.yml` | shared **and** staff | two audiences, one stock rule: two stacks, one source |

## When a gateway nears its ceiling

A gateway holds at most **300 routes** and **300 integrations** (one per function). The route limit can
be raised by a quota request; **the integration limit cannot**, so it is the one that binds. A new
service on the same gateway adds no room.

On 2026-10-08 the shared gateway reached both. The deployment that found out was refused half-way and
completed only by merging two routes into one (074) — a contract changed to fit a counter. That is the
thing this section exists to prevent.

| Fullest limit | What it means | What to do |
|---|---|---|
| under 75% | room | nothing |
| **75%** (warning alarm) | room for a feature or two | **Plan.** Decide now what will move, while nothing is urgent. Write it into the next feature's plan. |
| **90%** (critical alarm; `make gateway-usage` exits non-zero) | the next feature may be refused | **Stop adding routes to that gateway** until something has moved. |
| 100% | deployments are refused | Too late to plan; see the options below, in order. |

The options, in the order to consider them:

1. **Split a mixed-audience service by gateway** (rule 3 above) if one is still mixed.
2. **Move an audience to its own gateway.** This is what 075 did for back-office. It needs a
   **constitution amendment first** — a third gateway is not a plan-level decision — and a client that
   can change its base address (a website: easy; a released mobile app: every installed copy keeps the
   old address, so its routes must be forwarded for as long as old versions are in use).
3. **Request a route-quota increase** — only useful where one function already serves several routes,
   because integrations still cap at 300.

Not options:

- ⚠ **Merging routes to fit.** It changes a public contract to satisfy a counter, and buys one route.
- ⚠ **One function per service with an internal router.** It removes the limit, and with it
  per-route authorizers, per-function permissions and timeouts, and every guard that reads the stack
  files. A far larger change than the problem.
- ⚠ **Raising the constant in the capacity test.** The provider does not read it.

See the numbers: `make gateway-usage ENV=<env>` (deployed) · `pnpm --filter @effy/edge-shared test`
(about to be deployed).

## The services

| Service (stack) | Gateway | Audience | Owns |
|---|---|---|---|
| `storefront` | shared | public | catalogue reads, search, facets, promotions, serviceability, localities |
| `commerce` | shared | customer (+ public cart preview/policy and the payment webhook) | saved items, lists, cart, promo, checkout, payment, customer order reads, customer cancel and refund request |
| `customer` | shared | customer (+ a few public account routes) | profile, addresses, password, sessions, closure, feedback, newsletter, devices, receipt resend |
| `shop` | shared | shop | shop console: fulfilment, pick lists, products, insights, shop-manager refund |
| `inventory` | shared | shop | stock — a shop managing its own |
| `inventory-staff` (same source as `inventory`) | **staff** | back-office | stock — staff managing it on a shop's behalf (`/inventory/v1/admin/…`) |
| `driver` | shared | driver | driver app |
| `admin` | **staff** | back-office | staff, shops, catalogue admin, promotions, delivery configuration |
| `catalog` | **staff** | back-office | product review and margin |
| `fleet` | **staff** | back-office | drivers, wave planning, delivery slots and days |
| `orders` | **staff** | back-office | order console, handovers, arrivals, refunds, cancellation |
| `notifications` | shared | none (workers) | push and receipt drains |
| `auth` | none | none (Cognito triggers) | one-time-code issuance |
| `live` | none | none (invoked by the live channel) — all four audiences, by necessity | the live-update channel's authorizer (071). No route. Each audience's own service carries its `GET /…/v1/live` |

## Rules that follow from having one backend

- **Shopper-facing services** (`storefront`, `commerce`) connect to the database as a dedicated,
  connection-limited role, so a shopper burst cannot starve staff, shop or driver traffic. A new
  shopper-facing service uses the same role.
- **Money logic lives once**, in the shared library's payments module. A service that moves money
  imports it and is granted the payment secret; it never re-implements a refund.
- **A capability offered to guests and to signed-in shoppers is two routes**, one with the
  authorizer and one without.
- **A service that mixes audiences or carries unauthenticated routes records why** in its plan
  (Principle III). Since 075 no service mixes back-office with another audience in one stack.

## Process

A feature's `plan.md` MUST contain a line: *"Service: `<name>`, on the `<shared|staff>` gateway — because
<audience + domain>."* An
endpoint placed without one is a Constitution Check failure (Principle III). Paths are
`/<service>/v<major>/...`; see [versioning-policy.md](./versioning-policy.md) and
[shared-gateway.md](./shared-gateway.md).
