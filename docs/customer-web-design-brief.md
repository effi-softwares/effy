# Effy Customer Web — Redesign Brief for Claude Design

**Purpose.** This document is the complete functional inventory of the Effy customer storefront
(`apps/customer-web`) as it is built today, plus the direction for its redesign. Claude Design uses it
to produce (1) a **new design system** for the customer storefront and (2) **redesigned screens** for
every route and state listed here.

**How to read it.**
- Part A — product context and the redesign goal.
- Part B — design direction (references, colour, density, tone).
- Part C — hard rules the design must respect (truth, wording, performance, accessibility).
- Part D — the data that exists (what a design is allowed to show).
- Part E — global chrome (header, navigation, footer, cart drawer, toasts, consent).
- Part F — every screen, with every element, state, message and action.
- Part G — the component inventory the design system must cover.
- Part H — known gaps and inconsistencies in the current build worth fixing in the redesign.
- Part I — ideas that need new data or backend work (allowed to propose, must be labelled).
- Part J — deliverables checklist.

Every user-facing string quoted in this document is the real copy in the product today. Strings marked
**FIXED WORDING** are shared with the mobile app and pinned by tests — the design may restyle them but
must not reword them.

---

## Part A — Product context

### A.1 What Effy is
- Effy is a **single-brand online grocery and everyday-essentials store** in **Australia** (currency
  AUD, dates `en-AU`, timezone Australia/Melbourne, prices include GST).
- Positioning: **"Uber Eats + eBay, food-first"** — the discovery and density of a big marketplace,
  the product richness of eBay listings, with food and food-related products given priority.
- Customers buy from **one brand, "Effy."** There are no named stores, sellers or storefronts. The
  platform decides behind the scenes where an order is filled from. **The customer never sees, picks
  or is told about a shop or supplier, and is never told how many suppliers fill an order.**
- Products can still carry a **product brand** (e.g. the manufacturer), shown on the product and
  usable as a search filter. That is not a seller.
- Tagline in use today: **"Effy — groceries, delivered"**. Descriptions in use: "Shop fresh groceries
  and everyday essentials from Effy, delivered to your door." / "Fresh groceries and everyday
  essentials, brought to your door. One brand, one basket, one delivery."

### A.2 The customer journey
1. **Browse as a guest** — the entire catalogue, search, product pages, cart and saved items work with
   **no account**. Nothing asks the visitor to sign in while browsing.
2. **Build a cart** — stored in the browser for a guest; synced to the account once signed in (guest
   cart and guest saved items are merged into the account on sign-in).
3. **Sign in only at checkout** — sign-in is demanded at the moment of ordering and returns the
   customer to exactly where they were.
4. **Checkout** — choose address → see who delivers (Effy in a time window, or a courier with an
   estimate) → optional delivery instructions → optional Effy points → billing address → pay.
5. **After the order** — receipt, live order progress, tracking, cancel, report a problem / request a
   refund, buy again.

### A.3 The two delivery outcomes (decided from the delivery address — the customer does not choose between them)
- **"Delivered by Effy"** — Effy's own drivers. The customer picks **one delivery window for the whole
  order**: a window **today** (shown under **"Same-day delivery"**) or a window on one of the next few
  delivery days (shown under **"Standard delivery"**).
- **"Courier delivery"** — a courier partner. Nothing to choose: an **estimate** (always worded as an
  estimate, never a promised date) and one fee.
- **Neither** — the address is refused with exactly one sentence: **"Sorry, we can't deliver to this
  address."** (FIXED WORDING — no reason, no zone, no distance, no suggestion of courier.)

### A.4 Why we are redesigning
The current storefront is functionally complete but **feels empty**: a three-link header, one hero
band, plain product rails, lots of white space, almost no colour, and long stretches with nothing to
look at. It reads like a minimal landing page, not a store with a lot in it.

**The redesign goal:** a **content-rich, colourful, modern, professional e-commerce site** where a
customer immediately feels *"there is a lot here"* — while staying **fast, very reliable and
user-friendly**. Eye-catching, but never cheap.

---

## Part B — Design direction

### B.1 Reference sites (in priority order)
Study how each solves density, navigation and merchandising, and borrow in this order of weight:

1. **https://www.ebay.com.au/** — primary reference. Dense category navigation, mega-menu, a
   prominent full-width search with category scope, many stacked merchandising modules on the home
   page (deals, categories, recently viewed, "your picks"), rich listing pages with item-specifics
   tables, strong filter sidebar.
2. **https://www.coles.com.au/** — grocery reference. Department navigation, "specials" treatment,
   product tiles with price emphasis and quick add-to-trolley with quantity stepper on the tile,
   delivery-window selection, trolley drawer, clear price/was-price/saving language.
3. **https://www.kmart.com.au/** — general-merchandise reference. Clean bright colour blocks,
   category tiles, promotional banner grids, friendly approachable tone, strong mobile layout.
4. **https://nakathaaustralia.com.au/** — niche/ethnic grocery reference. How a smaller specialist
   grocer presents category breadth, featured shelves and promotional strips.

Take the **structure and density** from these sites, not their branding. The result must look like
Effy, not like a copy of any of them.

### B.2 Colour — multi-colour, not monochrome, not single-hue
- The new customer storefront must use a **genuine multi-colour palette**: a primary brand colour,
  **at least one strong secondary**, and a set of **supporting accent colours** used with intent
  (deals/savings, freshness, new arrivals, points/rewards, delivery, category colour-coding).
- It must **not** be monochrome and must **not** be a one-colour theme with greys.
- **Colour must carry meaning, consistently.** Suggested semantic roles the system should define:
  - **Primary action** (add to cart, checkout, pay) — one colour only, so the main action is always
    obvious.
  - **Deals / savings** (sale badges, was-price savings, promo codes, offer panels).
  - **Fresh / positive** (in stock, free delivery reached, paid, delivered).
  - **Time / urgency** (same-day, "Order by 2 pm" cut-offs, expiring points).
  - **Rewards** (Effy points).
  - **Information / courier / neutral states**.
  - **Error / destructive**.
  - **Category tints** — a controlled set of soft background tints so category tiles, department
    headers and merchandising bands are visibly different from each other.
- **Seeds available from the current build** (not binding; a starting point):
  - Current action colour: cobalt `#1d4ed8` (with soft `#e9f0ff`, mid `#b9cdfb`, ink `#11317f`).
  - Existing brand-artwork colours used on the sign-in panel and value strip: citrus orange
    `#F95F09`, deep leaf green `#374128`, sprout green `#6BB252`.
  - Existing supporting tokens: orange `#b4550a` / soft `#fff3e8`, violet `#6d3fd4` / soft `#f2edff`,
    teal `#0a7d70` / soft `#e4f7f3`, success `#0d8043` / soft `#e8f8ee`, warning `#a85c05` / soft
    `#fff5e5`, destructive `#cf2b1f` / soft `#fef2f1`, text `#0b1220`, muted text `#5c6b86`, muted
    surface `#f1f5fb`, border `#e1e8f3`, page `#ffffff`.
- **Hex values that must not be used** (retired brand colours; an automated check fails the build if
  any appear in code): `#065f46`, `#10b981`, `#d0735a`, `#bf5540`, `#dd8368`, `#69b08b`, `#0ea5e9`,
  `#075985`, `#4ade80`, `#3b82f6`, and Jade `#0FB57E` / `#047857`.
- **Contrast:** every text/background pair must meet **WCAG AA** (4.5:1 body text, 3:1 large text and
  UI boundaries such as focus rings). Every solid colour must also pass on its own soft tint.
  Document the ratio for each pair in the design system.
- **Light theme only.** The customer storefront does not ship dark mode. Do not design one.

### B.3 Density and richness — "there is a lot here"
The single most important change. Concretely:
- **A real navigation system**: department bar / mega-menu built from the category tree, not three
  text links.
- **A home page with many distinct modules** stacked with visual variety (see F.1) — hero carousel,
  category grid, deals rail, offer tiles, department shelves, brand strip, buy-again, recently viewed,
  points, app promo, newsletter — each visually different so scrolling stays interesting.
- **Denser product grids** with more per row on desktop, tighter but breathable spacing, and tiles
  that carry more information (brand, name, price, was-price, saving, badges, save heart, quick add).
- **Horizontal carousels** for rails, with visible "See all" and arrows, so a page can hold many
  shelves without being endless.
- **No dead zones.** Every empty state gets illustration/colour plus a route forward. Every long page
  ends with related content (related products, recently viewed, deals).
- **Use every piece of data that exists** (Part D) before inventing anything.

### B.4 Tone and quality bar
- Modern, professional, confident, friendly. Clean typography, generous but not wasteful spacing,
  consistent radii, crisp imagery.
- **Eye-catching without feeling cheap:** no clutter of competing badges, no flashing/blinking, no
  fake urgency (no countdown timers that are not backed by data, no "only 2 left!" — we do not expose
  stock counts), no fake reviews or star ratings, no stock-photo testimonials.
- Typeface today is **General Sans** (self-hosted) with Geist as the system family. The design system
  may propose a different display/body pairing; it must be a web-available family that can be
  self-hosted, and no more than two families.
- Icons today come from **Lucide**. Keep a single consistent icon set.
- Motion: purposeful micro-interactions (add-to-cart feedback, drawer slide, carousel, skeleton
  shimmer). All motion must respect `prefers-reduced-motion`.

### B.5 Responsive behaviour
- Design **mobile-first**: 390 px (phone), 768 px (tablet), 1024 px (small laptop), 1280 px and
  1440 px+ (desktop). Current content container is max **1280 px** with 16 px gutters on phones and
  24 px from 640 px up; the redesign may widen it if grids are re-tuned for it.
- Current desktop/mobile switch for the header is **1024 px**.
- Touch targets **≥ 44 × 44 px**. Thumb-reachable primary actions on mobile (sticky add-to-cart bar on
  product page, sticky checkout summary/CTA on cart and checkout are encouraged).
- Suggested addition: a **mobile bottom navigation bar** (Home · Categories · Search · Saved · Cart or
  Account).

---

## Part C — Hard rules

### C.1 Truth — never design a claim the platform cannot keep
- **No reviews, ratings or testimonials.** The platform has none.
- **No stock quantities.** A product is only *available* or *unavailable*.
- **No seller/shop/supplier names, no "sold by", no "ships from", no count of packages or suppliers.**
- **No invented delivery promises** in marketing areas: no "delivery in 30 minutes", no fixed free-
  delivery threshold in banners or the announcement bar (the free-delivery amount is set by the
  business per fee plan and is only known at checkout for a specific address), no coverage areas, no
  opening hours, no phone number, no guarantees.
