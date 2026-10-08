# Delivery console — operator guide

**Who this is for:** back-office admins/managers who configure where Effy delivers and what it costs.
**Where it lives:** Back-office → **Delivery** (left nav). Features 047 (fee engine), 069 (slots and days)
and 076 (coverage).

> **The one rule to remember.** Whether Effy delivers to an address is decided by **one** thing: is the
> address's postcode on the **Coverage list**. If it is, the address is **Delivered by Effy**. If it is
> not, the shopper is told plainly *"Sorry, we can't deliver to this address."* — the same sentence on the
> address book and at checkout. **No shop setting changes this**, and neither does a group.

> ⚠ **Changed by 076 (October 2026).** Zones, distance tiers ("rings") and per-shop same-day exceptions
> **no longer have controls**. They were replaced by one flat list of postcodes. The fee and the same-day
> offer still work as before for now, from the settings as they stood — see "What is frozen" below.

---

## How the pieces fit together

```
   Address ─► postcode ─► on the Coverage list?  ── yes ─► DELIVERED BY EFFY ─► fee + delivery times
                                 │
                                 no ─► courier delivery offered there?  ── yes ─► COURIER DELIVERY (not yet switched on)
                                                     │
                                                     no ─► "Sorry, we can't deliver to this address."
```

- **Coverage** is the list of postcodes Effy delivers to. It decides *whether* we deliver.
- A **group** is a name you file postcodes under. It decides nothing a customer sees.
- Every listed postcode has a **distance** from the hub — worked out, or entered by hand.
- The active **fee plan** turns (distance tier + basket weight + speed) into a dollar figure.
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

> ⚠ **The switch is locked for now.** Customers cannot place a courier order yet, so courier delivery
> cannot be switched on: every address in the country would be promised something checkout cannot sell.
> You can prepare the exclusions list in the meantime.

### What is frozen (until later delivery features)
| Was controlled by | Now |
|---|---|
| A zone's **distance tier (ring)** | Postcodes that were in a zone before 076 keep that zone's tier — **nobody's fee changed**. A postcode added since takes the tier its distance falls in. Tiers can no longer be created or edited. |
| A zone's **same-day** switch | Kept as it stood for postcodes that had one. Everything added since is same-day eligible. |
| **Per-shop same-day exceptions** | Kept as they stood. They can no longer be added or changed. |

---

## Tab 3 — Fee plans

**What it is:** the pricing rule sets. You can keep **several** plans (a launch plan, a seasonal plan, a
fuel-surcharge plan) but **exactly one is active** at a time. The active plan is what every new quote is
priced against.

### The fee formula (what the engine does per package)
```
fee = clamp(  round-UP( method_factor × ( ring_price + weight_add ) , rounding_step ),  floor,  cap )
```
- **ring_price** — the price for the destination zone's ring (from this plan).
- **weight_add** — the add for the basket's weight slab (from this plan).
- **method_factor** — `standard_factor` (usually 1.0) or `same_day_factor` (always ≥ standard).
- **round-UP** — snapped up to the `rounding_step` (e.g. the next $0.50) — never down.
- **floor / cap** — the fee is never below the floor (never free / never below cost) and never above the cap.

### The fields in "New plan"
| Field | Meaning | Seeded value |
|---|---|---|
| **Name** | your label. | "Melbourne Launch 2026" |
| **Rounding step** | the grid every fee snaps up to. | $0.50 |
| **Floor** | minimum fee, ever. Your "never lose money on a delivery" guard. | $4.00 |
| **Cap** | maximum fee, ever (stops an extreme basket/ring producing an absurd number). | $40.00 |
| **Standard factor (b)** | the multiplier for standard delivery. | 1.000 |
| **Same-day factor (a ≥ b)** | the multiplier for same-day — always at least the standard factor. | 1.600 |
| **Ring prices** | one price per ring (the distance component). | $5 / $7 / $10 / $15 |
| **Weight slabs** | "grams ≤ → add $". The top slab is **open-ended** (a heavier basket takes it). | ≤5 kg +$0, ≤10 kg +$2, ≤20 kg +$4.50, ≤40 kg +$8 |

