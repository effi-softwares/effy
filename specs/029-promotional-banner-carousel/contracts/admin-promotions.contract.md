# Contract: Admin Promotions — placement & artwork verification

**Feature**: 029-promotional-banner-carousel | **Path**: cold (`edge-api/admin`) | **Auth**: admin pool

Extends the existing `POST /admin/v1/promotions` and `PATCH /admin/v1/promotions/{id}`. **No new
route** — 028's `banner-image/presign` is unchanged.

---

## Authorization — unchanged

Read: any active back-office staff (incl. `csa`). Mutate: `admin` or `manager`, decided from the
`admin.staff` record. **No new permission** — choosing where a promotion appears is an ordinary
promotion edit.

## Added field

| Field | Type | Rules |
|---|---|---|
| `bannerPlacement` | `"carousel" \| "inline"` | Defaults to `"carousel"`. Rejected with a field-level message if it is any other value. |

⚠ **Presentation metadata, like 028's advertising facet.** It does not participate in what a promotion
is worth, so it is editable on a **redeemed** code and MUST NOT be routed through the FR-068
value-immutability transaction. An operator must be able to move a live promotion from the carousel to
inline without that being a rewrite of history.

## Artwork verification on save

When `bannerImageKey` is set or changed:

1. Ranged GET of the object's first 64 KB.
2. Parse the PNG/JPEG/WebP header for width and height.
3. Refuse with `promo_banner_image_invalid` and a field-level message if the dimensions are not
   **1200 × 600**.

⚠ **This is the only real guarantee.** Artwork reaches S3 through a presigned PUT that Lambda never
observes, so the console's normalisation is a convenience and this is the enforcement. Proving it
requires bypassing the console — see the quickstart.

⚠ **Refuse, never resize.** FR-008 forbids silently changing what an operator uploaded.

## Response

`PromoCodeDTO` gains `bannerPlacement`. `redemptionCount` continues to be **counted from
`promo_redemption` on every read, never stored** — restated because the banner's automatic
disappearance on exhaustion depends on that count being the truth.

## Back-office

- A **placement** control (offers carousel · between sections), defaulting to the carousel, disabled
  while the promotion is not advertised.
- A **download-template** action producing the generated 1200 × 600 SVG with the text zone marked.
- A **preview** showing the banner as a shopper sees it — artwork, gradient scrim, and the live text
  over it — including at a narrow width.
- Copy stating that **the lower-left carries the message**, so an operator leaves it quiet instead of
  placing their own headline there and finding it double-printed (FR-031b).

## Verification

| Check | How |
|---|---|
| Invalid placement refused | Vitest (service) |
| Placement editable on a redeemed code | Vitest — and the existing 027 FR-068 tests must stay green **unmodified** |
| Non-conformant artwork refused on save | Vitest + a direct PUT bypassing the console |
| An audit row is written | Vitest — placement changes ride 027's existing `admin.audit_log` path |
| The loop reaches a device | Live — quickstart §4 |
