# Screen index - reference → current implementation

Every screen in `docs/reference-screens/Effy Storefront Redesign/` (139 files; the reference's own
index says 138 - it does not count itself consistently), numbered, with what it maps to in
`apps/customer-web` today. Paths in the "Today" column are relative to `apps/customer-web/app`.

**Work**

| Code | Meaning |
| --- | --- |
| **R** | Restyle - the page and its data exist; new look, same structure |
| **L** | Re-layout - the data exists; the page is restructured |
| **N** | New screen or state - built from data the platform already serves |
| **B** | Needs backend - a new or extended route (see "Backend needed" at the end) |
| **S** | Provider-drawn (Stripe) - we theme it, we do not build it |
| **-** | Reference only (handoff note); nothing to build |

Width: **D** desktop (1440), **P** phone (~390).

## 0. Shared components (6)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| S1 | Storefront header | D | `(shop)/_components/StorefrontChrome.tsx`, `InfoBar`, `HeaderSearch`, `PrimaryNav`, `CartBadge`, `components/header/*` | **L** + **B** (delivery bar answer, points in header) |
| S2 | Storefront footer | D | `(shop)/_components/StorefrontFooter.tsx`, `NewsletterForm`, `StoreBadges` | **R** |
| S3 | Checkout header | D | `checkout/_components/CheckoutHeader.tsx`, `CheckoutFooter.tsx` | **R** (3-step indicator) |
| S4 | Product card | D | `(shop)/_components/ProductCard.tsx`, `AddToCartControl`, `SaveControl` | **L** (Add → stepper in place, badges) |
| S5 | Account navigation | D | `(account)/account/AccountTabs.tsx`, `tabs.ts` | **L** (tabs → sidebar, one page per section) |
| S6 | Auth card template | D | `(auth)/layout.tsx`, `_components/AuthKit.tsx`, `BrandPanel.tsx` | **L** (art panel left, one 400px form column right; form only below `lg`) |

## 1. Home (12)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| H1 | Home - signed in | D | `/` · `(shop)/page.tsx`, `home-data.ts`, `home-composition.ts`, `Hero`, `OffersPanels`, `CategoryStrip`, `ProductRail`, `RecentlyViewedRail`, `AppPromo` | **L** + **N** shortcuts row (order in progress, points, price drops, buy again), **N** Shop by brand |
| H2 | Home - guest | D | same | **L** |
| H3 | Home - loading | D | none (streamed) | **N** skeleton |
| H4 | Home - empty store | D | partial (empty rails are dropped) | **N** |
| H5 | Home - store unavailable | D | `(shop)/error.tsx` | **N** |
| H6 | All aisles mega menu | D | `PrimaryNav.tsx`, `CategoryChips.tsx` | **N** |
| H7 | Search suggestions (Command) | D | `HeaderSearch.tsx` (plain field) | **B** |
| H8 | Account dropdown | D | `components/header/AccountMenu.tsx`, `account-links.ts` | **L** |
| H9 | Cart drawer (Sheet) | D | `(shop)/_components/MiniCart.tsx` | **L** |
| H10 | Home - phone | P | `/` | **L** + bottom bar **N** |
| H11 | Menu sheet - phone | P | `MobileNav.tsx`, `MobileNavIsland.tsx` | **L** |
| H12 | Cart drawer - phone | P | `MiniCart.tsx` | **L** |

## 2. Browse & search (9)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| B1 | Category - Dairy & eggs | D | `/search?category=…` · `(shop)/search/page.tsx`, `SearchExperience.tsx`, `filters/FilterControls.tsx` | **L** (filter sidebar, sub-aisle chips, breadcrumb) |
| B2 | Search results | D | `/search?q=…` | **L** |
| B3 | On sale | D | `/search?saleOnly=true` | **L** |
| B4 | Search - loading | D | partial | **N** skeleton |
| B5 | Search - no results | D | exists | **R** |
| B6 | Search - error | D | `(shop)/error.tsx` | **N** in-page error |
| B7 | Category - phone | P | same | **L** |
| B8 | Filters sheet - phone | P | `FilterControls.tsx` | **L** |
| B9 | No results - phone | P | same | **R** |

## 3. Product & offers (7)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| P1 | Product detail (single page, no tabs) | D | `/product/[id]` · `(shop)/product/[id]/page.tsx`, `ProductGallery`, `Display`, `RelatedProducts`, `RecordView` | **L** + **N** "who delivers / your points" panel, "More from {brand}" rail |
| P2 | Product - unavailable | D | same | **R** |
| P3 | Offer detail | D | `/promotions/[id]` · `(shop)/promotions/[id]/page.tsx`, `PromoHero`, `CopyCodeButton` | **L**; "Products in this offer" **held** - a promotion is a whole-cart code with no product scope (research D7) |
| P4 | Offers index | D | none | **B** (`/offers`) |
| P5 | Add to a list (Dialog) | D | `AddToListButton.tsx`, `ListChooser.tsx` | **R** |
| P6 | Product - phone | P | same as P1 | **L** (sticky add bar) |
| P7 | Offer - phone | P | same as P3 | **L** |