**The rules the form enforces** (so a bad plan can't reach a shopper): same-day factor ≥ standard factor;
floor and cap are multiples of the step (so *every* fee, even a capped one, lands on a clean $x.00/$x.50);
cap ≥ floor.

### Activating a plan
**Activate** makes a plan the one live plan. It is **refused** — with the gap named — unless the plan can
price **every** served zone: every active ring must have a price, and there must be at least one weight
slab. This is the safety net that guarantees *a served zone can never fail to produce a price*.

Switching plans changes **only what new quotes cost**. It does **not** touch zones or same-day eligibility,
and it never re-prices an order that was already quoted — a captured order keeps the fee it was shown.

### Worked examples (with the seeded plan)
| Address | Basket | Standard | Same-day |
|---|---|---|---|
| Richmond 3121 (INNER) | 3 kg | (5+0)×1.0 = **$5.00** | 5×1.6 = **$8.00** |
| Richmond 3121 (INNER) | 12 kg | (5+4.50)×1.0 = **$9.50** | 9.50×1.6 = 15.20 → **$15.50** |
| Werribee 3030 (OUTER) | 8 kg | (10+2)×1.0 = **$12.00** | not offered (zone not eligible) |
| Ballarat 3350 (EXTENDED) | 15 kg | (15+4.50) = **$19.50** | not offered |

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
| **Booked today** | Confirmed orders plus customers currently at the payment step. Updates every 30 seconds. |

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

**"N over capacity"** (only on a slot with a limit). A customer who pays *after* their hold ended, into a slot that has since
filled, keeps the window they chose — they have paid for it. The slot's row then says how many such
orders it has. Check whether that evening's round can carry the extra drop.
> ⚠ **Nothing alerts you to this yet.** The alert rule is written but the monitoring stack that would
> run it does not exist. Look at this tab in the afternoon.

---

## Tab — Delivery days (069)

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

**Sees:** whether we deliver to their address; a single, **GST-inclusive**, rounded delivery fee shown
**before they pay**; a standard/same-day choice when same-day is available; a plain "we don't deliver here
yet" when it isn't.

**Never sees:** a distance figure, a ring name, or which shop fulfils their order. The banded, tier-based
pricing is deliberate so a fee can't be traced back to one shop (Effy's fulfilment is hidden by design).

---

## Roles & the audit trail

- **Read** (see every tab): any active back-office staff, including CSA — "do we deliver to X?" is support
  work.
- **Change** (create/activate/toggle/settings): **admin** or **manager** only. The backend enforces this
  independently of what the UI shows.
- Every change — a zone edit, a ring, a plan activation, a same-day toggle or exception, a settings save —
  is recorded with **who** made it and **when**.
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

---

## A quick "first-time setup" checklist

1. **Settings** → set the hub (lat/lng) + prep buffer.
2. **Coverage** → **Add places** by name. Optionally create groups and file postcodes under them. Check
   every group (and "No group") shows at least one driver who can deliver there.
3. **Fee plans** → build a plan (price every tier + at least one weight slab, set factors/rounding/floor/
   cap) → **Activate** it.
4. **Same-day** → add collection runs.
4a. **Time slots** (069) → create at least one slot. ⚠ Without one, same-day is offered to nobody.
4b. **Delivery days** (069) → set the days with no delivery and check the two estimated timings.
5. Test as a shopper: an address on the list says "Delivered by Effy" and shows a fee before pay; an
   address off it says "Sorry, we can't deliver to this address."

*Spec & implementation detail: `specs/076-effy-delivery-coverage/` (coverage) and
`specs/047-delivery-shipping-engine/` (fee plans, collection runs). Realistic dev seed:
`db/seeds/047_delivery_dev.sql`.*
