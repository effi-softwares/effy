# Data Model: Delivery Areas (031)

One new table. **No structural change to any existing table** — `delivery_zone`,
`delivery_zone_postcode` and `delivery_offering` keep their shapes, because checkout and the captured
quote depend on them and FR-028/FR-031 forbid changing what a shopper experiences or what an order costs.

---

## The shape of the problem

An area today has **three possible states and only two are representable**:

| State | Today | Distinguishable? |
|---|---|---|
| Configured | one or more `delivery_offering` rows, `status='active'` | ✅ |
| Deliberately not served | ⚠ **an absent row** | ❌ |
| Never configured | ⚠ **an absent row** | ❌ |

`delivery_offering`'s own comment states the rule: *"Absence of an active row for a package leg-method =
that method (or the package) is undeliverable."* One absence, two meanings.

⚠ **This is not theoretical.** `REGIONAL` serves Ballarat and Bendigo with zero inbound offerings, and
nobody can tell whether it was deliberately unpriced or never finished — while shoppers there are told
"we deliver here" and cannot check out (research R5). **You cannot index the absence of a row**, so
FR-025 ("an area with no service level MUST be flagged as unconfigured") is unbuildable until the third
state is a fact.

---

## `public.delivery_area_decision` (new)

One row per area a human has made a decision about. Absence of a row now means exactly one thing:
**nobody has decided yet.**

```sql
CREATE TABLE public.delivery_area_decision (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    zone_id        uuid NOT NULL REFERENCES public.delivery_zone (id) ON DELETE CASCADE,
    postcode       text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    decision       text NOT NULL CHECK (decision IN ('served', 'not_served')),
    note           text,
    decided_by     text NOT NULL,
    decided_at     timestamptz NOT NULL DEFAULT now(),
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT delivery_area_decision_uq UNIQUE (zone_id, postcode)
);
```

### Why these choices

| Choice | Reason |
|---|---|
| **Keyed on `(zone_id, postcode)`** | An area *is* a postcode (research R2), and a postcode belongs to at most one zone — `delivery_zone_postcode.postcode` is already UNIQUE. The zone is carried so a `CASCADE` cleans up when a zone is deleted, rather than orphaning decisions. |
| **`ON DELETE CASCADE`** | Edge case from the spec: *"a zone deleted while areas are configured — configuration must not be orphaned in place."* |
| **Two values, not three** | ⚠ `unconfigured` is deliberately **NOT** a value. It is the absence of a row, and encoding it would create two ways to say the same thing. The three states are: row=`served`, row=`not_served`, no row. |
| **`decided_by` / `decided_at` on the row** | FR-016. The audit trail records the *change*; this records the *current* answer's provenance so the console can show "not served — decided by X on Y" without a history query. ⚠ **It holds the Cognito `sub`**, not an email or a display name — the console joins `admin.staff` for the name SC-013 requires. Stated because 005 shipped a defect of exactly this shape (`claim("username") ?? sub`, putting UUIDs into `admin.staff.email`), and an untyped provenance column is how it recurs. |
| **`note` nullable** | An operator recording *why* an area is not served is the difference between a decision someone can revisit and a fact nobody dares touch. Optional because forcing prose produces "n/a". |

⚠ **No foreign key to `delivery_zone_postcode`.** A decision may legitimately outlive the postcode's
membership — an admin removes an area, then re-adds it, and the earlier "not served" note is still the
useful history. A FK would delete it. The join is on the value, and orphaned decisions surface in the
health check rather than being silently swept.

### Table comment

```sql
COMMENT ON TABLE public.delivery_area_decision IS
  'A human decision about one delivery area (031). Exists to make THREE states distinguishable where
   there were two: a row with decision=served, a row with decision=not_served, and NO ROW = nobody has
   decided yet. Before this, an unserved area and an unconfigured one were both "no delivery_offering
   row", which is how REGIONAL came to serve Ballarat and Bendigo with no offerings — the storefront
   promising delivery that checkout could not quote. ⚠ unconfigured is NOT a value: it is the absence
   of a row, and encoding it would create two ways to say one thing.';
```

---

## The projection: per-area configuration → `delivery_offering`

The console edits an **area**. The service writes the **grid**. Nothing in `core-api` changes.

### The rule

For an area (a postcode in zone `Z`) configured with method `M`, fee `F`, timing `T`:

```
for every origin zone O (including Z itself):
    upsert delivery_offering(origin_zone_id=O, destination_zone_id=Z, method=M)
        set price_amount = F, lead_days_*/same_day_cutoff = T, status = 'active'
```

