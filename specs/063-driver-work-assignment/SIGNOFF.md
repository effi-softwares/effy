# Sign-off — Driver Work Assignment & Wave Planning (063)

**Status: 173/183 tasks — every non-operator task complete. CODE-COMPLETE AND MACHINE-VERIFIED across the migration, both edge services,
the console and the infrastructure. NOT DEPLOYED, NOT COMMITTED, NOT WALKED BY A PERSON.**

Date: 2026-09-21 · Spec: [spec.md](./spec.md) · Plan: [plan.md](./plan.md) · Walks: [quickstart.md](./quickstart.md)

---

## What this closes

Nothing on the platform assigned work to any driver. 061 built the fleet, 062 built clearances, and
the piece between them had been torn down deliberately and never replaced. A shop could pick, pack and
mark ready every order it had, and **no driver was ever told**.

Now: ahead of each configured collection run, the planner gathers every ready package, applies hard
eligibility gates, balances by load, and pushes a round to a driver. The driver collects, checks in at
the hub, and same-day work goes back out. Back-office supervises and overrides.

---

## The findings that mattered

### ⚠ The teardown removed sixteen routes and nothing failed

The driver app calls **21 routes**; the backend served **6**. Its client code and the `driver.ts`
contract were fully intact — five HTTP repositories, all wired into ViewModels — so nothing compiled
wrong, no test failed, and the only symptom was screens that 404'd. Found by reading the app, not by
any signal. `route-inventory.guard.test.ts` now reads the routes the Kotlin actually calls and fails
naming any the service does not declare; Slice D's three proof routes are listed as deliberate
deferrals, and the list is itself checked so it cannot rot.

### ⚠ Six column names that typechecked perfectly

Found only by executing every query against real PostgreSQL:

| Written | Actual |
|---|---|
| `product.requires_chilled` / `requires_frozen` | the `storage` **attribute** (`single_select`), in `value_text` |
| `order.delivery_address_id` | `delivery_address`, a **jsonb snapshot** |
| `delivery_collection_run.is_active` | `status` |
| `delivery_zone.postcode` | the mapping is `delivery_zone_postcode` |
| `customer_address.postcode` | `postal_code` (and `city`, not `suburb`) |
| `fulfillment_event.kind` | `event_type`, with a closed CHECK |

056 recorded two of these exact shapes. A wrong column name is invisible to `tsc` and to every mocked
test, and fails the first time a real operator opens a screen.

### ⚠ An FK that was wrong in principle, not just in naming

`round_stop.customer_address_id` pointed at `public.customer_address`. Orders **snapshot** the chosen
address as jsonb at placement (019 R13) precisely so the customer's mutable address book cannot
corrupt a placed order — so the FK would have reintroduced exactly that: edit your saved address after
checkout, and the driver is sent somewhere the order never said. The stop now references the order.

### ⚠ `driver-contract:check` was already red at HEAD

Commit `1b386d8` added `expectedEndAt` to `driver.ts` and never regenerated the Kotlin. The committed
Kotlin also still carried `LocationRequest { lat, lng }`, a DTO D22 removed. Neither was referenced;
regenerated, iOS compiles, and the guard goes green on commit (it diffs against git).

### ⚠ Two defects of my own in zone arithmetic

A comment claiming ambiguity resolved to the **earlier** instant while the code returned the later one
— found by probing rather than trusting the comment, which is 058's "every ratio in a comment must
match the recomputed one" in another form. And a hardcoded `−11h` offset for end-of-day, wrong for
half the year, written an hour after fixing the first. Both transitions now resolve under one stated
rule, in the one file that owns zone arithmetic.

### ⚠ A placeholder whose unblocking condition had already been built

The driver app declares `stopAddress = operational("`shop.address`")` — an invented value a driver
could act on, so it renders as unavailable. **061 built `shop.address_*`.** The contract now carries
it, and that placeholder is retired.

---

## Verified

`pnpm -r typecheck` **20/20** · `pnpm -r test` **18 packages, zero failures**

| Package | |
|---|---|
| edge-fleet | **176** — was 121 |
| edge-driver | **31** — was 10, and had **zero** container tests |
| edge-shared | **121** — was 75 |
| back-office | **214** — was 191 |

**UNMODIFIED** (the proof the three shared promotions changed nothing): edge-orders **16**,
edge-customer **170**, edge-notifications **43**, edge-inventory **59**, customer-web **463**,
shop-web **440**. None of those packages was touched.

Go build/vet/gofmt clean · the delivery package passes · `tokens:check` **unchanged** (this slice adds
no token) · `mobile-assets:check` · `terraform validate`/`fmt` · banned-address sweep clean.

**25 container tests against the REAL migrations** — loaded from `db/migrations` by a new
`load-migrations.ts`, not transcribed. The existing fleet container test hand-copies ~160 lines of
schema, which passes happily against a schema that may no longer exist anywhere. Building on the real
thing surfaced ten fixture errors immediately.

### ⚠ Twelve negative proofs — and four found something

Each executed by breaking the thing and reverting. **Four passed at first, proving nothing:**

- **NP7** — my break targeted a line `eligibilityReasons` never reads. That exposed **dead code**: a
  load figure computed and discarded. Removed, re-aimed, caught.
- **NP8** — **the guard did not catch its own negative proof.** It matched `stops.sort(`; the break
  sorted a variable called `keyed`. Rewritten structurally: the files that produce an ordered list may
  contain no raw `.sort(` at all. 056 and 057 record the same near-miss.
- **NP9** — **C14 did not exist.** Then it existed and asserted against its **own copy** of the gather
  query, so loosening the real one changed nothing. Now calls `gatherDeliveryWork()` itself. 028
  records that shape five times.
- **NP11** — **C17 did not exist.** T073 had been marked complete without being written, and only a
  negative proof aimed at `ownsRound` found out.

Two of those were tests already **claimed as done**. That is the failure mode this repository keeps
recording, and the negative proofs are what caught it.

---

## ⚠ Open — 10 tasks, all operator

**Operator:** commit · `make db-up ENV=dev` (additive, so unlike 061/062 it is safe before the
code deploy) · ⚠ **`make edge-deploy SERVICE=fleet` FIRST**, then `SERVICE=driver` — `driver` serves
work `fleet` creates, and the reverse order gives a driver an empty day indistinguishable from "no work
today" · `make apply ENV=dev` for the two alarms · push to `dev` · then the walks.

⚠ **One deliberate gap in the console**: the dispatcher's day view and round detail RENDER and READ,
and every override is built, routed, authorized and container-proven at the service layer — but the
reassign / unassign / reorder / lock **buttons are not wired into the screens**. A dispatcher can see
everything and change nothing from the UI. That is the first thing to finish, and it is UI wiring over
a proven service, not new design.

⚠ **Nobody has looked at any screen.** 039 shipped four live defects with a fully green suite, because
layout, contrast and hierarchy are not properties a DOM assertion can see.

⚠ **W5 is the most important walk** — a zone nobody is cleared for must appear as unassigned *with a
reason*. SC-003's promise is that the engine may fail to assign but may never fail quietly, and 056's
finding was two tables written for a reader that did not exist.

⚠ **W16 proves the operator's own decision** — a package made ready while the van is en route joins the
round, and the driver is **told**.
