# @effy/brand

The Effy brand mark, and the only sanctioned way to produce it.

**One rule: derived assets are GENERATED, never hand-edited.**

Every app icon, splash image and favicon on all six client surfaces comes from one authored vector in
this package. If you edit a PNG in `apps/**` by hand, `brand:check` will fail and your edit will be
overwritten by the next regeneration. That is the point — see
[specs/024-brand-icons-splash](../../specs/024-brand-icons-splash/spec.md), User Story 4.

## Layout

```
src/logo.svg          THE authored mark. Emerald colourway is the committed master.
src/colourways.mjs    Emerald · Sky · Neutral · Mono — colour only, no geometry.
src/compositions.mjs  Padding / background / alpha per target frame — no colour.
src/targets.mjs       surface × slot × colourway × composition × output path.
scripts/              The generator, the drift check, and their libs.
test/                 node --test: composition maths, colourways, ICO bytes, alpha.
assets.manifest.json  GENERATED. Every asset + its sha256. Input to the drift check.
```

## Commands

```bash
make brand-gen        # regenerate every asset on every surface
make brand-check      # fail if committed assets differ from generated

pnpm --filter @effy/brand test    # unit tests + the drift check
```

`brand:check` also rides `pnpm test` (via `turbo run test`) because it is this package's `test`
script — the same wiring `@effy/design-system` uses for `check-tokens.mjs`. Note that `make lint` in
this repo is **Terraform-only** and does not run it.

## The three colourways

| Colourway | Surfaces | Body | Fold |
|---|---|---|---|
| **Emerald** | customer-web · customer-mobile | `#10b981` | `#065f46` |
| **Sky** | shop-web · shop-mobile | `#0ea5e9` | `#075985` |
| **Neutral** | back-office | `#525252` | `#262626` |

The navy outline `#0C1D36` and off-white tag `#F4F5F7` are **shared by every colourway**. That is what
keeps the three marks recognisably one mark; a colourway that changes them is invalid.

## Two rules that are easy to break

**The sky blue is not a design token.** It exists only inside the mark and the assets derived from it. It
must never be imported from, or exported into, `@effy/design-system`, and it must never touch a
Compose theme or any surface's UI accent. The shop app's interface is emerald, exactly like every
other surface (constitution Principle V; spec FR-014a).

**The authored master is Emerald, not the original artwork.** The supplied logo used `#0FB57E` /
`#047857` — values the constitution retired in v1.10.0 and that `scripts/check-no-jade.sh` rejects.
The committed master is recoloured into the live palette, so the guard passes with **no exemption**.

## Known limitation: determinism is per-platform

`brand:gen` is byte-identical **on the same platform** — this is verified, and it is what `brand:check`
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
