import { srcSet } from "@effy/shared-types"
import { clsx } from "clsx"

/**
 * A shopper picture — catalogue or promotion — at the size it is shown.
 *
 * `src` is the picture's permanent public address, so the browser keeps it. When the server says
 * smaller WebP copies exist (`widths`), they are offered first and the browser picks the smallest
 * that covers `sizes` at the screen's density; the original is the `<img>` underneath, which is what
 * a browser without WebP, or a picture whose copies are not made yet, shows. Nothing is named that
 * does not exist: a `<source>` naming a missing file shows a broken picture, it does not fall back.
 *
 * Plain `<picture>`, not `next/image`. Its loader cannot emit a format-typed `<source>`, so WebP
 * could not fall back to the original; and every picture here was `unoptimized` anyway. This also
 * keeps the component free of client JavaScript — it is on `/search`, which has the least room
 * under the bundle budget.
 *
 * `fill` matches `next/image`'s: the picture covers its positioned parent (`<picture>` is
 * `display: contents`, so the `<img>` is the box).
 */
export function CatalogImage({
  src,
  widths,
  alt,
  sizes,
  fill = false,
  priority = false,
  className,
}: {
  src: string
  widths?: readonly number[]
  alt: string
  /** As in `<img sizes>` — how wide the picture is drawn, which is what picks the copy. */
  sizes: string
  fill?: boolean
  /** The page's largest picture: fetched with the document, not when layout reaches it. */
  priority?: boolean
  className?: string
}) {
  return (
    <picture className="contents">
      {widths && widths.length > 0 && <source type="image/webp" srcSet={srcSet(src, widths)} sizes={sizes} />}
      <img
        src={src}
        alt={alt}
        sizes={sizes}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className={clsx(fill && "absolute inset-0 size-full", className)}
      />
    </picture>
  )
}
