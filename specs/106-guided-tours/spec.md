# Feature Specification: Guided Tours in the Shop Console

**Feature Branch**: `106-guided-tours`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "Add tour guides to both the shop app and back-office, on every page and everywhere
in the apps. A person can replay any tour when they need it. Find a package that works with our React, Vite and
shadcn setup, identify every place a tour is needed, list them, and write the explanation text for each one. Start
a new spec, beginning with the shop app."

## Why this slice exists

Shop staff learn the console by asking someone or by trial. That is costly in three ways:

1. **A new hire is slow on the bench.** They learn what "Awaiting pick", "Bags & labels" or "Can't supply" mean only
   from a colleague. If no one is there, they guess, and a wrong guess goes to a customer.
2. **Some things are never found.** The scan button, ⌘K search, the chime, Availability's instant off-switch and
   Team activity are easy to miss. People do more by hand because of it.
3. **The rules are not on screen.** That Effy approves new products and sets what shoppers pay, that a shop is never
   named to customers, that each temperature has its own bag: none of this is written where the work happens.

A guided tour points at the real thing on the screen and explains it in a sentence or two, right where the work is
done. A person can open it again whenever they need it.

## Scope

- **This slice: the shop console.** Every page in it, the parts every page shares (the sidebar, the header, search,
  scan, sound, the account menu), and the one Help place.
- **Next slice: back-office.** It will use the same tours, the same Help place and the same rules as this spec, with
  its own list of tours. This spec states the rules both consoles share. The back-office tour list will be written in
  its own spec.
- **Not in scope:** the customer storefront, the customer and driver apps, the sign-in page (there is no one to
  remember a tour for before sign-in), and printed or emailed help.

## How a tour behaves (the rule)

**A tour is a short sequence of steps. Each step points at one thing on the page and says what it is for.**

- **It points at the real thing.** The step outlines the part of the page it describes and dims the rest. Its
  explanation sits beside that part without covering it.
- **It starts by itself the first time.** *(Operator decision, 2026-11-03: shown automatically, not offered.)* The
  first time a person reaches a page that has a tour, the tour starts on its own once the page has loaded. **Esc** or
  **✕** closes it at once, from any step.
- **The first sign-in is different.** On a person's first sign-in, the **Welcome** tour of the console starts first.
  When it is finished (Done), the page's own tour follows; when it is closed early, the page's tour waits for the next
  visit.
- **Each tour starts by itself once.** A tour counts as shown the moment it starts, whether it is then finished or
  closed, so a reload mid-tour does not start it again. The tour can still be replayed at any time (below).
- **It can be replayed at any time** from the one **Help** place in the header (and from search: "Tour this page").
- **It only explains.** A tour never presses a button for the person, never changes an order, a product or a
  setting, and never navigates away. While a step is showing, the dimmed page cannot be clicked. **Esc** or **✕**
  closes the tour at once.
- **It shows only what is there.** A step is left out when the thing it points at is not on the screen at that
  moment. That covers: something only managers see, a section this order or product does not have, an empty list
  with no rows, and a control folded away on a narrow screen. The step counter counts only the steps shown
  ("Step 2 of 6").
- **Urgent work comes first.** A new-order alert, its chime and any error message still show during a tour, above
  it.
- **It reads well everywhere** the console is used: a desktop, a tablet, a phone-width window, light and dark,
  with the keyboard (**→** next, **←** back, **Esc** close), and with a screen reader (each step is announced; focus
  moves into the step and returns when the tour ends).
- **Its words are the console's words.** Each step has a short title and one or two plain sentences. It uses the
  same names the screen uses ("Awaiting pick", "Bags & labels", "Your price"), never internal terms, and never names
  a shop to a customer or says anything a shop is not allowed to see.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new team member learns a page from its tour (Priority: P1)

A new member of shop staff opens Orders for the first time. The Orders tour starts by itself. Each
step outlines one part of the page (the Queue/Table switch, each lane, Left the shop) and explains what it is for.
They finish the tour and start picking.

**Why this priority**: This is the reason the feature exists. One page's tour, once it works, already helps a new
hire.

**Independent Test**: Sign in as a person who has seen the Welcome tour but no page tours. Open Orders: its tour
starts by itself. Step through it; each step outlines the right part and shows its text. Reload Orders: the tour does
not start again.

**Acceptance Scenarios**:

1. **Given** a person who has never opened Orders, **When** it has loaded, **Then** the Orders tour starts by itself.
2. **Given** the tour is running, **When** they press Next or **→**, **Then** the next step outlines its part of the
   page, and the counter says which step it is out of how many.
3. **Given** the tour is running, **When** they press **Esc** or **✕**, **Then** the tour closes at once and the page
   is exactly as it was before.
4. **Given** they finished or closed the tour, **When** they open Orders again on any device, **Then** it does not
   start again.
5. **Given** a menu or dialog the person opened is still open, **When** the page finishes loading, **Then** the tour
   waits until it has closed.

---

### User Story 2 - Anyone replays a tour when they need it (Priority: P1)

A member of staff who has been on the bench for a month needs to send their first courier parcel. They open
**Help** in the header and choose **Tour this page**. The order page's tour runs again.

**Why this priority**: The user asked that every tour can be replayed. Without that, a tour is a one-time pop-up
that people dismiss and then never get back.

**Independent Test**: On any page, open Help and choose Tour this page. The page's tour runs from step 1. Open Help
and choose All tours: every tour is listed, and a tour for another page opens that page and then starts.

**Acceptance Scenarios**:

1. **Given** any page in the console, **When** the person opens Help, **Then** it offers **Tour this page**,
   **Welcome tour** and **All tours**, plus the choice of whether tours are offered on new pages.
2. **Given** the All tours list, **When** they choose a tour for a page that needs a particular order or product
   (an order, a product), **Then** it opens the most recent one the person can see (the most recently placed order, the
   most recently added product) before starting. If there is
   none, it says so in one sentence instead of starting an empty tour.
3. **Given** search is open, **When** they type "tour", **Then** **Tour this page** and **All tours** are offered as
   commands.
4. **Given** the person turned off "Show tours on new pages", **When** they reach a page they have not seen,
   **Then** no tour starts by itself, and Help still replays any tour.
5. **Given** the person chooses **Show every tour again**, **When** they next reach each page, **Then** its tour
   starts by itself once more.

---

### User Story 3 - The Welcome tour on first sign-in (Priority: P2)

On their first sign-in, a one-minute Welcome tour of the console starts by itself. It covers what
each page in the sidebar is for, the numbers beside them, search, scan, the chime, the account menu and where Help
is.

**Why this priority**: It ties the pages together, but the page tours (P1) carry most of the value on their own.

**Independent Test**: Sign in as a person with no tour history. The Welcome tour starts by itself. Run it: Team is
explained to a manager and left out for staff.

**Acceptance Scenarios**:

1. **Given** a person's first sign-in, **When** the console opens, **Then** the Welcome tour starts by itself; when
   it is finished, that page's own tour follows; when it is closed early, the page's tour waits for the next visit.
2. **Given** a person with the Staff role, **When** they run the Welcome tour, **Then** the Team step is not shown
   and the counter does not count it.

---

### User Story 4 - A tour fits the page as it is now (Priority: P2)

The order page has sections that come and go: Courier pickup, Refund (managers only), and the pick list's
Can't supply. The tour explains only what this order, for this person, on this screen, actually shows.

**Why this priority**: A step that points at nothing, or explains a button the person cannot see, damages trust
in every other step.

**Independent Test**: Run the order tour on an Effy-driver order as Staff, then on a courier-pickup order as a
Manager. The steps shown, and the step count, differ exactly as the inventory's "Shown when" column says.

**Acceptance Scenarios**:

1. **Given** a step whose part is not on the screen, **When** the tour reaches it, **Then** it is skipped, and the
   counter counts only the steps shown.
2. **Given** a phone-width window where the filters are folded under one **Filters** button, **When** the Orders
   table tour runs, **Then** the filters step points at the **Filters** button.
3. **Given** a step whose part is below the fold, **When** it is shown, **Then** the page scrolls that part into
   view before outlining it.

---

### User Story 5 - The operator sees which tours help (Priority: P3)

The operator wants to know which tours are taken, finished or abandoned, and at which step, so the wording can be
improved.

**Why this priority**: Useful for refining tours, but nobody on the bench needs it.

**Independent Test**: Take, finish and abandon a tour. Each is recorded with the tour's name and the step reached.
Nothing about an order, a product or a customer is recorded.

**Acceptance Scenarios**:

1. **Given** a person starts, finishes or closes a tour, **When** the product analytics are read, **Then** they show
   the tour, how it was started (by itself, Help, search or All tours), and the last step seen.

