# Back-office (admin) capabilities

The capability register for the **admin audience** — Effy back-office staff working in
`apps/back-office` over `apis/edge-api/admin`.

## Why this file exists

`docs/audiences/` held registers for **customer** and **shop** because each of those audiences has
**two surfaces kept at parity** (a web build and a mobile build), and a register is what stops them
drifting apart.

The admin audience has **one** surface, so there is no parity to police — which is why no register was
written. But the other purpose of these documents turned out to matter anyway: **recording what an
audience can do, and what it deliberately cannot.** Feature 031 was the first time that gap was felt,
when a task said "update the parity register" and there was nowhere to put it. Appending an admin
capability to the shop register would have been worse than having none.

⚠ **This is a capability register, not a parity register.** There is no second column, and adding one
would mean the platform had grown an admin mobile app — which is not planned.

---

## §031 — Delivery areas: locality-driven zones & per-area service levels

**Status**: implemented and machine-verified; operator walks outstanding.

Gave the back office the locality record built for shoppers in 030, and moved delivery configuration to
the unit operations actually thinks in: **the area**.

| Capability | Before 031 | After |
|---|---|---|
| Compose a delivery zone | free-text postcodes, shape-checked only | search real places, chosen by name + state + postcode |
| Know what a choice covers | nothing | ⚠ every other place the postcode serves, **before confirming** |
| Add an unknown postcode | silently accepted | warned, and requires deliberate confirmation |
| See a zone's areas | four-digit numbers | place names |
| Set fees and service levels | per (origin zone → destination zone, method) | **per area** |
| Say an area is not served | ⚠ impossible — an absent row meant both "decided against" and "never configured" | a recorded decision, with author, date and reason — **and the area is withdrawn** |
| Enable same-day | an unqualified toggle | the shops that could serve it are shown; with none nearby it needs an acknowledgement (server-enforced, `422`) |
| Notice a broken configuration | ⚠ nothing | three defect classes surfaced one screen from where an admin looks |

### ⚠ Two live defects this answered for

**Postcode 3001 in Melbourne Metro.** Melbourne's PO-box code: no street addresses, and groceries
cannot be delivered to a post office box. It entered through a field that validated the *shape* of a
postcode and nothing else, and was found weeks later by a hand-written query.

**Zone REGIONAL serving Ballarat (3350) and Bendigo (3550) with zero inbound offerings.** The
storefront answered `{"serviced":true}` for those shoppers and checkout could quote nothing — they were
invited in and stopped at payment. That is 025's FR-014b violated **in data rather than in code**: every
Go test passed and the configuration undid the rule.

Neither produced an error, a log line or an alert.

### ⚠ Known limits, recorded rather than discovered later

- **An area is a postcode.** Serviceability is postcode-keyed everywhere — checkout, the storefront
  answer, the captured quote — so an area cannot be finer. Choosing "Alfredton" serves all twenty
  Ballarat localities, which is why the disclosure exists. Serving one suburb of a postcode but not
  another needs serviceability to become locality-keyed: a much larger slice.
- **Areas in one zone cannot differ.** `delivery_offering` is keyed on zone, so configuring Ballarat
  configures Bendigo. Disclosed in the editor; fixing it means re-keying the quoting path.
- **Per-origin pricing was collapsed.** One fee per area, from every shop. The shopper cannot perceive
  which shop serves them (hidden fulfilment), so origin cost variance became internal margin — a real
  loss of expressiveness, taken deliberately.
- **Same-day feasibility is a human judgement.** The platform has no routing capability; "shops in the
  same zone" is stated as exactly that, never dressed up as a distance.
- **No metric.** ⚠ No cold-path service on this platform emits one, so there was nothing to add a gauge
  to. `/delivery-health` returns the same counts on demand. **Carry-forward.**
- **No real-database test in the cold path.** ⚠ The SC-014 assertion pins the query's shape, not its
  behaviour — the admin service mocks its database. The behavioural check is an operator walk.
  **Carry-forward.**

