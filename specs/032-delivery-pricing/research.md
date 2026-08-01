# Research: Delivery Pricing & Same-Day Coverage (032)

Decisions taken before implementation, with the alternatives rejected and why. ⚠ marks a risk carried
into the slice, not a settled question.

---

## R1 — Where distance comes from

**Decision**: a **coordinate per locality**, loaded from the address dataset 030 already downloaded,
and great-circle distance computed from it. **No external service, no new dependency.**

`LOCALITY_POINT_psv.psv` ships `LATITUDE`/`LONGITUDE` for every locality, in the same 1.7 GB G-NAF
download, under the same CC BY 4.0 licence already accepted. 030's derivation read only name, state and
postcode and discarded the rest.

⚠ **031's research R6 asserted "the platform has no routing or distance capability" and used that to
justify a zone-membership proxy.** The premise was false — the data was already on disk. That proxy
then permitted same-day to **Ballarat** from a shop in **Bendigo, 98 km away** (Melbourne is 107 km).
This is the single most important correction in the slice, and it is recorded because a future reader
will otherwise repeat R6's reasoning.

| Alternative | Rejected because |
|---|---|
| A routing/geocoding provider (Google, Mapbox) | An external dependency on the **customer-facing price path**. Rejected in 030 for the shopper surface; the argument is stronger here, where an outage would stop checkout quoting at all. |
| Postcode-prefix arithmetic ("3350 is near 3300") | Invented precision. AU postcodes are not geographically ordered in any usable way. |
| Keep the zone proxy | Disproven at 98 km. |

### R1a — Straight line, and said so

Great-circle distance under-states road distance: Melbourne→Ballarat is **107 km** straight and roughly
**115 km** by road, about 7%.

**This is accepted, and the mitigation is structural rather than a fudge factor**: pricing is **banded**
(FR-004) and **rounded upward** (FR-005), so a 7% under-statement mostly disappears inside a band. ⚠ It
does not always: a distance sitting just under a band boundary will price one band low. That is a known,
bounded error, and it is preferable to a routing dependency on the price path.

⚠ **No distance is ever shown to a shopper** (FR-034), so the approximation is never presented as fact
to the person paying. It **is** shown to admins at approval (FR-023), where the label must say what it
is — "straight-line", not "distance".

### R1b — A postcode is not a point

⚠ Serviceability is postcode-keyed (031 R2), but a postcode can cover many localities: 3350 covers
**20**. Distance therefore needs one representative point per postcode.

**Decision**: the **centroid of that postcode's localities** — the mean of their coordinates — stored
per postcode, computed at load time.

