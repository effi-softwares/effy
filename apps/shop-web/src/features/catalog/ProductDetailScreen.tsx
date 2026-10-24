import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Boxes, CircleAlert, Eye, FileText, Hourglass, ImageOff, Images, type LucideIcon } from "lucide-react";

import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@effy/design-system/ui";
import { GST_STATUS_WORDS } from "@effy/shared-types";
import { ErrorState } from "@effy/web-kit/console";
import { DetailRows, PageHeader } from "@effy/web-kit/patterns";

import { DetailSection, Page, SectionAction } from "@/components/console/primitives";
import { cn } from "@/lib/utils";

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
 * Product detail (redesign, "08 Product"): the page head (picture, name, state, what it is, the header's
 * verbs), the review panel when Effy has something to say, then four tabs grouped by the question an
 * operator arrives with — Details, Inventory, Media, Visibility. The change log is in the Activity sheet.
 * The body is keyed on `productId`, so another product opens on Details.
 */
export function ProductDetailScreen({ productId, initialSize }: { productId: string; initialSize?: string }) {
  return <ProductDetailBody key={productId} productId={productId} initialSize={initialSize} />;
}

function ProductDetailBody({ productId, initialSize }: { productId: string; initialSize?: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(productDetailQuery(productId));
  const [editing, setEditing] = useState<EditTarget>(null);
  const [tab, setTab] = useState<DetailTab>("details");
  const [activityOpen, setActivityOpen] = useState(false);
  // The size whose stock the Inventory tab, Receive stock and Activity show.
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
        <div className="flex items-start gap-4" aria-busy="true" aria-label="Loading product">
          <Skeleton className="size-24 rounded-lg" />
          <div className="grid flex-1 gap-3">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80 max-w-full" />
          </div>
        </div>
        <Skeleton className="h-12 w-96 max-w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-lg" />
      </Page>
    );
  }

  const detail: ProductDetail = data;
  const stockVariantId =
    chosenStockVariant && detail.variants.some((v) => v.id === chosenStockVariant && v.state !== "removed")
      ? chosenStockVariant
      : (defaultStockVariantId(detail) ?? "");
  // The page shows the live product; the editors open on the shop's own latest version.
  const working = workingDetail(detail);
  const chip = reviewChip(detail.reviewState);
  // The header's price is the cheapest size on sale, "From" when sizes differ; its stock chip
  // answers for the product as a whole (sold out only when every size on sale is).
  const price = shopPriceSummary(detail);
  const onSale = detail.variants.filter((v) => v.state === "active");
  const soldOut = onSale.length > 0 && onSale.every((v) => v.stock.outOfStock);
  const edit = (target: Exclude<EditTarget, null>) => () => setEditing(target);

  const sizes = detail.variants.filter((v) => v.state !== "removed");

  return (
    <Page>
      {/* The page head: the picture, the name with its state, what it is, and the header's verbs. */}
      <div className="flex items-start gap-4 max-md:flex-col">
        <ProductThumb detail={detail} />
        <div className="min-w-0 flex-1">
          <PageHeader
            back={{ label: "Catalog", link: { to: "/catalog" } }}
            title={
              <>
                {detail.name}
                {/* The header word answers "can a shopper buy this right now", so it takes the live
                    stock the page is already reading rather than a state an empty shelf contradicts. */}
                <ProductStatusBadge status={detail.status} stock={onSale.length === 1 || soldOut ? onSale[0]?.stock : undefined} />
                {chip ? (
                  <span className={cn("bo-st", chip.tone === "warning" ? "bo-st--problem" : "bo-st--moving")}>
                    {chip.tone === "warning" ? <CircleAlert aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
                    {chip.label}
                  </span>
                ) : null}
              </>
            }
            meta={
              <>
                {detail.brand ? <span>{detail.brand}</span> : null}
                <span>{detail.categoryName}</span>
                <span>{sizes.length === 1 ? "One size" : `${sizes.length} sizes`}</span>
                {sizes.length === 1 && sizes[0]?.code ? (
                  <span>
                    Effy code <span className="bo-code">{sizes[0].code}</span>
                  </span>
                ) : null}
                <span className="font-medium text-foreground tabular-nums">
                  {price.amount ? `${price.varies ? "From " : ""}${formatMoney(price.amount, detail.currency)}` : "—"}
                </span>
              </>
            }
            actions={
              <ProductHeaderActions
                detail={detail}
                stockVariantId={stockVariantId}
                onOpenActivity={() => setActivityOpen(true)}
                onDeleted={goCatalog}
              />
            }
          />
        </div>
      </div>

      <ReviewPanel detail={detail} />

      {detail.missingMandatoryAttributes.length > 0 ? (
        <div role="status" className="bo-alert bo-alert--destructive">
          <CircleAlert aria-hidden="true" />
          <div className="bo-alert__title">Missing required details</div>
          <div className="bo-alert__description">
            This product&apos;s type now requires attributes it doesn&apos;t have:{" "}
            {detail.missingMandatoryAttributes.join(", ")}. It stays visible — add them under Details → Attributes to
            keep it complete.
          </div>
        </div>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="gap-6">
        <div className="bo-tabsbar">
          <div className="bo-tabsbar__list">
            <TabsList>
              {TABS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  <t.icon aria-hidden="true" />
                  {t.label}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </div>

        {/* Details: what it is, and what it costs */}
        <TabsContent value="details" className="bo-tabpanel">
          <VariantsSection detail={detail} onEdit={edit("sizes")} />

          <DetailSection
            title="Product details"
            subtitle="Name, brand and how this product is taxed. Codes and weights are each size's."
            action={<SectionAction onClick={edit("basics")}>Edit</SectionAction>}
          >
            <DetailRows
              rows={[
                { label: "Name", value: detail.name },
                { label: "Brand", value: detail.brand ?? "—" },
                { label: "Type", value: detail.typeName },
                { label: "Short description", value: detail.shortDescription },
                { label: "Long description", value: <span className="whitespace-pre-line">{detail.longDescription ?? "—"}</span> },
                { label: "GST", value: detail.gstStatus ? GST_STATUS_WORDS[detail.gstStatus] : "Not set" },
              ]}
            />
          </DetailSection>

          <DetailSection
            title="Attributes"
            subtitle="The details this product type asks for."
            action={<SectionAction onClick={edit("attributes")}>Edit</SectionAction>}
          >
            {detail.attributes.length === 0 ? (
              <p className="text-muted-foreground">This product&apos;s type has no extra attributes.</p>
            ) : (
              <DetailRows
                rows={detail.attributes.map((a) => ({
                  key: a.name,
                  label: a.unit ? `${a.name} (${a.unit})` : a.name,
                  value: formatAttributeValue(a),
                }))}
              />
            )}
          </DetailSection>
        </TabsContent>

        {/* Inventory: Stock rules + Stock movements (see InventorySection) */}
        <TabsContent value="inventory" className="bo-tabpanel">
          <InventorySection detail={detail} variantId={stockVariantId} onVariantChange={setStockVariant} />
        </TabsContent>

        <TabsContent value="media" className="bo-tabpanel">
          {/* The gallery edits the shop's own latest image set — the proposed one when images are
              part of a pending change. */}
          <MediaGallery detail={working} />
        </TabsContent>

        {/* Not "Visibility and channels": Effy is one storefront with hidden fulfilment, so there is
            exactly one channel. The tab holds whether shoppers can see the product and where it is filed. */}
        <TabsContent value="visibility" className="bo-tabpanel">
          <DetailSection
            title="Visibility and placement"
            subtitle="Whether shoppers can see this product, and where it is filed."
            action={<SectionAction onClick={edit("categorization")}>Edit</SectionAction>}
          >
            <DetailRows
              rows={[
                { label: "Storefront", value: storefrontText(detail.status) },
                { label: "Type", value: detail.typeName },
                { label: "Category", value: detail.categoryName },
                { label: "Sections", value: <SectionAssignment detail={detail} /> },
              ]}
            />
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

const TABS: readonly { value: DetailTab; label: string; icon: LucideIcon }[] = [
  { value: "details", label: "Details", icon: FileText },
  { value: "inventory", label: "Inventory", icon: Boxes },
  { value: "media", label: "Media", icon: Images },
  { value: "visibility", label: "Visibility", icon: Eye },
];

function ProductThumb({ detail }: { detail: ProductDetail }) {
  const primary = orderedMedia(detail)[0];
  return primary ? (
    <img
      src={primary.url}
      alt={primary.altText ?? ""}
      className="size-24 shrink-0 rounded-lg border border-border object-cover max-md:size-20"
    />
  ) : (
    <div className="bo-img size-24 rounded-lg max-md:size-20">
      <ImageOff aria-hidden="true" />
    </div>
  );
}
