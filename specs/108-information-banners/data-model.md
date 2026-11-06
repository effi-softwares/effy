# Data Model: Information Banners (108)

## `public.promotion` (changed)

| Column | Offer | Banner |
|---|---|---|
| `kind` | cart / item / bxgy / delivery | `banner` |
| `trigger` | NOT NULL (automatic / code) | NULL |
| `value_type` | NOT NULL | NULL |
| `applies_to` | NOT NULL | NULL |
| `percent_off`, `amount_off`, `max_discount_amount`, `bxgy_*` | per kind | NULL |
| `audience` | any | `everyone` |
| `min_subtotal_amount` | ≥ 0 | 0 |
| `min_quantity`, `max_uses`, `max_uses_per_customer`, `budget_amount` | any | NULL |
| `combinable` | any | false |
| `delivery_types` | any | default (both), unused |
| `link_kind` (new) | NULL | `search` / `sale` / `category` / `product` |
| `link_category_id` (new, FK category, ON DELETE SET NULL) | NULL | set when `link_kind = 'category'` (may become NULL if the aisle is deleted) |
| `link_product_id` (new, FK product, ON DELETE SET NULL) | NULL | set when `link_kind = 'product'` (may become NULL) |
| `headline` | required in a group | required always (service rule) |
| words (`headline`, `supporting_line`, `label`) | as typed | may hold live-value tokens |

CHECKs:

- `promotion_kind_check`: adds `banner`.
- `promotion_banner_shape_ck`: as in R1.
- `promotion_link_ck`: `(kind = 'banner') = (link_kind IS NOT NULL)`, and `link_category_id` set only for
  `category`, `link_product_id` only for `product`.
- `promotion_applies_to_chk`: becomes `kind = 'banner' OR ((kind IN ('cart','delivery')) = (applies_to = 'cart'))`.
- `promotion_value_chk`: a banner passes, because it has no value.

The other tables (`promotion_group_member`, `promotion_image`, `promotion_skin`, `admin.audit_log`) are unchanged.
`promotion_code`, `promotion_customer`, `promotion_target` and `promotion_use` never hold a banner's id: the admin
writer refuses, and the engine never selects one.

**State** (`public.promotion_state`): unchanged. A banner can't reach `used_up` or `out_of_budget`, because it has no
caps.

## Live value (code, not a table)

| Key | Token | Name staff see | Filled from | Empty when |
|---|---|---|---|---|
| `free_delivery_amount` | `{free_delivery_amount}` | Free-delivery amount | active Effy fee plan `free_over_amount` | no active plan, or its free amount is NULL |
| `order_minimum` | `{order_minimum}` | Order minimum | `order_policy.minimum_subtotal_amount` | the minimum is 0 or unset |

Money format: `$150`, `$20`, `$7.50` (cents shown only when not whole).

## Shopper view (`ShopperPromotionDTO`, changed)

- `kind` may be `banner`.
- For a banner:
  - `headline`, `supportingLine` and `label` are filled;
  - `code`, `terms` and `endsIn` are null;
  - `target` is the link, or null when its aisle or product is gone.
- A banner with an empty live value is not in the list at all. The admin preview lists it under hidden, with
  `why: "live_value_missing"`.
