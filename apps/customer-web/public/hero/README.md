# Hero artwork (feature 039)

**Expected files**: `hero-1.webp` … `hero-6.webp` — **exactly six**, rotated every ten seconds.

## Encoding — do not commit the source PNGs

⚠ **Only the `.webp` files belong in this directory.** `public/` is served verbatim, so anything left
here is shipped: the six source PNGs sat at ~2 MB each, which is 2 MB on the wire for a visitor who
would never see it. They were deleted after encoding, along with the retired single-hero
`hero-1.jpg`. Keep the originals somewhere outside the repo — nothing here can reconstruct them.

| | |
|---|---|
| six source PNGs | **11.1 MB** |
| six WebP @ q72 | **334 KB** |
| the single JPEG this replaced | 311 KB |

So the whole rotation costs about what one hero cost before. Regenerate with `sharp`:

```js
sharp(`hero-${i}.png`).webp({ quality: 72, effort: 6 }).toFile(`hero-${i}.webp`)
```

Checked for **banding in the flat colour zones** — where lossy compression shows up directly behind
the type — by comparing a 1:1 crop against the PNG. None visible at q72. Check again if the quality
is ever lowered; that is the failure this format choice risks, and it appears exactly where the
headline sits.

AVIF is ~30% smaller again (233 KB) but needs a `<picture>` fallback for the browsers that lack it.
WebP already lands at parity with the previous cost, so the fallback machinery was not worth it.

## What this directory is

The customer storefront's hero image. It is **operator-supplied photographic content, not a design
token** (039 research R2).

That distinction is load-bearing, not pedantry:

- The constitution's monochrome rule (Principle V, v1.11.0) governs the design **system** — tokens,
  accents, chrome. It does not govern photographs. Product cards already show full-colour imagery.
- The colour guards (`check-tokens`, `check-no-emerald`, `check-no-jade`) scan CSS and source for hex
  values. A JPEG's pixels are invisible to them, so this asset is mechanically compliant by
  construction — there is nothing to exempt and no guard to suppress.
- What keeps the *page* monochrome is that every piece of UI chrome around and over this image resolves
  to the neutral ramp, and any text placed over it is made legible by a scrim rather than by hoping the
  artwork cooperates (FR-007).

## Absence is a supported state, not a broken one

**FR-011**: when no artwork is present, the hero renders a neutral on-brand placeholder that
reserves the same box. It must **never** render a broken image frame, and no layout shift may occur when
the asset later arrives (SC-001).

**Dropping the file in works immediately in `next dev`** — just refresh. In production the path is
resolved once at build time, so a **rebuild** is needed there.

⚠ It did **not** always work that way, and the first version of this note told operators to expect a
rebuild in dev too. That was a defect dressed up as a documented limitation: `lib/hero-asset.ts` resolved
the asset into a module-scope `const`, which a long-running dev server evaluates exactly once. An
operator who added the artwork while `next dev` was running kept seeing the neutral placeholder — with
the file on disk, serving fine over HTTP — because a cached `null` had outlived the fact it described.

**The lesson is the shape of the failure, not the caching.** A supported empty state that is
indistinguishable from a bug is worse than no fallback at all: the operator cannot tell "no artwork yet"
from "the hero is broken", and neither can anyone they report it to. `heroImageUrl()` now re-checks on
every render in development and keeps the build-time constant in production.

## ⚠ A replacement asset MUST keep a pale, flat, left-hand text zone

The hero draws **no scrim** over this image (operator decision, 2026-08-07 — a veil visibly faded the
artwork, and the reference has none). The headline, supporting line and both buttons sit directly on the
picture's left half in **fixed black**.

That means legibility is a property of **this asset**, not something the component enforces. FR-007 is
still satisfied — by its "controlled zone" limb rather than its "scrim" limb — but the guarantee now
lives here, in a file, instead of in code.

**So a replacement must be:** roughly **2:1**, with the left ~45% a **flat, pale, low-detail area**,
and subject matter kept to the right. Artwork that is dark, busy, or light-on-the-right will make the
headline unreadable **with nothing failing** — no test, no guard, no build error, in either appearance.

⚠ **And the promise must now hold six times over.** The current set uses six different coloured
grounds, so every one was measured before it was adopted — sampling the text zone (left 45%, middle
70% vertically) and taking the *worst* pixel, not the average:

| | black headline | supporting line @ `/75` | @ `/80` |
|---|---|---|---|
| hero-1 | 6.85:1 | 5.02:1 | 5.48:1 |
| hero-2 | 5.82:1 | **4.47:1 ✗** | 4.82:1 |
| hero-3 | 13.21:1 | 7.92:1 | 9.16:1 |
| hero-4 | 12.72:1 | 7.74:1 | 8.92:1 |
| hero-5 | 10.77:1 | 6.94:1 | 7.87:1 |
| hero-6 | 8.71:1 | 5.99:1 | 6.66:1 |

The supporting line was `text-black/75` and measured **4.47:1 on hero-2** — three hundredths under
the 4.5:1 body-text minimum, on one ground out of six. It is now `/80`. **Measure any replacement the
same way**; white type fails on all six, so the fixed-black choice is not negotiable here.
If a future asset cannot meet that, put the scrim back rather than shipping unreadable type: the
`Scrim` primitive is still in `components/storefront/kit.tsx`, and it needs its light-tone variant
restored (removed with the hero's use, so it is not left as untested dead code).

## Constraints

- **Exactly six images** (operator direction, 2026-08-09 — supersedes 039's "one image, no rotating
  carousel" assumption). The rotation is CSS-only and its keyframes divide the cycle into six fixed
  ten-second turns, so the count is not free: `lib/hero-asset.ts` fails **typecheck** if the list
  length and the `.fx-hero` keyframe percentages fall out of step, and `Hero` renders a **still**
  first image rather than rotating a partial set — four artworks in a six-slot cycle would show two
  dead turns, which reads as a loading fault rather than a missing file.
- **Changing the dwell is not just the duration.** The keyframe stops in `.fx-hero` encode the turn
  length as well as the count; see the comment there for the arithmetic. Nothing catches a wrong
  dwell mechanically — the symptom is a one-frame flicker of page background at each handover.
- It must read acceptably in **both** light and dark appearance — the same photograph is shown in each,
  which is exactly why the thing guaranteeing text contrast over it cannot itself be the thing that
  inverts (029's scrim defect, recorded in that slice's post-mortem).
