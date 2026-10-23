import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, ImageOff } from "lucide-react";

import {
  Badge,
  LoadingArea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui";
import { GST_STATUS_WORDS } from "@effy/shared-types";
import { ErrorState } from "@effy/web-kit/console";

import {
  DetailSection,
  Field,
  FieldGrid,
  MetaDivider,
  MicroLabel,
  Page,
  SectionAction,
} from "@/components/console/primitives";

import { ProductStatusBadge } from "./components/ProductStatusBadge";
import {
  formatAttributeValue,
  formatMoney,
  orderedMedia,
  storefrontText,
} from "./detailFormat";
import { InventorySection } from "./InventorySection";
import { MediaGallery } from "./MediaGallery";
import type { ProductDetail } from "./model";
import { ProductActivitySheet } from "./ProductActivitySheet";
import { ProductHeaderActions } from "./ProductActions";
import {
  AttributesEditDialog,
  BasicsEditDialog,
  CategorizationEditDialog,
  SizesEditDialog,
} from "./ProductEditDialogs";
import { productDetailQuery } from "./queries";
import { reviewChip, workingDetail } from "./review";
import { ReviewPanel } from "./ReviewPanel";
import { SectionAssignment } from "./SectionAssignment";
import { defaultStockVariantId, shopPriceSummary } from "./variants";
import { VariantsSection } from "./VariantsSection";

type EditTarget = "basics" | "sizes" | "categorization" | "attributes" | null;

type DetailTab = "details" | "inventory" | "media" | "visibility";

/**
 * Product detail, rebuilt to the imported design (057) — revised 2026-09-10.
 *
 * ⚠ TABS ARE BACK, AND THAT IS NOT A REVERSAL OF THE FIRST REBUILD. The pre-057 screen was six tabs
 * that split "is this priced right" from "do we have any"; the first rebuild laid everything down one
 * scroll beside a summary rail. The revised mockup lands between the two: FOUR tabs, grouped by the
 * question an operator arrives with — Details (what is it, what does it cost), Inventory (how many,
 * what moved), Media, Visibility. Price and stock rules no longer share a scroll, but neither is one
 * click away from its own neighbour any more.
 *
 * ⚠ THE RAIL IS GONE. Its change log could only ever show four entries in 260px; it now lives in an
 * "Activity" sheet with a scrollable surface of its own, and the Archive control moved up into the
 * header's action row. The page is one full-width column.
 *
 * ⚠ THE TAB RESETS PER PRODUCT. The body is keyed on `productId`, so moving from one product to
 * another lands on Details — a tab is where you are on THIS product, not a preference to carry over.
 */
export function ProductDetailScreen({ productId, initialSize }: { productId: string; initialSize?: string }) {
  return <ProductDetailBody key={productId} productId={productId} initialSize={initialSize} />;
}

function ProductDetailBody({ productId, initialSize }: { productId: string; initialSize?: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(productDetailQuery(productId));
  const [editing, setEditing] = useState<EditTarget>(null);
  const [tab, setTab] = useState<DetailTab>("details");
  const [activityOpen, setActivityOpen] = useState(false);
  // 098 — the size whose stock the Inventory tab, Receive stock and Activity show.
  const [chosenStockVariant, setStockVariant] = useState<string | null>(initialSize ?? null);
  const navigate = useNavigate();

  const goCatalog = () => void navigate({ to: "/catalog" });

  if (isError) {
    return (
      <Page>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    );
  }
  if (isPending) {
    return (
      <Page>
        <LoadingArea variant="page" title="Loading product" description="Fetching its details, pricing and stock." />
      </Page>
    );
  }

  const detail: ProductDetail = data;
  const stockVariantId =
    chosenStockVariant && detail.variants.some((v) => v.id === chosenStockVariant && v.state !== "removed")
      ? chosenStockVariant
      : (defaultStockVariantId(detail) ?? "");
  // 067 — the page shows the LIVE product; the editors open on the shop's own latest version.
  const working = workingDetail(detail);
  const chip = reviewChip(detail.reviewState);
  // 098 — the header's price is the cheapest size on sale, "From" when sizes differ; its stock chip
  // answers for the product as a whole (sold out only when every size on sale is).
  const price = shopPriceSummary(detail);
  const onSale = detail.variants.filter((v) => v.state === "active");
  const soldOut = onSale.length > 0 && onSale.every((v) => v.stock.outOfStock);
  const edit = (target: Exclude<EditTarget, null>) => () => setEditing(target);

  return (
    <Page className="gap-[22px]">
      {/* ── Hero: image, identity, and the header's four actions ───────────────────────────────── */}
      <div className="flex flex-wrap items-start gap-[18px]">
        <ProductThumb detail={detail} />

        <div className="grid min-w-[220px] flex-1 gap-[7px]">
          <h1 className="text-[22px] leading-[1.15] font-semibold tracking-[-.025em]">
            {detail.name}
          </h1>
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-muted-foreground text-[12.5px] whitespace-nowrap">
              {detail.variants.filter((v) => v.state !== "removed").length === 1
                ? (detail.variants[0]?.code ?? "")
                : `${detail.variants.filter((v) => v.state !== "removed").length} sizes`}
            </span>
            <MetaDivider />
            <span className="text-muted-foreground text-[13px]">{detail.categoryName}</span>
            <MetaDivider />
            {/* ⚠ The header chip answers "can a shopper buy this right now", which is the question
                an operator opens this screen with — so it takes the live stock the rest of the page
                is already reading rather than reporting a lifecycle state an empty shelf contradicts. */}
            <ProductStatusBadge status={detail.status} stock={onSale.length === 1 || soldOut ? onSale[0]?.stock : undefined} />
            {chip ? <Badge variant={chip.tone}>{chip.label}</Badge> : null}
            <span className="text-[13.5px] font-medium tabular-nums whitespace-nowrap">
              {price.amount ? `${price.varies ? "From " : ""}${formatMoney(price.amount, detail.currency)}` : "—"}
            </span>
          </div>
        </div>

        {/* Receive stock · Unpublish/Publish · Activity · Archive — the mockup's order. */}
        <ProductHeaderActions
          detail={detail}
          stockVariantId={stockVariantId}
          onOpenActivity={() => setActivityOpen(true)}
          onDeleted={goCatalog}
        />
      </div>

      <ReviewPanel detail={detail} />

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
              {detail.missingMandatoryAttributes.join(", ")}. It stays visible — add them under
              Details → Attributes to keep it complete.
            </p>
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="gap-[22px]">
        <TabsList className="max-w-full flex-wrap">
          {TABS.map((t) => (
            <TabsTrigger
              key={t.value}
              value={t.value}
              // ⚠ Inactive triggers are MUTED in both appearances. The shared trigger's light-mode
              // default is full foreground, which leaves the active tab told apart by its fill alone.
              className="text-muted-foreground hover:text-foreground data-[state=active]:text-foreground flex-none px-[13px]"
            >
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* ── Details: what it is, and what it costs ─────────────────────────────────────────── */}
        <TabsContent value="details" className="grid gap-[34px]">
          <DetailSection
            title="Product details"
            subtitle="Name, brand and how this product is taxed. Codes and weights are each size's."
            action={<SectionAction onClick={edit("basics")}>Edit</SectionAction>}
          >
            <FieldGrid>
              <Field label="Name" value={detail.name} />
              <Field label="Brand" value={detail.brand ?? "—"} />
              <Field label="GST" value={detail.gstStatus ? GST_STATUS_WORDS[detail.gstStatus] : "Not set"} />
              <Field label="Short description" value={detail.shortDescription} wide />
              <Field label="Long description" value={detail.longDescription ?? "—"} wide />
            </FieldGrid>
          </DetailSection>

          <VariantsSection detail={detail} onEdit={edit("sizes")} />

          {/* Not in the mockup, which has no typed attributes; it belongs with the other facts about
              what the product IS, so it closes the Details tab. */}
          <DetailSection
            title="Attributes"
            subtitle="The extra details this product's type asks for."
            action={<SectionAction onClick={edit("attributes")}>Edit</SectionAction>}
          >
            {detail.attributes.length === 0 ? (
              <p className="text-muted-foreground pt-[18px] text-[13px]">
                This product&apos;s type has no extra attributes.
              </p>
            ) : (
              <FieldGrid>
                {detail.attributes.map((a) => (
                  <Field
                    key={a.name}
                    label={a.unit ? `${a.name} (${a.unit})` : a.name}
                    value={formatAttributeValue(a)}
                  />
                ))}
              </FieldGrid>
            )}
          </DetailSection>
        </TabsContent>

        {/* ── Inventory: Stock rules + Stock movements (see InventorySection) ─────────────────── */}
        <TabsContent value="inventory" className="grid gap-[34px]">
          <InventorySection detail={detail} variantId={stockVariantId} onVariantChange={setStockVariant} />
        </TabsContent>

        <TabsContent value="media" className="grid gap-[34px]">
          {/* The gallery edits the shop's own latest image set — the proposed one when images are
              part of a pending change (067). */}
          <MediaGallery detail={working} />
        </TabsContent>

        {/* ⚠ THE MOCKUP CALLS THIS "Visibility and channels" AND OURS MUST NOT. Effy is a single-brand
            storefront with hidden fulfilment: there is exactly one channel, so a heading promising
            several describes a choice the operator does not have. What the tab really holds is
            whether shoppers can see the product and where it is filed. */}
        <TabsContent value="visibility" className="grid gap-[34px]">
          <DetailSection
            title="Visibility and placement"
            subtitle="Whether shoppers can see this product, and where it is filed."
            action={<SectionAction onClick={edit("categorization")}>Edit</SectionAction>}
          >
            <FieldGrid>
              <Field label="Storefront" value={storefrontText(detail.status)} />
              <Field label="Type" value={detail.typeName} />
              <Field label="Category" value={detail.categoryName} />
            </FieldGrid>
            <div className="grid gap-2 pt-[18px]">
              <MicroLabel>Sections</MicroLabel>
              <SectionAssignment detail={detail} />
            </div>
          </DetailSection>
        </TabsContent>
      </Tabs>

      <ProductActivitySheet detail={detail} variantId={stockVariantId} open={activityOpen} onOpenChange={setActivityOpen} />

      <BasicsEditDialog
        detail={working}
        open={editing === "basics"}
        onOpenChange={(o) => setEditing(o ? "basics" : null)}
      />
      <SizesEditDialog
        detail={working}
        open={editing === "sizes"}
        onOpenChange={(o) => setEditing(o ? "sizes" : null)}
      />
      <CategorizationEditDialog
        detail={working}
        open={editing === "categorization"}
        onOpenChange={(o) => setEditing(o ? "categorization" : null)}
      />
      <AttributesEditDialog
        detail={working}
        open={editing === "attributes"}
        onOpenChange={(o) => setEditing(o ? "attributes" : null)}
      />
    </Page>
  );
}

const TABS: readonly { value: DetailTab; label: string }[] = [
  { value: "details", label: "Details" },
  { value: "inventory", label: "Inventory" },
  { value: "media", label: "Media" },
  { value: "visibility", label: "Visibility" },
];

function ProductThumb({ detail }: { detail: ProductDetail }) {
  const primary = orderedMedia(detail)[0];
  return primary ? (
    <img
      src={primary.url}
      alt={primary.altText ?? ""}
      className="border-border size-[72px] shrink-0 rounded-[var(--radius)] border object-cover"
    />
  ) : (
    // The design's image placeholder — a --brand-soft tile, not a bordered grey box.
    <div className="grid size-[72px] shrink-0 place-items-center rounded-[7px] bg-brand-soft text-brand">
      <ImageOff className="size-5" />
    </div>
  );
}
