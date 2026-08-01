import { useRef, useState } from "react";

import { Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Switch, Textarea } from "@effy/design-system/ui";

import type { PromoCode } from "../model";
import { useUpdatePromo } from "../queries";
import { BannerCanvas } from "./BannerCanvas";
import { presignBannerImage, uploadBannerImage } from "../repo";

/**
 * Advertise a promotion on the customer storefront (028 US5).
 *
 * ── ⚠ THE DEFAULT IS THE SAFETY CONTROL ─────────────────────────────────────────────────────────
 *
 * Promotions are private until an operator says otherwise, and that is not a nicety. A goodwill
 * credit issued to one customer, or a code given to one partner, are ordinary things to create — and
 * putting either on the public storefront turns one person's discount into everyone's. The toggle
 * defaults off, the copy beside it says plainly what turning it on does, and the fields below stay
 * disabled until it is on, so nobody fills in a headline that goes nowhere.
 *
 * ── What this does NOT touch ────────────────────────────────────────────────────────────────────
 *
 * Nothing here changes what the promotion is WORTH. That is why these fields are editable on a code
 * that has already been redeemed, while the value fields above are not (FR-068): a paid order's
 * discount was computed from the definition as it stood, so a headline typo must be correctable and a
 * percentage must not.
 */
export function AdvertisingSection({ promo, canManage }: { promo: PromoCode; canManage: boolean }) {
  const update = useUpdatePromo(promo.id);
  const fileInput = useRef<HTMLInputElement>(null);

  const [isAdvertised, setIsAdvertised] = useState(promo.isAdvertised);
  const [title, setTitle] = useState(promo.bannerTitle ?? "");
  const [subtitle, setSubtitle] = useState(promo.bannerSubtitle ?? "");
  const [position, setPosition] = useState(String(promo.bannerPosition));
  const [placement, setPlacement] = useState(promo.bannerPlacement);
  const [imageKey, setImageKey] = useState(promo.bannerImageKey);
  // A local object URL so the preview is immediate; the stored key is what actually persists.
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !canManage || update.isPending || uploading;
  // The headline is what a shopper reads; without it there is nothing to advertise. Mirrors the
  // service check AND the database constraint — the button simply refuses to send a doomed request.
  const canSave = !isAdvertised || title.trim().length > 0;

  async function handleUpload(file: Blob) {
    setError(null);
    setUploading(true);
    try {
      // ⚠ The blob arriving here has ALREADY been scaled to the canonical canvas by BannerCanvas, and
      // will be verified again server-side on save. Neither check makes the other redundant: the
      // client one gives an immediate answer, the server one is the guarantee — artwork reaches S3
      // through a presigned PUT the service never observes.
      const { uploadUrl, storageKey } = await presignBannerImage(promo.id, file.type, file.size);
      await uploadBannerImage(uploadUrl, file as File);
      // ⚠ Saved immediately rather than held in local state. A key that exists in the bucket but not
      // on the promotion is an orphaned object nobody can find or clean up.
      await update.mutateAsync({ bannerImageKey: storageKey });
      setImageKey(storageKey);
      setPreviewUrl(URL.createObjectURL(file));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not upload the image.");
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function handleSave() {
    setError(null);
    try {
      await update.mutateAsync({
        isAdvertised,
        bannerTitle: title.trim() || null,
        bannerSubtitle: subtitle.trim() || null,
        bannerPosition: Number(position) || 0,
        bannerPlacement: placement,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save.");
    }
  }

  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">Storefront</h2>

      <div className="flex items-start justify-between gap-4 border-t border-border pt-3">
        <div className="space-y-1">
          <Label htmlFor="advertise">Advertise on storefront</Label>
          {/* The sentence that stops someone reaching past the default without meaning to. */}
          <p className="text-sm text-muted-foreground">
            Shows this promotion as a banner on the customer home screen, visible to{" "}
            <strong>every shopper</strong>. Leave this off for codes meant for one customer or one
            partner.
          </p>
        </div>
        <Switch
          id="advertise"
          checked={isAdvertised}
          onCheckedChange={setIsAdvertised}
          disabled={disabled}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="bannerTitle">Headline</Label>
          <Input
            id="bannerTitle"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="20% off your first grocery order"
            // Disabled until the toggle is on — copy that goes nowhere is worse than no copy.
            disabled={disabled || !isAdvertised}
          />
          <p className="text-xs text-muted-foreground">
            What the shopper reads. The code itself is shown separately — don&apos;t use it here.
          </p>
        </div>

        <div className="space-y-1 sm:col-span-2">
          <Label htmlFor="bannerSubtitle">Supporting line (optional)</Label>
          <Textarea
            id="bannerSubtitle"
            value={subtitle}
            onChange={(e) => setSubtitle(e.target.value)}
            rows={2}
            disabled={disabled || !isAdvertised}
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="bannerPlacement">Placement</Label>
          <Select
            value={placement}
            onValueChange={(v) => setPlacement(v as typeof placement)}
            disabled={disabled || !isAdvertised}
          >
            <SelectTrigger id="bannerPlacement">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="carousel">Offers carousel</SelectItem>
              <SelectItem value="inline">Between sections</SelectItem>
            </SelectContent>
          </Select>
          {/* ⚠ EXCLUSIVE (FR-027). Showing every promotion in both places needs no setting at all and
              is wrong at the only scale that matters: with three or four live, a shopper meets the
              same offer twice on one screen. */}
          <p className="text-xs text-muted-foreground">
            A promotion appears in one place, never both. The offers carousel is where shoppers look
            for deals; between sections interrupts their browsing, so use it sparingly.
          </p>
        </div>

        <div className="space-y-1">
          <Label htmlFor="bannerPosition">Order</Label>
          <Input
            id="bannerPosition"
            type="number"
            min={0}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={disabled || !isAdvertised}
          />
          {/* ⚠ This field's MEANING now depends on the control above it, and a control whose meaning
              silently changes under another is how an operator gets a result they did not ask for.
              So it says which it is, rather than leaving them to find out. */}
          <p className="text-xs text-muted-foreground">
            {placement === "carousel"
              ? "Swipe order within the offers carousel — 0 shows first."
              : "Which section it follows — 0 places it above the first section, 1 after the first, and so on. A number past the last section moves it to the end rather than hiding it."}
          </p>
        </div>

        <div className="space-y-1 sm:col-span-2">
          {/* ⚠ The canvas tool replaced a bare "Upload" button. That button asked for an image and
              named no size, which is why no banner has ever existed: an operator had nothing to
              design against and no way to find out what would happen to what they made. */}
          <BannerCanvas
            imageUrl={previewUrl}
            hasArtwork={Boolean(imageKey)}
            title={title}
            code={promo.code}
            terms={
              Number(promo.minimumSubtotalAmount) > 0
                ? `On orders over $${promo.minimumSubtotalAmount}`
                : null
            }
            disabled={disabled || !isAdvertised}
            onFile={handleUpload}
            onClear={() => {
              setImageKey(null);
              setPreviewUrl(null);
              void update.mutateAsync({ bannerImageKey: null });
            }}
          />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {canManage ? (
        <Button type="button" size="sm" onClick={() => void handleSave()} disabled={disabled || !canSave}>
          {update.isPending ? "Saving…" : "Save storefront settings"}
        </Button>
      ) : null}
    </section>
  );
}
