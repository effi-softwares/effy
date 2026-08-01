# Research: Promotional Banner Templates & Home Carousel

**Feature**: 029-promotional-banner-carousel | **Phase**: 0 | **Date**: 2026-07-31

---

## R1 — The canonical banner canvas

**Decision**: **1200 × 600 px, a 2:1 landscape ratio.**

**Rationale**:

- **2:1 is the mobile-storefront norm.** Shopify's own guidance for a mobile banner is 1200 × 600, and
  the whole point of picking a norm is that an operator's existing instincts and existing assets fit it.
- **It is the shortest of the plausible ratios**, which matters because of a constraint 028 already
  wrote down. On a 402 dp phone with 16 dp side margins the render width is ~370 dp, so:
  - 2:1 → **185 dp** tall
  - 16:9 → 208 dp
  - 4:3 → 278 dp
  028's FR-017 caps any Home section at 50% of the viewport; on an ~874 dp screen, 2:1 lands at **21%**.
  4:3 would start crowding a screen whose job is to show products.
- **1200 px wide covers every supported density without upscaling.** 370 dp at 3× is 1110 physical px,
  so 1200 has headroom and never renders soft.

**Alternatives rejected**: 16:9 (video's ratio, not commerce's — taller for no benefit); 3:1 (a strip so
short the overlaid title, terms and code stop fitting at large text sizes); per-campaign ratios (the
spec's Out of Scope, and the thing that makes a carousel look broken — every card in a carousel must
share one ratio).

---

## R2 — Cropping stops being a problem when both ends are locked

**Decision**: The render area is **fixed at 2:1** and stored artwork is **normalised to 2:1**. On a
window wider than canonical the banner is **bounded by a maximum width and centred**, never stretched.

**Rationale — this is the insight the whole feature turns on.** FR-013 asks for "fill without
stretching, cropping only from outside the safe area". The instinct is to write clever crop logic. But
if the artwork is exactly 2:1 *and* the render box is exactly 2:1, the scale is uniform and **nothing
is ever cropped at all**. The requirement is satisfied by construction rather than by arithmetic.

That turns FR-013 from a rendering problem into a *validation* problem: keep the stored artwork
conformant and the renderer has nothing to decide. Which is why R3 matters more than it looks.

**Consequence for FR-003's "safe area"**: because nothing is trimmed, a trim-safe zone would be the
whole canvas and therefore meaningless. The safe area that *does* matter is the **text zone** — where
the platform draws live copy over the artwork (see R6). The spec's FR-003 is satisfied by defining
that, and it is the thing an operator actually needs to know.

---

## R3 — Where conformance is enforced

**Decision**: **Two layers.** The console normalises to exactly 1200 × 600 *before* upload; the admin
service **verifies dimensions server-side** when the key is saved, and refuses a non-conformant image.

**Rationale**: artwork goes **directly to S3** via a presigned PUT (028), so Lambda never sees the
bytes on the way in. Client-side normalisation alone is therefore a convention, not a guarantee — a
determined caller can PUT anything at the signed URL. FR-004 says stored artwork *must* conform, and a
"must" that only holds when the client cooperates is not a must.

**⚠ Verification reads image headers, not an image library.** A **ranged GET of the first 64 KB** plus a
small header parser answers "what shape is this?" without pulling `sharp` or any native binary into a
Lambda — the same move 024 made with its 25-line stdlib ICO writer, for the same reason.

**⚠ The three formats are not equally easy, and the first draft glossed over it.** PNG and JPEG are
simple; **WebP is a different container entirely** (RIFF, with three sub-formats — `VP8 `, `VP8L` and
`VP8X` — each encoding dimensions differently). Two honest options:

- **Parse all three**, accepting ~40 extra lines and three more test fixtures; or
- **Narrow the accepted banner formats to PNG and JPEG**, and say so in the console.

**Decision: parse all three.** `media.ts` already advertises WebP as acceptable for product media, and
quietly accepting it everywhere except banners is the kind of inconsistency an operator discovers by
being refused.

**⚠ A valid image whose dimensions sit beyond 64 KB.** A JPEG with a large EXIF block or embedded
thumbnail can push its SOF marker past the range. Refusing it would reject legitimate artwork. **On a
range miss the verifier re-requests a larger prefix (up to 1 MB) once**, and only then refuses — with a
message that says the file could not be read, not that its dimensions are wrong.

