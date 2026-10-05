# Data Model: Live Updates Without Polling

**No table, no column, no migration.** Nothing about a live update is stored: not the update, not
the connection, not who is subscribed. The managed service holds connections; an update that is not
delivered is not retried from a record, because the next read corrects the screen.

The entities below are shapes in code and configuration, not rows.

## Live update

| Field | Type | Rule |
|---|---|---|
| `k` | one of `orders`, `stock`, `attention`, `work`, `dispatch`, `slots`, `review` | closed list, declared once in `@effy/shared-types` |

No other field (FR-002). Identity, order, time and content are all absent on purpose.

## Audience scope

| Scope | Identified by | Read from |
|---|---|---|
| shop | shop id | the staff record of the signed-in operator (existing table) |
| customer | token subject | the token itself |
| driver | driver id | the driver record (existing table) |
| ops | — | an active back-office account (existing `admin` schema) |

A scope is resolved twice, by the same rule: once by the audience's service when it answers the
live descriptor, once by the authorizer when the app subscribes. The rule lives in the shared
backend library so the two cannot disagree (Principle III: one implementation).

## Channel

`/{namespace}/{scope id}/{epoch}` — derived, never stored.
`epoch = floor(unix seconds / 600)`.

## Live connection (client state)

| State | Meaning | What the screen shows |
|---|---|---|
| `live` | subscribed to the current epoch | nothing extra |
| `reconnecting` | socket lost or opening | "Reconnecting — last updated HH:MM", manual refresh |
| `off` | refused, signed out, or the device cannot hold a connection | "Live updates off — last updated HH:MM", manual refresh |

Transitions: `off → reconnecting` on sign-in or foreground; `reconnecting → live` on
`subscribe_success` (triggers one read); `live → reconnecting` on close, error or a missed
keep-alive; any `→ off` on `subscribe_error` or sign-out.

Held in the app's existing client store (TanStack Store on web; the app container's `StateFlow` on
mobile). It is genuine client state — nothing from the server is cached in it.

## Existing data read, unchanged

Staff record (shop, status), driver record (status), back-office account (status), order and
portion statuses (for `stageFor`), refund rows (for `customerRefundState`), customer token subject
on the order. All read through existing repositories; none altered.

## Configuration introduced

| Name | Where | Holds |
|---|---|---|
| `/effy/<env>/live/http_host` | SSM, from Terraform | the publish and handshake host |
| `/effy/<env>/live/realtime_host` | SSM, from Terraform | the socket host |
| `/effy/<env>/live/api_arn` | SSM, from Terraform | scopes the publishing permission |

No secret is introduced: publishing is by role, subscribing by the person's own token.
