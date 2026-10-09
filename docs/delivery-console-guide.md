# Delivery console — operator guide

> ⚠ **PARTLY OUT OF DATE (2026-10-10, feature 083).** There is now ONE delivery model: an order is
> **Delivered by Effy** in a window (today, or one of the next delivery days) or sent by **Courier
> delivery**. Anything below about a same-day/standard method choice, a standard day handed to a carrier,
> the carrier lead time, the standard look-ahead, same-day zones or per-shop same-day exceptions, or a
> driver cleared "for same-day" describes the arrangement that was removed. The current model is in
> "Delivery model" in [CLAUDE.md](../CLAUDE.md); the old one in
> [archive/delivery-model-v1.md](archive/delivery-model-v1.md). This guide has not yet been rewritten.

**Who this is for:** back-office admins/managers who configure where Effy delivers and what it costs.
**Where it lives:** Back-office → **Delivery** (left nav). Features 047 (collection runs), 069 (slots and
days), 076 (coverage) and 077 (pricing).

> **The one rule to remember.** Whether Effy delivers to an address is decided by **one** thing: is the
> address's postcode on the **Coverage list**. If it is, the address is **Delivered by Effy**. If it is
> not, the shopper is told plainly *"Sorry, we can't deliver to this address."* — the same sentence on the
> address book and at checkout. **No shop setting changes this**, and neither does a group.

> ⚠ **Changed by 076 (October 2026).** Zones, distance tiers ("rings") and per-shop same-day exceptions
> **no longer have controls**. They were replaced by one flat list of postcodes.
>
> ⚠ **Changed by 077 (October 2026).** Delivery is priced **once per order** — never per shop — from the
> postcode's own distance, the basket's weight, the basket's value and the chosen window. Distance tiers
> and the same-day multiplier are **gone**. See **Tab — Pricing**.

---

## How the pieces fit together

```
   Address ─► postcode ─► on the Coverage list?  ── yes ─► DELIVERED BY EFFY ─► fee + delivery times
                                 │
                                 no ─► can a courier order be placed there? ── yes ─► COURIER DELIVERY ─► estimate + courier fee
                                                     │
                                                     no ─► "Sorry, we can't deliver to this address."
```

- **Coverage** is the list of postcodes Effy delivers to. It decides *whether* we deliver.
- A **group** is a name you file postcodes under. It decides nothing a customer sees.
- Every listed postcode has a **distance** from the hub — worked out, or entered by hand.
- The active **fee plan** turns (distance + basket weight + basket value + window) into ONE fee for the order.
- **Same-day**, **Time slots** and **Delivery days** decide which delivery times appear.
- **Settings** holds the hub (where distances are measured from) and the same-day prep buffer.

You configure these; the customer only ever sees the result: who delivers, and a fee.

---

## Tab 1 — Coverage

**What it is:** the list of postcodes Effy delivers to with its own drivers, built from real Australian
places. One row per postcode.

### Adding a place
**Add places** → type a suburb or town ("Richmond") → pick the right one. Same-named places are told apart
by state and postcode. Each result shows **every other place that postcode brings with it** — delivery is
decided by postcode, so adding Richmond (3121) also adds Burnley and Cremorne.

- You never type a postcode or a distance for a place the platform can locate.
- A place with **no known location** (a PO-box postcode, a new estate) asks for its distance from the hub.
- A postcode already on the list is shown and cannot be picked again.

### The columns
| Column | Meaning |
|---|---|
| **Postcode / Places** | the postcode and the places it covers. |
| **Group** | the group it is filed under, or "No group". |
| **Distance from hub** | straight-line km, and whether it was **worked out** or **entered by hand**. A **Review** tag means a hand-entered distance should be checked (the hub moved, or it came across from the old zones). |

### Distance
**Distance** on a row lets you enter it by hand, or hand it back to the platform ("Work it out instead").
A worked-out distance is recalculated whenever the hub moves; a hand-entered one never is.
> The next delivery feature prices by this number. A wrong distance will be a wrong fee.

