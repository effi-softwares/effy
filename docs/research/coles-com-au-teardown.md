# Coles.com.au — Competitive Deep-Dive Teardown

> **Purpose.** A reference teardown of Australia's #2 grocery e-commerce site
> (`https://www.coles.com.au`), compiled to inform improvements to Effy's storefront —
> **especially the customer-web home page**. Coles runs a single-brand grocery storefront
> over hidden automated fulfilment nodes, which is structurally the same product model as
> Effy ("shops are hidden internal fulfilment nodes"), so its patterns transfer directly.
>
> **Compiled:** 2026-08-13, from four parallel research passes (features/IA/design/checkout;
> home-page composition; search/filters/categories; performance/media).

---

## ⚠️ Method & confidence caveat (read first)

`www.coles.com.au` is a **client-rendered Next.js SPA behind aggressive edge bot protection**
(Imperva Incapsula WAF + Kasada-style fingerprinting — `kpf.js`, obfuscated GUID script paths,
429 rate-limits). Every direct HTML/`__NEXT_DATA__`/`robots.txt`/`sitemap.xml` fetch returned a
**212-byte JS challenge stub or empty shell**, and `web.archive.org` / `archive.ph` are likewise
gated. **No live rendered DOM was read first-hand by any pass.**

Findings are therefore triangulated from evidence that *was* reachable, and tagged throughout:

- **[observed]** — concrete quoted evidence: HTTP response headers, the full CSP vendor manifest,
  real asset URLs surfaced by third-party scrapers/search indexes, live URL params in search
  snippets, Coles help-centre copy, urlscan data, published CrUX field data.
- **[reported]** — stated by a credible third party (scraper repos, UX teardowns: CHOICE,
  ProductReview, OzBargain, Point Hacks, Treo).
- **[inferred]** — reconstructed from strong convention where direct evidence was unreachable.

The **single richest observed artefacts** were: (a) Coles' own **placement-ID taxonomy** embedded
in every homepage link (`pid=homepage_herobanner_*` / `homepage_herotile_*`); (b) the **full CSP
header** (a ~30-vendor manifest); (c) **real product-image URLs** exposing the two-tier image
pipeline; (d) the **product data model** documented by a public scraper; and (e) **CrUX p75 field
data**. Pixel-exact measurements, exact copy strings, and the logged-in checkout flow are
**inferred** — a `claude-in-chrome` pass against a live logged-in session is the recommended next
step to confirm them.

---

## 0. Platform & tech context

| Layer | Finding | Evidence |
|---|---|---|
| **Front-end framework** | **Next.js + React** (SSR/hydration, client-rendered shoppable content) | Real image URL `/next/image?url=…&w=640&q=90` (Next image optimizer signature); `/product/`, `/browse/` route conventions **[observed/reported]** |
| **Edge / WAF / CDN** | **Imperva Incapsula** fronts the whole property (edge cache + DDoS + bot mgmt) | Headers `x-iinfo`, cookies `visid_incap_2800108`/`incap_ses_…`, `/_Incapsula_Resource?SWJIYLWA=…` **[observed]** |
| **Document caching** | HTML is `cache-control: no-cache, no-store` (personalised SSR); static assets cached separately; **HTTP/2** on every response; **HSTS** `max-age=31536000; includeSubDomains` | **[observed]** |
| **Product-image tier** | **Azure Blob Storage** origin behind **Azure Front Door** CDN, then re-optimised through `next/image` | `productimages.coles.com.au` returns `x-azure-ref`, `x-fd-int-roxy-purgeid`, `x-ms-request-id`, `x-cache: TCP_MISS` **[observed]** |
| **Content/CMS layer** | Likely **Adobe Edge Delivery Services** (Franklin/Helix) for editorial/recipes, separate from the Next.js commerce app → hybrid architecture | CSP whitelists `rum.hlx.page` (Adobe Edge Delivery RUM collector) **[observed → inferred]** |
| **Fulfilment backbone** | **Ocado Smart Platform (OSP)** — ~$400M partnership; two automated Customer Fulfilment Centres: **Truganina VIC** (87,000 m², ~3M units) and **Kemps Creek NSW**, live 2024. Marketed to customers as **"Deliver More"** with **"near-perfect orders, next-to-no substitutions."** | **[observed/reported]** |
| **Region** | Legacy `shop.coles.com.au` (cookies expiring 2020) ran on **AWS API Gateway in `ap-southeast-2` (Sydney)** behind Varnish 6.3 + section.io. **Same region Effy uses.** | urlscan **[observed]** |

**Cloud vendor note:** the product-media tier is on **Azure** (aligns with Coles' known Microsoft
partnership), while the legacy order-intake was AWS `ap-southeast-2`. Current commerce app cloud
host is not directly observable behind Incapsula.

**Strategic takeaway for Effy.** Coles' entire online edge is *automated, invisible-to-customer
fulfilment that eliminates substitutions* — structurally identical to Effy's hidden-shop model.
The real competitive battleground is **substitution rate + slot reliability**, not UI chrome.

---

## 1. Features (customer-facing)

### Account & identity
- Saved addresses, order history, saved payment methods, **cross-device sync** — *"view your
  shopping list, favourites and trolley across mobile or tablet at the same time as long as you're
  logged in."* **[observed]**
- Browsing is guest-open; an **account is effectively required to transact** (needs saved address +
  slot + order history + Flybuys). **[inferred]**

### Shopping modes
- **Home Delivery** — to the door. **[observed]**
- **Click & Collect** — free standard tier; pick up from store/locker. **[observed]**
- **Click & Collect Rapid** — collect in **60–90 min**; **$5/order** (free for members), needs order ≳ $30. **[observed]**
- **Rapid delivery** — same-day / ~2-hour slots. **[observed]**
- **"Deliver More"** — extended range + near-zero substitutions via the Ocado CFCs. **[observed]**
- **Partner delivery** — alternative windows fulfilled by **Uber / DoorDash**. **[observed]**

