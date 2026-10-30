import { useState } from "react"

import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
  ChevronRight,
  CircleAlert,
  FileText,
  Folder,
  Hourglass,
  Image as ImageIcon,
  ImageOff,
  Info,
  Layers,
  List,
  Pencil,
  Receipt,
  Shield,
  Thermometer,
} from "lucide-react"

import { Badge, Button } from "@effy/design-system/ui"
import {
  AGE_RESTRICTED_LABEL,
  formatAttributeValue,
  GST_STATUS_WORDS,
  STORAGE_WORDS,
  type CategoryFormDTO,
} from "@effy/shared-types"
import { ActivityLogDrawer, useActivityLog } from "@effy/web-kit/activity-log"
import { ErrorState } from "@effy/web-kit/console"
import {
  Banner,
  BoneLines,
  InspectorRows,
  InspectorSection,
  Loading,
  RecordFacts,
  RecordHeader,
  RecordNav,
  RecordPage,
  RecordSection,
} from "@effy/web-kit/patterns"
import {
  DetailGroups,
  ListingQuality,
  ProductPageSkeleton,
  ShopperPreview,
  type DetailGroup,
} from "@effy/web-kit/product-page"

import { api } from "@/lib/api"

import { ProductStatusBadge } from "./components/ProductStatusBadge"
import { orderedMedia } from "./detailFormat"
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
import { priceRange, shopPreviewSizes, shopQuality, shopSizes } from "./productPage"
import { ProductSizes } from "./ProductSizes"
import { categoryFormQuery, productDetailQuery } from "./queries"
import { isApproved, reviewChip, workingDetail } from "./review"
import { ReviewPanel } from "./ReviewPanel"
import { SectionAssignment } from "./SectionAssignment"
import { defaultStockVariantId } from "@effy/web-kit/product-form"

type EditTarget = "basics" | "sizes" | "category" | "facts" | { section: string } | null

const BACK = { label: "Catalog", link: { to: "/catalog" } } as const

const SECTIONS = [
  { id: "sizes", icon: Layers, title: "Sizes and prices" },
  { id: "pictures", icon: ImageIcon, title: "Pictures" },
  { id: "about", icon: FileText, title: "Description" },
  { id: "details", icon: List, title: "Details" },
] as const

export function ProductDetailScreen({ productId, initialSize }: { productId: string; initialSize?: string }) {
  return <ProductDetailBody key={productId} productId={productId} initialSize={initialSize} />
}

