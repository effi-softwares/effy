# Research: A Second Front Door for Back-Office

**Feature**: 075-staff-gateway · **Date**: 2026-10-08 · **Spec**: [spec.md](spec.md)

Measured on the dev account on 2026-10-08, and read from AWS's published quota and mapping pages the
same day. File references are to `dev` after 074.

---

## F1 — What is actually full, and which limit matters

Measured on the shared gateway after 074's merge: **300 routes, 300 integrations**.

| Limit (HTTP API) | Default | Can it be raised? | Source |
|---|---|---|---|
| Routes per API | 300 | **Yes** (quota request, per API) | AWS "Quotas for … an HTTP API" |
| **Integrations per API** | 300 | **No** | same page |
| Authorizers per API | 10 | Yes, by support case | same page |
| Multi-level API mappings per domain | 200 | No | same page |

The Serverless Framework creates **one integration per function**, and this repo's convention is one
function per route. So integrations rise in step with routes, and **the limit that cannot be raised is
the one that binds**. A route quota increase alone would not have let 074 deploy.

Routes by service today (from each `serverless.yml`):

| Audience | Services | Routes |
|---|---|---|
| Back-office | `admin` 71 · `fleet` 40 · `orders` 18 · `catalog` 7 · `inventory` (6 of 16) | **142** |
| Customer / public | `commerce` 40 · `customer` 25 · `storefront` 10 | 75 |
| Shop | `shop` 49 · `inventory` (10 of 16, incl. health) | 59 |
| Driver | `driver` 23 | 23 |
| None | `notifications` 1 | 1 |

After the move: **shared ≈ 158 (53%)**, **back-office ≈ 142 (47%)**. Both meet SC-001 (≤ 60%).

---

## R1 — A second gateway, for back-office

**Decision.** Create a second HTTP API, the **staff gateway**, and attach `admin`, `fleet`, `orders`,
`catalog` and the back-office part of `inventory` to it. Customers, shops and drivers stay on the
existing gateway.

**Rationale.** Back-office is 47% of the routes, it is where the delivery programme adds most next
(coverage, fee plans, courier settings, overrides), and exactly one client — an internal website —
calls it. No public traffic, no app-store release.

**Alternatives rejected.**
- *Raise the route quota* — does nothing for integrations, which cannot be raised (F1).
- *One function per service with an internal router* ("lambdalith": 1 route + 1 integration each) —
  removes the limit entirely, but gives up per-route authorizers, per-function permissions (only some
  functions may read the payment secret), per-function timeouts, and the one-handler-per-route shape
  the whole backend and its guards are built on. A far larger change than the problem needs.
- *Several routes per function, by resource* — halves integrations at best, touches every service, and
  still leaves one gateway carrying every audience.
- *Move the customer side instead* — fewer routes freed (75), and it touches the public storefront and
  the mobile app.

---

## R2 — Its own hostname, not a path on the existing one

**Decision.** The staff gateway gets its own custom domain, **`<staff_api_subdomain>.<env zone>`**
(default label `staff-api` → `staff-api.dev.effyshopping.com`), with a single empty-path mapping.
Routes keep their full paths (`/admin/v1/…`, `/fleet/v1/…`), so no service's route table changes.

**Rationale.**
- AWS supports mapping several APIs to one domain by path, but its mapping page does **not** say
  whether the mapping key is removed from the path before the API matches its routes. Every route here
  begins with the service name; if the key is stripped, all 142 routes would have to drop their prefix,
  and if it is not, they would not. A design should not rest on an undocumented behaviour.
- One label under the env zone is already covered by the wildcard certificate (010 research R3) and
  costs nothing.
- A separate hostname lets the staff gateway's CORS list name **only** the back-office origins —
  tighter than today, where one list serves every app (FR-015).
- The only thing that learns the new address is the back-office website's build-time setting.

**Alternative rejected.** *Path mappings on `edge-api.<zone>`* (`admin`, `fleet`, `orders`, `catalog`,
`inventory/v1/admin`) — keeps one hostname, but needs five mappings, depends on the unanswered
stripping question, and shares CORS.

