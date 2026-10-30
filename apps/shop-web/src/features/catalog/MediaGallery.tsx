import { useRef, useState } from "react"

import { Image as ImageIcon, Upload } from "lucide-react"

import { Badge, Button, Progress } from "@effy/design-system/ui"
import { RecordSection } from "@effy/web-kit/patterns"
import { PictureGallery } from "@effy/web-kit/product-page"

import { orderedMedia } from "./detailFormat"
import { productMutationError } from "./errorText"
import type { ProductDetail } from "./model"
import { useDeleteMedia, useUpdateMedia, useUploadMedia } from "./queries"

const ACCEPT = "image/jpeg,image/png,image/webp"

/**
 * The product's pictures, in order; the first is the main picture shoppers see in the aisle. On an approved product
 * adding, removing or reordering a picture is part of the change Effy reviews, so `detail` is the product as the
 * shop is editing it and `pending` says when that set is not yet what shoppers see.
 */
export function MediaGallery({
  detail,
  readOnly = false,
  approved = false,
  pending = null,
}: {
  detail: ProductDetail
  readOnly?: boolean
  approved?: boolean
  /** The pictures are part of a change with Effy: waiting, or sent back. */
  pending?: "in_review" | "sent_back" | null
}) {
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

  function move(index: number, dir: -1 | 1) {
    const a = media[index]
    const b = media[index + dir]
    if (!a || !b) return
    void run(async () => {
      await patch.mutateAsync({ mediaId: a.id, body: { displayOrder: b.displayOrder } })
      await patch.mutateAsync({ mediaId: b.id, body: { displayOrder: a.displayOrder } })
    })
  }

  return (
    <RecordSection
      id="pictures"
      icon={ImageIcon}
      title="Pictures"
      description={
        approved
          ? "A new, removed or reordered picture is checked by Effy before shoppers see it. The first is the main picture in the aisle."
          : "Shown on Effy in this order. The first is the main picture shoppers see in the aisle."
      }
      actions={
        readOnly ? undefined : (
          <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
            <Upload aria-hidden="true" />
            Add pictures
          </Button>
        )
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
        {pending ? (
          <p role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant="default">{pending === "sent_back" ? "Sent back" : "In review"}</Badge>
            These are your changed pictures. Shoppers keep seeing the ones on sale until Effy approves them.
          </p>
        ) : null}
        {progress != null ? <Progress value={progress} height={8} label="Upload progress" /> : null}
        <PictureGallery
          pictures={media.map((m) => ({ id: m.id, url: m.url, altText: m.altText }))}
          empty={readOnly ? "No pictures yet — Effy adds them while it sets this product up." : undefined}
          actions={
            readOnly
              ? undefined
              : {
                  busy,
                  onAdd: () => inputRef.current?.click(),
                  onMakeMain: (mediaId) => void run(() => patch.mutateAsync({ mediaId, body: { isPrimary: true } })),
                  onMove: move,
                  onRemove: (mediaId) => void run(() => remove.mutateAsync(mediaId)),
                }
          }
        />
        {error ? (
          <p role="alert" className="text-sm font-medium">
            {error}
          </p>
        ) : null}
      </div>
    </RecordSection>
  )
}
