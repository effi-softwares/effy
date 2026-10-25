# Design-system scripts

Every script here is plain Node (standard library only, no dependencies) and is run through the
package's `pnpm` scripts. Run them from the repo root with `pnpm --filter @effy/design-system <script>`,
or from `packages/design-system` with `pnpm <script>`.

They come in two kinds:

- **Generators** (`gen-*`, `sync-*`) write files. Their output is committed.
- **Checks** (`check-*`) only read. Each one exits non-zero, naming what is wrong, when a rule is broken.

How the generators turn `src/tokens.css` into each app's theme is explained in
[../THEMING.md](../THEMING.md).

## At a glance

| Script | Kind | Run by | What it guards or produces |
|---|---|---|---|
| `check-tokens.mjs` | check | `test`, `tokens:test` | The values in `src/tokens.css` |
| `check-component-shape.mjs` | check | `test` | The corner radii of the shared components |
| `check-token-usage.mjs` | check | `test`, `tokens:usage` | Every colour class names a real token |
| `check-banner-canvas.mjs` | check | `test`, `banner-canvas:check` | The promotion picture canvas |
| `gen-compose-theme.mjs` | generator | `tokens:gen` | The mobile apps' Kotlin theme |
| `gen-stripe-appearance.mjs` | generator | `tokens:gen` | The Stripe card fields' look |
| `check-compose-theme.mjs` | check | `tokens:check` | The generated files above are up to date |
| `sync-mobile-assets.mjs` | generator | `mobile-assets:sync` | Copies icons and fonts into both apps |
| `check-mobile-assets.mjs` | check | `tokens:check`, `mobile-assets:check` | The apps' copies match the source |
| `gen-lucide-drawables.mjs` | generator | by hand only | Lucide icons as Android vector files |

`pnpm test` runs the four checks on the first rows. `pnpm tokens:check` runs the generated-file check
and the mobile-asset check.

## Checks run by `test`

### `check-tokens.mjs`

Reads `src/tokens.css`, the one theme file every app uses, and fails on any of these:

1. **The file is not valid CSS once comments are removed.** A `*/` written inside a comment ends the
   comment early, and the rest becomes stylesheet code. Every other check would still pass; only the
   customer-web production build would fail.
2. **Light and dark don't define the same tokens.** Every token in `:root` must also be in `.dark`, and
   the other way round. Every `--color-*` in `@theme` must point at a declared token.
3. **A colour is not a Tailwind palette value.** Allowed: white, black, and the zinc, blue, green,
   emerald, violet, orange, pink, rose and red shades.
4. **Red, pink or orange is used outside its role.** Only `--destructive*` (problems), `--accent2*`
   (attention) and `--promo-*` may use them.
5. **A fixed pairing is broken:**
   - `--warning` must equal `--foreground`, and `--ring` must equal `--primary`.
   - `--brand` must differ from `--primary`: green is never the action colour.
   - `--primary-foreground`, `--brand-foreground` and `--destructive-foreground` must be white.
6. **A pair fails contrast** (WCAG), in either appearance. Text must reach 4.5:1 on its background.
   UI boundaries (the focus ring, placeholders, disabled text) and the white label on a `*-fill` must
   reach 3:1. The full list of pairs is `PAIRS` in the script.
7. **The radius scale changed.** It must stay sm 4 · md 6 · lg 8 · xl 12 · sheet 16, with a default of
   8 (px).
8. **The theme is switched any other way than the `.dark` class** (`data-theme` or a
   `prefers-color-scheme` query in the file).

### `check-component-shape.mjs`

Tailwind class strings aren't type-checked, so this reads the shared components in `src/ui/` and
fails if:

- a button, input, select, textarea, OTP field or badge uses `rounded-full`. Things that hold words
  are never pills.
- a button, badge, input, select or textarea uses any radius other than `rounded-md` (6px, the control
  step).
- the card uses any radius other than `rounded-lg` (8px, the container step).
- a dropdown menu, select, dialog or alert dialog has a surface with sharper corners than a row inside
  it.

Comments in the components are ignored, so a mention in prose doesn't trip it.

### `check-token-usage.mjs`

Tailwind writes no CSS at all for a colour class that names a token `@theme` doesn't declare. A
mistyped or renamed token renders as nothing, with no error anywhere. This check scans the `.ts` and
`.tsx` files (tests excluded) of:

- the shared components: `packages/web-kit/src`, `packages/design-system/src/ui`;
- the consoles: `apps/back-office/src`, `apps/shop-web/src`;
- customer-web: `apps/customer-web/app`, `apps/customer-web/components`.