Disabling method `M` for the area sets `status='disabled'` on those rows rather than deleting them —
⚠ a disabled row is a *record that someone switched it off*, which is exactly the information deletion
destroys.

### ⚠ Three consequences that must be stated, not discovered

1. **The fee is the same from every origin.** That is the collapse (research R3a), and it is a real loss
   of expressiveness: live data has Melbourne Metro standard at **$5.00** from a Melbourne shop and
   **$8.00** from a Regional one. Justified because the shopper cannot perceive which shop serves them
   (hidden fulfilment, 021 FR-019), and the difference becomes internal margin.

2. **⚠ Areas in the same zone cannot differ.** `delivery_offering` is keyed on *zone*, not postcode — so
   configuring "Ballarat" configures every area in `REGIONAL`, including Bendigo. **This is the FR-006
   problem one level up**, and it must be disclosed the same way: the per-area editor states which other
   areas the change also affects.

   *Rejected*: re-keying `delivery_offering` on postcode. It is the honest fix and it is a rewrite of
   the quoting path — explicitly out of scope (FR-028, plan Constraints). Recorded as the natural
   successor, alongside locality-keyed serviceability.

3. ⚠ **The health check is ZONE-granular while the decision record is AREA-granular.** Query 2 below
   un-flags every area in a zone as soon as *one* active offering exists for it, and two areas in one
   zone can hold conflicting decisions (`served` and `not_served`) over identical offerings. That is a
   real gap between what an admin decides and what the system can check — the same postcode-vs-zone
   seam as consequence 2, one layer down. **A test must cover two areas in one zone with divergent
   decisions**, because it is the case the health query cannot currently distinguish.

4. **A captured quote is untouched.** `order_package_delivery` holds its own copy of the chosen option,
   so FR-014/FR-031 hold without any work here — the projection writes the catalogue, never an order.

---

## Reads this feature adds

All against existing tables plus `public.locality` (030) and the new decision record.

| Read | Answers | Notes |
|---|---|---|
| **Locality search** | "which places could the operator mean?" | ⚠ Same predicate as the storefront's — prefix on `lower(name)`, served by `locality_name_prefix_idx`. Cold path, own service (research R1). |
| **Postcode coverage** | "what else does this postcode include?" | `SELECT name, state FROM locality WHERE postcode = $1` — **the data behind FR-006**. 3350 → 20 rows; 3550 → 12. |
| **Area detail** | "what does this area get?" | Joins zone, decision, and the offerings for the zone as destination. One request (FR-022). |
| **Zone places** | "which places does this zone serve, by name?" | Joins `delivery_zone_postcode` → `locality` (FR-023). |
| **Health** | the three defect classes | See below. |
| **Same-day feasibility** | "which shops could serve this area?" | `public.shop.postcode` → its zone. ⚠ Shown as **"shops in the same zone"**, stated as exactly that — not dressed up as a distance (research R6). |

### The health query, and why it is three questions

```sql
-- 1. unknown place: an area no locality names  (⚠ this is the 3001 class)
SELECT p.postcode FROM public.delivery_zone_postcode p
LEFT JOIN public.locality l ON l.postcode = p.postcode
WHERE l.id IS NULL;

-- 2. unconfigured: an area with no decision AND no active offering  (⚠ the REGIONAL class)
SELECT p.postcode FROM public.delivery_zone_postcode p
LEFT JOIN public.delivery_area_decision d ON d.zone_id = p.zone_id AND d.postcode = p.postcode
WHERE d.id IS NULL
  AND NOT EXISTS (SELECT 1 FROM public.delivery_offering o
                  WHERE o.destination_zone_id = p.zone_id AND o.status = 'active');

-- 3. empty zone: a zone serving nobody
SELECT z.code FROM public.delivery_zone z
LEFT JOIN public.delivery_zone_postcode p ON p.zone_id = z.id
GROUP BY z.id, z.code HAVING count(p.id) = 0;
```

⚠ **Query 2 is SC-014's assertion in the console.** Run against today's data it returns **3350 and
3550** — the live defect. That is the acceptance test for this feature working: it must find them now,
and return nothing once they are configured.

---

## What is NOT changing

- **`delivery_zone`, `delivery_zone_postcode`, `delivery_offering`** — no columns added, none removed,
  no keys changed. The projection writes the offering rows it already writes.
- **`delivery.ZoneForPostcode`** — the one predicate shared by the storefront answer and checkout's
  `DestinationZone`. ⚠ Touching it is how the two answers start to disagree, which is the defect this
  feature exists to make visible.
- **`order_package_delivery`** — a captured quote keeps its price.
- **`public.locality`** — read-only here. 030 owns it, `make load-localities` maintains it.
