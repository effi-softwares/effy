# Theming: how the theme is generated

Every app on the platform wears one theme, and it is written in one file:
**`packages/design-system/src/tokens.css`**. The web apps read it directly. Everything else (the mobile
apps, the Stripe card fields, the emails) gets a generated copy, committed to git and checked so it
can't go out of date.

The scripts mentioned here are described one by one in [scripts/README.md](scripts/README.md).

## The source file

`src/tokens.css` has four parts:

| Part | Holds |
|---|---|
| `:root { … }` (first block) | Every colour in the **light** appearance, as `--name: #hex;` |
| `.dark { … }` (first block) | The same colours in the **dark** appearance |
| `:root` / `.dark` (second blocks) | Layout values: the default radius, padding, shadows, motion timings |
| `@theme inline { … }` | What Tailwind sees: the radius scale, the fonts, and `--color-*` names pointing at the colours above |

A colour comes in up to four forms. `primary` is an example:

| Token | Use |
|---|---|
| `--primary` | Blue text and icons (the readable shade) |
| `--primary-fill` | The fill of a button or other filled control |
| `--primary-foreground` | The label on that fill (always white) |
| `--primary-muted` | A light tint used as a background (search field, selection) |

`brand` (green: savings, "Delivered by Effy") and `destructive` (rose: problems) follow the same
pattern.

## Where the theme goes

```
                           src/tokens.css
                                 │
     ┌───────────────────────────┼──────────────────────────────┐
     │ read directly             │ generated, committed          │ generated, committed
     ▼                           ▼                               ▼
customer-web                gen-compose-theme.mjs            email-kit
  app/globals.css             → compose/        (customer)     scripts/gen-email.mjs
back-office ┐                 → compose-driver/ (driver)        → src/generated/
shop-web    ┘ through       gen-stripe-appearance.mjs
  src/console.css             → stripe/storefront-appearance.ts            (customer-web)
                              → compose-payment-android/EffyPaymentAppearance.kt (Android)
                              → apps/customer-mobile/iosApp/iosApp/EffyPaymentAppearance.swift (iOS)
```

### Web apps: read directly

- **customer-web** imports `@effy/design-system/tokens.css` in `app/globals.css`. It uses the light
  colours only: the storefront never adds the `.dark` class.
- **back-office** and **shop-web** import `@effy/design-system/console.css`, which imports
  `tokens.css`. They switch to dark by adding the `.dark` class to the page.

Nothing is generated for the web. Tailwind turns each `--color-*` in `@theme` into classes such as
`bg-primary-fill` and `text-muted-foreground` when the app builds.

### Mobile apps: `gen-compose-theme.mjs`

Kotlin can't read CSS, so this script reads `tokens.css` and writes Kotlin source. The apps' Gradle
builds compile it straight from this package (`kotlin.srcDir(".../packages/design-system/compose")`),
so there's no copy step.

For each app (customer → `compose/`, driver → `compose-driver/`) it writes:

- **`EffyTokens.kt`**: `EffyColor.Light` and `EffyColor.Dark` objects with every colour, and the
  Material 3 colour schemes (`EffyLightColorScheme`, `EffyDarkColorScheme`).
  - Which CSS token becomes which Kotlin name is the `COLOR_TOKENS` list.
  - Which colour fills which Material 3 slot is the `M3_MAP` list. For example, `primaryFill` →
    `primary`, `primaryMuted` → `primaryContainer`, `card` → `surface`. Every slot is filled, so no
    Material default colour appears in the app.
  - A few Kotlin names have no token of their own and borrow one through `ALIASES`. For example,
    `success` uses `--brand` and `placeholder` uses `--muted-foreground`.
- **`EffyLayoutTokens.kt`**: the radius and spacing scale (`EffyRadius`, `EffySpacing`) and the
  promotion picture size (`EffyBanner`, from `packages/shared-types/src/banner-canvas.json`).
- **`EffyTypography.kt`**: Geist and Geist Mono (the font files come from `mobile-assets/font/`) and all
  fifteen Material 3 text styles. The sizes are written in the script; only the font comes from the
  assets.
- **`EffyStorefrontShape.kt`**: `--radius-sm`, `-md`, `-lg`, `-xl` and `-sheet` as Compose shapes.

Colours are read only when written as `#rrggbb` (or `rgba(...)` for `--scrim`). A colour written as
`var(...)` or `calc(...)` is skipped.

