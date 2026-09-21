# Phase 1 — Data Model: Driver Zone Capability & Coverage (062)

**Feature**: [spec.md](spec.md) · **Research**: [research.md](research.md)

House style (007/009/047/056/061): everything operational in `public`; raw SQL; **text CHECK enums**,
no native PG enums and no triggers; an index on every FK; **no money anywhere** in the driver domain
(049 FR-013); `COMMENT ON` everything.

**One forward-only migration**: `db/migrations/<ts>_driver_zone_capability.sql`.

---

## 1. `public.driver_zone_capability` — NEW

One row = one grant. "This driver may do this kind of work in this place."

| Column | Type | Notes |
|---|---|---|
| `id` | `uuid` PK | |
| `driver_id` | `uuid NOT NULL` → `driver` `ON DELETE CASCADE` | a clearance has no meaning without its driver |
| `function` | `text NOT NULL` | `CHECK IN ('collection','delivery')` |
| `method` | `text NOT NULL` | `CHECK IN ('standard','same_day')` |
| `zone_id` | `uuid NULL` → `delivery_zone` `ON DELETE CASCADE` | ⚠ **NULL = every zone** |
| `granted_by_sub` | `text` | which operator, for attribution |
| `created_at` | `timestamptz NOT NULL DEFAULT now()` | |

```sql
-- ⚠ FR-005 AND FR-011 BOTH LIVE IN THIS ONE INDEX.
-- A plain UNIQUE does NOT deduplicate NULLs, so (driver,'delivery','same_day',NULL) could be
-- inserted twice and "every zone" would silently become two rows — making the idempotent grant a
-- duplicate. PostgreSQL 15 added NULLS NOT DISTINCT; we run 16.
CREATE UNIQUE INDEX driver_zone_capability_uq
    ON public.driver_zone_capability (driver_id, function, method, zone_id)
    NULLS NOT DISTINCT;

CREATE INDEX driver_zone_capability_driver_idx ON public.driver_zone_capability (driver_id);
CREATE INDEX driver_zone_capability_zone_idx   ON public.driver_zone_capability (zone_id);
```

### ⚠ Why `zone_id IS NULL` rather than an `all_zones` boolean
FR-011 is the requirement whose absence would be **invisible**: a driver cleared for "everywhere" must
cover a zone created next month, and if they silently do not, nothing fails and nobody is told. The
only representation that stays true is one that stores the FACT rather than an enumeration of today's
zones.

A boolean beside `zone_id` would make `(zone_id = X, all_zones = true)` representable and meaningless —
two columns answering one question, which is 033/052/053's recurring defect. One nullable column cannot
express the contradiction.

### ⚠ `ON DELETE CASCADE` on `zone_id`, deliberately
If a zone is deleted, clearances naming it become statements about nothing. Cascading removes them;
the driver's other clearances and any "every zone" grants are untouched, because those rows do not
reference the deleted zone.

⚠ **A DISABLED zone is a different case and must NOT cascade.** `delivery_zone.status = 'disabled'` is
reversible; the clearance must survive so re-enabling the zone restores cover without anybody
re-granting it. Disabled zones are filtered at **read** time, not deleted at write time.

### Why not a composite primary key
`(driver_id, function, method, zone_id)` would be the natural key, but a PK cannot contain a nullable
column. The surrogate `id` plus the `NULLS NOT DISTINCT` index gives the same guarantee and a stable
handle for a revoke.

---

## 2. `public.driver` — ALTERED

| Change | Column | Notes |
|---|---|---|
| **DROP** | `delivery_zone_id` | FR-024 — replaced entirely by the table above |

⚠ **This is the point of the slice, not tidy-up.** The column could hold only one zone when a driver
covers several, and **no assignment code ever read it** — 049 declared that a driver without a zone "is
inert for assignment" and then never consulted the field. Leaving it beside its replacement would give
the platform two answers to one question.