- **A courier time is always an estimate.** Wherever it appears it carries the words "— an estimate,
  not a guaranteed date."
- **A delivery window is never substituted.** If a chosen window disappears, the customer is told and
  chooses again.
- **Effy points are a way of paying, not a discount.** The order total does not change; the card
  amount does. Points "have no cash value".
- **The apps are not released yet.** App-store badges must read "Coming soon" and must not be links.
- Promotions shown must be real promotions supplied by the backend (banners with a code, terms and
  validity).

### C.2 FIXED WORDING (restyle freely, do not reword)
| Where | Text |
|---|---|
| Delivery type label | **Delivered by Effy** · **Courier delivery** |
| Window sections | **Same-day delivery** · **Standard delivery** |
| Coverage refusal | **Sorry, we can't deliver to this address.** |
| Window states | **No windows left today.** · **We don't deliver today.** · **Every window on this day is taken.** · **There are no delivery windows available in the next few days. Please try again later.** |
| Cut-off note on a window | **Order by {time}** (e.g. "Order by 2 pm") · **Closed** |
| Courier lines | **Delivered by a courier partner.** / **Usually arrives in {estimate} — an estimate, not a guaranteed date.** |
| No Effy window, courier offered instead | **There are no Effy delivery windows available in the next few days.** **We can send this order by courier instead.** |
| Courier tracking | **Track your parcel** (optionally "with {courier name}") · **Tracking for each parcel is sent to you by email.** |
| Order moved by staff | **We've changed this order to courier delivery.** · **We've changed this order back to delivery by Effy.** · **We've added {N} points ({$amount}) to your account to make up for it.** · **We've refunded {$amount} to your card to make up for it.** |
| Fee line labels | **Delivery** · **Window surcharge** · **Small-order fee** · **Free delivery** |
| Fee sentences | **Spend {amount} more for free delivery** · **You've got free delivery** · **Orders under {amount} have a small-order fee** · **The delivery fee has changed. Please check the new total.** |
| Handover choices | **Leave at the door** · **Meet at the door** |
| Window time format | "10 am – 12 pm", "6:30 pm – 8:30 pm" |
| Delivery day format | "Thu 8 Oct", "Fri 9 Oct" |

### C.3 Performance and reliability (these shape the design)
- Pages are **server-rendered with a static shell** that paints instantly; personalised and live data
  **stream in** afterwards. Therefore **every data-driven module needs a skeleton state that has the
  same shape and size as the loaded module** (no layout jump on swap-in).
- The guest JavaScript budget is small (about **160 KB gzipped** for public pages). Prefer designs that
  work with **CSS-only behaviour** where possible: carousels by CSS scroll-snap, rotating banners by
  CSS animation, disclosure by native `<details>`, dialogs/drawers by the native `<dialog>` element.
  Avoid designs that require heavy client libraries on public pages (complex draggable sliders,
  parallax, video heroes, animated illustrations with large runtimes).
- **Images:** product images are square; reserve space with fixed aspect ratios everywhere so nothing
  shifts. Banners must define a fixed canvas ratio per placement. Only the first hero image loads at
  high priority.
- **No screen refreshes on a timer.** Order pages and the points page update live when something
  changes; designs must not include "refresh" buttons or auto-refresh indicators for these.
- A failed secondary module (related products, recently viewed, promo hero) **silently disappears**;
  it never shows an error. Only the main content of a page shows an error state.

### C.4 Accessibility
- WCAG 2.1 AA. Visible focus states on every interactive element (3:1 focus ring).
- One `h1` per page; sections head themselves at `h2`.
- All status changes announced politely (results count, cart quantity, toasts).
- Never rely on colour alone (pair colour with icon/label for sale, error, success, status).
- Rotating content pauses on hover/focus and stops entirely under reduced motion.
- Form errors appear inline next to the field, in text, tied to the field.

### C.5 SEO
- Public and indexable: home, search/category listings, product pages, about, legal, feedback,
  delete-account. Not indexed: account, checkout, auth, promotion detail, newsletter confirmation.
- Product and category pages need descriptive headings, breadcrumbs, and crawlable links (real anchor
  links for categories, products, pagination entry points).

---

## Part D — Data available to the design

Only the following data exists. A design element that needs anything else belongs in Part I.

### D.1 Product (tile)
`id`, `name`, `brand` (optional), `imageUrl` (optional, square), `priceAmount`, `currency` (AUD),
`compareAtAmount` (optional "was" price), `badges` (any of **`on_sale`**, **`new`**), `available`
(boolean). Derived: **percent off** = round((was − price) / was × 100).

### D.2 Product (detail) — everything above plus
`longDescription` (plain text, line breaks preserved), `gallery` (ordered images with optional alt
text), `attributes` (groups of label/value pairs — an "item specifics" table, e.g. group
"Nutrition" → "Energy: 250 kJ"), `categoryPath` (breadcrumb names), `categoryKey`.

### D.3 Category
`key`, `name`, `parentKey` (categories form a **tree** — usable for a mega-menu and sub-category
navigation), `productCount`, `imageUrl` (optional).

### D.4 Home payload
- **Banners**: `title`, `subtitle`, `imageUrl`, `href`, `code` (promo code), `terms`, `target`
  (search / sale / category / product / promotion), `position`, `placement` (**`carousel`** = hero,
  **`inline`** = offer tiles).
- **Rails**: ordered list of `{ key, title, products[] }`. Keys in use: **`on_sale`**, **`featured`**,
  and **`category:{key}`** (one per department). Unknown future keys must still render.

### D.5 Search
- Query: text `q`, `category`, `saleOnly`, `minPrice`, `maxPrice`, repeated `brand`, repeated
  `attr.{key}` values, `sort`, cursor pagination (24 per page, infinite scroll).
- Result: `items`, `total`, `nextCursor`, applied `sort`.
- Sort options: **Best match** (only when there is a text query), **Newest** (default),
  **Price: low to high**, **Price: high to low**.
- **Facets** (recomputed for the current result set): `priceBounds {min,max}`, a **category** facet
  (single-select, with counts), **brand** and any number of **attribute facets** (multi-select, each
  option with label and count).

### D.6 Promotion
`id`, `title`, `subtitle`, `imageUrl`, `code`, `terms` ("Conditions"), `validity` ("Availability").

### D.7 Cart
Lines: product id, name, image, unit price, quantity (1–99), `available` flag, `priceChangedFrom`
(previous price when it changed since adding). Up to 100 distinct items. Totals: item subtotal,
optional **discount** `{ code, label, amount }`, grand total (before delivery). **Checkout gate**:
`allowed` or `blockedReason` ∈ `no_payable_items` | `below_minimum` (with `minimumSubtotalAmount` and
`remainingAmount`) | empty.

### D.8 Saved items and lists
- **Saved item**: product tile fields + `savedAt`, `savedPriceAmount` (price when saved),
  `priceDropped` flag, `verdict` ∈ **Available now** | **Out of stock right now** | **No longer
  sold**, `categoryKey`.
- **Lists**: a default list called **"Saved"** plus up to **20** named lists (name 1–40 characters,
  unique). Each list: `name`, `count`, `containsProduct` (for the chooser), `onlyHereCount`.

### D.9 Address
`label` (Home / Work / custom text), `recipientName`, `line1`, `line2`, `city`, `region`
(state), `postalCode`, `country`, `phone`, `isDefault`, **`coverage`** (`effy` → "Delivered by Effy",
`courier` → "Courier delivery", `none` → the refusal sentence), `defaultDeliveryInstructions`
(handover + note up to 250 characters).

### D.10 Checkout quote (per selected address)
`serviced` (boolean), `coverage`, **Effy windows** (days → windows: label, cut-off, surcharge, closed
flag, fee breakdown; per-day sentence when a day has none), **or courier** (`estimate`, `fee`,
`reason` ∈ in-coverage-no-window | out-of-coverage), **fee breakdown** lines, `freeDeliveryRemainingAmount`,
**points** (`usable`, `centsPerPoint`, `cardMinimumAmount`).

### D.11 Payment
Saved cards: brand, last four, expiry month/year, `isDefault`, `usable`, `unusableReason`. Methods:
card (Visa, Mastercard, American Express), saved card, Apple Pay / Google Pay wallet buttons (when the
device supports them), "Pay over time" instalments (when available for the order).

### D.12 Order
- **Summary** (list): `orderNumber`, `itemCount`, `status` (Paid / Awaiting payment / Payment failed),
  `grandTotalAmount`, delivery type.
- **Detail**: order number, placed date/time, items (image, name, unit price, quantity, line
  subtotal), item subtotal, discount + promo code, delivery fee lines, total paid, **payment split**
  (points used, points amount, card amount), payment method (brand, last four), delivery address,
  billing address, delivery instructions, **stage** ∈ Confirmed → Being packed → On the way →
  Delivered, **arrival estimates** (one per distinct promise; method Same-day / Standard / Scheduled,
  formatted day and window), **delivery** (type, courier estimate, tracking link or "by email",
  moved-by-staff note and compensation), **unavailable items** (out-of-stock shortfalls, auto-refunded),
  **refunds** (state: On its way back to you / Refunded / There was a problem — we're looking into
  it; amounts; refunded total; amount paid after refunds; fully refunded flag), `cancellable` flag.

### D.13 Points
Balance (`points`, `valueAmount`), `nextExpiry` (points and date), history entries (description
words, date, +/− points, "use by" date for credits), cursor pagination (Newest / Older).

### D.14 Customer
Given name, family name, email (read-only), phone, member-since date, has-password flag, password
last-changed date, email deliverability state (reachable / undeliverable / soft-failing / complained).

### D.15 Device-local data (guest and signed-in)
Recently viewed product ids, guest cart, guest saved items, analytics consent choice.

---

## Part E — Global chrome

