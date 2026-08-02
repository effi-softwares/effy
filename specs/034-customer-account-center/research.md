# Phase 0 Research: Customer Account Centre

**Feature**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md) · **Date**: 2026-08-02

Every decision below was checked against the code as it stands, not against memory of it. Where a
finding **contradicts the spec**, the spec is amended (Principle I) and the amendment is recorded here.

---

## R1 — ⚠ The blocking condition the spec requires has NO EXIT in production today

**This is the most important finding in this document, and it invalidates FR-042 as originally
written.**

FR-042 requires deletion to be blocked while an order is "not yet complete", and simultaneously
forbids dead ends: the block must *"state when it will clear"*. **Today it can never clear.**

What the schema actually says:

| Table | States | Terminal? |
|---|---|---|
| `public."order".status` | `pending_payment` · `paid` · `failed` · `canceled` | `paid` is **not** terminal — it is the *start* of fulfilment |
| `public.shop_fulfillment.status` | `pending` · `received` · `picking` · `ready_for_pickup` · `collected` | `collected` is terminal |

And `collected` is **unreachable in production**. Feature 020 shipped the transition behind a
**dev-only stub with no route in any environment** — `POST .../pickup` returns 404 everywhere, and is
invoked locally only through `apis/edge-api/shop/scripts/invoke-pickup-stub.mjs`. Its removal trigger
is *the driver slice*, which does not exist. There is no `delivered` state anywhere.

**Consequence**: any shopper who has ever completed a paid checkout would be **permanently barred from
deleting their account**. That is precisely the dead end FR-042 prohibits, and it is the strongest
form of Apple's *"apps that make it unnecessarily difficult for a user to delete their account will not
pass review."* Shipping it would convert a compliance feature into a compliance defect.

The spec also assumed two other blockers that **do not exist as concepts at all**: there is no balance
and no refund table anywhere in `db/migrations/` — `public.payment` carries only Stripe references and
a status mirror.

**Decision — a two-part blocking predicate, each part with a guaranteed exit:**

1. **`pending_payment` orders block.** These are genuinely resolvable by the shopper inside the app:
   complete the checkout or abandon it. This is a real blocker with a real, in-app exit.
2. **A `paid` order blocks only while it is *recent*** — within a bounded window measured from when it
   was placed. Past that window the order stops blocking, whatever its fulfilment state.
3. **Nothing else blocks.** Balances and refunds are not modelled and MUST NOT be named to the shopper
   as blockers, because a blocker the platform cannot detect is a lie.

**Why a time bound rather than waiting for the driver slice**: the alternative is to make the delivery
lifecycle a second hard blocking dependency for store submission, stacked on top of the erasure slice.
That would leave this feature unshippable behind two unbuilt slices. The time bound makes the block
**self-clearing by construction**, which is the property FR-042 actually needs — and when the driver
slice lands, the bound becomes a backstop rather than the primary exit.

**The window is 30 days**, matching the grace period, so the shopper only ever hears one number.

**Alternatives rejected**:
- *Block on any non-`collected` paid order* — the dead end above.
- *Warn-and-allow on everything* — permitted by Apple, and safer for review, but it discards the
  operator's explicit instruction, and both reference platforms (Uber, eBay) plus Instacart do block.
- *Block until fulfilment reaches `ready_for_pickup`* — still not shopper-resolvable, and still stalls
  forever if no shop ever advances the order.

**⚠ Spec amended**: FR-042 now names the two blocking conditions and the bound, and FR-042a forbids
naming an unmodelled blocker.

---

## R2 — Path selection (Principle III): cold path, with one deliberate cross-domain read

**Decision**: everything in this feature is **cold path** (`apis/edge-api/customer`).

Feature 011's **FR-028 routing law** is explicit and binding: *commerce* (product · catalog · search ·
cart · order · payment) goes to the **hot path**; *customer profile / account* goes to the **cold
path**. Every screen here is profile/account: personal details, security, privacy, deletion. The
address book already lives on the cold path (`customer/v1/addresses`), and the password flows already
live there too.

**The one wrinkle**: the deletion blocker (R1) must read order state, and orders are hot-path territory.

