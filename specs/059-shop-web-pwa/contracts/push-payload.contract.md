# Contract — Push message payload and service-worker behaviour

**Producers**: `apis/edge-api/notifications/src/fcm/sender.ts` (+ `worker/copy.ts`)
**Consumer**: `apps/shop-web/src/sw.ts`
**Research**: R3 (data-only), R4 (click routing), R7 (coalescing)

---

## 1. ⚠ The sender branches on `platform`

Today `send()` ignores `platform` and emits one message shape for every token. A browser given that
shape misbehaves silently. This is the branch.

### `platform: "android" | "ios"` — **unchanged**

```ts
{ token, notification: { title, body }, data: dataFor(type, entityId),
  android: { priority: "high" },
  apns: { headers: { "apns-priority": "10" }, payload: { aps: { sound: "default" } } } }
```

The mobile notification tests must pass **unmodified**. That is the proof the branch changed nothing
that already worked.

### `platform: "web"` — **data-only**

```ts
{ token,
  // ⚠ NO `notification` KEY. With one present the Firebase SDK displays the message ITSELF, and our
  // handler displays it too — two banners for one event. Omitting it is also what makes `tag`,
  // `badge`, and the "operator is already looking" check possible at all.
  data: { type, entityId, webPath, title, body, tag, group },
  webpush: { headers: { Urgency: "high", TTL: "600" } } }
```

| Field | Example | Purpose |
|---|---|---|
| `type` | `shop_new_order` | Which copy, which preference, which tag |
| `entityId` | `<fulfillmentId>` | What it is about |
| `webPath` | `/orders/<fulfillmentId>` | ⚠ Where the click goes. **Set by the server** (§3) |
| `title` / `body` | "New order to pick" | Carried in `data` because there is no `notification` block |
| `tag` | `shop-new-order` | The coalescing group (§4) |
| `group` | `orders` \| `attention` | Which counter the badge draws from |

⚠ **All FCM `data` values must be strings.** Numbers silently break the send. A test pins that every
emitted value is a `string`.

**`TTL: 600`** — a new-order notification that arrives eleven minutes late is worse than one that
never arrives: it tells an operator to hurry for something already picked.

---

## 2. Copy carries no PII (FR-013, FR-031)

The existing rule is preserved exactly: **titles and bodies are generic**; the specifics live on the
screen the click opens. FR-013 asks for "how many items and how urgent", which is satisfied by a
count and an age — never a name, address, contact detail, or another shop's data.

```
"New order to pick"        · "1 order · 6 units"
"8 new orders to pick"     · "oldest 12 min ago"          (coalesced — §4)
"3 products out of stock"  · "open the attention queue"
"Refund waiting"           · "1 refund needs approval"
```

⚠ A test asserts no emitted body contains a customer name, address, email or order total. 052 and
053 both had to correct copy that leaked more than intended; this one starts with the assertion.

---

## 3. ⚠ `webPath` is set by the server, beside `deepLink`

`worker/copy.ts` gains `webPath` alongside the existing `effy://` `deepLink`. Both are derived from
one `(type, entityId)`, and **a test pins that they describe the same destination**.

```ts
export function dataFor(type: NotificationType, entityId: string) {
  return { type, entityId,
           deepLink: `effy://${COPY[type].deepLinkPath}/${entityId}`,   // mobile, unchanged
           webPath:  `${COPY[type].webPath}/${entityId}` }              // web, new
}
```

**Two reasons it is not mapped in the service worker:**

1. ⚠ **`fcmOptions.link` does not work in an iOS home-screen PWA** — iOS opens the app and ignores
   the link. Since iPads are this audience's primary device, FCM's own mechanism for "open this URL"
   fails exactly where it matters most. Something must carry the destination in `data` regardless.
2. 029 hit this fork and recorded the answer: *"web routes on `href`, mobile on `target`… so the
   server sets both from one promotion id and a Go test pins that they agree."* Mapping type→route
   inside the SW would put the console's route table in two places, and a route rename would break
   notifications with nothing failing.

| Type | `webPath` | `deepLink` |
|---|---|---|
| `shop_new_order` | `/orders/<id>` | `effy://queue/<id>` |
| `shop_awaiting_pick` | `/orders?tab=new` | `effy://queue` |
| `shop_out_of_stock` | `/catalog/<productId>` | `effy://product/<id>` |
| `shop_low_stock` | `/catalog/<productId>` | `effy://product/<id>` |
| `shop_refund_proposed` | `/orders/<id>` | `effy://order/<id>` |

