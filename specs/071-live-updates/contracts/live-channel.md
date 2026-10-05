# Contract: the live channel

Three interfaces: what a client reads to find its channel, what it does on the socket, and what a
backend service calls to announce a change.

## 1. The live descriptor — `GET /{audience}/v1/live`

One route in each audience's own service, behind that audience's existing authorizer:

| Route | Service | Scope returned |
|---|---|---|
| `GET /shop/v1/live` | `shop` | the caller's active staff record's shop |
| `GET /customer/v1/live` | `customer` | the caller's token subject |
| `GET /driver/v1/live` | `driver` | the caller's active driver record |
| `GET /admin/v1/live` | `admin` | operations |

Response `200`:

```json
{
  "httpHost": "<api>.appsync-api.<region>.amazonaws.com",
  "realtimeHost": "<api>.appsync-realtime-api.<region>.amazonaws.com",
  "channelPrefix": "/shop/7f3c…",
  "epochSeconds": 600,
  "serverTime": "2026-10-05T03:12:44Z"
}
```

- `channelPrefix` is opaque to the client; it appends `/{epoch}` and nothing else.
- A person with no active record receives the service's usual refusal, and therefore has no channel.
- Read on sign-in and after a reconnect. Never on a timer.
- The wire shape is added to `@effy/shared-types` and to the Kotlin contract fixtures, like every
  other shape.

## 2. The socket

Endpoint `wss://{realtimeHost}/event/realtime`, subprotocols `aws-appsync-event-ws` and
`header-{base64url({"host": httpHost, "Authorization": token})}`. `token` is the same token the app
sends to the REST gateway.

| Step | Client sends | Expects |
|---|---|---|
| Open | `{"type":"connection_init"}` | `connection_ack` with `connectionTimeoutMs` |
| Subscribe | `{"type":"subscribe","id":…,"channel":"{prefix}/{epoch}","authorization":{"Authorization":token}}` | `subscribe_success` → **read once** |
| Update | — | `{"type":"data","id":…,"event":["{\"k\":\"orders\"}"]}` → coalesced re-read |
| Keep-alive | — | `{"type":"ka"}` about every 60 s; none within the timeout → close and reconnect |
| Roll | subscribe to `epoch+1` 60 s early; `unsubscribe` the old id 60 s after | `subscribe_success` |
| Refused | — | `subscribe_error` → state `off`, no retry until the next sign-in or foreground |

Client rules:
- `epoch = floor((serverTime + elapsed) / epochSeconds)`.
- Reconnect with jittered exponential backoff, 1 s → 60 s.
- A token that has expired is refreshed through the app's existing session before reconnecting.
- A client never sends `publish`.
- An unknown `k` is ignored. A `data` frame that is not valid JSON is ignored.

### The update

```json
{"k":"orders"}
```

| `k` | Means | Sent to |
|---|---|---|
| `orders` | an order, portion or its progress changed | shop, customer, ops |
| `stock` | a product ran out or crossed its low level | shop |
| `attention` | the attention list changed | shop |
| `work` | assigned work changed | driver |
| `dispatch` | assignment, collection, check-in, delivery or duty changed | ops |
| `slots` | delivery-slot load changed | ops |
| `review` | the product review queue changed | ops |

The list is closed and lives once, in `@effy/shared-types`; the Kotlin enum is generated from it.
⚠ No field other than `k` may ever be added without revisiting FR-002 and FR-024.

## 3. Authorization — the `live` service's authorizer

| Operation | Allowed when |
|---|---|
| `EVENT_CONNECT` | the token verifies against one of the four pools (issuer pinned, not expired) |
| `EVENT_SUBSCRIBE` | namespace = the token's audience **and** scope segment = the platform record's scope **and** epoch ∈ {current, next} **and** the channel has exactly three segments and no `*` |
| `EVENT_PUBLISH` | never |

Scope per audience: shop → active staff record's shop id; driver → active driver record's id;
admin → an active back-office account (`all`); customer → the token's `sub`, no database read.
Anything else — a missing or inactive record, a database error, an exception — is a refusal.
Result cached 300 s. The function logs the operation, audience and outcome; never the token, never
the channel's scope id.

## 4. Announcing — `@effy/edge-shared/live`

```ts
type LiveChange =
  | { scope: "shop"; shopId: string; kind: "orders" | "stock" | "attention" }
  | { scope: "customer"; sub: string; kind: "orders" }
  | { scope: "driver"; driverId: string; kind: "work" }
  | { scope: "ops"; kind: "orders" | "dispatch" | "slots" | "review" };

function announce(changes: readonly LiveChange[]): Promise<void>;
```

- Called by a service **after** its transaction has committed. Never inside one.
- Resolves always; never rejects. A failure is logged and counted, and the caller's result is
  unaffected.
- Publishes with the function's own role (IAM). The publishing permission and the two parameters it
  reads (`/effy/<env>/live/http-host`, `/effy/<env>/live/api-arn`) come from Terraform.
- With the parameters absent (a local run, a test) it does nothing and says so once at debug level.
