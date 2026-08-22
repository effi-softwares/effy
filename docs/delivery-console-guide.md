# Delivery console — operator guide

**Who this is for:** back-office admins/managers who configure where Effy delivers and what it costs.
**Where it lives:** Back-office → **Delivery** (left nav). Feature 047 (Delivery Zones & Shipping-Fee Engine).

> **The one rule to remember.** Whether Effy delivers to an address is decided by **one** thing: does the
> address's postcode belong to a **served zone**. If it does, standard delivery is always available and
> always priced. If it doesn't, the shopper is told plainly "we don't deliver here yet" — and that's the
> only reason there ever is. **Same-day is an extra** layered on top; it never affects whether an address
> is served.

---

## How the pieces fit together

```
              ┌─────────────┐     priced by      ┌──────────────┐
   Postcode ─►│    ZONE     │───────────────────►│    RING      │  (distance tier: how far from the hub)
              │ (served?)   │  belongs to exactly └──────────────┘
              └─────────────┘        one ring            │
                    │                                     │  each ring has a price in the…
                    │ same-day eligible?                  ▼
                    │ (+ per-shop exceptions)      ┌──────────────┐
                    ▼                              │  FEE PLAN    │  (the active one: prices + weight
              ┌─────────────┐                      │  (1 active)  │   slabs + method factors + rounding)
              │  SAME-DAY   │◄─ gated by ─┐        └──────────────┘
              │  SCHEDULE   │  collection │               │
              │ (runs+hub)  │  cutoff     │               ▼
              └─────────────┘             │        fee = round-up( factor × (ring price + weight add) )
                                          │               │  clamped to [floor, cap]
                                          └───────────────┴──► shown to the shopper at checkout,
                                                               GST-inclusive, before they pay
```

- A **zone** is the served area (a set of postcodes). It decides *whether* we deliver.
- Each zone sits in a **ring** — a distance tier. The ring decides the *distance part* of the price.
- The active **fee plan** turns (ring + basket weight + speed) into a dollar figure.
- **Same-day** eligibility + the collection **schedule** decide whether the fast option appears.
- **Settings** holds the hub (where distances are measured from) and the same-day prep buffer.

You configure these; the customer only ever sees the result: "we deliver here" and a fee.

---

## Tab 1 — Zones

**What it is:** the map of where Effy delivers, built from real Australian places. A zone is a named group
of **postcodes**. A postcode belongs to **at most one zone**.

**Why it matters:** this is the serviceability decision. Postcode in an *active* zone → we deliver.
Postcode in no zone (or a *disabled* zone) → "we don't deliver here yet".

### The columns
| Column | Meaning |
|---|---|
| **Code / Name** | your handle for the zone (e.g. `MEL-INNER-E`, "Inner East"). |
| **Ring** | which distance tier this zone is priced on (see Tab 2). |
| **Postcodes** | how many postcodes the zone contains. |
| **Same-day** | a toggle — is this zone eligible for same-day, for **every** shop by default? |

### The actions
- **New zone** — create a zone; pick its ring up front (you can change it later or let the platform
  suggest one).
- **Add postcode** — the important one. You search a **place by name** (e.g. "Richmond") — you don't type
  raw postcodes. Before you commit, the dialog tells you **every other place that postcode also makes
  serviceable** (serviceability is decided per *postcode*, and one postcode often covers several suburbs).
  Two guards:
  - if the postcode already belongs to **another zone**, it's refused and names that zone (a postcode is
    in one zone only);
  - if the postcode matches **no known place** (a PO-box code, or one missing from the loaded data), you
    must tick **confirm** to add it anyway — it's never silently accepted.
- **Suggest ring** — the platform computes the zone's representative location (the average of its
  postcodes' coordinates) and its straight-line distance from the **hub** (Settings), then suggests the
  matching ring. It's advisory — your chosen ring always wins. If none of the zone's postcodes has a
  known coordinate, it says "no coordinate — assign a ring by hand" rather than guessing.
