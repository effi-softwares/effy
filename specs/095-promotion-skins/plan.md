# Implementation Plan: Promotion Skins — Designed by Staff, Chosen per Placement

**Branch**: `095-promotion-skins` | **Date**: 2026-10-21 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/095-promotion-skins/spec.md`

## Summary

A skin becomes data: one layout from a closed list of six plus a typed settings document, declared once in
`@effy/shared-types` with a pure validator and a pure readability check that the server enforces. Promotions gain
pictures (presigned upload into the existing public `promotions/` prefix; the existing media worker makes WebP copies).
Display groups gain a size and default skins; each member may pick a skin and a picture. The two group reads resolve
the skin and picture in their one query and add an optional `skin` to `ShopperPromotionDTO`, so older apps are
unaffected. One React renderer (`@effy/web-kit` `PromoSkin`) serves both customer-web and back-office's previews; the
customer app's `PromoSkin.kt` is pinned to the same fixtures. A seeded set of skins reproduces today's looks exactly,
and a new `mega-nav` group fills a slot in the website's aisles menu.

## Technical Context

**Language/Version**: TypeScript (edge-api `admin`, `storefront`, `commerce`, `shared`; `shared-types`; `web-kit`;
back-office Vite/React 19; customer-web Next.js 16); Kotlin 2.4 / CMP 1.11 (customer app).
**Primary Dependencies**: none new (colour picker is the native `<input type="color">` plus a hex field).
**Storage**: PostgreSQL 16 — one goose migration (two tables, four columns, seeds). S3 media bucket, existing
`promotions/` prefix and rendition worker.
**Testing**: vitest (shared-types fixtures, admin service, storefront read, web-kit renderer, back-office, customer-web),
container tests (migration seeds, FKs), Kotlin host tests (fixtures).
**Target Platform**: Lambda behind the staff gateway (admin) and shared gateway (storefront, commerce — no new route);
web consoles; Android/iOS.
**Performance Goals**: group reads stay one query (two extra joins); pictures served from the CDN as sized WebP;
no layout shift (the renderer reserves the layout's ratio).
**Constraints**:
- Installed apps keep working: `skin` is additive; every 094 field unchanged (FR-023).
- No shopper-visible change on release (FR-025 / SC-002).
- No refresh timers (071); freshness is the existing 60 s.
- No DB trigger that can abort a write.
**Scale/Scope**: staff gateway +10 routes; shared +0. Back-office: Skins list + editor with live preview, Pictures
section on the promotion editor, group editor gains size/defaults and per-member skin/picture. Customer-web: renderer
replaces PromoHero/OffersPanels/CodeOffer/OfferCard drawing; aisles-menu slot. App: renderer replaces HomeBlocks'
promo drawing.

## Constitution Check

| Principle | Verdict | Notes |
|---|---|---|
| I. Spec-driven | ✅ | Spec 095, clarified 2026-10-21; FR-015 refined at planning (separate default for promotions with a code — R3). |
| II. Shared contracts | ✅ | `SkinSettings`, `validateSkin`, `skinContrast`, layout facts and geometry declared once in shared-types; one web renderer used by two apps; Kotlin pinned to shared fixtures. |
| III. One backend | ✅ | Routes added to `admin`; reads extended in `storefront`/`commerce`; the existing `media` worker. No new compute. |
| IV. Auth isolation | ✅ | Admin routes on the back-office authorizer; shopper reads unchanged. |
| V. Design | ⚠ → amendment | Staff-chosen colours inside a skin are a fourth+ hue. Resolved by constitution **v3.6.0** (R13): skins are content, AA-checked on the server, confined to their frame. Flat fills, no gradients, no shadows still hold. Back-office keeps tables and sectioned editors; a skin preview is the artwork, not a metric card. |
| VI. Layering | ✅ | handler → service → repository; validator and contrast are pure; the group reads stay in their repositories. |
| VII. Observability | ✅ | `promotion_banner_tapped` gains `skinId`/`layout`; back-office events; EMF counter for `skin_unreadable` refusals. |
| Hidden fulfilment | ✅ | Shops see nothing new (FR-024; `promotions.guard.test.ts` already covers shop). |

### Complexity Tracking

| Violation | Why needed | Simpler alternative rejected because |
|---|---|---|
| Principle V hue rule | The operator asked for any colour in skins (clarified) | A fixed palette was offered and declined; the exception is bounded to the skin frame and still AA-enforced |

Post-design re-check: ✅ with the v3.6.0 amendment as task 1.

## Project Structure

### Documentation (this feature)

```text
specs/095-promotion-skins/
├── plan.md  research.md  data-model.md  quickstart.md
├── contracts/ (api.md, skin-settings.md)
└── checklists/requirements.md
```

### Source Code (repository root)

```text
db/migrations/2026102xxxxxxx_promotion_skins.sql
packages/shared-types/src/promotion-skins.ts (+ .test.ts, .fixtures.json); promotions.ts (DTO additions)
packages/web-kit/src/promo-skin/ (PromoSkin.tsx, layouts/*.tsx, promo-skin.css, decorations/*.svg.tsx, tests)
apis/edge-api/admin/src/promotion-skins/ (handlers, service, repository, tests)
apis/edge-api/admin/src/promotions/ (images: service + repository + handlers)
apis/edge-api/admin/src/promotion-groups/ (size, defaults, member skin/picture)
apis/edge-api/admin/serverless.yml (+10 routes)
apis/edge-api/shared/src/promotions/ (group read SQL: skin + picture resolution; `SKIN_FOR_MEMBER_SQL`)
apis/edge-api/storefront|commerce (group reads map `skin`)
apps/back-office/src/features/promotion-skins/ (list, editor, preview); promotions/ (Pictures section);
  promotion-groups/ (size, defaults, member skin/picture, group preview)
apps/customer-web/app/(shop)/_components/ (PromoHero, OffersPanels, offers page → PromoSkin);
  components/chrome/AisleMenu.tsx (mega-nav slot)
apps/customer-mobile/shared/.../core/presentation/PromoSkin.kt (+ wire types, fixtures test);
  features/catalog/presentation/HomeBlocks.kt
.specify/memory/constitution.md (v3.6.0)
```

**Structure Decision**: existing services and packages only; the renderer lives in `@effy/web-kit` because two web
apps draw it.

## Delivery in stages (each deployable on its own)

1. **Foundation** — constitution amendment; shared-types (settings, validator, contrast, geometry, fixtures);
   migration with seeds; group reads return `skin` (clients ignore it). *Deploy: migrate → admin → storefront, commerce.*
2. **Renderers at parity** — web-kit `PromoSkin`; customer-web and the app draw from `skin` with today's seeded skins
   (SC-002 screenshots must match). *Deploy: customer-web, app build.*
3. **Pictures** — admin routes + back-office Pictures section; renderers show pictures.
4. **Skin builder** — admin skin routes + back-office Skins list/editor with live preview and contrast.
5. **Placement** — group size/defaults/member skin & picture in back-office; `mega-nav` slot on the website.

## Implementation notes

- **The renderer reserves its box**: each layout × size has a fixed aspect ratio (`skinGeometry`), so a late picture
  never moves the page (SC-006). Picture `<img>` uses `srcset` from `imageWidths` via `renditionUrl`, `object-position`
  from the focus point, and the background colour underneath (FR-021).
- **Decorations** are inline SVG icon sets in web-kit and vector drawables in the app, `aria-hidden` (FR-022).
- **Copy code** uses the existing copy behaviour of `CodeOffer` (web) and the app's clipboard helper.
- **Button words "auto"** are resolved by `buttonWords` on both sides (fixtures).
- **Validation runs twice**: in back-office as the user types (same functions), and authoritatively in the admin
  service. The service also re-runs `skinContrast` on every seeded skin in a container test.
- **Concurrency**: skin update `WHERE id=$1 AND version=$2`; 0 rows → 409 `skin_changed`.
- **Image count** and **member picture ownership** checked under `SELECT … FOR UPDATE` on the promotion row.
- **Group read** joins `promotion_skin` and a lateral picture pick; the storefront read stays cached 60 s; a skin
  edit is therefore seen within a minute (FR-020).
- **Guards**: extend `promotions.guard.test.ts` — `promotion_skin`/`promotion_image` written only by the admin
  service; shop reads none. A web-kit guard: `PromoSkin` uses no Tailwind colour utilities (it must not depend on
  either identity's tokens).

## Deploy order

1. Migration `…_promotion_skins.sql` (`AWS_PROFILE=ef make db-up-one ENV=dev`).
2. `admin`, then `storefront` and `commerce` (`make edge-deploy SERVICE=… ENV=dev`).
3. back-office and customer-web (Amplify), then the customer app build.
