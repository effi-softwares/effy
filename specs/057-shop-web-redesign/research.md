# Phase 0 Research: Shop Console Redesign

## R1: Design-token integration strategy

**Decision**: Shop-web consumes a new, shop-scoped token **value** layer added inside the
existing `@effy/design-system` package (`src/tokens/shop.css` or equivalent, generated/checked by
the same `tokens:check`/AA-guard tooling as the platform's other tokens), not a shop-web-local
hardcoded stylesheet. Colour values stay within the non-negotiable monochrome + two-semantic-colour
law; spacing/radius/typeface values are taken from the imported mockup, scoped to shop-web only.
Back-office and the other five surfaces are untouched.

**Rationale**: The user explicitly asked to use the imported design's tokens "no need to stick
with current ones," but Principle II requires cross-cutting concerns (design tokens) to live in
the shared package, never copy-pasted per surface. Keeping the *mechanism* shared (one package,
one variable naming scheme, one generator, one AA guard) while letting the *values* vary by app
satisfies both: no logic fork, no silent constitutional violation. This mirrors how the platform
already differentiates dark/light per surface via `data-theme` — extending that same mechanism
with a per-app value layer is a generalisation, not a new pattern.

**Alternatives considered**:
- *Push the new values into the shared SSOT wholesale* (affecting back-office too) — rejected:
  back-office is out of this feature's scope, untested and unreviewed against these values; an
  unplanned visual change there is exactly the kind of blast radius the constitution's "match
  scope of actions to what was requested" instinct warns against.
- *Shop-web-local hardcoded CSS, bypassing the shared package* — rejected: this is precisely the
  "copy-paste of cross-cutting logic across surfaces" Principle II prohibits, and it would break
  the mechanical guards (`tokens:check`, `check-tokens.mjs` AA gate) that currently protect every
  surface.

## R2: Refund/cancellation initiation — crossing from the shop pool into `core-api`

**Decision**: Add a **third** per-pool JWT verifier to `apis/core-api` (shop pool, alongside the
existing customer and back-office verifiers), scoped to exactly one new/extended endpoint that
calls into 055's existing refund service. Authorization requires `shop_manager` in
`cognito:groups` **and** an active `shop_staff` record scoped to the order's own shop (platform
record is authoritative, per Principle IV).

**Rationale**: 055 already solved this exact problem for the back-office audience — "`core-api`
GAINED A SECOND COGNITO VERIFIER (back-office) because the payment secret lives there and nowhere
else" — and recorded it as the Principle-IV-sanctioned shape ("per-pool validation against that
pool's own issuer... not the auth proxy it forbids"). Repeating that shape for the shop pool is
the smallest, most precedented change; each pool is independently validated, no token is
forwarded, and a shop-pool token remains structurally rejected by every other route.

