# Feature Specification: Every Activity Log in One Drawer

**Feature Branch**: `104-activity-log-drawer`

**Created**: 2026-10-29

**Status**: Draft

**Input**: User description: "In both shop and back office we have activity logs in multiple places. All the
activity logs in every page should be shown inside a drawer which has pagination, search and export options.
Move all the activity log UIs to drawers and have a button in the options menu of each page (or some other
place). The drawer should have pagination, search, filters and all the things we need for an activity log. The
drawer can open as wide as half of the screen, with a button to export activity logs inside it."

## Why this slice exists

The two consoles show **17 logs drawn five different ways**, by inventory on 2026-10-29: a timeline in a panel,
a timeline in a sheet, a paged table, a plain table, and hand-written rows. Each one:

1. **Ends somewhere different.** The driver's history stops at 100 entries, a product's at 200, a shop team's
   at the last 50 of 14 days, a product's stock change log at one page, the email events at a fixed number —
   with nothing to say that more exist. Only two logs page through everything.
2. **Cannot be searched or narrowed.** "Who suspended this driver in August?" means scrolling.
3. **Names people differently.** Four back-office logs show a sign-in identifier instead of a name.
4. **Cannot leave the screen.** Nothing can be exported for an audit, a dispute or a shop's own records.
5. **Sits in the page.** An order's history is split across six places (a History tab, hand-overs under each
   package, moves by back-office, delivery-type changes, courier collection changes and consignment steps).

## The rule

**A log is a record of what happened to one thing, written by the platform, never edited.** Every such log in
back-office and shop-web is opened from its page and shown in **one drawer**, the same everywhere:

- It opens from the page head: an **Activity** item in the page's "More" menu where the page has one, otherwise
  an **Activity** button beside the page's other actions.
- It slides in from the right and is **as wide as half the window** (never narrower than a readable table; the
  full width less a margin on a narrow window; a bottom sheet on a phone).
- It lists entries **newest first**, can be turned to **oldest first**, and **pages** through every entry the
  log holds — none are cut off.
- It has a **search** (the words of an entry, the person, what it was on), a **type** filter (the kinds of entry
  that log holds, named in plain words), and a **date range**.
- Each entry says **when** (date and time, the business's time zone), **what happened**, any **detail**,
  **what it was on** where a log covers several things (a package, a bag, a size), and **who** — a person's name,
  "Effy", "Effy driver", "Customer", or "System"; never an internal identifier.
- **Export** downloads what the drawer is showing — the same search, type and dates, every page of it — as a
  spreadsheet file (CSV). An export over 10,000 entries is refused with a sentence saying to narrow the dates;
  it is never silently cut.
- The drawer's state (open, search, filters, page) is **in the address**: reload, Back and a shared link
  restore it. Back closes it.

## The logs (scope)

| Console | Page | Drawer | Replaces |
|---|---|---|---|
| Back-office | Order | Order activity | History tab; hand-overs under each package; moves by back-office; delivery-type history; courier collection changes; consignment steps |
| Back-office | Shop | Shop activity | Activity panel |
| Back-office | Driver | Driver activity | Change history |
| Back-office | Vehicle | Vehicle activity | Handover history (+ changes to the vehicle, not shown before) |
| Back-office | Product | Product activity | History panel |
| Back-office | Promotion | Promotion activity | History tab |
| Back-office | Customer | Points activity | History tab |
| Back-office | Points settings | Rule changes | Changes panel |
| Back-office | Email address (deliverability) | Email events | History panel |
| Shop-web | Today | Team activity | Team activity sheet (now beyond 14 days) |
| Shop-web | Order | Order activity | Activity sheet |
| Shop-web | Product | Stock activity | Activity sheet's change log **and** the Stock movements list (one log, a Size filter) |

**Out — not logs, they stay on their pages**: an order's **internal notes** (shop-web) and a feedback item's
**notes and replies** (back-office) are conversations people write and add to; an order's **refunds** are money
records with actions; a product review's **changes** are a comparison, not a history.

## Requirements

- **FR-001** Every log in the table above opens in the one drawer; no page draws a log inline.
- **FR-002** The drawer pages through every entry (no fixed cap), counts up to "10,000+", and says empty, no
  matches and could-not-load apart.
- **FR-003** Search, type, dates and order are applied by the server to the whole log.
- **FR-004** Export writes the filtered log, every page, as CSV: When, Type, What, Detail, On, Who. Over 10,000
  rows is refused with "More than 10,000 entries match. Narrow the dates to export."
- **FR-005** Who is said in words; a removed person is "A former team member" (shop) or "Former staff"
  (back-office); the platform is "System".
- **FR-006** A shop sees only its own shop's entries, and back-office actors only as "Effy".
- **FR-007** The drawer, its filters and its page are in the address; Back closes it.
- **FR-008** Product analytics records the drawer opened, filtered and exported, per log — never search text,
  never an id, never a person.

## Success criteria

- **SC-001** No back-office or shop-web page shows a log inline (checked by a guard).
- **SC-002** Any entry in any log can be found by a word it shows, within its log, without scrolling.
- **SC-003** Every log can be exported to a spreadsheet in one click, up to 10,000 entries.
