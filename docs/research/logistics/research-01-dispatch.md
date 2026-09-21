# Dispatch & Task-Assignment Engines — Research for Effy's Driver Logistics

Scope note up front: web-search budget for this session was exhausted partway through research (many vendor
sites — DoorDash's own blog, Uber's eng blog for Eats trip optimization, Locate2u, Detrack, Track-POD,
Dispatch Science, WorkWave, Samsara, Zomato/Swiggy official posts, Deliveroo's own engineering write-ups —
either 403'd a direct fetch or could not be searched fresh). Where a claim below has **no URL**, it is general
industry knowledge (VRP/heuristics literature, widely-repeated practitioner consensus) and is flagged as such,
never presented as sourced. Every other line is backed by a fetched page or search-result snippet, cited inline
and listed again in §5.

---

## §1 How the industry actually does it

### 1.1 Onfleet (SMB/mid-market last-mile SaaS, employee AND gig fleets)

Onfleet's auto-assignment has exactly two named strategies:

- **"To closest driver"** — assigns to whichever active driver is currently the shortest straight-line/road
  distance from the task's destination.
- **"To shortest route"** — assigns to whichever active driver's total route distance grows the *least* once
  the task is inserted; computed from the driver's last known location, through their active task, through all
  ordered destinations of their assigned tasks, to the new task.
  [Onfleet Auto-Assignment](https://support.onfleet.com/hc/en-us/articles/360023669852-Auto-Assignment)

Hard eligibility gate: **only active (idle or in-transit) drivers are considered at all** — offline/off-shift
drivers are structurally excluded, not merely de-prioritized. Dispatchers can cap **max tasks per driver** (an
upper bound that makes a driver ineligible once full, regardless of how good a match they'd otherwise be), and
team-scoped auto-assignment restricts candidates to drivers on that team. Linked tasks (e.g. pickup+dropoff
pairs) stay together by default; an explicit override can split them across drivers.
[Onfleet Auto-Assignment](https://support.onfleet.com/hc/en-us/articles/360023669852-Auto-Assignment)

**Team Auto-Dispatch** (the batch/wave-style operation, Scale-plan only) is a distinct, heavier mechanism: it
takes a *time window of tasks* + a *driver schedule window* and inserts them into drivers' existing routes,
potentially reordering the whole route, honoring `maxTasksPerRoute` (default 100, max 200), `taskTimeWindow`
(default ±4h, max span 16h), `scheduleTimeWindow` (default now+6h, max span 16h), per-task `serviceTime`
(default 2 min), configurable `routeEnd` (hub / worker's own address / a specific hub / anywhere), and
`maxAllowedDelay` (default 10 min lateness tolerance). It can filter drivers by `maxContainerSize` (capacity)
and `vehicleType`. **Only one Team Auto-Dispatch run can be in flight at a time** — it's explicitly a batch job,
not a continuous stream, and there's a hard 200-mile cap between drivers/hubs/tasks. It fires a webhook
(`autoDispatchJobCompleted`) on completion.
[Onfleet Team Auto-Dispatch](https://docs.onfleet.com/reference/team-auto-dispatch)

Dispatcher UI: full manual override — reassign tasks on the fly, the system auto-flags delays and failed
deliveries so a human can "quickly step in, reassign orders, and keep operations moving," and a "Command
Center" gives centralized driver-location/route-progress/delay monitoring.
[Onfleet: Assignment & Dispatching](https://onfleet.com/assignment-and-dispatching)

### 1.2 Shipday (SMB delivery SaaS)

Sparse public documentation of internals. Confirmed: orders are auto-matched to drivers "based on location and
current load," with a configurable dashboard "assignment algorithm" setting; manual assignment via map UI is
the alternative. Their own guidance: **manual assignment is fine under ~30–50 orders/day with one dispatcher;
past that, automated dispatch becomes necessary** — a genuinely useful scale threshold from a vendor that
serves exactly this segment.
[Shipday: how to choose delivery dispatch software](https://www.shipday.com/post/how-to-choose-delivery-dispatch-software)

### 1.3 Tookan / Jungleworks (SMB, largely gig/on-demand agent pools)

Multiple named allocation modes, all **broadcast/offer-style, not push**:
- **Batch-wise allocation** — push-notifies a set of eligible riders; any available rider can accept.
- **Pooling** — auto-allocation within a configurable radius; whichever available agent is nearest/first gets it.
- **Round robin** — explicit fairness rotation across agents.
- **Intelligent Agent Mapping** — dispatch by tags, delivery distance, batch grouping, and custom
  allocation rules tied to agent earnings.
[Jungleworks: Pooling auto allocation](https://help.jungleworks.com/knowledge-base/pooling-auto-allocation-method-on-tookan/),
[Jungleworks: Round Robin](https://help.jungleworks.com/knowledge-base/round-robin-auto-allocation/),
[Jungleworks: Tookan features](https://jungleworks.com/tookan/pickup-and-delivery-software/features/)

This is the clearest example of a system built **assuming a gig/marketplace pool** — offer-to-many,
first-to-accept, radius-bounded — which is structurally the wrong shape for a shift-based employee fleet (see
§3).

### 1.4 Bringg (enterprise logistics orchestration)

Bringg frames automated dispatch as "assigning deliveries to available drivers using business rules and
intelligent routing algorithms... to maximize efficiency and ensure fairness in load balancing," reporting
**58% improvement in on-time delivery and 70% reduction in dispatcher workload** in initial deployments — the
explicit design philosophy is "**manage by exception**": trust the algorithm, have a human handle only the
outliers.
[Bringg: Auto-Dispatch](https://www.bringg.com/resources/auto-dispatch)

Matching criteria named explicitly: **vehicle type, shift time, driver skills, customer preferences**, plus
location and current load for balancing. Incoming orders are grouped into a **shared queue ("live order
pooling")** and evaluated on urgency, location, time windows and SLA before assignment — i.e. Bringg batches at
the queue level before it dispatches, rather than assigning strictly first-in-first-out.
[Bringg: Auto-Dispatch](https://www.bringg.com/resources/auto-dispatch)

On failure/change: "on-the-fly adjustments" — when delays, cancellations or traffic occur, the system
**automatically reassigns or re-sequences tasks**. Named anti-patterns for *rollout* (not algorithmic ones):
incomplete real-time data, integration gaps between systems, and staff resistance to giving up manual control.
[Bringg: Auto-Dispatch](https://www.bringg.com/resources/auto-dispatch)

Dispatcher UI, concretely: a route planner to add/remove/move orders between routes with a live preview of the
impact on route duration/distance/stops-per-hour; a real-time list of available drivers+vehicles filtered by
required skills to reassign into; direct actions ("assign to a different driver or carrier"); notify-driver or
leave-a-note. **No drag-and-drop, stop-locking, or formal escalation workflow is described in Bringg's own
docs** — those may exist in-product but aren't documented publicly.
[Bringg: A Day in the Life of a Bringg Dispatcher](https://help.bringg.com/docs/a-day-in-the-life-of-a-bringg-dispatcher)

Bringg's "9 essential dispatch features" post is a useful checklist in its own right (feeds §2): smart automated
scheduling, customizable dispatch logic (capacity/cost/region/special handling), route optimization + order
batching (same time-window + geographic proximity → one batch), real-time OMS/TMS integration, both
automated *and* manual dispatch modes, fulfillment-location flexibility (multi-node), cross-team visibility with
permissioned dashboards, automated exception alerting, and horizontal scalability (50 → 5,000+ vehicles).
[Bringg: How Dispatch Software Works](https://www.bringg.com/blog/dispatching/dispatch-software/)

### 1.5 Circuit for Teams / Spoke Dispatch

Converts unassigned stops into optimized routes; assigns drivers to **delivery zones**, then "AI redistributes
delivery stops among available drivers, automatically assigning more stops to those with lighter loads" — an
explicit **load-balancing rebalancer**, distinct from a one-shot greedy match. Supports zone-based driver
specialization ("most skilled/suitable driver" per zone). Optimization can be tuned for workload, driving time,
or fleet efficiency as the objective.
[Circuit for Teams](https://getcircuit.com/teams/product-view)

### 1.6 Routific

Emphasizes dispatcher-editable output over the optimizer's first pass: click-drag a stop between routes on the
timeline or map, Shift-select multiple stops to move as a group, a **lasso tool** for bulk map selection, and a
distinctive **"sketch-a-route"** feature — the dispatcher literally draws a path on the map and the algorithm
re-optimizes the route to follow that shape. No stop-locking feature is documented.
[Routific: How to make changes to your routes](https://help.routific.com/en/articles/20-how-to-make-changes-to-your-routes)

### 1.7 OptimoRoute

Planning inputs per order: location, service duration, time window, **required skills**, and load/capacity.
Two manual-override mechanisms: plain drag-and-drop (dispatcher picks the exact slot) and **"best fit"**
drag-and-drop (drop onto a driver's name; the optimizer inserts it at the best position in *their* existing
route, respecting constraints) — i.e. a human decides *who*, the algorithm still decides *where in the
sequence*. The docs explicitly warn that manual changes "may ignore route limits or make the route less
efficient," putting the burden on the dispatcher to review after overriding.
[OptimoRoute: Getting started for new dispatchers](https://help.optimoroute.com/hc/en-us/articles/35511474016404-Getting-started-for-new-OptimoRoute-dispatchers),
[OptimoRoute: Drag & Drop](https://optimoroute.com/drag-and-drop/)

### 1.8 Uber (DISCO) and Uber Eats

Uber's core dispatch system is internally called **DISCO**; Eats delivery-partner courier matching is described
as reusing DISCO's core matching primitives rather than a wholly separate system.
[TechAhead: Uber Architecture & Design](https://www.techaheadcorp.com/blog/uber-architecture-design/) — note
this is a third-party summary, not Uber's own blog; Uber's own `eng.uber.com` post on Eats trip optimization
returned a 404 during this research and could not be verified directly, so treat the DISCO-for-Eats claim as
weakly sourced.

### 1.9 DoorDash — DeepRed (the most thoroughly documented system found)

DeepRed is explicitly a **two-layer architecture**: an ML layer that predicts per-order/per-Dasher quantities
(order-ready time at the restaurant, Dasher travel time to store and to customer, **Dasher accept probability**
for a given offer, plus operational sub-times like parking search and order-collection time), feeding a
**mixed-integer-programming (MIP) optimization layer solved with Gurobi** that scores and ranks candidate
Dasher/order matches, decides batching, and can **deliberately delay a dispatch** if a better Dasher is
expected imminently, trading a few seconds of latency for a materially better match.
[DoorDash: Using ML and Optimization to Solve DoorDash's Dispatch Problem](https://careersatdoordash.com/blog/using-ml-and-optimization-to-solve-doordashs-dispatch-problem/)
(fetched via reader proxy after a direct 403)

**Scoring function** explicitly penalizes *variance*: "a penalty term that scales with route complexity" is
added to discourage offers whose ML predictions are highly uncertain — the system prefers a slightly
worse-but-confident match over a theoretically-better-but-uncertain one. Constraints folded into scoring:
Dasher accept-likelihood, market supply/demand, weather, traffic, and on-time guarantees.
[same source]

**Batching criteria, stated concretely**: orders batch together when pickups are at the same merchant, or at
nearby merchants (to reduce parking events), when Dasher supply is constrained, and only when merchant prep
timing allows both/all pickups without breaking either order's delivery promise. [same source]

**Failure/reassignment mechanic, stated explicitly**: "when a Dasher declines, we will find another Dasher to
offer the order to, until the order is picked up" — a **sequential offer-and-fallback chain**, not a single
push. [same source]

**Explicit anti-pattern named**: DeepRed deliberately does *not* do naive greedy-nearest-driver assignment —
the whole point of the ML+MIP layering is to avoid that. [same source]

A companion post on **routing at scale** (distinct from the *assignment* problem — this is stop-sequencing
within an already-batched route) describes an iterative **"ruin-and-recreate"** metaheuristic: start from a
randomized solution, "ruin" it by splitting into servable/unservable job subsets, "recreate" by recombining,
score, keep improvements, repeat until a time budget or iteration cap. DoorDash states plainly that **exact
optimization does not scale** — synchronously optimizing ~10,000 stops took "several minutes, far too slow" —
and that **pure greedy-nearest is used only as a timeout fallback because it is fast but "suboptimal."** They
achieve real-time performance not through a smarter exact solver but through **geographic sharding +
multithreading**, reducing wall time to "an average of a few seconds."
[DoorDash: Scaling a routing algorithm using multithreading and ruin-and-recreate](https://careersatdoordash.com/blog/scaling-a-routing-algorithm-using-multithreading-and-ruin-and-recreate/)
(fetched via reader proxy)

### 1.10 Instacart

Instacart explicitly treats **batching + routing + shopper staffing as one coupled problem**, not three
sequential ones — a data scientist is quoted that solving them together "would be more impactful than working
on either one alone." Their approach for finding a performance ceiling was a **Monte Carlo simulation** across
temporal (day/time), operational (shopper efficiency) and external (weather, events) variables, run thousands
of times to bound achievable idle-time vs. unmet-demand tradeoffs, market by market. Gains were largest in
*less mature* markets (Raleigh, Indianapolis) and marginal in an already-efficient market (SF) — i.e. the value
of sophisticated batching optimization is inversely related to how good the baseline heuristic already is.
[Mixpanel: Using unorthodox solutions at Instacart](https://mixpanel.com/blog/instacart-data-science-routing-batching-staffing-monte-carlo/)

Separately, Instacart's own eng blog states the fulfillment engine "decomposes order clustering and shopper
assignment" and **recomputes batch plans on roughly a one-minute cadence** rather than continuously — a
deliberate re-plan interval, not instant reactive dispatch on every event.
[Instacart Tech: Space, Time and Groceries](https://tech.instacart.com/space-time-and-groceries-a315925acf3a)
(search-snippet sourced; direct fetch of this specific claim could not be re-verified after budget exhaustion —
flagged as medium confidence)

### 1.11 Deliveroo — "Frank"

Frank is Deliveroo's named dispatch algorithm; company material describes it evaluating available riders
against available orders **on a ~2-second cadence**, using ML predictions of food-ready time, per-stage
delivery-process duration, and rider suitability by distance and location type, replacing an earlier plain
**FIFO queue** and cutting delivery times materially (a commonly cited figure is ~20%, though this appears in
secondary press coverage rather than a primary Deliveroo engineering post, so treat the percentage as
unverified).
[Deliveroo Riders: How Frank decides when to offer you orders](https://riders.deliveroo.hk/en/how-frank-decides-when-to-offer-you-orders)
— note: direct fetch of this exact page 403'd/522'd during this research; the summary above is drawn from
search-result snippets of that page plus secondary coverage, so treat as medium confidence, not primary-source
verified.

The important structural point, independent of the exact numbers: Frank is **offer-based** ("decides when to
*offer you* orders") — consistent with Deliveroo's gig/self-employed rider model, not a push-assignment model.

### 1.12 Swiggy / Zomato (India food delivery, gig fleets)

Third-party technical summaries (not confirmed against Swiggy's own primary post, which could not be fetched
in this session) describe a "weighted multi-factor scoring model" evaluating **GPS proximity, delivery-partner
current workload, first-mile ETA, kitchen-prep-time forecast, and historical performance per route cluster**
before assignment.
[bnxt.ai: The Ultimate Guide to Swiggy's Real-Time Order Allocation System](https://www.bnxt.ai/blog/the-ultimate-guide-to-swiggys-real-time-order-allocation-system)
— **flagged low-confidence**: this is a marketing/SEO summary site, not Swiggy's own engineering blog, and the
specific weights are not attributed to a primary source. Zomato coverage found was similarly all third-party
(Medium explainer posts describing Dijkstra's-algorithm-style nearest-partner search); no primary Zomato
engineering post on assignment specifically was found. **Treat both India-market claims as illustrative, not
verified.**

### 1.13 Wave/cutoff-driven planning (grocery & parcel — the model closest to Effy's collection runs)

This is the one area where "continuous dispatch" vendor thinking (§1.1–1.12) is the *wrong* reference class, and
warehouse/WMS wave-planning literature is the right one.

**Wave planning mechanics** (WMS domain, not last-mile-specific, but directly load-bearing for Effy's
collection-run design): a wave is released either **manually** (for an urgent exception) or **automatically on
a scheduled trigger**, and generates the actual floor-level pick tasks at that moment — work does not exist
before the wave fires. Orders are grouped into a wave by **shared carrier cutoff time, item type, shipping
priority, or destination zone**. The stated purpose is explicitly to work **backwards from the shipping/carrier
deadline** rather than reactively processing arrivals — "release work in controlled batches so different order
types keep moving without competing for the same labor and equipment," with one case study citing wait-time
reduction from 13,320 to 130 minutes purely from aligning wave-release timing to truck departure windows.
[Extensiv: What Is Wave Planning](https://www.extensiv.com/blog/what-is-wave-planning)

**Grocery-specific time-window handling**: NextBillion.ai (a routing-engine vendor serving grocery/convenience
ops) distinguishes **hard windows** (fixed, e.g. 6–8am, late = rejected/penalized) from **soft windows**
(preferred but tolerant, e.g. prefer 10am–noon, will accept to 1pm), driven by receiving-dock capacity, staff
availability, and perishability. Their route-sequencing logic explicitly is **priority/deadline-driven, not
proximity-driven** — "the sequence may not always include a nearby store at the very beginning" if a farther
stop has a harder deadline. Routes re-optimize dynamically around delays/cancellations/urgent inserts, but the
window structure itself is fixed by the deadline schedule.
[NextBillion.ai: Delivery Time Windows for Grocery and Convenience Stores](https://nextbillion.ai/blog/delivery-time-windows-grocery-route-planning-playbook)

**Ocado** (the deepest-automation online-grocery operator found) runs a from-scratch VRP-style local-search
optimizer: randomly allocate deliveries to vans for a region, then iteratively attempt small moves and evaluate
each against a cost function to improve the whole-fleet solution — this is a **heuristic local-search VRP
solver**, not an exact MIP, and it is re-run continuously as customers amend orders up to the cutoff, with slot
availability queries answered in **under 500ms** by talking directly to the routing engine at checkout time
(i.e., serviceability/slot availability is a live read against the optimizer's current state, not a static
rule). Vans carry IoT telemetry (location, wheel speed, braking, fuel, cornering) that feeds back into
continuous re-optimization.
[Ocado Tech (Medium): The software routing 260,000 grocery deliveries a week](https://medium.com/ocadotechnology/the-software-routing-260-000-grocery-deliveries-a-week-45308bac09e8) — accessed via search snippet only, not
directly fetched; treat structural claims as medium-confidence, the "500ms" and "260,000/week" figures as
vendor-stated.

**Amazon Logistics**: DSP (contracted, but effectively route-assigned like employees — not gig/bidding) drivers
carry the "Rabbit" handheld, which is described as continuously recalculating stop sequence and ETA in response
to live traffic/road-closure/weather data as the driver moves — i.e. route *sequencing* is dynamic and
on-device, while route/stop *assignment* itself (which driver gets which block of stops) happens upstream at
planning time, not renegotiated mid-route.
[Upper: Amazon Last-Mile Delivery](https://www.upperinc.com/blog/amazon-last-mile-delivery/) — third-party
summary, not an Amazon primary source; structural claim (assignment happens at planning time, sequencing is
dynamic) is consistent with how every other wave/block-based operator in this research works, so treated as
plausible even though unverified against Amazon's own documentation.

No accessible primary or secondary source was found in this session specifically documenting **Australia
Post's** or **Woolworths/Coles's** dispatch engineering (their operational planning is not publicly documented
at an engineering-blog level, and search budget ran out before broader queries could be tried) — this is a gap,
not a finding; do not cite Effy's plan against them without further research.

---

## §2 Requirement catalogue

Numbered, one line each, systems observed with it, and a scale-fit tag for Effy (one hub, <10 employee drivers,
two work types, cutoff-driven).

1. **Push (forced) assignment to a specific driver, no accept/reject** — Onfleet auto-assign, Circuit for Teams,
   OptimoRoute, Bringg (business-rule mode). `ESSENTIAL` — this is the correct shape for an employee/shift
   fleet (§3).
2. **Offer-to-one, accept/decline, fallback to next candidate on decline** — DoorDash DeepRed, Deliveroo Frank.
   `OVERKILL-AT-OUR-SCALE` for collection/same-day driver tasks — employees don't get to decline a shift
   assignment the way gig workers decline an offer; still *useful* as the shape for the failure/reassignment
   path (§2.29), just not the everyday assignment path.
3. **Broadcast-to-pool, first-to-accept** — Tookan pooling. `OVERKILL-AT-OUR-SCALE` / wrong paradigm for an
   employee fleet.
4. **Round-robin fairness allocation** — Tookan. `USEFUL` only if Effy ever needs to balance *earnings/hours*
   fairness across drivers, which as pure-shift employees on a wage is a non-issue; skip.
5. **Closest-driver-to-destination scoring** — Onfleet. `ESSENTIAL` as one input signal, not the sole rule.
6. **Shortest-marginal-route-growth scoring (insert cost)** — Onfleet "shortest route" mode, OptimoRoute
   best-fit. `ESSENTIAL` — this is the right primitive for same-day multi-drop assignment.
7. **Hard eligibility gate: only on-shift/active workers considered** — Onfleet ("must be active"). `ESSENTIAL`
   — directly maps to Effy's on-duty driver state.
8. **Capacity/load cap per worker (max tasks / max volume-weight)** — Onfleet `maxTasksPerRoute`, OptimoRoute
   load constraints, Bringg vehicle-type matching. `ESSENTIAL` — a driver/van has a real package capacity.
9. **Vehicle-type matching** — Bringg, OptimoRoute. `USEFUL` if Effy's fleet is ever mixed (van vs car); at
   <10 vehicles today, likely a static per-driver attribute rather than a live constraint solve.
10. **Skill/capability tagging (e.g. handling requirements)** — Bringg, OptimoRoute. `OVERKILL-AT-OUR-SCALE`
    today; Effy has one job type per driver-task (`collection` / `same_day_delivery`), which is a type
    distinction, not a skills-matching problem — no need for a general skills engine.
11. **Zone/territory-scoped assignment** — Circuit for Teams (zone-assigned drivers), Onfleet teams. `USEFUL`
    is a stretch — with one hub and <10 drivers there's no need for standing geographic zones; a live
    nearest/insert-cost calculation subsumes it.
12. **Linked-task grouping (pickup+dropoff, or all stops of one run, stay with one driver)** — Onfleet.
    `ESSENTIAL` — a collection run's stops and a same-day round's drops must not fragment across drivers
    mid-run.
13. **Time-window feasibility check (hard windows)** — NextBillion.ai grocery guidance, OptimoRoute. `ESSENTIAL`
    — same-day drop windows and the collection cutoff are hard constraints for Effy.
14. **Soft/preferred time windows with tolerance** — NextBillion.ai. `USEFUL` later; not needed for v1 with a
    single cutoff schedule.
15. **Shift-end awareness (don't assign work a driver can't finish before clocking off)** — implied by every
    system's "active driver" gate plus general VRP practice (no single vendor doc found stating this as a named
    rule, but it's the obvious complement to #7). `ESSENTIAL`.
16. **Vehicle-ownership independent of driver (any driver can take any van)** — not documented by any vendor
    above (most last-mile SaaS assumes driver=vehicle 1:1 or a loose pairing); this is closer to a fleet-
    management concern (Samsara territory) that could not be verified this session. `ESSENTIAL for Effy`
    regardless of vendor precedent, because Effy's constitution states vehicles are not tied to a driver — flag
    as an Effy-specific requirement, not an industry-standard one.
17. **Batching by shared time-window + geographic proximity** — Bringg ("live order pooling"), DoorDash
    (merchant proximity + prep-time feasibility). `ESSENTIAL` — this is literally the collection-run and
    same-day-round concept.
18. **Batching by shared pickup point (same merchant/shop)** — DoorDash. `ESSENTIAL` — a collection run is
    fundamentally "visit every shop with an assigned package."
19. **Capacity-bounded batch size (max stops/max weight per batch)** — Onfleet `maxTasksPerRoute`, OptimoRoute.
    `ESSENTIAL`.
20. **Max-wait/max-delay bound on a batch before it must depart** — Onfleet `maxAllowedDelay`. `ESSENTIAL` —
    this is the cutoff-time gate itself, generalized.
21. **Deliberate short delay of assignment to wait for a better match** — DoorDash (explicitly trades latency
    for match quality). `OVERKILL-AT-OUR-SCALE` — with <10 drivers there usually isn't a "better match arriving
    in 20 seconds" to wait for; a simple immediate-assign-on-eligible-driver is sufficient and easier to reason
    about operationally.
22. **Variance/confidence-aware scoring (penalize uncertain ETAs)** — DoorDash. `OVERKILL-AT-OUR-SCALE` — this
    exists to manage *millions* of noisy ML predictions; Effy has no ML ETA model and doesn't need one to
    assign 3–9 drivers.
23. **Scheduled wave/batch trigger on a cadence (not continuous)** — Instacart (~1 min replan), Onfleet Team
    Auto-Dispatch (single job, explicit window), wave-planning literature (scheduled release). `ESSENTIAL` —
    this is the correct paradigm for Effy's whole model (cutoff → plan → assign → dispatch), not continuous
    on-demand dispatch.
24. **Cutoff-time-driven order/task grouping into a release** — Wave-planning (Extensiv), NextBillion.ai.
    `ESSENTIAL` — Effy's collection schedule *is* this pattern already (047).
25. **Priority/deadline-first stop sequencing over pure proximity** — NextBillion.ai. `ESSENTIAL` for same-day
    delivery-window compliance once Effy has real time windows; less relevant to collection runs (shops have no
    delivery-window constraint the driver must race).
26. **Live slot/serviceability check against the optimizer's real-time state (<500ms)** — Ocado. `OVERKILL-
    AT-OUR-SCALE` for the *driver-assignment* engine — Effy's checkout-time cutoff eligibility (047) is a static
    schedule check, not a live capacity solve against driver positions.
27. **Manual dispatcher assignment as a first-class alternative to auto** — every vendor reviewed (Onfleet,
    Bringg, Circuit, Routific, OptimoRoute). `ESSENTIAL` — Effy needs a manual override path from day one; a
    hub with <10 drivers will hit edge cases an algorithm shouldn't try to fully own.
28. **Drag-and-drop reassignment on a visual timeline/map** — Onfleet, Bringg, Circuit, Routific, OptimoRoute
    (near-universal). `USEFUL` — good UX target for the back-office/hub console, not a backend requirement.
29. **Sequential offer-with-fallback on decline/failure** — DoorDash ("find another Dasher... until picked
    up"), Onfleet exception flagging + manual reassign. `ESSENTIAL` as the *failure-recovery* mechanism (a
    driver goes sick, a van breaks down) even though the *initial* assignment for Effy should be push, not
    offer (see #2).
30. **Automatic re-sequencing/reassignment on live disruption (traffic, cancellation, delay)** — Bringg, Onfleet,
    OptimoRoute (all describe this). `USEFUL`, not urgent for v1 — Effy's runs are short/local (one hub,
    metro Melbourne); a human dispatcher reassigning manually is adequate at this scale.
31. **Automated exception alerting to a human dispatcher** — Bringg, Onfleet ("Command Center"). `ESSENTIAL` —
    directly maps to needing a back-office view of stuck/failed/late work.
32. **Best-fit auto-insert on manual drag (human picks *who*, algorithm picks *where in sequence*)** —
    OptimoRoute. `USEFUL` — nice middle ground worth building into any dispatcher override UI later; not a v1
    blocker.
33. **Route/stop locking (prevent an optimizer re-touching a manually placed stop)** — searched for explicitly
    across OptimoRoute, Routific, Bringg docs; **not documented by any of the three** despite being a commonly
    assumed feature. `USEFUL` if/when Effy builds an optimizer that re-runs after manual edits; not needed
    while a human either assigns or the system assigns and both are final.
34. **Undo/redo on dispatcher edits** — OptimoRoute. `USEFUL`, cheap UX win, not core logic.
35. **Multi-dispatcher concurrent editing** — OptimoRoute. `OVERKILL-AT-OUR-SCALE` — one hub almost certainly
    has one dispatcher/ops person on shift at a time.
36. **Fairness/earnings-balancing across drivers** — Tookan round-robin, gig-fleet norm generally. `OVERKILL-AT-
    OUR-SCALE` — Effy drivers are salaried/shift employees, not paid per-task; there is no earnings-fairness
    problem to solve.
37. **Driver-declared/self-service route creation** — Circuit for Teams ("drivers... create their own routes").
    `OVERKILL-AT-OUR-SCALE` and arguably wrong for Effy's model — dispatch should be centrally decided, not
    driver-initiated, given the hub-and-spoke design is deliberately not gig-style.
38. **Historical-performance-weighted scoring** — Swiggy (low-confidence source). `OVERKILL-AT-OUR-SCALE` — no
    data volume to make this meaningful with <10 drivers.
39. **Multi-factor weighted scoring formula, explicit and published** — searched for across every vendor;
    **no vendor publishes actual weights/coefficients**. Every system that describes "scoring" (Bringg, DoorDash,
    the low-confidence Swiggy summary) treats the formula as proprietary. Noted as a finding in itself: **there
    is no industry-standard published weighting formula to borrow** — Effy will have to set its own simple rule
    and tune it, not import one.
40. **Hybrid internal-fleet + third-party-carrier dispatch in one system** — Onfleet ("hybrid fleet dispatch"),
    Bringg ("choose best carrier"). `ESSENTIAL` — this is structurally Effy's standard/same-day split; a
    standard package's Effy-side lifecycle ends at hub check-in and hands to a carrier, which is exactly this
    pattern.
41. **API-triggered dispatch from an external order-management system** — Onfleet. `ESSENTIAL` (Effy's checkout
    system is the "order source" triggering package creation, already the plan).
42. **Real-time driver location tracking feeding the assignment engine** — universal across all vendors
    reviewed. `ESSENTIAL`.
43. **Proof-of-completion capture as part of closing an assigned task** — implicit in every last-mile vendor's
    driver-app description (Onfleet, Circuit, DoorDash), and already in Effy's design (049 — delivery-code +
    contactless proof). `ESSENTIAL`, already built.
44. **Idle-time / staffing-level simulation to size the workforce** — Instacart's Monte Carlo approach.
    `OVERKILL-AT-OUR-SCALE` for the assignment *engine* itself — genuinely useful for a *future* headcount-
    planning exercise, not for a real-time or batch assignment algorithm serving <10 drivers.
45. **Geographic sharding of the optimization problem for scale** — DoorDash (regional shards + multithreading).
    `OVERKILL-AT-OUR-SCALE` — Effy has one hub; there is nothing to shard.
46. **Exact MIP/ILP solver for assignment** — DoorDash (Gurobi). `OVERKILL-AT-OUR-SCALE` — DoorDash needed this
    because they're matching thousands of orders to thousands of Dashers continuously; Effy is matching a
    handful of runs to fewer than 10 drivers a few times a day. A MIP solver here is solving a problem that
    barely exists.
47. **Ruin-and-recreate / local-search metaheuristic for stop sequencing** — DoorDash. `OVERKILL-AT-OUR-SCALE`
    as a *general-purpose engine*; the *underlying idea* (start from a reasonable order, do local swaps, keep
    improvements) is fine and can be hand-rolled trivially for a run of, say, 4–12 shop stops or 10–20 drop
    stops — no need for a packaged metaheuristic library.
48. **Greedy-nearest-neighbor as an explicit documented fallback strategy under time pressure** — DoorDash
    (used only when the real optimizer times out). `USEFUL` — worth keeping in mind as Effy's actual *primary*
    strategy, not merely a fallback, precisely because the problem size never approaches DoorDash's scale (see
    §3).
49. **Explicit rejection of naive greedy-nearest-driver as the general rule** — DoorDash states they avoid this
    at their scale. `Note, not directly applicable`: DoorDash's objection to greedy-nearest is about
    *aggregate marketplace efficiency across a huge number of concurrent, competing orders* — a failure mode
    that doesn't exist when there are only a handful of runs and drivers a few times a day and no competing
    orders to trade off against each other. This is the single clearest place industry practice should be
    read as "yes, but not at your scale" (see §3).
50. **Stranded-work detection when a worker goes offline/off-shift mid-task** — no vendor doc found describing
    this exact mechanic in the systems researched, but it is exactly what Effy's own 056 slice already
    identified and solved for driver stand-down (`releaseIneligibleWork`, warn-before-release pattern) — noted
    here as a requirement Effy has *already built the shape of* for a related surface (driver stand-down);
    `ESSENTIAL` to carry the same pattern into collection/delivery run reassignment.
51. **Dedicated escalation path to a human when auto-assignment finds no eligible candidate** — implied by every
    vendor's manual-override existence (Onfleet, Bringg) but not documented as a formal state machine anywhere
    found. `ESSENTIAL` to design explicitly for Effy (an "unassignable — needs a human" run/drop state), since
    no vendor gave a ready-made pattern to copy.
52. **Configurable collection/departure schedule with a prep buffer before cutoff** — Onfleet `maxAllowedDelay`
    is the closest documented analogue; wave-planning cutoff literature is the real precedent. `ESSENTIAL` —
    already Effy's design (047's collection schedule + prep buffer).
53. **Same-day vs. standard split decided upstream of the dispatch engine (not by the engine)** — this is
    exactly Effy's already-settled model (decided at checkout, 047) and matches the general wave-planning
    principle that **eligibility/classification and dispatch are separate concerns** — no vendor engine
    reviewed classifies delivery method itself; they all *consume* a pre-existing method/priority field.
    `ESSENTIAL`, already correct in Effy's design.
54. **One task = one typed unit of work, not a driver role** — not a named "requirement" in vendor docs (this
    is Effy's own design decision, already settled 2026-08-22), but structurally consistent with every system
    reviewed: none of Onfleet/Bringg/Circuit/OptimoRoute hard-codes "driver roles" — task type is always a
    property of the *task*, assignable to any eligible active worker. `ESSENTIAL`, validates Effy's existing
    decision rather than introducing a new one.
55. **Return-to-hub as a configurable route-end option** — Onfleet `routeEnd` (hub / own address / specific hub
    / anywhere). `ESSENTIAL` analogue for Effy — collection runs end at the one hub by definition; worth
    keeping the field name flexible even with only one hub today per the "one hub for now" note.
56. **Multi-vehicle-type fleet support** — Bringg, OptimoRoute. `USEFUL`, likely unnecessary at <10 vehicles
    unless Effy already has mixed van/car types — check against actual fleet composition, not a generic best
    practice to chase.
57. **Contactless/attended delivery flag as a dispatch input** — Bringg ("contactless, returns, age-restricted
    items" cited as dispatch-logic inputs). `USEFUL`, already partially covered by Effy's proof-of-delivery
    design (049); not a *scheduling* input Effy needs today since same-day drops aren't yet differentiated by
    handling type.
58. **Webhook/event notification on batch-job completion** — Onfleet (`autoDispatchJobCompleted`). `ESSENTIAL`
    pattern to mirror in Effy's own event backbone (SNS/SQS) once a scheduled assignment job exists.
59. **API/CSV/manual bulk order import as the trigger for a planning run** — OptimoRoute, Circuit. `NOT
    APPLICABLE` — Effy's trigger is internal (checkout events + the collection schedule), not an external
    import.
60. **"Manage by exception" as the explicit operating philosophy** — Bringg names this directly as the design
    goal of automation. `ESSENTIAL as a design principle` for Effy: build the dispatcher console around
    *surfacing exceptions*, not around a screen the dispatcher must actively watch continuously.
61. **Published scale/complexity thresholds distinguishing "needs automation" from "manual is fine"** — Shipday
    (~30–50 orders/day/dispatcher threshold). `ESSENTIAL as a benchmark`: Effy at <10 drivers and a handful of
    runs/day is *below* the threshold where even an SMB vendor says automated dispatch becomes necessary — a
    direct, sourced data point supporting §3's recommendation to keep the engine simple.
62. **Distance sanity-cap between driver/hub/task to reject nonsensical assignments** — Onfleet's 200-mile cap.
    `USEFUL` cheap guardrail; trivially adaptable to Melbourne-metro distances (e.g. reject any auto-assignment
    implying >50km from the hub) as a defensive check, not a scoring input.

---

## §3 Recommendation for Effy

**Bottom line: build a rules-based push-assignment engine, not a solver.** Nothing in this research — including
from vendors operating at DoorDash/Uber/Ocado scale — describes a pattern that would justify an ILP solver,
weighted ML scoring, or a metaheuristic for one hub and fewer than ten employees. Shipday's own stated threshold
(~30-50 orders/day before automation even becomes *necessary*, [source](https://www.shipday.com/post/how-to-choose-delivery-dispatch-software))
sits above where Effy is; DoorDash's own reasoning for rejecting greedy-nearest (aggregate marketplace
efficiency across competing concurrent orders) is a failure mode that doesn't exist for Effy — there's no
market of orders competing for scarce driver capacity, just a knowable, finite, cutoff-gated batch of work a
few times a day.

### 3.1 The two work-generation events, and what triggers assignment for each

**Collection run (shops → hub).** Trigger: the configurable collection schedule (047) fires at a cutoff (e.g.
2pm). At that instant, the system has a *known, finite set of packages awaiting collection*, each tagged to a
specific shop. This is a **wave**, in the WMS sense (§1.13/#23/#24) — assignment work should not run
continuously against a trickle of individual packages; it should run once, on the schedule, against everything
that's accumulated since the last run.

**Same-day delivery run (hub → customers).** Trigger: hub check-in completes for a batch of same-day packages
(post-collection-run, once sortation has surfaced the same-day/standard split — already a known fact per
checkout, 047). This is also a wave: run once the checked-in same-day set is ready, not per-package.

Both are **scheduled/event-triggered batch jobs**, matching Onfleet's Team Auto-Dispatch shape (a
job with a defined task-set and driver-set, run once, not a continuous per-event matcher) and Instacart's
~1-minute batch-replan cadence rather than DoorDash's per-order real-time loop (§1.9, §1.10). Effy should NOT
build a per-package "as soon as it's ready, find it a driver" continuous dispatcher — that's solving a problem
(marketplace-scale, competing concurrent demand) Effy doesn't have, and it fights the cutoff-driven model
that's already core to 047/049.

### 3.2 The assignment model: push, not offer/accept

Effy's drivers are shift employees, not a gig pool (constitution, explicit). **Do not build offer/decline/
broadcast-to-pool** (Tookan-style, Deliveroo Frank-style, DoorDash-style) as the primary assignment mechanism —
that entire mechanic exists to solve *worker consent* under a marketplace/gig relationship, which does not
apply. An on-duty employee driver does not get to decline a work assignment the way a gig Dasher declines an
offer.

**Use plain push assignment**, closest in spirit to Onfleet's "closest driver" / "shortest route" auto-assign
modes and Circuit for Teams' zone-based push: the system decides, the driver is told, the driver does it.
Reserve an offer/accept-shaped mechanic *only* for the failure-recovery path (§3.4), not the everyday path —
that's the one place DoorDash's "sequential offer to next candidate until picked up" pattern (§1.9, #29) is
directly applicable: a driver rejecting a stand-down or reassignment because of a real-world exception, not a
gig worker's marketplace choice.

### 3.3 Algorithm: a scored, greedy, capacity-aware insertion — explicitly not an ILP solver

For each wave (collection or same-day run), for each unit of batched work (a run of shop-stops, or a run of
customer-drops):

1. **Eligibility filter (hard gate, matches Onfleet #7):** only drivers currently on-duty and not already
   assigned an active run of the *same type* qualify. (Employees typically do one collection run then one
   same-day round per shift — not simultaneously, per Effy's own "typed tasks, not roles" design.)
2. **Capacity filter (hard gate, #8/#19):** does the driver's vehicle have room for the package
   count/volume of this run? (Static per-vehicle capacity is fine at <10 vehicles — no need for live
   volumetric packing.)
3. **Feasibility filter (hard gate, #15):** can the driver plausibly complete the run before shift end, given
   an estimate of stop count × average stop time + drive time? Reject candidates who can't.
4. **Score remaining eligible drivers by insertion cost** (#6, Onfleet's "shortest route" logic, OptimoRoute's
   "best fit"): prefer the driver whose current position/remaining workload makes taking this run cheapest —
   at Effy's scale this reduces to "closest on-duty, least-loaded driver," computable with straight-line/ETA
   distance, no VRP solver needed.
5. **Assign to the top-scored eligible driver.** Push it — no offer step.
6. **Batch/grouping is upstream of assignment, not part of it** (#17/#18, matching Effy's already-correct
   design, #53): a collection run is *already* "every shop with an assigned package for this cutoff" before
   the assignment step runs; a same-day round is *already* "every checked-in same-day package for this wave."
   The assignment engine assigns whole runs to drivers — it does not need to decide *which packages go
   together*; that's already decided by the cutoff/hub-check-in mechanics 047/049 already own. Where multiple
   runs exist in one wave (more shops/drops than one driver can reasonably cover), split them by simple
   geographic proximity clustering (a trivial single-linkage or k-means-ish grouping over stop coordinates is
   plenty at this scale — do not reach for DoorDash's ruin-and-recreate or Ocado's local-search solver, #47).
7. **Stop sequencing within an assigned run** is a separate, much smaller problem than assignment — for
   under, say, 15 stops, a naive nearest-neighbor-then-2-opt-improve pass (hand-rolled, no library) is
   sufficient and matches DoorDash's own admission that greedy-nearest is "suboptimal but fine" at small scale
   (#48) — the "suboptimal" cost is negligible on a route this short, and DoorDash themselves fall back to it
   under time pressure.

**Do not build:** an ML ETA model, a variance-penalized scoring function (#22), deliberate assignment delay to
wait for a better match (#21), a MIP solver (#46), geographic sharding (#45), historical-performance weighting
(#38), or fairness/earnings balancing (#36). All are solving problems that arise only at DoorDash/Uber/Ocado
concurrency and none apply to a single hub with a handful of scheduled waves and fewer than ten drivers. This
is not a cut corner — it's the same conclusion Shipday's own vendor guidance reaches for operations below its
stated threshold (§1.2, #61), and DoorDash's own explicit rationale for avoiding greedy-nearest doesn't
transfer to Effy's problem shape (#49).

### 3.4 Failure handling and reassignment

Model on Effy's own already-built 056 pattern (driver stand-down → `releaseIneligibleWork`, itemize the
stranded work, require explicit human confirmation before releasing it — never silently drop or auto-reassign
physical-world state) plus DoorDash's sequential-fallback idea (#29) and Onfleet's exception-flag-then-manual-
reassign pattern (#31):

- If a driver goes off-duty, calls in sick, or a vehicle breaks down **before** a run starts: treat exactly
  like 056's stand-down — the run's packages become unassigned work, itemized, surfaced to a dispatcher/back-
  office operator, who explicitly re-triggers assignment (either automatically against remaining eligible
  drivers, or manually).
- If a driver fails **mid-run** (can't complete a stop, vehicle issue mid-route): do **not** attempt automatic
  live re-sequencing/hand-off to another driver's route at this scale (#30 is `USEFUL`, not `ESSENTIAL`) — with
  <10 drivers and one hub, the operationally sane response is surfacing an exception to a human dispatcher who
  decides (send another driver, hold the package for the next wave, escalate to a customer-facing delay) —
  this matches Bringg's "manage by exception" philosophy (#60) exactly, and matches the honest scale reality
  that automatic dynamic re-dispatch has real engineering cost that isn't justified below Onfleet/Bringg's own
  enterprise fleet sizes.
- **No candidate found at all** (nobody eligible/capable): this needs an explicit state — "unassignable, needs
  a human" — not a silent failure or infinite retry. No vendor documented a ready pattern for this (#51); Effy
  should design it as a first-class run/drop status, surfaced the same way 058's `shop_attention_state` design
  already surfaces other "true by the passage of time" conditions.

### 3.5 Dispatcher override

Build a minimal manual-override surface from day one (#27, universal across every vendor reviewed) — not
necessarily drag-and-drop polish (#28/#32/#33/#34 are UX nice-to-haves, not backend requirements): the ability
to view all runs for the current wave, see who's assigned, and reassign a run to a different on-duty driver
with one action. That's the entire dispatcher-facing requirement at this scale; multi-dispatcher concurrent
editing (#35), stop-locking (#33), and sketch-a-route (Routific's most elaborate feature) are all explicitly
out of scope.

### 3.6 What to explicitly NOT build (the overkill list, consolidated)

MIP/ILP solver · ML-based ETA/accept-probability prediction · variance-aware scoring · deliberate wait-for-
better-match delay · geographic sharding · offer/broadcast/decline as the primary assignment mechanic ·
round-robin fairness · driver self-service route creation · multi-dispatcher concurrent edit · live sub-500ms
slot-availability solving against driver state · historical-performance weighting · skills-matching engine
(task *type* already covers this). Every one of these is real, documented, production practice — at a scale
Effy is not at and, on current plan (one hub, <10 drivers), has no near-term path to being at either.

---

## §4 Open questions and risks

1. **No vendor publishes actual scoring weights** (#39) — Effy will need to pick simple, defensible weights
   (e.g., eligibility+capacity+feasibility as hard gates, then pure proximity/insertion-cost as the only soft
   score) and expect to tune by observation, not by importing a formula. This is a genuine gap in the research,
   not just a gap in what could be fetched this session.
2. **Vehicle-not-tied-to-driver (#16) has no clean vendor precedent.** Every system researched assumes a
   fairly sticky driver↔vehicle pairing (even Onfleet's capacity limits are per-driver, implicitly per-vehicle).
   Effy's model (vehicles are pooled, not owned by a driver) means the eligibility/capacity filter needs a
   vehicle-assignment step *before* task assignment that none of the researched systems needed to solve
   explicitly — worth a dedicated design pass rather than assuming vendor patterns transfer.
3. **Shift-end feasibility estimation (#15) has no documented formula anywhere found** — every vendor treats
   "active driver" as binary eligibility, not a time-remaining-vs-work-remaining calculation. Effy will need to
   build this from scratch; a naive stop-count × average-service-time + drive-time estimate is a reasonable
   starting point but is unvalidated against any real system's practice.
4. **Session research gaps**: WebSearch budget was exhausted before Locate2u, Detrack, Track-POD, Dispatch
   Science, WorkWave, and Samsara could be researched at all beyond generic knowledge, and several primary
   sources (DoorDash's own blog required a reader-proxy workaround; Uber's Eats trip-optimization post 404'd;
   Deliveroo's and Swiggy's primary posts could not be directly fetched) are represented here only by search
   snippets or third-party summaries. If a follow-up pass is done, prioritize: Locate2u (explicitly targets
   employee/B2B fleets, likely the closest analog to Effy's exact shape and conspicuously unresearched here),
   and Dispatch Science (positions itself on scoring/skills/capacity for smaller enterprise fleets).
5. **No source in this research explicitly discusses a hub-and-spoke split where the SAME driver pool does
   BOTH a collection wave and a delivery wave in one shift** (Effy's actual model). Every vendor reviewed is
   either purely on-demand point-to-point (Uber Eats, DoorDash, Deliveroo) or purely hub-based parcel (implicit
   in Amazon/Ocado but not stated as two-phase-per-shift). This specific combination appears to be genuinely
   under-documented industry-wide, not just under-researched here — worth treating Effy's design as a novel
   combination rather than assuming a template exists to validate against.
6. **Risk of over-fitting §3's "keep it simple" conclusion to marketing-tier vendor pages.** Several vendor
   claims here (Bringg's 58%/70% figures, Ocado's 500ms figure, Deliveroo's 20% figure) are self-reported
   without independent verification and should not be used as engineering targets for Effy — they're cited here
   only to establish qualitative direction (automation reduces dispatcher load; live serviceability checks are
   fast), not as benchmarks to hit.

---

## §5 Sources

- Onfleet — Auto-Assignment: https://support.onfleet.com/hc/en-us/articles/360023669852-Auto-Assignment
- Onfleet — Team Auto-Dispatch (API reference): https://docs.onfleet.com/reference/team-auto-dispatch
- Onfleet — Assignment and Dispatching (product page): https://onfleet.com/assignment-and-dispatching
- Onfleet — Route Optimization API: https://onfleet.com/routing-api
- Onfleet — Task Assignment (support): https://support.onfleet.com/hc/en-us/articles/360023910111-Task-Assignment
- Shipday — How to choose delivery dispatch software: https://www.shipday.com/post/how-to-choose-delivery-dispatch-software
- Jungleworks/Tookan — Pooling auto allocation: https://help.jungleworks.com/knowledge-base/pooling-auto-allocation-method-on-tookan/
- Jungleworks/Tookan — Round Robin auto allocation: https://help.jungleworks.com/knowledge-base/round-robin-auto-allocation/
- Jungleworks/Tookan — Pickup and delivery features: https://jungleworks.com/tookan/pickup-and-delivery-software/features/
- Bringg — Auto-Dispatch: https://www.bringg.com/resources/auto-dispatch
- Bringg — A Day in the Life of a Bringg Dispatcher: https://help.bringg.com/docs/a-day-in-the-life-of-a-bringg-dispatcher
- Bringg — How Dispatch Software Works (9 features): https://www.bringg.com/blog/dispatching/dispatch-software/
- Circuit for Teams — product page: https://getcircuit.com/teams/product-view
- Routific — How to make changes to your routes: https://help.routific.com/en/articles/20-how-to-make-changes-to-your-routes
- OptimoRoute — Getting started for new dispatchers: https://help.optimoroute.com/hc/en-us/articles/35511474016404-Getting-started-for-new-OptimoRoute-dispatchers
- OptimoRoute — Drag and Drop: https://optimoroute.com/drag-and-drop/
- OptimoRoute — Manually schedule and modify orders (search snippet only, direct fetch 403'd): https://help.optimoroute.com/hc/en-us/articles/27804856390420-Manually-schedule-and-modify-orders-on-routes
- DoorDash Engineering — Using ML and Optimization to Solve DoorDash's Dispatch Problem: https://careersatdoordash.com/blog/using-ml-and-optimization-to-solve-doordashs-dispatch-problem/
- DoorDash Engineering — Scaling a routing algorithm using multithreading and ruin-and-recreate: https://careersatdoordash.com/blog/scaling-a-routing-algorithm-using-multithreading-and-ruin-and-recreate/
- DoorDash Engineering — Iterating Real-time Assignment Algorithms Through Experimentation (found, not fetched — 403): https://careersatdoordash.com/blog/optimizing-real-time-algorithms-experimentation/
- DoorDash Engineering — Reinforcement Learning for On-Demand Logistics (found, not fetched): https://careersatdoordash.com/blog/reinforcement-learning-for-on-demand-logistics/
- TechAhead — Uber Architecture & Design (third-party, DISCO reference): https://www.techaheadcorp.com/blog/uber-architecture-design/
- Uber Engineering — Eats trip optimization (URL found via search, returned 404 on fetch): https://eng.uber.com/uber-eats-trip-optimization/
- Mixpanel — Using unorthodox solutions at Instacart (Monte Carlo routing/batching/staffing): https://mixpanel.com/blog/instacart-data-science-routing-batching-staffing-monte-carlo/
- Instacart Tech — Space, Time and Groceries: https://tech.instacart.com/space-time-and-groceries-a315925acf3a
- Deliveroo Riders — How Frank decides when to offer you orders (search-snippet sourced, direct fetch failed): https://riders.deliveroo.hk/en/how-frank-decides-when-to-offer-you-orders
- bnxt.ai — The Ultimate Guide to Swiggy's Real-Time Order Allocation System (low-confidence, third-party): https://www.bnxt.ai/blog/the-ultimate-guide-to-swiggys-real-time-order-allocation-system
- Swiggy Bytes — Architecture behind Swiggy's Delivery Partners app (found via search, not directly fetched): https://bytes.swiggy.com/architecture-and-design-principles-behind-the-swiggys-delivery-partners-app-4db1d87a048a
- Extensiv — What Is Wave Planning in a WMS: https://www.extensiv.com/blog/what-is-wave-planning
- NextBillion.ai — Managing Delivery Time Windows for Grocery and Convenience Stores: https://nextbillion.ai/blog/delivery-time-windows-grocery-route-planning-playbook
- Ocado Technology (Medium) — The software routing 260,000 grocery deliveries a week (search-snippet sourced): https://medium.com/ocadotechnology/the-software-routing-260-000-grocery-deliveries-a-week-45308bac09e8
- Upper — Amazon Last-Mile Delivery Strategy & Tech (third-party, Rabbit device): https://www.upperinc.com/blog/amazon-last-mile-delivery/
- Amazon Last-Mile Routing Research Challenge (MIT CTL) — noted as existing, not analyzed in depth: https://routingchallenge.mit.edu/
- Locus.sh — Dark Store Routing Economics (background on dark-store dispatch generally): https://locus.sh/blogs/dark-store-routing-network-economics-north-america/
- arXiv — Dynamic Driver Allocation Under Latent Demand Regimes (academic, dark-store driver staffing POMDP): https://arxiv.org/html/2607.06816

**Not independently verified / not found in this session despite being requested in scope**: Locate2u,
Shipsy, Detrack, Track-POD, Dispatch Science, WorkWave, Samsara, Gopuff/Getir/Flink engineering specifics,
Zomato's own primary engineering post, Australia Post and Woolworths/Coles operational planning. Flagged
explicitly in §4 as gaps for a follow-up pass rather than silently omitted.
