# Effy PRD: Client Feedback Round (October 2026)

4 October 2026 · Janith Madarasinghe

## Summary

The client asked for six changes. Four are new capability, one is a small extension of data the platform already holds, and one is already built and only needs deploying.

| # | Client request | Where Effy is today | Size |
| --- | --- | --- | --- |
| R1 | New products need Effy Admin approval, with cost/margin set by the admin | A shop publishes its own product straight to the storefront. No approval state, no cost or margin field, and back-office has no product screen at all | Large |
| R2 | Every product edit except stock quantity needs approval | Edits to a live product go live instantly | Large (shares R1's machinery) |
| R3 | Customer-created lists such as Weekly Items, Daily Items | One flat saved-items watchlist per customer; no named lists | Medium |
| R4 | Same-day time slots, a selectable date for standard delivery, delivery instructions | Method is chosen (same-day or standard) with a date-only promise. No slots, no date picker, and instructions are stored nowhere | Large |
| R5 | Driver sees the full item list, marked Frozen / Chilled / Normal | Driver sees item names and quantities at shop pickup only. No temperature label, and no item list at the customer drop | Small |
| R6 | Driver uploads a photo as proof of delivery | Built in feature 064 (photo, signature, contactless). Code-complete, not deployed, never walked on a device | Deploy and verify |

Two requests reverse earlier recorded decisions and need the client to confirm the trade-off: R1/R2 put a human gate in front of every shop catalogue change, and R4 commits Effy to delivery time windows the platform has so far refused to promise.

## Current state in the codebase

Each finding below was read from the repository on the `dev` branch, not from the status notes.

| Area | What exists | Where |
| --- | --- | --- |
| Product lifecycle | `status` is `draft`, `active`, `unavailable` or `archived`. A shop moves its own product to `active`; the only check is mandatory attributes plus a primary image | `db/migrations/20260716092105_product_catalog.sql`, `apis/edge-api/shop/src/products/service.ts` (`changeStatus`) |
| Product price | One `price_amount` and an optional `compare_at_amount`, both set by the shop. No cost, margin or commission column anywhere. `unit_cost` existed only on purchase orders and was dropped with purchasing (057 A1) | same migration; `20260910065158_remove_shop_purchasing.sql` |
| Back-office catalogue | Manages the schema only: product types, attributes, category taxonomy. It never reads or edits an individual product | `apis/edge-api/admin/src/catalog/`, `apps/back-office/src/features/catalog-schema` |
| What makes a product sellable | One shared rule: `status = 'active'` and in stock. A guard test forbids restating it elsewhere | `apis/core-api/internal/platform/availability/availability.go` |
| Saved items | `customer_saved_item`, one flat list per customer, with save-time price for the price-drop watch. Guest saving and merge on sign-in | `20260802052141_customer_saved_items.sql`, feature 033 |
| Delivery method | `same_day` or `standard` per package. Same-day is offered only before a cutoff derived from the collection-run schedule | `apis/core-api/internal/platform/delivery/`, `delivery_collection_run` |
| Delivery promise | `promised_from` / `promised_to` are `date` columns. No time of day is stored or derived | `order_package_delivery`, feature 052 research R4 |
| Delivery instructions | The driver contract carries `instructions` and three driver screens render it, but the service hard-codes `null`: no column stores it and checkout never collects it | `packages/shared-types/src/driver.ts`, `apis/edge-api/driver/src/work/delivery.ts:72` |
| Driver item list | Pickup manifest returns `name` and `qty` per package; the app shows only a total item count. The drop screen carries package refs, no items | `PACKAGE_ITEMS` in `apis/edge-api/driver/src/work/sql.ts`, `CollectionScreens.kt:307` |
| Temperature class | A `storage` product attribute with values `ambient`, `chilled`, `frozen`. The wave planner already reads it to match vehicles | `apis/edge-api/fleet/src/planner/sql.ts` |
| Proof of delivery | `delivery_proof` table, presigned S3 upload, camera capture on both mobile platforms, back-office exceptions screen | `20260921215440_driver_proof_custody.sql`, `apis/edge-api/driver/src/proof/`, `ProofScreens.kt` |

## R1. Product approval

No product reaches the storefront until an Effy admin has approved it and set its margin.

**Problem.** A shop can publish anything, at any price, with no Effy review. Effy also has nowhere to record what it earns on a product: the shop's price is the customer's price.

**Requirements**

1. A shop submits a finished product for review instead of publishing it. Submission runs the existing publish checks (mandatory attributes, primary image).
2. A submitted product is in review. It is not purchasable, not searchable and not on any rail until approved.
3. Back-office gains a Products area: a review queue (oldest first, filter by shop and state) and a product detail showing everything the shop entered, including images.
4. An admin or manager can approve, or send back with a written reason. A `csa` can read the queue but not decide.
5. On approval the admin sets the margin. The price the shop entered becomes the shop price; the customer price is shop price plus margin. Approval is refused while the margin is empty.
6. The shop sees each product's review state and, when sent back, the reason. It can fix and resubmit.
7. The shop is notified of the decision in the console and by web push (the 059 channel).
8. Every decision is written to `admin.audit_log` with the actor, the product and the margin set.
9. Shop-web and shop-mobile behave the same way.

**Acceptance**

- A product submitted by a shop cannot be found, viewed or bought by a customer before approval, by any route including a direct link.
- An approved product shows the customer price, never the shop price or the margin, on every customer surface.
- A shop never sees Effy's margin on another shop's product; whether it sees its own is an open question.
- A product sent back shows the admin's reason to the shop within one refresh.

**Impact to plan for**

- The one availability rule (`platform/availability`) gains an approval term. It is evaluated in 14 hot-path places, so the term goes in that one home.
- Existing live products need a rule on day one. Proposed: treat them as approved with zero margin and list them in the queue as "margin not set".
- Order, refund, receipt and Insights money all read `price_amount` today. Introducing a shop price beside the customer price changes what shop Insights revenue means.
- Review and decisions are cold-path work (`edge-api`); the storefront read stays on the hot path.

**Out of scope.** Bulk approval, auto-approval rules for trusted shops, and paying shops out.

## R2. Approval for product detail changes

An edit to an approved product is a proposal: the live product keeps selling unchanged until an admin approves the change.

**Problem.** Approving a product once means nothing if the shop can then rewrite its name, price or photos freely.

**Requirements**

1. Editing any detail of an approved product creates a pending change. Details covered: name, descriptions, brand, SKU, barcode, category, product type, attributes, price, compare-at price, weight and images.
2. Customers keep seeing the last approved version while a change is pending.
3. These changes apply immediately, with no approval: stock on hand, stock adjustments and counts, low-stock threshold, and switching stock tracking on or off.
4. Taking a product off sale (unavailable, archive) is immediate. Putting it back on sale is immediate if nothing else changed.
5. One pending change per product. The shop can keep editing it or withdraw it before a decision.
6. The back-office queue from R1 lists pending changes beside new products. The detail shows a before/after comparison of only the fields that changed.
7. A price change reopens the margin: the admin confirms or resets it when approving.
8. Approve, or send back with a reason; both audited and notified as in R1.
9. The shop's product screen shows the live version, the pending change and its state.

**Acceptance**

- After a shop edits a live product's name, the storefront, cart, search and saved items all still show the old name until approval.
- A stock adjustment made while a change is pending takes effect at once and does not disturb the pending change.
- A rejected change leaves the live product byte-for-byte as it was.
- An order placed while a change is pending is charged the approved price.

**Impact to plan for**

- This needs a stored proposed version separate from the live row, because every customer read must keep returning the approved one.
- Images: a pending image must be viewable by the admin and not by customers.
- Review volume is an operations cost. Every typo fix now waits on a person, so the queue needs a service target the client agrees to.

**Out of scope.** Field-level partial approval, and change history beyond the audit log.

## R3. Customer-created lists

A customer can sort saved products into lists they name themselves, such as Weekly Items or Daily Items.

**Reading of the request.** "Add New Category, similar to Favorite" is taken to mean customer-owned lists, not shop or admin product categories (back-office already manages those). This reading needs confirming.

**Problem.** Saved items is one flat watchlist. A grocery shopper who re-buys the same basket every week has no way to group it.

**Requirements**

1. A signed-in customer can create, rename and delete lists. Names are free text, unique per customer.
2. Every customer keeps the existing default list ("Saved"), which cannot be deleted.
3. Saving a product from the heart control still takes one tap and lands in the default list. A second action chooses or creates another list.
4. A product can be in more than one list.
5. Each list has its own page with the existing row design: current price, availability verdict, add to cart, remove.
6. "Add everything available to cart" works per list. This is the weekly-shop action.
7. Deleting a list removes its entries only; the products stay in any other list.
8. Customer-web and customer-mobile at parity.

**Acceptance**

- A customer creates "Weekly Items", adds five products and adds all five to the cart in one action.
- The heart on a product tile is filled if the product is in any of the customer's lists.
- Adding a list's items to the cart does not remove them from the list (the 033 watchlist rule holds).

**Impact to plan for**

- Saved items today is keyed (customer, product). Lists add a list entity and move membership to (list, product); the bulk membership read that fills the hearts must stay one request per screen.
- Guests: proposed that guests keep the single default list only, and named lists require sign-in.
- `/search` on customer-web has 0.5 KB of bundle budget left, so the list chooser must load on demand.

**Out of scope.** Sharing lists, scheduled or recurring orders, and lists built automatically from purchase history.

## R4. Delivery options at checkout

Checkout lets the customer pick a same-day time slot or a standard delivery date, and leave instructions for the driver. The client's reference is the Amazon checkout screenshot: dated options each with a price, slot chips under same-day, and an "Add delivery instructions" link under the address.

**Problem.** Checkout offers a method and nothing else. The promise is a date range the platform computes; the customer cannot choose when, and cannot tell the driver anything.

### R4a. Delivery instructions

1. The customer can add instructions at checkout: quick choices ("Leave at the door", "Meet at the door") plus free text up to 250 characters.
2. Instructions can be saved on an address as its default and overridden for one order.
3. They are stored on the order with the address snapshot, so a later address edit never changes a placed order.
4. The driver sees them on the en-route, arrived and drop screens. Those screens and the contract field already exist and currently receive nothing.
5. Back-office order detail and the customer's receipt show them. They do not appear in emails or telemetry.
6. "Leave at the door" marks the drop contactless, which 064 already requires a photo for.

### R4b. Same-day time slots

1. Back-office defines same-day delivery slots (for example 5 pm to 10 pm), each with a cutoff and a capacity.
2. Checkout shows only slots still open for the customer's address: before cutoff, under capacity, zone eligible for same-day.
3. The chosen slot is stored per package, shown on the confirmation, receipt and order page, and given to the driver as the drop's window.
4. If a slot fills or passes cutoff between quote and payment, the customer is told and re-chooses. The slot is never changed silently.
5. Times are Australia/Melbourne wall-clock, as the collection schedule already is.

### R4c. Standard delivery date

1. For standard delivery the customer chooses a date from the next available days, rather than receiving a computed range.
2. Available dates respect the collection schedule, non-delivery days and the zone.
3. Each option shows its fee before payment. Whether fees vary by date, as in the reference, is an open question.
4. The chosen date is stored per package and shown wherever the promise is shown today.

**Acceptance**

- A customer who types "Leave at the door" sees it on the receipt, and the driver sees it on the drop screen for that order.
- A slot at capacity is not offered to the next customer.
- A two-shop basket still lets each package take a different method (047 SC-011), and the customer chooses slot or date once per method, not once per shop.
- The fee shown at selection is the fee charged.

**Impact to plan for**

- **Standard delivery is handed to an external carrier at the hub (049).** Effy cannot honour a customer-chosen date unless the carrier accepts one or Effy drivers take over standard delivery. This must be settled before R4c is specified.
- The promise becomes a time window. Feature 052 corrected a designed "Today, 5:00 to 8:00 pm" down to a date because the business had not made that promise; R4b makes it, so receipts, emails and the order page change with it.
- The wave planner (063) builds rounds from collection runs. Slots add a delivery-side deadline and capacity it must respect.
- The quote and fee logic stays in its one home on the hot path; slot and schedule configuration is back-office, cold path.
- Customer-web and customer-mobile at parity.

**Out of scope.** Pickup points (shown in the reference, not requested), live driver tracking, and rescheduling after payment.

## R5. Driver order details

The driver sees every item in each package, each marked Frozen, Chilled or Normal, at pickup and at the customer's door.

**Problem.** At a shop the driver sees a package and an item count. At the customer there is no item list at all. Nothing tells the driver which bags need the cold compartment or which to hand over first.

**Requirements**

1. The pickup screen lists each package's items: name, quantity and temperature class.
2. The drop screen shows the same list for the packages being delivered.
3. Classes are Frozen, Chilled and Normal. They come from the product's existing `storage` attribute; `ambient` reads as Normal, and a product with no storage value is Normal.
4. Each package and each drop carries a summary ("2 frozen, 3 chilled, 6 normal") visible without opening it. Frozen and chilled items sort first.
5. The class is shown as a word with an icon. Colour may reinforce it but is never the only signal.
6. The class is recorded on the order line at purchase, so a later product edit cannot change what a driver is told about goods already packed.
7. Items a shop marked unavailable during picking are shown as not included, so the driver's list matches the bag.

**Acceptance**

- For an order with one frozen, one chilled and one shelf item, the driver sees three lines with three different labels on both screens.
- The driver app never shows prices or the shop identity behind a customer drop.

**Impact to plan for**

- Small. The manifest query already joins order lines; it gains the class. The drop detail gains an item list. The driver contract and its generated Kotlin change together (`driver-contract:check`).
- `storage` is mandatory only for the packaged-grocery product type today. To make labels trustworthy it should be mandatory for every food type, which R1's review step can enforce.

**Out of scope.** Item photos, per-item scanning, and temperature logging.

## R6. Delivery proof photo

This is already built. Feature 064 lets a driver complete a drop with a photo, a signature, or contactless (which requires a photo); what remains is deploying it and walking it on a device.

**What exists**

- Camera capture on Android and iOS, upload through a presigned URL to private storage, and a `delivery_proof` record per drop.
- A drop cannot be marked delivered if the photo failed to upload; the database refuses a photo proof with no image.
- Photos are archived, never deleted. Back-office has an exceptions screen for failed deliveries.
- Sign-off: 78 of 86 tasks, machine-verified, not deployed, not walked by a person (`specs/064-driver-proof-custody/SIGNOFF.md`).

**Remaining work**

- [ ] Deploy 063 then 064 to dev: migrations, `fleet` before `driver`, infrastructure apply.
- [ ] Walk one real same-day delivery with a photo on Android and on iOS.
- [ ] Confirm the photo can be opened from back-office order detail.

**Possible additions, pending the client's answer**

1. Make a photo mandatory on every delivery, including signed ones.
2. Show the proof photo to the customer on their order page and in the delivered notification.
3. Allow more than one photo per drop.

None of these is built. Each is small once 064 is live.

## Proposed sequencing

Six Spec Kit slices, ordered so the client sees results early and the two large decisions have time to settle.

| Order | Slice | Covers | Depends on | Blocked by a client answer |
| --- | --- | --- | --- | --- |
| 1 | Deploy and walk 063 + 064 | R6 | Nothing | No |
| 2 | Driver item list and temperature classes | R5 | Slice 1 live | No |
| 3 | Delivery instructions | R4a | Nothing; fills a field the driver app already renders | No |
| 4 | Product approval and margin | R1, R2 | Nothing technical | Yes: margin model, existing products |
| 5 | Customer lists | R3 | Nothing | Yes: confirm the reading |
| 6 | Delivery slots and dates | R4b, R4c | Slice 3; wave planner changes | Yes: standard-delivery carrier question |

Slices 1 to 3 need no decisions and can start now. R1 and R2 are specified as one slice because they share the review queue, the audit trail and the availability change; building R1 alone would leave an approval that any edit bypasses.

## Open questions for the client

**Product approval (R1, R2)**

- [ ] Is the price a shop enters its own price, with Effy adding margin on top to make the customer price? Or does the admin enter a cost and the customer price stays as the shop set it?
- [ ] Is margin a percentage, a fixed amount, or either?
- [ ] May a shop see the margin and customer price on its own products?
- [ ] Existing live products: stay live and get margin later, or come off sale until reviewed?
- [ ] Which edits may skip approval besides stock? Proposed: stock, low-stock threshold, and taking a product off sale.
- [ ] What review turnaround will Effy commit to shops?

**Lists (R3)**

- [ ] Confirm these are customer-created shopping lists, not new product categories managed by shops or admin.
- [ ] Should Effy offer starter lists (Weekly Items, Daily Items) to every customer, or start empty?

**Delivery (R4)**

- [ ] Standard delivery goes to an external carrier today. For a customer-chosen date, will the carrier accept a requested date, or should Effy drivers deliver standard orders too?
- [ ] What are the same-day slots and their cutoffs? How many deliveries per slot?
- [ ] Does the fee vary by slot or date as in the reference, or stay tied to method, distance and weight as now?
- [ ] How many days ahead can a standard date be chosen, and are there non-delivery days?

**Driver (R5, R6)**

- [ ] Is a photo required on every delivery, or is a signature alone acceptable?
- [ ] Should the customer see the proof photo?
- [ ] Should drivers also see items for standard packages they only carry to the hub?
