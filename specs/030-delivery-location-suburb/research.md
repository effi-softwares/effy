# Research: Suburb-Aware Delivery Location (030)

Decisions taken before implementation, with the alternatives that were rejected and why. Anything
marked ⚠ is a risk carried into the slice, not a settled question.

---

## R1 — Where the locality data comes from

**Decision**: an **open, redistributable Australian postcode/locality dataset committed to the repo**
as the authored source, under `db/reference/au-localities.csv`, with its licence and provenance
recorded beside it in `db/reference/README.md`.

The dataset must supply, per row, at minimum: locality name, state/territory, postcode. Roughly
16 000–18 000 rows. Candidates evaluated:

⚠ **T002 WAS RUN 2026-08-01 AND THE HEADLINE CHOICE FAILED.** The table below is corrected with
what was actually verified, not what was assumed. The original draft named the community
`australian-postcodes` dataset as "Chosen — permissively licensed". **It has no licence at all.**

| Source | Licence — VERIFIED | Verdict |
|---|---|---|
| **`matthewproctor/australianpostcodes`** (the original choice) | ⚠ **NONE.** GitHub API reports `"license": null`; there is no `LICENSE` file (404); the README states no terms. | **REJECTED.** No licence is not the same as a permissive one — it means all rights reserved by default. It cannot be committed to this repo. |
| **Geoscape G-NAF** via data.gov.au | Tagged **CC BY 4.0** by data.gov.au's own API — but the package **also ships an "End User Licence Agreement" PDF and an "Open G-NAF Use Restriction" fact sheet**. | ⚠ **UNRESOLVED — needs those two PDFs read.** A CC BY tag sitting next to a EULA and a use-restriction sheet is exactly the ambiguity T002 exists to surface. Also **1.7 GB**, from which we would derive ~17k distinct triples. |
| **ABS ASGS "Suburbs and Localities" (SAL)** | **CC BY 4.0**, clean and unambiguous (verified on the ABS site). | Usable for **names + states**, but ABS localities are **not postcode-based** — it cannot supply the postcode on its own, so it needs a second source and a join. |
| **A commercial geocoding API** | n/a | Rejected by the spec (Out of Scope) and by Principle II. |

⚠ **There is no drop-in replacement.** The original plan assumed a single small file with a permissive
licence and all three columns. That file does not appear to exist under terms we can rely on. Every
remaining path costs more than R1 assumed — this is a real Phase 1 cost increase, not a detail.

**Rationale**: FR-002 requires whole-of-Australia coverage. Only a real dataset satisfies that;
nothing can be hand-authored. Owning the data locally also keeps the lookup on our own latency and
availability budget, which FR-013's "we could not check" path depends on.

---

## R2 — How the data gets into the database

**Decision**: **schema by migration, rows by an idempotent loader command.**

- One forward-only Goose migration creates `public.locality` (schema only — see `data-model.md`).
- A new Go command `apis/core-api/cmd/load-localities` reads the committed CSV and upserts it.
  Operator-run, exactly like `create-first-admin`, via `make load-localities ENV=dev`.

**Alternatives rejected**:

- **A migration containing 16 000 `INSERT`s.** Keeps "the database state is the migrations" literally
  true, which is attractive. Rejected because refreshing the data — an ordinary operations task
  (FR-004) — would then mean a new ~2 MB migration every time, and forward-only means they all stay.
  A reference table's *contents* are not schema history.
- **Seeding from application startup.** Rejected outright: `core-api` must not mutate data on boot,
  and a cold start would race itself across tasks.

⚠ **The loader must be idempotent** (upsert on the natural key, see R2a) because it will be re-run on
every refresh and in every environment. `create-first-admin` set this precedent and it held.

### R2a — The natural key is the triple

`UNIQUE (name, state, postcode)`. Not `(name, state)` — a locality legitimately spans several
postcodes. Not `postcode` — a postcode legitimately covers several localities. The triple is the only
thing that identifies a place, which is the same fact FR-008 states to the shopper.

---

## R3 — Which backend path (Principle III)

