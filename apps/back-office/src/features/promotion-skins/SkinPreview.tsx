import { useState } from "react"

import {
  Checkbox,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  ToggleGroup,
  ToggleGroupItem,
} from "@effy/design-system/ui"
import { Palette } from "lucide-react"

import {
  defaultSize,
  LAYOUT_FITS,
  type DesignedLayout,
  type GroupSize,
  type ShopperSkinDTO,
  type ShopperSkinPictureDTO,
  type SkinLayout,
  type SkinSettings,
} from "@effy/shared-types"
import { PromoSkin, type PromoSkinPromotion } from "@effy/web-kit/promo-skin"

import { cn } from "@/lib/utils"

export const LAYOUT_WORD: Record<SkinLayout, string> = {
  classic: "Classic",
  panel: "Panel",
  header_card: "Header card",
  full_picture: "Full picture",
  picture_beside: "Picture beside text",
  tile: "Tile",
  strip: "Strip",
}

export const SIZE_WORD: Record<GroupSize, string> = {
  large: "Large",
  medium: "Medium",
  small: "Small",
  strip: "Strip",
}

export const SAMPLES: (PromoSkinPromotion & { label: string })[] = [
  {
    id: "sample-code",
    label: "With a code",
    headline: "10% off the whole winter shop",
    supportingLine: "3 times per customer",
    code: "WINTER10",
    terms: "On orders over $30.00",
  },
  {
    id: "sample-offer",
    label: "No code",
    headline: "5% off every order, no minimum",
    supportingLine: "Applies by itself at checkout",
    code: null,
    terms: null,
  },
  {
    id: "sample-long",
    label: "Long headline",
    headline: "Buy two tubs of Greek yoghurt and get a third one completely free this weekend",
    supportingLine: "Mix and match any flavour from the dairy aisle, while stocks last",
    code: null,
    terms: null,
  },
]

const SAMPLE_PICTURE: ShopperSkinPictureDTO = {
  url: `data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#a3a3a3"/><circle cx="1150" cy="420" r="260" fill="#d4d4d4"/><circle cx="420" cy="620" r="180" fill="#737373"/></svg>`,
  )}`,
  width: 1600,
  height: 900,
  alt: "A sample picture",
  focusX: 0.5,
  focusY: 0.5,
}

function ClassicStandIn({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex min-h-28 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-border p-4 text-center",
        className,
      )}
    >
      <Palette aria-hidden="true" className="size-5 text-muted-foreground" />
      <div className="text-sm font-medium">Classic</div>
      <div className="mt-0.5 block text-sm text-muted-foreground max-w-60">
        Drawn as this place always looked — colours and icons chosen by the website.
      </div>
    </div>
  )
}

export function SkinPreviewItem({
  promotion,
  skin,
  className,
}: {
  promotion: PromoSkinPromotion
  skin: ShopperSkinDTO | undefined
  className?: string
}) {
  if (!skin || skin.layout === "classic" || !skin.settings) return <ClassicStandIn className={className} />
  return (
    <div className={className}>
      <PromoSkin
        promotion={promotion}
        layout={skin.layout}
        settings={skin.settings}
        size={skin.size}
        picture={skin.picture ?? null}
      />
    </div>
  )
}

export function SkinPreview({
  layout,
  settings,
  promotions = [],
}: {
  layout: DesignedLayout
  settings: SkinSettings
  promotions?: (PromoSkinPromotion & { label: string })[]
}) {
  const choices = [...SAMPLES, ...promotions]
  const [which, setWhich] = useState(choices[0]!.id)
  const [width, setWidth] = useState<"phone" | "desktop">("desktop")
  const [picture, setPicture] = useState(true)
  const sizes = LAYOUT_FITS[layout]
  const [size, setSize] = useState<GroupSize>(defaultSize(layout))
  const shown = sizes.includes(size) ? size : defaultSize(layout)
  const promotion = choices.find((c) => c.id === which) ?? choices[0]!

  return (
    <div className="space-y-3" data-testid="skin-preview">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={which} onValueChange={(next) => setWhich(next)}>
          <SelectTrigger aria-label="Preview words">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {choices.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <ToggleGroup
          type="single"
          variant="outline"
          size="sm"
          aria-label="Preview width"
          value={width}
          onValueChange={(v) => v && setWidth(v as typeof width)}
        >
          {(["phone", "desktop"] as const).map((w) => (
            <ToggleGroupItem key={w} value={w} className="px-3">
              {w === "phone" ? "Phone" : "Desktop"}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {sizes.length > 1 ? (
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            aria-label="Preview size"
            value={shown}
            onValueChange={(v) => v && setSize(v as typeof shown)}
          >
            {sizes.map((s) => (
              <ToggleGroupItem key={s} value={s} className="px-3">
                {SIZE_WORD[s]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        ) : null}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={picture} onCheckedChange={(v) => setPicture(v === true)} />
          Sample picture
        </label>
      </div>
      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <div className={cn("mx-auto", width === "phone" ? "max-w-94" : "max-w-220")}>
          <PromoSkin
            promotion={promotion}
            layout={layout}
            settings={settings}
            size={shown}
            picture={picture ? SAMPLE_PICTURE : null}
          />
        </div>
      </div>
    </div>
  )
}
