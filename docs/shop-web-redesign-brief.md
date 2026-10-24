# Effy Shop Console (shop-web) — Redesign Brief for Claude Design (v1, 2026-10-24)

> **What this is.** The full inventory of what the shop console does today, and the identity it
> moves to: **the back-office identity** (the "Effy Back-Office Redesign" canvas,
> `docs/reference-screens/Effy Back-Office Redesign/`, built in `packages/design-system/src/backoffice/tokens.css`).
> The shop console currently wears the older "Effy Shop Console" theme (`packages/design-system/src/tokens.css`
> — cobalt with an orange attention hue, red for problems). After the redesign the two internal consoles
> look like one product: same colours, type, corners, icons, logo, motion and shell.
>
> **How to use it.** Paste everything from "1. What to design" to the end into Claude Design as the
> prompt, and attach the back-office canvas's *01 Foundations and shell* pages (or link the design
> project) so the shell and patterns are copied, not re-invented. Export the result to
> `docs/reference-screens/Effy Shop Console Redesign/` in numbered folders (see §9).

---

## 1. What to design

A **work console for the staff of Effy's fulfilment shops**, in a desktop browser, on a shop tablet,
and (less often) on a phone. Effy is a single-brand grocery and e-commerce delivery company. Customers
buy from "Effy" and never see a shop: **shops are hidden fulfilment nodes**. The console lets a shop's
team:

1. **See what needs doing now** (Today).
2. **Pick, pack, label and hand over orders** (Orders).
3. **Keep their products, sizes, prices, pictures and stock right** — every new product or price
   change is reviewed by Effy before customers see it (Catalog).
4. **See how the shop is doing** (Insights).
5. **Run their team, notifications and label printer** (Management, Notifications, Printing).

**Every screen, light and dark, desktop and phone.** Same information as today — this is a redesign
of how it looks and moves, not a change of what the shop may see or do. Where the current screen and
this brief disagree about *what* is shown, this brief's §6 rules win.

## 2. Who uses it, and where

- **Shop staff (`shop_staff`)** — at the shelves, picking and packing. Often on a tablet propped on a
  packing bench, or a shared shop PC with a label printer and a hand scanner. They need big targets,
  readable-at-arm's-length order numbers, and one obvious next action.
- **Shop managers (`shop_manager`)** — everything staff do, plus the team, refunds and approving
  refunds. A manager-only control is **not shown** to staff (the server refuses them anyway).
- **Effy employees or contracted partners**, signed in with a work email and a **6-digit code**
  (no passwords, no sign-up).
- **Conditions:** bright shop lighting (dark mode is popular at night), gloves sometimes, a barcode
  scanner that types into the focused field, Zebra label printers, patchy Wi-Fi. The console is an
  installable app (PWA) and sends push notifications.
- **Live, never polled:** screens update by themselves when an order, stock or attention item
  changes. No refresh buttons, no "auto-refresh every 30 s".

## 3. Visual identity (fixed — the back-office's, use these values)

Flat, calm, dense, keyboard-first. Built on **shadcn/ui** — **sidebar-07** as the frame, the
**responsive dialog** (Dialog from 768 px, Drawer below) for every overlay, TanStack Table for lists.
Reference products: Linear, Shopify admin, Stripe dashboard — but flatter.

### 3.1 Colour — five colours, light and dark

| Role | Light | Dark | Used for |
|---|---|---|---|
| background | `#ffffff` | `#09090b` | Content ground, dialogs |
| sidebar | `#fafafa` | `#111113` | The rail — one step recessed |
| card | `#ffffff` | `#111113` | Panels (bordered, never shadowed) |
| popover | `#ffffff` | `#18181b` | Menus, popovers |
| foreground | `#09090b` | `#fafafa` | Text, **and problems (with an icon)** |
| muted | `#f4f4f5` | `#27272a` | Wells, skeletons, quiet fills, table header row |
| muted-foreground | `#68686f` | `#a1a1aa` | Meta, hints, column headers |
| border | `#e4e4e7` | `#27272a` | Hairlines, table rules |
| input | `#e4e4e7` | `#3f3f46` | Field borders |
| **primary — Effy blue** | `#1d4ed8` | `#60a5fa` | **The one action colour**, focus ring, links, in-progress |
| primary-muted | `#eff4ff` | `#172554` | In-progress chips, selected rows, info notes |
| brand-mid | `#c7d7fb` | `#1e3a8a` | Fifth chart series, light accents |
| **success — Effy green** | `#0d7a40` | `#4cd97b` | Done, picked, ready, delivered, paid, live (on sale) |
| success-soft | `#ebf6ef` | `#052e16` | Done chips, success notes |
| row-hover | `#fafafa` | `#141416` | Table row hover |
| row-selected | `#eff4ff` | `#111a33` | Ticked rows |
| scrim | `rgba(9,9,11,.5)` | `rgba(0,0,0,.6)` | Behind dialogs and sheets |

