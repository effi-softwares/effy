import type { StorefrontProductDetailDTO } from "@effy/shared-types"

import { CatalogImage } from "@/components/storefront/CatalogImage"

/**
 * The product gallery: a vertical thumbnail rail beside a large square image (below `md`, the rail runs
 * horizontally under it), on tinted tiles. Zero client JavaScript: slides in a scroll-snap track and
 * thumbnails as same-page anchors, so selection, keyboard and swipe come from the browser.
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
      <div className="flex aspect-square w-full items-center justify-center rounded-lg border bg-muted text-sm text-muted-foreground">
        No image
      </div>
    )
  }

  if (gallery.length === 1) {
    return (
      <div className="relative aspect-square w-full overflow-hidden rounded-lg border bg-muted">
        <CatalogImage
          src={gallery[0].imageUrl}
          widths={gallery[0].imageWidths}
          alt={gallery[0].alt ?? name}
          fill
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
      <div className="flex shrink-0 gap-3 overflow-x-auto overscroll-x-none md:w-16 md:flex-col md:overflow-visible">
        {gallery.map((m, i) => (
          <a
            key={i}
            href={`#product-slide-${i}`}
            aria-label={`Show image ${i + 1} of ${gallery.length}`}
            className="relative aspect-square w-16 shrink-0 overflow-hidden rounded-md border bg-muted hover:border-foreground md:w-full"
          >
            <CatalogImage src={m.imageUrl} widths={m.imageWidths} alt="" fill sizes="92px" className="object-cover" />
          </a>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 snap-x snap-mandatory overflow-x-auto overscroll-x-none rounded-lg border [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {gallery.map((m, i) => (
          <div
            key={i}
            id={`product-slide-${i}`}
            className="relative aspect-square w-full shrink-0 snap-center bg-muted"
          >
            <CatalogImage
              src={m.imageUrl}
              widths={m.imageWidths}
              alt={m.alt ?? `${name} — image ${i + 1} of ${gallery.length}`}
              fill
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
