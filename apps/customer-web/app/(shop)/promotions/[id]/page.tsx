import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { PromotionDTO } from "@effy/shared-types"

import { ActionLink, Display, Rule } from "@/components/storefront/kit"
import { coreApi, uncached } from "@/lib/api/core"

import { CopyCodeButton } from "../../_components/CopyCodeButton"

/**
 * ⚠ UNCACHED, and that is the one caching decision on this page worth arguing about.
 *
 * Every other public storefront read here is shared across all customers and therefore cacheable. So
 * is this one — but its content is a live claim that a promotion is still available, and it can stop
 * being true at any moment because OTHER shoppers are redeeming it. A cached "still available" sends
 * someone to the cart with a code that will be refused. The read is a single indexed row; the server
 * sends no cache headers for the same reason.
 */
async function fetchPromotion(id: string): Promise<PromotionDTO | null> {
  try {
    return await coreApi().get<PromotionDTO>(
      `/v1/storefront/promotions/${encodeURIComponent(id)}`,
      uncached(),
    )
  } catch (err) {
    // 404 is BOTH "no such promotion" and "no longer advertised" — the server refuses to distinguish
    // them, so that nobody can enumerate the operator's private codes by id.
    if ((err as { status?: number }).status === 404) return null
    throw err // a real outage bubbles to the error boundary
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  return {
    title: "Offer · Effy",
    alternates: { canonical: `/promotions/${id}` },
    // ⚠ NOINDEX. A promotion is temporary by nature: indexing it means a search result promising a
    // discount that has expired, which is worse than not being found at all. The store's evergreen
    // pages are what should rank.
    robots: { index: false, follow: true },
  }
}

/**
 * The promotion detail — where a banner tap leads (028 FR-034a).
 *
 * ── ⚠ WHY THIS PAGE EXISTS ──────────────────────────────────────────────────────────────────────
 *
 * A banner's `href` was `/search` for EVERY promotion, so tapping one opened the unfiltered store,
 * carrying none of the promotion's own facts — not the code, not the terms. The shopper lost the
 * offer on the way to it. Customer mobile hit the same defect through the same server field and was
 * fixed first; this closes it on the web.
 *
 * The reason no better destination existed is in the data model, not the routing: `promo_code` has no
 * product or category scoping. A promotion is a whole-cart discount with an optional minimum, so
 * there is no set of qualifying products to filter a results page to. A cart-level code is a message,
 * and the destination for a message is the message itself, stated in full.
 *
 * ⚠ It also closes half of a 028 carry-forward. `customer-web` still does not render `terms` on the
 * BANNER FACE — but FR-037d requires a shopper to learn of a condition "from the banner or from where
 * it leads, never first at payment", and this is now where it leads. The banner face remains
 * outstanding.
 *
 * Sectioned detail rows, never cards (Principle V / DOCTRINE-2).
 */
export default function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  // Do NOT await params here — reading it outside <Suspense> makes the whole route blocking under
  // cacheComponents. Pass the promise in and await it inside the boundary.
  return (
    <Suspense fallback={<PromotionSkeleton />}>
      <PromotionDetail params={params} />
    </Suspense>
  )
}

async function PromotionDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const promotion = await fetchPromotion(id)
  // ⚠ 404, not an error page. A promotion that expired or was fully claimed between the home page
  // being rendered and this link being followed is a NORMAL outcome, and `not-found` is the honest
  // response — it says "this isn't here" rather than "something broke, try again", which would invite
  // a retry that can never succeed.
  if (!promotion) notFound()

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6">
      <nav aria-label="Breadcrumb" className="mb-6 flex flex-wrap items-center gap-2 text-sm">
        <Link href="/" className="text-muted-foreground hover:text-foreground">
          Home
        </Link>
        <span aria-hidden="true" className="text-muted-foreground">
          ›
        </span>
        <span>Offer</span>
      </nav>

      {promotion.imageUrl && (
        // The same 2:1 the artwork is authored and validated at, so the picture an operator approved
        // is the picture that renders — nothing is cropped, at either end. No scrim: nothing is drawn
        // over it here, so there is nothing to protect the type from.
        <div className="relative mb-6 aspect-2/1 w-full overflow-hidden rounded-xl">
          <Image
            src={promotion.imageUrl}
            // The heading below is this promotion's accessible name; labelling the artwork too would
            // announce the same offer twice. The picture carries nothing the text does not.
            alt=""
            fill
            unoptimized
            sizes="(min-width: 768px) 48rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      <Display as="h1" size="sub" className="sm:text-3xl">
        {promotion.title}
      </Display>
      {promotion.subtitle && (
        <p className="mt-2 text-base text-muted-foreground">{promotion.subtitle}</p>
      )}

      <Rule className="my-6" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Code</p>
          <p className="mt-1 inline-block rounded-lg border px-4 py-2 text-lg font-bold tracking-wide">
            {promotion.code}
          </p>
        </div>
        <CopyCodeButton code={promotion.code} />
      </div>

      <Rule className="my-6" />

      <dl className="grid gap-4 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-muted-foreground">Conditions</dt>
        <dd>{promotion.terms ?? "No minimum spend"}</dd>
        <dt className="text-muted-foreground">Availability</dt>
        <dd>{promotion.validity ?? "No end date"}</dd>
      </dl>

      <Rule className="my-6" />

      <h2 className="text-base font-semibold">How to use it</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        Add what you want to your cart, then enter this code in the cart to apply the discount before
        you check out.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <ActionLink href="/search">Browse products</ActionLink>
        <ActionLink href="/cart" variant="outline">
          Go to cart
        </ActionLink>
      </div>
    </article>
  )
}

/** The streamed shell. Same shape as the content, so nothing jumps when the promotion lands. */
function PromotionSkeleton() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6 sm:px-6" aria-hidden="true">
      <div className="mb-6 h-5 w-32 rounded bg-muted" />
      <div className="mb-6 aspect-2/1 w-full rounded-xl bg-muted" />
      <div className="h-8 w-2/3 rounded bg-muted" />
      <div className="mt-3 h-5 w-1/2 rounded bg-muted" />
      <div className="mt-8 h-12 w-44 rounded bg-muted" />
    </div>
  )
}
