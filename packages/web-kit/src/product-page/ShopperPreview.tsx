import { useRef, useState, type ReactNode } from "react";

import { Image as ImageIcon, Info, Plus } from "lucide-react";

import { cn } from "@effy/design-system";
import { Badge, Button, Card, Tabs, TabsContent, TabsList, TabsTrigger } from "@effy/design-system/ui";

export interface PreviewSize {
  id: string;
  label: string;
  /** The price shown, written ("AUD 10.45"); null before there is one. */
  price: string | null;
  /** Whose price it is when it is not yet the customers' ("Your price"). */
  priceNote?: string | null;
  unitPrice: string | null;
  soldOut: boolean;
}

/**
 * How shoppers see the product on Effy — drawn as the product form's `LivePreview` draws it, in the aisle and on its
 * own page — from the product as it is being edited, not only as it was approved: `badges` say where it stands, and a
 * value lights up once when it changes.
 */
export function ShopperPreview({
  imageUrl,
  brand,
  name,
  shortDescription,
  aisle,
  facts,
  sizes,
  badges,
  note,
}: {
  imageUrl: string | null;
  brand: string | null;
  name: string;
  shortDescription?: string | null;
  /** The aisle it is browsed in ("Oils & vinegars › Olive oil"). */
  aisle?: string | null;
  /** Small facts under the product page (storage, 18+). */
  facts?: readonly { label: string; value: string }[];
  sizes: readonly PreviewSize[];
  /** Where it stands: approved or waiting, on sale or not. */
  badges?: ReactNode;
  note: string;
}) {
  const [picked, setPicked] = useState(0);
  const size = sizes[Math.min(picked, sizes.length - 1)];
  const soldOut = !size || size.soldOut;
  const from = lowest(sizes);

  const picture = imageUrl ? (
    <img key={imageUrl} src={imageUrl} alt="" className="size-full object-cover" style={{ animation: "effy-fade 200ms ease-out" }} />
  ) : (
    <ImageIcon aria-hidden="true" className="size-8 text-muted-foreground" />
  );

  return (
    <div className="grid gap-3">
      {badges ? <div className="flex flex-wrap gap-1.5">{badges}</div> : null}
      <Tabs defaultValue="aisle" className="gap-3">
        <TabsList className="w-full">
          <TabsTrigger value="aisle">In the aisle</TabsTrigger>
          <TabsTrigger value="page">Product page</TabsTrigger>
        </TabsList>

        <TabsContent value="aisle">
          <Card className="gap-3 p-4">
            <p className="truncate text-xs text-muted-foreground">{aisle ?? " "}</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="relative grid aspect-square place-items-center overflow-hidden rounded-lg bg-muted">
                  {picture}
                  {soldOut && sizes.length > 0 && sizes.every((s) => s.soldOut) ? (
                    <Badge variant="outline" className="absolute top-1.5 left-1.5 bg-background">
                      Sold out
                    </Badge>
                  ) : (
                    <span
                      aria-hidden="true"
                      className="absolute right-1.5 bottom-1.5 grid size-8 place-items-center rounded-md bg-primary-fill text-primary-foreground"
                    >
                      <Plus className="size-4" />
                    </span>
                  )}
                </div>
                <Flash watch={from ?? ""} className="text-base font-semibold tabular-nums">
                  {from ? (sizes.length > 1 && new Set(sizes.map((s) => s.price)).size > 1 ? `From ${from}` : from) : <span className="text-sm font-medium text-muted-foreground">No price yet</span>}
                </Flash>
                <Flash watch={`${brand}|${name}`} className="line-clamp-2 min-h-10 text-sm leading-5">
                  {brand ? <span className="font-semibold">{brand} </span> : null}
                  {name}
                </Flash>
                <p className="text-xs text-muted-foreground tabular-nums">{sizes.length > 1 ? `${sizes.length} sizes` : (sizes[0]?.label ?? " ")}</p>
              </div>
              <div aria-hidden="true" className="flex flex-col gap-2 opacity-60">
                <div className="aspect-square rounded-lg bg-muted" />
                <span className="h-3 w-2/5 rounded-sm bg-muted" />
                <span className="h-2.5 w-11/12 rounded-sm bg-muted" />
                <span className="h-2.5 w-3/5 rounded-sm bg-muted" />
              </div>
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="page">
          <Card className="gap-3 p-4">
            <div className="grid aspect-[4/3] place-items-center overflow-hidden rounded-md bg-muted">{picture}</div>
            <div>
              <p className="min-h-5 text-xs text-muted-foreground">{brand ?? " "}</p>
              <Flash watch={name} className="text-lg leading-6 font-semibold">
                {name}
              </Flash>
            </div>
            <div className="flex items-baseline justify-between gap-2">
              <Flash watch={size?.price ?? ""} className="text-xl font-bold tabular-nums">
                {size?.price ?? <span className="text-sm font-medium text-muted-foreground">No price yet</span>}
              </Flash>
              {size?.unitPrice ? <span className="text-xs text-muted-foreground tabular-nums">{size.unitPrice}</span> : null}
            </div>
            {size?.priceNote ? <p className="-mt-2 text-xs text-muted-foreground">{size.priceNote}</p> : null}
            {sizes.length > 1 ? (
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Sizes">
                {sizes.map((s, i) => (
                  <Button
                    key={s.id}
                    type="button"
                    size="sm"
                    variant={s === size ? "default" : "outline"}
                    aria-pressed={s === size}
                    className={s.soldOut ? "line-through" : undefined}
                    onClick={() => setPicked(i)}
                  >
                    {s.label}
                  </Button>
                ))}
              </div>
            ) : null}
            <span
              aria-hidden="true"
              className={cn(
                "grid h-10 place-items-center rounded-lg text-sm font-medium",
                soldOut ? "bg-muted text-muted-foreground" : "bg-primary-fill text-primary-foreground",
              )}
            >
              {soldOut ? "Sold out" : "Add to cart"}
            </span>
            {shortDescription ? (
              <Flash watch={shortDescription} className="text-sm text-muted-foreground">
                {shortDescription}
              </Flash>
            ) : null}
            {facts && facts.length > 0 ? (
              <dl className="ef-dl ef-dl--tight">
                {facts.map((f) => (
                  <div key={f.label} className="ef-dl__row">
                    <dt>{f.label}</dt>
                    <dd>{f.value}</dd>
                  </div>
                ))}
              </dl>
            ) : null}
          </Card>
        </TabsContent>
      </Tabs>
      <p className="flex gap-2 text-xs leading-5 text-muted-foreground">
        <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        {note}
      </p>
    </div>
  );
}

/** The lowest written price ("AUD 9.50"), by its number. */
function lowest(sizes: readonly PreviewSize[]): string | null {
  const priced = sizes.filter((s) => s.price !== null);
  if (priced.length === 0) return null;
  const amount = (p: string) => Number(p.replace(/[^\d.]/g, ""));
  return priced.reduce((a, b) => (amount(b.price!) < amount(a.price!) ? b : a)).price;
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
