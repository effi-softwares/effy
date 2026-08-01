# Research: Delivery Areas (031)

Decisions taken before implementation, with the alternatives rejected and why. ⚠ marks a risk carried
into the slice, not a settled question.

---

## R1 — How an operator reads the locality record

**Decision**: a **new cold-path read** in the admin service — `GET /admin/v1/delivery-localities?q=` — reading
`public.locality` through the admin service's own repository.

**NOT** a call to core-api's `GET /v1/storefront/localities`, and **not** a shared package.

| Alternative | Rejected because |
|---|---|
| Admin calls core-api's storefront endpoint | ⚠ **`core-api` has no cloud deployment.** The admin Lambda runs in AWS; core-api runs on a laptop. The console would work locally and break in dev. It would also make an operator console depend on the customer hot path being up. |
| Extract a shared "locality" package both services import | Two runtimes (Go and Node) cannot share a package. The *contract* is already shared via `LocalityDTO`; the query is four lines of SQL. |
| Reuse the shop service's reads | Wrong audience. This is back-office (admin pool), not shop pool. |

**Principle III is satisfied without an exception.** A shopper's locality search is hot-path work: public,
guest-reachable, fired per keystroke. An operator's locality search is cold-path admin CRUD: authenticated,
low-frequency, tolerant of Lambda cold start. **Same table, two services, two paths** — precisely the split
`promo_code` already has (Home read → hot path; advertising a promotion → cold path, feature 028).

**Principle II is satisfied**: `LocalityDTO` already exists in `@effy/shared-types` and is reused verbatim.
No new type describes the same thing twice.

---

## R2 — What "an area" is, and why the answer is uncomfortable

**Decision**: **an area IS a postcode.** It is *presented and chosen* by the places it contains.

This is the load-bearing decision in the slice and the one most likely to be quietly softened during
implementation, so it is stated plainly:

- `delivery_zone_postcode.postcode` is what `delivery.ZoneForPostcode` resolves.
- That function is shared by the storefront's serviceability answer **and** checkout's
  `DestinationZone` — deliberately, so the two can never disagree (025 FR-014b).
- Therefore an area cannot be finer than a postcode without changing checkout, the address model and
  the storefront read — all explicitly out of scope.

**The consequence is FR-006, and it is not a nicety.** Postcode 3350 covers **20** Ballarat localities;
3550 covers **12** in Bendigo. Choosing "Alfredton" serves all twenty.

⚠ **The failure mode is silent and asymmetric**: the admin believes they made a narrow decision, and the
only evidence otherwise is an order from a suburb they never intended to serve. There is no error, no
log line, no alert. **A tooltip does not discharge FR-006** — the count and the list must be in front of
the admin at the moment of confirming, and SC-003 measures whether five admins can actually state what
they just did.

**Rejected**: making serviceability locality-keyed. It is the *correct* long-term model and it is a much
larger slice — checkout, `customer_address`, the quote capture and the storefront read all key on
postcode today. Recorded as the natural successor to this feature.

---

## R3 — Where per-area configuration is stored

**Decision**: **per-area configuration is a projection over the existing `delivery_offering` grid.** The
admin edits an area; the service writes the corresponding offering rows for every origin zone.

The grid stays the storage and the quoting mechanism. Nothing in `core-api` changes.

**Why not replace the grid**: `checkout/quote.go` reads offerings per leg, `delivery.Options` ranks them,
and `order_package_delivery` captures the chosen one. Rewriting that is risk this feature does not need
to take, and FR-028/FR-031 forbid changing what a shopper experiences or what an existing order costs.

**Why not a parallel table**: two sources of truth for one price is how they drift. The area view must
*write through* to the grid, not shadow it.

### R3a — The collapse, stated exactly

Writing one fee per area means every `(origin, destination-in-that-area, method)` row gets the same
price. That is a **deliberate loss of expressiveness**, justified because the shopper cannot perceive
the distinction (hidden fulfilment, 021 FR-019) while the grid grows as origins × destinations.