**The rules that make it this identity:**
- **Blue is the only action colour.** Every primary button, link, focus ring and in-progress state.
- **Green only ever means done** (picked in full, ready, delivered, paid, live/on sale, active).
- **There is NO red and NO orange.** A problem — out of stock, can't supply, refused, offline — is
  **black (white in dark) with an icon and its words**. Attention (unread dot, "new" badge) is blue.
  ⚠ This replaces the current console's red destructive buttons and orange cut-off chips. A
  destructive confirm button is the **foreground** fill (black / white), not red.
- **No gradients. Flat fills only.** Panels have a 1 px hairline, never a shadow. Shadows only on
  floating layers (dialog, popover, sheet, dropdown, toast, chart tooltip):
  `xs 0 1px 2px /.05` · `md 0 4px 6px -1px /.1` · `lg 0 10px 15px -3px /.1` (darker in dark).
- Charts: series 1 blue, 2 green, 3 foreground, 4 muted-foreground, 5 brand-mid.
- **WCAG AA on every text pair** (the token file is guarded; don't introduce new colours).

### 3.2 Type — Geist and Geist Mono

| Sample | Spec | Role |
|---|---|---|
| Orders | 24/32 · Semibold (20 on a phone) | Page title |
| Items and fulfilment | 16/24 · Semibold | Section |
| Needs attention | 15/22 · Semibold | Panel title |
| Pick 2 × Sourdough loaf | 14/20 · Regular | Body, table cells |
| Placed today, 9:42 am | 13/18 | Meta, toolbar, column headers |
| EFY-20481 · EF-20481-2 | 13 · **Geist Mono** | Order numbers, package and bag codes, SKUs, Effy codes |
| 3 of 5 items picked | 12/16 | Sub-lines, captions |
| $64.20 | 22 · tabular figures | Counts and money in summaries |

Mono must stay monospace — codes are compared digit by digit at the scanner. Tabular figures for
every number in a column.

### 3.3 Shape, density, icons

- **Corners:** 4 (checkbox) · 6 (inputs, nav items, in-row controls) · 8 (buttons, panels) · 12
  (sheets, drawers). Badges and status chips are `rounded-full` pills; controls are never pills.
- **Density:** 32–36 px controls, 40 px table rows (row padding 10 px), 56 px header, page gutter
  32 px desktop / 24 px tablet / 16 px phone. ⚠ **On the packing screen (order detail's pick list
  and bags) targets are at least 44 px** — staff tick lines with a finger on a tablet.
- **Icons:** Lucide, 16 px in controls, 1.5–2 px stroke, `currentColor`. Never emoji.

### 3.4 Logo

The one Effy mark: a **32 px tile, 8 px corner, foreground fill, the letters "e" in background
colour with a green full stop — "e."** (Geist 700, 17 px, −0.06 em). Beside it: **"Effy"** (14 px
semibold) over **the shop's own name** (12 px muted; "Shop console" until it loads). In the icon rail
only the tile shows. The favicon, app icon and install icon are the same "e." mark (already generated
by `@effy/brand`). An environment chip ("Dev") sits right of the name in non-production, blue on
primary-muted.

### 3.5 Motion (the back-office motion board — used sparingly)

Motion explains where something went. Nothing animates while staff are reading.

| Token | Value | Used for |
|---|---|---|
| Fast | 100–150 ms | Hover, press, colour changes, leaving a dialog |
| Standard | 200 ms | Dialog in, skeleton crossfade, tab underline |
| Emphasised | 220 ms | Sidebar fold, chevrons, count roll |
| Sheet | 300 ms | Right sheet, phone drawer, menu sheet |
| Highlight | 600 ms | A row changed by a live update |
| Movement curve | `cubic-bezier(.32,.72,0,1)` | Anything that travels |
| Reduced motion | instant | Every animation off; the state change still happens; spinners keep turning slowly |

Specific moments to show on the motion page:
- **Sidebar folds to a rail** (⌘B or the header trigger): width eases 220 ms, labels fade first.
- **Sheets come from the right** (300 ms, page dims); on a phone the same content rises as a drawer.
- **Dialogs scale in** 96%→100% with a fade (200 ms), leave faster (150 ms). Focus lands on the first
  field, never on the destructive button.
- **A new order arrives:** the row slides into Live orders / the Orders table and tints blue for
  600 ms; the "New" badge stays for its first minute only. No reordering under the cursor.
- **Counts roll** to the new number (220 ms) — sidebar badges, tab counts, "3 of 5 picked".
- **Ticking a pick line:** the box fills blue with a check (150 ms); the progress meter advances.
- **Every action ends with one toast**, bottom-right (bottom on a phone), in the server's words,
  Undo only where it's real, gone after 5 s.
- **Skeletons** match the table or panel they replace and crossfade (200 ms). No plain "Loading…".
- **Live dot:** a 6 px green dot pulsing (2 s) beside "Live" in the header.

## 4. The shell

Copy the back-office shell (canvas *01 Foundations and shell*, pages 04–11) with the shop's content:

- **Sidebar (sidebar-07, 14 rem, collapsible to an icon rail):** logo block (§3.4); a search button
  "Search or jump to… ⌘K"; groups:
  - **Shop** — Today · Orders *(badge: orders awaiting pick, blue count)* · Catalog · Insights
  - **Workspace** — Management *(managers only)* · Notifications · Printing
  - Footer: the account (initials avatar, name from email, role "Manager" / "Staff", email) opening
    the **account & appearance menu**: Appearance Light / Dark / System, Notifications, Sign out.
- **Header (56 px):** sidebar trigger · breadcrumb trail (Orders › EFY-20481) · one line of live
  context ("3 waiting to be picked", "Everything is up to date", "Your shop's products") · right side:
  **Live status** (green pulsing dot + "Live", or "Offline"/"Reconnecting" in foreground with an icon),
  and on order detail only, **previous / next order** buttons that walk the list it was opened from.
- **Command palette (⌘K):** jump to any page; search orders by number, customer or bag code; search
  products by name or SKU; actions (New product, Receive stock, Print pick lists, Export orders,
  Toggle appearance). On a phone it is a full-height drawer.
- **Banners above the page, one at a time, in this order:** "You are offline." (with how old the data
  is) · "A new version of the console is ready." (Reload) · "Install Effy Shop on this device" / "Add
  Effy Shop to your home screen" (iOS: Share → Add to Home Screen) with Dismiss. Full-width strip,
  muted fill, icon, never coloured.
- **Phone (< 768 px):** the sidebar becomes a menu sheet from the left; a bottom bar holds Today ·
  Orders · Catalog · Insights · More. Tables become lists (primary cell, trailing figure, status, one
  meta line — no horizontal scroll). Every dialog becomes a bottom drawer with the primary action
  first and full width.

## 5. Patterns (from the back-office canvas — reuse, don't redraw)

- **Lists** = saved views as underline tabs with counts (kept in the URL) · search with `/` shortcut ·
  faceted filters (dashed until set, removable chips) · table · "Showing 1–25 of 148" pager ·
  a bulk bar that floats above the table when rows are ticked and reports per-row refusals.
- **Records** = a detail page with a sticky summary bar and a **decision rail** on the right; independent
  sections in shadcn **Tabs**; forms that read top to bottom stay one page.
- **Panels** = a titled section, flat with a hairline, with detail rows (label · value · Edit).
  **Never a metric tile, never a card grid** (constitution Principle V). A KPI strip is one bordered
  row of figures, not five cards.
- **Status** = a pill with a tone: in progress → blue · complete → green · waiting → outline ·
  failed/problem → black with icon · inert → grey.
- **Overlays** = responsive dialog for short confirmations; right **Sheet** (Drawer on a phone) for
  long forms. No native `confirm()`, no native selects.
- **States** = every empty, error, loading, offline and refused state says what happens next, in one
  sentence and one action.

## 6. Rules about what a shop sees and says (keep — they are product law)

- **Who takes the package is "Effy driver" or "Courier" — nothing else.** Never "same-day",
  "standard", "express", a delivery window's price, or the delivery fee. (A build check fails these
  words on a shop screen.)
