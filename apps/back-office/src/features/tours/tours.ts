import { defineTours } from "@effy/web-kit/tour"

/**
 * THE back-office guided tours (107) - the one list of their words (FR-007). Every title and text is copied from
 * specs/107-backoffice-guided-tours/spec.md › Tour Inventory, and `tours.test.ts` fails when the two differ: change the
 * words in both places. When a page is redesigned, re-read its tour here, and RAISE its `version` when the tour is
 * rewritten - people who saw the old one see the new one start by itself (106 FR-021).
 *
 * `target` names `data-tour` keys on the page (the first present wins); `null` is a centred card. A step whose part is
 * not on screen is skipped. `roles` limits a step - or, on a tour, the whole tour - to those roles ("Admin or manager"
 * = admin, manager; "Admin" = admin; "Customer support" = csa); `shownWhen` repeats the spec's condition.
 */
export const BACK_OFFICE_TOURS = defineTours([
  // BW - Welcome to Effy Back-Office
  {
    key: "welcome",
    version: 2,
    title: "Welcome to Effy Back-Office",
    anyPage: true,
    steps: [
      {
        target: null,
        title: "Welcome to Effy Back-Office",
        text: "This is where Effy is run: orders and refunds, drivers and the hub, shops, the catalogue, promotions and delivery. The tour takes about a minute.",
      },
      {
        target: "nav",
        title: "Find your way",
        text: "Operations is the day's work. People holds customers, drivers, vehicles and shops. Catalogue is products, review and promotions. Settings is delivery, the hub and drivers, checkout and the business.",
        side: "right",
      },
      {
        target: "nav.exceptions",
        title: "Numbers mean work",
        text: "A number beside a page is work waiting there, such as exceptions to deal with or products to review. It updates by itself.",
        side: "right",
      },
      {
        target: "header.search",
        title: "Search and commands",
        text: "Find an order, a customer or a package, or type a page's name to go there. Press ⌘K (Ctrl K on Windows) on any page.",
      },
      {
        target: null,
        title: "Scan from anywhere",
        text: "Scan a bag label with a handheld scanner on any page, and its order opens. The hub station has its own scan box.",
      },
      {
        target: "header.account",
        title: "Your account",
        text: "Your role, light or dark, your back-office record, the keyboard shortcuts, and sign out.",
      },
      {
        target: "header.help",
        title: "Help is always here",
        text: "Every page has its own short tour. It starts the first time you use a page; open it here any time to see it again.",
      },
    ],
  },
  // OV - Overview (rewritten for the redesign, 2026-11-05)
  {
    key: "overview",
    version: 2,
    title: "Overview",
    path: "/",
    steps: [
      {
        target: "page-title",
        title: "The day at a glance",
        text: "One sentence says whether today is on track, then the next three things on the clock. Everything here updates live.",
      },
      {
        target: "overview.find",
        title: "Find an order",
        text: "Type an order number or a customer to jump straight to it.",
      },
      {
        target: "overview.attention",
        title: "Needs attention",
        text: "Most urgent first: what stops work now, what customers are waiting on, and what can wait. Each count opens the list it comes from.",
      },
      {
        target: "overview.windows",
        title: "Today's delivery windows",
        text: "Every window on one clock, with its order-by time, the collection runs and a Now line. Point at a bar to see where its packages are.",
      },
      {
        target: "overview.duty",
        title: "On duty now",
        text: "The drivers working now, problems first, and what each is doing. Drivers go on duty in the driver app; back-office can't do it for them.",
      },
      {
        target: "overview.today",
        title: "Orders today",
        text: "Orders, sales and deliveries on time, against the same day last week. Choose a figure to chart it.",
      },
      { target: "overview.shortcuts", title: "Shortcuts", text: "The pages you go to most, one press away." },
    ],
  },
  // OL - Orders · All orders
  {
    key: "orders",
    version: 1,
    title: "Orders · All orders",
    path: "/orders",
    steps: [
      {
        target: "page-title",
        title: "Every paid order",
        text: "Every paid order with its status, delivery details and who is handling it.",
      },
      {
        target: "orders.views",
        title: "Views",
        text: "Narrow the list to one kind of order, such as those that need a driver.",
      },
      {
        target: "orders.search",
        title: "Search",
        text: "Find an order by its number, the customer's email or a bag code.",
      },
      {
        target: "orders.filters",
        title: "Filters",
        text: "Narrow by how it was sold (a window, a day, courier) and by the shop that packs it.",
      },
      {
        target: "list.col.status",
        title: "Status",
        text: "Where each order is up to, in the same nine words every console uses.",
        shownWhen: "There are rows",
      },
      {
        target: "orders.desks",
        title: "The next desks",
        text: "Dispatch is the drivers' work; Courier parcels is everything going by courier.",
      },
    ],
  },
  // OD - An order
  {
    key: "order",
    version: 1,
    title: "An order",
    needsRecord: "order",
    steps: [
      {
        target: "page-title",
        title: "This order",
        text: "The order number and where it is up to. Use ← and → to move to the previous or next order.",
      },
      {
        target: "order.notice",
        title: "Things to notice",
        text: "Anything that needs a decision: a refund the customer asked for, items a shop couldn't supply, a missed pickup.",
        shownWhen: "Shown",
      },
      {
        target: "order.packages",
        title: "Packages",
        text: "Each shop packs its share, and it moves on its own until it reaches the customer. Every bag has to be accounted for before it moves on.",
      },
      {
        target: "order.record",
        title: "Recording a step",
        text: "Record a hand-over or an arrival by hand only when it really happened and no scan recorded it.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      { target: "order.items", title: "Items", text: "What was ordered, from which shop, and what is left to refund." },
      {
        target: "order.delivery",
        title: "Delivery",
        text: "Who delivers, what the customer was sold, and how the delivery fee was worked out, once for the whole order.",
      },
      {
        target: "order.payment",
        title: "Payment and refunds",
        text: "How it was paid and what has gone back. A refund returns to the card first, then to points.",
      },
      {
        target: "order.actions",
        title: "Changing an order",
        text: "Issue a refund, change the day or time, or move it between Delivered by Effy and Courier delivery.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "order.customer-view",
        title: "What the customer sees",
        text: "The order as the customer sees it in the app and on the website.",
      },
      {
        target: "page-activity",
        title: "Order activity",
        text: "Everything that has happened to this order, from every console, newest first.",
      },
    ],
  },
  // DS - Dispatch
  {
    key: "dispatch",
    version: 1,
    title: "Dispatch",
    path: "/orders/assignments",
    steps: [
      {
        target: "page-title",
        title: "Today's driver work",
        text: "Collection and delivery rounds, who has them, and work still needing a driver. It updates live.",
      },
      {
        target: "dispatch.sections",
        title: "Three sections",
        text: "Needs a driver, Delivery windows and Rounds. Jump to any of them here.",
      },
      {
        target: "dispatch.needs-driver",
        title: "Needs a driver",
        text: "Packages ready at a shop or at the hub that nobody has yet. Each says why auto-assign couldn't place it.",
        shownWhen: "There are rows",
      },
      {
        target: "dispatch.assign",
        title: "Assigning by hand",
        text: "Give a package to a driver yourself when auto-assign can't. The driver must be cleared for that work and area.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "dispatch.windows",
        title: "Delivery windows",
        text: "Parcels booked into each window, by day, and the round that will carry them.",
      },
      {
        target: "dispatch.rounds",
        title: "Rounds",
        text: "Collection runs bring parcels from shops to the hub; delivery rounds take them to customers. Open one to see its stops.",
      },
    ],
  },
  // RD - A round
  {
    key: "round",
    version: 1,
    title: "A round",
    needsRecord: "round",
    steps: [
      {
        target: "page-title",
        title: "This round",
        text: "A collection run or a delivery round, its driver, and whether it is late.",
      },
      { target: "round.stops", title: "Stops", text: "Every stop in the order the driver sees them." },
      {
        target: "round.arrows",
        title: "Changing the order",
        text: "Use a stop's arrows to change the order the driver sees. Nothing changes until you save.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "round.reassign",
        title: "Reassign",
        text: "Move the whole round to another driver. Their app tells them the round moved.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "round.more",
        title: "Take this round back",
        text: "The driver loses the whole round at once. Anything already in the van stays with them until returned or delivered.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "round.more",
        title: "Let it go ahead",
        text: "Only when the driver can't do the step before in the app, for example a dead phone at the hub.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // HR - Hand-over report
  {
    key: "handover-report",
    version: 1,
    title: "Hand-over report",
    path: "/reports/handovers",
    steps: [
      {
        target: "page-title",
        title: "How bags changed hands",
        text: "Every bag hand-over between shops, drivers and the hub, and whether it was scanned.",
      },
      { target: "handovers.from", title: "The period", text: "Choose the dates the report covers." },
      {
        target: "handovers.summary",
        title: "Summary",
        text: "How many hand-overs, how many were scanned, and the exceptions per 1,000.",
      },
      {
        target: "handovers.by-shop",
        title: "By shop",
        text: "Least scanned first. A shop low here is usually printing labels badly.",
      },
      { target: "handovers.by-driver", title: "By driver", text: "Least scanned first, for each driver." },
      {
        target: "handovers.problems",
        title: "What went wrong",
        text: "Scans that were refused, and bags a driver declared missing.",
      },
    ],
  },
  // CP - Courier parcels
  {
    key: "courier-parcels",
    version: 1,
    title: "Courier parcels",
    path: "/orders/handover",
    steps: [
      {
        target: "page-title",
        title: "Parcels going by courier",
        text: "Every parcel going to a customer by courier, ready to book, track and record each step.",
      },
      {
        target: "courier.stages",
        title: "Stages",
        text: "At the hub, late at the hub, supplier pickups, with the courier, and problems.",
      },
      { target: "courier.service", title: "By service", text: "Narrow to one courier service." },
      { target: "courier.search", title: "Search", text: "Find a parcel by order number or service." },
      {
        target: "list.first-row",
        title: "Booking and tracking",
        text: "Open the order to book the consignment, add tracking and the label, and record each step.",
        shownWhen: "There are rows",
      },
      {
        target: "page-title",
        title: "Labels stay private",
        text: "A label opens through a short-lived link and is never shared publicly.",
      },
    ],
  },
  // EX - Exceptions
  {
    key: "exceptions",
    version: 1,
    title: "Exceptions",
    path: "/exceptions",
    steps: [
      {
        target: "page-title",
        title: "When delivery goes wrong",
        text: "Deliveries a driver couldn't complete, and anything else waiting on a person to decide.",
      },
      {
        target: "exceptions.kinds",
        title: "Four kinds",
        text: "Failed deliveries, runs waiting on their next step, vehicle checks, and packages a driver declared missing.",
      },
      {
        target: "exceptions.show",
        title: "Open or dealt with",
        text: "Open is what still needs someone. Dealt with is the record of what was decided.",
      },
      { target: "exceptions.search", title: "Search", text: "Find one by order, driver or suburb." },
      {
        target: "list.col.action",
        title: "Dealing with one",
        text: "Mark a failed delivery dealt with: redelivered, refunded, collected by the customer, or something else.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "exceptions.vehicles",
        title: "Vehicle checks",
        text: "A vehicle found unsafe stops its driver getting work. Clear it only once it is fixed or they have another vehicle.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "page-title",
        title: "Read-only for support",
        text: "Customer support sees these lists but can't act on them; an admin or a manager does.",
        roles: ["csa"],
        shownWhen: "Customer support",
      },
    ],
  },
  // HS - Hub station
  {
    key: "hub-station",
    version: 1,
    title: "Hub station",
    path: "/hub",
    roles: ["admin", "manager"],
    steps: [
      {
        target: "page-title",
        title: "Checking bags in",
        text: "Scan bags arriving from collection runs to check them in and see where each goes next.",
      },
      {
        target: "hub.scan",
        title: "Scan",
        text: "Scan a bag, or type its code. Each scan answers with where the bag goes.",
      },
      {
        target: "hub.incoming",
        title: "On the way in",
        text: "Runs a driver is bringing to the hub, and their bags still to check in.",
      },
      {
        target: "hub.earlier",
        title: "Earlier scans",
        text: "What has been checked in, with its zone, order and where it goes.",
      },
    ],
  },
  // CU - Customers
  {
    key: "customers",
    version: 1,
    title: "Customers",
    path: "/customers",
    search: { tab: "customers" },
    steps: [
      {
        target: "page-title",
        title: "Everyone with an account",
        text: "Every customer with an Effy account, their orders and their points.",
      },
      {
        target: "customers.search",
        title: "Search",
        text: "Find a customer by name, email, phone or an order number.",
      },
      {
        target: "customers.ordered",
        title: "Who has ordered",
        text: "Narrow to customers who have ordered, or never have.",
      },
      {
        target: "list.col.points",
        title: "Points",
        text: "Their usable balance. Open a customer to credit or remove points.",
        shownWhen: "There are rows",
      },
    ],
  },
  // CS - Points settings
  {
    key: "points-settings",
    version: 1,
    title: "Points settings",
    path: "/settings/points",
    steps: [
      {
        target: "page-title",
        title: "How points work",
        text: "How customers earn points, what they are worth, and when they expire.",
      },
      {
        target: "points.value",
        title: "Value of a point",
        text: "In cents. A change applies to new orders; orders already paid keep their value.",
      },
      {
        target: "points.expiry",
        title: "Expiry",
        text: "How long points last, and how many days before expiry customers are emailed.",
      },
      {
        target: "points.credit-limit",
        title: "Credit limit",
        text: "The most a customer-support agent can credit at once. More needs a manager.",
      },
      {
        target: "points.hold",
        title: "Checkout hold",
        text: "How long points chosen at checkout are set aside while the customer pays.",
      },
      {
        target: "page-activity",
        title: "Rule changes",
        text: "Every change to these rules, and who made it. Only an administrator can change them.",
      },
    ],
  },
  // CD - A customer
  {
    key: "customer",
    version: 1,
    title: "A customer",
    needsRecord: "customer",
    steps: [
      { target: "page-title", title: "This customer", text: "Their account, contact details and when they joined." },
      {
        target: "customer.points",
        title: "Points",
        text: "Points are a way of paying, never a discount. Usable, held at checkout, and the next to expire.",
      },
      {
        target: "customer.credit",
        title: "Credit points",
        text: "Give points with a reason the customer sees. Over your limit, ask a manager.",
      },
      {
        target: "customer.more",
        title: "Remove points",
        text: "Take points back, with a reason.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "customer.more",
        title: "Points activity",
        text: "Every change to their balance, with who made it and why.",
      },
      { target: "customer.orders", title: "Recent orders", text: "Their latest orders. Open one to see it in full." },
    ],
  },
  // FB - Feedback
  {
    key: "feedback",
    version: 1,
    title: "Feedback",
    path: "/feedback",
    steps: [
      {
        target: "page-title",
        title: "What customers tell us",
        text: "Bugs, ideas, complaints and compliments sent by customers, ready to read and answer.",
      },
      {
        target: "feedback.views",
        title: "Needs a look",
        text: 'New feedback nobody has looked at yet. "All" includes what was marked spam.',
      },
      {
        target: "feedback.search",
        title: "Search",
        text: "Find feedback by its words, the sender's email or its reference.",
      },
      {
        target: "list.first-row",
        title: "Open one",
        text: "Open feedback to read it, note it, and reply.",
        shownWhen: "There are rows",
      },
    ],
  },
  // FD - A feedback item
  {
    key: "feedback-item",
    version: 1,
    title: "A feedback item",
    needsRecord: "feedback",
    steps: [
      {
        target: "feedback.details",
        title: "Details",
        text: "What it is about, the rating, who sent it and from where.",
      },
      {
        target: "feedback.status",
        title: "Status",
        text: "Where it is up to. Sending a reply marks it Replied by itself.",
      },
      {
        target: "feedback.reply",
        title: "Reply",
        text: "Write a reply; it is emailed to the sender.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "feedback.note",
        title: "Internal note",
        text: "A note for staff only. It is never emailed or shown to the sender.",
      },
    ],
  },
  // DR - Drivers
  {
    key: "drivers",
    version: 1,
    title: "Drivers",
    path: "/drivers",
    steps: [
      {
        target: "page-title",
        title: "Effy's drivers",
        text: "Every driver, whether they can be given work, and who is on duty.",
      },
      {
        target: "drivers.duty",
        title: "On duty now",
        text: "Who is working and what each is doing. Drivers go on duty in the driver app.",
      },
      {
        target: "drivers.readiness",
        title: "Who can't work",
        text: "Drivers with something to fix on their record, and licences or registrations about to expire.",
        shownWhen: "Shown",
      },
      {
        target: "drivers.views",
        title: "Views",
        text: "Everyone employed, or everyone including those who have left.",
      },
      { target: "drivers.search", title: "Search", text: "Find a driver by name or work email." },
      {
        target: "list.col.cleared",
        title: "Cleared for",
        text: "The work each driver may be given: collecting, delivering, or both.",
        shownWhen: "There are rows",
      },
      {
        target: "drivers.add",
        title: "Add a driver",
        text: "Gives them a sign-in for the driver app. Their work email is how they sign in and can't change.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // DD - A driver
  {
    key: "driver",
    version: 1,
    title: "A driver",
    needsRecord: "driver",
    steps: [
      {
        target: "page-title",
        title: "This driver",
        text: "Their name, whether they are on duty, and anything that stops them being given work.",
      },
      { target: "driver.sections", title: "Two sections", text: "Their profile, and their clearances." },
      {
        target: "driver.licence",
        title: "Licence",
        text: "Class and expiry. Once the date passes, the driver can't be given work.",
      },
      {
        target: "driver.clearances",
        title: "Clearances",
        text: "Each clearance is one kind of work in one area, or everywhere. Without one, nothing can be assigned to them.",
      },
      {
        target: "driver.grant",
        title: "Granting work",
        text: 'Choose the work and where. "Everywhere" includes areas added later.',
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "driver.employment",
        title: "Employment",
        text: "When they started, and if they have left. A leaver's sign-in closes for good; their history is kept.",
      },
      { target: "page-activity", title: "Driver activity", text: "Every change to this driver, with who made it." },
    ],
  },
  // VL - Vehicles
  {
    key: "vehicles",
    version: 1,
    title: "Vehicles",
    path: "/vehicles",
    steps: [
      {
        target: "page-title",
        title: "The fleet",
        text: "The vans and cars drivers use, what they carry, whether they are roadworthy, and who has each one.",
      },
      { target: "vehicles.views", title: "Views", text: "Vehicles in the fleet, or off the road." },
      {
        target: "vehicles.filters",
        title: "Filters",
        text: "Find vehicles that carry chilled or frozen goods, or ones out of compliance.",
      },
      { target: "vehicles.search", title: "Search", text: "Find a vehicle by plate, make or model." },
      {
        target: "vehicles.add",
        title: "Add a vehicle",
        text: "Record a vehicle Effy runs; capacity and compliance dates can be added on its page.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // VD - A vehicle
  {
    key: "vehicle",
    version: 1,
    title: "A vehicle",
    needsRecord: "vehicle",
    steps: [
      {
        target: "page-title",
        title: "This vehicle",
        text: "Its plate, status, and anything that stops its driver being given work.",
      },
      { target: "vehicle.details", title: "Details", text: "What it carries, its capacity and its odometer." },
      {
        target: "vehicle.holder",
        title: "Who has it",
        text: "Issue it to a driver or record its return, with the odometer reading each time.",
      },
      {
        target: "vehicle.compliance",
        title: "Compliance",
        text: "Registration, insurance and roadworthy dates. A lapsed date stops its driver getting work.",
      },
      {
        target: "vehicle.status",
        title: "Off the road or retired",
        text: "Off the road is temporary, for repairs. Retired is for good; its history is kept.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      { target: "page-activity", title: "Vehicle activity", text: "Every change and hand-over of this vehicle." },
    ],
  },
  // SL - Shops
  {
    key: "shops",
    version: 1,
    title: "Shops",
    path: "/shops",
    steps: [
      {
        target: "page-title",
        title: "Fulfilment shops",
        text: "The shops that pack Effy orders, and the operators who run them. Customers never see a shop.",
      },
      { target: "shops.views", title: "Views", text: "Narrow the list by the shop's status." },
      { target: "shops.search", title: "Search", text: "Find a shop by its code or name." },
      {
        target: "list.col.scanning",
        title: "Label scanning",
        text: "How many of a shop's packages left with a scan. A low share usually means labels print badly.",
        shownWhen: "There are rows",
      },
      {
        target: "shops.create",
        title: "Create a shop",
        text: "Registers a shop and gives its first manager a sign-in.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // SD - A shop
  {
    key: "shop",
    version: 1,
    title: "A shop",
    needsRecord: "shop",
    steps: [
      { target: "page-title", title: "This shop", text: "Its code, status and how it is doing at a glance." },
      { target: "shop.sections", title: "Sections", text: "Overview, Team and Products." },
      {
        target: "shop.details",
        title: "Details",
        text: "Its address is for drivers only and is never shown to customers.",
      },
      {
        target: "shop.packing",
        title: "Packing",
        text: "Whether every bag's label must be scanned as it is packed, before an order can be ready.",
      },
      { target: "shop.team", title: "Team", text: "The operators who sign in to its console, and their roles." },
      {
        target: "shop.stock",
        title: "Stock",
        text: "Its products at or below their low-stock threshold, out of stock first.",
      },
      {
        target: "shop.danger",
        title: "Suspend, disable or remove",
        text: "Suspend stops new work; disable stops every sign-in; remove only a shop that never had operators.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      { target: "page-more", title: "Shop activity", text: "Every change to this shop, with who made it." },
    ],
  },
  // PL - Products
  {
    key: "products",
    version: 1,
    title: "Products",
    path: "/products",
    steps: [
      {
        target: "page-title",
        title: "Every product",
        text: "Every product of every shop. Search, narrow and open one to see everything about it.",
      },
      {
        target: "products.states",
        title: "States",
        text: "On sale, waiting for review, held by Effy, Effy setting up, and more.",
      },
      { target: "products.search", title: "Search", text: "Find a product by name, SKU or barcode." },
      {
        target: "products.filters",
        title: "Filters",
        text: "Narrow by how it is stored, or whether Effy's margin is set.",
      },
      {
        target: "list.col.margin",
        title: "Shop price and margin",
        text: "What the shop is paid, Effy's margin, and what customers pay.",
        shownWhen: "There are rows",
      },
      {
        target: "list.row-select",
        title: "Several at once",
        text: "Tick products to set a margin, hold them or release them together.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "products.add",
        title: "Adding products",
        text: "Create a product for a shop yourself, or import a shop's whole list from a spreadsheet.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // PD - A product
  {
    key: "product",
    version: 1,
    title: "A product",
    needsRecord: "product",
    steps: [
      {
        target: "page-title",
        title: "This product",
        text: "Its state: on sale, waiting for review, held by Effy or Effy setting up.",
      },
      {
        target: "product.sizes",
        title: "Sizes and stock",
        text: "What the shop is paid and what customers pay, per size. Turning a size off sale is immediate and the shop is told.",
      },
      {
        target: "product.pictures",
        title: "Pictures",
        text: "As the shop added them. The first is the main picture shoppers see in the aisle.",
      },
      {
        target: "product.description",
        title: "Description and details",
        text: "The shop's own words, and the details its category asks for.",
      },
      {
        target: "product.aisles",
        title: "Aisles",
        text: "Its home aisle decides its details. Effy can also show it in up to five more.",
      },
      {
        target: "product.preview",
        title: "How shoppers see it",
        text: "At the customers' price, after Effy's margin. Shoppers never see which shop supplies it.",
      },
      { target: "product.facts", title: "Shop and facts", text: "The shop, Effy's margin, storage, GST and 18+." },
      {
        target: "product.hold",
        title: "Holding a product",
        text: "A hold takes it off sale at once, and its shop can't put it back. The shop is told your reason.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "page-activity",
        title: "Activity",
        text: "Effy's decisions on it: review, margin, holds and its sizes on and off sale.",
      },
    ],
  },
  // PN - New product
  {
    key: "product-new",
    version: 1,
    title: "New product",
    path: "/products/new",
    steps: [
      {
        target: "product-form.steps",
        title: "Six steps",
        text: "Shop and margin, then name and category, photo, variants and prices, details, and a last check.",
      },
      {
        target: "product-form.shop",
        title: "Which shop, what margin",
        text: "The product is the shop's: it sees it, fulfils its orders and owns it once it is on sale.",
      },
      {
        target: "product-form.margin",
        title: "Effy's margin",
        text: "Added to every size's shop price to make what shoppers pay.",
      },
      {
        target: "product-form.price",
        title: "Shop's price",
        text: "What Effy pays the shop. Shoppers pay this plus Effy's margin.",
      },
      {
        target: "product-form.send",
        title: "Saving",
        text: "Complete, it goes straight on sale. Not complete, it saves as Effy's draft until it is finished.",
      },
    ],
  },
  // IM - Imports
  {
    key: "imports",
    version: 1,
    title: "Imports",
    path: "/products/imports",
    roles: ["admin", "manager"],
    steps: [
      {
        target: "page-title",
        title: "A shop's whole list",
        text: "Effy creates a shop's products from its spreadsheet. Every row is checked first; nothing is created until you say so.",
      },
      {
        target: "imports.new",
        title: "New import",
        text: "Choose the shop and Effy's margin, then upload the list as .xlsx or .csv.",
      },
      {
        target: "imports.aisles",
        title: "Detail columns",
        text: "Each aisle you choose adds a column for every detail it asks for.",
      },
      {
        target: "imports.template",
        title: "The template",
        text: "One row per size; rows with the same product key are one product.",
      },
      {
        target: "imports.list",
        title: "Past imports",
        text: "Every import, its shop, state and how many products it created.",
        shownWhen: "There are rows",
      },
    ],
  },
  // ID - An import
  {
    key: "import",
    version: 1,
    title: "An import",
    needsRecord: "import",
    roles: ["admin", "manager"],
    steps: [
      {
        target: "page-title",
        title: "This import",
        text: "Its file, its shop and where it is up to. The page updates by itself while it runs.",
      },
      { target: "import.rows", title: "The rows", text: "Each row and what is wrong with it, if anything." },
      {
        target: "import.problems",
        title: "Fixing rows",
        text: "Fix them in the file and upload it again; rows already created are recognised by their SKU.",
        shownWhen: "Shown",
      },
      {
        target: "import.create",
        title: "Creating",
        text: "Creates the ready products. Those without a main picture wait for Effy to finish them; the rest go on sale.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // PF - Finish a product
  {
    key: "product-finish",
    version: 1,
    title: "Finish a product",
    needsRecord: "finish",
    steps: [
      {
        target: "product-form.steps",
        title: "Finishing Effy's draft",
        text: "A product Effy started for a shop. Fill in what is missing; it goes on sale by itself once complete.",
      },
      {
        target: "product-form.send",
        title: "Saving",
        text: "Saving a complete product approves it and hands it to the shop. Effy can't edit its content after that.",
      },
    ],
  },
  // RQ - Product review · Queue
  {
    key: "review-queue",
    version: 1,
    title: "Product review · Queue",
    path: "/product-review",
    steps: [
      {
        target: "page-title",
        title: "What shops send",
        text: "New products and changes shops send to Effy. Customers see nothing new until it is approved.",
      },
      {
        target: "review.views",
        title: "Two lists",
        text: "Waiting for review, and products on sale with no margin set.",
      },
      { target: "review.search", title: "Search", text: "Find a product or a shop." },
      {
        target: "list.col.waiting",
        title: "Oldest first",
        text: "How long each has been waiting. Start with the oldest.",
        shownWhen: "There are rows",
      },
      { target: "review.start", title: "Start reviewing", text: "Opens the oldest, then each next one in turn." },
      {
        target: "list.col.set",
        title: "Margin not set",
        text: "These sell at the shop's own price. Setting a margin changes what customers pay at once.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // RI - Reviewing a product
  {
    key: "review-item",
    version: 1,
    title: "Reviewing a product",
    needsRecord: "review",
    steps: [
      {
        target: "page-title",
        title: "What is being reviewed",
        text: "A new product, or a change to one on sale. Customers keep seeing what is live until you approve.",
      },
      {
        target: "review.notice",
        title: "Things to notice",
        text: "What the review spotted: a price rise worth a look, required details missing.",
        shownWhen: "Shown",
      },
      {
        target: "review.changes",
        title: "What changes",
        text: "Only what differs from the live product, side by side or in one column.",
        shownWhen: "Shown",
      },
      {
        target: "review.sizes",
        title: "Sizes and prices",
        text: "What the shop is paid, and what customers will pay at the margin you set. It updates as you type.",
      },
      {
        target: "review.margin",
        title: "Effy margin",
        text: "Shops are never told the margin. It is Effy's.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "review.pictures",
        title: "Pictures",
        text: "The first is the main picture in the aisle, and it must be the product itself.",
      },
      {
        target: "review.placements",
        title: "Extra aisles",
        text: "Other aisles shoppers find it under. Its own category still decides its details.",
      },
      {
        target: "review.decision",
        title: "Approve or send back",
        text: "Approve puts it on sale. Send back tells the shop why, with common reasons ready to pick.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "review.prev-next",
        title: "Through the queue",
        text: "Use ← and → to go to the previous or next one.",
      },
    ],
  },
  // RM - Missing details
  {
    key: "missing-details",
    version: 1,
    title: "Missing details",
    path: "/product-review/missing-details",
    steps: [
      {
        target: "page-title",
        title: "Missing details",
        text: "Products on sale before their category asked for these details. They stay on sale.",
      },
      { target: "missing.department", title: "By department", text: "Narrow to one department." },
      {
        target: "list.col.missing",
        title: "What is missing",
        text: "The details each product lacks. Shops see the same list in their catalogue.",
        shownWhen: "There are rows",
      },
    ],
  },
  // TX - Categories & attributes
  {
    key: "taxonomy",
    version: 1,
    title: "Categories & attributes",
    path: "/taxonomy",
    steps: [
      {
        target: "page-title",
        title: "The category tree",
        text: "The tree shops file products in and customers browse, and the details each category asks for.",
      },
      { target: "taxonomy.views", title: "Two views", text: "Categories, and the library of attributes they use." },
      {
        target: "taxonomy.tree",
        title: "Categories",
        text: "Up to five levels. Drag a category to move it; its sub-categories move with it.",
      },
      {
        target: "taxonomy.category",
        title: "A category",
        text: "Its name, icon, picture and synonyms, the defaults a new product starts from, its form and its products.",
        shownWhen: "Shown",
      },
      {
        target: "taxonomy.defaults",
        title: "Defaults",
        text: "Storage, GST and 18+ that a new product starts from. A shop may change them; review sees the change.",
        shownWhen: "Shown",
      },
      {
        target: "taxonomy.retire",
        title: "Retiring",
        text: "Shops can no longer file products there and the storefront stops showing it. You can restore it later.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "taxonomy.attributes",
        title: "Attributes",
        text: "Details categories can ask for: whether shoppers filter on one, and whether it can be a variant option.",
        shownWhen: "Shown",
      },
    ],
  },
  // PR - Promotions · Codes
  {
    key: "promotions",
    version: 1,
    title: "Promotions · Codes",
    path: "/promotions",
    steps: [
      {
        target: "page-title",
        title: "Every offer",
        text: "Every discount and offer, applied automatically or with a code, with its status and dates.",
      },
      { target: "promotions.views", title: "Views", text: "Narrow by status." },
      {
        target: "promotions.filters",
        title: "Filters",
        text: "Narrow by what it gives, whether it needs a code, and the display group it is shown in.",
      },
      { target: "promotions.search", title: "Search", text: "Find a promotion by its name or code." },
      {
        target: "promotions.links",
        title: "Where and how",
        text: "Display groups decide where offers show, skins how they look, order rules the limits on every cart.",
      },
      {
        target: "promotions.create",
        title: "Create a promotion",
        text: "Money off the cart or delivery, or buy-and-get, by code or automatically.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // PE - Creating or editing a promotion
  {
    key: "promotion-editor",
    version: 1,
    title: "Creating or editing a promotion",
    path: "/promotions/new",
    steps: [
      {
        target: "promo.basics",
        title: "Basics",
        text: "Its name is for staff only; shoppers read the words you set at the end.",
      },
      {
        target: "promo.applies",
        title: "Code or automatic",
        text: "With a code shoppers type it in their cart. Automatic applies to every cart that qualifies.",
      },
      { target: "promo.kind", title: "What it gives", text: "Off the cart, off delivery, or buy some and get some." },
      { target: "promo.who", title: "Who can use it", text: "Everyone, new customers, or customers you choose." },
      { target: "promo.when", title: "When", text: "Its start and end, and the days and hours it runs." },
      {
        target: "promo.limits",
        title: "Limits",
        text: "Total uses, uses per customer and a budget. It stops at once when it reaches one.",
      },
      {
        target: "promo.combines",
        title: "Combining",
        text: "Off: when another offer gives the shopper more, that one applies instead.",
      },
      {
        target: "promo.summary",
        title: "Summary",
        text: "The promotion as you have set it. What it gives and who it is for are fixed once it is used.",
      },
    ],
  },
  // PP - A promotion
  {
    key: "promotion",
    version: 1,
    title: "A promotion",
    needsRecord: "promotion",
    steps: [
      { target: "page-title", title: "This promotion", text: "Its status and what it gives." },
      {
        target: "promotion.status",
        title: "Status",
        text: "Publish starts it. Pause stops it until you resume. End now stops it for good. Placed orders keep their discount.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "promotion.sections",
        title: "Sections",
        text: "Overview, where it is shown, pictures, chosen customers and codes.",
      },
      {
        target: "promotion.shown-in",
        title: "Shown in",
        text: "The display groups it appears in. Not shown anywhere, it still applies in the cart.",
      },
      {
        target: "promotion.pictures",
        title: "Pictures",
        text: "Pictures for skins that show one. Each has a description read aloud to shoppers who can't see it.",
      },
      {
        target: "promotion.codes",
        title: "Single-use codes",
        text: "Generate codes that each work once, and download them as a spreadsheet.",
        shownWhen: "Shown",
      },
      {
        target: "promotion.performance",
        title: "Performance",
        text: "Uses, customers, discount given and sales over the last 30 days, from paid orders only.",
      },
      { target: "page-more", title: "Activity", text: "Every change to this promotion, with who made it." },
    ],
  },
  // PG - Display groups
  {
    key: "display-groups",
    version: 1,
    title: "Display groups",
    path: "/promotions/groups",
    steps: [
      {
        target: "page-title",
        title: "Where offers are shown",
        text: "Each group is one place on the website and app where promotions are shown, in its own order.",
      },
      {
        target: "list.col.key",
        title: "The key",
        text: "Whoever builds that place in the website or app uses this key. It can't be changed later.",
        shownWhen: "There are rows",
      },
      {
        target: "groups.new",
        title: "New group",
        text: "Create one for each place promotions are shown.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // GD - A display group
  {
    key: "display-group",
    version: 1,
    title: "A display group",
    needsRecord: "group",
    steps: [
      {
        target: "group.order",
        title: "In order",
        text: "Shoppers see them in this order, and only the ones they can use right now.",
      },
      {
        target: "group.add",
        title: "Adding one",
        text: "Only promotions with a headline can be shown.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "group.preview",
        title: "What a shopper sees",
        text: "The place as it looks now. Hidden promotions are marked.",
      },
      {
        target: "group.look",
        title: "How it looks",
        text: "The place's size and its skin, with another skin for promotions that need a code.",
      },
    ],
  },
  // SK - Skins
  {
    key: "skins",
    version: 1,
    title: "Skins",
    path: "/promotions/skins",
    steps: [
      {
        target: "page-title",
        title: "How offers look",
        text: "Reusable designs for how promotions look wherever they are shown.",
      },
      {
        target: "list.col.looks",
        title: "Looks like",
        text: "A small preview of each skin.",
        shownWhen: "There are rows",
      },
      {
        target: "list.col.usedIn",
        title: "Used in",
        text: "The display groups using each skin.",
        shownWhen: "There are rows",
      },
      {
        target: "skins.new",
        title: "New skin",
        text: "Pick a layout and set its colours, words and pictures.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // SE - A skin
  {
    key: "skin",
    version: 1,
    title: "A skin",
    needsRecord: "skin",
    steps: [
      {
        target: "skin.name",
        title: "Name and layout",
        text: "Its name is for staff only. The layout decides where the picture and words sit.",
      },
      {
        target: "skin.background",
        title: "Background",
        text: "Its colour, and whether to show the promotion's picture with a tint.",
      },
      {
        target: "skin.words",
        title: "Words",
        text: "The label, headline and supporting line: their colours, sizes and alignment.",
      },
      {
        target: "skin.button",
        title: "Button and code",
        text: "With a code the button copies it; without one it opens the offer.",
      },
      {
        target: "skin.preview",
        title: "Preview",
        text: "Exactly as the website draws it, at different widths and words.",
      },
      {
        target: "skin.readability",
        title: "Readable?",
        text: "Every piece of text against what it sits on. A skin that can't be read is refused.",
      },
      { target: "skin.usage", title: "Where it's used", text: "Changing a skin changes every place that uses it." },
    ],
  },
  // OR - Order rules
  {
    key: "order-rules",
    version: 1,
    title: "Order rules",
    path: "/settings/order-rules",
    steps: [
      {
        target: "page-title",
        title: "Limits on every cart",
        text: "The minimum spend to check out and the limits on a single cart.",
      },
      { target: "rules.minimum", title: "Minimum spend", text: "A cart below this can't check out." },
      { target: "rules.most-one", title: "Most of one item", text: "The most of any one item a cart may hold." },
      { target: "rules.most-different", title: "Most different items", text: "The most different items in one cart." },
      {
        target: "page-title",
        title: "When it applies",
        text: "A change applies to the next cart a shopper opens. Carts already paid aren't affected.",
      },
    ],
  },
  // DC - Delivery · Coverage
  {
    key: "delivery-coverage",
    version: 1,
    title: "Delivery · Coverage",
    path: "/settings/delivery/coverage",
    steps: [
      {
        target: "page-title",
        title: "Where Effy delivers",
        text: "The postcodes Effy's own drivers deliver to, in optional groups. Anywhere else is courier delivery or nothing.",
      },
      {
        target: "delivery.checker",
        title: "Check a postcode",
        text: "Type a postcode or place to see who delivers there and whether delivery today is offered.",
      },
      {
        target: "list.col.postcode",
        title: "The list",
        text: "Every postcode, its group, its distance from the hub and whether delivery today is offered.",
      },
      {
        target: "list.col.distance",
        title: "Distance",
        text: 'Worked out from the hub, or entered by hand. "To review" means the hub moved since.',
        shownWhen: "There are rows",
      },
      {
        target: "list.col.today",
        title: "Delivery today",
        text: "Switch delivery today off for far postcodes. Customers there see later days only.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "delivery.groups",
        title: "Groups",
        text: "Groups organise the list and decide which drivers are cleared there. Removing one never removes its postcodes.",
      },
      {
        target: "delivery.add",
        title: "Add places",
        text: "Add postcodes or places to the list.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // DK - Delivery · Courier delivery
  {
    key: "delivery-courier",
    version: 1,
    title: "Delivery · Courier delivery",
    path: "/settings/delivery/courier",
    steps: [
      {
        target: "page-title",
        title: "Courier delivery",
        text: "Delivery by courier for addresses outside Effy's area.",
      },
      {
        target: "courier-setup.switch",
        title: "Switching it on",
        text: "It needs an active courier fee table and a default courier service first.",
      },
      {
        target: "courier-setup.route",
        title: "Hub or supplier",
        text: "Via the hub, or picked up from the supplier. Staff can change one order until its first parcel leaves.",
      },
      {
        target: "courier-setup.excluded",
        title: "Excluded postcodes",
        text: "Places courier delivery is never offered, with the reason.",
      },
      {
        target: "courier-setup.services",
        title: "Courier services",
        text: "The services Effy uses, what customers are told, and pickup days. The default one is what checkout offers.",
      },
    ],
  },
  // DP - Delivery · Pricing
  {
    key: "delivery-pricing",
    version: 1,
    title: "Delivery · Pricing",
    path: "/settings/delivery/pricing",
    steps: [
      {
        target: "page-title",
        title: "One fee per order",
        text: "Distance band, weight band, the basket's value and the chosen window. Placed orders keep their fee.",
      },
      {
        target: "pricing.plans",
        title: "Fee plans",
        text: "Exactly one plan is in force. A plan that was active can't change; copy it to a new draft.",
      },
      {
        target: "pricing.activate",
        title: "Activating",
        text: "A plan goes live only when it can price every distance and every weight.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "pricing.courier",
        title: "Courier tables",
        text: "The fees for courier delivery, kept apart from Effy's plans.",
      },
      {
        target: "pricing.simulator",
        title: "Try a plan",
        text: "Enter a postcode, weight and basket to see the fee and every step that built it.",
      },
    ],
  },
  // DW - Delivery · Delivery windows
  {
    key: "delivery-windows",
    version: 1,
    title: "Delivery · Delivery windows",
    path: "/settings/delivery/windows",
    steps: [
      {
        target: "page-title",
        title: "Delivery windows",
        text: "The windows customers choose from, with their hours, order-by time and how many deliveries each takes.",
      },
      {
        target: "list.col.window",
        title: "Windows",
        text: "Each window's hours, order-by time, limit, and how many are booked today.",
        shownWhen: "There are rows",
      },
      {
        target: "windows.any-time",
        title: "Any time",
        text: "The window for orders with a day but no time. It is always on; its hours and limit can change.",
        shownWhen: "Shown",
      },
      {
        target: "windows.new",
        title: "New window",
        text: "It is offered at checkout as soon as you save. Orders already placed keep their window.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "windows.switch",
        title: "Switching off",
        text: "A window switched off is no longer offered. With none active, Effy delivery is offered to no one.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
    ],
  },
  // DY - Delivery · Delivery days
  {
    key: "delivery-days",
    version: 2,
    title: "Delivery · Delivery days",
    path: "/settings/delivery/days",
    steps: [
      {
        target: "page-title",
        title: "Delivery days",
        text: 'Which days customers can choose, what an "as soon as possible" order is told, and the dates Effy is closed.',
      },
      {
        target: "days.days",
        title: "Days customers can choose",
        text: "How many delivery days after today are offered, and the weekdays with no delivery.",
      },
      {
        target: "days.asap",
        title: "As soon as possible",
        text: "What a customer who chooses no day is told. Always an estimate, never a promised day.",
      },
      {
        target: "days.hold",
        title: "Holding a place",
        text: "How long a place in a window is kept while a customer pays.",
      },
      {
        target: "days.closed",
        title: "Closed dates",
        text: "Dates Effy doesn't deliver, such as public holidays. Closing one saves at once.",
      },
    ],
  },
  // DH - Hub and runs
  {
    key: "delivery-hub",
    version: 2,
    title: "Hub and runs",
    path: "/settings/hub",
    steps: [
      {
        target: "page-title",
        title: "Hub and runs",
        text: "Where the hub is, the time shops and the hub need, and when drivers collect from shops.",
      },
      {
        target: "hub-setup.location",
        title: "The hub",
        text: "Every postcode's distance is measured from here. Moving it flags hand-entered distances for another look.",
      },
      {
        target: "hub-setup.buffer",
        title: "Prep buffer",
        text: "How long a shop needs to pack before a collection run.",
      },
      {
        target: "hub-setup.turnaround",
        title: "Hub turnaround",
        text: "From a collection run reaching the hub to its parcels being ready to leave. An estimate until rounds are timed.",
      },
      {
        target: "days.runs",
        title: "Collection runs",
        text: "The times drivers collect from shops. No window today can be offered without a run that makes it.",
      },
    ],
  },
  // DV - Driver work
  {
    key: "driver-work",
    version: 1,
    title: "Driver work",
    path: "/settings/drivers",
    steps: [
      {
        target: "page-title",
        title: "Driver work",
        text: "The rules for drivers' work: when rounds open, how they are planned, and when dispatch is told.",
      },
      {
        target: "drivers.open",
        title: "When work opens",
        text: "A round opens this long before it starts. Until then the driver sees it but can't start it.",
      },
      {
        target: "drivers.plan",
        title: "Time at each stop",
        text: "What the planner allows at each stop when it fills a round.",
      },
      {
        target: "drivers.alerts",
        title: "Telling dispatch",
        text: "When a van isn't loaded or parcels aren't checked in in time, it is listed on Exceptions.",
      },
      {
        target: "drivers.vehicle",
        title: "Vehicle check",
        text: "Whether drivers check their vehicle once a day before they get work.",
      },
    ],
  },
  // TS - Tax
  {
    key: "tax",
    version: 1,
    title: "Tax",
    path: "/settings/tax",
    roles: ["admin"],
    steps: [
      {
        target: "page-title",
        title: "Tax",
        text: "The business details on customer tax invoices, and whether invoices are issued.",
      },
      {
        target: "tax.details",
        title: "Effy's tax details",
        text: "The legal name and ABN, exactly as registered with the ABR.",
      },
      {
        target: "tax.fees",
        title: "How fees are taxed",
        text: "Choose how delivery and order fees are taxed. Confirm it with Effy's accountant.",
      },
      {
        target: "tax.invoices",
        title: "Tax invoices",
        text: "Once on, customers can download a tax invoice for any paid order. Every live product needs a GST status.",
      },
    ],
  },
  // ED - Email deliverability
  {
    key: "deliverability",
    version: 1,
    title: "Email deliverability",
    path: "/deliverability",
    steps: [
      {
        target: "page-title",
        title: "Email that isn't arriving",
        text: "Addresses that bounce or refuse mail. They receive no sign-in codes until someone repairs them.",
      },
      { target: "deliverability.views", title: "Views", text: "Addresses that need attention, or every address." },
      { target: "deliverability.search", title: "Search", text: "Find an address." },
      {
        target: "list.col.account",
        title: "Whose address",
        text: "The customer, driver, shop or staff account it belongs to.",
        shownWhen: "There are rows",
      },
    ],
  },
  // EA - An email address
  {
    key: "deliverability-address",
    version: 1,
    title: "An email address",
    needsRecord: "address",
    steps: [
      {
        target: "page-title",
        title: "This address",
        text: "Its state, whose account it is, and why mail to it fails.",
      },
      {
        target: "address.server-said",
        title: "What the mail server said",
        text: "The reason the last message was refused.",
      },
      {
        target: "address.repair",
        title: "Repairing",
        text: "Re-enable email once you have checked with the person. Say what you checked.",
        roles: ["admin", "manager"],
        shownWhen: "Admin or manager",
      },
      {
        target: "page-activity",
        title: "Email events",
        text: "Every message sent to this address and what happened to it.",
      },
    ],
  },
  // AA - Team and access
  {
    key: "admin-access",
    version: 2,
    title: "Team and access",
    path: "/settings/team",
    roles: ["admin"],
    steps: [
      {
        target: "access.team",
        title: "The team",
        text: "Everyone with a back-office account, their role, and when they last opened back-office.",
      },
      {
        target: "access.roles",
        title: "Roles and permissions",
        text: "What Administrators, Managers and Customer support may each do. The platform's staff record decides.",
      },
    ],
  },
  // ST - Settings
  {
    key: "settings",
    version: 1,
    title: "Settings",
    path: "/settings",
    steps: [
      {
        target: "page-title",
        title: "All settings",
        text: "Everything that decides how Effy runs, in one place. Open a page to change it.",
      },
      {
        target: "settings.delivery",
        title: "Delivery",
        text: "Where Effy delivers, what it costs, and the windows and days customers choose from.",
      },
      {
        target: "settings.operations",
        title: "Hub and drivers",
        text: "The hub, collection runs from shops, and the rules for drivers' work.",
      },
      {
        target: "settings.checkout",
        title: "Checkout",
        text: "The limits on every cart, and customers' points.",
      },
      {
        target: "settings.business",
        title: "Business",
        text: "Tax and invoices, and the team.",
        roles: ["admin"],
        shownWhen: "Admin",
      },
      {
        target: null,
        title: "Saving",
        text: "Changes wait on a bar at the bottom: Save or Discard. Leaving a page with unsaved changes asks first.",
      },
    ],
  },
])
