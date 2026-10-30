# Contract: the customer UI kit (087)

The only way a customer screen draws shared UI. Lives in `CM/core/presentation/` (customer-only - **not**
mobile-kit, which shop and driver share). Each component cites its canvas board. Sizes in dp/sp.

## Theme

| Item | Contract |
|---|---|
| `EffyTheme(content)` | Light `ColorScheme` from the generated storefront tokens only; no `darkTheme` parameter; `MaterialTheme.shapes` and `typography` overridden; status/navigation bars white with dark icons |
| Colours | Read via `MaterialTheme.colorScheme` + `EffyStorefrontColor` (`primaryMuted`, `brand`, `brandMuted`, `scrim`). **No `Color(0x…)` in `features/`** |
| Type | Geist; slots per research D3; prices `tabular` |
| Shape | `EffyStorefrontShape`: sm 4, md 6 (buttons, fields), lg 8 (cards, image wells), xl 12 (banners), sheet 16 (top corners only) |
| Size | `EffySize`: target 48, row 60, field 48, primary 52, tab row 58, large-title bar 60, pushed bar 52, gutter 16 |

## Frame

| Component | Board | Contract |
|---|---|---|
| `EffyLargeTitleBar(title \| wordmark, scrollState, search?: SearchEntry?)` | App bar (back=false), Main, Search | 34sp Bold left (or wordmark), bell right (48 target), no border; optional light-blue search field below; collapses to 17sp centred over 52dp scroll; trailing slot = bell only |
| `EffyAppBar(title)` | App bar (back=true) | Back from `LocalNavBack` ("‹ Back" text in primary on iOS, arrow on Android), centred 17sp Semi title, optional bell; no other trailing action; no border |
| `EffyTabBar(tabs, selected, cartCount, onSelect)` | Tab bar | 5 equal cells, row ≥58 + bottom inset, 27dp Lucide icons, 12sp labels (600 selected / 500), selected `primary` + 3dp indicator, others `mutedForeground`, white 96% + top hairline, badge `primary` 20dp min with 2dp white ring, `99+` cap; hidden when stack > 1 |
| `EffyPinnedBar(content)` | Product, Cart, Checkout, Payment | Floating layer: top hairline + shadow, 16 gutter, bottom = nav inset (≥34 on iOS); enters with slide-up 200ms |

## Overlays

| Component | Board | Contract |
|---|---|---|
| `EffySheet(title?, onDismiss, dirty, footer, fullHeight=false, content)` | Filters, AddToList, AddressForm, PersonalInfo | Handle 48×5; top radius 16; `scrim`; content scrolls; **footer pinned** above nav + IME insets; dismiss by drag, scrim tap, cancel; `dirty` → in-sheet discard page; non-dismissable while `busy` |
| `EffyConfirmSheet(icon, title, body, confirmLabel, destructive, cancelLabel, onConfirm)` | Security, DeleteAccount, Order | Centred icon, 20sp title, body, footer: 52 primary (or black destructive) + 48 ghost |
| `EffySnackbar` / `LocalEffySnackbar` | Patterns | One host per screen, bottom, above tab bar or pinned bar; optional action ("Undo"); slide-up 200ms |
| `EffyConsentBanner` | Patterns | Bottom, above tab bar, two equal buttons |
| ❌ `AlertDialog`, `Dialog`, `DropdownMenu`, raw `ModalBottomSheet` | - | Forbidden in customer source (guard) |

## Controls

| Component | Contract |
|---|---|
| `EffyPrimaryButton` | 52 high, radius 6, `primary`/`onPrimary`, 16sp Semi, press scale 0.98, loading spinner; `destructive=true` → black |
| `EffySecondaryButton` | 48, 1dp border, radius 6 |
| `EffyGhostButton` / `EffyTextLink` | 48 target, primary text |
| `EffySearchField` | 48, `primaryMuted` fill, radius 6 (canvas), Lucide search, clear button, 16sp |
| `EffyTextField` / `EffyPasswordField` | label above, 48 min, 16sp, 1dp `input` border → 2dp `ring` on focus, error = black text + alert icon |
| `EffyCheckbox`, `EffyRadio`, `EffySwitch` | M3 behaviour, storefront colours, whole row is the 48/60 target |
| `EffyChip(selected)` | radius 6, 40 visual / 48 target; selected `primaryMuted` + primary text + 1dp primary border |
| `EffySegmented` | track `muted`, sliding white thumb (animated) |
| `EffyStepper(qty, min, max)` | Lucide minus/plus, 44 in tiles / 48 on pages, number roll |
| `EffyStatusPill(kind)` | paid/delivered → `brand` on `brandMuted`; in progress → `primary` on `primaryMuted`; problem → `foreground` on `muted` + icon; cancelled → `mutedForeground` on `muted` |
| `EffyBadge(count)` | `primary` fill, white 11sp, `99+` |
| `EffyRow(icon?, title, subtitle?, trailing?, chevron)` | 60 min (64 with subtitle), 16 gutter, hairline between rows inside a bordered group |
| `EffyInlineError(text)` | alert icon + black text; never red |

## Content

| Component | Board | Contract |
|---|---|---|
| `ProductTile(product, inCartQty, onAdd, onChange, onOpen)` | Product card | grey image well radius 8, no border/shadow; overlay "+" 40 visual / 48 target bottom-right → morphs to stepper; Sale badge + savings in `brand`; name 2 lines; price 16 Bold tabular; shared-element key `product-image-<id>` |
| `EffySkeleton*` | Patterns | shapes of the content to come; shimmer 1100ms; static when motion ≠ Full |
| `EffyEmptyState(icon, title, body, action)` | Patterns | 56 icon chip, 20sp title, one primary action |
| `EffyErrorState(onRetry)` | Patterns | alert icon, black, "Try again" always present |
| `ProductImage` | - | Coil crossfade 200ms; grey well on failure (no broken image, no letter mark) |
| `EffyWordmark` | App bar | "effy." vector, full stop in `brand` |