function ProductDetailBody({ productId, initialSize }: { productId: string; initialSize?: string }) {
  const { data, error, isPending, isError, refetch } = useQuery(productDetailQuery(productId))
  const [editing, setEditing] = useState<EditTarget>(null)
  // Details a save removed (a new category, a size gone): said once, until dismissed.
  const [dropped, setDropped] = useState<string[]>([])
  const navigate = useNavigate()
  const activity = useActivityLog()
  // Prices being typed in the spreadsheet: the preview follows them before anything is saved.
  const [typedPrices, setTypedPrices] = useState<Record<string, string> | null>(null)

  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />
  if (isPending) {
    return (
      <ProductPageSkeleton
        back={BACK}
        facts={["Shoppers see it", "Customers pay", "Your price", "In stock", "Listing"]}
        sections={SECTIONS}
        rail={["How shoppers see it", "Listing quality", "Organisation and facts"]}
      />
    )
  }

  const detail: ProductDetail = data
  const working = workingDetail(detail)
  const chip = reviewChip(detail.reviewState)
  const approved = isApproved(detail)
  const sizes = shopSizes(detail)
  const onSale = sizes.filter((s) => s.onSale)
  const soldOut = onSale.length > 0 && onSale.every((s) => s.stock.out)
  const media = orderedMedia(detail)
  const quality = shopQuality(detail)
  const done = quality.filter((q) => q.ok).length
  const toFix = quality.filter((q) => !q.ok && q.required).length
  // Effy is still setting this product up (102): the shop sees it, and changes it once it is on sale.
  const readOnly = detail.reviewState === "effy_setup"
  const visible = detail.status === "active" && detail.hold === null
  const edit = (target: Exclude<EditTarget, null>) => () => setEditing(target)
  const editingSection = editing !== null && typeof editing === "object" ? editing.section : null
  const stockVariantId =
    initialSize && sizes.some((s) => s.id === initialSize) ? initialSize : (defaultStockVariantId(detail) ?? "")
  const counted = sizes.filter((s) => s.stock.tracked)
  const units = counted.reduce((n, s) => n + Math.max(0, s.stock.onHand ?? 0), 0)
  const low = sizes.filter((s) => s.stock.low).length
  const out = sizes.filter((s) => s.stock.out).length
  const editButton = (target: Exclude<EditTarget, null>, label = "Edit") =>
    readOnly ? undefined : (
      <Button variant="ghost" size="sm" onClick={edit(target)}>
        <Pencil aria-hidden="true" />
        {label}
      </Button>
    )

  return (
    <RecordPage
      railTitle="About this product"
      rail={
        <>
          <InspectorSection title="How shoppers see it">
            <ShopperPreview
              imageUrl={orderedMedia(working)[0]?.url ?? null}
              brand={working.brand}
              name={working.name}
              shortDescription={working.shortDescription}
              aisle={working.categoryPath.slice(-2).join(" › ")}
              facts={[
                { label: "Storage", value: STORAGE_WORDS[working.storage] },
                ...(working.ageRestricted ? [{ label: "Age", value: AGE_RESTRICTED_LABEL }] : []),
              ]}
              sizes={shopPreviewSizes(detail, typedPrices)}
              badges={<PreviewBadges detail={detail} />}
              note={
                detail.pendingChange || typedPrices
                  ? "Shows your change as you make it. Shoppers see it once Effy approves it."
                  : detail.hold
                    ? "Effy is holding it, so shoppers can't see it now. This is how it looks when it is back."
                    : !visible
                      ? "Shoppers can't see it now. This is how it looks when it is on sale."
                      : "Sold as Effy - shoppers never see which shop supplies it."
              }
            />
          </InspectorSection>

          <InspectorSection
            title="Listing quality"
            actions={
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {done} of {quality.length}
              </span>
            }
          >
            <ListingQuality items={quality} />
          </InspectorSection>

          <InspectorSection title="Organisation and facts" actions={editButton("facts")}>
            <InspectorRows
              rows={[
                {
                  key: "category",
                  icon: Folder,
                  label: "Category",
                  value: (
                    <>
                      {detail.categoryPath[detail.categoryPath.length - 1]}
                      {readOnly ? null : (
                        <Button variant="link" className="h-auto p-0 text-[13px]" onClick={edit("category")}>
                          Change
                        </Button>
                      )}
                    </>
                  ),
                },
                { key: "storage", icon: Thermometer, label: "Storage", value: STORAGE_WORDS[detail.storage] },
                { key: "gst", icon: Receipt, label: "GST", value: GST_STATUS_WORDS[detail.gstStatus] },
                { key: "age", icon: Shield, label: "Age", value: detail.ageRestricted ? "18+ only" : "Anyone" },
              ]}
            />
          </InspectorSection>

          <InspectorSection title="Sections">
            <p className="mb-3 text-[13px] text-muted-foreground">
              Your own groupings in the catalog. Shoppers don't see them.
            </p>
            <SectionAssignment detail={detail} />
          </InspectorSection>

          <InspectorSection title="Activity">
            <p className="mb-3 text-[13px] text-muted-foreground">
              Every change to its stock, with who made it and why.
            </p>
            <Button variant="outline" onClick={() => activity.show()}>
              Open stock activity
            </Button>
          </InspectorSection>
        </>
      }
    >
      <RecordHeader
        back={BACK}
        media={
          media[0] ? (
            <img src={media[0].url} alt={media[0].altText ?? ""} />
          ) : (
            <ImageOff aria-hidden="true" className="size-6" />
          )
        }
        eyebrow={detail.categoryPath.map((p, i) => (
          <span key={`${i}-${p}`} className="inline-flex items-center gap-1">
            {i > 0 ? <ChevronRight aria-hidden="true" /> : null}
            {p}
          </span>
        ))}
        title={
          <>
            {detail.name}
            <ProductStatusBadge
              status={detail.status}
              stock={
                onSale.length === 1 || soldOut ? detail.variants.find((v) => v.id === onSale[0]?.id)?.stock : undefined
              }
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
            {detail.ageRestricted ? <Badge variant="muted">{AGE_RESTRICTED_LABEL}</Badge> : null}
          </>
        }
        meta={
          <>
            {detail.brand ? <span>{detail.brand}</span> : null}
            <span>{sizes.length === 1 ? "One size" : `${sizes.length} sizes`}</span>
            {sizes.length === 1 && sizes[0]?.code ? (
              <span>
                Effy code <span className="font-mono">{sizes[0].code}</span>
              </span>
            ) : null}
          </>
        }
        actions={
          <ProductHeaderActions
            detail={detail}
            stockVariantId={stockVariantId}
            onDeleted={() => void navigate({ to: "/catalog" })}
          />
        }
      />

      <RecordFacts
        facts={[
          {
            key: "visible",
            label: "Shoppers see it",
            value: (
              <span
                className={
                  visible
                    ? "inline-flex items-center gap-2 text-success"
                    : "inline-flex items-center gap-2 text-muted-foreground"
                }
              >
                <span aria-hidden="true" className="size-2 rounded-full bg-current" />
                {detail.hold ? "No - held by Effy" : visible ? "Yes" : readOnly ? "Not yet" : "No"}
              </span>
            ),
            note: visible
              ? `${onSale.length} of ${sizes.length} ${sizes.length === 1 ? "size" : "sizes"} on sale`
              : detail.hold
                ? "Until Effy releases it"
                : "Hidden from shoppers",
          },
          {
            key: "customer",
            label: "Customers pay",
            value: approved ? priceRange(detail, (s) => s.customerPrice) : "-",
            note: approved ? "What shoppers are charged" : "Set when Effy approves it",
          },
          {
            key: "yours",
            label: "Your price",
            value: priceRange(detail, (s) => s.pendingShopPrice ?? s.shopPrice),
            note: sizes.some((s) => s.pendingShopPrice)
              ? "Includes your change in review"
              : "What you are paid per item",
          },
          {
            key: "stock",
            label: "In stock",
            value: counted.length > 0 ? `${units} ${units === 1 ? "unit" : "units"}` : "Not counted",
            note:
              [low ? `${low} low` : "", out ? `${out} out` : ""].filter(Boolean).join(" · ") ||
              (counted.length > 0 ? "Nothing running low" : "It never runs out"),
          },
          {
            key: "listing",
            label: "Listing",
            value: `${done} of ${quality.length} ready`,
            note: toFix
              ? `${toFix} to fix`
              : done < quality.length
                ? `${quality.length - done} to improve`
                : "Complete",
          },
        ]}
      />

      <div className="mt-8 grid gap-4 empty:hidden">
        <ReviewPanel detail={detail} />

        {detail.missingRequired.length > 0 ? (
          <Banner
            tone="problem"
            icon={CircleAlert}
            title="Missing required details"
            actions={
              readOnly
                ? undefined
                : [
                  {
                    label: "Go to Details",
                    primary: true,
                    onClick: () =>
                      document.getElementById("details")?.scrollIntoView({ block: "start" }),
                  },
                ]
            }
          >
            <p>
              Its category asks for {detail.missingRequired.join(", ")}. It stays on sale, but your next change can't be
              sent to Effy without {detail.missingRequired.length === 1 ? "it" : "them"}.
            </p>
          </Banner>
        ) : null}

        {dropped.length > 0 ? (
          <Banner
            icon={Info}
            title="Some details were removed"
            actions={[{ label: "Dismiss", onClick: () => setDropped([]) }]}
          >
            <p>
              {dropped.join(", ")} no longer had a place: the new category doesn't ask for{" "}
              {dropped.length === 1 ? "it" : "them"}, or it only differed between sizes.
            </p>
          </Banner>
        ) : null}
      </div>

      <RecordNav
        items={[
          { id: "sizes", label: "Sizes and prices", count: sizes.length },
          { id: "pictures", label: "Pictures", count: media.length },
          { id: "about", label: "Description" },
          {
            id: "details",
            label: "Details",
            count: detail.missingRequired.length > 0 ? `${detail.missingRequired.length} missing` : undefined,
            problem: detail.missingRequired.length > 0,
          },
        ]}
        compact={
          <>
            {media[0] ? <img src={media[0].url} alt="" className="size-7 rounded-sm border object-cover" /> : null}
            <b className="max-w-60 truncate text-sm font-semibold">{detail.name}</b>
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <span className="text-sm text-muted-foreground tabular-nums">
              {approved ? priceRange(detail, (s) => s.customerPrice) : priceRange(detail, (s) => s.shopPrice)}
            </span>
          </>
        }
      />

      <ProductSizes detail={detail} readOnly={readOnly} onEditSizes={edit("sizes")} onDraft={setTypedPrices} />

      <MediaGallery
        detail={working}
        readOnly={readOnly}
        approved={approved}
        pending={detail.pendingChange?.media ? detail.pendingChange.state : null}
      />

      <RecordSection
        id="about"
        icon={FileText}
        title="Description"
        description="What shoppers read on the product page."
        actions={editButton("basics")}
      >
        <Description detail={detail} />
      </RecordSection>

      <RecordSection
        id="details"
        icon={List}
        title="Details"
        description={`What ${detail.categoryPath[detail.categoryPath.length - 1]} asks for. Shoppers filter and compare by these.`}
      >
        <FormSections detail={detail} onEdit={readOnly ? undefined : (section) => setEditing({ section })} />
      </RecordSection>

      <ActivityLogDrawer
        app="shop-web"
        log="shop-stock"
        title="Stock activity"
        description={`${detail.name} - every change to the count of each size, with who made it and why.`}
        api={api}
        path={`/inventory/v1/products/${detail.id}/stock/activity`}
        queryKey={["shop", "stock", "product", detail.id]}
        subjects={sizes.map((s) => ({ value: s.id, label: s.label }))}
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
    </RecordPage>
  )
}

