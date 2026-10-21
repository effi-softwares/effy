import type { ShopperSkinDTO } from "@effy/shared-types"

import type { PlacedBanner } from "../promotion-groups"

/**
 * 095 — does this promotion wear a designed skin (drawn by `SkinnedPromotion`), or Classic / no skin
 * (drawn by the place's own pre-095 component)?
 *
 * ⚠ A plain module, NOT in `SkinnedPromotion.tsx`: that file is "use client", and a server component
 * that CALLS a client module's export gets a reference that throws — the hero, offers and aisles menu
 * all failed to render in dev that way.
 */
export function isDesigned(banner: PlacedBanner): banner is PlacedBanner & { skin: ShopperSkinDTO & { settings: NonNullable<ShopperSkinDTO["settings"]> } } {
  return Boolean(banner.skin && banner.skin.layout !== "classic" && banner.skin.settings)
}