**Alternatives considered**:
- *`edge-api/shop` calls `core-api` server-to-server* — rejected: introduces a new inter-service
  trust boundary (what authenticates that call? what stops it being replayed for a different
  shop's order?) that the platform doesn't otherwise have, solving a problem 055 already solved
  more simply.
- *Duplicate the refund state machine inside `edge-api/shop`* — rejected outright by the spec
  itself (FR-014): "the shop console MUST NOT implement a separate or shop-local refund
  mechanism." Two refund implementations is exactly the kind of drift 055's own postmortem
  warned about with the `problem.fields`/`errors` mismatch recurring across features.

## R3: The design's third "warning" hue

**Decision**: No `--warning` (or any third UI hue) is introduced. Every place the mockup uses
amber/orange (order status "Awaiting pick", low-stock and medium-risk indicators) is rendered
with monochrome emphasis instead — bold weight, a border, or the existing
foreground/muted-foreground contrast pair — never a new colour token.

**Rationale**: Principle V is explicit and non-negotiable: "Exactly TWO semantic colours exist
alongside the ramp... No third hue may be introduced as a UI colour," with only two named
exceptions (a third-party sign-in mark, and chart-only data-visualisation palettes) — neither
applies to a status badge. 041 already resolved the identical situation in shop-web ("amber used
as a 'warning' colour across shop-web fulfillment/catalog → monochrome emphasis by weight"),
so this redesign follows the platform's own existing precedent rather than reopening the
question.

**Alternatives considered**:
- *Request a new constitutional exception for a bounded "status" palette*, as 052 did for its
  same-day badge — rejected: 052's exception was for a single, narrow, genuinely-third-hue
  business fact (same-day delivery is neither an error nor a success); "awaiting pick" and "low
  stock" are ordinary operational states with no such irreducible need for a hue, and 041 already
  proved weight/emphasis reads clearly for exactly this case.

## R4: Supplier and purchase-order scope

**Decision**: `supplier` and `purchase_order`/`purchase_order_line` are shop-scoped tables (each
row carries `shop_id`), not a platform-wide shared vendor directory.

**Rationale**: Consistent with how product and stock data are already shop-scoped (054); a shared
cross-shop vendor directory would be new platform-wide scope nobody asked for and raises data
ownership questions (can Shop A see Shop B's supplier pricing?) with no stated need.

**Alternatives considered**: A platform-wide `supplier` table shared across shops — deferred as
unnecessary scope; can be revisited if a future feature needs cross-shop purchasing.

## R5: Team management — provisioning mechanism

**Decision**: Reuse 009-shop-management's existing Cognito-first→DB-idempotent-upsert
provisioning pattern (`AdminCreateUser` with no password → `AdminAddUserToGroup` → idempotent
`shop_staff`/`shop_staff_role` upsert), now exposed as a shop-pool-authorized, own-shop-scoped
route in `edge-api/shop` in addition to the existing back-office-authorized route in
`edge-api/admin`.

**Rationale**: This is the platform's one existing mechanism for provisioning a passwordless
shop-pool account; 009 already built it correctly (including the two defects 056 later caught
elsewhere in the codebase — "creating a 'new' driver silently overwrote an existing one" — which
this reuse inherits the *fix* for, not the defect, since it's the same code path, not a
reimplementation).

**Alternatives considered**: A second, shop-web-local provisioning implementation — rejected:
exactly the "second, independent system of record" the spec's FR-019 explicitly forbids.

## R6: The mockup's "Tokens" screen

**Decision**: Excluded from the shop-web redesign entirely. It is not a console feature.

**Rationale**: Reading the full mockup file confirms `isTokens` is a raw CSS-variable swatch
gallery plus a typography and button/badge/input showcase — structurally a Storybook-style
design-system preview page, not a screen a shop operator would ever navigate to for a real task.
Its own nav label is "Tokens" with icon "◐", sitting alongside "Today/Orders/Catalog/Restock/
Management" in the mockup's sidebar, but it renders `--background`/`--foreground`/etc. swatches
and generic button variants, not order/product/shop data.

## R7: Component-vocabulary gap audit against `@effy/design-system/ui`

**Decision**: Confirm coverage of the mockup's component vocabulary against the existing shared
primitives (13 shadcn primitives per 007's foundation, plus `table`/`dialog`/`alert-dialog`/
`select`/`badge`/`DataTable` added by 009) at task-breakdown time; add any missing primitive
(a responsive sheet — bottom-drawer on mobile, centred dialog on desktop; toast/`Sonner`; a
segmented-tab control; a multi-step wizard progress rail) **to** `@effy/design-system/ui`, never
shop-web-local.

**Rationale**: The mockup's own `sc-if value="{{ sheet.isDrawer }}"` pattern (same component,
different presentation by viewport) is a single responsive primitive, not two components — adding
it once to the shared package benefits back-office too, consistent with Principle II.

**Open item for tasks.md**: enumerate the exact primitive gap once implementation starts; this is
a routine audit, not an architectural decision, so it is not blocking Phase 1 design.

## R8: Exact refund-table schema for the initiator column

**Decision**: Deferred to task-breakdown time — read 055's actual committed migration/schema for
`public.refund` (or equivalent) before writing the DDL for the initiator/actor addition described
in `data-model.md`. This plan's data model describes the *shape* needed (who initiated it, and
from which shop when applicable), not exact column names, since 055's precise schema was not
re-read line-by-line during this planning pass.

**Rationale**: Getting the exact column/table name wrong at plan time and correcting it at task
time is normal and cheap; guessing a schema and locking it into a contract now would risk the
same "fixture agreed with the code instead of with the database" class of defect the codebase's
own history (027 R13, 033) repeatedly warns about.

## R9: Telemetry — PostHog status on `apps/shop-web`

**Decision**: This plan declares the product events this feature needs (per Constitution Check,
Principle VII) and wires them through whatever telemetry call the shop-web codebase currently
uses. Whether PostHog is actually initialised on `apps/shop-web` (as opposed to merely available
as a dependency) is confirmed at task time by inspecting the app's entry point; if it is not yet
initialised, that is a pre-existing platform gap (the same shape as 039's "PostHog never
initialised on customer-web" carry-forward), recorded rather than silently worked around, and not
a blocker for this feature's other scope.

**Rationale**: Consistent with how prior features (028, 029, 033, 039, 046) have handled this
exact same recurring gap — declare the events, note the gap if the init step turns out to be
missing, don't invent a parallel telemetry mechanism to paper over it.