⚠ **Its index `driver_zone_idx` goes with it.**

---

## 3. What is NOT changed

`public.delivery_zone`, `public.delivery_zone_postcode`, `public.delivery_ring` — **untouched**
(FR-027). This feature references zones; it does not define, re-cut or re-scope them. Postcode-based
zoning was settled in research (decision D1) and is not revisited here.

---

## 4. Derived, never stored

| Fact | Derived from | Why not stored |
|---|---|---|
| Is this driver cleared for (zone, function, method)? | `zone_id = $1 OR zone_id IS NULL` | the "every zone" row IS the answer |
| Which zones are uncovered, and why | clearances × active zones × the readiness rule | a stored gap and the clearances beneath it can disagree |
| A driver's breadth of clearance | their rows | a cached summary goes stale on every grant |

⚠ **Coverage is a function of TODAY** — who is employed, who is blocked, which zones are active. A
stored flag would go stale silently, exactly as a stored vehicle-compliance flag would have in 061.
027's counted-not-stored rule, **fifth application**.

---

## 5. The two queries that carry the feature

### 5a. Is a driver cleared for a (zone, function, method)?
```sql
EXISTS (
  SELECT 1 FROM public.driver_zone_capability c
   WHERE c.driver_id = $1 AND c.function = $2 AND c.method = $3
     AND (c.zone_id = $4 OR c.zone_id IS NULL)   -- ⚠ NULL is the "every zone" grant
)
```
⚠ **`OR c.zone_id IS NULL` is the whole of FR-011.** Omitting it compiles, passes any test written
against zone-specific grants, and quietly excludes every "everywhere" driver from every zone.

### 5b. Coverage — one statement, three outcomes
Enumerate the work each **active** zone can actually receive, then left-join the drivers cleared for
it who can work:

```
needed = active zones × {collection, delivery} × {standard}
       ∪ active zones × {collection, delivery} × {same_day}  WHERE zone.sameday_eligible
```
For each needed row, count (a) drivers cleared, and (b) drivers cleared **and** able to work — where
"able to work" reads the EXISTING `BLOCKED_REASONS` fragment, so FR-020 holds by construction rather
than by discipline.

| cleared | able | outcome |
|---:|---:|---|
| 0 | 0 | **`no_driver_cleared`** — an administrative gap |
| >0 | 0 | **`all_cleared_unavailable`** — a rostering problem |
| >0 | >0 | covered — ⚠ **emits no row at all** (FR-019) |

⚠ **`sameday_eligible` is why this is not a simple cross join**, and it was nearly missed (research
R3). Same-day is not sold in outer and regional zones, so "nobody is cleared for same-day in Ballarat"
is not a gap — it is a permanent, unfixable row in the one view whose purpose is to be actionable, and
an operator who cannot clear a gap learns to ignore the screen.

---

## 6. Audit

Reuses `admin.audit_log` and 056's `recordAudit`, with the target type `driver` — a clearance is a fact
about a person (FR-008).

Actions: `driver.capability_granted` · `driver.capability_revoked`.

Detail records the function, the method and the zone (or that it was every zone). ⚠ **No PII**: a
clearance carries none, and the 056 redaction rule is unchanged.

---

## 7. Migration ordering

```
1. CREATE public.driver_zone_capability  (FKs → driver, delivery_zone)
2. CREATE the NULLS NOT DISTINCT unique index + both FK indexes
3. DROP INDEX public.driver_zone_idx
4. ALTER public.driver DROP COLUMN delivery_zone_id
```
⚠ **Step 4 is DESTRUCTIVE and the values are discarded.** They were read by nothing, so no behaviour
changes — but they are not migrated into the new table either, and that is deliberate: a single zone
does not say which *function* or *method* it applied to, so converting it would be **inventing a
clearance nobody granted**. Operators re-grant deliberately. Called out in the migration header rather
than discovered on a rollback.

The Down restores the shape only (003's dev-only single-step rule).
