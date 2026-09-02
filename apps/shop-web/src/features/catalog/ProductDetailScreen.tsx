import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ImageOff } from "lucide-react";

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
import { LifecycleControls } from "./LifecycleControls";
import { MediaGallery } from "./MediaGallery";
import type { ProductDetail } from "./model";
import {
  AttributesEditDialog,
  BasicsEditDialog,
  CategorizationEditDialog,
  PricingEditDialog,
} from "./ProductEditDialogs";
import { productDetailQuery } from "./queries";
import { SectionAssignment } from "./SectionAssignment";
import { StockPanel } from "./StockPanel";
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
            <ProductStatusBadge status={detail.status} />
            <span className="text-[13.5px] font-medium tabular-nums whitespace-nowrap">
              {formatMoney(detail.priceAmount, detail.currency)}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <LifecycleControls detail={detail} onDeleted={() => void refetch()} />
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

          {/* Inventory is the mockup's third section and the one with live controls, so the whole
              054 panel sits inside it rather than behind a tab. */}
          <Section title="Inventory">
            <div className="pt-4">
              <StockPanel productId={productId} />
            </div>
          </Section>

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

          <Section title="Media" action={<SectionAction>Manage</SectionAction>}>
            <div className="pt-3.5">
              <MediaGallery detail={detail} />
            </div>
          </Section>

          <Section
            title="Visibility and channels"
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

        <ProductRail detail={detail} productId={productId} />
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
 * where four em-dashes and a fake chart had been shipped as if they were real. What the rail carries
 * instead is what IS known and is worth having pinned beside the sections: the live stock position and
 * the product's own lifecycle.
 */
function ProductRail({ detail, productId }: { detail: ProductDetail; productId: string }) {
  const stock = useQuery(productStockQuery(productId));

  return (
    <aside className="grid min-w-0 gap-[26px]">
      <div className="grid gap-0.5">
        <MicroLabel className="pb-2.5">Stock</MicroLabel>
        {stock.isPending ? (
          <Skeleton className="h-16 w-full" />
        ) : stock.isError ? (
          <p className="text-muted-foreground border-border border-t py-2.5 text-[13px]">
            Stock couldn&apos;t be loaded.
          </p>
        ) : (
          <>
            <RailRow
              label="Tracked"
              value={stock.data.stock.tracked ? "Yes" : "No"}
            />
            {stock.data.stock.tracked ? (
              <>
                <RailRow label="On hand" value={stock.data.stock.onHand} />
                <RailRow
                  label="Threshold"
                  value={stock.data.stock.effectiveThreshold ?? "—"}
                />
              </>
            ) : null}
            {/* ⚠ Out-of-stock reads with WEIGHT, never a hue — the one thing on this rail that
                needs a human is the one thing set in semibold. */}
            {stock.data.stock.outOfStock ? (
              <div className="border-border border-t py-2.5 text-[13px] font-semibold">
                Out of stock — shoppers cannot buy this
              </div>
            ) : null}
          </>
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
    </aside>
  );
}
