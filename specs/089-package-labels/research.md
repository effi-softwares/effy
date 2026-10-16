# Research: Package Labels (089)

Read from the tree on 2026-10-16.

## Today

- A package is a `shop_fulfillment` row: one per (order, shop), created when the order is paid by
  `finalizeSucceeded` (`apis/edge-api/shared/src/payments/finalize.ts`, `INSERT … ON CONFLICT DO NOTHING`).
- It has no identifier a person or a phone can read; every package of an order shows the order number.
- The shop console already prints one thing: the pick list (`apps/shop-web/src/features/fulfillment/pickList.ts`)
  — a standalone HTML document written into a new window, escaped, with print-only hex colours.
- No barcode or QR library is in the monorepo.
- ⚠ The shop contract (`ShopOrderDetailDTO.deliveredBy`, 079) tells a shop who takes a package away and
  NOTHING else about delivery — no window, day or estimate. `scripts/check-shop-delivery-words.sh` guards it.

## Decisions

### R1 — The code is a column with a database default; existing rows are backfilled

**Decision**: `shop_fulfillment.package_code text NOT NULL UNIQUE`, `DEFAULT public.new_package_code()`,
CHECK on the alphabet and length. The migration backfills every existing row. `new_package_code()` draws
6 characters from the 30-character alphabet `23456789ABCDEFGHJKMNPQRSTVWXYZ` (no 0/O, 1/I/L, U) and
retries while the code exists.

**Rationale**: every writer of `shop_fulfillment` (today: one) gets a code without remembering to; the
spec's "given on first read" (FR-002) is met by a backfill instead — simpler, and no read path ever
writes. 30⁶ ≈ 729 million codes; the retry loop plus the UNIQUE index make a duplicate impossible, and a
concurrent clash (two inserts drawing the same code in the same instant) fails one payment finalisation,
which the provider retries — vanishingly rare at Effy's volume.

**Alternatives**: a sequence encoded in base-30 — rejected: consecutive codes would be guessable and
reveal order volume to anyone holding two labels. Generating in TypeScript at finalisation — rejected: a
second writer would have to repeat it.

### R2 — The token and the alphabet live once, in `@effy/shared-types`

**Decision**: `packages/shared-types/src/package-code.ts`: `PACKAGE_CODE_ALPHABET`, `PACKAGE_TOKEN_PREFIX
= "EFY1:"`, `packageToken(code)`, `parsePackageToken(read) → code | null` (rejects anything not
`EFY1:` + 6 alphabet characters — a product's own barcode is ignored). A test pins the alphabet against
the migration's CHECK. The Kotlin twin arrives with scanning (H5) and is pinned to the same fixture.

### R3 — No window on the label (spec Clarifications)

**Decision**: the label says **EFFY** or **COURIER**, from `deliveredBy`, which the shop already has.
**Rationale**: the locked shop rule; the hub's sort instruction comes from the scan (H7), not the bag.

### R4 — Label data rides the existing shop order detail; no new route

**Decision**: `ShopOrderDetailDTO.label = { packageCode, position, packageCount, suburb, cold }` where
`position` is this package's 1-based place among the order's packages (ordered by `created_at, id`),
`packageCount` the order's total, `suburb` the order address's city, and `cold` = `"frozen" | "chilled" |
null` from the products' `storage` attribute (065's classes; frozen wins).
**Rationale**: the shop already reads the detail before packing; the shared gateway gains no route. A
shop learns only a count of other packages, never another shop.

### R5 — Barcodes are drawn in the browser: `qrcode-generator` for QR, a small Code 128 encoder of our own

**Decision**: add `qrcode-generator` (MIT, no dependencies, ~20 kB) to `apps/shop-web` for the QR
(error correction M); write `code128.ts` (Code Set B — the token is printable ASCII) producing bar
widths, rendered as SVG, unit-tested against known encodings and the checksum rule.
**Rationale**: printing happens in the shop's browser; SVG prints crisp at any DPI on thermal and laser.
A full barcode suite (`bwip-js`, ~1 MB) is far more than two symbologies need. Code 128 B is ~60 lines
and fully specified.
**Alternatives**: render a PDF server-side — rejected: a Lambda and a font pipeline for what a browser
does natively, and an extra route.

### R6 — Three layouts, one renderer (the pick-list pattern)

**Decision**: `labels.ts` renders one label's markup; layouts are page CSS (`@page size`): 62 mm × 100 mm
roll (one label per page), 4×6 in (one per page), A4 sheet (3 × 7 grid of 63.5 × 38.1 mm — the common
21-up sticker sheet). The chosen layout is remembered per browser (`localStorage`, wrapped in try/catch —
a convenience, not state).

### R7 — Codes reach the driver's reads as additive fields

**Decision**: `CollectionPackage.packageCode` (shop stop), `DropPackageRef.packageCode` (drop),
`packageCodes: string[]` on each collection-run stop and each delivery-run drop. Optional on the wire,
ignored by installed builds (`ignoreUnknownKeys`). The app does not use them yet (H4–H11).

### R8 — Where people see the code

Shop console order detail (beside the package header) and back-office order detail
(`AdminOrderPackageDTO.packageCode`). Both read the column.
