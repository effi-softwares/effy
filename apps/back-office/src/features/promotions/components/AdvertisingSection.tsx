import { useRef, useState } from "react";

import { Button, Input, Label, Switch, Textarea } from "@effy/design-system/ui";

import type { PromoCode } from "../model";
import { useUpdatePromo } from "../queries";
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
  const [imageKey, setImageKey] = useState(promo.bannerImageKey);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const disabled = !canManage || update.isPending || uploading;
  // The headline is what a shopper reads; without it there is nothing to advertise. Mirrors the
  // service check AND the database constraint — the button simply refuses to send a doomed request.
  const canSave = !isAdvertised || title.trim().length > 0;

  async function handleUpload(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { uploadUrl, storageKey } = await presignBannerImage(promo.id, file.type, file.size);
      await uploadBannerImage(uploadUrl, file);
      // ⚠ Saved immediately rather than held in local state. A key that exists in the bucket but not
      // on the promotion is an orphaned object nobody can find or clean up.
      await update.mutateAsync({ bannerImageKey: storageKey });
      setImageKey(storageKey);
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
          <Label htmlFor="bannerPosition">Position</Label>
          <Input
            id="bannerPosition"
            type="number"
            min={0}
            value={position}
            onChange={(e) => setPosition(e.target.value)}
            disabled={disabled || !isAdvertised}
          />
          <p className="text-xs text-muted-foreground">
            0 places it above the first section; 1 after the first, and so on. A number past the last
            section moves it to the end rather than hiding it.
          </p>
        </div>

        <div className="space-y-1">
          <Label>Artwork (optional)</Label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleUpload(file);
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={disabled || !isAdvertised}
              onClick={() => fileInput.current?.click()}
            >
              {uploading ? "Uploading…" : imageKey ? "Replace" : "Upload"}
            </Button>
            {imageKey ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={disabled || !isAdvertised}
                // Clearing must be as easy as setting: artwork is optional, so a banner that cannot
                // lose its image is a banner an operator cannot fix.
                onClick={() => {
                  setImageKey(null);
                  void update.mutateAsync({ bannerImageKey: null });
                }}
              >
                Remove
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            {imageKey ? "An image is attached." : "No image — the banner shows text only."} JPEG, PNG
            or WebP, up to 10 MB.
          </p>
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