The label is a name inside the environment's own zone, set by a variable with a default — not a
real-world identifier taken from anywhere. The operator can change it before the first apply.

---

## R3 — Only the back-office authorizer exists on the staff gateway

**Decision.** The staff gateway carries **one** JWT authorizer: the back-office pool's. Once the move
is complete, the back-office authorizer is **removed from the shared gateway**, with its SSM parameter.

**Rationale.** This makes FR-012 and FR-013 structural rather than a matter of each route's
configuration: a customer, shop or driver token has no authorizer on the staff gateway that could
accept it, and a staff token has none on the shared one. Today the separation is per-route; afterwards
it is per-gateway as well. The access decision itself still comes from `admin.staff` (FR-014) —
nothing about that changes.

---

## R4 — `inventory` is split by audience into two stacks, one source

`inventory` is the one service that mixes audiences: 8 shop routes + 2 health routes, and **6
back-office routes all under `/inventory/v1/admin/…`**. A Serverless stack attaches to exactly one
HTTP API.

**Decision.** A second stack from the same directory and the same source:
`apis/edge-api/inventory/serverless.staff.yml` → service `effy-edge-inventory-staff`, holding the six
`admin-*` functions and its own health routes (`/inventory-staff/healthz|readyz`), attached to the
staff gateway. `serverless.yml` keeps the shop routes. `make edge-deploy SERVICE=inventory-staff`
deploys it.

**Rationale.** No code moves and no rule is duplicated (Principle III): both stacks bundle the same
handlers from `inventory/src`. Paths do not change, so the back-office website's stock calls are
untouched.