**Decision**: the cold path **reads `public."order"` directly** for the blocking predicate, and does
**not** call the hot path. Reasons:

- Both paths already share one database; the cold path is not being given a new capability, only a new
  query. `edge-api/customer` already reads `public.customer_address`, which the hot path also serves.
- The alternative — a service-to-service call from Lambda to `core-api` — would make deletion depend on
  a service that **has no cloud deploy at all** (`core-api` is local-Docker-only by platform decision).
  Deletion would be permanently broken in dev and impossible in production.
- The read is a **narrow, owned predicate**: "does this customer have a blocking order?" It returns a
  boolean plus the facts FR-042 requires the shopper to be told. It does not project order data into
  the account domain.

**Recorded as a deliberate exception** in the plan's Complexity Tracking, because a cold-path service
reading a hot-path-owned table is a boundary crossing even when the database is shared.

---

## R3 — ⭐ The re-authentication primitive already exists, needs zero new IAM, and works for every credential route

FR-043 requires a **freshly issued verification code** before deletion, completable by **every**
credential route including a federated-only account. This looked like the hardest requirement in the
feature. It is already built.

Feature 012 shipped exactly this primitive for the "set your first password" flow, in
`apis/edge-api/customer/src/password/cognito.ts`:

- `GetUserAttributeVerificationCodeCommand` — emails a code to the account's verified email
- `VerifyUserAttributeCommand` — verifies it server-side

**Both are token-authorized.** They relay the customer's own authority via their access token, so
`apis/edge-api/customer/serverless.yml` needs **no new IAM statement** — its Cognito grants today are
only `ListUsers` / `AdminCreateUser` / `AdminLinkProviderForUser`, and none of them is needed here.

**Why this is the right primitive rather than a password prompt**: it is keyed on the **email
attribute**, not on a password. A Google-only customer has a verified email and no password, so a
password re-auth prompt would be an unresolvable dead end for them — which the research explicitly
flagged as *"exactly the kind of path that ships untested"*. This primitive is uniform across all three
credential routes by construction.

**Decision**: reuse it. `GlobalSignOutCommand` (also token-authorized, also already used) satisfies
FR-041's "all sessions end".

---

## R4 — Cognito lifecycle during the grace window: leave the user enabled

**Decision**: the soft delete touches **no Cognito user state**. The Cognito account stays enabled
throughout the grace window; only the platform record changes.

This falls out of two requirements that pull in opposite directions:

- FR-041 requires credentials be **refused on every customer surface** immediately.
- The grace window restores the account **when the shopper signs in** (Assumptions; Uber's documented
  behaviour) — which requires that they *can still authenticate*.

Disabling the Cognito user would satisfy the first and make the second impossible. The platform already
has the correct mechanism for exactly this shape: **the record is authoritative for the access
decision** (Principle IV), which is how `status = 'barred'` refuses a customer holding a perfectly valid
token. Closure reuses that enforcement point.

**⚠ Carried to the erasure slice**: permanent deletion will need `AdminDeleteUser`, which is a **new IAM
statement** on the customer pool. Named here so that slice does not discover it late.

**FR-047 (federated revocation) is a no-op today, and must be stated as one rather than silently
skipped.** The obligation to call a provider's revoke endpoint is Apple's, and it attaches to **Sign in
with Apple**, which this platform does not offer. Google federated sign-in carries no equivalent
requirement. **If Sign in with Apple is ever added, FR-047 becomes real work**, and the erasure slice
owns it.

---

## R5 — The single-field editor: extract on mobile, reuse on web

**Web — already solved.** `packages/design-system/src/ui/responsive-modal.tsx` exists and is exactly
the required container: a centred **Dialog** at/above the mobile breakpoint and a bottom **Drawer**
below it. It was built for feature 022's address form and its doc comment already states the Principle
II rationale. The web single-field editor **reuses it unchanged** — no new component, no new dependency.

**Mobile — needs an extraction.** There is **no shared sheet component anywhere**. `ModalBottomSheet`
is used raw in exactly two places (`AddressBookScreen.kt`, `CheckoutScreen.kt`), each hand-rolling
`rememberModalBottomSheetState(skipPartiallyExpanded = true)` and its own content padding
(`imePadding().navigationBarsPadding().padding(horizontal = 20.dp, vertical = 8.dp)`).