### Removing a postcode
**Remove** tells you which places stop being Delivered by Effy. **Orders already placed there are not
affected.** A customer with a saved address there sees the refusal the next time the address is shown.

### Checking a postcode — "do we deliver there, and why?"
The **Check a postcode or place** box is for everyone in back-office, including customer service. It
answers in words you can repeat to a customer's question:
- *Delivered by Effy — On Effy's list. Group: Inner East. 3.40 km from the hub (worked out).*
- *Cannot deliver — Not on Effy's list. Courier delivery is switched off, so nobody delivers there.*
- *Cannot deliver — Not on Effy's list. Courier delivery is switched on and starts with the new delivery
  model — until then nobody delivers there.*
- *Cannot deliver — Not on Effy's list. Courier delivery is switched on but has no fee table or no
  estimate, so nobody delivers there.*
- *Cannot deliver — Not a known postcode.*

The group, the distance and the reason are for staff. **A customer is told the answer only.**

### Groups
A group ("Inner Melbourne", "Bayside") keeps a long list manageable: filter by it, select rows and
**Move to group**, rename it, remove it. **Removing a group never removes its postcodes** — they stay on
the list, in no group.

> ⚠ **The one thing a group still means, for now.** Drivers are cleared to deliver **per group** (or for
> everywhere) on the Drivers screen. So each group shows *"N drivers can deliver here"*, and postcodes in
> **no group** can only be delivered by a driver cleared for everywhere. If you are about to leave
> postcodes where **no** driver can deliver, the console asks you to confirm — orders would be sold there
> and could not be given to anyone. This goes away with the driver-operations feature.

### Courier delivery
An address **not** on Effy's list will be offered courier delivery — everywhere in the country except the
postcodes you exclude here (each with a reason, e.g. "No chilled courier service").

**Three things to set (079, 080), and an order they are needed in:**

1. **A courier fee table**, made active on the Pricing tab. Without a price there is nothing to charge.
2. **A courier service, made the default** (080) — under **Courier services** on this tab. Each service
   is one courier company's product Effy books: the courier's name, the service's name, **what customers
   are told** (*2–4 business days*), when a parcel with the courier counts as **late** (business days),
   its **pickup days and cut-off time**, and whether it **collects from suppliers**. Nothing is
   pre-filled — courier names are yours to enter. Checkout tells a courier customer the **default**
   service's timeframe, as the whole sentence: *"Usually arrives in 2–4 business days — an estimate, not
   a guaranteed date."* **An order keeps the estimate (and the service) it was sold**: editing a service
   changes what new customers are told, never a placed order. The default cannot be retired — make
   another the default first.
3. **Offer courier delivery** — the switch. It is locked until 1 and 2 are done, and the screen says
   which is missing.

**How courier parcels reach the courier** (080) — the platform default for new courier orders:

- **Via the hub** — Effy's drivers collect each parcel from its supplier, and the hub hands it to the
  courier (how it worked before 080). A parcel at the hub is **due out by its service's next pickup**.
- **Pickup from the supplier** — the courier collects each parcel straight from the supplier that packed
  it. No Effy driver is sent for it; the supplier sees the pickup in their console and marks it handed
  over. Book these on the order (Orders → the order → Packages → Courier consignment), with the pickup
  day and window — the supplier sees nothing to hand over until you do.

Staff can switch a single order either way until its first parcel leaves (Orders → the order →
Delivery type). See [the courier handover runbook](runbooks/courier-handover.md).

> ⚠ **Switching it on promises nobody anything before the new delivery model is on.** A courier order
> can only be placed by the new checkout, so until the cutover the screen says *"Switched on, and starts
> with the new delivery model"* and an address off Effy's list is still told Effy can't deliver there —
> on the address book, at checkout, and in the checker above. You can set courier delivery up ahead of
> time; it takes effect at the cutover and not a moment earlier.

