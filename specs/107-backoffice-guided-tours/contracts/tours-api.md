# Contract: a back-office person's tour state (admin service, staff gateway)

Identical to 106's `contracts/tours-api.md` in body, responses and refusals. Only these differ:

| | Shop console (106) | Back-office (107) |
|---|---|---|
| Routes | `GET` / `PATCH /shop/v1/me/tours` | `GET` / `PATCH /admin/v1/me/tours` |
| Service / gateway | `shop`, shared | `admin`, staff |
| Authorizer | `…/edge/authorizer/shop_id` | `…/staff/authorizer/back-office_id` |
| Audience written | `'shop'` | `'admin'` |
| Functions | `shop-tours-v1-get` / `-patch` | `back-office-tours-v1-get` / `-patch` |

- Any admin-pool caller is admitted, including Customer support and a person with no roles yet, like `/admin/v1/me`.
  The record is the caller's own preference, not a business action, so no role check and no audit entry.
- No live announcement. `change-map.guard.test.ts` gets the exemption `"admin/back-office-tours-v1-patch"` with its
  reason, as 106 did for the shop route.