**Decision**: the locality lookup is a **hot-path** read — `core-api`, `features/storefront`,
`GET /v1/storefront/localities`.

It is a public, guest-reachable, latency-sensitive customer read that fires **while the shopper is
typing**. That is the hot path's definition. It also belongs beside `GET /v1/storefront/serviceability`
because the two are halves of one interaction, and 025 already put that one there.

**The account-seeding read adds no endpoint at all.** The default address is read from the **existing
cold-path** `GET /customer/v1/addresses` (022). This is not an exception to Principle III — 011's
routing law puts customer profile/account data on the cold path and commerce on the hot path, and an
address book is account data. Seeding reads it once per session, not per keystroke.

⚠ **`core-api` has no cloud deployment** (it is local-Docker-only by standing decision). So the web
half of this feature works locally against `make core-run` and its go-live rides the hot path's own
deployment slice — the same constraint 025's serviceability answer already lives under. This is not
new debt introduced here, but it does mean SC-015 is provable locally and not in dev-cloud.

---

## R4 — The endpoint shape, and why `ServiceabilityDTO` is NOT touched

**Decision**: **one new endpoint**, `GET /v1/storefront/localities?q=<text>`, returning a bounded list
of `{name, state, postcode}`. `ServiceabilityDTO` keeps its exactly-two-field shape, untouched.

This was the closest call in the slice. The tempting design is to have serviceability echo back the
place it answered about — one round trip, one source of truth for the display. It was rejected:

- `storefront/serviceability.go` carries an explicit prohibition on adding fields to
  `ServiceabilityResult`, backed by a reflection test. The prohibition exists to stop the up-front
  answer growing a delivery fee, a window, or a zone name (025 FR-014a / FR-006).
- A locality name is arguably *not* what that rule is protecting against — it is the shopper's own
  input echoed back, not a fulfilment fact. But **the client does not need the echo**: when the
  shopper picks from the list, the client already holds the triple. Only the bare-postcode path needs
  a name, and the same `localities` endpoint answers that (`?q=3121`).
- Given a design that does not need the field, widening a deliberately frozen contract to save one
  request is a bad trade. **The freeze holds, and no 025 artifact needs amending.**

### R4a — One endpoint serves both input kinds

`q` accepts either. Digits are matched against `postcode`, letters against a name prefix. This keeps
the client from having to classify input before it asks, and it means the bare-postcode display
(FR-034) needs no second endpoint.

**Cacheable**: `Cache-Control: public, max-age=86400`. Locality data changes at the pace of postal
administration. It discloses nothing about the caller and nothing about where Effy fulfils from —
the same reasoning that made `serviceability` cacheable, only more so.

---

## R5 — Matching semantics

**Decision**: **case-insensitive prefix match on the locality name**, `LIMIT 8`, ordered
`name, state, postcode`.

- **Prefix, not substring, not fuzzy.** FR-009 asks for "any leading portion". Prefix is what a
  shopper means when they type "Richmo", it is index-supported, and it produces no surprising
  matches. `pg_trgm` is already installed (016) if fuzzy matching is ever wanted, but adding it now
  would mean ranking, which means tuning, which is scope this slice does not need.
- **8 results.** FR-010 wants a scannable list; on a phone eight rows is roughly one comfortable
  sheet-height without scrolling past the keyboard. More than that and the shopper should type
  another character.
- **Deterministic ordering, and NOT by serviceability.** FR-011 forbids the list hinting at the
  answer. Ordering served-first would both pre-empt the verdict and turn the endpoint into a coverage
  enumerator. Alphabetical is boring, which is the point.
- **Minimum 2 characters** (FR-009). One character matches thousands of rows and answers nothing.

⚠ **The index must match the query.** A `lower(name) text_pattern_ops` B-tree serves
`lower(name) LIKE 'richmo%'`; a plain B-tree on `name` does **not** serve it under a non-C collation.
Getting this wrong produces a correct feature that sequentially scans 18 000 rows on every keystroke,
and nothing in the test suite would notice.

---

## R6 — Debounce, cancellation, and staleness