### E.1 Route map
| Route | Screen | Access | Chrome |
|---|---|---|---|
| `/` | Home | Public | Storefront (with search) |
| `/search` | Search results / category listing / on-sale listing | Public | Storefront (with search) |
| `/product/{id}` | Product detail | Public | Storefront (with search) |
| `/promotions/{id}` | Offer detail | Public (not indexed) | Storefront (with search) |
| `/cart` | Cart | Public | Storefront (with search) |
| `/newsletter/confirm?token=` | Newsletter confirmation | Public (not indexed) | Storefront (with search) |
| `/checkout` | Checkout — review step and payment step | Sign-in required | Checkout (minimal) |
| `/checkout/complete?order=` | Order confirmation / receipt | Sign-in required | Checkout (minimal) |
| `/sign-in` | Sign in | Public | Auth (split panel) |
| `/sign-up` | Create account | Public | Auth (split panel) |
| `/reset-password` | Reset password | Public | Auth (split panel) |
| `/callback` | Google sign-in return | Public | Auth (split panel) |
| `/account` | Account — Personal info (default tab) | Sign-in required | Storefront (no search today) |
| `/account?tab=addresses` | Address book | Sign-in required | Storefront |
| `/account?tab=payment` | Payment methods | Sign-in required | Storefront |
| `/account?tab=points` | Effy points | Sign-in required | Storefront |
| `/account?tab=security` | Security | Sign-in required | Storefront |
| `/account?tab=privacy` | Privacy & data (delete account) | Sign-in required | Storefront |
| `/account?tab=legal` | Legal | Sign-in required | Storefront |
| `/account/unavailable` | Account unavailable | — | Storefront |
| `/orders` | Order history | Sign-in required | Storefront |
| `/orders/{id}` | Order detail / tracking | Sign-in required | Storefront |
| `/saved` | Saved items (default list) | Sign-in required | Storefront |
| `/saved/{listId}` | A named list | Sign-in required | Storefront |
| `/feedback` | Give feedback | Public | Checkout-style minimal header |
| `/about` | About Effy | Public | Bare document |
| `/legal` | Legal index | Public | Bare document |
| `/legal/{slug}` | A legal document | Public | Bare document |
| `/legal/{slug}/versions` | Document version history | Public | Bare document |
| `/delete-account` | How to delete your account (public explainer) | Public | Bare document |
| — | 404 Not found | — | Bare |
| — | Storefront error boundary | — | Storefront |

Redirect-only routes (no design needed): `/addresses`, `/account/security`, `/account/privacy`,
`/favorites` → `/saved`, `/legal/privacy`, `/legal/terms`.

### E.2 Storefront header (today)
Sticky, opaque, 64 px tall, bottom border.
- **Brand mark**: icon + wordmark "EFFY" (uppercase, extra-bold), links home.
- **Primary navigation** (desktop ≥ 1024 px): three text links separated by vertical pipes — **Home**,
  **All products** (`/search`), **On sale** (`/search?saleOnly=true`). Active link shown in weight and
  colour.
- **Search field** (desktop: compact, fluid width, max ~24 rem): pill input with search icon,
  placeholder **"Search products…"**. Submitting goes to `/search?q=…`; an empty submit goes to
  `/search`. The field shows the current query when on the search page. No suggestions, no
  autocomplete, no category scope today.
- **Cart button**: cart icon with a count bubble (shows "9+" above nine). Opens the cart drawer (E.5).
- **Account control** (desktop):
  - Guest → outlined **"Sign in"** button.
  - Signed in → circular **avatar with initials**; opens a dropdown: greeting **"Hi, {first name}"**
    (or "Hi, there"), links **Your account** and **Saved items**, divider, **Sign out**.
  - Loading → a small skeleton pill.
- **Mobile (< 1024 px)**: brand mark · cart button · hamburger menu. The search field moves to its own
  full-width row **below** the header (larger, 48 px tall) and is not sticky.

**Redesign must add / reconsider:**
- A **category/department navigation** (mega-menu on desktop, drill-down list on mobile) driven by the
  category tree, with product counts and category images available.
- A **much more prominent search bar** (eBay/Coles scale), optionally with a category scope selector.
- Header shortcuts: **Orders / Buy again**, **Saved (heart with count)**, **Effy points balance** for
  signed-in customers, **On sale / Deals** as a coloured entry.
- A **delivery context chip** (e.g. "Deliver to {default address suburb/postcode}" for signed-in
  customers — coverage label is known per saved address).
- The account dropdown should list every destination: Your account, Orders, Saved items & lists,
  Address book, Payment methods, Effy points, Sign out.

### E.3 Announcement bar (built, currently switched off)
A slim bar above the header that rotates four short lines with a CSS fade (no JavaScript); under
reduced motion it shows the first line only. The four lines (each is true of the platform):
1. "Fresh groceries and everyday essentials"
2. "Browse freely — sign in only when you order"
3. "Delivery costs shown before you pay"
4. "Save items and watch their prices"

Redesign: bring this back as a coloured utility bar. It may also carry utility links (Help/Feedback,
Track an order, About). It must not carry any claim excluded in C.1.

### E.4 Mobile menu drawer (< 1024 px)
Slides in from the left (native dialog, dark backdrop, closes on backdrop tap / Escape).
- Header: **"MENU"** + close button.
- Level 1: the primary links (Home, All products, On sale) as 48 px rows; the active one highlighted.
- Footer of the drawer:
  - Guest → full-width outlined **"Sign in"** button.
  - Signed in → a row with **avatar + full name + chevron**; tapping slides in **level 2**.
- Level 2 (account): back chevron + the customer's name as title; rows with icons — **Your account**,
  **Saved items**; divider; **Sign out**.

Redesign: this drawer must also carry the **full category tree** (drill-down), Orders, Lists, Points,
Address book, Help/Feedback.

### E.5 Cart drawer ("mini cart")
Slides in from the right (max width ~26 rem), dark backdrop.
- Header: **"Your cart"** + "{n} item(s)" + close button.
- **Empty**: cart icon, "Your cart is empty.", outlined button **"Browse products"**.
- **With items** (scrollable list), each line: 64 px thumbnail, product name (two-line clamp),
  "{price} each", **quantity stepper** (− n +; decreasing below 1 removes the line), line total,
  **"Remove"** text link.
- Footer: **Items** subtotal, note "Delivery calculated at checkout.", primary button **"Go to cart"**,
  ghost button **"Continue shopping"**.

Redesign may add: free-delivery progress is **not** available here (it depends on the address) — do
not add it; a "You might also like" strip and a direct **"Checkout"** button are fine.

### E.6 Footer (today)
1. **Closing call-to-action band** (dark): heading **"Start your first order"**, sub-line "Fresh
   groceries and everyday essentials, delivered.", button **"Shop all products"**.
2. **Dark five-column footer**:
   - **Shop**: All products · On sale · Your cart
   - **Your account**: Account · Orders · Addresses · Saved items
   - **Getting started**: Sign in · Create an account · Reset password
   - **Legal & company**: About Effy · Give feedback · Privacy policy · Terms of service · Refunds &
     returns · Delivery · Food safety & allergens · All legal documents · Delete your account
   - **Brand column**: brand mark (not a link) + "Fresh groceries and everyday essentials, brought to
     your door. One brand, one basket, one delivery."
3. Bottom line: **"© Effy"** (no year).

A **three-item value-proposition strip** exists but is switched off:
- "Browse without an account" — "The whole catalogue is open. We only ask who you are when you place
  an order."
- "One basket, one delivery" — "However many shelves your order comes from, you pay once and track it
  in one place."
- "Know before you shop" — "Set your postcode and we'll tell you straight away whether we deliver to
  you." *(⚠ a postcode checker does not exist — do not reuse this third item unless Part I's postcode
  check is built.)*

Redesign: a richer footer — **shop-by-department columns** generated from top-level categories,
accepted payment marks (Visa, Mastercard, American Express, Apple Pay, Google Pay), the newsletter
sign-up, app "Coming soon" badges, the customer contact address **hello@effyshopping.com**, and the
existing link groups. Other legal documents that exist and can be linked: Promotions terms, Cookies &
tracking, Acceptable use, EULA.

### E.7 Toasts
Bottom-centre stack, max width ~24 rem. Each toast: optional success tick, message, optional **action
link**, dismiss ×. Error tone has a red border. Toasts in use:
- **"Added to cart"** / **"Added {n} to cart"** → action **"View cart"**
- **"Removed {product name}"** → action **"Undo"**
- **"Saved"** → action **"Add to a list"**

### E.8 Analytics consent banner
Fixed to the bottom of every page until answered: "We use privacy-friendly analytics to improve Effy.
No personal data is collected." Buttons **Decline** (outlined) and **Accept** (filled). Must not cover
a sticky mobile CTA or bottom navigation.

### E.9 Checkout chrome (minimal — deliberately distraction-free)
- Header: brand mark (links home) on the left; on the right (hidden on phones): "How do you like our
  checkout? **Give us feedback**" (→ `/feedback?from=checkout`). No navigation, search or cart.
- Footer: dark bar with brand mark and "© Effy".

Redesign may add a **step indicator** (Delivery → Payment → Done) and trust marks.

### E.10 Auth chrome (split layout)
- Left: the form column, centred.
- Right (desktop only): a **brand panel** — abstract produce artwork in orange/greens over a soft green
  wash, headline **"Groceries, delivered."** and line "Sign in to track an order, keep your saved
  items, and check out faster next time."

### E.11 Bare document pages
About, legal, delete-account and 404 currently render **without the storefront header or footer** (a
gap — see Part H). The redesign should give them the storefront chrome.

---

## Part F — Screens

### F.1 Home (`/`)

**Current structure, top to bottom**
1. *(screen-reader-only H1 "Effy — groceries, delivered")*
2. **Promotions hero** — full-width band (416 / 480 / 544 px tall by breakpoint) built from **all
   advertised banners that have an image**. Each slide: full-bleed image with a left dark scrim,
   **title** (very large display type, two-line clamp), optional **subtitle**, optional **terms** line,
   and two buttons **"Shop now"** (→ `/search`) and **"See what's on sale"** (→ on-sale listing). The
   whole slide links to the banner's target. With more than one banner the slides **cross-fade every
   10 seconds** via CSS; pauses on hover/focus; no arrows or dots today. Skeleton: a pulsing block of
   the same height. If there are no banners or the read fails, the band is absent.
   - A static fallback hero exists (not currently shown): headline **"Everything you need,
     delivered"**, text "Fresh groceries and everyday essentials from one brand. Browse without an
     account — we only ask who you are when you place an order.", same two buttons, optional rotating
     photography.
   - A three-panel coloured **value strip** exists (not currently shown): **"One brand"** — "every
     product is Effy's own — no third-party sellers"; **"No account"** — "needed to browse — we ask
     who you are when you order"; **"Same day"** — "in serviced areas".
3. **"Shop by category"** — section heading with a "Shop all products" link; a horizontally scrolling
   row of up to **12** categories that have products: circular image (or the category's first letter
   as a fallback), category name. Links to `/search?category={key}`.
4. **On-sale rail** (rail key `on_sale`, title from the server) — up to **8** product tiles in a grid
   (2 / 3 / 4 / 5 columns by breakpoint), each with a save heart; centred outlined **"View all"**
   button (→ on-sale listing).
5. **"Offers"** — up to three offer panels from `inline` banners: **one large panel + two stacked
   small panels** (image with scrim, title, subtitle, terms). Each links to the banner's target or to
   its promotion detail page.