### Loyalty — Flybuys
- Link Flybuys → personalised offers, points balance in-app, **"activate" offers**, points earned
  online + in-store. Mechanic: **"Activate. Shop. Scan."** Members earn **double Flybuys points**
  (10× on liquor with Coles Plus). Lives under **Account → Flybuys** (`/account/flybuys`,
  `/help/flybuys`) — **not** a primary header tile; no persistent points counter in the top bar. **[observed / inferred]**

### Subscription — Coles Plus (rebranding to "Coles Plus Delivery" 2026-09-09)
- **$19/month or $199/year**, **1-month free trial**. **[observed]**
- Benefits: unlimited free delivery on **$50+** orders (incl. same-day), **double Flybuys points**,
  free Click&Collect Rapid, **timeslots visible a week earlier than non-members**, one free
  Liquorland delivery/month. **[observed]**
- Cheaper **"Coles Plus Saver"** tier also exists. Billed to card or **PayPal**. **[observed]**

### Specials / catalogue
- Weekly digital catalogue: **add catalogue specials straight to basket**, half-price cycles, and a
  **sneak peek at next week's specials**. Specials refresh **Wednesdays** (often live Tuesday
  evening), ~**3,500 items**; a given product returns to half-price roughly every 4–6 weeks.
  Catalogue routes: `/catalogues`, `/catalogues/view`. **[observed]**

### Recipes & meal planning
- Content hub at **`/recipes-inspiration`** with categories, collections, dietary filters
  (vegetarian, gluten-free, healthier-living, low-fat-per-serve) and collection pages like
  *"70+ mince recipes," "100+ slow cooker recipes."* Integrates **taste.com.au** content as
  **shoppable** recipe pages (recipe → add-all-ingredients-to-trolley). Legacy path
  `/inspire-and-create/recipes-tips-ideas` still resolves. **[observed / inferred]**

### Reorder / lists / favourites
- **"Bought before" / "Buy Again"** — reorder from purchase history. **[observed]**
- **Shopping Lists** — create lists, tick items off in-store. **[observed]**
- **Favourites** — save products, synced across devices. **[observed]**

### Substitutions
- Per-order and per-item substitution preferences; customer can opt out. Rule: *"Coles never charge
  extra for substitutes, and the substitute will always be the same or a higher cost"* — if the sub
  costs more, **you pay the ordered item's price**. CFC ("Deliver More") orders promise near-zero
  subs. Still the **most-complained-about** aspect in reviews. **[observed]**

### Delivery slot selection
- Calendar/grid of dated windows; **members see slots a week earlier**; premium/express windows
  priced higher. Help: `/help/delivery/Book-a-delivery-slot-guide`. **[observed]**

### Payments
- **Card and PayPal** confirmed; digital wallets (Apple/Google Pay) likely in-app. Payment
  orchestration via **Paydock**, with **Braintree/PayPal**, Apple Pay, Mastercard, and a long 3DS
  ACS frame list (Cardinal Commerce, Arcot, GPayments). **[observed — from CSP + teardown]**

### Produce-by-weight
- Fruit/veg ordered **by number of items, not weight**; each shows unit price **and** price/kg with
  disclaimer **"Final price is based on weight."** **[observed]**

### Other
- **Paper bag option $1.50/order** (charged even to subscribers). **[observed]**
- Priority delivery for elderly/vulnerable (COVID-era, retained). **[observed]**
- Native iOS/Android apps mirror the web feature set (lists, buy-again, Flybuys, catalogue-to-trolley, recipes). **[observed]**
- Digital receipts / order history in account. **[inferred]**

---

## 2. Site structure / information architecture

**Domain:** current storefront on the apex **`www.coles.com.au`**; legacy `shop.coles.com.au`
deprecated. **[observed/inferred]**

### Confirmed URL patterns **[observed]**

| Surface | Pattern | Example |
|---|---|---|
| Browse hub | `/browse` | `/browse` |
| Department | `/browse/{dept-slug}` | `/browse/fruit-vegetables`, `/browse/health-beauty`, `/browse/dairy-eggs-fridge`, `/browse/pantry` |
| Sub-category | `/browse/{dept}/{subcat}?page=N` | `/browse/pantry?page=3` |
| Product detail (PDP) | `/product/{human-slug}-{numericId}` | `/product/appy-fizz-250ml-8060378` |
| Search results | `/search/products?q={kw}&page=N` | `/search/products?q=milk&page=1` |
| Specials hub | `/on-special` | — |
| Specials × dept | `/on-special/{dept}` | `/on-special/fruit-vegetables` |
| Specials program | `/on-special/down-down` · `/half-price-specials` | — |
| Specials facet | `/on-special?filter_Special={value}` | `filter_Special=halfprice`, `filter_Special=onlineonly` |
| Brand landing | `/brands/{brand-slug-id}?page=N` | `/brands/coles-3955134709` |
| Catalogue | `/catalogues`, `/catalogues/view` | — |
| Recipes | `/recipes-inspiration` (+ `/category`, `/category/dietary/{diet}`, `/collections/{name}`) | — |
| Help KB | `/help/{section}/{article-slug}` | `/help/delivery/Book-a-delivery-slot-guide` |
| Membership | `/ways-to-shop/membership/coles-plus` | — |
| App | `/about/coles-app` | — |
| Optimized image | `/_next/image?url={encoded}&w={width}&q=90` | Next image CDN |

### Key IA observations
- **PDP slug = human-readable name + trailing numeric product ID** (`…-8060378`). SEO-friendly,
  stable; the numeric ID is the real key. eBay-style rich-slug PDP — a good pattern for Effy.
