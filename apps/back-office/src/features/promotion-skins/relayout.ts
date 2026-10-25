import {
  LAYOUT_SHOWS_PICTURE,
  starterSettings,
  wordsOverPicture,
  type DesignedLayout,
  type SkinSettings,
} from "@effy/shared-types"

export function relayout(from: SkinSettings, to: DesignedLayout): SkinSettings {
  const base = starterSettings(to)
  const next: SkinSettings = {
    ...base,
    background: {
      ...from.background,
      ...(LAYOUT_SHOWS_PICTURE[to] === "required" ? { picture: "show" as const } : {}),
    },
    label: from.label,
    headline: { ...from.headline, lines: to === "strip" ? 1 : from.headline.lines },
    supporting: { ...from.supporting, show: to === "tile" || to === "strip" ? false : from.supporting.show },
    button: from.button,
    chip: from.chip,
    decorations: from.decorations,
    align: from.align,
    shape: from.shape,
    ...(from.dark ? { dark: from.dark } : {}),
  }
  if (next.background.picture === "show" && wordsOverPicture(to) && !next.background.tint)
    next.background = { ...next.background, tint: { colour: "#000000", strength: 0.5 } }
  return next
}