6. **Featured rail** (rail key `featured`) — same rail layout; "View all" → `/search`.
7. **Department rails** — one rail per `category:{key}` in server order; "View all" → that category's
   listing. Rails are separated by a hairline rule.
8. **"More offers"** — the next three `inline` banners (never repeats a promotion from block 5).
9. Any other rails the server sends.
10. **App promo** — tinted rounded panel: heading **"The Effy app is on its way"**, text "We're
    building Effy for iPhone and Android — the same shop, the same basket, in your pocket. It isn't in
    the stores yet. When it is, it'll be right here.", two **non-clickable "Coming soon"** badges
    (Google Play, App Store), and an image area (placeholder today).
11. **Newsletter** — heading **"Keep up with Effy"**, text "New products, seasonal picks and the
    occasional offer. No more than we'd want to receive ourselves, and you can leave whenever you
    like.", email field (placeholder `you@example.com`) + **"Subscribe"** button (pending label
    "Signing you up…"), consent line "By subscribing you agree to receive marketing emails and to our
    Privacy Policy. You can unsubscribe at any time." Result messages:
    - success: "Thanks — check your inbox and confirm to finish signing up." (field clears)
    - invalid: "That doesn't look like an email address. Mind checking it?"
    - error: "We couldn't sign you up just now. Your address is still here — try again in a moment."
12. **"Recently viewed"** rail — device-local; appears only when the visitor has viewed products.

Every section **hides itself completely when it has no content**.

**States**
- **Loading**: skeleton mirroring the real layout (category circles, then product-grid rows).
- **Empty store**: "The shelves are still being stocked" — "Our catalogue is on its way. Search is
  open if you know what you're after." → button **"Search the store"**.
- **Store unavailable**: "We couldn't load the store just now" — "This is on us, not you. Reloading
  usually sorts it — or browse all products directly." → button **"Browse products"**.

**Redesign targets for the home page** (use existing data; this is where "feels rich" is won)
- Hero **carousel with visible controls** (arrows, dots, pause), ideally hero + side promo tiles
  beside it on desktop (eBay/Kmart pattern) so the first screen already shows several things.
- A **dense category grid** (all top-level departments with imagery and tinted backgrounds), plus a
  "popular sub-categories" chip row.
- A coloured **"Deals" band** for the on-sale rail with savings emphasis (was/now, −%).
- **Offer tiles** in varied grid shapes; promo-code tiles that show the code with a copy button.
- **Department shelves** as horizontal carousels, each with a coloured header, a category image and
  sub-category chips.
- **"New arrivals"** module (products carry a `new` badge; the listing sorts by Newest).
- **Shop-by-brand** strip (brand names come from the brand facet).
- **Signed-in personal row**: "Hi {name}", Effy points balance and value, **Buy again** (from order
  history), saved-items price drops ("{n} saved items dropped in price"), default delivery address
  and who delivers there.
- **"How Effy works"** three/four-step strip (Browse freely → Add to cart → Choose a delivery window →
  Track it) and a true value strip.
- App promo, newsletter and recently viewed retained, restyled.

### F.2 Search / listing (`/search`)

One screen serves **text search**, **category listing** (`?category=`), **on-sale listing**
(`?saleOnly=true`) and **all products**. All state lives in the URL (shareable, back-button safe).

**Layout**
- **Desktop**: left **filter sidebar** (16 rem, sticky, own scroll, heading "Filters") + results
  column.
- **Mobile**: a **"Filters"** button with an active-filter count bubble opens a **bottom sheet**
  (heading "Filters", "Close", the same controls, and a primary button **"Show {total} results"**).

**Filter controls (in order)**
1. **Offers** — checkbox **"On sale"**.
2. **Price** — min and max number inputs (placeholders show the real bounds for the current result
   set, else "Min"/"Max") and a **"Go"** button. Reversed values are swapped automatically.
3. **Category** — single-select list: **"All categories"** + each category with its result count.
4. **Brand** and each **attribute facet** — multi-select checkboxes with result counts. More than 8
   options collapse behind **"Show {n} more"** / **"Show less"** (selected options stay visible).
5. Messages: "Loading filters…" · "No filters for this result set."
6. **"Clear all filters"** button when any filter is active.

**Results column**
- **Active filter chips** — one removable chip per filter (category name, each brand, each attribute
  value, "On sale", price as "$5–$20" / "From $5" / "Up to $20") + **"Clear all"**.
- **Toolbar** — results count ("1,234 results" / "1 result" / "Searching…") and a **Sort** select.
- **Product grid** — 2 / 3 / 4 columns (narrower than home rails because of the sidebar). Product
  tiles here currently have **no save heart** (gap).
- **Infinite scroll** — next page loads as the visitor nears the end; "Loading…" while fetching;
  **"That's everything."** at the end.

**States**
- Loading first page (design a grid skeleton — none exists today).
- **No results with a query**: title **"No results for "{query}""**; with filters active: "Your filters
  may be too narrow — try removing one." → **"Clear all filters"**; without: "Or browse the store by
  category." → **"Browse categories"**.
- **No query and nothing to show**: "Start typing to search".
- **Failed**: "We couldn't load results just now" — "Please try again in a moment." → **"Try again"**.