**Consequence.** Guards that find services by reading `<dir>/serverless.yml` (the scheduled-function
alarm contract, the live-channel contract, each service's `config.contract.test.ts`) must also read
`serverless.staff.yml`. Listed in the plan.

**Alternatives rejected.** *A new `inventory-admin` directory* — its handlers would import another
service's `src`, which no service does. *Moving the six routes into `admin`* — puts stock rules in two
services.

---

## R5 — The cutover: forwarding rules on the old gateway, services moved one at a time

A stack moved to another gateway has its routes **created on the new one and then deleted from the old
one** in the same deployment. The back-office website is one build pointing at one address. Moving four
services and then rebuilding the website would leave parts of back-office dead for the whole sequence.

**Decision.** Temporary **forwarding routes** on the shared gateway, owned by Terraform:

```
ANY /admin/{proxy+}               → https://<staff host>/admin/{proxy}
ANY /fleet/{proxy+}               → https://<staff host>/fleet/{proxy}
ANY /orders/{proxy+}              → https://<staff host>/orders/{proxy}
ANY /catalog/{proxy+}             → https://<staff host>/catalog/{proxy}
ANY /inventory/v1/admin/{proxy+}  → https://<staff host>/inventory/v1/admin/{proxy}
```

A specific route always wins over a greedy one. So while a service's own routes are still on the
shared gateway they are used; the instant a deployment removes them, the forwarding route takes over
and sends the request — `Authorization` header included — to the staff gateway, which authorizes it.
The website keeps using the old address throughout, is switched to the new one at the end, and the
forwarding routes are then removed.

**The order, and the one short gap.** The forwarding routes need 5 routes and 5 integrations, and the
shared gateway has none to spare. So:

1. Create the staff gateway (nothing uses it yet).
2. Move **`catalog`** first — 7 routes, product review only. This frees the room.
   ⚠ Between that deployment finishing and step 3, product review is unreachable. **This is the
   feature's one planned gap: a few minutes, one screen.**
3. Add the forwarding routes. Product review works again.
4. Move `orders`, `fleet`, `admin`, `inventory-staff`, one at a time. No gap.
5. Point the back-office website at the staff address and rebuild it.
6. Remove the forwarding routes and the shared gateway's back-office authorizer.

Every step leaves back-office working, so the move can stop after any step (FR-024).

**Why `catalog` first.** It is the smallest back-office service and the least time-critical screen; it
also serves as the proof that a stack really does move cleanly between gateways before `admin` (71
routes) is trusted to.

**Money actions (FR-011).** A refund or cancellation request reaches exactly one function, through
either the direct route or the forwarding route — never both — and the refund rules are idempotent by
key (055). A request cut off mid-switch fails and is retried under the same key.

**Alternatives rejected.** *Move everything, then rebuild the website* — tens of minutes of partial
outage. *Website with two base addresses and a per-service switch* — permanent complexity in the
client for a one-off move.

---

## R6 — Knowing how full a gateway is (FR-016 – FR-019)

Three layers, because the failure was that nothing measured this:

| Layer | What | When it speaks |
|---|---|---|
| **Before deploy** | A contract test in `@effy/edge-shared` counts routes and functions-with-routes per gateway from every `serverless*.yml` and fails if either would pass **300**; it prints the table every run. | In `pnpm test` / CI — a change that would overflow fails before it is deployed. |
| **On demand** | `make gateway-usage ENV=dev` reads the live counts for both gateways from AWS. | Whenever the operator asks (SC-007). |
| **Scheduled** | An hourly function in `admin` (`gatewayUsage`, beside `sesIdentityHealth`) reads both gateways' live counts and emits `GatewayUsagePercent {gateway, limit}`. Alarms at **75** and **90**; a failed-invocations alarm on the function itself. | By email, long before a deploy fails. |

The static test and the live reading can disagree (a stack not yet deployed, or one deployed by hand);
the scheduled reading is of what is really there, the test of what is about to be.

The counter lives in `admin` because it is back-office operational health and that service already
runs the platform's other hourly probe. It needs read-only permission on the two gateways only.

---

## R7 — The constitution changes: one backend, two entry points

Principle III says "behind the shared HTTP gateway" and "every client calls the one gateway". That
sentence stops being true.

**Decision.** Amend to **v3.2.0** (MINOR — material expansion; no existing plan is invalidated, because
every plan's service placement is unchanged):

- The backend remains **one** — serverless TypeScript under `apis/edge-api/`. That does not change.
- It is reached through **two gateways**: the shared gateway (customers, shops, drivers, public) and
  the staff gateway (back-office only).
- A gateway is a managed, pay-per-request entry point, not compute; a second one costs nothing while
  idle and so does not touch the always-on prohibition.
- **A third gateway requires the same amendment**, and a plan must state which gateway a new service
  attaches to.

`docs/api/path-assignment.md`, `docs/api/shared-gateway.md`, `ARCHITECTURE.md`, `CLAUDE.md` and
`infra/envs/README.md` are corrected to match. Specs 004–074 are history and are not edited.

---

## R8 — Undo (FR-023)

Undo is the move in reverse, and is only possible while the shared gateway has room for 142 more routes
and integrations. The runbook's first step is `make gateway-usage` and it **stops** if the shared
gateway would pass 300.

Two ways, both written in the runbook:

- **Simple (acceptable in dev):** point the five stacks' configuration back at the shared gateway's
  parameters, redeploy them, and rebuild the website against the shared address. Back-office is down
  for the length of those deployments.
- **Without a gap:** the same forwarding technique in the other direction — forwarding routes on the
  staff gateway pointing at the shared one — so each stack can move back one at a time.

After later features have used the freed room, undo is no longer possible and the runbook says so.

---

## R9 — Later environments (FR-025)

Everything is declared in the environment root (`infra/envs/<env>/`) and read by each service from SSM
at deploy time. A new environment that is applied and deployed gets both gateways with no step beyond
those it already needs. The forwarding routes are a **dev-only migration aid**, guarded by
`var.staff_gateway_cutover`, whose default (`"complete"`) is the finished state; a fresh environment
never creates them and never has a back-office authorizer on its shared gateway.

---

## Unknowns

None blocking. One thing is **verified by the first step rather than assumed**: that redeploying a
stack with a different `httpApi.id` moves its routes cleanly (new created, old removed, no orphan).
`catalog` is that test; if it does not behave as expected the move stops there with only product
review affected, and the fallback is remove-then-deploy for that stack.
