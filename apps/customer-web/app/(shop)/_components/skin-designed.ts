import type { ShopperSkinDTO } from "@effy/shared-types"

import type { PlacedBanner } from "../promotion-groups"

/**
 * Does this promotion wear a designed skin (drawn by `SkinnedPromotion`), or Classic / none (drawn by the
 * place's own component)? A plain module: `SkinnedPromotion.tsx` is "use client", and a server component
 * calling a client module's export gets a reference that throws.
 */
export function isDesigned(banner: PlacedBanner): banner is PlacedBanner & { skin: ShopperSkinDTO & { settings: NonNullable<ShopperSkinDTO["settings"]> } } {
  return Boolean(banner.skin && banner.skin.layout !== "classic" && banner.skin.settings)
}
