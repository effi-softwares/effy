# Contract: Shop live stream (core-api, hot path — recorded exception, research R1)

`GET /v1/shop/live` on `apis/core-api`, behind the existing **shop** `PoolVerifier` (057). The second
shop-pool route on this service; it carries **no shop data**.

## Request

```
GET /v1/shop/live
Authorization: Bearer <shop access token>
Accept: text/event-stream
```

- No query parameters. The shop is resolved from the operator's record (`shop_staff.cognito_sub` →
  `shop_id`), never from the request.
- Gate: token valid for the shop pool AND operator `status='active'` AND assigned shop
  `status='active'`. Otherwise `403` (uniform problem, no body streamed).
- Read with `fetch` + `ReadableStream` (`EventSource` cannot send `Authorization` — research R3).

## Response

`200`, `Content-Type: text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`.

```
retry: 3000

event: resync
data: {}

: hb

event: poke
id: 42
data: {}

: hb
```

| Line | Meaning | Client does |
|---|---|---|
| `event: resync` | Sent first on every connect, and to every stream when the server's Postgres listener reconnects | Refetch `GET /shop/v1/today` now |
| `event: poke` | Something in this shop's operational state committed | Refetch `GET /shop/v1/today`, debounced 400 ms |
| `: hb` | Heartbeat comment, every 20 s | Nothing (resets its own stall timer: no bytes for 45 s ⇒ reconnect) |
| `id:` | A per-process sequence, for logs only | Ignore — the client never resumes from it |

`data` is always `{}`. **Nothing about an order, product or person is ever in the stream.**

## Lifetime and limits

- The server closes the stream after **15 minutes**; the client reconnects immediately (research R3).
- At most **5** concurrent streams per `sub`; a sixth closes the oldest.
- At most one poke per shop per **500 ms** (trailing edge).
- The client reconnects with capped exponential backoff + jitter (1 s → 30 s) on any error or close, and
  closes the stream when the tab has been hidden for 60 s.

## Server internals (for the implementer, not the wire)

- One dedicated pgx connection per process runs `LISTEN shop_ops`; payload = shop id.
- A hub keyed by shop id holds subscriber channels; a poke is non-blocking per subscriber (a slow
  client is dropped, not waited on).
- On listener error: reconnect with capped backoff, then broadcast `resync` to every subscriber.
- Metrics: `shop_live_streams` (gauge), `shop_live_pokes_total`, `shop_live_listener_reconnects_total`
  — no shop label (Principle VII: low cardinality).

## Refusals

| Status | When |
|---|---|
| `401` | Missing/invalid token, or a token from another pool (structural — Principle IV) |
| `403` | Gate refused |
| `503` | Listener not connected at startup (the client falls back to polling; research R2) |