**Redesign targets**
- A **listing header**: page title that reflects context (category name / "On sale" / "Results for
  "{q}""), breadcrumb, a category banner/tint for category pages, and **sub-category chips** from the
  category tree.
- Richer filter UI: collapsible facet groups, facet search for long lists, a price range slider
  backed by the bounds (must remain usable with keyboard and as plain inputs).
- Grid density toggle (comfortable / compact) is welcome; list view optional.
- Save heart and quick add on every tile.
- A "back to top" control and a visible pagination entry for crawlers are welcome.

### F.3 Product tile (used on home, search, related, recently viewed)

**Today**: square image (rounded, zoom on hover; "No image" placeholder), **"Unavailable"** overlay
when not available, name (two-line clamp), **price** (large, bold), **was-price** struck through and a
**"−{n}%"** pill when discounted, optional **save heart** (top-right; filled when saved). The whole
tile links to the product page. The tile does **not** show the brand, the `new`/`on_sale` badges, or
an add-to-cart control today.

**Redesign must define** one tile system with variants:
- **Standard grid tile**: image, **badges** (Sale −%, New), brand, name, price, was-price, "Save $X"
  option, save heart, **quick "Add" button that becomes a − n + stepper once the item is in the cart**
  (Coles pattern), "In cart: n" indication.
- **Compact tile** (carousels, cart drawer suggestions), **list-row tile** (saved items, buy again).
- States: default, hover, focus, pressed, saved, in cart, unavailable (dimmed, no add), image missing,
  skeleton.

### F.4 Product detail (`/product/{id}`)

**Today**
- **Breadcrumb**: Home › All products › {category path…}. (Category crumbs are plain text today — they
  should be links.)
- **Gallery** (left on desktop): none → "No image" block; one → a single square image; several → a
  **thumbnail strip** (vertical on desktop, horizontal row under the image on mobile) beside a
  **swipeable, scroll-snapping main image**. Thumbnails jump to their slide. No zoom / lightbox today.
- **Buy box** (right):
  - **Brand** (small, muted) when present.
  - **Product name** (H1).
  - **Price** (very large), **was-price** struck through, **"−{n}%"** pill.
  - Short description teaser (first three lines of the description).
  - Divider.
  - **Unavailable notice** when not available: "**Currently unavailable.** Browse similar products
    below, or check back soon."
  - **Save heart** + text link **"Add to list"**.
  - **Add-to-cart control**: quantity stepper (1–99) + primary button **"Add to cart"** (cart icon;
    label becomes **"Added"** for two seconds) + when quantity > 1 a running **"Total {amount}"**.
    Adding raises the "Added to cart" toast with "View cart".
    When unavailable the whole control is replaced by a dashed notice: "This item is currently
    unavailable."
- **Description** section — full text.
- **Details** section — attribute groups, each a two-column label/value table.
- **Allergen notice**: "Allergen & ingredient information: always read the label on the physical
  product — online information may not be complete or current. See our **Food Safety & Allergen
  Notice**."
- **"You might also like"** — related products from the same category (up to 8).
- Skeleton for the whole page exists (gallery + text blocks).
- A missing product shows the 404 page.

**Redesign targets**
- Gallery with zoom / full-screen viewer and image counter.
- A stronger buy box: price block with saving in dollars and percent, badges (Sale, New), availability
  line, **delivery information block** ("Delivered by Effy in a window you choose, or by courier —
  shown at checkout for your address"; for signed-in customers the default address's coverage label),
  payment marks, Effy-points reminder for signed-in customers, links to Delivery policy and Refunds &
  returns.
- **Sticky add-to-cart bar on mobile** (price + stepper + button).
- Description / Details / Allergen & safety as **tabs or accordions** with the attributes presented as
  an eBay-style **item-specifics table**.
- More shelves at the bottom: related products, more from this brand, recently viewed, on sale now.
- "Share" control is acceptable (copy link).

### F.5 Save and lists (the watchlist)

- **Save heart** (tile, product page): toggles saved. Works for **guests** (stored on the device).
  After saving: toast **"Saved"** → **"Add to a list"**.
- **"Add to a list" dialog** (modal, ~24 rem wide): title **"Add to a list"**, **"Done"** button.
  - Loading: "Loading your lists…"
  - Failed: "We couldn't load your lists. Close this and try again."
  - **Guest**: "Lists like "Weekly Items" need an account. This item is saved on this device and will
    join your saved items when you sign in." + **"Sign in"** button (returns to the same page).
  - **Ready**: a checklist of the customer's lists (name + item count; ticking adds/removes the
    product), then **"New list"** — name field (placeholder "Weekly Items") + **"Create"** button, with
    a live counter "{n} characters left" / "{n} too many characters".
  - Refusals: "You already have a list with that name." · "A list name needs 1 to 40 characters." ·
    "You've reached the maximum number of lists. Delete one to make another." · "You've reached the
    maximum number of saved items. Remove one to save another." · "That list no longer exists." ·
    "That product is no longer available." · "That didn't go through. Please try again."

### F.6 Saved items (`/saved`, `/saved/{listId}`)

**Today**
- Page title **"Saved items"**.
- **List tabs**: one tab per list — "{name} ({count})"; the default list is named **"Saved"**; a
  **"New list"** button at the end (opens a dialog: "New list", Name field with counter, Cancel /
  Create).
- On a named list: **"Rename list"** (dialog: Name, Cancel / Save) and **"Delete list"** (dialog:
  "Delete "{name}"?" with a consequence sentence — "This list is empty." / "This list has {n} items.
  All of them are in another list too, so they stay saved." / "This list has {n} items. {m} of them
  aren't in any other list and will no longer be saved." — Cancel / **Delete list**).
- **Merge notice** after signing in: "{n} item(s) you saved before signing in were added to your saved
  items. You can remove anything you don't want below."
- **Sort**: Recently saved · Available first · By aisle.
- **"Add everything available to cart"** button (when at least one item can be bought). Result panel:
  "{n} item(s) added to your cart." and, if some were skipped, "These weren't added:" with a reason per
  item (your cart is full / no longer available / couldn't be added right now / out of stock right
  now / no longer sold).
- **Rows** (text-only today — no image): product name (link), current price, **previous price struck
  through when the price has dropped since saving**, status line (**Available now** / **Out of stock
  right now** / **No longer sold**), then **"Add to cart"** (or a link **"In your cart"** / "{n} in
  your cart"), **"Add to list"**, **"Remove"**.
- **Remove** shows an inline notice "Removed {name}." (or "… from this list.") with **"Undo"**.
- **Empty (default list)**: "Nothing saved yet" — "Tap the heart on anything you want to keep an eye
  on. We'll show you when the price drops or it comes back in stock. Saved before signing in? Those
  stay on this device until you sign in." → **"Start shopping"**.
- **Empty (named list)**: "This list is empty" — "Open any product and choose Add to list to put it
  here." → **"Browse products"**.

**Redesign targets**: image-led rows or tiles; a clear **price-drop badge** ("Price dropped — was
$X"), back-in-stock treatment, list cards with thumbnails, a lists sidebar on desktop, bulk actions.

### F.7 Cart (`/cart`)

**Today**
- Title **"Your cart"**. Two columns on desktop: lines (left) and a bordered **Order Summary** (right,
  22 rem).
- **Line**: 80 px image ("No image" fallback), name (link to product), "{price} each", optional
  **"Was {old price}"** when the price changed since adding, optional red **"Unavailable — not included
  in your total"**, quantity stepper (max 99), **"Remove"** (trash icon; toast "Removed {name}" with
  **Undo**), line total at the right.
- **"Empty your cart"** panel: "This removes every item you've added. It can't be undone." + red
  **"Empty cart"** (browser confirm: "Empty your cart? This removes everything you're about to buy.").
- **Order Summary**:
  - **Items** — subtotal
  - **{discount label} ({CODE})** — −amount (when a promo is applied)
  - **Delivery** — "Calculated at checkout"
  - **Total** — amount + small "+ delivery"
  - **Promo code**: field "Promotional code" + **"Apply"**. Applied state: "{CODE} applied — {label}" +
    **"Remove"**. Errors appear under the field in red (server-supplied reason; guest: "Sign in to use
    a promotional code."; fallback "We couldn't apply that code.").
  - Primary button **"Go to checkout →"**. When checkout is blocked the button is disabled and a red
    line explains: "Nothing in your cart is available right now." / "Add {amount} more to reach the
    {minimum} minimum." / "Your cart is empty."
  - Footnote: "Secure checkout. Sign in to complete your order."
- **Empty cart**: "Your cart is empty" — "Browse the store and add something you like." → **"Start
  shopping"**.
- The cart re-syncs when the tab regains focus.
- *(Legacy: the code can group lines under "Package 1 / Package 2" with a notice about choosing
  delivery per package. That belongs to a delivery model that no longer exists — do not design it. One
  order, one delivery choice.)*

**Redesign targets**: a proper in-page confirmation dialog for "Empty cart"; minimum-order **progress
bar** ("Add $X more to reach the $Y minimum" — data exists); savings summary ("You're saving $X");
**"Save for later"** per line (see Part I — backend support exists); recommendation shelves (on sale,
recently viewed, buy again); sticky summary / sticky mobile checkout bar; accepted-payment marks and
reassurance row; points balance teaser for signed-in customers.

### F.8 Sign-in gate
Going to `/checkout` (or any account page) as a guest redirects to `/sign-in?next=…`; the sign-in
subtitle then reads "You'll need an account to place your order. Sign in and we'll take you straight
back." After sign-in the guest cart and saved items merge into the account and the customer lands back
where they were.

### F.9 Checkout — review step (`/checkout`)

Title **"Checkout"**. Two columns on desktop: the form (left) and **Order Summary** (right).

**1. Delivery address**
- **Collapsed**: recipient name, **Default** badge, address lines, coverage line, and **"Change"**.
- **Expanded**: radio list of saved addresses (same content each) + **"Add a new address"** (inline
  address form — see F.17).
- **No addresses**: "Add an address to continue." + **"Add an address"**.
- **Coverage line** on every address: "Delivered by Effy" / "Courier delivery" / in red **"Sorry, we
  can't deliver to this address."**

**2. Delivery instructions** (shown once an address is selected)
- Heading "Delivery instructions", hint "Optional. Your driver sees this when they deliver."
- Two toggle chips: **Leave at the door** · **Meet at the door** (tap again to clear).
- **"Note for the driver"** textarea (placeholder "Gate code, which door, where to leave it"), live
  counter "{n} characters left" (250 max).
- Pre-filled from the address's saved instructions. If the customer changes them, a checkbox appears:
  **"Save to this address for next time"**.

**3. Delivery — one of three presentations**

*a) Delivered by Effy* (heading **"Delivered by Effy"**)
- **"Same-day delivery"** group: today's windows as a radio list, or a sentence ("No windows left
  today." / "We don't deliver today.").
- **"Standard delivery"** group: **day tabs** ("Fri 9 Oct", "Sat 10 Oct", …) and under the selected day
  its windows as a radio list, or "Every window on this day is taken."
- Each **window row**: radio, time range ("4 pm – 6 pm"), for today's windows a note ("Order by 2 pm" /
  "Closed"), and a surcharge at the right ("+$5.00") when the window costs extra. Closed windows are
  disabled and dimmed.
- **Nothing available at all**: a warning panel with "There are no delivery windows available in the
  next few days. Please try again later."

*b) Courier delivery* (heading **"Courier delivery"**)
- Optional warning panel (address is in Effy's area but no window is left): "There are no Effy
  delivery windows available in the next few days. We can send this order by courier instead."
- "Delivered by a courier partner."
- "Usually arrives in {estimate} — an estimate, not a guaranteed date."
- **"Courier delivery fee"** — amount.

*c) Not serviced* — no delivery section; the summary shows the refusal.

**4. Effy points** (only when the customer has usable points)
- Heading **"Effy points"**; checkbox **"Use points — you have {n} (worth {amount})"** (on by default).
- When on: **"Points to use"** number field + "of {max} you can use on this order".
- Rule: either points cover the whole order, or at least the card minimum (50¢) must remain for the
  card; the control clamps to that.

**5. Billing address**
- Switch **"Billing address same as shipping"** (on by default). When off: "Billing address" + the
  same address picker; "Choose a billing address to continue." until one is chosen.

**6. "Review your order"** — a compact list: 48 px thumbnail, name, "Qty {n}", line total.

**7. Actions** — **"← Back"** (to cart, outlined) and **"Continue to payment"** (primary, card icon;
disabled until an address is chosen, the address is serviced, a window is chosen when Effy delivers,
and billing is resolved). Errors appear in red above the buttons.

**Order Summary (right)**
- **Items** — subtotal.
- **Delivery** — a single line that reads, depending on state: "Select an address" · "Calculating…" ·
  **"Not available"** (red) · "Choose a delivery time" · the amount. Once a fee is known it is replaced
  by its **breakdown lines**: Delivery · Window surcharge · Small-order fee · **Free delivery**
  (negative, shown as a saving in green).
- **Free-delivery hint**: "Spend {amount} more for free delivery" or, in green, **"You've got free
  delivery"**.
- **Total** — full amount (or "{items} + delivery" before a fee is known).
- When points are used: **"Points ({n})" −amount** and **"To pay by card" amount**.
- When not serviced: red **"Sorry, we can't deliver to this address."**

**Messages this step can raise**
- "Choose a delivery address." · "Choose a billing address." · "Choose a delivery time to continue."
- "That delivery time is no longer available. Please choose another."
- "That delivery day is no longer available. Please choose another."
- "How this order is delivered has changed. Please check the delivery option below — you haven't been
  charged."
- "The delivery fee has changed. Please check the new total."
- "Your points balance has changed. We've updated how many you can use — please check and continue."
- "That's more points than this order costs after any discount. Use fewer points and continue."
- "Use a few fewer points so there's at least 50¢ left to pay by card, or enough points to cover it
  all."
- "A payment for this order is already in progress. Please check your orders before trying again."
- "We couldn't start payment. Please try again."

An order fully covered by points skips the payment step and goes straight to the confirmation.

**Redesign targets**: numbered/stepped sections with completed-state summaries; a **calendar-like
window picker** (day strip + time-slot grid with price and cut-off, coloured Same-day vs Standard);
clear visual difference between Effy and Courier delivery; a **free-delivery progress bar**; a points
slider with "pay with points" visual; sticky summary on desktop and a sticky total + CTA on mobile;
trust row.

### F.10 Checkout — payment step

Shown after "Continue to payment". Two columns: methods (left), amount and pay button (right, sticky,
divided by a vertical rule).

- **"← Back to checkout"** link.
- **Wallet row** (only when the device supports it): Apple Pay / Google Pay buttons (black, 48 px) with
  "One tap — no card details to type.", then a divider **"Or pay another way"**.
- **Method list** (accordion rows with a radio, icon tile, title, subtitle):
  - **Card** — "Visa, Mastercard, American Express" + network marks. Expanded content:
    - **"Your saved cards"** (when any): radio rows — network mark, "•••• 4242", "Expires 04 / 27",
      **Default** tag, remove (trash) button; an unusable card is dimmed with its reason in red; plus a
      row **"Use a new card"**.
    - **New card fields**: **Card number** (placeholder "1234 1234 1234 1234", network marks inside
      the field), **Expiry** ("MM / YY"), **Security code** ("CVC"), each with inline validation
      text; checkbox **"Save this card for next time"** (ticked by default).
  - **Pay over time** — "Split your order into instalments" (only when available for this order);
    expands to the provider's own options.
- **Right column**:
  - Label **"TOTAL DUE"**, the amount in very large type, the currency code, and "Includes GST and
    delivery. This is the exact amount we will charge."
  - **Notices**: error (red left rule + alert icon: **title** + detail) or waiting ("Your bank needs to
    approve this payment. They'll ask you to confirm, then bring you straight back here.").
  - Primary button **"Pay {amount}"** (56 px tall; "Paying…" while busy; disabled until the card
    fields are complete).
  - Lock icon + "Encrypted end to end. Effy never sees or stores your card number."
  - "By placing your order you agree to our Terms of Service, Delivery Policy and Refund & Returns
    Policy." (links open in a new tab)

**Payment failure messages** (title — detail; every detail begins "Nothing has been charged and your
basket is still here."):
- "There aren't enough funds on that card." — "… Try a different card, or one of the other ways to
  pay."
- "That card has expired." — "… Check the expiry date, or use a different card."
- "That security code doesn't match the card." — "… Check the three digits on the back and try again."
- "That card number isn't right." — "… Check the number and try again."
- "Your bank has blocked this card for now." — "… It's usually a temporary limit — try a different
  card, or contact your bank."
- "Your bank declined this card." — "… Your bank can say why. Try a different card, or one of the
  other ways to pay." / "… Try a different card, or contact your bank."
- "We couldn't take that payment." — "… Try again, or use a different payment method."
- "You came back without finishing." — "… Pick up where you left off, or pay another way."
- "We couldn't remove that card." — "Your cards are unchanged. Try again in a moment."
- Wallet: "We couldn't complete that payment. Nothing has been charged — try again, or pay by card."

**Already-paid state** (the customer returns to a paid order): "This order has already been paid" —
"Nothing further has been charged. You can view its receipt, or go back to checkout to place a new
order." → **"View receipt"** / **"Back to checkout"**.

If the held delivery window has lapsed when the customer presses Pay, the hold is renewed silently; if
the window is gone they are returned to the review step with the relevant message.

### F.11 Order confirmation (`/checkout/complete?order=`)

**Success**
- Green tick badge, eyebrow **"PAYMENT RECEIVED"**, heading **"Thank you"**.
- Left column: **Receipt document** (F.13), **addresses block** (F.14), **record-of-payment note**.
- Right column: **Arrival panel** (F.15), buttons **"Track this order"** (primary), **"Your orders"**,
  **"Keep shopping"**; **"Send the receipt again"**; "Something wrong with this order? **Get help**".
- The cart is cleared on this state only.

**Confirming** (payment not yet confirmed): dashed panel "We're confirming your payment" — "This can
take a moment. Your order will appear in your order history shortly." → "View your orders".

**Abandoned** (customer returned from the bank/provider without paying): "Your payment wasn't
completed" — "Nothing has been charged and your basket is still here. You can go back and try again, or
pay another way." → "Back to checkout" · "View your orders".

**Redesign targets**: a celebratory but tasteful confirmation (colour, illustration), a clear "what
happens next" timeline, points earned/used summary, cross-sell is not appropriate here beyond "Keep
shopping".

### F.12 Order history (`/orders`)

**Today**: title **"Your orders"**; a bordered list, each row: **order number**, "{n} item(s) ·
{status} · {Delivered by Effy | Courier delivery}", total at the right, and a **"Buy again"** link
(states: "Adding…", then "Added to your cart." / "Added to your cart. {n} item(s) couldn't be added." /
"Nothing from that order is available right now." / "We couldn't reorder that just now."). Status
words: **Paid**, **Awaiting payment**, **Payment failed**. Updates live. Skeleton: three bars.
**Empty**: "You haven't placed any orders yet." → "Start shopping".

**Redesign targets**: order cards/rows with placed date, item thumbnails strip, a **status pill and
progress** (Confirmed / Being packed / On the way / Delivered), delivery window or courier estimate,
prominent **Buy again** and **Track** buttons, filters (In progress / Delivered / Cancelled-refunded),
search by order number — *note: thumbnails, date and stage are on the order detail today, not the list
summary; flag as a small backend addition.*

### F.13 Receipt document (shared by confirmation and order detail)

A bordered document:
- **Masthead**: "**Receipt**" + green **PAID** pill; "Order **{number}**"; placed date and time
  ("8 October 2026 at 2:15 pm"). On the right the **seller identity**: trading name, legal entity name,
  ABN, registered address, support email.
- **Line items table** — columns **ITEM** (56 px image, name, "{price} each"), **QTY**, **AMOUNT**.
- **Totals** (tinted footer): Items subtotal · Discount **{CODE}** −amount · delivery fee lines
  (Delivery / Window surcharge / Small-order fee / Free delivery) · **Total paid** (large).
- **Payment lines**: "Paid with **{n} Effy points** ({amount}) and {amount} by card" · "Paid with
  **{Visa}** ending **4242**" (or "pay over time").
- **Record-of-payment note** (info icon): "This is a record of payment. Prices include GST where it
  applies. If you need a **tax invoice** for this order, request one at {support email}."
- **"Send the receipt again"** → "Sending…" → "Sent — check your inbox." Errors: "We've already sent
  this a few times recently. Check your inbox and spam folder, then try again later." / "We couldn't
  send it just now. Please try again."

### F.14 Addresses block (shared)
**Delivering to** — recipient, lines, city postcode, country. **Delivery instructions** — handover
choice and note (when present). **Billing address** — lines, or "Same as shipping".

### F.15 Arrival / progress panel (shared)

- **Effy delivery**: label "Delivered by Effy" (or "Arriving" for older orders; "Delivery 1 / Delivery
  2" when an older order has more than one promise), a coloured pill **SAME-DAY** (amber) /
  **STANDARD** (neutral) / **SCHEDULED**, and the arrival in large type (e.g. "Today, 4 pm – 6 pm",
  "Fri 9 Oct, 10 am – 12 pm").
- **Courier delivery**: label "Courier delivery", "Delivered by a courier partner." in large type,
  the estimate sentence, then **"Track your parcel** with {courier}**"** (opens in a new tab) or
  "Tracking for each parcel is sent to you by email."
- **Moved note** (staff changed the delivery): the moved sentence and, if any, the compensation
  sentence (C.2).
- **Progress track** — vertical four-step timeline: **Confirmed** ("We've received your payment") →
  **Being packed** ("Your order is being picked") → **On the way** ("Out for delivery") →
  **Delivered** ("Your order has arrived"). Completed steps are filled green, the current step is
  outlined with its note, future steps are muted.

**Redesign targets**: a bold, colourful tracker (horizontal on desktop, vertical on mobile) with
icons; an order "hero" summarising status and arrival.

### F.16 Order detail (`/orders/{id}`)

- "← Orders" back link.
- Left: **Receipt document**; **"Unavailable"** panel when items were out of stock ("This item was /
  These items were out of stock and won't be included:" + list with quantities + "You won't be charged
  for it/these — we'll refund it/them to your original payment method. **Get help** if something
  doesn't look right."); **addresses block**; **record-of-payment note**.
- Right: **Arrival / progress panel**; **Refunds panel** (heading "This order was refunded" or
  "Refunds on this order"; a row per refund with its state and amount; **Refunded** total; **You
  paid** amount; note "Refunds go back to the card or payment method you paid with, usually within a
  few business days — though when it appears depends on your bank. It may show as the original charge
  disappearing rather than as a separate credit."); **"Keep shopping"**; **Cancel**; **Send the receipt
  again**; **Report a problem**.
- **Cancel this order** (only while cancellable): button → inline confirm "Cancel this order? We'll
  refund everything you paid, including delivery, to your original payment method." → **"Yes, cancel
  it"** ("Cancelling…") / **"Keep my order"**. Failure: "We couldn't cancel that just now. Please
  contact us."
- **"Something wrong with this order?"** (paid orders): opens an inline form — **"What went wrong?"**
  textarea (placeholder "e.g. two cartons of milk were missing"), **"Which items, if it helps?"**
  checklist of the order's items, **"Send"** ("Sending…") / "Cancel". Success: "Thanks — we've got it
  and we'll look into this order. We'll be in touch about what happens next." Failure: "We couldn't
  send that just now. Please try again."
- For unpaid orders: "Something wrong with this order? **Get help**" (→ feedback).
- The page updates live as the order progresses.

**Redesign targets**: add a **"Buy again"** button and per-item "Buy again"/"View product" links
(items link to products); tabs or anchors for Items / Delivery / Payment / Help.

### F.17 Account (`/account`)

**Layout**: left sidebar (300 px, sticky) + content.
- **Identity card**: large initials avatar, full name (or "Add your name below"), email, "Member since
  {8 October 2026}".
- **Section navigation** (rows with icon, label, hint, chevron):
  | Tab | Label | Hint |
  |---|---|---|
  | personal | **Personal info** | Name, phone, email |
  | addresses | **Address book** | Where we deliver |
  | payment | **Payment methods** | Cards you've saved |
  | points | **Effy points** | Your balance and history |
  | security | **Security** | Password, sign-out |
  | privacy | **Privacy & data** | Export, delete |
  | legal | **Legal** | Policies & terms |
- Switching tabs shows a spinner "Loading this section…". Whole-page skeleton exists.
- **Orders and Saved items are not in this navigation today** (they are separate pages) — the redesign
  should unify them into one account area navigation.

**Personal info tab**
- **Email delivery notice** (only when there is a problem), one of:
  - "We can't deliver email to your address" — "Messages we send are being permanently rejected, so you
    won't receive sign-in codes, receipts or security notices at {email}" — "Update your email address,
    or write to us from another address at hello@effyshopping.com."
  - "We're having trouble reaching your email" — "Some of our recent messages could not be delivered to
    {email}" — "This often clears up on its own. If it doesn't, write to us at hello@effyshopping.com."
  - "One of our emails was reported as spam" — "To be safe we've stopped assuming we can reach {email}"
    — "If that wasn't you, or you'd like to keep receiving sign-in codes, write to us at
    hello@effyshopping.com."
- **Quick links** (three tiles): **Orders** — "Track & reorder" · **Saved items** — "Your watchlist" ·
  **On sale** — "Deals & offers".
- **Personal info** rows: **First name**, **Last name**, **Phone number** (each opens an edit dialog;
  empty values read "Not set"), **Email** ("Can't be changed"; tapping shows "Your email address is how
  you sign in, so it can't be changed here. Contact support if you need to move your account to a
  different address.").
- **Edit dialog** (modal on desktop, bottom sheet on mobile): title, optional description (phone: "We
  may use this to contact you about an order."), one field, inline error, **Cancel** / **Save**
  ("Saving…"). Closing with unsaved text asks to discard.

**Address book tab**
- Heading **"Address book"** + **"Add address"** button.
- List rows: label (**Home** / **Work** / custom) or recipient name, **Default** badge, recipient,
  address line, phone, **coverage line** (Delivered by Effy / Courier delivery / the refusal sentence);
  actions **"Set as default"** and **"Delete"**. Tapping a row edits it.
- **Empty**: "You haven't saved any addresses yet." → "Add your first address".
- **Address form** (dialog/sheet "Add address — Save a delivery address to your account." / "Edit
  address — Update this delivery address."): **Label** chips Home · Work · Other (Other reveals a
  custom text field, placeholder "e.g. Mum's place"); **Recipient name***; **Address line 1***;
  **Address line 2 (optional)**; **City***; **State / region**; **Postcode***; **Phone (optional)**;
  **"Delivery instructions for this address"** (handover chips + note; hint "Optional. Filled in for
  you at checkout whenever you choose this address."); **"Save address"** ("Saving…") / Cancel.
  Validation: "Recipient name is required." · "Address line 1 is required." · "City is required." ·
  "Postcode is required."
- **Delete dialog**: "Delete this address?" — "This removes the address from your account. Orders
  you've already placed keep their own delivery address and are unaffected." → Cancel / **Delete**
  ("Deleting…"). Deleting the default while others exist: "Set another default first" — "This is your
  default delivery address. Choose another address as your default, then you can delete this one." →
  "Got it".

**Payment methods tab**
- Heading **"Payment methods"**. Card rows: network mark, "•••• 4242", "Expires 04 / 27" (or the red
  unusable reason, row dimmed), **Default** tag, remove button.
- Note: "Effy never sees or stores your card number — only the last four digits, so you can tell your
  cards apart."
- **Empty**: "You haven't saved any cards yet. When you pay, you can choose to save your card for next
  time — it will appear here."
- **Load failed**: "We couldn't load your saved cards just now. This doesn't affect your saved cards —
  refresh the page to try again."
- Errors: "We couldn't remove that card. Your cards are unchanged — try again in a moment." / "We
  couldn't reach the server. …"
- Cards can only be added while paying (there is no "add card" here).

**Effy points tab**
- Heading **"Effy points"** — "Points are credit from Effy. Use them on anything at checkout, delivery
  included. They have no cash value."
- **Balance**: "{1,250} points · worth {$12.50}". **Expiring**: "{n} points can be used until {date}".
- **History** list: description, date ("· use by {date}" for credits), **+n** / **−n**.
- Pagination links **Newest** / **Older**.
- Empty: "You don't have any points yet. If Effy gives you points, they'll show up here." / "No older
  activity."
- Failed: "We couldn't load your points just now. Please try again in a moment."
- Updates live.
- Redesign: this deserves a **colourful rewards hero** (balance, value, expiry warning) and a clear
  "how to use points" explainer. Do not design "earn X points per dollar" — there is no earning rule;
  points are granted by Effy.

**Security tab**
- **Password** — with a password: masked dots, "Last changed {date}", **"Change password"** (dialog:
  Current password, New password, "Change password"/"Changing…"). Without a password: "You sign in with
  a code we email you — there's no password on this account. You can add one if you'd prefer to sign in
  that way." + **"Set a password"** (three-step dialog: intro "For your security, we'll email you a
  code first. Being signed in isn't enough to add a password to your account." → **"Email me a code"**;
  code entry with **"Resend code"**; "Choose a new password for your account." → **"Set password"**).
- **Sessions** — **"Sign out"** and **"Sign out on all devices"** — "Signing out on all devices ends
  every session, including this one. It can take up to an hour to take effect on other devices — if you
  think someone else has access to your account, change your password too."

**Privacy & data tab**
- **"Privacy & data"** — link to the Privacy policy.
- **Delete account** (danger zone, red-tinted panel): "Deleting removes your account, your saved items,
  your saved addresses and your personal details. We keep completed orders and payment records, because
  tax and accounting rules require it, and fraud and security signals that protect other customers — as
  set out in our privacy policy. If you have an order in progress, you'll be asked to wait until it's
  complete."
  - Checking: spinner "Checking whether your account can be deleted…"
  - **Blocked**: "You can't delete your account just yet." + per order "Order {ref} is waiting for
    payment. Finish or cancel it, then you can delete your account." / "Order {ref} is on its way.
    You'll be able to delete your account once it's complete." + "View order {ref}".
  - **Allowed**: "Your account, your saved items, your addresses and your personal details are removed.
    This can't be undone after **{date}**." · points warning "You'll also lose your **{n} Effy points
    (worth ${amount})**. Points have no cash value and can't be paid out." · **"What we need to keep,
    and why"** list (category + reason) · "To continue, we'll email a code to make sure it's really
    you." → **"Email me a code"** ("Sending…").
  - **Confirm dialog**: "Confirm it's you" — "We sent a code to {masked email}. Enter it to delete your
    account." — six-cell code input — "This deletes your account. You can't undo it once the recovery
    window closes." → Cancel / red **"Delete my account"** ("Deleting…").

**Legal tab** — "Legal" — "The documents that govern your use of Effy, and how we handle your
information." Two groups, each row "{title} — Updated {date}": **Policies & agreements** (Privacy
policy, Terms of service, Refunds & returns, Delivery policy, Promotions terms, Food safety &
allergens, Cookies & tracking, Acceptable use, EULA) and **About** (About Effy).

**Account unavailable** (`/account/unavailable`): "We can't open your account right now" — "Something
is stopping us from loading your account. If this keeps happening, get in touch and we'll sort it out."
→ "Back to the store".

**Redesign target**: an **account dashboard** landing — greeting, latest order with live status, points
balance, saved-item price drops, default address and payment, quick actions — instead of opening on a
form.

### F.18 Sign in (`/sign-in`)

Three credential routes, all ending in the same account.
- **Step "identifier"**: title **"Sign in to Effy"**, subtitle "It's good to see you again." (or the
  checkout-gate subtitle), **Email** field, primary **"Email me a code"**, text action to switch to
  password sign-in, divider "or", **"Continue with Google"** button, link **"Forgot your password?"**,
  footer "Don't have an account? **Join**". A notice can appear at the top (e.g. "Your password was
  changed, so you've been signed out everywhere. Sign in again with your new password.").
- **Step "password"**: title **"Enter your password"**, "Signing in as **{email}**", Email (read-only),
  **Password** (with show/hide), **"Sign in"**, back arrow.
- **Step "code"** (shared code step): title **"Enter your code"**, "We sent a code to **{email}**. The
  code works for 5 minutes.", label "Your code", **six separate digit cells**, primary button (label
  "Sign in"), "Didn't get it? **Resend**" (30-second cooldown between sends), "Wrong email? **Change it**".
  - Messages: "Enter the 6-digit code we emailed you." · "That's {n} of 6 digits." · "That's {n}
    digits. An Effy code is always 6." · "That code wasn't accepted. Check it and try again." · "We
    can't send another code to this address right now. Please try again later."
  - **Spent code**: title **"Let's start that again"**, "That code can't be used any more. We'll send
    you a fresh one." → **"Send a new code"**; "Wrong email? **Use a different one**".
- Google unavailable: "Google sign-in isn't available yet. For now, use your email — we'll send you a
  code."
- Field validation appears on blur and on submit (e.g. "Enter your password.").

### F.19 Create account (`/sign-up`)
- **Identifier**: title **"Create your account"**, subtitle "Start with your email — we'll do the rest
  in a moment." (or the checkout-gate variant), **Email**, terms line "By continuing you agree to
  Effy's **Terms of Service** and acknowledge our **Privacy Policy**.", primary **"Email me a code"**,
  text action to use a password instead, divider, **"Continue with Google"**, footer "Already have an
  account? **Sign in**".
- **Password**: title **"Choose a password"**, "Creating an account for **{email}**", **Password** with
  hint "At least 12 characters. Use anything you like — no special characters required." (live "{n} of
  12 characters."; error "Use at least 12 characters."), **"Create account"**.
- **Code**: the shared code step, button **"Create account"**; error "That code isn't right. Check it
  and try again."
- **Name**: title **"What should we call you?"**, "We'll use this when we say hello and when we hand
  over your order.", **First name**, **Last name**, **"Finish"**, text action **"I'll do this later"**.
  Validation: "Enter your first name." / "Enter your last name."

### F.20 Reset password (`/reset-password`)
- **Email**: title **"Reset your password"**, "Enter your email and we'll send you a code.", Email,
  **"Send code"**; "Never set a password? **Sign in with an email code instead**".
- **Code**: shared code step, button **"Continue"**.
- **New password**: title **"Choose a new password"**, "Almost done — pick something you'll remember.",
  **New password** (same hint), **"Set new password"**. On success → sign-in with the "password
  changed" notice.

### F.21 Google return (`/callback`)
A brief "signing you in" holding state; on failure: **"Sign-in didn't complete"** — "We couldn't finish
signing you in with Google. Try again, or use your email instead." → **"Back to sign in"**.

### F.22 Offer detail (`/promotions/{id}`)
Narrow article: breadcrumb (Home › Offer); wide banner image (2:1); **title**; subtitle; divider;
**"Code"** label + the code in a bordered box + **"Copy code"** button ("Copied" for two seconds);
divider; **Conditions** (or "No minimum spend") and **Availability** (or "No end date"); divider;
**"How to use it"** — "Add what you want to your cart, then enter this code in the cart to apply the
discount before you check out."; buttons **"Browse products"** and **"Go to cart"**. Skeleton exists.
Missing promotion → 404.

Redesign: a colourful coupon/voucher presentation; show eligible/related products if the promotion
targets a category (label as Part I if data is missing); an **"All offers"** index page is a welcome
addition (Part I).

### F.23 Newsletter confirmation (`/newsletter/confirm`)
- Loading: "Confirming…" — "One moment."
- Confirmed: **"You're subscribed"** — "Thanks — we'll be in touch when there's something worth
  sending." → "Start shopping".
- Expired/invalid: **"This link has expired"** — "Confirmation links last a short while and can only be
  used once. Subscribe again from the home page and we'll send a fresh one." → "Back to the store".

### F.24 Feedback (`/feedback`)
Title **"Give us feedback"** — "Found a bug, have an idea, or just want to tell us how we're doing?
Send it our way — a real person reads every message, and we'll reply if it needs one."
- **"What kind of feedback is this?"** — select: Something's broken · A suggestion · A complaint · A
  compliment · Something else. Error "Please choose a category."
- **"Your message"** — textarea (placeholder "Tell us what's on your mind…"), counter "{n}/5000". Error
  "Please tell us a little about it."
- **"How would you rate your experience? (optional)"** — five pills 1–5 + "Clear".
- **"Your name"** (optional for guests; placeholder "Jamie").
- Signed in: **"We'll reply to"** — read-only email. Guest: **"Your email (optional)"** — hint "Leave it
  if you'd like a reply. We won't use it for anything else."; error "That doesn't look like an email
  address."
- **"Send feedback"** ("Sending…").
- Errors: "Please check the highlighted fields and try again." · "You've sent us a few messages just
  now — please give it a little while before sending another." · "We couldn't send that just now. Your
  message is still here — try again in a moment."
- **Confirmation**: "Thanks — we've got it" — "A real person will read what you sent. If it needs a
  reply, we'll email you back." — "Your reference: **{CODE}**".

Redesign: this is effectively the **Help / Contact** page — design it as a help hub (common topics
linking to Delivery policy, Refunds & returns, order tracking, account) with the form below. The 1–5
rating can become a friendlier scale (keep five values).

### F.25 Legal and information pages
- **Legal index** (`/legal`): "Legal" — intro line — two groups of document rows ("{title} — Updated
  {date}").
- **Document** (`/legal/{slug}`, `/about`): title; "Version {n} · Effective {8 October 2026} ·
  **Version history**"; body rendered from structured content: headings (three levels), paragraphs,
  ordered/unordered lists, tables, bold/italic, internal and external links.
- **Version history** (`/legal/{slug}/versions`): title, "Version history", "← Back to the current
  version", then either "This is the first version of this document, effective {date}." or a list
  "Version {n} [Current] — Effective {date}".

Redesign: long-form reading layout with a sticky table of contents built from headings, a documents
sidebar, print-friendly styling.

### F.26 Delete your account — public explainer (`/delete-account`)
"Delete your Effy account" — "You can permanently delete your Effy account and the personal data
associated with it. You do not need the Effy app installed to do this." Sections: **How to delete your
account** (three numbered steps + button **"Delete my Effy account"** → the Privacy & data tab);
**What is deleted, and what we keep**; **Don't have an account?** — "If you've been browsing without
signing in, we don't hold an account for you — your saved items and basket are stored only in this
browser. You can clear them here." + **"Clear data in this browser"** → "Cleared. Your saved items and
basket in this browser are gone."; **Need help?** with a contact email.

### F.27 System pages
- **404**: "We couldn't find that page" — "It may have moved, or the link may be wrong." → **"Back to
  the store"**. Redesign: add search, popular categories and deals.
- **Storefront error**: "Something went wrong on our side" — "This is our problem, not yours. Try again
  — and if it keeps happening, come back in a few minutes." → **"Try again"**.

---

## Part G — Component inventory the design system must cover

**Foundations**: colour tokens (brand, secondary, semantic, category tints, neutrals, each with soft
tint and on-colour text), type scale (display hero / page / section / sub, body, small, caption,
price numerals with tabular figures), spacing scale, radius scale, elevation (cards/tiles flat or
lightly raised; floating layers — dialog, drawer, dropdown, toast — shadowed), borders, focus ring,
motion durations/easings, breakpoints and grid, iconography, image ratios (product 1:1, hero band,
offer large/wide, offer small/banner, promotion 2:1, category tile), illustration style for empty
states.

**Actions**: button (primary / secondary / outline / ghost / destructive / link; sizes sm, md, lg, xl;
with icon; loading; disabled; full-width), icon button, text link, quantity stepper (inline and tile
variant), add-to-cart button (idle / added / in-cart stepper), save heart (off / on / busy), copy-code
button, wallet buttons, Google button.

**Navigation**: utility/announcement bar, header (desktop, mobile, signed-out, signed-in, loading),
search bar (default, focused, with value; optional suggestions panel), department bar and mega-menu,
mobile menu drawer (two-level), mobile bottom navigation, breadcrumb, tabs (line and pill), day tabs,
section navigation (account sidebar), pagination links, footer.

**Merchandising**: hero carousel slide, promo tile (large, small, coupon-with-code), category tile
(circle and card), department shelf header, product tile (grid, compact, list row; all states), product
carousel/rail with "See all", badge set (Sale −%, New, Unavailable, Price dropped, Default, Coming
soon), price block (now / was / saving), value-proposition item, brand chip, app-promo panel,
newsletter block.

**Forms**: text input, password input with show/hide, textarea with counter, select, checkbox, radio,
switch, toggle chips (handover, address label, rating), six-cell code input, price range, field with
label / hint / error, card-number fields, inline validation and form-level error.

**Feedback**: toast (success, error, with action), inline notice (info, success, warning, error,
waiting), banner notice (email delivery problem, danger zone), empty state (with illustration + CTA),
error state, skeletons for every module, spinner/loading area, progress bar (minimum order, free
delivery), status pill (Paid, Same-day, Standard, Scheduled, attention), order progress tracker.

**Overlays**: modal dialog, confirmation dialog (destructive), bottom sheet (mobile) / responsive
modal, right drawer (cart), left drawer (menu), dropdown menu (account), filter sheet, consent banner.

**Commerce composites**: cart line, cart summary, promo-code field (idle / applied / error), address
card and picker, address form, coverage label, delivery-window picker (day tabs + slot list, with
cut-off, surcharge, closed, full-day sentence), courier delivery panel, delivery-instructions block,
points control, billing switch, order review list, payment method accordion, saved-card row, total-due
block, payment notice, receipt document, addresses block, arrival panel, refund panel, cancel and
report-a-problem blocks, order list row/card, saved-item row, list tabs and list dialogs, points
balance and history row, identity card, legal document typography.

---

## Part H — Known gaps in the current build (fix in the redesign)

1. **Navigation is too thin**: three header links; no categories in the header or mobile menu; the
   account dropdown lacks Orders, Address book, Payment methods and Points.
2. **Product tiles under-use their data**: brand and `new`/`on_sale` badges are not shown; no quick
   add; no save heart on search results.
3. **Search has no suggestions** and the search page has no loading skeleton or contextual title.
4. **Breadcrumb category crumbs on the product page are not links.**
5. **Saved-item rows have no product image.**
6. **Order history rows are text-only** (no date, thumbnails or progress).
7. **Account, orders and saved items are three separate areas** with no shared navigation; the account
   area has no search in its header.
8. **About, legal, delete-account and 404 pages have no site header or footer.**
9. **Browser-native confirm prompts** are used for "Empty cart" and "Discard your changes?" — replace
   with designed dialogs.
10. **The announcement bar and value strips are built but switched off**; the home hero has no visible
    carousel controls.
11. **The app-promo image is a placeholder.**
12. **Product page `<title>` is generic** ("Product · Effy") and the search page title duplicates the
    brand — design should specify real page titles (product name, category name, query).
13. **Two contact addresses are in use**: account notices use `hello@effyshopping.com`; the public
    delete-account page uses `support@effyshopping.com`. The customer-facing address is
    **hello@effyshopping.com** — designs should use that one.
14. **Legacy "packages" grouping** in the cart (see F.7) — do not carry forward.
15. **The account "Privacy & data" hint says "Export, delete"** but there is no data export — the hint
    should read "Delete account" unless export is built.

---

## Part I — Ideas that need new data or backend work

Claude Design may propose these, but each must be **clearly labelled "needs backend"** in the designs
and must have a graceful version of the screen without it.

- **Search suggestions / autocomplete** and popular searches.
- **Postcode / address delivery check for guests** ("Do we deliver to you?") in the header or home.
- **"Save for later" in the cart** (the backend already has set-aside and restore endpoints; no screen
  uses them yet).
- **An "All offers" index page** and promotion → eligible products.
- **"New arrivals" and "Best sellers" rails** as dedicated server rails (today only on-sale, featured
  and per-category rails exist; "Newest" sort exists).
- **Order list enrichments**: placed date, item thumbnails, stage on the summary.
- **Unit pricing** ("$2.50 per 100 g"), pack size, dietary tags and icons, country of origin as
  first-class fields (today these can only appear inside the free-form attributes table).
- **Back-in-stock / price-drop notifications** opt-in.
- **Product reviews and ratings** — explicitly out of scope unless the business decides to build them.
- **Personalised recommendations** beyond same-category related products.
- **Stock-level messaging** ("low stock") — not available.

---

## Part J — Deliverables

### J.1 Design system
- Named colour tokens with hex values, usage rules and **contrast ratios** for every text/background
  pair; the semantic role map from B.2; the category tint set.
- Typography scale, spacing, radius, elevation, motion, breakpoints, grid.
- Every component in Part G with all listed states, at phone and desktop sizes.
- Iconography and illustration guidance; image ratio specifications for every banner placement.
- A short "do / don't" page capturing C.1 (truth rules) and the cheap-vs-premium line from B.4.

### J.2 Screens (each at 390 px and 1440 px; 768 px where the layout changes materially)
- [ ] Home — guest; signed-in (personal row); loading; empty store; store unavailable
- [ ] Header states — guest, signed-in, mega-menu open, search focused, mobile menu (both levels)
- [ ] Cart drawer — empty, with items
- [ ] Listing — all products; category; on sale; text search; filters open (desktop sidebar, mobile
      sheet); active chips; loading; no results (with and without filters); error; end of results
- [ ] Product detail — available with discount; multiple images; single image; no image; unavailable;
      long attributes; loading; mobile sticky bar
- [ ] Add-to-list dialog — loading, guest, ready, creating, error
- [ ] Saved items — default list; named list; empty (both); merge notice; price drop; undo; bulk-add
      result; new / rename / delete dialogs
- [ ] Cart — with items; promo applied; promo error; price changed line; unavailable line; below
      minimum; empty; empty-cart confirmation
- [ ] Checkout review — no address; address collapsed and expanded; add-address form; Effy windows
      (today + later days, closed and surcharged windows, full day, no windows today); courier
      (out of area; no-window fallback); not serviced; points on/off/partial; billing different;
      each error message; mobile sticky total
- [ ] Checkout payment — wallet available; new card; saved cards (usable and unusable); pay over
      time; error notice; awaiting bank; already paid; paying
- [ ] Order confirmation — success (Effy delivery); success (courier); paid partly/fully with points;
      confirming; abandoned
- [ ] Orders list — with orders; buy-again result messages; empty; loading
- [ ] Order detail — each of the four stages; courier with tracking link / tracking by email; moved
      note with compensation; unavailable items; refunds (partial, full, problem); cancel confirm;
      report-a-problem form and sent state
- [ ] Account — dashboard/personal (incl. each email-delivery notice); edit dialog; address book
      (list, empty, form, delete, blocked delete); payment methods (list, empty, failed); points (with
      balance and expiry, empty, failed); security (with and without password, each dialog step);
      privacy & data (checking, blocked, allowed, code dialog); legal; account unavailable
- [ ] Auth — sign in (identifier, password, code, spent code, notices, Google unavailable); create
      account (identifier, password, code, name); reset password (email, code, new password);
      Google return failure
- [ ] Offer detail; newsletter confirmation (confirming, confirmed, expired)
- [ ] Feedback / help — form, each error, confirmation
- [ ] Legal index; legal document; version history; about; delete-account explainer
- [ ] 404; error page; analytics consent banner; toasts

### J.3 Acceptance
A design is complete when: every element and state in Part F is represented; no rule in Part C is
broken; nothing is shown that Part D does not provide (or it is labelled per Part I); all colour pairs
are documented at AA; and the home page shows at least eight visually distinct content modules above
the footer on desktop.
