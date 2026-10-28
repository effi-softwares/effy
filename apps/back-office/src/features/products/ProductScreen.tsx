import type { ReactNode } from "react"

import { useQuery } from "@tanstack/react-query"
import { Link } from "@tanstack/react-router"
import { Store } from "lucide-react"

import {
  AGE_RESTRICTED_LABEL,
  BACKOFFICE_PRODUCT_STATE_WORDS,
  GST_STATUS_WORDS,
  PRODUCT_ORIGIN_WORDS,
  STORAGE_WORDS,
  type BackOfficeProductDTO,
  type BackOfficeVariantDTO,
} from "@effy/shared-types"
import {
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsCount,
  TabsList,
  TabsTrigger,
} from "@effy/design-system/ui"
import { ErrorState, useHeaderBack } from "@effy/web-kit/console"
import { Callout, DetailRows, PageHeader, Panel, StatusWord } from "@effy/web-kit/patterns"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { marginLabel } from "@/features/product-review/model"
import { Placements } from "@/features/product-review/Placements"
import { pathText } from "@/features/taxonomy/model"
import { money, moment } from "@/lib/format"

import { canManageProducts } from "./access"
import { HistoryList } from "./HistoryList"
import { productQuery } from "./queries"
import { STATE_TONE } from "./words"

const BACK = { label: "Products", link: { to: "/products" } } as const