**Decision**: add **`EffySheet`** to `apps/customer-mobile/.../core/presentation/StorefrontKit.kt`,
owning the drag handle, the explicit close control (FR-017), IME padding (FR-016), bounded width
(FR-024), the dirty-check interception (FR-018/FR-019) and focus handling (FR-056). The two existing
raw call sites are migrated onto it.

**⚠ It MUST NOT go into `packages/mobile-kit`.** That package is `srcDir`-shared with `shop-mobile`,
and `StorefrontKit.kt:252-260` carries an explicit standing warning that customer-only controls placed
there silently restyle the operator console.

**Row primitive**: `EffyDetailRow` exists but is **not clickable and has no trailing slot** — it is a
display row. The tappable label/value/chevron row is a small net-new addition beside it, not a rewrite
of it.

---

## R6 — Dirty-check mechanics differ per surface, and both need explicit handling

FR-018 requires that a *changed* value survive an accidental dismissal, and FR-019 requires a *clean*
sheet to close with no friction. Neither surface gives this for free.

**Mobile**: `ModalBottomSheet` exposes `onDismissRequest` (fires for scrim tap and back) and the sheet
state's `confirmValueChange` (can veto a drag toward hidden). Both must be wired — `onDismissRequest`
alone does not intercept a swipe, and vetoing the drag alone does not intercept the scrim.
**Bounded width**: Material 3's `ModalBottomSheet` takes a `sheetMaxWidth` (defaulting to 640.dp),
which satisfies FR-024 without custom layout — **to be confirmed against the pinned Compose
Multiplatform 1.11.1 M3 artifact at build time, not assumed.**

**Web**: three dismissal routes must be covered — the close control, the escape key, and a backdrop
click — plus browser back. Radix's `onOpenChange` / `onInteractOutside` / `onEscapeKeyDown` are the
hooks; a single `onOpenChange` guard is **not** sufficient because it cannot distinguish a deliberate
Save-driven close from an accidental one.

**Decision**: the dirty comparison is against the **value the editor opened with**, computed in one
shared place per surface, so "is this dirty?" cannot be answered differently by two dismissal paths.

---

## R7 — ⚠ There is no privacy policy and no terms of service anywhere on the platform

FR-052 requires both to be reachable in-app, and this is **required by both stores** — Apple 5.1.1(i)
demands a privacy policy link *"within the app in an easily accessible manner"*, and Google requires a
*"privacy policy link or text within the app itself"* backed by an active, publicly accessible,
non-geofenced URL.

A search of `apps/customer-web/app` for any privacy, terms or legal route returns **nothing**. There is
no document to link to.

**Decision**: this feature builds the **route and the page shell** on `customer-web`, and links to it
from both surfaces. **The content is an out-of-code, operator-owned dependency** — a privacy policy is a
legal document, and Apple has demonstrably demanded that developers *"cite the specific laws"* behind
retention claims. Placeholder legal text would be worse than none: FR-045 requires the retention
disclosure to be *true*, and SC-010 verifies every claim in it against the built system.

**Recorded as an operator task**, not silently generated.

---

## R8 — ⚠ New PUBLIC routes must join the bundle gate in the same commit

`apps/customer-web/scripts/bundle-budget.mjs` sets `GUEST_LIMIT = 174 * KB` and measures six named
guest routes. Its own comments record what happens when a public route is added without being listed:
`/product/[id]` sat **58.8 KB over budget for two features** because the gate only watched two of five
routes.

This feature adds up to **three new public routes**: the privacy policy, the terms, and the **web
deletion route (FR-050)**, which by definition must be reachable by someone who has uninstalled the app.

**Decision**: every public route this feature creates joins `GUEST_PAGES` **in the same commit that
creates it**. The account screens themselves are `(account)`-tree and are budgeted separately — the
comment in that file is explicit that the auth SDK legitimately lives there — so FR-058a's real risk is
**not** the account pages but a heavy import leaking into the shared chunk. The measurement is
before-and-after on the existing six routes, not a claim.

