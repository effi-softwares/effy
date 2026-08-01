# Contract: Delivery Areas (031)

Binding on `apis/edge-api/admin/src/delivery/`, `packages/shared-types`, and
`apps/back-office/src/features/delivery/`. Four sections: the wire, the disclosure rule, the three
states, and what must not move.

⚠ **Every route here is back-office only**, behind the existing back-office authorizer, with the
delivery slice's existing authz: **read** = any active staff (incl. `csa`); **mutate** =
`admin`/`manager`. No new gate, no new pool.

---

## §1 — Routes

All under `/admin/v1/`, joining the ten delivery routes 021 already registers.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/delivery-localities?q=` | Find places an operator could mean |
| `GET` | `/delivery-localities/coverage?postcode=` | ⚠ **What else this postcode includes** — the data behind FR-006 |
| `GET` | `/delivery-zones/{id}/areas/{postcode}` | Everything one area gets, in one request (FR-022) |
| `PUT` | `/delivery-zones/{id}/areas/{postcode}` | Configure the area's service levels + fees |
| `POST` | `/delivery-zones/{id}/areas/{postcode}/not-served` | Record a deliberate decision not to serve |
| `GET` | `/delivery-health` | The three defect classes |

### `GET /delivery-localities?q=`

Returns `LocalityDTO[]` — ⚠ **the same type the shopper's search returns**, reused unchanged from
`@effy/shared-types` (Principle II). One table, one contract, two audiences.

**Not** a call to core-api's `/v1/storefront/localities`: `core-api` has no cloud deployment, so a
Lambda calling it would work locally and fail in dev (research R1).

### `GET /delivery-localities/coverage?postcode=`

```json
{ "postcode": "3350", "places": [ { "name": "Alfredton", "state": "VIC", "postcode": "3350" }, … ], "count": 20 }
```

⚠ **`count` is a required field even though the client could take `places.length`.** It is what the
disclosure sentence is built from, and a client computing it is a client that can render "1 other
place" when there are twenty because it paginated. See §2.

### `PUT /delivery-zones/{id}/areas/{postcode}`

The whole area's configuration in one request — a replace, not a patch, so a method omitted is a method
turned off rather than one left ambiguous.

```jsonc
{
  "serviceLevels": [
    { "method": "standard",  "enabled": true,  "feeAmount": "5.00", "leadDaysMin": 2, "leadDaysMax": 3 },
    { "method": "same_day",  "enabled": true,  "feeAmount": "7.00", "sameDayCutoff": "14:00",
      // ⚠ REQUIRED when same_day is being enabled and no shop shares the area's zone. Records that a
      // human was shown the problem and chose anyway (FR-018/FR-019).
      "noNearbyShopAcknowledged": true },
    { "method": "scheduled", "enabled": false }
  ]
}
```

**Responses**: `200` the updated area · `400` validation · `409` the postcode is not in this zone ·
`422` ⚠ **same-day enabled without the acknowledgement when no shop is in-zone**.

⚠ **`422`, not a silent accept.** A fee is a business choice the platform can absorb; **same-day is a
physical claim about time**. Letting it through unacknowledged is a promise broken at the moment the
shopper is most committed.

### `POST /delivery-zones/{id}/areas/{postcode}/not-served`

```json
{ "note": "No fulfilment capacity in the region until Q3." }
```

⚠ **This route does TWO things in ONE transaction**: it writes `decision='not_served'` **and removes
the postcode from the zone**.

Recording alone would change nothing. Serviceability is decided by zone membership, so a decision
written *beside* that membership leaves the storefront still answering "we deliver here" for an area an
admin has explicitly marked unserved — **the REGIONAL defect inverted, introduced by the feature meant
to prevent it** (FR-011a).

The decision **survives** the withdrawal — there is no FK to `delivery_zone_postcode`, by design — so
the console can still say who decided it, when and why (FR-011b), and re-adding the area surfaces that
history (FR-011c).

### `GET /delivery-health`

```json
{
  "unknownPlace":  [ { "zoneCode": "MEL-METRO", "postcode": "3001" } ],
  "unconfigured":  [ { "zoneCode": "REGIONAL",  "postcode": "3350" }, { "zoneCode": "REGIONAL", "postcode": "3550" } ],
  "emptyZones":    [ ]
}
```

⚠ **Run against today's data this returns 3350 and 3550 under `unconfigured`** — the live defect where
the storefront promises delivery checkout cannot quote. **That is the acceptance test for this endpoint:
it must find them now, and return empty once they are configured.** An endpoint that returns nothing on
day one has not been proven to work.

---

## §2 — The disclosure rule (FR-006)

**The single most important interaction in this feature, and the one most likely to be quietly
under-built.**

Serviceability is decided by **postcode**. Choosing one place makes every place sharing its postcode
serviceable. The admin must know that **before confirming**, not after an order arrives.

| The admin chooses | The interface must state |
|---|---|
| Alfredton VIC 3350 (20 places share it) | ⚠ "**This also serves 19 other places in 3350**" — with the list visible |
| Melbourne VIC 3000 (sole place) | "3000 covers only Melbourne" |
| any place, on **removal** | ⚠ "**Removing this stops serving all N places in 3350**" (FR-007) |

**Binding requirements on the implementation:**

1. The count and the list are **on screen at the moment of confirming**. ⚠ A tooltip, a hover, or a
   help link does not discharge FR-006.
2. `count` comes **from the server** (§1), never from `places.length` on a possibly-truncated list.
   ⚠ The sentence renders "**19** other places" from a `count` of 20 — the derivation is `count - 1`,
   stated here so the client is not left inventing it. The rule being protected is *"never measure the
   list you were handed"*, not *"never subtract"*.
3. The **removal** path carries the same disclosure. Removal is the more dangerous direction — it
   silently stops serving customers who were being served.
4. It lives in its own component with its own tests, so it cannot be refactored away by accident.

⚠ **SC-003 is an observer test with five admins** because "technically displayed" and "actually
understood" are different things, and only the second one prevents the defect.

---

## §3 — The three states

An area is in exactly one of these, always:

| State | Data | Shown as |
|---|---|---|
| **Configured** | a `served` decision and/or ≥1 active offering for the zone | what it gets |
| **Deliberately not served** | a `not_served` decision row | "not served — decided by X on Y", with the note |
| **Unconfigured** | ⚠ **no decision row and no active offering** | "not configured yet" — flagged |

⚠ **`unconfigured` is never a stored value.** It is the absence of a decision, and giving it a value
would create two ways to say one thing (see `data-model.md`).

⚠ **"Deliberately not served" and "unconfigured" must never render the same way.** They are the two
meanings that were fused into one absence, and fusing them again in the UI would undo the entire point
of the migration. **SC-006 is an observer test** for exactly this.

---

## §4 — What this contract forbids

- **Any change to `apis/core-api` — including a new test file there.** ⚠ Its `storefront` and `checkout`
  suites must pass **unmodified**, and `git diff --stat apis/core-api` must be **empty**. A core-api test
  edited during this slice is a design breach, not a test that needed updating — the same discipline that
  kept `ServiceabilityDTO` frozen in 030.

  ⚠ **This is why the SC-014 assertion lives in the ADMIN service**, over the same query that backs
  `/delivery-health`. An earlier draft placed it "beside 030's SC-002 coverage check", which is inside
  `apis/core-api` — so the guard and the assertion it guards contradicted each other, and the task that
  would have failed is the one proving this feature's motivating defect is fixed. One criterion, one
  home.
- **Any change to `delivery.ZoneForPostcode`.** It is the one predicate shared by the storefront's
  answer and checkout's `DestinationZone`, and it exists so the two can never disagree (025 FR-014b).
- **Any change to what a placed order costs.** A captured quote holds its own price (FR-014/FR-031).
- **A new delivery method** (FR-029). ⚠ **Asserted, not assumed**: the console's configurable method set
  MUST equal `delivery_offering`'s `method` CHECK set exactly. This feature is the first interface to
  expose all three together and introduces `scheduled` to a console that has never configured it —
  precisely where a fourth could slip in unnoticed.
- **Anything that lets a shopper infer which shop serves them** (FR-030) — including through a fee that
  varies by origin, which is precisely what the collapse removes.
- **A computed same-day radius.** ⚠ The platform has no routing capability and 030 rejected a
  third-party geocoder. Feasibility is shown as **"shops in the same zone"**, stated as exactly that.
  Invented precision on a promise is worse than an honest human judgement.
- **A postcode entering a zone with no warning when no place matches it** (FR-005) — the 3001 path.
  Warn and require confirmation; never silently accept, never hard-block.