---

### User Story 6 - A changed page is offered its tour again (Priority: P3)

When a page changes enough that its tour is rewritten, people who already saw the old tour are shown the new one
once, by itself, as they would a new page's.

**Why this priority**: It keeps tours useful as the console keeps being redesigned, but it is not needed at launch.

**Independent Test**: Mark one tour as revised. A person who saw the old version has it start by itself once more;
All tours marks it "Updated".

**Acceptance Scenarios**:

1. **Given** a tour marked as revised, **When** a person who saw the earlier version reaches its page, **Then**
   it starts by itself once.

---

### Edge Cases

- **A new order arrives during a tour**: the alert and chime come through above the tour. The tour stays where it
  is.
- **The page's data is still loading**: the tour waits until the page has loaded. A tour started from Help
  while the page is loading begins once it has loaded, never on loading shapes.
- **The page errored**: no tour starts. Tour this page says the tour is available once the page loads.
- **Offline**: tours still run, because their words are part of the console. If remembering "offered" cannot be
  saved, it is saved later. In the meantime the tour does not start again on this device.
- **The window is resized or rotated mid-tour**: the outline and its text follow the part they describe. If a part
  is folded away at the new size, the tour moves on to the next step that is shown.
- **The thing a step points at disappears mid-step** (for example, a live update moves the order out of a lane): the
  step moves on to the next one that is shown. If none are left, the tour ends.
- **Every step of a tour would be skipped** (for example, an empty catalog): the tour shows one centred card with
  the tour's title and the sentence "There's nothing here to show yet. Try this tour again once the page has
  something in it." It counts as offered (closed).
- **Two tours could start at once** (Welcome and a page): only one runs at a time. Welcome comes first.
- **The page changes mid-tour** (the person follows the new-order banner, or the console signs out): the tour ends
  and counts as closed. It was already recorded as offered the moment it started.
- **A manager loses the manager role**: steps about manager-only things stop being shown, and nothing else changes.
- **A shared bench computer**: tours are remembered per person, not per device, so the next person who signs in sees
  the tours they have not yet seen.
- **A person moves on quickly**: a tour starts only after the page has been on screen for a moment, so passing
  through a page on the way to another starts nothing.

## Requirements *(mandatory)*

### Functional Requirements

**Offering and replaying**

- **FR-001**: Every page listed in the Tour Inventory MUST have a tour, and the console MUST NOT have a page without
  one. A new page added later without a tour MUST be caught before release.
- **FR-002**: The first time a person reaches a page with a tour, that tour MUST start by itself once the page has
  loaded and any menu or dialog the person opened has closed. It MUST be closable at once from any step (**Esc**, ✕).
- **FR-003**: On a person's first sign-in, the Welcome tour MUST start before any page tour; when it is finished, the
  page's own tour follows. The Welcome tour follows the same rules as every other tour: "Show tours on new pages"
  turned off stops it too, and a revised Welcome tour starts again (FR-021).
- **FR-004**: Whether each tour has been shown MUST be remembered **per person**, across every device they use. A tour
  counts as shown the moment it starts; finishing or closing it part-way is recorded too.
- **FR-005**: The header MUST carry one **Help** place on every page. It offers **Tour this page**, **Welcome tour**,
  **All tours** (each tour with whether the person has seen it), **Show tours on new pages** (on/off, per person,
  on by default) and **Show every tour again**.
- **FR-006**: Search MUST offer **Tour this page** and **All tours** as commands.
- **FR-007**: Starting a tour for another page from All tours MUST open that page first. For a page that needs a
  record (an order, a product), it MUST open the most recent one the person can see (the most recently placed order;
  the most recently added product). If there is none, it MUST say
  so in one sentence and start nothing.

**Running a tour**

- **FR-008**: Each step MUST outline the one part of the page it describes, dim the rest, and place its words
  beside that part without covering it. Where the part is off screen, the page MUST scroll it into view first.
- **FR-009**: A step MUST show its title, its text, "Step N of M" (counting only shown steps), **Back** (not on
  step 1), **Next** (**Done** on the last step) and **✕**. The keys **→**, **←** and **Esc** MUST do the same.
- **FR-010**: A tour MUST NOT change data, press the page's buttons, open its menus or drawers, or navigate. While a
  step is showing, the dimmed page MUST NOT respond to clicks.