It finds colour classes (`bg-*`, `text-*`, `border-*`, `ring-*` and similar) built on one of the
platform's token names, and fails on any that don't resolve to a declared `--color-*`. Tailwind's own
colours (`bg-zinc-100`) and arbitrary values (`bg-[#fff]`) are ignored.

### `check-banner-canvas.mjs`

Reads `packages/shared-types/src/banner-canvas.json`, the size and text area of promotion pictures,
and fails unless:

- width and height are positive whole numbers, and `aspectRatio` equals width ÷ height (otherwise every
  picture is stretched);
- the ratio is at least 1.5:1 (a taller picture crowds the Home screen);
- the width is at least 1110px (sharp at 3× density);
- the text area's numbers are percentages from 0 to 100 and fit inside the picture;
- the text area is at least 40% wide and 30% tall;
- `maxRenderWidthDp` is at least 420 and `maxBytes` is above 0 and at most 1 MB.

The mobile apps read the same file through `gen-compose-theme.mjs` (`EffyBanner`).

## Generators run by `tokens:gen`

### `gen-compose-theme.mjs`

Writes the Kotlin theme for the customer and driver apps from `src/tokens.css`. For each app it writes
four files: `compose/` for customer, `compose-driver/` for driver.

| File | Contents |
|---|---|
| `EffyTokens.kt` | Every colour, light and dark, and the Material 3 colour schemes built from them |
| `EffyLayoutTokens.kt` | The radius and spacing scale, and `EffyBanner` (from `banner-canvas.json`) |
| `EffyTypography.kt` | Geist and Geist Mono, and all fifteen Material 3 text styles |
| `EffyStorefrontShape.kt` | The corner radii as Compose shapes |

Details are in [../THEMING.md](../THEMING.md).

### `gen-stripe-appearance.mjs`

Writes the look of the Stripe card fields from `src/tokens.css`, for all three places they appear:

| File | Used by |
|---|---|
| `stripe/storefront-appearance.ts` | customer-web (light only) |
| `compose-payment-android/EffyPaymentAppearance.kt` | customer app on Android (light and dark) |
| `apps/customer-mobile/iosApp/iosApp/EffyPaymentAppearance.swift` | customer app on iOS (light and dark) |

It reads only the tokens the card fields need (`background`, `foreground`, `muted-foreground`,
`primary`, `primary-fill`, `border`, `input`, `ring`, `destructive`) and `--radius-md`. It stops with an
error if one is missing.

## Check run by `tokens:check`

### `check-compose-theme.mjs`

Runs both generators above and compares their output with the committed files. If any file changed
(or was missing), it lists the files and fails. The files are left regenerated, so you only have to
review and commit them.

It also fails if the customer app's `EffyTokens.kt` contains a colour that isn't written in
`tokens.css`.

⚠ When a generator gains a new output file, add the file to the `targets` list in this script, or the
new file is never checked.

## Mobile assets

### `sync-mobile-assets.mjs` (`mobile-assets:sync`)

Compose Multiplatform only loads resources from inside the app's own module, so each app keeps
committed copies. This copies every file in `mobile-assets/drawable/` and `mobile-assets/font/` into
`shared/src/commonMain/composeResources/` of `customer-mobile` and `driver-mobile`, writing only the
files that differ.

Never edit an app's `composeResources/drawable` or `composeResources/font` by hand. Change
`mobile-assets/` and run this.

### `check-mobile-assets.mjs` (`mobile-assets:check`)

Fails, naming the app and the file, when an app's copy is:

- **missing**: in `mobile-assets/` but not in the app;
- **stale**: in both, but the bytes differ;
- **orphaned**: in the app but no longer in `mobile-assets/`. The check doesn't delete orphans; remove
  them by hand.

The KMP template's own `compose-multiplatform.xml` is not counted as an orphan.

### `gen-lucide-drawables.mjs` (by hand)

Turns the Lucide icons the apps use into Android vector files (`mobile-assets/drawable/lucide_<name>.xml`).
The icon names are the `ICONS` list in the script, and the Lucide version is pinned in
`LUCIDE_VERSION` (0.469.0).

To add an icon:

1. Add its Lucide name to `ICONS`.
2. Download that Lucide version and unpack it:
   ```sh
   npm pack lucide-static@0.469.0 && tar -xzf lucide-static-0.469.0.tgz
   ```
3. Generate, then copy the files into the apps:
   ```sh
   node scripts/gen-lucide-drawables.mjs <unpacked>/package/icons
   pnpm mobile-assets:sync
   ```
4. Commit the new `.xml` files (in `mobile-assets/` and in both apps). Don't commit the download.

The licence for the icons is `mobile-assets/drawable/LUCIDE-LICENSE.txt`.
