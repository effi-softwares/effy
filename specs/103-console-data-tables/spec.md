# Feature Specification: Console Lists That Work the Same Everywhere

**Feature Branch**: `103-console-data-tables`

**Created**: 2026-10-28

**Status**: Draft

**Input**: User description: "Identify all the tables we have in the back office and shop. All the tables
should have backend pagination, filters, search and everything, re-thinking that we show the correct
attribute for each table. All the tables should also fill the screen even if they do not have much data.
Make a good, optimal, high-performance, highly reliable way to show a data table." Research input:
[docs/research/console-data-tables.md](../../docs/research/console-data-tables.md) — the inventory of all 55
tables in the two consoles, the per-list columns, and the defects found.

## Why this slice exists

**Staff and shop operators spend their day in lists, and every list behaves differently.**

The back-office and shop consoles show 55 tables. About thirty of them are lists that grow forever
(orders, products, drivers, feedback, parcels…). Today:

1. **Each list pages in its own way.** Some have Back/Next, some "Show more", some numbered pages with a
   total. Some tell you how many there are, most do not. Some sort, most do not.
2. **A list forgets where you were.** On Orders, Drivers, Vehicles and Feedback, a search and the page you
   reached are lost on reload, on Back from a record, and cannot be sent to a colleague as a link.
3. **Some lists lose rows.** Orders can skip an order that sits exactly on a page edge. Courier parcels
   stop at 1,000 and exceptions at 200 — anything past that is simply not shown, with no sign that more exist.
4. **Lists do not use the screen.** A short list is a small box with empty page under it; a long list scrolls
   the whole page, taking its column names and page controls out of view.
5. **Columns were chosen screen by screen.** Some lists miss what staff decide from (how long a product has
   waited for review, when a customer last ordered), others show what nobody reads.

### Scope

- **In**: every **list** in back-office and shop-web — a set of records that grows without bound (§ "The
  lists" below) — and every **bounded table inside a record page** (an order's items, a product's sizes, a
  refund list), which gets the same look and column behaviour without paging.
- **Out**: **operational boards and editors** that use rows but are not lists: dispatch rounds and windows
  by day, the hub station, today's windows, the duty panel, exception sequences, the pick list, packing
  bags, the fee-plan, slot and attachment editors, the review before/after comparison, variant editors and
  the admin permission matrix. They keep their layouts.
- **Out**: the customer storefront, the customer and driver apps.

## Clarifications

### Session 2026-10-28

