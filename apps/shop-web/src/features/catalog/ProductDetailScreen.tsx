import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import { Boxes, CircleAlert, Eye, FileText, Hourglass, ImageOff, Images, type LucideIcon } from "lucide-react"

import { Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from "@effy/design-system/ui"
import { formatAttributeValue, GST_STATUS_WORDS, STORAGE_WORDS, type CategoryFormDTO } from "@effy/shared-types"
import { ErrorState } from "@effy/web-kit/console"
import { DetailRows, PageHeader } from "@effy/web-kit/patterns"

import { DetailSection, Page, SectionAction } from "@/components/console/primitives"
import { cn } from "@/lib/utils"

import { ProductStatusBadge } from "./components/ProductStatusBadge"
import { formatMoney, orderedMedia, storefrontText } from "./detailFormat"
import { InventorySection } from "./InventorySection"
import { MediaGallery } from "./MediaGallery"
import { pathText, type ProductDetail } from "./model"
import { ProductActivitySheet } from "./ProductActivitySheet"
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
import { defaultStockVariantId, shopPriceSummary } from "./variants"
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
  const [activityOpen, setActivityOpen] = useState(false)
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
                {chip ? (
                  <span className={cn("ef-st", chip.tone === "warning" ? "ef-st--problem" : "ef-st--moving")}>
                    {chip.tone === "warning" ? <CircleAlert aria-hidden="true" /> : <Hourglass aria-hidden="true" />}
                    {chip.label}
                  </span>
                ) : null}
              </>
            }
            meta={
              <>
                {detail.brand ? <span>{detail.brand}</span> : null}
                <span>{pathText(detail.categoryPath)}</span>
                {detail.ageRestricted ? <span className="ef-st ef-st--muted">18+</span> : null}
                <span>{sizes.length === 1 ? "One size" : `${sizes.length} sizes`}</span>
                {sizes.length === 1 && sizes[0]?.code ? (
                  <span>
                    Effy code <span className="ef-code">{sizes[0].code}</span>
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

      {detail.missingRequired.length > 0 ? (
        <div role="status" className="ef-alert ef-alert--destructive">
          <CircleAlert aria-hidden="true" />
          <div className="ef-alert__title">Missing required details</div>
          <div className="ef-alert__description">
            Its category asks for {detail.missingRequired.join(", ")}. It stays on sale — fill{" "}
            {detail.missingRequired.length === 1 ? "it" : "them"} in under Details; your next change can't be sent to
            Effy without {detail.missingRequired.length === 1 ? "it" : "them"}.
          </div>
        </div>
      ) : null}

      {dropped.length > 0 ? (
        <div role="status" className="ef-alert ef-alert--info">
          <CircleAlert aria-hidden="true" />
          <div className="ef-alert__title">Some details were removed</div>
          <div className="ef-alert__description">
            {dropped.join(", ")} no longer had a place: the new category doesn't ask for{" "}
            {dropped.length === 1 ? "it" : "them"}, or it only differed between sizes.{" "}
            <button type="button" className="underline" onClick={() => setDropped([])}>
              Dismiss
            </button>
          </div>
        </div>
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
          <VariantsSection detail={detail} onEdit={edit("sizes")} />

          <DetailSection
            title="Product details"
            subtitle="Name, brand and descriptions. Codes and weights are each size's."
            action={<SectionAction onClick={edit("basics")}>Edit</SectionAction>}
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
            action={<SectionAction onClick={edit("facts")}>Edit</SectionAction>}
          >
            <DetailRows
              rows={[
                { label: "Storage", value: STORAGE_WORDS[detail.storage] },
                { label: "GST", value: GST_STATUS_WORDS[detail.gstStatus] },
                { label: "Age restriction", value: detail.ageRestricted ? "18+ only" : "Not age-restricted" },
              ]}
            />
          </DetailSection>

          <FormSections detail={detail} onEdit={(section) => setEditing({ section })} />
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
            action={<SectionAction onClick={edit("category")}>Change category</SectionAction>}
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

      <ProductActivitySheet
        detail={detail}
        variantId={stockVariantId}
        open={activityOpen}
        onOpenChange={setActivityOpen}
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
      className="size-24 shrink-0 rounded-lg border border-border object-cover max-md:size-20"
    />
  ) : (
    <div className="ef-img size-24 rounded-lg max-md:size-20">
      <ImageOff aria-hidden="true" />
    </div>
  )
}

/** The category's form, section by section, with this product's values; each section edits on its own. */
function FormSections({ detail, onEdit }: { detail: ProductDetail; onEdit: (section: string) => void }) {
  const form = useQuery(categoryFormQuery(detail.primaryCategoryId))
  if (form.isError) return <ErrorState error={form.error} onRetry={() => void form.refetch()} />
  if (!form.data) return <Skeleton className="h-32 w-full rounded-lg" />
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
          action={<SectionAction onClick={() => onEdit(s.title)}>Edit</SectionAction>}
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
