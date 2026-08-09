# Quickstart: Storefront Home Composer

**Feature**: `specs/042-storefront-home-composer` · **Date**: 2026-08-09

How to run this feature and how to prove each success criterion. ⚠ Steps marked **OPERATOR** touch live AWS, the database, or require a human looking at a screen — per the platform's mode of work, those are run by the operator, not by the assistant.

---

## Prerequisites

- Dev database reachable; the 002 allowlist applied (`make apply ENV=dev`).
- A back-office account whose `admin.staff` record is **active** with role `admin` or `manager`.
- A second account with role `csa` — needed to prove read-only access (FR-016).
- Seeded catalogue: at least two product rails with products, and ≥ 3 stocked categories. Without them the composer is testable but SC-013's non-empty cases are not.

---

## 1 — Migration **OPERATOR**

⚠ **Commit the migration first** — the 003 guard refuses `db-up` on an uncommitted migration.

⚠ **There are TWO migrations, and they land in different phases.** `<ts>_home_layout.sql` creates the table and seeds the layout (Phase 2, here). `<ts>_drop_promo_advertising.sql` removes the advertising facet (Phase 7, only after the advertised promotions have been carried forward). They are not one file: Goose is **forward-only** with a commit-guard, so the first is committed and applied long before the second is written.

```bash
make db-up ENV=dev
make db-status ENV=dev      # expect the new migration applied
```

Verify the seed landed — the published layout must represent today's page, not an empty array:

```sql
SELECT jsonb_array_length(published) AS blocks,
       jsonb_path_query_array(published, '$[*].type') AS types
FROM public.home_layout;
```

⚠ If `blocks` is 0, **stop**. `Hero` is currently commented out of `page.tsx`; an empty published layout plus a deleted `PromoHero` leaves the storefront with no hero at all.

---

## 2 — Deploy

```bash
make edge-deploy SERVICE=admin ENV=dev     # OPERATOR — the authoring routes
make core-run                              # hot path, local Docker
pnpm --filter @effy/back-office dev        # the composer
pnpm --filter @effy/customer-web dev       # the storefront
```

---

## 3 — Machine-verifiable gates

Run these before any walk; they are the cheap half.

```bash
pnpm -r typecheck
pnpm -r test
pnpm --filter @effy/shared-types contract:check    # block schema drift
pnpm --filter @effy/design-system tokens:check     # canvases + Compose themes
make lint                                          # terraform fmt/validate
cd apis/core-api && go build ./... && go vet ./... && go test ./...
cd apps/customer-web && pnpm build && pnpm size && pnpm depcruise
```

**Expected**: all green, and `pnpm size` shows `/` **within 174 KB** with the block system adding ≈0 KB (SC-005).

⚠ `pnpm -r test` alone is not sufficient — **vitest does not run `tsc`**. A green test run with a red typecheck has happened on this platform before; run both, and count the reporting packages.

---

## 4 — The primary walk (US1) **OPERATOR**

1. Open the Home Composer. The published layout appears as an ordered list of blocks.
2. Drag the offers block above the first product rail. Confirm the storefront is **unchanged** — you have edited a draft (FR-012).
3. Tab to a block and use its move-up control. Confirm it moves and **focus follows the block** (FR-004, SC-002).
4. Publish. Reload the storefront — new order (SC-001).
5. Revert. Reload — original order (SC-004).
6. Hide a block, publish, confirm it is absent for shoppers **and still present in the composer with its content intact** (FR-005).

⚠ **SC-002 is NOT walked here.** Its flow is "add an offer, position it, preview it, publish it", which needs the offers block (US2) and the preview (US3). It is walked in §6, once both exist. Walking it now would be walking a different, easier flow and calling it the criterion.

---

## 5 — Offers bento (US2) **OPERATOR**

1. Create five tiles: one `large`, one `wide`, two `small`, one `tall`. Publish.
2. Desktop: the bento composes with each tile at its authored size.
3. Phone: single column, **no truncated or overlapping copy** (FR-028).
4. Delete tiles down to three, then two, then one. Each step degrades coherently — **no empty frames** (FR-029).
5. Zero tiles: the section renders **nothing at all**, not a heading above blank space.
6. Tap a tile's CTA — arrives at the authored destination. With a screen reader, the control's accessible name identifies **which offer** it belongs to (FR-027, SC-008).
7. Attach a tile to a promotion, then expire that promotion. The tile **stops appearing with no operator action** (FR-030).

---

## 6 — Preview (US3) **OPERATOR**

1. Make a draft edit. Open preview — it opens in a **new tab** (not an iframe; see research R5).
2. The draft renders there while the public storefront still shows the published layout (FR-019).
3. Resize to phone width — reflows exactly as the storefront does (FR-020).
4. Point a rail at a source with no products — the preview shows the **real empty behaviour**, not placeholder content (FR-021).
5. End the preview; the same URL now serves published content only (FR-022).
6. **SC-003**: compare preview against the published page at phone and desktop width, in **light and dark**. They must be indistinguishable.
7. **SC-002** (walked here, not in §4): someone who has not seen the tool completes **add an offer → position it → preview it → publish** — first attempt, under 10 minutes, no written instructions.

