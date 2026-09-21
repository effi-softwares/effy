# Contract — Fleet: driver clearances and coverage (062)

**Service**: `apis/edge-api/fleet` · **Shared types**: `packages/shared-types/src/driver.ts`
(back-office only; not in the KMP driver contract aggregator).

**Authorization** — unchanged from 056/061, enforced per route by the gateway authorizer:
- **Read** = any active back-office staff member, **including `csa`**.
- **Mutate** = `admin` / `manager` only.
- ⚠ `edge-fleet`'s `config.contract.test.ts` asserts the back-office authorizer **exhaustively over
  the real `serverless.yml`**, so a new route added without one fails the suite rather than quietly
  becoming public.

⚠ **No money, no PII, no geography** in any payload. A clearance is permission; it carries none of them.

---

## A. Clearances — NEW routes

| Method | Path | Gate | Purpose |
|---|---|---|---|
| `GET` | `/fleet/v1/drivers/{driverId}/capabilities` | read | everything this driver is cleared for (FR-007) |
| `POST` | `/fleet/v1/drivers/{driverId}/capabilities` | mutate | grant one clearance (FR-003) |
| `DELETE` | `/fleet/v1/drivers/{driverId}/capabilities/{capabilityId}` | mutate | revoke one clearance (FR-003) |

**3 new functions → `edge-fleet` goes 19 → 22.** Comfortably inside the budget that forced the
service's creation (research R1).

### Payloads

```
DriverCapability {
  id · function: 'collection'|'delivery' · method: 'standard'|'same_day'
  zoneId: string | null        ⚠ null = EVERY ZONE, including zones created afterwards
  zoneName: string | null      ⚠ null for an every-zone grant; never a fabricated "All zones" string
  grantedAt
}

GrantCapabilityRequest { function, method, zoneId: string | null }
```

⚠ **`zoneId: null` is the wire's "every zone", and the console must send it deliberately** — not as a
missing key. A key absent and a key present-with-null must not be conflated, or "everywhere" becomes
indistinguishable from "the operator forgot to choose".

⚠ **`zoneName` stays null for an every-zone grant rather than carrying a label.** The label is
presentation, and a server-supplied "All zones" string would be a second place the concept is named —
the console renders it from `zoneId === null`.

### Refusals

| Situation | Refusal | Requirement |
|---|---|---|
| unknown `function` or `method` | `422` naming the field and the allowed values | FR-001 |
| `zoneId` names a zone that does not exist | `422` on `zoneId` | — |
| `zoneId` names a **disabled** zone | `422` saying the zone is disabled | R2/§1 |
| driver not found | `404` | — |
| **granting a clearance already held** | **`200`/`201`, NOT an error** | **FR-005** |
| **revoking a clearance not held** | **`204`, NOT an error** | **FR-006** |

⚠ **The last two are requirements, not leniency.** Two operators granting the same clearance at the
same moment must both succeed — the outcome is correct either way, and an error there would be a
refusal with nothing to fix. This is why no optimistic-concurrency token appears on these routes
(research R6), and it is a **deliberate difference from 061's vehicle edit**, which does carry one
because it replaces scalar fields where last-writer-wins loses information.

---

## B. Coverage — NEW route

| Method | Path | Gate | Purpose |
|---|---|---|---|
| `GET` | `/fleet/v1/coverage` | read | every zone that cannot be served, and why (FR-016) |

**1 new function → `edge-fleet` 22 → 23.**

```
CoverageGap {
  zoneId · zoneName
  function: 'collection'|'delivery' · method: 'standard'|'same_day'
  reason: 'no_driver_cleared' | 'all_cleared_unavailable'
  clearedDriverCount: WireInt        ⚠ 0 for no_driver_cleared; >0 for all_cleared_unavailable
}
CoverageResponse { gaps: CoverageGap[] }
```

⚠ **A covered (zone, function, method) emits NO ROW** (FR-019). The response is a list of problems, not
a matrix with a status column — a screen that lists everything and colours the bad ones is a screen an
operator has to scan.

⚠ **Only the work a zone can actually receive is enumerated** (research R3). Same-day appears only for
zones whose `sameday_eligible` is true; otherwise "nobody is cleared for same-day in Ballarat" would be
a permanent, unfixable row in the one view whose purpose is to be actionable.

⚠ **`clearedDriverCount` is what makes the two reasons actionable** — `0` means grant somebody a
clearance; `>0` means the people who have it cannot work today, and the fix is in the readiness view.

---

## C. Existing payloads that change

`AdminDriverProfile` gains `capabilities: DriverCapability[]` (FR-007).

`AdminDriverListItem` gains a **summary**, not the full set (FR-014):
```
capabilitySummary { total: WireInt, coversEveryZone: boolean, functions: ('collection'|'delivery')[] }
```
⚠ **A register does not need every grant**, and shipping them all would put an unbounded array on every
row of a paged list.

⚠ **`DriverBlockedReason` LOSES `no_zone`** (FR-025) and gains `no_capabilities`.
This is an enum **narrowing** — the mirror of 061's widening, and **not symmetrical**. Removing a member
makes every exhaustive `Record<>` over it *over*-specified, which TypeScript reports as an excess
property, so the compiler helps. But **stored data and test fixtures carrying `no_zone` must be found
by hand** (research R5).

---

## D. What this contract does NOT add

No task, round, assignment or dispatch interface (**FR-026**) · no change to how zones are defined,
listed or scoped (**FR-027**) · no geography of any kind · no driver-app surface — a driver does not
grant their own clearances · no customer-facing surface.
