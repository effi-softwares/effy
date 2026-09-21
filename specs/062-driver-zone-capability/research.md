# Phase 0 — Research: Driver Zone Capability & Coverage (062)

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

⚠ The industry research for this programme was done up front and lives in
[docs/logistics-engine-architecture.md](../../docs/logistics-engine-architecture.md) with six cited
reports in [docs/research/logistics/](../../docs/research/logistics/). This file resolves only what is
specific to **building slice B in this codebase**.

---

## R1 — Path and service: cold path, `edge-fleet`. Same as 061, same reasons.

**Decision**: every new interface is a cold-path TypeScript Lambda in `apis/edge-api/fleet`.

**Rationale**: Principle III reserves the hot path for latency-sensitive *customer* traffic. Nothing
here is customer-facing. `edge-fleet` already carries the back-office authorizer, the audit helper,
the PII discipline, the readiness view this feature extends, and a container harness against real
migrations. Clearances are read together with drivers on every screen that shows them.

**Measured**: `edge-fleet` declares **19 handlers** after 061. This feature adds ~4, taking it to ~23 —
far inside the CloudFormation budget that forced the service's creation. No exception claimed.

---

## R2 — ⭐ The capability matrix: one row per grant, with NULL as a first-class "every zone"

**Decision**:
```
driver_zone_capability(driver_id, function, method, zone_id NULLABLE)
```
`zone_id IS NULL` means **every zone, including zones created afterwards** (FR-010/FR-011).

**Rationale**: FR-011 is the requirement whose absence would be invisible. A row-per-zone
representation of "everywhere" is correct on the day it is written and quietly wrong the first time a
zone is added — the driver stops being eligible for the new area, nothing fails, nobody is told. The
only way to make "everywhere" stay true is to store it as **a fact rather than an enumeration**.

**Alternatives considered**:
- **A row per (driver, function, method, zone), back-filled when a zone is created.** Rejected. It
  needs a job that must never be forgotten, and a job that must never be forgotten is how 054 ended up
  with one availability rule hand-written in fourteen places.
- **An `all_zones boolean` column beside `zone_id`.** Rejected: two columns answering one question, so
  `(zone_id = X, all_zones = true)` is representable and meaningless. 033, 052 and 053 each shipped a
  defect of that shape.
- **Arrays or `jsonb` of zone ids on the driver.** Rejected: unindexable for the matching query, and
  it makes "revoke one clearance" a read-modify-write that two operators can race.

### ⚠ The uniqueness trap, and the PostgreSQL 16 answer
A plain `UNIQUE` does **not** deduplicate NULLs in standard SQL, so
`(driver, 'delivery', 'same_day', NULL)` could be inserted twice and "every zone" would silently become
two rows — making FR-005's no-op into a duplicate. PostgreSQL **15** added `NULLS NOT DISTINCT`, and we
run **16**:
```sql
CREATE UNIQUE INDEX driver_zone_capability_uq
    ON public.driver_zone_capability (driver_id, function, method, zone_id)
    NULLS NOT DISTINCT;
```
**One index, one statement of the rule.** The alternative — two partial unique indexes, one
`WHERE zone_id IS NOT NULL` and one `WHERE zone_id IS NULL` — works but leaves two objects that can
drift, and invites someone to delete the one that "looks redundant".

⚠ **Must be proven by a container test that inserts the duplicate and asserts refusal.** A uniqueness
rule that silently does not hold is 059's nullable `subject_key`: a green suite and a feature that
looks like it works. 061 proved the same class of rule this way and it is why C1–C5 exist.

---

## R3 — ⚠ A ZONE-LEVEL FACT CHANGES WHAT "UNCOVERED" MEANS, and it was nearly missed

`public.delivery_zone` already carries **`sameday_eligible boolean`** (047). Same-day is not offered
everywhere: outer and regional zones are standard-only, by design.

**So "nobody is cleared for same-day delivery in Ballarat" is NOT a coverage gap.** Same-day is not
sold there. Reporting it would put permanent, unfixable rows in the one view whose entire purpose is to
be actionable — and an operator who cannot clear a gap learns to ignore the screen that shows it.

**Decision**: the coverage view enumerates **only the work a zone can actually receive**:
- every active zone needs `collection` and `delivery` for **standard**;
- a zone needs them for **same_day** only when `sameday_eligible` is true.