- **A shop never sees** the customer's email, billing address, "customer since", points, which
  promotion applied, other shops' items or totals, delivery money, or Effy's margin. It **does** see
  the recipient's name, phone and delivery address, and "Bill to: Held by Effy with the payment."
- **A shop cannot cancel a customer's order.** The verb is **"Can't supply it"** — a reason is
  required and Effy decides the refund. Never "Cancel order".
- **No carrier, tracking number, returns, invoice, capture, edit order, duplicate or resend email.**
  The shop hands its package to Effy; that's the end of its job.
- **Package status is nine words, one look:** Preparing · Ready · With driver · At hub · Out for
  delivery · With carrier · Delivered · Problem · Cancelled (back-office foundations page shows the pill).
- **Products go on sale only when Effy approves them.** The page shows the *live* product; a pending
  change is shown separately as Now / Proposed. "Publish" for a new product is **"Submit for review"**.
- **Prices:** the shop sets **what it is paid** per size ("Your price"); **Effy sets what customers pay**
  ("Customers pay — set when approved").
- **No invented numbers:** no reserved stock, no days-of-cover bars, no conversion rate, no new
  customers, no returns, no margin, no payouts. The sign-in page shows no stats.
- **Customer-facing words:** never shown in an Effy colour other than the five above; no Effy address
  except `hello@effyshopping.com` if one is ever needed.

## 7. Screens to design (every screen in light and dark; desktop + phone for the starred ones)