Rejected: picking one locality arbitrarily (unstable across dataset refreshes, and wrong by up to the
postcode's own diameter with no way to tell).

⚠ **This is meaningless for 0872**, which spans NT, SA and WA — its centroid is a point in the desert
that is hundreds of kilometres from most of it. FR-039 requires the basis to be *stated*; the honest
handling is that such a postcode gets a centroid like any other, and its distances are wrong, and the
approval screen's job is to let a human notice. **A remote-area postcode is not a same-day candidate
under any model.**

---

## R2 — Where weight comes from

**Decision**: a **required weight column on `public.product`**, not a catalog attribute.

⚠ **This is the largest hidden cost in the slice and it is not delivery work.**

Today `net_weight` is a row in `product_attribute_value` — an EAV attribute, required only for the
`packaged_grocery` category, optional everywhere else. **14 of 38 live products have one.** Beverages
carry `net_volume` instead; household goods carry neither.

| Alternative | Rejected because |
|---|---|
| Price from the existing attribute | 63% of products have no weight. Pricing would silently treat them as weightless — the FR-011 defect class: a missing value quietly meaning "free". |
| Derive weight from volume for beverages | 1 ml ≠ 1 g except for water, and it would encode a guess as data. |
| Skip weight; price on distance only | The operator asked for weight explicitly, and a 20 kg order costing the same as a 200 g one is the thing they are trying to fix. |

### R2a — What happens to the 24 products with no weight

**Decision**: a **required column with a recorded default**, plus a **flag distinguishing a real weight
from an assumed one**.

⚠ The distinction matters for exactly the reason 031's decision record exists: without it, "500 g"
means both *"we weighed it"* and *"nobody has said"*, and no one can tell which products need
attention. FR-037 requires the fee to be computable either way; this is what makes the gap
**visible** rather than absorbed.

⚠ **The default must be non-zero.** A zero default is the free-delivery defect wearing a different hat.

---

## R3 — Eligibility is per shop; price is not

**Decision**: two separate concerns, two separate stores.

| | Grain | Owner |
|---|---|---|
| **Same-day eligibility** | `(shop, destination area)` | the **shop** declares, an **admin** approves |
| **Price** | distance band × weight band × method | the **platform**, admin-only |

⚠ **031 collapsed the origin dimension and this is why that was wrong.** The collapse argued a shopper
cannot perceive which shop serves them — true for price, false for eligibility. Whether same-day is
*possible* depends entirely on which shop holds the goods.

⚠ **`delivery_offering` cannot carry this.** It is keyed on origin **zone**, so two shops sharing a zone
would share one declaration — which contradicts "it is a decision of the shop" outright. Eligibility
needs its own table keyed on `shop_id`.

### R3a — What happens to `delivery_offering` (⚠ decided, not deferred)

An earlier draft of this research said the grid "keeps serving standard and scheduled **until the
pricing rules replace those too**". ⚠ **That left two live sources for a standard-delivery fee** —
`delivery_offering.price_amount` and the new rules — with nothing choosing between them. It is the exact
defect class this feature exists to remove, reintroduced by the feature removing it.

**Decision**: the rules price **all three methods now**. `delivery_offering.price_amount` is **dropped**
in the migration.

`delivery_offering` survives, and still matters, for what is genuinely not a price:

| Column | Fate | Why |
|---|---|---|
| `price_amount` | ⚠ **dropped** | Two sources for one answer. Not deprecated, not ignored — removed, so it cannot be read. |
| `lead_days_min` / `lead_days_max` | kept | The promised window. Not derivable from distance bands. |
| `same_day_cutoff` | ⚠ dead → dropped | The cutoff moves onto the shop's declaration (R4), where it belongs: it is the shop's operating fact. |
| `status`, the zone pair | kept | Whether standard/scheduled is offered on a leg at all. |
| `method = 'same_day'` rows | ⚠ **deleted** | The old eligibility predicate. FR-029. |

⚠ **Dropping a column loses nothing historical.** `order_package_delivery.delivery_fee_amount` captures
what each order was actually quoted (FR-010), so the grid's prices are configuration, not records.

⚠ **This makes 031's read-only rate grid a screen with no rates.** It must be relabelled to what it now
shows — service windows — or removed. Leaving a screen called "Rates" that displays none is how the
next reader concludes the feature half-landed.

---

## R4 — The approval workflow

**Decision**: a three-state declaration — `pending` → `approved` | `declined` — with the previously
approved version remaining in force while a change is pending.

⚠ **This is the platform's first approval workflow.** Nothing on any surface proposes-and-approves
today. Two consequences worth stating before it is built:

1. **A declaration is inert until approved** (FR-017). This is what makes US2 shippable alone and is the
   only reading of the operator's rule that survives a slow approval.
2. **The in-force version and the proposed version are different things** and must be stored as such.
   ⚠ Overwriting on edit would silently revoke a live approval — a shop editing a note would stop its
   own same-day service.

**Rejected**: a single row with a status column. It cannot hold "approved coverage A, pending change to
B" simultaneously, which is precisely FR-018.

**No email or push** (Out of Scope). In-console status only — the notifications path is its own slice.

---

## R5 — How a fee is computed

**Decision**: `fee = base(method) + distanceBand(km) + weightBand(kg)`, then **rounded up** to the
configured step, then **capped**.

Bands rather than formulas (FR-004) so that moving one street cannot change the price, and so an
operator can read the rules and predict the outcome.

⚠ **Every input must have a defined answer for every value**, because a gap means a missing fee:

- a distance beyond the last band → the last band applies (not "no fee", not "undeliverable")
- a weight beyond the last band → the last band applies
- a place with no coordinate → ⚠ **not priced as zero distance**; treated as the furthest band
- a product with no real weight → the recorded default (R2a)

**Rounding is UPWARD** (FR-005). ⚠ Nearest-rounding means the platform absorbs the difference on
roughly half of all orders — a revenue decision disguised as a formatting choice.

**A cap** (FR-012) because bands multiply: without one, a heavy order to a remote postcode produces a
number nobody intended.

---

## R6 — Which path each piece lives on (Principle III)

| Piece | Path | Why |
|---|---|---|
| Pricing rules CRUD | **cold** (`edge-api/admin`) | Admin CRUD at operations cadence — the doctrine's central case |
| Shop declaration | **cold** (`edge-api/shop`) | Operator CRUD, shop pool |
| Approval queue | **cold** (`edge-api/admin`) | Admin CRUD |
| **Quoting** | **hot** (`core-api/checkout`) | ⚠ In the customer's checkout path, latency-bound, already there |
| Locality coordinates | data | Loaded by the 030 loader; read by the hot path at quote time |

⚠ **The hot path gains real logic here, and that is the risk in this slice.** Everything else is
console work. `checkout/quote.go` currently reads offerings and ranks them; it will additionally resolve
two coordinates, compute a distance, sum a package weight, and apply banded rules. **That is arithmetic,
so it belongs in the pure `platform/delivery` package** where 021 already put the ranking logic — no
HTTP, no SQL, exhaustively unit-testable without a database.

---

## R7 — What must not change

**Hidden fulfilment holds** (FR-033). ⚠ A distance is a strong signal of *which shop* — "9 km away"
narrows it considerably in a metro area. So:

- no distance in any customer response, at any granularity (FR-034)
- no shop identity, postcode, or origin label in any customer response
- the existing `json:"-"` on shop identity in the quote stays

### ⚠ R7a — The fee itself leaks a coarse distance, and an earlier draft denied it

That draft claimed "two packages may cost different amounts, but only because their contents and
destinations differ, **never** labelled by origin". ⚠ **That is false under this design.** A fee that
rises with distance *is* a distance signal: two packages to the same address with the same weight,
priced differently, differ only by where they came from. Asserting the opposite in the research while
building the thing that does it is worse than not mentioning it.

**What is actually true**, and is now written into the spec as FR-033a:

- FR-033 forbids **identifying the shop**, not disclosing that distance affects price.
- **The band is the bound.** A band spanning many kilometres contains many possible origins, so a fee
  narrows to a *region*, never to a fulfilment node. A continuous formula would not have this property —
  which is a second, independent reason for FR-004's bands beyond price stability.
- ⚠ It follows that **band width is a privacy parameter, not only a pricing one**. A 500 m first band
  in a metro area would resolve to one shop. The spec now says so; an admin configuring narrow bands is
  weakening hidden fulfilment without being told, unless the console says it.

⚠ **021 already shipped a defect of exactly this shape**: `QuotePackage.ShopID` was hidden from the
customer with `json:"-"` and *therefore* read back empty when the quote was persisted, so checkout
intent had never completed. Adding fields that are hidden from one consumer and required by another is
how that recurs — any new quote field must be explicit about which side it serves.

---

## R8 — Guarding the change

**The captured quote already protects committed money.** `order_package_delivery` stores
`delivery_fee_amount` per package, written at intent time. FR-010/SC-010 therefore hold without new
work — but a test must prove it, because it is the one thing a pricing change could break invisibly.

⚠ **`core-api`'s existing checkout suite is the regression guard.** Unlike 031, this feature *does*
change core-api, so "the diff is empty" cannot be the test.

⚠ **But "every existing test must pass unmodified" is unsatisfiable here, and stating it that way would
be the 029 defect in reverse** — a test asserting the exact rule this feature deletes. `delivery_test.go`
today contains `TestOptions_MetroOffersSameDayAndStandard`, `TestOptions_SameDayBeforeCutoff` and
`TestOptions_SameDayWithdrawnPastCutoff`, all of which construct an `Offering{Method: MethodSameDay}` and
assert it is offered. Under FR-029 same-day is no longer decided by an offering at all, so **those
assertions must change** — that is the feature working.

**The guard, stated precisely:**

| Assertion group | Expected |
|---|---|
| Same-day **eligibility** in `delivery_test.go` | ⚠ **Changes.** A named, expected delta — the rule is being replaced. |
| Same-day **cutoff withdrawal** behaviour | Preserved, re-expressed against the declaration's cutoff. |
| Standard / scheduled options, ordering, labels | ⚠ **Unmodified.** |
| Everything in `checkout/service_test.go` except delivery fee *values* | ⚠ **Unmodified.** |
| All of `storefront` | ⚠ **Unmodified.** Serviceability is untouched by this feature. |

**Anything outside the first two rows that needs changing is a signal to re-read the design, not to
update the test.** A guard that cannot be satisfied gets ignored wholesale, which is worse than a
narrower one that holds.

---

## R9 — Telemetry (Principle VII)

- **Metric**: quote outcomes by method (`offered` / `not_offered`), and a counter for **fees that hit
  the cap** — the second is the signal that the bands are wrong. ⚠ Low-cardinality: no postcode, no
  shop id, no distance.
- ⚠ **The cold path still has no metrics emission path** (031 carry-forward). Admin/shop-side signals
  stay on-demand via reads. The hot path already has Prometheus, so the quote metrics above are
  buildable.
- **Audit**: pricing changes and approval decisions ride the existing `admin.audit_log`.
- **No new product-analytics event.**