- **FR-011**: A step MUST be skipped when its part is not on the screen at that moment, for whatever reason (record
  state, empty list, screen width; roles are FR-012). A step whose part has a narrow-screen stand-in (Filters) MUST point at the
  stand-in.
- **FR-012**: Manager-only steps MUST be shown only to people with the Manager role.
- **FR-013**: New-order alerts, the chime and error messages MUST still show during a tour, above it.
- **FR-014**: Tours MUST work at every width the console supports (down to a phone), in light and dark, by keyboard
  alone, and with a screen reader. Focus MUST move into each step and return to where it was when the tour ends.
- **FR-015**: Tours MUST look like the rest of the console: the same overlay, type, colours and controls. A tour
  is never a separately styled pop-up.

**Words**

- **FR-016**: Every tour's steps and words MUST live in **one list** that can be read and reviewed in full without
  running the console. The Tour Inventory below is that list's first version.
- **FR-017**: A step's title MUST be at most 40 characters, and its text at most 220 characters (one or two
  sentences). A tour MUST have at most 12 steps.
- **FR-018**: Step words MUST use the names the screen shows. They MUST NOT use internal terms (statuses, codes,
  service names), MUST NOT reveal anything the shop may not see, and MUST follow the platform's fixed wordings
  ("Effy driver" / "Courier", the nine package status words).
- **FR-019**: Every step's target MUST exist on its page. A step that points at nothing because a page changed MUST
  be caught before release, not discovered by a person.

**Measurement and revision**

- **FR-020**: Starting, finishing and closing a tour MUST be recorded in product analytics: the tour, how it was
  started (by itself, Help, search, All tours) and the last step seen. Nothing about an order, product, customer or shop
  record is recorded.
- **FR-021**: A tour MAY be marked as revised. People who saw an earlier version then have it start by itself once
  more, and All tours marks it "Updated".

**Shared with back-office**

- **FR-022**: The way tours run, the Help place, remembering per person and the step rules MUST be one shared
  piece that back-office will also use. Only the list of tours and their words differ between the consoles.

### Key Entities

- **Tour**: a named sequence of steps for one page (or for the whole console: Welcome). It has a version, which a
  revision raises, and a "needs a record" flag (an order, a product).
- **Step**: one part of a page (the thing it points at), a title, a text, and when it is shown (always / managers
  only / only when that part is on screen).
- **Tour history (per person)**: for each tour, the version last offered and whether it was taken, finished,
  closed or declined, plus the person's "offer tours on new pages" choice.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of the shop console's pages have a tour, and an automatic check fails a page without one or a
  step that points at nothing.
- **SC-002**: Each page tour can be read through in under 90 seconds. The Welcome tour takes under 2 minutes.
- **SC-003**: A running tour never hides urgent work. A new-order alert shows within the same
  second whether or not a tour is running.
- **SC-004**: Any tour can be replayed from any page in at most 2 presses (Help → Tour this page).
- **SC-005**: Each tour starts by itself at most once per person (until it is revised or they ask to see tours again),
  whichever device they use.
- **SC-006**: In the first month, at least 60% of tours that are started are finished. Tours finished less often
  than that are rewritten, using the step where people closed them.
