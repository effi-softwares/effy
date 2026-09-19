# Contract — Device registration, revision 2 (web)

**Supersedes**: [050's device-registration contract](../../050-observability-push-foundation/contracts/device-registration.contract.md)
by **widening**, not replacing. ⚠ Every existing mobile client keeps working byte-for-byte; the
mobile test suites must pass **unmodified**, which is the proof.

**Path**: cold path, `apis/edge-api/shop`, behind the **shop** authorizer.
**Routes**: unchanged — `POST /shop/v1/devices`, `DELETE /shop/v1/devices/{token}`.
**Shared implementation**: `apis/edge-api/shared/src/lib/devices.ts` (Principle II — one shape,
three mountings).

---

## What changes

| | Before | After |
|---|---|---|
| `platform` | `"android" \| "ios"` | `"android" \| "ios" \| "web"` |
| `appVersion` | optional string | unchanged |
| `mutedTypes` | — | optional `string[]`, **only accepted on `platform: "web"`** |

Nothing else. No new route, no new authorizer, no change to ownership.

---

## `POST /shop/v1/devices`

### Request

```jsonc
{
  "fcmToken": "<opaque FCM registration token>",   // required
  "platform": "web",                                // required
  "appVersion": "059.1",                            // optional
  "mutedTypes": ["shop_low_stock"]                  // optional; web only
}
```

⚠ **The owner is never a body field.** `subject_sub` is taken from the verified JWT `sub`. This is
the existing contract's rule and it is restated because a web client is the first one where a
plausible-looking `sub` in the body would be easy to add and impossible to trust.

### Behaviour

- **Upsert on `fcm_token`** (the column is `UNIQUE`). A browser re-subscribing after clearing site
  data, or a tablet handed to another operator, re-points **one** row rather than accumulating.
- `last_seen_at` is bumped on every call; the console calls this on sign-in and on token refresh.
- `mutedTypes` is **replaced wholesale** when present, and **left untouched when absent** — so the
  registration refresh the console makes on every launch cannot silently reset a preference the
  operator set. ⚠ This is 056's `COALESCE($n, col)` lesson inverted: there the bug was that a field
  could never be *cleared*; here the requirement is that an omitted field is not *overwritten*. The
  distinction is the **presence of the key**, not the emptiness of the value.

### Responses

| Status | When |
|---|---|
| `204` | Registered or refreshed |
| `400` | Missing/blank `fcmToken`; `platform` not in the closed set; `mutedTypes` present on a non-web platform; `mutedTypes` containing a value that is not a known notification type |
| `401` | No/invalid shop token (gateway authorizer) |

⚠ **`mutedTypes` on `android`/`ios` is a 400, not an ignore.** The mobile apps have no preference
UI; accepting and discarding the field would make a future mobile preferences slice believe it was
already wired. Refusing names the situation.

---

## `DELETE /shop/v1/devices/{token}`

Unchanged. Deletes only if the row's `subject_sub` matches the caller's. Returns `204` whether or not
a row existed — ⚠ **deliberately not a 404**, which would turn the route into an oracle for whether a
given token string is registered on the platform.

**The console calls this on sign-out** (FR-027), before Cognito clears the session — the call needs
the token it is about to lose.

---

## Isolation (Principle IV)

- Behind the shop authorizer; a customer or driver token is rejected at the gateway.
- `audience` is set by the handler to `'shop'`, never read from the body.
- A shop operator can only ever delete their own token, because the `WHERE` clause carries their
  verified `sub`.

---

## Contract tests

| # | Assertion | Proves |
|---|---|---|
| C1 | `platform: "web"` registers and reads back | The widening reached the validator |
| C2 | `platform: "windows"` → 400 naming the field | The set is still closed |
| C3 | `mutedTypes` on `platform: "ios"` → 400 | The web-only restriction is real |
| C4 | Re-POST the same `fcmToken` **without** `mutedTypes` → preferences preserved | The omitted-key rule (the defect this contract exists to prevent) |
| C5 | Re-POST **with** `mutedTypes: []` → preferences cleared | Empty is a value, not an absence |
| C6 | Two operators, same browser sequentially → one row, re-pointed | `UNIQUE(fcm_token)` behaves on web as on mobile |
| C7 | DELETE another subject's token → `204`, row untouched | Ownership, and no oracle |
| C8 | **The mobile suites pass unmodified** | The widening changed nothing that already worked |