**Offer courier when no delivery window is available** — a separate switch, off by default. It is about
addresses Effy **does** deliver to: when every window on every offered day is closed or taken, the
customer is told there are no windows and offered courier delivery instead (same estimate, same courier
fee). Off: they are told there are no windows and cannot pay. A postcode on the exclusions list is never
offered this. While any window is open, a customer is never offered a courier — they do not choose
between the two.

### What is frozen (until later delivery features)
| Was controlled by | Now |
|---|---|
| A zone's **distance tier (ring)** | **Removed by 077.** Every postcode is priced from its own distance (Tab — Pricing). |
| A zone's **same-day** switch | Kept as it stood for postcodes that had one. Everything added since is same-day eligible. |
| **Per-shop same-day exceptions** | Kept as they stood. They can no longer be added or changed. |

---

## Tab — Pricing (077)

**What it is:** what delivery costs. Two kinds of plan, each with **exactly one in force**:

- **Delivered by Effy** — every order to a postcode on the Coverage list.
- **Courier** — a courier fee table: a flat amount per order plus a weight band; no distance, no window,
  and its own optional free-delivery amount (Effy's never applies). It is what a courier order is
  charged (079), and courier delivery **cannot be switched on** without one in force.

You can keep several plans of each kind (a launch plan, a summer plan) — drafts, the one in force, and
retired ones kept as the record of what was charged.

### The fee (one per order — never per shop)
```
delivery = clamp( round-UP( base + distance band + weight band + window surcharge , step ), minimum, maximum )
basket ≥ free-delivery amount   → delivery is $0 (the window surcharge too)
basket < small-order amount     → + small-order fee (its own line, outside the maximum)
```
- **Distance band** — from the hub to the postcode, straight line (the distance on the Coverage list). A
  distance exactly on a boundary takes the **lower** band. The **last band has no upper limit**, so a
  postcode added later at any distance is priced without touching the plan.
- **Weight band** — the **whole basket's** weight. The heaviest band also prices everything above it.
- **Basket value** — the goods **after** any promotion, **before** delivery. Paying with points does not
  change it.
- **Window surcharge** — **Delivery today** is added to any window today (this is what makes same-day a
  bit dearer). A window can also carry its own surcharge on any day (a busy evening, say). Surcharges
  belong to the **plan**: replacing the plan never edits a window.
- **Round up / minimum / maximum** — snapped **up** to the step, never down; held between the two.

**A basket from three shops costs the same to deliver as the same goods from one.** Effy collects to the
hub and delivers once.

### Building a plan
**New plan** (or **Copy to new draft** on any plan) opens the editor: Amounts · Distance bands · Weight bands
· Basket rules · Window surcharges. **Saving a draft changes no fee.** What the draft is still missing is
listed at the top in plain words, for example *"The distance bands stop at 30 km. Add a last band with no
upper limit, so every distance has a price."*

Values are checked when you save (each problem is shown on its field): amounts on the rounding step,
minimum ≤ maximum, the small-order amount **below** the free-delivery amount, a courier table without
distance bands, window surcharges or a small-order fee.

### Activating a plan
**Activate** makes a draft the one in force for its kind, and retires the one before it in the same moment
— there is never a moment with none or two. It is refused, with every gap named, unless the plan prices
every distance and every weight, and a farther or heavier delivery never costs less. A **$0 minimum** must
be confirmed in words. A plan that has been active **cannot be edited or brought back** — copy it.

Activating changes **only what new checkouts cost**. An order already placed keeps the fee it was sold,
line by line — its receipt never changes. A customer on the payment step when the plan changes is shown the
new total before they can pay.

### Try a plan (the simulator)
Pick any plan (or "the one in force"), a postcode, a weight, a basket value and a window. You see what the
customer would see — the lines and the total — and every step that built it. It changes nothing, and
customer-service agents can use it to explain a fee on the phone. For an order already placed, open the
order: **"How the delivery fee was built"** shows the steps it was actually priced with.

### Worked examples (the dev seed plan: base $0, ≤10 km +$5, ≤25 km +$7, ≤50 km +$10, beyond +$15; ≤5 kg +$0, ≤10 kg +$2; today +$3)
| Address | Basket | Later day | A window today |
|---|---|---|---|
| Richmond 3121 (~3 km) | 3 kg | **$5.00** | **$8.00** |
| Richmond 3121 | 8 kg, from two shops | **$7.00** | **$10.00** |
| Geelong 3220 (~65 km) | 3 kg | **$15.00** | not offered (group not same-day) |

---

## Tab 4 — Same-day

Same-day has **two halves**: *when* it's possible (the collection schedule) and *where/who* (zone
eligibility + per-shop exceptions). Both are back-office decisions — a shop can never set its own same-day.

