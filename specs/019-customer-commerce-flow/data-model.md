# Data Model: Customer Commerce Flow (019)

Phase 1 data design. New tables live in the **`public`** schema (operational), raw SQL, one Goose
**forward-only** migration, `text CHECK` enums (no native PG enums, no triggers; plain
`created_at`/`updated_at timestamptz NOT NULL DEFAULT now()`), an index on every FK, `COMMENT ON` per
table/column. Reuses 016/011/007 tables read-only for the catalog + identity + shop ownership. DTOs are
authored once in `@effy/shared-types` and regenerated to Kotlin for customer-mobile; core-api mirrors the
same documented contract.

Legend: **PK** primary key · **FK** foreign key · `∎` platform-owned (never written from client input) ·
money is `numeric(12,2)` AUD, converted to integer minor units only at the Stripe boundary.

---

## 1. Reused tables (read-only in this slice)

| Table | Used for | Key columns |
|---|---|---|
| `public.customer` (011/012) | the checkout actor; access gate | `id` PK, `cognito_sub` UNIQUE (JWT join key), `status` (`active`/`barred`) |
| `public.product` (016) | catalog reads, price authority, shop ownership | `id` PK, `shop_id` FK, `name`, `brand`, `price_amount`, `currency`, `compare_at_amount`, `short_description`, `status` |
| `public.product_media` (016) | product images | `product_id` FK, `storage_key`, `is_primary`, `display_order` |
| `public.category` (016) | taxonomy for browse/filter rails | `id` PK, `parent_id`, `key`, `name`, `status` |
| `public.product_attribute_value` (016) | detail attributes + facet filters | `product_id` FK, `attribute_definition_id` FK, typed value cols |
| `public.shop` (007/009) | fan-out target (hidden node) | `id` PK, `status` |

**Availability rule** (no inventory model): a product is purchasable iff `product.status = 'active'`. This
is re-checked at cart read and at checkout (FR-022).

---

## 2. New tables

### 2.1 `public.customer_address`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK DEFAULT gen_random_uuid()` | |
| `customer_id` | `uuid NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE` | owner |
| `label` | `text` | nullable ("Home", "Work") |
| `recipient_name` | `text NOT NULL` | |
| `phone` | `text` | nullable |
| `line1` | `text NOT NULL` | |
| `line2` | `text` | nullable |
| `city` | `text NOT NULL` | |
| `region` | `text` | state/territory, nullable |
| `postal_code` | `text NOT NULL` | |
| `country` | `char(2) NOT NULL DEFAULT 'AU'` | ISO-3166-1 alpha-2 |
| `is_default` ∎ | `boolean NOT NULL DEFAULT false` | |
| `created_at`/`updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes: `customer_address_customer_idx (customer_id)`; partial unique
`customer_address_default_uq (customer_id) WHERE is_default` (at most one default).

### 2.2 `public.cart` — one active server cart per customer
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `customer_id` | `uuid NOT NULL UNIQUE REFERENCES public.customer(id) ON DELETE CASCADE` | one cart per customer |
| `currency` ∎ | `char(3) NOT NULL DEFAULT 'AUD'` | |
| `created_at`/`updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

### 2.3 `public.cart_item`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `cart_id` | `uuid NOT NULL REFERENCES public.cart(id) ON DELETE CASCADE` | |
| `product_id` | `uuid NOT NULL REFERENCES public.product(id) ON DELETE RESTRICT` | |
| `quantity` | `int NOT NULL CHECK (quantity > 0 AND quantity <= 99)` | bounded (edge case) |
| `added_at`/`updated_at` | `timestamptz NOT NULL DEFAULT now()` | |
| — | `UNIQUE (cart_id, product_id)` | one line per product; add merges qty |

**No price stored** — price/availability re-read from `product` at every read (authoritative). Index
`cart_item_cart_idx (cart_id)`, `cart_item_product_idx (product_id)`.

