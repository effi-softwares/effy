# Data Model: Monochrome Design Language & Customer Mobile Rebuild (026)

**Phase 1 output.** This feature stores nothing — no schema, no migration, no server data (FR-001).
Its "entities" are **design entities**: the token set, the type scale, the brand-mark variants, the
screen inventory, and two device-local preferences.

---

## 1. Neutral ramp (the source of every colour token)

Ten steps, verbatim from the source design's published palette.

| Step | Value | Primary use |
|---|---|---|
| 900 | `#1A1A1A` | accent (light), foreground (light), ground (dark) |
| 800 | `#333333` | card (dark) |
| 700 | `#4D4D4D` | border (dark) |
| 600 | `#666666` | muted foreground (light) |
| 500 | `#808080` | disabled label, tertiary text |
| 400 | `#999999` | placeholder text |
| 300 | `#B3B3B3` | muted foreground (dark) |
| 200 | `#CCCCCC` | *(source's disabled fill — **not adopted**, R10)* |
| 100 | `#E6E6E6` | border (light), disabled fill, track |
| 0 | `#FFFFFF` | ground (light), card (light), accent label (light) |

### Semantic hues — exactly two (FR-009a)

| Role | Light | Dark | Constraint |
|---|---|---|---|
| Error / destructive | `#e01010` (4.94:1 vs white) | `#ff6b6b` w/ `#0a0a0a` label | text-capable; AA-tuned from source `#ED1010` (4.48:1, fails) |
| Success | `#0C9409` (4.00:1 vs white) | guard-verified lift | **non-text only** — border/icon; never a fill under text |

Neither may be used decoratively or as an accent.

---

## 2. Token contract — `packages/design-system/src/tokens.css`

Same 12 guarded pairs as today; only values change. **The accent inverts polarity between
appearances** (R4) — the single most important difference from the emerald theme.

| Token | Light | Dark |
|---|---|---|
| `--background` | `#FFFFFF` | `#1A1A1A` |
| `--foreground` | `#1A1A1A` | `#FFFFFF` |
| `--card` / `--popover` | `#FFFFFF` | `#333333` |
| `--card-foreground` / `--popover-foreground` | `#1A1A1A` | `#FFFFFF` |
| **`--primary`** | **`#1A1A1A`** | **`#F5F5F5`** |
| **`--primary-foreground`** | **`#FFFFFF`** | **`#1A1A1A`** |
| `--secondary` | `#E6E6E6` | `#333333` |
| `--secondary-foreground` | `#1A1A1A` | `#FFFFFF` |
| `--muted` | `#E6E6E6` | `#333333` |
| `--muted-foreground` | `#666666` | `#B3B3B3` |
| `--accent` (hover hint) | `#F5F5F5` | `#4D4D4D` |
| `--accent-foreground` | `#1A1A1A` | `#FFFFFF` |
| `--destructive` | `#e01010` | `#ff6b6b` |
| `--destructive-foreground` | `#FFFFFF` | `#0a0a0a` |
| `--border` / `--input` | `#E6E6E6` | `#4D4D4D` |
| `--ring` | `#1A1A1A` | `#FFFFFF` |
| `--disabled` | `#E6E6E6` | `#333333` |
| `--disabled-foreground` | `#808080` | `#808080` |
| `--placeholder` | `#808080` ⚠ | `#808080` |
| `--sidebar` | `#F5F5F5` | `#0A0A0A` |
| `--sidebar-foreground` | `#1A1A1A` | `#FFFFFF` |
| `--sidebar-primary` | `#1A1A1A` | `#F5F5F5` |
| `--sidebar-primary-foreground` | `#FFFFFF` | `#1A1A1A` |
| `--sidebar-accent` | `#E6E6E6` | `#333333` |
| `--sidebar-accent-foreground` | `#1A1A1A` | `#FFFFFF` |
| `--sidebar-border` | `#E6E6E6` | `#1A1A1A` |
| `--sidebar-ring` | `#1A1A1A` | `#FFFFFF` |

⚠ **Every value a surface renders must be a token** (FR-004). `--disabled`, `--disabled-foreground`,
and `--placeholder` exist because the adapted disabled control (R10) and the source's placeholder grey
would otherwise be written as literals into `StorefrontKit.kt` and the web primitives — which FR-004
forbids. `--disabled-foreground/--disabled` is a **non-text** pair held to 3:1 (3.16:1), not 4.5:1.

⚠ The four **sidebar pairs are one third of the twelve-pair contrast gate**, so they are pinned here
rather than left as "re-picked from the ramp". All four clear 4.5:1 in both appearances
(12.63–19.80:1, computed).

⚠ **`--placeholder` deviates from the source.** The kit uses `#999999` for placeholder text, which
measures **2.85:1** on white and **fails** the 3:1 non-text floor. It is adopted as **`#808080`**
(3.95:1 light, 4.41:1 dark) — the third source value this feature has to tune, after the error red and
the disabled fill. Recorded so nobody "restores fidelity" later and reintroduces a failing pair.

**Radii unchanged and still pinned**: `--radius-sm: 0.5rem` (8 px), `--radius-md: 1rem` (16 px) — the
guard asserts these exact values so web px == mobile dp.

**Invariant**: every key present in `:root` must be present in `.dark`, and all 12 guarded pairs must
clear their threshold in both. Zero exemptions (FR-015, FR-015a).

---

## 3. Type scale — General Sans, SemiBold-led

Source sizes; weights capped at **600** because the source never uses Bold 700 (R3).

| Style | Size | Weight | Line height | Tracking | Compose slot |
|---|---|---|---|---|---|
| H1 | 64 | 600 | 0.8 | −0.05em | `displayLarge` |
| H2 | 32 | 600 | 1.0 | −0.05em | `headlineLarge` |
| H3 | 24 | 600 | 1.2 | 0 | `headlineMedium` |
| H4 | 20 | 600 | 1.2 | 0 | `titleLarge` |
| H4 Medium | 20 | 500 | 1.2 | 0 | `titleMedium` |
| B1 | 16 | 400/500/600 | 1.4 | 0 | `bodyLarge` / `labelLarge` |
| B2 | 14 ⚠ | 400/500/600 | 1.4 | 0 | `bodyMedium` / `labelMedium` |
| B3 | 12 | 400/500/600 | 1.4 | 0 | `bodySmall` / `labelSmall` |

⚠ **B2 = 14 is inferred** — confirm by measurement before committing (R6).
⚠ **H1's 0.8 line height sits below cap height** — display-only, never applied to arbitrary strings (R5).

**Font files** (3 weights × 6 surfaces, one shared source):
`packages/design-system/mobile-assets/font/general_sans_{regular,medium,semibold}.ttf` + the ITF
licence file, synced by `sync-mobile-assets.mjs` and drift-checked by `check-mobile-assets.mjs`.

---

## 4. Brand-mark variants — polarity, not hue (R2)

`COLOURWAYS` changes meaning. Geometry is identical across all three; only field polarity differs.

| Variant | Ground | Mark | Surfaces |
|---|---|---|---|
| `light` | `#F4F5F7` | `#1A1A1A` | customer-web, customer-mobile |
| `dark` | `#1A1A1A` | `#F4F5F7` | shop-web, shop-mobile |
| `mid` | `#808080` | `#1A1A1A` | back-office |

Separation between `light` and `dark` grounds: **15.95:1**.

- `mono()` derivation (Android themed layer, iOS tinted) is unchanged — already hueless.
- `SPLASH_GROUND` restated to the neutral ramp per polarity; still **asset-local** (rule C4), still not
  a design token, `packages/brand` still does not depend on `design-system`.
- **Rule C2 restated**: previously "all colourways share `outline` + `tag`". Under polarity those
  values must differ, so the invariant becomes **"all colourways draw the same paths from the same
  slot set"**. Enforced by the existing unit tests with updated expectations.
- `RETIRED_EMERALD = ["#065f46","#10b981","#d0735a","#bf5540","#dd8368","#69b08b","#0ea5e9","#075985","#4ade80","#3b82f6"]`
  — named only so the suite can prove absence, exactly as `RETIRED_JADE` is.

**Determinism**: two regenerations from an unchanged source must be byte-identical (SC-006).
**No geometry changes** — 024's `assertRenderable()` path is not re-opened.

---

## 5. Screen inventory (customer-mobile)

**48 source screens** (the export folder's 49th file, `Group 16.jpg`, is a banner frame) partition as:

| Disposition | Source screens |
|---|---|
| Restyled | **33** |
| Map to new Effy screens | **9** → collapse to **6** distinct new screens |
| Excluded | **6** |
| **Total** | **48** |

**Not part of the 48**: 2 screens **invented in the idiom** (category browse, delivery/serviceability),
and 2 **excluded affordances** that were never screens (apparel sizing, Facebook sign-in).

Full mapping and the per-screen breakdown: [figma-source-findings.md §4](figma-source-findings.md),
which is the authority for the T043 inventory test.

### Restyled (33) — existing files
`AuthScreens.kt` (7 states) · `HomeScreen.kt` · `SearchScreen.kt` (3 states) · `BrowseScreen.kt` ·
`ProductDetailScreen.kt` · `CartScreen.kt` (2 states) · `CheckoutScreen.kt` · `ReceiptScreen.kt` ·
`OrdersScreen.kt` (3 states) · `FavoritesScreen.kt` (2 states) · `AddressBookScreen.kt` +
`AddressFormSheet.kt` (4 states) · `AccountScreens.kt` (3 states) · `CustomerShell.kt` ·
`StorefrontKit.kt` (the shared vocabulary — largest single edit) · splash (024).

### Built — 6 new Effy screens (from 9 source screens)
| Screen | From source | Backing | State |
|---|---|---|---|
| Onboarding | Onboarding (1) | device-local flag | real |
| Notifications (incl. its empty state) | Notifications ×3 + Empty (4) | fixture module | **placeholder** (FR-035) |
| Order tracking | Track Order (1) | 020 fulfilment states | **real** — no location/map/courier (FR-037) |
| FAQs | FAQs (1) | static content | real |
| Help Center | Help Center (1) | static content | real |
| Customer Service | Customer Service (1) | static content | real |

The three source `Notifications` variants plus `Notifications - Empty` are **one Effy screen in
different content states**, which is why 9 source screens yield 6 new screens.

### Excluded — 6 screens
Reviews · My Orders-Completed-Review (no ratings capability, FR-029) · Payment Method · New Card ×3
(Stripe PaymentSheet owns them, FR-030).

### Excluded — 2 affordances (not screens)
Apparel size selection (grocery, FR-007) · Facebook sign-in (not an Effy credential route, FR-030a).

### Designed in the idiom (2) — no source counterpart
Category browse (FR-027) · delivery-location + serviceability affordance (FR-028).

---

## 6. Device-local preferences (the only "stored" state)

| Preference | Scope | Lifecycle |
|---|---|---|
| Onboarding seen | device-local | set once on completion or skip; never syncs (FR-033) |
| Appearance (Light/Dark/System) | device-local | **already exists** (017) — unchanged, consumed only |

Neither is an account record; neither reaches a server.

---

## 7. State transitions — order tracking (FR-036/FR-037)

Renders 020's existing machine, read-only, presented as a sequence with the current state marked:

```
pending → received → picking → ready_for_pickup → (delivered)
```

**Disclosure boundary**: state name and its timestamp only. **No** shop name or id, **no** map, **no**
courier identity, **no** count of fulfilment locations — a multi-package order shows positional
labelling ("Package 1 of 2") exactly as the cart already does (FR-043 precedent from 025).
