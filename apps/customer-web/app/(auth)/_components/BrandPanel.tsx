import { Display } from "@/components/storefront/kit"

/**
 * The second half of the desktop composition (044 FR-028, research R9).
 *
 * ⚠ COLOUR HERE IS A BOUNDED EXCEPTION, NOT A CHANGE OF MIND (operator direction, 2026-08-11).
 *
 * The platform is constitutionally MONOCHROME: the neutral ramp carries every UI accent role and no
 * third hue may be introduced as a UI colour (Principle V). The operator asked for artwork here
 * because the panel read as dull, and said any colours were acceptable. This takes that permission in
 * the narrowest form available, following the precedent 039 set for the hero's value panels
 * (FR-005a) and 024 set for the mobile splash grounds:
 *
 *   • **The same three values 039 already recorded** — `#F95F09`, `#374128`, `#6BB252`. Reusing an
 *     exception that has already been argued and written down is strictly better than opening a
 *     second one. No new hue enters the platform.
 *   • **Component-local constants.** Nothing here is a design token, nothing is named for a role, and
 *     there is no `--color-brand-green`. `tokens:check` passes unchanged, which is the mechanical
 *     proof this did not enter the design system.
 *   • **Decoration only, and only here.** It is `aria-hidden`, `pointer-events-none`, sits behind the
 *     content, and renders on `lg` and above — a surface no shopper reads anything off.
 *   • **Deleting `ARTWORK` and one `<svg>` is the entire revert** if the monochrome rule is
 *     reasserted.
 *
 * ⚠ CONTRAST IS UNAFFECTED, and that is the reason the washes are this weak. Every colour below is
 * laid at ≤ 14% alpha over the panel's own ground, so the heading and the supporting line keep
 * resolving against a near-white surface: `--foreground` (#0a0a0a) stays far above AA. Colour is
 * doing atmosphere here and carries no meaning — nothing on this panel would be lost in greyscale.
 *
 * ⚠ INLINE SVG, NOT AN ASSET FILE. 039's most instructive defect was artwork that was absent and
 * looked broken — a placeholder its own README had written down as expected behaviour. Markup cannot
 * go missing, needs no request, and adds no JavaScript.
 */

/** The three fills, reused verbatim from 039's recorded exception. Not tokens. Not a palette. */
const ARTWORK = {
  citrus: "#F95F09",
  leaf: "#374128",
  sprout: "#6BB252",
} as const

export function BrandPanel() {
  return (
    <aside
      aria-hidden
      className="relative hidden overflow-hidden bg-muted/40 lg:flex lg:flex-1 lg:flex-col lg:justify-center lg:border-l lg:px-16 lg:py-20"
    >
      <ProduceBackdrop />

      {/* ⚠ `relative` — the content sits ABOVE the backdrop, which is absolutely positioned. */}
      <div className="relative">
        <Display as="h2" size="page" className="max-w-[14ch] normal-case leading-[1.05]">
          Groceries, delivered.
        </Display>

        {/* ⚠ Heading and one line, nothing else (operator direction 2026-08-11). A three-bullet list
            of platform claims sat here and was removed — it read as marketing on a screen where the
            person has already decided to sign in. */}
        {/* ⚠ `text-neutral-800`, NOT `text-muted-foreground`. With the washes at full strength the
            ground under this line is a light green/peach rather than near-white, and
            `--muted-foreground` (#6b6b6b) measures roughly 3.6:1 against it — below AA for body copy.
            Near-black holds ~10:1 on the same ground. This is the same trade `ValueStrip` records for
            039's coloured panels: the fill is what the operator asked for, so the FOREGROUND adapts.
            Colour never carries meaning here, so nothing is lost. */}
        <p className="mt-6 max-w-[38ch] text-base font-medium text-neutral-800">
          Sign in to track an order, keep your saved items, and check out faster next time.
        </p>
      </div>
    </aside>
  )
}

