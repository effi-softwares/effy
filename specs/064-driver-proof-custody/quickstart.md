# Quickstart — 064 Driver Proof of Delivery & Custody

How to prove this slice works. Every section is a walk a person does; nothing here is satisfied by a
green test suite. ⚠ **039 shipped four live defects with a fully green suite**, and 063 shipped a
scheduled handler that never ran once — both caught only by looking.

## Prerequisites

```bash
# 1. Migration (operator runs; Claude never applies)
make db-up ENV=dev

# 2. ⚠ DEPLOY ORDER MATTERS — fleet BEFORE driver.
#    fleet creates the hub_checkin stop; driver serves it. The reverse gives a driver a round
#    whose final stop does not exist yet, which looks exactly like the defect this slice fixes.
make edge-deploy SERVICE=fleet ENV=dev
make edge-deploy SERVICE=driver ENV=dev

# 3. Infrastructure — the S3 lifecycle and the two alarms
make apply ENV=dev

# 4. Console + app
git push          # Amplify deploys back-office
# rebuild driver-mobile in Xcode / Android Studio
```

Starting state: a driver on duty holding a vehicle, a same-day round planned, packages checked in at
the hub. `db/scripts/reset-orders-dev.sql` gives a clean slate.

---

## W1 — A delivery completes with a photograph (US1, SC-001, SC-002)

Open a same-day drop, choose **Photo**, capture, submit.

**Expect**: the drop goes delivered, and — the part that has never happened on this platform —
the order reaches `delivered` **without a back-office admin asserting it** (research R2).

```sql
SELECT p.method, p.captured_at, sf.status, pa.id IS NOT NULL AS arrival_recorded
  FROM public.delivery_proof p
  JOIN public.round_stop rs ON rs.id = p.stop_id
  JOIN public.round_package rp ON rp.stop_id = rs.id
  JOIN public.shop_fulfillment sf ON sf.id = rp.shop_fulfillment_id
  LEFT JOIN public.package_arrival pa ON pa.shop_fulfillment_id = sf.id;
```

⚠ **`arrival_recorded` must be true.** Order completeness keys on `package_arrival`, not on
`shop_fulfillment.status` — a proof that sets the status and skips the arrival row leaves the order
permanently incomplete, the customer never told, and **nothing fails** (R3).

Time it: SC-002 is 30 seconds from opening the drop screen, including the capture.

## W2 — Signature and contactless (US1)

Repeat with each. Contactless **must require a photograph** before it will complete (FR-002).

## W3 — ⚠ The `code` option is absent, and refused if forced (FR-003, R4)

The app must not offer **Code**. Force it past the UI:

```bash
curl -X POST .../driver/v1/delivery/drops/$DROP/proof \
  -H "Authorization: Bearer $DRIVER" \
  -d '{"method":"code","code":"123456","changeId":"'$(uuidgen)'"}'
```

**Expect 422 naming the deferral** — not a 500, and not silent acceptance. No delivery code exists
anywhere on the platform, so accepting this would compare a value to itself.

## W4 — A failed upload does not deliver anything (FR-006, SC-011)

Capture a photo with the network disabled after presign but before the PUT completes.

**Expect**: the drop is **not** delivered, and the driver is told the proof did not save. Upload
happens before the submission is queued precisely so this cannot go the other way (R9).

## W5 — Offline capture arrives exactly once (FR-008, SC-006)

Capture with connectivity on, kill the app before submission, restore connectivity, reopen.

**Expect** exactly one `delivery_proof` row. `UNIQUE (stop_id)` makes a second one unrepresentable.

## W6 — ⚠ Two devices, one completion (SC-007)

Sign the same driver in on two devices, open the same drop, submit both within a second.

**Expect**: one delivery, one arrival row, one customer notification. The second reports the
original outcome rather than failing.

## W7 — A failed delivery is recorded and never reports as delivered (US2, SC-003, SC-011)

Record each of the five reasons. `other` without a note must be refused.

**Expect**: the order does **not** become delivered; the package stays in the driver's custody.

