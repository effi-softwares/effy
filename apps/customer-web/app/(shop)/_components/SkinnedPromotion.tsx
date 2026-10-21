"use client"

import Link from "next/link"

import type { GroupSize } from "@effy/shared-types"
import { PromoSkin, type PromoSkinLink } from "@effy/web-kit/promo-skin"

import { capture } from "@/lib/telemetry"

import type { PlacedBanner } from "../promotion-groups"

import { isDesigned } from "./skin-designed"

const NextLink: PromoSkinLink = ({ href, children, ...rest }) => (
  <Link href={href} {...rest}>
    {children}
  </Link>
)

/**
 * 095 — a group's promotion in the skin staff chose for this place (`@effy/web-kit/promo-skin`, the
 * renderer back-office previews with). A promotion wearing Classic — or whose server sent no skin — is
 * drawn by the place's own pre-095 component; `isDesigned` says which.
 */
export function SkinnedPromotion({
  banner,
  groupKey,
  size,
  imageSizes,
}: {
  banner: PlacedBanner
  groupKey: string
  size?: GroupSize
  imageSizes?: string
}) {
  if (!isDesigned(banner)) return null
  const { skin } = banner
  const tapped = (action: "open" | "copy") =>
    capture({ name: "promotion_banner_tapped", props: { promotionId: banner.key, groupKey, skinId: skin.id, layout: skin.layout, action } })
  return (
    <PromoSkin
      promotion={{ id: banner.key, headline: banner.title, supportingLine: banner.subtitle ?? null, code: banner.code ?? null, terms: banner.terms ?? null }}
      layout={skin.layout as Exclude<typeof skin.layout, "classic">}
      settings={skin.settings}
      size={size ?? skin.size}
      picture={skin.picture ?? null}
      href={banner.code ? null : (banner.href ?? null)}
      link={NextLink}
      imageSizes={imageSizes}
      onCopied={() => tapped("copy")}
      onOpen={banner.code ? undefined : () => tapped("open")}
    />
  )
}