## 4. Saved items (6)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| V1 | Saved items | D | `/saved` · `(account)/saved/page.tsx`, `SavedList.tsx`, `ListTabs.tsx` | **L** (inside account frame) |
| V2 | Named list | D | `/saved/[listId]` | **L** |
| V3 | Saved - empty | D | exists | **R** |
| V4 | New list (Dialog) | D | `ListTabs.tsx` | **R** |
| V5 | Delete list (Alert dialog) | D | exists | **R** |
| V6 | Saved - phone | P | same | **L** |

## 5. Cart (6)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| C1 | Cart | D | `/cart` · `(shop)/cart/page.tsx`, `PromoField.tsx`, `components/delivery/*` | **L** + **N** Save for later (routes exist: `cart/items/{id}/set-aside`, `cart/saved/*`), **N** "On sale now" and "Buy again" rails, points note |
| C2 | Cart - below minimum | D | exists (cart policy) | **R** |
| C3 | Cart - empty | D | exists | **L** (+ rails) |
| C4 | Empty cart (Alert dialog) + toast | D | none | **N** (confirm + undo) |
| C5 | Cart - phone | P | same | **L** |
| C6 | Empty cart - phone | P | same | **L** |

## 6. Checkout & Stripe payment (19)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| K1 | Checkout - same-day window | D | `/checkout` · `checkout/CheckoutFlow.tsx`, `AddressPicker`, `EffyWindowOptions`, `DeliveryInstructions`, `PointsControl`, `BillingSection` | **L** |
| K2 | Checkout - standard window | D | `EffyWindowOptions.tsx` | **L** (day strip + window grid) |
| K3 | Checkout - courier only | D | `CourierDelivery.tsx` | **R** |
| K4 | Checkout - address not serviced | D | `AddressPicker.tsx` (refusal sentence) | **R** |
| K5 | Add address (Dialog) | D | `(account)/addresses/_components/AddressFormModal.tsx` | **R** |
| K6 | Payment - saved card | D | `checkout/PaymentStep.tsx`, `_payment/SavedCards`, `MethodList` | **L** + **S** |
| K7 | Payment - new card | D | `_payment/CardFields.tsx` | **L** + **S** |
| K8 | Payment - Afterpay | D | `_payment/MethodList.tsx` | **S** |
| K9 | Payment - declined | D | `_payment/PaymentNotice.tsx`, `failures.ts` | **R** |
| K10 | Payment - processing | D | `PaymentStep.tsx` | **R** |
| K11 | 3D Secure (Stripe modal) | D | provider | **S** |
| K12 | Confirmation - paid | D | `/checkout/complete` · `checkout/complete/page.tsx`, `components/receipt/*` | **L** |
| K13 | Confirmation - pending | D | `complete/state.ts` | **R** |
| K14 | Confirmation - not completed | D | `complete/state.ts` | **R** |
| K15 | Stripe handoff spec | D | - | **-** (drives `packages/design-system/stripe` appearance) |
| K16 | Checkout - phone | P | same as K1 | **L** |
| K17 | Payment - phone | P | same as K6 | **L** |
| K18 | Declined - phone | P | same as K9 | **R** |
| K19 | Confirmation - phone | P | same as K12 | **L** |

## 7. Orders (10)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| O1 | Order history | D | `/orders` · `(account)/orders/page.tsx`, `ReorderButton.tsx` | **L** + **B** (item pictures and stage per row) |
| O2 | Order history - empty | D | exists | **R** |
| O3 | Order - on the way | D | `/orders/[id]` · `(account)/orders/[id]/page.tsx`, `components/receipt/*` (`ProgressTrack`, `ArrivalPanel`, `ReceiptDocument`, `StatusPill`, `TrackingLink`) | **L** |
| O4 | Order - confirmed | D | same | **L** |
| O5 | Order - delivered | D | same | **L** |
| O6 | Order - moved to courier | D | same (081 notice) | **L** |
| O7 | Report a problem (Dialog) | D | `orders/[id]/RequestRefund.tsx`, `RefundBlock.tsx` | **L** (inline → dialog) |
| O8 | Cancel order (Alert dialog) | D | `orders/[id]/CancelOrder.tsx` | **R** |
| O9 | Orders - phone | P | same as O1 | **L** |
| O10 | Order - phone | P | same as O3 | **L** |

