import Link from "next/link"

import type { BannerDTO } from "@effy/shared-types"

/**
 * The promotional hero. Minimal/derived in this slice (no CMS) — one banner today. Kept as a static
 * server component so it stays in the cached shell; a multi-slide client carousel is a later change.
 */
export function PromoCarousel({ banners }: { banners: BannerDTO[] }) {
  if (banners.length === 0) return null
  const banner = banners[0]
  const body = (
    <div className="flex flex-col gap-2 rounded-xl bg-primary px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
      <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">{banner.title}</h2>
      {banner.subtitle && (
        <p className="max-w-xl text-sm text-primary-foreground/90 sm:text-base">
          {banner.subtitle}
        </p>
      )}
    </div>
  )
  return (
    <div className="px-4 pt-4 sm:px-6">
      {banner.href ? (
        <Link href={banner.href} aria-label={banner.title}>
          {body}
        </Link>
      ) : (
        body
      )}
    </div>
  )
}