## W8 — ⚠ A mixed order stays quiet until all of it arrives (R3)

Place an order with one same-day and one standard package. Deliver the same-day half with proof.

**Expect**: **no "your order has been delivered" message.** 053 fixed exactly this defect — the
driver path announced completion on a drop id while the standard half was still with a carrier.
Re-introducing a drop-scoped announcement reproduces it.

## W9 — ⚠ The hub check-in is reachable after the last shop stop (US4, SC-005)

The defect found live on 2026-09-21. Complete every shop stop, **leave the run screen entirely**
(go off duty and back on), reopen the app.

**Expect**: the hub check-in shown as outstanding work with a count, reachable. Previously both
routes into the round vanished at exactly this moment and a driver was left holding thirteen
packages with no way back in.

Also check the **run detail**: the hub stop must **not** appear as a shop stop with empty identity
(R11).

## W10 — A shift cannot end silently while holding packages (FR-018, SC-010)

Collect packages, then try to go off duty.

**Expect**: an itemised statement of what is held, before the shift can end. 056 found that standing
a driver down could strand physical goods permanently and invisibly.

## W11 — Back-office sees the exceptions (US3, SC-003)

**Expect**: every failure listed with reason, note, driver, order, destination and time, and packages
in a van distinguished from packages back at the hub. A `csa` can read but not resolve.

## W12 — ⚠ Archived proof reads back identically (SC-012, FR-025)

The one that cannot be faked. Against an object older than 90 days — or one whose storage class has
been set by hand to test it:

```bash
AWS_PROFILE=ef aws s3api head-object --bucket effy-dev-product-media \
  --key "proof/<...>" --query 'StorageClass'     # expect GLACIER_IR
```

Then **open it in the console**. It must render with no restore step and no waiting. GLACIER_IR
serves through the ordinary API in milliseconds; a colder tier would require an asynchronous restore
and would fork every read path (R5).

⚠ **An archive nobody has read back is not an archive, it is an assumption.**

## W13 — ⚠ The lifecycle rule did not touch the product catalogue

```bash
AWS_PROFILE=ef aws s3api get-bucket-lifecycle-configuration --bucket effy-dev-product-media
AWS_PROFILE=ef aws s3api head-object --bucket effy-dev-product-media \
  --key "products/<...>" --query 'StorageClass'   # expect STANDARD / absent
```

**Expect**: exactly one rule, filtered to `proof/`, with **no expiration of any kind**, and product
media untouched. An unscoped transition would push the live catalogue into an archive tier where
every storefront read still works and silently bills a retrieval fee per page view.

## W14 — Nothing carries a location or PII (FR-028)

```bash
make check-no-phantm
grep -rn "lat\|lng\|latitude\|longitude" apis/edge-api/driver/src/proof/   # expect nothing
```

Sweep the telemetry payloads and logs for an address, a recipient name or a media URL.

---

## Machine verification

```bash
pnpm -r typecheck
pnpm --filter @effy/edge-driver --filter @effy/edge-fleet --filter @effy/edge-shared test
CONTAINER_TESTS=1 pnpm --filter @effy/edge-driver test     # ⚠ Docker UP — 058's container tests
                                                           #   found 3 defects a green suite missed
pnpm --filter @effy/back-office test
pnpm --filter @effy/driver-contract check                   # ⚠ was already RED at HEAD before 063
cd apps/driver-mobile && ./gradlew :shared:assembleAndroidMain \
  :shared:compileKotlinIosSimulatorArm64 :shared:testAndroidHostTest
terraform -chdir=infra/envs/dev validate && terraform -chdir=infra/envs/dev fmt -check
```

⚠ **`pnpm -r test` can be green while `typecheck` fails** — vitest does not run `tsc`. 029 recorded
it, 059 hit it again. Run both.

## Sign-off

This slice is done when W1–W14 have been walked **by a person**, not when the suite is green.
**W1 is the walk that matters most** — it is the first time in this platform's history that a
delivery can be completed by the driver who actually made it.
