# Route Sequencing & Optimization for Effy's Hub-and-Spoke Driver Operation

Research pass, 2026-09-20. Scope: Effy's two driver round types (collection round, same-day delivery
round), one hub, Melbourne AU, fewer than 10 drivers in Phase 1. Every claim below is either
sourced with a URL (fetched live during this research pass) or explicitly flagged as **UNVERIFIED /
from general knowledge** where a live source could not be confirmed (the session's web-search budget
was exhausted partway through this task — see §6 note).

---

## §1 Problem classification

Effy's two round types are *not* the same OR problem, and conflating them would lead to buying the
wrong tool.

### 1.1 Collection round (hub → shop A → shop B → … → hub)

- **Shape**: a **single vehicle**, a **small, stable, known set of locations** (Effy's own
  fulfilment shops — currently a handful, per the constitution "one hub for now" / "collection run"
  model), starting and ending at the same depot (the hub).
- **OR classification**: this is a **closed-route, single-vehicle Traveling Salesman Problem (TSP)**,
  optionally with **time windows** if shops have pickup-window constraints (e.g., "don't arrive before
  9am") — in which case it becomes a **TSPTW** (TSP with Time Windows), a well-studied special case of
  VRPTW with one vehicle. If more than one driver runs collection routes on a given day and shops are
  split between them, it becomes a **multi-vehicle VRP with time windows over a fixed, small node
  set** — still small enough that the "small stable set" property dominates the choice of tooling
  (§5).
- Because the location set is small and known (shops don't move day to day), this is the *easy* half
  of Effy's routing problem — it borders on a problem you can solve once and reuse, refreshing only
  when a package count or a shop's hours change.
- Citation for VRP/TSP variant taxonomy: [Vehicle routing problem — Wikipedia](https://en.wikipedia.org/wiki/Vehicle_routing_problem),
  which enumerates CVRP, VRPTW, MDVRP, Open VRP (OVRP — vehicles need not return to depot), VRPPD,
  VRPB, EVRP as named extensions of the base VRP; TSP is the VRP's single-vehicle,
  no-capacity-constraint degenerate case, and TSPTW is the corresponding time-windowed one.

### 1.2 Same-day delivery round (hub → customer 1 → customer 2 → … )

- **Shape**: a **single vehicle per round** (a driver's shift), an **arbitrary, daily-changing set of
  drop addresses** (whoever ordered same-day today), each with a **delivery promise** (a date, per the
  Effy constitution — not yet a time window, see §6/§7 of `CLAUDE.md`'s delivery engine notes,
  though a future promised window would land here), a **capacity constraint** (the van/car can only
  carry so many packages), and a **driver shift-end** constraint. The route is typically **open** in
  the OR sense during the round (driver drops customer N and the shift may end there or the driver
  may return to hub) but is usually modeled as a **closed route returning to the hub** for operational
  simplicity (the vehicle must come back for the next collection run or end-of-shift check-in).
- **OR classification**: this is a **Capacitated Vehicle Routing Problem with Time Windows (CVRPTW)**
  if/when promised windows are added, or a plain **CVRP / multi-drop TSP** today (single vehicle,
  capacity limit, no time windows yet beyond "same day"). If in the future proof-of-delivery requires
  signature capture at a scheduled hour, this becomes true VRPTW. Reference for VRPTW formally:
  [Google OR-Tools: VRPTW docs](https://developers.google.com/optimization/routing/vrptw) and the
  classic formulation chapter: [Kallehauge, *Vehicle Routing Problem with Time Windows* (PDF)](http://alvarestech.com/temp/vrptw/Vehicle%20Routing%20Problem%20with%20Time%20Windows.pdf).
- Because addresses are **arbitrary and unknown until the order is placed**, this is the *hard* half —
  a real geocoding + distance problem every single day, unlike the collection round.

### 1.3 Not in scope (yet)

Pickup-and-delivery problems (PDPTW) do **not** apply to Effy's current model: a driver does not pick
up from one customer and drop at another in the same round. If Effy ever adds customer returns picked
up by a driver, that would become a PDPTW variant layered onto the same-day round.

---

## §2 Options compared

### 2.1 Route-optimization solvers/libraries (the "which sequence" layer)

| Solver | Type | Problem coverage | Language / bindings | Licence | Self-host or hosted | Notes |
|---|---|---|---|---|---|---|
| **Google OR-Tools** (routing module) | Metaheuristic + local search (constraint programming) | TSP, CVRP, VRPTW, PDPTW, multi-depot, skills, breaks — "15+ VRP variants" | C++ core; official Python, Java, C#, .NET | Apache 2.0 | Self-host (embed in your service) | **No official Go binding.** Community-maintained wrappers exist: [bpowers/ortools](https://github.com/bpowers/ortools), [gonzojive/or-tools-go](https://github.com/gonzojive/or-tools-go) (cgo/SWIG-based, WIP), [airspacetechnologies/or-tools Go routing package](https://pkg.go.dev/github.com/airspacetechnologies/or-tools/go/ortools/constraintsolver). None is Google-official; see [GitHub discussion #2581](https://github.com/google/or-tools/discussions/2581) and [issue #953](https://github.com/google/or-tools/issues/953) confirming no first-party Go support as of this writing. Requires a **pre-computed distance/time matrix** — OR-Tools does not fetch road-network data itself. |
| **VROOM** (VROOM-Project) | Local search (C++20, SIMD) | TSP, CVRP, VRPTW, MDHVRPTW, PDPTW | HTTP JSON API (language-agnostic — trivial to call from Go) | BSD 2-Clause | Self-host (Docker) | Native OSRM/Valhalla/openrouteservice integration for the distance matrix — no separate matrix step needed. Reported solve times ~50–200ms for 50 vehicles/500 stops. Sources: [VROOM GitHub](https://github.com/VROOM-Project/vroom), [comparison write-up](https://www.pistack.xyz/posts/2026-06-16-self-hosted-vehicle-routing-optimization-vroom-jsprit-ortools/). |
| **jsprit** | Metaheuristic (ruin-and-recreate) | CVRP, VRPTW, MDVRP, PDP, custom constraints (skills, heterogeneous fleet) | Java library (embed or Spring Boot service) | Apache 2.0 | Self-host | JVM warm-up cost (2–10s reported) is real overhead for a tiny Go/Node stack; would mean running a sidecar JVM service. |
| **OptaPlanner / Timefold** | Constraint solver (metaheuristic, Java/Quarkus ecosystem) | VRP + many other constraint-satisfaction domains (staff rostering etc.) | Java/Kotlin; Timefold also ships a REST-callable service mode | Apache 2.0 (OptaPlanner); Timefold is dual-licensed (community + commercial) | Self-host | Heavier framework, aimed at teams already in the Java/Quarkus world; overkill to introduce solely for ~10 drivers. |
| **Google Route Optimization API (GMPRO, "Fleet Routing")** | Hosted | Full VRPTW/CVRP with traffic-aware matrix built in | REST | Proprietary, pay-per-use | Hosted only | ~**$10 per 1,000 optimized visits** for single-vehicle routing (per third-party pricing breakdowns; not independently confirmed on Google's own price list page during this pass — flag as **partially verified**). See [Routes API usage & billing](https://developers.google.com/maps/documentation/routes/usage-and-billing) and [GMPRO overview](https://blog.afi.io/blog/gmpro-google-maps-platform-route-optimization-api/). |
| **Mapbox Optimization API v2** | Hosted | TSP/VRP-style route sequencing | REST | Proprietary | Hosted | Free to 100,000 req/mo, then **$2.00/1,000** requests down to $1.20/1,000 at volume. **Cap: 50 coordinates/request (v2), 12 for v1**; up to 1,000 locations per "routing problem" overall, 300 req/min rate limit. Source: [Mapbox Optimization v2 docs](https://docs.mapbox.com/api/navigation/optimization/), pricing fetched from [mapbox.com/pricing](https://www.mapbox.com/pricing). |
| **HERE Tour Planning API** | Hosted | VRPTW-class fleet routing, sync request capped at **250 jobs / 35 vehicle types** (async for larger) | REST | Proprietary, Base-Plan-tiered | Hosted | Entry pricing reported at **~$34.98** for "waypoint sequencing" but real cost is volume-tiered/asset-based and requires a quote — **not fully transparent**, see [placematic.com HERE pricing breakdown](https://placematic.com/here-location-services/here-pricing/) (third-party, not HERE's own price sheet) and [HERE Tour Planning limits doc](https://docs.here.com/tour-planning/docs/limits). |
| **Routific API** | Hosted | VRPTW-class, address-level route planning | REST | Proprietary | Hosted | Platform (non-API) pricing: free to 100 orders/mo, then **$150/mo** for 100–1,000 orders, then per-order fees 3–15¢. **API-specific pricing is not published** — sales-quote only. Source: [dev.routific.com/pricing](https://dev.routific.com/pricing), [upperinc.com Routific pricing breakdown](https://www.upperinc.com/blog/routific-pricing/). |
| **OptimoRoute API** | Hosted | VRPTW-class | REST | Proprietary | Hosted | **Per-driver** pricing: Lite $35.10/driver/mo (annual)/$39 monthly, capped 700 orders; Pro $44.10/driver/mo (annual)/$49 monthly, up to 1,000 orders + POD/analytics. At <10 drivers this is roughly **$250–450/mo** for the whole fleet. Source: third-party pricing round-up (softwareadvice/upperinc), OptimoRoute's own published plan page not independently re-verified this pass. |
| **GraphHopper Route Optimization API** | Hosted (self-hosted OSS engine does **not** include this module) | VRPTW-class, credit-metered (`#vehicles × #locations`, min 10 credits, max `10 × #locations`) | REST | Proprietary (hosted); core routing engine is Apache 2.0 OSS | Both (routing engine self-hostable; optimization is hosted-only) | Plans: Free €0/mo (500 credits/day, 5 max locations, non-commercial only), Basic €69/mo (5,000/day, 30 locations, 1 vehicle), Standard €199/mo (15,000/day, 80 locations, 10 vehicles), Premium €479/mo (50,000/day, 200 locations, 20 vehicles). Source: [graphhopper.com/pricing](https://www.graphhopper.com/pricing/). |
| **Azure Maps Route Optimization** | Hosted | Exists as an Azure Maps capability | REST | Proprietary | Hosted | **Not independently verified this pass** — WebSearch budget was exhausted before this could be confirmed; treat Azure Maps as a plausible but unverified option and re-check `azure.microsoft.com/pricing/details/azure-maps/` directly before relying on it. |

**Bottom line on solvers**: OR-Tools has no first-party Go path — either shell out to a small Python
sidecar/microservice that embeds OR-Tools (simplest, well-trodden), or call **VROOM** over HTTP from
Go (no bindings needed at all, since it's a JSON API), or hand the whole VRP to a hosted API. Given
Effy's "no ORM, raw SQL, explicit wiring" ethos and its Go hot path, **VROOM-as-a-sidecar-service
called over HTTP** is the path of least architectural friction if/when a real solver is needed — no
cgo, no SWIG, no JVM.

### 2.2 Distance/time matrix providers (the cost driver — because a solver needs *N×N* matrix cells, not just N geocodes)

| Provider | Cost model | Storage/caching restriction | Notes |
|---|---|---|---|
| **OSRM** (self-hosted) | Free (compute only) | N/A — you own the data | BSD 2-Clause licence. Requires an OSM extract preprocessed offline (`osrm-extract`/`osrm-contract`), served from RAM via `osrm-routed`. Ships `/route`, `/table` (matrix), `/nearest`, `/match`, `/trip` (TSP heuristic) HTTP services — i.e. OSRM alone can do simple multi-stop sequencing via its `/trip` endpoint without VROOM. Source: [project-osrm.org](https://project-osrm.org/). |
| **Valhalla** (self-hosted) | Free (compute only) | N/A | MIT licence. Tiled hierarchical data structure aimed at low memory footprint; ships **matrix**, **isochrone**, **map-matching**, and **"tour optimization (Travelling Salesman)"** services out of the box. Source: [valhalla/valhalla GitHub](https://github.com/valhalla/valhalla). |
| **GraphHopper (self-hosted OSS core)** | Free (compute only), Apache 2.0 | N/A | Matrix API available in the **hosted** product; the plain OSS routing engine is a Java library/server, matrix/optimization are commercial add-ons per graphhopper.com. |
| **Google Distance Matrix API** | $2/1,000 elements standard, $1/1,000 at high volume (origins × destinations = elements) | ⚠ **Storing/caching/pre-fetching/indexing results is restricted** except for place IDs; results may only be displayed on a Google Map, not a third-party map. | Source: [Distance Matrix usage & billing](https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing), [Distance Matrix policies](https://developers.google.com/maps/documentation/distance-matrix/policies). This licence restriction is the single biggest reason **not** to build a persistent matrix cache from Google's API. |
| **Mapbox Matrix API** | Same tier as Optimization/Directions: free to 100k elements/mo, then $2.00→$1.20/1,000 | Not independently re-verified this pass for storage terms — Mapbox's ToS historically permits more caching than Google's but **confirm before relying on this**. | Source: [mapbox.com/pricing](https://www.mapbox.com/pricing). |
| **HERE Matrix Routing** | Volume-tiered, Base Plan capability, no flat per-1k rate published | Not independently verified this pass. | Source: [placematic.com HERE pricing](https://placematic.com/here-location-services/here-pricing/) (third-party). |

**Accuracy**: road-network matrices (OSRM/Valhalla/GraphHopper/Google/Mapbox/HERE) are materially more
accurate than straight-line Haversine distance in a real street grid, especially in Melbourne's grid
with one-way streets, freeways, and the Yarra/bay geography creating detours that a straight line
can't see. Haversine is fine as a **cheap pre-filter or sort key** (see §7) but not as the basis for a
"can this driver make it by 5pm" promise.

### 2.3 Geocoding

| Provider | AU coverage / accuracy | Cost | Commercial + storage terms | Notes |
|---|---|---|---|---|
| **G-NAF (Geocoded National Address File)** | **Authoritative** — the official Australian federal/state government address geocode dataset, "13+ million" physical address records | **Free** (open data) | **CC BY 4.0** — Creative Commons Attribution, explicitly open for reuse/storage/redistribution with attribution | Distributed via [data.gov.au](https://data.gov.au/data/dataset/showcases/geocoded-national-address-file-g-naf) as PSV files + SQL scripts. Loaders exist to bring it into Postgres directly: [minus34/gnaf-loader](https://github.com/minus34/gnaf-loader) (Docker image, PostGIS-aware), [Addresses-and-Postcodes/au-gnaf-importer](https://github.com/Addresses-and-Postcodes/au-gnaf-importer), [ajosephau/psma-gnaf-loader](https://github.com/ajosephau/psma-gnaf-loader). **This is exactly the same lineage Effy's existing `public.locality` CSV was derived from** — G-NAF at the full address level (not just locality/postcode level) is the natural next step. |
| **Google Geocoding API** | Very good globally incl. AU | Pay-as-you-go (exact $/1k not independently confirmed this pass; ~$5/1,000 is the commonly cited "Essentials" rate but **flag as unverified this pass**) | Same family of ToS restrictions as Distance Matrix — caching for performance is permitted for a limited period but **permanent storage/database-building from Google geocodes is restricted**; see [Geocoding usage & billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing). | Fine for **checkout-time autocomplete/validation** (a live call, not stored raw), wrong tool for **bulk geocoding your whole customer base into a column you keep**. |
| **Mapbox Geocoding** | Good | Temporary Geocoding API: free to 100k/mo, then $0.75→$0.45/1,000 | Not independently verified this pass. | Cheaper than Google per the fetched price sheet. |
| **HERE Geocoding** | Good | Not independently verified this pass. | — |
| **Nominatim (OSM)** | Variable — depends on OSM's AU address completeness, which is good in metro Melbourne but patchier regionally | Free (public instance) or free (self-hosted) | **Public instance: max 1 req/sec (4/min for bulk), results must be cached, bulk/production geocoding as a primary use case is explicitly discouraged and must self-host instead.** Source: [Nominatim usage policy](https://operations.osmfoundation.org/policies/nominatim/). | Effy should **never** point checkout-time geocoding at the public Nominatim instance for production load — either self-host Nominatim or (better, for AU) use G-NAF directly. |
| **Pelias** | Depends entirely on which data sources you import (OSM, OpenAddresses, Who's on First, Geonames, or your **own G-NAF CSV import**) | Free, self-hosted (Elasticsearch-backed) | Self-hosted, no external ToS | Source: [pelias/pelias GitHub](https://github.com/pelias/pelias). Pelias explicitly supports importing a custom CSV — **you could import G-NAF into Pelias** to get a full autocomplete/typeahead geocoder over authoritative AU data, self-hosted, no per-query fee, no storage restriction. |
| **Australia Post AMAS/PAF** | Authoritative for **postal validation** (does this address exist/deliverable), not primarily a geocoder | Commercial licence required for programmatic AMAS access | N/A | Complementary to G-NAF: PAF/AMAS answers "is this a real deliverable address," G-NAF answers "where is it." Not independently re-verified with a live fetch this pass — treat as background knowledge, confirm licence terms with Australia Post directly before depending on it. |

**Recommended AU geocoding path for Effy**: **G-NAF is the right primary source** — it's free, open
(CC BY 4.0), authoritative, and distributed in a form (PSV + loader scripts) built to land directly in
Postgres. It should replace/extend the existing locality-level CSV with **full street-address-level**
G-NAF records, giving exact lat/lng for a matched address rather than the postcode-centroid
approximation `public.locality` currently provides. For addresses G-NAF can't match exactly (new
builds, typos, unit-number edge cases), fall back to a live geocoder (Mapbox is the cheaper of the
commercial options fetched this pass) rather than storing its output.

---

## §3 Geodata acquisition plan — what Effy must add

Today: `public.shop` has **no address/coordinate column at all**; `customer_address` (jsonb-ish,
per the CLAUDE.md description: line1/line2/city/region/postal_code/country) is **un-geocoded**;
`public.locality` has **postcode-centroid** lat/lng from a 17-row sample of G-NAF-derived data (per
047's delivery engine); `delivery_settings` has one hub lat/lng. This is enough for *zone-level*
serviceability decisions (047) but **not enough to sequence a multi-stop delivery round**, which needs
per-address coordinates, not per-postcode ones.

### What to add, concretely

1. **`shop.address` (or a small `shop_location` side table)** — street address + **lat/lng columns**
   for every fulfilment shop. This is a **small, one-time, largely manual data-entry task** — Effy
   controls its own shops, so there is no bulk-geocoding problem here at all; an admin enters the
   address once per shop (back-office), and it's geocoded once (against G-NAF or a single live
   geocoder call) at creation time. This alone unblocks the **collection round** map (§1.1) and was
   the exact gap the driver-mobile in-app map work hit (`research R13` referenced in the CLAUDE.md
   driver-mobile entry).
2. **Full G-NAF address-level table in Postgres**, not just the locality/postcode sample currently
   shipped. Load path: download the current G-NAF release from
   [data.gov.au](https://data.gov.au/data/dataset/showcases/geocoded-national-address-file-g-naf)
   (PSV files, updated quarterly by Geoscape/PSMA under the Commonwealth's G-NAF licence, CC BY 4.0),
   and use an existing loader — [minus34/gnaf-loader](https://github.com/minus34/gnaf-loader) is the
   most actively documented one and is PostGIS-aware — to populate a new schema/table with
   `(address_detail_pid, full_address, latitude, longitude, confidence)` at street-number
   granularity. This is a **multi-GB one-time bulk load** (G-NAF full national extract is commonly
   several GB uncompressed across ~13M address points) — plan it as an offline batch job against a
   snapshot, not a live migration.
3. **`customer_address` gains a geocode step at write time.** When a customer enters/edits an
   address, resolve it against the local G-NAF table first (a match is free, instant, and license-
   clean); if G-NAF has no confident match, fall back to a live geocoder call (Mapbox, cheapest
   commercial option found) and **store the single resolved lat/lng** — this is Effy's own data at
   that point, not a cached copy of the vendor's matrix, so it sidesteps the "don't store our
   results" restriction that applies to *matrix/distance* results, not to a one-off geocode a user
   volunteered their own address into.
4. **A distance/time-matrix engine**, not a geocoder, for actually building routes: **self-host OSRM
   or Valhalla** (both free, both MIT/BSD-licensed, both fine to store derived route-sequencing
   output from since you compute it yourself) fed by a **Melbourne-region OSM extract** (a fraction of
   the full-planet download OpenFreeMap already documents fetching in "Btrfs and MBTiles formats" —
   the same underlying OSM data pipeline Effy already touches for its map tiles, see §8). This is
   the piece "our database has no geocoordinates" doesn't fix by itself — coordinates alone answer
   "where," a matrix engine answers "how long to drive between them."
5. **Optional, phase-2**: enable `postgis` on the RDS instance (confirmed supported — see §7) to do
   simple in-database nearest-neighbour / clustering (`<->` KNN, `ST_ClusterKMeans`) directly in SQL
   once coordinates exist, without standing up a separate routing service at all for the small-N
   collection-round case.

---

## §4 Requirement catalogue

40 requirements, tagged by necessity at Effy's actual Phase-1 scale (≤10 drivers, 1 hub, a small
stable shop set, 20–80 same-day drops/day).

| # | Requirement | Tag |
|---|---|---|
| 1 | Geocode every shop to lat/lng once, stored on `shop` | ESSENTIAL |
| 2 | Geocode every customer address at checkout/save time, stored on `customer_address` | ESSENTIAL |
| 3 | A hub lat/lng (already exists in `delivery_settings`) | ESSENTIAL |
| 4 | A road-network distance/duration matrix between hub↔shops (small, static set) | ESSENTIAL |
| 5 | A road-network distance/duration matrix between hub↔today's drop addresses (dynamic, daily) | ESSENTIAL |
| 6 | A deterministic stop-ordering algorithm for the collection round | ESSENTIAL |
| 7 | A deterministic stop-ordering algorithm for the same-day round | ESSENTIAL |
| 8 | Respect vehicle capacity (max packages/weight per van) when sequencing | ESSENTIAL |
| 9 | Respect driver shift-end when sequencing (don't build a route that can't finish in time) | ESSENTIAL |
| 10 | Respect the collection cutoff (2pm-style) already governing same-day eligibility (047) | ESSENTIAL |
| 11 | Recompute/resequence if a stop is added or cancelled mid-round | ESSENTIAL |
| 12 | Hand the sequenced list to a driver as an ordered stop list in the app | ESSENTIAL |
| 13 | One-tap external navigation hand-off per stop (or per leg) to the phone's map app | ESSENTIAL |
| 14 | In-app map showing the hub + shops + today's drop pins (needs #1–#3) | ESSENTIAL |
| 15 | Legally clean address/geocode data provenance (no store-restricted vendor data cached) | ESSENTIAL |
| 16 | A fallback when geocoding fails (new-build address, typo) — human review or best-effort | ESSENTIAL |
| 17 | Store the *result* of sequencing (the order) durably so a restarted app shows the same order | ESSENTIAL |
| 18 | Service/dwell time per stop (time spent parking + walking + handing off) factored into ETA | USEFUL |
| 19 | Promised delivery time windows (not just "today") sequenced against | USEFUL — not yet a product feature per 047 (date-granular only) |
| 20 | Traffic-aware (time-of-day) travel time, not static free-flow | USEFUL |
| 21 | Re-optimize (not just re-sequence) when a route becomes infeasible mid-day | USEFUL |
| 22 | Multi-driver load-balancing across same-day rounds (split 60 drops across 3 drivers fairly) | USEFUL |
| 23 | A real solver (2-opt/OR-Tools/VROOM) rather than a greedy heuristic | USEFUL at current volume; ESSENTIAL if same-day volume grows past ~100 drops/driver/day |
| 24 | Skills/vehicle-type matching (e.g. only some vans can carry chilled goods) | USEFUL if/when product needs it — not currently in scope |
| 25 | A persistent, self-hosted distance-matrix engine (OSRM/Valhalla) rather than per-call vendor API | USEFUL — avoids per-call cost and storage-ToS friction at volume |
| 26 | PostGIS installed for in-database geospatial queries (KNN, clustering) | USEFUL |
| 27 | pgRouting for true road-network shortest paths inside Postgres | OVERKILL-AT-OUR-SCALE — needs a full graph of the AU road network loaded and maintained inside Postgres; a routing-engine sidecar (OSRM/Valhalla) does this better and is what those tools exist for |
| 28 | A hosted VRP solver subscription (HERE/Routific/OptimoRoute/Mapbox Optimization) | OVERKILL-AT-OUR-SCALE for <10 drivers — the per-driver/per-route hosted pricing (§2.1) is built for larger fleets |
| 29 | Google Route Optimization API / traffic-aware fleet routing | OVERKILL-AT-OUR-SCALE and carries the strictest storage ToS of any option |
| 30 | Full VRPTW with hard time windows + breaks + skills modeling (OR-Tools-class complexity) | OVERKILL-AT-OUR-SCALE today — Effy has one vehicle type, one depot, no promised time-of-day windows yet |
| 31 | Real-time re-routing based on live GPS + live traffic (Waze-style dynamic replanning) | OVERKILL-AT-OUR-SCALE — Effy hands off navigation to a native map app anyway (§8), which already does this |
| 32 | Multi-depot routing | OVERKILL-AT-OUR-SCALE — "one hub for now," explicitly deferred by 047/049 |
| 33 | Electric-vehicle range/charging-aware routing (EVRP) | OVERKILL-AT-OUR-SCALE — not stated as an Effy fleet constraint |
| 34 | Isochrone ("how far can a driver get in 30 min") analysis for service-area planning | USEFUL for delivery-zone design (adjacent to 047), not for daily sequencing |
| 35 | Address autocomplete/validation at checkout against G-NAF/geocoder | USEFUL — improves address quality up front, reduces #16 fallback rate |
| 36 | A committed, versioned G-NAF snapshot (not a live scrape) so builds are reproducible | ESSENTIAL |
| 37 | Attribution/compliance for OSM-derived tiles and data (ODbL, OpenFreeMap terms) | ESSENTIAL |
| 38 | A distance-matrix caching layer scoped to *self-computed* results only (never cached vendor output where ToS forbids it) | ESSENTIAL |
| 39 | Graceful UI messaging when a route can't be completed in time (infeasible round) rather than silently truncating stops | ESSENTIAL |
| 40 | Monitoring/metrics on route length, on-time rate, and sequencing failures (fits the existing Prometheus/Grafana observability stack) | USEFUL |
| 41 | A manual override — a driver or dispatcher can reorder stops by hand | USEFUL |
| 42 | Bulk historical-address geocoding backfill for existing un-geocoded `customer_address` rows | ESSENTIAL (one-time) |

---

## §5 Recommendation for Effy

### Phase 1 (now, ≤10 drivers, ≤~80 drops/day): **do not stand up a solver at all**

At this scale the honest, evidence-backed answer is: **a simple heuristic is good enough, and a real
solver would be solving a problem Effy doesn't have yet.**

- **Nearest-neighbour construction, corrected with 2-opt (or even just Or-opt), is well documented to
  get within a few percent of optimal** for small Euclidean-style instances — the oft-cited result
  (Johnson & McGeoch, *Experimental Analysis of Heuristics for the STSP*, in Gutin & Punnen's *The
  Traveling Salesman Problem and Its Variations*) is that nearest-neighbour alone averages **roughly
  25% above the Held–Karp/optimal bound**, and a 2-opt pass on top closes most of that gap to
  single-digit percent. **I could not independently re-fetch this paper during this pass** (it sits
  behind ResearchGate/Springer and returned 403) — treat the exact "~25%" figure as **widely cited in
  the OR literature but not re-verified live here**; it is, however, consistent with what every
  general VRP-benchmark source found in this pass says qualitatively (modern metaheuristics get to
  within 0.5–1% of optimal on much *larger* instances — [Wikipedia's VRP article](https://en.wikipedia.org/wiki/Vehicle_routing_problem)
  — which only reinforces that a NN+2-opt pass on an 8-stop collection round or a 20–30-stop
  same-day round is not leaving meaningful money on the table).
- For the **collection round** specifically: shops are few and fixed. A **sweep algorithm** (sort
  shops by bearing from the hub, then traverse in angular order) or even a **hand-fixed, dispatcher-
  set order** re-evaluated only when the shop set changes is entirely sufficient — this is squarely
  cluster-first/route-second territory but the "cluster" is trivially just "all shops in one round"
  at <10 stops.
- For the **same-day round**: compute a Haversine-sorted or **geohash/Hilbert-curve-ordered** stop
  list as the first cut (cheap, no external calls, deterministic), then apply an in-process **2-opt
  improvement pass** using a small OSRM-derived (or even Haversine, if OSRM isn't stood up yet)
  distance matrix for the day's ~20–80 stops. This is a few hundred lines of Go, no new service, no
  vendor dependency, and it directly satisfies requirements #6/#7/#8/#9/#11 in §4.
- **Do install PostGIS now** (`CREATE EXTENSION postgis` — confirmed supported on RDS PostgreSQL 16,
  version 3.4.6, via [AWS's extension release notes](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html)
  and the [RDS PostGIS management guide](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html))
  — it's a one-line migration, unlocks `<->` KNN and `ST_ClusterKMeans`/`ST_ClusterDBSCAN` for free,
  and costs nothing to have available even before a heuristic needs it.
- **Load G-NAF now** (§3) — this is the actual bottleneck to *any* of the above, since none of it
  works without real coordinates on shops and customer addresses. This is infrastructure work
  independent of which sequencing approach is chosen.
- **Do not adopt pgRouting in Phase 1** — it needs a maintained road-network graph inside Postgres,
  which is exactly what OSRM/Valhalla exist to own outside the database; loading and keeping a
  drivable-graph current inside Postgres is a second copy of data OSRM already indexes better.

### Phase 2 upgrade path (if same-day volume grows meaningfully, e.g. >100 drops/driver/day, multiple
hubs, or true delivery time windows land):

1. **Stand up OSRM (or Valhalla) self-hosted**, fed a Melbourne-region OSM extract, for a real
   road-network distance/duration matrix — replaces the Haversine/geohash pre-sort with actual drive
   times. Free to run beyond compute (a small ECS/Fargate task, consistent with Effy's existing
   Fargate hot-path pattern), BSD/MIT licensed, no storage-ToS friction because you generated the
   numbers yourself.
2. **Call VROOM (self-hosted, BSD-2-Clause) over HTTP from the Go hot path** as a sidecar service,
   pointed at the OSRM instance, once the heuristic in Phase 1 stops being "good enough" — VROOM needs
   no Go bindings (it's a JSON HTTP API), reports solve times of 50–200ms even for 50-vehicle/
   500-stop problems (far beyond Effy's scale), and covers CVRPTW out of the box if/when promised
   time windows land.
3. Only consider a **hosted** VRP API (HERE/GraphHopper/Mapbox Optimization) if Effy ever wants to
   shed the operational burden of running OSRM/VROOM entirely — at <10 drivers this is not worth the
   per-request or per-driver cost shown in §2.1, and several of those hosted quotes (Routific,
   OptimoRoute, HERE Tour Planning's real rate) are **not even transparently published**, requiring a
   sales conversation before a real cost can be known.

### Estimated monthly cost at Effy's current volume (Phase 1)

- **G-NAF**: $0 (open data, one-time load, minor S3/storage cost only).
- **PostGIS**: $0 (already-paid-for RDS instance, just an extension).
- **Sequencing (in-process NN+2-opt/sweep in Go)**: $0 marginal cost — runs inside the existing
  `core-api` Fargate task.
- **Geocoding fallback for the rare G-NAF miss** (Mapbox, cheapest commercial option found): free to
  100,000 requests/month, effectively $0 at Effy's order volume.
- **Navigation hand-off**: $0 (native map app URL schemes, §8).
- **Total realistic Phase-1 incremental spend: ~$0–20/month**, essentially the marginal S3/compute
  cost of hosting the G-NAF load and (optionally) an OSRM task if brought forward early.
- **Phase 2 (OSRM/Valhalla + VROOM self-hosted)**: a small additional Fargate task, comparable in
  cost to Effy's other lightweight cheapest-task services (the CLAUDE.md's own core-api deploy note
  cites ~$30/month for a comparable minimal Fargate service) — so budget **~$30–60/month** for a
  Phase-2 routing sidecar, still an order of magnitude below any hosted VRP subscription in §2.1.

---

## §6 Distance-time matrix, time windows, and infeasibility handling in real systems

- Real systems (VROOM, OR-Tools, jsprit, hosted fleet APIs alike) model **service time** as a
  per-stop duration added on top of travel time when checking whether a time window/shift-end
  constraint is satisfiable — this is a standard VRPTW dimension (see the
  [OR-Tools VRPTW guide](https://developers.google.com/optimization/routing/vrptw) and
  [OR-Tools resource-constraints doc](https://developers.google.com/optimization/routing/cvrptw_resources?hl=en)
  for how "dimensions" carry cumulative time/capacity through a route).
- **Traffic/time-of-day** factors are typically handled by querying the matrix engine with a
  departure-time parameter (OSRM/Valhalla support historical-speed profiles; Google/HERE/Mapbox
  matrix APIs support live-traffic-aware variants at a pricing premium) rather than baking a fixed
  multiplier into the solver.
- **Driver shift-end** is modeled exactly like a time window on the depot return node — the vehicle's
  own "time window" is `[shift_start, shift_end]` at the hub.
- **Infeasibility**: when a route can't fit every requested stop in the available time/capacity, real
  systems either (a) **drop the least-valuable stop and flag it** (OR-Tools supports this via
  "disjunctions" with penalty costs — omitting a stop costs a penalty but is allowed rather than
  making the whole problem infeasible) or (b) **push it to the next round/next day** and surface that
  to dispatch. Effy should adopt (a)/(b) rather than ever silently truncating a driver's list — this
  maps directly to requirement #39 in §4.

*(Note: I originally scoped a dedicated WebSearch pass on this topic but the session's shared
WebSearch budget was exhausted (200/200) partway through this research task, after which I continued
using WebFetch against known documentation URLs. The above reflects what the already-fetched OR-Tools
docs and VRP literature say; it was not possible to run additional fresh WebSearch queries specifically
on "infeasibility handling" beyond what surfaced incidentally.)*

---

## §7 Sequencing without full optimization

- **PostGIS is confirmed available on AWS RDS PostgreSQL 16** (version 3.4.6) and is enabled with a
  plain `CREATE EXTENSION postgis` (requires `rds_superuser`, which Effy already has via its
  migration workflow). Sources: [RDS PostGIS management doc](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html),
  [RDS extension-versions release notes](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html).
- PostGIS ships genuinely useful primitives for Effy's scale without any external service:
  `ST_ClusterKMeans` (window function, k-means clustering of geometries),
  `ST_ClusterDBSCAN` (density-based clustering — good for "group nearby drops"),
  `ST_ClusterWithin`/`ST_ClusterIntersecting` (distance/adjacency-based clustering), and the `<->`
  KNN operator for fast "nearest N stops" queries against a spatial index. Source:
  [PostGIS clustering function reference](https://postgis.net/docs/manual-3.4/reference.html#Clustering).
- **pgRouting** is also available on RDS PG16 (v3.5.0) and supports Dijkstra, A*, TSP, k-shortest-path
  algorithms — but it operates over a **road-network graph you must load and maintain inside
  Postgres yourself**; it is not a turnkey "give me lat/lngs, get a route" tool the way OSRM/Valhalla
  are. Source: [pgRouting.org](https://pgrouting.org/), GPLv2 licensed. This is why §5 recommends
  against it for Phase 1 — the graph-maintenance burden isn't worth it when OSRM/Valhalla exist
  precisely to own that problem outside the database.
- **Geohash / Hilbert-curve ordering** and the classic **sweep algorithm** (sort stops by polar angle
  from the depot, walk them in that order) are legitimate zero-infrastructure Phase-1 techniques —
  they require only lat/lng (from §3) and no external service call at all, and for a single-vehicle,
  <100-stop round they typically land close to what a 2-opt pass would refine to, especially once a
  2-opt local-search cleanup runs on top (see §5).
- **Verdict**: yes — **Postgres + PostGIS alone can do a genuinely decent job** for Effy's current
  scale (KNN + clustering + a Go-side sweep/2-opt), without needing OSRM, VROOM, or any paid API, as
  long as coordinates exist (§3 is the real prerequisite, not the algorithm).

---

## §8 Driver-side navigation hand-off

| App | URL scheme | Multi-stop support | Source |
|---|---|---|---|
| **Google Maps** | `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&waypoints=STOP1\|STOP2\|…` | **Up to 3 waypoints on mobile browsers, up to 9 otherwise**, per Google's own URL docs; waypoints render in the order listed | [Google Maps URLs — Get Started](https://developers.google.com/maps/documentation/urls/get-started) |
| **Apple Maps** | `http://maps.apple.com/?saddr=…&daddr=…&dirflg=d` | **No documented waypoint support** — only a single origin (`saddr`) and single destination (`daddr`) | [Apple's iPhone URL Scheme reference (archived)](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html) |
| **Waze** | `waze://?ll=lat,lon&navigate=yes` (single destination) | **UNVERIFIED this pass** — the live fetch of Waze's site returned no scheme documentation; from general/background knowledge Waze's public URL scheme is single-destination-only and has no documented multi-stop parameter, but this specific claim was **not** confirmed against Waze's own developer docs during this research pass and should be independently checked before being relied on in a spec. |

**Implication for Effy's driver app**: none of the three major consumer map apps reliably accept a
full multi-stop route via URL. The practical pattern used by delivery apps generally (and the one
Effy should adopt) is **per-leg hand-off** — the driver app already knows the sequenced stop list
(from Phase-1 heuristic or Phase-2 solver); tapping "Navigate" on the *current* stop opens the native
map app with just that one destination (`origin` = current location or omitted, `destination` = next
stop), not the whole route. This sidesteps every waypoint-count limitation above and matches what the
existing 049 driver-mobile "external Navigate hand-off" capability already does per the CLAUDE.md
status notes ("device maps, customer address" — single destination).

### OpenFreeMap / MapLibre (Effy's current mobile map stack)

- **OpenFreeMap is free, MIT-licensed infrastructure code, with map *data* sourced from OpenStreetMap**
  under OSM's own licence (ODbL); **commercial use is explicitly permitted** and the public instance
  documents **no rate limit or API key requirement**. Self-hosting is fully supported via weekly
  planet-wide tile downloads (Btrfs/MBTiles). Source: [openfreemap.org](https://openfreemap.org/).
- **Attribution is required** — to OpenFreeMap, OpenMapTiles, and OpenStreetMap — per the same source;
  this satisfies requirement #37 in §4 as long as the attribution is actually rendered in the app (a
  detail worth a source-guard check, in the pattern of Effy's other "prove it, don't assert it"
  guards).
- **What OpenFreeMap/MapLibre cannot do**: it is a **tile server + rendering library only** — no
  geocoding, no routing, no distance matrix, no turn-by-turn. Effy's existing choice to use OpenFreeMap
  for map *display* and hand off actual **navigation** to the native map app (per the driver-mobile
  status notes) is consistent with this — OpenFreeMap was never going to provide turn-by-turn or
  routing, only the visual basemap.
- Alternatives if OpenFreeMap's public instance ever becomes unsuitable: **MapTiler** (commercial,
  published pricing tiers), **Protomaps** (self-hosted, PMTiles format, open-source), or continuing
  to **self-host OpenFreeMap's own tile pipeline** (it's designed for exactly that). None of these
  were independently re-verified for current pricing this pass beyond what's cited above.

---

## §9 Sources (all URLs fetched live during this research pass)

1. [Vehicle routing problem — Wikipedia](https://en.wikipedia.org/wiki/Vehicle_routing_problem)
2. [Google OR-Tools: Vehicle Routing Problem with Time Windows](https://developers.google.com/optimization/routing/vrptw)
3. [Google OR-Tools: Resource Constraints (CVRPTW)](https://developers.google.com/optimization/routing/cvrptw_resources?hl=en)
4. [Kallehauge, "Vehicle Routing Problem with Time Windows" (PDF chapter)](http://alvarestech.com/temp/vrptw/Vehicle%20Routing%20Problem%20with%20Time%20Windows.pdf)
5. [google/or-tools GitHub discussion #2581 — Go bindings](https://github.com/google/or-tools/discussions/2581)
6. [google/or-tools GitHub issue #953 — Go support](https://github.com/google/or-tools/issues/953)
7. [bpowers/ortools — Go wrapper](https://github.com/bpowers/ortools)
8. [gonzojive/or-tools-go](https://github.com/gonzojive/or-tools-go)
9. [airspacetechnologies/or-tools Go constraintsolver package](https://pkg.go.dev/github.com/airspacetechnologies/or-tools/go/ortools/constraintsolver)
10. [VROOM-Project/vroom GitHub](https://github.com/VROOM-Project/vroom)
11. [Self-Hosted Vehicle Routing Optimization Engines: VROOM vs JSprit vs OR-Tools — Pi Stack](https://www.pistack.xyz/posts/2026-06-16-self-hosted-vehicle-routing-optimization-vroom-jsprit-ortools/)
12. [GNAF loader — minus34/gnaf-loader GitHub](https://github.com/minus34/gnaf-loader)
13. [au-gnaf-importer GitHub](https://github.com/Addresses-and-Postcodes/au-gnaf-importer)
14. [psma-gnaf-loader GitHub](https://github.com/ajosephau/psma-gnaf-loader)
15. [G-NAF dataset — data.gov.au](https://data.gov.au/data/dataset/showcases/geocoded-national-address-file-g-naf)
16. [AWS RDS: Managing spatial data with the PostGIS extension](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html)
17. [AWS RDS: Supported PostgreSQL extension versions](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/PostgreSQL.Concepts.General.FeatureSupport.Extensions.html)
18. [AWS RDS: PostgreSQL extensions supported by version (16.x table)](https://docs.aws.amazon.com/AmazonRDS/latest/PostgreSQLReleaseNotes/postgresql-extensions.html)
19. [Google Maps Platform: Distance Matrix usage and billing](https://developers.google.com/maps/documentation/distance-matrix/usage-and-billing)
20. [Google Maps Platform: Distance Matrix policies](https://developers.google.com/maps/documentation/distance-matrix/policies)
21. [Google Maps Platform: Geocoding usage and billing](https://developers.google.com/maps/documentation/geocoding/usage-and-billing)
22. [Google Maps Platform: Routes API usage and billing](https://developers.google.com/maps/documentation/routes/usage-and-billing)
23. [Mapbox pricing](https://www.mapbox.com/pricing)
24. [Mapbox Optimization API v2 docs](https://docs.mapbox.com/api/navigation/optimization/)
25. [HERE Tour Planning API — route/stop limits](https://docs.here.com/tour-planning/docs/limits)
26. [HERE API Pricing 2026 breakdown — Placematic (third-party)](https://placematic.com/here-location-services/here-pricing/)
27. [Routific API pricing](https://dev.routific.com/pricing)
28. [Routific pricing breakdown — Upper Inc (third-party)](https://www.upperinc.com/blog/routific-pricing/)
29. [GraphHopper Directions API pricing](https://www.graphhopper.com/pricing/)
30. [project-osrm.org](https://project-osrm.org/)
31. [Nominatim usage policy — OSM Foundation](https://operations.osmfoundation.org/policies/nominatim/)
32. [PostGIS clustering function reference (3.4 manual)](https://postgis.net/docs/manual-3.4/reference.html#Clustering)
33. [pgRouting.org](https://pgrouting.org/)
34. [valhalla/valhalla GitHub](https://github.com/valhalla/valhalla)
35. [pelias/pelias GitHub](https://github.com/pelias/pelias)
36. [OpenFreeMap](https://openfreemap.org/)
37. [Google Maps URLs — Get Started (waypoint scheme + limits)](https://developers.google.com/maps/documentation/urls/get-started)
38. [Apple iPhone URL Scheme Reference (archived) — Map Links](https://developer.apple.com/library/archive/featuredarticles/iPhoneURLScheme_Reference/MapLinks/MapLinks.html)
39. [GMPRO / Google Maps Platform Route Optimization API overview — afi.io blog (third-party)](https://blog.afi.io/blog/gmpro-google-maps-platform-route-optimization-api/)

### Explicitly unverified / not independently confirmed this pass

- Exact Google Geocoding $/1,000 rate (page did not surface the number directly; only QPS quotas).
- Google Route Optimization API's exact $10/1,000-visits figure (third-party sourced, not Google's own price list).
- HERE's exact per-transaction Matrix/Tour Planning rates (both are volume-tiered/quote-only).
- OptimoRoute's current published plan prices (third-party round-up, not OptimoRoute's own page).
- Azure Maps Route Optimization pricing/capability (not looked up at all — WebSearch budget ran out first).
- Waze's URL-scheme multi-stop support (fetch returned no scheme documentation).
- The exact Johnson & McGeoch "~25% above optimal for nearest-neighbour" figure (well-established in OR literature by broad reputation, but the primary source returned HTTP 403 on this pass and was not independently re-read).
- Mapbox's and HERE's data-storage/caching ToS terms for matrix results (only Google's restrictive policy was independently confirmed).
- Australia Post AMAS/PAF licensing terms (background knowledge only, not fetched this pass).