export function ProductScreen({
  productId,
  actions,
  sizeAction,
}: {
  productId: string
  /** The header's actions (hold, release, margin), given the product. */
  actions?: (p: BackOfficeProductDTO) => ReactNode
  /** One size's own action (on or off sale), given the product and the size. */
  sizeAction?: (p: BackOfficeProductDTO, v: BackOfficeVariantDTO) => ReactNode
}) {
  const product = useQuery(productQuery(productId))
  useHeaderBack(BACK)

  if (product.isError) return <ErrorState error={product.error} onRetry={() => void product.refetch()} />
  if (product.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-60" />
      </div>
    )
  }
  return <Product p={product.data} actions={actions} sizeAction={sizeAction} />
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
  const onSale = p.variants.filter((v) => v.state === "active").length

  return (
    <>
      <PageHeader
        back={BACK}
        title={
          <>
            {p.name}
            <StatusWord tone={STATE_TONE[p.state]}>{BACKOFFICE_PRODUCT_STATE_WORDS[p.state]}</StatusWord>
            {p.origin !== "shop" ? <StatusWord tone="info">{PRODUCT_ORIGIN_WORDS[p.origin]}</StatusWord> : null}
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
            <span>{pathText(p.categoryPath)}</span>
            <span>Changed {moment(p.updatedAt)}</span>
          </>
        }
        actions={actions?.(p)}
      />

      {p.hold ? (
        <Callout tone="destructive" title="Held by Effy" role="status">
          <p className="whitespace-pre-line">{p.hold.reason}</p>
          <p className="mt-0.5 block text-sm text-muted-foreground mt-1">
            {moment(p.hold.heldAt)}
            {p.hold.heldBy ? ` · ${p.hold.heldBy}` : ""}. Customers cannot find or buy it, and the shop cannot put it
            back on sale.
          </p>
        </Callout>
      ) : null}
      {p.effySettingUp ? (
        <Callout tone="info" title="Effy is setting this up">
          It goes on sale by itself once it is complete
          {p.missingRequired.length > 0 || !p.images.some((i) => i.isPrimary)
            ? ` — still missing: ${[...(p.images.some((i) => i.isPrimary) ? [] : ["a main picture"]), ...p.missingRequired].join(", ")}.`
            : "."}
        </Callout>
      ) : null}
      {p.waitingForReview ? (
        <Callout
          tone="info"
          title={p.waitingForReview === "new_product" ? "Waiting for review" : "A change is waiting for review"}
        >
          <Link to="/product-review/$productId" params={{ productId: p.productId }} className="link">
            Open it in product review
          </Link>
        </Callout>
      ) : null}

      <Tabs defaultValue="overview">
        <div className="ef-tabsbar">
          <div className="ef-tabsbar__list">
            <TabsList aria-label="Product sections">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="sizes">
                Sizes & stock
                <TabsCount>{p.variants.length}</TabsCount>
              </TabsTrigger>
              <TabsTrigger value="details">
                Details
                {p.missingRequired.length > 0 ? <TabsCount>{p.missingRequired.length} missing</TabsCount> : null}
              </TabsTrigger>
              <TabsTrigger value="aisles">Aisles</TabsTrigger>
              <TabsTrigger value="history">
                History
                <TabsCount>{p.history.length}</TabsCount>
              </TabsTrigger>
            </TabsList>
          </div>
        </div>

        <TabsContent value="overview" className="ef-tabpanel space-y-4">
          <Panel title="Pictures">
            {p.images.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pictures yet.</p>
            ) : (
              <ul className="flex flex-wrap gap-3">
                {p.images.map((img) => (
                  <li key={img.url} className="space-y-1">
                    <img src={img.url} alt={img.altText ?? ""} className="size-28 rounded-md border object-cover" />
                    <p className="text-xs text-muted-foreground">{img.isPrimary ? "Main picture" : " "}</p>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel title="At a glance">
            <DetailRows
              rows={[
                { label: "Shop", value: p.shop.name },
                { label: "Home aisle", value: pathText(p.categoryPath) },
                { label: "State", value: BACKOFFICE_PRODUCT_STATE_WORDS[p.state] },
                { label: "Sizes", value: `${p.variants.length} (${onSale} on sale)` },
                { label: "Margin", value: marginLabel(p.margin) },
                { label: "Storage", value: STORAGE_WORDS[p.facts.storage] },
                { label: "GST", value: GST_STATUS_WORDS[p.facts.gstStatus] },
                { label: "18+", value: p.facts.ageRestricted ? AGE_RESTRICTED_LABEL : "No" },
                {
                  label: "Came from",
                  value: p.import ? (
                    <Link to="/products/imports/$importId" params={{ importId: p.import.id }} className="link">
                      Imported from {p.import.fileName}
                    </Link>
                  ) : (
                    PRODUCT_ORIGIN_WORDS[p.origin]
                  ),
                },
                { label: "Created", value: moment(p.createdAt) },
              ]}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="sizes" className="ef-tabpanel">
          <Panel title="Sizes, prices and stock" flush>
            <div className="min-w-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Size</TableHead>
                    <TableHead>Effy code</TableHead>
                    <TableHead>Shop code</TableHead>
                    <TableHead>Barcode</TableHead>
                    <TableHead className="text-right">Shop price</TableHead>
                    <TableHead className="text-right">Customers pay</TableHead>
                    <TableHead className="text-right">Weight</TableHead>
                    <TableHead className="text-right">Stock</TableHead>
                    <TableHead>On sale</TableHead>
                    {sizeAction ? (
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    ) : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.variants.map((v) => (
                    <TableRow key={v.id}>
                      <TableHead scope="row" className="text-left font-medium">
                        {v.label ?? "One size"}
                      </TableHead>
                      <TableCell className="font-mono text-xs">{v.code ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{v.sku ?? "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{v.gtin ?? "—"}</TableCell>
                      <TableCell className="text-right tabular-nums">{money(v.shopPriceAmount)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {money(v.customerPriceAmount)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{v.weightGrams} g</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {v.stockTracked ? (
                          <>
                            {v.stockOnHand ?? 0}
                            {v.lowStockThreshold !== null ? (
                              <span className="mt-0.5 block text-sm text-muted-foreground block">
                                reorder at {v.lowStockThreshold}
                              </span>
                            ) : null}
                          </>
                        ) : (
                          <span className="text-muted-foreground">Not tracked</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {v.state === "active" ? (
                          <StatusWord tone="done">On sale</StatusWord>
                        ) : (
                          <StatusWord tone="muted">Off sale</StatusWord>
                        )}
                      </TableCell>
                      {sizeAction ? (
                        <TableCell className="text-right">{canManage ? sizeAction(p, v) : null}</TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Panel>
        </TabsContent>

        <TabsContent value="details" className="ef-tabpanel">
          <Panel title="Details">
            {p.missingRequired.length > 0 ? (
              <p className="mb-3 text-sm">Required and empty: {p.missingRequired.join(", ")}.</p>
            ) : null}
            <DetailRows
              rows={p.details.map((row) => ({
                key: row.label,
                label: row.label,
                value: <span className="whitespace-pre-line wrap-break-word">{row.value ?? "—"}</span>,
              }))}
            />
          </Panel>
        </TabsContent>

        <TabsContent value="aisles" className="ef-tabpanel">
          <Placements
            productId={p.productId}
            homePath={p.categoryPath}
            placements={p.placements}
            canDecide={canManage}
          />
        </TabsContent>

        <TabsContent value="history" className="ef-tabpanel">
          <HistoryList entries={p.history} />
        </TabsContent>
      </Tabs>

      {!canManage ? (
        <p className="text-sm text-muted-foreground">
          You can see this product. Changing it needs a manager or an administrator.
        </p>
      ) : null}
    </>
  )
}