### 7.1 Sign in ★
Split layout: a flat **blue panel** (primary fill, white text) with the logo, "Every order, every
shelf, one console." and three true lines — *A live order feed — pick, check and hand over in one
pass · Stock counts and low-stock alerts on every product you track · Insights on revenue, orders and
your best-selling products*. Beside it a 360 px form column: **Work email → Send code → 6 one-digit
cells** (Geist Mono, paste-friendly), resend with countdown, wrong/expired code, account not yet set
up. **No password field, no "Forgot?" link.** On a phone the form comes first and the panel shrinks
below it.

Also: **no shop assigned yet** ("Your account is set up, but no shop is linked yet — Effy will add
you") and **role-less** account states, which are not errors.

### 7.2 Today (home) ★ — "what needs doing right now"
Header: **Today** · "Monday 1 September · Melbourne" (shop's timezone city); offline adds "· last
updated 4 min ago". Actions: **Quick actions** · **Team activity** · primary **Print pick lists**
(disabled with a reason when nothing is waiting).

- **Needs attention** (left, wider) — one row per item, oldest first, each with one verb button and
  a count badge in the panel title; "Cleared items drop off automatically":
  - *3 orders awaiting pick* · "11 units to pack · oldest 1 h 12 m" → **Pick**
  - *Sourdough loaf out of stock* · "14 sold in the last 7 days, 0 on hand" → **Restock** (the problem
    tone: foreground + alert icon)
  - *Oat milk 1 L below reorder point* · "4 on hand, 2 days of cover" → **Review**
  - *Refund waiting for approval* · "EFY-20481 · $13.30" → **Approve** (managers)
  - Empty: "Nothing needs you right now".
- **Live orders** (right) — "Updating as orders arrive"; each row: order number (mono), status pill,
  "3 min ago · 4 items · Effy driver" (or "Courier collects 2:30 pm"), a **New** badge for one minute.
- **Today at a glance** — one bordered strip: Orders today · Revenue today · Awaiting pick · Units to
  pack · Average order value. (Not cards.)
- **Quick actions sheet:** New product · Receive stock (pick a product) · Print pick lists · Export
  orders (CSV of everything matching the filters) · Open the attention queue · Open insights.
- **Team activity sheet:** what the team did today, newest first ("Priya marked EFY-20481 ready ·
  10:42"), "A former team member" for people who left.
- States: loading skeleton in the shape of both panels; error with Retry; brand-new shop with no
  orders.

### 7.3 Orders — list ★
Header row: search "Search order, customer, SKU…" (`/`), **Filters** button with a count (opens a
right sheet: Placed — Any time / Today / Last 7 / Last 30 days; Payment — Paid / Refund pending /
Partially refunded / Refunded; Goes with — Anyone / Effy driver / Courier; Clear all), **Export CSV**.

- **View tabs with counts:** All · Awaiting pick · Picking · Ready · Collected · Delivered · Can't
  supply · Cancelled.
- **Table:** ☐ · Order (mono) · Customer · Items · Placed (time today, date otherwise) · Fulfilment
  (status pill) · Payment · Total (right, tabular). Sortable by order, customer, placed, total.
  Row tones: a **recent** order (< 15 min, not finished) gets a blue left rule; an **unopened** one
  ("Not opened") reads bold. Tags as small grey chips.
- **Bulk bar** (rows ticked): "N selected" · Start picking · Mark ready · Print pick lists · Tag ·
  Can't supply · Clear. Shows "Refused: EFY-…" per row that failed.
- States: "No orders yet — Orders appear here the moment a customer pays for something your shop
  supplies. This list updates by itself." · "No orders match these filters — Widen the date range,
  clear the search, or reset everything." · loading · error.
- Phone: list rows (order + total, customer, status pill, one meta line), filters in a drawer.

### 7.4 Order detail ★ — the packing screen (the most important screen)
Opening the order **is** the acknowledgement ("Acknowledging this order…" briefly).

**Sticky summary bar:** order number (mono, large) · fulfilment status pill · payment pill · placed ·
"Goes with Effy driver / Courier" · previous/next in the header · **Activity** button (opens a right
sheet with the full log) · **Print pick list**.

**Main column:**
1. **Items and fulfilment** — the priced lines *are* the pick list. Each line: a **44 px tick box**
   (four states: empty · picked ✓ blue fill · part-picked – with a foreground border · unavailable ×
   foreground), picture, name, size, SKU (mono), quantity, price, and a status line ("Picked" /
   "2 of 3 picked" / "Unavailable · damaged" / "Not picked"). **Select all / Clear all**. Per line
   **Adjust** dialog: picked count, Unavailable, note ("Optional — what happened with this line").
   Progress "3 of 5 items picked" with a thin blue meter. Primary **Fulfil 5 items** opens the hand-over
   dialog ("Check what goes in this package. An Effy driver collects it." — the customer is told
   automatically) which marks it ready.
   - "Items from other shops" is **never** shown.
2. **Bags & labels** (096) — how many bags of each temperature (**Ambient · Chilled · Frozen**,
   steppers "One more chilled bag"), one row per bag: Bag 1 · zone · code (mono) · Printed / Not
   printed / Reprint needed · Reprint · Remove bag (only the last, once printed). **Print N new labels**
   ("To Zebra ZD421" or the browser). A **scan field** — "Scan a bag label, or type its code" — ticks
   each bag as its label goes on. Changing the count after printing says "Every label will need
   printing again." Locked once bags leave: "These bags have left the shop, so they can't be changed."
   Order can't be marked ready until every bag's label is printed.
3. **Shipments** — the hand-over: "Effy driver · EFY-20481 · 5 items · Collected 2:14 pm" (no tracking).
4. **Internal notes** — append-only list (author, time), "Add note" ("Only the team sees this. It is
   added to the activity log."). Empty: "No notes on this order yet."

**Decision rail (right, narrow):**
- **Payment** — Subtotal, Discount, Refunded, Net paid (this shop's lines only), method "Visa •••• 4242".
- **State action** — exactly one forward step: **Start picking** → **Mark ready for pickup**, plus
  the single permitted reversal. Terminal states say so: "Collected — this order has left the shop
  and can no longer be changed." · "Delivered to the customer." · "The customer cancelled this order.
  Nothing more to do." · "Marked can't supply — Effy will refund the customer".
- **Refund** (managers) — right sheet: one row per line with quantity, max, line total; reason
  (Items damaged or unusable / Out of stock / Goodwill / …); "Return items to stock"; Refund total
  (a preview — the server prices it). Toast "Refund of $13.30 sent".
- **Can't supply it** — sheet with required reason (Out of stock · Items damaged or unusable · Shop
  can't open or trade · Other → words): "It leaves your queue and Effy refunds the customer for your
  items. It can't be undone." Destructive confirm = foreground fill.

**Below, full width — Customer and delivery:** recipient name + phone · Ship to (address) · Bill to
("Held by Effy with the payment.") · **Tags** (Edit → sheet with chips, "Add a tag", limit, Save) ·
**Courier pickup** when a courier collects from this shop: who, when, the label to attach, "Mark it
ready before the courier arrives.", and **Handed over to courier**.

States: loading, not this shop's order ("This order isn't available to your shop."), 409 changed
underneath (reloads, never retries), offline (read-only).

### 7.5 Catalog — list ★
Header: **Catalog** · primary **New product** · Manage sections · Stock settings.
- **View tabs:** All · Live · Drafts · Unavailable · Archived.
- Search "Search name, SKU, brand…"; facets Type · Category · Section · Review (Any / In review /
  Sent back / …) · price Min/Max; sort; removable "Filtered by" chips.
- **Table:** picture · Product (name, brand, "From $3.20") · Sizes ("One size" / "3 sizes") ·
  Category · Status pill (Live green · Draft outline · In review blue · Sent back foreground+icon ·
  Unavailable grey · Archived grey) · Buyable / Not buyable.
- **Manage sections** dialog: the shop's own sections — list, add, inline rename, delete.
- **Stock settings** dialog: the shop-wide default low-stock threshold.
- Empty, no-match, loading, error; phone list.

### 7.6 New product — a full page, six steps ★
Left **progress rail** (Product type · Basics · Sizes & prices · Image · Details · Review — done ✓,
active blue, upcoming grey), the form in the middle ("Step 2 of 6", title, one-line hint), and a
**live preview** on the right of how the product will look on the storefront. Back / Next at the
bottom; the draft is saved per person and survives a refresh.
1. **Product type** — pick from types; "The type decides which details you are asked for next."
2. **Basics** — name, brand (optional), category, short and long description, GST.
3. **Sizes & prices** — none, or up to **two options** (e.g. Size, Flavour); a table of variants, one
   row each: option values · Your price · Your code · barcode · weight · unit pricing; at least one.
   It says what is missing instead of greying Next out.
4. **Image** — one photograph, drag-and-drop with progress.
5. **Details** — the type's attributes rendered by data type (text, long text, number + unit, yes/no
   switch, single select, multi select), required ones marked.
6. **Review** — everything at a glance; **Submit for review** ("Nothing is sent to Effy until you
   press Submit for review. It goes on sale once Effy approves it."). Missing required details listed.

### 7.7 Product detail ★
Header: picture, name, status pill, "Effy code" (mono) · actions **Activity** (sheet: every stock
movement and lifecycle fact) and the two named verbs from the state machine, each confirmed with what
really happens: *Submit for review / Withdraw / Make unavailable / Make available / Archive / Restore
/ Delete draft* (drafts only — "This draft has never been on sale, so it can be permanently deleted.").

**Review panel** under the header when relevant — "Waiting for Effy to review" · "Your change is
waiting for Effy to review" (Now / Proposed rows, "Customers keep seeing and buying the product as it
is below until Effy approves") · "Effy sent this back" with Effy's reason (never a person's name) ·
Submit again / Discard.

**Tabs:**
- **Details** — Product details rows (name, brand, type, category, descriptions, GST), Attributes,
  **Sizes & prices** table (Size · Your price · Customers pay · Your code · Barcode · Weight · On sale /
  Off sale switch — off sale is immediate; "The last size on sale — make the product unavailable
  instead"), Edit opens a focused dialog per section.
- **Inventory** — a Size picker (Today deep-links to one size); rows: Units in stock now · Low-stock
  threshold · Track inventory; verbs **Receive stock** (short path: units received, note) · **Adjust
  stock** (Add or remove / Set exact count, reason: Damaged · Correction · Stocktake · Expired…, "On hand
  after this") · **Edit rules**; a **Stock for every size** table (Add received / Set count, one Save,
  per-row errors); **Stock movements** history (when, change, reason, who — shop vs Effy as its own
  column). Untracked state: "Not counted" + Start tracking.
- **Media** — 110 px thumbnails: add, set primary, reorder (drag), delete.
- **Visibility** — Storefront visibility, the shop's sections (checkbox list), placement.

### 7.8 Insights ★
One range control for the whole page: **Today · Last 7 days · Last 30 days**, plus Export CSV.
- **KPI strip** (one bordered row, not cards): Revenue · Orders · Average order value · Awaiting pick
  ("Oldest still waiting 1 h 12 m") · Unfulfilled units ("Across 3 orders"). The last two are live
  work — mark them as such (outline/blue), not as results.
- **Revenue** chart and **Order volume** chart (bars, blue; previous period comparison in muted).
- **Top products** — "By revenue, last 7 days", ranked list with a thin meter; "Nothing sold in this
  window yet."
- **Drill-through strip** — Ready for pickup · Waiting for a driver · Can't supply · Cancelled ·
  Refunds · Low stock SKUs; every cell opens the filtered list that explains it.

### 7.9 Management (managers only)
- **Team** table: Name · Email · Role (Manager / Staff, a select for managers) · Status (Active /
  Stood down) · row actions (stand down, reinstate).
- **Invite a colleague**: work email, role → Send invite ("That email belongs to someone who was stood
  down here" → reinstate instead).
- **Your shop record**: email, roles, status, subject (for support).
- Staff see the roster read-only; a non-manager opening the page gets a calm refused state.

### 7.10 Notifications
Five states on one page: not yet asked (explain + **Turn on**), on ("This device is receiving
notifications for this shop."), blocked ("Notifications are blocked in your browser." + how to fix),
unsupported, iOS-not-installed ("Add to Home Screen" first). Then **sectioned rows with a switch**:
*Orders* — New orders · *Attention* — Orders waiting to be picked · Products out of stock · Products
below reorder point · Refunds waiting for approval (managers) · Products approved by Effy · Products
sent back by Effy. Plus the **push notification itself** (desktop toast and phone banner) for a new
order and a sent-back product.

### 7.11 Printing
"How this computer prints bag labels. Every shop computer keeps its own setting." Rows: **Printer**
(Zebra found via Browser Print / "The browser's print window"; Look again) · **Printer resolution**
(203 / 300 dpi) · **Label size** (4 × 6 in (A6) for label printers; A4 = four labels per sheet) ·
**Test label** ("Prints one sample label. Nothing is recorded against an order."). Also show the
**bag label** itself (A6): EFFY or COURIER in large type, QR + Code 128, bag code (mono), "Bag 2 of 3",
zone (Ambient / Chilled / Frozen), order number — black on white only — and the **pick list** print
(A4, black and white).

### 7.12 Shared states (one example of each)
Skeleton (table and panel) · empty with one action · error with Retry · offline banner + read-only
screen · refused (403: "Your account can't see this shop's team.") · 409 "This changed — reloaded" ·
toast with Undo · confirm dialog (destructive in foreground) · right sheet · phone drawer.

## 8. Not in this app (do not design)

Customer storefront, delivery windows or fees, driver tasks or routes, maps, other shops, purchasing /
restock orders, supplier invoices, payouts, margin, promotions, customer profiles, chat, a shop
mobile app (deleted), passwords.

## 9. Deliverable

A Claude Design canvas **"Effy Shop Console Redesign"**, mirroring the back-office canvas's numbered
pages, every page in light and dark, desktop (1440) and phone (390) where starred:

```
01 Foundations and shell   colour, type, status words, patterns, motion, sidebar (expanded / rail),
                           header, ⌘K, account & appearance menu, dark, phone menu sheet, banners
02 Sign in                 email, code, errors, no-shop, role-less, phone
03 Today                   full, empty, loading, offline, quick actions, team activity
04 Orders                  list, filters sheet, bulk bar, empty/no-match, phone
05 Order detail            picking, bags & labels + scan, fulfil dialog, ready, collected, courier pickup,
                           refund sheet, can't supply, notes, tags, activity, phone
06 Catalog                 list, sections, stock settings, empty, phone
07 New product             six steps with preview, missing details, phone
08 Product detail          details, sizes & prices, inventory + dialogs, media, visibility,
                           review panel states, activity, archive/delete confirms
09 Insights                today / 7 / 30 days, empty
10 Management              team, invite, read-only, refused
11 Settings                notifications (five states), printing, the printed label and pick list
```

Export each page as `.html` + `.png` into `docs/reference-screens/Effy Shop Console Redesign/<NN name>/`.

**Implementation note (for the build, not the design):** shop-web will import
`packages/design-system/src/backoffice/tokens.css` instead of the console `tokens.css`, and reuse the
back-office shell and pattern components (`apps/back-office/src/components/{shell,patterns}`,
`styles/{primitives,shell,patterns}.css`) — lifted into a shared package rather than copied, so the two
consoles cannot drift. Features, routes, queries and every rule in §6 stay as they are.

## 10. Short version (if a one-paragraph prompt is needed)

Redesign **Effy Shop Console**, the browser console a hidden fulfilment shop's staff use to pick,
pack, label and hand over orders, keep products/sizes/prices/stock right (Effy reviews every change),
and see insights. Use **exactly the Effy Back-Office identity**: white / `#09090b` ground, `#fafafa` /
`#111113` recessed rail, zinc greys, **Effy blue `#1d4ed8` / `#60a5fa` as the only action colour**,
**Effy green `#0d7a40` / `#4cd97b` only for done**, **no red or orange** (problems are black/white
with an icon), Geist + Geist Mono, 4/6/8/12 corners, Lucide, flat, bordered panels, no cards, the
"e." logo tile, shadcn sidebar-07 + ⌘K + responsive dialogs, and the back-office motion board
(150/200/220/300/600 ms, `cubic-bezier(.32,.72,0,1)`). Screens: sign in (email + 6-digit code),
Today, Orders list, Order detail (pick list, bags & labels with scanning, fulfil, refund, can't
supply, notes, tags), Catalog, New product (six steps with live preview), Product detail (details,
sizes & prices, inventory, media, visibility, review states), Insights, Management, Notifications,
Printing — light and dark, desktop and phone. A shop only ever says "Effy driver" or "Courier", never
cancels an order ("Can't supply it"), and never sees customer email, delivery money or other shops.

## 11. Industry standards (research, 2026-10-24)

How comparable shop-side apps are built, and what this console takes from them. Canvas page **00 Industry
standards** shows the same table; screens mark every proposal that needs a server change with a dashed
**Needs backend** chip.

| Pattern | Seen in | In this console | Status |
|---|---|---|---|
| The live queue is home, by stage | Uber Eats Orders (preparing / ready / history), DoorDash tablet status filters, Deliveroo's separate completed area | Orders gets a **Queue** view for the packing-bench tablet: lanes Awaiting pick · Picking · Ready · Collected today. The table stays for the desk. | Built on what exists |
| "Needs action" first | DoorDash's Needs Action tab; Walmart Seller Center opens on Unshipped | Orders opens on **Needs action** (not opened + awaiting pick + picking), oldest first | Built on what exists |
| A new order can't be missed | Uber Eats: the screen lights up with a sound; the app must stay open to receive orders | A pinned blue **new-order alert** with a chime that repeats until someone opens it; **Sound on** in the header, with a warning when the browser mutes it | Built on what exists |
| Time on every ticket, most urgent first | Deliveroo sorts by pickup time and colour-codes; Uber shows an overdue message | **Waiting 14 min** on every open order, from its paid time; a black **Late** chip past a limit (45 min shown, the operator sets it) | Built on what exists (limit value to decide) |
| Ready-by time and who is coming | Uber shows the courier arriving with a sound; DoorDash "Ready for pickup" calls the Dasher | **Ready by 12:30 · collected on the 12:30 run · driver on the way** on the order, the queue and Today | Needs backend |
| Mark unavailable from the ticket | Uber Eats ⋯ → Out of stock beside each item; Instacart "Can't find item" always visible | A visible **Can't find** on each unpicked line, next to Adjust | Built on what exists |
| Scan to confirm the item | Instacart "Found item" then barcode scan; Scandit haptics; dark-store scan verification | **Scan an item's barcode** on the order to tick its line (`ShopOrderLineDTO.gtin` already exists); beep on match, one-line refusal on a wrong item | Built on what exists |
| Pick in walking order | Dark-store pick lists sorted by location; temperature notes on the list | Lines grouped **Ambient · Chilled · Frozen**, cold last. Items have a temperature class (065) but the shop's order line doesn't carry it yet | Needs backend (small) |
| Quick availability screen | Uber Eats Orders "Menu" tab: in or out of stock, today or indefinitely | Catalog → **Availability**: every size, its stock, an on-sale switch. Off sale is already immediate; the catalog list carries no stock, so it needs a size-level stock list | Needs backend |
| Quality, not just revenue | Uber merchant quality score: found rate, unfulfilled order rate, replacement rate, defect rate | Insights adds **Found rate**, **Can't-supply rate**, **Average time to ready** | Needs backend |
| Saved views, bulk actions, timeline | Shopify admin index tables and order timeline; Walmart bulk "Process orders" | Already in the design | Built on what exists |
| Pause / busy mode | Uber Eats Pause and Busy; Deliveroo auto-reject after 10 min | Not adopted — Effy decides fulfilment; for the operator to decide | Not adopted |
| Replacements | Uber Eats suggested replacements; Instacart "Find best match" | Not adopted — no substitution model; Effy refunds an unsupplied line | Not adopted |

**One deliberate exception to "no cards":** the Queue view's tickets are bordered tiles in lanes. Every
reference product uses order tickets for a live work queue, and a table cannot show four stages side by
side on a tablet. The tiles stay flat (hairline, no shadow); the table remains the default at the desk.

Sources:
- [Uber Eats — How to manage your orders with Uber Eats Orders](https://merchants.ubereats.com/gb/en/resources/learning-center/uber-eats-orders-app/)
- [Uber Eats — Accepting orders](https://merchants.ubereats.com/au/en/academy/orders)
- [Uber — How to optimise your item replacements](https://www.uber.com/en-AU/blog/how-to-optimise-your-item-replacements)
- [Uber — Improving your merchant quality score](https://www.uber.com/gb/en/blog/improving-your-merchant-quality-score/)
- [Uber Eats Manager overview](https://merchants.ubereats.com/ch/it/technology/simplify-operations/overview)
- [DoorDash — How do I receive and manage orders on my DoorDash tablet?](https://merchants.doordash.com/en-us/learning-center/receive-orders-on-your-doordash-tablet)
- [DoorDash — Empowers merchants with new real-time features](https://about.doordash.com/en-us/news/doordash-empowers-merchants-with-new-real-time-features)
- [Deliveroo — Better prep times and a simpler tablet experience](https://go.deliveroo.com/improved-prep-time)
- [Deliveroo — Accepting and preparing orders](https://help.deliveroo.com/en/articles/2181279-accepting-and-preparing-orders-if-you-do-your-own-delivery)
- [Instacart — Making shopping more efficient with Quick Scan](https://company.instacart.com/shopper-community/making-shopping-more-efficient-with-quick-scan)
- [Scandit — Store operations app upgrades](https://www.scandit.com/resources/guides/boost-store-efficiency-with-upgrades-to-operations-app/)
- [Walmart Seller Center — Order management dashboard](https://marketplacelearn.walmart.com/ca/guides/order-management-dashboard-in-seller-center)
- [Shopify — Fulfilling your own orders in bulk](https://help.shopify.com/en/manual/orders/fulfillment/fulfilling-orders/fulfill-your-own/bulk-fulfillment)
- [Shopify Polaris — components](https://polaris.shopify.com/components)
- [Shipsy — Dark store dispatch operations](https://shipsy.ai/insights/quick-commerce-dark-store-dispatch-operations)
- [fulfillmenttools — Picking app](https://docs.fulfillmenttools.com/documentation/apps/store-operations-app/beta-picking-android-app)

## 12. Tablet first, in the back-office style (2026-10-24)

The canvas now uses the back-office canvas's own files, unchanged (`ds/effy/*`, `bo/bo.css`,
`bo/icons-bo.css`), plus one shop layer, `shop/shop.css`. In code this means shop-web imports the
back-office identity and adds a touch layer on top; it does not get a second palette.

**Devices, in priority order**

| Device | Width | Navigation | Notes |
|---|---|---|---|
| Tablet, landscape (designed first) | 1024–1279 | Labelled rail, 96 px, icon over word | Detail pages go two-column; the queue shows four lanes |
| Tablet, portrait | 768–1023 | Bottom tab bar: Today · Orders · Catalog · Insights · More | One column; lanes scroll sideways; filters in a sheet |
| Small laptop | ≥ 1280 | The back-office sidebar, exactly | ⌘K and keyboard hints only here |
| Phone | < 768 | Bottom tab bar | Tables become rows; sheets and dialogs become drawers |

**Touch sizes** (back-office → shop): button 36 → 44, small button 32 → 40, input 36 → 44, checkbox 16 → 22
inside a 44+ row, switch 32×18 → 48×28, section tabs 36 → 48, view tabs 40 → 52, table row ≈ 44 → ≈ 60,
header 56 → 64, body text 14 → 15. New: pick line 80 with a 44 px tick, action-bar buttons 52, steppers 52.

**Rules**: every action is a visible button (no swipe-to-act, long-press or hover-only controls); the next
step sits in a bar pinned to the bottom (packing screen, new product); the Scan button is in the header on
every screen, and a hardware scanner types into whatever is open; the tab bar steps aside on the packing
screen for its action bar.

**Not built yet (frontend)**: camera scanning on a tablet with no hardware scanner — shop-web has no camera
reader today.
