# Feature Specification: Guided Tours in Back-Office

**Feature Branch**: `107-backoffice-guided-tours`

**Created**: 2026-11-03

**Status**: Draft

**Amended 2026-11-03 (back-office settings redesign)**: the settings pages moved under one Settings area. DY (now
"Delivery days"), DH ("Hub and runs") and AA ("Team and access") were rewritten and their versions raised; DV (Driver
work) and ST (Settings) were added; BW step 2 names the new Settings group. 49 → 51 tours.

**Amended 2026-11-05 (back-office Overview redesign)**: OV was rewritten for the new page (status sentence, tiered Needs
attention, the day line, orders against last week) and its version raised to 2. Same seven targets.

**Input**: User description: "Guided tours for the back-office console, on the same tours, Help place, per-person memory
and rules as 106 (shop console): every back-office page and every important part of it gets a short tour that starts
by itself the first time a person uses that page, and can be replayed from Help or search. Steps are filtered by the
staff role (administrator, manager, customer support) and by what is on screen. Include the full inventory of
back-office tours and every step's explanation text."

## Why this slice exists

Back-office is where Effy runs the business: orders and refunds, dispatch and the hub, drivers and vehicles, shops,
the catalogue and its review, promotions, delivery coverage and pricing. It has **45 addresses**, and Delivery
alone has six tabs. Most are used by a
handful of staff, some only now and then (pricing plans, skins, tax), and a lot of them hold rules that are written
nowhere on the screen:

- **Easy to get wrong.** A margin changes what customers pay the moment it is saved. A held product leaves the shelves
  at once. A fee plan that is activated prices every order from then on. A clearance decides who can be given work.
- **Hard to find.** The hand-over report, Dispatch's "Why nobody has it", skins, the fee simulator and the postcode
  checker are rarely found without being shown.
- **Different for each role.** Customer support reads almost everything but acts on little. A manager or an
  administrator acts. A page explains neither.

The shop console got tours in 106. This slice gives back-office the same tours, built from the same pieces, with its
own list of pages and words.

## Scope

- **In scope:** every back-office page (the inventory below), the parts every page shares (the sidebar, search, the
  account menu, scanning anywhere), and the Help place.
- **Shared with 106, not re-specified here:** how a tour runs and looks, starting by itself once per person, Help and
  search, All tours, and how a step is skipped when its part is not on screen. 106's rules and requirements apply
  unchanged unless this spec says otherwise.
- **Not in scope:** the sign-in page, the "Your back-office record" dialog, and the keyboard-shortcuts list (the `?`
  key still opens it; the Help button is separate).

## How back-office tours behave (the rule)

**106's rule, plus roles.** A tour starts by itself the first time a person reaches a page, after the page has loaded.
It can be closed at once with **Esc** or **✕**, replayed from **Help** or search, and only explains: it never presses
or changes anything. The Welcome tour starts first, on a person's first back-office sign-in.

**Steps follow the person's role.** Back-office has three roles: **Administrator**, **Manager** and **Customer
support**.