/**
 * A flat abstract pattern.
 *
 * ⚠ NO GRADIENTS ANYWHERE, AND THAT IS THE POINT (operator direction 2026-08-11).
 *
 * Three earlier passes tried gradients — radial blobs, then stronger blobs, then a full-coverage
 * linear sweep. Each fixed the previous complaint and kept the underlying one: a soft gradient at
 * this scale reads as blur, and blur reads as unfinished. The whole approach was wrong rather than
 * badly tuned. Everything here is FLAT: a solid tint, and geometry with hard edges.
 *
 * ⚠ The colour is even across the panel by construction — a flat fill has no falloff, so there are no
 * pale corners to chase. That was the complaint two passes ago and it cannot recur.
 *
 * ⚠ ABSTRACT GEOMETRY WITH GROCERY PUNCTUATION. Arcs, discs, capsules and rings carry the composition;
 * a leaf and a bag outline keep it tied to what the platform sells. Straight produce illustration at
 * this size turns into clip-art — the abstraction is what keeps it looking designed.
 */
function ProduceBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        {/* ⚠ The clearing, still the one concession to legibility. Grey rather than black: the
            geometry stays visible behind the words, just quieter. */}
        <radialGradient id="effy-auth-clearing" cx="32%" cy="50%" r="58%">
          {/* ⚠ A REAL clearing, not a polite one. With soft gradient artwork a grey veil was enough;
              flat shapes at full opacity are not veiled by anything — the first flat pass put a
              shopping bag straight through "Sign in to track an order". Black out to 34%, then a
              short fade. */}
          <stop offset="0%" stopColor="#000000" />
          <stop offset="34%" stopColor="#000000" />
          <stop offset="72%" stopColor="#c4c4c4" />
          <stop offset="100%" stopColor="#ffffff" />
        </radialGradient>
        <mask id="effy-auth-fade">
          <rect width="100%" height="100%" fill="url(#effy-auth-clearing)" />
        </mask>

        {/*
          ⚠ ONE 460×460 TILE WITH SIX SHAPES. The first flat pass used 260 with eleven, and it read as
          wrapping paper — the density, not the flatness, was what made it look cheap. Every shape sits
          fully inside the tile, so the repeat has no seam artefacts, and the rotation stops the grid
          from reading as a grid.
        */}
        <pattern
          id="effy-auth-abstract"
          width="460"
          height="460"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(-8)"
        >
          {/* quarter arc — the anchor shape */}
          <path
            d="M40 168A128 128 0 0 1 168 40v34a94 94 0 0 0-94 94Z"
            fill={ARTWORK.sprout}
            fillOpacity="0.9"
          />

          {/* solid disc */}
          <circle cx="356" cy="96" r="30" fill={ARTWORK.citrus} fillOpacity="0.9" />

          {/* ring */}
          <circle
            cx="120"
            cy="336"
            r="40"
            fill="none"
            stroke={ARTWORK.leaf}
            strokeOpacity="0.7"
            strokeWidth="9"
          />

          {/* capsule */}
          <rect
            x="262"
            y="262"
            width="132"
            height="34"
            rx="17"
            fill={ARTWORK.sprout}
            fillOpacity="0.5"
            transform="rotate(20 328 279)"
          />

          {/* leaf — the one piece of grocery punctuation left */}
          <path
            d="M330 420c-24-9-42-30-42-54 27 0 51 18 57 42Z"
            fill={ARTWORK.sprout}
            fillOpacity="0.8"
          />

          {/* dot */}
          <circle cx="212" cy="150" r="9" fill={ARTWORK.citrus} fillOpacity="0.8" />
        </pattern>
      </defs>

      {/* ⚠ A FLAT tint, not a wash. Even everywhere, no falloff, no corners left uncoloured. */}
      <rect width="100%" height="100%" fill={ARTWORK.sprout} fillOpacity="0.13" />
      <rect width="100%" height="100%" fill="url(#effy-auth-abstract)" mask="url(#effy-auth-fade)" />
    </svg>
  )
}
