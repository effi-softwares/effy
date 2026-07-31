# Contract: Storefront Home (hot path) — banner extension

**Feature**: 028-mobile-home-merchandising | **Path**: hot (`core-api`) | **Auth**: none (public)

**Endpoint**: `GET /v1/storefront/home` — **existing**. This feature changes its **banner payload
only**. No new route, no new method, no auth change, no breaking field.

---

## What changes

`StorefrontHomeDTO.banners` today carries exactly one derived stub:

```json
{ "key": "welcome", "title": "Shop Effy",
  "subtitle": "Fresh groceries and everyday essentials, delivered.",
  "imageUrl": null, "href": "/search" }
```

It becomes **zero or more advertised promotions**, ordered by `position` then `createdAt`.

```json
{
  "banners": [
    {
      "key": "3f2a…",
      "title": "20% off your first grocery order",
      "subtitle": "Stock up on the basics",
      "imageUrl": "https://…presigned…",
      "href": "/search?sale=1",
      "code": "FIRST20",
      "terms": "On orders over $30",
      "target": { "kind": "sale" },
      "position": 1
    }
  ],
  "rails": [ … unchanged … ]
}
```

### Field rules

| Field | Rule |
|---|---|
| `key` | The promotion id. **Stable across reads** — the client uses it as a list key. |
| `title` | Never empty. The DB CHECK guarantees an advertised promotion has one. |
| `subtitle` | Nullable. |
| `imageUrl` | Presigned at read time, nullable. **Never a stored URL** — a stored URL expires. |
| `href` | Retained for `customer-web`. Mobile ignores it. |
| `code` | The code a shopper types in the cart. Nullable only in principle; in practice always present. |
| `terms` | **Server-composed** from `minimum_subtotal_amount`. `null` when the promotion has no minimum. Both surfaces render the same sentence because only one place composes it. |
| `target` | One of the closed `BannerTarget` set. An unrecognised value MUST render the banner non-tappable. |
| `position` | **Integer on the wire** — `WireInt` / `@asType integer`. See the warning below. |

### ⚠ `position` is the field most likely to break this feature

027's most expensive defect: Kotlin serialised a quantity as `Double`, the wire carried `1.0`, and
Go's `encoding/json` refused `1.0` into an `int`. **Every unit test passed**, because the fakes spoke
Kotlin at both ends and never crossed the wire; the bug was found by querying the database directly.

`position` is the same shape of field. It MUST be declared `WireInt` in
`packages/shared-types/src/storefront.ts` so the generated Kotlin cannot regress, and the **live**
quickstart walk is the only thing that actually proves the round trip. No unit test in either language
can.

---

## Empty and degenerate cases

| Case | Response |
|---|---|
| No promotion is advertised | `"banners": []` — **not** a placeholder. FR-035: the client shows nothing and the sections close up. |
| Promotion advertised but outside its window | Excluded. |
| Promotion advertised but exhausted | Excluded — the count comes from `promo_redemption`, never from a stored counter. |
| Promotion advertised but `status = 'disabled'` | Excluded. |
| Store has no products at all | `banners: []` and `rails: []`, as today. |

**The visibility predicate is defined once**, in [data-model.md](../data-model.md) §1, and implemented
as one SQL statement. It is not re-derived in the service.

---

## Backward compatibility

Every new field is **optional**. `apps/customer-web` reads `BannerDTO` today and continues to
typecheck and render without an edit; it simply ignores `code`, `terms`, `target` and `position` until
its own slice adopts them.

**⚠ One behavioural change is not backward compatible and is intended**: `customer-web` currently
always receives the `"welcome"` banner and will now receive `[]` whenever no promotion is advertised.
Any web layout that assumes at least one banner must handle the empty list. This is called out here so
it is found at planning time rather than in production.

---

## Performance

The banner read adds **one query** to a Home read that currently issues up to seven (newest, on-sale,
rail candidates, plus up to four category reads), inside a **3-second** `readTimeout`.

- The outer set is bounded by the number of *advertised* promotions — realistically single digits.
- Exhaustion is a correlated subquery over `promo_redemption`, indexed by `promo_code_id`.
- Ordering is served by the partial index `promo_code_advertised_idx`, so no sort is needed.

⚠ **Recorded for whoever comes next**: 027's first working cart write timed out at ~14 round trips to
Sydney RDS inside a 4-second budget. One added query is comfortably within budget; a second and a third
added without measuring are how that budget gets spent. Measure before adding.

---

## Verification

| Check | How |
|---|---|
| Contract shape matches the generated Kotlin | `make cm-contract-check` (fails on drift) |
| Go composes the predicate correctly | `go test ./internal/features/storefront/...` — window, exhaustion, disabled, and opt-out cases |
| The wire round trip actually works | **Live only** — quickstart §3. The one thing tests cannot prove. |
| Empty case returns `[]` not a stub | Go unit test + the live empty-store walk (SC-012) |