**Alternatives rejected**: server-side *resizing* (needs a real image library in the Lambda, and
silently changing an operator's artwork is the "silent crop" FR-008 forbids); client-side only
(bypassable); no enforcement (FR-004 becomes decorative).

---

## R4 — Where the canonical numbers live

**Decision**: A **JSON file**, `packages/design-system/src/banner-canvas.json`, read by the `.mjs`
generators and imported by TypeScript. The Compose values are emitted into the **existing**
`EffyLayoutTokens.kt`, which is already in `check-compose-theme.mjs`'s guarded target list.

**⚠ This corrects a first attempt that could not have worked.** The plan initially put the canvas in a
TypeScript module and had `gen-compose-theme.mjs` read it. That generator is plain Node ESM and
**parses `src/tokens.css` and nothing else** — it cannot import a `.ts` module. Phase 2 blocks every
other phase, so the mistake would have surfaced at the worst moment.

**Why JSON rather than the alternatives**:

| Option | Rejected because |
|---|---|
| `tokens.css` custom properties | A **category error**. `tokens.css` is the *brand* SSOT — colours, spacing, radii, typeface. A 1200 px image canvas is an **asset constraint**, not a style token, and the console needs it as a *number* to resize a file, which a CSS variable cannot give it. |
| A `.ts` module | The generator cannot import it (the original mistake). |
| A `.mjs` module | Importable by the generators, awkward from TypeScript without `allowJs`. |
| **JSON** ✅ | `readFileSync` + `JSON.parse` for the generators; `resolveJsonModule` for the console. Trivially supported at both ends, with no build-tool coupling. |

**⚠ Emit into `EffyLayoutTokens.kt`, NOT a new file.** `check-compose-theme.mjs` carries a **hardcoded**
target list whose own comment says *"EVERY file the generator writes must be listed here, or it is
unguarded."* A new `EffyBannerTokens.kt` would be generated and **silently ungated** — precisely the
failure the generate-and-check pattern exists to make impossible. `EffyLayoutTokens.kt` is the
audience-neutral layout vocabulary, it is already guarded, and a banner canvas belongs beside spacing
and radius.

**Consequence**: `tokens:check`'s committed output still changes (a real value is added), but the guard
covering it needs **no** modification — which is the outcome to want.

## R5 — The template file

**Decision**: A **generated SVG** at 1200 × 600 with the text zone marked, produced from the R4
constants by a script, **committed**, and downloadable from the console.

**Rationale**: FR-011a exists because a number in help text is a thing to mistype. A file an operator
opens in whatever tool they already use removes the arithmetic entirely.

**Generated, not hand-drawn**, so it cannot drift from the constants it illustrates — the same
authored-source → committed-artifact → drift-check shape as `tokens:gen` and `brand-gen`. A template
that says 1200 × 600 while the renderer expects something else would be worse than no template.

---

## R6 — The text zone, and guaranteeing contrast

**Decision**: Live text occupies the **lower-left region**, inset from the edges. The platform draws a
**gradient scrim** behind it — opaque at the bottom-left, clear at the top-right — and the scrim is
what guarantees contrast (FR-031a), not the operator's artwork.

**Rationale**: FR-031 keeps the message as real text over the artwork, which means the platform is
responsible for legibility over an image it has never seen. 028 already learned this and used a flat
72%-opacity scrim across the whole banner — which works, and also washes out the entire photograph.
A gradient protects the type where the type actually is and leaves the rest of the artwork visible,
which is the point of having artwork.

**⚠ Under the monochrome palette there is no hue to separate text from image.** The scrim is doing all
of the work, so its opacity at the text end must be chosen against the *worst* case (a light,
high-detail photograph) rather than a pleasant one.

**FR-031b follows directly**: the console must tell the operator that the lower-left carries copy, so
they design it quiet instead of putting their own headline there and finding it double-printed.

---

## R7 — Placement as data

**Decision**: One new column on `promo_code` — `banner_placement`, a text CHECK enum
(`'carousel' | 'inline'`) defaulting to **`'carousel'`**. `banner_position` keeps its meaning as
*order within a placement*.

**Rationale**: FR-027 makes placement exclusive, so it is a property of the promotion and belongs
beside the rest of its advertising facet. A CHECK enum matches the house style (007/009/019/027 — text
CHECK enums, no native PG enums).

**The default is `'carousel'` and that is a deliberate safety choice** (FR-027a): an operator who marks
a promotion advertisable without thinking about placement gets it in the offers section, which is where
a shopper expects to find offers. Defaulting to `inline` would scatter unconsidered promotions through
the merchandising.

---

## R8 — Composing two placements

**Decision**: `composeHome` gains a `HomeBlock.Offers` case. Carousel-placed banners collect into one
`Offers` block at a fixed point in the sequence; inline-placed banners keep 028's existing
position-interleaving into `HomeBlock.Promo`.

**Rationale**: the interleaving logic is already a **pure function** with tests covering the clamp, the
empty cases and the ordering (028 T005/T006). Extending it is a handful of lines and a handful of new
assertions; the alternative — branching inside the `LazyColumn` — would put layout and merchandising
rules back in the same place 028 deliberately separated them.

**Where the Offers block sits**: after the category row and before the first merchandising section.
That is the placement the reference platforms use and the one that answers "what is on offer?" before
the shopper has to look for it (SC-012).

---

## R9 — Bounding the carousel

**Decision**: The Offers block carries at most **6** banners; beyond that the earliest-ordered win.
Anything dropped is **logged**, never silently discarded.

**Rationale**: FR-026 asks for a bound. Six is roughly where a swipeable set stops being explorable —
and Baymard's carousel research (via 028) is blunt that most shoppers never see every slide, so an
unbounded set mostly stores promotions nobody will look at. Logging the drop matters because a silent
cap reads to an operator as "my promotion did not save".

---

## R10 — Reserving the space before artwork arrives

**Decision**: The banner's box is laid out at the 2:1 ratio **before** the image resolves, with 028's
shimmer inside it.

**Rationale**: FR-016 and SC-005 require zero layout shift. Because the ratio is fixed (R2) the final
height is known without the image, so the space can be correct from the first frame. 028's product
tiles already do this; the banner is the same problem with a different ratio.

---

## R11 — Telemetry

**Decision**: Specified, **not emitted** — consistent with 013/014/015/020/021/022/027/028.

| Event | Properties | Why |
|---|---|---|
| `promo_banner_seen` | `promoKey`, `placement`, `index` | Whether banners in the carousel past the first are ever reached |
| `promo_banner_tapped` | `promoKey`, `placement`, `index` | The only honest read on R6's contrast and on whether a monochrome banner works |
| `offers_section_swiped` | `maxIndex` | Whether the bound in R9 is even reached |

**⚠ This is now the ninth consecutive slice to defer mobile telemetry**, and this feature is the one
that most needs it: SC-012 and the whole "does a hueless banner draw the eye" question are behavioural,
and no amount of code review answers them. Recorded in Complexity Tracking, and flagged as a genuine
and compounding cost rather than a formality.

---

## R12 — Closing 028's unwalked loop

**Decision**: US5 is a first-class user story with its own tasks, not a checklist item appended to
someone else's phase.

**Rationale**: 028 shipped the banner path and signed off without ever running it, so **no promotional
banner has rendered on this platform**. Every claim 029 makes about banners rests on that path working.
Giving the walk its own story is what stops it being deferred a second time — and 020's and 027's
experience is that the first live run is where the real defect appears.

---

## Resolved unknowns

| Unknown | Resolution |
|---|---|
| Canonical size and ratio | R1 — 1200 × 600, 2:1 |
| Crop / stretch behaviour | R2 — lock both ends; cropping ceases to exist |
| Enforcing conformance | R3 — client normalises, server verifies via header parse over a ranged GET |
| One definition, two consumers | R4 — design-system + `tokens:gen`; ⚠ `tokens:check` output changes |
| The template file | R5 — generated SVG, committed, drift-checked |
| Text legibility over unknown artwork | R6 — gradient scrim, platform-guaranteed |
| Placement | R7 — `banner_placement` CHECK enum, defaults to `carousel` |
| Two placements in one list | R8 — extend the pure `composeHome` with an `Offers` block |
| Carousel bound | R9 — 6, with the drop logged |
| Layout shift | R10 — 2:1 box reserved before the image resolves |
| Telemetry | R11 — specified, deferred (ninth slice; flagged) |
| 028's unwalked loop | R12 — its own user story |

**Sources**: [Shopify mobile banner sizing](https://simicart.com/blog/shopify-mobile-banner-size/) ·
[Shopify image size guidelines](https://www.shopify.com/blog/image-sizes) ·
[Meta carousel specs and safe zones](https://admanage.ai/blog/meta-carousel-ad-specs) ·
[Baymard homepage carousel requirements](https://baymard.com/blog/homepage-carousel) (via 028 R7).
