import { useRef, useState } from "react";

import { ArrowDown, ArrowUp, ImageOff, ImagePlus, Star, Trash2 } from "lucide-react";

import { Badge, Button } from "@effy/design-system/ui";

import { orderedMedia } from "./detailFormat";
import { productMutationError } from "./errorText";
import type { ProductDetail } from "./model";
import { useDeleteMedia, useUpdateMedia, useUploadMedia } from "./queries";

// The accepted image types mirror the backend's presign allow-list (jpeg/png/webp, FR-026); the
// backend re-validates, so this is only a courtesy filter.
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Media gallery management (US4 T064): add (presign→PUT→register), set-primary, reorder, delete.
 * No cards — a plain divided list of rows (DOCTRINE-2). Every write invalidates the detail query, so
 * the gallery re-renders from the server's truth rather than a hand-patched local copy (Principle VI).
 */
export function MediaGallery({ detail }: { detail: ProductDetail }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = useUploadMedia(detail.id);
  const patch = useUpdateMedia(detail.id);
  const remove = useDeleteMedia(detail.id);

  const media = orderedMedia(detail);
  const busy = upload.isPending || patch.isPending || remove.isPending;

  async function onPick(file: File | null) {
    if (!file) return;
    setError(null);
    setProgress(0);
    try {
      // First image becomes the primary automatically.
      await upload.mutateAsync({ file, isPrimary: media.length === 0, onProgress: setProgress });
    } catch (err) {
      setError(productMutationError(err));
    } finally {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(productMutationError(err));
    }
  }

  function setPrimary(mediaId: string) {
    void run(() => patch.mutateAsync({ mediaId, body: { isPrimary: true } }));
  }

  // Reorder by swapping displayOrder with the neighbour in the current (primary-first) order.
  function move(index: number, dir: -1 | 1) {
    const a = media[index];
    const b = media[index + dir];
    if (!a || !b) return;
    void run(async () => {
      await patch.mutateAsync({ mediaId: a.id, body: { displayOrder: b.displayOrder } });
      await patch.mutateAsync({ mediaId: b.id, body: { displayOrder: a.displayOrder } });
    });
  }

  function del(mediaId: string) {
    void run(() => remove.mutateAsync(mediaId));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          The primary image is shown first everywhere the product appears.
        </p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPT}
          className="hidden"
          onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
        >
          <ImagePlus />
          Add image
        </Button>
      </div>

      {progress != null ? (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full bg-primary transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
          />
        </div>
      ) : null}

      {media.length === 0 ? (
        <div className="flex items-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm text-muted-foreground">
          <ImageOff className="size-4" />
          No images yet. Add one to give this product a picture.
        </div>
      ) : (
        <ul className="divide-y rounded-md border">
          {media.map((m, i) => (
            <li key={m.id} className="flex items-center gap-3 p-3">
              <img
                src={m.url}
                alt={m.altText ?? ""}
                className="h-14 w-14 rounded-md border object-cover"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  {m.isPrimary ? <Badge variant="success">Primary</Badge> : null}
                  <span className="truncate text-sm text-muted-foreground">
                    {m.altText || "No alt text"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy || i === 0}
                  onClick={() => move(i, -1)}
                  aria-label="Move up"
                >
                  <ArrowUp />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy || i === media.length - 1}
                  onClick={() => move(i, 1)}
                  aria-label="Move down"
                >
                  <ArrowDown />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy || m.isPrimary}
                  onClick={() => setPrimary(m.id)}
                  aria-label="Set as primary"
                >
                  <Star />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={busy}
                  onClick={() => del(m.id)}
                  aria-label="Delete image"
                >
                  <Trash2 />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
