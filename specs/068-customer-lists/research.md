# Research: Customer Lists

Every finding was read from the code on `dev` at 2026-10-04.

## R0. What the code says that the spec did not

Two findings sent a change back to [spec.md](spec.md):

1. **The verdict has three values, not five.** 033's spec names five purchasability outcomes. Two
   of them (`not_delivered_to_your_area`, `not_yet_determined`) were derived from delivery zones,
   which were later withdrawn; `saveditems/service.go` now declares three (`purchasable`,
   `temporarily_unavailable`, `no_longer_sold`) and `listSQL` takes no postcode. FR-023 now says
   "exactly as the saved-items list states it today", and the 047 dependency is removed.
2. **"A chooser wherever the heart is shown" cannot hold on a tile.** FR-014 is narrowed to four
   named entry points (R6).

## R1. How lists are stored

**Decision**: keep `public.customer_saved_item` exactly as it is and give it a new meaning it
already fits: **one row per saved product**. Add two tables beside it:

- `public.customer_list` — one row per list, including one default list per customer.
- `public.customer_list_entry` — one row per (list, product).

**Rationale**: the spec's "Saved product" entity is, column for column, today's
`customer_saved_item`: one row per (customer, product), carrying the remembered price and the time
of first save. Keeping it gives three requirements for free:

| Requirement | Why it holds without new code |
|---|---|
| FR-021 / SC-005 — hearts cost no more, whatever the number of lists | `membershipSQL` is unchanged. It reads one table by primary key and never touches a list. |
| FR-031 — one remembered price per product, from the first save | It is the existing `saved_price_amount`, written once by the existing insert. |
| FR-033 — the limit counts distinct products | `countSavedSQL` is unchanged. |

The invariant is **a saved-product row exists if and only if the product is in at least one
list**. Half of it is the database's: a composite foreign key from the entry to
`customer_saved_item (customer_id, product_id)` means an entry cannot exist without its saved
product. The other half (no saved product without an entry) is kept by one statement,
`sweepOrphansSQL`, run inside every transaction that removes an entry or a list. House style
forbids triggers, so it is a transaction rule; every writer already takes the per-customer advisory
lock (`lockCustomerSQL`), so no writer can observe the gap.