⚠ A test asserts every `webPath` resolves to a **declared route** in `apps/shop-web/src/routes/`. A
notification that opens a 404 is worse than no notification: the operator learns the feature lies.

---

## 4. Service-worker behaviour

### 4a. `push` — always show something (FR-029)

```
on push:
  parse data (a malformed payload still shows a generic notification — never nothing)
  if a VISIBLE client is already on data.webPath  → show nothing, post a message to refresh  (FR-030)
  else:
    bump the IndexedDB counter for data.group
    showNotification(coalescedTitle, { tag: data.tag, renotify: true, data, icon, badge })
    navigator.setAppBadge(totalCount)                                                        (FR-032)
```

⚠ **The fallback branch is not defensive padding.** iOS **revokes notification permission** from a
service worker that receives a push and shows nothing. A thrown parse error would therefore cost
that device every future notification, permanently, with no error surfaced anywhere. The handler
must show a generic notification rather than throw.

⚠ **`event.waitUntil` must wrap the whole chain.** Without it the SW may be terminated before
`showNotification` resolves — which is the same silent-permission-loss failure by another route.

⚠ **FR-030's check is `visibilityState === "visible"`, not merely "a client exists".** A console
open in a background tab on a tablet locked in a drawer is not an operator looking at it.

### 4b. Coalescing (FR-020, SC-005)

`tag` replaces rather than stacks. A counter in IndexedDB makes the replacement say something true.

| Group | `tag` | Title |
|---|---|---|
| `orders` | `shop-new-order` | 1 → "New order to pick"; N → "N new orders to pick" |
| `attention` | `shop-attention` | 1 → the condition's own copy; N → "N things need attention" |

⚠ **`renotify: true` requires `tag` and silently does nothing without it** — without `renotify` the
replacement is soundless, so the second order through the twentieth would arrive with no alert at
all. Both are asserted.

Counters reset on `notificationclick` and on `notificationclose` for that tag.

### 4c. `notificationclick` (FR-014)

```
on notificationclick:
  close the notification; reset that group's counter; clear/decrement the app badge
  clients.matchAll({ type: "window", includeUncontrolled: true })
    → a console client exists?  client.focus() then postMessage({ navigate: webPath })
    → otherwise                 clients.openWindow(origin + webPath)
```

⚠ **`includeUncontrolled: true` matters.** A window loaded before this service worker took control
is not controlled by it, and without the flag it is invisible to `matchAll` — so the SW would open a
**second** console window next to the one already open, which is exactly what FR-014 forbids.

Navigating an existing client by `postMessage` rather than `client.navigate()` keeps the SPA's
router in charge; `navigate()` is a full document load that discards the Query cache and the
operator's place.

---

## Contract tests

| # | Assertion | Proves |
|---|---|---|
| P1 | A web token emits **no** `notification` key; a mobile token emits one | The branch (R3/R5) |
| P2 | Every `data` value is a `string` | The FCM constraint numbers violate silently |
| P3 | Every `webPath` matches a declared route | No notification opens a 404 |
| P4 | `webPath` and `deepLink` agree for every type | 029's pinning, re-applied |
| P5 | A malformed payload still calls `showNotification` | iOS permission survival (FR-029) |
| P6 | A visible client on the target path → no notification shown | FR-030 |
| P7 | A **background** client on the target path → notification shown | The visibility check is real, not a client check |
| P8 | 20 pushes → one notification, title reads "20", `renotify` and `tag` both set | FR-020, SC-005 |
| P9 | Click with a client open → `focus` + `postMessage`, `openWindow` **not** called | FR-014 |
| P10 | Click with no client → `openWindow` called once | The other half |
| P11 | No emitted body contains customer PII | FR-013, FR-031 |
| P12 | **The mobile notification suites pass unmodified** | The branch broke nothing |
