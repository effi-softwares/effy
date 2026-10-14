# Contract: picture fields on the shopper wire

**Feature**: 086 · R7–R9 in [research.md](../research.md) · fields in [data-model.md](../data-model.md)

## Fields

Every shopper DTO with `imageUrl` keeps it and gains, additively:

```ts
/** Widths (px) of the smaller copies that exist, ascending. Absent or [] → only `imageUrl`. */
imageWidths?: number[]
```

The customer order list keeps `thumbnails?: (string | null)[]` and gains
`thumbnailWidths?: number[][]`, index-aligned with it. The order item (the receipt's line) gains
`imageWidths` like any other.

- `imageUrl` is now the **public, permanent address** of the original (contracts/public-media.md).
  Same field, same type: an installed app or an old web build keeps working (FR-007).
- The server never sends a rendition's address. Clients derive it with `renditionUrl`.

## `renditionUrl(imageUrl, width)` — the one naming rule

In `@effy/shared-types` `media.ts`, pinned by `media.fixtures.json`; a Kotlin twin (when the app adopts
sizes) reads the same fixtures.

```text
renditionUrl("https://media.dev.effyshopping.com/products/o1/t1.jpg", 320)
  = "https://media.dev.effyshopping.com/renditions/products/o1/t1/w320.webp"
```

Rule: take everything after the origin as the key; remove its last extension; return
`<origin>/renditions/<key without extension>/w<width>.webp`. Throws on a width that is not an integer
from 1 to `MAX_RENDITION_WIDTH` (1280). `RENDITION_WIDTHS` (`[160, 320, 640, 1280]`) are the standard
steps; a picture's own width (≤ 1280) is also a valid copy (FR-013).

`srcSet(imageUrl, widths)` → `"<url> 160w, <url> 320w, …"` for the widths given, in the same module.

Fixture cases include: a `.jpeg`/`.png`/`.webp` original, a promotion key, a key with an encoded
character, an own-width copy (`w1000`), and widths 0, 1281 and 12.5 (throw).

## Web rendering (`CatalogImage`)

```html
<picture>
  <!-- only when imageWidths is non-empty -->
  <source type="image/webp" srcset="{srcSet(imageUrl, imageWidths)}" sizes="{sizes}">
  <img src="{imageUrl}" alt="{alt}" sizes="{sizes}" loading="{lazy|eager}" decoding="async"
       fetchpriority="{high|auto}" class="{caller's}">
</picture>
```

- A browser with WebP picks the smallest listed width that covers `sizes` × device pixel ratio.
- A browser without WebP, or a picture with no copies yet, loads the original.
- `fill` call sites keep their absolute-positioned, `object-cover` classes on the `<img>`; the
  `<picture>` is `display: contents`.

## Mobile

No change required in this feature (spec FR-008 is scoped to the website). The app gets the stable
`imageUrl`; `ignoreUnknownKeys = true` ignores `imageWidths` until the app adopts it (research R10).