⚠ **It is a real loss, not a no-op.** Live data proves it: Melbourne Metro standard is **$5.00** from a
Melbourne shop and **$8.00** from a Regional one. After the collapse it is one number, and the difference
becomes internal margin.

**FR-014/FR-031 make the collapse safe for money already committed**: a captured quote holds its own
price, so no in-flight order changes.

### R3b — Reconciling the existing conflict

**Decision**: the console **shows both existing prices and requires the admin to choose**. No automatic
rule.

Rejected: "keep the highest" (silently raises a price nobody decided) and "keep the lowest" (silently
erodes margin, which is what per-origin pricing existed to protect). ⚠ Automatic is the wrong default for
a money change even when the data is small — and the habit matters more than the four rows in dev.

---

## R4 — "Not served" as a fact rather than an absence

**Decision**: a new explicit state per (zone, method) — or per area — recorded positively.

Today `delivery_offering`'s own table comment states the rule: *"Absence of an active row for a package
leg-method = that method (or the package) is undeliverable."* Absence carries two meanings at once:

- *we decided not to serve this*, and
- *nobody has configured this yet*

⚠ **The live `REGIONAL` case is exactly this ambiguity causing customer harm** — see R5. There is no way
to look at the data and know which one it is, so there is no way to know whether it needs fixing.

**Mechanism**: `delivery_offering` already has `status ∈ (active, disabled)`. A `disabled` row is a
positive record that a method was *considered and switched off*. So "deliberately not served" is
expressible today for a method that once existed — what is missing is the state for an area **that has
never had a row at all**.

⚠ **Two candidate shapes, and this is the main open design question for the data model:**

1. **Materialise a row per (origin, destination, method) with `status='disabled'`** when an admin marks
   an area not-served. No schema change. Cost: rows multiply with origins, and "never configured" is
   still absence.
2. **A new per-area decision record** (`area_service_decision` or similar) holding the three-state
   answer: configured / deliberately-not-served / unconfigured. One row per area, independent of origin
   count, and it makes "unconfigured" a *queryable* state rather than an inference.

**Leaning: (2)**, because FR-025/FR-026 require *unconfigured* to be visible, and you cannot index the
absence of a row. Settled in `data-model.md`.

---

## R5 — ⚠ The live defect this feature answers for

**`REGIONAL` contains 3350 (Ballarat) and 3550 (Bendigo) and has ZERO active inbound offerings.**

```
zone       | postcodes      destination | active offerings
-----------+-----------     ------------+------------------
MEL-METRO  | 3000 3141      MEL-METRO   | 3
REGIONAL   | 3350 3550      REGIONAL    | 0
```

- `ZoneForPostcode('3350')` → ok → the storefront tells a Ballarat shopper **"We deliver here."**
- `delivery_offering` where destination = REGIONAL → none → `delivery.Options()` returns empty → **no
  delivery option can be quoted and the order cannot complete.**

This is **025 FR-014b violated in data rather than in code**: *"serviceability MUST be decided by the same
delivery zones and service levels that decide it at checkout, so the two answers can never disagree."*
The code honours it; the configuration undoes it. Every test passes.

⚠ **030 widened the blast radius.** Before it, a Ballarat shopper had to know the digits "3350". Now they
can type "Alfredton" and be told yes.

**Decision: this feature must make the state visible (FR-021, FR-025, FR-026, SC-014), and the row is
NOT patched quietly in the meantime.** Patching without removing the ambiguity guarantees a recurrence —
nobody can currently tell whether REGIONAL was deliberately unpriced or simply never finished.

⚠ **This is nevertheless a live customer-facing problem and the operator may reasonably choose to unblock
Ballarat and Bendigo before this slice ships.** That is a separate operational decision, recorded here so
it is not lost behind a feature that is weeks away.

---

