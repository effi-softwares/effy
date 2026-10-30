# Contract: a product's options and variants (shop + staff write, consoles read)

Source of truth: `packages/shared-types/src/variants.ts`. Used by `POST/PATCH` product routes of the `shop` service
and the `catalog` service's Effy-product routes, and by `@effy/web-kit/product-form`.

## OptionInputDTO

```diff
 export interface OptionInputDTO {
   id: string
   position: WireInt            // 1 | 2
-  kind: OptionKind             // "attribute" | "pack_size"
-  attributeId?: string | null
+  attributeId: string          // a library attribute the product's category offers as an option
-  values: { id: string; allowedValueId?: string | null; position: WireInt }[]
+  values: { id: string; allowedValueId: string; position: WireInt }[]
 }
```

## OptionDTO (read)

```diff
 export interface OptionDTO {
   id: string
   position: WireInt
-  kind: OptionKind
-  attributeId: string | null
+  attributeId: string
-  /** The attribute's name, or "Pack size". */
+  /** The attribute's name. */
   name: string
   values: OptionValueDTO[]      // OptionValueDTO.allowedValueId becomes string
 }
```

Removed exports: `OptionKind`, `PACK_SIZE_OPTION_NAME`.

## VariantInputDTO — unchanged

`packQuantity` / `packUnit` stay: the variant's **net quantity**, used only for unit pricing.

## Refusals (400, `fields`)

- `options[i].attributeId` — "choose which detail this option is" (missing) · "this category does not offer that
  option" · "two options cannot be the same detail".
- `options[i].values[j].allowedValueId` — "choose a value from the list" · "is not on the {name} list".
- Removed: every pack-size message ("enter the pack size: it is this variant's option value", "variants with the
  same pack size value need the same pack size", "two pack size values have the same size", "a pack size option
  names no attribute").
