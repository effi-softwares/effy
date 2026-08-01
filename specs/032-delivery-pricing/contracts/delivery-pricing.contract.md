# Contract: Delivery Pricing & Same-Day Coverage (032)

Three interfaces: **admin** (cold path), **shop** (cold path), and the **quoting behaviour** the hot
path must exhibit. Shared DTOs live in `@effy/shared-types` (Principle II).

⚠ **The most important line in this document is a route that does not exist**: there is **no pricing
route on the shop service**. FR-008 is enforced by topology, not by a check.

---

## A. Admin — pricing rules (`apis/edge-api/admin`, admin pool)

Authz: read = any active staff; mutate = `admin` | `manager` (031's A1 gate, unchanged).

| Method | Path | Purpose | FR |
|---|---|---|---|
| `GET` | `/admin/v1/delivery-pricing` | All three rules with their bands | FR-001 |
| `PUT` | `/admin/v1/delivery-pricing/{method}` | Replace one method's rule **and its full band set** | FR-001..FR-007, FR-012 |

⚠ **Hyphenated, not nested** — matching `/admin/v1/delivery-zones` and `/admin/v1/delivery-localities`
already on this gateway. A nested `/delivery/pricing` would be the only one of its shape.

### `PUT` body

```jsonc
{
  "baseAmount": "6.00",
  "roundingStep": "0.50",
  "maxAmount": "45.00",
  "status": "active",
  "distanceBands": [ { "upperBound": "5",  "addAmount": "0.00" },
                     { "upperBound": "15", "addAmount": "3.00" },
                     { "upperBound": "50", "addAmount": "9.00" } ],
  "weightBands":   [ { "upperBound": "2",  "addAmount": "0.00" },
                     { "upperBound": "10", "addAmount": "2.50" } ]
}
```

⚠ **Whole-set replacement, not per-band CRUD.** Bands are only meaningful as an ordered set: adding one
in the middle changes the meaning of its neighbours, and a per-band `POST` makes a half-edited set
observable by a quote in flight. One transaction, one consistent set.

**Refusals** — each distinguishable, because "invalid" tells an operator nothing:

| Condition | Status | Why it is its own refusal |
|---|---|---|
| Empty `distanceBands` or `weightBands` | `422 bands_required` | ⚠ An empty set silently prices everything at base — FR-011's defect exactly. |
| Duplicate `upperBound` in a dimension | `422 duplicate_band` | Two answers for one value. |
| `roundingStep <= 0` | `422 invalid_rounding` | A zero step is a division. |
| `maxAmount` below `baseAmount` + **smallest** distance band + **smallest** weight band | `422 cap_below_floor` | ⚠ A cap under the **floor** makes every fee the cap — a silently flat price table. **Not** "below base + largest bands": that would refuse every cap that could ever bind, which is exactly what FR-012 exists to allow. |
| `maxAmount` not a multiple of `roundingStep` | `422 cap_not_rounded` | ⚠ `min(45.33, roundUp(…))` returns `45.33`. The cap would break SC-003 only on the most expensive orders — where it is least likely to be spotted. |
| `method` not one of the three | `404` | |

**Audit**: every accepted `PUT` writes `admin.audit_log` with the actor (FR-013/SC-014).

---

## B. Admin — the approval queue (`apis/edge-api/admin`)

| Method | Path | Purpose | FR |
|---|---|---|---|
| `GET` | `/admin/v1/delivery-declarations?status=pending` | The queue | FR-022, FR-027 |
| `GET` | `/admin/v1/delivery-declarations/{id}` | One declaration **with distances** | FR-023 |
| `POST` | `/admin/v1/delivery-declarations/{id}/approve` | Approve | FR-024, FR-026 |
| `POST` | `/admin/v1/delivery-declarations/{id}/decline` | Decline **with a reason** | FR-024 |
| `POST` | `/admin/v1/delivery-declarations/{id}/revoke` | Withdraw one already in force | FR-025 |

### Detail response — the FR-023 shape

```jsonc
{
  "id": "…", "shopId": "…", "shopName": "Effy SHOP TWO", "shopPostcode": "3550",
  "offersSameday": true, "cutoffTime": "14:00", "status": "pending",
  "submittedBy": "…", "submittedAt": "2026-08-01T…",
  "areas": [
    { "postcode": "3550", "places": ["Bendigo", "…"], "straightLineKm": 2.1,  "localityCount": 12 },
    { "postcode": "3350", "places": ["Ballarat", "…"], "straightLineKm": 98.4, "localityCount": 20 },
    { "postcode": "0872", "places": ["…"],            "straightLineKm": null, "localityCount": 41 }
  ]
}
```

⚠ **`straightLineKm` is named for what it is.** Calling it `distanceKm` would let an admin read it as
road distance and decline — or approve — on a number that is 7% optimistic. FR-023 exists because the
zone check that preceded it said "a shop is nearby" while meaning **98 km**; replacing one misleading
signal with another would be worse than leaving it alone.

⚠ **`null` means "no coordinate", and the console MUST render it as such** — never as `0`, never as a
blank cell that reads as "close". `localityCount` is beside it so a centroid over 41 places across three
states is visible as the nonsense it is (0872, R1b).

### Refusals

| Condition | Status |
|---|---|
| Approve/decline a declaration not `pending` | `409 not_pending` |
| Decline with no reason | `422 reason_required` (FR-024 — the shop must be able to read *why*) |
| Revoke one not `approved` | `409 not_in_force` |
| Approve when the shop already has one approved | ⚠ handled by superseding in the same transaction, not refused — see below |

⚠ **Approval is two writes in one transaction**: the previously approved row → **`superseded`** (not
`revoked` — a shop must be able to tell "an admin withdrew this" from "our update went live"), then the
pending row → `approved` with `supersedes_id` pointing at it. The partial unique index
`shop_sameday_one_in_force_uq` makes a non-transactional version fail loudly rather than produce two
in-force declarations. **This is 022's `23505` lesson**: a partial unique index is not deferrable, so
ordering inside the transaction is load-bearing — clear the old before setting the new.

---

## C. Shop — a shop's own declaration (`apis/edge-api/shop`, shop pool)

Authz: `shop_manager` at an **active** shop (007's gate). ⚠ `shop_staff` may **read** but not submit —
a standing commitment about what the shop can physically do is a manager's call.

| Method | Path | Purpose | FR |
|---|---|---|---|
| `GET` | `/shop/v1/delivery-sameday` | In-force + pending + last decision | FR-019 |
| `PUT` | `/shop/v1/delivery-sameday` | Submit a declaration (creates a **pending** version) | FR-014..FR-016 |
| `GET` | `/shop/v1/delivery-localities?q=alfred` | Locality picker | FR-016 |

⚠ **There is deliberately no `/shop/v1/delivery-pricing`, at any verb.** FR-008/SC-004 are satisfied by
the absence, and SC-004 is verified by **calling the admin pricing route with a shop token** and
confirming the gateway refuses it — not by checking the console has no button.

### `GET` response

```jsonc
{
  "canDeclare": true,
  "inForce":  { "offersSameday": true, "cutoffTime": "14:00", "areas": [...], "approvedAt": "…" },
  "pending":  { "offersSameday": true, "cutoffTime": "12:00", "areas": [...], "submittedAt": "…" },
  "lastDecision": { "status": "declined", "note": "Ballarat is 98 km away.", "decidedAt": "…" }
}
```

⚠ **`inForce` and `pending` are both present and both real** (FR-018). A single "current declaration"
field would force the API to choose which truth to tell, and whichever it chose the other would be
invisible — the shop would either think a pending edit was live or think an approved one had been lost.

### Refusals

| Condition | Status | Note |
|---|---|---|
| Shop has no `postcode` | `422 shop_location_required` | ⚠ FR-020. `canDeclare:false` on the read carries the same reason so the console can explain **before** the operator fills a form. |
| Shop's postcode has **no centroid** | `422 shop_location_unmappable` | ⚠ Its own refusal, because a shop *with* a postcode passes the check above and then produces `straightLineKm: null` for **every** area — so FR-023's entire purpose evaporates silently at approval time. This is 031's live 3001 case (a postcode with no localities) reaching a second surface. |
| An area postcode matches no locality | `422 unknown_postcode` | 031's 3001 lesson on a second surface. |
| `offersSameday: true` with no areas | `422 areas_required` | An empty coverage list is a declaration that means nothing. |
| `offersSameday: true` with no cutoff | `422 cutoff_required` | ⚠ FR-030. "Same-day, no cutoff" is a promise nobody can keep, and it makes the withdrawal rule undecidable. |
| `offersSameday: false` with areas or a cutoff | `422 areas_not_applicable` | Two contradictory statements in one body. |
| A pending declaration already exists | replaced in-place (no refusal) | ⚠ The pending row is superseded; the **approved** one is untouched. |
| Any attempt to set a status | field ignored, never honoured | FR-021 — a shop cannot approve itself. |

⚠ **The area picker MUST disclose what a postcode covers**, exactly as 031's console does for admins:
choosing "Alfredton" commits the shop to all **20** Ballarat localities. The response carries
`localityCount` and the sibling place names so the console can say so before the shop confirms.

---

## D. Quoting — the hot path's behavioural contract

⚠ **No customer-facing DTO changes.** `core-api`'s quote response keeps its shape; only the values move.
That is the property that keeps `customer-web` and both mobile apps out of this slice.

### Same-day is offered for a package iff **all** hold

1. the fulfilling shop has an **`approved`** declaration with `offers_sameday = true`; **and**
2. the destination postcode is in that declaration's areas; **and**
3. now — in **`Australia/Melbourne`**, not UTC and not the device clock — is before the declaration's
   cutoff; **and**
4. ⚠ the destination postcode is **still serviced at all** (it is in some delivery zone).

⚠ **Term 4 is not redundant** (FR-030a). An approval is a statement about a *shop's* reach, not a grant
of serviceability. If an area is later removed from every zone, an approval covering it would otherwise
keep producing same-day offers into a place the platform no longer serves — the approval outliving the
service it depends on, silently. This is the spec's "a shop declares an area, then it is removed from
every zone" edge case, and it is the one term a reader is most likely to think unnecessary.

⚠ **Zone membership is not evidence FOR same-day** (FR-029) — it is only a precondition. A shop sharing
a zone with the shopper grants nothing; that is the rule being replaced. The `delivery_offering`
same-day rows are deleted so the old predicate has nothing to read.

### Fee for a package

```
distanceKm = greatCircle(centroid(shop.postcode), centroid(destination.postcode))   // ⚠ null-able
weightKg   = Σ (line.quantity × product.weight_grams) / 1000
fee        = min(rule.maxAmount,
                 roundUp(rule.base + band(distance) + band(weight), rule.roundingStep))
```

**Total-function requirements** — each is a test, not a comment:

| Input | Result | FR |
|---|---|---|
| Distance beyond the last band | last distance band | FR-011 |
| Weight beyond the last band | last weight band | FR-011 |
| Either postcode has **no centroid** | ⚠ **furthest** band — never zero | FR-038 |
| A product with an assumed weight | priced at the assumption | FR-037 |
| A rule with `status = 'disabled'` | that method is not offered at all | FR-007 |
| Fee exceeds `maxAmount` | capped, and a metric counter increments | FR-012, R9 |

### What must not appear anywhere in a customer response

⚠ `straightLineKm`, `shopId`, `shopPostcode`, `weightGrams`, band identities, rule identities.
**SC-005 is verified by asserting on the serialised JSON**, not by reading the struct — 021 shipped a
defect in the mirror direction (`json:"-"` hid a field from the customer *and* from the platform's own
persistence, and checkout intent had never completed).

### Unchanged, and proved unchanged

- `order_package_delivery.delivery_fee_amount` still captures the quoted fee at intent time → **FR-010
  holds with no new code**, and a test must pin it (R8).
- ⚠ **All three methods are now priced by the rules.** `delivery_offering.price_amount` is **dropped**
  (R3a) — `delivery_offering` retains only the window, the lead time and whether a leg is offered.
  Leaving the column would have given standard delivery **two live fee sources**.
- Every existing `checkout` and `storefront` test passes **unmodified**, ⚠ **except the same-day
  eligibility assertions in `delivery_test.go`**, which encode the rule FR-029 deletes and are a named,
  expected delta. R8 lists the exact groups. Anything outside them needing a change is a signal to
  re-read the design, not to update the test.

---

## E. Shared types (`packages/shared-types/src/delivery-pricing.ts`)

`DeliveryPricingRuleDTO`, `DeliveryPriceBandDTO`, `SamedayDeclarationDTO`, `SamedayAreaDTO`,
`DeclarationDecisionDTO`.

⚠ **These are consumed by TypeScript only** — both consoles and both cold-path services. **No Kotlin is
generated**, because no mobile surface touches this feature. ⚠ 030 nearly shipped a DTO that generated
nothing because it was declared outside the aggregator the generator walks, and `cm-contract-check`
passed trivially. **Here the correct answer is genuinely "no Kotlin"** — and the tasks must say so
explicitly, so a later reader does not "fix" its absence.

⚠ Money crosses the wire as a **decimal string**, matching every existing money DTO on this platform.
027 shipped a defect from the mirror case: Kotlin serialised an integer as `1.0` and Go's `encoding/json`
refused it. Strings sidestep both float drift and integer-shape mismatch.