**Decision**: **debounce typing, and discard answers for input the shopper has moved past.**

Both clients already own the second half of this: `recordServiceability` / `applyAnswer` drop a
verdict whose postcode no longer matches (025). The same rule now has to apply one level earlier, to
the *suggestion list* — type "Rich", then "Richm", and the slower "Rich" response must not repaint
the list under the shopper's finger.

Debounce interval: **200 ms**, on both surfaces. Short enough to feel live, long enough that a
five-character suburb costs one request rather than five.

---

## R7 — The web entry surface, inside the byte budget

This is the hardest constraint in the slice, and it is entirely the web half's.

**The situation**: `DeliveryAffordance` is a client component rendered directly in `app/(shop)/layout.tsx`,
so it lands in the shared chunk of **every** public route. The budget is **174 KB** and measured
headroom is — **measured 2026-08-01 on `02512f2`** — **0.2 KB on `/cart`** and **0.5 KB on `/search`**
(all six routes green: 172.2 / 170.1 / 173.5 / 172.3 / 173.8 / 171.0). ⚠ An earlier draft of this
section said 2.1–5.5 KB, taken from the budget script's 026-dated header; 027 and 029 spent it. A
typeahead is small, but "small" is **an order of magnitude larger** than the remaining headroom.

**Decision — three rules, in order:**

1. **Split the component.** The always-loaded part stays what it is today: the header button, the
   `<dialog>` shell, and the store subscription. The **panel body** — the input, the fetch, the
   debounce, the list — moves to a separate module loaded with `next/dynamic` on **first open**.
   FR-043 then holds literally: a shopper who never opens it downloads none of it.
2. **No new dependency, and no combobox library.** The guest-path quarantine
   (`.dependency-cruiser.cjs` → `no-heavy-ui-deps-on-guest-path`) forbids `radix-ui`, `sonner` and
   `vaul` here, and its comment already names the delivery picker as a native-`<dialog>` case. The
   list is a hand-rolled `role="listbox"` / `role="option"` with roving `aria-activedescendant`,
   arrow-key and Enter handling — perhaps 60 lines, zero dependencies (FR-045, FR-051).
3. **Measure, then decide.** `pnpm size` runs the gate. If the split still breaches FR-044 on any
   route, the correct response is FR-045's: **reduce the web presentation** — not raise the limit and
   not add a dependency.

⚠ **This is a real risk, not a formality.** `next/dynamic` is not free either, and the affordance's
own shell may grow. The measurement task is sequenced *before* the polish tasks so a breach is found
while there is still time to reduce.

⚠ **The dataset must never reach the client** (FR-046). Every suggestion is a server round trip. This
is stated because "just ship the 18k rows and filter client-side" is a genuinely tempting design that
would be instant, offline-capable, and would add roughly 400 KB to a 174 KB budget.

---

## R8 — Seeding the web location without spending client bytes

**Decision (REVISED 2026-08-01 after the T027a measurement)**: a **server-rendered island** under
`<Suspense>` that reads the session and the default address and **passes it as a prop into the
existing `DeliveryAffordance` client component**.

⚠ **The original design here was a separate `DeliverySeedClient` module** — a tiny client component
rendering no markup whose only job was to call `seedFromAccount(...)` on mount. It does not survive
contact with the real budget: that module is **always-loaded** (it must run on mount to be useful),
and `/cart` has **0.2 KB** of headroom. A new client-component boundary costs more than that before it
does anything. A prop on a component that already ships costs approximately nothing.

- The `(shop)` layout **must not** call `cookies()` or `headers()` — that is guarded, and breaking it
  silently converts every public page from a cached static shell to a per-request render. An island
  is exactly how `UserIsland` already solves the same problem, so this follows an established
  pattern rather than inventing one.
- A **guest renders an empty island** — no account read, no address fetch, nothing (US2 scenario 8).
- The client half is a few hundred bytes and is *not* lazy-loadable (it must run on mount), so it is
  measured as part of R7's budget.

**Alternative rejected**: fetching the address from the existing client-side auth context. It would
have cost a client-side round trip on every page load for signed-in shoppers and would have run after
first paint — so a returning shopper would watch "Set location" flip to their suburb, which is worse
than either end state.

