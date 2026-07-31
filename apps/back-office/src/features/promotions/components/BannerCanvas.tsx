import { useRef, useState } from "react";

import { Button, Label } from "@effy/design-system/ui";
import { BANNER_CANVAS, bannerCanvasLabel, isCanonicalBannerRatio } from "@effy/shared-types";

import templateUrl from "@effy/design-system/banner-template.svg?url";

/**
 * The banner tool: the canvas, the template, the checking and the preview (029 US1).
 *
 * ── ⚠ WHAT THIS DELIBERATELY IS NOT ─────────────────────────────────────────────────────────────
 *
 * It does **not composite images**. The original request asked for "a fixed-size template for
 * generating the banner", which reads two ways — a picture editor, or the canvas plus validation for
 * artwork produced elsewhere. This is the second, chosen knowingly (spec FR-011).
 *
 * It solves the problem operators actually have: **nobody told them the dimensions**. That is why no
 * banner exists today. A compositor is a much larger feature and remains possible later; nothing here
 * forecloses it.
 *
 * ── The three things it does ────────────────────────────────────────────────────────────────────
 *
 *  1. **States the canvas** in plain numbers, and hands over a template file at that exact size — a
 *     number in help text is a thing to mistype; a file is not (FR-011a).
 *  2. **Checks what is uploaded**, and refuses the wrong shape with an actionable message rather than
 *     cropping it silently (FR-008).
 *  3. **Previews** the result as a shopper sees it, including the live message over the artwork —
 *     because that message is what an operator has to design *around* (FR-031b).
 */
export function BannerCanvas({
  imageUrl,
  hasArtwork,
  title,
  terms,
  code,
  disabled,
  onFile,
  onClear,
}: {
  /**
   * A local preview URL, when one exists.
   *
   * ⚠ Distinct from [hasArtwork]. Artwork saved in a previous session has a stored KEY but no
   * displayable URL here — the DTO carries the key, not a signed link. Conflating the two hid the
   * Remove button from every promotion whose artwork was uploaded before the page was opened, which
   * is most of them.
   */
  imageUrl: string | null;
  /** Whether artwork is attached at all, previewable or not. */
  hasArtwork: boolean;
  title: string;
  terms?: string | null;
  code?: string | null;
  disabled: boolean;
  /** Called with artwork that has passed the ratio check and been scaled to the canonical size. */
  onFile: (file: Blob) => void | Promise<void>;
  onClear: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const zone = BANNER_CANVAS.textZone;

  async function handleFile(file: File) {
    setError(null);
    setBusy(true);
    try {
      const bitmap = await createImageBitmap(file);

      // ⚠ THE RATIO GATE. Artwork already at 2:1 can be resampled to the canvas with its composition
      // intact — that is scaling, and it is safe. Artwork at any other ratio cannot be made to fit
      // without CROPPING, and cropping that the operator did not ask for is exactly what FR-008
      // forbids. So the wrong shape is refused here rather than quietly trimmed.
      if (!isCanonicalBannerRatio(bitmap.width, bitmap.height)) {
        setError(
          `That image is ${bitmap.width} × ${bitmap.height}. A banner must be ${bannerCanvasLabel()} ` +
            `(a ${BANNER_CANVAS.aspectRatio}:1 shape). Download the template below to start from the ` +
            `right canvas — cropping it here would cut off part of your design without asking.`,
        );
        return;
      }

      // Scale-only normalisation to the exact canvas.
      const canvas = document.createElement("canvas");
      canvas.width = BANNER_CANVAS.width;
      canvas.height = BANNER_CANVAS.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("could not prepare the image");
      ctx.drawImage(bitmap, 0, 0, BANNER_CANVAS.width, BANNER_CANVAS.height);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, file.type === "image/png" ? "image/png" : "image/jpeg", 0.9),
      );
      if (!blob) throw new Error("could not prepare the image");

      await onFile(blob);
    } catch (e) {
      setError(e instanceof Error ? e.message : "That file could not be read as an image.");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-4">
        <Label>Banner artwork</Label>
        {/* The size, stated. Never typed by hand — it comes from the one definition. */}
        <span className="text-xs text-muted-foreground">
          {bannerCanvasLabel()} px · {BANNER_CANVAS.aspectRatio}:1
        </span>
      </div>

      {/* ── The canvas, at the real ratio, with the text zone marked ──────────────────────────── */}
      <div
        className="relative w-full overflow-hidden rounded-md border border-border bg-muted"
        style={{ aspectRatio: `${BANNER_CANVAS.width} / ${BANNER_CANVAS.height}` }}
      >
        {imageUrl ? (
          <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : hasArtwork ? (
          <div className="absolute inset-0 flex items-center justify-center bg-muted">
            <span className="text-xs text-muted-foreground">Artwork attached</span>
          </div>
        ) : null}

        {/* The scrim the storefront draws, so the preview is honest about legibility. */}
        <div className="absolute inset-0 bg-gradient-to-tr from-background/85 via-background/45 to-transparent" />

        {/* The live message, positioned exactly where the storefront puts it. */}
        <div
          className="absolute flex flex-col justify-end"
          style={{
            left: `${zone.insetLeftPct}%`,
            bottom: `${zone.insetBottomPct}%`,
            width: `${zone.widthPct}%`,
            height: `${zone.heightPct}%`,
          }}
        >
          <p className="truncate text-base font-bold leading-tight sm:text-lg">
            {title.trim() || "Your headline appears here"}
          </p>
          {terms ? <p className="truncate text-xs text-muted-foreground">{terms}</p> : null}
          {code ? (
            <span className="mt-1 w-fit rounded border border-border px-2 py-0.5 text-xs font-bold tracking-wider">
              {code}
            </span>
          ) : null}
        </div>
      </div>

      {/* ⚠ FR-031b. The message is LIVE TEXT drawn over the artwork, not baked into it — which keeps it
          legible at any text size and readable by a screen reader. The cost is that this region of the
          operator's picture will be covered, and they have to know that before they design it. */}
      <p className="text-xs text-muted-foreground">
        The lower-left area carries the promotion&apos;s headline, terms and code — the app draws them
        as real text over your artwork. Keep that part of your design quiet, and don&apos;t put your own
        headline there or it will appear twice.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => fileInput.current?.click()}>
          {busy ? "Preparing…" : hasArtwork ? "Replace artwork" : "Upload artwork"}
        </Button>

        {/* One artifact, generated from the same constants as the renderer — so the template cannot
            teach a shape the storefront does not use. */}
        <Button type="button" variant="ghost" size="sm" asChild>
          <a href={templateUrl} download="effy-banner-template.svg">
            Download template
          </a>
        </Button>

        {hasArtwork ? (
          <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={onClear}>
            Remove
          </Button>
        ) : null}
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      {/* Artwork is OPTIONAL (FR-009) — a text-only banner is a valid banner. */}
      {!hasArtwork && !error ? (
        <p className="text-xs text-muted-foreground">
          No artwork — the banner will show its text on a plain panel, which is a perfectly good banner.
        </p>
      ) : null}
    </div>
  );
}
