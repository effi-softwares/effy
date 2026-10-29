import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Boxes, CircleAlert, Eye, FileText, Hourglass, ImageOff, Images, type LucideIcon } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import { formatAttributeValue, GST_STATUS_WORDS, STORAGE_WORDS, type CategoryFormDTO } from "@effy/shared-types"
import { ActivityLogDrawer } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"
import {
  Bone,
  DetailRows,
  DetailRowsSkeleton,
  ListSkeleton,
  Loading,
  PageHeader,
  PageHeaderSkeleton,
  PanelSkeleton,
  TabsSkeleton,
} from "@effy/web-kit/patterns"

import { DetailSection, Page, SectionAction } from "@/components/console/primitives"
import { api } from "@/lib/api"

import { ProductStatusBadge } from "./components/ProductStatusBadge"
import { formatMoney, orderedMedia, storefrontText } from "./detailFormat"
import { InventorySection } from "./InventorySection"
import { MediaGallery } from "./MediaGallery"
import { pathText, type ProductDetail } from "./model"
import { ProductHeaderActions } from "./ProductActions"
import {
  BasicsEditDialog,
  CategoryEditDialog,
  DetailsEditDialog,
  detailVariants,
  FactsEditDialog,
  SizesEditDialog,
} from "./ProductEditDialogs"
import { categoryFormQuery, productDetailQuery } from "./queries"
import { reviewChip, workingDetail } from "./review"
import { ReviewPanel } from "./ReviewPanel"
import { SectionAssignment } from "./SectionAssignment"
import { defaultStockVariantId, shopPriceSummary } from "@effy/web-kit/product-form"
import { VariantsSection } from "./VariantsSection"

type EditTarget = "basics" | "sizes" | "category" | "facts" | { section: string } | null

type DetailTab = "details" | "inventory" | "media" | "visibility"

export function ProductDetailScreen({ productId, initialSize }: { productId: string; initialSize?: string }) {
  return <ProductDetailBody key={productId} productId={productId} initialSize={initialSize} />
}

