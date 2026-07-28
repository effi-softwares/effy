# Contract: Storefront Serviceability

**Feature**: 025-customer-ui-refresh | **Path**: hot path (`apis/core-api`) | **Auth**: none (public)

One of the **two** new read capabilities authorised by spec FR-001a.

## Endpoint

```http
GET /v1/storefront/serviceability?postcode=3000
```

**Public and unauthenticated.** It returns nothing an account would gate (FR-001b), and a guest must
be able to ask it before any cart exists — that is the entire point of the capability.

### Request

| Param | Type | Required | Notes |
|---|---|---|---|
| `postcode` | string | yes | Normalised server-side: trimmed, non-digits stripped. Must be exactly 4 digits (AU). |

### Responses

**200** — the question was answerable:

```json
{ "postcode": "3000", "serviced": true }
```

**400** — the input was not a postcode:

```json
{ "error": "invalid_postcode" }
```

**This distinction is load-bearing.** "That isn't a postcode" and "we don't deliver there" are
different answers and the UI says different things. A malformed input MUST NOT return
`serviced: false` — that would tell a shopper Effy refuses to deliver to a place they never
successfully named.

**5xx** — the read failed. The client MUST render "we couldn't check right now" and MUST NOT collapse
this to `serviced: false` (see `data-model.md` §4).

## What the response deliberately does NOT contain

| Withheld | Requirement | Why |
|---|---|---|
| Delivery fee | FR-014a | Depends on cart contents and origin zone. Any figure here is an estimate checkout would revise. |
| Delivery window | FR-014a | Same. |
| Zone id | FR-006 | Internal identifier; no shopper use. |
| Zone name | FR-006 | Dev zone names are geographic (`MEL-METRO`, `VIC-REGIONAL`). Echoing one tells a shopper where Effy fulfils from. Hidden fulfilment is a platform invariant, not a preference. |

A boolean leaks nothing and answers the question the shopper actually asked.

## Consistency guarantee (FR-014b)

The answer MUST be computed by the **same predicate** checkout uses. Both call
`internal/platform/delivery.ZoneForPostcode`, extracted from
`internal/features/checkout/delivery_store.go:36`:

```sql
SELECT zone_id::text FROM public.delivery_zone_postcode WHERE postcode = $1
```

`public.delivery_zone_postcode.postcode` is `UNIQUE`, and the table comment states the rule this
depends on: *"A postcode in no row = no zone = undeliverable."*

**One predicate, two callers.** This is a structural guarantee, not a tested coincidence — the
alternative, two implementations kept in step by tests, drifts the first time one is edited alone.

### Required test (SC-002a)

A parity test asserts that for a serviced postcode, an unserviced postcode, and a postcode absent from
every zone, `storefront.Serviceability` and `checkout.DestinationZone` agree. Disagreement fails the
build.

## Caching

`Cache-Control: public, max-age=300`. Postcode→zone mappings change at the pace of operations
policy, not of shopping, and the response contains nothing shopper-specific.

## Telemetry

- **Metric**: one counter, labelled `serviced` only (two values). **`postcode` MUST NOT be a label** —
  unbounded cardinality would degrade the metrics backend, and it is location data about an
  individual (Principle VII).
- **Product analytics**: the client emits `delivery_location_set` with `serviced: bool` and
  **without the postcode**, for the same reason.
