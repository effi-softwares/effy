# Source design research — "Ecommerce App UI Kit (Freebie, Community)"

**Status**: complete. All **48 screens** and all 9 component sheets reviewed.

⚠ The export folder holds **49 files**, but `Group 16.jpg` is a 5120×190 **banner frame, not a screen**
(the Figma page carries four such `Group` frames). Earlier drafts of this document said "49 screens" —
that was wrong, and the disposition partition in §4 is built on **48**.

**Figma file** (operator's copy): `XtU56ycDH2Ljnfi68tnure`
(earlier copy `dfjuPX2CnIUOpgRUsdeNRd` — same node ids, either works)
Page `0:1` "📺Screens" · **48 screens** @ 390×844 (iPhone 13/14) + 4 banner `Group` frames.

**Local exports** (authoritative — no rate limit, full fidelity):

- Screens: `~/Downloads/Ecommerce App UI Kit (Freebie) (Community) (Copy)/` — 49 JPGs = **48 screens + 1 banner**
- Components: `~/Downloads/Ecommerce App UI Kit (Freebie) (Community) compoenents/` — 9 JPGs
  (`Colors`, `Typograhy`, `Buttons`, `Cards`, `Text Fields`, `Navigation Bar`, `Icons`, `IOS`, `Other`)

Source domain: **fashion/apparel** (T-shirts, sizes S/M/L, reviews). Effy is grocery — adapt the
language, never the merchandise.

---

## 1. Palette — CONFIRMED from the kit's own `Colors` sheet

**12 colours. Ten neutrals plus exactly two semantic hues.**

| Role | Value |
|---|---|
| Primary/900 | `#1A1A1A` |
| Primary/800 | `#333333` |
| Primary/700 | `#4D4D4D` |
| Primary/600 | `#666666` |
| Primary/500 | `#808080` |
| Primary/400 | `#999999` |
| Primary/300 | `#B3B3B3` |
| Primary/200 | `#CCCCCC` |
| Primary/100 | `#E6E6E6` |
| Primary/0 | `#FFFFFF` |
| **Success** | **`#0C9409`** |
| **Error / destructive** | **`#ED1010`** |

> **This settles the spec's one open assumption.** The design language is monochrome in the sense
> that it has **no brand hue** — but it ships a success green and an error red as declared tokens.
> The spec's assumption was correct and is now **fact**, not a reversible guess.

**Where the semantic hues are actually used**: error red on the Logout row, the cart delete icon,
error field borders + helper text, and the discount percentage; success green on the valid-field
border. In every case they are **paired with an icon or a word**, never colour alone — the kit's own
Text Fields sheet shows a ✓ glyph with green and a ! glyph with red. That is FR-040 satisfied by the
source design rather than bolted on by Effy.

---

## 2. Typography — CONFIRMED

Family **General Sans** (Fontshare / Indian Type Foundry).

| Style | Size | Weight | Line height | Letter-spacing |
|---|---|---|---|---|
| H1/SemiBold | 64 | 600 | **0.8** | **−5** |
| H2/SemiBold | 32 | 600 | 1.0 | **−5** |
| H3/SemiBold | 24 | 600 | 1.2 | 0 |
| H4/SemiBold | 20 | 600 | 1.2 | 0 |
| H4/Medium | 20 | 500 | 1.2 | 0 |
| B1/Regular · Medium · SemiBold | 16 | 400 / 500 / 600 | 1.4 | 0 |
| B2/Regular · Medium · SemiBold | 14 *(inferred)* | 400 / 500 / 600 | 1.4 | 0 |
| B3/Regular · Medium · SemiBold | 12 | 400 / 500 / 600 | 1.4 | 0 |

14 styles total (5 header + 9 body), matching the `Typograhy` sheet exactly.

**Two implementation hazards to settle during planning:**

1. **`letterSpacing: -5` unit is ambiguous.** Figma reports percent and px identically here. At 64 px,
   −5 px and −5 % (= −3.2 px) look very different. Measure a rendered string before committing.
2. **H1 line height 0.8** (64 → 51.2 px) is tighter than the cap height. It is a deliberate display
   treatment and **will clip descenders** if applied naively to arbitrary strings.

`Callout / Bold` (SF Pro Text 16) appears in variable dumps — that is the **iOS status-bar mock**, not
part of the design system. Ignore it.

---

## 3. Components

### Buttons
Primary (solid `#1A1A1A`, white label) · Secondary (white, hairline border) · **Disabled (`#CCCCCC`
fill, white label)** · Google (white + border + Google's own mark) · **Facebook (brand blue)** ·
Segmented toggle (white active pill on `#E6E6E6` track).

- ⚠ **The disabled style fails contrast.** White on `#CCCCCC` is ≈1.6:1 — far below the AA floor
  `scripts/check-tokens.mjs` enforces. It **must be adapted**, not copied.
- ⚠ **Facebook sign-in does not exist on Effy** (customer auth is email+password, email OTP, Google).
  Drop it.
- The **Google button legitimately keeps Google's brand colours** — Google's brand guidelines require
  it. This is a third-party exception to "no brand hue", not a violation.

### Cards — the kit provides a borderless row variant
Only three container types exist in the whole kit:

1. **Product tile** — image plate + heart overlay + name + price. No border.
2. **Cart line** — bordered rounded container. *The one genuine conflict with Principle V.*
3. **Compact list row** — image + name + price + arrow, **no border at all**.

> **This makes the cards→rows decision easy.** Variant 3 is already the kit's own borderless row, so
> converting cart and order lines to rows stays **inside the design language** rather than deviating
> from it. Product tiles remain the recorded card exception, unchanged.

### Navigation bar — active state uses three non-colour signals
5 tabs: Home · Search · Saved · Cart · Account. The active tab is marked by **filled icon +
bold label + a black underline bar**. Meaning never rests on colour — again, the source solves
FR-040 for us.

> ✅ **IA mismatch — RESOLVED by research [R7](research.md).** The kit's 5 tabs are
> Home/Search/Saved/Cart/Account. Effy's shell has **5 as well** — `HOME, BROWSE, SEARCH, ORDERS,
> ACCOUNT` (`CustomerShell.kt:75-77`; 025 added BROWSE, so earlier drafts of this document saying
> "Effy has 4" were stale). The decision is to **keep Effy's five and restyle them**: adopting the
> kit's set would drop Browse, which 025 FR-009/FR-010 made a signed-off requirement precisely
> because that entry used to be a dead-end placeholder.

### Text fields
Rest (hairline border) · Focus (black border) · Filled · Success (green border + ✓) ·
Error (red border + ! + red helper text below).

### Layout constants
Screen padding 24 · radius ~8–12 on inputs/chips, ~16 on tiles/sheets · primary CTA full-width ≈54 tall,
radius ~10, often with a leading icon · app bar = back arrow / centred bold title / bell.

---

## 4. Screen inventory → customer-mobile mapping

| # | Source screen | Effy today | Action |
|---|---|---|---|
| 1 | Splash | 024 splash | restyle |
| 2 | Onboarding | — | **build** |
| 3 | Sign Up (+Error, +Success) | `AuthScreens.kt` | restyle (drop Facebook) |
| 4 | Login (+Error, +Success) | `AuthScreens.kt` | restyle |
| 5 | Forgot Password | `AuthScreens.kt` | restyle |
| 6 | Verification Code | `AuthScreens.kt` | restyle |
| 7 | Reset Password (+Success) | `AuthScreens.kt` | restyle |
| 8 | Homepage (Discover) | `HomeScreen.kt` | restyle |
| 9 | Search / Active / Empty | `SearchScreen.kt` | restyle |
| 10 | Filters | in `SearchScreen` (025) | restyle |
| 11 | Product Details | `ProductDetailScreen.kt` | restyle; **drop size picker + rating** |
| 12 | Reviews | — | **excluded** — no such capability (025 excluded it too) |
| 13 | My Cart (+Empty) | `CartScreen.kt` | restyle; cards → row variant 3 |
| 14 | Checkout | `CheckoutScreen.kt` | restyle |
| 15 | Checkout - Success | `ReceiptScreen.kt` | restyle |
| 16 | Address / New Address (+Filled/Success) | `AddressBookScreen.kt` | restyle |
| 17 | Payment Method · New Card ×3 | Stripe PaymentSheet | **excluded** — SDK-rendered |
| 18 | My Orders Ongoing / Completed / Empty | `OrdersScreen.kt` | restyle |
| 19 | My Orders - Track Order | — | **build** (020 fulfilment states) |
| 20 | My Orders - Completed - Review | — | **excluded** — reviews |
| 21 | Saved Items (+Empty) | `FavoritesScreen.kt` | restyle |
| 22 | Account | `AccountScreens.kt` | restyle |
| 23 | My Details | in `AccountScreens.kt` | restyle |
| 24 | Logout | in `AccountScreens.kt` | restyle |
| 25 | Notifications (+Empty, 3 variants) | — | **build** — placeholder data, no push capability |
| 26 | FAQs | — | **build** (static) |
| 27 | Help Center | — | **build** (static) |
| 28 | Customer Service | — | **build** (static) |
| — | *(no source counterpart)* | `BrowseScreen.kt` category browse | **design in the idiom** |
| — | *(no source counterpart)* | delivery location + serviceability (025) | **design in the idiom** |

### The partition — corrected

Earlier drafts said *"49 source → 33 restyled, 6 built, 8 excluded, 2 invented"*. That did not hold:
the 2 invented screens have **no source counterpart** so cannot sit inside the source total, and 2 of
the "8 excluded" (apparel sizing, Facebook sign-in) are **affordances, not screens**. Corrected:

| Disposition | Source screens | Detail |
|---|---|---|
| Restyled | **33** | Splash 1 · SignUp 3 · Login 3 · Forgot 1 · Verification 1 · Reset 2 · Homepage 1 · Search 3 · Filters 1 · ProductDetails 1 · Cart 2 · Checkout 1 · CheckoutSuccess 1 · Address+NewAddress 4 · Orders 3 · SavedItems 2 · Account 1 · MyDetails 1 · Logout 1 |
| Map to new Effy screens | **9** | Onboarding 1 · Notifications 3 + Empty 1 · TrackOrder 1 · FAQs 1 · HelpCenter 1 · CustomerService 1 |
| Excluded | **6** | Reviews 1 · Orders-Review 1 · PaymentMethod 1 · NewCard 3 |
| **Total** | **48** | ✅ |

**Separately** (not part of the 48):

- **2 screens invented in the idiom** — category browse, delivery/serviceability. No source counterpart.
- **2 excluded affordances** — apparel size selection, Facebook sign-in. Not screens.

The 9 source screens collapse to **6 new Effy screens**, because the three `Notifications` variants and
`Notifications - Empty` are one screen in different content states.

> **This table is the authority for the T043 inventory test.** Each source screen must have exactly one
> disposition. The per-screen list needed to make T043 machine-checkable is the 48-entry export
> directory listing, minus `Group 16.jpg`.

---

## 5. Conflicts with platform law

| # | Conflict | Resolution |
|---|---|---|
| 1 | Constitution v1.10.0 pins Effy Emerald `#065f46` + terracotta `#d0735a` | Amendment required (FR-016) |
| 2 | 024's 57 brand assets are Emerald/Sky/Neutral | Regenerate (FR-018) |
| 3 | `check-no-jade.sh` bans the retired Jade | Add the equivalent Emerald guard (FR-011) |
| 4 | Cart lines are bordered cards | Use the kit's own borderless row variant (FR-005) |
| 5 | Nunito Sans → General Sans on all six surfaces | FR-012; **verify Fontshare licence** (FR-008) |
| 6 | Dark mode required; kit is light-only | Derive (FR-014) |
| 7 | Disabled button fails AA contrast | Adapt; the AA gate is non-negotiable (FR-015) |
| 8 | Customer/shop icons were distinguished **by hue** | ✅ **Resolved** — ground polarity (research R2) |
| 9 | Kit's 5-tab IA ≠ Effy's 5-tab shell | ✅ **Resolved** — keep Effy's five (research R7) |
| 10 | Facebook sign-in button | Drop — not an Effy credential route |

**Token SSOT**: `packages/design-system/src/tokens.css` → `compose/`, `compose-shop/`,
`compose-driver/`. One change reaches all six surfaces.

---

## 6. Licensing

Figma **Community "Freebie"** kit. Community files are licensed by their author, typically CC BY 4.0.
Attribution and redistribution terms **must be confirmed before derived assets ship** (FR-008, SC-018).
General Sans is Fontshare — free for personal and commercial use, but confirm the current licence text
and any embedding/attribution condition (FR-008).
