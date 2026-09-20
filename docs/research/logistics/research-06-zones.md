# Research 06 — Zone / Territory Modelling & Driver Capability Matching

Scope: how to model delivery zones and match drivers to (function × method × zone) capability
combinations for Effy's Melbourne hub-and-spoke driver operation, on PostgreSQL 16 / AWS RDS,
raw SQL, no ORM, PostGIS not currently installed.

⚠ **Research-tooling note, stated up front per instructions**: this session's `WebSearch` budget
was exhausted after 8 queries (shared session-wide cap), so the remainder of this research was done
with `WebFetch` against specific URLs. Several vendor engineering blogs actively block automated
fetches (DoorDash's `careersatdoordash.com`/`doordash.com` blog, Instacart's `tech.instacart.com`,
Deliveroo's public engineering index returned no zone-specific articles, HERE's isoline page, and
Australia Post's postcode-data page all returned 403/404 to WebFetch). Where a claim about
DoorDash/Instacart/Amazon Logistics/Deliveroo specifics could **not** be independently verified in
this session, it is **omitted or explicitly flagged as unverified** rather than asserted from
background knowledge — per the "do not guess" instruction. What follows is sourced only from pages
that were actually fetched successfully.

---

## §1 Zone modelling approaches compared

| Approach | What it is | Accuracy | Maintenance burden | Query cost | Who uses it (verified) |
|---|---|---|---|---|---|
| **Postcode / ZIP lists** | A set of postal codes assigned to a zone; membership is a lookup table | Low–medium — postcodes are Australia Post *delivery-route* artifacts, not surveyed polygons (§2) | Low — editing a list is a single SQL statement | Very low — `WHERE postcode = ANY(...)` or a join, no geometry engine needed | Effy today (`delivery_zone_postcode`, `UNIQUE(postcode)`) |
| **Polygons / GeoJSON geofences** | Hand-drawn or authoritative boundary shapes, tested with point-in-polygon | High, if maintained by someone who actually walks the boundary | High — every boundary edit needs a human to redraw and validate | Needs a spatial index (PostGIS `GIST`) for point-in-polygon at scale; trivial for a single point-in-polygon check without an index at Effy's volume | Onfleet ("If you have an overlay on your map to delegate zones, you can right-click within a zone…") — [Onfleet Teams](https://support.onfleet.com/hc/en-us/articles/360053987172-Teams); geofencing generally — [Fleet Geofencing Explained (Upper)](https://www.upperinc.com/blog/fleet-geofencing/) |
| **Radius from a point** | "Within N km of the hub/shop" | Low — ignores roads, rivers, freeways; a straight-line circle regularly includes unreachable areas and excludes reachable ones | Trivial to define | Trivial with a lat/lon and Haversine, or `<->` KNN with PostGIS `geography` | Effy's `delivery_ring.suggest_upper_km` already uses Haversine-from-hub as a **suggestion** input, not the final serviceability rule — i.e., Effy already avoided pure-radius-as-truth |
| **Drive-time isochrones** | The reachable area within N minutes of driving, accounting for the real road network | High for the thing same-day promises are actually about (time, not distance) | Medium — needs a routing engine + periodic recompute as roads/traffic profiles change | Expensive to compute (graph search over OSM), cheap to query once cached as a polygon | Valhalla, OSRM, Mapbox, HERE, TravelTime (§3) |
| **H3 / S2 / geohash cells** | A discrete global grid (hexagons for H3, quadtree cells for S2/geohash); locations are bucketed into cells at a chosen resolution | Medium-high for aggregation/heatmap purposes; cells don't respect roads either | Low once adopted — cell boundaries never need "redrawing"; only the chosen resolution and which cells belong to a zone change | Very low — integer/string cell-ID equality and prefix/neighbour lookups, no geometry engine required for cell math | Uber invented H3 specifically to replace both postcodes *and* radius/operator-drawn zones for surge pricing and UberPool matching — [Uber H3 blog](https://www.uber.com/en-LT/blog/h3/) |
| **Administrative boundaries (suburb/LGA/SA1-SA2)** | Official census/government geography | High as *surveyed* boundaries, but not designed for logistics | Low — government-maintained, updated on a fixed schedule (ABS ASGS) | Needs polygon data + spatial join, same cost class as geofences | ABS SA1/SA2 hierarchy (§2); G-NAF locality, which Effy already has as `public.locality` |

**Why Uber rejected postcodes/admin boundaries for H3, in their own words** (directly relevant to
whether Effy should follow the same reasoning): *"Analysis at the finest granularity, the exact
location where an event happens, is very difficult and expensive. Analysis on areas, such as
neighborhoods within a city, is much more practical."* Postal codes and administrative boundaries
"have unusual shapes and sizes which are not helpful for analysis" and change "for reasons entirely
unrelated" to a delivery operator's needs; operator-drawn zones "require frequent updating as cities
change and often define the edges of areas arbitrarily." H3's hexagons give uniform cell size/shape,
no arbitrary edges, and stability over time.
[Source: Uber H3 blog](https://www.uber.com/en-LT/blog/h3/)

**What this means for Effy, stated plainly**: Uber's argument is an argument *against exactly the
approach Effy already ships* (postcode zones). It is a strong argument **at Uber's scale**
(global, millions of events/day, values consistency across dozens of cities). It is a much weaker
argument **at Effy's scale** (one hub, one metro, fewer than 10 drivers) — see §6 for why the
verdict differs.

**Onfleet's model, the closest verified analogue to a small dispatch operation**: **Teams** group
drivers/dispatchers, each Team can carry a geofence overlay and (at most) one Hub; auto-dispatch
assigns unassigned tasks within a team to on-duty drivers by proximity, and manual zone-select
("Select Tasks in Zone") lets a dispatcher bulk-move tasks into a team.
[Source: Onfleet Teams](https://support.onfleet.com/hc/en-us/articles/360053987172-Teams),
[Onfleet Auto Assignment](https://support.onfleet.com/hc/en-us/articles/360023669852-Auto-Assignment)

**Bringg's model**: skills are attached to a vehicle/driver, and Bringg auto-assigns orders to
routes whose driver/vehicle skills satisfy the order's declared requirements. Bringg's own
documentation explicitly frames this as "assign the most appropriate vehicle and the driver with
the correct skills to complete the order," and the fallback UX when nothing matches is explicit:
"add a driver with the required skills, or a vehicle with more capacity, or reschedule the order."
[Source: Bringg Dispatch Orders](https://help.bringg.com/docs/dispatch-orders-with-bringg). Bringg's
public docs did **not** yield verifiable detail on how "regions" are drawn (geofence vs postcode) —
flagged as unverified rather than guessed.

---

## §2 The Australian postcode problem

**The core fact, from the ABS itself**: *"A postcode is a four digit number used by Australia Post
to assist with mail delivery… Australia Post does not currently define geographic boundaries for
postcodes."* Any boundary drawn around a postcode is somebody's **approximation**, not an
authoritative shape.
[Source: ABS ASGS Vol 3 — Postal Areas](https://www.abs.gov.au/ausstats/abs@.nsf/Lookup/by%20Subject/1270.0.55.003~July%202016~Main%20Features~Postal%20Areas%20(POA)~8)

**The ABS's own workaround — Postal Areas (POA)**: because "authoritative postcode boundaries are
not publicly available," the ABS builds **Postal Areas** by allocating whole **Mesh Blocks** (the
smallest ABS geographic unit) to a postcode "based on the largest population contribution" — i.e.
population-weighted, not boundary-surveyed. As of the current edition there are 2,644 POAs covering
Australia plus special-purpose codes.
[Source: ABS Postal Areas, Edition 3](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/non-abs-structures/postal-areas)

**Explicit caveats the ABS documents**:
- **Incomplete coverage**: some official postcodes are *excluded* from POA entirely, either because
  one Mesh Block covers multiple postcodes, or multiple Mesh Blocks partly cover one postcode but
  get allocated elsewhere by the population rule.
- **Non-geographic postcodes excluded**: "Postal Areas exclude postcodes that are not street
  delivery areas. These include post office boxes, mail back competitions, large volume receivers."
  These postcodes exist and appear in address data but correspond to **no place at all**.
- **Explicit disclaimer**: "ABS approximations of administrative boundaries do not match official
  legal boundaries and should only be used for statistical purposes" — the ABS is telling you not to
  use POA as ground truth for anything operational.
- **Cross-boundary spanning**: some postcodes span state/territory lines.
[Source: ABS Postal Areas](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/non-abs-structures/postal-areas)

**The SA1/SA2 hierarchy, and why POA sits awkwardly on top of it**: SA2s are "medium-sized
general-purpose geographic areas that represent communities that interact together socially and
economically," typically 3,000–25,000 people; POAs are built from *whole SA1s* (which aggregate into
SA2s), so a POA is a geographic approximation assembled from the *census* hierarchy for the purpose
of letting postcode-tagged data be compared with ABS statistics — **it was built for statisticians
linking datasets, not for logistics companies drawing service boundaries**. The ABS's own guidance is
blunt about correspondence-based geography conversions generally: "Correspondences… should only be
used when one of the other options isn't available, as this method is the least accurate in terms of
moving data between geographies," and specifically for POA: "SA1s can span multiple postcodes,
postcodes can overlap multiple SA1s, and in areas where no clear postcode dominance exists, these
mismatches can reduce the precision of analyses that rely on POAs."
[Source: ABS POA/SA2 methodology](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/methodology)

### Verdict for Melbourne metro grocery

**Postcode-based zoning is defensible for Effy's stated use case, with one condition: the postcode
is being used as a *serviceability lookup key*, never as a *polygon*.** Here is the reasoning:

1. Effy's actual operational question at checkout is binary and coarse: *"is this address inside an
   area we currently serve, and if so which ring/cutoff applies?"* — not *"what is the precise
   geographic shape of this area?"* A lookup table (`postcode → zone`) answers the binary question
   exactly as well as a polygon does, because Australia Post's own delivery routing (the thing that
   determines whether a courier/driver can practically reach an address in a reasonable time) is
   *itself* organized around postcodes, not around SA2s or hand-drawn geofences.
2. The documented failure modes of postcode zoning (PO-box-only codes, large-volume-receiver codes,
   codes with no coherent shape) are **irrelevant to Effy specifically**, because those excluded
   codes represent addresses nobody is having groceries delivered to (they're mail-only artifacts).
   Melbourne metro *residential* postcodes are reasonably coherent as delivery-routing units — this
   is exactly why Australia Post itself, Woolworths and Coles all route delivery logistics off
   postcode/suburb, not off SA1 polygons (industry-standard pattern, per Effy's own brief; not
   independently re-verified in this session per the tooling note above).
3. Where postcode zoning **would** break: (a) a postcode whose *physical* area is so large or
   fragmented that parts of it are genuinely unreachable within a cutoff while other parts are easy
   (rare in inner/middle Melbourne, real in outer semi-rural fringe postcodes); (b) wanting a
   **drive-time** cutoff rather than a **postcode-membership** cutoff, e.g. "same-day if within 25
   minutes of the hub" — postcodes cannot express that gradient *within* a code.
4. **SA1/SA2 is not a better fit for Effy today.** It solves a problem Effy doesn't have (aligning
   with census statistics) and does not solve the problem Effy does have (postcode is *already* the
   unit Effy's checkout, `locality`, and rate-plan data are keyed on, and it's the unit customers
   type into their address form). Introducing SA2 would add an extra geography-conversion layer with
   its own admitted imprecision (the "no clear postcode dominance" quote above) for no operational
   gain at 1 hub / <10 drivers.
5. **G-NAF locality (suburb-level) is a plausible finer-grained alternative to postcode**, and Effy
   already has `public.locality` (G-NAF-derived, carries lat/lon) — but it is a *finer* unit than
   postcode (many localities per postcode is common; a handful of postcodes span multiple
   localities), so it would only be worth adopting if Effy needed sub-postcode zone precision, which
   nothing in the current requirements calls for.

**Bottom line: keep postcode as the zone-membership key for Melbourne metro. Treat it as what it is
— an operationally convenient, Australia-Post-aligned routing bucket, not a surveyed polygon — and
do not attempt to derive precise service-area shapes, maps, or areas from it.** See §6 for the
concrete migration path if polygon precision is later required (e.g. for a drive-time cutoff or for
expansion into geographically awkward postcodes).

---

## §3 Capability matrix design

### The requirement, restated precisely

A driver must be assignable, independently, along three axes:
- **Function**: `pickup` (shop→hub collection) and/or `delivery` (hub→customer)
- **Method**: `standard` and/or `same_day`
- **Zone**: one or many zones (Effy's existing `delivery_zone` table)

...in **any combination** — e.g. same-day delivery in zones A+B, plus standard pickup everywhere.
This is a genuine three-dimensional many-to-many relationship, and the "everywhere" case means the
design must cleanly express **"all zones"** without literally enumerating every zone row (a driver
enrolled in "everywhere" should not silently fall out of coverage the day a new zone is created).

### Three alternatives compared

**Alternative A — one row per (driver, zone, function, method) combination, a pure join table.**

```sql
CREATE TABLE driver_zone_capability (
    driver_id   uuid NOT NULL REFERENCES driver(id),
    zone_id     uuid NOT NULL REFERENCES delivery_zone(id),
    function    text NOT NULL CHECK (function IN ('pickup','delivery')),
    method      text NOT NULL CHECK (method IN ('standard','same_day')),
    PRIMARY KEY (driver_id, zone_id, function, method)
);
```
- ✅ Simplest possible SQL; correctness is trivial to reason about; a `WHERE` clause with three
  equality predicates plus a driver filter is exactly how the matching query reads.
- ✅ Indexes are ordinary B-tree, no GIN/array machinery.
- ❌ **"Everywhere" is not representable without enumerating every zone row**, and every new zone
  created afterward requires a background job (or a trigger) to insert a row for every driver who
  should automatically cover it — a real correctness hazard of exactly the "missed one of N places"
  shape this codebase has been bitten by repeatedly (per the project history in CLAUDE.md — the
  `availability`-in-14-places lesson, the enum-widening-missed-a-reader lesson). A sixth new zone
  would silently not be covered by a driver who was *supposed* to mean "all zones," with **no error
  anywhere** — the exact failure signature this project explicitly tries to design away from.
- Row count is small and bounded (drivers × zones × 2 × 2), so this is not a performance concern at
  Effy's scale — the concern is purely the missing-row correctness trap.

**Alternative B — arrays or a bitmask on the driver, one row per driver.**

```sql
CREATE TABLE driver_capability (
    driver_id      uuid PRIMARY KEY REFERENCES driver(id),
    functions      text[] NOT NULL,   -- e.g. {pickup,delivery}
    methods        text[] NOT NULL,   -- e.g. {standard,same_day}
    zone_ids       uuid[],            -- NULL/empty conventionally means "all zones" — a convention, not a constraint
    all_zones      boolean NOT NULL DEFAULT false
);
```
- ✅ "Everywhere" is now representable — but only via a **convention** (`all_zones = true` OR an
  empty `zone_ids` meaning "all"), which is exactly the kind of implicit rule that's easy to get
  backwards (does empty mean "all" or "none"?) and easy to forget in a second call site.
- ✅ PostgreSQL supports indexed containment/overlap queries on arrays: `@>` (contains), `<@`
  (contained by), `&&` (overlap), all usable with a **GIN index** for fast lookups —
  [PostgreSQL array functions/operators](https://www.postgresql.org/docs/current/functions-array.html).
  So `WHERE zone_ids @> ARRAY[:zone] AND methods && ARRAY['same_day']` is a legitimate, indexable
  query shape.
- ❌ **Cross-dimension correctness gets muddier.** A single driver row with three parallel arrays
  cannot express "same-day delivery in zones A+B, but standard pickup everywhere" — that's actually
  **two different (function,method)→zone-set mappings for one driver**, and three flat arrays on one
  row conflate them into a single Cartesian product that is wrong for this exact use case in the
  prompt. Fixing that means either exploding into multiple rows per driver (function,method) pair —
  which converges back toward Alternative A/C with arrays only for the zone dimension — or nesting,
  which is Alternative C.
- ❌ Arrays of foreign keys are not first-class relational values: no `REFERENCES` integrity on
  array elements without a trigger or a check function; a deleted `delivery_zone` silently leaves a
  dangling id in every driver's array with nothing enforcing referential integrity.
- ⚠ Readable in raw SQL, but every query needs to remember the "all zones" convention — a new
  engineer (or agent) reading `WHERE zone_ids @> ARRAY[:zone]` has no way to know from the SQL alone
  that an empty/NULL array should also match; that rule lives in application code, restated at every
  call site, which is precisely the "the same rule in 14 places" failure shape.

**Alternative C — jsonb "capability document" per driver.**

```sql
CREATE TABLE driver_capability (
    driver_id  uuid PRIMARY KEY REFERENCES driver(id),
    grants     jsonb NOT NULL  -- [{ "function":"delivery","method":"same_day","zones":"all" | ["zoneA","zoneB"] }, ...]
);
```
- ✅ Maximum flexibility, can express the full three-axis + "all zones" shape naturally.
- ❌ No `REFERENCES` integrity on zone ids at all (they're just strings inside a JSON blob).
- ❌ Matching queries become jsonb path/containment expressions (`grants @> '[{"function":"delivery"...}]'`)
  which are meaningfully harder to read, harder to get right on the first try, and harder for a raw
  SQL migration reviewer to eyeball than a `WHERE` clause over typed columns — directly against this
  project's stated bar ("readability in RAW SQL... how easy it is to get WRONG").
- ❌ Schema drift risk: nothing stops one row's `grants` array containing a typo'd `method` value; a
  `CHECK` constraint over jsonb array elements is awkward (needs a function or `jsonb_path_exists`),
  versus a plain column `CHECK (method IN (...))` in Alternative A.
- This is the "everything is representable, therefore everything is un-verifiable" trap — worth
  naming because it is exactly the shape this project's own history warns about (comment: "a config
  gap silently mapped to 'unknown' and no email was ever sent" — 035's defect; a jsonb capability
  document creates the same class of silent-drift risk for a driver whose intended universal grant
  quietly stops matching because a key was renamed in code without a migration).

### Recommended design — Alternative A, extended with an explicit "scope" row instead of a convention

Keep the row-per-combination join table (correctness, indexability, `REFERENCES` integrity, trivial
SQL), and solve the "everywhere" problem **structurally** rather than by convention: a capability
grant's zone is either **one specific zone** or **the explicit, first-class scope "ALL_ZONES"** —
represented as a **nullable zone_id with a partial unique index and a matching rule that treats NULL
as "any zone,"** which is a single, obvious `OR zone_id IS NULL` in every query rather than an
application-level "empty array means all" rule nobody can see from the schema.

```sql
-- Effy already has: delivery_zone(id, code, name, ring_id, sameday_eligible, status)

CREATE TABLE driver_zone_capability (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    driver_id   uuid NOT NULL REFERENCES driver(id),
    function    text NOT NULL CHECK (function IN ('pickup', 'delivery')),
    method      text NOT NULL CHECK (method IN ('standard', 'same_day')),
    -- NULL zone_id == "every zone" (present and future), a first-class scope, not a sentinel value
    zone_id     uuid REFERENCES delivery_zone(id),
    created_at  timestamptz NOT NULL DEFAULT now(),
    created_by  text NOT NULL   -- back-office actor, audit
);

-- A driver may have at most one grant per (function, method, zone) — including the "all zones" row,
-- which uses a partial unique index because a plain UNIQUE would allow two NULLs to coexist
-- (PostgreSQL treats NULL <> NULL, so ordinary UNIQUE does NOT dedupe NULLs — this is the exact
-- footgun a reviewer must know to check for).
CREATE UNIQUE INDEX driver_zone_capability_specific_uq
    ON driver_zone_capability (driver_id, function, method, zone_id)
    WHERE zone_id IS NOT NULL;

CREATE UNIQUE INDEX driver_zone_capability_all_zones_uq
    ON driver_zone_capability (driver_id, function, method)
    WHERE zone_id IS NULL;

CREATE INDEX driver_zone_capability_driver_idx ON driver_zone_capability (driver_id);
CREATE INDEX driver_zone_capability_lookup_idx ON driver_zone_capability (zone_id, function, method);
```

**Why this beats plain Alternative A, plain arrays, and jsonb, on the project's own criteria:**
- **Correctness under a new zone**: a driver with the `zone_id IS NULL` "all zones" grant
  automatically covers a zone created *tomorrow* — no background job, no missed-row risk, because
  the matching query (below) is `zone_id = :zone OR zone_id IS NULL`, which is true for the new zone
  the instant it exists. This directly closes the Alternative-A hazard.
- **No convention to remember**: NULL-means-all is visible in the schema itself (a comment on the
  column, enforced by the two partial unique indexes), not a rule living only in application code.
- **Referential integrity intact**: `zone_id` is a real FK; deleting a zone is either blocked (FK
  default) or cascades explicitly — no dangling ids the way an array-of-uuid can silently carry.
- **Indexable exactly like Alternative A** (plain B-tree on a handful of narrow columns), not GIN,
  not jsonb path expressions.
- **Read the SQL, know the rule** — a raw-SQL-only, no-ORM codebase (Effy's stated constraint)
  benefits most from a schema where the `WHERE` clause *is* the business rule, not an interpretation
  of it.

### The matching query

*"Which on-duty drivers can do a same-day delivery in zone Z right now?"*

```sql
SELECT DISTINCT d.id, d.display_name
FROM driver d
JOIN driver_zone_capability c
  ON c.driver_id = d.id
 AND c.function = 'delivery'
 AND c.method   = 'same_day'
 AND (c.zone_id = :zone_id OR c.zone_id IS NULL)
WHERE d.status = 'active'
  AND d.on_duty = true
ORDER BY d.display_name;
```

*"Which zones currently have NO driver capable of same-day delivery at all — the coverage-gap
question (§5)"*:

```sql
SELECT z.id, z.code, z.name
FROM delivery_zone z
WHERE z.status = 'active'
  AND NOT EXISTS (
    SELECT 1
    FROM driver_zone_capability c
    JOIN driver d ON d.id = c.driver_id
    WHERE c.function = 'delivery'
      AND c.method   = 'same_day'
      AND (c.zone_id = z.id OR c.zone_id IS NULL)
      AND d.status = 'active'
  );
```

*"Does this specific driver satisfy ALL of a required capability set (e.g. must be able to do BOTH
same-day delivery AND standard pickup in zone Z)?"* — the ALL-matching pattern:

```sql
SELECT :driver_id
WHERE NOT EXISTS (
  SELECT 1 FROM (VALUES
    ('delivery','same_day'),
    ('pickup','standard')
  ) AS required(function, method)
  WHERE NOT EXISTS (
    SELECT 1 FROM driver_zone_capability c
    WHERE c.driver_id = :driver_id
      AND c.function = required.function
      AND c.method   = required.method
      AND (c.zone_id = :zone_id OR c.zone_id IS NULL)
  )
);
```
This is the standard SQL "relational division" (double-`NOT EXISTS`) idiom for ALL-matching, versus
a simple `EXISTS`/join for ANY-matching (the first query above). It generalizes cleanly to however
many required (function, method) pairs a future rule needs, without touching the schema.

---

## §4 PostGIS verdict

**Verdict: NO — do not enable PostGIS for this requirement. Revisit only if/when Effy adopts
drive-time isochrones or true polygon geofences.**

**What PostGIS buys, concretely**: the `geography`/`geometry` types; `ST_Contains`/`ST_Within` for
point-in-polygon zone tests; `ST_DWithin` for radius queries; the `<->` KNN operator for
nearest-neighbour lookups; `ST_ClusterKMeans` for clustering. All of these solve **polygon and
distance** problems. Effy's requirement, per §3, is a **discrete set-membership and tag-matching**
problem (driver × zone × function × method), which PostGIS does not touch at all — none of its
functions are relevant to the capability matrix. The only place PostGIS would matter is if
`delivery_zone` boundaries were genuine polygons instead of postcode-membership lists, and §2's
verdict is to keep postcode membership.

**Operational cost of enabling it on RDS, if it were ever needed** — this *is* just `CREATE
EXTENSION`, with two caveats worth recording precisely: (1) it requires `rds_superuser` privileges
(AWS recommends creating a dedicated role granted `rds_superuser` rather than running everything as
the master user) — [AWS RDS PostGIS guide](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html);
(2) upgrading the PostgreSQL **engine** major version does **not** automatically upgrade the PostGIS
**extension** — you must upgrade PostGIS to the newest version supported by the current engine
version *before* a major-version engine upgrade, then upgrade PostGIS again afterward to the version
supported by the new engine, per AWS's documented 2-to-3 upgrade walkthrough. This is a genuine
operational tax (an extra manual step on every future major-version RDS upgrade) for a platform that
does not currently need any polygon capability. Enabling it also pulls in `tiger`/`tiger_data`/
`topology` schemas with "thousands of functions" if the full extension set is loaded, which is
unnecessary surface area for a schema Effy would only use for the very narrow point-in-polygon case.
[Source: AWS RDS — Managing spatial data with the PostGIS extension](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html)

**On `h3-pg` specifically** — worth naming because it's a lighter-weight sibling to full PostGIS:
Amazon RDS for PostgreSQL supports `h3-pg` (currently v4.2.3 for PG 14/15/16/17) starting from PG
13.12/14.9/15.4 and up, in all AWS regions. h3-pg gives cell-indexing/lookup functions (H3 cell IDs,
neighbour/hierarchy functions) **independently of PostGIS** — it does not require PostGIS to be
installed. [Source: AWS — RDS PostgreSQL now supports h3-pg](https://aws.amazon.com/about-aws/whats-new/2023/09/amazon-rds-postgresql-h3-pg-geospatial-indexing/),
confirmed by [h3geo.org](https://h3geo.org/) describing H3 as an independent system with its own
core library and language bindings, not a PostGIS dependency. **This is also not needed for Effy's
current requirement** — H3 solves "bucket arbitrary lat/lon points into consistent cells for
heatmap/aggregation analysis," which is a different problem than "match a driver's declared
capability grants to a zone." It becomes relevant only if Effy later wants a *coverage heatmap*
computed from raw customer/shop coordinates rather than from postcode/zone membership — worth
knowing it's available and cheap to add later (single `CREATE EXTENSION h3;` call, no
`rds_superuser` upgrade-coupling tax the way full PostGIS has), but not worth adding now.

**Can a postcode-based model avoid PostGIS entirely?** Yes — and it already does. Effy's existing
`delivery_zone_postcode` (`UNIQUE(postcode)`), `delivery_ring` (Haversine-suggested, not
PostGIS-computed — a plain trigonometric formula over `hub_latitude`/`hub_longitude` is sufficient
for a "suggest a ring" heuristic and does not need `ST_Distance`), and the capability matrix in §3
are all expressible in plain SQL with ordinary B-tree indexes. There is no query in the stated
requirements that needs a spatial index.

---

## §5 Requirement catalogue

*(50 items, each tagged. "ESSENTIAL" = needed for the described three-axis capability requirement to
work correctly and safely at Effy's current scale; "USEFUL" = a real improvement worth building soon
after, not blocking; "OVERKILL-AT-OUR-SCALE" = a legitimate industry pattern that solves a problem
Effy does not have with 1 hub / <10 drivers / postcode zones.)*

**Core capability model**
1. A driver can hold zero, one, or many (function, method, zone) capability grants — **ESSENTIAL**
2. A capability grant's zone can be "all zones," first-class in the schema, not a convention —
   **ESSENTIAL**
3. Adding a new `delivery_zone` must not require touching every driver's grants for "all zones" to
   keep covering it — **ESSENTIAL**
4. `function` is a closed, small enum (`pickup`, `delivery`) enforced by CHECK, not free text —
   **ESSENTIAL**
5. `method` is a closed, small enum (`standard`, `same_day`) enforced by CHECK — **ESSENTIAL**
6. A driver cannot hold two identical grants (duplicate rows for the same driver/function/method/zone)
   — **ESSENTIAL** (unique index, including the NULL/all-zones case handled via partial index)
7. Deleting/deactivating a zone should have an explicit, deliberate effect on grants referencing it
   (block, or cascade with an audit trail) rather than silently leaving orphaned rows — **ESSENTIAL**
8. A back-office console screen to grant/revoke a driver's capabilities per (function, method, zone)
   — **ESSENTIAL**
9. Every grant/revoke is an audited, attributed action (who, when) — **ESSENTIAL** (matches the
   project's existing `admin.audit_log` pattern)
10. The matching query for "who can do X in zone Z right now" must be a single indexable SQL
    statement, not application-side filtering of an unbounded row set — **ESSENTIAL**
11. "ANY-match" (satisfies at least one requirement) and "ALL-match" (satisfies every requirement in
    a set) must both be expressible without schema changes — **ESSENTIAL**
12. A driver's capability set must be readable in one query for a driver-facing "what am I assigned
    to do" screen — **ESSENTIAL**
13. Coverage-gap query: "which active zones currently have zero capable on-duty driver for
    same-day delivery" — **ESSENTIAL** (Effy's stated existing "readiness" screen concept)
14. Coverage-gap query per (function, method) pair, not just delivery/same-day — **USEFUL**
15. A driver standing themselves down (going off-duty, being suspended) must not silently strand
    physical work already claimed — **ESSENTIAL** (Effy's own 056 slice already establishes exactly
    this pattern for the existing driver-eligibility model; the capability matrix must not regress it)
16. Historical record of capability changes (not just current state) for audit/dispute resolution —
    **USEFUL**
17. Effective-dating of a capability grant (starts Monday, ends in three months) — **USEFUL**, not
    needed for launch
18. Bulk-grant UI: "give driver X same-day delivery in every zone in ring INNER" — **USEFUL**
19. Bulk-grant UI: "give every on-duty driver standard pickup everywhere" (a one-click default for
    day one, since <10 drivers likely all do "a bit of everything" initially) — **USEFUL**, high
    value for a phase-1 rollout specifically
20. Capability templates/presets (e.g. "Full-time collector" = pickup, both methods, all zones) to
    reduce repetitive manual grants for a small driver roster — **USEFUL**

**Zone modelling**
21. Postcode is the zone-membership unit; `UNIQUE(postcode)` so a postcode belongs to exactly one
    zone — **ESSENTIAL** (already shipped)
22. Zone status (active/inactive) gates whether the zone is usable for new assignment — **ESSENTIAL**
    (already shipped)
23. A zone's ring (INNER/MIDDLE/OUTER/EXTENDED) is admin-overridable, not purely derived —
    **ESSENTIAL** (already shipped)
24. Postcode-to-zone assignment must be bulk-editable (CSV import, not one row at a time) —
    **USEFUL**
25. A "preview/test an address" tool in the admin console — type a postcode, see which zone/ring it
    resolves to, before saving a change — **USEFUL**
26. Polygon/geofence zone boundaries drawn on a map — **OVERKILL-AT-OUR-SCALE** (§2/§6: no evidence
    Melbourne metro postcode zoning breaks down at 1-hub scale; revisit only on a documented failure)
27. Drive-time isochrone-derived zone boundaries — **OVERKILL-AT-OUR-SCALE** for zone *membership*;
    potentially **USEFUL** later purely for *cutoff-time* differentiation (§7), not for defining
    which postcodes exist in a zone
28. H3/S2/geohash cell indexing of raw addresses for heatmap/coverage visualization —
    **OVERKILL-AT-OUR-SCALE** (solves an aggregation-at-massive-volume problem Effy does not have)
29. Administrative-boundary (SA1/SA2/LGA) based zoning — **OVERKILL-AT-OUR-SCALE** (§2 verdict:
    solves a census-alignment problem, not a logistics one)
30. PostGIS `geography`/`geometry` columns anywhere in the schema — **OVERKILL-AT-OUR-SCALE** (§4)
31. A zone can be split into two later (e.g. an OUTER zone splitting as Effy grows) without losing
    historical postcode→zone assignment data — **USEFUL**, design for it now (don't hard-delete old
    zone rows, deactivate them) even though not needed on day one

**Cutoffs and time**
32. Same-day cutoff derives from `delivery_collection_run` + prep buffer, judged in
    Australia/Melbourne wall-clock — **ESSENTIAL** (already shipped)
33. Cutoff can vary by zone (an OUTER zone's effective same-day cutoff is earlier because the
    collection run + drive time eats more of the buffer) — **USEFUL**; industry pattern exists (large
    grocery same-day operators are known to vary cutoff/window by delivery area) but Effy's own
    verified sources for this session did not include a citable article confirming a specific
    competitor's exact mechanism — treat as a plausible future refinement, not a verified requirement
34. Per-(zone, function, method) capacity limits (e.g. only 2 drivers total possible in EXTENDED ring
    on same-day) surfaced as a soft warning, not a hard block — **USEFUL**
35. A "today's roster" view: which drivers are on duty right now and what they're each capable of —
    **ESSENTIAL** for daily dispatch operation

**Data integrity / operational safety**
36. A driver whose employment status changes (stood down, terminated) has their capability grants
    made inert immediately, without deleting the historical grant rows — **ESSENTIAL** (matches
    Effy's existing pattern of deriving eligibility from driver status, not duplicating a boolean)
37. Grants must be queryable/joinable without N+1 per-driver lookups in the dispatch/assignment
    worker — **ESSENTIAL**
38. Schema guard/test asserting the two partial unique indexes actually prevent duplicate grants
    (including the NULL-zone case, which a naive `UNIQUE` would NOT dedupe since `NULL <> NULL` in
    SQL) — **ESSENTIAL**, and worth calling out explicitly since this project's own history records
    exactly this class of "the guard didn't catch its own negative proof" defect repeatedly
39. A migration backfill plan for any existing driver eligibility/assignment data (if Effy already
    has informal driver↔zone assumptions in code) into the new explicit grant rows — **ESSENTIAL** if
    such implicit data exists, otherwise moot
40. Negative-path test: a driver with NO grants at all is correctly excluded from every matching
    query (not accidentally matched via a default/NULL-handling bug) — **ESSENTIAL**

**Zone administration UX** (from Onfleet's verified documentation)
41. Map-based zone visualization with the ability to select/right-click a zone to bulk-act on tasks
    inside it — verified real pattern (Onfleet), **USEFUL** for Effy's back-office console, not
    blocking for a postcode-lookup model
42. A "Team"-style (Onfleet term) grouping of drivers with an associated single hub — **ESSENTIAL**
    equivalent already exists implicitly (Effy has one hub for phase 1)
43. Per-group/per-driver capacity tracking factored into auto-assignment scoring, not just
    binary eligibility — **USEFUL**, not needed while manual/simple auto-assignment suffices at <10
    drivers
44. Skill/capability tagging on the driver record surfaced in the assignment UI as plain badges
    (verified pattern from Bringg: "the driver with the correct skills") — **USEFUL**
45. An explicit, user-visible fallback message when no capable driver exists for a task (verified
    Bringg pattern: "add a driver with the required skills… or reschedule the order") rather than a
    silent failure — **ESSENTIAL**, directly reusable language/pattern for Effy's coverage-gap UX

**Explicitly deferred / out of scope for this capability requirement**
46. Automatic route optimization across multiple drivers/zones (OptimoRoute/Bringg-style VRP
    solving) — **OVERKILL-AT-OUR-SCALE** for now; the capability matrix is a *prerequisite input* to
    such a system, not the system itself
47. Real-time driver location tracking feeding zone-boundary crossing events — **OVERKILL-AT-OUR-SCALE**
48. Multi-hub support — explicitly deferred per Effy's own stated scope ("One hub for now")
49. Dynamic/surge-style zone re-weighting (Uber H3 surge-pricing pattern) — **OVERKILL-AT-OUR-SCALE**,
    wrong business model entirely (Effy is flat-fee delivery, not dynamic marketplace pricing)
50. Drive-time-based dynamic re-zoning that changes shape by time-of-day/traffic — **OVERKILL-AT-OUR-SCALE**

---

## §6 Recommendation for Effy

**Keep postcode-based zones. Do not adopt polygons, isochrones, H3, or PostGIS for the driver
capability requirement.** Build the capability matrix as the explicit-scope join table in §3
(Alternative A + NULL-means-all-zones), because:

1. The described requirement — driver × zone × function × method, in any combination — is a
   **discrete matching problem**, not a **geometric** one. Nothing in it requires knowing the shape
   of a zone, only whether a driver is granted access to it.
2. Effy's existing schema (`delivery_zone`, `delivery_zone_postcode`, `delivery_ring`,
   `delivery_collection_run`) is already postcode/zone-id based, and the capability matrix should
   reference `delivery_zone.id` directly — zero new geospatial concepts introduced.
3. The Uber-H3 argument against postcodes ("unusual shapes… change for reasons entirely unrelated…
   operator-drawn zones require frequent updating") is a real cost, but it is a cost that scales with
   the number of cities/markets and the volume of analytical queries over exact locations — Effy has
   one city and no requirement to analyze exact-location density. The argument does not transfer.
4. The genuinely fragile part of Effy's current design is not the postcode zone (§2's verdict is that
   it's defensible), it's the **capability matrix's "all zones" representation** — get that structural
   detail right (§3) and the rest of the postcode model can stay exactly as it is.

**Migration path if polygon precision is ever genuinely needed** (e.g. Effy expands into a
geographically fragmented outer-Melbourne postcode, or wants a true drive-time cutoff instead of a
postcode-membership cutoff):
1. Add `delivery_zone.boundary geography(Polygon, 4326)` as a **nullable, additive** column —
   postcode membership stays the source of truth for zones that don't set it.
2. `CREATE EXTENSION postgis;` on RDS (§4) — a same-day operational step, not a migration risk, since
   it adds capability without touching existing tables/rows.
3. For a drive-time cutoff specifically, evaluate **Valhalla** first: MIT-licensed, self-hostable via
   Docker, has a purpose-built isochrone service, and needs no per-request vendor billing —
   [Valhalla](https://github.com/valhalla/valhalla), isochrone docs referenced from
   [OSRM](https://project-osrm.org/) as the open-source baseline (OSRM itself: BSD-2-Clause, routing
   +matrix, no confirmed native isochrone service in what was fetched this session — flagged as
   unverified rather than asserted). If a hosted/managed option is preferred instead of self-hosting,
   **TravelTime** offers isochrones under flat/unlimited-request pricing (no per-call metering),
   which is friendlier to a small operator's unpredictable volume than pay-per-request APIs —
   [TravelTime](https://www.traveltime.com/).
4. Do **not** adopt H3 as a zone-*definition* mechanism even at that point — H3 is for aggregating
   raw point data into consistent analytical buckets (heatmaps, density), which is a different job
   than defining "does this postcode belong to zone A." If Effy ever wants a coverage heatmap from
   raw customer coordinates, h3-pg is a one-line `CREATE EXTENSION h3;` away on RDS and does not
   require PostGIS.

---

## §7 Sources

- [Onfleet — Teams](https://support.onfleet.com/hc/en-us/articles/360053987172-Teams)
- [Onfleet — Auto Assignment](https://support.onfleet.com/hc/en-us/articles/360023669852-Auto-Assignment)
- [Onfleet — Task Assignment](https://support.onfleet.com/hc/en-us/articles/360023910111-Task-Assignment)
- [Onfleet — Team Auto-Dispatch](https://docs.onfleet.com/reference/team-auto-dispatch)
- [Onfleet — Delivery Dispatch and Assignment System](https://onfleet.com/assignment-and-dispatching)
- [Upper — Fleet Geofencing Explained](https://www.upperinc.com/blog/fleet-geofencing/)
- [Uber — H3: Uber's Hexagonal Hierarchical Spatial Index](https://www.uber.com/en-LT/blog/h3/)
- [H3 — official site](https://h3geo.org/)
- [Bringg — Dispatch Orders with Bringg](https://help.bringg.com/docs/dispatch-orders-with-bringg)
- [Bringg — Automated Dispatch (auto-dispatch overview)](https://www.bringg.com/resources/auto-dispatch)
- [ABS — Australian Statistical Geography Standard (ASGS) Vol 3, Postal Areas](https://www.abs.gov.au/ausstats/abs@.nsf/Lookup/by%20Subject/1270.0.55.003~July%202016~Main%20Features~Postal%20Areas%20(POA)~8)
- [ABS — Postal Areas, Edition 3 (2021–2026)](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/non-abs-structures/postal-areas)
- [ABS — ASGS Edition 4 Methodology (2026–2031)](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-4-july-2026-june-2031/methodology)
- [ABS — Census geography glossary](https://www.abs.gov.au/census/guide-census-data/geography/census-geography-glossary)
- [ABS — Digital boundary files](https://www.abs.gov.au/statistics/standards/australian-statistical-geography-standard-asgs/edition-3-july-2021-june-2026/access-and-downloads/digital-boundary-files)
- [AWS — Managing spatial data with the PostGIS extension (RDS/Aurora PostgreSQL)](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Appendix.PostgreSQL.CommonDBATasks.PostGIS.html)
- [AWS — Amazon RDS for PostgreSQL now supports h3-pg for geospatial indexing](https://aws.amazon.com/about-aws/whats-new/2023/09/amazon-rds-postgresql-h3-pg-geospatial-indexing/)
- [AWS — Amazon Aurora for PostgreSQL now supports h3-pg](https://aws.amazon.com/about-aws/whats-new/2023/12/amazon-aurora-postgresql-h3-pg-geospatial-indexing/)
- [Valhalla — GitHub](https://github.com/valhalla/valhalla)
- [OSRM — project-osrm.org](https://project-osrm.org/)
- [TravelTime — traveltime.com](https://www.traveltime.com/)
- [PostgreSQL docs — Array Functions and Operators](https://www.postgresql.org/docs/current/functions-array.html)

**Sources attempted and blocked/unavailable this session** (recorded per the "do not guess"
instruction — these were not used to support any claim above): DoorDash engineering blog
(`careersatdoordash.com`, `doordash.com/en-US/about/blog`) — 403 Forbidden; Instacart tech blog
(`tech.instacart.com`) — 403 Forbidden; Deliveroo engineering blog — fetched successfully but its
visible index contained no zone/geofencing articles; HERE Isoline Routing API page — 404; Australia
Post postcode-data page (`auspost.com.au`) — 403 Forbidden; `data.gov.au` postcode boundary dataset
page — 403 Forbidden; OptimoRoute skills page — 404 on both `https://` and `http://` variants;
Mapbox Isochrone product page — 404. WebSearch was unavailable for the second half of this research
task (session-wide budget exhausted after 8 queries), so these gaps could not be closed by
re-querying a search engine and finding an alternate URL.