- **Same-day toggle** — flip a whole zone same-day-eligible or not. This is the platform baseline for
  every shop; per-shop tweaks live in the **Same-day** tab dialog.
- **Same-day…** — opens the per-shop exceptions dialog for that zone (see Tab 4).

### Removing a postcode
Removing a postcode tells you **which places stop being serviceable** before it takes effect — so you
never quietly cut off a suburb.

> **In the platform:** when a shopper enters an address, the storefront checks its postcode against active
> zones. That same check runs again at checkout, so a shopper told "yes" up front is never refused at
> payment.

---

## Tab 2 — Rings

**What it is:** the distance tiers, ordered nearest-to-furthest from the hub. Every zone belongs to
exactly one ring. The ring is what the fee's **distance** component is priced on — *not* individual zones.

**Why rings, not per-zone prices?** Two reasons: (1) far zones should cost more than near ones without you
hand-pricing every zone; (2) a fee that varies by a *tier* (covering many suburbs) never reveals which
shop is fulfilling — it only reflects roughly how far the shopper's own area is.

### The columns / fields
| Field | Meaning |
|---|---|
| **Order** (ordinal) | 1 = nearest the hub. Rings are ranked by this. |
| **Code / Name** | e.g. `INNER` / "Inner Melbourne". |
| **Upper km** | the distance boundary used **only** to *suggest* a ring for a zone. Leave it **blank** on the single furthest, **open-ended** ring (regional). |
| **Status** | active/disabled. |

**Seeded example (Melbourne):** INNER ≤10 km · MIDDLE ≤25 km · OUTER ≤50 km · EXTENDED (blank = regional).

> Rings are **standing configuration** — they don't change when you switch fee plans. Only their *prices*
> live in the plan (Tab 3). The `upper km` values feed only the "Suggest ring" button; the customer quote
> reads a zone's assigned ring directly, never a distance.

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

### Half 1 — Collection runs (on this tab)
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

### Half 2 — Per-shop exceptions (the "Same-day…" button on each zone in Tab 1)
By default, a same-day-eligible zone is offered same-day by **every** shop. Reality differs — one shop has
a van and staff for it, another doesn't. The exceptions dialog lets you override a **specific shop** in a
**specific zone**:
- **Force off** — this shop does *not* do same-day here (even though the zone is eligible).
- **Force on** — this shop *does* do same-day here (even in a zone that isn't eligible by default).
- **Reset** — remove the exception; the shop reverts to the zone default.

> **In the platform:** same-day is decided **per package**. A basket split across two shops can show
> same-day on one shop's items and standard on the other's — the customer never sees the shops, only the
> combined options and one total. The rule is: `this shop does same-day here = exception if set, else the
> zone default` — and then only if a collection run is still makeable.

---

## Tab 5 — Settings

The two values that same-day and ring-suggestion depend on:

| Field | Meaning |
|---|---|
| **Hub latitude / longitude** | Effy's operating hub — the point all ring distances are measured from. Seeded to the Melbourne CBD (`-37.8136, 144.9631`). Internal only; never shown to shoppers. |
| **Same-day prep buffer (minutes)** | how long a shop needs to pick + pack before a collection run. It's what turns a run time into a customer cutoff (`cutoff = run − buffer`). Seeded to 120 min. |

Set the hub **before** using "Suggest ring", or the platform has nothing to measure from.

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
2. **Rings** → create your distance tiers (one open-ended/blank at the top).
3. **Zones** → create zones, add postcodes by place, run "Suggest ring" (or set the ring by hand).
4. **Fee plans** → build a plan (price every ring + at least one weight slab, set factors/rounding/floor/
   cap) → **Activate** it.
5. **Same-day** → add collection runs; on each eligible zone toggle same-day on; add per-shop exceptions
   where a shop can't (or specially can) do same-day.
6. Test as a shopper: an address in a zone shows a fee before pay; an address in no zone says "we don't
   deliver here yet".

*Spec & implementation detail: `specs/047-delivery-shipping-engine/`. Realistic dev seed:
`db/seeds/047_delivery_dev.sql`.*
