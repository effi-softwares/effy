# Hero artwork (feature 039)

**Expected file**: `hero-1.jpg`

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

**FR-011**: when `hero-1.jpg` is not present, the hero renders a neutral on-brand placeholder that
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

**So a replacement must be:** roughly **2.2:1**, with the left ~45% a **flat, pale, low-detail area**,
and subject matter kept to the right. Artwork that is dark, busy, or light-on-the-right will make the
headline unreadable **with nothing failing** — no test, no guard, no build error, in either appearance.
If a future asset cannot meet that, put the scrim back rather than shipping unreadable type: the
`Scrim` primitive is still in `components/storefront/kit.tsx`, and it needs its light-tone variant
restored (removed with the hero's use, so it is not left as untested dead code).

## Constraints

- **One image.** No rotating hero carousel unless the operator asks for one (039 Assumptions).
- It must read acceptably in **both** light and dark appearance — the same photograph is shown in each,
  which is exactly why the thing guaranteeing text contrast over it cannot itself be the thing that
  inverts (029's scrim defect, recorded in that slice's post-mortem).
