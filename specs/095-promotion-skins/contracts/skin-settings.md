# Contract: `SkinSettings` (095)

Declared once in `packages/shared-types/src/promotion-skins.ts`; mirrored in Kotlin (`PromoSkinWire.kt`). Every value
is closed or bounded. Unknown keys are refused by `validateSkin`. Colours are `#rrggbb` (lowercase on save).

```ts
type Colour = `#${string}`;
type TextSize = "xs" | "sm" | "md" | "lg" | "xl" | "2xl";      // fixed scale; xl/2xl count as large text
type Weight = "regular" | "medium" | "semibold" | "bold";
type Align = "start" | "center" | "end";
type Spacing = "compact" | "regular" | "roomy";
type Radius = "none" | "sm" | "md" | "lg" | "xl";                // the platform scale

interface TextStyle { colour: Colour; size: TextSize; weight: Weight; lines: 1 | 2 | 3 }

interface Common {
  background: { colour: Colour; picture: "none" | "show"; tint?: { colour: Colour; strength: number /* 0–0.9 */ } };
  label: { show: boolean; words: "kind" | string /* ≤ 16 chars */; colour: Colour; size: "xs" | "sm"; tracking: "normal" | "wide" };
  headline: TextStyle;
  supporting: TextStyle & { show: boolean };
  align: Align;
  button: {
    style: "filled" | "outline" | "link" | "none";
    fill: Colour; text: Colour;
    words: "auto" | string /* ≤ 24 chars; "auto" = "Copy code" with a code, "View offer" without */;
    icon: boolean;
  };
  chip: { show: boolean; style: "dashed" | "solid" | "filled"; fill: Colour; text: Colour };
  decorations: { show: boolean; set: "food" | "produce" | "bakery" | "seasonal-winter" | "seasonal-summer" | "celebration"; colour: Colour; strength: number /* 0–1 */ };
  shape: { radius: Radius; spacing: Spacing; outline: Colour | null };
  dark?: Partial<Pick<Common, "background" | "label" | "headline" | "supporting" | "button" | "chip" | "decorations">> // app only
}

type SkinSettings =
  | ({ layout: "panel" } & Common)
  | ({ layout: "header_card" } & Common & { body: { colour: Colour; tagColour: Colour } })
  | ({ layout: "full_picture" } & Common & { textCorner: "top-start" | "bottom-start" | "center" | "bottom-end" })
  | ({ layout: "picture_beside" } & Common & { pictureSide: "start" | "end"; pictureFit: "cover" | "contain" })
  | ({ layout: "tile" } & Common)            // supporting.show is forced false
  | ({ layout: "strip" } & Common);          // headline.lines forced 1, supporting.show false
```

## Functions (pure, shared-types)

- `validateSkin(settings) → FieldIssue[]` - shape, bounds, colour format, layout-forced values.
- `skinContrast(settings) → { pair, ratio, required, ok }[]` - research R2; pairs over a picture use the tint blended
  over black and over white.
- `LAYOUT_FITS`, `LAYOUT_RATIO`, `LAYOUT_SHOWS_PICTURE` - data-model "Layout facts".
- `skinGeometry(layout, size)` - px/dp for text sizes, paddings, radius, line limits; the fixture source for both
  renderers.
- `buttonWords(settings, promotion)` - resolves `"auto"`.

## Fixtures

`promotion-skins.fixtures.json`: per layout × size, input settings + promotion (with/without code, long/short
headline) → expected `skinGeometry`, `buttonWords`, `skinContrast`. Read by a vitest (shared-types) and a Kotlin host
test (customer app).