### What did NOT change

⚠ **`apis/core-api` has an empty diff.** The shopper's experience of delivery — the up-front
serviceability answer, the checkout quote, the address book — is untouched, and core-api's `storefront`
and `checkout` suites pass **unmodified**. That was the guard, and it held.

---

## §032 — Delivery pricing rules & same-day approvals

**Status**: implemented and machine-verified; operator walks outstanding.

Replaced the per-zone-pair rate grid with **rules the platform evaluates**, and replaced
zone-membership same-day with a **shop declaration an admin approves** — shown how far each requested
area actually is.

| Capability | Before 032 | After |
|---|---|---|
| Set what delivery costs | a fee per (origin zone → destination zone, method) — a grid growing as origins × destinations | **rules**: base + distance band + weight band, rounded **up**, capped |
| Account for distance | ⚠ impossible — nothing knew where anything was | straight-line distance from a coordinate per postcode |
| Account for weight | ⚠ impossible — 24 of 38 products had no weight at all | every product has one, flagged **measured** or **assumed** |
| Decide same-day | ⚠ a rate-grid row, meaning only "these postcodes share a zone" | a shop declares; an admin approves, **shown the distance** |
| Judge a same-day request | nothing to judge it by | every requested area with its **straight-line** km and how many places it covers |
| Withdraw same-day | ⚠ impossible | revoke, with a reason the shop reads |
| Know who changed a price | ⚠ nothing | `updated_by` is NOT NULL; every change audited |

### ⚠ The defect this answered for

**Zone REGIONAL held both Ballarat and Bendigo**, so same-day to Ballarat was permitted by a shop in
Bendigo — **98 km away**, essentially as far as Melbourne (~102 km). The check reported "a shop is
nearby" and carried **no information at all**. It produced no error and no log line, and the only
possible symptom was a promise broken at the moment a shopper was most committed.

⚠ **031's research asserted the platform had no distance capability, and used that to justify the
proxy. The premise was false** — G-NAF ships a coordinate for every locality, in the same download,
under the same licence, and 030's derivation discarded it.

### ⚠ Known limits, recorded rather than discovered later

- **Distance is straight-line, not road.** Melbourne→Ballarat is ~102 km straight and ~115 km by road,
  about 7% under. Bands and upward rounding absorb it; the approval screen says **"straight-line"** in
  as many words, because replacing one misleading signal with another would be worse than none.
- **A postcode's location is its localities' centroid.** ⚠ Meaningless for **0872**, which spans NT, SA
  and WA — `locality_count` sits beside every centroid so an admin can see when the basis is nonsense.
- **A missing coordinate prices at the FURTHEST band**, never the nearest, and renders as *"no location
  on record"* — never `0`, never blank.
- **24 of 38 products carry an ASSUMED weight.** Delivery is priced from it either way; the flag is what
  makes the gap visible instead of absorbed.
- ⚠ **A banded fee discloses a coarse distance.** It cannot identify a *shop* — a band spans many
  origins — but band width is therefore a **privacy** parameter, and the console warns when one gets
  narrow enough to resolve to a single fulfilment node.
- ⚠ **No metric is watched.** The hot path emits quote-outcome and cap-hit counters, the cold path emits
  none at all, and **no Prometheus or Grafana is provisioned to read either**. Alert rules are written
  at `infra/observability/alerts/` and load nowhere. **Carry-forward.**
- **No email or push** when a decision is made. In-console status only.

### What did NOT change

The shopper sees the same quote shape as before — a rounded fee and a delivery window. No distance, no
shop identity, no weight reaches a customer response, and a Go test asserts that against the
**serialised JSON** rather than the struct.

---

## Earlier admin capabilities

Not retrofitted here. The back office also carries staff identity and RBAC (005/006), shop management
(009), the catalog schema (016), delivery zones and pricing (021), and the promotions console (027).
Each is documented in its own slice under `specs/`.
