import { Suspense } from "react"
import Link from "next/link"
import { ArrowRight, ChevronRight, LayoutGrid, Tag } from "lucide-react"
import type { StorefrontCategoryDTO } from "@effy/shared-types"

import { getHome } from "@/app/(shop)/home-data"
import { offerHref } from "@/app/(shop)/_components/OffersPanels"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/misc"
import { aisleHref, childrenOf, getCategoriesSafe, topLevel } from "@/lib/categories"

import { AisleLink, AisleLinkFallback } from "./AisleLink"
import { AisleMenu } from "./AisleMenu"
import { aisleIcon } from "./aisle-icon"
import { MenuCarousel } from "./MenuCarousel"

const SALE_HREF = "/search?saleOnly=true"

/**
 * The aisle row under the masthead: All aisles, Deals, then every top-level aisle on ONE line.
 *
 * ⚠ It never wraps. More aisles than fit scroll sideways (no scrollbar), and every one of them is
 * also in the All aisles menu — so nothing is reachable only by scrolling.
 *
 * The All aisles menu (reference: Home · All aisles mega menu) opens on hover or press: the aisles
 * down the left, the chosen aisle's groups and sub-aisles in the middle, offers and information on
 * the right. Its content is rendered HERE, on the server; `AisleMenu` only opens and switches it.
 * Phones never see this row — their aisles are in the menu drawer.
 */
export async function AisleRow() {
  const categories = await getCategoriesSafe()
  const aisles = topLevel(categories)

  return (
    <nav aria-label="Aisles" className="relative flex h-12 items-center gap-1">
      {aisles.length > 0 && (
        <AisleMenu
          items={aisles.map((aisle) => {
            const Icon = aisleIcon(aisle.name)
            return {
              key: aisle.key,
              row: (
                <Link
                  href={aisleHref(aisle.key)}
                  className="flex h-8 items-center gap-2 rounded-md px-2.5 text-sm font-medium"
                >
                  <Icon aria-hidden="true" className="size-4 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate">{aisle.name}</span>
                  <ChevronRight aria-hidden="true" className="size-4 text-muted-foreground" />
                </Link>
              ),
              panel: <AislePanel aisle={aisle} categories={categories} />,
            }
          })}
          aside={
            <Suspense fallback={<MenuCarousel>{INFORMATION}</MenuCarousel>}>
              <MenuOffers />
            </Suspense>
          }
          footer={
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t px-6 py-3 text-sm">
              <Link href="/search" className="inline-flex items-center gap-1 font-medium text-primary">
                All products
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href={SALE_HREF} className="inline-flex items-center gap-1 font-medium text-brand">
                On sale
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
              <Link href="/offers" className="inline-flex items-center gap-1 font-medium text-primary">
                Offers
                <ChevronRight aria-hidden="true" className="size-4" />
              </Link>
            </div>
          }
        />
      )}

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Suspense
          fallback={
            <AisleLinkFallback href={SALE_HREF} className="text-brand [&_svg]:text-brand">
              <Tag aria-hidden="true" />
              Deals
            </AisleLinkFallback>
          }
        >
          <AisleLink href={SALE_HREF} match={{ sale: true }} className="text-brand [&_svg]:text-brand">
            <Tag aria-hidden="true" />
            Deals
          </AisleLink>
        </Suspense>
        {aisles.length > 0 && <Separator orientation="vertical" className="mx-1" />}
        {aisles.map((aisle) => {
          const Icon = aisleIcon(aisle.name)
          const inner = (
            <>
              <Icon aria-hidden="true" />
              {aisle.name}
            </>
          )
          return (
            <Suspense
              key={aisle.key}
              fallback={<AisleLinkFallback href={aisleHref(aisle.key)}>{inner}</AisleLinkFallback>}
            >
              <AisleLink href={aisleHref(aisle.key)} match={{ category: aisle.key }}>
                {inner}
              </AisleLink>
            </Suspense>
          )
        })}
      </div>
    </nav>
  )
}

