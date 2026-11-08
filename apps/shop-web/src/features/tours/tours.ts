import { defineTours } from "@effy/web-kit/tour"

/**
 * THE shop console's guided tours (106) - the one list of their words (FR-016). Every title and text is copied from
 * specs/106-guided-tours/spec.md › Tour Inventory, and `tours.test.ts` fails when the two differ: change the words
 * in both places. When a page is redesigned, re-read its tour here, and RAISE its `version` when the tour is
 * rewritten - people who saw the old one are then offered the new one (FR-021).
 *
 * `target` names `data-tour` keys on the page (the first present wins); `null` is a centred card. A step whose part
 * is not on screen is skipped, so steps for things that come and go need no flag; `roles` limits a step to those roles, and `shownWhen` repeats the spec's condition.
 */
export const SHOP_TOURS = defineTours([
  // W - Welcome to Effy Shop
  {
    key: "welcome",
    version: 1,
    title: "Welcome to Effy Shop",
    anyPage: true,
    steps: [
      {
        target: null,
        title: "Welcome to Effy Shop",
        text: "This is where your shop does its part for Effy: picking and packing orders, keeping products and stock right, and seeing how you're doing. The tour takes about a minute.",
      },
      {
        target: "nav",
        title: "Find your way",
        text: "Today is where you start. Orders is the packing bench, Catalog holds your products and stock, and Insights shows how the shop is doing.",
        side: "right",
      },
      {
        target: "nav.orders-group",
        title: "Numbers mean work",
        text: "The number beside Orders is how many are waiting to be picked. It updates by itself, so there's no need to reload.",
        side: "right",
      },
      {
        target: "nav.manager",
        title: "Your team",
        text: "Invite colleagues and choose what each one can do. Only managers see this.",
        side: "right",
        roles: ["shop_manager"],
        shownWhen: "Manager",
      },
      {
        target: "nav.settings-group",
        title: "Settings for this device",
        text: "Turn on notifications for new orders and set up this computer's label printer.",
        side: "right",
      },
      {
        target: "header.search",
        title: "Search and commands",
        text: 'Find any order or product, or type what you want to do, such as "New product" or "Print pick lists". Press ⌘K (Ctrl K on Windows) on any page.',
      },
      {
        target: "header.scan",
        title: "Scan from anywhere",
        text: "Scan a bag label, or type an order number, to go straight to that order. A handheld scanner works on any page.",
      },
      {
        target: "header.sound",
        title: "Hear new orders",
        text: "Turn sound on so a new order chimes as well as appears. Your browser needs this one press before it can play sound.",
      },
      {
        target: "header.account",
        title: "Your account",
        text: "Switch between light and dark, or sign out. On a shared computer, sign out when you leave.",
      },
      {
        target: "header.help",
        title: "Help is always here",
        text: "Every page has its own short tour. Open it here any time, or replay this one.",
      },
    ],
  },
  // T - Today
  {
    key: "today",
    version: 2,
    title: "Today",
    path: "/",
    steps: [
      {
        target: "page-title",
        title: "Your day at a glance",
        text: "Today's date and what you've sold so far today.",
      },
      {
        target: "today.brief",
        title: "How the day is going",
        text: "One sentence on what matters most right now, then the next three things on the clock. A rose ground means orders missed a driver.",
      },
      {
        target: "today.next",
        title: "Needs you",
        text: "Your work, most urgent first: what the next driver needs, then what costs sales, then what can wait. Each count opens its list.",
      },
      {
        target: "today.collection",
        title: "Today's Effy drivers",
        text: "Every Effy collection run today on one clock. Each bar runs from its first order to the time the driver comes, split by how far each order is.",
      },
      {
        target: "today.picking",
        title: "Being picked now",
        text: "Who is picking which order, and for which driver.",
      },
      {
        target: "today.flow",
        title: "Where today's orders are",
        text: "Every order that came in today, after it leaves your hands too, in the same words as the order page.",
      },
      {
        target: "today.sales",
        title: "Orders today",
        text: "Orders, sales, average order and time to ready since midnight, against the same day last week.",
      },
      {
        target: "today.now",
        title: "Just happened",
        text: "The latest from your team and your orders. Team activity has everything.",
      },
      {
        target: "today.quick-actions",
        title: "Quick actions",
        text: "Shortcuts to what you start most: a new product, receiving stock, exporting orders, or the orders that need attention.",
      },
      {
        target: "today.print",
        title: "Print pick lists",
        text: "One pick list for every order waiting to be picked, in walking order. It's greyed out when nothing is waiting.",
      },
      {
        target: "page-more",
        title: "Team activity",
        text: "Everything your team has done, including picks, notes, stock and refunds, in one log you can search and export.",
      },
    ],
  },
  // OQ - Orders · Queue
  {
    key: "orders-queue",
    version: 1,
    title: "Orders · Queue",
    path: "/orders",
    steps: [
      {
        target: "orders.view-switch",
        title: "Two ways to see orders",
        text: "Queue is the packing bench, with orders in lanes. Table lists every order, with search and filters.",
      },
      {
        target: "orders.collection",
        title: "Ready by collection time",
        text: "When the next driver collects. Orders in the queue should be ready before then.",
      },
      {
        target: "orders.lane-new",
        title: "Awaiting pick",
        text: "Paid orders nobody has started yet, oldest first. Open one to start picking.",
      },
      {
        target: "orders.lane-picking",
        title: "Picking",
        text: "Orders someone has started. Finish these before starting new ones.",
      },
      {
        target: "orders.lane-ready",
        title: "Ready",
        text: "Packed, labelled and waiting for the Effy driver or the courier to collect.",
      },
      {
        target: "orders.left-shop",
        title: "Left the shop",
        text: "Today's orders that have already gone. Open it to check what was collected.",
      },
      { target: "page-more", title: "Export", text: "Download your orders as a spreadsheet." },
    ],
  },
  // OT - Orders · Table
  {
    key: "orders-table",
    version: 1,
    title: "Orders · Table",
    path: "/orders",
    search: { view: "table" },
    steps: [
      {
        target: "orders.status",
        title: "Order status",
        text: "Narrow the list to one stage, such as Awaiting pick or Picking. The number beside each one is how many orders are in it.",
      },
      {
        target: "orders.search",
        title: "Search",
        text: "Find an order by its number, the customer, or a product's SKU.",
      },
      {
        target: ["orders.filters", "orders.filters-button"],
        title: "Filters",
        text: "Narrow the list by when an order was placed, who takes it (Effy driver or Courier), and payment.",
      },
      {
        target: "list.row-select",
        title: "Work on several at once",
        text: "Tick orders to print all their labels together, or to add the same tag to each.",
        shownWhen: "There are rows",
      },
      {
        target: "list.first-row",
        title: "Open an order",
        text: "Open a row to pick, pack and label it.",
        shownWhen: "There are rows",
      },
      {
        target: "page-more",
        title: "Export",
        text: "Download the orders you're looking at as a spreadsheet, with the same search and filters.",
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
        text: "The order number and where it's up to. You see only your shop's items. Use ← and → to go to the previous or next order.",
      },
      {
        target: "order.next-step",
        title: "The next step",
        text: "One button for what comes next: Start picking, then Mark ready once every bag is packed and labelled.",
        side: "top",
        shownWhen: "Shown",
      },
      {
        target: "order.pick-list",
        title: "Pick list",
        text: "In walking order: shelves first, cold things last. Tick each line as it goes in the bag, or scan its barcode.",
      },
      {
        target: "order.cant-supply",
        title: "When you can't find something",
        text: "If an item is missing or you have fewer, record it here. Never just leave it out. Effy lets the customer know.",
        side: "top",
        shownWhen: "Shown",
      },
      {
        target: "order.bags",
        title: "Bags & labels",
        text: "One bag per temperature (frozen, chilled, room temperature), each with its own label. Print the label, stick it on, and scan each bag as you pack it.",
      },
      {
        target: "order.where",
        title: "Who takes it",
        text: "Whether an Effy driver or a courier takes this order, and when it's collected.",
      },
      {
        target: "order.courier-pickup",
        title: "Courier pickup",
        text: "A courier collects this one from your shop. Mark it ready before they arrive.",
        shownWhen: "Courier collects from the shop",
      },
      {
        target: "order.money",
        title: "Your money",
        text: "What you're paid for this order, after anything you couldn't supply.",
      },
      {
        target: "order.notes",
        title: "Team notes",
        text: "Notes only your team sees. They can't be edited once added.",
      },
      {
        target: "order.tags",
        title: "Tags",
        text: "Tags help you group and find orders later. Only your shop sees them.",
      },
      {
        target: "order.refund",
        title: "Refunds",
        text: "Choose the lines to refund. Effy returns the money to the customer's card.",
        roles: ["shop_manager"],
        shownWhen: "Manager, and something is refundable",
      },
      {
        target: "page-activity",
        title: "Order activity",
        text: "Everything that has happened to this order, step by step.",
      },
    ],
  },
  // C - Catalog · Products
  {
    key: "catalog",
    version: 1,
    title: "Catalog · Products",
    path: "/catalog",
    steps: [
      {
        target: "page-title",
        title: "Your catalog",
        text: "Your products, prices and stock. Shoppers buy them as Effy's and never see which shop supplies them.",
      },
      {
        target: "catalog.new",
        title: "Add a product",
        text: "Effy checks every new product and sets what shoppers pay before it goes on sale.",
      },
      { target: "catalog.search", title: "Find a product", text: "Search by name, brand, SKU or barcode." },
      {
        target: "catalog.status",
        title: "Status",
        text: "Live products are on sale. Drafts aren't finished yet. Unavailable ones are switched off. Archived ones are no longer sold.",
      },
      {
        target: "catalog.review",
        title: "Review",
        text: "Find products waiting for Effy, or ones sent back with a note to fix.",
      },
      {
        target: "catalog.category-section",
        title: "Category and section",
        text: "Narrow by Effy's category, or by your own sections.",
      },
      {
        target: "list.col.storefront",
        title: "Can shoppers buy it?",
        text: "Buyable means it's on sale now. Anything else is waiting, switched off, or held by Effy.",
        shownWhen: "There are rows",
      },
      {
        target: "page-more",
        title: "Sections and stock settings",
        text: "Sections are your own groups for organising products. Only your shop sees them. Stock settings sets when a product counts as running low.",
      },
    ],
  },
  // N - New product
  {
    key: "product-new",
    version: 1,
    title: "New product",
    path: "/catalog/new",
    steps: [
      {
        target: "product-form.steps",
        title: "Five short steps",
        text: "Name & category, Photo, Variants & prices, Details, then Review. Your work is kept if you leave and come back.",
      },
      {
        target: "product-form.category",
        title: "The category matters",
        text: "It decides where shoppers find the product, which details it needs, and what it can vary by, such as size or flavour.",
        shownWhen: "Name & category step",
      },
      {
        target: "product-form.photo",
        title: "One clear photo",
        text: "Used everywhere shoppers see this product. Every product needs one.",
        shownWhen: "Photo step",
      },
      {
        target: "product-form.price",
        title: "Your price",
        text: "What you're paid for each one. Effy sets what shoppers pay when it approves the product.",
        shownWhen: "Variants & prices step",
      },
      {
        target: "product-form.preview",
        title: "How shoppers see it",
        text: "Updates as you type. It's shown at your price until Effy sets the shopper price.",
        shownWhen: "Shown",
      },
      {
        target: "product-form.send",
        title: "Effy checks it",
        text: "You send it, Effy checks it and sets the price, and you're notified when it goes on sale. You can still change it while it's in review.",
        shownWhen: "Review step",
      },
    ],
  },
  // P - A product
  {
    key: "product",
    version: 1,
    title: "A product",
    needsRecord: "product",
    steps: [
      {
        target: ["product.status", "page-title"],
        title: "Where it stands",
        text: "On sale, waiting for Effy's review, sent back with a note, or held by Effy. What to do next is written here.",
      },
      {
        target: "product.preview",
        title: "How shoppers see it",
        text: "The product as it looks on Effy, including a change you've made that's still waiting for review.",
      },
      {
        target: "product.sizes",
        title: "Sizes and prices",
        text: "Your price for each size, and what customers pay once Effy sets it. A price change goes to Effy before shoppers see it.",
      },
      {
        target: "product.stock",
        title: "Stock",
        text: "How many you have of each size. Use Receive stock when a delivery arrives, so shoppers never buy what you don't have.",
      },
      {
        target: "product.pictures",
        title: "Pictures",
        text: "The first picture is the main one shoppers see in the aisle. A new, removed or moved picture is checked by Effy first.",
      },
      { target: "product.description", title: "Description", text: "What shoppers read on the product page." },
      {
        target: "product.details",
        title: "Details",
        text: "The facts this category asks for. Shoppers filter and compare on these.",
      },
      {
        target: "product.facts",
        title: "Organisation and facts",
        text: "Its category, how it's stored (frozen, chilled or room temperature), GST and 18+.",
      },
      {
        target: "product.quality",
        title: "Listing quality",
        text: "What would make this listing better, such as a missing picture or detail.",
        shownWhen: "Shown",
      },
      {
        target: "product.sections",
        title: "Sections",
        text: "Your own groups. Put the product in as many as help you.",
      },
      {
        target: "page-more",
        title: "Activity and stock history",
        text: "Every change to this product and every stock movement, in one log.",
      },
    ],
  },
  // A - Availability
  {
    key: "availability",
    version: 1,
    title: "Availability",
    path: "/catalog/availability",
    steps: [
      {
        target: "page-title",
        title: "Switch off what you've run out of",
        text: "Take a size off sale the moment you run out. It's instant, and no review is needed.",
      },
      {
        target: "availability.show",
        title: "Needs a look first",
        text: "Sizes that are out of stock or running low come first. Choose Everything to see them all.",
      },
      { target: "availability.search", title: "Find a size", text: "Search by product, size or barcode." },
      {
        target: "availability.switch",
        title: "On or off sale",
        text: "Switch a size off and shoppers can't buy it straight away. Switch it back on when it's restocked.",
        shownWhen: "There are rows",
      },
      {
        target: "page-title",
        title: "The last size",
        text: "If it's the last size on sale, make the whole product unavailable on its page instead.",
      },
    ],
  },
  // I - Insights · Overview
  {
    key: "insights",
    version: 2,
    title: "Insights · Overview",
    path: "/insights",
    steps: [
      {
        target: "insights.pages",
        title: "Five views",
        text: "Overview at a glance, then Sales, Products, Stock and Service in more depth. Each one has its own short tour.",
      },
      {
        target: "insights.range",
        title: "Choose the period",
        text: "Today, 7 days or 30 days. Each figure is compared with the period before.",
      },
      {
        target: "insights.figures",
        title: "How the period went",
        text: "Sales and orders for the period, against the one before. Sales count your goods only, and a refund comes off on the day it was issued.",
      },
      {
        target: "insights.worth",
        title: "Worth doing",
        text: "What the figures say to do, biggest cost first. Each row opens the page behind it.",
      },
      {
        target: "insights.view-toggle",
        title: "Chart or table",
        text: "The same figures as a chart or as exact numbers.",
      },
      {
        target: "insights.cards",
        title: "Look closer",
        text: "Each card is one finding. Open it for the whole chart, its table and how it's counted.",
      },
      {
        target: "page-more",
        title: "Export",
        text: "Download the period's figures as a spreadsheet.",
      },
    ],
  },
  // IS - Insights · Sales
  {
    key: "insights-sales",
    version: 2,
    title: "Insights · Sales",
    path: "/insights/sales",
    steps: [
      {
        target: "insights.measure",
        title: "What to chart",
        text: "Choose the measure the chart shows.",
      },
      {
        target: "insights.rhythm",
        title: "Look closer",
        text: "By aisle, your average day, when orders come in, order size and who buys. Each card opens its chart.",
      },
      {
        target: "insights.behind",
        title: "Behind the sales",
        text: "What moved sales this period: refunds, what you couldn't supply and cancellations.",
      },
    ],
  },
  // IP - Insights · Products
  {
    key: "insights-products",
    version: 2,
    title: "Insights · Products",
    path: "/insights/products",
    steps: [
      {
        target: "insights.best",
        title: "Best sellers",
        text: "Your products by what they sold this period, with their share, their place and the stock you have now.",
      },
      {
        target: "insights.up",
        title: "Moving up",
        text: "Products selling more than the period before.",
      },
      {
        target: "insights.slipping",
        title: "Slipping",
        text: "Products selling less than the period before.",
      },
      {
        target: "insights.oos",
        title: "Selling but out of stock",
        text: "Shoppers want these, but you have none. Restock them first.",
      },
    ],
  },
  // IK - Insights · Stock
  {
    key: "insights-stock",
    version: 1,
    title: "Insights · Stock",
    path: "/insights/stock",
    steps: [
      {
        target: "insights.running-out",
        title: "Running out",
        text: "When each product runs out if it keeps selling like the last four weeks. Restock the soonest first.",
      },
      {
        target: "insights.sold-out",
        title: "Sold out",
        text: "What reached none this period, for how long, and roughly the sales that cost.",
      },
      {
        target: "insights.not-selling",
        title: "Not sold in 30 days",
        text: "In stock and on sale, but nobody bought one in 30 days.",
      },
      {
        target: "insights.written-off",
        title: "Written off",
        text: "Stock you recorded as expired or damaged, at your prices.",
      },
    ],
  },
  // IV - Insights · Service
  {
    key: "insights-service",
    version: 2,
    title: "Insights · Service",
    path: "/insights/service",
    steps: [
      {
        target: "insights.found",
        title: "Your four measures",
        text: "Found rate, couldn't supply, time to ready and ready before the driver. Open one for its chart.",
      },
      {
        target: "insights.ready",
        title: "Look closer",
        text: "Which driver you miss most, when you're slowest and how long orders take.",
      },
      {
        target: "insights.missed",
        title: "What you could not supply",
        text: "The products you missed most, so you can fix stock or switch them off sooner.",
      },
      {
        target: "insights.pickers",
        title: "Who picked",
        text: "Orders each person finished and how long they took. For planning shifts, not for ranking people.",
        roles: ["shop_manager"],
        shownWhen: "Manager",
      },
    ],
  },
  // IC - Insights · A chart
  {
    key: "insights-chart",
    version: 1,
    title: "Insights · A chart",
    path: "/insights/$section/$chart",
    steps: [
      {
        target: "insights.back",
        title: "Back to the page",
        text: "Returns to the page this chart came from.",
      },
      {
        target: "insights.range",
        title: "Choose the period",
        text: "Today, 7 days or 30 days. The chart and its finding follow.",
      },
      {
        target: "insights.chart",
        title: "The whole chart",
        text: "The finding in one sentence, then the chart. Point at it, or use the arrow keys, for each value.",
      },
      {
        target: "insights.view-toggle",
        title: "Chart or table",
        text: "The same figures as a chart or as exact numbers.",
      },
    ],
  },
  // TM - Team
  {
    key: "team",
    version: 1,
    title: "Team",
    path: "/manager",
    steps: [
      { target: "page-title", title: "Your team", text: "The people who can sign in to this shop console." },
      {
        target: "team.invite",
        title: "Invite a colleague",
        text: "Enter their work email. They get a one-time code to sign in, and there's no password to set.",
      },
      {
        target: "list.col.role",
        title: "Manager or Staff",
        text: "Managers can also run the team and issue refunds, and get the alerts meant for managers. Staff do the everyday work.",
        shownWhen: "There are rows",
      },
      {
        target: "team.actions",
        title: "Change or stand down",
        text: "Change someone's name or role, or stand them down so they can no longer sign in. You can reinstate them later.",
        shownWhen: "There are rows",
      },
    ],
  },
  // NS - Settings · Notifications
  {
    key: "settings-notifications",
    version: 1,
    title: "Settings · Notifications",
    path: "/settings/notifications",
    steps: [
      {
        target: "notifications.device",
        title: "This device",
        text: "Alerts for new orders and anything that needs attention, even when the console is closed. Each computer, tablet or phone is turned on separately.",
      },
      {
        target: "notifications.test",
        title: "Check it works",
        text: "Shows one notification on this device now.",
        shownWhen: "Notifications are on",
      },
      {
        target: "notifications.types",
        title: "What you're told about",
        text: "Choose which alerts reach this device. Everything is on until you turn it off.",
      },
      {
        target: "notifications.sound",
        title: "Sound",
        text: "A chime in this tab for new orders while the console is open. The Sound button at the top of every page does the same.",
      },
      {
        target: "notifications.home-screen",
        title: "On iPad and iPhone",
        text: "Notifications only work once Effy Shop is added to the home screen.",
        shownWhen: "iPad / iPhone",
      },
    ],
  },
  // NF - Notifications (110)
  {
    key: "notifications",
    version: 1,
    title: "Notifications",
    path: "/notifications",
    steps: [
      {
        target: "page-title",
        title: "Everything you were told",
        text: "Every notification for you is kept here for 90 days, even ones you closed or missed. The newest is at the top.",
      },
      {
        target: "notifications.filters",
        title: "Find what you need",
        text: "Show everything or only what you haven't read, and narrow it to orders, stock, products, announcements or important notices.",
      },
      {
        target: "notifications.list",
        title: "Go straight there",
        text: "Click a notification to open what it's about. It's then marked read.",
        shownWhen: "There are notifications",
      },
      {
        target: "notifications.mark-all",
        title: "Catch up in one click",
        text: "Mark everything read once you've dealt with it, or archive a notification to take it off the list.",
        shownWhen: "Something is unread",
      },
    ],
  },
  // PS - Settings · Printing
  {
    key: "settings-printing",
    version: 1,
    title: "Settings · Printing",
    path: "/settings/printing",
    steps: [
      {
        target: "page-title",
        title: "Printing on this computer",
        text: "How this computer prints bag labels. Each computer keeps its own setting.",
      },
      {
        target: "printing.printer",
        title: "Printer",
        text: "A Zebra label printer prints straight away when Zebra Browser Print is running. Anything else uses your computer's print window.",
      },
      { target: "printing.size", title: "Label size", text: "Match the labels loaded in the printer." },
      {
        target: "printing.resolution",
        title: "Resolution",
        text: "It's on the printer's own label or in its manual. Most label printers are 203 dpi.",
      },
      {
        target: "printing.test",
        title: "Test label",
        text: "Prints a sample with these settings. Nothing is recorded against an order.",
      },
    ],
  },
])