function ProductDetailBody({ productId, initialSize }: { productId: string; initialSize?: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(productDetailQuery(productId))
  const [editing, setEditing] = useState<EditTarget>(null)
  // Details a save removed (a new category, a size gone): said once, until dismissed.
  const [dropped, setDropped] = useState<string[]>([])
  const [tab, setTab] = useState<DetailTab>("details")
  // The size whose stock the Inventory tab, Receive stock and Activity show.
  const [chosenStockVariant, setStockVariant] = useState<string | null>(initialSize ?? null)
  const navigate = useNavigate()

  const goCatalog = () => void navigate({ to: "/catalog" })

  if (isError) {
    return (
      <Page>
        <ErrorState error={error} onRetry={() => void refetch()} />
      </Page>
    )
  }
  if (isPending) {
    return (
      <Page>
        <Loading label="Loading product">
          <div className="flex items-start gap-4 max-md:flex-col">
            <Bone kind="block" className="size-20 rounded-xl max-md:size-16" />
            <div className="min-w-0 flex-1">
              <PageHeaderSkeleton
                back={{ label: "Catalog", link: { to: "/catalog" } }}
                description={false}
                meta={4}
                actions={2}
              />
            </div>
          </div>
          <TabsSkeleton
            tabs={TABS.map((t) => (
              <>
                <t.icon aria-hidden="true" />
                {t.label}
              </>
            ))}
          />
          <PanelSkeleton title="Sizes and prices" description flush>
            <ListSkeleton rows={2} lines={2} trailing="text" inset />
          </PanelSkeleton>
          <PanelSkeleton
            title="Product details"
            description="Name, brand and descriptions. Codes and weights are each size's."
          >
            <DetailRowsSkeleton labels={["Name", "Brand", "Short description", "Long description"]} />
          </PanelSkeleton>
        </Loading>
      </Page>
    )
  }

  const detail: ProductDetail = data
  const stockVariantId =
    chosenStockVariant && detail.variants.some((v) => v.id === chosenStockVariant && v.state !== "removed")
      ? chosenStockVariant
      : (defaultStockVariantId(detail) ?? "")
  const working = workingDetail(detail)
  const chip = reviewChip(detail.reviewState)
  const price = shopPriceSummary(detail)
  const onSale = detail.variants.filter((v) => v.state === "active")
  const soldOut = onSale.length > 0 && onSale.every((v) => v.stock.outOfStock)
  // Effy is still setting this product up (102): the shop sees it, and changes it once it is on sale.
  const readOnly = detail.reviewState === "effy_setup"
  const edit = (target: Exclude<EditTarget, null>) => () => setEditing(target)
  const editingSection = editing !== null && typeof editing === "object" ? editing.section : null

  const sizes = detail.variants.filter((v) => v.state !== "removed")

  return (
    <Page>
      <div className="flex items-start gap-4 max-md:flex-col">
        <ProductThumb detail={detail} />
        <div className="min-w-0 flex-1">
          <PageHeader
            back={{ label: "Catalog", link: { to: "/catalog" } }}
            title={
              <>
                {detail.name}
                <ProductStatusBadge
                  status={detail.status}
                  stock={onSale.length === 1 || soldOut ? onSale[0]?.stock : undefined}
                />
                {detail.hold ? (
                  <Badge variant="destructive">
                    <CircleAlert aria-hidden="true" />
                    Held by Effy
                  </Badge>
                ) : null}
                {chip ? (
                  <Badge variant={chip.tone === "warning" ? "destructive" : "default"}>
                    {chip.tone === "warning" ? <CircleAlert aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
                    {chip.label}
                  </Badge>
                ) : null}
              </>
            }
            meta={
              <>
                {detail.brand ? <span>{detail.brand}</span> : null}
                <span>{pathText(detail.categoryPath)}</span>
                {detail.ageRestricted ? <Badge variant="muted">18+</Badge> : null}
                <span>{sizes.length === 1 ? "One size" : `${sizes.length} sizes`}</span>
                {sizes.length === 1 && sizes[0]?.code ? (
                  <span>
                    Effy code <span className="font-mono">{sizes[0].code}</span>
                  </span>
                ) : null}
                <span className="font-medium text-foreground tabular-nums">
                  {price.amount ? `${price.varies ? "From " : ""}${formatMoney(price.amount, detail.currency)}` : "—"}
                </span>
              </>
            }
            actions={<ProductHeaderActions detail={detail} stockVariantId={stockVariantId} onDeleted={goCatalog} />}
          />
        </div>
      </div>

      <ReviewPanel detail={detail} />

      {detail.missingRequired.length > 0 ? (
        <Alert role="status" variant="destructive">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Missing required details</AlertTitle>
          <AlertDescription>
            Its category asks for {detail.missingRequired.join(", ")}. It stays on sale — fill{" "}
            {detail.missingRequired.length === 1 ? "it" : "them"} in under Details; your next change can't be sent to
            Effy without {detail.missingRequired.length === 1 ? "it" : "them"}.
          </AlertDescription>
        </Alert>
      ) : null}

      {dropped.length > 0 ? (
        <Alert role="status" variant="info">
          <CircleAlert aria-hidden="true" />
          <AlertTitle>Some details were removed</AlertTitle>
          <AlertDescription className="block">
            {dropped.join(", ")} no longer had a place: the new category doesn't ask for{" "}
            {dropped.length === 1 ? "it" : "them"}, or it only differed between sizes.{" "}
            <Button variant="link" className="h-auto p-0" onClick={() => setDropped([])}>
              Dismiss
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}

      <Tabs value={tab} onValueChange={(v) => setTab(v as DetailTab)} className="gap-6">
        <div className="ef-tabsbar">
          <div className="ef-tabsbar__list">
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

        <TabsContent value="details" className="ef-tabpanel">
          <VariantsSection detail={detail} onEdit={readOnly ? undefined : edit("sizes")} />

          <DetailSection
            title="Product details"
            subtitle="Name, brand and descriptions. Codes and weights are each size's."
            action={readOnly ? undefined : <SectionAction onClick={edit("basics")}>Edit</SectionAction>}
          >
            <DetailRows
              rows={[
                { label: "Name", value: detail.name },
                { label: "Brand", value: detail.brand ?? "—" },
                { label: "Short description", value: detail.shortDescription },
                {
                  label: "Long description",
                  value: <span className="whitespace-pre-line">{detail.longDescription ?? "—"}</span>,
                },
              ]}
            />
          </DetailSection>

          <DetailSection
            title="Storage, GST and age"
            subtitle="Fixed facts Effy acts on. Each starts from the category's default."
            action={readOnly ? undefined : <SectionAction onClick={edit("facts")}>Edit</SectionAction>}
          >
            <DetailRows
              rows={[
                { label: "Storage", value: STORAGE_WORDS[detail.storage] },
                { label: "GST", value: GST_STATUS_WORDS[detail.gstStatus] },
                { label: "Age restriction", value: detail.ageRestricted ? "18+ only" : "Not age-restricted" },
              ]}
            />
          </DetailSection>

          <FormSections detail={detail} onEdit={readOnly ? undefined : (section) => setEditing({ section })} />
        </TabsContent>

        <TabsContent value="inventory" className="ef-tabpanel">
          <InventorySection detail={detail} variantId={stockVariantId} onVariantChange={setStockVariant} />
        </TabsContent>

        <TabsContent value="media" className="ef-tabpanel">
          <MediaGallery detail={working} />
        </TabsContent>

        <TabsContent value="visibility" className="ef-tabpanel">
          <DetailSection
            title="Visibility and placement"
            subtitle="Whether shoppers can see this product, and where it is filed."
            action={readOnly ? undefined : <SectionAction onClick={edit("category")}>Change category</SectionAction>}
          >
            <DetailRows
              rows={[
                { label: "Storefront", value: storefrontText(detail.status) },
                { label: "Category", value: pathText(detail.categoryPath) },
                { label: "Sections", value: <SectionAssignment detail={detail} /> },
              ]}
            />
          </DetailSection>
        </TabsContent>
      </Tabs>

      <ActivityLogDrawer
        app="shop-web"
        log="shop-stock"
        title="Stock activity"
        description={`${detail.name} — every change to the count of each size, with who made it and why.`}
        api={api}
        path={`/inventory/v1/products/${detail.id}/stock/activity`}
        queryKey={["shop", "stock", "product", detail.id]}
        subjects={sizes.map((v) => ({ value: v.id, label: v.label ?? detail.name }))}
        fileName={`stock-${detail.name}-activity`}
      />

      <BasicsEditDialog
        detail={working}
        open={editing === "basics"}
        onOpenChange={(o) => setEditing(o ? "basics" : null)}
      />
      <SizesEditDialog
        detail={working}
        open={editing === "sizes"}
        onOpenChange={(o) => setEditing(o ? "sizes" : null)}
        onDropped={setDropped}
      />
      <CategoryEditDialog
        detail={working}
        open={editing === "category"}
        onOpenChange={(o) => setEditing(o ? "category" : null)}
        onDropped={setDropped}
      />
      <FactsEditDialog
        detail={working}
        open={editing === "facts"}
        onOpenChange={(o) => setEditing(o ? "facts" : null)}
      />
      <DetailsEditDialog
        detail={working}
        section={editingSection}
        open={editingSection !== null}
        onOpenChange={(o) => !o && setEditing(null)}
      />
    </Page>
  )
}

const TABS: readonly { value: DetailTab; label: string; icon: LucideIcon }[] = [
  { value: "details", label: "Details", icon: FileText },
  { value: "inventory", label: "Inventory", icon: Boxes },
  { value: "media", label: "Media", icon: Images },
  { value: "visibility", label: "Visibility", icon: Eye },
]

function ProductThumb({ detail }: { detail: ProductDetail }) {
  const primary = orderedMedia(detail)[0]
  return primary ? (
    <img
      src={primary.url}
      alt={primary.altText ?? ""}
      className="size-20 shrink-0 rounded-xl border object-cover max-md:size-16"
    />
  ) : (
    <div className="grid size-20 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground max-md:size-16">
      <ImageOff aria-hidden="true" className="size-6" />
    </div>
  )
}

/** The category's form, section by section, with this product's values; each section edits on its own. */
function FormSections({ detail, onEdit }: { detail: ProductDetail; onEdit?: (section: string) => void }) {
  const form = useQuery(categoryFormQuery(detail.primaryCategoryId))
  if (form.isError) return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
  if (!form.data) {
    return (
      <Loading label="Loading the category's details">
        <PanelSkeleton description={`What ${detail.categoryPath[detail.categoryPath.length - 1]} asks for.`} rows={3} />
      </Loading>
    )
  }
  const options = new Set(detail.options.flatMap((o) => (o.attributeId ? [o.attributeId] : [])))
  const sections = form.data.sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => !options.has(r.attributeId)) }))
    .filter((s) => s.rows.length > 0)
  if (sections.length === 0) return null
  return (
    <>
      {sections.map((s) => (
        <DetailSection
          key={s.title}
          title={s.title}
          subtitle={`What ${detail.categoryPath[detail.categoryPath.length - 1]} asks for.`}
          action={onEdit ? <SectionAction onClick={() => onEdit(s.title)}>Edit</SectionAction> : undefined}
        >
          <DetailRows
            rows={s.rows.map((row) => ({
              key: row.attributeId,
              label: row.name,
              value: valueText(detail, form.data, row.attributeId),
            }))}
          />
        </DetailSection>
      ))}
    </>
  )
}

function valueText(detail: ProductDetail, form: CategoryFormDTO, attributeId: string): string {
  const row = form.sections.flatMap((s) => s.rows).find((r) => r.attributeId === attributeId)!
  const d = detail.details.find((x) => x.attributeId === attributeId)
  const empty = row.level === "required" ? "Missing — required" : "—"
  if (!d) return empty
  if (d.value) return formatAttributeValue(row, d.value) || empty
  const labels = new Map(detailVariants(detail).map((v) => [v.id, v.label]))
  return (
    (d.perVariant ?? [])
      .map((p) => `${labels.get(p.variantId) ?? "A size"}: ${formatAttributeValue(row, p.value)}`)
      .join(" · ") || empty
  )
}
