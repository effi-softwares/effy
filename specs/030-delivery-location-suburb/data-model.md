# Data Model: Suburb-Aware Delivery Location (030)

One new table. **No existing table is altered**, and nothing about delivery zones, pricing, or
checkout changes.

---

## `public.locality` (new)

Every Australian `(locality, state, postcode)` triple. Reference data — read by shoppers, written only
by the operator-run loader.

```sql
CREATE TABLE public.locality (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name       text NOT NULL,
    state      text NOT NULL CHECK (state IN ('ACT','NSW','NT','QLD','SA','TAS','VIC','WA')),
    postcode   text NOT NULL CHECK (postcode ~ '^[0-9]{4}$'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT locality_triple_uq UNIQUE (name, state, postcode)
);
```

### Fields

| Field | Rule | Why |
|---|---|---|
| `name` | Locality name as the shopper would say it, e.g. `Richmond`. Stored in its canonical mixed case; matched case-insensitively. | The display shows it verbatim (FR-033); lowercasing it in storage would mean reconstructing capitalisation at read time, which gets `McKinnon` wrong. |
| `state` | Exactly one of the eight AU states/territories, `CHECK`-constrained. | Two localities named the same are distinguished only by state (FR-008). A free-text state would let a typo make a place unreachable and no test would notice. |
| `postcode` | Exactly four digits, `CHECK`-constrained. | Matches `delivery.NormalizePostcode`'s canonical form, so the join in the coverage test is a plain equality. |

### The unique key is the triple, deliberately

`UNIQUE (name, state, postcode)` — and none of the narrower keys:

- **not `(name, state)`** — a locality legitimately spans several postcodes.
- **not `postcode`** — a postcode legitimately covers several localities.
- **not `name`** — locality names recur across states, frequently.

This is the same fact FR-008 states to the shopper ("a bare locality name MUST NOT be selectable"),
expressed as a constraint. It is also what makes the loader's upsert well-defined (`ON CONFLICT ON
CONSTRAINT locality_triple_uq DO UPDATE`).

### Indexes

```sql
CREATE INDEX locality_name_prefix_idx ON public.locality (lower(name) text_pattern_ops);
CREATE INDEX locality_postcode_idx    ON public.locality (postcode);
```

⚠ **`text_pattern_ops` is load-bearing.** The lookup is `lower(name) LIKE $1 || '%'`. Under a
non-C collation a plain B-tree on `name` **will not serve that predicate**, and Postgres will
sequentially scan ~18 000 rows on every keystroke. The feature would be correct, the tests would pass,
and it would simply be slow in a way nothing reports. `EXPLAIN` on the real query is a task, not an
assumption (research R5).

### Table comment (carries the rule into the database)

```sql
COMMENT ON TABLE public.locality IS
  'Australian localities (030). name+state+postcode is the only identifying key: a name recurs across
   states, a locality spans postcodes, a postcode covers localities. Covers ALL of Australia, NOT only
   served areas (FR-002) — a served-only table would make "unrecognised place" and "we do not deliver
   there" indistinguishable, which is the conflation the delivery-location capability exists to
   prevent. Reference data: loaded by cmd/load-localities, never written by a shopper.';
