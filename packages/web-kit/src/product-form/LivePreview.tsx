import { useRef, useState, type ReactNode } from "react";
import {
  Box,
  Image as ImageIcon,
  Info,
  Plus,
  Snowflake,
  Thermometer,
  type LucideIcon,
} from "lucide-react";

import {
  AGE_RESTRICTED_LABEL,
  STORAGE_WORDS,
  type CategoryFormDTO,
  type Storage,
} from "@effy/shared-types";
import {
  Badge,
  Button,
  Card,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui";
import { cn } from "@effy/design-system";

import type { ProductDraft } from "./draft";
import { money, previewSizes } from "./steps";

const STORAGE_ICON: Record<Storage, LucideIcon> = {
  frozen: Snowflake,
  chilled: Thermometer,
  ambient: Box,
};

interface Props {
  draft: ProductDraft;
  form: CategoryFormDTO | undefined;
  imageUrl: string | null;
  /** The price to show, "From $4.60", or "" before one is set. */
  price: string;
  /** A size's price as shown (back-office adds its margin); the shop's own price by default. */
  shown?: (shopPrice: string) => string | null;
  /** Under the shelf: whose price this is. */
  note: string;
  /** Under the title: what the preview is. */
  description: string;
}

/**
 * How shoppers will see the product, drawn as the storefront draws it — on its aisle's shelf and on its own
 * page — and changing as the form is filled in.
 */
export function LivePreview({
  draft,
  form,
  imageUrl,
  price,
  shown = (p) => p,
  note,
  description,
}: Props) {
  const sizes = previewSizes(draft, form);
  const [picked, setPicked] = useState(0);
  const size = sizes[Math.min(picked, sizes.length - 1)];
  const sizePrice = size && /^\d+(\.\d{1,2})?$/.test(size.price) ? shown(size.price) : null;
  const name = draft.name.trim();
  const brand = draft.brand.trim();
  const storage = draft.facts.storage;
  const StorageIcon = storage ? STORAGE_ICON[storage] : null;

  const picture = (
    <>
      {imageUrl ? (
        <img src={imageUrl} alt="" className="size-full object-cover" />
      ) : (
        <ImageIcon aria-hidden="true" className="size-8 text-muted-foreground" />
      )}
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      <p className="pt-1 pr-5 pl-8 text-xs leading-5 text-muted-foreground">{description}</p>

      <Tabs defaultValue="aisle" className="gap-4 px-5 pt-4 pb-5">
        <TabsList className="w-full">
          <TabsTrigger value="aisle">In the aisle</TabsTrigger>
          <TabsTrigger value="page">Product page</TabsTrigger>
        </TabsList>

        <TabsContent value="aisle" className="flex flex-col gap-3">
          <Card className="gap-3 p-4">
            <p className="truncate text-xs text-muted-foreground">
              {form ? form.path.slice(-2).join(" › ") : "Choose a category to see its aisle"}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg bg-muted">
                  {picture}
                  {StorageIcon ? (
                    <Badge variant="outline" className="absolute top-1.5 left-1.5 bg-background">
                      <StorageIcon aria-hidden="true" />
                      {STORAGE_WORDS[storage!]}
                    </Badge>
                  ) : null}
                  {draft.facts.ageRestricted ? (
                    <Badge variant="destructive" className="absolute top-1.5 right-1.5">
                      {AGE_RESTRICTED_LABEL}
                    </Badge>
                  ) : null}
                  <span
                    aria-hidden="true"
                    className="absolute right-1.5 bottom-1.5 grid size-8 place-items-center rounded-md bg-primary-fill text-primary-foreground"
                  >
                    <Plus className="size-4" />
                  </span>
                </div>
                <Flash watch={price} className="text-base font-semibold tabular-nums">
                  {price || <span className="text-sm font-medium text-muted-foreground">No price yet</span>}
                </Flash>
                <Flash watch={`${brand}|${name}`} className="line-clamp-2 min-h-10 text-sm leading-5">
                  {brand ? <span className="font-semibold">{brand} </span> : null}
                  {name || <span className="text-muted-foreground">Product name</span>}
                </Flash>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {sizes.length > 1 ? `${sizes.length} variants` : sizes[0]?.label !== "One size" ? sizes[0]?.label : " "}
                </p>
              </div>
              <div aria-hidden="true" className="flex flex-col gap-2 opacity-60">
                <div className="aspect-square rounded-lg bg-muted" />
                <span className="h-3 w-2/5 rounded-sm bg-muted" />
                <span className="h-2.5 w-11/12 rounded-sm bg-muted" />
                <span className="h-2.5 w-3/5 rounded-sm bg-muted" />
              </div>
            </div>
          </Card>
          <PreviewNote>{note}</PreviewNote>
        </TabsContent>

        <TabsContent value="page" className="flex flex-col gap-3">
          <Card className="gap-3 p-4">
            <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-muted">
              {picture}
            </div>
            <div>
              <p className="min-h-5 text-xs text-muted-foreground">{brand || " "}</p>
              <Flash watch={name} className="text-lg leading-6 font-semibold">
                {name || <span className="text-muted-foreground">Product name</span>}
              </Flash>
            </div>
            <Flash watch={sizePrice ?? ""} className="text-xl font-bold tabular-nums">
              {sizePrice ? money(sizePrice) : <span className="text-sm font-medium text-muted-foreground">No price yet</span>}
            </Flash>
            {sizes.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Variants">
                {sizes.map((s, i) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={s === size ? "default" : "outline"}
                    onClick={() => setPicked(i)}
                    aria-pressed={s === size}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            ) : null}
            <span
              aria-hidden="true"
              className="grid h-10 place-items-center rounded-lg bg-primary-fill text-sm font-medium text-primary-foreground"
            >
              Add to cart
            </span>
            <Flash watch={draft.shortDescription} className="text-sm text-muted-foreground">
              {draft.shortDescription.trim() || "Your short description shows here."}
            </Flash>
            {storage ? (
              <dl className="ef-dl ef-dl--tight">
                <div className="ef-dl__row">
                  <dt>Storage</dt>
                  <dd>{STORAGE_WORDS[storage]}</dd>
                </div>
              </dl>
            ) : null}
          </Card>
          <PreviewNote>{note}</PreviewNote>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PreviewNote({ children }: { children: string }) {
  return (
    <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
      <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
      {children}
    </p>
  );
}

/** A value that lights up once each time it changes — never on first showing. */
function Flash({ watch, className, children }: { watch: string; className?: string; children: ReactNode }) {
  const first = useRef(watch);
  const changed = watch !== first.current;
  return (
    <p key={changed ? watch : undefined} className={cn(className, changed && "ef-flash")}>
      {children}
    </p>
  );
}