- Q: Small staff-created sets (promotion groups, skins, courier services, fee plans, a shop's team) — paged, or
  shown whole? → A: Shown whole with search and sort, limited to 500 each (recommended default, taken when
  planning started without an answer; the operator may change it).
- Q (during implementation): the attribute library? → A: a capped set too — staff make it and the category
  editor's picker reads it whole; paging it would break the picker.
- Q: Default page size for Orders? → A: 25, like every other list (same basis).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Find a record in any list the same way (Priority: P1)

A back-office staff member opens Orders, then Drivers, then Products, then Feedback. In each one the
controls are in the same places and work the same way: a search box, filters for the attributes that list
is filtered by, column headers that sort where sorting is meaningful, and a footer that says "1–25 of 312"
with a choice of 25, 50 or 100 rows and Back/Next (plus first/last and the page number where the total is
known). Whatever they choose, the result is the whole data set searched, filtered and sorted — never only
the rows already on screen.

**Why this priority**: It is the request itself, and it fixes the most frequent friction. It is useful on
one list alone: the first list converted is immediately better.

**Independent Test**: Convert one list. With more records than fit on one page, search, filter, sort and
page through it; confirm every record matching the filters appears exactly once across the pages, in the
chosen order, and that the count matches.

**Acceptance Scenarios**:

1. **Given** 312 orders, **When** staff open Orders, **Then** they see the first page, "1–25 of 312"
   (or the chosen page size), and can move to the next and last page.
2. **Given** a search that matches records on page 4, **When** staff type it, **Then** the list shows the
   matches from the whole data set starting at page 1.
3. **Given** a sorted list, **When** staff click a sortable column header, **Then** the whole data set is
   re-ordered (not just the visible page) and the header shows the direction; a second click reverses it.
4. **Given** a filter set, **When** staff change the page size, the sort or any filter, **Then** the list
   returns to the first page.
5. **Given** two records with the same sort value on either side of a page edge, **When** staff page
   forward, **Then** both appear, once each.

---

### User Story 2 - A list remembers the view (Priority: P1)

A staff member searches Orders for an email, filters to Courier, sorts by total and goes to page 3. They
open an order, then press Back: the list is exactly as they left it. They reload: same. They copy the
address and send it to a colleague, who sees the same view (their own access permitting).

**Why this priority**: Losing the view on every Back is the most-reported annoyance in the consoles, and
without it shareable links are impossible.

**Independent Test**: On one converted list, set a search, two filters, a sort, a page size and a page;
reload, use Back from a record, and open the address in a new window; confirm all three restore the view.

**Acceptance Scenarios**:

1. **Given** a list with a search, filters, sort, page size and page, **When** staff reload, **Then** all
   of them are restored.
2. **Given** staff opened a record from page 3, **When** they go Back, **Then** they return to page 3 with
   the same filters and the record they opened is visible.
3. **Given** a link to a filtered view, **When** another staff member opens it, **Then** they see that view
   (records they are not allowed to see are not shown).
4. **Given** a link with an unknown filter value, sort or a page past the end, **When** it is opened,
   **Then** the list shows the nearest valid view (the unknown part ignored, the last real page) and
   never an error page.

---

### User Story 3 - Lists fill the window (Priority: P1)

A shop operator opens their Orders on a large monitor with only three orders. The list's frame reaches the
bottom of the window: the three rows at the top, the page controls at the bottom, the frame's own surface
between them. On a busy day with a hundred orders on a page, the column names and the page controls stay
in view while only the rows scroll.

**Why this priority**: It was asked for explicitly, and it is what makes the consoles look finished.

**Independent Test**: Open one converted list with 0, 3 and 100 rows at desktop size; confirm the frame
always reaches the bottom of the window, and with 100 rows the header and footer stay visible while
scrolling.

**Acceptance Scenarios**:

1. **Given** a list with fewer rows than fit, **When** it is shown on a desktop or tablet, **Then** its
   frame extends to the bottom of the window and the page controls sit at the frame's bottom.
2. **Given** a list with more rows than fit, **When** staff scroll, **Then** only the rows move; the column
   names and page controls stay in view.
3. **Given** the empty, no-matches or error state, **When** it is shown, **Then** it is centred inside the
   same full-height frame (the list does not jump in size between states).
4. **Given** a phone, **When** a list is shown, **Then** each row becomes a stacked entry (the most important
   attribute first, a status at the side, the rest beneath) and the page scrolls normally.

---

### User Story 4 - Every list shows the attributes people decide from (Priority: P2)

Each list's columns are re-chosen for what staff or shop operators decide from it (the full per-list table
is in "The lists" below). Examples: the review queue shows **how long a product has waited**; Customers
becomes a **browsable list** showing when each customer joined, their order count, last order and points;
the shop's Availability becomes a table of product, size, stock and status; Orders gains filters for
**status, shop and placed date range**. Less important columns give way on narrower screens in a fixed
order, and staff can hide or show columns; their choice is remembered on that device.

**Why this priority**: The behaviour (Stories 1–3) is the frame; the right columns are what make each
list worth opening. Each list's columns can be revised independently.

**Independent Test**: For each converted list, compare its columns, filters and sorts against its row in
"The lists"; hide a column, reload, confirm it stays hidden on that device.

**Acceptance Scenarios**:

1. **Given** a converted list, **When** it is opened at desktop width, **Then** it shows the columns,
   filters, search scope and sorts its row in "The lists" names.
