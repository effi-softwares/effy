# Contract: Effy links (116 B7)

## The eight paths (both directions; `web-links.fixtures.json`)

| Destination | Path | Notes |
|---|---|---|
| `home` | `/` | exact |
| `orders` | `/orders` | |
| `order` | `/orders/{orderId}` | id percent-decoded |
| `points` | `/account/points` | |
| `product` | `/product/{productId}` | `aisleKey` is not on the path (110 drops it); the app opens the product |
| `aisle` | `/search?category={aisleKey}` | |
| `search` | `/search` or `/search?q={words}` | words decoded exactly as the website reads them |
| `sale` | `/offers` | |

- **`customerDestinationForWebPath(pathAndQuery: string): CustomerDestination | null`** (shared-types). Unknown query keys
  are ignored. `m` (a message id) is returned beside the destination for analytics:
  `parseWebLink(...) → { destination, messageId }`. A path outside the table → `null`.
- **Round trip**: for every fixture, `customerDestinationForWebPath(customerWebPathFor(d))` equals `d`, except that
  `product.aisleKey` is dropped.
- **Every link Effy writes to a shopper page** is built as `WEB_SITE_URL + customerWebPathFor(destination)`: the receipt
  (`receipts/sender.ts`), the order and points emails (`worker/email-sender.ts`; the points link becomes `/account/points`,
  not `/account?tab=points`), and message emails (`messages/email.ts`).
- **Never claimed**: `/email/…`, `/help…`, `/legal…`, `/delete-account`, `/sign-in`, `/account` (except `/account/points`),
  `/checkout…`, `/cart`.

## `GET /.well-known/assetlinks.json` (customer-web, static)

When `APP_LINK_ANDROID_SHA256` is non-empty, it returns 200 `application/json`:

```json
[{ "relation": ["delegate_permission/common.handle_all_urls"],
   "target": { "namespace": "android_app", "package_name": "com.effyshopping.customer.mobile",
               "sha256_cert_fingerprints": ["AA:BB:…"] } }]
```

Otherwise 404. No redirect and no cookie.

## `GET /.well-known/apple-app-site-association` (customer-web, static)

When `APP_LINK_APPLE_APP_ID` is non-empty, it returns 200 `application/json`:

```json
{ "applinks": { "details": [{ "appIDs": ["TEAMID.bundle.id"], "components": [
  { "/": "/", "comment": "home" }, { "/": "/orders" }, { "/": "/orders/*" }, { "/": "/account/points" },
  { "/": "/product/*" }, { "/": "/search" }, { "/": "/offers" } ] }] } }
```

Otherwise 404.

## Android intent filter (customer app)

`<intent-filter android:autoVerify="true">` with `VIEW`, `DEFAULT`, `BROWSABLE`, scheme `https`, host `${effyLinkHost}`, and:
- `path="/"`;
- `path="/orders"`, `pathPrefix="/orders/"`;
- `path="/account/points"`;
- `pathPrefix="/product/"`;
- `path="/search"`;
- `path="/offers"`.

## Analytics

`app_link_opened { kind, surface: "app" }` (FR-006: page kind only; listed in `docs/telemetry/platform-events.md`).