**Headroom is thin**: the last full measurement recorded 168.5–171.9 KB across the five original
routes, i.e. **2.1–5.5 KB of slack**, and `/promotions/[id]` landed at 171.0 KB.

---

## R9 — Mobile route registration is a three-place edit with an iOS-only failure mode

Adding any screen to `customer-mobile` requires **three** synchronised edits in
`core/nav/CustomerNavKey.kt`: the sealed interface, the `customerNavSavedState` polymorphic serializer
module, and `ALL_CUSTOMER_ROUTES`. The count is pinned at **23** in
`commonTest/.../ScreenInventoryTest.kt:58`.

**⚠ Omitting the serializer registration fails only on iOS, and only after process death** — the JVM
host test stays green. This feature adds Security and Privacy & data screens (and removes none), so the
count changes and all three lists must move together.

**Related trap**: the bottom bar hides on any pushed screen, so every new sub-screen **must** carry an
`EffyAppBar` or the shopper is stranded — a regression `HelpScreens.kt:82-84` already records.

---

## R10 — The quick-action tile row vs the no-card doctrine (Principle V)

Principle V bars card-style containers *"to lay out content"*. The operator's screenshot shows three
filled, rounded tiles (Favorites / Wallet / Orders).

**Decision**: build them as **icon + label controls without a filled container** — the doctrine's
default — unless the operator directs otherwise on sight.

**Rationale**: the honest reading is that these are *navigation controls*, not content containers, so a
filled tile is arguably outside the doctrine's target. But "arguably outside" is not the standard the
constitution sets; it requires that a card be *"demonstrably the right pattern… and no better layout
exists"*, and a better layout plainly does exist here — the same three targets read perfectly as
labelled icons, which is what the rest of this account area already looks like. Choosing the
container-free form costs nothing and needs no exception.

**⚠ This is the one place this plan deliberately departs from the supplied screenshot**, and it is
flagged for the operator rather than buried: if the filled tiles are wanted, that is a one-line
direction and the justification gets recorded in Complexity Tracking instead.

---

## R11 — Sign-out styling: the two surfaces already disagree, and FR-030 must settle it

- `customer-web`'s `SessionCard.tsx:9-11` deliberately does **not** style sign out as destructive, and
  reserves red *"for the genuinely irreversible (deleting an account)"*.
- `customer-mobile`'s `AccountScreens.kt:290-297` styles **both** sign-out rows `destructive = true`.

**Decision**: **web is right, and mobile changes.** Signing out is trivially reversible — you sign back
in. This feature introduces the first genuinely irreversible action the customer area has ever had, and
if sign-out is already wearing red, deletion has no stronger signal left to reach for. Destructive
styling is now reserved for deletion.

**Sign out on all devices** keeps a confirmation (FR-029) because it affects sessions the shopper cannot
see — but confirmation, not colour, is the right instrument for it.

---

## R12 — Phone: new column, unverified, and its relationship to the address phone must be explicit

`public.customer` has no phone column; `phone` exists only on `public.customer_address` (nullable, per
address) and on order snapshots. `CustomerDTO` carries `id · email · givenName · familyName · status ·
hasPassword · passwordUpdatedAt · createdAt`, and `UpdateCustomerDTO` carries **only** the two name
parts — deliberately, and documented as such in `packages/shared-types/src/customer.ts:69-76`.

**Decision**: add a nullable `phone` to `public.customer`, expose it on `CustomerDTO`, and add it to
`UpdateCustomerDTO` alongside the name parts.

**Two guardrails, both requirements rather than advice:**

- **No verified indicator** (FR-060a). The value is self-asserted. Feature 012's research already
  established the platform's discipline here — `has_password` is safe to trust *because lying about it
  grants no capability*. An unverified phone shown with a tick would break that discipline, and a
  shopper would reasonably rely on it.
- **It does not override the per-address delivery phone** (FR-060b). The address phone is what a driver
  calls; the profile phone is a convenience default. Making the profile phone win silently would mean
  two fields disagreeing about who to call, with the wrong one used at handoff.

