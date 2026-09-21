# Contracts — 064 Driver Proof of Delivery & Custody

Two audiences, two services, two authorizers. Every DTO named here **already exists** in
`packages/shared-types/src/driver.ts` unless marked NEW.

---

## Driver audience — `apis/edge-api/driver` (driver pool)

These are the three routes `route-inventory.guard.test.ts` currently lists in
`DEFERRED_TO_SLICE_D`. ⚠ **Each entry must be deleted from that list as its route is built** — the
guard's second test fails if a deferred route is one the app no longer calls, and it must not become
a list nobody prunes.

### `POST /driver/v1/delivery/drops/{dropId}/proof/presign`
`ProofPresignRequest` → `ProofPresignResponse`

Mints a presigned PUT under the `proof/` prefix via the shared `presignUpload`. Bytes never pass
through Lambda. ⚠ The prefix is **load-bearing**, not cosmetic: the S3 lifecycle rule that enforces
the 90-day retention is scoped to it, so an object written anywhere else is never deleted.

Refuses a content type outside `image/jpeg|png|webp` and a declared size over the shared ceiling,
field-scoped, via the existing `MediaValidationError` mapping.

### `POST /driver/v1/delivery/drops/{dropId}/proof`
`ProofRequest` → `ProofResponse`

⚠ **This route is the completion, not an annotation on one** (research R2/R3). In **one transaction**
it must:
1. insert `delivery_proof` (idempotent on `changeId`),
2. mark the stop `done`,
3. set `shop_fulfillment.status = 'delivered'` for that drop's packages,
4. insert `public.package_arrival` for each,
5. call `enqueueOrderDeliveredIfComplete(tx, orderId)` from `@effy/edge-shared`.

Steps 4 and 5 are the ones with no second chance: order completeness keys on `package_arrival`, so a
proof that skips it leaves the order permanently incomplete and the customer never told, with nothing
failing.

**Refusals**
- `method: "code"` → **422, `field: "method"`**, naming the deferral (FR-003, R4). Not a 500, and not
  silent acceptance.
- `photo`/`signature` with no `mediaKey` → 422 (also unrepresentable in the schema).
- a drop already proven → **the original outcome, not a second delivery** (FR-005).
- a drop belonging to another driver → **404, byte-identical to "no such drop"**, so the route is not
  an oracle for other drivers' work (052's rule).

### `POST /driver/v1/delivery/drops/{dropId}/fail`
`DropFailRequest` → `DropFailResponse`

Records an attempt. ⚠ Does **not** mark the order delivered, does **not** release the package — the
driver still has it (FR-011). `reason: "other"` without a note → 422.

---

## Back-office audience — `apis/edge-api/fleet` (back-office pool) — NEW

⚠ **In `fleet`, not in `driver`**, for 056's stated reason: a mis-wired route in the driver service
would hand a driver the ability to read and act on every driver's exceptions.

### `GET /fleet/v1/exceptions`
NEW `DeliveryExceptionListDTO` — reason, note, driver, order, destination suburb, time, and whether
the package is **back at the hub or still in a van** (FR-020). Any active staff may read (FR-021).

### `POST /fleet/v1/exceptions/{id}/resolve`
NEW `ResolveExceptionRequest` → sets `resolved_at`. Restricted to staff permitted to change an
order's fate (FR-021). The record stays retrievable afterwards (FR-022).

### `GET /fleet/v1/custody`
NEW `CustodyDTO` — every package currently in a driver's hands, with who and since when (FR-014).
⚠ Derived, never stored (R7).

---

## Contract changes to `packages/shared-types/src/driver.ts`

**One addition, and it is additive:**

```ts
kind: "collection_stop" | "delivery_drop" | "hub_checkin";   // TodayItemRef
```

⚠ **`ProofMethod` is NOT narrowed.** `"code"` stays in the type even though the service refuses it,
because removing it would be a breaking change to a method that is coming, and a narrowed type would
hide the deferral instead of stating it. The refusal is behaviour, pinned by a test; the type is the
eventual shape.

⚠ **`HistoryDropRow.proofCaptured` and `HistoryDetailDTO.proof` stop being hardcoded.**
`delivery.ts`'s header currently says they are always `false`/`null` "until Slice D" — this is that
slice, and the header must be corrected in the same change. A comment asserting a limitation that no
longer holds is the stale-claim shape 060 and 063 both record.

**Kotlin regeneration is mandatory.** ⚠ `driver-contract:check` was **already red at HEAD** when 063
began, because `1b386d8` changed the TypeScript and never regenerated. Regenerate and read the Kotlin
back — 027's R13 and 054 both record a generated file matching its source exactly while being wrong,
which a drift guard cannot see.

---

## Not in this contract

- Any customer-facing proof route (FR-027).
- Any route accepting or returning a coordinate (FR-028 — the platform captures no location).
- Any re-attempt or rebooking route (out of scope, unchanged from 063).
- Any correction or retraction of captured proof (out of scope).
