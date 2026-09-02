import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ImageOff } from "lucide-react";

import type { StockMovementDTO } from "@effy/shared-types";
import { Skeleton } from "@effy/design-system/ui";
import { ErrorState } from "@effy/web-kit/console";

import {
  Crumbs,
  DetailRow,
  MetaDivider,
  MicroLabel,
  Page,
  Pill,
  RailRow,
  Section,
  SectionAction,
  StatCell,
} from "@/components/console/primitives";

import { ProductStatusBadge } from "./components/ProductStatusBadge";
import { formatAttributeValue, formatMoney, orderedMedia } from "./detailFormat";
import { InventorySection } from "./InventorySection";
import { MediaGallery } from "./MediaGallery";
import type { ProductDetail } from "./model";
import { ProductHeaderActions, ProductRemovalControl } from "./ProductActions";
import {
  AttributesEditDialog,
  BasicsEditDialog,
  CategorizationEditDialog,
  PricingEditDialog,
} from "./ProductEditDialogs";
import { productDetailQuery } from "./queries";
import { SectionAssignment } from "./SectionAssignment";
import { stockChangeTitle } from "./stockMovementText";
import { productStockQuery } from "./stockQueries";

type EditTarget = "basics" | "pricing" | "categorization" | "attributes" | null;

/**
 * Product detail, rebuilt to the imported design (057).
 *
 * ⚠ TABS ARE GONE, AND THAT IS THE POINT OF THE REBUILD. The screen was six tabs — Overview,
 * Attributes, Media, Pricing, Categorization, Inventory — which meant an operator answering "is this
 * priced right and do we have any" had to visit two of them and hold the first in their head. The
 * mockup lays every section down one scrolling column with its own `Edit` link, and puts the numbers
 * that summarise the product in a right rail that never scrolls away from them. Nothing is removed;
 * five clicks are.
 *
 * ⚠ THE SECTION ORDER IS THE MOCKUP'S, and it is not arbitrary: details → pricing → inventory →
 * media → visibility. It descends from "what is this" to "how is it sold" to "have we got it", which
 * is the order the questions actually arrive in.
 */