## 8. Account (28)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| A1 | Overview | D | none (`/account` opens Personal info) | **N** - composed from existing reads (orders, points, saved, addresses, payment methods, me) |
| A2 | Personal info | D | `/account` · `(account)/account/PersonalInfo.tsx`, `FieldEditor.tsx`, `EmailDeliveryNotice.tsx` | **L** |
| A3 | Address book | D | `/account?tab=addresses` · `(account)/addresses/_components/AddressList`, `AddressRow`, `CoverageNote` | **L** |
| A4 | Payment methods | D | `/account?tab=payment` · `PaymentMethodList.tsx` | **L** |
| A5 | Effy points | D | `/account?tab=points` · `PointsTab.tsx`, `PointsViewed.tsx` | **L** |
| A6 | Security | D | `/account?tab=security`, `/account/security` · `PasswordCard`, `SessionCard` | **L** |
| A7 | Security - set a password | D | `SetPasswordDialog.tsx` | **L** |
| A8 | Privacy & data | D | `/account?tab=privacy`, `/account/privacy` · `privacy/DeleteAccountFlow.tsx` | **L** |
| A9 | Privacy - delete blocked | D | `DeleteAccountFlow.tsx` | **R** |
| A10 | Legal | D | `/account?tab=legal` | **L** |
| A11 | Address - delete blocked | D | `DeleteAddressDialog.tsx` | **R** |
| A12 | Edit name | D | `FieldEditor.tsx` (inline) | **L** (inline → side panel) |
| A13 | Change mobile number | D | `FieldEditor.tsx` (inline) | **L** |
| A14 | Verify number (code) | D | none | **B - held**: needs texted codes; out until approved (spec FR-032) |
| A15 | Change password | D | `ChangePasswordDialog.tsx`, `PasswordField.tsx` | **L** |
| A16 | Set a password (code) | D | `SetPasswordDialog.tsx` | **L** |
| A17 | Sign out everywhere | D | `SessionCard.tsx` | **R** (confirm dialog) |
| A18 | Delete account (code) | D | `DeleteAccountFlow.tsx` | **L** |
| A19 | Edit address | D | `AddressFormModal.tsx`, `AddressForm.tsx` | **L** |
| A20 | Account - phone | P | same as A1 | **N** |
| A21 | Points - phone | P | same as A5 | **L** |
| A22 | Addresses - phone | P | same as A3 | **L** |
| A23 | Change number - drawer | P | same as A13 | **L** |
| A24 | Verify number - drawer | P | same as A14 | **B - held** |
| A25 | Change password - drawer | P | same as A15 | **L** |
| A26 | Set a password - drawer | P | same as A16 | **L** |
| A27 | Delete account - drawer | P | same as A18 | **L** |
| A28 | Edit address - drawer | P | same as A19 | **L** |

## 9. Sign in & join (19)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| J1 | Sign in - email | D | `/sign-in` · `(auth)/sign-in/SignInForm.tsx`, `GoogleButton.tsx` | **L** |
| J2 | Sign in - from checkout | D | `ReasonNotice.tsx` | **R** |
| J3 | Sign in - code | D | `_components/CodeStep.tsx` | **R** |
| J4 | Sign in - password | D | `SignInForm.tsx` | **R** |
| J5 | Code expired | D | `CodeStep.tsx` | **N** state |
| J6 | Google sign-in failed | D | `/callback` · `callback/CallbackHandler.tsx` | **R** |
| J7 | Sign in - cookie notice | D | none found | **N** |
| J8 | Join - email | D | `/sign-up` · `sign-up/SignUpForm.tsx` | **L** |
| J9 | Join - code | D | `CodeStep.tsx` | **R** |
| J10 | Join - password | D | `SignUpForm.tsx` | **R** |
| J11 | Join - name | D | `NameStep.tsx` | **R** |
| J12 | Reset - email | D | `/reset-password` · `ResetPasswordForm.tsx` | **R** |
| J13 | Reset - link sent | D | same | **R** |
| J14 | Reset - new password | D | same | **R** |
| J15 | Reset - done | D | same | **R** |
| J16 | Sign in - phone | P | same as J1 | **L** |
| J17 | Code - phone | P | same as J3 | **R** |
| J18 | Join - phone | P | same as J8 | **L** |
| J19 | Join name - phone | P | same as J11 | **R** |

## 10. Help & info (17)

