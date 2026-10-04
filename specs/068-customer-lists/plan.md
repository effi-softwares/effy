# Implementation Plan: Customer Lists

**Branch**: `068-customer-lists` | **Date**: 2026-10-04 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/068-customer-lists/spec.md`

## Summary

A signed-in shopper creates named lists ("Weekly Items"), places saved products in any number of
them, and adds everything purchasable in one list to the cart. The existing saved-items list
becomes the default list, "Saved".

The existing table `customer_saved_item` is kept, column for column, and now means "a product this
shopper has saved, in any list". Two tables are added beside it: `customer_list` and
`customer_list_entry`. That choice leaves three working statements untouched: the membership read
that fills the hearts, the 200-product cap, and the remembered price (research R1).

Everything is on the hot path, in the existing `saveditems` package. `/v1/saved/*` keeps every
route as "the default list", so installed mobile builds keep working; `/v1/lists/*` is new.

The heart's safety rule (a tap never removes a product from a named list) is enforced by the
server, because builds already on phones send the un-save without knowing lists exist (research
R5).

## Technical Context

**Language/Version**: Go (`apis/core-api`), TypeScript (`packages/shared-types`; `apps/customer-web`
on Next 16 / React 19), Kotlin 2.4 / Compose Multiplatform (`apps/customer-mobile`)

**Primary Dependencies**: none new.

**Storage**: PostgreSQL 16, raw SQL, one forward-only Goose migration: two tables, a backfill, no
column change to the existing table.

**Testing**: `go test` (unit + container against the real migrations), Vitest, Kotlin `commonTest`
(Android host + iOS simulator compile), the commerce contract drift guard, the Go↔Kotlin wire
contract pair, the customer-web bundle gate.

**Target Platform**: customer-web, customer-mobile (Android + iOS); Fargate (core-api).

**Project Type**: monorepo — one backend path, one web app, one mobile app.

**Performance Goals**: the heart read stays one request per screen and one unchanged statement
(SC-005). The chooser is one request. A list page is one statement.

**Constraints**: guest bundle gate 174 KB with 2.1–5.5 KB headroom per route, `/search`
byte-identical (SC-012); list names never in logs, paths or analytics (FR-040); no change to the
cart's save-for-later; the web mirror's storage version must not change (research R5).

**Scale/Scope**: 1 migration; 1 shared-types file + regenerated Kotlin; 1 Go package (8 new
routes, 3 changed); customer-web (store, heart, chooser, lists pages, 6 proxy routes);
customer-mobile (store, heart, chooser sheet, saved screen).

### Unknowns

All resolved in [research.md](research.md): storage (R1), the default list (R2), name rules (R3),
one list query (R4), the heart and who enforces it (R5), chooser entry points (R6), the web bundle
(R7), routes (R8), limits (R9), deploy order and old clients (R10), the guest join (R11), telemetry
(R12). Two findings are carried rather than resolved: undo loses the price on a last-entry removal
(R13, 033's behaviour), and the account-closure table enumeration needs checking at build (R14).

## Constitution Check

| Principle | Verdict | Note |
|---|---|---|
| I. Spec-driven | PASS | Research sent two corrections back to the spec before this plan was written (R0): three verdicts, not five; FR-014 narrowed. |
| II. Shared contracts | PASS | DTOs and the two limits are declared once in `packages/shared-types`; Kotlin is generated. Go mirrors the two constants, pinned by the wire-contract pair. Refusal reasons are a closed set in the contract. |
| III. Dual-path discipline | PASS | Customer commerce read/write on the hot path, in the package that already owns saved items. No cold-path work, no events. |
| IV. Auth isolation | PASS | Same customer verifier and identity middleware; no new authorizer. Cross-customer access is unrepresentable in the schema (composite foreign key) as well as refused in every statement. |
| V. Design | PASS | No new token. Lists are **tabs** over the existing row list; the chooser is a sheet (mobile) / native dialog (web) of checkbox rows. No cards. Heart keeps its stable accessible name; the chooser's entry points have their own labelled controls. |
| VI. Layered architecture | PASS | handler → service → repository, rows mapped to domain; mobile ViewModel → UseCase → Repository. One list query, re-pointed rather than copied (R4). |
| VII. Observability | PASS | Three typed events, none carrying a name (below). |

**Gate result**: no violations. Re-checked after Phase 1 design: unchanged. Complexity Tracking is
empty.

### Telemetry declared (Principle VII)

| Event | Surface | Properties | Purpose |
|---|---|---|---|
| `saved_list_created` | web | `source` (`chooser` \| `lists_page`), `withProduct` | adoption (FR-039) |
| `saved_list_entry_added` | web | `listKind` (`default` \| `named`), `source` (`chooser` \| `undo`) | named-list use |
| `saved_list_add_all` | web | `listKind`, `addedCount`, `skippedCount` | the weekly-shop action, named vs "Saved" |

As built (research R12): web only, because customer-mobile has no event taxonomy to declare them in.

⚠ Never the list's name or its length. ⚠ Known state, not introduced here: PostHog is not
initialised on customer-web and mobile telemetry is deferred, so these are declared and typed and
emit nothing until those land.

## Project Structure

### Documentation (this feature)

```text
specs/068-customer-lists/
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── customer-lists.md
└── checklists/requirements.md
```

### Source code

```text
db/migrations/
└── <ts>_customer_lists.sql                     # NEW — customer_list, customer_list_entry, backfill

packages/shared-types/src/
├── saved-item.ts                               # SavedListDTO, requests, limits; membership gains namedProductIds
└── customer-commerce-contract.ts               # register each new type in all three places
# + regenerated: contract/CommerceDto.kt, contract/commerce-schema.json

apis/core-api/internal/features/saveditems/
├── repository.go                               # listSQL re-pointed at entries; Save/Remove/Merge gain entry + refusal
├── lists_repository.go                         # NEW — lists CRUD, entries, sweepOrphansSQL, ensureDefaultSQL
├── service.go                                  # AddAllToCart takes a list; membership gains named ids
├── lists_service.go                            # NEW — NormaliseListName, ListLimit, ListNameMax, reserved name
├── handler.go                                  # 409 in_named_lists on the heart's un-save
├── lists_handler.go                            # NEW — /v1/lists routes, registered beside /v1/saved
└── *_test.go                                   # unit, container, wire contract

apps/customer-web/
├── lib/saved-store.ts                          # v1 envelope gains optional namedIds
├── lib/saved-actions.ts                        # heart: open chooser when named; handle 409
├── lib/list-actions.ts                         # NEW — list + entry mutations (account pages and chooser only)
├── app/(shop)/_components/SaveControl.tsx      # the branch + on-demand import
├── app/(shop)/_components/ListChooser.tsx      # NEW — native <dialog>; loaded with import()
├── app/(shop)/product/[id]/page.tsx            # "Add to list" beside the heart
├── app/(account)/saved/page.tsx                # the default list + lists tabs
├── app/(account)/saved/[listId]/page.tsx       # NEW — a named list's page
├── app/(account)/saved/SavedList.tsx           # takes a list; per-list add-all, remove, undo
├── app/(account)/saved/ListTabs.tsx            # NEW — tabs with counts, new list, rename, delete
└── app/api/lists/**                            # NEW — proxy routes

apps/customer-mobile/shared/src/commonMain/kotlin/com/effyshopping/customer/mobile/features/saved/
├── domain/Saved.kt                             # SavedList, ListRepository
├── domain/SavedStore.kt                        # named set beside saved
├── domain/SavedUseCases.kt                     # toggle branches on named; list use cases
├── data/HttpSavedRepository.kt                 # /v1/lists
├── presentation/SaveControl.kt                 # unchanged control; callers pass the branch
├── presentation/ListChooserSheet.kt            # NEW — bottom sheet
├── presentation/SavedScreen.kt                 # list tabs, per-list content, manage menu
└── presentation/SavedViewModel.kt
# + features/catalog/presentation/ProductDetailScreen.kt — "Add to list"

docs/audiences/customer-capabilities.md         # parity register
specs/033-customer-saved-items/spec.md          # FR-066 gains a pointer: retired by 068
```

**Structure decision**: lists are built inside the existing saved-items slice on every surface
rather than as a sibling feature. One Go package owns the saved-product invariant and both halves
of every transaction that touches it; one web store and one mobile store stay the single source
the heart reads.

## Phase plan

1. **Foundation** — baseline measurements; migration with backfill; shared-types + regenerated
   contract; Go repository re-pointed at entries with `/v1/saved/*` behaving exactly as before
   (the existing 033 tests pass unmodified except where they assert storage). Nothing user-visible.
2. **US3 the heart stays true** — server refusal `in_named_lists`; `namedProductIds`; both client
   stores and hearts. Built before any way to create a named list exists, so the destructive tap is
   closed before it can be opened.
3. **US1 make and fill a list** — `/v1/lists` create/read/add; chooser on both surfaces at its four
   entry points; lists tabs and a list's page. Bundle gate re-run here.
4. **US2 the weekly shop** — per-list add-all; in-cart statement on every list's rows.
5. **US4 tidy** — rename, remove with undo, delete with the confirmation counts.
6. **US5 guests** — sign-in prompt in the chooser; merge places default entries.
7. **Polish** — telemetry declarations, log sweep, accessibility pass on chooser and tabs, parity
   register, 033 pointer, account-closure check (R14), quickstart walk.

## Risks

| Risk | Mitigation |
|---|---|
| A saved product with no entry: heart filled, in no list, invisible | Composite foreign key for one direction; one sweep statement for the other, under the per-customer lock; a container test asserts zero orphans after every write path. |
| The deploy window: old core-api writes saved rows with no entry | Idempotent repair statement and a zero-orphans check in quickstart §2, run before customer-web is pushed (R10). |
| An installed mobile build un-saves a product out of a named list | Refused by the server (`409`), and the old build's own revert restores the heart. Walk D3 proves it on a device. |
| Guests lose their saved items on deploy | The web mirror's storage version stays `v1`; the new field is optional. A test loads a pre-068 envelope and asserts every id survives. |
| The chooser pushes `/` or `/product/[id]` over 174 KB | Loaded with `import()`; native `<dialog>`; gate run immediately after the heart changes, before the rest of US1. If it does not fit, reduce the web presentation — the budget is not raised. |
| 067 adds an approval term to availability and a copied list query misses it | There is one `listSQL` for every list (R4). |
| Name uniqueness disagrees between Go and Postgres | Uniqueness lives only in the unique index; the service maps the violation (R3). |
| A list name reaches a log | Names travel only in request and response bodies; lists are addressed by id. Sentinel sweep in quickstart §4. |
| Tabs do not scale to 20 lists | The tab row scrolls horizontally on both surfaces; a "Lists" overflow lists all of them. Checked at 20 in the walk. |
| Two customers' lists cross | Every statement is keyed by the resolved customer; the entry's foreign key to `(list id, customer id)` makes a cross-customer entry unrepresentable. Container test with two customers. |

## Complexity Tracking

No constitution violations to justify.