### 2.4 `public.order`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `customer_id` | `uuid NOT NULL REFERENCES public.customer(id) ON DELETE RESTRICT` | buyer |
| `order_number` ∎ | `text NOT NULL UNIQUE` | human-facing reference (e.g. `EFY-2G7K9Q`) |
| `status` ∎ | `text NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment','paid','failed','canceled'))` | lifecycle (§4) |
| `currency` ∎ | `char(3) NOT NULL DEFAULT 'AUD'` | |
| `item_subtotal_amount` ∎ | `numeric(12,2) NOT NULL CHECK (>= 0)` | Σ line subtotals |
| `delivery_fee_amount` ∎ | `numeric(12,2) NOT NULL CHECK (>= 0)` | flat per-order fee |
| `grand_total_amount` ∎ | `numeric(12,2) NOT NULL CHECK (>= 0)` | subtotal + delivery |
| `delivery_address` ∎ | `jsonb NOT NULL` | **snapshot** of the chosen address (immutable receipt) |
| `placed_at` | `timestamptz` | set at the `paid` transition |
| `created_at`/`updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes: `order_customer_created_idx (customer_id, created_at DESC)` (history, most-recent-first),
`order_status_idx (status)`.

### 2.5 `public.order_item`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `order_id` | `uuid NOT NULL REFERENCES public.order(id) ON DELETE CASCADE` | |
| `product_id` | `uuid NOT NULL REFERENCES public.product(id) ON DELETE RESTRICT` | |
| `shop_id` ∎ | `uuid NOT NULL REFERENCES public.shop(id) ON DELETE RESTRICT` | **denormalized from product at placement** — the fan-out key |
| `product_name` ∎ | `text NOT NULL` | snapshot (immutable receipt) |
| `unit_price_amount` ∎ | `numeric(12,2) NOT NULL CHECK (>= 0)` | snapshot at placement |
| `quantity` | `int NOT NULL CHECK (quantity > 0)` | |
| `line_subtotal_amount` ∎ | `numeric(12,2) NOT NULL` | `unit_price × quantity` |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

Indexes: `order_item_order_idx (order_id)`, `order_item_shop_idx (shop_id)`.

### 2.6 `public.shop_fulfillment` — the per-shop order portion (fan-out record)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `order_id` | `uuid NOT NULL REFERENCES public.order(id) ON DELETE CASCADE` | |
| `shop_id` | `uuid NOT NULL REFERENCES public.shop(id) ON DELETE RESTRICT` | the hidden fulfillment node |
| `status` ∎ | `text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','received'))` | minimal (§4) |
| `item_count` ∎ | `int NOT NULL CHECK (>= 1)` | this shop's item count |
| `subtotal_amount` ∎ | `numeric(12,2) NOT NULL CHECK (>= 0)` | this shop's items subtotal (excludes the order-level delivery fee) |
| `created_at`/`updated_at` | `timestamptz NOT NULL DEFAULT now()` | |
| — | `UNIQUE (order_id, shop_id)` | **exactly one portion per (order, shop)** (SC-005, idempotent fan-out) |

Created in the same transaction as the `paid` transition, one row per distinct `order_item.shop_id`.
Index `shop_fulfillment_shop_idx (shop_id)` (future shop-side reads).

### 2.7 `public.payment`
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `order_id` | `uuid NOT NULL UNIQUE REFERENCES public.order(id) ON DELETE CASCADE` | one payment per order |
| `provider` ∎ | `text NOT NULL DEFAULT 'stripe'` | |
| `stripe_payment_intent_id` ∎ | `text UNIQUE` | set when the intent is created |
| `amount` ∎ | `numeric(12,2) NOT NULL CHECK (>= 0)` | = order grand total |
| `currency` ∎ | `char(3) NOT NULL DEFAULT 'AUD'` | |
| `status` ∎ | `text NOT NULL DEFAULT 'requires_payment' CHECK (status IN ('requires_payment','requires_action','succeeded','failed','canceled'))` | mirrors PaymentIntent |
| `created_at`/`updated_at` | `timestamptz NOT NULL DEFAULT now()` | |