### Stripe card fields: `gen-stripe-appearance.mjs`

Stripe draws the card form itself, so it is given our colours through its "Appearance" settings. The
script reads `background`, `foreground`, `muted-foreground`, `primary`, `primary-fill`, `border`,
`input`, `ring`, `destructive` and `--radius-md`, and writes:

- **the web version**, light only, used by customer-web's `CardFields.tsx`;
- **an Android and an iOS version**, light and dark, for the customer app.

### Emails: `packages/email-kit`

`email-kit/scripts/lib/tokens.mjs` reads `tokens.css` and maps it to email roles in `ROLE_MAP` (page
background, text, button fill, error and others). `email:gen` writes `src/generated/tokens.generated.ts`
and `src/generated/theme.mjml`, then builds every template. Email clients handle dark mode badly, so
it has rules of its own: for example, no mid-grey text between `#707070` and `#909090`.

## What stops it going wrong

| Check | Fails when |
|---|---|
| `check-tokens.mjs` (`test`) | A colour isn't a Tailwind palette value, light and dark don't match, a pair fails contrast, the radius scale changed, or a comment broke the CSS |
| `check-token-usage.mjs` (`test`) | A web app uses a colour class for a token that doesn't exist |
| `check-compose-theme.mjs` (`tokens:check`) | A generated mobile or Stripe file differs from a fresh run |
| `check-email.mjs` (email-kit `test`) | The email tokens or built templates differ from the source |
| `scripts/check-no-emerald.sh`, `check-no-jade.sh` (repo root) | A retired brand colour appears anywhere, even in a comment |

## How to change a colour

1. **Edit `src/tokens.css`.** Change the token in the first `:root` block (light), the first `.dark`
   block (dark), or both. Use a Tailwind palette value: for example, blue-700 is `#1d4ed8`. If you
   change a `*-fill`, check that its white `*-foreground` label still reads on it.

2. **Regenerate the derived files:**
   ```sh
   pnpm --filter @effy/design-system tokens:gen
   pnpm --filter @effy/email-kit email:gen
   ```

3. **Run the checks:**
   ```sh
   pnpm --filter @effy/design-system test
   pnpm --filter @effy/design-system tokens:check
   pnpm --filter @effy/email-kit test
   ```
   - If contrast fails, pick a darker or lighter shade. Don't weaken the check.
   - If a contrast ratio written in a comment is now wrong, update the comment.

4. **Commit `tokens.css` and every generated file that changed.** `git status` lists them. Expect
   some of:
   - `compose/*.kt`, `compose-driver/*.kt`
   - `stripe/storefront-appearance.ts`, `compose-payment-android/EffyPaymentAppearance.kt`
   - `apps/customer-mobile/iosApp/iosApp/EffyPaymentAppearance.swift`
   - `packages/email-kit/src/generated/*`

5. **Rebuild what you want to see it on.**
   - Web apps: their next build or deploy.
   - Mobile apps: a new build.
   - Emails: a redeploy of the notifications service.

## Adding or renaming a token

Adding a token is the same as changing one, plus:

- **Define it in both `:root` and `.dark`.** `check-tokens.mjs` fails if it's in only one.
- **To use it in Tailwind classes**, add `--color-<name>: var(--<name>);` to `@theme inline`. Without
  that, `check-token-usage.mjs` fails on any class that uses it.
- **To use it in the mobile apps**, add it to `COLOR_TOKENS` in `gen-compose-theme.mjs`. Add it to
  `M3_MAP` as well if a Material 3 slot should use it.
- **If it is text on a background**, add the pair to `PAIRS` in `check-tokens.mjs` so its contrast is
  checked.

When renaming, search the repo for the old name first (`bg-<old>`, `text-<old>`, `EffyColor.*.<old>`).
`check-token-usage.mjs` catches web classes that weren't renamed. The Kotlin compiler catches mobile
uses.

## Don't

- **Edit a generated file by hand.** Anything headed `GENERATED … DO NOT EDIT` is overwritten by the
  next `tokens:gen`, and `tokens:check` fails until then.
- **Add a second token file**, or write colours directly in an app. There is one theme file.
- **Use a retired colour.** The old Effy Emerald and Jade brand colours are swept by
  `scripts/check-no-emerald.sh` and `scripts/check-no-jade.sh`, which fail even on a comment that
  names one. (Their values are in those scripts; they aren't repeated here for the same reason.)
