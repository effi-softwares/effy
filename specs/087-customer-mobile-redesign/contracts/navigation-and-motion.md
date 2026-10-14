# Contract: navigation and motion (087)

## Navigation

| Rule | Contract | Pinned by |
|---|---|---|
| Tabs | `Home, Search, Cart, Orders, Account` in that order | `ScreenInventoryTest` (updated) |
| Routes | same 36 keys; `Cart` is the Cart tab's root, no longer pushed | `CustomerNavKeySerializationTest`, `customerNavSavedState`, `mobile-guard.sh` route-reference check |
| Into the cart | every former `push(Cart)` → `selectTab(Cart)` (header icons removed) | `CartEntryTest` (new) |
| Guest gating | unchanged: Orders/Account push `SignIn(returnTo)`; Cart tab open to guests; "Check out" pushes `SignIn(returnTo = Checkout)` | existing auth tests |
| Tab bar visibility | visible only at a stack root (`currentStack.size == 1`) — unchanged rule | existing shell test |
| Re-tap active tab | pops to root (new) | `TabReselectTest` (new) |
| System back | pop; at a non-Home root → Home (unchanged) | existing |
| Back control | from `LocalNavBack` only (unchanged single source) | existing |
| Swipe-back disabled | Payment while `paying`; Order confirmed (`Receipt` reached by `resetTo`) | `BackGestureTest` (new) |

## Transitions (Page transitions board)

| Transition | Full motion | Reduced | None |
|---|---|---|---|
| Push | new page in from 100% x, page below to −30% x with 10% dim, 350ms iOS ease `(0.32,0.72,0,1)` | 150ms fade | snap |
| Pop / edge swipe | inverse, finger-driven; release >35% width or fling completes | 150ms fade | snap |
| Tab switch | 150ms cross-fade | 100ms fade | snap |
| Sheet | slide from bottom, spring (damping 0.86, stiffness 380), scrim fade 200ms | 150ms fade | snap |
| Large title | scroll-linked collapse over 52dp | same (scroll-linked, no time) | same |
| Tile → product | shared image bounds + fade of the rest, 350ms | skipped (push fade) | skipped |
| Pull to refresh | content follows pull ≤56dp, spinner in `primary` | same | same |

## Micro-animations (Micro-animations board)

| Name | Spec | Reduced/None |
|---|---|---|
| Press | scale 0.97 (tiles) / 0.98 (buttons), 100ms | off |
| Add "+" → stepper | width + content morph 250ms; haptic light | instant swap |
| Cart badge bump | scale 1 → 1.25 → 1, spring | number change only |
| Number roll | digits slide vertically 200ms on totals and steppers | instant |
| Heart | scale 1 → 1.2 → 1, 200ms | instant |
| Segmented / chip / tab indicator | slide 200ms | instant |
| List add/remove | `animateItem` 200ms | instant |
| Skeleton shimmer | 1100ms linear sweep, infinite | static |
| Image load | crossfade 200ms | instant |
| Snackbar / pinned bar | slide-up 200ms | fade / instant |
| Order confirmed | tick path-draw 600ms + haptic success | static tick |
| OTP caret | blink 650ms (kept) | static |

## Kept from today (FR-016) — must all still exist

push/pop slide, predictive pop, bar show/hide, primary-button press, product-card press, skeleton shimmer,
pull-to-refresh translation, OTP caret blink, onboarding pager + indicator width, FAQ expand, banner
carousel and gallery pagers.
