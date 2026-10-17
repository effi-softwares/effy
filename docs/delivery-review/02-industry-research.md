# 02 — Industry Research: How Delivery and Last-Mile Platforms Work

**Date:** 2026-10-18 · **Scope:** reference platforms, industry-standard concepts and data model,
AU courier and compliance landscape, last-mile SaaS table stakes, buy-vs-build for a small team.
**Audience:** whoever reviews Effy's delivery system next (spec authors, the operator).

> **How to read this.** Every substantive claim carries a URL. Where a source is a vendor blog, a
> third-party aggregator, or older than ~2 years, it is flagged. Prices are list prices found on the
> date above, in USD unless marked AUD, and change often; re-check before budgeting.
>
> **Relationship to earlier research.** `docs/research/logistics/research-01..07` already covers
> dispatch engines (Onfleet/DoorDash/Uber/Instacart internals), route sequencing and matrix
> providers, the fleet/driver data model, real-time transport to the driver app, proof of delivery,
> zones, and step sequencing. Those reports were written for **Melbourne / Victoria**. This report
> deliberately does **not** repeat them; it adds (a) the AU grocery and courier market as it stands in
> late 2026, (b) slot/window management as a discipline, (c) the **NSW** compliance picture (Effy is
> now Sydney), (d) verified 2026 pricing for SaaS and routing APIs, and (e) a table-stakes /
> buy-vs-build synthesis. Where an older report already answered something, this one points at it.

---

## Contents

1. Executive summary
2. Reference platforms — how each models delivery
3. Industry-standard concepts and the canonical data model
4. Delivery windows / slot management
5. Route optimisation and dispatch
6. ETA, live tracking and customer notifications
7. Proof of delivery, failed delivery, safe-drop, returns
8. Grocery temperature chain
9. Scanning and chain of custody (GS1)
10. Driver app and dispatcher console best practice
11. KPIs and benchmarks
12. Australian courier / aggregator integration
13. Australian employment and compliance (NSW focus)
14. MVP guidance for a small team
15. Matrix: table stakes vs differentiators vs nice-to-have
16. Buy vs build table with indicative pricing
17. References

---

## 1. Executive summary