- **Two parallel category hierarchies** in Coles' data model: `merchandise_heir` (internal 4–5 level
  merch tree: trade profit centre → category group → category → sub-category → class) and
  `online_heirs` (customer-facing nav hierarchy with IDs). Browse tree is genuinely **multi-level**
  (department → sub-category → class), even though the URL path often shows only one or two levels
  and pushes depth into on-page facets + `?page=`. **[observed via scraper doc]**
- **Specials are a dual model:** exposed *both* as navigable landing pages (`/on-special/down-down`)
  *and* as URL facets (`filter_Special=…`) on the specials hub — good for SEO **and** in-session
  filtering.
- **Editorial (recipes) lives in its own `/recipes-inspiration/*` tree** separate from the
  transactional `/browse` + `/product` tree — a large SEO content play, likely served by the Adobe
  Edge Delivery content layer.
- **Help** is a structured `/help/{section}/{article}` knowledge base.
- Segmented sitemaps (catalogue / editorial / help) inferred from the route split. **[inferred]**

---

## 3. Design theme

### Brand colour — "Coles Red"
- Signature colour is a **vivid saturated true-red**, used for the wordmark, primary CTAs,
  price/specials flags, and header. No officially published hex; reported values:
  - **`#E50016`** (RGB 229,0,22; ~Pantone 2035 C) **[reported — BrandColorCode]**
  - **`#E72024`** **[reported — logotyp.us]**
  - Practically treat as **≈ `#E01A22`–`#ED1B24`**.
- Secondary palette (inferred): white backgrounds, near-black text, grey UI chrome, **yellow/red
  "Specials" & "½ Price" flags** (classic Australian supermarket promo idiom), green reserved for
  "in trolley"/success. **[inferred]**

### Typography
- Wordmark: modern **geometric sans-serif**. On-pack/catalogue guidelines specify **Open Sans Bold**;
  body UI is almost certainly a clean humanist sans (Open Sans family or a custom "Coles" sans). **[observed / inferred]**

### Layout & component style **[inferred from Next.js e-commerce conventions + teardown cues]**
- **Card-based product grids**; each tile: image, name, size, price, unit price, **"+ Add"** →
  quantity stepper, promo flag, favourite/heart.
- **Rounded corners**, generous white space, high-contrast red CTAs on white.
- **Sticky header** with the search bar front-and-centre, location/slot indicator, trolley icon with
  running count + subtotal.
- **Quantity steppers** rather than single add-to-cart (buy multiples fast); item-count entry for
  weighted produce.
- Utilitarian, conversion-focused; visual energy from the red brand hue + promo flags, not
  decorative imagery. Product photography on white.

### ⚠️ Direct implication for Effy's monochrome constitution
Coles carries **merchandising meaning through a hot brand hue** (red CTAs) + a coloured promo-flag
system (½ Price yellow/red, Was/Now, Down Down). **Effy's mandated monochrome ramp cannot do this
with colour** — the same signalling must be achieved through **typographic weight, size, layout, and
the two permitted semantic colours only**. Promo signalling is *load-bearing* in grocery, so this
needs explicit design attention. (Consistent with how 039/029 handled promo emphasis by weight.)

---

## 4. HOME PAGE — section-by-section composition ⭐ (priority)

> The most important section for Effy's redesign. Backbone evidence: Coles' **placement-ID
> taxonomy**, embedded in every homepage link as a `pid=` query param, which *names the
> merchandising slots explicitly*. Proportions/dimensions are **[inferred]**; the slot taxonomy and
> promo mechanics are **[observed]**.

### Observed placement IDs (the merchandising slot names)
- `pid=homepage_herobanner_half-price-specials_2703` → a **hero banner** slot
- `pid=pr_Hero_Homepage_Cust-Offer` → a **customer-offer hero** variant
- `pid=homepage_herotile_delivery` → a **hero tile** row, "Delivery" tile
- `pid=homepage_herotile_halfprice` → a **hero tile**, "Half price" tile
- `pid=campaigns_search_tile_half-price_always-on` → campaign search tiles

The **`herobanner` + `herotile` split is the backbone of the whole page**: one large rotating banner,
then a row of secondary "hero tiles."

### Vertical band order (top → bottom) **[convention, corroborated by placement IDs]**
1. **Global utility strip** — thin bar: Ways to shop, store/location, Flybuys, help, sign-in.
2. **Primary header** — logo · dominant **search bar** · fulfilment/location selector ("Delivery to 3000" / "Click & Collect") · account · **trolley** with running total.
3. **Category mega-nav** — horizontal department bar (Specials, Bakery, Fruit & Vegetables, …, + Recipes).
4. **Hero banner carousel** — full-width rotating promo (`homepage_herobanner` slot).
5. **Hero tile row** — 3–4 secondary tiles (`homepage_herotile_*`): Half price, Delivery, Click & Collect, an offer.
6. **Shop-by / ways-to-save entry band** — quick links into Specials, Half price, Catalogue, Own Brand.
7. **Personalised rails** — "Buy again" / "Your usuals" (signed-in) or "Popular products" (guest).
8. **Specials / Half-price product rail** — horizontally-scrolling product cards.
9. **Promotional tile grid** — brand/campaign banners (2–3 across).
10. **Recipe / meal-inspiration band** — shoppable recipe cards (taste.com.au integration).
11. **Coles Plus / loyalty promo band** — subscription + Flybuys.
12. **App-download band** — "Get the Coles app" (phone mockup + store badges + desktop QR).
13. **Footer** — dense multi-column link farm + legal + socials + app-store badges.

