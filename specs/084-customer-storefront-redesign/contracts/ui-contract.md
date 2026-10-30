# UI contract - 084

The reference (`docs/reference-screens/`) is the visual authority. This file fixes what code must
agree on so that forty screens come out as one site.

## Tokens (`@effy/design-system/storefront.css`)

| Token | Value | Role |
| --- | --- | --- |
| `background` / `card` / `popover` | `#ffffff` | pages, cards, menus |
| `foreground` | `#09090b` | text, prices, delivery bar, selected aisle |
| `muted` / `secondary` / `accent` | `#f4f4f5` | image wells, skeletons, ghost hover |
| `muted-foreground` | `#68686f` | hints, was-prices |
| `border` / `input` | `#e4e4e7` | every line |
| `primary` / `ring` | `#1d4ed8` (+ `primary-foreground` white, `primary-muted` `#eff4ff`) | actions, links, selection, points, courier |
| `brand` | `#0d7a40` (+ `brand-foreground` white, `brand-muted` `#ebf6ef`) | wordmark dot, Sale, savings, Delivered by Effy, paid, progress |
| `destructive` | `#09090b` (+ white) | errors, destructive - always with an icon |
| radius | sm 4 · md 6 · lg 8 · xl 12 | controls md; cards/dialogs/wells lg; hero xl |
| shadow | xs (buttons, inputs, cards) · md (popovers) · lg (dialogs, sheets, toasts) | |

No other colour. No `dark:` variant. No gradient.

## Layout

- `container`: centred; gutters 16 / 24 (sm) / 32 (lg); max 640 / 768 / 1024 / 1280 / 1400.
- Summary pages `lg:grid-cols-[1fr_380px] gap-8`; sidebar pages `lg:grid-cols-[240px_1fr] gap-8`.
- Product grid 2 / 3 / 4 / 5 columns (base / md / lg / xl); rails show 2.2 / 4 / 6 cards.
- Type: h1 `text-2xl sm:text-3xl font-semibold tracking-tight`; h2 `text-xl font-semibold`; body
  `text-sm`; meta `text-xs`; prices `font-semibold tabular-nums`.
- Phone primary actions are `lg` (40) or `xl` (48); tap targets ≥ 44.

## Primitives (`apps/customer-web/components/ui`)

Button (default · secondary · outline · ghost · link · destructive · brand; sm · default · lg · xl ·
icon), Card, Badge, Alert, Separator, Skeleton, Progress, Avatar, Input, Textarea, Label, Checkbox,
RadioCard, Switch, Select, ToggleGroup, InputOTP, Tabs, Accordion, Breadcrumb, Pagination, Table,
Tooltip, DropdownMenu, Dialog, AlertDialog, Sheet, Drawer, ResponsiveDialog, Command, Toast.

**Rule**: a centred Dialog or right Sheet at `md` and up is a bottom Drawer below - always through
`ResponsiveDialog`, never decided per screen.

## Composites (`components/storefront`, `components/chrome`)

| Composite | Reference | Used by |
| --- | --- | --- |
| `Wordmark` | "effy" bold + green full stop | header, footer, checkout, auth, icons |
| `Header` (+ `DeliveryBar`, `SearchCommand`, `AislesMenu`, `AccountMenu`, `CartSheet`, `BottomBar`) | S1, H6–H9, H11–H12 | `(shop)`, `(account)` layouts |
| `Footer` | S2 | same |
| `CheckoutHeader` | S3 | `checkout` layout |
| `AuthCard` | S6 | every `(auth)` step |
| `AccountNav` | S5 | `(account)` layout |
| `ProductCard`, `Stepper`, `ProductRail`, `ProductGrid` | S4 | home, listing, product, cart, 404 |
| `DeliveryPicker` | design system · Checkout | checkout |
| `OrderTracker` | design system · Orders | order page, Overview |
| `OrderSummary` | C1, K1 | cart, checkout, payment |
| `EmptyState`, `PageHeader`, `InlineError` | every empty/error state | all |

## Routes

| Route | Change |
| --- | --- |
| `/`, `/search`, `/product/[id]`, `/cart`, `/checkout`, `/checkout/complete`, `/orders`, `/orders/[id]`, `/saved`, `/saved/[listId]`, `/promotions/[id]`, `/about`, `/delete-account`, `/legal/**`, `/newsletter/confirm`, `/sign-in`, `/sign-up`, `/reset-password`, `/callback` | kept |
| `/account` | now Overview |
| `/account/personal`, `/account/payment`, `/account/points`, `/account/legal` | new |
| `/account/security`, `/account/privacy`, `/addresses` | kept, now full section pages |
| `/account?tab=…` | 308 → its page |
| `/offers` | new |
| `/help` | new; `/feedback` 308 → `/help` |

## Must not change

- Every `data-testid` an e2e spec relies on keeps its meaning (renamed only with its spec).
- Pinned words come from `@effy/shared-types` (`DELIVERY_TYPE_WORDS`, `DELIVERY_WINDOW_WORDS`,
  `effyWindowsView`, `COVERAGE_REFUSAL_SENTENCE`, `STATUS_WORD`, fee lines) - never retyped.
- Sign-out stays a POST form. Live updates stay on `LiveRefresh`. No timers.
- JSON-LD, metadata, `sitemap.ts`, `robots.ts`, `manifest.ts` keep their content (manifest colours
  and icons move to the new identity).
