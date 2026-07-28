# Contract: Customer UI (cross-surface)

**Feature**: 025-customer-ui-refresh

The rules both customer surfaces must obey. This is the contract that keeps `customer-web` and
`customer-mobile` at parity (FR-002) and keeps the storefront's performance and hidden-fulfilment
promises intact while its presentation is rewritten.

---

## 1. The guest-path budget rule (web) — machine-enforced

**Rule**: client code reachable from `app/(shop)/` MUST be dependency-free.

**Prohibited on guest routes**: `radix-ui`, `sonner`, `vaul`, and any `@effy/design-system/ui`
component that pulls them (`dialog`, `sheet`, `drawer`, `popover`, `sonner`, `tooltip`).

**Permitted**: `react`, `next`, `lucide-react` (tree-shaken icons only), and this app's own
dependency-free stores.

**Where the primitives remain the standard**: `app/(auth)/`, `app/(account)/`, `app/checkout/`, and
both consoles. This constraint is scoped to the public path, not platform-wide.

### Required implementations

| Need | Mechanism | Client JS |
|---|---|---|
| Promo carousel | CSS scroll-snap + anchor dots | none |
| Product gallery | CSS scroll-snap + labelled radio inputs | none |
| Sticky checkout summary | `position: sticky` in a grid | none |
| Category / product grids | CSS grid | none |
| Toast | `useSyncExternalStore` store + fixed live region | ~30 lines |
| Delivery picker | native `<dialog>` + island | small |
| Mini-cart | native `<dialog>` over the existing cart store | small |

### Enforcement

1. **Budget gate** — `apps/customer-web/scripts/bundle-budget.mjs`, `GUEST_LIMIT = 160 KB`, fails the
   build. `GUEST_PAGES` MUST be extended to include `/search` and `/product/[id]` so the gate covers
   what this feature changes.
2. **Reachability guard** — a `dependency-cruiser` rule forbidding the prohibited packages from being
   reachable from `app/(shop)/`, using **`reachable: true`**.

> The `reachable: true` detail is not incidental. 011's research D11 records that the Amplify
> quarantine guard was initially wrong because dependency-cruiser matches *direct* imports by default —
> it reported clean while Amplify sat on the home page via a component. This guard must be proven by
> deliberately breaking it, the same way that one eventually was.

### Pre-existing overage

The gate is **already red**: 167.4 KB against 160 KB, byte-identical with recent features stashed
(recorded under 020). Phase 0 measures and addresses it **before** any new UI lands. This feature does
not get to inherit a red gate and call it pre-existing.

---

## 2. Rendering-mode rules (web)

Inherited from 011 and non-negotiable here:

- `app/(shop)/layout.tsx` MUST NOT call `cookies()` or `headers()`, and MUST NOT import
  `aws-amplify`. Either converts every public page from a cached static shell to a per-request
  render. Both are machine-guarded.
- Request-time personalization stays inside `<Suspense>` islands. The delivery affordance is such an
  island — it reads device-local storage on the client, so it costs the shell nothing.
- Refinements are **query parameters, never path segments** (FR-017), preserving the existing crawl
  and cache policy.

---

## 3. Hidden fulfilment (platform invariant)

No surface introduced or changed by this feature may name, number, or make inferable a fulfilment
location (FR-006).

Concretely:
- Serviceability returns a boolean — no zone id, no zone name (zone names are geographic).
- Multi-package carts keep **positional** labelling only ("Package 1"), and a single-package cart
  shows no package framing at all (FR-043).
- Related products are drawn from a category, never from "the same shop".
- No delivery copy may imply distance, origin, or locality.

---

## 4. Parity (FR-002)

Every capability lands on **both** surfaces, expressed natively for each. Parity means the same
capability, not the same pixels:

| Capability | customer-web | customer-mobile |
|---|---|---|
| Category browse | `/browse` category index | Browse destination |
| Persistent search entry | header input | Home app-bar search |
| Delivery affordance | header island + `<dialog>` | app-bar row + sheet |
| Sort + total | control above results | control above results |
| Interactive gallery | thumbnails (pointer) | swipe + position dots |
| Delivery expectation | beside price | beside price |
| Sticky buy affordance | n/a (no scroll problem at desktop widths) | bottom bar |
| Add feedback | toast | snackbar |
| Cart review without navigation | mini-cart dialog | cart destination |
| Sticky order summary | wide screens | n/a (single column) |

Rows marked `n/a` are **not** parity gaps: the requirement is that the shopper's need is met on each
surface, and a sticky bar solves a problem that does not exist at desktop widths. The parity register
(`docs/audiences/customer-capabilities.md`) records these with their reasons at sign-off (FR-002,
SC-014).

---

## 5. Accessibility floor

Applies to every screen this feature touches:

- Every interactive element has an accessible name (FR-045).
- Dynamic changes — result count, applied refinements, add confirmation, errors — are announced via a
  live region (FR-045).
- Web is fully keyboard-operable with a visible focus indicator and no focus trap (FR-046).
- Status, badge, refinement, and availability meanings survive grayscale (FR-047).
- Mobile touch targets meet the platform minimum, with press feedback (FR-036).
- Reduced motion simplifies or removes movement **without removing the state change** (FR-037).
- Both surfaces remain usable at the platform's maximum supported text size (FR-048).

---

## 6. Design vocabulary

Every colour, type size, spacing step, and radius resolves to the design-system SSOT (FR-007).
No improvised or hardcoded value on either surface.

**Cards are permitted in exactly three places** (Principle V, justified in `research.md` R11): the
product tile (the existing recorded exception), the category tile (an extension of it), and the promo
slide (a full-bleed merchandising surface, not a container tiling content). Everything else — product
specifics, cart lines, order lines, delivery options, addresses, account rows, empty and error
states — is rows, lists, tables, or sectioned pages. **No metric or summary cards anywhere, and none
at the top of any page.**
