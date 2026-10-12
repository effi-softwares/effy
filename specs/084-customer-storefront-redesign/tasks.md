# Tasks: Customer Storefront Redesign

**Input**: Design documents from `/specs/084-customer-storefront-redesign/`

**Prerequisites**: plan.md, spec.md, screen-index.md, research.md, data-model.md, contracts/

**Tests**: existing unit and e2e suites are kept green and updated with the screens they cover; new
tests only for new logic (new routes, guards, view-model derivations).

**Format**: `[ID] [P?] [Story] Description` — `[P]` = different files, no dependency. Screen codes
(S1, H1, …) are rows of [screen-index.md](screen-index.md). Web paths are under `apps/customer-web/`.

## Phase 1: Law and setup

- [x] T001 Amend `.specify/memory/constitution.md` to **v3.3.0** (Principle V + Quality Gates: a storefront identity in its own design-system file; light-only storefront; blue action / green brand / black destructive; shadowed cards and card layouts permitted on the storefront; storefront radius scale) with a Sync Impact Report
- [ ] T002 Record totals parity baseline (SC-004): quote + intent totals for the fixed carts, saved to `specs/084-customer-storefront-redesign/parity-baseline.md` (needs the dev gateway; operator may run)
- [ ] T003 [P] Add `vaul`, `cmdk`, `input-otp` to `package.json`; measure with `pnpm size` and record in research.md D4 — **dropped** (research D4, revised): overlays stay native `<dialog>`/`<details>` + CSS; no new dependency

## Phase 2: Foundation (blocks every story)

