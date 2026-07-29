# Contract: Customer Mobile Screen Inventory

**Surface**: `apps/customer-mobile` only. This is the one surface receiving a screen-level rebuild.
**Explicitly out of bounds**: shop-web, back-office, shop-mobile, driver-mobile, and customer-web
receive the identity change **only** (FR-032, FR-017). A structural diff in those apps outside their
font-mechanism file is a **scope error**, not an improvement.

---

## S1 — Coverage

**48 source screens** resolve to **33 restyled · 9 mapping to 6 new Effy screens · 6 excluded**.
Separately: **2 screens invented in the idiom** and **2 excluded affordances** that were never screens.
The authoritative mapping is [figma-source-findings.md §4](../figma-source-findings.md).

⚠ The export folder holds 49 files; `Group 16.jpg` is a **banner frame, not a screen**.

Every one of the 48 MUST have exactly one recorded disposition. An unmapped source screen is an
incomplete inventory, not an implicit exclusion.

**[screen-inventory.json](screen-inventory.json) is the countable authority** — the prose table
aggregates variants (`"Sign Up (+Error, +Success)"`, `"New Card ×3"`) and cannot be counted by a
machine. The JSON reconciles 1:1 against the operator's export directory and is what T043 asserts
against. The prose table remains the human-readable authority; the two MUST agree.

## S2 — Restyle means appearance only

A restyled screen MUST keep its existing ViewModel, use-cases, repository calls, navigation entry, and
observable-state contract. Presentation-layer edits only (Principle VI, FR-001, FR-017).

**Enforced by**: existing Kotlin `commonTest` suites passing **unchanged**. A test that needs editing
to accommodate a restyle is a signal the change went below the presentation layer.

## S3 — The no-card rule, satisfied from within the language

Cart lines, order lines, account entries, and detail rows MUST be **rows and sections**, using the
source's own **borderless row variant** (`image · name · price · action`).

Product tiles remain the single pre-existing recorded exception. No new exception is created, and no
Complexity Tracking entry is needed.

## S4 — Excluded screens, each with a standing reason

| Excluded | Reason |
|---|---|
| Reviews · My Orders-Review | no ratings/reviews capability; deliberately excluded by 025 too (FR-029) |
| Payment Method · New Card ×3 | Stripe PaymentSheet renders these; a look-alike is forbidden (FR-030) |
| Apparel size selection | the store is grocery (FR-007) |
| Facebook sign-in | not an Effy credential route (FR-030a) |

An excluded screen MUST NOT be reachable in any form.

## S5 — The two invented screens

Category browse and the delivery-location/serviceability affordance have **no source counterpart** and
MUST be composed from the source's own vocabulary — its app bar, chips, rows, tiles, spacing rhythm,
and primary-action styling.

**Acceptance is comparative, not absolute** (SC-008): a reviewer shown the source kit and the app must
judge these two to belong to the same system as the directly-derived screens.

Neither may change behaviour: browse presents the existing category structure and introduces no
taxonomy; serviceability returns exactly today's answer, from the same zones checkout uses.

## S6 — The six new screens

| Screen | Backing | Entry point | Real or placeholder |
|---|---|---|---|
| Onboarding | device-local flag | first launch | **real** |
| Notifications *(incl. its empty state)* | fixture module | app-bar bell | **placeholder** |
| Order tracking | 020 fulfilment states | an in-progress order | **real** |
| FAQs | static | Account | **real** |
| Help Center | static | Account | **real** |
| Customer Service | static | Account | **real** |

**Six screens, not seven.** The empty state is a state of the Notifications screen, not a screen of its
own — which is also why the source's four notification frames collapse to one Effy screen.

Each MUST be reachable from a natural entry point and MUST offer a way back (FR-039).

## S7 — Placeholder discipline

Placeholder content MUST come from **one clearly-named fixture module**, never scattered literals, and
MUST be evident as placeholder to the operator (FR-035).

**Enforced by**: a test asserting no fixture identifier is reachable from a production build path.
Each placeholder-backed screen carries a recorded owning slice (notifications → a future notifications
slice).

## S8 — Order tracking disclosure boundary

Renders 020's existing states read-only:

```
pending → received → picking → ready_for_pickup → (delivered)
```

MUST show only the state and its timestamp. MUST NOT reveal a shop name or id, a map, a courier
identity, or the number of fulfilment locations. Multi-package orders use **positional labelling only**
("Package 1 of 2"), as the cart already does.

**Enforced by**: an adversarial test asserting no shop identifier appears in any tracking render,
across single- and multi-package orders (FR-037, SC-012).

## S9 — Navigation is preserved

The five destinations — **Home · Browse · Search · Orders · Account** — are **kept** and restyled
(research R7). Adopting the source's set would drop Browse, which 025 FR-009/FR-010 made a signed-off
requirement precisely because that entry used to be a dead-end placeholder.

Active state is signalled by the source's three non-colour means: **filled icon + bold label +
underline indicator** — which is also how FR-040 is satisfied here.

## S10 — The 025 foundation is inherited, not rebuilt

These MUST NOT regress: navigation icons with persistent labels, title bars with standard back
affordances, safe-area correctness, loading skeletons, pull-to-refresh, transient confirmations, press
feedback, and reduced-motion handling (FR-026).

**Enforced by**: SC-006 of 025 restated — zero lettered glyphs, zero improvised text-link back
controls, zero spinner-only first loads, zero imageless cart lines.

---

## Required tests

1. Existing `commonTest` suites pass **unchanged** (S2) — the primary proof this stayed presentational.
2. Inventory completeness: all **48** source screens have **exactly one** recorded disposition, driven
   from a machine-readable per-screen list rather than the prose table (S1).
3. Excluded screens unreachable — no size selector, no rating affordance, no look-alike card entry,
   no Facebook button (S4).
4. Fixture identifiers unreachable from a production build path (S7).
5. Adversarial no-leak test on order tracking, single- and multi-package (S8).
6. Navigation destination set unchanged at five, with the restyled active-state indicator (S9).
7. The 025 foundation assertions still pass (S10).
8. Both platforms build and run; phone, large phone, and tablet in both orientations (FR-031).
