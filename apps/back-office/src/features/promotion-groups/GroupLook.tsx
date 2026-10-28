import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"

import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@effy/design-system/ui"
import {
  GROUP_SIZES,
  LAYOUT_FITS,
  layoutFits,
  pickPicture,
  type AdminPromotionGroupDetailDTO,
  type AdminSkinListItemDTO,
  type DesignedLayout,
  type GroupSize,
  type ShopperSkinDTO,
} from "@effy/shared-types"

import { Panel } from "@effy/web-kit/patterns"
import { promotionMutationError } from "@/features/promotions/errorText"
import { promotionQuery } from "@/features/promotions/queries"
import { LAYOUT_WORD, SIZE_WORD, SkinPreviewItem } from "@/features/promotion-skins/SkinPreview"

import { useUpdateGroup } from "./queries"

const fitsWords = (size: GroupSize) =>
  (Object.keys(LAYOUT_FITS) as (keyof typeof LAYOUT_FITS)[])
    .filter((l) => l !== "classic" && LAYOUT_FITS[l].includes(size))
    .map((l) => LAYOUT_WORD[l])
    .join(", ")

export function LookPanel({
  group,
  skins,
  canManage,
  onError,
}: {
  group: AdminPromotionGroupDetailDTO
  skins: AdminSkinListItemDTO[]
  canManage: boolean
  onError: (m: string | null) => void
}) {
  const update = useUpdateGroup(group.id)
  const [reset, setReset] = useState<string[]>([])
  const fitting = (size: GroupSize) => skins.filter((s) => layoutFits(s.layout, size))
  const change = (body: Parameters<typeof update.mutate>[0]) => {
    onError(null)
    update.mutate(body, {
      onSuccess: (g) => setReset((g as { reset?: string[] }).reset ?? []),
      onError: (e) => onError(promotionMutationError(e)),
    })
  }
  return (
    <Panel
      title="How this place looks"
      description={`Layouts that fit a ${SIZE_WORD[group.size].toLowerCase()} place: ${fitsWords(group.size)} — and Classic, as it always looked.`}
    >
      <fieldset disabled={!canManage || update.isPending} className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="group-size">Size of the place</Label>
          <Select value={group.size} onValueChange={(next) => change({ size: next as GroupSize })}>
            <SelectTrigger id="group-size" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_SIZES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SIZE_WORD[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-default">Default skin</Label>
          <Select value={group.defaultSkin.id} onValueChange={(next) => change({ defaultSkinId: next })}>
            <SelectTrigger id="group-default" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {fitting(group.size).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="group-code-default">For promotions with a code</Label>
          <Select
            value={group.defaultCodeSkin?.id ?? "__none"}
            onValueChange={(raw) => {
              const next = raw === "__none" ? "" : raw
              change({ defaultCodeSkinId: next || null })
            }}
          >
            <SelectTrigger id="group-code-default" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none">Same as the default</SelectItem>
              {fitting(group.size).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </fieldset>
      {reset.length > 0 ? (
        <p className="mt-3 text-sm" role="status">
          {reset.length} {reset.length === 1 ? "promotion's skin didn't" : "promotions' skins didn't"} fit the new size,
          so {reset.length === 1 ? "it wears" : "they wear"} the default now.
        </p>
      ) : null}
      <p className="mt-0.5 block text-sm text-muted-foreground mt-3">
        <Link to="/promotions/skins" className="link">
          Manage skins
        </Link>
      </p>
    </Panel>
  )
}

type Member = AdminPromotionGroupDetailDTO["members"][number]

export function MemberLookDialog({
  group,
  member,
  skins,
  pending,
  onClose,
  onSave,
}: {
  group: AdminPromotionGroupDetailDTO
  member: Member
  skins: AdminSkinListItemDTO[]
  pending: boolean
  onClose: () => void
  onSave: (skinId: string | null, imageId: string | null) => void
}) {
  const promotion = useQuery(promotionQuery(member.promotionId))
  const [skinId, setSkinId] = useState<string | null>(member.skinId)
  const [imageId, setImageId] = useState<string | null>(member.imageId)
  const images = promotion.data?.images ?? []
  const hasCode = member.resolved.code !== null
  const defaultSkin = hasCode && group.defaultCodeSkin ? group.defaultCodeSkin : group.defaultSkin
  const chosen = skins.find((s) => s.id === (skinId ?? defaultSkin.id))

  let look: ShopperSkinDTO | undefined
  if (chosen && !chosen.builtIn && chosen.settings) {
    const layout = chosen.layout as DesignedLayout
    const pic = pickPicture(layout, chosen.settings, images, imageId)
    look = {
      id: chosen.id,
      version: chosen.version,
      layout,
      size: group.size,
      settings: chosen.settings,
      ...(pic
        ? {
            picture: {
              url: pic.url,
              imageWidths: pic.imageWidths,
              width: pic.width,
              height: pic.height,
              alt: pic.alt,
              focusX: pic.focusX,
              focusY: pic.focusY,
            },
          }
        : {}),
    }
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How “{member.headline ?? member.name}” looks here</DialogTitle>
          <DialogDescription>Only in {group.name}. Its other places keep their own look.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="member-skin">Skin</Label>
            <Select
              value={skinId ?? "__none"}
              onValueChange={(raw) => {
                const next = raw === "__none" ? "" : raw
                setSkinId(next || null)
              }}
            >
              <SelectTrigger id="member-skin" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Group default ({defaultSkin.name})</SelectItem>
                {skins.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-picture">Picture</Label>
            <Select
              value={imageId ?? "__none"}
              onValueChange={(raw) => {
                const next = raw === "__none" ? "" : raw
                setImageId(next || null)
              }}
              disabled={images.length === 0}
            >
              <SelectTrigger id="member-picture" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">
                  {images.length === 0 ? "This promotion has no pictures" : "The best fit for the layout"}
                </SelectItem>
                {images.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.alt} ({i.width}×{i.height})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/40 p-4" data-testid="member-look-preview">
          <SkinPreviewItem promotion={member.resolved} skin={look} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={pending} onClick={() => onSave(skinId, imageId)}>
            Use this look
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
