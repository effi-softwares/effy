# Data Model: Catalogue Pictures That Load Once

**Feature**: 086-catalogue-image-delivery · [plan.md](plan.md) · [research.md](research.md)

## Stored

### `public.media_rendition` (new)

One row per original picture whose smaller sizes the worker has attempted. **One writer**: the
`media` worker (`render` and, through it, the backfill).

| Column | Type | Rule |
|---|---|---|
| `storage_key` | `text` PK | The original's key. Must start with `products/` or `promotions/` (CHECK). |
| `status` | `text` NOT NULL | `ready` \| `failed` (CHECK). |
| `widths` | `int[]` NOT NULL DEFAULT `'{}'` | Widths made, ascending, each 1–1280 and ≤ `source_width`: the steps 160/320/640/1280 below the source, plus the source width when ≤ 1280. Empty when `failed`, or for an animated original (`ready`, original served). |
| `format` | `text` NOT NULL DEFAULT `'webp'` | CHECK `format IN ('webp')` — widened by a later migration if AVIF is added. |
| `source_width` | `int` NULL | The original's pixel width after EXIF orientation. NULL when it could not be read. |
| `source_height` | `int` NULL | As above. |
| `failure` | `text` NULL | `unsupported` \| `corrupt` \| `too_large`. NOT NULL exactly when `status = 'failed'` (CHECK). |
| `rendered_at` | `timestamptz` NOT NULL DEFAULT `now()` | Last attempt. |

- **No foreign key** to `product_media` or `promotion`: the worker can see a picture before its owner
  registers it, and a picture's row outlives nothing it needs.
- **Upsert** on `storage_key`: re-rendering (backfill, a retried message) replaces the row.
- **Readers** join `… LEFT JOIN public.media_rendition mr ON mr.storage_key = <key> AND mr.status = 'ready'`
  and select `mr.widths` (NULL → empty). No reader writes.
- **Migration**: `db/migrations/<timestamp>_media_rendition.sql`, forward-only. The connection-limited
  `effy_shopper` role (storefront, commerce) can already read it: the shopper-role migration set
  default privileges on new `public` tables, so no grant is added.

### Objects in the bucket

| Prefix | Who writes | Public (CDN) | Notes |
|---|---|---|---|
| `products/` | shop (presigned PUT) | yes | originals; triggers the worker |
| `promotions/` | admin (presigned PUT) | yes | originals; triggers the worker |
| `renditions/` | `media` worker | yes | `renditions/<original key without extension>/w<width>.webp`; never triggers |
| `proof/` | driver | **no** | lifecycle → Glacier IR at 90 days (unchanged) |
| `courier-label/` | shop, orders | **no** | |
| anything else | — | **no** | private by default |

## Not stored

- **The public address** is computed at read time: `<MEDIA_PUBLIC_BASE_URL>/<storage_key>`. Changing the
  host is a configuration change.
- **A rendition's address** is computed by clients from the original address and a width
  (`renditionUrl`, [contracts/wire.md](contracts/wire.md)).

## Wire additions (all additive)

| DTO (`@effy/shared-types`) | Existing field | New field |
|---|---|---|
| `StorefrontProductCardDTO` | `imageUrl` | `imageWidths?: number[]` |
| gallery `MediaDTO` | `imageUrl` | `imageWidths?: number[]` |
| storefront category DTO | `imageUrl` | `imageWidths?: number[]` |
| `BannerDTO` | `imageUrl` | `imageWidths?: number[]` |
| cart line (`cart.ts`) | `imageUrl` | `imageWidths?: number[]` |
| saved item (`saved-item.ts`) | `imageUrl` | `imageWidths?: number[]` |
| customer order list (`order.ts`) | `thumbnails` | `thumbnailWidths?: number[][]` (index-aligned) |
| customer order item / receipt line (`order.ts`) | `imageUrl` | `imageWidths?: number[]` |

`imageUrl` keeps its type and meaning ("a picture this client can show"); only its host changes.
Operator DTOs (`shop-order.ts`, `shop-order-console.ts`, `catalog.ts`) are unchanged.

## State

A picture has no lifecycle beyond its row:

```text
(uploaded) ──render ok──▶ ready (widths)
     │
     └──render cannot──▶ failed (failure)  ──backfill retryFailed──▶ ready | failed
```

A transient fault (S3, database) is not a state: the message returns to the queue and, after three
receives, to the dead-letter queue, which alarms.
