# Contract — Notification preferences

**Path**: cold path, `apis/edge-api/shop`, behind the **shop** authorizer.
**Storage**: `device_token.muted_types text[]` — see [data-model.md §1b](../data-model.md).
**Research**: R9 (why per-registration, why opt-out)

Preferences are a property of a **registration** — this browser, on this device — not of a person.
FR-025 requires a manager's tablet and a picker's tablet to be independently controllable, and an
operator-level preference makes that unrepresentable.

---

## Routes

### `GET /shop/v1/notification-preferences?token=<fcmToken>`

Reads the state of **one registration**, so the settings screen can render what this device is
actually set to rather than what it last sent.

```jsonc
{
  "registered": true,
  "platform": "web",
  "mutedTypes": ["shop_low_stock"],
  "availableTypes": [
    { "type": "shop_new_order",       "label": "New orders",          "group": "orders" },
    { "type": "shop_awaiting_pick",   "label": "Orders awaiting pick","group": "attention" },
    { "type": "shop_out_of_stock",    "label": "Out of stock",        "group": "attention" },
    { "type": "shop_low_stock",       "label": "Below reorder point", "group": "attention" },
    { "type": "shop_refund_proposed", "label": "Refunds to approve",  "group": "attention",
      "requiresRole": "shop_manager" }
  ]
}
```

- `registered: false` when the token is unknown — the console renders "not enabled on this device"
  rather than an error.
- ⚠ **`availableTypes` is served, not hardcoded in the console.** The labels are notification copy,
  and copy already lives in one catalogue (`worker/copy.ts`). A console-local list is a second source
  for the wording, which is the shape 058's FR-006 exists to prevent.
- ⚠ **`requiresRole` is a rendering hint, never the gate.** The evaluator filters
  `shop_refund_proposed` by the platform record at enqueue time regardless (attention-occurrence
  contract, A5). A `shop_staff` operator who forges this response receives nothing.

### `PATCH /shop/v1/notification-preferences`

```jsonc
{ "fcmToken": "<token>", "mutedTypes": ["shop_low_stock", "shop_out_of_stock"] }
```

| Status | When |
|---|---|
| `204` | Updated |
| `400` | Unknown type in `mutedTypes`; missing `fcmToken` |
| `404` | The token is not registered to this caller — ⚠ **the same response as "no such token"**, so the route is not an oracle for which tokens exist |

**Replaces wholesale.** `[]` means "everything on" and is a valid, meaningful value — not an
absence. This is the inverse of 056's `COALESCE($n, col)` defect, where a field could never be
cleared; here the requirement is that clearing works and that *omitting the whole call* changes
nothing.

---

## Why `muted_types` and not `enabled_types`

**Opt-out.** A type added by a later slice is **on** by default.

An operator who enabled notifications did so to be told things. A new alert that is silently off is
undiscoverable — nothing in the UI says "there is a thing you are not being told about". A new alert
that is unexpectedly on is one tap to silence. The recoverable failure is the right default.

---

## Interaction with the browser permission (FR-026)

Three states, and the console must distinguish all three — collapsing them is how an operator
concludes the feature is broken.

| Browser permission | Registration | What the console shows |
|---|---|---|
| `default` | none | The priming explanation + an **Enable** button (R11) |
| `granted` | present | The per-type toggles |
| `granted` | absent | "Enable on this device" — permission survived a cleared registration |
| `denied` | any | ⚠ A plain statement that notifications are **blocked in the browser**, with no toggle. |

⚠ **The `denied` row is a requirement, not a nicety.** A denied permission is **not recoverable
in-app on any browser** — it can only be changed in browser settings the operator will not find on
their own. Rendering a toggle that silently does nothing teaches them the console is broken; saying
so plainly is the only honest option, and it is the only path back.

⚠ **Permission is never requested on load** (FR-023, R11). There is exactly one prompt per browser
per lifetime, and spending it before the operator knows what they are agreeing to is how a console
loses the ability to notify permanently.

---

## Sign-out (FR-027)

On sign-out the console `DELETE`s its registration **before** clearing the Cognito session — the
call needs the token it is about to lose. If the delete fails, sign-out proceeds anyway and the row
is cleaned up by the worker's existing dead-token pruning on the next send.

⚠ **The browser permission is deliberately not revoked.** It cannot be revoked programmatically, and
the next operator signing in on that tablet should not have to re-prompt — spending the one prompt
again on a shared shop device is exactly what R11 warns against.

⚠ **The persisted Query cache is cleared on sign-out too.** It holds one shop's operational data, and
a shared tablet is an explicit edge case in the spec.

---

## Contract tests

| # | Assertion | Proves |
|---|---|---|
| N1 | `GET` for an unregistered token → `registered: false`, not an error | The settings screen renders |
| N2 | `PATCH` with an unknown type → 400 naming it | The set is closed |
| N3 | `PATCH` another subject's token → `404`, identical to an unknown token | Ownership, and no oracle |
| N4 | `PATCH` `[]` → all types on | Empty is a value |
| N5 | Two registrations, one operator; muting one leaves the other untouched | FR-025 |
| N6 | A muted type is not enqueued for that registration | The preference is honoured where it matters |
| N7 | `denied` permission renders no toggle | FR-026 |
| N8 | Sign-out issues the DELETE **before** the session clears | FR-027, and that the ordering is deliberate |
| N9 | Sign-out clears the persisted Query cache | The shared-tablet edge case |
| N10 | `availableTypes` labels match `worker/copy.ts` | One source for copy (Principle II) |