**Alternatives considered**: reporting all four combinations everywhere and letting the operator
ignore the irrelevant ones — rejected on the reasoning above, which is 058's "alarming on workload
teaches operators to ignore alarms" applied to a screen.

⚠ **This is a genuine finding, not a restatement of the spec.** FR-017 says coverage is reported per
kind of work; it does not say which kinds a zone needs, because that is a fact about the platform
rather than about the requirement. Recording it here so it is not discovered during implementation.

---

## R4 — Coverage is DERIVED, and "nobody cleared" vs "all unavailable" is one query, not two

**Decision**: compute coverage on read, in one statement, emitting a per-(zone, function, method) row
with a cause.

**Rationale**: FR-018 needs three outcomes to be distinguishable — **covered**, **nobody cleared**,
**cleared but all unavailable** — and they differ only by which side of a join is empty. Two separate
queries would be two definitions of "available", and the first time one changed the screen would
contradict itself. This is 027's counted-not-stored rule, fifth application on this platform.

**The available-driver predicate is the EXISTING one.** FR-020 requires the coverage view and the
work-readiness view never to disagree, so both read `BLOCKED_REASONS` from
`apis/edge-api/fleet/src/drivers/sql.ts` rather than either re-deriving "can this person work".
⚠ 058 pinned a shop's Needs-attention figure to one field of one cached query for exactly this reason,
and proved it by breaking it.

---

## R5 — Retiring `driver.delivery_zone_id` is safe, and must be verified rather than assumed

**Decision**: drop the column and remove the `no_zone` blocked reason.

**Verification required before writing the migration** (a task, not an assumption):
1. grep every reader of `delivery_zone_id` across `apis/`, `apps/` and `packages/`;
2. confirm no assignment, coverage or readiness logic depends on it beyond the `no_zone` reason itself;
3. confirm `DriverBlockedReason`'s consumers — which 061 established are caught at **compile time**,
   because `BLOCKED_LABEL` is a `Record<DriverBlockedReason, string>`.

⚠ **This is an enum NARROWING, which is the mirror of 061's widening and is NOT symmetrical.** Removing
a member makes every exhaustive `Record<>` over it *over*-specified rather than under-specified, and
TypeScript reports an excess property — so the compiler helps here too. But any **data** already
carrying `no_zone`, and any test fixture asserting it, must be found by hand.

---

## R6 — Concurrency: grants are idempotent; the driver's clearance SET is not versioned

**Decision**: a grant is `INSERT … ON CONFLICT DO NOTHING`; a revoke is `DELETE`. Neither takes an
optimistic-concurrency token.

**Rationale**: FR-005 and FR-006 make both operations no-ops when they are already true, so two
operators granting the same clearance simultaneously both succeed and the outcome is correct. FR-009
asks that they not *silently overwrite one another* — which a set of independent rows satisfies by
construction, because there is nothing to overwrite.

**Alternatives considered**: a versioned "replace the whole clearance set" operation — rejected. It
would make FR-009 a real hazard (last writer wins, silently discarding the other operator's grant),
and it would turn two compatible edits into a conflict.

⚠ **This differs deliberately from 061's vehicle edit**, which *does* carry a token because it replaces
scalar fields where last-writer-wins loses information. Same codebase, opposite answer, because the
operations are not the same shape.

---

## R7 — Testing: container tests against the real migration, from the first commit

**Decision**: extend `apis/edge-api/fleet/src/schema.container.test.ts`.

**Rationale**: this feature's correctness is in the schema and in one matching query — the
`NULLS NOT DISTINCT` index, the "every zone" match, and a three-way coverage derivation. None of it is
observable through a mocked repository. 061's first container run immediately caught a dropped column
that typechecked perfectly; 056's concurrency-token defect was invisible to `tsc` and to every mocked
test.

---

## R8 — What this feature must NOT touch

| Not touched | Why |
|---|---|
| `public.delivery_zone` and its postcodes | FR-027 — zones are not re-cut. Postcode-based zoning was settled in research (D1) |
| Geography of any kind | no polygons, isochrones, coordinates or PostGIS (D1/D20) |
| `core-api` / any customer surface | nothing here is customer-facing; a zone is never named to a shopper |
| Any task, round or assignment concept | slice C; FR-026 |
| The driver mobile app | a driver does not grant their own clearances |
| Vehicles and holdings | 061's; untouched beyond reading the readiness rule |
| Design tokens | no new colour, no new radius; `tokens:check` must pass **unchanged** |
