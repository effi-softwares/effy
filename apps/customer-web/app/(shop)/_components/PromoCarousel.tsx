import Image from "next/image"
import Link from "next/link"

import type { BannerDTO } from "@effy/shared-types"

/**
 * The promotional hero (025 US1 / FR-019).
 *
 * ⚠ What this replaced: a single flat block of brand-coloured background with a heading on it. It was
 * the first thing on the storefront and it looked like a placeholder, because it was one.
 *
 * ⚠ `BannerDTO` has carried `imageUrl` since 019 — the old component simply never read it. So the
 * "imagery" half of FR-019 needed no contract change and no backend work at all; it needed someone to
 * render the field.
 *
 * ── Zero client JavaScript ──────────────────────────────────────────────────────────────────────
 *
 * Scroll-snap does the paging and same-page anchors do the dots, so this stays a server component in
 * the cached shell. A JS carousel here would cost the guest budget (contracts/customer-ui.contract.md
 * §1) for behaviour the browser already implements, including keyboard scrolling.
 *
 * ⚠ NO smooth-scroll behaviour anywhere (operator decision). Anchor jumps are instant. This also
 * removes the reduced-motion question entirely — there is no motion left to reduce.
 */
export function PromoCarousel({ banners }: { banners: BannerDTO[] }) {
  // ⚠ A promotional slot with no promotional ARTWORK is not a promotion — it is a coloured rectangle.
  //
  // `core-api` derives a minimal welcome banner when no CMS content exists (storefront service,
  // `banners()`), and that derived banner has no image. Rendering it fell back to a solid brand fill:
  // a large green block sitting directly under a hero that already says the same thing. Two slogans
  // stacked, one of them in a box, is worse than one slogan.
  //
  // So the carousel shows only banners that actually carry artwork, and renders nothing at all when
  // none do. This also means the slot stays correct once real campaign imagery exists — no code
  // change needed, the banners simply start appearing.
  const slides = banners.filter((b) => Boolean(b.imageUrl))
  if (slides.length === 0) return null

  const multiple = slides.length > 1

  return (
    <div className="px-4 pt-4 sm:px-6">
      <div
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-none [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        // A single promotion is not a carousel — don't announce it as one.
        role={multiple ? "region" : undefined}
        aria-label={multiple ? "Promotions" : undefined}
      >
        {slides.map((banner) => (
          <Slide key={banner.key} banner={banner} single={!multiple} />
        ))}
      </div>

      {multiple && (
        <nav aria-label="Promotion navigation" className="mt-3 flex justify-center gap-2">
          {slides.map((banner, i) => (
            <a
              key={banner.key}
              href={`#promo-${banner.key}`}
              className="size-2 rounded-full bg-muted-foreground/30 transition-colors hover:bg-muted-foreground"
              aria-label={`Go to promotion ${i + 1}: ${banner.title}`}
            />
          ))}
        </nav>
      )}
    </div>
  )
}

function Slide({ banner, single }: { banner: BannerDTO; single: boolean }) {
  const body = (
    <div
      id={`promo-${banner.key}`}
      className={`relative flex min-h-[10rem] snap-start flex-col justify-end overflow-hidden rounded-xl sm:min-h-[14rem] ${
        single ? "w-full" : "w-[85%] shrink-0 sm:w-[60%] lg:w-[48%]"
      }`}
    >
      {/* Every slide is guaranteed artwork — PromoCarousel filters out banners without it, so there
          is no image-less fallback to render. `imageUrl!` is safe for exactly that reason. */}
      <Image
        src={banner.imageUrl!}
        alt=""
        fill
        unoptimized
        sizes="(min-width: 1024px) 48vw, (min-width: 640px) 60vw, 85vw"
        className="object-cover"
        priority
      />
      {/* A scrim, so the copy stays legible over any photograph rather than only over the ones we
          happened to test with. */}
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
      <div className="relative flex flex-col gap-1 p-5 text-white sm:p-7">
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">{banner.title}</h2>
        {banner.subtitle && (
          <p className="max-w-md text-sm text-white/90">
            {banner.subtitle}
          </p>
        )}
      </div>
    </div>
  )

  return banner.href ? (
    <Link href={banner.href} aria-label={banner.title} className={single ? "w-full" : "contents"}>
      {body}
    </Link>
  ) : (
    body
  )
}
