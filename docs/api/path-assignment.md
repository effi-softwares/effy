# Path Assignment Rule — which backend does a new endpoint belong to?

Effy's backend is deliberately two paths (constitution Principle III). Every future
endpoint gets assigned to exactly **one** of them, and the owning feature's `plan.md`
records the assignment and its rationale. Origin: specs/004-backend-bootstrap (FR-014);
the operator's mandate sets the semantics.

## The two homes

| | `services/core-api` (hot path) | `services/edge-api` (cold path) |
|---|---|---|
| Runtime | Go + Gin, always-on container | TypeScript Lambdas behind API Gateway |
| Optimized for | latency + high concurrency | cost (pay-per-request, scale-to-zero) |
| Accepts | none of: cold starts, per-request billing at high volume | cold starts, occasional multi-second first byte |

## The rule

Ask, in order:

1. **Must this endpoint resolve fast, for many users, on a customer's critical path?**
   (catalog browse, search, filter, checkout reads, anything a customer stares at while
   it loads) → **core-api**.
2. **Is it latency-tolerant, low-frequency, or an internal/ops surface?**
   (profile updates, back-office tasks, operator consoles, admin CRUD, async work)
   → **edge-api**. The operator's mandate is binding here: *anything that does not
   need low latency MUST be written in edge-api* — cost wins by default.
3. **Genuinely unclear?** Default to **edge-api** (cheaper to be wrong there; promotion
   to the hot path is a recorded decision later, not a rewrite — both share the layered
   architecture and the platform contracts).

An endpoint is never split across both paths, and neither path proxies the other
(the event backbone, when it lands, is how the cold path reacts to the hot path).

## Worked examples

| Endpoint | Home | Why |
|---|---|---|
| `GET /v1/products?query=…` (customer search) | core-api | rule 1: customer-facing, high-volume, latency-critical |
| `PATCH /v1/me/profile` (customer profile update) | edge-api | rule 2: customer-facing but latency-tolerant and low-frequency — the mandate's own example |
| `GET /v1/back-office/refunds` (refund review queue) | edge-api | rule 2: internal ops surface; cold starts acceptable |
| `POST /v1/devices/push-token` (token registration) | core-api | rule 1 edge case: fires on every app launch across the fleet — high volume wins over latency tolerance |

## Process

A future feature's `plan.md` MUST contain a line: *"Path: core-api|edge-api — because
<rule # + one sentence>."* An endpoint placed against this rule without a recorded,
justified exception is a Constitution Check failure (Principle III).
