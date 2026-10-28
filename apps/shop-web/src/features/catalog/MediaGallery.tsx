import { useRef, useState } from "react"

import { ArrowLeft, ArrowRight, ImageOff, Star, Trash2 } from "lucide-react"

import { Badge, Button, Progress } from "@effy/design-system/ui"

import { DetailSection, SectionAction } from "@/components/console/primitives"

import { orderedMedia } from "./detailFormat"
import { productMutationError } from "./errorText"
import type { ProductDetail } from "./model"
import { useDeleteMedia, useUpdateMedia, useUploadMedia } from "./queries"

const ACCEPT = "image/jpeg,image/png,image/webp"

export function MediaGallery({ detail }: { detail: ProductDetail }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const upload = useUploadMedia(detail.id)
  const patch = useUpdateMedia(detail.id)
  const remove = useDeleteMedia(detail.id)

  const media = orderedMedia(detail)
  const busy = upload.isPending || patch.isPending || remove.isPending

  async function onPick(file: File | null) {
    if (!file) return
    setError(null)
    setProgress(0)
    try {
      // First image becomes the primary automatically.
      await upload.mutateAsync({ file, isPrimary: media.length === 0, onProgress: setProgress })
    } catch (err) {
      setError(productMutationError(err))
    } finally {
      setProgress(null)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  async function run(fn: () => Promise<unknown>) {
    setError(null)
    try {
      await fn()
    } catch (err) {
      setError(productMutationError(err))
    }
  }

  function setPrimary(mediaId: string) {
    void run(() => patch.mutateAsync({ mediaId, body: { isPrimary: true } }))
  }

  function move(index: number, dir: -1 | 1) {
    const a = media[index]
    const b = media[index + dir]
    if (!a || !b) return
    void run(async () => {
      await patch.mutateAsync({ mediaId: a.id, body: { displayOrder: b.displayOrder } })
      await patch.mutateAsync({ mediaId: b.id, body: { displayOrder: a.displayOrder } })
    })
  }

  function del(mediaId: string) {
    void run(() => remove.mutateAsync(mediaId))
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

      <div className="grid gap-4">
        {progress != null ? <Progress value={progress} height={8} label="Upload progress" /> : null}

        {media.length === 0 ? (
          <div className="text-muted-foreground flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm">
            <ImageOff className="size-4" />
            No images yet. Add one to give this product a picture.
          </div>
        ) : (
          <ul className="flex flex-wrap gap-3">
            {media.map((m, i) => (
              <li key={m.id} className="grid w-28 gap-2">
                <div className="relative">
                  <img
                    src={m.url}
                    alt={m.altText ?? ""}
                    className="border-border bg-muted size-28 rounded-lg border object-cover"
                  />
                  {m.isPrimary ? (
                    <Badge variant="success" className="absolute top-2 left-2">
                      Primary
                    </Badge>
                  ) : null}
                </div>
                <div className="flex items-center justify-between">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
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

        {error ? <p className="text-sm font-medium">{error}</p> : null}
      </div>
    </DetailSection>
  )
}