---

## R9 — The mobile bottom sheet

**Decision**: Material 3 **`ModalBottomSheet`**, already available via
`org.jetbrains.compose.material3:material3:1.11.0-alpha07` — no new dependency (FR-026).

⚠ **CORRECTED 2026-08-01 (analysis pass).** This section originally framed `ModalBottomSheet` as an
unproven experimental API needing a blocking iOS spike before Phase 3. **That premise was wrong.** It
is already used in **three** `customer-mobile` screens — `CheckoutScreen.kt`, `AddressBookScreen.kt`
and `AddressFormSheet.kt` — shipped in 019/022/023, which CLAUDE.md records as live-validated
end-to-end (a real Stripe test-card checkout runs through `CheckoutScreen`). `AddressFormSheet` is a
**text-input form inside a sheet**, so soft-keyboard behaviour on iOS is already exercised on a
shipped path.

Gating all of Phase 3 on re-proving a component the app already depends on would have spent an
operator device session on a settled question. T026 is downgraded to a non-blocking confirmation.

**What is genuinely novel**, and the only part worth watching: a **scrolling result list** inside the
sheet, compressing as the soft keyboard opens. Neither existing call site has one. Confirm it when
the sheet is built (T035), not before.

**Fallback if it does misbehave**: a sheet composed from existing primitives — a full-screen `Box`, a
scrim, an offset `Surface`, and an `animateFloatAsState` slide-in. More code, no new dependency, fully
under our control.