| # | Screen | W | Today | Work |
| --- | --- | --- | --- | --- |
| I1 | Help & feedback | D | `/feedback` · `feedback/page.tsx`, `_components/FeedbackForm.tsx` | **L** + **N** answers by topic with on-page search |
| I2 | Help - sent | D | `FeedbackForm.tsx` | **R** |
| I3 | Help - send failed | D | `FeedbackForm.tsx` | **R** |
| I4 | Help - phone | P | same | **L** |
| I5 | About Effy | D | `/about` · `about/page.tsx` | **L** |
| I6 | Deleting your account | D | `/delete-account` · `delete-account/page.tsx`, `GuestDataControl.tsx` | **L** |
| I7 | Legal index | D | `/legal` · `legal/page.tsx` | **L** |
| I8 | Legal document | D | `/legal/[type]` · `components/legal/LegalDocumentView.tsx` | **L** (contents rail, "what changed") |
| I9 | Legal document - phone | P | same | **L** |
| I10 | Previous versions | D | `/legal/[type]/versions` | **R** |
| I11 | Newsletter - confirmed | D | `/newsletter/confirm` · `(shop)/newsletter/confirm/page.tsx` | **R** |
| I12 | Newsletter - expired | D | same | **R** |
| I13 | Newsletter - unsubscribed | D | same | **R** |
| I14 | 404 | D | `not-found.tsx` | **L** (+ aisles, sale rail) |
| I15 | 404 - phone | P | same | **L** |
| I16 | Error | D | `(shop)/error.tsx` | **R** |
| - | `index.html` | - | the reference's own contents page | **-** |

## Totals

| Group | Screens | Mostly |
| --- | --- | --- |
| Shared components | 6 | re-layout |
| Home | 12 | re-layout + 3 new + 1 backend |
| Browse & search | 9 | re-layout |
| Product & offers | 7 | re-layout + 2 backend |
| Saved items | 6 | re-layout |
| Cart | 6 | re-layout + new save-for-later and undo |
| Checkout & Stripe payment | 19 | re-layout; payment fields are the provider's |
| Orders | 10 | re-layout + 1 backend |
| Account | 28 | re-layout + new Overview; 2 held |
| Sign in & join | 19 | restyle on a new frame |
| Help & info | 16 (+ index) | re-layout |

## Backend needed

Each belongs to an existing service on the **shared** gateway - no new service, no new gateway.

| Need | For | Where | Shape |
| --- | --- | --- | --- |
| Offers list | P4, home "All offers" | `storefront` | new public route listing current offers |
| Products in an offer | P3, P7 | - | **held** - promotions have no product or aisle scope today; adding one is its own feature (authoring, pricing rules) |
| Search suggestions | H7 | `storefront` | new public route: phrases + top products for a prefix |
| Brand list | H1 "Shop by brand" | `storefront` | already in the facets read - confirm it serves unfiltered |
| Order list pictures and stage | O1, O9, A1 | `commerce` | extend the order summary: a few item pictures, package stage |
| Header delivery answer | S1 | `storefront` | existing `serviceability` read against the default address's postcode - confirm, else extend |
| Member since | A1 | `customer` | already on the profile (`createdAt`) - confirm it is served |
| Mobile number verification | A14, A24 | - | **held** - texted codes are a new outward channel; not built without approval |

Help search (I1) needs no backend: answers are authored content, filtered on the page.

## Foundation that changes before any screen

| What | Today | Becomes |
| --- | --- | --- |
| Colours | `@effy/design-system/tokens.css` (platform cobalt + slate, light and dark) | the reference's `tokens.css` for the storefront only: zinc greys, blue `#1d4ed8`, green `#0d7a40`, destructive black, light only |
| Typeface | General Sans (self-hosted fallback; Geist not loaded on this surface) | Geist + Geist Mono, self-hosted from the files the reference ships |
| Wordmark | `components/storefront/BrandMark.tsx`, `app/icon.svg`, `favicon.ico`, `apple-icon.png` | "effy" in Geist Bold with a green full stop |
| Content column | `container` at 1280, 16/24 gutters | 1400 at the widest step, 16/24/32 gutters |
| Primitives | `components/ui/button.tsx` only, `components/storefront/kit.tsx` | the shadcn set the reference names (Button, Card, Badge, Dialog, Sheet, Drawer, Dropdown, Command, Tabs, Accordion, Input, OTP, Radio card, Toggle group, Checkbox, Select, Table, Alert, Toast, Skeleton, Progress, Breadcrumb, Pagination, Tooltip, Separator, Avatar) |
| Payment fields theme | `packages/design-system/stripe` (generated from platform tokens) | the handoff spec's appearance values |
| Guards to revisit | `check-tokens.mjs`, `check-token-usage.mjs`, `check-component-shape.mjs`, `check-no-emerald.sh`, bundle budget, `e2e/container.spec.ts` | scoped so the storefront's own palette is checked, not forbidden |
