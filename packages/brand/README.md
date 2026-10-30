# @effy/brand

The Effy logo and mark, and the only sanctioned way to produce them.

**One rule: derived assets are GENERATED, never hand-edited.**

Every app icon, splash image and favicon comes from the authored vectors in this package. If you edit
a PNG in `apps/**` by hand, `brand:check` will fail and your edit will be overwritten by the next
regeneration.

## The logo

- **The wordmark** - `effy.` in Geist Bold (tracking −0.05em, kerning on, no ligatures), outlined to
  paths, with a green full stop. `src/wordmark.svg`.
- **The mark** - `e.`, the wordmark's first letter and its full stop. `src/logo.svg`. Every icon is
  this mark in white and green on a near-black tile.

Ready-to-use files are in [`svg/`](svg/):

| File | Use |
|---|---|
| `effy-logo-light.svg` | The logo on a light ground - near-black word, green full stop |
| `effy-logo-dark.svg` | The logo on a dark ground - white word, the same green full stop |
| `effy-icon.svg` | The icon - the same file each web app serves as its tab icon |

| Colour | Value |
|---|---|
| Word / tile | `#09090b` |
| Word on dark / letter on the tile | `#ffffff` |
| Full stop | `#0d7a40` - the same in every appearance |

The storefront header draws the wordmark as live type (`BrandMark.tsx`), not from these files; the
two agree because the files were outlined from that typeface at that weight and tracking.

## Layout

```
src/wordmark.svg      THE authored wordmark (its light appearance).
src/logo.svg          THE authored mark ("e."), in the wordmark's light colours.
src/colourways.mjs    The tile colourway, the wordmark's two appearances, mono - colour only.
src/compositions.mjs  Occupancy / ground / corner radius / alpha per target frame - no colour.
src/targets.mjs       surface × slot × composition × output path, and the svg/ exports.
scripts/              The generator, the drift check, and their libs.
test/                 node --test: composition maths, colourways, ICO bytes, alpha.
svg/                  GENERATED. The standalone logo and icon files.
assets.manifest.json  GENERATED. Every asset + its sha256. Input to the drift check.
```

## Commands

```bash
make brand-gen        # regenerate every asset on every surface
make brand-check      # fail if committed assets differ from generated

pnpm --filter @effy/brand test    # unit tests + the drift check
```

`brand:check` also rides `pnpm test` (via `turbo run test`) because it is this package's `test`
script - the same wiring `@effy/design-system` uses for `check-tokens.mjs`. Note that `make lint` in
this repo is **Terraform-only** and does not run it.

## One identity on every surface

Customer, shop, driver and back-office carry the **same** icon. (Until this mark the brand was a shopping bag
drawn in three colourways so the three could be told apart; that mark and its colourways are gone.)
Since 092 the driver app has a variant - the same "e.", its full stop a blue steering wheel
(`src/logo-driver.svg`, colourway `driver`) - so drivers can tell their app from the shop.

**These colours are not design tokens.** They are restated in `src/colourways.mjs` and must never be
imported from, or exported into, `@effy/design-system` - this package does not depend on it.

**Mobile splash ground.** iOS's launch colour is generated from `SPLASH_GROUND`; Android's
`splash_background` in each app's `values/` and `values-night/colors.xml` is hand-maintained and must
equal it.

## Known limitation: determinism is per-platform

`brand:gen` is byte-identical **on the same platform** - this is verified, and it is what `brand:check`
relies on. It is **not proven across platforms**. Both `@resvg/resvg-js` and `sharp` ship
per-platform prebuilt binaries, so a macOS-authored asset set and a Linux-regenerated one may differ
by a pixel without anybody having changed anything.

Practical consequences:

- Run `brand:check` on the platform the assets were authored on. If CI runs on Linux against
  macOS-generated assets, a failure may mean *"different renderer"*, not *"someone edited an icon"*.
- **When a check fails on a machine that did not author the assets, compare the `toolchain` block in
  `assets.manifest.json` first.** It records the exact resolved versions for precisely this reason.
- A version bump of either library is a **regeneration event**, not a transparent upgrade. Bump it
  deliberately, regenerate, and commit the result in the same change.

This is recorded rather than solved. See research R8 in
[specs/024-brand-icons-splash/research.md](../../specs/024-brand-icons-splash/research.md).
