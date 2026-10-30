import { useState } from "react";

import { ArrowLeft, ArrowRight, Eye, ImageOff, Star, Trash2, Upload } from "lucide-react";

import { cn } from "@effy/design-system";
import { Badge, Button } from "@effy/design-system/ui";

export interface GalleryPicture {
  id: string;
  url: string;
  altText: string | null;
}

export interface GalleryActions {
  onAdd: () => void;
  onMakeMain: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  onRemove: (id: string) => void;
  busy?: boolean;
}

/**
 * A product's pictures: the chosen one large, every one in order beside it. The first is the main picture shoppers
 * see in the aisle. With `actions` each can be made the main one, moved or removed; without, it only shows.
 */
export function PictureGallery({
  pictures,
  actions,
  empty = "No pictures yet.",
}: {
  /** In order, the main picture first. */
  pictures: readonly GalleryPicture[];
  actions?: GalleryActions;
  empty?: string;
}) {
  const [chosen, setChosen] = useState(0);
  const at = Math.min(chosen, Math.max(0, pictures.length - 1));
  const shown = pictures[at];

  if (!shown) {
    return actions ? (
      <button
        type="button"
        onClick={actions.onAdd}
        disabled={actions.busy}
        className="grid w-full cursor-pointer justify-items-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-input px-6 py-10 text-sm text-muted-foreground transition-colors outline-none hover:border-primary hover:bg-primary-muted hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        <Upload aria-hidden="true" className="size-5" />
        <span className="font-medium text-foreground">Add a picture</span>
        JPG, PNG or WebP · square works best
      </button>
    ) : (
      <p className="flex items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-sm text-muted-foreground">
        <ImageOff aria-hidden="true" className="size-4" />
        {empty}
      </p>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div>
        <div className="relative aspect-square overflow-hidden rounded-lg border bg-muted">
          <img key={shown.id} src={shown.url} alt={shown.altText ?? ""} className="size-full object-cover" style={{ animation: "effy-fade 200ms ease-out" }} />
          {at === 0 ? (
            <Badge variant="outline" className="absolute top-3 left-3 bg-background">
              <Star aria-hidden="true" />
              Main picture
            </Badge>
          ) : null}
        </div>
        <p className="mt-3.5 flex gap-1.5 text-[13px] text-muted-foreground">
          <Eye aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {shown.altText ? `Read aloud as “${shown.altText}”` : "No description for screen readers yet."}
        </p>
      </div>

      <ul className="m-0 grid list-none grid-cols-3 content-start gap-4 p-0">
        {pictures.map((p, i) => (
          <li key={p.id} className="group relative">
            <button
              type="button"
              onClick={() => setChosen(i)}
              aria-label={`Picture ${i + 1}`}
              aria-pressed={i === at}
              className={cn(
                "block aspect-square w-full cursor-pointer overflow-hidden rounded-lg border bg-muted p-0 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                i === at && "border-foreground ring-1 ring-foreground",
              )}
            >
              <img src={p.url} alt="" className="size-full object-cover" />
            </button>
            <span className="pointer-events-none absolute top-2 left-2 grid size-[22px] place-items-center rounded-sm bg-foreground/75 text-[11.5px] font-semibold text-background">
              {i + 1}
            </span>
            {actions ? (
              <span className="absolute inset-x-1.5 bottom-1.5 flex justify-end gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
                {i > 0 ? (
                  <Button type="button" variant="outline" size="icon-sm" className="bg-background" disabled={actions.busy} onClick={() => actions.onMove(i, -1)} aria-label={`Move picture ${i + 1} earlier`}>
                    <ArrowLeft />
                  </Button>
                ) : null}
                {i < pictures.length - 1 ? (
                  <Button type="button" variant="outline" size="icon-sm" className="bg-background" disabled={actions.busy} onClick={() => actions.onMove(i, 1)} aria-label={`Move picture ${i + 1} later`}>
                    <ArrowRight />
                  </Button>
                ) : null}
                {i > 0 ? (
                  <Button type="button" variant="outline" size="icon-sm" className="bg-background" disabled={actions.busy} onClick={() => actions.onMakeMain(p.id)} aria-label={`Make picture ${i + 1} the main picture`}>
                    <Star />
                  </Button>
                ) : null}
                <Button type="button" variant="outline" size="icon-sm" className="bg-background" disabled={actions.busy} onClick={() => actions.onRemove(p.id)} aria-label={`Remove picture ${i + 1}`}>
                  <Trash2 />
                </Button>
              </span>
            ) : null}
          </li>
        ))}
        {actions ? (
          <li>
            <button
              type="button"
              onClick={actions.onAdd}
              disabled={actions.busy}
              className="grid aspect-square w-full cursor-pointer place-content-center justify-items-center gap-1.5 rounded-lg border-[1.5px] border-dashed border-input p-3 text-center text-xs text-muted-foreground transition-colors outline-none hover:border-primary hover:bg-primary-muted hover:text-primary focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              <Upload aria-hidden="true" className="size-4" />
              <span className="text-[13px] font-medium text-foreground">Add more</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