```

### Relationships — deliberately none

`locality` has **no foreign key to `delivery_zone_postcode`**, and must not acquire one.

The two tables share the `postcode` column as a value and nothing else. `delivery_zone_postcode` holds
the postcodes Effy **serves**; `locality` holds every postcode that **exists**. A foreign key in
either direction would force one to be a subset of the other, and:

- `locality ⊆ delivery_zone_postcode` breaks FR-002 outright.
- `delivery_zone_postcode ⊆ locality` makes adding a delivery zone depend on the reference data being
  current, so a stale dataset would block an operations change.

They are joined only in one place: the **coverage test** (SC-002), which asserts every served postcode
has at least one locality row. That is an assertion about data quality, not a schema constraint.

---

## Domain shapes

### Hot path (Go, `internal/features/storefront`)

```go
// Locality is one place a shopper can name. Three fields, and all three are needed to identify it.
type Locality struct {
    Name     string
    State    string
    Postcode string
}
```

The service classifies the query rather than making the caller do it (research R4a):

| Input | Treated as | Predicate |
|---|---|---|
| 4 digits (after separator stripping) | a postcode | `postcode = $1` |
| ≥ 2 characters, not a postcode | a name prefix | `lower(name) LIKE lower($1) || '%'` |
| < 2 characters, or empty | not a question | `400 invalid_query`, no DB read |

⚠ **`400` here is not a refusal**, exactly as `400 invalid_postcode` is not on the serviceability
read. The clients render it as "keep typing", never as "we do not deliver there" (FR-012).

Ordering is `name, state, postcode` — deterministic and **never by serviceability** (FR-011).
Limit 8 (FR-010).

### Mobile (Kotlin, `features/localities/domain`)

```kotlin
data class Locality(val name: String, val state: String, val postcode: String)

interface LocalityRepository {
    suspend fun search(query: String): List<Locality>
}
```

### Web (`lib/localities.ts`)

Typed from `LocalityDTO` in `@effy/shared-types` — not redeclared (Principle II).

---

## Change to the existing delivery context (both clients)

The stored delivery location gains **two optional fields**. It is client-side state on both surfaces;
no table backs it and none is added (FR-021 — a delivery location is a device preference, never an
address).

```
DeliveryContext {
    postcode : String          // unchanged, still the canonical 4 digits
    locality : String?         // NEW — null when the shopper typed a bare postcode
    state    : String?         // NEW — null when the lookup has not resolved one
    serviced : Boolean?        // unchanged — null still means "no answer", NEVER "no"
    source   : GUEST | ACCOUNT // unchanged in shape; now load-bearing for FR-023
}
```

Three rules that come with those fields:

1. **`postcode` remains the only field the serviceability answer is keyed on.** `locality` and `state`
   are display data. If the locality lookup fails, the verdict is still correct and still shown — the
   place simply displays as bare digits (research R11, row 4).
2. **Changing the postcode clears `locality` and `state`** along with `serviced`, for the same reason
   `serviced` is cleared: showing the previous place's name against a new postcode is worse than
   showing nothing.
3. **`source` is now load-bearing.** It was display provenance in 025; FR-023 makes it the
   discriminator that decides whether a location survives sign-out. It remains forbidden as an input
   to any authorization or pricing decision (FR-022).

⚠ **Web persists this shape to `localStorage`**, so the stored value gains fields. The existing store
already carries a versioned key and a legacy-migration path; the two new fields are optional, so an
old stored value stays readable and simply displays as a bare postcode until the shopper next sets a
location. **A stored context from before this feature must not be discarded** — that would silently
un-set the delivery location of every returning web shopper on deploy day.

---

## The dataset file

`db/reference/au-localities.csv`, committed, with `db/reference/README.md` recording the source URL,
the licence, and the date retrieved.

| Column | Notes |
|---|---|
| `locality` | → `name` |
| `state` | → `state`; must already be one of the eight codes, or the loader rejects the row |
| `postcode` | → `postcode`; 4 digits, zero-padded ⚠ |

⚠ **Leading-zero postcodes.** NT postcodes begin `08xx`. Any pipeline that touches this file as
numbers — a spreadsheet, a naive parser — will turn `0800` into `800` and make the entire Northern
Territory unreachable. The loader MUST treat the column as text and MUST reject a row whose postcode
is not exactly four digits, rather than padding it and hoping.

⚠ **The loader rejects; it does not repair.** A malformed row is a defect in the dataset, and a
loader that quietly fixes rows produces a database nobody can reason about. It reports the offending
lines and exits non-zero — the same posture as the conformance check in 029, and for the same reason.