**⚠ Follow the `""`-not-`null` convention**: `explicitNulls = false` on the mobile client drops nulls,
so clearing a field sends `""`, which `customer-me-v1-patch.ts:111-119` maps to `null`. The phone must
follow the identical path or clearing it will silently no-op.

---

## R13 — Closure is a distinct concept from `barred`, and FR-049 needs an explicit rule

`public.customer.status` is `'active' | 'barred'`, and `apis/edge-api/customer/src/customer/repo.ts:17-39`
carries a loud warning that `status` must never enter the JIT upsert's `ON CONFLICT DO UPDATE` clause,
because that would let a barred customer un-bar themselves by signing in.

**Decision**: closure is **not** a third value of `status`. It is its own state plus its own record.
Reasons: `status` is a **platform sanction**; closure is a **shopper's own decision**. Collapsing them
would (a) make FR-049 unanswerable, (b) put the shopper's decision on a column whose entire safety
property is that the customer can never influence it, and (c) lose the requested-at moment that the
grace window and the FR-040 disclosure both depend on.

**FR-049's rule**: a **barred** customer may still request deletion. Barring protects the platform from
the customer; it is not a mechanism for holding their data against their wishes, and refusing would
mean the platform's sanction silently overrides a data right. The uniform 403 that barred customers
receive today must therefore gain a deliberate carve-out on the deletion path only — mirroring
`customer-sessions-v1-delete.ts:24`, which **already** deliberately lets a barred customer sign out.

---

## R14 — Guest deletion (FR-046) is device-local, and that is the whole of it

Apple's FAQ names *"automatically generated accounts (sometimes called 'guest' accounts)"* explicitly,
and Effy is deliberately guest-first. But an Effy guest has **no server record** — the guest cart and
guest saved list live in `localStorage` (web) and `DevicePreferences` (mobile), and only become server
data on sign-in.

**Decision**: FR-046 is satisfied by a control that **clears the device-held data**, reachable without
an account. There is nothing server-side to erase, and claiming otherwise would be the inverse of the
FR-040 problem — a disclosure describing work that does not happen.

---

## R15 — Telemetry (Principle VII): ⚠ the gate does not cleanly pass, for a pre-existing reason

Feature 033 recorded that **PostHog has never been initialised on `customer-web`**, so `capture()` has
always been a no-op platform-wide, and mobile telemetry has now been deferred for twelve consecutive
slices.

FR-059 requires account and deletion events to be observable. **Declaring events into a taxonomy that
nothing transmits does not satisfy Principle VII** — it satisfies the letter and misses the point.

**Decision**: the events are declared and emitted, and **the initialisation gap is named in the plan's
Constitution Check as a conditional pass**, not quietly inherited. Deletion in particular is the one
flow where losing the signal is materially bad: it is irreversible, store-mandated, and the only
evidence that the block in R1 is not stranding shoppers is a funnel nobody is currently recording.

---

## R16 — Placement risk accepted, with the test named

Both stores name *"account settings"* as the canonical home for the deletion control, and Apple's
interface guidance warns against burying it. The operator placed it at the bottom of Privacy & data.

**Decision**: follow the operator. `Account → Privacy & data → bottom` is **one level deep** and
matches the **verified** Uber path (`Account → Settings → Privacy → Account Deletion`). The residual
risk is real but small, and SC-007 makes it testable rather than theoretical: a reviewer with a fresh
account and no guidance must reach and complete deletion in under two minutes.

---

## Summary of spec amendments arising from this research

| Amendment | Requirement | Why |
|---|---|---|
| **FR-042 rewritten** | Blocking predicate narrowed to `pending_payment` + *recent* `paid`, with a 30-day bound | R1 — the original had no exit in production and was a dead end |
| **FR-042a added** | An unmodelled obligation MUST NOT be named as a blocker | R1 — balances and refunds do not exist |
| **FR-047 clarified** | Federated revocation is a no-op until Sign in with Apple exists | R4 — the obligation is Apple's and attaches to a provider Effy does not use |
| **FR-052a added** | Policy content is operator-owned; the feature ships the route | R7 — no legal document exists to link to |
| **FR-058c added** | Every new public route joins the guest bundle gate in the same commit | R8 — the gate's own recorded failure mode |