export function ProductDetailScreen({ productId }: { productId: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(productDetailQuery(productId));
  // Shares the Inventory section's cache entry rather than issuing a second read (Principle VI).
  const headerStock = useQuery(productStockQuery(productId));
  const [editing, setEditing] = useState<EditTarget>(null);
  const navigate = useNavigate();

  const goCatalog = () => void navigate({ to: "/catalog" });

  if (isError) {
    return (
      <Page>
        <Crumbs parent="Catalog" onParent={goCatalog} current="Product" />
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }
  if (isPending) {
    return (
      <Page>
        <Crumbs parent="Catalog" onParent={goCatalog} current="Loading…" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }

  const detail: ProductDetail = data;

  return (
    <Page className="gap-[22px]">
      <Crumbs parent="Catalog" onParent={goCatalog} current={detail.name} />

      {/* ── Hero: image, identity, and the two actions the mockup gives this screen ────────────── */}
      <div className="flex flex-wrap items-start gap-[18px]">
        <ProductThumb detail={detail} />

        <div className="grid min-w-[220px] flex-1 gap-[7px]">
          <h1 className="text-[22px] leading-[1.15] font-semibold tracking-[-.025em]">
            {detail.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-muted-foreground font-mono text-[12.5px] whitespace-nowrap">
              {detail.sku ?? "no SKU"}
            </span>
            <MetaDivider />
            <span className="text-muted-foreground text-[13px]">{detail.categoryName}</span>
            <MetaDivider />
            {/* ⚠ The header chip answers "can a shopper buy this right now", which is the question
                an operator opens this screen with — so it takes the live stock the rest of the page
                is already reading rather than reporting a lifecycle state an empty shelf contradicts. */}
            <ProductStatusBadge status={detail.status} stock={headerStock.data?.stock} />
            <span className="text-[13.5px] font-medium tabular-nums whitespace-nowrap">
              {formatMoney(detail.priceAmount, detail.currency)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <ProductHeaderActions detail={detail} />
        </div>
      </div>

      {detail.missingMandatoryAttributes.length > 0 ? (
        <div
          role="status"
          className="border-border bg-muted flex items-start gap-2 rounded-md border px-4 py-3 text-sm"
        >
          <AlertTriangle className="text-muted-foreground mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">Missing required details</p>
            <p className="text-muted-foreground">
              This product&apos;s type now requires attributes it doesn&apos;t have:{" "}
              {detail.missingMandatoryAttributes.join(", ")}. It stays visible — add them below to keep
              it complete.
            </p>
          </div>
        </div>
      ) : null}

      {/* ── The mockup's two-column body: sections left, summary rail right ────────────────────── */}
      <div className="grid items-start gap-9 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="grid min-w-0 gap-[30px]">
          <Section
            title="Product details"
            action={<SectionAction onClick={() => setEditing("basics")}>Edit</SectionAction>}
          >
            <DetailRow label="Name" value={detail.name} />
            <DetailRow label="Brand" value={detail.brand ?? "—"} />
            <DetailRow label="SKU" value={detail.sku ?? "—"} mono />
            <DetailRow label="GTIN" value={detail.gtin ?? "—"} mono />
            <DetailRow label="Short description" value={detail.shortDescription} />
            <DetailRow label="Long description" value={detail.longDescription ?? "—"} />
            <DetailRow
              label="Shipping weight"
              value={
                detail.weightIsAssumed
                  ? `${detail.weightGrams} g (assumed — not yet measured)`
                  : `${detail.weightGrams} g`
              }
            />
          </Section>

          {/* ⚠ The mockup's pricing block is a bare grid of stat cells under one hairline — NOT cards
              (Principle V / DOCTRINE-2). The figures are the content; a border around each would add
              nothing but weight. */}
          <Section
            title="Pricing"
            action={<SectionAction onClick={() => setEditing("pricing")}>Edit</SectionAction>}
          >
            <div className="border-border grid grid-cols-2 border-b sm:grid-cols-3">
              <StatCell label="Price" value={formatMoney(detail.priceAmount, detail.currency)} />
              <StatCell
                label="Compare-at"
                value={formatMoney(detail.compareAtAmount, detail.currency)}
              />
              <StatCell label="Currency" value={detail.currency} />
            </div>
          </Section>

          {/* Inventory is the mockup's third section — the numbers stated as rows, every write behind
              a named verb. See InventorySection for the three mockup features refused here. */}
          <InventorySection detail={detail} />

          <Section title="Attributes" action={<SectionAction onClick={() => setEditing("attributes")}>Edit</SectionAction>}>
            {detail.attributes.length === 0 ? (
              <p className="text-muted-foreground py-3 text-[13px]">
                This product&apos;s type has no extra attributes.
              </p>
            ) : (
              detail.attributes.map((a) => (
                <DetailRow
                  key={a.name}
                  label={a.unit ? `${a.name} (${a.unit})` : a.name}
                  value={formatAttributeValue(a)}
                />
              ))
            )}
          </Section>

          {/* ⚠ NO "Manage" ACTION, and its removal is a fix rather than a trim. The section carried
              `<SectionAction>Manage</SectionAction>` with NO onClick — a control that looks live,
              takes focus, and does nothing when clicked. The mockup needs it because its media lives
              behind a sheet; ours is managed inline right below (add, make primary, reorder, delete),
              so the honest header action is none at all. */}
          <Section title="Media">
            <div className="pt-3.5">
              <MediaGallery detail={detail} />
            </div>
          </Section>

          {/* ⚠ THE MOCKUP CALLS THIS "Visibility and channels" AND OURS MUST NOT. Effy is a
              single-brand storefront with hidden fulfilment: there is exactly one channel, so a
              heading promising several describes a choice the operator does not have. What the
              section actually holds is where the product sits in the catalogue and which of the
              shop's own sections it appears in. */}
          <Section
            title="Classification and placement"
            action={
              <SectionAction onClick={() => setEditing("categorization")}>Edit</SectionAction>
            }
          >
            <DetailRow label="Type" value={detail.typeName} />
            <DetailRow label="Category" value={detail.categoryName} />
            <div className="pt-4">
              <MicroLabel className="pb-2">Sections</MicroLabel>
              <SectionAssignment detail={detail} />
            </div>
          </Section>
        </div>

        <ProductRail detail={detail} productId={productId} onDeleted={goCatalog} />
      </div>

      <BasicsEditDialog
        detail={detail}
        open={editing === "basics"}
        onOpenChange={(o) => setEditing(o ? "basics" : null)}
      />
      <PricingEditDialog
        detail={detail}
        open={editing === "pricing"}
        onOpenChange={(o) => setEditing(o ? "pricing" : null)}
      />
      <CategorizationEditDialog
        detail={detail}
        open={editing === "categorization"}
        onOpenChange={(o) => setEditing(o ? "categorization" : null)}
      />
      <AttributesEditDialog
        detail={detail}
        open={editing === "attributes"}
        onOpenChange={(o) => setEditing(o ? "attributes" : null)}
      />
    </Page>
  );
}

function ProductThumb({ detail }: { detail: ProductDetail }) {
  const primary = orderedMedia(detail)[0];
  return primary ? (
    <img
      src={primary.url}
      alt={primary.altText ?? ""}
      className="border-border size-[72px] shrink-0 rounded-[var(--radius)] border object-cover"
    />
  ) : (
    <div className="border-border bg-muted text-muted-foreground grid size-[72px] shrink-0 place-items-center rounded-[var(--radius)] border">
      <ImageOff className="size-5" />
    </div>
  );
}

/**
 * The mockup's right rail.
 *
 * ⚠ ITS "Last 30 days" BLOCK IS SAMPLE DATA IN THE MOCKUP, AND IS NOT REPRODUCED. The platform stores
 * no per-product sales history — nothing on this codebase can answer "units sold, last 30 days" — and
 * drawing the block with invented figures is the exact defect this feature deleted from the dashboard,
 * where four em-dashes and a fake chart had been shipped as if they were real.
 *
 * ⚠ AND THE RAIL NO LONGER RESTATES THE STOCK NUMBERS. It used to carry Tracked / On hand / Threshold
 * beside an Inventory section that now states all three as rows — two places rendering one fact, which
 * is the shape 052 deleted `summarizeFulfillment` for and 033 refused an `available` flag over. What
 * the rail carries in that space is the mockup's own second block, "Recent changes", which is real:
 * every entry is a `stock_movement` row.
 */
function ProductRail({
  detail,
  productId,
  onDeleted,
}: {
  detail: ProductDetail;
  productId: string;
  onDeleted: () => void;
}) {
  const stock = useQuery(productStockQuery(productId));

  return (
    <aside className="grid min-w-0 gap-[26px]">
      <div className="grid gap-0.5">
        <MicroLabel className="pb-2.5">Recent changes</MicroLabel>
        {stock.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : stock.isError ? (
          <p className="text-muted-foreground border-border border-t py-2.5 text-[13px]">
            Recent changes couldn&apos;t be loaded.
          </p>
        ) : stock.data.movements.length === 0 ? (
          <p className="text-muted-foreground border-border border-t py-2.5 text-[13px]">
            No stock changes recorded yet.
          </p>
        ) : (
          /* ⚠ FOUR, and the full list stays in the Inventory section. The rail is 260px wide and a
             movement carries four facts (what moved, why, who, and off the back of which order); the
             three that do not fit are exactly the ones an operator reconciling a count needs, so the
             rail summarises and the table below answers. */
          stock.data.movements
            .slice(0, 4)
            .map((m) => <RailChange key={m.id} movement={m} />)
        )}
      </div>

      <div className="grid gap-0.5">
        <MicroLabel className="pb-2.5">Lifecycle</MicroLabel>
        <RailRow label="Status" value={<Pill variant="quiet">{detail.status}</Pill>} />
        <RailRow label="Sections" value={detail.sections.length} />
        <RailRow label="Images" value={detail.media.length} />
        <RailRow
          label="Updated"
          value={new Date(detail.updatedAt).toLocaleDateString(undefined, {
            day: "numeric",
            month: "short",
          })}
        />
      </div>

      {/* The mockup puts the removal at the foot of the rail, furthest from everything routine. */}
      <ProductRemovalControl detail={detail} onDeleted={onDeleted} />
    </aside>
  );
}

/** One line of the rail's change log: what happened, and when. */
function RailChange({ movement }: { movement: StockMovementDTO }) {
  return (
    <div className="border-border grid gap-0.5 border-t py-2.5">
      <span className="text-[13px]">{stockChangeTitle(movement)}</span>
      <span className="text-muted-foreground text-[12px]">
        {new Date(movement.createdAt).toLocaleString(undefined, {
          dateStyle: "medium",
          timeStyle: "short",
        })}
      </span>
    </div>
  );
}
