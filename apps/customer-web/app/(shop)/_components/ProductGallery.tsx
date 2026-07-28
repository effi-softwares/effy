import Image from "next/image"

import type { StorefrontProductDetailDTO } from "@effy/shared-types"

/**
 * The product gallery (025 US2 / FR-022), laid out from the reference template.
 *
 * The reference's arrangement: a VERTICAL THUMBNAIL RAIL on the left and a large square image on the
 * right, both sitting on tinted tiles rather than inside bordered boxes. Below `md` the rail moves
 * under the image and runs horizontally, because a vertical rail on a phone eats the width the
 * photograph needs.
 *
 * ⚠ What this replaced: a single image with the remaining images rendered as non-interactive `<div>`s.
 * They LOOKED like thumbnails, so tapping one did nothing — worse than not showing them, because it
 * reads as a broken page rather than a limited one.
 *
 * ── Zero client JavaScript ──────────────────────────────────────────────────────────────────────
 *
 * The slides live in a scroll-snap track and the thumbnails are same-page anchors, so selection,
 * keyboard access and swipe all come from the browser. This route has a measured byte budget
 * (contracts/customer-ui.contract.md §1) and a JS carousel would spend it on behaviour the platform
 * already implements.
 */
export function ProductGallery({
  gallery,
  name,
}: {
  gallery: StorefrontProductDetailDTO["gallery"]
  name: string
}) {
  if (gallery.length === 0) {
    return (
      <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-background text-sm text-muted-foreground">
        No image
      </div>
    )
  }

  if (gallery.length === 1) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-background">
        <Image
          src={gallery[0].imageUrl}
          alt={gallery[0].alt ?? name}
          fill
          unoptimized
          sizes="(min-width: 768px) 40rem, 100vw"
          className="object-cover"
          priority
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col-reverse gap-3 md:flex-row">
      {/* The rail: vertical beside the image on desktop, horizontal beneath it on a phone. */}
      <div className="flex shrink-0 gap-3 overflow-x-auto overscroll-x-none md:w-[92px] md:flex-col md:overflow-visible">
        {gallery.map((m, i) => (
          <a
            key={i}
            href={`#product-slide-${i}`}
            aria-label={`Show image ${i + 1} of ${gallery.length}`}
            className="relative aspect-square w-[76px] shrink-0 overflow-hidden rounded-2xl bg-background transition-opacity hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary md:w-full"
          >
            <Image src={m.imageUrl} alt="" fill unoptimized sizes="92px" className="object-cover" />
          </a>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-none rounded-2xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {gallery.map((m, i) => (
          <div
            key={i}
            id={`product-slide-${i}`}
            className="relative aspect-square w-full shrink-0 snap-center bg-background"
          >
            <Image
              src={m.imageUrl}
              alt={m.alt ?? `${name} — image ${i + 1} of ${gallery.length}`}
              fill
              unoptimized
              sizes="(min-width: 768px) 36rem, 100vw"
              className="object-cover"
              priority={i === 0}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
