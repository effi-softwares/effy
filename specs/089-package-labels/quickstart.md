# Quickstart: Package Labels (089)

## Automated

| # | Proves | Where |
|---|---|---|
| P1 | Every new package gets a code at payment; codes are unique, 6 chars, alphabet-only; the backfill covers old rows | `shared/src/payments/finalize` container test + migration container test |
| P2 | `packageToken` / `parsePackageToken`; the alphabet matches the migration's CHECK | `packages/shared-types` tests |
| P3 | Code 128 B encoding: start/stop, checksum, known vectors | `apps/shop-web/.../labels/code128.test.ts` |
| P4 | The label shows code, QR, barcode, "package n of m", EFFY/COURIER, suburb, cold mark — and never the shop name, customer name, street or a price, on all three layouts | `apps/shop-web/.../labels/labels.test.ts` |
| P5 | Shop detail carries `label` with the right position/count across shops; never a window | `shop` container test; `check-shop-delivery-words.sh` |
| P6 | Back-office package carries `packageCode` | `orders` test |
| P7 | Driver stop/drop/run reads carry codes; an old-shape fixture still decodes in the app | `driver` container test; driver-mobile host test |

## Walk (operator, dev)

1. Place and pay an order filled by two shops.
2. Shop console → the order → **Print labels** → choose 62 mm: one label, code in large type, QR and
   barcode, `EF-… · package 1 of 2`, **EFFY**, suburb; no shop or customer name, no price.
3. Scan the QR with any phone camera app: it reads `EFY1:<code>`.
4. Reprint on A4: the same code. Back-office order shows the same code beside the package.