⚠ The lesson this section originally invoked (024's compiled-but-uninflatable drawable) is still the
right lesson — it was simply applied to the wrong component. It belongs to **T027**, the byte
measurement, which is the real gate.

**Keyboard**: the sheet must resize rather than be covered when the soft keyboard opens — the input
sits at the top of the sheet and the list below it, so the list is what gets compressed. This is the
detail most likely to be wrong on one platform and right on the other.

---

## R10 — Seeding the mobile location

**Decision**: seed from a **session-state observer in the app container**, not from a screen.

When `SessionManager` transitions to `Authenticated`, a small coordinator lists addresses (cold path),
finds `isDefault`, and calls `DeliveryContextStore.seedFromAccount(...)`. Doing it in `HomeScreen`
would mean it never runs if the shopper's first stop is another tab, and would re-run on every
recomposition.

`seedFromAccount` already exists, already guards "only when nothing is set" (FR-019), and is already
unit-tested. **It has never had a caller on either surface** — this slice is where 025's FR-013
account half finally gets wired, three features late.

⚠ **Its signature does change**, contrary to an earlier draft of this section. Both surfaces declare
`seedFromAccount(postcode)` — one argument (`delivery-store.ts:155`, `DeliveryContextStore.kt:75`).
Seeding a *displayable* place means carrying the address's suburb and state too, so the function
widens on both surfaces and its existing tests widen with it. The **guard** and the
**GUEST-outranks-ACCOUNT rule** are what get reused unchanged — not the signature.

### R10a — Sign-out clearing (FR-023)

The store already records `DeliverySource.GUEST | ACCOUNT`. FR-023 is therefore a four-line rule on
the same session observer: on transition **to** signed-out, clear the context **only if**
`source == ACCOUNT`. The provenance field was built in 025 for display purposes and turns out to be
exactly the discriminator this rule needs.

---

## R11 — What the display actually says

**Decision**, resolving FR-033/FR-034 into a single rule the two surfaces share:

| The shopper... | Display shows |
|---|---|
| chose a place from the list | `Richmond VIC 3121` |
| typed a postcode covering **one** locality | `Melbourne VIC 3000` — naming it is safe, it is the only candidate |
| typed a postcode covering **several** localities | `VIC 3121` — no suburb is invented |
| typed a postcode and the lookup failed | `3121` — degrade to what we know for certain |

The third row is FR-034's literal requirement. The second is a deliberate *extension* of it: FR-034
only forbids naming a locality when the postcode covers more than one, so naming the sole candidate
is compliant and strictly more useful. The fourth row matters because it means **the place lookup
failing must never degrade the serviceability answer** — the verdict is independent of the name.

⚠ Both surfaces must derive this from **one shared rule**, not two hand-written conditionals. It goes
in the shared contract as a stated algorithm and is unit-tested on each surface against the same
table. 028's lesson — a fixture that agreed with the code rather than with the world — is the reason
the table above is written down here rather than left implicit.

---

## R12 — The mobile persistence gap (raised, and deliberately not closed)

The spec records it: the mobile delivery location does not survive an app restart, so FR-019's
"an explicit choice outranks the account default" holds within a session and cannot hold across one.

**Assessed for cheapness, as the checklist asked.** Closing it means giving `customer-mobile` a
key-value store it does not have. `multiplatform-settings` is a `shop-mobile` dependency; adding it
to `customer-mobile` is a **new runtime dependency on the customer app**, which 025 explicitly
declined to take for a presentation slice.

**Decision: still out of scope.** The store was deliberately built with an injected `initialValue` +
`persist` callback precisely so this becomes a constructor argument later, and this slice does not
change that seam. ⚠ But note the interaction 030 *creates*: before this feature nothing was ever
seeded, so the gap only meant "the shopper retypes". After it, the gap means "the shopper's deliberate
choice is silently replaced by their account default on next launch." **The defect gets worse because
of this feature even though this feature does not cause it.** That is worth the operator's attention
when prioritising the next slice.

---

## R13 — Telemetry and privacy

**Decision**: **no new telemetry event, and no new property on the existing one.**

`customer-web` already emits `delivery_location_set { serviced }`, with a comment explaining that the
postcode must never be attached. FR-047 extends the same rule to the locality name and state, which
are *more* identifying than a postcode, not less — "Effy delivers to <suburb>" plus a session is a
person's approximate home address.

The one thing worth knowing operationally — how often a shopper reaches a place we do not serve — is
already answered by the existing boolean and by the `storefront_serviceability_checks_total` metric.

**One new server-side metric** is justified: a counter for locality lookups by outcome
(`found` / `not_found`), low-cardinality by construction. It answers "are shoppers failing to find
their suburb?", which is the question that tells us whether the dataset is wrong. ⚠ It must count
outcomes, **never** the query string.

**Mobile telemetry remains deferred** — this would be the eleventh consecutive slice. Recorded, not
silently skipped.

---

## R14 — Proving the wire contract across languages

**Decision**: extend the existing cross-language contract test rather than inventing a new mechanism.

028 built `wire_contract_test.go` + `BannerWireContractTest.kt` sharing one byte-identical JSON
literal, and 029 found it had been pinning a payload no banner ever emitted. The new `LocalityDTO` is
a three-string shape — the cheapest possible thing to pin, and exactly the kind of shape that drifts
silently when someone renames a JSON tag.

`LocalityDTO` is declared once in `@effy/shared-types` (Principle II) and generated to Kotlin through
the existing generator, so the drift guard `cm-contract-check` covers it for free.

---

## R15 — Verifying FR-002 by machine

FR-002 ("the record covers Australia, not only served areas") and SC-002 ("every served postcode is
reachable by a locality name") are the two requirements most likely to be quietly violated by a
convenient shortcut.

**Decision**: a test that runs the join — every `delivery_zone_postcode.postcode` must have at least
one `locality` row. It fails loudly and names the missing postcodes. It is cheap, it is exact, and it
converts SC-002 from an observation into a gate.

⚠ It requires a real database, so it runs under testcontainers and is gated behind **`-short`** —
this repo's actual convention (`platformstatus/repository_test.go` sets the precedent; an earlier
draft here said `FULL=1`, which does not exist in this codebase). `make core-test` runs it,
`go test -short` skips it. Recorded so it is not later assumed to have been running all along.

⚠ It asserts the RULE against a fixture, not against the real dataset — only a loaded database can
answer that. The real check is the operator query in quickstart §1. Both exist because they prove
different things: that the assertion is correct, and that the data is.