- A step that explains **doing** something only an administrator and a manager may do is shown only to them ("Admin
  or manager" in the inventory).
- A step about something only an administrator may change is shown only to administrators ("Admin").
- Customer support sees the steps that explain what a page **shows**. Where a page is read-only for them, the tour
  says so once instead of explaining buttons they cannot use.

**One page, one tour; one tab, one tour.** A page split into tabs that each have their own entry in the sidebar
(Customers and Points settings, until the settings redesign moved Points to Settings) has a tour per tab. A page whose views are only filters (All
orders, Exceptions' kinds) has one tour.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A new staff member learns a page by its tour (Priority: P1)

A new customer-support agent opens Orders for the first time. The Orders tour starts by itself and walks them through
the views, the search, and what a row tells them. Later they open an order, and its tour shows them the packages,
the refunds and where the customer's own view of the order is.

**Why this priority**: It is the reason for the feature. One page's tour, once it works, already helps.

**Independent Test**: Sign in as a person who has finished the Welcome tour but no page tours. Open Orders: its tour
starts once the list has loaded. Reload: it does not start again, on this device or any other.

**Acceptance Scenarios**:

1. **Given** a person who has never opened a back-office page, **When** it has loaded, **Then** its tour starts by
   itself.
2. **Given** the person finished or closed it, **When** they open the page again on any device, **Then** it does not
   start again.
3. **Given** a person's first back-office sign-in, **When** the console opens, **Then** the Welcome tour starts; when
   it is finished, the page's own tour follows.

---

### User Story 2 - A tour shows each role only what applies to them (Priority: P1)

A customer-support agent and a manager each run the Exceptions tour. The agent learns what each list shows and that
acting on it needs an admin or a manager. The manager also learns how to mark a failed delivery dealt with and how to
clear a vehicle.

**Why this priority**: A step explaining a button a person cannot use damages trust in every other step. It is also
what makes one tour serve three roles.

**Independent Test**: Run the Exceptions tour as Customer support, then as Manager. The steps marked "Admin or
manager" appear only for the manager, and the counter counts only the steps shown.

**Acceptance Scenarios**:

1. **Given** a Customer support person, **When** a tour reaches a step marked "Admin or manager", **Then** it is
   skipped and not counted.
2. **Given** a Manager, **When** a tour reaches a step marked "Admin", **Then** it is skipped.
3. **Given** an Administrator, **When** any tour runs, **Then** every step whose part is on screen is shown.

---

### User Story 3 - Anyone replays a tour (Priority: P1)

A manager sets up a new delivery window for the first time in months. They open **Help → Tour this page** on Delivery
windows, and the tour runs again.

**Why this priority**: Most back-office pages are used rarely. A tour only seen once, months ago, has to be easy to
call back.

**Independent Test**: On any page, Help → Tour this page runs that page's tour from step 1. Help → All tours lists every
tour their role may open; starting one for another page opens that page (and, for a record page, the most recent record) first.

**Acceptance Scenarios**:

1. **Given** any back-office page, **When** the person opens Help, **Then** it offers Tour this page, the Welcome tour,
   All tours, "Show tours on new pages" and "Show every tour again", exactly as in the shop console.
2. **Given** search is open, **When** they type "tour", **Then** Tour this page and All tours are offered.
3. **Given** All tours, **When** they start the tour of a page they may not open (Tax for a manager), **Then** that
   tour is not listed for them.

---

### User Story 4 - Tours on pages that change under them (Priority: P2)

Dispatch, Exceptions, the hub station and the overview update live. The tour keeps pointing at the right thing, or
moves on when its part goes away.

**Why this priority**: The busiest pages are the live ones. A tour that breaks when a round moves would fail exactly
where it is needed.

**Independent Test**: Run the Dispatch tour while a package is assigned elsewhere. The "Needs a driver" step moves on
when the section empties, and nothing else changes.

**Acceptance Scenarios**:

1. **Given** a running tour, **When** a live update removes the part a step points at, **Then** the tour moves to the
   next step that is shown, or ends.
2. **Given** an empty list (nothing needs a driver, no exceptions), **When** its tour runs, **Then** the steps about
   rows are skipped and the page's own steps still run.

---

### User Story 5 - The operator sees which tours help (Priority: P3)

The same product analytics as 106, with the tour, how it started, the last step seen, and the person's role, so the
operator can see whether a tour fails one role more than another.

**Independent Test**: Start, finish and close a tour as two different roles. Each event carries the tour key, the
step, and the role name, and nothing about an order, customer, product or shop.

**Acceptance Scenarios**:

1. **Given** any tour event, **When** analytics are read, **Then** it names the role (Administrator, Manager,
   Customer support) and no record.

---

### Edge Cases

- **A scan arrives mid-tour**: back-office opens an order when a bag label is scanned anywhere (except the hub station,
  which has its own scan box). That navigation ends the running tour as closed, as in 106.
- **The `?` key**: it still opens Keyboard shortcuts. Help is its own button and never steals that key.
- **A page a role can read but not change** (Order rules, Points settings, Delivery for Customer support): the tour
  shows what the page holds, then one step that says it is read-only for them.
- **A page only one role may open** (Tax, Team and access for administrators; Hub station and Imports for
  administrators and managers): it has no tour for anyone else, and All tours does not list it for them.
- **The Classic skin and other built-ins**: a step about editing points at what a built-in skin shows instead; a step
  whose part a built-in hides is skipped.
- **Every step would be skipped** (for example, Feedback with nothing to look at): 106's centred card with the tour's
  title and "There's nothing here to show yet. Try this tour again once the page has something in it."
- **Shared bench and shared accounts**: tours are remembered per person, as in 106.

## Requirements *(mandatory)*

### Functional Requirements

**The same tours as the shop console**

- **FR-001**: Back-office MUST use 106's tours unchanged: how they look and run, starting by itself once per person,
  Help, search, All tours, skipping steps whose part is not on screen, urgent things staying above a tour,
  remembering per person on any device, and the analytics. Only the list of tours, their words and the role rule below
  are back-office's own.
- **FR-002**: A back-office person's tour record MUST be kept separately from any shop-console record. A person with
  accounts in both consoles has two records.
- **FR-003**: Every page listed in the Tour Inventory MUST have its tour, and back-office MUST NOT have a page without
  one. A new page without a tour MUST be caught before release, by the same kind of check as 106 (SC-001).

**Roles**

- **FR-004**: A step marked **Admin or manager** MUST be shown only to administrators and managers. A step marked
  **Admin** MUST be shown only to administrators. A step marked **Customer support** (the "read-only for you" steps)
  MUST be shown only to customer support. A step without a mark is shown to all three roles (when its part is on
  screen).
- **FR-005**: A tour of a page a role may not open MUST NOT start for that role and MUST NOT be listed in their All
  tours.
- **FR-006**: Where a page is read-only for Customer support, its tour MUST say so in one step instead of explaining
  the controls they cannot use.

**Words**

- **FR-007**: Every tour's steps and words MUST live in one list for back-office, reviewable without running the
  console. The Tour Inventory below is its first version, and the list MUST match it word for word.
- **FR-008**: The words MUST follow 106's limits (a title at most 40 characters, a text at most 220, at most 12 steps
  a tour) and the platform's fixed wordings: "Delivered by Effy" / "Courier delivery", the nine package status words,
  "Same-day" / "Standard" only as the customer's words.
- **FR-009**: A step MUST NOT promise something the page does not do. Where a rule is enforced elsewhere (a margin
  never shown to shops, a refund going to the card first), it is said as the page says it.

**Help and search in back-office**

- **FR-010**: The Help button MUST sit in back-office's header beside search and the account menu, on every page.
- **FR-011**: Back-office search MUST offer **Tour this page** and **All tours**.
- **FR-012**: Analytics events from back-office tours MUST carry the person's role name, and nothing else about the
  person or any record.

### Key Entities

- **Back-office tour**: as 106's tour, with each step optionally marked for a set of roles.
- **Tour record (per back-office person)**: as 106's, kept apart from shop-console records.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: 100% of back-office pages have a tour, and an automatic check fails a page without one, a step that
  points at nothing, or a tour's words that differ from this spec.
- **SC-002**: Each page tour can be read through in under 90 seconds; the Welcome tour in under 2 minutes.
- **SC-003**: A Customer support person never sees a step marked for another role, in any tour (checked automatically
  per role).
- **SC-004**: Any tour can be replayed from any page in at most 2 presses.
- **SC-005**: A new staff member who took the Orders, order and Exceptions tours can find a failed delivery, read why
  it failed and open its order without asking anyone. This is checked on a walk.
- **SC-006**: In the first month, at least 60% of back-office tours that start are finished, for each role separately.

## Assumptions

- **Built on 106**: 106 is built (not yet deployed). This slice adds back-office's own list of tours, the role rule,
  the Help button in back-office's header, its search commands, and its own place to keep each person's record.
- **Roles as they are today**: Administrator (`admin`), Manager (`manager`) and Customer support (`csa`). What each may
  do is the Team and access page's table, and the steps' role marks follow it.
- **Settings pages are pages** (settings redesign, 2026-11-03): every page under Settings - the index, Delivery's five,
  Hub and runs, Driver work, Order rules, Points, Tax and Team and access - has its own address and sidebar entry, so
  each has its own tour. Other in-page sections (a driver's Profile and Clearances, a shop's Overview, Team and
  Products) are steps of one tour.
- **Record pages**: an order, a round, a customer, a feedback item, a driver, a vehicle, a shop, a product, an import,
  a product in review, a promotion, a display group, a skin and an email address each have a tour that runs on
  whichever one is open. All tours opens the most recent one first.
- **Desktop first**: back-office is used on computers. Tours still follow 106's narrow-width rules, without extra
  stand-ins beyond what a page already folds away.

---

## Tour Inventory (back-office)

**53 tours**: the Welcome tour and 52 pages and tabs, 296 steps. **Points at** is the part of the page a step outlines. **Shown when** is blank when the step is shown to
every role whenever its part is on screen. Role marks: **Admin or manager**, **Admin**, **Customer support**.

### BW - Welcome to Effy Back-Office (the whole console; starts by itself at first sign-in)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Nothing (centred) | Welcome to Effy Back-Office | This is where Effy is run: orders and refunds, drivers and the hub, shops, the catalogue, promotions and delivery. The tour takes about a minute. | |
| 2 | The sidebar | Find your way | Operations is the day's work. People holds customers, drivers, vehicles and shops. Catalogue is products, review and promotions. Settings is delivery, the hub and drivers, checkout and the business. | |
| 3 | Sidebar › Exceptions | Numbers mean work | A number beside a page is work waiting there, such as exceptions to deal with or products to review. It updates by itself. | |
| 4 | Header search | Search and commands | Find an order, a customer or a package, or type a page's name to go there. Press ⌘K (Ctrl K on Windows) on any page. | |
| 5 | Nothing (centred) | Scan from anywhere | Scan a bag label with a handheld scanner on any page, and its order opens. The hub station has its own scan box. | |
| 6 | Header › account menu | Your account | Your role, light or dark, your back-office record, the keyboard shortcuts, and sign out. | |
| 7 | Header › Help | Help is always here | Every page has its own short tour. It starts the first time you use a page; open it here any time to see it again. | |

### OV - Overview

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | The day at a glance | One sentence says whether today is on track, then the next three things on the clock. Everything here updates live. | |
| 2 | Find an order | Find an order | Type an order number or a customer to jump straight to it. | |
| 3 | Needs attention | Needs attention | Most urgent first: what stops work now, what customers are waiting on, and what can wait. Each count opens the list it comes from. | |
| 4 | Today's delivery windows | Today's delivery windows | Every window on one clock, with its order-by time, the collection runs and a Now line. Point at a bar to see where its packages are. | |
| 5 | On duty now | On duty now | The drivers working now, problems first, and what each is doing. Drivers go on duty in the driver app; back-office can't do it for them. | |
| 6 | Orders today | Orders today | Orders, sales and deliveries on time, against the same day last week. Choose a figure to chart it. | |
| 7 | Shortcuts | Shortcuts | The pages you go to most, one press away. | |

### OL - Orders · All orders

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Every paid order | Every paid order with its status, delivery details and who is handling it. | |
| 2 | Order views | Views | Narrow the list to one kind of order, such as those that need a driver. | |
| 3 | Search orders | Search | Find an order by its number, the customer's email or a bag code. | |
| 4 | Sold as and Shop filters | Filters | Narrow by how it was sold (a window, a day, courier) and by the shop that packs it. | |
| 5 | Status column | Status | Where each order is up to, in the same nine words every console uses. | There are rows |
| 6 | Dispatch and Courier parcels | The next desks | Dispatch is the drivers' work; Courier parcels is everything going by courier. | |

### OD - An order (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Order heading | This order | The order number and where it is up to. Use ← and → to move to the previous or next order. | |
| 2 | Things to notice | Things to notice | Anything that needs a decision: a refund the customer asked for, items a shop couldn't supply, a missed pickup. | Shown |
| 3 | Packages | Packages | Each shop packs its share, and it moves on its own until it reaches the customer. Every bag has to be accounted for before it moves on. | |
| 4 | Record hand-over / Record arrival | Recording a step | Record a hand-over or an arrival by hand only when it really happened and no scan recorded it. | Admin or manager |
| 5 | Items | Items | What was ordered, from which shop, and what is left to refund. | |
| 6 | Delivery | Delivery | Who delivers, what the customer was sold, and how the delivery fee was worked out, once for the whole order. | |
| 7 | Payment & refunds | Payment and refunds | How it was paid and what has gone back. A refund returns to the card first, then to points. | |
| 8 | Order actions | Changing an order | Issue a refund, change the day or time, or move it between Delivered by Effy and Courier delivery. | Admin or manager |
| 9 | What the customer sees | What the customer sees | The order as the customer sees it in the app and on the website. | |
| 10 | Order activity | Order activity | Everything that has happened to this order, from every console, newest first. | |

### DS - Dispatch

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Today's driver work | Collection and delivery rounds, who has them, and work still needing a driver. It updates live. | |
| 2 | Dispatch sections | Three sections | Needs a driver, Delivery windows and Rounds. Jump to any of them here. | |
| 3 | Needs a driver | Needs a driver | Packages ready at a shop or at the hub that nobody has yet. Each says why auto-assign couldn't place it. | There are rows |
| 4 | Assign | Assigning by hand | Give a package to a driver yourself when auto-assign can't. The driver must be cleared for that work and area. | Admin or manager |
| 5 | Delivery windows | Delivery windows | Parcels booked into each window, by day, and the round that will carry them. | |
| 6 | Rounds | Rounds | Collection runs bring parcels from shops to the hub; delivery rounds take them to customers. Open one to see its stops. | |

### RD - A round (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Round heading | This round | A collection run or a delivery round, its driver, and whether it is late. | |
| 2 | Stops | Stops | Every stop in the order the driver sees them. | |
| 3 | A stop's arrows | Changing the order | Use a stop's arrows to change the order the driver sees. Nothing changes until you save. | Admin or manager |
| 4 | Reassign | Reassign | Move the whole round to another driver. Their app tells them the round moved. | Admin or manager |
| 5 | Take this round back | Take this round back | The driver loses the whole round at once. Anything already in the van stays with them until returned or delivered. | Admin or manager |
| 6 | Let this run go ahead | Let it go ahead | Only when the driver can't do the step before in the app, for example a dead phone at the hub. | Admin or manager |

### HR - Hand-over report

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | How bags changed hands | Every bag hand-over between shops, drivers and the hub, and whether it was scanned. | |
| 2 | From | The period | Choose the dates the report covers. | |
| 3 | Summary | Summary | How many hand-overs, how many were scanned, and the exceptions per 1,000. | |
| 4 | By shop | By shop | Least scanned first. A shop low here is usually printing labels badly. | |
| 5 | By driver | By driver | Least scanned first, for each driver. | |
| 6 | Refused reads and missing bags | What went wrong | Scans that were refused, and bags a driver declared missing. | |

### CP - Courier parcels

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Parcels going by courier | Every parcel going to a customer by courier, ready to book, track and record each step. | |
| 2 | Courier stages | Stages | At the hub, late at the hub, supplier pickups, with the courier, and problems. | |
| 3 | Courier services filter | By service | Narrow to one courier service. | |
| 4 | Search courier parcels | Search | Find a parcel by order number or service. | |
| 5 | A parcel | Booking and tracking | Open the order to book the consignment, add tracking and the label, and record each step. | There are rows |
| 6 | Page heading | Labels stay private | A label opens through a short-lived link and is never shared publicly. | |

### EX - Exceptions

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | When delivery goes wrong | Deliveries a driver couldn't complete, and anything else waiting on a person to decide. | |
| 2 | Exception kinds | Four kinds | Failed deliveries, runs waiting on their next step, vehicle checks, and packages a driver declared missing. | |
| 3 | Show | Open or dealt with | Open is what still needs someone. Dealt with is the record of what was decided. | |
| 4 | Search exceptions | Search | Find one by order, driver or suburb. | |
| 5 | Action | Dealing with one | Mark a failed delivery dealt with: redelivered, refunded, collected by the customer, or something else. | Admin or manager |
| 6 | Vehicle checks | Vehicle checks | A vehicle found unsafe stops its driver getting work. Clear it only once it is fixed or they have another vehicle. | Admin or manager |
| 7 | Page heading | Read-only for support | Customer support sees these lists but can't act on them; an admin or a manager does. | Customer support |

### HS - Hub station (Admin or manager)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Checking bags in | Scan bags arriving from collection runs to check them in and see where each goes next. | |
| 2 | Scan | Scan | Scan a bag, or type its code. Each scan answers with where the bag goes. | |
| 3 | Runs on the way in | On the way in | Runs a driver is bringing to the hub, and their bags still to check in. | |
| 4 | Earlier scans | Earlier scans | What has been checked in, with its zone, order and where it goes. | |

### CU - Customers

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Everyone with an account | Every customer with an Effy account, their orders and their points. | |
| 2 | Search customers | Search | Find a customer by name, email, phone or an order number. | |
| 3 | Has ordered filter | Who has ordered | Narrow to customers who have ordered, or never have. | |
| 4 | Points column | Points | Their usable balance. Open a customer to credit or remove points. | There are rows |

### CS - Points settings

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | How points work | How customers earn points, what they are worth, and when they expire. | |
| 2 | Value of a point | Value of a point | In cents. A change applies to new orders; orders already paid keep their value. | |
| 3 | Points last | Expiry | How long points last, and how many days before expiry customers are emailed. | |
| 4 | Customer-service credit limit | Credit limit | The most a customer-support agent can credit at once. More needs a manager. | |
| 5 | Checkout hold | Checkout hold | How long points chosen at checkout are set aside while the customer pays. | |
| 6 | Rule changes | Rule changes | Every change to these rules, and who made it. Only an administrator can change them. | |

### CN - Notification settings (111: specs/111-notification-preferences/spec.md › Guided tours)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Promotional notifications | How often customers who said yes to offers and news may get one on their phone. Order updates, points and important messages are never limited. | |
| 2 | The limits | Limits | The most promotional notifications a customer gets in a day and in a week. Any over the limit still reach their inbox, without a notification. | |
| 3 | Activity | Rule changes | Every change to these limits, and who made it. Administrators and managers can change them. | |

### CD - A customer (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Customer heading | This customer | Their account, contact details and when they joined. | |
| 2 | Points | Points | Points are a way of paying, never a discount. Usable, held at checkout, and the next to expire. | |
| 3 | Credit points | Credit points | Give points with a reason the customer sees. Over your limit, ask a manager. | |
| 4 | Remove points… | Remove points | Take points back, with a reason. | Admin or manager |
| 5 | Points activity | Points activity | Every change to their balance, with who made it and why. | |
| 6 | Recent orders | Recent orders | Their latest orders. Open one to see it in full. | |

### FB - Feedback

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | What customers tell us | Bugs, ideas, complaints and compliments sent by customers, ready to read and answer. | |
| 2 | Feedback views | Needs a look | New feedback nobody has looked at yet. "All" includes what was marked spam. | |
| 3 | Search feedback | Search | Find feedback by its words, the sender's email or its reference. | |
| 4 | A row | Open one | Open feedback to read it, note it, and reply. | There are rows |

### FD - A feedback item (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Details | Details | What it is about, the rating, who sent it and from where. | |
| 2 | Status | Status | Where it is up to. Sending a reply marks it Replied by itself. | |
| 3 | Reply | Reply | Write a reply; it is emailed to the sender. | Admin or manager |
| 4 | Internal note | Internal note | A note for staff only. It is never emailed or shown to the sender. | |

### DR - Drivers

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Effy's drivers | Every driver, whether they can be given work, and who is on duty. | |
| 2 | On duty now | On duty now | Who is working and what each is doing. Drivers go on duty in the driver app. | |
| 3 | Drivers who cannot be given work | Who can't work | Drivers with something to fix on their record, and licences or registrations about to expire. | Shown |
| 4 | Driver views | Views | Everyone employed, or everyone including those who have left. | |
| 5 | Search drivers | Search | Find a driver by name or work email. | |
| 6 | Cleared for column | Cleared for | The work each driver may be given: collecting, delivering, or both. | There are rows |
| 7 | Add driver | Add a driver | Gives them a sign-in for the driver app. Their work email is how they sign in and can't change. | Admin or manager |

### DD - A driver (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Driver heading | This driver | Their name, whether they are on duty, and anything that stops them being given work. | |
| 2 | Driver sections | Two sections | Their profile, and their clearances. | |
| 3 | Licence | Licence | Class and expiry. Once the date passes, the driver can't be given work. | |
| 4 | Cleared for | Clearances | Each clearance is one kind of work in one area, or everywhere. Without one, nothing can be assigned to them. | |
| 5 | Grant clearance | Granting work | Choose the work and where. "Everywhere" includes areas added later. | Admin or manager |
| 6 | Employment | Employment | When they started, and if they have left. A leaver's sign-in closes for good; their history is kept. | |
| 7 | Driver activity | Driver activity | Every change to this driver, with who made it. | |

### VL - Vehicles

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | The fleet | The vans and cars drivers use, what they carry, whether they are roadworthy, and who has each one. | |
| 2 | Vehicle views | Views | Vehicles in the fleet, or off the road. | |
| 3 | Refrigeration and Compliance filters | Filters | Find vehicles that carry chilled or frozen goods, or ones out of compliance. | |
| 4 | Search vehicles | Search | Find a vehicle by plate, make or model. | |
| 5 | Add vehicle | Add a vehicle | Record a vehicle Effy runs; capacity and compliance dates can be added on its page. | Admin or manager |

### VD - A vehicle (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Vehicle heading | This vehicle | Its plate, status, and anything that stops its driver being given work. | |
| 2 | Details | Details | What it carries, its capacity and its odometer. | |
| 3 | Who has it | Who has it | Issue it to a driver or record its return, with the odometer reading each time. | |
| 4 | Compliance | Compliance | Registration, insurance and roadworthy dates. A lapsed date stops its driver getting work. | |
| 5 | Status | Off the road or retired | Off the road is temporary, for repairs. Retired is for good; its history is kept. | Admin or manager |
| 6 | Vehicle activity | Vehicle activity | Every change and hand-over of this vehicle. | |

### SL - Shops

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Fulfilment shops | The shops that pack Effy orders, and the operators who run them. Customers never see a shop. | |
| 2 | Shop views | Views | Narrow the list by the shop's status. | |
| 3 | Search shops | Search | Find a shop by its code or name. | |
| 4 | Label scanning column | Label scanning | How many of a shop's packages left with a scan. A low share usually means labels print badly. | There are rows |
| 5 | Create shop | Create a shop | Registers a shop and gives its first manager a sign-in. | Admin or manager |

### SD - A shop (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Shop heading | This shop | Its code, status and how it is doing at a glance. | |
| 2 | Shop sections | Sections | Overview, Team and Products. | |
| 3 | Details | Details | Its address is for drivers only and is never shown to customers. | |
| 4 | Packing | Packing | Whether every bag's label must be scanned as it is packed, before an order can be ready. | |
| 5 | Team | Team | The operators who sign in to its console, and their roles. | |
| 6 | Stock | Stock | Its products at or below their low-stock threshold, out of stock first. | |
| 7 | Danger zone | Suspend, disable or remove | Suspend stops new work; disable stops every sign-in; remove only a shop that never had operators. | Admin or manager |
| 8 | Shop activity | Shop activity | Every change to this shop, with who made it. | |

### PL - Products

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Every product | Every product of every shop. Search, narrow and open one to see everything about it. | |
| 2 | Product states | States | On sale, waiting for review, held by Effy, Effy setting up, and more. | |
| 3 | Search products | Search | Find a product by name, SKU or barcode. | |
| 4 | Storage and Margin filters | Filters | Narrow by how it is stored, or whether Effy's margin is set. | |
| 5 | Margin column | Shop price and margin | What the shop is paid, Effy's margin, and what customers pay. | There are rows |
| 6 | A row's tick box | Several at once | Tick products to set a margin, hold them or release them together. | Admin or manager |
| 7 | New product and Import a list | Adding products | Create a product for a shop yourself, or import a shop's whole list from a spreadsheet. | Admin or manager |

### PD - A product (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Product heading | This product | Its state: on sale, waiting for review, held by Effy or Effy setting up. | |
| 2 | Sizes and stock | Sizes and stock | What the shop is paid and what customers pay, per size. Turning a size off sale is immediate and the shop is told. | |
| 3 | Pictures | Pictures | As the shop added them. The first is the main picture shoppers see in the aisle. | |
| 4 | Description and Details | Description and details | The shop's own words, and the details its category asks for. | |
| 5 | Aisles | Aisles | Its home aisle decides its details. Effy can also show it in up to five more. | |
| 6 | How shoppers see it | How shoppers see it | At the customers' price, after Effy's margin. Shoppers never see which shop supplies it. | |
| 7 | Shop and facts | Shop and facts | The shop, Effy's margin, storage, GST and 18+. | |
| 8 | Hold | Holding a product | A hold takes it off sale at once, and its shop can't put it back. The shop is told your reason. | Admin or manager |
| 9 | Activity | Activity | Effy's decisions on it: review, margin, holds and its sizes on and off sale. | |

### PN - New product (Effy creates it for a shop)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | The steps | Six steps | Shop and margin, then name and category, photo, variants and prices, details, and a last check. | |
| 2 | Shop & margin | Which shop, what margin | The product is the shop's: it sees it, fulfils its orders and owns it once it is on sale. | |
| 3 | Effy's margin | Effy's margin | Added to every size's shop price to make what shoppers pay. | |
| 4 | Shop's price | Shop's price | What Effy pays the shop. Shoppers pay this plus Effy's margin. | |
| 5 | Save | Saving | Complete, it goes straight on sale. Not complete, it saves as Effy's draft until it is finished. | |

### IM - Imports (Admin or manager)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | A shop's whole list | Effy creates a shop's products from its spreadsheet. Every row is checked first; nothing is created until you say so. | |
| 2 | New import | New import | Choose the shop and Effy's margin, then upload the list as .xlsx or .csv. | |
| 3 | Aisles in the list | Detail columns | Each aisle you choose adds a column for every detail it asks for. | |
| 4 | Download the template | The template | One row per size; rows with the same product key are one product. | |
| 5 | Imports list | Past imports | Every import, its shop, state and how many products it created. | There are rows |

### ID - An import (needs a record; Admin or manager)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Import heading | This import | Its file, its shop and where it is up to. The page updates by itself while it runs. | |
| 2 | Rows | The rows | Each row and what is wrong with it, if anything. | |
| 3 | What is wrong | Fixing rows | Fix them in the file and upload it again; rows already created are recognised by their SKU. | Shown |
| 4 | Create | Creating | Creates the ready products. Those without a main picture wait for Effy to finish them; the rest go on sale. | Admin or manager |

### PF - Finish a product (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | The steps | Finishing Effy's draft | A product Effy started for a shop. Fill in what is missing; it goes on sale by itself once complete. | |
| 2 | Save | Saving | Saving a complete product approves it and hands it to the shop. Effy can't edit its content after that. | |

### RQ - Product review · Queue

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | What shops send | New products and changes shops send to Effy. Customers see nothing new until it is approved. | |
| 2 | Review views | Two lists | Waiting for review, and products on sale with no margin set. | |
| 3 | Search review | Search | Find a product or a shop. | |
| 4 | Waiting for | Oldest first | How long each has been waiting. Start with the oldest. | There are rows |
| 5 | Start reviewing | Start reviewing | Opens the oldest, then each next one in turn. | |
| 6 | Set margin | Margin not set | These sell at the shop's own price. Setting a margin changes what customers pay at once. | Admin or manager |

### RI - Reviewing a product (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Review heading | What is being reviewed | A new product, or a change to one on sale. Customers keep seeing what is live until you approve. | |
| 2 | Things to notice | Things to notice | What the review spotted: a price rise worth a look, required details missing. | Shown |
| 3 | What changes | What changes | Only what differs from the live product, side by side or in one column. | Shown |
| 4 | Sizes and prices | Sizes and prices | What the shop is paid, and what customers will pay at the margin you set. It updates as you type. | |
| 5 | Effy margin | Effy margin | Shops are never told the margin. It is Effy's. | Admin or manager |
| 6 | Pictures | Pictures | The first is the main picture in the aisle, and it must be the product itself. | |
| 7 | Also shown in | Extra aisles | Other aisles shoppers find it under. Its own category still decides its details. | |
| 8 | Decision | Approve or send back | Approve puts it on sale. Send back tells the shop why, with common reasons ready to pick. | Admin or manager |
| 9 | Previous and Next | Through the queue | Use ← and → to go to the previous or next one. | |

### RM - Missing details

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Missing details | Products on sale before their category asked for these details. They stay on sale. | |
| 2 | Department filter | By department | Narrow to one department. | |
| 3 | Missing column | What is missing | The details each product lacks. Shops see the same list in their catalogue. | There are rows |

### TX - Categories & attributes

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | The category tree | The tree shops file products in and customers browse, and the details each category asks for. | |
| 2 | Taxonomy views | Two views | Categories, and the library of attributes they use. | |
| 3 | Category tree | Categories | Up to five levels. Drag a category to move it; its sub-categories move with it. | |
| 4 | Category panel | A category | Its name, icon, picture and synonyms, the defaults a new product starts from, its form and its products. | Shown |
| 5 | Defaults | Defaults | Storage, GST and 18+ that a new product starts from. A shop may change them; review sees the change. | Shown |
| 6 | Retire | Retiring | Shops can no longer file products there and the storefront stops showing it. You can restore it later. | Admin or manager |
| 7 | Attribute library | Attributes | Details categories can ask for: whether shoppers filter on one, and whether it can be a variant option. | Shown |

### PR - Promotions · Codes

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Every offer | Every discount and offer, applied automatically or with a code, with its status and dates. | |
| 2 | Promotion views | Views | Narrow by status. | |
| 3 | Kind, Applies and Group filters | Filters | Narrow by what it gives, whether it needs a code, and the display group it is shown in. | |
| 4 | Search promotions | Search | Find a promotion by its name or code. | |
| 5 | Display groups, Skins and Order rules | Where and how | Display groups decide where offers show, skins how they look, order rules the limits on every cart. | |
| 6 | New information banner | Information banners | Something to tell shoppers that is not an offer: no discount, no code and no conditions. | Admin or manager |
| 7 | Create promotion | Create a promotion | Money off the cart or delivery, or buy-and-get, by code or automatically. | Admin or manager |

### PE - Creating or editing a promotion

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Basics | Basics | Its name is for staff only; shoppers read the words you set at the end. | |
| 2 | How it applies | Code or automatic | With a code shoppers type it in their cart. Automatic applies to every cart that qualifies. | |
| 3 | Kind | What it gives | Off the cart, off delivery, or buy some and get some. | |
| 4 | Who | Who can use it | Everyone, new customers, or customers you choose. | |
| 5 | When | When | Its start and end, and the days and hours it runs. | |
| 6 | Limits | Limits | Total uses, uses per customer and a budget. It stops at once when it reaches one. | |
| 7 | Combines with other promotions | Combining | Off: when another offer gives the shopper more, that one applies instead. | |
| 8 | Summary | Summary | The promotion as you have set it. What it gives and who it is for are fixed once it is used. | |

### BE - Creating or editing an information banner

*Added by 108 (information banners).*

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Basics | Basics | Its name is for staff only; shoppers read the words below. | |
| 2 | What shoppers read | What shoppers read | A headline, a supporting line and a label. Insert a live value, like the free-delivery amount, and it stays up to date by itself. | |
| 3 | Where a tap leads | Where a tap leads | Search, the sale page, an aisle or a product. | |
| 4 | When | When | Its start and end, and the days and hours it is shown. | |
| 5 | Where it's shown | Where it's shown | The display groups it appears in, beside offers. | |
| 6 | As shoppers read it | Preview | The banner as shoppers will read it. A banner never has a code or conditions. | |

### PP - A promotion (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Promotion heading | This promotion | Its status and what it gives. | |
| 2 | Publish, Pause, End now | Status | Publish starts it. Pause stops it until you resume. End now stops it for good. Placed orders keep their discount. | Admin or manager |
| 3 | Promotion sections | Sections | Overview, where it is shown, pictures, chosen customers and codes. | |
| 4 | Shown in | Shown in | The display groups it appears in. Not shown anywhere, it still applies in the cart. | |
| 5 | Pictures | Pictures | Pictures for skins that show one. Each has a description read aloud to shoppers who can't see it. | |
| 6 | Codes | Single-use codes | Generate codes that each work once, and download them as a spreadsheet. | Shown |
| 7 | Performance | Performance | Uses, customers, discount given and sales over the last 30 days, from paid orders only. | |
| 8 | Promotion activity | Activity | Every change to this promotion, with who made it. | |

### PG - Display groups

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Where offers are shown | Each group is one place on the website and app where promotions are shown, in its own order. | |
| 2 | Key column | The key | Whoever builds that place in the website or app uses this key. It can't be changed later. | There are rows |
| 3 | New group | New group | Create one for each place promotions are shown. | Admin or manager |

### GD - A display group (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Promotions, in order | In order | Shoppers see them in this order, and only the ones they can use right now. | |
| 2 | Add a promotion | Adding one | Only promotions with a headline can be shown. | Admin or manager |
| 3 | What a shopper sees now | What a shopper sees | The place as it looks now. Hidden promotions are marked. | |
| 4 | How this place looks | How it looks | The place's size and its skin, with another skin for promotions that need a code. | |

### SK - Skins

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | How offers look | Reusable designs for how promotions look wherever they are shown. | |
| 2 | Looks like | Looks like | A small preview of each skin. | There are rows |
| 3 | Used in | Used in | The display groups using each skin. | There are rows |
| 4 | New skin | New skin | Pick a layout and set its colours, words and pictures. | Admin or manager |

### SE - A skin

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Name and layout | Name and layout | Its name is for staff only. The layout decides where the picture and words sit. | |
| 2 | Background | Background | Its colour, and whether to show the promotion's picture with a tint. | |
| 3 | Words | Words | The label, headline and supporting line: their colours, sizes and alignment. | |
| 4 | Button and code | Button and code | With a code the button copies it; without one it opens the offer. | |
| 5 | Preview | Preview | Exactly as the website draws it, at different widths and words. | |
| 6 | Readable? | Readable? | Every piece of text against what it sits on. A skin that can't be read is refused. | |
| 7 | Where it's used | Where it's used | Changing a skin changes every place that uses it. | |

### OR - Order rules

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Limits on every cart | The minimum spend to check out and the limits on a single cart. | |
| 2 | Minimum spend | Minimum spend | A cart below this can't check out. | |
| 3 | Most of any one item | Most of one item | The most of any one item a cart may hold. | |
| 4 | Most different items | Most different items | The most different items in one cart. | |
| 5 | Page heading | When it applies | A change applies to the next cart a shopper opens. Carts already paid aren't affected. | |

### DC - Delivery · Coverage

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Where Effy delivers | The postcodes Effy's own drivers deliver to, in optional groups. Anywhere else is courier delivery or nothing. | |
| 2 | Check a postcode or place | Check a postcode | Type a postcode or place to see who delivers there and whether delivery today is offered. | |
| 3 | Postcodes Effy delivers to | The list | Every postcode, its group, its distance from the hub and whether delivery today is offered. | |
| 4 | Distance column | Distance | Worked out from the hub, or entered by hand. "To review" means the hub moved since. | There are rows |
| 5 | Delivery today | Delivery today | Switch delivery today off for far postcodes. Customers there see later days only. | Admin or manager |
| 6 | Groups | Groups | Groups organise the list and decide which drivers are cleared there. Removing one never removes its postcodes. | |
| 7 | Add places | Add places | Add postcodes or places to the list. | Admin or manager |

### DK - Delivery · Courier delivery

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Courier delivery | Delivery by courier for addresses outside Effy's area. | |
| 2 | Offer courier delivery | Switching it on | It needs an active courier fee table and a default courier service first. | |
| 3 | How courier parcels reach the courier | Hub or supplier | Via the hub, or picked up from the supplier. Staff can change one order until its first parcel leaves. | |
| 4 | Excluded postcodes | Excluded postcodes | Places courier delivery is never offered, with the reason. | |
| 5 | Courier services | Courier services | The services Effy uses, what customers are told, and pickup days. The default one is what checkout offers. | |

### DP - Delivery · Pricing

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | One fee per order | Distance band, weight band, the basket's value and the chosen window. Placed orders keep their fee. | |
| 2 | Plans | Fee plans | Exactly one plan is in force. A plan that was active can't change; copy it to a new draft. | |
| 3 | Activate | Activating | A plan goes live only when it can price every distance and every weight. | Admin or manager |
| 4 | Courier tables | Courier tables | The fees for courier delivery, kept apart from Effy's plans. | |
| 5 | Try a plan | Try a plan | Enter a postcode, weight and basket to see the fee and every step that built it. | |

### DW - Delivery · Delivery windows

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Delivery windows | The windows customers choose from, with their hours, order-by time and how many deliveries each takes. | |
| 2 | Windows table | Windows | Each window's hours, order-by time, limit, and how many are booked today. | There are rows |
| 3 | Any time | Any time | The window for orders with a day but no time. It is always on; its hours and limit can change. | Shown |
| 4 | New window | New window | It is offered at checkout as soon as you save. Orders already placed keep their window. | Admin or manager |
| 5 | Switch off | Switching off | A window switched off is no longer offered. With none active, Effy delivery is offered to no one. | Admin or manager |

### DY - Delivery · Delivery days

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Delivery days | Which days customers can choose, what an "as soon as possible" order is told, and the dates Effy is closed. | |
| 2 | Days customers can choose | Days customers can choose | How many delivery days after today are offered, and the weekdays with no delivery. | |
| 3 | As soon as possible | As soon as possible | What a customer who chooses no day is told. Always an estimate, never a promised day. | |
| 4 | Holding a place | Holding a place | How long a place in a window is kept while a customer pays. | |
| 5 | Dates with no delivery | Closed dates | Dates Effy doesn't deliver, such as public holidays. Closing one saves at once. | |

### DH - Hub and runs

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Hub and runs | Where the hub is, the time shops and the hub need, and when drivers collect from shops. | |
| 2 | Where the hub is | The hub | Every postcode's distance is measured from here. Moving it flags hand-entered distances for another look. | |
| 3 | Shop prep buffer | Prep buffer | How long a shop needs to pack before a collection run. | |
| 4 | Hub turnaround | Hub turnaround | From a collection run reaching the hub to its parcels being ready to leave. An estimate until rounds are timed. | |
| 5 | Collection runs | Collection runs | The times drivers collect from shops. No window today can be offered without a run that makes it. | |

### DV - Driver work

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Driver work | The rules for drivers' work: when rounds open, how they are planned, and when dispatch is told. | |
| 2 | When work opens | When work opens | A round opens this long before it starts. Until then the driver sees it but can't start it. | |
| 3 | Planning a round | Time at each stop | What the planner allows at each stop when it fills a round. | |
| 4 | Telling dispatch | Telling dispatch | When a van isn't loaded or parcels aren't checked in in time, it is listed on Exceptions. | |
| 5 | Vehicle check | Vehicle check | Whether drivers check their vehicle once a day before they get work. | |

### TS - Tax (Admin)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Tax | The business details on customer tax invoices, and whether invoices are issued. | |
| 2 | Effy's tax details | Effy's tax details | The legal name and ABN, exactly as registered with the ABR. | |
| 3 | Delivery and order fees | How fees are taxed | Choose how delivery and order fees are taxed. Confirm it with Effy's accountant. | |
| 4 | Tax invoices | Tax invoices | Once on, customers can download a tax invoice for any paid order. Every live product needs a GST status. | |

### ED - Email deliverability

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | Email that isn't arriving | Addresses that bounce or refuse mail. They receive no sign-in codes until someone repairs them. | |
| 2 | Deliverability views | Views | Addresses that need attention, or every address. | |
| 3 | Search address | Search | Find an address. | |
| 4 | Account column | Whose address | The customer, driver, shop or staff account it belongs to. | There are rows |

### EA - An email address (needs a record)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Address heading | This address | Its state, whose account it is, and why mail to it fails. | |
| 2 | Server said | What the mail server said | The reason the last message was refused. | |
| 3 | Mark as repaired… | Repairing | Re-enable email once you have checked with the person. Say what you checked. | Admin or manager |
| 4 | Email events | Email events | Every message sent to this address and what happened to it. | |

### AA - Team and access (Admin)

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | People tab | The team | Everyone with a back-office account, their role, and when they last opened back-office. | |
| 2 | Roles and permissions | Roles and permissions | What Administrators, Managers and Customer support may each do. The platform's staff record decides. | |

### ST - Settings

| # | Points at | Title | Text | Shown when |
|---|---|---|---|---|
| 1 | Page heading | All settings | Everything that decides how Effy runs, in one place. Open a page to change it. | |
| 2 | Delivery | Delivery | Where Effy delivers, what it costs, and the windows and days customers choose from. | |
| 3 | Hub and drivers | Hub and drivers | The hub, collection runs from shops, and the rules for drivers' work. | |
| 4 | Checkout | Checkout | The limits on every cart, and customers' points. | |
| 5 | Business | Business | Tax and invoices, and the team. | Admin |
| 6 | Nothing (centred) | Saving | Changes wait on a bar at the bottom: Save or Discard. Leaving a page with unsaved changes asks first. | |

### Not a tour of its own

- **Header search**, **Help**, **the account menu** and **scanning anywhere** are covered by the Welcome tour.
- **Dialogs and sheets** (Credit points, Hold, Set the margin, Send back, Add driver, Issue vehicle, New window, Add
  places, a fee plan's editor) are covered by the step that points at the button opening them. Opening them starts no
  tour.
- **Every activity drawer** is covered by the "… activity" step on its page.
- **Sign-in**, **Your back-office record** and **Keyboard shortcuts** have no tour.
