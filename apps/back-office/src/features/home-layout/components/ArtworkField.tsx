import { useEffect, useRef, useState } from "react";

import { Upload } from "lucide-react";

import {
  ARTWORK_CANVASES,
  type ArtworkCanvasKey,
  canvasForTileSize,
  canvasLabel,
  isCanonicalSize,
} from "@effy/shared-types";
import { Button, Label } from "@effy/design-system/ui";

import { presignArtwork, viewArtwork } from "../repo";

/**
 * Attach artwork to a block (042 US2, T059).
 *
 * ⚠ THE UPLOAD IS THREE STEPS AND THEIR ORDER IS THE WHOLE DESIGN: presign → PUT to S3 → attach the
 * key. The bytes never pass through Lambda, which is what keeps a multi-megabyte photograph off a
 * 5-second function. The key is attached ONLY after the PUT succeeds — attaching first would leave a
 * block pointing at an object that does not exist, which renders as a broken frame on the storefront.
 *
 * ⚠ THE SHAPE IS CHECKED IN THE BROWSER, BEFORE ANY BYTES ARE SENT. That is a courtesy, not the
 * control — the server re-checks, because an operator can reach the API directly. But it is a
 * courtesy worth having: the alternative is uploading eight megabytes over a phone tether and being
 * told afterwards that the picture was the wrong shape.
 */

export interface ArtworkFieldProps {
  label: string;
  /** The canvas family from the field schema — `"tile"` resolves through the sibling `size`. */
  canvas: string;
  /** The sibling `size` value, when the canvas is the tile family. */
  size?: string;
  value: string | undefined;
  onChange: (storageKey: string | undefined) => void;
  disabled?: boolean;
}

export function ArtworkField({ label, canvas, size, value, onChange, disabled }: ArtworkFieldProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  /**
   * ⚠ WHICH CANVAS IS DERIVED FROM THE SIBLING `size`, THROUGH THE SHARED MAPPING. Writing the
   * mapping here would be a second copy of a decision the validator also makes — and two copies of
   * "which shape does a large tile take" is precisely the drift this feature exists to remove.
   */
  const key: ArtworkCanvasKey | null =
    canvas === "tile" ? canvasForTileSize(size ?? "") : (canvas as ArtworkCanvasKey);
  const spec = key ? ARTWORK_CANVASES[key] : null;

  /**
   * ⚠ SHOW THE OPERATOR THEIR OWN ARTWORK. The stored value is an S3 key, which a browser cannot
   * fetch — so without this presigned read the field displays a filename and nothing else. That is
   * what the promotions console does today, and it means an operator attaches a photograph and has
   * no way to confirm they attached the right one. Reviewing artwork you cannot see is not reviewing.
   */
  useEffect(() => {
    if (!value) {
      setPreview(null);
      return;
    }
    let live = true;
    viewArtwork(value)
      .then((r) => {
        if (live) setPreview(r.url);
      })
      // A preview that will not load is not worth an error message — the key is still attached and
      // the field still says so. Failing loudly here would suggest the artwork itself was lost.
      .catch(() => {
        if (live) setPreview(null);
      });
    return () => {
      live = false;
    };
  }, [value]);

  async function upload(file: File) {
    setError(null);

    if (!key || !spec) {
      // Reached when a tile has no size chosen yet — the canvas is not knowable, so neither is the
      // shape to check against. Saying which control to use first beats a generic refusal.
      setError("Choose a tile size first — it decides the shape this artwork must be.");
      return;
    }

    setBusy(true);
    try {
      // ⚠ MEASURED IN THE BROWSER BEFORE THE UPLOAD, so the operator learns the shape is wrong in a
      // moment rather than after sending the file.
      const dims = await imageDimensions(file);
      if (!dims) {
        setError("That file could not be read as an image.");
        return;
      }
      if (!isCanonicalSize(key, dims.width, dims.height)) {
        // ⚠ EXACT, NOT "CLOSE ENOUGH". The promise that artwork is never cropped holds only because
        // the accepted shape and the rendered box share one ratio — a tolerance here would quietly
        // reintroduce the cropping the design forbids.
        setError(
          `This artwork must be exactly ${canvasLabel(key)} pixels. That file is ${dims.width} × ${dims.height}.`,
        );
        return;
      }

      const { uploadUrl, storageKey } = await presignArtwork(file.type, file.size);

      const res = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: { "content-type": file.type },
      });
      if (!res.ok) {
        setError("The upload did not complete. Try again.");
        return;
      }

      // ⚠ ONLY NOW. Attaching before the PUT succeeds leaves the block pointing at an object that
      // does not exist — a broken frame on the storefront, from a save that reported success.
      onChange(storageKey);
    } catch {
      setError("The upload did not complete. Try again.");
    } finally {
      setBusy(false);
      // Let the same file be chosen again after a failure; without this the input is inert.
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={preview}
          alt=""
          className="max-h-40 rounded-lg border border-border object-contain"
        />
      ) : value ? (
        <p className="text-xs text-muted-foreground">Artwork attached.</p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="sr-only"
          id={`artwork-${label}`}
          disabled={disabled || busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          <Upload className="size-4" aria-hidden="true" />
          {busy ? "Uploading…" : value ? "Replace artwork" : "Upload artwork"}
        </Button>

        {value && !busy && (
          <Button type="button" variant="ghost" disabled={disabled} onClick={() => onChange(undefined)}>
            Remove
          </Button>
        )}

        {/* ⚠ The required size is STATED UP FRONT, taken from the canvas rather than typed here. An
            operator who learns the shape only from a rejection has to go back to whoever made the
            image and ask again. */}
        {spec && (
          <p className="text-xs text-muted-foreground">
            Exactly {canvasLabel(key!)} pixels, JPEG, PNG or WebP.
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Read a chosen file's pixel dimensions without uploading it. */
function imageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}