- [x] T004 Create `packages/design-system/src/storefront/tokens.css` (values + `@theme inline`, no `.dark`) and export `./storefront.css` in `packages/design-system/package.json`
- [x] T005 [P] Copy Geist + Geist Mono variable fonts and OFL licence to `packages/design-system/src/storefront/fonts/`; load with `next/font/local` in `app/layout.tsx` — done as `@font-face` in the storefront token file (the repo's proven path), not `next/font`
- [x] T006 [P] `packages/design-system/scripts/check-storefront-tokens.mjs` + wire into the package `test` script
- [x] T007 Extend `packages/design-system/scripts/check-token-usage.mjs` to scan `apps/customer-web` against the storefront `@theme`
- [x] T008 [P] `scripts/check-no-storefront-red.sh`
- [x] T009 Rewrite `app/globals.css`: import storefront tokens, reference `container` (1400 / 16-24-32), base type; drop General Sans weight bump; update `e2e/container.spec.ts` — globals done; **`e2e/container.spec.ts` still asserts 1280 — to update with the e2e pass (T072)**
- [ ] T010 Generate the reference primitives into `components/ui/` (see contracts/ui-contract.md), incl. `responsive-dialog.tsx`; delete `components/storefront/kit.tsx` usages as they are replaced — card, badge, alert, misc, **button, form (input, label, textarea, switch)** done; storefront files no longer import the console's Button/Badge/Input. Overlays in the account area still use the console's `ResponsiveModal`/`AlertDialog` (shadcn token names only — verified). Remaining: table, tabs, pagination
- [ ] T011 [P] `components/storefront/Wordmark.tsx`; replace `BrandMark.tsx`, `app/icon.svg`, `favicon.ico`, `apple-icon.png`, `manifest.ts` colours, `public/` icons — wordmark + `icon.svg` done; **`favicon.ico`, `apple-icon.png`, `public/web-app-*.png`, `manifest.ts` still the old mark**
- [ ] T012 [P] `components/storefront/{PageHeader,EmptyState,InlineError,Price,StatusBadge}.tsx` — `EmptyState`, `PageHeader` reshaped in kit; `Price`, `StatusBadge`, `InlineError` to do
- [ ] T013 Extend `gen-stripe-appearance.mjs` to emit `packages/design-system/stripe/storefront-appearance.ts` from the storefront tokens (handoff spec K15)

## Phase 3: US1 — one new look on every page (P1)

- [x] T014 [US1] `components/chrome/Header.tsx` + `DeliveryBar.tsx` (server; serviceability by default address / postcode cookie) — S1
- [x] T015 [P] [US1] `components/chrome/AislesMenu.tsx` (mega menu / sheet) — H6, H11
- [x] T016 [P] [US1] `components/chrome/AccountMenu.tsx` with points in the trigger — H8
- [x] T017 [P] [US1] `components/chrome/CartSheet.tsx` (replaces `MiniCart`) — H9, H12
- [x] T018 [P] [US1] `components/chrome/BottomBar.tsx` + phone menu sheet — H10, H11
- [x] T019 [P] [US1] `components/chrome/Footer.tsx` (newsletter, links, payment marks, app badges) — S2
- [x] T020 [P] [US1] `components/chrome/CheckoutHeader.tsx` + footer — S3
- [x] T021 [P] [US1] `components/chrome/AuthCard.tsx`; `(auth)/layout.tsx` — S6
- [x] T022 [US1] `components/chrome/AccountNav.tsx`; `(account)/layout.tsx` sidebar frame — S5
- [x] T023 [US1] Wire `(shop)/layout.tsx`; toast region on the new Toast; delete `StorefrontChrome`, `InfoBar`, `PrimaryNav`, `MobileNav*`, `StorefrontFooter`, `ValueStrip`, `BrandPanel` — frame wired; old `InfoBar`, `PrimaryNav`, `ValueStrip`, `Hero`, `CartBadge`, `CategoryChips`, `Display`, `components/Avatar`, `BrandPanel`, `AccountTabs`, `lib/hero-asset` **deleted** (with `Hero.test`, `ValueStrip.test` — 25 tests)

## Phase 4: US2 — find and choose products (P1)

- [x] T024 [US2] `components/storefront/{ProductCard,Stepper,ProductGrid,ProductRail}.tsx` — S4
- [x] T025 [US2] Home: hero + offer tiles, aisles, rails, offers, brands, recently viewed, app note — H1, H2, H10
- [x] T026 [US2] Home shortcuts row (signed in) from existing reads — H1
- [x] T027 [P] [US2] Home loading / empty / unavailable — H3, H4, H5 — empty / unavailable / skeleton reshaped; not yet walked
- [x] T028 [US2] Listing: filter sidebar, chips, sort, count, paging; phone filter sheet — B1–B3, B7, B8
- [x] T029 [P] [US2] Listing loading / no results / error — B4, B5, B6, B9
- [x] T030 [US2] Product page, single page, delivery + points panel, sticky phone bar — P1, P2, P6 — sticky phone add bar not built; buy box is in flow
- [ ] T031 [P] [US2] Add-to-list dialog — P5 — chooser dialog reshaped to the responsive dialog; not walked
- [ ] T032 [P] [US2] `not-found.tsx`, `(shop)/error.tsx`, `global-error` — I14, I15, I16

## Phase 5: US3 — cart, checkout, payment (P1)

- [x] T033 [US3] `components/storefront/OrderSummary.tsx` (fee lines, free-delivery progress, points rows)
- [x] T034 [US3] Cart page: lines, promo, below-minimum, rails — C1, C2, C5
- [x] T035 [US3] Save for later + restore on the existing routes — C1
- [x] T036 [P] [US3] Empty cart state; empty-cart confirm + undo toast — C3, C4, C6
- [x] T037 [US3] Checkout: address cards, `DeliveryPicker` (same-day row, standard day strip + windows), courier, refusal — K1–K4, K16 — window picker is radio cards; the "we hold your window for 10 minutes" note is NOT shown (no hold duration is stated anywhere I could verify)
- [x] T038 [P] [US3] Checkout: instructions, points, billing, review, add-address dialog — K1, K5
- [ ] T039 [US3] Payment step frame, storefront appearance, declined / processing — K6–K11, K17, K18 — **restyled only.** The step still uses the split card fields + custom saved-card list (051), not the Payment Element with tabs the handoff spec describes; swapping it is a money-path change with its own tests and is not done. T013 (generated appearance) also open
- [x] T040 [US3] Confirmation paid / pending / not completed — K12–K14, K19
- [ ] T041 [US3] Totals parity check against T002

## Phase 6: US4 — orders (P2)

- [ ] T042 [P] [US4] `OrderSummaryDTO` + `thumbnails`, `stage` in `packages/shared-types/src/order.ts`
- [ ] T043 [US4] `apis/edge-api/commerce/src/orders/{repository,service}.ts`: thumbnails + stage on the list; tests
- [ ] T044 [US4] `components/storefront/OrderTracker.tsx`
- [x] T045 [US4] Order history + empty — O1, O2, O9 — rows show date, status, who delivers, total, both actions; pictures appear when the server sends `thumbnails` (T043 not written yet)
- [ ] T046 [US4] Order page (all stages, moved to courier), receipt, refunds — O3–O6, O10 — breadcrumb, heading, cards and the Unavailable notice restyled; receipt, tracker (`ProgressTrack`), `ArrivalPanel` keep their 052 structure — **the reference tracker and receipt table are not rebuilt**
- [ ] T047 [P] [US4] Report-a-problem dialog; cancel alert dialog — O7, O8

## Phase 7: US5 — account (P2)

- [x] T048 [US5] Routes: `/account` Overview; `/account/{personal,payment,points,legal}`; `?tab=` redirects — A1, A20 — done: `/account` Overview, `/account/{personal,payment,points,legal,security,privacy}`, `/addresses`; `?tab=` redirects
- [ ] T049 [P] [US5] Personal info + edit name / change number panels — A2, A12, A13, A23 — page exists; edit panels unchanged (already dialog ≥ md / drawer below)
- [ ] T050 [P] [US5] Address book + edit panel + delete blocked — A3, A11, A19, A22, A28 — page exists, coverage note restyled; rows/dialogs otherwise unchanged
- [x] T051 [P] [US5] Payment methods — A4
- [x] T052 [P] [US5] Effy points — A5, A21
- [x] T053 [P] [US5] Security: set / change password, sign out everywhere — A6, A7, A15–A17, A25, A26
- [x] T054 [P] [US5] Privacy & data: delete (code), blocked — A8, A9, A18, A27
- [x] T055 [P] [US5] Legal — A10

## Phase 8: US6 — sign in and join (P2)

- [ ] T056 [US6] Sign in: email, code, password, from-checkout note, cookie notice — J1–J4, J7, J16, J17 — frame (one centred card), inputs, buttons, notes restyled through `AuthKit`; individual steps not walked; cookie notice (J7) not built
- [ ] T057 [P] [US6] Join: email, code, password, name — J8–J11, J18, J19
- [ ] T058 [P] [US6] Reset: email, sent, new password, done — J12–J15
- [ ] T059 [P] [US6] Code expired; Google failed — J5, J6

## Phase 9: US7 — saved items (P2)

- [ ] T060 [US7] Saved items, named list, empty, phone — V1–V3, V6
- [ ] T061 [P] [US7] New list dialog; delete list alert — V4, V5

## Phase 10: US8 — offers (P3)

- [ ] T062 [P] [US8] `PromotionListDTO` in shared-types; `GET /storefront/v1/promotions` (function, service, repository, `serverless.yml`, test); gateway-capacity test — **dropped**: Home already returns every advertised promotion
- [x] T063 [US8] `/offers` page; proxy read in `lib/api` — P4 — built from the home payload; **no new route needed** (research D7a)
- [x] T064 [US8] Offer page restyle — P3, P7

## Phase 11: US9 — help and information (P3)

- [x] T065 [US9] `/help` with authored answers + search + message form; `/feedback` redirect — I1–I4 — `/help` built (answers need operator review); `/feedback` redirects in `next.config.ts`
- [ ] T066 [P] [US9] About; Deleting your account — I5, I6
- [ ] T067 [P] [US9] Legal index, document, versions — I7–I10
- [ ] T068 [P] [US9] Newsletter results — I11–I13

## Phase 12: Search suggestions (US2, P1 scenario 5 — sequenced late: new backend)

- [ ] T069 [P] [US2] `SuggestionsDTO`; `GET /storefront/v1/suggestions` (function, `suggest/` service + repository, `serverless.yml`, tests)
- [ ] T070 [US2] `components/chrome/SearchCommand.tsx` (debounce, cancel, keyboard; plain-field fallback) — H7

## Phase 13: Sweep

- [ ] T071 Delete every unreferenced old component and style; `check-token-usage` + red sweep green (SC-002)
- [ ] T072 Update unit tests and e2e specs to the new structure; add overview, offers, save-for-later specs
- [ ] T073 `typecheck`, `test`, `build`, `size`, design-system guards, repo sweeps — all green; record bundle numbers
- [ ] T074 Telemetry: new typed events (`cart_saved_for_later`, `search_suggestion_selected`, `offers_viewed`)
- [ ] T075 Docs: CLAUDE.md (design system section, feature list), FEATURE-HISTORY.md entry with deploy order and the open walk; `packages/design-system/README.md`
- [ ] T076 Operator: deploy `storefront`, `commerce`, customer-web; walk screen-index.md (quickstart.md)

## Open after the second build pass (2026-10-12)

- **Guest bundle is over budget** on five routes: `/` 177.0, `/search` 180.0, `/product/[id]` 175.2, `/cart` 180.3, `/help` 176.8 against 174 KB. Not raised. Growth: in-card Add stepper, save control on listing cards, cart-page rail, aisle highlight, search aisle chooser. Operator decision pending: trim or record a new floor.
- **Signed-in pages are not visually verified** — I had no session: checkout, payment, confirmation, orders, order detail, account Overview and sections, saved. They typecheck, build and pass unit tests.
- **e2e not run.** Expect failures from changed structure and labels (`container.spec.ts` width; account `?tab=` flows; `/feedback`).
- **Not started**: T002 parity baseline, T013 Stripe appearance, T042–T044 order-list pictures + tracker, T047 dialogs, T057–T061 (auth steps, saved pages beyond shape sweep), T066–T068 info pages, T069–T070 search suggestions, T072–T076.
- **Icons**: `favicon.ico`, `apple-icon.png`, `public/web-app-*.png`, `manifest.ts` still carry the old mark.
- Pre-existing, not from 084: `depcruise` reports two circular imports inside `packages/shared-types`.

## Dependencies

- T001 → everything UI. Phase 2 → Phases 3–12. Phase 3 (frames) → every page phase.
- T024 (product card) → T025, T028, T030, T034, T032.
- T042 → T043 → T045. T062 → T063. T069 → T070.
- Phases 4–11 are independent of each other once Phase 3 is done; P1 phases go first.

## Held (not in this feature)

- Verify number by texted code — A14, A24 (operator, 2026-10-12).
- Products in an offer — P3/P7 rail (research D7).
- customer-mobile adopting the storefront identity (research D14).