### Collection runs
Effy's drivers collect packages from shops on scheduled **runs**. Same-day is offered only while a run is
still makeable **today**, allowing the shop time to pick and pack (the **prep buffer** in Settings).

- **Add a run** — a wall-clock time (HH:MM, Australia/Melbourne) + an optional label.
- **The cutoff is derived, not typed.** For each run: `cutoff = run_time − prep_buffer`. Same-day is
  offered until the latest still-makeable run's cutoff.
  - **One run** = a single daily cutoff.
  - **Several runs** = availability extends through the day, run by run.

**Seeded example:** runs at **12:00** and **16:00**, prep buffer **120 min** → same-day is offered until
**10:00** (for the midday run) and then until **14:00** (for the afternoon run). Order at 13:00 → still
same-day (makes the 16:00 run). Order at 15:00 → standard only (both runs missed).

**When the driver actually comes (063, corrected 2026-09-30).** A run's time is when the driver
**collects**. The prep buffer is the shop's picking time between ordering closing and that run. The
planner assigns the collection round from **`run − planning lead`** (default **45 min**) up to the run
itself, re-checking every 5 minutes, so a package readied late in that window still makes the run. For a
16:00 run with a 120-min buffer: same-day ordering closes **14:00**, the shop picks, the round is planned
from **15:15**, and the driver collects by **16:00**.
> ⚠ Before 2026-09-30 the planner wrongly treated `run − buffer` as the collection deadline, sending
> drivers up to two hours early and leaving shops no time to pick. If you configured runs expecting that
> behaviour, re-check them.

> **Per-shop same-day exceptions** no longer have a control (076). Those that existed still apply,
> frozen, until the delivery checkout is replaced. What a shop fulfils never decides whether Effy
> delivers to an address.

---

## Tab — Time slots (069)

The windows a customer can choose for **same-day** delivery, like "5 pm – 7 pm".

> ⚠ **Same-day now needs an open slot.** With no active slot, same-day is offered to **nobody** — the
> tab shows a banner saying so. Create at least one slot before the release that turns this on.

> ⚠ **A slot is live the moment you save it.** There is no draft. The next customer to reach checkout
> sees it; one you switch off stops being offered at once.

| Field | Meaning |
|---|---|
| **Starts / Ends** | The window the customer is told, in Melbourne time (24-hour, HH:MM). |
| **Order by** | The slot's cutoff. After this it can no longer be chosen. It cannot be later than the start. |
| **Limit how many deliveries this slot takes** | A checkbox, unticked by default: the slot has **no limit** and takes every order placed before its cutoff. Tick it and enter a number to cap the slot; untick it later to remove the cap. One customer order to one address counts as **one**, however many packages it has. |
| **Delivery limit** (table column) | The number you set, or **No limit**. |
| **Booked today**, then one column per day | Confirmed orders plus customers currently at the payment step, **for that window on that day**. Updates by itself when an order is paid or cancelled. See "How full each window is" below. |

**A slot is offered only when all three hold:**

1. its **order by** time has not passed;
2. it has **room** — always true for a slot with no limit;
3. a **collection run** can still bring the goods to the hub before it starts — that is, a run the
   customer can still make (`now ≤ run − prep buffer`) that also satisfies
   `run + hub turnaround ≤ slot start`.