2. **Given** a narrower window, **When** the list does not fit, **Then** the lowest-priority columns hide
   first, and the record's identifying column and its status never hide.
3. **Given** staff hid a column, **When** they reload on the same device, **Then** it stays hidden; the
   identifying column cannot be hidden.

---

### User Story 5 - Nothing is silently missing, and the list says what it is doing (Priority: P2)

A staff member opens Courier parcels on a heavy day. Every parcel is reachable by paging — nothing is cut
off. While the next page loads, the current rows stay on screen with a thin progress line, rather than
flashing empty. When the connection drops, the list says so inside its frame with a Retry. When nothing
matches, it says "No matches" and offers to clear the filters, which is different from a list that is
genuinely empty.

**Why this priority**: Missing rows are a correctness problem (staff act on a list believing it is
complete); the states are what make the list trustworthy.

**Independent Test**: Load more records than the old caps (1,000 parcels, 200 exceptions) and page to the
last; throttle the connection and page; cut the connection; search for something absent.

**Acceptance Scenarios**:

1. **Given** more records than any old cap, **When** staff page to the end, **Then** every record is
   reachable and the count is correct.
2. **Given** a page is loading, **When** staff wait, **Then** the previous rows remain visible with a
   progress indication; on first open, placeholder rows in the list's shape are shown.
3. **Given** the request fails, **When** the list cannot load, **Then** an error with Retry appears inside
   the frame, and the filters remain as set.
4. **Given** filters that match nothing, **When** the list is shown, **Then** it says nothing matches and
   offers to reset; an empty list with no filters says what will appear there.
5. **Given** something in a list changed elsewhere (an order paid, a parcel moved), **When** the platform
   announces it, **Then** the visible page refreshes without the staff member doing anything and without
   losing their place.

---

### User Story 6 - View counts in one go (Priority: P3)

Lists with views (Orders: Needs a driver, Awaiting hand-over…; Feedback: New, In progress…; Drivers;
Vehicles; Shops; Promotions; Deliverability) show each view's count beside its name. The counts arrive
together and respect the other filters and search.

**Why this priority**: It is a speed and consistency improvement; the views already exist.

**Independent Test**: On a list with views, set a filter; confirm every view's count changes to match it and
that opening a view shows exactly that many records.

**Acceptance Scenarios**:

1. **Given** a list with views, **When** it opens, **Then** every view shows its count, and the count equals
   the number of records shown when that view is opened with the same filters.

---

### User Story 7 - Tables inside a record look and behave the same (Priority: P3)

The bounded tables inside a record page (an order's items, packages and refunds; a product's sizes; a
shop's operators; a promotion's performance) use the same look, column alignment (amounts right-aligned,
codes in a fixed-width face), sorting where useful and phone layout as the lists — without page controls,
because the whole set is always shown.

**Why this priority**: Consistency, after the lists themselves.

**Independent Test**: Open an order with several items and refunds; confirm the tables match the lists'
look and phone layout and show every row.

**Acceptance Scenarios**:

1. **Given** a record page with a bounded table, **When** it is shown, **Then** it has the lists' look and
   phone layout, every row is shown, and no page controls appear.