## R6 — Same-day feasibility: shown, never computed

**Decision**: when enabling same-day for an area, the console **lists the shops and where they are**, and
requires an explicit acknowledgement when none is nearby. It does **not** compute a radius.

⚠ **A fee is a business choice the platform can absorb; same-day is a physical claim about time.** It is
true only if a shop holding the goods can reach that area today. Offering it otherwise breaks the promise
at the moment the shopper is most committed — the failure 025 and 030 exist to prevent.

**Why not compute it**: the platform has no routing or distance capability, and 030 rejected a
third-party geocoding dependency for the customer surface. `public.shop.postcode` gives an origin
postcode and `public.locality` gives names — neither gives drive time. **A radius derived from postcode
arithmetic would be invented precision**, and invented precision on a promise is worse than an honest
human judgement.

**What "nearby" means for the acknowledgement**: whether any shop's postcode falls in the **same zone**
as the area. Crude, but it is a fact the data actually supports, and it is stated to the admin as what it
is rather than dressed up as a distance.

**Rejected**: blocking same-day outright when no shop is in-zone. A shop one suburb across a zone boundary
may serve an area perfectly well; the platform does not know, and the admin does.

---

## R7 — Which surfaces change

| Surface | Change |
|---|---|
| `apis/edge-api/admin/src/delivery/` | Locality search, area composition with disclosure, per-area service levels, health checks |
| `apps/back-office/src/features/delivery/` | Area picker replacing the free-text box, per-area configuration page, health indicators |
| `packages/shared-types` | Area/service-level DTOs; `LocalityDTO` **reused unchanged** |
| `db/migrations` | One migration for the not-served/decision state (R4) |
| **`apis/core-api`** | ⚠ **NOTHING.** FR-028 forbids changing the shopper's experience. If a change here seems necessary, the design is wrong. |
| `apps/customer-*` | ⚠ **NOTHING**, same reason |

**Path (Principle III)**: entirely **cold path**. Operator CRUD at operations cadence — the doctrine's
central case. No hot-path work, and 021 already put this console there.

---

## R8 — Guarding the shopper against this feature

**Decision**: the strongest guarantee this slice can offer is that a **correctly-configured** system
produces byte-identical shopper behaviour, and that is asserted rather than assumed.

`core-api`'s existing `storefront` and `checkout` suites are the guard: they must pass **unmodified**.
⚠ A change to a core-api test during this feature is a signal the design breached FR-028, not a test that
needed updating — the same discipline that kept `ServiceabilityDTO` frozen in 030.

**Plus** the SC-014 assertion, which is new and is the reason this feature exists: **no area may be
serviceable to the storefront while unquotable at checkout.** That is a join, it is cheap, and it belongs
in the same testcontainers suite as 030's SC-002 coverage check — where it will sit beside it as the
second half of the same idea.

---

## R9 — Telemetry (Principle VII)

**Decision**: **no new product-analytics event.** This is an internal console; the audience is Effy
employees, not shoppers, and the platform's analytics taxonomy is customer-behavioural.

**What matters here is the audit trail, which already exists** — `admin.audit_log` (009) and the delivery
slice's existing `getZoneHistory`. FR-009/FR-016 are satisfied by extending what is already recorded to
the new mutations, not by inventing a mechanism.

**One metric would be worth adding** — a gauge of misconfigured areas — ⚠ **but it is DEFERRED, because
there is nothing to add it to.** No cold-path service emits a metric today: a grep across
`apis/edge-api/*/src` finds no `PutMetricData` and no EMF, only log lines that reach CloudWatch. The
signal is available on demand from `GET /admin/v1/delivery-health` instead. **Carry-forward: the cold
path has no metrics emission path at all**, which is a Principle VII gap wider than this feature.

⚠ **Cold-path metrics reach Grafana via CloudWatch**, not a `/metrics` endpoint; the Lambdas have no
Prometheus scrape target. Recorded so nobody plans one.
