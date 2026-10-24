import { useRef, useState, type PointerEvent } from "react";

import { ArrowLeft, ArrowRight, ImagePlus, Trash2 } from "lucide-react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Input,
  Label,
} from "@effy/design-system/ui";
import type { AdminPromotionImageDTO } from "@effy/shared-types";

import { Panel } from "@effy/web-kit/patterns";
import { Callout } from "@effy/web-kit/patterns";
import { track } from "@/lib/telemetry";

import { inUseError, promotionMutationError } from "../errorText";
import type { Promotion } from "../model";
import { useAddPromotionImage, useRemovePromotionImage, useUpdatePromotionImage } from "../queries";

const ACCEPT = "image/jpeg,image/png,image/webp";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_PICTURES = 10;

/**
 * A promotion's pictures. Each has a description for people who cannot see it, and a focus
 * point (click the picture) that every crop keeps in view. A skin that shows a picture uses the one a
 * group chose for it, or the one that best fits its shape.
 */
export function PicturesSection({ promotion, canManage }: { promotion: Promotion; canManage: boolean }) {
  const add = useAddPromotionImage(promotion.id);
  const [file, setFile] = useState<File | null>(null);
  const [alt, setAlt] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const images = promotion.images;
  const full = images.length >= MAX_PICTURES;

  function choose(f: File | null) {
    setError(null);
    if (f && !ACCEPT.split(",").includes(f.type)) return setError("That file can't be used: a JPEG, PNG or WebP picture.");
    if (f && f.size > MAX_BYTES) return setError("That picture is larger than 10 MB.");
    setFile(f);
  }

  function upload() {
    if (!file) return;
    add.mutate(
      { file, alt: alt.trim() },
      {
        onSuccess: () => {
          track({ name: "promotion_image_added", promotionId: promotion.id });
          setFile(null);
          setAlt("");
          if (input.current) input.current.value = "";
        },
        onError: (e) => setError(e instanceof Error && !("type" in e) ? "The picture could not be uploaded. Try again." : promotionMutationError(e)),
      },
    );
  }

  return (
    <div className="space-y-4">
      {canManage ? (
        <Panel title="Add a picture" description={`Up to ${MAX_PICTURES} per promotion — JPEG, PNG or WebP, up to 10 MB, at least 320 pixels on the shorter side. A wide one and a square one cover every layout.`}>
          {full ? (
            <p className="bo-sub">This promotion has {MAX_PICTURES} pictures. Remove one to add another.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="picture-file">Picture</Label>
                <Input id="picture-file" ref={input} type="file" accept={ACCEPT} onChange={(e) => choose(e.target.files?.[0] ?? null)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="picture-alt">Description</Label>
                <Input id="picture-alt" value={alt} maxLength={150} placeholder="A basket of oranges on a kitchen table" onChange={(e) => setAlt(e.target.value)} />
                <p className="bo-sub">Read aloud to shoppers who can't see the picture.</p>
              </div>
              <div className="sm:col-span-2">
                <Button disabled={!file || !alt.trim() || add.isPending} onClick={upload}>
                  <ImagePlus aria-hidden="true" />
                  {add.isPending ? "Uploading…" : "Add picture"}
                </Button>
              </div>
            </div>
          )}
          {error ? (
            <p role="alert" className="mt-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </Panel>
      ) : null}
      {images.length === 0 ? (
        <Callout tone="info" title="No pictures">Skins that show a picture draw their colour and decorations instead.</Callout>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2" data-testid="promotion-pictures">
          {images.map((img, i) => (
            <PictureItem key={img.id} promotionId={promotion.id} image={img} index={i} count={images.length} canManage={canManage} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PictureItem({ promotionId, image, index, count, canManage }: { promotionId: string; image: AdminPromotionImageDTO; index: number; count: number; canManage: boolean }) {
  const update = useUpdatePromotionImage(promotionId);
  const remove = useRemovePromotionImage(promotionId);
  const [alt, setAlt] = useState(image.alt);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const save = (body: Parameters<typeof update.mutate>[0]["body"]) => {
    setError(null);
    update.mutate({ imageId: image.id, body }, { onError: (e) => setError(promotionMutationError(e)) });
  };
  const setFocus = (e: PointerEvent<HTMLButtonElement>) => {
    if (!canManage) return;
    const r = e.currentTarget.getBoundingClientRect();
    save({ focusX: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), focusY: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) });
  };

  return (
    <li className="space-y-2 rounded-lg border border-border p-3">
      <button
        type="button"
        className="relative block aspect-video w-full overflow-hidden rounded-md bg-muted"
        onPointerUp={setFocus}
        disabled={!canManage || update.isPending}
        aria-label={canManage ? `Set the focus point of ${image.alt}` : image.alt}
      >
        <img src={image.url} alt={image.alt} className="size-full object-contain" />
        <span
          aria-hidden="true"
          className="absolute size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow ring-2 ring-black/50"
          style={{ left: `${image.focusX * 100}%`, top: `${image.focusY * 100}%` }}
        />
      </button>
      <div className="bo-sub">
        {image.width}×{image.height} · {image.usedIn.length ? `Chosen in ${image.usedIn.map((g) => g.name).join(", ")}` : "Used where it fits best"}
        {canManage ? " · Click the picture to set what every crop keeps in view." : null}
      </div>
      {canManage ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <Label htmlFor={`alt-${image.id}`}>Description</Label>
            <Input id={`alt-${image.id}`} value={alt} maxLength={150} onChange={(e) => setAlt(e.target.value)} onBlur={() => alt.trim() && alt.trim() !== image.alt && save({ alt: alt.trim() })} />
          </div>
          <Button size="icon" variant="ghost" aria-label="Move earlier" disabled={index === 0 || update.isPending} onClick={() => save({ position: index - 1 })}>
            <ArrowLeft aria-hidden="true" />
          </Button>
          <Button size="icon" variant="ghost" aria-label="Move later" disabled={index === count - 1 || update.isPending} onClick={() => save({ position: index + 1 })}>
            <ArrowRight aria-hidden="true" />
          </Button>
          <Button size="icon" variant="ghost" aria-label={`Remove ${image.alt}`} disabled={remove.isPending} onClick={() => setRemoving(true)}>
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      ) : (
        <div className="text-sm">{image.alt}</div>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <AlertDialog open={removing} onOpenChange={setRemoving}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this picture?</AlertDialogTitle>
            <AlertDialogDescription>
              {image.usedIn.length
                ? `It is chosen in ${image.usedIn.map((g) => g.name).join(", ")}. Those places show the next best picture instead — or the skin's colour if none is left.`
                : "Skins that use it show the next best picture instead."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={() =>
                remove.mutate(
                  { imageId: image.id, confirm: true },
                  { onError: (e) => setError(inUseError(e, "picture") ?? promotionMutationError(e)) },
                )
              }
            >
              Remove picture
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  );
}
