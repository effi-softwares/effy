import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Suspense } from "react"

import type { PromotionDTO } from "@effy/shared-types"

import { CatalogImage } from "@/components/storefront/CatalogImage"
import { ActionLink, Rule } from "@/components/storefront/kit"
import { Breadcrumb } from "@/components/ui/misc"
import { edgeApiPublic, uncached } from "@/lib/api/edge"
import { Bone, BoneLines, Loading } from "@/components/ui/skeletons"

import { CopyCodeButton } from "../../_components/CopyCodeButton"

/**
 * Uncached, and that is the one caching decision on this page worth arguing about.
 *
 * Every other public storefront read here is shared across all customers and therefore cacheable. So
 * is this one — but its content is a live claim that a promotion is still available, and it can stop
 * being true at any moment because other shoppers are redeeming it. A cached "still available" sends
 * someone to the cart with a code that will be refused. The read is a single indexed row; the server
 * sends no cache headers for the same reason.
 */
async function fetchPromotion(id: string): Promise<PromotionDTO | null> {
  try {
    return await edgeApiPublic().get<PromotionDTO>(
      `/storefront/v1/promotions/${encodeURIComponent(id)}`,
      uncached(),
    )
  } catch (err) {
    // Is both "no such promotion" and "no longer advertised" — the server refuses to distinguish
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
    title: "Offer",
    alternates: { canonical: `/promotions/${id}` },
    // Noindex. A promotion is temporary by nature: indexing it means a search result promising a
    // discount that has expired, which is worse than not being found at all. The store's evergreen
    // pages are what should rank.
    robots: { index: false, follow: true },
  }
}

/**
 * The promotion detail, where a promotion tap leads: its code, terms and validity in full. A promotion
 * has no product or category scope, so there is no product list to send a shopper to; the message is the
 * destination. Sectioned detail rows, never cards.
 */
export default function PromotionPage({ params }: { params: Promise<{ id: string }> }) {
  // Do not await params here — reading it outside <Suspense> makes the whole route blocking under
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
  // 404, not an error page. A promotion that expired or was fully claimed between the home page
  // being rendered and this link being followed is a normal outcome, and `not-found` is the honest
  // response — it says "this isn't here" rather than "something broke, try again", which would invite
  // a retry that can never succeed.
  if (!promotion) notFound()

  return (
    <article className="container max-w-3xl! py-6">
      <Breadcrumb
        items={[{ label: "Home", href: "/" }, { label: "Offers", href: "/offers" }, { label: promotion.title }]}
        className="mb-6"
      />

      {promotion.imageUrl && (
        // The same 2:1 the artwork is authored and validated at, so the picture an operator approved
        // is the picture that renders — nothing is cropped, at either end. No scrim: nothing is drawn
        // over it here, so there is nothing to protect the type from.
        <div className="relative mb-6 aspect-2/1 w-full overflow-hidden rounded-xl">
          <CatalogImage
            src={promotion.imageUrl}
            widths={promotion.imageWidths}
            // The heading below is this promotion's accessible name; labelling the artwork too would
            // announce the same offer twice. The picture carries nothing the text does not.
            alt=""
            fill
            sizes="(min-width: 768px) 48rem, 100vw"
            className="object-cover"
            priority
          />
        </div>
      )}

      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{promotion.title}</h1>
      {promotion.subtitle && (
        <p className="mt-2 text-base text-muted-foreground">{promotion.subtitle}</p>
      )}

      <Rule className="my-6" />

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm text-muted-foreground">Code</p>
          <p className="mt-1 inline-block rounded-md border px-4 py-2 font-mono text-lg font-semibold">
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
/** The offer before it reads: picture, title, the fixed facts rows and "How to use it", in their places. */
function PromotionSkeleton() {
  return (
    <div className="container max-w-3xl! py-6">
      <Loading label="Loading the offer">
        <Bone className="mb-6 w-32" />
        <Bone kind="block" className="mb-6 aspect-2/1 rounded-xl" />
        <Bone kind="title" className="w-2/3" />
        <Bone className="mt-3 w-1/2" />
        <Rule className="my-6" />
        <dl className="grid items-center gap-4 text-sm sm:grid-cols-[10rem_1fr]">
          <dt className="text-muted-foreground">Conditions</dt>
          <dd>
            <Bone className="w-3/4" />
          </dd>
          <dt className="text-muted-foreground">Availability</dt>
          <dd>
            <Bone className="w-1/2" />
          </dd>
        </dl>
        <Rule className="my-6" />
        <h2 className="text-base font-semibold">How to use it</h2>
        <BoneLines count={2} className="mt-3" />
        <Bone kind="control" className="mt-8 w-44" />
      </Loading>
    </div>
  )
}