const APPROVAL: Record<
  NonNullable<ProductDetail["reviewState"]> | "none",
  { word: string; variant: "success" | "default" | "destructive" | "quiet" }
> = {
  live: { word: "Approved", variant: "success" },
  live_change_pending: { word: "Change in review", variant: "default" },
  live_change_sent_back: { word: "Change sent back", variant: "destructive" },
  in_review: { word: "Waiting for review", variant: "default" },
  sent_back: { word: "Sent back", variant: "destructive" },
  effy_setup: { word: "Effy setting up", variant: "default" },
  draft: { word: "Not approved yet", variant: "quiet" },
  none: { word: "Not approved yet", variant: "quiet" },
}

/** Where the preview stands: whether Effy has approved it, and whether shoppers can see it now. */
function PreviewBadges({ detail }: { detail: ProductDetail }) {
  const approval = APPROVAL[detail.reviewState ?? (isApproved(detail) ? "live" : "none")]
  return (
    <>
      <Badge variant={approval.variant}>{approval.word}</Badge>
      {detail.hold ? (
        <Badge variant="destructive">Held by Effy</Badge>
      ) : detail.status === "active" ? (
        <Badge variant="outline">On sale</Badge>
      ) : (
        <Badge variant="quiet">Not on sale</Badge>
      )}
    </>
  )
}

