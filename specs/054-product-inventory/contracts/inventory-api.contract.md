# Contract — Inventory routes & DTOs (054)

Two audiences, **one cold-path service** (`apis/edge-api/inventory`), attached to the existing shared
HTTP gateway. Authorizers are attached **per route**, so a shop token can never reach a back-office
route and vice versa — Principle IV holds structurally (see [research.md](./research.md) R6).

Errors are the platform's RFC 9457 problem shape from `@effy/edge-shared`. Money does not appear here.
⚠ **No customer route exists in this contract** — the shopper's experience of stock is the value of the
`available` flag they already receive, and the refusal text on the existing cart routes.

---

## Shop routes — shop authorizer, scoped to the caller's active shop

| Method | Path | Purpose | FR |
|---|---|---|---|
| `GET` | `/inventory/v1/products/{productId}/stock` | Current stock + effective threshold + recent movements | FR-009 |
| `PUT` | `/inventory/v1/products/{productId}/stock/tracking` | Turn tracking on (count required) or off | FR-003, FR-002 |
| `PUT` | `/inventory/v1/products/{productId}/stock` | Set an absolute count | FR-006 |
| `POST` | `/inventory/v1/products/{productId}/stock/adjustments` | Record a relative change | FR-006 |
| `PUT` | `/inventory/v1/products/{productId}/stock/threshold` | Set or clear this product's threshold | FR-005 |
| `GET` | `/inventory/v1/low-stock` | Everything at or below its effective threshold, and everything at zero | FR-029 |
| `GET` | `/inventory/v1/settings` | The shop's default threshold | FR-005 |
| `PUT` | `/inventory/v1/settings` | Set the shop's default threshold | FR-005 |

**Scoping**: `shopId` is never accepted from the client. It is resolved from the caller's
`shop_staff` record — the same gate the shop product routes already use (role AND status AND shop
scope, one SQL predicate, fail-closed). A product belonging to another shop returns the **same** refusal
as a product that does not exist, disclosing nothing (FR-004).

---

## Back-office routes — back-office authorizer

| Method | Path | Purpose | FR |
|---|---|---|---|
| `GET` | `/inventory/v1/admin/shops/{shopId}/products/{productId}/stock` | Read any shop's stock + history | FR-025 |
| `GET` | `/inventory/v1/admin/shops/{shopId}/low-stock` | Any shop's low-stock list | FR-025 |
| `PUT` | `/inventory/v1/admin/shops/{shopId}/products/{productId}/stock` | Set a count on the shop's behalf | FR-026 |
| `PUT` | `/inventory/v1/admin/shops/{shopId}/products/{productId}/stock/tracking` | Turn tracking on/off on the shop's behalf | FR-026 |
| `PUT` | `/inventory/v1/admin/shops/{shopId}/products/{productId}/stock/threshold` | Set a product's own threshold on the shop's behalf | FR-026 |
| `PUT` | `/inventory/v1/admin/shops/{shopId}/settings` | Set the shop's default threshold | FR-026 |

**Authorization** decides from `admin.staff`, never from the `cognito:groups` claim alone:
**read** = any active staff member including `csa`; **write** = `admin` / `manager` (FR-025, FR-028).
This is the two-tier split 046 and 053 both use. A refusal is uniform and does not vary with the shop or
product named (FR-028).

⚠ The set is deliberately the **full** shop power set — tracking, count, per-product threshold, shop default. FR-026 and the Q5 clarification both say "every stock action a shop operator can"; a subset would make the assisted path unable to do the thing a shop rings up to ask for.

**Every write requires a `reason`**, and produces a movement with `actorKind: "back_office"` — which is
what makes FR-027 visible on the shop's own surfaces.

---

## DTOs — `packages/shared-types/src/inventory.ts`

```ts
/** Stock as an operator sees it. Never reaches a customer surface. */
export interface ProductStockDTO {
  productId: string
  tracked: boolean
  /** null when untracked. */
  onHand: number | null
  /** This product's own threshold, or null to fall back to the shop default. */
  threshold: number | null
  /** Product threshold, else shop default, else null (nothing counts as low). */
  effectiveThreshold: number | null
  /** onHand === 0 while tracked. */
  outOfStock: boolean
  /** tracked && effectiveThreshold !== null && onHand <= effectiveThreshold && onHand > 0 */
  low: boolean
}

export type StockMovementReason =
  | "received" | "correction" | "damage" | "expiry"
  | "order_paid" | "pick_shortfall"
  | "tracking_enabled" | "tracking_disabled"

export type StockActorKind = "shop" | "back_office" | "system"

export interface StockMovementDTO {
  id: string
  quantityDelta: number
  quantityBefore: number
  quantityAfter: number
  reason: StockMovementReason
  actorKind: StockActorKind
  /** Display name where the platform holds one; never an email. */
  actorLabel: string | null
  orderNumber: string | null
  note: string | null
  createdAt: string
}

export interface ProductStockDetailDTO {
  stock: ProductStockDTO
  movements: StockMovementDTO[]
}

export interface LowStockRowDTO {
  productId: string
  name: string
  sku: string | null
  onHand: number
  effectiveThreshold: number | null
  /** "out" sorts above "low" — an empty shelf is not the same problem as a thin one. */
  severity: "out" | "low"
}

export interface ShopStockSettingsDTO {
  defaultThreshold: number | null
}
```

**Write bodies** carry `{ onHand }`, `{ delta }`, `{ threshold }`, `{ tracked, onHand? }` or
`{ defaultThreshold }`, each with a required `reason` (and optional `note`) on anything that moves a
count. `reason` is validated against the same closed set the database `CHECK` enforces.

**Kotlin**: generated into `packages/shared-types/contract-shop/` by the existing `shop-contract:gen`,
guarded by `shop-contract:check` (R10). No customer contract is regenerated — none changes.

---

## Hot-path contract changes (`core-api`)

**No new route.** Three existing responses change in *value*, and one in shape:

1. **`available`** on every storefront product DTO now reflects stock. Shape unchanged — this is the
   whole customer-facing delivery of the feature.
2. **Saved-item `verdict`** returns `temporarily_unavailable` for a tracked product at zero, alongside
   the existing manual-`unavailable` cause (R12.2). Shape unchanged.
3. **Cart line flagging** — an existing `unavailable` notice is raised for a line that outruns stock,
   and the payable subtotal already excludes flagged lines (FR-017). Shape unchanged.
4. **⚠ The one shape change**: the add-to-cart / set-quantity refusal gains the available quantity, so
   the message can say "only 2 available" (FR-016, FR-015b). It rides the existing RFC 9457 problem
   body as a field; no new status code, no new route.

**Checkout** re-checks availability at intent creation and refuses with the existing blocked-reason
vocabulary (FR-018, FR-019) — no new blocked reason is introduced, because "no payable items" already
says exactly this.