**No card data ever stored** (SC-012) — only Stripe references.

### 2.8 `public.stripe_event` — webhook dedup
| Column | Type | Notes |
|---|---|---|
| `event_id` | `text PK` | Stripe `event.ID` |
| `type` | `text NOT NULL` | e.g. `payment_intent.succeeded` |
| `received_at` | `timestamptz NOT NULL DEFAULT now()` | |

Redelivered events are a no-op (`INSERT … ON CONFLICT (event_id) DO NOTHING`), backing R5 guard #3.

### 2.9 `public.customer_favorite`
| Column | Type | Notes |
|---|---|---|
| `customer_id` | `uuid NOT NULL REFERENCES public.customer(id) ON DELETE CASCADE` | |
| `product_id` | `uuid NOT NULL REFERENCES public.product(id) ON DELETE CASCADE` | |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |
| — | `PRIMARY KEY (customer_id, product_id)` | idempotent save |

Index `customer_favorite_customer_idx (customer_id)` for the list (most-recent-first via `created_at`).

### 2.10 `public.event_outbox` — transactional outbox (the "event" half of fan-out)
| Column | Type | Notes |
|---|---|---|
| `id` | `uuid PK` | |
| `event_type` ∎ | `text NOT NULL` | e.g. `order.placed` |
| `event_id` ∎ | `uuid NOT NULL DEFAULT gen_random_uuid()` | envelope id |
| `dedup_key` ∎ | `text NOT NULL UNIQUE` | e.g. `order.placed:<order_id>` |
| `aggregate_type` ∎ | `text NOT NULL` | `order` |
| `aggregate_id` ∎ | `uuid NOT NULL` | the order id |
| `payload` ∎ | `jsonb NOT NULL` | order summary + **per-shop breakdown** |
| `occurred_at` | `timestamptz NOT NULL DEFAULT now()` | |
| `published_at` ∎ | `timestamptz` | NULL until a future drainer dispatches to SNS |

Written in the order's `paid` transaction. The envelope shape matches ARCHITECTURE.md so the future
SNS/SQS backbone + its `processed_events` consumer-dedup table (a later slice) reuse it unchanged. Index
`event_outbox_unpublished_idx (occurred_at) WHERE published_at IS NULL` for the future drainer.

---

## 3. DTO surface (`@effy/shared-types`, regenerated to Kotlin for mobile)

Amounts are decimal **strings** + a `currency` field (matches `catalog.ts`); timestamps ISO strings;
nullable wire fields `T | null`; each enum has a tolerant-reader narrowing helper.

**`storefront.ts`** (public reads): `StorefrontProductCardDTO` (id, name, brand, imageUrl (presigned),
priceAmount, currency, compareAtAmount|null, badges: `("on_sale"|"new")[]`, available:boolean),
`StorefrontProductDetailDTO` (card fields + longDescription, gallery: `MediaDTO[]` (presigned + alt),
attributes: grouped `{ groupLabel, items: {label,value}[] }[]`, categoryPath: `string[]`),
`StorefrontHomeDTO` (banners: `BannerDTO[]`, rails: `{ key, title, products: StorefrontProductCardDTO[] }[]`),
`ProductSearchQuery` (q?, categoryKey?, minPrice?, maxPrice?, saleOnly?, attribute facets, cursor?, limit),
`ProductSearchResultDTO` (`items: StorefrontProductCardDTO[]`, `nextCursor: string|null`), reuse category DTO.

**`cart.ts`**: `CartDTO` (`lines: CartLineDTO[]`, itemSubtotalAmount, deliveryFeeAmount, grandTotalAmount,
currency, `notices: CartNoticeDTO[]`), `CartLineDTO` (id, productId, name, imageUrl, unitPriceAmount,
quantity, lineSubtotalAmount, available:boolean, priceChangedFrom?:string), `AddToCartRequest`
(productId, quantity), `UpdateCartLineRequest` (quantity), `MergeCartRequest` (`lines: {productId,
quantity}[]`). `CartNoticeDTO` = `{ productId, kind: "unavailable"|"price_changed" }`.

