# Label contract - 096 (US10, R9–R11)

The design reference is [label-redesign.md](../label-redesign.md) and [label-mockup.html](../label-mockup.html).

## Input

```ts
interface LabelDocument {
  common: ShopLabelCommonDTO          // service, recipient, address, order number, packed date
  parcel: { code: string; seq: number; of: number; zone: ParcelZone }
}
type LabelLayout = "a6" | "a4x4" | "roll62"
type PrinterDpi = 203 | 300
renderLabelSvg(doc: LabelDocument, layout: LabelLayout, dpi: PrinterDpi): string   // pure, deterministic
```

## Geometry (dots are computed from mm at the chosen dpi; text in pt)

| Layout | Label | Padding | Barcode module | Bar height | QR | Text floor |
|---|---|---|---|---|---|---|
| `a6` | 101.6 × 152.4 mm (4×6). A6 105 × 148 mm stock fits the same layout | 4 mm | 4 dots @203 / 6 @300 | 22 mm | 24 mm | name 9 pt, address 8 pt |
| `a4x4` | four `a6` labels on 105 × 148.5 mm quarters of A4 | 4 mm | as `a6` | 22 mm | 24 mm | as `a6` |
| `roll62` | 62 × 100 mm | 2.5 mm | 2 dots @203 / 3 @300 | 13 mm | 15 mm | 5.5 pt |

## Blocks, in order (never reordered, never omitted)

1. **Header**: the Effy wordmark (black), and `EFFY DELIVERY` or `COURIER` reversed.
2. **Deliver to**: the caption, then:
   - the name: fitted, ≤ 2 lines;
   - the street: fitted, ≤ 2 lines;
   - `SUBURB STATE` on the left and the **postcode** on the right, the largest text in the block.
3. **Zone band**: full width.
   - `FROZEN` and `CHILLED` are reversed, with their storage line: "Keep frozen · −18 °C or colder" and
     "Keep chilled · 5 °C or colder".
   - `AMBIENT` is outlined, with "Store in a cool, dry place".
4. **Bag**: `n OF N` (the largest type on the label), with `ORDER <number>` and `PACKED <d Mon yyyy>` on the
   right.
5. **Barcode**: Code 128 B of `EFY1:<code>`, with 10-module quiet zones and the human-readable value beneath.
6. **Code**: a QR (error correction M) of the same token, the code grouped `XXX XXX`, and "Scan, or type this
   code".
7. **Footer**: "Questions? hello@effyshopping.com".

## Rules (each is tested)

- **Fixed blocks**: zone, bag and barcode never change size. Only the name and the street use `fitText`
  (R10).
- **Fitting**: fitted text never extends past the content box. Width comes from the pinned Helvetica
  metrics. The second line ends in an ellipsis when even the floor does not fit.
- **Colour and size**: SVG fills and strokes are `#000` or `#fff` only. The SVG width and height are the
  label's exact mm, and the viewBox is in dots.
- **Never on a label** (a test scans the SVG text): the shop's name, a price or currency, a phone, an email
  other than `hello@`, any window, day or estimate (`check-shop-delivery-words.sh` covers the module).
- **Pages**: a browser print makes exactly one page per label (`a6` and `roll62`) or one page per four labels
  (`a4x4`). There is no trailing break.
- **ZPL**: `toZpl(svg, dpi)` makes `^XA ^PW<w> ^LL<h> ^FO0,0 ^GFA,…:Z64:… ^XZ` from a 1-bit raster of the same
  SVG.

## Retired

- The A4 21-up layout (`a4sheet`).
- `ShopPackageLabelDTO`.
- "package n of m", which counted shops.

## Revision 2026-10-22 (operator, after the first print)

- The header carries the Effy mark only. Neither "EFFY DELIVERY" nor "COURIER" is printed on any bag.
- Smaller type throughout: zone word 13 pt, bag number 22 pt ("OF" 9 pt), code 16 pt, postcode 22 pt; the header
  and zone bands are 8 mm.
- The code beside the QR is printed as one word (`HACQZ2`), not grouped.
- The browser print page is fixed at the label's size, so a label can no longer spill its footer onto a second page.
- Deliver to shows the FULL shipping address - address line 1 and line 2 each on their own line, suburb and state
  beside the postcode, then the country - and the recipient's phone ("Ph …"). Never the billing address: when it
  differs from shipping, the label shows shipping only. The shop already received the phone with the order.
