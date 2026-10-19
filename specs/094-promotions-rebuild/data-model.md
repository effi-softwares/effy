# Data Model: Promotions Rebuilt (094)

One goose migration, `db/migrations/20261020090000_promotions_rebuild.sql` (stage A). Money is
`numeric(12,2)`, currency AUD, as elsewhere. Times are `timestamptz`; days and hours are Melbourne local.

## promotion

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| name | text NOT NULL | internal, staff-facing |
| kind | text | `cart` \| `item` \| `bxgy` \| `delivery` |
| trigger | text | `automatic` \| `code` |
| value_type | text | `percent` \| `amount` \| `free` (`free` only for `delivery`, and for the "get" side of `bxgy`) |
| percent_off | numeric(5,2) NULL | 0 < x ≤ 100 when `percent` |
| amount_off | numeric(12,2) NULL | > 0 when `amount` |
| max_discount_amount | numeric(12,2) NULL | cap on a percent discount (`cart`, `item`) |
| bxgy_buy_qty / bxgy_get_qty | int NULL | both > 0 when `bxgy` |
| bxgy_max_per_order | int NULL | |
| applies_to | text | `cart` \| `products` \| `categories` \| `brands` (`item`, `bxgy`); `cart` for `cart`; ignored for `delivery` |
| delivery_types | text[] | ⊆ {`effy`,`courier`}, non-empty |
| audience | text | `everyone` \| `first_order` \| `new_customers` \| `chosen` |
| min_subtotal_amount | numeric(12,2) NOT NULL DEFAULT 0 | judged on qualifying goods after earlier reductions |
| min_quantity | int NULL | qualifying units |
| starts_at / ends_at | timestamptz NULL | `ends_at > starts_at` |
| days_of_week | int[] NULL | ISO 1–7; NULL = every day |
| time_from / time_to | time NULL | Melbourne; both or neither; `time_to > time_from` |
| max_uses | int NULL | total confirmed + held |
| max_uses_per_customer | int NULL | |
| budget_amount | numeric(12,2) NULL | total goods + delivery discount given |
| combinable | boolean NOT NULL DEFAULT false | |
| published_at | timestamptz NULL | NULL = draft |
| paused | boolean NOT NULL DEFAULT false | |
| ended_at | timestamptz NULL | "end now" sets it; effective end = least(ends_at, ended_at) |
| archived_at | timestamptz NULL | |
| headline | text NULL | shopper words; required to be in a group |
| supporting_line | text NULL | |
| label | text NULL | short, ≤ 24 chars |
| legacy_promo_code_id | uuid NULL UNIQUE → promo_code | set by the copy (R1) |
| created_by, updated_by, created_at, updated_at | | as elsewhere |

**CHECKs** make ill-formed promotions unrepresentable: value fields per `value_type`; `bxgy` fields only
on `bxgy`; `max_discount_amount` only with `percent`; `applies_to = cart` iff `kind IN (cart, delivery)`.

**Immutability after first use** (FR-020): the admin service refuses (409 `promotion_used`) a change to `kind`, `trigger`, `value_type`, the value columns, `bxgy_*`, `applies_to`, `audience`, `min_subtotal_amount`, `min_quantity`, `delivery_types`, targets or chosen customers once a `promotion_use` is `held` or `confirmed` — decided inside the write under `SELECT … FOR UPDATE` on the promotion, the lock the payment intent also takes. (No trigger: the platform's trigger guard forbids triggers that can abort a write.)

## State — `public.promotion_state(p promotion, at timestamptz) → text`

In order: `archived_at` → **archived**; `published_at IS NULL` → **draft**; `ended_at ≤ at` or `ends_at ≤
at` → **ended**; `paused` → **paused**; `starts_at > at` → **scheduled**; uses ≥ `max_uses` → **used_up**;
discount given ≥ `budget_amount` → **out_of_budget**; otherwise **active**. Uses and discount count
`promotion_use` rows `confirmed`, and `held` with `hold_expires_at > at`. Never stored.

## promotion_code

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| promotion_id | uuid → promotion | |
| code | text NOT NULL | unique on `upper(regexp_replace(code,'\s','','g'))` across all rows ever |
| single_use | boolean | false = the one shared code |
| batch_id | uuid NULL | groups a generated batch |
| created_at | timestamptz | |

A promotion with `trigger = code` has exactly one shared code or ≥ 1 single-use codes (service rule).

## promotion_target

`(promotion_id, target_type ∈ {product, category, brand}, product_id NULL, category_id NULL, brand text
NULL)`, exactly one of the three set per `target_type`. A category target covers its sub-categories
(recursive over `category.parent_id`). Brand compared with `lower(btrim(product.brand))`.

## promotion_customer

`(promotion_id, customer_id)` PK. Only for `audience = chosen`.

## promotion_use

| Column | Type | Rule |
|---|---|---|
| id | uuid PK | |
| promotion_id | uuid → promotion RESTRICT | |
| code_id | uuid NULL → promotion_code | |
| customer_id | uuid → customer RESTRICT | |
| order_id | uuid → order RESTRICT | UNIQUE (`order_id`, `promotion_id`) |
| goods_amount / delivery_amount | numeric(12,2) ≥ 0 | |
| status | text | `held` \| `confirmed` \| `released` |
| hold_expires_at | timestamptz NULL | set while `held` |
| created_at, confirmed_at, released_at | timestamptz | |

Partial unique index `promotion_use_code_once` on `(code_id) WHERE status IN ('held','confirmed') AND
code_id IN single-use codes` (enforced via a `single_use` copy column on the row, since partial indexes
cannot join). Index `(promotion_id, status)`, `(promotion_id, customer_id, status)`.

**Transitions**: `held → confirmed` (finalizer), `held → released` (payment failed, hold expired,
superseded by a new intent), `confirmed → released` (order cancelled before fulfilment). Nothing else.

## promotion_group / promotion_group_member

- `promotion_group (id, key text UNIQUE CHECK (key ~ '^[a-z0-9]+(-[a-z0-9]+)*$'), name, description,
  sort int, created_at, updated_at)`. `key` is never written after creation (the admin service refuses it).
- `promotion_group_member (group_id, promotion_id, position int)`, PK `(group_id, promotion_id)`; a
  promotion with no `headline` cannot be added (refused by the admin service).

Seeded: `home-hero` "Home hero", `home-side` "Home side cards", `home-between` "Between Home sections",
`offers` "Offers page", `cart` "Cart suggestions".

## order_promotion

`(order_id, promotion_id, code_id NULL, code_text NULL, name, headline NULL, kind, goods_amount,
delivery_amount)`, PK `(order_id, promotion_id)`. Snapshots — never re-derived.

## Changed tables

- `order_item.discount_amount numeric(12,2) NOT NULL DEFAULT 0 CHECK (≥ 0 AND ≤ unit × quantity)`.
- `"order".delivery_discount_amount numeric(12,2) NOT NULL DEFAULT 0`.
- `cart`: `promotion_code_id uuid NULL → promotion_code` replaces `promo_code_id` (copied; old column kept
  until stage C).
- `promo_code`, `promo_redemption`: unchanged, no longer written (stage C removes them).

## Audit

Every admin write inserts an `admin.audit_log` row in the same transaction (`promotion.*`,
`promotion_group.*`, `promotion_code.batch_generated`, `promotion_customer.*`), as 027 did.