/** The short description as the lead, the long one beneath; a change waiting for Effy shown beside what shoppers see. */
function Description({ detail }: { detail: ProductDetail }) {
  const [open, setOpen] = useState(false)
  const proposed = detail.pendingChange?.proposed
  const nextShort =
    proposed?.shortDescription !== undefined && proposed.shortDescription !== detail.shortDescription
      ? proposed.shortDescription
      : null
  const long = proposed && "longDescription" in proposed ? (proposed.longDescription ?? null) : detail.longDescription
  const lines = (long ?? "").split("\n").length
  return (
    <div className="grid gap-7">
      <div className={nextShort ? "border-l-2 border-primary-fill pl-3.5" : undefined}>
        <p className="max-w-[68ch] text-base leading-relaxed">{nextShort ?? detail.shortDescription}</p>
        {nextShort ? (
          <p className="mt-2.5 flex flex-wrap items-baseline gap-2 text-[13px] text-muted-foreground">
            <Badge variant="default">{detail.pendingChange?.state === "sent_back" ? "Sent back" : "In review"}</Badge>
            <span>
              Shoppers still see: <s>{detail.shortDescription}</s>
            </span>
          </p>
        ) : null}
      </div>
      {long ? (
        <div>
          <p
            className={
              open
                ? "max-w-[72ch] leading-7 whitespace-pre-line text-muted-foreground"
                : "line-clamp-3 max-w-[72ch] leading-7 whitespace-pre-line text-muted-foreground"
            }
          >
            {long}
          </p>
          {lines > 3 || long.length > 280 ? (
            <Button variant="link" className="mt-1.5 h-auto p-0" onClick={() => setOpen((o) => !o)}>
              {open ? "Show less" : "Show more"}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No long description yet.</p>
      )}
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
        <BoneLines count={4} className="max-w-xl" />
      </Loading>
    )
  }
  const options = new Set(detail.options.flatMap((o) => (o.attributeId ? [o.attributeId] : [])))
  const groups: DetailGroup[] = form.data.sections
    .map((s) => ({ ...s, rows: s.rows.filter((r) => !options.has(r.attributeId)) }))
    .filter((s) => s.rows.length > 0)
    .map((s) => ({
      title: s.title,
      action: onEdit ? (
        <Button variant="ghost" size="sm" onClick={() => onEdit(s.title)}>
          <Pencil aria-hidden="true" />
          Edit
        </Button>
      ) : undefined,
      rows: s.rows.map((row) => {
        const text = valueText(detail, form.data, row.attributeId)
        return {
          key: row.attributeId,
          label: row.name,
          value: text,
          required: row.level === "required",
          perSize: detail.details.some(
            (d) => d.attributeId === row.attributeId && !d.value && (d.perVariant?.length ?? 0) > 0,
          ),
          missing: row.level === "required" && text === null,
        }
      }),
    }))
  if (groups.length === 0)
    return <p className="text-sm text-muted-foreground">{pathText(detail.categoryPath)} asks for nothing more.</p>
  return (
    <DetailGroups
      groups={groups}
      onAdd={
        onEdit
          ? (row) => {
            const section = groups.find((g) => g.rows.some((r) => r.key === row.key))?.title
            return section ? (
              <Button variant="outline" size="sm" onClick={() => onEdit(section)}>
                Add
              </Button>
            ) : null
          }
          : undefined
      }
    />
  )
}

/** A detail's value as words, per size where it differs by size; null when it has none. */
function valueText(detail: ProductDetail, form: CategoryFormDTO, attributeId: string): string | null {
  const row = form.sections.flatMap((s) => s.rows).find((r) => r.attributeId === attributeId)!
  const d = detail.details.find((x) => x.attributeId === attributeId)
  if (!d) return null
  if (d.value) return formatAttributeValue(row, d.value) || null
  const labels = new Map(detailVariants(detail).map((v) => [v.id, v.label]))
  return (
    (d.perVariant ?? [])
      .map((p) => `${labels.get(p.variantId) ?? "A size"}: ${formatAttributeValue(row, p.value)}`)
      .join(" · ") || null
  )
}