2. **Given** a sub-table whose set can grow without bound (a shop's stock, a shop's history, a customer's
   points, a product's stock history), **When** it is shown, **Then** it behaves as a list (Story 1) with
   its own page controls.

### Edge Cases

- **Records added or removed while paging.** On lists ordered newest first that grow constantly (orders,
  histories, ledgers), moving forward never repeats or skips a record because a new one arrived at the top.
  On other lists, a record removed while paging may shift the next page by one; it is never duplicated.
- **Very deep pages.** Past a reasonable depth (for example 10,000 rows) the list asks staff to narrow the
  search instead of paging further; it never fails. A total too expensive to count exactly is shown as
  "10,000+".
- **A page past the end** (records deleted since the link was made) shows the last real page.
- **Typing fast in search** sends one request after the staff member pauses, and a slow earlier answer never
  replaces a newer one.
- **Selected rows across pages** (shop orders bulk actions): a selection survives moving between pages and
  is cleared when the filters change; the bar says how many are selected.
- **A filter option that no longer exists** (a deleted shop or zone in a saved link) is ignored, and the
  list says it was removed from the view.
- **Access.** A shop operator only ever sees their own shop's records whatever is in the link; a staff
  member's view is limited by their role exactly as today.
- **Very long values** (product names, addresses) truncate in the cell with the full value on hover and on
  the record page; they never widen the table past the window on desktop.
- **Keyboard.** "/" focuses search, J/K move between rows, Enter opens the row; the primary cell is a real
  link (opens in a new tab with the usual modifier).

## Requirements *(mandatory)*

### Functional Requirements

**Behaviour shared by every list**

- **FR-001**: Every list MUST search, filter, sort and page the **whole** data set; nothing MAY filter or sort
  only the rows already on screen.
- **FR-002**: Every list MUST offer page sizes of 25, 50 and 100, show the range shown and the total ("1–25 of
  312", or "10,000+" where an exact total is too costly), and offer Back/Next — plus first, last and the
  current page number where the total is known.
- **FR-003**: Every list MUST order records completely: two records never tie, so no record is skipped or
  repeated at a page edge.
- **FR-004**: On lists ordered newest first that grow constantly — orders, a customer's points history, a
  product's stock history, a shop's history, hand-over and label-read records — paging forward MUST NOT
  repeat or skip a record when new ones arrive.
- **FR-005**: The search text, every filter, the sort and direction, the page and the page size MUST be part of
  the list's address, so reload, Back and a shared link restore the view. Unknown or invalid parts MUST be
  ignored, not shown as an error.
- **FR-006**: Changing the search, any filter, the sort or the page size MUST return the list to its first page.
- **FR-007**: Search MUST wait for a short pause in typing before asking, and a stale answer MUST never replace
  a newer one.
- **FR-008**: No list MAY stop at a fixed number of records; every matching record MUST be reachable by paging.
  Where paging stops at a depth limit, the list MUST say so and suggest narrowing.
- **FR-009**: While a page loads, the previous rows MUST stay visible with a progress indication; on first open,
  placeholder rows in the list's shape MUST show.
- **FR-010**: Each list MUST distinguish **empty** (nothing exists yet — says what will appear), **no matches**
  (offers to reset filters) and **failed** (says so, offers Retry, keeps the filters), all inside the list's
  frame.
- **FR-011**: On desktop and tablet, every list MUST fill the window's remaining height: the frame reaches the
  bottom of the window regardless of the row count, column names and page controls stay in view, and only the
  rows scroll.
- **FR-012**: On a phone, each row MUST become a stacked entry: the identifying attribute first, the status at
  the side, the remaining attributes beneath; the page scrolls normally.
- **FR-013**: Each column MUST have a priority; on narrower windows lower-priority columns hide first. The
  identifying column and the status column MUST never hide.
- **FR-014**: Staff and shop operators MUST be able to hide and show columns per list; the choice MUST be
  remembered on that device only (never shared with others) and MUST NOT allow hiding the identifying column.
- **FR-015**: Amounts and counts MUST be right-aligned with even-width figures; codes (order numbers, SKUs,
  plates, package codes) MUST use the fixed-width face. One sortable column header style everywhere, showing
  the active direction.
- **FR-016**: Every row MUST open its record by clicking anywhere on it, and its identifying cell MUST be a link
  that can open in a new tab; "/" focuses search, J/K move between rows and Enter opens the focused row.
- **FR-017**: Lists with views MUST show every view's count, all obtained together in one request that respects
  the other filters and the search.
- **FR-018**: When the platform announces that something a list shows has changed, the visible page MUST refresh
  on its own, keeping the view and page; no list MAY refresh on a timer.
- **FR-019**: Where a list allows selecting rows (shop orders today), the selection MUST survive moving between
  pages, MUST be cleared when the filters change, and MUST state how many are selected.
- **FR-020**: A shop operator MUST only see their own shop's records, and staff only what their role allows,
  whatever a link contains.
- **FR-021**: Bounded tables inside a record page MUST use the same look, alignment, sorting and phone layout,
  show every row and show no page controls. A sub-table whose set can grow without bound MUST behave as a list.
- **FR-022**: A list's first page MUST appear within 1 second for a typical staff connection, and each further
  page, sort, filter or search within 1 second, with up to 1 million records behind it (see SC-002).

**The lists (columns, search, filters, sorts)**

- **FR-023**: Each list MUST show the columns, search scope, filters and sorts in the table below. Priority 1
  columns are always shown; 2 from large screens; 3 from extra-large.

Back-office:

| List | Columns (priority) | Search by | Filters | Sorts |
|---|---|---|---|---|
| Orders | Order number + item summary (1) · Placed (1) · Customer email (2) · Delivery: who delivers + what was sold (1) · Status (1) · Driver (2) · Next step (2) · Total (1) | order number, customer email, package code | view, delivery, sold as, **status, shop, placed date range** | placed, total |
| Products | Product (1) · Shop (2) · Aisle (2) · Sizes (3) · Shop price (2) · Customers pay (1) · Margin (2) · State (1) · Changed (3) | name, Effy code, barcode | as today (state, shop, aisle, storage, margin, needs attention) | as today |
| Review queue | Product (1) · Shop (1) · Kind (1) · **Waiting for** (1) · Lowest shop price (2) | product, shop | view, kind, shop | waiting, shop |
| Missing details | Product (1) · Shop (1) · Category (2) · Missing details (1) | **product** | **shop, category** | **shop, number missing** |
| Margin not set | Product (1) · Shop (1) · Lowest shop price (2) · Since (1) | **product** | **shop** | since |
| Product imports | File (1) · Shop (1) · State (1) · Rows ready / with problems (1) · Created (2) | file | shop, state | created |
| Promotions | Promotion (1) · Gives (1) · Who (2) · Status (1) · Active dates (2) · Used (2) · Shown in (3) | name, code | view, kind, applies, group | **start, end, used** |
| A promotion's codes / customers | as today | **code** | state | — |
| Shops | Code (1) · Name (1) · Address (2) · Status (1) · Users (2) · Label scanning (3) | code, name | status | **code, name** |
| A shop's stock | Product (1) · SKU (2) · In stock (1) · Low at (2) · Status (1) | product, SKU | status | in stock |
| A shop's history | When (1) · Who (1) · What (1) | — | — | when |
| Drivers | Driver (1) · Work email (2) · Cleared for (1) · Duty (1) · Employment (2) | name, email | view, zone | name |
| Vehicles | Plate (1) · Vehicle (1) · Carries (1) · Owner (2) · With (2) · Status (1) | plate | view, refrigeration, owner | plate |
| **Customers** (now browsable) | Customer (1) · Email (1) · **Joined (2) · Orders (1) · Last order (2) · Points (2)** | name, email, phone | **has ordered, joined date range** | **joined, last order, orders** |
| A customer's points | When (1) · Change (1) · Balance after (1) · Reason (1) · Order (2) | — | kind | when |
| Feedback | Reference (1) · Received (1) · Category (2) · Rating (1) · Status (1) · Message excerpt (2) | as today | view, category, rating | received, rating |
| Deliverability | Address (1) · State (1) · Account (2) · Reason (2) · Last event (1) | address | view | last event |
| Coverage postcodes | Postcode (1) · Places (2) · Group (1) · Distance from hub (2) · Delivery today (1) · Actions (1) | postcode, place | group, delivery today on/off | postcode, distance |
| Courier parcels | Order (1) · Courier service (1) · Due (1) · Where it is (1) | order number, consignment reference | stage, service | due |
| Exceptions | Order (1) · Reason (1) · Driver (2) · Destination (2) · Package (2) · When (1) | order number, package code | kind, resolved | when |

Shop console:

| List | Columns (priority) | Search by | Filters | Sorts |
|---|---|---|---|---|
| Orders | Select · Order + items (1) · Customer (1) · Placed (1) · Status (1) · Goes with (2) · Payment (2) · Total (1) | as today | tab and as today | as today |
| Catalogue | Product (1) · Sizes (2) · Category (2) · Status (1) · On the storefront (1) · Your price (1) | as today | as today | as today |
| **Availability** (now a table) | Product (1) · Size (1) · In stock (1) · Status (1) · Last changed (2) | name, your code | view | in stock, name |
| A product's stock history | When (1) · Change (1) · Count (1) · Reason (1) · By (2) | — | reason | when |

- **FR-024**: Small sets that staff themselves create — promotion groups, promotion skins, courier services,
  fee plans, a shop's team, the attribute library — MUST be shown whole, with search and sort but no page controls, and MUST be
  limited to 500 records each: adding one past the limit is refused with a sentence saying so, so the set can
  never silently outgrow being shown whole.
- **FR-025**: Every list, Orders included, MUST open at 25 rows per page. A staff member's chosen page size is part of the address (FR-005).

**Existing wording and rules are kept**

- **FR-026**: Every status, delivery and promise word a list shows MUST keep its existing single source (the
  nine package-status words, "Delivered by Effy" / "Courier delivery", the sold-as words, "Effy driver" /
  "Courier" for shops); this feature changes how lists are laid out and paged, never what they say.

### Key Entities

- **List view**: what a person is looking at — search text, filters, sort and direction, page (or position),
  page size. Lives in the address; restorable and shareable.
- **List page**: the records shown, the total (exact or "N+"), and whether there is a previous/next page.
- **View counts**: the number of records in each named view of a list, for the current search and filters.
- **Column**: a named attribute of a list with a priority, an alignment, a phone placement and whether it sorts
  or can be hidden.
- **Column choice**: which columns a person hid on a list, kept on their device only.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All ~30 lists in "The lists" share one paging, sorting, searching, filtering and state behaviour —
  an auditor walking every list finds no list that pages, sorts or remembers differently.
- **SC-002**: With 1 million orders and 100,000 products in the data set, 95% of list pages, sorts, filters and
  searches show their result in under 1 second on a typical office connection.
- **SC-003**: Across 1,000 consecutive pages of a list while new records are being added, zero records are
  repeated and zero are skipped (checked against the full set).
- **SC-004**: 100% of matching records are reachable on every list (no fixed cut-off), verified on courier
  parcels with 5,000 parcels and exceptions with 1,000 exceptions.
- **SC-005**: Reload, Back from a record and a shared link restore the identical view on 100% of lists.
- **SC-006**: On a 1080-pixel-tall desktop window, every list's frame reaches the bottom of the window with 0, 3
  and 100 rows, and column names and page controls are visible throughout scrolling.
- **SC-007**: Opening a list with views makes one request for counts, not one per view.
- **SC-008**: A staff member can find a named order, driver or product in under 10 seconds from opening its list.

## Assumptions

- "All the tables" means every **list** plus the **bounded tables inside record pages**; boards and editors that
  use rows (dispatch, hub station, pick list, packing, editors, the permission matrix) keep their layouts, because
  they are grouped, editable or a matrix rather than a set to search and page.
- Exact totals are shown wherever they can be counted cheaply; very large or constantly growing sets may show
  "10,000+" past that size. Paging stops at a depth of around 10,000 rows, beyond which narrowing is the tool.
- Column visibility is a convenience kept on the device; it is not synced between devices or people.
- The customer storefront, the customer and driver apps are untouched.
- The live-update channel (071) is reused for refreshes; no list polls.
- Access rules are unchanged: what each audience and role can see is decided exactly as today.
- The existing view names, status words and delivery words are reused unchanged.
- Customers becomes browsable with no search entered; today it only answers a search. No customer data is shown
  that staff cannot already see on a customer's page.
