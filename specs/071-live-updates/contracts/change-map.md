# Contract: which change announces what

The binding list of announcing points. A guard test (research R8) holds the code to it: every
state-changing or scheduled function in these services either announces or is allow-listed with a
reason. Exact function files are fixed in `tasks.md` from the routes as they stand.

`orders`* in the customer column = only when the stage on the customer's own order page changed
(research R7). A refund, a cancellation or a refund request always tells the customer, once: it is
their money and it is on their page.

| Change | Service that commits it | shop | customer | driver | ops |
|---|---|---|---|---|---|
| Order paid (webhook / finalise) | `commerce` via shared payments | `orders` (each fulfilling shop) | `orders` | — | `orders`, `slots` |
| Customer cancels | `commerce` | `orders` | `orders` | `work` if assigned | `orders`, `slots` |
| Customer requests a refund | `commerce` | — | `orders` | — | `orders` |
| Staff cancels / refunds / declines | `orders` via shared payments | `orders` (not for a decline) | `orders` | `work` if assigned | `orders` |
| Shop manager refunds own lines | `shop` via shared payments | `orders` | `orders` | — | `orders` |
| Refund settles or fails (reconciler, webhook) | `commerce` | `orders` | `orders` | — | `orders` |
| Portion accepted / picking / ready | `shop` | `orders` | `orders`* | — | `orders` |
| Pick progress on an item | `shop` | `orders` (every pick; the apps coalesce) | — | — | — |
| Stock edited (count, threshold, tracking), or reduced by a sale | `inventory`; `commerce` for a sale | `stock` | — | — | — |
| Attention list gains or loses an entry | `shop` (evaluator, scheduled) | `attention` | — | — | — |
| Work assigned / reassigned / withdrawn | `fleet` (staff action, wave planner) | — | — | `work` (old and new driver) | `dispatch` |
| Driver collects (the handover from shop to driver) | `driver` | `orders` | `orders`* | — | `orders`, `dispatch` |
| Driver checks in at hub / reports a package unavailable / marks a drop en route or failed | `driver` | — | — | — | `orders`, `dispatch` |
| Driver delivers a drop (proof) | `driver` | `orders` | `orders`* | — | `orders`, `dispatch` |
| Driver goes on / off duty | `driver` | — | — | — | `dispatch` |
| Driver record, status, capability or duty changed by staff | `fleet` | — | — | `work` (status, update, duty) | `dispatch` |
| Carrier arrival recorded | `orders` | `orders` | `orders`* | — | `orders` |
| Standard package handed to carrier (no status changes) | `orders` | — | — | — | `orders`, `dispatch` |
| Refund proposal dismissed | `orders` | `orders` | — | — | `orders` |
| Slot created / changed / closed | `fleet` | — | — | — | `slots` |
| Product submitted / withdrawn / approved / sent back; margin set | `shop`, `catalog` | — | — | — | `review` |

Not announced, by decision:
- Catalogue, price and promotion edits — shopper-facing catalogue is out of scope (spec Assumptions).
- Cart, saved items and lists — the cart has its own synchronisation.
- Account, address and device changes — no live screen shows them.
- Back-office account and shop administration — no screen in FR-029.
- Every read.
