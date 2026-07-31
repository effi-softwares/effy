# Contract: Admin Promotions (cold path) — advertising facet

**Feature**: 028-mobile-home-merchandising | **Path**: cold (`edge-api/admin`) | **Auth**: admin pool

**Endpoints**: existing `POST /admin/v1/promotions` and `PATCH /admin/v1/promotions/{id}` gain **fields**;
one new route is added for banner artwork —
`POST /admin/v1/promotions/{id}/banner-image/presign`.

---

## Authorization — unchanged

The 027 promotions slice already sets the gate and this feature adopts it without modification:

- **Read** — any active back-office staff member (including `csa`).
- **Mutate** — `admin` or `manager` only, decided from the `admin.staff` record, which is
  authoritative over the `cognito:groups` claim (Principle IV).

**No new permission is introduced.** Marking a promotion advertisable is an ordinary promotion edit —
it changes what shoppers *see*, never what a promotion is *worth*.

---

## Request fields (added to create and update)

| Field | Type | Rules |
|---|---|---|
| `isAdvertised` | `boolean` | Defaults to `false`. |
| `bannerTitle` | `string \| null` | **Required when `isAdvertised` is true.** Trimmed; must be non-empty. |
| `bannerSubtitle` | `string \| null` | Optional. |
| `bannerImageKey` | `string \| null` | S3 storage key. Optional. |
| `bannerPosition` | `integer` | Defaults to `0`. |

### Validation is layered deliberately

1. **The database CHECK** (`promo_code_banner_copy_chk`) makes an advertised promotion without a title
   unrepresentable. This is the guarantee.
2. **The service** validates the same rule first, so the operator gets a **field-level message**
   instead of a 500 from a constraint violation.

Both exist on purpose. The service exists for the message; the constraint exists because a service
check can be bypassed by a second writer, a backfill, or a future route, and a CHECK cannot.

---

## Banner artwork — `POST /admin/v1/promotions/{id}/banner-image/presign`

**Request**: `{ contentType, fileSize }` · **Response**: `{ uploadUrl, storageKey }`

Two steps, matching the pattern `shop` already uses for product media: the operator PUTs the file
**directly to S3** using the presigned url, then saves the returned `storageKey` as `bannerImageKey`
through the ordinary update route. **Bytes never pass through Lambda.**

| Rule | Value | Source |
|---|---|---|
| Allowed content types | `image/jpeg`, `image/png`, `image/webp` | The shared helper's set — not a new list |
| Size ceiling | The shared helper's ceiling | Not a new number |
| Upload url TTL | Short — long enough to upload, short enough not to linger | Shared helper |
| Object key | `promotions/{id}/{random}.{ext}` | Prefix parameterised during the extraction |
| Gate | `admin` / `manager` | Same as every other promotion mutation |

**⚠ The helper is being promoted into `@effy/edge-shared`, not copied.** It lives today in
`apis/edge-api/shop/src/products/media.ts` and is exactly the right implementation; duplicating it into
`admin` is precisely the cross-cutting copy-paste Principle II prohibits. `shop`'s existing media tests
must pass **unmodified** after the extraction — if they need editing, the move changed behaviour.

**Artwork is optional (FR-037b).** Clearing it must leave a valid, still-advertised, text-only promotion.
A banner that cannot lose its image is a banner an operator cannot fix.

---

## ⚠ What this MUST NOT do — FR-068 is not weakened

027 established that **a redeemed code's window, caps and status can change; its value cannot**,
because a paid order's discount was computed from the definition as it stood. That rule is enforced
inside the writing transaction under `FOR UPDATE`, not in the service, because a code can be redeemed
between a check and a write.

The advertising facet is **presentation metadata only** — title, subtitle, artwork, position, and
whether to show it. **None of these fields may be routed through, or reuse, the value-mutation path.**
Adding them must not relax the existing guard, and the existing tests around it must stay green
untouched. If implementing this requires editing that transaction, something has gone wrong.

---

## Audit

Every mutation already writes an `admin.audit_log` row with the actor's `cognito_sub` (027 FR-071).
Advertising changes ride the same path — no new audit mechanism, and "who put that on the storefront"
is answerable by the same query as every other promotion change.

---

## Response

`PromoCodeDTO` gains the same five fields. `redemptionCount` continues to be **COUNTED from
`promo_redemption` on every read, never stored** — unchanged by this feature, and worth restating
because the banner's exhaustion rule depends on that count being the truth.

---

## Back-office UI (`PromotionDetailScreen.tsx`)

- An **"Advertise on storefront"** toggle, off by default.
- Banner title / subtitle / position, revealed when the toggle is on and **disabled when off** — an
  operator should not be able to fill in copy that goes nowhere.
- Copy near the toggle stating plainly that **this makes the promotion public to every shopper.**
  The default is the safety; the sentence is what stops someone reaching past it. The private-goodwill-credit
  case is real, and one careless toggle turns a single customer's credit into a storewide discount.
- Follows the console's existing form patterns — no new component, no card layout.

---

## Verification

| Check | How |
|---|---|
| Advertised without a title is refused | Vitest (service) + a direct SQL insert proving the CHECK fires |
| Non-`admin`/`manager` cannot advertise | Vitest against the existing gate |
| An audit row is written | Vitest |
| FR-068's value-immutability guard still holds | The existing 027 tests, **unmodified**, must stay green |
| The toggle reaches the storefront | Live — quickstart §4 |
