# Contract: which change announces what

The binding list of announcing points. A guard test (research R8) holds the code to it: every
state-changing or scheduled function in these services either announces or is allow-listed with a
reason. Exact function files are fixed in `tasks.md` from the routes as they stand.

`customer*` = only when the customer-visible stage or refund state changed (research R7).

| Change | Service that commits it | shop | customer | driver | ops |
|---|---|---|---|---|---|
| Order paid (webhook / finalise) | `commerce` via shared payments | `orders` (each fulfilling shop) | `orders` | — | `orders`, `slots` |
| Customer cancels | `commerce` | `orders` | `orders` | `work` if assigned | `orders`, `slots` |
| Customer requests a refund | `commerce` | — | `orders` | — | `orders` |
| Staff cancels / refunds / declines | `orders` via shared payments | `orders` | `orders`* | `work` if assigned | `orders` |
| Shop manager refunds own lines | `shop` via shared payments | `orders` | `orders`* | — | `orders` |
| Refund settles or fails (reconciler, webhook) | `commerce` | `orders` | `orders`* | — | `orders` |
| Portion accepted / picking / ready | `shop` | `orders` | `orders`* | — | `orders` |
| Pick progress on an item | `shop` | `orders` (≤ 1 per order per 5 s) | — | — | — |
| Portion handed to driver | `shop` | `orders` | `orders`* | `work` | `orders`, `dispatch` |
| Stock runs out / crosses low level / recovers | `inventory`, and `commerce` when a sale causes it | `stock` | — | — | — |
| Attention list gains or loses an entry | `shop` (evaluator, scheduled) | `attention` | — | — | — |
| Work assigned / reassigned / withdrawn | `fleet` (staff action, wave planner) | — | — | `work` (old and new driver) | `dispatch` |
| Driver collects / checks in at hub | `driver` | `orders` | `orders`* | — | `orders`, `dispatch` |
| Driver delivers / fails a drop (proof) | `driver` | — | `orders`* | — | `orders`, `dispatch` |
| Driver goes on / off duty | `driver` | — | — | — | `dispatch` |
| Driver record changed by staff | `admin` / `fleet` | — | — | `work` | `dispatch` |
| Standard package handed to carrier / arrival recorded | `orders` | — | `orders`* | — | `orders` |
| Slot created / changed / closed | `fleet` | — | — | — | `slots` |
| Product submitted / approved / rejected | `catalog`, `inventory` | — | — | — | `review` |

Not announced, by decision:
- Catalogue, price and promotion edits — shopper-facing catalogue is out of scope (spec Assumptions).
- Cart, saved items and lists — the cart has its own synchronisation.
- Account, address and device changes — no live screen shows them.
- Back-office account and shop administration — no screen in FR-029.
- Every read.
