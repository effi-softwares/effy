# Contract: the storefront product's options (shoppers)

Source of truth: `packages/shared-types/src/storefront.ts` (`options: OptionDTO[]` on the product detail),
served by the `storefront` service; mirrored into the customer app by
`pnpm --filter @effy/shared-types commerce-contract:gen` (`contract/CommerceDto.kt`, `contract/commerce-schema.json`),
held by `commerce-contract:check`.

```diff
 {
   "id": "…",
   "position": 1,
-  "kind": "attribute",
-  "attributeId": "…" | null,
+  "attributeId": "…",
   "name": "Flavour",
   "values": [{ "id": "…", "allowedValueId": "…", "label": "Strawberry" }]
 }
```

- The Kotlin enum `OptionKind { Attribute, PackSize }` is removed from the generated contract; no customer-app
  screen reads it (it renders `name` and `values[].label`).
- customer-web's variant picker (`lib/variant-selection.ts`) reads `name`/`values` only; only its test fixture
  changes.
- Each variant's `unitPrice` (when the product has a unit basis and the variant a net quantity) is unchanged.
