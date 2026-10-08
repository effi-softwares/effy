# Data Model: A Second Front Door for Back-Office

**Feature**: 075-staff-gateway. **No database change** — no migration, no table, no column.

The "data" of this feature is configuration: what exists in the environment, and the parameters that
join infrastructure to the services. See [contracts/gateway.contract.md](contracts/gateway.contract.md)
for the exact names.

## The two gateways

| | Shared gateway | Staff gateway (new) |
|---|---|---|
| Used by | customer, shop, driver, public | back-office only |
| Address | `https://<api_subdomain>.<zone>` (unchanged) | `https://<staff_api_subdomain>.<zone>` |
| Authorizers | customer, shop, driver (back-office removed at the end) | back-office only |
| Allowed browser origins | shop console, storefront, localhost dev (back-office removed at the end) | back-office console, `http://localhost:5173` |
| Services | `storefront`, `commerce`, `customer`, `shop`, `inventory`, `driver`, `notifications` | `admin`, `fleet`, `orders`, `catalog`, `inventory-staff` |
| Routes after the move | ≈ 158 of 300 | ≈ 142 of 300 |
| 5xx alarm | existing | its own |

## Service → gateway (the placement table)

| Service (stack) | Gateway | Why |
|---|---|---|
| `storefront`, `commerce`, `customer` | shared | customer and public audience |
| `shop`, `inventory` | shared | shop audience |
| `driver` | shared | driver audience |
| `notifications` | shared | its one route is a provider callback, not an audience |
| `admin`, `fleet`, `orders`, `catalog` | **staff** | back-office audience |
| `inventory-staff` (new stack, same source as `inventory`) | **staff** | the back-office part of stock (research R4) |
| `auth`, `live` | neither | no route |

## Gateway usage reading (emitted hourly, not stored)

| Field | Meaning |
|---|---|
| `gateway` | `shared` \| `staff` |
| `limit` | `routes` \| `integrations` |
| used / ceiling | counts read live from AWS; ceiling 300 |
| percent | what the 75 / 90 alarms watch |

## States of the move

```
0 before ──► 1 staff gateway exists (unused)
         ──► 2 catalog moved            ⚠ product review unreachable until 3
         ──► 3 forwarding routes on shared
         ──► 4 orders, fleet, admin, inventory-staff moved (any order, one at a time)
         ──► 5 website on the staff address
         ──► 6 forwarding routes + shared back-office authorizer removed   ← done
```

Every state from 3 onward leaves back-office fully working; the move may pause at any of them.
