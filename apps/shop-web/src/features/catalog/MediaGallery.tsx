import { useRef, useState } from "react";

import { ArrowLeft, ArrowRight, ImageOff, Star, Trash2 } from "lucide-react";

import { Badge, Button } from "@effy/design-system/ui";

import { DetailSection, SectionAction } from "@/components/console/primitives";

import { orderedMedia } from "./detailFormat";
import { productMutationError } from "./errorText";
import type { ProductDetail } from "./model";
import { useDeleteMedia, useUpdateMedia, useUploadMedia } from "./queries";

// The accepted image types mirror the backend's presign allow-list (jpeg/png/webp, FR-026); the
// backend re-validates, so this is only a courtesy filter.
const ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * Media gallery management (US4 T064): add (presign→PUT→register), set-primary, reorder, delete.
 * No cards — a wrap of 110px thumbnails in the product screen's Media tab (057, DOCTRINE-2). Every write invalidates the detail query, so
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
    <DetailSection
      title="Media"
      subtitle="Images shown on the storefront, in order. The first is the thumbnail."
      action={
        <SectionAction onClick={() => inputRef.current?.click()} disabled={busy}>
          Add image
        </SectionAction>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => void onPick(e.target.files?.[0] ?? null)}
      />

      <div className="grid gap-4 pt-[18px]">
        {progress != null ? (
          <div className="bg-muted h-1.5 w-full overflow-hidden rounded-full">
            <div
              className="bg-primary h-full transition-all"
              style={{ width: `${progress}%` }}
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        ) : null}

        {media.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 rounded-md border border-dashed px-4 py-6 text-sm">
            <ImageOff className="size-4" />
            No images yet. Add one to give this product a picture.
          </div>
        ) : (
          /* ⚠ THE MOCKUP'S 110px SQUARES, and the management stays inline under each one. The mockup
             hides reorder/primary/delete behind a "Manage" sheet; ours are four icon buttons beneath
             the tile they act on, so there is no second surface restating the same gallery. */
          <ul className="flex flex-wrap gap-3">
            {media.map((m, i) => (
              <li key={m.id} className="grid w-[110px] gap-1.5">
                <div className="relative">
                  <img
                    src={m.url}
                    alt={m.altText ?? ""}
                    className="border-border bg-muted size-[110px] rounded-[var(--radius)] border object-cover"
                  />
                  {m.isPrimary ? (
                    <Badge variant="success" className="absolute top-1.5 left-1.5">
                      Primary
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    aria-label="Move earlier"
                  >
                    <ArrowLeft />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
                    disabled={busy || i === media.length - 1}
                    onClick={() => move(i, 1)}
                    aria-label="Move later"
                  >
                    <ArrowRight />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-6"
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
                    className="size-6"
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

        {error ? <p className="text-destructive text-sm">{error}</p> : null}
      </div>
    </DetailSection>
  );
}
