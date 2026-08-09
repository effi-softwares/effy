import Link from "next/link"

import { ARTWORK_CANVASES, type ArtworkCanvasKey, canvasForTileSize } from "@effy/shared-types"

import { MediaFrame, SectionShell } from "@/components/storefront/kit"

/**
 * The offers bento (042 US2) — mixed-size offer tiles that reflow to one column on a phone.
 *
 * ⚠ THE COPY NEVER SITS ON THE ARTWORK, AND THAT IS THE WHOLE LEGIBILITY STRATEGY (FR-034, research
 * R4). It is worth being explicit about why, because the obvious design does the opposite.
 *
 * Text over an operator-supplied photograph has no contrast guarantee — the artwork check verifies
 * DIMENSIONS, not brightness — and the platform has already lost time to this: 029 shipped a scrim
 * that bleached the photo in light mode, because the artwork is the same picture in both appearances
 * while everything around it inverts. The industry ranking research found puts "text outside the
 * image, on a solid panel" FIRST and "a scrim over the artwork" LAST.
 *
 * So a tile is a photograph and a panel beside it, never a photograph with words on it. That does not
 * MANAGE the contrast problem, it REMOVES it: the copy sits on a design-system token, whose contrast
 * is already machine-checked at AA in both appearances, and no pixel decoder is needed anywhere on
 * the platform. There is deliberately no `variant` field an operator could use to opt back in.
 *
 * ⚠ ZERO CLIENT JAVASCRIPT. Every part of this is a server component; the grid is CSS. The guest
 * bundle has about 1 KB of headroom against a hard gate, which a carousel or a lightbox would spend.
 */

/** What the renderer passes in — the tile as authored, plus its resolved artwork URL. */
export interface OfferTile {
  id: string
  size: string
  eyebrow?: string
  headline: string
  supporting?: string
  ctaLabel: string
  ctaHref: string
  ctaStyle?: string
  imageUrl: string | null
  /** Empty string is a DECLARATION that the artwork is decorative, never a default (FR-026). */
  alt: string
}

/**
 * How each authored size occupies the 4-column desktop grid.
 *
 * ⚠ SPANS ARE A LOOKUP, NOT ARITHMETIC, and the classes are written out in full because Tailwind
 * scans source text — a computed `col-span-${n}` produces no CSS at all and the tile silently
 * collapses to one column. That failure renders, which is the kind this project keeps finding.
 */
const SPAN: Record<string, string> = {
  large: "sm:col-span-2 sm:row-span-2",
  wide: "sm:col-span-2",
  tall: "sm:row-span-2",
  small: "",
}

/**
 * The tile's own artwork shape, taken from the canvas set rather than hardcoded.
 *
 * ⚠ The storefront's existing banner components hardcode `aspect-[2/1]` in three places while the
 * platform's canvas definition lives in `shared-types` — so the promise that artwork is never cropped
 * is already false on this surface. Reading the ratio from the same file the validator checks
 * uploads against is what makes it true.
 */
function ratioFor(size: string): string {
  const key = canvasForTileSize(size)
  if (!key) return "1 / 1"
  const c = ARTWORK_CANVASES[key as ArtworkCanvasKey]
  return `${c.width} / ${c.height}`
}

export function OffersBento({ tiles, title }: { tiles: OfferTile[]; title?: string }) {
  /**
   * ⚠ NOTHING, NOT AN EMPTY FRAME (FR-029). A promotional block with a placeholder in it is
   * indistinguishable from one whose images failed to load — and the second is what a shopper will
   * assume, because it is what they have seen before elsewhere. A section that has nothing to say
   * says nothing.
   */
  if (tiles.length === 0) return null

  return (
    <SectionShell title={title ?? "Offers"}>
      {/*
        ⚠ THE DEGRADATION IS THE GRID'S, NOT A SET OF LAYOUTS (FR-018). There is no "3-tile layout"
        and no "2-tile layout" to fall out of step with each other: tiles declare their own span and
        `grid-auto-flow: dense` fills whatever gaps remain. Five tiles compose a bento; three compose
        a coherent smaller one; one fills the row. The alternative — a branch per count — is five
        layouts to keep working and five ways to be wrong.

        ⚠ ONE COLUMN BELOW `sm`, unconditionally. Every span above is `sm:`-prefixed, so on a phone
        the spans do not apply at all rather than being overridden. An unprefixed `col-span-2` in a
        one-column grid is the same backwards-layout defect 039 shipped with `order-first`.
      */}
      <ul className="grid grid-cols-1 gap-4 sm:auto-rows-[minmax(0,14rem)] sm:grid-cols-4 sm:[grid-auto-flow:dense]">
        {tiles.map((tile) => (
          <li key={tile.id} className={`min-w-0 ${SPAN[tile.size] ?? ""}`}>
            <Tile tile={tile} />
          </li>
        ))}
      </ul>
    </SectionShell>
  )
}

function Tile({ tile }: { tile: OfferTile }) {
  return (
    /*
      ⚠ THE TILE IS NOT A LINK CONTAINING A BUTTON (FR-027). A stretched link wrapping a call to
      action nests interactive content, which is invalid HTML, gives a screen reader two overlapping
      targets for one destination, and makes the inner control unreachable by pointer. The tile is a
      panel; the CTA is the one interactive thing in it.
    */
    <div className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card">
      {tile.imageUrl !== null && (
        <div className="w-full shrink-0" style={{ aspectRatio: ratioFor(tile.size) }}>
          <MediaFrame
            src={tile.imageUrl}
            alt={tile.alt}
            rounded="rounded-none"
            className="h-full"
            sizes="(max-width: 640px) 100vw, 50vw"
          />
        </div>
      )}

      {/*
        The copy panel — a token ground, beside or below the artwork, never on it. `bg-card` and
        `text-card-foreground` are a machine-checked AA pair in both appearances, which is exactly the
        guarantee a photograph cannot give.
      */}
      <div className="flex min-w-0 flex-1 flex-col gap-2 p-4 text-card-foreground">
        {tile.eyebrow && (
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {tile.eyebrow}
          </p>
        )}
        <h3 className="text-base font-semibold leading-snug">{tile.headline}</h3>
        {tile.supporting && (
          <p className="text-sm text-muted-foreground">{tile.supporting}</p>
        )}

        <div className="mt-auto pt-2">
          <Link
            href={tile.ctaHref}
            className={
              tile.ctaStyle === "link"
                ? "inline-flex min-h-11 items-center text-sm font-medium underline underline-offset-4"
                : "inline-flex min-h-11 items-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground"
            }
          >
            {tile.ctaLabel}
            {/*
              ⚠ THE OFFER'S NAME IS IN THE ACCESSIBLE NAME, not only in the visible label. Six tiles
              whose controls all read "Shop now" give a screen-reader user navigating by link a list
              of six identical entries and no way to tell which offer each belongs to — the same
              defect 028 found with five identical "See all" controls.
            */}
            <span className="sr-only"> — {tile.headline}</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
