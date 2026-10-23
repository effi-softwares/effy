import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Label } from "@effy/design-system/ui";
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
} from "@effy/shared-types";

import { Panel } from "@/components/patterns/Panel";
import { promotionMutationError } from "@/features/promotions/errorText";
import { promotionQuery } from "@/features/promotions/queries";
import { LAYOUT_WORD, SIZE_WORD, SkinPreviewItem } from "@/features/promotion-skins/SkinPreview";

import { useUpdateGroup } from "./queries";

const SELECT = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

const fitsWords = (size: GroupSize) =>
  (Object.keys(LAYOUT_FITS) as (keyof typeof LAYOUT_FITS)[])
    .filter((l) => l !== "classic" && LAYOUT_FITS[l].includes(size))
    .map((l) => LAYOUT_WORD[l])
    .join(", ");

/**
 * How a group's place looks: its size (which decides the layouts that fit) and the skins its
 * promotions wear unless one is chosen for them.
 */
export function LookPanel({ group, skins, canManage, onError }: { group: AdminPromotionGroupDetailDTO; skins: AdminSkinListItemDTO[]; canManage: boolean; onError: (m: string | null) => void }) {
  const update = useUpdateGroup(group.id);
  const [reset, setReset] = useState<string[]>([]);
  const fitting = (size: GroupSize) => skins.filter((s) => layoutFits(s.layout, size));
  const change = (body: Parameters<typeof update.mutate>[0]) => {
    onError(null);
    update.mutate(body, {
      onSuccess: (g) => setReset((g as { reset?: string[] }).reset ?? []),
      onError: (e) => onError(promotionMutationError(e)),
    });
  };
  return (
    <Panel title="How this place looks" description={`Layouts that fit a ${SIZE_WORD[group.size].toLowerCase()} place: ${fitsWords(group.size)} — and Classic, as it always looked.`}>
      <fieldset disabled={!canManage || update.isPending} className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="group-size">Size of the place</Label>
          <select id="group-size" className={SELECT} value={group.size} onChange={(e) => change({ size: e.target.value as GroupSize })}>
            {GROUP_SIZES.map((s) => (
              <option key={s} value={s}>
                {SIZE_WORD[s]}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-default">Default skin</Label>
          <select id="group-default" className={SELECT} value={group.defaultSkin.id} onChange={(e) => change({ defaultSkinId: e.target.value })}>
            {fitting(group.size).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="group-code-default">For promotions with a code</Label>
          <select id="group-code-default" className={SELECT} value={group.defaultCodeSkin?.id ?? ""} onChange={(e) => change({ defaultCodeSkinId: e.target.value || null })}>
            <option value="">Same as the default</option>
            {fitting(group.size).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      </fieldset>
      {reset.length > 0 ? (
        <p className="mt-3 text-sm" role="status">
          {reset.length} {reset.length === 1 ? "promotion's skin didn't" : "promotions' skins didn't"} fit the new size, so {reset.length === 1 ? "it wears" : "they wear"} the default now.
        </p>
      ) : null}
      <p className="bo-sub mt-3">
        <Link to="/promotions/skins" className="bo-link">
          Manage skins
        </Link>
      </p>
    </Panel>
  );
}

type Member = AdminPromotionGroupDetailDTO["members"][number];

/** One promotion's look in this place: a skin that fits, and which of its pictures — previewed live. */
export function MemberLookDialog({
  group,
  member,
  skins,
  pending,
  onClose,
  onSave,
}: {
  group: AdminPromotionGroupDetailDTO;
  member: Member;
  skins: AdminSkinListItemDTO[];
  pending: boolean;
  onClose: () => void;
  onSave: (skinId: string | null, imageId: string | null) => void;
}) {
  const promotion = useQuery(promotionQuery(member.promotionId));
  const [skinId, setSkinId] = useState<string | null>(member.skinId);
  const [imageId, setImageId] = useState<string | null>(member.imageId);
  const images = promotion.data?.images ?? [];
  const hasCode = member.resolved.code !== null;
  const defaultSkin = hasCode && group.defaultCodeSkin ? group.defaultCodeSkin : group.defaultSkin;
  const chosen = skins.find((s) => s.id === (skinId ?? defaultSkin.id));

  // The look shoppers would get with these choices — the same picture rule the server uses.
  let look: ShopperSkinDTO | undefined;
  if (chosen && !chosen.builtIn && chosen.settings) {
    const layout = chosen.layout as DesignedLayout;
    const pic = pickPicture(layout, chosen.settings, images, imageId);
    look = {
      id: chosen.id,
      version: chosen.version,
      layout,
      size: group.size,
      settings: chosen.settings,
      ...(pic ? { picture: { url: pic.url, imageWidths: pic.imageWidths, width: pic.width, height: pic.height, alt: pic.alt, focusX: pic.focusX, focusY: pic.focusY } } : {}),
    };
  }

  return (
    <Dialog open onOpenChange={(o) => (o ? null : onClose())}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>How “{member.headline ?? member.name}” looks here</DialogTitle>
          <DialogDescription>Only in {group.name}. Its other places keep their own look.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="member-skin">Skin</Label>
            <select id="member-skin" className={SELECT} value={skinId ?? ""} onChange={(e) => setSkinId(e.target.value || null)}>
              <option value="">Group default ({defaultSkin.name})</option>
              {skins.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="member-picture">Picture</Label>
            <select id="member-picture" className={SELECT} value={imageId ?? ""} onChange={(e) => setImageId(e.target.value || null)} disabled={images.length === 0}>
              <option value="">{images.length === 0 ? "This promotion has no pictures" : "The best fit for the layout"}</option>
              {images.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.alt} ({i.width}×{i.height})
                </option>
              ))}
            </select>
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
  );
}