**`address.ts`**: `AddressDTO` (all §2.1 non-`∎`-internal fields + isDefault), `CreateAddressRequest`,
`UpdateAddressRequest`.

**`checkout.ts`**: `CreateCheckoutIntentRequest` (addressId), `CreateCheckoutIntentResponse`
(orderId, orderNumber, clientSecret, publishableKey, grandTotalAmount, currency),
`ConfirmCheckoutRequest` (orderId).

**`order.ts`**: `OrderSummaryDTO` (id, orderNumber, status, placedAt, itemCount, grandTotalAmount,
currency), `OrderDTO`/`ReceiptDTO` (summary + `items: OrderItemDTO[]`, deliveryAddress snapshot,
itemSubtotalAmount, deliveryFeeAmount, grandTotalAmount, paymentStatus,
`fulfillments: { status, itemCount, subtotalAmount }[]` — shop identity NOT exposed),
`OrderItemDTO` (productId, productName, unitPriceAmount, quantity, lineSubtotalAmount).

**`favorite.ts`**: `FavoriteDTO` (product card fields + savedAt); list is `FavoriteDTO[]`.

**`customer-commerce-contract.ts`**: the KMP codegen entry re-exporting the subset mobile needs
(storefront, cart, address, checkout, order, favorite) → generated Kotlin `@Serializable` DTOs.

---

## 4. State transitions

**`order.status`**
```
        create (checkout intent)
              │
              ▼
      ┌────────────────┐  payment_intent.succeeded (webhook / confirm)   ┌──────┐
      │ pending_payment│ ───────────────────────────────────────────────►│ paid │  (+ placed_at, fan-out, outbox)
      └───────┬────────┘                                                  └──────┘
              │ payment_intent.payment_failed            (customer may re-attempt → new intent, same order)
              ▼
          ┌────────┐
          │ failed │   (no fan-out, no outbox, cart preserved)
          └────────┘
   canceled: reserved for abandoned/expired pending orders (housekeeping; not user-facing here)
```
The `pending_payment → paid` transition is written `UPDATE … WHERE status='pending_payment'` (idempotent;
webhook + confirm converge). Fan-out (`shop_fulfillment` rows) + the `order.placed` outbox row are written
**in the same transaction** as `paid`. Cart is emptied only after `paid`.

**`payment.status`** mirrors the Stripe PaymentIntent (`requires_payment → requires_action → succeeded` |
`failed` | `canceled`).

**`shop_fulfillment.status`**: `pending` at creation; `received` reserved for the later shop-surfacing
slice (no consumer flips it in this slice).

---

## 5. Key invariants (service layer)

- **Access**: every customer route resolves `cognito_sub → customer.id` and refuses `status='barred'`
  (R2). Cart/order/address/favorite queries are always scoped `WHERE customer_id = :actor` — never a
  client-supplied id.
- **Availability & price**: cart read and checkout re-read `product.status` + `product.price_amount`;
  unavailable lines are flagged and excluded from the payable total; a changed price is surfaced before
  payment (FR-022) and the order snapshots the **authoritative** price at placement (FR-039).
- **Amount authority**: order `item_subtotal + delivery_fee = grand_total` computed server-side; the
  PaymentIntent amount is derived from `order.grand_total_amount` (never a client-sent amount).
- **Fan-out correctness**: for a paid order with items from N shops, exactly N `shop_fulfillment` rows
  (UNIQUE(order_id,shop_id)); `Σ shop_fulfillment.subtotal_amount = order.item_subtotal_amount`;
  `Σ order_item.line_subtotal = order.item_subtotal` (SC-005/SC-008).
- **Idempotency**: deterministic PaymentIntent idempotency key (R5 #1); one active `pending_payment`
  order per customer cart (R5 #2); `stripe_event` PK dedup (R5 #3).
- **Immutable receipts**: `order_item.product_name/unit_price` and `order.delivery_address` are snapshots;
  later product/address edits never change a past order.