**Alternatives considered**:
- *Move membership to `(list, product)` and drop `customer_saved_item`* (the PRD's sketch).
  Rejected: the heart read becomes a `DISTINCT` over a join, the remembered price needs a home
  anyway, and the cap becomes `count(DISTINCT …)`. Three working statements rewritten to arrive
  where they started.
- *A `list_id` column on `customer_saved_item`, PK `(customer, list, product)`.* Rejected: the
  price would be stored once per list, which is the two-answers shape FR-031 forbids.
- *A boolean `in_default` on the saved row, with entries only for named lists.* Rejected: the
  default list needs its own position per product (FR-017), so the flag grows a timestamp and the
  default list becomes a special case in every query.

## R2. The default list

**Decision**: a real row in `customer_list` with `is_default = true` and **`name IS NULL`**,
created lazily inside the first write that needs it, and addressed on the wire by the literal id
`default`.

**Rationale**:
- *A real row* keeps every entry query uniform. No query branches on "is this the default".
- *Lazy creation* because customers are created on two paths (the hot path's identity resolver and
  the cold path's registration) and neither should learn about lists. `ensureDefaultSQL` is an
  `INSERT … ON CONFLICT DO NOTHING` against a partial unique index (one default per customer), run
  under the advisory lock. The migration creates the row for every customer who has saved items.
- *The alias `default`* means no client ever needs the default list's uuid, and a customer with no
  row yet reads the same as one with an empty row. `GET /v1/lists` synthesises the default entry
  when no row exists. It never writes.
- *`name IS NULL`* because "Saved" is display text, owned by each client's strings. A CHECK ties
  the two together: default ⇔ no name.

The reserved-name rule (a shopper cannot name a list "Saved") is one Go constant compared
case-insensitively in the service. It cannot be the unique index's job, because the default row
has no name to collide with.

## R3. Name rules, in one place each

**Decision**:

| Rule | Home |
|---|---|
| Normalise: strip control characters, collapse whitespace runs to one space, trim | `saveditems.NormaliseListName` (Go). Clients send what was typed. |
| Length 1–40, counted in code points | Go (`utf8.RuneCountInString`), with a database CHECK (`char_length`) as backstop |
| Unique per customer, ignoring case | **the database only**: a unique index on `(customer_id, lower(name))` |
| Reserved "Saved" | Go, one constant |

**Rationale**: uniqueness has exactly one mechanism. A service-side "does this name exist" check
followed by an insert admits a race (two devices, same name, same moment — a spec edge case), and
a Go case-fold that disagrees with Postgres `lower()` would produce a name the service accepts and
the index refuses. So the service does not check; it inserts and maps the unique violation
(`23505` on the named constraint) to `name_taken`.

Clients show a live character count from `LIST_NAME_MAX` in `packages/shared-types`. The count is
advisory; the server decides (FR-009, SC-009). The Go constant is pinned to the TypeScript one by
the wire-contract fixture.

**Not done**: Unicode normalisation (NFC). It needs `golang.org/x/text`, a new dependency, to
prevent two names that look identical and differ in composition. The harm is a shopper with two
lists they named the same on purpose with different keyboards.

## R4. One list query, not two

**Decision**: `listSQL` is re-pointed, not copied. It becomes

```
FROM public.customer_list_entry e
JOIN public.customer_saved_item s ON (s.customer_id, s.product_id) = (e.customer_id, e.product_id)
JOIN public.product p ON p.id = e.product_id
…
WHERE e.customer_id = $1 AND e.list_id = $2
ORDER BY e.added_at DESC
```

and serves every list, the default included. `GET /v1/saved` resolves `default` and calls it.

**Rationale**: the verdict `CASE` in that statement is the platform's one classification of *why*
a product cannot be bought, marked `availability-exempt` and kept in step with
`platform/availability` by hand. 067 (product approval) adds a term to availability and will have
to visit this `CASE`. A second copy for named lists would be a second place to forget.

`savedAt` on the wire becomes the entry's `added_at` (position in *this* list); `savedPriceAmount`
and `priceDropped` still come from the saved-product row (FR-031).

## R5. What the heart must know, and who enforces FR-020

**Decision**: two layers.

1. **The server refuses.** `DELETE /v1/saved/{productId}` (the heart's un-save) answers
   `409 in_named_lists` and removes nothing when the product is in any named list.
2. **The client knows in advance.** `GET /v1/saved/ids` gains one additive field,
   `namedProductIds`: the subset of saved products held in a named list. The heart reads it to
   open the chooser instead of sending the delete.

**Rationale**: FR-020 and SC-008 say no sequence of heart taps removes a product from a named
list. A client-only rule is not that guarantee: **every customer-mobile build already installed
calls `DELETE /v1/saved/{id}` on a filled heart.** With the server rule, an old build's heart
flips off, the `409` lands, and its existing revert (`SavedUseCases.kt:61`, `saved-actions.ts`)
flips it back. Nothing is lost; the old build simply cannot un-save that product.

The advance knowledge avoids that flicker on current builds. It is still one request per screen
(FR-021): the same route, one more array, bounded by the same 200 cap.

**⚠ The web mirror's storage version does not change.** `saved-store.ts` discards its envelope on
a version mismatch, and for a guest that envelope is the only copy of their saved items. Bumping
`effy:saved:v1` to carry the new field would empty every guest's list on deploy. The field is
added as optional inside the v1 envelope; an absent field reads as empty, which is the safe
direction (the heart sends a delete, the server refuses it).

**Alternatives considered**:
- *Per-product list ids in the membership read.* Rejected: grows with lists × products and puts
  list ids on every public page for one decision that needs a boolean.
- *Ask the server at tap time.* Rejected: a network wait before the heart responds reverses 033
  FR-012.

## R6. Where the chooser opens

**Decision**: four entry points, the same on web and mobile (FR-014 as narrowed):

| Entry point | Web | Mobile |
|---|---|---|
| Product page | an "Add to list" control beside the heart | the same |
| A row on a list's page | row action | row action |
| After a one-tap save | the confirmation toast carries "Add to a list" | snackbar action |
| Filled heart, product in a named list | opens the chooser | opens the chooser |

**Rationale**: a tile's heart has one tap and FR-019 keeps it for un-saving. Press-and-hold has no
web equivalent, so offering it on mobile only would break FR-041.

**The chooser is one request**: `GET /v1/lists?productId=…` returns every list with
`containsProduct`. Toggling a list is a `PUT`/`DELETE` on that list's entry; "new list" is a
`POST /v1/lists` carrying the product, so create-and-add is one transaction (FR-015).

A guest who opens it gets `401` from that read. That is the signal to show "Lists need an
account" with a sign-in link (FR-037); the save they just made is already in the device mirror.

## R7. The web bundle

**Decision**: the chooser is a separate module loaded with `import()` at the moment it is opened.
`SaveControl` gains only the branch that triggers the load. It is built on the native `<dialog>`
element, as `MiniCart` is, not on a dialog library.

**Rationale**: the guest budget is 174 KB with 2.1–5.5 KB of headroom per route
(`bundle-budget.mjs`). `SaveControl` is on `/` and `/product/[id]`. `MiniCart` records that a
dialog library costs more than the headroom on its own.

`/search` carries no heart on web (033 FR-007 as amended) and therefore no chooser: SC-012 holds
by absence. The post-save confirmation uses `toast-store`, already in the guest chunk through
`AddToCartControl`.

**Measured** (T001, T020, T034; KB gzipped, limit 174):

| Route | Before 068 | After |
|---|---|---|
| `/` | 173.7 | 173.8 |
| `/search` | 173.7 | 173.4 |
| `/product/[id]` | 171.3 | 171.4 |
| `/cart` | 172.8 | 172.6 |

⚠ **The headroom on `/` was 0.3 KB, not the 2.1–5.5 KB `bundle-budget.mjs` records.** It is 0.2 KB
now. The heart's whole cost on the guest path is the branch that triggers the import and one
`toast` call.

⚠ **`/search` is not byte-identical, as this plan first promised.** It is 0.3 KB smaller: adding a
dynamic import regrouped the shared chunks. No code on that route changed, and SC-012 (it displays
as fast) holds.

The lists pages live under `(account)`, which is budgeted separately.

## R8. Routes and where they live

**Decision**: hot path, in the existing `saveditems` package, mounted at `/v1/lists`. `/v1/saved/*`
keeps every route it has, each now defined as the default list.

**Rationale**: saved items is hot-path commerce (033 R1). One package owns the invariant in R1;
splitting lists into a sibling package would put the two halves of one transaction in two places.
Keeping `/v1/saved/*` is what lets installed mobile builds keep working with no change (R10).

Full surface: [contracts/customer-lists.md](contracts/customer-lists.md).

## R9. Limits

**Decision**: `ListLimit = 20` named lists, checked inside the creating transaction under the
advisory lock, exactly as `AccountCap` is. `AccountCap = 200` and `GuestCap = 50` are untouched.

Adding an already-saved product to another list skips the cap check (FR-033): the existing
`alreadySavedSQL` branch does this today for a re-save.

## R10. Deploy order and old clients

**Decision**: migration → core-api → customer-web. Mobile ships whenever.

| Client state | Behaviour |
|---|---|
| Old web or mobile against new core-api | Every `/v1/saved/*` call works. Hearts are filled for products in named lists. Un-saving one of those is refused and reverts. No named-list UI. |
| New client against old core-api | `/v1/lists` is `404`. Web deploys after core-api, so this is only a mobile build pointed at a stale backend. The lists read failing leaves the Saved list working. |

**⚠ The window between the migration and the core-api deploy leaks orphans.** The old core-api
keeps inserting `customer_saved_item` rows with no entry. They are saved (heart filled, counted)
and appear in no list. The migration's backfill statement is idempotent, so the fix is to run it
again after core-api is live; [quickstart.md](quickstart.md) carries the statement and a
zero-orphans check. The old core-api's deletes are safe: the entry's foreign key cascades.

## R11. Guest → account join

**Decision**: `Merge` gains two statements and keeps its contract: ensure the default list, and
insert a default-list entry for each merged product (`ON CONFLICT DO NOTHING`). A product already
saved only in a named list gains a default entry, because the shopper tapped its heart on this
device and FR-038 says device saves join "Saved".

`added` keeps its meaning (new saved products), so the disclosed count is unchanged for existing
clients.

## R12. Telemetry and privacy

**Decision**: three events, none carrying a name.

| Event | Properties |
|---|---|
| `saved_list_created` | `source` (`chooser` \| `lists_page`), `withProduct` (bool) |
| `saved_list_entry_added` | `listKind` (`default` \| `named`), `source` (`chooser` \| `undo`) |
| `saved_list_add_all` | `listKind`, `addedCount`, `skippedCount` |

**Rationale**: FR-039 needs creation, named-list adds, and add-all split by kind. FR-040 forbids
the name; its length is withheld too. A test parses the three declarations and fails on any
property that is a bare `string` or is called name/label/title/text/length (proven by adding
`listName: string`).

**Changed while building**: the heart's own saves are not counted by `saved_list_entry_added`
(there is no `heart` source). Emitting it would have put the telemetry module on the heart's guest
path for an event FR-039 does not ask for — a heart save is always to "Saved".

Names never appear in a path or query string (lists are addressed by id), nor in the page title of
`/saved/[listId]`, and core-api's request log does not record bodies (066 R7 checked this). A sweep
in quickstart greps a walked session's logs for a sentinel name.

⚠ Known state, not introduced here: PostHog is not initialised on customer-web, so these are
declared, typed and called, and emit nothing until it is. ⚠ **customer-mobile has no event taxonomy
at all** (033's saved events were never declared there either), so nothing is declared on mobile.

## R13. Undo and the remembered price

**Finding, carried not introduced**: removing a product from its last list deletes the saved row
and its remembered price; undo re-creates it at today's price. 033's undo already behaves this
way (`insertSavedSQL` always takes the current price; `restoreSavedAt` restores position only).
Undo within a list while the product is still in another list keeps the price, because the saved
row never went away.

## R14. Account closure and erasure

`customer_list` cascades from `customer`, and entries from the list, so a deleted customer's lists
go with them.

**Checked at T003**: `git grep "customer_saved_item\|cart_saved_item"` across `apis`, `db/seeds`,
`db/reference` and `packages/legal-content` finds no reader outside the `saveditems` and `cart`
packages. No closure, export or erasure path enumerates the table, so nothing needs the new tables
named. The privacy inventory's "Saved items & cart" entry
(`packages/legal-content/src/inventory.ts`) already covers lists: same data category, same
retention.
