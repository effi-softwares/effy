# Back-office (admin) capabilities

The capability register for the **admin audience** — Effy back-office staff working in
`apps/back-office` over `apis/edge-api/admin`.

## Why this file exists

`docs/audiences/` held registers for **customer** and **shop** because each of those audiences has
**two surfaces kept at parity** (a web build and a mobile build), and a register is what stops them
drifting apart.

The admin audience has **one** surface, so there is no parity to police — which is why no register was
written. But the other purpose of these documents turned out to matter anyway: **recording what an
audience can do, and what it deliberately cannot.** Feature 031 was the first time that gap was felt,
when a task said "update the parity register" and there was nowhere to put it. Appending an admin
capability to the shop register would have been worse than having none.

⚠ **This is a capability register, not a parity register.** There is no second column, and adding one
would mean the platform had grown an admin mobile app — which is not planned.

---

## Earlier admin capabilities

Not retrofitted here. The back office also carries staff identity and RBAC (005/006), shop management
(009), the catalog schema (016), and the promotions console (027).
Each is documented in its own slice under `specs/`.

---

## §067 — Product review and Effy's margin (067-product-approval-margin)

Served by `apis/edge-api/catalog` (`/catalog/v1/…`), not `edge-admin`.

| Capability | admin | manager | csa |
|---|---|---|---|
| Read the review queue (new products and changes, oldest first; search, shop, kind) | ✅ | ✅ | ✅ |
| Open an item: everything the shop entered, images, before/after for a change | ✅ | ✅ | ✅ |
| Approve a new product, setting the margin (refused without one) | ✅ | ✅ | ❌ |
| Approve a change (a changed shop price reopens the margin) | ✅ | ✅ | ❌ |
| Send back with a written reason | ✅ | ✅ | ❌ |
| List approved products with no margin | ✅ | ✅ | ✅ |
| Set or change a live product's margin | ✅ | ✅ | ❌ |

A csa reads the queue because a csa is who a shop rings to ask why its product is not on sale.
Roles come from `admin.staff`, never from the token claim, and are enforced per route by the service.

**Every decision** is checked against the version the reviewer opened — an item the shop edited
meanwhile, or a colleague already decided, is refused and reloaded — and writes one
`admin.audit_log` row with who decided, which product, and the margin before and after.

**Deliberately not available**

- **Editing a shop's product.** A reviewer approves or sends back; the shop makes the change.
- **Approving part of a change**, bulk approval, auto-approval, per-shop or per-category default
  margins, settlement — out of scope by the spec.
- **Being told a product was submitted.** The queue and the `product-review-stale` alarm are the
  only signals.