**Grid & rhythm [inferred]:** max content width ~**1200–1280px** centred, generous side gutters.
Full-bleed coloured/imagery bands alternate with white product areas. Product grids **4-up desktop /
2-up mobile**; horizontal rails show ~**4.5 cards** in viewport to hint scrollability. Large vertical
gaps (~48–64px). **The page reads as a stack of self-contained merchandising modules, each with its
own heading + "View all" affordance** — this uniform module chrome is what makes it feel polished.

### 4.1 Hero section
- **Rotating carousel** (not single static), full-width, image-led. Multiple hero variants cycle the
  same slot (half-price, customer-offer). **[observed via pids]**
- Proportions ~**2:1–3:1** letterbox desktop (~1200×450–520px), taller near-square on mobile. **[inferred]**
- Big lifestyle/product photography + overlaid text block on one side: eyebrow + headline + subcopy +
  a single filled CTA on a scrim.
- Rotating messaging: **half-price specials**, **seasonal/event** (Christmas, Easter, Back to
  school), **delivery/first-shop offers** (*"Free delivery on your first shop over $100"* — confirmed),
  **new-customer $ off**.
- CTA labels: "Shop half price", "Shop now", "Learn more", "Shop specials".
- Controls: dot indicators + arrows; autoplay with pause-on-hover.
- **Component:** `HeroCarousel` of `HeroSlide { image, eyebrow, headline, subcopy, ctaLabel, ctaHref, theme, pid }`.

### 4.2 Promotions, deals & offers (the merchandising core)
Distinct promo constructs **[observed mechanics; layout convention]**:
- **Half-Price Specials** — national brands −50%, ~3,500 items rotating weekly. Surfaced as (a) hero
  banner, (b) hero tile, (c) product rail. Card badge: **"½ Price"**.
- **Down Down** — *permanent* low prices on 2,000+ staples; iconic **red-hand / yellow "Down Down"**
  motif. Everyday-price, so it carries the Down Down badge rather than was/now.
- **Dropped & Locked** (2024) — 500+ essentials with a price-hold guarantee; lock icon.
- **Flybuys bonus points** — "10×/20× points" flagged with the Flybuys logo on cards.
- **Own Brand** — private-label promo tile/rail.
- **Catalogue teaser** — tile to the digital weekly catalogue.