/**
 * One aisle's contents: its groups, each with the number of products under it and its sub-aisles.
 *
 * ⚠ An aisle with no groups says so and still offers the aisle itself — a taxonomy two levels deep
 * (or one) must not open onto an empty panel.
 */
function AislePanel({
  aisle,
  categories,
}: {
  aisle: StorefrontCategoryDTO
  categories: readonly StorefrontCategoryDTO[]
}) {
  const groups = childrenOf(categories, aisle.key)
  return (
    <>
      <Link href={aisleHref(aisle.key)} className="inline-flex items-center gap-1 text-sm font-medium text-primary">
        Shop all {aisle.name}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
      {groups.length > 0 && (
        <ul className="mt-4 columns-2 gap-8 xl:columns-3">
          {groups.map((group) => {
            const leaves = childrenOf(categories, group.key)
            return (
              <li key={group.key} className="mb-6 break-inside-avoid">
                <Link href={aisleHref(group.key)} className="text-sm font-semibold hover:underline">
                  {group.name}
                  {group.productCount > 0 && ` (${group.productCount})`}
                </Link>
                {leaves.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {leaves.map((leaf) => (
                      <li key={leaf.key}>
                        <Link href={aisleHref(leaf.key)} className="text-sm text-muted-foreground hover:text-foreground">
                          {leaf.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}

/** One slide: what it is, a line about it, and the way in. */
function Slide({
  badge,
  title,
  text,
  href,
  action,
  code,
}: {
  badge: string
  title: string
  text?: string | null
  href: string
  action: string
  code?: string | null
}) {
  return (
    <>
      <Badge className="self-start">{badge}</Badge>
      <p className="mt-3 text-base leading-snug font-semibold">{title}</p>
      {text && <p className="mt-1.5 text-sm text-muted-foreground">{text}</p>}
      {code && (
        <p className="mt-3 text-sm">
          Use code <span className="rounded-md border bg-background px-1.5 py-0.5 font-mono text-xs font-medium">{code}</span>
        </p>
      )}
      <Link href={href} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
        {action}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </>
  )
}

/**
 * What Effy does, said where a shopper is deciding what to buy. ⚠ Every line is true of the product
 * today — a claim nobody can keep (a delivery time, a free-delivery amount) is not made here.
 */
const INFORMATION = [
  <Slide
    key="delivery"
    badge="Delivery"
    title="Delivered by Effy, in a window you choose"
    text="Pick a window for today or one of the next delivery days at checkout."
    href="/help"
    action="How delivery works"
  />,
  <Slide
    key="saved"
    badge="Tip"
    title="Keep an eye on the price"
    text="Save an item and we'll show you when its price drops or it's back in stock."
    href="/saved"
    action="Your saved items"
  />,
]

/** The current offers, then the information slides. With no offers — or no answer — just those. */
async function MenuOffers() {
  let offers: Awaited<ReturnType<typeof getHome>>["banners"] = []
  try {
    offers = (await getHome()).banners
  } catch {
    offers = []
  }
  return (
    <MenuCarousel>
      {offers.slice(0, 4).map((banner) => (
        <Slide
          key={banner.key}
          badge={banner.code ? "Code" : "Offer"}
          title={banner.title}
          text={banner.subtitle ?? banner.terms}
          code={banner.code}
          href={offerHref(banner) ?? "/offers"}
          action="Shop the offer"
        />
      ))}
      {INFORMATION}
    </MenuCarousel>
  )
}

/** The row before the aisle list arrives: the two fixed entries, at the row's real height. */
export function AisleRowFallback() {
  return (
    <nav aria-label="Aisles" className="flex h-12 items-center gap-1">
      <AisleLinkFallback href="/search" className="border border-input shadow-xs">
        <LayoutGrid aria-hidden="true" />
        All aisles
      </AisleLinkFallback>
      <AisleLinkFallback href={SALE_HREF} className="text-brand [&_svg]:text-brand">
        <Tag aria-hidden="true" />
        Deals
      </AisleLinkFallback>
    </nav>
  )
}
