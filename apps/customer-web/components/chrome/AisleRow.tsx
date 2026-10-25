import { Suspense } from "react"
import Link from "next/link"
import { ArrowRight, ChevronRight, LayoutGrid, Tag } from "lucide-react"
import { PROMOTION_GROUP_KEYS, type StorefrontCategoryDTO } from "@effy/shared-types"

import { toGroupBanner, type PlacedBanner } from "@/app/(shop)/promotion-groups"
import { readPublicGroups } from "@/app/(shop)/promotion-groups-public"
import { isDesigned } from "@/app/(shop)/_components/skin-designed"
import { SkinnedPromotion } from "@/app/(shop)/_components/SkinnedPromotion"
import { chromePrefetch } from "@/lib/account-routes"
import { offerHref } from "@/app/(shop)/_components/OffersPanels"
import { MENU_THEMES, PromoBanner, type PromoTheme } from "@/components/storefront/PromoBanner"
import { btnClass } from "@/components/storefront/actions"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/misc"
import { aisleHref, childrenOf, getCategoriesSafe, topLevel } from "@/lib/categories"

import { AisleLink, AisleLinkFallback } from "./AisleLink"
import { AisleMenu } from "./AisleMenu"
import { aisleIcon } from "./aisle-icon"
import { MenuCarousel } from "./MenuCarousel"

const SALE_HREF = "/search?saleOnly=true"

/**
 * The aisle row under the masthead: All aisles, Deals, then every top-level aisle on one line.
 *
 * It never wraps. More aisles than fit scroll sideways (no scrollbar), and every one of them is
 * also in the All aisles menu — so nothing is reachable only by scrolling.
 *
 * The All aisles menu (reference: Home · All aisles mega menu) opens on hover or press: the aisles
 * down the left, the chosen aisle's groups and sub-aisles in the middle, offers and information on
 * the right. Its content is rendered here, on the server; `AisleMenu` only opens and switches it.
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
                  className="flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium"
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

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto scrollbar-none [&::-webkit-scrollbar]:hidden">
        <Suspense
          fallback={
            <AisleLinkFallback href={SALE_HREF} tone="brand">
              <Tag aria-hidden="true" />
              Deals
            </AisleLinkFallback>
          }
        >
          <AisleLink href={SALE_HREF} match={{ sale: true }} tone="brand">
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
 * An aisle with no groups says so and still offers the aisle itself — a taxonomy two levels deep
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
                  <ul className="mt-2 flex flex-col gap-2">
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

/** An information slide: what it is, a line about it, and the way in — on the tinted panel. */
function Slide({
  badge,
  title,
  text,
  href,
  action,
}: {
  badge: string
  title: string
  text?: string | null
  href: string
  action: string
}) {
  return (
    <div className="flex h-full flex-col rounded-lg bg-primary-muted p-4">
      <Badge className="self-start">{badge}</Badge>
      <p className="mt-3 text-base leading-snug font-semibold">{title}</p>
      {text && <p className="mt-2 text-sm text-muted-foreground">{text}</p>}
      <Link href={href} prefetch={chromePrefetch(href)} className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-medium text-primary">
        {action}
        <ArrowRight aria-hidden="true" className="size-4" />
      </Link>
    </div>
  )
}

/**
 * An offer slide: the same full-colour promo banner the home page draws, filling the panel. The whole
 * card is its link; the code, when it has one, is selectable text on it.
 */
function OfferSlide({
  theme,
  title,
  text,
  href,
  code,
}: {
  theme: PromoTheme
  title: string
  text?: string | null
  href: string
  code?: string | null
}) {
  return (
    <PromoBanner theme={theme} className="flex h-full flex-col rounded-lg p-5">
      <p className="text-xs font-semibold tracking-[0.08em] uppercase opacity-85">{code ? "Code" : "Offer"}</p>
      <p className="mt-2 text-2xl leading-[1.15] font-semibold tracking-[-0.02em]">{title}</p>
      {text && <p className="mt-2 text-sm opacity-90">{text}</p>}
      {code && (
        <p className="mt-3 inline-flex h-8 items-center self-start rounded-md border border-dashed border-white/70 px-3 font-mono font-semibold">
          {code}
        </p>
      )}
      <Link
        href={href}
        className={btnClass("outline", "sm", "mt-auto self-start border-transparent after:absolute after:inset-0")}
      >
        Shop the offer
        <ArrowRight aria-hidden="true" />
      </Link>
    </PromoBanner>
  )
}

/**
 * What Effy does, said where a shopper is deciding what to buy. Every line is true of the product
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

/**
 * The current offers, then the information slides. With no offers — or no answer — just those.
 *
 * The offers are the `mega-nav` display group (it started with what `home.banners` held, so the
 * menu did not change), read through the public group read: the menu is drawn for everyone, so it never
 * carries a personal offer. A promotion staff put in a skin wears it; a Classic one keeps its slide.
 */
async function MenuOffers() {
  let offers: PlacedBanner[] = []
  try {
    const dto = await readPublicGroups(PROMOTION_GROUP_KEYS.megaNav)
    offers = (dto.groups.find((g) => g.key === PROMOTION_GROUP_KEYS.megaNav)?.promotions ?? []).map(toGroupBanner)
  } catch {
    offers = []
  }
  return (
    <MenuCarousel>
      {offers.slice(0, 4).map((banner, i) =>
        isDesigned(banner) ? (
          <SkinnedPromotion key={banner.key} banner={banner} groupKey={PROMOTION_GROUP_KEYS.megaNav} size="small" imageSizes="320px" />
        ) : (
          <OfferSlide
            key={banner.key}
            theme={MENU_THEMES[i % MENU_THEMES.length]!}
            title={banner.title}
            text={banner.subtitle ?? banner.terms}
            code={banner.code}
            href={offerHref(banner) ?? "/offers"}
          />
        ),
      )}
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
      <AisleLinkFallback href={SALE_HREF} tone="brand">
        <Tag aria-hidden="true" />
        Deals
      </AisleLinkFallback>
    </nav>
  )
}