**Pricing display on cards [convention, matches Coles' physical price-tag system]:**
- Big current price, **dollars large + cents superscript** (e.g. `$3⁵⁰`).
- **Unit price** underneath in grey: "$7.00 per 1kg" / "$0.35 per 100mL" / "$4.50 each" (mandated by
  AU unit-pricing law — always present via the `comparable` field).
- On specials, a **"Was $X.XX"** strike-through and/or **"Save $X.XX"**.
- Corner promo flash: ½ Price / Down Down / Special / While stocks last / New / Low Price.

**Layout:** deals appear both as **horizontally-scrolling product rails** and as a **grid of
promotional tiles** (campaign-level, 2–3 across). Every rail has a header + top-right **"View all"**.

> ⚠️ **ACCC note:** Coles' "Down Down"/"Prices Dropped" claims were subject to a misleading-pricing
> case. If Effy copies was/now + "dropped" patterns, keep price-history claims honest (Effy's 027
> promo model already counts redemptions rather than storing, which helps).

### 4.3 Ads & sponsored content
- Coles runs a **retail-media network (Coles 360)**; ad tech in the CSP includes **CitrusAd**
  (`integration.coles.citrusad.com`, `*.flavedo.io`) and **Topsort** (`*.topsort.ai`), plus The Trade
  Desk, DoubleClick, Meta pixel. **[observed]**
- **Sponsored product cards** interleave into rails/grids, labelled with a small **"Sponsored" / "Ad"**
  tag, otherwise visually identical to organic cards. The data model exposes `ad_id`, `ad_source`,
  `featured` (boolean). Sponsored brand banners also occupy the promo-tile grid. **[observed]**
- **Effy analogue:** this is the direct parallel to Effy's own 028/029 advertising facet. Reuse the
  same `ProductCard` with an optional `sponsoredLabel` slot — identical visual weight, differentiated
  only by the label.

### 4.4 Videos & rich media
- Home page is **predominantly static imagery, not autoplay video** — deliberate, for performance and
  because it's transactional. Rich media limited to: hero carousel motion; recipe cards that may carry
  a play affordance linking out to **YouTube** (`frame-src` whitelists `youtube.com`/`i.ytimg.com`) but
  not autoplaying inline; occasional subtle seasonal-campaign motion. **[inferred + observed CSP]**
- **The "polished" feel comes from photography quality + a consistent card system + generous
  whitespace, not motion.** Cheaper to build and faster than a video-heavy home.

### 4.5 Category / discovery entry points on home
- **Persistent department mega-nav** (band 3) — the full taxonomy (see §6), hover opens sub-categories.
- **"Shop by category" shortcut tiles** in the body — image+label tiles (round/rounded-square category
  photos) for one-tap department entry, scrollable on mobile, 6–8 across desktop. Mirrors the app.
- **Ways-to-shop hero tiles:** Delivery (`homepage_herotile_delivery`), Click & Collect / Rapid.
- **Component:** `CategoryShortcutRow` of `{ image, label, href }`.

### 4.6 Rails & product carousels
- Section header row: bold title left + **"View all →"** right.
- Horizontal track of product cards; ~**4.5 cards visible** desktop to signal more; **arrow buttons on
  hover** (desktop) + free-swipe on touch.
- Card contents: image (square, white bg, consistent framing) · corner promo badge · price block ($ +
  superscript cents, was/save) · grey unit price · brand + name + size (e.g. "Coles Full Cream Milk
  2L") · **"Add" button that morphs into a − qty + stepper** · optional heart/save · "limit X per
  customer". The **add→stepper transition is a signature grocery pattern**; header trolley total
  updates live.
- **Component:** `ProductRail(title, viewAllHref, items[])` + a single `ProductCard` whose
  `AddToCartControl` swaps button↔stepper on state.

### 4.7 Personalisation
- Signed-in shoppers get personalised rails **high on the page**: **"Buy again"** (reorder from
  history — the grocery power-feature), **"Your usuals"** (habitual basket), **recommended** (algo).
  Coles Plus + linked Flybuys personalises offer tiles (member pricing, auto-applied bonus points).
- Guests see **popularity-based** rails ("Popular products", "Trending this week") + offer/half-price rails.
- **Directly relevant to Effy's 033 watchlist / reserved "Buy It Again" sibling.**
- **Pattern:** feed the same `ProductRail` a personalised source when authenticated, a popularity
  source for guests — **never block the static/cacheable shell on the personalised fetch** (server
  island / deferred fetch). This maps cleanly onto Effy customer-web's PPR + Suspense-island model.

### 4.8 Footer
Dense multi-column link farm (4–6 columns):
- **Shop with us** — Delivery, Click & Collect, Rapid, Coles Plus, Gift Cards, Coles for Business.
- **Ways to save** — Specials, Half price, Catalogue, Flybuys, Coles Financial Services / insurance / mobile.
- **Our company** — About, Careers, Sustainability, Coles Group, Media/Investors.
- **Help** — Contact us, FAQs, Store locator, Product recalls, Accessibility.
- **Brands** — Liquorland, First Choice, Coles Local, etc.
- Bottom strip: **app-store badges**, social icons, region, legal (Privacy, Terms, Modern Slavery, ©).
Directly above sits the **app-download band** (`/about/coles-app`): phone mockup + store badges +
scan-to-download QR on desktop.

### ⭐ Home-page composition patterns worth copying (for Effy customer-web)
1. **One rotating hero banner + a row of 3–4 "hero tiles" beneath it.** Banner = the week's headline
   (half-price/seasonal); tiles = evergreen jobs (Half price, Delivery, Click & Collect, an offer).
   Model as **two distinct slot types** (`herobanner`, `herotile`).
2. **A tracked placement taxonomy on every promotional link** — name slots
   (`home_herobanner_half-price`, `home_herotile_delivery`) and bake a `pid`/placement into banner +
   tile components from day one → the whole page becomes measurable and data-driven.
3. **The page = a vertical stack of self-contained merchandising modules**, each = heading + "View
   all" + a rail or tile grid. **Uniform module chrome** is what reads as polished — not bespoke sections.
4. **One rigorous product-card system reused everywhere** (rails, grids, sponsored, personalised):
   big dollar/superscript-cents price, grey unit price, was/save, corner badge, Add→stepper. This
   single card is ~80% of the "merchandised" feel.
5. **A small, named promo-badge vocabulary** (½ Price / Down Down / Dropped & Locked / Special /
   Flybuys / Sponsored / New) rather than ad-hoc flashes — mirrors Effy's badge-taxonomy instinct.
6. **Personalised rails first for signed-in users** ("Buy again", "Your usuals"), degrading to
   popularity rails for guests — without blocking the static shell.
7. **Category shortcut tiles in the body**, not just the mega-nav — image+label, one-tap department entry.
8. **Retail-media / sponsored cards interleaved into organic rails**, same card + a small "Sponsored" label.
9. **A shoppable recipe/inspiration band** near the bottom — recipe → "add all ingredients" (the
   Uber-Eats-of-groceries move; fits Effy's food-first Principle V).
10. **Static, photography-led polish over autoplay video.**
11. **Loyalty/subscription band + app-download band** as the two penultimate modules before a dense footer.
12. **Fulfilment selector at the very top of the header**, gating localized pricing — coherent with a
    hidden-fulfilment model (and Effy's zone-scoped delivery).

---

## 5. Header, search, results & filters

### 5.1 Header (left → right)
Logo · category/"Browse" launcher · **dominant central search bar** · **shopping-method + location
selector** (Delivery vs Click & Collect; requires postcode/suburb to check eligibility + slots) ·
Account (menu: account details, shopping-method/location, order history, **Bought before**,
lists/favourites, Flybuys) · **Trolley** ("trolley", AU term) with count/subtotal, persistent +
account-bound + cross-device. **Sticky on scroll** and a **thin utility strip above** are inferred
(consistent with `/customer-care`, `/catalogues`, `/business`, `/about/coles-app` routes). Mobile
collapses to logo + hamburger + search + trolley; category tree → slide-in drawer. **[observed / inferred]**

### 5.2 Primary navigation / category menu
- A **"Browse" hub** at `/browse` + a header launcher; given the deep hierarchy, inferred to be a
  **flyout/drawer-driven tree** (department → aisle) rather than a broad hover mega-menu.
- **Top-level departments [observed]:** Fruit & Vegetables · Meat & Seafood · Dairy Eggs & Fridge ·
  Bakery · Deli · Pantry · Dietary & World Foods · Chips & Chocolate (snacks) · Drinks · Frozen ·
  Cleaning & Laundry (household) · Health & Beauty · Baby · Pet · Home & Garden · Tobacco. (Other
  sources also list Liquor, Special Occasion.) Plus **Recipes**.
- **At least three levels deep** (department → sub-category → class), backed by the dual
  `merchandise_heir` / `online_heirs` hierarchies.
- **Specials surfaced richly** both as landing pages (`/on-special`, `/on-special/down-down`,
  `/on-special/{dept}`, `/half-price-specials`) **and** as facets (`filter_Special=…`).

### 5.3 Search bar
- Central, dominant, persistent. Submits to **`/search/products?q={kw}&page=N`**. **[observed]**
- **Autocomplete/typeahead inferred** (search-as-you-type, term + product suggestions; the product API
  returns `id, name, brand, price, image` — raw material for a thumbnailed dropdown). Whether it shows
  recent/popular searches is **unverified**.
- ⚠️ **Known friction [reported]:** after each new query, results **revert to the default relevance
  sort** — sort preference does **not persist** across searches.

### 5.4 Search results page
- **Product grid** of tiles; **oversized images** draw "endless scrolling" criticism. **[reported]**
- Results-count copy: **"1 - 48 of {total} results"** → **48 products per page**. **[observed]**
- **Numbered/next-page pagination** via `?page=N` (not infinite scroll, not load-more). **[observed]**
- **Sort options:** default **"Best match"** (relevance), **Price low→high / high→low**, **"Best
  seller"**. ⚠️ **Coles removed "sort by lowest unit price" ($/kg, $/L)** in the redesign — a heavily
  criticised regression (**Woolworths kept it**); price sorting sometimes returns erratic order. **[reported]**
- **Sponsored results** inline, labelled "Sponsored" (`ad_id`/`ad_source`/`featured`). **[observed]**
- **Unavailable items** show **"Currently unavailable"** (`availability` bool, `availability_type`
  e.g. "InStoreAndOnline", `available_quantity`); inferred greyed with add-to-cart disabled rather
  than hidden. Help: `/help/products-unavailable-online`. **[observed]**

### 5.5 Filters / facets
- **URL-encoded facets: `filter_{FacetName}={value}`** (e.g. `filter_Special=halfprice`,
  `filter_Special=onlineonly`) — multi-selectable and **shareable/bookmarkable via URL**. **[observed]**
- **Confirmed facets:** Specials/offer-type (`filter_Special`), **Brand** (corroborated by `/brands/…`
  landing pages), **Dietary & Allergen** (Coles markets these — named examples **nut-free,
  kosher-friendly**; inferred full set: Gluten free, Dairy free, Vegan, Vegetarian, Organic, Halal,
  Kosher, Low/No sugar, Nut free — exact roster **partly inferred**).
- **Position:** inferred **left-rail on desktop**, **drawer/sheet on mobile**; chip-style applied
  filters with individual remove + "clear all". Package **size** exists in data (`size`) but no
  confirmed size *facet*; **no star ratings / rating facet** (grocery-typical absence).

### 5.6 Category landing pages
- **Curated landing pages, not raw search.** Under `/browse/{dept}/{subcat}`; same 48-per-page grid,
  plus department context: breadcrumbs (inferred Home / Dept / …), likely a category banner/hero, and
  sub-category chips/tree to drill down.
- **Category vs search:** category = scoped by the stable `online_heirs` taxonomy (merchandisable,
  SEO-indexed, curated order); search = relevance-ranked query. Specials landing pages are the
  clearest example of merchandised landing pages (a promo taxonomy layered over the catalogue,
  addressable by both path and facet).

### 5.7 Product-card anatomy (reconstructed from the live data model)
Fields present in Coles' product object **[observed via scraper]**: `id`, `name`, `brand`,
`description`, `size`, `image_uris[]`, `pricing.{now, was, unit, comparable, online_special}`,
`availability`, `availability_type`, `available_quantity`, `restrictions.{retail limit, promo limit,
age restriction, delivery restriction}`, `ad_id`, `ad_source`, `featured`, `locations` (aisle/shelf —
in-store only).

Tile layout (fields → inferred placement):
1. Product image (large).
2. **Promo badge(s)** — ½ Price · Down Down · Prices Dropped · Dropped & Locked · Online only · New ·
   Only at Coles · Flybuys member price · multi-buy. **(Coles' most distinctive card element.)**
3. Brand (small, above name).
4. Product name.
5. Size / pack.
6. **Price block:** `now` prominent; `was` struck through on special; **comparable/unit price**
   beneath (always present, AU-mandated).
7. **Quantity stepper + Add-to-trolley** (Add → −/n/+; capped by `available_quantity`/limits).
8. **Save-to-list / favourite** control (heart).
9. **Availability** state ("Currently unavailable" replaces add control).
10. **Restriction messaging** (age-restricted, per-customer limits).

The **same tile is reused everywhere** (search, category, specials, brand, "Bought before"), a single
component parameterised by these fields.

---

## 6. Category management

- **Two parallel taxonomies:** internal merch tree (`merchandise_heir`, 4–5 levels) and
  customer-facing nav (`online_heirs`, with IDs) — the browse tree is genuinely multi-level while
  URLs stay shallow and push depth into facets + pagination.
- **Top-level departments** as listed in §5.2.
- **Specials as a first-class merchandised taxonomy** layered over the catalogue — the dual
  landing-page + facet model is the standout pattern.
- Category pages are **SEO-friendly curated surfaces** (breadcrumbs, banners, sub-category chips,
  curated ordering) distinct from relevance-ranked search.

---

## 7. Performance & load-speed optimization

### Techniques observed / inferred
- **SSR + hydration** (Next.js); document served `no-cache, no-store` (personalised), static JS/CSS
  chunks cached separately. **[observed doc header / inferred SSR]**
- **Edge CDN cache + compression + TLS termination** at Imperva Incapsula for the whole property;
  **HTTP/2** on every response; **HSTS** preloaded. (HTTP/3 not confirmed.) **[observed]**
- **A dedicated, separately-cached media CDN** (Azure Front Door) decoupled from the app tier so image
  traffic never hits app compute. **[observed]**
- **Next.js automatic code-splitting / route-level chunking + lazy hydration.** **[inferred]**
- **Consent-gated + flag-gated third-party loading** — **OneTrust** (`*.onetrust.com`,
  `*.cookielaw.org`) controls when marketing/analytics tags fire; **LaunchDarkly** gates features. **[observed via CSP]**

### ⚠️ Measured field performance (CrUX p75, via Treo) **[reported]**

| Metric | p75 | Verdict | Good / NI / Poor |
|---|---|---|---|
| **LCP** | **2.4 s** | ✅ pass (<2.5s) | 75.4 / 13.0 / 11.6 |
| **CLS** | **0.45** | ❌ **fail** (<0.10) | 50.9 / 14.8 / 34.3 |
| **INP** | **300 ms** | ❌ **fail** (<200ms) | 59.8 / 25.7 / 14.5 |
| **FCP** | **1.4 s** | ✅ pass (<1.8s) | 85.8 / 10.0 / 4.3 |
| **TTFB** | **0.8 s** | ✅ borderline | 71.4 / 23.7 / 4.9 |

**Interpretation:** loading (LCP/FCP/TTFB) is **solid** — Incapsula edge + Azure media CDN + Next SSR
get first/largest paint into range. But **CLS 0.45 (≈4.5× threshold)** and **INP 300ms fail** — driven
by the **heavy ~30-vendor third-party JS load** (FullStory session replay, full Adobe suite, GA4, ad/
retail-media SDKs) competing for the main thread, plus **un-reserved dynamic slots** (banners, retail
media, consent banner, late content). **Great CDN/SSR can still be undone by tag bloat + layout shift.**

### Third-party vendor footprint (from the CSP allow-list, ~30+ origins) **[observed]**
- **Analytics/tag/experience:** Google Tag Manager, GA4, Adobe Experience Cloud (Launch/DTM,
  `edge.adobedc.net`, Audience Manager `*.demdex.net`, Analytics `*.omtrdc.net`, Advertising `*.everesttech.net`).
- **Session replay / feedback:** FullStory, Medallia (+ AU host), Kampyle.
- **Error / observability:** Sentry, Grafana.
- **Feature flags:** LaunchDarkly. **Consent:** OneTrust/CookieLaw.
- **Retail media / ads:** CitrusAd, Topsort, The Trade Desk, DoubleClick, Meta pixel.
- **Ratings & reviews:** Bazaarvoice. **Loyalty:** Flybuys.
- **Payments/3DS:** Paydock, Braintree/PayPal, Apple Pay, Mastercard, long 3DS ACS list.
- **Support/chat:** Genesys PureCloud. **Security:** hCaptcha, FraudLabs Pro, Bugcrowd.
- **B2B punchout** (`frame-ancestors`): Coupa, Unimarket, SAP S/4HANA Cloud, TechnologyOne, Epicor.

---

## 8. Image & media optimization (clearest, most reusable finding)

### Two-tier image pipeline **[observed + reported]**
1. **Origin:** `https://productimages.coles.com.au/{productId}.jpg` — **flat filename = product ID**
   (e.g. `409499.jpg`), in **Azure Blob**, fronted by **Azure Front Door** CDN.
2. **Optimizer:** app requests through **Next.js image optimizer**:
   `/next/image?url={encoded origin}&w=640&q=90`.

- **On-the-fly resize + quality:** `w=640&q=90` → Next resizes to requested width, re-encodes at
  quality 90; different slots request different `w` → **responsive `srcset`** without hand-authoring files.
- **Modern formats by content negotiation:** Next `/next/image` serves **WebP/AVIF** by `Accept`
  header. **[inferred — couldn't fetch optimised bytes behind Incapsula]**
- **q=90 is deliberately high** (crisp pack-shots over max byte savings) — a competitor can usually go
  **q=75** with negligible perceived loss.
- **Layout reservation:** known width/height via `next/image` reserves aspect-ratio boxes — though
  Coles' *overall* CLS is still poor, driven by non-image chrome (ads/banners/late content), not the grid.

Real URLs to quote:
- Optimised: `/_next/image?url=https%3A%2F%2Fproductimages.coles.com.au%2F409499.jpg&w=640&q=90`
- Origin: `https://productimages.coles.com.au/409499.jpg` (`x-azure-ref`, `x-cache: TCP_MISS`, `x-ms-request-id`)

### Other media **[observed]**
- **Fonts self-hosted** off Coles' own origin (`font-src 'self' data: blob: https:`) — no Google Fonts
  handshake. Exact family / `font-display` not observable behind Incapsula.
- **Icons:** inferred inline **SVG** components (not an icon font).
- **Video:** embedded **YouTube iframes** (`frame-src` whitelists YouTube) for marketing/recipe video —
  not self-hosted, not autoplayed inline.
- **Cloudinary** is whitelisted but the `coles` cloud is **disabled** (`x-cld-error: cloud_name coles
  is disabled`) — used by a third-party widget, **not** core product imagery.

---

## 9. Cart & checkout

> Reconstructed from teardowns + help copy (live flow not fetchable). Figures **[observed]**; flow
> specifics **[inferred]**.

### Location / fulfilment gating (front-loaded)
- Experience is **postcode/address-gated up front**: set a location (or sign in) to learn Delivery vs
  Click & Collect vs Rapid and unlock real slot availability + pricing. Fulfilment method + slot
  influence which products/prices show (CFC "Deliver More" range differs from store-pick). **[observed/inferred]**

### The trolley ("cart")
- Persistent, account-bound, cross-device; customers **build it over the course of a day** (a
  called-out benefit — reduces impulse buys). Line items with quantity steppers, per-item price, unit
  pricing, running subtotal, and progress toward the **$50 minimum** / **free-delivery** thresholds.
  Pattern: a **dedicated trolley page** + a lightweight header trolley summary/drawer. **[observed / inferred]**

### Order minimums & fees **[observed]**
- **Minimum order for delivery: $50.**
- Standard delivery fee **~$2–$11** (varies by slot demand + location).
- Express/premium window **~$15 for up to 40 items.**
- **Free delivery over $250**, any window.
- **Coles Plus:** unlimited free delivery on $50+ orders.
- **Click & Collect:** free (standard); **Rapid $5** / free for members over ~$30.
- **Paper bags: $1.50/order** (opt-in, always charged).

*(A second teardown cited a $30 minimum + $15 flat Rapid delivery + free over $100 for first shop —
figures vary by mode/promo/time; treat exact numbers as point-in-time.)*

### Substitution preferences
- Global and/or per-line-item opt-in/out. Subs are **same-or-higher quality/size at no extra charge**
  — if the sub costs more, you pay the ordered item's price. CFC "Deliver More" orders near-sub-free. **[observed]**

### Slot selection
- **Dated grid of windows**; premium windows cost more; **members see a week further out**. Chosen as
  part of checkout, often **before** final payment (slot affects fee). **[observed]**

### Payment & order review
- Review: itemised trolley, substitution summary, chosen slot, address, fees, estimated total.
  Payment: **card or PayPal** (+ likely saved cards/gift cards/wallets in-app). **[observed: card/PayPal]**
- ⚠️ **Two-stage charge quirk:** because weighted produce and any subs finalise **at pick time**, the
  **final charge can differ from the placement total** — a documented customer pain point. **[observed]**

### Upsells
- **"Buy Again / Bought before"** + specials surfaced during the shop and near checkout;
  **"add catalogue specials straight to basket"**; recipe→ingredients cross-sell. **[observed / inferred]**

### Guest vs account
- **Account effectively required to transact**; browsing is guest-open. **[inferred]**

### ⚠️ Known UX weaknesses (from reviews — "don't repeat these")
- **Substitutions** — wrong/missing items, the top complaint (CFCs are Coles' fix).
- **Delivery reliability** — late/cancelled/wrong-address reports.
- **Post-order price changes** confuse customers.
- CHOICE test: only **57 of 62 items** arrived correctly or acceptably substituted.
- **Removed unit-price sorting** and **non-persistent sort** are recurring complaints.

---

## 10. Cross-cutting takeaways for Effy

1. **URL model to emulate:** `/browse/{category}` (flat, facet-driven, `?page=`) +
   `/product/{human-slug}-{numericId}` — SEO-rich, stable numeric IDs, eBay-like PDP slugs. Matches
   Effy's food-first + rich-product-entity doctrine (Principle V).
2. **Next.js parity + the image pipeline is directly portable:** Coles runs the same framework family
   as Effy's `customer-web` (Next 16). Adopt the **two-tier image pipeline** — cheap object storage
   (Effy already presigns S3) behind a CDN origin + `next/image` `remotePatterns`; set
   `images.formats = ['image/avif','image/webp']`; **tune quality to ~75** (Coles ships a heavy 90);
   flat ID-based origin keys for trivial cache/purge; mark only the LCP hero `priority`, lazy-load the
   rest.
3. **Home page = tracked, uniform merchandising modules.** Adopt the herobanner+herotile split, a
   placement-`pid` on every promo link, one rigorous product-card, a named promo-badge vocabulary, and
   personalised-first-then-popularity rails on a non-blocking server island. (See §4 patterns list.)
4. **Merchandising via colour is Effy's hardest gap.** Coles carries promo meaning through red CTAs +
   coloured flags; Effy's **monochrome ramp** must replace that with **weight/typography/layout** and
   the two permitted semantic colours — promo signalling is load-bearing in grocery, so design it
   deliberately (consistent with how 039/029 did emphasis by weight).
5. **Beat Coles where its field data fails — CLS & INP, not raw load.** Reserve space for every dynamic
   slot (explicit width/height/aspect-ratio on images **and** banners/ad containers; consent as a
   non-reflowing overlay); budget third parties ruthlessly (`next/script` `strategy="lazyOnload"`/worker,
   defer non-critical SDKs to idle/interaction; keep the hydration bundle small with RSC). Coles carries
   30+ third-party origins — every one costs INP/CLS. This is the single biggest competitive opening,
   and Effy's lean guest-bundle discipline (160–174 KB gates) already leans this way.
6. **Hidden-fulfilment strategy is validated** — Coles' whole online edge is automated, invisible-to-
   customer fulfilment (Ocado CFCs) that **eliminates substitutions**, directly analogous to Effy's
   hidden-shop model. The competitive battleground is **substitution rate + slot reliability**, not UI.
7. **Dual specials model** (browsable landing pages **and** URL facets) + **URL-encoded multi-select
   facets** (`filter_Name=value`) are clean, shareable, SEO-friendly patterns to copy.
8. **Two things to beat Coles on (its own users complain):** keep **unit-price sorting** ($/kg, $/L),
   and **persist sort/filter state** across searches instead of resetting to relevance.
9. **Weighted-produce + two-stage charge** is a real UX trap: order-by-item with price/kg,
   authorise-then-capture, explicit "final price based on weight/subs" copy.
10. **Subscription lever (Coles Plus, $19/mo)** bundles free delivery + loyalty multipliers + early slot
    access — a proven retention mechanic if Effy ever adds delivery.

---

## 11. Recommended next step

For pixel-exact design tokens, exact copy strings, autocomplete-dropdown contents, header stickiness,
and the real logged-in checkout flow — all currently **[inferred]** because the live DOM is
bot-gated — run a **`claude-in-chrome` browser-automation pass against a logged-in Coles session**.
That would confirm the §3 component details, §5.3 typeahead, and the entire §9 checkout flow
first-hand.

### Unverified / lower-confidence items (flagged for that pass)
Exact brand hex, font family + `font-display`, search placeholder copy, autocomplete contents
(recent/popular/thumbnails), header stickiness, utility-bar exact contents, mobile drawer specifics,
the full dietary-filter label roster, whether *filters* (vs sort) persist, HTTP/3 support, and
optimised-image byte formats.