Rule 3 means the time a customer is shown as the last moment to order can be **earlier** than the
slot's own "order by". *Seeded example:* runs at 12:00 and 16:00, prep buffer 120 min, turnaround 60
min. A 17:00–19:00 slot with "order by 15:00" is really orderable until **14:00**, because the only
run that reaches the hub by 17:00 is the 16:00 one, and it closes to orders at 14:00.

**What happens at checkout.** When a customer chooses a slot and continues to payment, their place is
**held** for the hold time on the *Delivery days* tab (10 minutes by default). If they pay, it is theirs.
If they don't, the place goes back on offer when the hold ends. If the slot fills or closes while
they are choosing, they are told and asked to choose again — **nothing is charged and nothing is
chosen for them**.

**Changing a slot never changes a placed order.** Edit the times, lower the capacity or switch it
off: orders already placed keep the window they were sold. Lowering a limit below what is booked
keeps those bookings and simply takes no more.

**There is no delete.** Placed orders refer to the slot, so it is switched off instead.

**How full each window is, day by day (078).** After the limit come one column for today and one for
each **Effy delivery day** after it — as many as "Days offered after today" on the *Delivery days* tab
(3 by default). Days with no delivery are skipped, exactly as a customer's choices skip them. Each cell
is that window's bookings **on that day**: a full Thursday says nothing about Friday. "Full" and
"N over capacity" appear in the cell they belong to.
> ⚠ **The later-day columns are empty until the new delivery model is switched on.** Until then only
> same-day windows are sold, so only "Booked today" moves. The switch is not on this console: it is
> turned on at the cutover, once drivers can deliver a later-day window.

**"N over capacity"** (only on a slot with a limit). A customer who pays *after* their hold ended, into a slot that has since
filled, keeps the window they chose — they have paid for it. The slot's row then says how many such
orders it has. Check whether that evening's round can carry the extra drop.
> ⚠ **Nothing alerts you to this yet.** The alert rule is written but the monitoring stack that would
> run it does not exist. Look at this tab in the afternoon.

---

## Tab — Delivery days (069)

**Effy delivery days (078).** "Days offered after today" (1–14, default 3) is how many **delivery**
days after today a customer may choose a window on once the new delivery model is on. It changes
nothing a customer sees before then. The days with no delivery below apply to it too — and closing a
date now counts everyone promised that day, a window as much as a carrier day.

Which days a **standard** delivery can arrive, and three timings.

| Field | Meaning |
|---|---|
| **Days a customer can choose from** | How many days the checkout lists (1–30). Days with no delivery are skipped and **do not count** — "7" means seven days the customer can actually pick. |
| **No delivery on** | Days of the week with no standard delivery. At least one day must stay open. |
| **Carrier lead time (days)** | ⚠ An **estimate**. Hub handover → delivered. It sets the earliest day a customer is offered and the day each package must be handed to the carrier. |
| **Hub turnaround (minutes)** | ⚠ An **estimate**. Collection run → ready to leave the hub. Used by rule 3 above. |
| **Hold a same-day place for (minutes)** | How long a slot is held from "continue to payment". |
| **Dates with no delivery** | Individual dates, such as public holidays. |

**The earliest day offered** = the day the order can next be collected (today if a collection run can
still be made, otherwise tomorrow) **plus the carrier lead time**, moved forward past any day with no
delivery.

**Closing a date that orders are already promised.** The console tells you how many placed orders
carry that date. **They are not changed** — those customers were promised that day and paid. You
need to decide what to do about them.

> ⚠ These settings are saved with the hub. Set the hub on the **Settings** tab first; until then
> this tab shows the defaults and refuses to save.

---

## Tab — Settings

The two values that distances and same-day depend on:

| Field | Meaning |
|---|---|
| **Hub latitude / longitude** | Effy's operating hub — the point every postcode's distance is measured from. **Moving it recalculates every worked-out distance** and flags the hand-entered ones for review; the Save message says how many of each. Seeded to the Melbourne CBD (`-37.8136, 144.9631`). Internal only; never shown to shoppers. |
| **Same-day prep buffer (minutes)** | how long a shop needs to pick + pack before a collection run. It's what turns a run time into a customer cutoff (`cutoff = run − buffer`). Seeded to 120 min. |

Set the hub **before** adding places, or the platform has nothing to measure from and will ask for every distance by hand.

---

## Product weight — where it comes from (not in this console)

The fee's weight component comes from each product's **shipping weight**, set in **shop-web**
(Catalog → product → "Shipping weight (grams)"). A weight a shop records is **measured**; a product nobody
has weighed still carries a stated **assumed** default, so nothing is ever priced weightless or shipped
free. A basket's weight is the sum of its items; the engine picks the matching weight slab from that total.

---

## What the customer sees (and never sees)

**Sees:** whether we deliver to their address; the delivery charge **before they pay**, as plain lines —
Delivery, Window surcharge, Small-order fee, Free delivery — that add up to one GST-inclusive total; each
window's surcharge before choosing it; "Spend $N more for free delivery"; and the same lines on the order
page, receipt and email.

**Never sees:** a distance, a band, a weight, a plan name, the hub's location, or how many shops are behind
the order — one fee per order is what makes that true.

---

## Roles & the audit trail

- **Read** (see every tab): any active back-office staff, including CSA — "do we deliver to X?" is support
  work.
- **Change** (create/activate/toggle/settings): **admin** or **manager** only. The backend enforces this
  independently of what the UI shows.
- Every change — a coverage edit, a fee plan saved or activated, a settings save — is recorded with **who**
  made it, **when**, and what it was before and after.
- ⚠ Fees and same-day are **back-office decisions only**. The shop console has no control over any of them.

---

## Legal & pricing integrity (why it's built this way)

- Delivery is a taxable supply, so every fee shown is **GST-inclusive**.
- The exact fee is shown **before payment** and charged unchanged — no "drip pricing" (adding a fee at the
  last step is unlawful in Australia).
- Rounding **up** to a friendly figure is Effy's own fee (not a government charge), so it's fine — provided
  the shown fee is what's charged, which it always is.
- The **floor** is the "never lose money on a single delivery" guard; the **cap** keeps extreme baskets
  sane.
- A **small-order fee** and a **window surcharge** are shown as their own lines **before** the customer
  chooses and pays, under one total that is at least as prominent (component pricing, ACL s 48). "Free
  delivery" is free — surcharge included — so the claim stays true. *(Not legal advice; for your adviser.)*

---

## A quick "first-time setup" checklist

1. **Settings** → set the hub (lat/lng) + prep buffer.
2. **Coverage** → **Add places** by name. Optionally create groups and file postcodes under them. Check
   every group (and "No group") shows at least one driver who can deliver there.
3. **Pricing** → build a plan (distance bands ending in one with no limit, weight bands, step / minimum /
   maximum, a "Delivery today" amount; free-delivery and small-order amounts if you want them) → try it
   in the simulator → **Activate** it.
4. **Same-day** → add collection runs.
4a. **Time slots** (069) → create at least one slot. ⚠ Without one, same-day is offered to nobody.
4b. **Delivery days** (069) → set the days with no delivery and check the two estimated timings.
5. Test as a shopper: an address on the list says "Delivered by Effy" and shows a fee before pay; an
   address off it says "Sorry, we can't deliver to this address."
6. **Courier delivery** (080) → a courier fee table on Pricing, then **Courier services** → add the
   service you use and make it the default, choose how parcels reach the courier, then **Offer courier
   delivery**.

*Spec & implementation detail: `specs/076-effy-delivery-coverage/` (coverage),
`specs/077-delivery-fee-engine-v2/` (pricing) and `specs/047-delivery-shipping-engine/` (collection runs). Realistic dev seed:
`db/seeds/047_delivery_dev.sql`.*
