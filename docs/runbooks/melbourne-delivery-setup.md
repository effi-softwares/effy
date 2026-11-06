# Melbourne delivery setup (dev seed)

What `make seed-delivery ENV=dev` puts in the database, why each number is what it is, and how a delivery day
runs. The seed is [`db/seeds/047_delivery_dev.sql`](../../db/seeds/047_delivery_dev.sql). Change the two together.

**Everything seeded is in Melbourne time** (`Australia/Melbourne`, dev's operating zone). The platform stores
times of day and dates and reads them on Effy's clock. The **Sri Lanka columns are only a reading aid** for this
doc; nothing in the database is in Sri Lanka time.

## Melbourne time vs Sri Lanka time

Melbourne changes its clocks; Sri Lanka does not. So the gap changes twice a year:

| Period | Melbourne | Sri Lanka is |
|---|---|---|
| **4 Oct 2026 → 4 Apr 2027** (summer, *now*) | AEDT, UTC+11 | **5 h 30 min behind** |
| **4 Apr 2027 → 3 Oct 2027** (winter) | AEST, UTC+10 | **4 h 30 min behind** |

In the tables below, **SL (summer)** is the column to read today. **SL (winter)** applies from 4 April 2027.

---

## 1. The setup in one picture

```
 Shops (hidden)  ──collection run──►  HUB (Fishermans Bend)  ──delivery round──►  Customer
  pick & pack         every 2 h         check in, sort, load        in the chosen
  (90 min)          08:00 … 18:00          (60 min)                2-hour window
```

- **Hub:** Fishermans Bend, Port Melbourne (-37.826, 144.925). This is the industrial strip between the CBD and the
  West Gate Freeway: 4 km from the CBD, with CityLink and the West Gate a few minutes away. It reaches the west,
  north and south-east equally well.
- **Area:** 86 real Melbourne postcodes in 7 groups, all within about 20 km of the hub in a straight line.
- **Windows:** six two-hour windows a day, 09:00–21:00, seven days a week, plus "Any time".
- **Collection runs:** six a day, each one hour before a window starts.
- **Price:** usually **$6–$14** for delivery, never more than **$25**. Free from **$150** of goods. One active plan, plus a retired one and drafts for Christmas, a free-delivery fortnight and 2027 (section 7).

---

## 2. A delivery day, hour by hour

Example: a Tuesday, for a customer within 15 km of the hub.

| Melbourne | SL (summer) | SL (winter) | What happens |
|---|---|---|---|
| 06:30 | 01:00 | 02:00 | Ordering closes for **today 09–11** and for **Any time / ASAP today** |
| 07:15 | 01:45 | 02:45 | 08:00 collection round opens to the driver |
| 08:00 | 02:30 | 03:30 | **Early run** done: parcels at the hub |
| 08:15 | 02:45 | 03:45 | 09–11 delivery round opens to the driver |
| 08:30 | 03:00 | 04:00 | Ordering closes for **today 11–13** |
| 09:00 | 03:30 | 04:30 | **09–11 window** starts (vans leave the hub) |
| 10:00 | 04:30 | 05:30 | **Morning run** done |
| 10:30 | 05:00 | 06:00 | Ordering closes for **today 13–15** |
| 11:00 | 05:30 | 06:30 | **11–13 window** starts |
| 12:00 | 06:30 | 07:30 | **Midday run** done |
| 12:30 | 07:00 | 08:00 | Ordering closes for **today 15–17** |
| 13:00 | 07:30 | 08:30 | **13–15 window** starts |
| 14:00 | 08:30 | 09:30 | **Afternoon run** done |
| 14:30 | 09:00 | 10:00 | Ordering closes for **today 17–19** |
| 15:00 | 09:30 | 10:30 | **15–17 window** starts |
| 16:00 | 10:30 | 11:30 | **Late afternoon run** done |
| 16:30 | 11:00 | 12:00 | Ordering closes for **today 19–21** (the last window today can be ordered for) |
| 17:00 | 11:30 | 12:30 | **17–19 window** starts |
| 18:00 | 12:30 | 13:30 | **Evening run** done |
| 19:00 | 13:30 | 14:30 | **19–21 window** starts |
| 21:00 | 15:30 | 16:30 | Last deliveries done |

After 16:30 Melbourne time (11:00 in Sri Lanka in summer), a customer can only choose **tomorrow or later**.

**Checked against the platform's own window rule:** at 06:00 all six windows are open for today; at 08:00 five;
at 11:00 three (15–17, 17–19, 19–21); at 16:00 one (19–21); at 17:00 none.

---

## 3. Delivery windows

What a customer chooses at checkout: **one window for the whole order**, either today (shown under
"Same-day delivery") or on one of the next 6 delivery days (shown under "Standard delivery").

| Window (Melbourne) | SL (summer) | SL (winter) | Order by (Melbourne) | Order by (SL summer) | Extra charge |
|---|---|---|---|---|---|
| 09:00–11:00 | 03:30–05:30 | 04:30–06:30 | 06:30 | 01:00 | – |
| 11:00–13:00 | 05:30–07:30 | 06:30–08:30 | 08:30 | 03:00 | – |
| 13:00–15:00 | 07:30–09:30 | 08:30–10:30 | 10:30 | 05:00 | – |
| 15:00–17:00 | 09:30–11:30 | 10:30–12:30 | 12:30 | 07:00 | – |
| 17:00–19:00 | 11:30–13:30 | 12:30–14:30 | 14:30 | 09:00 | **+$2.00** (dinner peak) |
| 19:00–21:00 | 13:30–15:30 | 14:30–16:30 | 16:30 | 11:00 | **+$1.00** |
| **Any time** (09:00–21:00) | 03:30–15:30 | 04:30–16:30 | 06:30 | 01:00 | – |

- **The "order by" time applies on the delivery day itself.** It is the window's cutoff, 2 h 30 min before the
  window starts: 90 minutes for the shop to pick and pack, then the collection run, then 60 minutes at the hub.
  For a later day the cutoff is far away, so in practice only today's windows close during the day.
- **No order limit.** No window (Any time included) has a limit, so a window never fills: it closes only at its
  "order by" time. One van does about 12 drops in a two-hour window at 10 minutes a drop, so watch the rounds; if
  the vans can't keep up, set a limit per window in back-office › Settings › Delivery windows. A full window then
  disappears for that day, and nothing is moved to another window.
- **Any time** is the default under "Standard delivery": the customer picks a day, not a time, and the order goes
  on any round that day. **ASAP** orders go into Any time on the first delivery day still open: today if
  the order is placed before 06:30, otherwise tomorrow. The customer is told **"usually today or tomorrow"**,
  never the exact day. Any time pays the plain fee: no window charge and no "Delivery today" charge.
- **Delivery today costs $3.00 more** (see section 7).

---

## 4. Collection runs (shops → hub)

Drivers collect parcels from the shops and check them in at the hub. Each run serves the window that starts an
hour later. A parcel goes on the **latest run that still makes its window**.

| Run | Melbourne | SL (summer) | SL (winter) | Driver's round opens | Serves window |
|---|---|---|---|---|---|
| Early run | 08:00 | 02:30 | 03:30 | 07:15 | 09–11, and Any time |
| Morning run | 10:00 | 04:30 | 05:30 | 09:15 | 11–13 |
| Midday run | 12:00 | 06:30 | 07:30 | 11:15 | 13–15 |
| Afternoon run | 14:00 | 08:30 | 09:30 | 13:15 | 15–17 |
| Late afternoon run | 16:00 | 10:30 | 11:30 | 15:15 | 17–19 |
| Evening run | 18:00 | 12:30 | 13:30 | 17:15 | 19–21 |

- **The run time is when collection must be finished.** The driver's round opens 45 minutes earlier
  (`planning_lead_min`), so the driver does the shop pickups in the 45 minutes before each run time.
- **Shops must be picking from about 07:00.** Orders for the 09–11 window close at 06:30, and the first driver
  arrives from 07:15.
- **"Any time" and courier parcels** have no window, so they go on the next run after the shop marks them ready.

---

## 5. Delivery rounds (hub → customers)

These are not set up by hand. The planner makes **one round per window, on that window's day**, every 5 minutes,
and gives it to a driver who is cleared for the area.

| Round for window | Opens to the driver (Melbourne) | SL (summer) | SL (winter) | Must be done by |
|---|---|---|---|---|
| 09–11 | 08:15 | 02:45 | 03:45 | 11:00 |
| 11–13 | 10:15 | 04:45 | 05:45 | 13:00 |
| 13–15 | 12:15 | 06:45 | 07:45 | 15:00 |
| 15–17 | 14:15 | 08:45 | 09:45 | 17:00 |
| 17–19 | 16:15 | 10:45 | 11:45 | 19:00 |
| 19–21 | 18:15 | 12:45 | 13:45 | 21:00 |

- **Planning time per drop:** 10 minutes (`per_stop_allowance_min`).
- **Alerts:** a van not loaded **20 minutes** after it should be is flagged (`load_overdue_min`), and so is a
  check-in at the hub **30 minutes** late (`checkin_overdue_min`).
- **Vehicle check before a shift:** off.
- ⚠ **Rounds need drivers and vans.** The reset removed both; this seed adds neither (see section 10).

---

## 6. Days

- **Effy delivers seven days a week.** No weekday is closed.
- **The customer sees today plus the next 6 delivery days:** a full week to choose from.
- **Closed days**, which are Victoria's restricted trading days: shops are shut on Christmas Day and Good Friday,
  and until 1 pm on Anzac Day (Effy takes the whole day off). A closed day is skipped and the next open day takes
  its place.

| Date | Day |
|---|---|
| Fri 25 Dec 2026 | Christmas Day |
| Fri 26 Mar 2027 | Good Friday |
| Sun 25 Apr 2027 | Anzac Day |
| Sat 25 Dec 2027 | Christmas Day |

Example: on 23 December the customer is offered 23, 24, 26, 27, 28, 29 and 30 December. The 25th is skipped.

---

## 7. Pricing - Effy delivery

### The plans

Only **one Effy plan prices orders at a time**: the active one. The seed also adds the plans a real business would
keep: the one it launched with (retired, kept as the record) and drafts ready for the next season. Staff switch
plans in back-office › Settings › Pricing; activating a draft retires the active plan on the spot. A plan that has
ever been active can't be edited again, only copied to a new draft.

| Plan | State | When | Base | Today + | Evening + | Highest | Free from | Small order |
|---|---|---|---|---|---|---|---|---|
| Soft launch Oct 2026 | retired | 20 Oct – 2 Nov 2026, staff and friends trial | $5 | – | – | $15 | $100 | – |
| **Melbourne launch 2026** | **active** | since 2 Nov 2026 06:00 Melbourne | $6 | $3 | 17–19 $2, 19–21 $1 | $25 | $150 | $5 under $50 |
| Christmas peak 2026 | draft | 1 Dec, then Melbourne 2027 from 27 Dec | $6 | $5 | 15–17 $1, 17–19 $3, 19–21 $2 | $30 | $200 | $5 under $50 |
| Free delivery fortnight | draft | a two-week marketing push | $6 | $3 | 17–19 $2, 19–21 $1 | $25 | **$60** | $4 under $40 |
| Melbourne 2027 | draft | from 27 Dec 2026, after the Christmas peak | $7 | $4 | 17–19 $2.50, 19–21 $1.50 | $27 | $200 | $5 under $50 |

- **Soft launch:** three coarse distance bands (up to 10 km +$0, 10–20 km +$2, beyond +$5) and three weight bands
  (up to 20 kg +$0, 20–45 kg +$3, beyond +$6).
- **Melbourne 2027:** slightly steeper distance (10–15 km +$2.50, 15–20 +$4, 20–30 +$6, beyond +$9). This is how
  a delivery business prices once customers rely on it. Free from $200 sits closer to the supermarkets' $250.
- **Every other plan** uses the launch plan's distance and weight bands below.
- **Christmas:** the busy evenings cost more, and free delivery needs a bigger basket. Woolworths and Coles keep
  their thresholds year-round but raise window prices at peak.
- **The calendar:** launch now, Christmas peak on 1 Dec, Melbourne 2027 on 27 Dec. Staff activate each one by hand;
  nothing switches plans by date. ⚠ **A retired plan can't be switched back on**, only copied to a new draft. So to
  return to launch prices after the free-delivery fortnight, copy "Melbourne launch 2026" to a draft first.

**The same basket under each plan** (from the platform's fee engine):

| Basket | Soft launch | **Launch** | Christmas | Free fortnight | 2027 |
|---|---|---|---|---|---|
| Southbank, 6 kg, $85, tomorrow 13–15 | $5.00 | **$6.00** | $6.00 | free | $7.00 |
| Brunswick, 14 kg, $120, tomorrow 17–19 | free | **$10.50** | $11.50 | free | $12.00 |
| the same, **today** 17–19 | free | **$13.50** | $16.50 | free | $16.00 |
| Camberwell, 22 kg, $95, **today** 11–13 | $10.00 | **$14.00** | $16.00 | free | $16.50 |
| Doncaster, 25 kg, $110, Friday 19–21 | free | **$13.50** | $14.50 | free | $15.50 |
| Footscray, 55 kg (pet food, drinks), $120, tomorrow 15–17 | free | **$14.00** | $15.00 | free | $15.00 |
| St Kilda, 4 kg, $38, Any time | $5.00 | **$12.00** | $12.00 | $11.00 | $13.00 |
| Footscray, 18 kg, $165, **today** 17–19 | free | **free** | $15.50 | free | $15.00 |
| Camberwell, 80 kg, $140, **today** 17–19 | free | **$25.00** | $28.00 | free | $27.00 (highest) |

The St Kilda row includes the small-order fee in every plan but the soft launch.

### The active plan: Melbourne launch 2026

**One fee per order**, never per shop. It is worked out like this:

```
fee = base + distance band + weight band + window charges  →  rounded UP to 50c  →  kept between $6 and $25
      then: goods ≥ $150 → delivery is free (window charges included)
            goods <  $50 → + $5 small-order fee
```

| Part | Amount |
|---|---|
| Base | **$6.00** |
| Delivery today (any window today) | **+$3.00** |
| 17–19 window / 19–21 window | **+$2.00 / +$1.00** |
| Rounding | up to the next **$0.50** |
| Lowest / highest fee | **$6.00 / $25.00** |
| Free delivery | goods of **$150** or more |
| Small-order fee | **+$5.00** when goods are under **$50** |
| Order minimum | **$20** of goods to check out at all |

**Distance**: straight line from the hub to the postcode (roads are about 1.3 times longer).

| Distance | Adds | Roughly |
|---|---|---|
| up to 6 km | $0.00 | CBD, Southbank, Docklands, Port Melbourne, Fitzroy, Footscray, Williamstown |
| 6–10 km | $1.00 | Richmond, South Yarra, St Kilda, Brunswick, Northcote, Moonee Ponds |
| 10–15 km | $2.00 | Kew, Camberwell, Malvern, Brighton, Preston, Sunshine, Altona |
| 15–20 km | $3.50 | Box Hill, Doncaster, Mount Waverley, Oakleigh, Sandringham |
| 20–30 km | $5.00 | Clayton |
| over 30 km | $8.00 | (nothing on the list yet) |

**Weight**: the whole basket.

| Basket | Adds | Typical |
|---|---|---|
| up to 10 kg | $0.00 | a top-up shop, a gadget, a few household items |
| 10–20 kg | $1.50 | a weekly shop for 1–2 people |
| 20–30 kg | $3.00 | a family weekly shop |
| 30–45 kg | $5.00 | drinks cases, a microwave, an air fryer |
| 45–70 kg | $8.00 | bulk pet food, cat litter, a large TV |
| over 70 kg | $12.00 | the heaviest band (also prices anything above 100 kg) |

**Why these numbers.** Effy sells groceries **and** household goods, electronics and general merchandise (a
Walmart-style range), so it is priced between the supermarkets and the general retailers (late 2026):

| Retailer | Delivery fee | Free from | Minimum |
|---|---|---|---|
| Woolworths | $8–$15 by window; $15 for under 2 hours | $250 | $50 ($30 under 2 hours) |
| Coles | $2–$12 by window; $15 Rapid | $250 | $50 ($30 Rapid) |
| Big W | $8 metro | $59 | none |
| Kmart | $10 metro (large items excluded) | $65 | none |
| Amazon AU | | $59 (eligible items) | none |
| **Effy** | **$6–$25 in a 2-hour window**, typically $8.50–$11 | **$150** | **$20** (+$5 under $50) |

- **The fee** is in the supermarket range: a typical weekly shop pays **$8.50–$11**, and same-day costs $3 more.
- **Free from $150** sits between the supermarkets ($250) and the general retailers ($59–$65). Those retailers
  deliver by parcel in 2–7 days; Effy delivers in a 2-hour window from a local shop.
- **The $20 minimum** lets a convenience order through, such as a charger, batteries or a few essentials. The $5
  small-order fee means it still pays for its drop.
- **Heavy baskets** pay for the weight, up to $12 extra. The highest fee is $25, and nothing on the current list
  reaches above it. The cap only stops a postcode beyond 30 km from costing more.
- **Not handled: bulky items.** The engine prices weight, not size, so a fridge, washing machine or mattress
  costs the same as anything else that weighs as much. These need two people and don't fit Effy's van rounds.
  Keep them off sale, or plan a separate bulky-delivery feature (JB Hi-Fi charges about $59 metro for one).

### Worked examples

These come from the platform's own fee engine.

| Order | Calculation | Customer pays |
|---|---|---|
| Southbank (2.4 km), 6 kg, $85, tomorrow 13–15 | 6 + 0 + 0 = $6.00 | **$6.00** |
| Brunswick (7.3 km), 14 kg, $120, tomorrow 15–17 | 6 + 1 + 1.50 = $8.50 | **$8.50** |
| the same, tomorrow 17–19 | 8.50 + 2 (peak) | **$10.50** |
| the same, **today** 17–19 | 8.50 + 2 + 3 (today) | **$13.50** |
| Camberwell (12.7 km), 22 kg, $95, today 11–13 | 6 + 2 + 3 + 3 (today) | **$14.00** |
| Doncaster (18.2 km), 25 kg, $110, Friday 19–21 | 6 + 3.50 + 3 + 1 | **$13.50** |
| Clayton (20.2 km), 40 kg, $140, Saturday 17–19 | 6 + 5 + 5 + 2 | **$18.00** |
| Footscray (2.6 km), 55 kg (pet food, litter, drinks), $120, tomorrow 15–17 | 6 + 0 + 8 | **$14.00** |
| Camberwell (12.7 km), 80 kg, $140, **today** 17–19 | 6 + 2 + 12 + 2 + 3 | **$25.00** (the highest) |
| St Kilda (6.5 km), 4 kg, **$38**, Any time | 6 + 1 + 0 = $7 + $5 small order | **$12.00** |
| Southbank (2.4 km), a $22 phone charger, Any time | $6 + $5 small order | **$11.00** |
| Footscray (2.6 km), 18 kg, **$165**, today 17–19 | would be $12.50, but goods ≥ $150 | **$0.00** |

---

## 8. Pricing - courier delivery (switched OFF)

Courier delivery covers addresses **off** the postcode list, anywhere in Australia. Its fee table is set up and
active, but **courier delivery is off and there is no courier service**. A courier's name, timeframe and pickup
days are real-world facts the business enters itself, so they are never seeded. Until then an address off the
list gets *"Sorry, we can't deliver to this address."*

| Part | Amount |
|---|---|
| Flat fee | **$10.00** (Kmart charges $10 metro; Big W $8 metro, $10 regional) |
| up to 3 kg / 3–5 / 5–10 / 10–20 / 20–30 / over 30 kg | +$0 / +$3 / +$6 / +$12 / +$18 / +$28 |
| Highest fee | **$40.00** |
| Free | goods of **$99** or more (Big W's regional amount) |

Examples: 2 kg, $60 → **$10**; 8 kg, $90 → **$16**; 25 kg, $98 → **$28**; 45 kg, $80 → **$38**; 8 kg, $110 →
**free**.

A second courier table, **Courier Christmas peak 2026** (draft), covers December, when carriers add peak
surcharges:

| | Active 2026 | Christmas peak (draft) |
|---|---|---|
| Flat fee | $10 | $12 |
| 3–5 / 5–10 / 10–20 / 20–30 / over 30 kg | +$3 / +$6 / +$12 / +$18 / +$28 | +$4 / +$8 / +$15 / +$22 / +$33 |
| Highest fee / free from | $40 / $99 | $45 / $129 |
| 2 kg, $60 → 8 kg, $90 → 25 kg, $98 → 45 kg, $80 | $10 → $16 → $28 → $38 | $12 → $20 → $34 → $45 |
| 8 kg, $110 | free | $20 |

**To turn it on:** back-office → Delivery → Coverage → Courier delivery. Add a courier service, make it the
default, then switch courier delivery on.

---

## 9. Coverage - the postcode list

**Delivered by Effy** = the address's postcode is on this list. Nothing else decides it.

- **Groups** only organise the list and limit which areas a driver is cleared for. They never change what a
  customer sees.
- **Distance** is the platform's own: the straight line from the hub to the postcode's main locality.
- **Delivery today (✓)** is offered only within **15 km** of the hub, about 25 minutes' drive. Farther postcodes
  are offered the next 6 days, with no today. The customer is not told why.

### City & Port Phillip - all ✓
| Postcode | km | Suburbs |
|---|---|---|
| 3207 | 0.9 | Port Melbourne, Garden City |
| 3006 | 2.4 | Southbank, South Wharf |
| 3008 | 2.4 | Docklands |
| 3003 | 2.7 | West Melbourne |
| 3205 | 3.0 | South Melbourne |
| 3206 | 3.2 | Albert Park, Middle Park |
| 3051 | 3.3 | North Melbourne, Hotham Hill |
| 3031 | 3.9 | Flemington, Kensington |
| 3053 | 4.4 | Carlton, Carlton South |
| 3052 | 4.6 | Parkville |
| 3000 | 5.2 | Melbourne (CBD) |
| 3002 | 5.2 | East Melbourne |
| 3004 | 5.2 | Melbourne (St Kilda Road) |

### Inner West - all ✓
| Postcode | km | Suburbs |
|---|---|---|
| 3011 | 2.6 | Footscray, Seddon |
| 3013 | 3.5 | Yarraville |
| 3015 | 4.1 | Newport, Spotswood, South Kingsville |
| 3016 | 5.3 | Williamstown |
| 3012 | 6.0 | West Footscray, Maidstone, Kingsville, Brooklyn, Tottenham |
| 3032 | 6.2 | Ascot Vale, Maribyrnong |
| 3039 | 6.7 | Moonee Ponds |
| 3025 | 7.6 | Altona North |
| 3019 | 7.8 | Braybrook |
| 3040 | 8.5 | Essendon, Aberfeldie |
| 3020 | 10.0 | Sunshine, Albion |
| 3018 | 10.6 | Altona, Seaholme |
| 3041 | 10.7 | Strathmore, Essendon North |
| 3042 | 12.1 | Airport West, Niddrie, Keilor Park |

### Inner North - all ✓
| Postcode | km | Suburbs |
|---|---|---|
| 3065 | 5.3 | Fitzroy |
| 3054 | 5.7 | Carlton North, Princes Hill |
| 3066 | 5.9 | Collingwood |
| 3068 | 6.6 | Fitzroy North, Clifton Hill |
| 3067 | 6.9 | Abbotsford |
| 3055 | 7.1 | Brunswick West |
| 3056 | 7.3 | Brunswick |
| 3057 | 7.7 | Brunswick East |
| 3070 | 8.8 | Northcote |
| 3058 | 10.2 | Coburg |
| 3071 | 10.3 | Thornbury |
| 3078 | 10.3 | Fairfield, Alphington |
| 3044 | 10.6 | Pascoe Vale |
| 3072 | 11.7 | Preston |

### Inner East - ✓ except the last two
| Postcode | km | Suburbs | Today |
|---|---|---|---|
| 3121 | 6.8 | Richmond, Cremorne, Burnley | ✓ |
| 3122 | 9.3 | Hawthorn | ✓ |
| 3101 | 10.0 | Kew | ✓ |
| 3123 | 10.9 | Hawthorn East | ✓ |
| 3079 | 12.4 | Ivanhoe | ✓ |
| 3124 | 12.7 | Camberwell | ✓ |
| 3103 | 13.2 | Balwyn, Deepdene | ✓ |
| 3126 | 13.2 | Canterbury, Camberwell East | ✓ |
| 3081 | 14.1 | Heidelberg Heights, Heidelberg West | ✓ |
| 3104 | 14.2 | Balwyn North | ✓ |
| 3127 | 15.1 | Surrey Hills, Mont Albert | – |
| 3105 | 15.3 | Bulleen | – |

### South-East - ✓ except the last three
| Postcode | km | Suburbs | Today |
|---|---|---|---|
| 3141 | 6.0 | South Yarra | ✓ |
| 3181 | 7.0 | Prahran, Windsor | ✓ |
| 3183 | 8.1 | Balaclava, St Kilda East | ✓ |
| 3142 | 8.4 | Toorak | ✓ |
| 3143 | 9.1 | Armadale | ✓ |
| 3161 | 9.9 | Caulfield North | ✓ |
| 3144 | 10.2 | Malvern | ✓ |
| 3162 | 11.3 | Caulfield, Caulfield South | ✓ |
| 3145 | 12.1 | Malvern East | ✓ |
| 3146 | 12.2 | Glen Iris | ✓ |
| 3163 | 14.0 | Carnegie, Glen Huntly, Murrumbeena | ✓ |
| 3147 | 15.5 | Ashburton, Ashwood | – |
| 3125 | 15.7 | Burwood | – |
| 3148 | 15.8 | Chadstone | – |

### Bayside - ✓ up to Hampton
| Postcode | km | Suburbs | Today |
|---|---|---|---|
| 3182 | 6.5 | St Kilda | ✓ |
| 3184 | 8.1 | Elwood | ✓ |
| 3185 | 10.0 | Elsternwick, Ripponlea | ✓ |
| 3186 | 11.7 | Brighton | ✓ |
| 3187 | 13.5 | Brighton East | ✓ |
| 3204 | 14.1 | Bentleigh, McKinnon, Ormond | ✓ |
| 3188 | 14.5 | Hampton | ✓ |
| 3165 | 15.9 | Bentleigh East | – |
| 3191 | 16.5 | Sandringham | – |
| 3189 | 16.8 | Moorabbin | – |
| 3190 | 17.1 | Highett | – |

### Middle ring (no same-day) - none ✓
| Postcode | km | Suburbs |
|---|---|---|
| 3166 | 16.8 | Oakleigh, Hughesdale, Huntingdale |
| 3128 | 17.3 | Box Hill |
| 3129 | 17.7 | Box Hill North |
| 3167 | 17.9 | Oakleigh South |
| 3083 | 18.0 | Bundoora |
| 3108 | 18.2 | Doncaster |
| 3149 | 18.8 | Mount Waverley |
| 3168 | 20.2 | Clayton, Notting Hill |

**Totals:** 86 postcodes; 69 get delivery today, 17 get the next days only.

⚠ **The locality file has no address counts**, so for each postcode the platform picks the alphabetically first
locality as its "main" place. That is why back-office may show "Garden City" first for 3207 or "Hotham Hill" for
3051. It also slightly shifts a few distances (3000 comes out at 5.2 km). Every distance is still a real
distance; back-office can override any of them by hand.

---

## 10. Everything else the seed sets

| Setting | Value | Meaning |
|---|---|---|
| Shop prep time | 90 min | from ordering closing to the collection run |
| Hub turnaround | 60 min | from a run arriving to the vans leaving |
| Round opens early by | 45 min | before its run time / window start |
| Place held while paying | 10 min | a window place is kept while the customer pays |
| Courier delivery | off | no courier service yet |
| Courier when no window left | off | an in-area customer is never pushed to courier |

**Not seeded, on purpose:**
- **A courier service.** The business enters it (see section 8).
- **Legal name and ABN** for tax invoices. These are real identifiers the business supplies.
- **Drivers.** They are Cognito accounts: back-office → Drivers → add, then clear each one for collection and/or
  delivery, in a group or everywhere.
- **Vans.** `db/seeds/061_fleet_dev.sql` adds a small fleet and gives the first two shops addresses (Richmond
  3121, Footscray 3011, both on the list).

---

## 11. How to run it

```
make load-localities ENV=dev CSVREL=db/reference/au-localities-full.csv REPLACE=1   # once: the whole country
make seed-delivery ENV=dev
```

- **It refuses to run while any order exists**, because orders point at windows and fee plans. Run
  `make reset-dev-data ENV=dev` first.
- **It refuses to run without the Victorian localities**, so no postcode's distance is ever guessed.
- **It is safe to run again.** Groups and windows keep their ids, so driver clearances and window charges stay
  attached; the list, plans, runs and closed days are replaced.
- **What it prints:** one summary line per group. All seven groups should appear, adding up to 86 postcodes.

Everything here can be changed afterwards in back-office → Delivery (Coverage, Pricing, Windows, Collection runs,
Delivery days). If you change the seed file instead, update this page too.