- **SC-007**: A new member of staff who took the Orders and order-page tours can take an order from Awaiting pick
  to Ready (pick, record a can't-supply, bag, label) without asking anyone. This is checked on a walk with a person
  new to the console.

## Assumptions

- **Remembered per person, not per device**: bench computers are shared, and one person uses several devices.
  Remembering per device would show a tour to the second person on a shared computer only by chance.
- **Shown automatically** *(operator decision, 2026-11-03; the first draft only offered tours)*: a new person sees
  each page explained without having to ask. Urgent work is protected instead by FR-013 (alerts stay above the
  tour), Esc closing it at once, and the tour waiting for the page to load and for the person's own menus to close.
- **Tours point at openers, not inside them**: a step about something inside a menu or drawer (Team activity,
  Manage sections) points at the button that opens it. A tour never opens anything (FR-010).
- **The record-dependent tours** (an order, a product) run on whatever record is open. Their steps follow that
  record's state (FR-011).
- **Words are English only**, like the rest of the console.
- **The sign-in page has no tour**: there is no person to remember it for.
- **Back-office follows in its own spec** with its own inventory, on the shared mechanism (FR-022).

---

## Tour Inventory (shop console)

Sixteen tours. In each table, **Points at** is the part of the page the step outlines. **Shown when** is blank when
the step is always shown. Text in quotes elsewhere in this spec is the console's own wording.

### W - Welcome to Effy Shop (the whole console; starts by itself at first sign-in)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Nothing (centred) | Welcome to Effy Shop | This is where your shop does its part for Effy: picking and packing orders, keeping products and stock right, and seeing how you're doing. The tour takes about a minute. | |
| 2 | The sidebar | Find your way | Today is where you start. Orders is the packing bench, Catalog holds your products and stock, and Insights shows how the shop is doing. | |
| 3 | Sidebar › Orders | Numbers mean work | The number beside Orders is how many are waiting to be picked. It updates by itself, so there's no need to reload. | |
| 4 | Sidebar › Team | Your team | Invite colleagues and choose what each one can do. Only managers see this. | Manager |
| 5 | Sidebar › Settings | Settings for this device | Turn on notifications for new orders and set up this computer's label printer. | |
| 6 | Header search | Search and commands | Find any order or product, or type what you want to do, such as "New product" or "Print pick lists". Press ⌘K (Ctrl K on Windows) on any page. | |
| 7 | Header › Scan | Scan from anywhere | Scan a bag label, or type an order number, to go straight to that order. A handheld scanner works on any page. | |
| 8 | Header › Sound | Hear new orders | Turn sound on so a new order chimes as well as appears. Your browser needs this one press before it can play sound. | |
| 9 | Header › account menu | Your account | Switch between light and dark, or sign out. On a shared computer, sign out when you leave. | |
| 10 | Header › Help | Help is always here | Every page has its own short tour. Open it here any time, or replay this one. | |

### T - Today

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading and its line | Your day at a glance | Today's date and what you've sold so far today. | |
| 2 | Next collection band | Next collection | When the Effy driver next collects, and how many of the orders due are ready. Have them packed and labelled before this time. | |
| 3 | Do this next | What to do next | Your work, in the order to do it: the oldest order waiting first, then anything that needs a look. Open a row to start. | There is work |
| 4 | The Now line | Now | Above the line is what has just happened today. Below it is what's still to come. | |
| 5 | Later today | Later today | Collections and other things already planned for the rest of the day. | Something is planned |
| 6 | Yesterday | Yesterday | How yesterday ended, to compare with today. | Shown |
| 7 | Quick actions | Quick actions | Shortcuts to what you start most: a new product, receiving stock, exporting orders, or the orders that need attention. | |
| 8 | Print pick lists | Print pick lists | One pick list for every order waiting to be picked, in walking order. It's greyed out when nothing is waiting. | |
| 9 | More (⋯) | Team activity | Everything your team has done, including picks, notes, stock and refunds, in one log you can search and export. | |

### OQ - Orders · Queue

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Queue / Table switch | Two ways to see orders | Queue is the packing bench, with orders in lanes. Table lists every order, with search and filters. | |
| 2 | The line under the title | Ready by collection time | When the next driver collects. Orders in the queue should be ready before then. | |
| 3 | Awaiting pick lane | Awaiting pick | Paid orders nobody has started yet, oldest first. Open one to start picking. | |
| 4 | Picking lane | Picking | Orders someone has started. Finish these before starting new ones. | |
| 5 | Ready lane | Ready | Packed, labelled and waiting for the Effy driver or the courier to collect. | |
| 6 | Left the shop | Left the shop | Today's orders that have already gone. Open it to check what was collected. | |
| 7 | More (⋯) | Export | Download your orders as a spreadsheet. | |

### OT - Orders · Table

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Order status | Order status | Narrow the list to one stage, such as Awaiting pick or Picking. The number beside each one is how many orders are in it. | |
| 2 | Search | Search | Find an order by its number, the customer, or a product's SKU. | |
| 3 | Placed, Goes with, Payment (or **Filters** on a narrow screen) | Filters | Narrow the list by when an order was placed, who takes it (Effy driver or Courier), and payment. | |
| 4 | Row tick box | Work on several at once | Tick orders to print all their labels together, or to add the same tag to each. | There are rows |
| 5 | The first row | Open an order | Open a row to pick, pack and label it. | There are rows |
| 6 | More (⋯) | Export | Download the orders you're looking at as a spreadsheet, with the same search and filters. | |

### OD - An order (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Order heading and status | This order | The order number and where it's up to. You see only your shop's items. Use ← and → to go to the previous or next order. | |
| 2 | The main action | The next step | One button for what comes next: Start picking, then Mark ready once every bag is packed and labelled. | Shown |
| 3 | Pick list | Pick list | In walking order: shelves first, cold things last. Tick each line as it goes in the bag, or scan its barcode. | |
| 4 | Can't supply… | When you can't find something | If an item is missing or you have fewer, record it here. Never just leave it out. Effy lets the customer know. | Shown |
| 5 | Bags & labels | Bags & labels | One bag per temperature (frozen, chilled, room temperature), each with its own label. Print the label, stick it on, and scan each bag as you pack it. | |
| 6 | Where it is | Who takes it | Whether an Effy driver or a courier takes this order, and when it's collected. | |
| 7 | Courier pickup | Courier pickup | A courier collects this one from your shop. Mark it ready before they arrive. | Courier collects from the shop |
| 8 | Your money | Your money | What you're paid for this order, after anything you couldn't supply. | |
| 9 | Team notes | Team notes | Notes only your team sees. They can't be edited once added. | |
| 10 | Tags | Tags | Tags help you group and find orders later. Only your shop sees them. | |
| 11 | Refund | Refunds | Choose the lines to refund. Effy returns the money to the customer's card. | Manager, and something is refundable |
| 12 | Activity | Order activity | Everything that has happened to this order, step by step. | |

### C - Catalog · Products

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Your catalog | Your products, prices and stock. Shoppers buy them as Effy's and never see which shop supplies them. | |
| 2 | New product | Add a product | Effy checks every new product and sets what shoppers pay before it goes on sale. | |
| 3 | Search | Find a product | Search by name, brand, SKU or barcode. | |
| 4 | Status | Status | Live products are on sale. Drafts aren't finished yet. Unavailable ones are switched off. Archived ones are no longer sold. | |
| 5 | Review | Review | Find products waiting for Effy, or ones sent back with a note to fix. | |
| 6 | Category and Section filters | Category and section | Narrow by Effy's category, or by your own sections. | |
| 7 | On the storefront column | Can shoppers buy it? | Buyable means it's on sale now. Anything else is waiting, switched off, or held by Effy. | There are rows |
| 8 | More (⋯) | Sections and stock settings | Sections are your own groups for organising products. Only your shop sees them. Stock settings sets when a product counts as running low. | |

### N - New product

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | The steps | Five short steps | Name & category, Photo, Variants & prices, Details, then Review. Your work is kept if you leave and come back. | |
| 2 | Category | The category matters | It decides where shoppers find the product, which details it needs, and what it can vary by, such as size or flavour. | Name & category step |
| 3 | Photo | One clear photo | Used everywhere shoppers see this product. Every product needs one. | Photo step |
| 4 | Your price | Your price | What you're paid for each one. Effy sets what shoppers pay when it approves the product. | Variants & prices step |
| 5 | Preview | How shoppers see it | Updates as you type. It's shown at your price until Effy sets the shopper price. | Shown |
| 6 | Send to Effy for review | Effy checks it | You send it, Effy checks it and sets the price, and you're notified when it goes on sale. You can still change it while it's in review. | Review step |

### P - A product (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Status at the top | Where it stands | On sale, waiting for Effy's review, sent back with a note, or held by Effy. What to do next is written here. | |
| 2 | How shoppers see it | How shoppers see it | The product as it looks on Effy, including a change you've made that's still waiting for review. | |
| 3 | Sizes and prices | Sizes and prices | Your price for each size, and what customers pay once Effy sets it. A price change goes to Effy before shoppers see it. | |
| 4 | Stock / Receive stock | Stock | How many you have of each size. Use Receive stock when a delivery arrives, so shoppers never buy what you don't have. | |
| 5 | Pictures | Pictures | The first picture is the main one shoppers see in the aisle. A new, removed or moved picture is checked by Effy first. | |
| 6 | Description | Description | What shoppers read on the product page. | |
| 7 | Details | Details | The facts this category asks for. Shoppers filter and compare on these. | |
| 8 | Organisation and facts | Organisation and facts | Its category, how it's stored (frozen, chilled or room temperature), GST and 18+. | |
| 9 | Listing quality | Listing quality | What would make this listing better, such as a missing picture or detail. | Shown |
| 10 | Sections | Sections | Your own groups. Put the product in as many as help you. | |
| 11 | More (⋯) | Activity and stock history | Every change to this product and every stock movement, in one log. | |

### A - Availability

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Switch off what you've run out of | Take a size off sale the moment you run out. It's instant, and no review is needed. | |
| 2 | Show | Needs a look first | Sizes that are out of stock or running low come first. Choose Everything to see them all. | |
| 3 | Search sizes | Find a size | Search by product, size or barcode. | |
| 4 | A size's switch | On or off sale | Switch a size off and shoppers can't buy it straight away. Switch it back on when it's restocked. | There are rows |
| 5 | The page heading | The last size | If it's the last size on sale, make the whole product unavailable on its page instead. | |

### I - Insights · Overview

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Pages: Overview, Sales, Products, Service | Four views | Overview at a glance, then Sales, Products and Service in more depth. Each one has its own short tour. | |
| 2 | Range | Choose the period | Today, 7 days or 30 days. Each figure is compared with the period before. | |
| 3 | Headline figures | Your figures | Revenue, orders and average order. Revenue counts your goods only, and a refund comes off on the day it was issued. | |
| 4 | Show chart / Show table | Chart or table | The same figures as a chart or as exact numbers. | |
| 5 | More (⋯) | Export | Download the period's figures as a spreadsheet. | |

### IS - Insights · Sales

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Measure | What to chart | Choose the measure the chart shows. | |
| 2 | When your orders come in | When orders come in | Your busiest hours and days, to plan who's on the bench. It appears after two weeks of orders. | |
| 3 | Behind the revenue | Behind the revenue | What moved revenue this period: cancellations, refunds and what you couldn't supply. | |

### IP - Insights · Products

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Best sellers | Best sellers | Your products by what they sold this period. | |
| 2 | Moving up | Moving up | Products selling more than the period before. | |
| 3 | Slipping | Slipping | Products selling less than the period before. | |
| 4 | Selling but out of stock | Selling but out of stock | Shoppers want these, but you have none. Restock them first. | |

### IV - Insights · Service

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Found rate | Found rate | Of everything ordered, how much you supplied. The higher the better. | |
| 2 | Can't supply | Can't supply | How much you couldn't supply. Each miss is a disappointed customer. | |
| 3 | Time to ready | Time to ready | Minutes from payment to Ready. Faster orders make the collection. | |
| 4 | What you could not supply | What you could not supply | The products you missed most, so you can fix stock or switch them off sooner. | |

### TM - Team (Manager only)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Your team | The people who can sign in to this shop console. | |
| 2 | Invite a colleague | Invite a colleague | Enter their work email. They get a one-time code to sign in, and there's no password to set. | |
| 3 | Role column | Manager or Staff | Managers can also run the team and issue refunds, and get the alerts meant for managers. Staff do the everyday work. | There are rows |
| 4 | Actions on a row | Change or stand down | Change someone's name or role, or stand them down so they can no longer sign in. You can reinstate them later. | There are rows |

### NS - Settings · Notifications

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | This device | This device | Alerts for new orders and anything that needs attention, even when the console is closed. Each computer, tablet or phone is turned on separately. | |
| 2 | Send a test | Check it works | Shows one notification on this device now. | Notifications are on |
| 3 | What you're told about | What you're told about | Choose which alerts reach this device. Everything is on until you turn it off. | |
| 4 | Sound | Sound | A chime in this tab for new orders while the console is open. The Sound button at the top of every page does the same. | |
| 5 | The home-screen note | On iPad and iPhone | Notifications only work once Effy Shop is added to the home screen. | iPad / iPhone |

### PS - Settings · Printing

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Printing on this computer | How this computer prints bag labels. Each computer keeps its own setting. | |
| 2 | Printer | Printer | A Zebra label printer prints straight away when Zebra Browser Print is running. Anything else uses your computer's print window. | |
| 3 | Label size | Label size | Match the labels loaded in the printer. | |
| 4 | Resolution | Resolution | It's on the printer's own label or in its manual. Most label printers are 203 dpi. | |
| 5 | Test label | Test label | Prints a sample with these settings. Nothing is recorded against an order. | |

### Not a tour of its own

- **Header Help**, **search**, **Scan** and **Sound** are covered by the Welcome tour (W 6–10).
- **Quick actions**, **Manage sections**, **Stock settings**, **Refund**, the **activity drawers** and the
  **new-order alert** are covered by the step on the page that opens them. Opening them starts no tour.
- **Sign-in** has no tour. A Staff member who opens Team's address sees that page's error state; a page that has not
  loaded never offers or runs a tour.
