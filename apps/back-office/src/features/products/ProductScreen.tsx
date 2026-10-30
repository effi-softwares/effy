import { useState, type ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import {
  ChevronRight,
  Clock,
  FileText,
  Folder,
  Hand,
  Hourglass,
  Image as ImageIcon,
  ImageOff,
  Layers,
  List,
  PencilLine,
  Percent,
  Receipt,
  Shield,
  Store,
  Thermometer,
  Upload,
} from "lucide-react"

import {
  AGE_RESTRICTED_LABEL,
  BACKOFFICE_PRODUCT_STATE_WORDS,
  GST_STATUS_WORDS,
  PRODUCT_ORIGIN_WORDS,
  STORAGE_WORDS,
  unitPrice,
  unitPriceText,
  type BackOfficeProductDTO,
  type BackOfficeVariantDTO,
  type PackUnit,
} from "@effy/shared-types"
import { Button } from "@effy/design-system/ui"
import { ActivityButton, ActivityLogDrawer, useActivityLog } from "@effy/web-kit/activity-log"
import { ErrorState, useHeaderBack } from "@effy/web-kit/console"
import {
  Banner,
  BannerQuote,
  Callout,
  InspectorRows,
  InspectorSection,
  RecordFacts,
  RecordHeader,
  RecordNav,
  RecordPage,
  RecordSection,
  StatusWord,
} from "@effy/web-kit/patterns"
import {
  DetailGroups,
  ListingQuality,
  PictureGallery,
  ProductPageSkeleton,
  quantityOf,
  ShopperPreview,
  SizesFocus,
  SizesSheet,
  SizesViewToggle,
  storedSizesView,
  storeSizesView,
  type QualityItem,
  type SizesView,
  type SizeView,
} from "@effy/web-kit/product-page"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { marginLabel } from "@/features/product-review/model"
import { Placements } from "@/features/product-review/Placements"
import { pathText } from "@/features/taxonomy/model"
import { api } from "@/lib/api"
import { moment } from "@/lib/format"

import { canManageProducts } from "./access"
import { productKeys, productQuery } from "./queries"
import { STATE_TONE } from "./words"

const BACK = { label: "Products", link: { to: "/products" } } as const

const SECTIONS = [
  { id: "sizes", icon: Layers, title: "Sizes and stock" },
  { id: "pictures", icon: ImageIcon, title: "Pictures" },
  { id: "about", icon: FileText, title: "Description" },
  { id: "details", icon: List, title: "Details" },
  { id: "aisles", icon: Folder, title: "Aisles" },
] as const

/** The product page's amounts, as the shop console writes them. */
const aud = (amount: string) => `AUD ${Number(amount).toFixed(2)}`

/** Rows of the review's detail list that the page shows elsewhere (head, Description, the inspector). */
const SHOWN_ELSEWHERE = new Set([
  "Name",
  "Short description",
  "Long description",
  "Brand",
  "Category",
  "Options",
  "Unit pricing",
  "Storage",
  "GST",
  "18+",
])

export function ProductScreen({
  productId,
  actions,
  sizeAction,
}: {
  productId: string
  /** The header's actions (hold, release, finish), given the product. */
  actions?: (p: BackOfficeProductDTO) => ReactNode
  /** One size's own action (on or off sale, its count), given the product and the size. */
  sizeAction?: (p: BackOfficeProductDTO, v: BackOfficeVariantDTO) => ReactNode
}) {
  const product = useQuery(productQuery(productId))
  useHeaderBack(BACK)

  if (product.isError) return <ErrorState error={product.error} onRetry={() => void product.refetch()} />
  if (product.isPending) {
    return (
      <ProductPageSkeleton
        back={BACK}
        facts={["Customers pay", "Shop price", "Margin", "In stock", "Listing"]}
        sections={SECTIONS}
        rail={["How shoppers see it", "Listing quality", "Shop and facts"]}
      />
    )
  }
  return <Product p={product.data} actions={actions} sizeAction={sizeAction} />
}

/** Staff's view of a product's sizes: the same shape the shop's page draws, with the customer price under the margin. */
function sizesOf(p: BackOfficeProductDTO): SizeView[] {
  const basis = p.effyContent?.unitBasis ?? null
  return p.variants.map((v) => {
    const quantity = quantityOf(v.packQuantity, v.packUnit)
    const onHand = v.stockOnHand
    return {
      id: v.id,
      label: v.label ?? (quantity ? `${quantity.amount} ${quantity.unit}` : "One size"),
      code: v.code,
      sku: v.sku,
      gtin: v.gtin,
      quantity,
      weightGrams: v.weightGrams,
      weightAssumed: false,
      shopPrice: v.shopPriceAmount,
      customerPrice: v.customerPriceAmount,
      pendingShopPrice: null,
      unitPrice: unitPrice(v.customerPriceAmount, v.packQuantity, v.packUnit as PackUnit | null, basis),
      onSale: v.state === "active",
      stock: {
        tracked: v.stockTracked,
        onHand,
        alertAt: v.lowStockThreshold,
        out: v.stockTracked && onHand === 0,
        low:
          v.stockTracked &&
          v.lowStockThreshold !== null &&
          onHand !== null &&
          onHand > 0 &&
          onHand <= v.lowStockThreshold,
      },
    }
  })
}

function range(sizes: readonly SizeView[], amount: (s: SizeView) => string | null): string {
  const pool = sizes.some((s) => s.onSale) ? sizes.filter((s) => s.onSale) : sizes
  const amounts = pool
    .map(amount)
    .filter((a): a is string => a !== null)
    .map(Number)
  if (amounts.length === 0) return "—"
  const lo = Math.min(...amounts).toFixed(2)
  const hi = Math.max(...amounts).toFixed(2)
  return lo === hi ? aud(lo) : `${aud(lo)} – ${aud(hi)}`
}

function Product({
  p,
  actions,
  sizeAction,
}: {
  p: BackOfficeProductDTO
  actions?: (p: BackOfficeProductDTO) => ReactNode
  sizeAction?: (p: BackOfficeProductDTO, v: BackOfficeVariantDTO) => ReactNode
}) {
  const canManage = canManageProducts(useSessionRoles())
  const activity = useActivityLog()
  const navigate = useNavigate()
  const [view, setView] = useState<SizesView>(storedSizesView)
  const sizes = sizesOf(p)
  const [selected, setSelected] = useState(() => sizes.find((s) => s.onSale)?.id ?? sizes[0]?.id ?? "")
  const onSale = sizes.filter((s) => s.onSale)
  const pictures = [...p.images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))
  const main = pictures[0]
  const row = (label: string) => p.details.find((d) => d.label === label)?.value ?? null
  const others = p.details.filter((d) => !SHOWN_ELSEWHERE.has(d.label))
  const missing = new Set(p.missingRequired)
  const counted = sizes.filter((s) => s.stock.tracked)
  const units = counted.reduce((n, s) => n + Math.max(0, s.stock.onHand ?? 0), 0)
  const low = sizes.filter((s) => s.stock.low).length
  const out = sizes.filter((s) => s.stock.out).length
  const visible = p.state === "on_sale"
  const quality: QualityItem[] = [
    { key: "picture", label: "A main picture", ok: !!main, required: true, note: "None", section: "pictures" },
    {
      key: "pictures",
      label: "Three or more pictures",
      ok: pictures.length >= 3,
      note: `${pictures.length} of 3`,
      section: "pictures",
    },
    {
      key: "details",
      label: "Required details",
      ok: missing.size === 0,
      required: true,
      note: `${missing.size} missing`,
      section: "details",
    },
    { key: "long", label: "A long description", ok: !!row("Long description"), note: "Empty", section: "about" },
    {
      key: "barcode",
      label: "A barcode on every size",
      ok: sizes.every((s) => s.gtin),
      note: `${sizes.filter((s) => s.gtin).length} of ${sizes.length}`,
      section: "sizes",
    },
    {
      key: "stock",
      label: "Every size on sale in stock",
      ok: !onSale.some((s) => s.stock.out),
      attention: true,
      note: `${out} out`,
      section: "sizes",
    },
  ]
  const done = quality.filter((q) => q.ok).length
  const toFix = quality.filter((q) => !q.ok && q.required).length
  const variant = (id: string) => p.variants.find((v) => v.id === id)!
  const sizeControl = canManage && sizeAction ? (s: SizeView) => sizeAction(p, variant(s.id)) : undefined
  const long = row("Long description")

  return (
    <RecordPage
      railTitle="About this product"
      rail={
        <>
          <InspectorSection title="How shoppers see it">
            <ShopperPreview
              imageUrl={main?.url ?? null}
              brand={row("Brand")}
              name={p.name}
              shortDescription={row("Short description")}
              aisle={p.categoryPath.slice(-2).join(" › ")}
              facts={[
                { label: "Storage", value: STORAGE_WORDS[p.facts.storage] },
                ...(p.facts.ageRestricted ? [{ label: "Age", value: AGE_RESTRICTED_LABEL }] : []),
              ]}
              sizes={onSale.map((s) => ({
                id: s.id,
                label: s.label,
                price: s.customerPrice ? aud(s.customerPrice) : null,
                unitPrice: s.unitPrice ? unitPriceText(s.unitPrice) : null,
                soldOut: s.stock.out,
              }))}
              badges={
                <>
                  <StatusWord tone={STATE_TONE[p.state]}>{BACKOFFICE_PRODUCT_STATE_WORDS[p.state]}</StatusWord>
                  {p.waitingForReview === "change" ? <StatusWord tone="waiting">Change waiting</StatusWord> : null}
                </>
              }
              note={
                p.hold
                  ? "Held, so customers can't see it now. This is how it looks when it is released."
                  : !visible
                    ? "Customers can't see it now. This is how it looks when it is on sale."
                    : "At the customers' price, after Effy's margin. Shoppers never see which shop supplies it."
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

          <InspectorSection title="Shop and facts">
            <InspectorRows
              rows={[
                {
                  key: "shop",
                  icon: Store,
                  label: "Shop",
                  value: (
                    <Link to="/shops/$shopId" params={{ shopId: p.shop.id }} className="link">
                      {p.shop.name}
                    </Link>
                  ),
                },
                {
                  key: "from",
                  icon: Upload,
                  label: "Came from",
                  value: p.import ? (
                    <Link to="/products/imports/$importId" params={{ importId: p.import.id }} className="link">
                      {p.import.fileName}
                    </Link>
                  ) : (
                    PRODUCT_ORIGIN_WORDS[p.origin]
                  ),
                },
                { key: "margin", icon: Percent, label: "Margin", value: marginLabel(p.margin) },
                {
                  key: "aisle",
                  icon: Folder,
                  label: "Home aisle",
                  value: p.categoryPath[p.categoryPath.length - 1] ?? "—",
                },
                { key: "storage", icon: Thermometer, label: "Storage", value: STORAGE_WORDS[p.facts.storage] },
                { key: "gst", icon: Receipt, label: "GST", value: GST_STATUS_WORDS[p.facts.gstStatus] },
                { key: "age", icon: Shield, label: "Age", value: p.facts.ageRestricted ? "18+ only" : "Anyone" },
                { key: "created", icon: Clock, label: "Created", value: moment(p.createdAt) },
              ]}
            />
          </InspectorSection>

          <InspectorSection title="Activity">
            <p className="mb-3 text-[13px] text-muted-foreground">
              Effy's decisions on it: review, margin, holds and its sizes on and off sale.
            </p>
            <Button variant="outline" onClick={() => activity.show()}>
              Open activity
            </Button>
          </InspectorSection>
        </>
      }
    >
      <RecordHeader
        back={BACK}
        media={
          main ? <img src={main.url} alt={main.altText ?? ""} /> : <ImageOff aria-hidden="true" className="size-6" />
        }
        eyebrow={p.categoryPath.map((c, i) => (
          <span key={`${i}-${c}`} className="inline-flex items-center gap-1">
            {i > 0 ? <ChevronRight aria-hidden="true" /> : null}
            {c}
          </span>
        ))}
        title={
          <>
            {p.name}
            <StatusWord tone={STATE_TONE[p.state]}>{BACKOFFICE_PRODUCT_STATE_WORDS[p.state]}</StatusWord>
            {p.origin !== "shop" ? <StatusWord tone="info">{PRODUCT_ORIGIN_WORDS[p.origin]}</StatusWord> : null}
            {p.facts.ageRestricted ? <StatusWord tone="muted">{AGE_RESTRICTED_LABEL}</StatusWord> : null}
          </>
        }
        meta={
          <>
            <span>
              <Store aria-hidden="true" />
              <Link to="/shops/$shopId" params={{ shopId: p.shop.id }} className="link">
                {p.shop.name}
              </Link>
              {p.shop.status !== "active" ? ` (${p.shop.status})` : null}
            </span>
            {row("Brand") ? <span>{row("Brand")}</span> : null}
            <span>{sizes.length === 1 ? "One size" : `${sizes.length} sizes`}</span>
            <span>Changed {moment(p.updatedAt)}</span>
          </>
        }
        actions={
          <>
            {actions?.(p)}
            <ActivityButton />
          </>
        }
      />

      <RecordFacts
        facts={[
          {
            key: "customer",
            label: "Customers pay",
            value: range(sizes, (s) => s.customerPrice),
            note: `${onSale.length} of ${sizes.length} ${sizes.length === 1 ? "size" : "sizes"} on sale`,
          },
          {
            key: "shop",
            label: "Shop price",
            value: range(sizes, (s) => s.shopPrice),
            note: "What Effy pays the shop",
          },
          {
            key: "margin",
            label: "Margin",
            value: marginLabel(p.margin),
            note: p.margin ? "Set in review" : "Set when it is approved",
          },
          {
            key: "stock",
            label: "In stock",
            value: counted.length > 0 ? `${units} ${units === 1 ? "unit" : "units"}` : "Not counted",
            note:
              [low ? `${low} low` : "", out ? `${out} out` : ""].filter(Boolean).join(" · ") ||
              (counted.length > 0 ? "Nothing running low" : "The shop does not count it"),
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

      {p.hold || p.effySettingUp || p.waitingForReview || !canManage ? (
        <div className="mt-8 grid gap-4">
          {p.hold ? (
            <Banner tone="problem" icon={Hand} role="region" label="Held by Effy" title="Held by Effy">
              <p>
                {moment(p.hold.heldAt)}
                {p.hold.heldBy ? ` · ${p.hold.heldBy}` : ""}. Customers cannot find or buy it, and the shop cannot put
                it back on sale.
              </p>
              <BannerQuote>{p.hold.reason}</BannerQuote>
            </Banner>
          ) : null}
          {p.effySettingUp ? (
            <Banner icon={PencilLine} title="Effy is setting this up">
              <p>
                It goes on sale by itself once it is complete
                {missing.size > 0 || !main
                  ? ` — still missing: ${[...(main ? [] : ["a main picture"]), ...p.missingRequired].join(", ")}.`
                  : "."}
              </p>
            </Banner>
          ) : null}
          {p.waitingForReview ? (
            <Banner
              icon={Hourglass}
              title={p.waitingForReview === "new_product" ? "Waiting for review" : "A change is waiting for review"}
              actions={[
                {
                  label: "Open in product review",
                  primary: true,
                  onClick: () =>
                    void navigate({ to: "/product-review/$productId", params: { productId: p.productId } }),
                },
              ]}
            >
              <p>Customers see the product as it is until a reviewer decides.</p>
            </Banner>
          ) : null}
          {!canManage ? (
            <Callout tone="muted" title="You can see this product">
              Changing it needs a manager or an administrator.
            </Callout>
          ) : null}
        </div>
      ) : null}

      <RecordNav
        items={[
          { id: "sizes", label: "Sizes and stock", count: sizes.length },
          { id: "pictures", label: "Pictures", count: pictures.length },
          { id: "about", label: "Description" },
          {
            id: "details",
            label: "Details",
            count: missing.size > 0 ? `${missing.size} missing` : undefined,
            problem: missing.size > 0,
          },
          { id: "aisles", label: "Aisles", count: 1 + p.placements.length },
        ]}
        compact={
          <>
            {main ? <img src={main.url} alt="" className="size-7 rounded-sm border object-cover" /> : null}
            <b className="max-w-60 truncate text-sm font-semibold">{p.name}</b>
            <span className="h-5 w-px bg-border" aria-hidden="true" />
            <span className="text-sm text-muted-foreground tabular-nums">{range(sizes, (s) => s.customerPrice)}</span>
          </>
        }
      />

      <RecordSection
        id="sizes"
        icon={Layers}
        title="Sizes and stock"
        description="What the shop is paid and what customers pay, per size. Turning a size off sale is immediate and the shop is told."
        actions={
          <SizesViewToggle
            value={view}
            onChange={(v) => {
              setView(v)
              storeSizesView(v)
            }}
          />
        }
      >
        {view === "focus" ? (
          <SizesFocus
            sizes={sizes}
            selectedId={selected}
            onSelect={setSelected}
            money={aud}
            priceLabel="Shop price"
            codeLabel="Shop code"
            marginLabel={p.margin ? `Effy's margin · ${marginLabel(p.margin)}` : undefined}
            unsetCustomerPrice="Set in review"
            onSaleControl={sizeControl}
            stockActions={() => (
              <Button variant="outline" size="sm" onClick={() => activity.show()}>
                Activity
              </Button>
            )}
          />
        ) : (
          <SizesSheet
            sizes={sizes}
            money={aud}
            priceLabel="Shop price"
            codeLabel="Shop code"
            onSaleControl={sizeControl}
          />
        )}
      </RecordSection>

      <RecordSection
        id="pictures"
        icon={ImageIcon}
        title="Pictures"
        description="As the shop added them. The first is the main picture shoppers see in the aisle."
      >
        <PictureGallery pictures={pictures.map((img) => ({ id: img.url, url: img.url, altText: img.altText }))} />
      </RecordSection>

      <RecordSection
        id="about"
        icon={FileText}
        title="Description"
        description="The shop's own words, as shoppers read them."
      >
        <div className="grid gap-7">
          <p className="max-w-[68ch] text-base leading-relaxed">{row("Short description") ?? "—"}</p>
          {long ? (
            <p className="max-w-[72ch] leading-7 whitespace-pre-line text-muted-foreground">{long}</p>
          ) : (
            <p className="text-sm text-muted-foreground">No long description.</p>
          )}
        </div>
      </RecordSection>

      <RecordSection
        id="details"
        icon={List}
        title="Details"
        description={`What ${pathText(p.categoryPath)} asks for, as the shop filled it in.`}
      >
        {others.length > 0 ? (
          <DetailGroups
            groups={[
              {
                title: "Category details",
                rows: others.map((d) => ({
                  key: d.label,
                  label: d.label,
                  value: d.value ? <span className="whitespace-pre-line">{d.value}</span> : null,
                  required: missing.has(d.label),
                  missing: missing.has(d.label) && !d.value,
                })),
              },
            ]}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Its category asks for nothing more.</p>
        )}
      </RecordSection>

      <RecordSection
        id="aisles"
        icon={Folder}
        title="Aisles"
        description="Its home aisle decides its details. Effy can also show it in up to five more."
      >
        <p className="mb-4 text-sm">
          <span className="text-muted-foreground">Home aisle · </span>
          {pathText(p.categoryPath)}
        </p>
        <Placements
          productId={p.productId}
          homePath={p.categoryPath}
          placements={p.placements}
          canDecide={canManage}
          framed={false}
        />
      </RecordSection>

      <ActivityLogDrawer
        app="back-office"
        log="bo-product"
        title="Product activity"
        description={`${p.name} — Effy's decisions on it: review, margin, holds and its sizes on and off sale.`}
        api={api}
        path={`/catalog/v1/products/${p.productId}/activity`}
        queryKey={productKeys.detail(p.productId)}
        fileName={`product-${p.name}-activity`}
      />
    </RecordPage>
  )
}