⚠ **Check the preview works in Safari.** The new-tab design exists because an iframed draft session depends on a third-party cookie that Safari blocks — if someone later "improves" this into an iframe, Safari is where it breaks.

---

## 7 — Refusals (US4) — including the bypass proof **OPERATOR**

For each rule, attempt a publish and confirm the refusal names the **block** and the **reason**, and that the previously published layout is **untouched** (FR-036):

| Attempt | Expect |
|---|---|
| Artwork of the wrong shape for its tile size | `layout_artwork_wrong_size` |
| Artwork with no alt text and `decorative` unset | `layout_alt_text_required` |
| A block referencing a delisted category | `layout_reference_missing` |
| A headline left blank | `layout_field_required` |
| 21 blocks, or 7 tiles in one offers block | `layout_too_many_blocks` |
| An arrangement producing an invalid heading sequence | `layout_heading_order` |
| A headline longer than its stated limit | `layout_field_too_long` |

### ⚠ SC-007 — the bypass proof, which is the point of the whole section

Every refusal above must hold **without the composer**. Issue the same violating publish **directly against the API** with a valid back-office token:

```bash
curl -i -X POST "$ADMIN_API/admin/v1/home-layout/publish" \
  -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"revision": <n>}'   # after PUTting a violating draft
```

**Expect the identical refusal.** A check that only exists in a form is not a check (FR-032). ⚠ This is the test 029's equivalent (`T051`) never ran — it remained "the most important open item on the platform" through two slices. Do not let this one become that.

**Concurrency (FR-017)**: open the composer in two tabs, publish from one, then publish from the other. Expect `409 layout_revision_stale` — not silent loss.

**Authorization (FR-016)**: sign in as `csa`. Reads succeed; every mutation is refused.

---

## 8 — Rendering, performance, accessibility

| Criterion | How to prove |
|---|---|
| **SC-005** | `pnpm size` — `/` within 174 KB; compare against the pre-feature figure |
| **SC-006** | On a **production build**, confirm the first image carries `fetchpriority="high"` and is **not** lazy, and that below-the-fold artwork is lazy. ⚠ This is currently inverted on the storefront — prove it is fixed, don't assume. |
| **SC-010** | For several block combinations, assert exactly one `h1` and a valid heading sequence |
| **SC-011** | Same published layout, same order and content on every surface that renders it |
| **SC-012** | No promotion appears twice on the page in any tested combination. ⚠ This is a live defect today — every `inline` banner renders twice. |
| **SC-013** | Empty layout / all blocks hidden / all sources empty → a coherent page, no empty frames, no broken images |
| **SC-014** | `go test ./...` for cart and checkout passes **unmodified** — proof the advertising removal touched nothing |
| **SC-008** | A person using a screen reader reaches every tile's message and CTA. Not an automated scan alone. |
| **SC-009** | No published tile places copy over artwork — asserted at every breakpoint, so contrast is a design-system property |
| **SC-015** | Deliberately attempt to publish something off-brand, inaccessible, or over budget — and be refused |

⚠ **SC-003, SC-004, SC-008 and SC-015 require a person.** That is deliberate: the preceding home-page slice shipped four visual defects — a backwards phone layout, a CTA hierarchy that vanished in dark mode, an orphaned divider, and a scrim that bleached the artwork — through a **fully green test suite**. Layout, contrast and hierarchy are not properties a DOM assertion can see.

---

## 9 — Regression sweep

- `/promotions/<id>` for an address a shopper might hold: serves the "this offer has ended" page with a route back into the store (FR-045). ⚠ Not a 500, and **not a bare 404** — deleting the route is not the same as satisfying the requirement.
- `customer-mobile` still parses the home payload: `banners` is **present and empty**, not absent (⚠ removing the key is a wire break for builds in the field).
- Discount, cart and checkout flows unchanged end to end.
- `make storefront-locks` — re-record deliberately if a locked file changed, and commit the baseline with the change.

---

## Known open items to carry into tasks

1. **PostHog is not initialised on `customer-web`.** Storefront-side product analytics for this feature is therefore unavailable; the declared telemetry is back-office and hot-path only. Recorded, not worked around.
2. **The revalidation secret** must be operator-supplied and shared between the admin service and the storefront. ⚠ Per the constitution's Real-World Identifiers rule it fails loudly when unset — it is never defaulted.

⚠ **Two items that used to sit here now have owning tasks**, because "deferred to tasks" in three artifacts and picked up by none is how a gap survives a review: the block catalogue is confirmed against the real page (T009a) and the canvas dimensions against the real bento (T055a). The contrast decode is no longer an open item at all — copy never sits over artwork, so there is nothing to decode.