1. **Effy's chosen shape is mainstream, not exotic.** "Customer picks one window; own drivers deliver
   from a hub; out-of-area goes to a courier" is how Woolworths, Coles (Ocado CFCs), Ocado UK, Kroger
   (Ocado hub + spokes) and Picnic all work in principle. Effy's two-leg flow (shops → hub → customer)
   is the Kroger/Ocado **hub-and-spoke** pattern turned inside out: Effy collects *into* one hub from
   many small nodes, then delivers *out*. ([Kroger spoke](https://massmarketretailers.com/kroger-fulfillment-spoke-extends-reach-of-denver-hub/),
   [Coles CFCs](https://foodprocessing.com.au/content/materials-handling-storage-and-supply-chain/news/coles-opens-its-second-customer-fulfilment-centre-in-sydney-1069173759))
2. **The AU grocery bar in 2026:** 1–6 h windows from ~4am–11pm, $50 minimum, fees ~$2–$15 that vary
   by **basket size, window and day**, free delivery at ~$250 or with a ~$15–19/month subscription,
   rapid (< 1 h) delivery at ~$15, unattended delivery standard (alcohol/tobacco excluded), amend/cancel
   cutoffs the evening before. ([CHOICE comparison](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services),
   [Woolworths delivery](https://www.woolworths.com.au/shop/services/delivery))
3. **Rapid delivery in AU is now outsourced to gig platforms.** Woolworths runs Milkrun (33-min average,
   third-party couriers) and joined DoorDash in Dec 2025; Coles went exclusive with Uber Eats the same
   day. On-demand is ~40% of Woolworths' online orders. Owning a 10–30-minute fleet is what killed
   Milkrun (Apr 2023), Getir's western exit and Gorillas. ([Yahoo/Woolworths-DoorDash](https://finance.yahoo.com/news/woolworths-partners-doordash-extend-fast-112224645.html),
   [Inside FMCG](https://insidefmcg.com.au/2025/12/11/woolworths-joins-doordash-as-coles-sides-with-uber-eats/),
   [Forbes AU on Milkrun](https://www.forbes.com.au/news/investing/woolworths-acquires-milkrun/))
4. **Density beats speed.** Picnic's "milkman" model reports ~14 drops/hour vs ~4 for conventional
   grocery e-commerce by *restricting which slots a customer is offered* per neighbourhood. Ocado
   tracks drops per van per week (176 in 2016) and shows a "green van" hint at slot choice. Academic
   work (Agatz et al.) finds **green labels on slots shorten routes more than price discounts do**.
   ([Substack/Picnic](https://consumergoodies.substack.com/p/explained-what-is-milkman-20),
   [Retail Week/Ocado](https://www.retail-week.com/city/ocado-outlines-target-depot-and-delivery-efficiencies/5014838.article),
   [Agatz, Fan & Stam](https://papers.ssrn.com/abstract=3656982))
5. **Slot holds are a standard primitive with a short TTL.** Instacart holds a slot for **10 minutes**,
   one hold per user, a new hold cancels the old one, and an expired hold is an explicit error; DoorDash
   Drive quotes must be accepted within **5 minutes**. Effy's "hold at payment-intent, confirm at
   payment, never substitute" matches this practice.
   ([Instacart hold](https://docs.instacart.com/connect/api/fulfillment/delivery/create_service_option_hold),
   [DoorDash quotes](https://developer.doordash.com/en-US/docs/drive/how_to/quote_deliveries))
6. **Table stakes for an in-house last-mile system** (what every SaaS ships even at the cheapest tier):
   route plan per driver with ETAs, driver app with navigation hand-off, photo + signature POD, live
   tracking link, status-triggered SMS/email, API + webhooks, basic analytics. Barcode scanning, age
   verification and auto-dispatch are **upsell tier** features (Onfleet "Scale"), i.e.
   differentiators. ([Onfleet pricing](https://onfleet.com/pricing))
7. **Routing is cheap to buy at Effy's volume.** Google Route Optimization: Single Vehicle Routing
   free to 5,000 shipments/month then $10/1,000; Fleet Routing free to 1,000 then $30/1,000.
   Routific: free to 100 orders/month, $150/month to 1,000. GraphHopper and open-source VROOM / OR-Tools
   are alternatives. **Do not build a solver.** ([Google Maps pricing](https://developers.google.com/maps/billing-and-pricing/pricing),
   [Routific pricing](https://www.routific.com/pricing))
8. **NSW changes the compliance picture from the Victorian research.** Tracking employees' vehicles
   needs **14 days' written notice** and a visible notice on the vehicle (Workplace Surveillance Act
   2005); same-day alcohol delivery needs ID checks for every customer, RSA-style training, delivery only
   9am–midnight (11pm Sun) and refusal records kept ≥ 1 year. Vans ≤ 4.5 t GVM are outside HVNL
   heavy-vehicle fatigue rules, but WHS fatigue duties still apply.
   ([Sprintlaw WSA](https://sprintlaw.com.au/articles/workplace-surveillance-act-2005-nsw-explained/),
   [L&GNSW fact sheet](https://www.liquorandgaming.nsw.gov.au/__data/assets/pdf_file/0005/1107599/Same-Day-Alcohol-Delivery-Framework-Fact-Sheet-I-Oct-2022.pdf),
   [NHVR](https://www.nhvr.gov.au/document/46), [SafeWork NSW](https://www.safework.nsw.gov.au/resource-library/transport-postal-and-warehousing/work-health-and-safety-in-the-road-freight-transport-industry/risk-assessment-fatigue))
9. **Courier fallback: integrate one aggregator, not N carriers.** Australia Post/StarTrack APIs require
   a contract; CouriersPlease and Aramex AU are mostly reached through aggregators (ShipEngine,
   EasyPost, Shippit, Starshipit). Shippit's allocation engine picks the cheapest or fastest carrier per
   order and also brokers Uber Direct. ([AusPost API](https://auspost.com.au/lodgement/api/documentation/),
   [Shippit allocation](https://shippit.com/?p=48981), [Retailbiz/Shippit–Uber](https://www.retailbiz.com.au/?p=38881))
10. **The big traps for small teams:** chasing speed before density; building optimisation before
    there are enough drops to optimise; per-package (not per-order) promises; a second source of truth
    for status; and skipping the boring exception paths (failed delivery, return to hub, partial
    delivery) that cost ~$14–18 each when they go wrong.
    ([Upper on metrics](https://www.upperinc.com/blog/last-mile-delivery-metrics/) — vendor figure)

---

## 2. Reference platforms — how each models delivery

### 2.1 Woolworths (AU)

- **Channels:** scheduled home delivery, same-day, **Delivery Now** (from 60 min, fee from $15, $18 at
  some locations, select stores), Pick up, **Direct to boot**, **Direct to boot Now**, the **Milkrun**
  app, and DoorDash. ([Woolworths delivery](https://www.woolworths.com.au/shop/services/delivery),
  [Yahoo](https://finance.yahoo.com/news/woolworths-partners-doordash-extend-fast-112224645.html))
- **Fee model:** fees "vary based on your basket size, chosen delivery window, and day of the week";
  same-day and scheduled fees start at $15 and fall as the basket grows; a **midweek 6-hour window
  (Tue–Thu) for $2** at $50 minimum; Sunday attracts an extra $2–3 service fee. This is an explicit
  *price-the-flexible-slot-cheaper* lever. ([Woolworths delivery](https://www.woolworths.com.au/shop/services/delivery))
- **Windows and cutoffs:** windows of 1–5 h between ~4am and 10pm (varies by location); amend cutoff
  5:30pm the day before for morning windows, 10:30pm for afternoon, or 30 min before window close;
  same-day: order by 1pm. ([CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services),
  [Woolworths](https://www.woolworths.com.au/shop/services/delivery))
- **Subscription:** Delivery Unlimited $15/month or $119/year, free delivery from $50.
  ([CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services))
- **Unattended delivery:** offered; excludes alcohol, tobacco and sharp objects. (same source)
- **Rapid:** Metro60 was rebranded Milkrun after Woolworths bought the failed startup's brand in May
  2023; it uses third-party couriers, average 33 minutes, from 630+ stores. ([Forbes AU](https://www.forbes.com.au/news/investing/woolworths-acquires-milkrun/),
  [Yahoo](https://finance.yahoo.com/news/woolworths-partners-doordash-extend-fast-112224645.html))
- **Scale signal:** on-demand options are **40% of online orders**; Woolworths added 1 million extra
  delivery/pickup slots for December 2025. (Yahoo, above)

**Effy relevance:** Woolworths prices by basket + window + day, as Effy does (weight band rather than
basket value; "Delivery today" surcharge). The cheap long-window option is the same idea as Effy's
"day with no time" / "Any time" (085), and Woolworths prices it markedly cheaper.

### 2.2 Coles / Coles Online (AU)

- **Fees:** standard $2–$11; $50 minimum; free at $250+ or $50+ with **Coles Plus ($19/month)**;
  windows of 1, 2, 4 or 6 hours, 4am–11pm; cutoff 12pm the day before in CHOICE's tests; $30
  cancellation fee; unattended delivery excludes alcohol, tobacco and non-bagged orders; "Rapid
  delivery" $15 for up to 40 items. ([CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services),
  [CHOICE Coles review](https://www.choice.com.au/products/shopping/everyday-shopping/supermarkets/coles-online))
- **Fulfilment:** two Ocado-powered **customer fulfilment centres** — Truganina (VIC, Sept 2024, ~87,000
  m², >10,000 orders/day at capacity) and **Wetherill Park (NSW, Oct 2024, 40 km west of Sydney CBD)**;
  700+ bots pick a 50-item order in ~5 minutes. Part of a ~$400m Ocado partnership.
  ([Food Processing](https://foodprocessing.com.au/content/materials-handling-storage-and-supply-chain/news/coles-opens-its-second-customer-fulfilment-centre-in-sydney-1069173759),
  [mi-3](https://mi-3.com.au/23-09-2024/coles-unveils-first-automated-customer-fulfilment-centre-victoria-shake-online-grocery))
- **Rapid:** exclusive with **Uber Eats** from Dec 2025 (up to 17,000 products, under an hour), after
  leaving DoorDash. Standard Coles Online orders are usually next-day.
  ([Uber newsroom](https://www.uber.com/en-AU/newsroom/coles-ubereats-partnership),
  [Inside FMCG](https://insidefmcg.com.au/2025/12/11/woolworths-joins-doordash-as-coles-sides-with-uber-eats/))
- (Note: the "Voila" brand is Sobeys' Ocado service in Canada; Coles does not use it.)

**Effy relevance:** the competitor Effy's Sydney customers know best runs a central automated CFC in
western Sydney + next-day by default + rapid outsourced to Uber. Effy's distributed shops + one hub is a
lighter-capex version; its competitive gap is speed, so the "today" window and courier fallback matter.

### 2.3 Other AU players

- **Harris Farm:** 3, 6 or 8 h windows; free at $250 (or $200 for 6/8 h and pre-dawn slots) — again
  cheaper for wider windows; express fee tiers by basket. **IGA:** 2 h windows, $9 flat, cancel until
  picking starts. ([CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services))
- **Milkrun (startup):** promised ~10-minute delivery from dark stores, collapsed 14 April 2023 with
  400 staff made redundant, unable to raise more capital. "All of the startups failed after promising
  10-minute delivery, an unrealistic and costly pledge." ([Forbes AU](https://www.forbes.com.au/news/investing/woolworths-acquires-milkrun/),
  [Inside Retail NZ](https://insideretail.co.nz/2023/06/29/why-were-unlikely-to-see-another-wave-of-rapid-delivery-startups/))
- **Amazon Australia** sells groceries (ambient) via its parcel network; Amazon Fresh (chilled) has not
  launched in AU as of this writing (not independently verified this pass — treat as an assumption).

### 2.4 Instacart (US/CA)

- **Model:** marketplace; shoppers pick in retailer stores and deliver (full-service) or retailers'
  own drivers deliver (last-mile). Offers scheduled windows, ETA-based options and "priority ETA".
- **Slot API primitives** (the cleanest public reference model found):
  - `ServiceOption` {id, date, window {start_at, end_at, type: scheduled | eta | priority_eta, asap},
    availability {available, reasons[] (e.g. alcohol restriction), item_codes[]}}.
  - `ServiceOptionHold` {id, expires_at, service_option}; **10-minute TTL**; one hold per user; a new
    reserve cancels the previous hold; using an expired option is an explicit error ("The requested
    ETA option has expired"); reserve **late** in checkout to reduce expiry.
  ([Instacart hold](https://docs.instacart.com/connect/api/fulfillment/delivery/create_service_option_hold),
  [desired windows](https://docs.instacart.com/connect/fulfillment_guide/how_to/retrieve_desired_windows))
- **Batching:** orders are grouped into batches (double up to quintuple; multi-store), with batching,
  shopper assignment and pay solved as one optimisation in Gurobi. ([Gurobi case study](https://www-old.gurobi.com/case_studies/instacart-delivering-optimal-shopping-experiences/),
  [Ridesharing Driver](https://www.ridesharingdriver.com/instacart-double-batches/))

**Effy relevance:** `availability.reasons` is a good pattern for telling the client *why* a window is
off (e.g. alcohol hours) without exposing internals. Effy's hold-at-intent matches the "reserve late"
advice.

### 2.5 Amazon Logistics — DSP and Flex

- **DSP (Delivery Service Partner):** independent small businesses (not Amazon employees) run fleets of
  Amazon-branded vans out of Amazon delivery stations; launched 2018 with "as little as $10,000" start-up,
  starting at ≥ 5 vans growing to ~20, with Amazon-negotiated discounts on vans, fuel and insurance.
  **Routes are generated by Amazon's routing software**; the DSP owns hiring, scheduling and coaching.
  ([CNBC 2018](https://www.cnbc.com/amp/2018/06/27/amazon-is-recruiting-entrepreneurs-to-start-delivery-networks.html),
  [CBS](https://www.cbsnews.com/miami/news/got-10k-amazon-wants-you-to-start-business-to-deliver-its-packages/),
  [GeekWire 2024](https://www.geekwire.com/2024/amazon-plans-rate-increases-and-routing-technology-improvements-for-delivery-firms/))
- **Flex:** gig drivers reserve **blocks** (typically 2–4 h, some 1–6 h) in an app, check in at the
  station (no more than 15 min early), scan and load packages, then follow an in-app route; paid per
  block not per drop. ([Amazon Flex UK blog](https://flex.amazon.co.uk/blog/package-collection-tips/),
  [Gridwise](https://gridwise.io/blog/everything-you-need-to-know-about-amazon-flex) — third-party)

**Effy relevance:** the **block** is the gig analogue of Effy's round: a time-boxed unit of work with a
station check-in that opens it. Effy's `round_opens_at` + "refuse before open" is the same discipline
as Flex's "no earlier than 15 minutes".

### 2.6 Ocado (UK) and Ocado Smart Platform partners (Kroger, Coles)

- **Network:** large automated CFCs plus **spokes** (cross-dock sites that extend reach). Kroger's
  spokes receive orders picked at a hub, check them and load them into refrigerated vans holding up
  to ~20 orders; vans travel up to ~90 minutes from hub/spoke.
  ([Mass Market Retailers](https://massmarketretailers.com/kroger-fulfillment-spoke-extends-reach-of-denver-hub/),
  [Supermarket News](https://www.supermarketnews.com/retail-financial/kroger-ocado-expand-delivery-south-florida))
- **Routing:** objective is *deliver inside the agreed slot first, minimise fuel second*; constraints
  include van weight/capacity, driver hours, road restrictions and congestion charges; the problem is
  dynamic (orders added/amended/cancelled); travel times predicted by ML from history; solver is a
  metaheuristic + genetic algorithm tested in simulation. ([OR Society, Jan 2023](https://theorsociety.com/ORS/Publications/Magazines/IOR/January2023/OR-and-Ocado-are-beating-the-vehicle-routing-problem.aspx))
- **Productivity metric:** **drops per van per week** — 121 (2009) → target 175 → 176 achieved in
  2016, partly from routing changes that "pack customers more densely into routes".
  ([Retail Week](https://www.retail-week.com/city/ocado-outlines-target-depot-and-delivery-efficiencies/5014838.article),
  [Current News](https://current-news.co.uk/ocado-using-route-calculation-software-to-maximise-delivery-efficiency-8529))
- **Green van:** at slot choice, customers can see whether a van is already nearby in a slot.
  ([Current News](https://current-news.co.uk/ocado-using-route-calculation-software-to-maximise-delivery-efficiency-8529))

### 2.7 Picnic (NL/DE/FR) — the milkman model

- Customers get a **selection of slots, not free choice**; the number of slots offered depends on
  neighbourhood density (3 one-hour slots/week at launch, 6 by late 2016; dense areas daily). Trips are
  built by an adapted **VRPTW** over the whole day, with bin-packing of totes by temperature zone and
  fragility, ML-predicted drop times (tote count, time of day, weather, floor, lift access), and a
  greedy van-loading heuristic. ([Picnic jobs blog](https://jobs.picnic.app/blogs/picnic-10-years-2016the-milkman-routes))
- One-hour windows, free delivery, small electric vans; ~14 drops/h vs ~4 for rivals; new routes added
  only when enough sign-ups exist in an area (waitlist). ([Substack](https://consumergoodies.substack.com/p/explained-what-is-milkman-20),
  [Retail Week](https://www.retail-week.com/technology/how-algorithms-automation-and-the-milkman-model-are-powering-picnic/7032843.article))
- Goods move from a fulfilment centre to local **hubs**, delivered from there by EV.
  ([Mileway](https://mileway.com/our-customers/picnic-transforming-the-way-europe-grocery-shops/))

**Effy relevance:** Picnic proves the *offer fewer, denser slots* lever; Effy's per-window capacity
already allows it (set capacity per window/date), but nothing yet varies offered windows by area density.

### 2.8 Tesco / Sainsbury's (UK)

- Tesco moved from £2–£7 slot-dependent pricing to a flat £4.50 (citing pick/pack/deliver cost), and
  sells **Delivery Saver** subscriptions (originally £36/3 months; later an anytime pass ~£7.99/month;
  the cheaper midweek pass was dropped). ([Yorkshire Post](https://www.yorkshirepost.co.uk/read-this/tesco-is-scrapping-its-cheap-home-delivery-slots-heres-how-much-youll-have-to-pay-2923699),
  [Fresh Plaza](https://www.freshplaza.com/north-america/article/2097013/uk-tesco-unveils-delivery-saver-offer/))
  — undated articles; shows both directions (variable → flat) are viable.
- Sainsbury's: edit items, change slot or cancel **until 11pm the day before**; earlier cutoff (8pm)
  for products with long preparation; a change requires re-checkout to re-reserve the slot.
  ([Sainsbury's help](https://help.sainsburys.co.uk/help/delivery-collection/order_amend))

### 2.9 Quick commerce — Getir, Gorillas, Zapp, Gopuff

- **Gopuff:** vertically integrated dark stores (owns inventory); separate staging area for drivers;
  batches orders; low basket values make economics depend on density; >200 sites created long payback.
  ([Retail Dive](https://www.retaildive.com/news/gopuff-plans-to-open-a-digital-first-retail-store/607536),
  [Sacra](https://sacra.com/research/gopuff))
- **Gorillas/Getir:** salaried riders with speed promises left utilisation too low to cover basket
  size; Getir bought Gorillas (2022) then exited US, UK, Germany and the Netherlands (Apr 2024). France
  ruled dark stores are warehouses for zoning. ([The Grocer](https://www.thegrocer.co.uk/supply-chain/why-the-partys-over-for-rapid-delivery/669491.article),
  [TechCrunch](https://techcrunch.com/?p=2559730), [Sacra](https://sacra.com/chat/h/1c82350e-56f7-4d54-9219-68ad3580c19d/))
- **Lesson:** each node must stand on its own economics; speed is a cost multiplier. Effy's hidden
  shops are dark-store-like, but its *delivery* model is scheduled (dense), which is the safer half.

### 2.10 Uber Eats / DoorDash

- Covered in depth in research-01 (DeepRed, DISCO). Additions:
  - **ETA:** Uber's DeepETA is a *post-processing* model: routing engine ETA (sum of segment times) +
    ML-predicted residual; it is Uber's highest-QPS model. ([Uber blog](https://www.uber.com/en-CA/blog/deepeta-how-uber-predicts-arrival-times/),
    [arXiv 2206.02127](https://arxiv.org/pdf/2206.02127))
  - DoorDash decomposes ETA into stages (assignment, travel to merchant, pickup, travel to customer)
    and moved to multi-task deep models with a **probabilistic base layer + decision layer** to express
    uncertainty. ([DoorDash engineering](https://careersatdoordash.com/?p=12391))
  - **Effy takeaway:** the cheap version of this is "routing-engine ETA + a learned per-stop service
    time"; that is what Picnic does too.

### 2.11 Last-mile SaaS — what they treat as table stakes

| Product | Model | Notable at entry tier | Upsell tier adds |
|---|---|---|---|
| **Onfleet** | per task | POD photo/signature, status + ETA SMS, branded tracking, API/webhooks, basic optimisation, driver chat, 90-day analytics | auto-dispatch, barcode scanning, ID/age verification, dynamic ETAs, custom completion requirements ([Onfleet](https://onfleet.com/pricing)) |
| **Routific** | per order | every feature in free tier except SMS: tracking link, POD photo/signature/**barcode**/notes, email ETAs, API, webhooks, MCP | SMS (quote) ([Routific](https://www.routific.com/pricing)) |
| **OptimoRoute** | per driver | live tracking, live ETA/breadcrumbs, API | POD, customer notifications ([OptimoRoute](https://optimoroute.com/pricing/)) |
| **Detrack** | per driver/vehicle | EPOD, unlimited jobs and office users | route optimisation, vehicle safety checks, rate cards ([Detrack](https://www.detrack.com/pricing/)) |
| **Shipday** | per order | free starter incl. driver app | branded, AI dispatch ([Capterra](https://www.capterra.com.au/software/211323/shipday), [Wix listing](https://www.wix.com/app-market/local-delivery-with-shipday)) |
| **Tookan** | per task, unlimited agents | chat, route optimisation | — ([xpay listing](https://www.xpay.sh/saas-pricing/tookan/)) |
| **Bringg** | enterprise | orchestration across owned + 3PL fleets (250+ carriers), dynamic slots from live capacity, exception automation | — ([Bringg](https://www.bringg.com/platform), [SAP listing](https://www.sap.com/canada/products/crm/partners/bringg-delivery-technologies-ltd-bringg-lastmile-solutions.html)) |
| **Circuit for Teams, Locus** | per seat / enterprise | — | pricing opaque ([CostBench](https://costbench.com/software/last-mile-delivery/circuit-for-teams/hidden-costs/), [Locus](https://locus.sh/blogs/onfleet-pricing-guide/)) |

**Reading across:** photo/signature POD, a customer tracking link, ETA notifications and an API with
webhooks are present at *every* entry tier → they are table stakes. Barcode scanning, age verification,
auto-dispatch, and carrier orchestration are sold as premium → differentiators. Effy already has
scanning (089/090) and auto-assignment (072), which is ahead of a typical SMB fleet.

---

## 3. Industry-standard concepts and the canonical data model

### 3.1 The nouns, as the industry uses them

| Term | Meaning | Typical owner | Effy equivalent |
|---|---|---|---|
| **Order** | what the customer bought and paid for; carries the **promise** (window, fee) | commerce | `order` (+ `delivery_promise`, `delivery_type`, `delivery_fee_breakdown`) |
| **Shipment / consignment** | a set of goods moving together under one transport contract, often one per carrier hand-off | logistics | per-shop package; `courier_consignment` for courier legs |
| **Parcel / handling unit / logistics unit** | one physical, labelled thing (bag, tote, box); the unit that is scanned | warehouse | package label (089) |
| **Stop / destination** | a place a vehicle visits; may serve many parcels/orders | routing | hub, shop, customer address |
| **Task / job** | one unit of driver work at one stop, *one destination + one recipient* in Onfleet's model; pickup or dropoff, may depend on another task | dispatch | collection/delivery work items |
| **Route / trip / round / block** | an ordered sequence of stops for one vehicle/driver in a time box | routing | collection run, delivery round |
| **Hub / depot / station / spoke** | where routes start/end and goods cross-dock | network | the one hub |

Onfleet's API documents tasks as "a unit of work with one destination and one recipient", with a
**pickup/dropoff flag**, **dependencies** between tasks, a **complete-after / complete-before** window,
a lifecycle **Unassigned → Assigned → Active → Completed**, and a **route plan** container for a driver's
work. ([Onfleet tasks](https://docs.onfleet.com/reference/tasks), [apis.io Onfleet](https://apis.io/apis/onfleet/onfleet-tasks-api/),
[Pipedream create-task](https://pipedream.com/apps/onfleet/actions/create-task))

**Principle widely followed:** keep the **promise** on the order and the **execution** on
tasks/parcels; derive the customer-facing status from execution events, never store it twice. Effy's
`packageStatus` (073) derived from dispatch rows is exactly this.

### 3.2 Hub-and-spoke vs direct; middle-mile vs last-mile

- **First mile:** supplier/shop → network (Effy: shop → hub collection run).
- **Middle mile:** between facilities (CFC → spoke in Kroger/Ocado; Picnic FC → hub).
  ([Kroger spoke](https://massmarketretailers.com/kroger-fulfillment-spoke-extends-reach-of-denver-hub/),
  [Mileway/Picnic](https://mileway.com/our-customers/picnic-transforming-the-way-europe-grocery-shops/))
- **Last mile:** facility → customer; ~53% of total shipping cost in 2024 per a vendor compilation.
  ([SmartRoutes](https://smartroutes.io/blogs/last-mile-delivery-statistics) — vendor figure)
- **Direct (store-to-door)** removes a handling step and a leg but forces each node to run its own
  fleet/route; **hub-and-spoke** consolidates for denser routes and one dispatch point at the cost of
  an extra leg and a time deadline (the parcel must reach the hub before the round). Effy's
  `collectionRunFor` ("latest run that makes the window") is the standard cut-off-driven wave pattern
  (research-01 §1.13).

### 3.3 Promise types (what is sold)

From the platforms above, the industry sells a small closed set:

| Promise | Examples | Effy |
|---|---|---|
| Fixed short window (1–2 h) | Picnic 1 h, Woolworths 1 h, Ocado | `window` |
| Long window / day | Woolworths 6 h midweek $2, Harris Farm 8 h | `day` ("Any time") |
| ASAP / on-demand ETA | Delivery Now, Milkrun, Uber/DoorDash | `asap` (estimate only) |
| Carrier estimate (days) | AusPost/StarTrack, Sendle | courier |
| Click & collect / D2B | Woolworths, Coles | not offered |

Instacart's window `type` enum (`scheduled`, `eta`, `priority_eta`, `immediate`) is the most explicit
public encoding of this. ([Instacart](https://docs.instacart.com/connect/api/fulfillment/delivery/create_service_option_hold))

---

## 4. Delivery windows / slot management

### 4.1 Capacity

- Capacity is usually expressed per (window, date, area) and enforced at checkout; when capacity
  tightens, specific slots in specific postcodes are **closed** dynamically. In Agatz et al.'s
  Albert.nl case, slot fees ranged €4.95–€8.95 by day/time and slots closed per zip code under load.
  ([Agatz et al. 2011, Transportation Science](https://repub.eur.nl/pub/25987/TimeSlotManagement_2011.pdf))
- Two decisions are distinguished in the literature: **slot offering** (which slots to show in which
  area — tactical, set in advance) and **slot allocation/pricing** (what to charge/accept in real time).
  ([Agatz/Campbell chapter](https://myweb.uiowa.edu/acampbll/papers/CDbookchap.pdf))
- Bringg markets "dynamic slots" computed from live driver tracking, vehicle availability and cost,
  pushed to product pages and checkout. ([SAP/Bringg](https://www.sap.com/canada/products/crm/partners/bringg-delivery-technologies-ltd-bringg-lastmile-solutions.html))

**Effy note:** capacity per `(window, date)` with no area dimension is the simplest valid form. The
first refinement the literature suggests is *not* dynamic pricing; it is restricting which windows are
offered per area (Picnic) or nudging (green labels).

### 4.2 Pricing levers

| Lever | Who | Evidence |
|---|---|---|
| Cheaper wide windows | Woolworths ($2 midweek 6 h), Harris Farm (lower free threshold for 6/8 h) | [Woolworths](https://www.woolworths.com.au/shop/services/delivery), [CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services) |
| Day-of-week / peak surcharge | Woolworths (Sunday +$2–3), Albert.nl | as above, [Agatz](https://repub.eur.nl/pub/25987/TimeSlotManagement_2011.pdf) |
| Basket-size taper | Woolworths, Harris Farm express tiers | [CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services) |
| Free over threshold | all AU grocers (~$250) | same |
| Subscription | Delivery Unlimited, Coles Plus, Delivery Saver | same; [Fresh Plaza](https://www.freshplaza.com/north-america/article/2097013/uk-tesco-unveils-delivery-saver-offer/) |
| Green / eco label on slots | Ocado, Peapod, Sainsbury's "greener delivery" | [Agatz, Fan & Stam](https://papers.ssrn.com/abstract=3656982), [Sainsbury's](https://www.sainsburys.co.uk/shop/gb/groceries/get-ideas/features/enjoy-greener-grocery-delivery) |
| Flat fee everywhere | Tesco £4.50 (later) | [Yorkshire Post](https://www.yorkshirepost.co.uk/read-this/tesco-is-scrapping-its-cheap-home-delivery-slots-heres-how-much-youll-have-to-pay-2923699) |

**Research finding worth acting on:** in experiments and simulation, *green labels* steered choice,
still worked alongside price discounts, and price incentives "offer little added value beyond that of
just green labels"; green slots produced shorter routes, fewer vehicles and more revenue per customer.
([SSRN](https://papers.ssrn.com/abstract=3656982), [RSM summary](https://rsm.nl/discovery/2021/sustainable-delivery-label))

### 4.3 Reservation (hold) TTL

- Instacart: 10 minutes, one per user, re-reserve cancels, expired = explicit error, reserve late.
  ([Instacart](https://docs.instacart.com/connect/api/fulfillment/delivery/create_service_option_hold))
- DoorDash Drive: a quote must be accepted within 5 minutes. ([DoorDash](https://developer.doordash.com/en-US/docs/drive/how_to/quote_deliveries))
- Sainsbury's: amending an order requires re-checkout to re-reserve. ([Sainsbury's](https://help.sainsburys.co.uk/help/delivery-collection/order_amend))
- Coles' hold timer was not found publicly. ([CHOICE guide](https://choice.com.au/shopping/everyday-shopping/supermarkets/buying-guides/online-grocery-delivery))

**Practice:** short TTL (5–15 min), single active hold per customer, idempotent re-hold, never silently
substitute a different slot on expiry. Effy's "a window is never substituted" rule is consistent.

### 4.4 Cutoffs

Three distinct cutoffs show up in practice and should not be conflated:
1. **Order cutoff** — last moment to buy a window (Woolworths same-day: 1pm). ([Woolworths](https://www.woolworths.com.au/shop/services/delivery))
2. **Amend/cancel cutoff** — Sainsbury's 11pm day before; Woolworths 5:30pm/10:30pm; Coles 12pm.
   ([Sainsbury's](https://help.sainsburys.co.uk/help/delivery-collection/order_amend), [CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services))
3. **Operational cutoff** — the latest moment goods must reach the dispatch point (Effy: collection run
   reaches hub before window starts; Kroger: picked at hub, trucked to spoke).

Effy's `judgeWindow` combines (1) and (3) for today. (2) — a customer amend cutoff — is not described
in CLAUDE.md; every AU grocer has one, with a cancellation/missed-delivery fee (Coles $30; others
"$20 plus perishables"). ([CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services))

---

## 5. Route optimisation and dispatch

### 5.1 The problem classes

- Delivery round in windows = **VRPTW** (vehicle routing with time windows), usually with capacity
  (CVRPTW) and service times; collection run = small TSP/VRP with pickup-before-hub precedence.
  OR-Tools documents both, and warns that solve time grows exponentially and results may be good but
  not optimal. ([OR-Tools routing](https://developers.google.cn/optimization/routing?hl=en),
  [resource constraints](https://developers.google.com/optimization/routing/cvrptw_resources?hl=en))
- A 2026 benchmark of OR-Tools metaheuristics on Solomon/Gehring-Homberger CVRPTW sets found Guided
  Local Search the most robust. ([IPB](https://bibliotecadigital.ipb.pt/entities/publication/d4cf4f81-4f6f-4194-b1ed-a00c75dc1a00/full))

### 5.2 Solver options (2026 pricing verified where marked)

| Option | Type | Price | Notes |
|---|---|---|---|
| **Google Route Optimization** | hosted VRPTW | **Single Vehicle Routing: 5,000 free/month, then $10/1,000 shipments; Fleet Routing: 1,000 free, then $30/1,000** (verified) | billed per shipment; 1 vehicle → SVR SKU, ≥2 → Fleet; infeasible/ignored/validate-only not billed ([pricing](https://developers.google.com/maps/billing-and-pricing/pricing), [billing](https://developers.google.com/maps/documentation/route-optimization/usage-and-billing)) |
| **Google Compute Route Matrix** | matrix | Essentials 10,000 free, then $5/1,000 elements (verified) | storage restrictions apply (research-02) |
| **GraphHopper** | hosted routing + optimisation | Free 500 credits/day (non-commercial); Basic ~$69, Standard ~$199/month (third-party); Premium €384/month 50k credits/day | optimisation cost ≈ vehicles × locations credits ([GraphHopper credits](https://support.graphhopper.com/support/solutions/articles/44000718211-what-is-one-credit-), [pricing](https://www.graphhopper.com/pricing/)) |
| **VROOM** | open source C++ | free (self-host) | VRPTW, CVRP, multi-depot, pickup-delivery, breaks; works on OSRM or a custom matrix; 2018 benchmark median 28 ms on TSPLIB ([GitHub](https://github.com/vroom-project/vroom), [SotM 2018](https://2018.stateofthemap.org/slides/T053-Solving_vehicle_routing_problems_with_OpenStreetMap_and_VROOM.pdf)) |
| **OR-Tools** | open source library | free | most flexible; you own the matrix and the ops ([OR-Tools](https://developers.google.cn/optimization/routing?hl=en)) |
| **Mapbox Optimization** | hosted | free to 100k req/month (research-02) | 12/50 coordinate caps — too small for full rounds |
| **Routific / OptimoRoute** | SaaS + API | see §16 | full product incl. driver app |

**At Effy's scale** (one hub, < 10 drivers, tens to low hundreds of drops/day): Google Fleet Routing
at ~100 drops/day ≈ 3,000 shipments/month → first 1,000 free, ~2,000 × $0.03 ≈ **$60/month**; SVR
(one call per driver round) would be ≈ **$0** under the 5,000 free cap. Research-02's Phase-1 advice
(no solver; nearest-neighbour + 2-opt) remains defensible; a hosted solver is a cheap, contained
upgrade when windows start overlapping.

### 5.3 Dispatch strategies (summary; detail in research-01)

- **Push to employees** (Effy, DSPs, Ocado) vs **offer/accept to gig** (Flex blocks, DoorDash).
- **Batch-then-assign** on a timer (Instacart re-optimises frequently) vs **plan-per-wave** at a cutoff
  (grocery). Effy's 5-minute assignment pass + per-window planning is the wave pattern.
- **Hybrid fleet orchestration:** route each order to owned fleet, 3PL or crowd by cost/ETA/capacity
  (Bringg, Shippit "smart allocation"). Effy's `moveToCourier` (081) is a manual version.
  ([SAP/Bringg](https://www.sap.com/canada/products/crm/partners/bringg-delivery-technologies-ltd-bringg-lastmile-solutions.html),
  [Shippit](https://shippit.com/?p=48981))

---

## 6. ETA, live tracking and customer notifications

- **Why it matters:** "Where is my order?" (WISMO) is often cited as 40–60% of e-commerce support
  contacts; vendors report 38%–65% reductions from proactive notifications. All vendor figures.
  ([Shippypro](https://www.shippypro.com/blog/en/how-to-reduce-wismo-tickets-in-ecommerce-the-complete-guide),
  [Locus](https://locus.sh/blogs/proactive-delivery-notifications/))
- **The canonical notification set** (recommended by multiple vendors, implemented by Onfleet as
  status- and ETA-triggered SMS): order confirmed → **out for delivery** (with tracking link) →
  **arriving soon / N stops away** → **delivered** (with POD photo) → **exception** (delayed/failed).
  ([Shippypro](https://www.shippypro.com/blog/en/how-to-reduce-wismo-tickets-in-ecommerce-the-complete-guide),
  [Onfleet pricing](https://onfleet.com/pricing))
- **Tracking link:** Routific includes a customer tracking link with live driver location and ETA in
  its free plan; Onfleet ships a branded tracking page at its entry tier.
  ([Routific](https://www.routific.com/pricing), [Routific driver app blog](https://www.routific.com/blog/routific-launches-new-driver-app-with-gps-tracking-photo-capture))
- **ETA accuracy is the foundation** — inaccurate alerts create more contacts, not fewer.
  ([Locus](https://locus.sh/blogs/proactive-delivery-notifications/))
- **ETA method for a small team:** routing-engine travel time + per-stop service time; refine the
  service time from history (Picnic predicts drop time from totes, floor, lift, weather). The big
  platforms add an ML residual (Uber DeepETA) or probabilistic ranges (DoorDash).
  ([Picnic](https://jobs.picnic.app/blogs/picnic-10-years-2016the-milkman-routes),
  [Uber](https://www.uber.com/en-CA/blog/deepeta-how-uber-predicts-arrival-times/))
- **Telephony is billed separately** in most SaaS (Onfleet per segment; Routific SMS by quote) — budget
  SMS per notification. ([Onfleet](https://onfleet.com/pricing), [Routific](https://www.routific.com/pricing))

**Effy note:** AppSync Events (071) solves app-to-app freshness; the customer-facing *outbound*
channel (SMS/push "out for delivery", "next stop") is separate and is the standard expectation. The
promise "said once per distinct promise" is good; an "arriving soon" message requires a credible ETA,
which requires a sequenced round.

---

## 7. Proof of delivery, failed delivery, safe-drop, returns

(Methods, legal basis and reason codes were covered in research-05; additions here.)

- **AU norm: Authority to Leave (ATL) / Safe Drop.** Australia Post Safe Drop is free on MyPost
  Business/eParcel, not available with Extra Cover or ID-required parcels; the recipient can set it in
  MyPost/app or the sender at checkout; in bad weather the parcel may go to a Post Office with a card.
  Third-party sources say liability passes to the recipient once left under ATL.
  ([AusPost safe drop](https://auspost.com.au/business/grow-your-business/business-ideas-blog/what-is-a-safe-drop),
  [AusPost ATL](https://auspost.com.au/business/grow-your-business/business-ideas-blog/what-is-authority-to-leave),
  [Sellerdash](https://www.sellerdash.io/post/australia-post-authority-to-leave-atl-delivery-safe-drop-explained))
- In the AusPost shipping API, `authority_to_leave` and `allow_partial_delivery` are booleans on the
  shipment; ATL and Safe Drop are mutually exclusive in some integrations.
  ([karrio issue](https://polar.sh/karrioapi/karrio/issues/733), [NetSuite guide](https://oracle.hydrogen.sagittarius.connect.product.adaptavist.com/en/cloud/saas/netsuite/ns-online-help/section_4274438368.html))
- **Grocery unattended delivery in AU** is offered by Woolworths, Coles and Harris Farm with alcohol
  and tobacco excluded. ([CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services))
  For chilled/frozen unattended drops, Asda's UK trial used insulated boxes with chilled/frozen removed
  after 4 hours. ([City AM](https://www.cityam.com/asda-trials-delivering-food-orders-while-customers-are-out-in-bid-to-sustain-online-shopping-momentum/))
- **Failed delivery cost:** vendor-cited ~$17.78 per failed package (untraced), $14–18 in North
  America; failure rates ~5% with address errors ~45% of failures. AU grocers charge "delivery fee plus
  perishables" or $20–30 for missed deliveries. ([Upper](https://www.upperinc.com/blog/last-mile-delivery-metrics/),
  [CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services))
- **Prevention levers:** address validation at checkout (Google Address Validation from $17/1,000 after
  5,000 free; or G-NAF per research-02), delivery instructions (Effy 066), ATL opt-in, arriving-soon
  notification, call/SMS from driver via masked number. ([Google pricing](https://developers.google.com/maps/billing-and-pricing/pricing))
- **Return to hub:** failed parcels re-enter custody and are re-attempted or refunded; Effy's 088
  covers this. Perishables typically are written off rather than re-delivered (implied by "plus
  perishables" fees above).

---

## 8. Grocery temperature chain

- **Law (FSANZ Standard 3.2.2, cl. 10 transport):** potentially hazardous food kept at **≤ 5 °C** cold
  or **≥ 60 °C** hot; frozen food should remain **frozen hard**; transport must keep food safe and
  suitable. ([FSANZ transporting food](https://www.foodstandards.gov.au/business/food-safety/transporting-food-safely),
  [FSANZ InfoBite](https://www.foodstandards.gov.au/sites/default/files/2023-10/InfoBite%20-%20Transporting%20food%20safely.pdf))
- **Standard 3.2.2A** (food safety management) adds record-keeping for some food-service businesses;
  check applicability. (same InfoBite) NSW Food Authority administers it in NSW.
  ([NSW Food Authority](https://www.foodauthority.nsw.gov.au/node/22822))
- **Industry practice:** three temperature classes (ambient / chilled / frozen); totes packed by
  class (Picnic bin-packs totes by temperature zone and fragility); refrigerated vans (Kroger/Ocado) or
  insulated boxes and ice packs; chilled removed after a time limit if unattended (Asda 4 h).
  ([Picnic](https://jobs.picnic.app/blogs/picnic-10-years-2016the-milkman-routes),
  [Kroger spoke](https://massmarketretailers.com/kroger-fulfillment-spoke-extends-reach-of-denver-hub/),
  [City AM](https://www.cityam.com/asda-trials-delivering-food-orders-while-customers-are-out-in-bid-to-sustain-online-shopping-momentum/))
- **Effy note:** 065 introduced temperature classes on the manifest. The hub-and-spoke design adds a
  dwell at the hub; the time a chilled parcel spends between shop pickup and doorstep is the variable
  to bound (collect late, deliver soon) and the number to log if challenged.

---

## 9. Scanning and chain of custody (GS1)

- **SSCC** (Serial Shipping Container Code): an 18-digit GS1 identifier for one logistics unit
  (case, pallet, *or parcel*), normally encoded in **GS1-128** on a **GS1 Logistics Label**, shared by
  EDI or EPCIS for status events; RFID/EPC also possible. ([GS1 UK](https://www.gs1uk.org/support-training/help-to-use-and-implement-gs1-standards/logistics-labels-and-ssccs),
  [GS1 NZ](https://www.gs1nz.org/standards/logistics-numbers/sscc), [ADHA fact sheet](https://developer.digitalhealth.gov.au/standards/gs1-logistic-label-and-serial-shipping-container-code-sscc-fact-sheet))
- **When SSCC matters:** when units cross organisational boundaries (supplier → retailer DC, retailer →
  carrier). Inside one company's closed loop (Effy shop → Effy hub → Effy driver), a private
  permanent code in QR/Code 128 (Effy 089) is the norm; carriers apply their own labels at hand-off
  (AusPost: if you generate labels yourself you must supply Article ID, Consignment ID and barcode ID;
  dimensions mandatory since March 2025). ([AusPost labels](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/labels.html),
  [ShipEngine StarTrack](https://help.shipengine.com/hc/en-us/articles/4406863408027-StarTrack))
- **Custody events** that every scanning system records: received from shop (pickup scan), hub
  in-scan, sort, load-to-van scan, delivered/failed scan, carrier hand-off. Amazon Flex has drivers
  scan every package at load. ([Amazon Flex UK](https://flex.amazon.co.uk/blog/package-collection-tips/))
- **Effy note:** obtaining a GS1 company prefix is only worth it if a supplier or carrier will consume
  Effy's labels (e.g. supplier-pickup courier parcels). Otherwise keep the private code.

---

## 10. Driver app and dispatcher console best practice

### 10.1 Driver app

| Practice | Evidence |
|---|---|
| **Offline-first**: route loaded while online stays usable; status/POD queued and synced on reconnect | [Route4Me offline mode](https://support.route4me.com/mobile-app-offline-mode/), [Deonde](https://deonde.co/glossary/offline-mode/), [Merixstudio](https://www.merixstudio.com/insights/offline-mode-fleet-management-mobile-app) |
| Navigation **hand-off** to Google/Apple Maps/Waze rather than in-app turn-by-turn | research-02 §8; Onfleet app listing describes navigation integration ([App Store](https://apps.apple.com/app/id1084013403)) |
| **Guided per-stop flow** (Picnic "Runner App"; Onfleet "Pick Up / Drop Off") | [Picnic](https://jobs.picnic.app/blogs/picnic-10-years-2016the-milkman-routes), [Onfleet mobile task](https://support.onfleet.com/hc/en-us/articles/27679317055508) |
| **Scan at load and at drop** | [Amazon Flex](https://flex.amazon.co.uk/blog/package-collection-tips/) |
| Configurable **completion requirements** (photo, signature, notes, age) per task | Onfleet Scale "customized completion requirements" ([Onfleet](https://onfleet.com/pricing)) |
| **Driver–dispatcher chat** and customer contact | Onfleet Launch ([Onfleet](https://onfleet.com/pricing)) |
| Vehicle safety check (pre-start) as optional module | Detrack Advanced ([Detrack](https://www.detrack.com/pricing/)) |

### 10.2 Dispatcher console

- **Live map** of drivers and stops; **exception handling** that reassigns at-risk orders; SLA/promise
  monitoring across fleets. ([Bringg](https://www.bringg.com/platform), [SAP/Bringg](https://www.sap.com/canada/products/crm/partners/bringg-delivery-technologies-ltd-bringg-lastmile-solutions.html))
- Onfleet's "Operational Command Center" and 1-year analytics history are Scale-tier.
  ([Onfleet](https://onfleet.com/pricing))
- **Exceptions queue first, map second:** the dispatcher's job at small scale is the 5% that go wrong;
  a list of late/failed/unassigned items sorted by promise time is more useful than a map. (Synthesis
  from the above; consistent with research-01 §3.5.)

---

## 11. KPIs and benchmarks

| KPI | Definition | Benchmark (directional) | Source |
|---|---|---|---|
| **On-time %** | delivered inside promised window ÷ delivered | — | [Racklify](https://racklify.com/encyclopedia/on-time-delivery-vs-delivery-performance-which-kpi-should-your-warehouse-track/) |
| **OTIF** | (on time **and** complete, undamaged, no unwanted substitution) ÷ total; early *and* late fail | — | [DHL Freight](https://dhl-freight-connections.com/en/business/otif-on-time-in-full/), [Shipsy](https://www.shipsy.ai/insights/what-is-otif-on-time-in-full) |
| **First-attempt delivery rate** | delivered on first attempt ÷ attempted | 85–93% avg, 95–98% best, < 80% red flag | [FleetRabbit](https://fleetrabbit.com/industry/e-commerce-logistics/what-is-first-attempt-delivery-rate-explained-with-benchmarks) (vendor) |
| **Failed delivery rate** | failed ÷ attempted | ~5% | [Upper](https://www.upperinc.com/blog/last-mile-delivery-metrics/) (vendor) |
| **Drops per hour / per shift** | completed stops ÷ driver on-route hours | Picnic ~14/h vs ~4/h typical grocery | [Substack](https://consumergoodies.substack.com/p/explained-what-is-milkman-20) |
| **Drops per van per week** | Ocado's headline productivity metric | 176 (2016) | [Retail Week](https://www.retail-week.com/city/ocado-outlines-target-depot-and-delivery-efficiencies/5014838.article) |
| **Cost per drop** | (driver + vehicle + fuel + tech + overhead) ÷ drops | urban $7.50–10.10 avg; $3.80–5.20 top fleets; grocery/specialty $10–20 | [FleetRabbit](https://fleetrabbit.com/industry/e-commerce-logistics/what-is-last-mile-delivery-explained-with-benchmarks), [Upper](https://www.upperinc.com/blog/last-mile-delivery-metrics/) (vendor) |
| **Order accuracy / substitution** | items delivered as ordered or adequately substituted | CHOICE tests: Woolworths 60/62, Coles 57/62 | [CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services) |
| **ETA accuracy** | |actual − predicted| (mean/median) | — | [Uber DeepETA](https://www.uber.com/en-CA/blog/deepeta-how-uber-predicts-arrival-times/) |
| **WISMO contact rate** | "where is my order" contacts ÷ orders | 40–60% of support volume | [Shippypro](https://www.shippypro.com/blog/en/how-to-reduce-wismo-tickets-in-ecommerce-the-complete-guide) (vendor) |
| **CSAT / NPS on delivery** | post-delivery rating | — | standard |

Caveat: almost all numeric benchmarks are from software vendors; Locus itself notes they come "from
software vendors and content aggregators rather than research firms". ([Locus](https://locus.sh/blogs/last-mile-delivery-efficiency-benchmarks-north-america-2026/))

**Minimum KPI set for Effy:** on-time % per window, first-attempt %, drops per driver-hour, cost per
drop (needs driver hours), late-to-hub parcels per run, WISMO contacts. All derive from timestamps Effy
already records (custody, arrival, POD) plus driver shift hours.

---

## 12. Australian courier / aggregator integration

| Carrier / broker | Access | API capabilities | Pricing signal |
|---|---|---|---|
| **Australia Post (eParcel) / StarTrack** | requires an eParcel or StarTrack contract; register on Developer Centre | create shipment, labels (optional, self-generated allowed), **one manifest per pickup per merchant account**, tracking; ATL / partial-delivery flags; StarTrack account 8 digits | contract rates ([AusPost API docs](https://auspost.com.au/lodgement/api/documentation/), [FAQ](https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/faq.html), [ShipEngine StarTrack](https://help.shipengine.com/hc/en-us/articles/4406863408027-StarTrack)) |
| **Sendle** | self-serve | Get Products (quotes + ETAs; old Get a Quote retired Apr 2025), orders, labels, tracking, **per-parcel tracking webhooks**; HTTP Basic | flat rates by size/route/plan, tracking included ([Sendle changelog](https://developers.sendle.com/changelog?page=1), [api-doc](https://api-doc.sendle.com), [BigCommerce](https://www.bigcommerce.com/apps/sendle/)) |
| **CouriersPlease** | account manager issues credentials; mostly via aggregators | labels, tracking, returns | contract ([EasyPost guide](https://docs.easypost.com/carriers/couriersplease-guide), [ShipEngine](https://www.shipengine.com/integrations/couriersplease)) |
| **Aramex AU (ex-Fastway)** | own API + aggregators | multi-package, returns; no manifest needed | contract ([Aramex FAQ](https://www.aramex.com.au/contact-us/faqs/joining-aramex/how-can-we-integrate-with-aramex-australia/), [ShipEngine Aramex AU](https://www.shipengine.com/docs/carriers/aramex-au/)) |
| **Zoom2u** | API key from portal | quote, book, track, webhooks; service codes 3-hour / same day / VIP | 2017 consumer reports $39–68 same-day Sydney (old) ([Starshipit](https://support.starshipit.com/articles/360000198075-how-to-set-up-zoom2u), [EFTM](https://eftm.com/2017/12/testing-out-zoom2u-for-same-day-deliveries-all-across-australia-45581)) |
| **Uber Direct** | OAuth client credentials, `eats.deliveries` scope | `delivery_quotes`, `deliveries`, delivery-status and courier-update webhooks | Bunnings $15 flat within 15 km (merchant price) ([Uber docs](https://developer.uber.com/docs/deliveries/get-started), [Uber/Bunnings](https://www.uber.com/au/en/newsroom/bunningsdirect)) |
| **DoorDash Drive** | self-serve developer portal | `POST /drive/v2/quotes`, accept within 5 min, deliveries, webhooks | US base $9.75 ≤ 5 mi; AU reseller quote $8.50 ex GST < 1 km + $1/km to 10 km ([DoorDash pricing](https://developer.doordash.com/en-US/docs/drive/overview/pricing_payment), [me&u](https://help.meandu.com/hc/en-us/articles/6539925528079-Introduction-to-DoorDash-Drive-Delivery-Service-AUS-only)) |
| **Shippit** (broker) | SaaS + API | smart allocation (cheapest/fastest), rules engine by weight/dims/location, per-leg routing, own or Shippit rates; brokers Uber Direct | plans not published; third-party lists top tier ~AUD 899–1,099/month ([Shippit](https://shippit.com/?p=48981), [rules engine](https://shippit.com/products/rules-engine), [FitGap](https://us.fitgap.com/products/shippit)) |
| **ShipEngine / EasyPost / Starshipit** (brokers) | API | one integration, many AU carriers | per-label / subscription |

**Observations**
- Incidents propagate through brokers: Shippit's status page logged an Uber Direct quote/booking
  outage affecting all its merchants (July 2026). Design for "no courier quote available" as a
  normal state. ([isdown/Shippit](https://isdown.app/status/shippit/incidents/623182-investigating-uber-direct-delivery-quote-creation-failures))
- **Two kinds of courier** fit Effy's fallback differently: *parcel networks* (AusPost, Sendle,
  CouriersPlease, Aramex — days, manifest/pickup, labels) and *on-demand* (Uber Direct, DoorDash
  Drive, Zoom2u — hours, quote-then-book per job). Effy's courier model (hub or supplier pickup,
  "next pickup", one default service with a timeframe) is the parcel-network shape.

---

## 13. Australian employment and compliance (NSW focus)

### 13.1 Chain of Responsibility and fatigue

- **HVNL applies to vehicles > 4.5 t GVM/ATM** (or combinations including one). Typical delivery vans
  are below this and so outside heavy-vehicle fatigue and CoR rules — confirm per vehicle.
  ([NHVR judicial guide](https://www.nhvr.gov.au/document/46))
- Where HVNL applies, CoR spreads liability to everyone who controls or influences the transport task
  — operators, schedulers, consignors, loaders — so *schedules that require speeding or skipped rest*
  are an offence by the scheduler. ([Logan CoR policy](https://www.logan.qld.gov.au/downloads/file/2508/chain-of-responsibility-policy),
  [Health & Safety Handbook](https://www.healthandsafetyhandbook.com.au/chapters/chain-of-responsibility/))
- For light vehicles, **WHS law** still requires fatigue risk to be managed so far as reasonably
  practicable, in consultation with workers. ([SafeWork NSW](https://www.safework.nsw.gov.au/resource-library/transport-postal-and-warehousing/work-health-and-safety-in-the-road-freight-transport-industry/risk-assessment-fatigue),
  [Safe Work Australia guide](https://safeworkaustralia.gov.au/doc/guide-managing-risk-fatigue-work))
- **System implication:** round planning to a window end must also respect shift length and breaks;
  an auto-assigner that keeps feeding a driver work is the "scheduler" in a CoR-like sense even
  where HVNL does not strictly apply.

### 13.2 Award coverage

- Employee drivers of goods vehicles are generally covered by the **Road Transport and Distribution
  Award 2020 (MA000038)**; vans/utes ≤ 4.5 t GVM are reported as Grade 2 (third-party; confirm in the
  FWC pay guide). ([FWC MA000038](https://awards.fairwork.gov.au/MA000038.html),
  [FairWorkMate NSW](https://fairworkmate.com.au/tools/pay-rates/delivery-driver-nsw) — unverified rates)
- Cost-per-drop modelling must use award rates + on-costs, not gig rates.

### 13.3 Workplace surveillance — tracking drivers (NSW)

- **Workplace Surveillance Act 2005 (NSW):** tracking surveillance (a device whose primary purpose is
  to record location, e.g. GPS) requires **14 days' written notice** before it starts (shorter only if
  employees agree), a **notice clearly visible on the vehicle**, and no covert surveillance without a
  magistrate's authority; tracking outside work is restricted. Separately, the Surveillance Devices Act
  2007 (NSW) restricts tracking devices without consent.
  ([Sprintlaw](https://sprintlaw.com.au/articles/workplace-surveillance-act-2005-nsw-explained/),
  [DCJ policy](https://dcj.nsw.gov.au/documents/resource-centre/policies/dcj-workplace-surveillance-policy.pdf),
  [Sydney Criminal Lawyers](https://www.sydneycriminallawyers.com.au/blog/can-my-employer-spy-on-me-at-work/))
- **System implication:** the driver app's location sharing should be bound to on-shift state
  (start/stop with the shift), the notice must exist before rollout, and the vehicle needs a sticker.
  Research-03 covered the Victorian equivalent; NSW is stricter on notice.

### 13.4 Alcohol (if Effy sells it)

NSW **Same Day Alcohol Delivery** framework (orders delivered within 2 hours / same day):
- check **every** customer's ID regardless of apparent age (or signed declaration in limited cases);
  delivery staff complete **Responsible Supply of Alcohol** training before first delivery (from
  1 Dec 2021); deliver only **9am–midnight (11pm Sunday)**; don't deliver to minors, intoxicated people,
  people not named on the order, or alcohol-free zones; offer online self-exclusion; record refused
  deliveries and keep records ≥ 1 year; L&GNSW runs covert compliance tests.
  ([L&GNSW fact sheet](https://www.liquorandgaming.nsw.gov.au/__data/assets/pdf_file/0005/1107599/Same-Day-Alcohol-Delivery-Framework-Fact-Sheet-I-Oct-2022.pdf),
  [SDAD overview](https://www.liquorandgaming.nsw.gov.au/__data/assets/pdf_file/0009/991548/same-day-alcohol-delivery-overview.pdf),
  [NSW compliance campaign](https://www.nsw.gov.au/business-and-economy/liquor-and-gaming/news/compliance-campaign-into-same-day-delivery-of-alcohol-sdad))
- All AU grocers exclude alcohol from unattended delivery. ([CHOICE](https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services))
- **System implication:** an "alcohol" flag that forces attended delivery, an ID-check POD step, a
  window filter on delivery hours (cf. Instacart's `availability.reasons` for alcohol), and a refusal
  log. This is a hard gate before selling alcohol same-day.

### 13.5 Privacy

Location history and POD photos are personal information under the Privacy Act 1988 (APP 11: secure
and destroy when no longer needed) — covered in research-05 §3c; retention periods should be set,
not infinite.

---

## 14. MVP guidance for a small team

### 14.1 Minimum viable in-house last-mile (what must exist on day one)

1. Checkout promise: windows with capacity + cutoffs + a short-TTL hold; refusal sentence for
   uncovered addresses. *(Effy: built.)*
2. One fee calculation shared by quote and charge. *(built)*
3. Work generation: rounds per window, assignment to a driver, a sequenced stop list. *(built; sequence
   quality is the gap)*
4. Driver app: run list → navigation hand-off → scan/POD (photo, optional signature) → failure reason
   → return to hub. *(built/being built in 088–093)*
5. Customer comms: out-for-delivery + tracking link + delivered with photo + failure notice.
   *(outbound customer notifications not evidenced in CLAUDE.md — verify)*
6. Dispatcher: exceptions list, reassign/unassign, move to courier. *(built in 073/081)*
7. Courier fallback through one integration. *(built: operator-entered courier services, consignments)*
8. KPI basics: on-time %, first-attempt %, drops/hour. *(verify)*

### 14.2 Buy rather than build

- **Route optimisation / matrix:** buy (Google Route Optimization, GraphHopper) or use VROOM/OR-Tools as
  a library; never write a VRPTW solver. Prices in §16.
- **Geocoding / address validation:** buy at checkout or load G-NAF (research-02).
- **SMS:** buy (SNS/Twilio/MessageMedia); SaaS vendors all bill telephony separately.
- **Courier connectivity:** buy an aggregator (Shippit/Starshipit/ShipEngine) unless one carrier
  contract dominates.
- **Whole last-mile stack (Onfleet/Routific/Detrack)** is the right buy for a team *starting* in-house
  delivery; Effy has already built most of it, so the remaining buy decisions are components.

### 14.3 Common pitfalls / over-engineering traps

| Trap | Evidence | Mitigation |
|---|---|---|
| Promising speed you can't densify | Milkrun, Gorillas, Getir | sell windows; outsource < 1 h to Uber/DoorDash as Woolworths/Coles do ([Forbes AU](https://www.forbes.com.au/news/investing/woolworths-acquires-milkrun/), [The Grocer](https://www.thegrocer.co.uk/supply-chain/why-the-partys-over-for-rapid-delivery/669491.article)) |
| Offering every slot everywhere | Picnic restricts slots by density; Agatz shows slot offering per zip code drives cost | cap per window and consider per-area offering ([Picnic](https://jobs.picnic.app/blogs/picnic-10-years-2016the-milkman-routes)) |
| Building a solver before volume | OR-Tools warns of exponential solve time; hosted solvers cost ~$0–60/month at Effy volume | heuristic now, hosted solver when windows overlap |
| Dynamic pricing before nudges | green labels beat discounts in experiments | label "efficient" windows first ([SSRN](https://papers.ssrn.com/abstract=3656982)) |
| Status stored in two places | industry derives status from events (Onfleet task lifecycle) | single derivation *(Effy: 073)* |
| Ignoring the exception paths | failed delivery ~$14–18 each, ~5% of attempts | reason codes, return-to-hub, ATL opt-in, address validation |
| Over-integrating carriers | AusPost requires contracts; brokers exist | one broker; manual courier services until volume |
| Tracking without notice (NSW) | WSA 14-day notice | notice + shift-bound location |
| Assuming chilled can sit | FSANZ ≤ 5 °C; Asda 4 h unattended limit | bound hub dwell, insulated totes, no unattended frozen without boxes |
| Expecting app-store updates | (Effy-specific: no app update mechanism) | keep compatibility fields *(Effy: 083)* |

---

## 15. Matrix: table stakes vs differentiators vs nice-to-have

Context: an AU metro grocery delivery service in 2026, own fleet + courier fallback.

| Capability | Table stakes | Differentiator | Nice-to-have | Basis |
|---|:-:|:-:|:-:|---|
| Choose a delivery window at checkout (1–6 h) | ● | | | all AU grocers |
| Same-day option with order cutoff | ● | | | Woolworths 1pm |
| Window capacity + closure when full | ● | | | Agatz; all grocers |
| Short-TTL slot hold | ● | | | Instacart 10 min |
| Fee varies by window/day/basket; free threshold | ● | | | Woolworths, Coles |
| Subscription for free delivery | | ● | | Delivery Unlimited, Coles Plus |
| Cheap wide window ("any time"/day) | | ● | | Woolworths $2 midweek |
| Rapid < 1 h | | ● (outsourced) | | Milkrun, Uber Eats |
| Amend/cancel until a cutoff | ● | | | Sainsbury's, Woolworths, Coles |
| Unattended / ATL with instructions | ● | | | AU grocers, AusPost |
| Out-for-delivery + tracking link | ● | | | Routific/Onfleet entry tier |
| "N stops away" / dynamic ETA | | ● | | Onfleet Scale |
| Photo POD | ● | | | every SaaS |
| Signature POD | ● (on request) | | | every SaaS |
| ID/age verification for alcohol | ● if selling alcohol | | | NSW SDAD |
| Barcode scan at each custody hand-off | | ● | | Onfleet Scale; Amazon |
| Route sequencing per driver | ● | | | every SaaS |
| VRPTW optimisation across drivers | | ● | | Onfleet Scale, Google Fleet Routing |
| Auto-dispatch | | ● | | Onfleet Scale |
| Driver app offline tolerance | ● | | | Route4Me, Deonde |
| Navigation hand-off | ● | | | research-02 |
| Driver–dispatcher chat / masked calling | | ● | | Onfleet |
| Exceptions queue + reassign | ● | | | Bringg |
| Live dispatcher map | | ● | | Bringg, Onfleet |
| Failed delivery → return to hub, reason codes | ● | | | research-05 |
| Temperature classes, insulated/chilled handling | ● (grocery) | | | FSANZ, Picnic |
| Courier fallback for out-of-area | | ● | | Shippit, Bringg |
| Multi-carrier smart allocation | | | ● | Shippit |
| Green/eco slot labels | | | ● | Ocado, Agatz |
| Area-specific slot offering (density) | | | ● | Picnic |
| ML ETA residuals | | | ● | Uber, DoorDash |
| Vehicle pre-start checks | | | ● (WHS) | Detrack Advanced |
| KPI dashboard (on-time, FADR, drops/h) | ● | | | all SaaS analytics |
| GS1 SSCC labels | | | ● (only for B2B hand-offs) | GS1 |
| Click & collect / Direct to boot | | ● | | Woolworths, Coles |

---

## 16. Buy vs build table (indicative pricing)

| Component | Build effort (small team) | Buy options | Indicative price | Recommendation for Effy |
|---|---|---|---|---|
| Full last-mile stack (dispatch, driver app, POD, tracking) | very high | Onfleet | Launch $619/mo (2,500 tasks), Scale $1,349/mo (5,000), Enterprise $3,099/mo; SMS extra ([Onfleet](https://onfleet.com/pricing)) | Already built; buying now would duplicate. |
| | | Routific | free ≤ 100 orders/mo; $150/mo ≤ 1,000; then 15¢→3¢/order; SMS extra ([Routific](https://www.routific.com/pricing)) | Good reference / fallback. |
| | | OptimoRoute | Lite $35.10, Pro $44.10 /driver/mo (annual) ([OptimoRoute](https://optimoroute.com/pricing/)) | — |
| | | Detrack | Pro $29, Advanced $39 /driver/mo (USD); AUD 464 / 626 per vehicle/yr cited ([Detrack](https://www.detrack.com/pricing/), [Detrack blog](https://www.detrack.com/blog/detrack-vs-solbox-pricing-features-and-support-breakdown/)) | — |
| | | Shipday | free starter; ~$29/mo + per-order (sources conflict) ([Capterra](https://www.capterra.com.au/software/211323/shipday)) | — |
| | | Tookan | ~$39–399/mo, unlimited agents, $0.06–0.14/task overage (sources conflict) ([xpay](https://www.xpay.sh/saas-pricing/tookan/)) | — |
| | | Bringg / Locus / Circuit | quote-only | Overkill. |
| Route optimisation (VRPTW) | high (and ongoing tuning) | Google Route Optimization | SVR 5,000 free then $10/1k; Fleet 1,000 free then $30/1k ([Google](https://developers.google.com/maps/billing-and-pricing/pricing)) | **Buy** when sequencing quality matters; ~$0–60/mo. |
| | | GraphHopper | Free (non-commercial), ~€/$69–199/mo, Premium €384/mo ([GraphHopper](https://www.graphhopper.com/pricing/)) | Alternative; OSM-based, fewer licence limits. |
| | low–medium (as a library) | VROOM / OR-Tools + OSRM | infra only | Viable if a Lambda can host it; adds matrix ownership. |
| Distance/time matrix | n/a | Google Route Matrix | Essentials 10k free then $5/1k elements ([Google](https://developers.google.com/maps/billing-and-pricing/pricing)) | Buy; mind caching terms (research-02). |
| Geocoding / address validation | medium (G-NAF load) | Google Geocoding / Address Validation | Geocoding 10k free then $5/1k; Address Validation Pro 5k free then $17/1k ([Google](https://developers.google.com/maps/billing-and-pricing/pricing)) | Validate at checkout to cut failed drops. |
| Customer SMS | low (integration) | AWS SNS / Twilio / MessageMedia | per message (not researched this pass) | Buy. |
| Courier connectivity | medium per carrier | Shippit, Starshipit, ShipEngine, EasyPost | Shippit top tier ~AUD 899–1,099/mo (third-party) ([FitGap](https://us.fitgap.com/products/shippit)) | One broker when courier volume justifies; manual until then. |
| On-demand courier | n/a | Uber Direct, DoorDash Drive, Zoom2u | DoorDash AU ~$8.50 ex GST + $1/km (reseller); Uber Direct merchant example $15 flat ([me&u](https://help.meandu.com/hc/en-us/articles/6539925528079-Introduction-to-DoorDash-Drive-Delivery-Service-AUS-only), [Uber/Bunnings](https://www.uber.com/au/en/newsroom/bunningsdirect)) | Option for "today, out of window" overflow. |
| Parcel courier | n/a | AusPost/StarTrack (contract), Sendle (self-serve) | contract / flat by size | Sendle is the low-friction start. |
| ETA model | low (routing ETA + service time) / high (ML) | comes with SaaS | — | Build the simple version. |
| Driver app | high | comes with SaaS | — | Built (092/093). |
| Live channel | — | AppSync Events | $1/M ops + $0.08/M connection-min (research-04) | Built (071). |

---

## 17. References

Grouped by section; every URL cited above.

**AU grocery**
- https://www.woolworths.com.au/shop/services/delivery
- https://www.choice.com.au/compareproducts/shopping/everyday-shopping/supermarkets/online-grocery-delivery-services
- https://www.choice.com.au/products/shopping/everyday-shopping/supermarkets/coles-online
- https://choice.com.au/shopping/everyday-shopping/supermarkets/buying-guides/online-grocery-delivery
- https://finance.yahoo.com/news/woolworths-partners-doordash-extend-fast-112224645.html
- https://insidefmcg.com.au/2025/12/11/woolworths-joins-doordash-as-coles-sides-with-uber-eats/
- https://www.uber.com/en-AU/newsroom/coles-ubereats-partnership
- https://www.forbes.com.au/news/investing/woolworths-acquires-milkrun/
- https://insideretail.co.nz/2023/06/29/why-were-unlikely-to-see-another-wave-of-rapid-delivery-startups/
- https://foodprocessing.com.au/content/materials-handling-storage-and-supply-chain/news/coles-opens-its-second-customer-fulfilment-centre-in-sydney-1069173759
- https://mi-3.com.au/23-09-2024/coles-unveils-first-automated-customer-fulfilment-centre-victoria-shake-online-grocery
- https://www.retailbiz.com.au/?p=38881
- https://www.uber.com/au/en/newsroom/bunningsdirect

**International platforms**
- https://docs.instacart.com/connect/api/fulfillment/delivery/create_service_option_hold
- https://docs.instacart.com/connect/fulfillment_guide/how_to/retrieve_desired_windows
- https://www-old.gurobi.com/case_studies/instacart-delivering-optimal-shopping-experiences/
- https://www.ridesharingdriver.com/instacart-double-batches/
- https://www.cnbc.com/amp/2018/06/27/amazon-is-recruiting-entrepreneurs-to-start-delivery-networks.html
- https://www.cbsnews.com/miami/news/got-10k-amazon-wants-you-to-start-business-to-deliver-its-packages/
- https://www.geekwire.com/2024/amazon-plans-rate-increases-and-routing-technology-improvements-for-delivery-firms/
- https://flex.amazon.co.uk/blog/package-collection-tips/
- https://gridwise.io/blog/everything-you-need-to-know-about-amazon-flex
- https://massmarketretailers.com/kroger-fulfillment-spoke-extends-reach-of-denver-hub/
- https://www.supermarketnews.com/retail-financial/kroger-ocado-expand-delivery-south-florida
- https://theorsociety.com/ORS/Publications/Magazines/IOR/January2023/OR-and-Ocado-are-beating-the-vehicle-routing-problem.aspx
- https://www.retail-week.com/city/ocado-outlines-target-depot-and-delivery-efficiencies/5014838.article
- https://current-news.co.uk/ocado-using-route-calculation-software-to-maximise-delivery-efficiency-8529
- https://jobs.picnic.app/blogs/picnic-10-years-2016the-milkman-routes
- https://consumergoodies.substack.com/p/explained-what-is-milkman-20
- https://www.retail-week.com/technology/how-algorithms-automation-and-the-milkman-model-are-powering-picnic/7032843.article
- https://mileway.com/our-customers/picnic-transforming-the-way-europe-grocery-shops/
- https://www.yorkshirepost.co.uk/read-this/tesco-is-scrapping-its-cheap-home-delivery-slots-heres-how-much-youll-have-to-pay-2923699
- https://www.freshplaza.com/north-america/article/2097013/uk-tesco-unveils-delivery-saver-offer/
- https://help.sainsburys.co.uk/help/delivery-collection/order_amend
- https://www.sainsburys.co.uk/shop/gb/groceries/get-ideas/features/enjoy-greener-grocery-delivery
- https://www.retaildive.com/news/gopuff-plans-to-open-a-digital-first-retail-store/607536
- https://sacra.com/research/gopuff
- https://sacra.com/chat/h/1c82350e-56f7-4d54-9219-68ad3580c19d/
- https://www.thegrocer.co.uk/supply-chain/why-the-partys-over-for-rapid-delivery/669491.article
- https://techcrunch.com/?p=2559730
- https://www.uber.com/en-CA/blog/deepeta-how-uber-predicts-arrival-times/
- https://arxiv.org/pdf/2206.02127
- https://careersatdoordash.com/?p=12391
- https://www.cityam.com/asda-trials-delivering-food-orders-while-customers-are-out-in-bid-to-sustain-online-shopping-momentum/

**Slot management research**
- https://repub.eur.nl/pub/25987/TimeSlotManagement_2011.pdf
- https://myweb.uiowa.edu/acampbll/papers/CDbookchap.pdf
- https://papers.ssrn.com/abstract=3656982
- https://rsm.nl/discovery/2021/sustainable-delivery-label

**Last-mile SaaS**
- https://onfleet.com/pricing
- https://docs.onfleet.com/reference/tasks
- https://apis.io/apis/onfleet/onfleet-tasks-api/
- https://pipedream.com/apps/onfleet/actions/create-task
- https://support.onfleet.com/hc/en-us/articles/27679317055508
- https://apps.apple.com/app/id1084013403
- https://www.routific.com/pricing
- https://www.routific.com/blog/routific-launches-new-driver-app-with-gps-tracking-photo-capture
- https://optimoroute.com/pricing/
- https://www.detrack.com/pricing/
- https://www.detrack.com/blog/detrack-vs-solbox-pricing-features-and-support-breakdown/
- https://www.capterra.com.au/software/211323/shipday
- https://www.wix.com/app-market/local-delivery-with-shipday
- https://www.xpay.sh/saas-pricing/tookan/
- https://www.bringg.com/platform
- https://www.sap.com/canada/products/crm/partners/bringg-delivery-technologies-ltd-bringg-lastmile-solutions.html
- https://costbench.com/software/last-mile-delivery/circuit-for-teams/hidden-costs/
- https://locus.sh/blogs/onfleet-pricing-guide/
- https://support.route4me.com/mobile-app-offline-mode/
- https://deonde.co/glossary/offline-mode/
- https://www.merixstudio.com/insights/offline-mode-fleet-management-mobile-app

**Routing**
- https://developers.google.com/maps/billing-and-pricing/pricing
- https://developers.google.com/maps/documentation/route-optimization/usage-and-billing
- https://developers.google.cn/optimization/routing?hl=en
- https://developers.google.com/optimization/routing/cvrptw_resources?hl=en
- https://bibliotecadigital.ipb.pt/entities/publication/d4cf4f81-4f6f-4194-b1ed-a00c75dc1a00/full
- https://www.graphhopper.com/pricing/
- https://support.graphhopper.com/support/solutions/articles/44000718211-what-is-one-credit-
- https://github.com/vroom-project/vroom
- https://2018.stateofthemap.org/slides/T053-Solving_vehicle_routing_problems_with_OpenStreetMap_and_VROOM.pdf

**Notifications, KPIs**
- https://www.shippypro.com/blog/en/how-to-reduce-wismo-tickets-in-ecommerce-the-complete-guide
- https://locus.sh/blogs/proactive-delivery-notifications/
- https://locus.sh/blogs/last-mile-delivery-efficiency-benchmarks-north-america-2026/
- https://www.upperinc.com/blog/last-mile-delivery-metrics/
- https://fleetrabbit.com/industry/e-commerce-logistics/what-is-first-attempt-delivery-rate-explained-with-benchmarks
- https://fleetrabbit.com/industry/e-commerce-logistics/what-is-last-mile-delivery-explained-with-benchmarks
- https://smartroutes.io/blogs/last-mile-delivery-statistics
- https://dhl-freight-connections.com/en/business/otif-on-time-in-full/
- https://www.shipsy.ai/insights/what-is-otif-on-time-in-full
- https://racklify.com/encyclopedia/on-time-delivery-vs-delivery-performance-which-kpi-should-your-warehouse-track/

**AU couriers**
- https://auspost.com.au/lodgement/api/documentation/
- https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/faq.html
- https://developers.auspost.com.au/content/apis/shipping-and-tracking/info/api-resources/labels.html
- https://help.shipengine.com/hc/en-us/articles/4406863408027-StarTrack
- https://auspost.com.au/business/grow-your-business/business-ideas-blog/what-is-a-safe-drop
- https://auspost.com.au/business/grow-your-business/business-ideas-blog/what-is-authority-to-leave
- https://www.sellerdash.io/post/australia-post-authority-to-leave-atl-delivery-safe-drop-explained
- https://polar.sh/karrioapi/karrio/issues/733
- https://oracle.hydrogen.sagittarius.connect.product.adaptavist.com/en/cloud/saas/netsuite/ns-online-help/section_4274438368.html
- https://developers.sendle.com/changelog?page=1
- https://api-doc.sendle.com
- https://www.bigcommerce.com/apps/sendle/
- https://docs.easypost.com/carriers/couriersplease-guide
- https://www.shipengine.com/integrations/couriersplease
- https://www.aramex.com.au/contact-us/faqs/joining-aramex/how-can-we-integrate-with-aramex-australia/
- https://www.shipengine.com/docs/carriers/aramex-au/
- https://support.starshipit.com/articles/360000198075-how-to-set-up-zoom2u
- https://eftm.com/2017/12/testing-out-zoom2u-for-same-day-deliveries-all-across-australia-45581
- https://developer.uber.com/docs/deliveries/get-started
- https://developer.doordash.com/en-US/docs/drive/how_to/quote_deliveries
- https://developer.doordash.com/en-US/docs/drive/overview/pricing_payment
- https://help.meandu.com/hc/en-us/articles/6539925528079-Introduction-to-DoorDash-Drive-Delivery-Service-AUS-only
- https://shippit.com/?p=48981
- https://shippit.com/products/rules-engine
- https://us.fitgap.com/products/shippit
- https://isdown.app/status/shippit/incidents/623182-investigating-uber-direct-delivery-quote-creation-failures

**Standards and compliance**
- https://www.gs1uk.org/support-training/help-to-use-and-implement-gs1-standards/logistics-labels-and-ssccs
- https://www.gs1nz.org/standards/logistics-numbers/sscc
- https://developer.digitalhealth.gov.au/standards/gs1-logistic-label-and-serial-shipping-container-code-sscc-fact-sheet
- https://www.foodstandards.gov.au/business/food-safety/transporting-food-safely
- https://www.foodstandards.gov.au/sites/default/files/2023-10/InfoBite%20-%20Transporting%20food%20safely.pdf
- https://www.foodauthority.nsw.gov.au/node/22822
- https://www.nhvr.gov.au/document/46
- https://www.logan.qld.gov.au/downloads/file/2508/chain-of-responsibility-policy
- https://www.healthandsafetyhandbook.com.au/chapters/chain-of-responsibility/
- https://www.safework.nsw.gov.au/resource-library/transport-postal-and-warehousing/work-health-and-safety-in-the-road-freight-transport-industry/risk-assessment-fatigue
- https://safeworkaustralia.gov.au/doc/guide-managing-risk-fatigue-work
- https://awards.fairwork.gov.au/MA000038.html
- https://fairworkmate.com.au/tools/pay-rates/delivery-driver-nsw
- https://sprintlaw.com.au/articles/workplace-surveillance-act-2005-nsw-explained/
- https://dcj.nsw.gov.au/documents/resource-centre/policies/dcj-workplace-surveillance-policy.pdf
- https://www.sydneycriminallawyers.com.au/blog/can-my-employer-spy-on-me-at-work/
- https://www.liquorandgaming.nsw.gov.au/__data/assets/pdf_file/0005/1107599/Same-Day-Alcohol-Delivery-Framework-Fact-Sheet-I-Oct-2022.pdf
- https://www.liquorandgaming.nsw.gov.au/__data/assets/pdf_file/0009/991548/same-day-alcohol-delivery-overview.pdf
- https://www.nsw.gov.au/business-and-economy/liquor-and-gaming/news/compliance-campaign-into-same-day-delivery-of-alcohol-sdad

### Unverified / caveated claims (consolidated)

- Woolworths and Coles slot-hold TTLs: not published; not found.
- Amazon Fresh not operating in AU: assumption, not verified this pass.
- Award rates (FairWorkMate) conflict across pages; confirm in the FWC pay guide.
- KPI benchmarks (FADR, cost per drop, failed-delivery cost, WISMO share) are vendor-sourced.
- Shippit, Circuit, Shipday and Tookan prices come from third-party aggregators and conflict.
- DoorDash Drive AU rate is a reseller's description, not DoorDash's published price.
- "Alcohol must not be left unattended" is stated by retailers' policies (CHOICE), not found in the
  NSW framework text itself.
