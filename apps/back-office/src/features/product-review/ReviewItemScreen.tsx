import { useState } from "react"

import { keepPreviousData, useQuery } from "@tanstack/react-query"
import { Link, useNavigate } from "@tanstack/react-router"
import { useHotkey } from "@tanstack/react-hotkeys"
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  Diff,
  ExternalLink,
  FileText,
  Folder,
  Image as ImageIcon,
  ImageOff,
  Layers,
  List,
  Pencil,
  Store,
  TriangleAlert,
} from "lucide-react"

import {
  AGE_RESTRICTED_LABEL,
  GST_STATUS_WORDS,
  STORAGE_WORDS,
  type FactKey,
  type ReviewImageDTO,
  type ReviewItemDetailDTO,
} from "@effy/shared-types"
import { Badge, Button, Kbd, toast, useSidebar } from "@effy/design-system/ui"
import { ActionBarButton, useActionBar, useActionBarDensity } from "@effy/web-kit/action-bar"
import { ActivityButton, ActivityLogDrawer } from "@effy/web-kit/activity-log"
import { ErrorState, useHeaderBack, useHeaderDetail } from "@effy/web-kit/console"
import {
  BannerStack,
  type BannerStackItem,
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
  ShopperPreview,
} from "@effy/web-kit/product-page"

import { useSessionRoles } from "@/features/auth/useSessionRoles"
import { productKeys } from "@/features/products/queries"
import { api } from "@/lib/api"
import { moment } from "@/lib/format"
import { track } from "@/lib/telemetry"

import { canDecideReview } from "./access"
import { reviewActionError } from "./errorText"
import { MarginField } from "./MarginField"
import {
  attentionLines,
  bigPriceRises,
  KIND_LABEL,
  marginLabel,
  previewCustomerPrice,
  reviewChecks,
  sectionOfChange,
  signedPercent,
  toMargin,
  waitingLabel,
  type MarginEntry,
} from "./model"
import { Placements } from "./Placements"
import { reviewItemQuery, reviewQueueQuery, useApprove, useSendBack } from "./queries"
import { DiffLayoutToggle, ReviewChanges, useDiffLayout } from "./ReviewChanges"
import { ReviewVariants } from "./ReviewVariants"
import { SendBackDialog } from "./SendBackDialog"

const BACK = { label: "Product review", link: { to: "/product-review" } } as const

const SECTIONS = [
  { id: "pictures", icon: ImageIcon, title: "Pictures" },
  { id: "sizes", icon: Layers, title: "Sizes and prices" },
  { id: "about", icon: FileText, title: "Description" },
  { id: "details", icon: List, title: "Details" },
] as const

/** The review's amounts, as the product pages write them. */
const aud = (amount: string) => `AUD ${Number(amount).toFixed(2)}`

/** Rows of the detail list the page shows in its own sections (head, Description, facts). */
const ABOUT = ["Name", "Brand", "Short description", "Long description"] as const
const SHOWN_ELSEWHERE = new Set<string>([...ABOUT, "Category", "Options", "Unit pricing", "Storage", "GST", "18+"])
/** Which change marks which row of Description. */
const ABOUT_FIELD: Record<(typeof ABOUT)[number], string> = {
  Name: "name",
  Brand: "brand",
  "Short description": "shortDescription",
  "Long description": "longDescription",
}

export function ReviewItemScreen({ productId }: { productId: string }) {
  // The submission on screen stays while the next one reads: moving through the queue never flashes a skeleton.
  const item = useQuery({ ...reviewItemQuery(productId), placeholderData: keepPreviousData })
  useHeaderBack(item.isSuccess ? null : BACK)

  if (item.isError) return <ErrorState error={item.error} onRetry={() => void item.refetch()} />
  if (item.isPending) {
    return (
      <ProductPageSkeleton
        back={BACK}
        fixedRail
        facts={["Shop price", "Customers pay", "Margin", "What changes", "Checks"]}
        sections={SECTIONS}
        rail={["Margin", "Checks", "How shoppers will see it"]}
      />
    )
  }
  return (
    <ReviewItem
      key={`${item.data.productId}:${item.data.version}`}
      item={item.data}
      onChanged={() => void item.refetch()}
    />
  )
}

function ReviewItem({ item, onChanged }: { item: ReviewItemDetailDTO; onChanged: () => void }) {
  const navigate = useNavigate()
  useHeaderDetail(item.productName)
  const canDecide = canDecideReview(useSessionRoles())
  const approve = useApprove(item.productId)
  const sendBack = useSendBack(item.productId)
  const queue = useQuery(reviewQueueQuery({}))
  const [layout, setLayout] = useDiffLayout()

  const [entry, setEntry] = useState<MarginEntry>(item.currentMargin ?? { kind: "percent", value: "" })
  const [sendingBack, setSendingBack] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const margin = toMargin(entry)
  const busy = approve.isPending || sendBack.isPending
  const isChange = item.kind === "change"
  const incomplete = item.missingRequired.length > 0
  const needsMargin = item.marginRequired && !margin
  const canApprove = canDecide && !busy && !incomplete && !needsMargin

  // Where this submission sits in the queue (oldest first), and its neighbours.
  const ids = (queue.data?.items ?? []).map((i) => i.productId)
  const at = ids.indexOf(item.productId)
  const prev = at > 0 ? ids[at - 1] : undefined
  const next = at >= 0 ? ids[at + 1] : undefined
  const total = queue.data?.total ?? ids.length
  const open = (id: string) => void navigate({ to: "/product-review/$productId", params: { productId: id } })

  const live = item.variants.filter((v) => v.change !== "removed")
  const pictures = sortPictures(item.images.proposed ?? item.images.current)
  const main = pictures[0]
  const priced = live.map((v) => ({
    v,
    pays: margin ? previewCustomerPrice(v.shopPriceAmount, entry.kind, entry.value) : v.customerPriceAmount,
  }))
  const checks = reviewChecks(item, !!margin)
  const passing = checks.filter((c) => c.ok).length
  const blocking = checks.filter((c) => !c.ok && c.required).length
  const attention = attentionLines(item)
  const rises = bigPriceRises(item)
  const changedFields = new Set(item.changes.map((c) => c.field))
  const row = (label: string) => item.details.find((d) => d.label === label)?.value ?? null
  const hours = Math.max(0, Math.floor((Date.now() - new Date(item.submittedAt).getTime()) / 3_600_000))

  async function run(decision: "approved" | "sent_back", action: () => Promise<unknown>) {
    setMessage(null)
    // The next one to open: decided ones leave the queue, so it is the neighbour after (else before) this one.
    const after = next ?? prev
    try {
      await action()
      track({
        name: "product_review_decided",
        productId: item.productId,
        kind: item.kind,
        decision,
        marginSet: decision === "approved" && margin !== null,
      })
      setSendingBack(false)
      toast(`${decision === "approved" ? "Approved" : "Sent back"}: ${item.productName}`)
      if (after) open(after)
      else await navigate({ to: "/product-review" })
    } catch (err) {
      setMessage(reviewActionError(err))
      onChanged() // show the reviewer what it is now
    }
  }

  const doApprove = () => {
    if (!canApprove) return
    void run("approved", () => approve.mutateAsync({ version: item.version, ...(margin ? { margin } : {}) }))
  }

  useHotkey("A", doApprove, { ignoreInputs: true })
  useHotkey("B", () => canDecide && !busy && setSendingBack(true), { ignoreInputs: true })
  useHotkey("ArrowLeft", () => prev && open(prev), { ignoreInputs: true })
  useHotkey("ArrowRight", () => next && open(next), { ignoreInputs: true })

  // What the page asks the reviewer to notice, most pressing first: what stops approval, then what is worth a look.
  const notices: BannerStackItem[] = [
    ...(incomplete
      ? [
          {
            key: "incomplete",
            tone: "problem" as const,
            icon: CircleAlert,
            title: "It can't be approved yet",
            children: (
              <p>
                Required details are empty: {item.missingRequired.join(", ")}. Send it back to ask the shop for{" "}
                {item.missingRequired.length === 1 ? "it" : "them"}.
              </p>
            ),
          },
        ]
      : []),
    ...rises.map((r) => ({
      key: `rise:${r.label}`,
      icon: TriangleAlert,
      title: `${r.label} — shop price rises ${signedPercent(r.move)}`,
      children: <p>Ask the shop for the supplier's cost if the change doesn't explain it.</p>,
    })),
    ...attention.notes.map((n) => ({ key: n, icon: TriangleAlert, title: "Worth a look", children: <p>{n}</p> })),
  ]

  return (
    <RecordPage
      fixedRail
      railTitle="Decision"
      rail={
        <>
          <InspectorSection
            title="Margin"
            actions={
              <span className="text-[13px] text-muted-foreground">
                {item.currentMargin ? `Now ${marginLabel(item.currentMargin)}` : "Never set"}
              </span>
            }
          >
            {canDecide ? (
              <div className="grid gap-3">
                <div id="review-margin-field" className="-m-2 rounded-lg p-2">
                  <MarginField
                    id="review-margin"
                    shopPrices={live.map((v) => v.shopPriceAmount)}
                    value={entry}
                    onChange={setEntry}
                    disabled={busy}
                  />
                </div>
                <p className="text-[13px] text-muted-foreground">
                  {incomplete
                    ? "It can't be approved until the shop fills in the required details — send it back from the bar below."
                    : `Approve or send back from the bar below (A / B). Approving publishes ${isChange ? "the change" : "the product"} to customers at once, then opens the next one.`}
                </p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                You can read this. Approving or sending it back needs a manager or an administrator.
              </p>
            )}
          </InspectorSection>

          <InspectorSection
            title="Checks"
            actions={
              <span className="text-[13px] text-muted-foreground tabular-nums">
                {passing} of {checks.length}
              </span>
            }
          >
            <ListingQuality items={checks} />
          </InspectorSection>

          <InspectorSection title="How shoppers will see it">
            <ShopperPreview
              imageUrl={main?.url ?? null}
              brand={row("Brand")}
              name={row("Name") ?? item.productName}
              shortDescription={row("Short description")}
              aisle={item.categoryPath.slice(-2).join(" › ")}
              facts={[
                { label: "Storage", value: STORAGE_WORDS[item.facts.storage] },
                ...(item.facts.ageRestricted ? [{ label: "Age", value: AGE_RESTRICTED_LABEL }] : []),
              ]}
              sizes={priced.map(({ v, pays }) => ({
                id: v.id,
                label: v.label ?? "One size",
                price: pays ? aud(pays) : null,
                unitPrice: null,
                soldOut: false,
              }))}
              note="After approval, at the margin above. Shoppers never see which shop supplies it."
            />
          </InspectorSection>

          <InspectorSection title="The shop">
            <InspectorRows
              rows={[
                {
                  key: "shop",
                  icon: Store,
                  label: "Shop",
                  value: (
                    <Link to="/shops/$shopId" params={{ shopId: item.shop.id }} className="link">
                      {item.shop.name}
                    </Link>
                  ),
                },
                {
                  key: "status",
                  icon: CircleAlert,
                  label: "Status",
                  value: item.shop.status === "active" ? "Active" : item.shop.status,
                },
                { key: "sent", icon: Clock, label: "Sent", value: moment(item.submittedAt) },
              ]}
            />
          </InspectorSection>
          {/* Room for the action bar, which floats over the rail's foot too. */}
          <div aria-hidden="true" className="h-20 flex-none" />
        </>
      }
    >
      <RecordHeader
        back={BACK}
        media={
          main ? <img src={main.url} alt={main.altText ?? ""} /> : <ImageOff aria-hidden="true" className="size-6" />
        }
        eyebrow={item.categoryPath.map((c, i) => (
          <span key={`${i}-${c}`} className="inline-flex items-center gap-1">
            {i > 0 ? <ChevronRight aria-hidden="true" /> : null}
            {c}
          </span>
        ))}
        title={
          <>
            {item.productName}
            <StatusWord tone={isChange ? "quiet" : "info"}>
              {isChange ? "Change to a live product" : KIND_LABEL.new_product}
            </StatusWord>
            <StatusWord tone={hours >= 48 ? "problem" : hours >= 24 ? "waiting" : "muted"} icon={Clock}>
              Waiting {waitingLabel(hours).toLowerCase()}
            </StatusWord>
          </>
        }
        meta={
          <>
            <span>
              <Store aria-hidden="true" />
              <Link to="/shops/$shopId" params={{ shopId: item.shop.id }} className="link">
                {item.shop.name}
              </Link>
              {item.shop.status !== "active" ? ` · this shop is ${item.shop.status}` : ""}
            </span>
            {row("Brand") ? <span>{row("Brand")}</span> : null}
            <span>{live.length === 1 ? "One size" : `${live.length} sizes`}</span>
            <span>Sent {moment(item.submittedAt)}</span>
          </>
        }
        actions={
          <>
            {isChange ? (
              <Button variant="outline" asChild>
                <Link to="/products/$productId" params={{ productId: item.productId }}>
                  <ExternalLink aria-hidden="true" />
                  Live product
                </Link>
              </Button>
            ) : null}
            <ActivityButton />
          </>
        }
      />

      <RecordFacts
        facts={[
          {
            key: "shop",
            label: "Shop price",
            value: range(live.map((v) => v.shopPriceAmount)),
            note: isChange && rises.length > 0 ? "Includes the change" : "What Effy pays the shop",
          },
          {
            key: "pays",
            label: "Customers pay",
            value: needsMargin ? "—" : range(priced.map((p) => p.pays)),
            note: margin ? "At the margin you set" : needsMargin ? "Set a margin to see it" : "As on sale now",
          },
          {
            key: "margin",
            label: "Margin",
            value: margin ? marginLabel(margin) : "Not set",
            note: item.currentMargin ? `Now ${marginLabel(item.currentMargin)}` : "Never set",
          },
          isChange
            ? {
                key: "what",
                label: "What changes",
                value: `${item.changes.length + (item.images.proposed ? 1 : 0)} ${item.changes.length + (item.images.proposed ? 1 : 0) === 1 ? "detail" : "details"}`,
                note: [
                  ...new Set([
                    ...item.changes.map((c) => c.label.replace(/ — .*$/, "")),
                    ...(item.images.proposed ? ["Pictures"] : []),
                  ]),
                ].join(", "),
              }
            : { key: "sizes", label: "Sizes", value: String(live.length), note: "All new" },
          {
            key: "checks",
            label: "Checks",
            value: `${passing} of ${checks.length} pass`,
            note: blocking
              ? `${blocking} ${blocking === 1 ? "blocks" : "block"} approval`
              : passing < checks.length
                ? "Worth a look"
                : "Nothing to look at",
          },
        ]}
      />

      {notices.length > 0 ? (
        <div className="mt-8">
          <BannerStack key={item.productId} items={notices} label="Things to notice" />
        </div>
      ) : null}

      <RecordNav
        items={[
          ...(isChange
            ? [{ id: "changes", label: "What changed", count: item.changes.length + (item.images.proposed ? 1 : 0) }]
            : []),
          { id: "pictures", label: "Pictures", count: pictures.length },
          { id: "sizes", label: "Sizes and prices", count: item.variants.length },
          { id: "about", label: "Description" },
          {
            id: "details",
            label: "Details",
            count: incomplete ? `${item.missingRequired.length} missing` : undefined,
            problem: incomplete,
          },
          { id: "aisles", label: "Aisles", count: 1 + item.placements.length },
        ]}
        compact={
          <>
            {main ? <img src={main.url} alt="" className="size-7 rounded-sm border object-cover" /> : null}
            <b className="max-w-60 truncate text-sm font-semibold">{item.productName}</b>
          </>
        }
      />

      {isChange ? (
        <RecordSection
          id="changes"
          icon={Diff}
          title="What changed"
          description="Only what differs from the live product. Customers keep seeing what is live until you approve."
          actions={<DiffLayoutToggle value={layout} onChange={setLayout} />}
        >
          <ReviewChanges changes={item.changes} picturesChanged={item.images.proposed !== null} layout={layout} />
        </RecordSection>
      ) : null}

      <RecordSection
        id="pictures"
        icon={ImageIcon}
        title="Pictures"
        description={
          item.images.proposed
            ? "The pictures now, and the set the shop proposes. The first is the main picture in the aisle."
            : "As the shop added them. The first is the main picture in the aisle — it must be the product itself."
        }
      >
        {item.images.proposed ? (
          <div className="grid gap-0">
            <PictureRow title="Now" note="What customers see" images={sortPictures(item.images.current)} />
            <PictureRow title="Proposed" note="After approval" images={sortPictures(item.images.proposed)} />
          </div>
        ) : (
          <PictureGallery pictures={pictures.map((p) => ({ id: p.url, url: p.url, altText: p.altText }))} />
        )}
      </RecordSection>

      <RecordSection
        id="sizes"
        icon={Layers}
        title="Sizes and prices"
        description="What the shop is paid, and what customers will pay at the margin you set — it updates as you type it."
      >
        <ReviewVariants variants={item.variants} entry={entry} changes={item.changes} />
      </RecordSection>

      <RecordSection
        id="about"
        icon={FileText}
        title="Description"
        description={
          isChange
            ? "As it will read after approval. A changed detail is marked; its old words are in What changed."
            : "What the shop wrote, as customers will read it."
        }
      >
        <DetailGroups
          groups={[
            {
              title: "What customers read",
              rows: ABOUT.map((label) => ({
                key: label,
                label,
                value: row(label) ? <span className="whitespace-pre-line">{row(label)}</span> : null,
                changed: changedFields.has(ABOUT_FIELD[label]),
                wide: label.endsWith("description"),
              })),
            },
          ]}
        />
      </RecordSection>

      <RecordSection
        id="details"
        icon={List}
        title="Details"
        description={`What ${item.categoryPath[item.categoryPath.length - 1] ?? "its category"} asks for, and the facts Effy acts on.`}
      >
        <DetailGroups
          groups={[
            ...(item.details.some((d) => !SHOWN_ELSEWHERE.has(d.label)) || incomplete
              ? [
                  {
                    title: "Category details",
                    rows: [
                      ...item.details
                        .filter((d) => !SHOWN_ELSEWHERE.has(d.label))
                        .map((d) => ({
                          key: d.label,
                          label: d.label,
                          value: d.value ? <span className="whitespace-pre-line">{d.value}</span> : null,
                          required: item.missingRequired.includes(d.label),
                          missing: item.missingRequired.includes(d.label) && !d.value,
                          changed: item.changes.some(
                            (c) => sectionOfChange(c.field) === "details" && c.label === d.label,
                          ),
                        })),
                      // A required detail with no row at all is still said where it would be.
                      ...item.missingRequired
                        .filter((m) => !item.details.some((d) => d.label === m))
                        .map((m) => ({ key: m, label: m, value: null, required: true, missing: true })),
                    ],
                  },
                ]
              : []),
            {
              title: "Facts",
              rows: (["storage", "gstStatus", "ageRestricted"] as FactKey[]).map((k) => ({
                key: k,
                label: { storage: "Storage", gstStatus: "GST", ageRestricted: "18+" }[k],
                value:
                  k === "storage"
                    ? STORAGE_WORDS[item.facts.storage]
                    : k === "gstStatus"
                      ? GST_STATUS_WORDS[item.facts.gstStatus]
                      : item.facts.ageRestricted
                        ? "Yes"
                        : "No",
                changed: changedFields.has(k),
                badge: item.factOverrides.includes(k) ? (
                  <Badge variant="warning" className="h-[18px] px-1.5 text-[11px]">
                    Not the category default
                  </Badge>
                ) : undefined,
              })),
            },
          ]}
        />
      </RecordSection>

      <RecordSection
        id="aisles"
        icon={Folder}
        title="Aisles"
        description="Its home aisle decides its details. Effy can also show it in up to five more."
      >
        <p className="mb-4 text-sm">
          <span className="text-muted-foreground">Home aisle · </span>
          {item.categoryPath.join(" › ")}
          {changedFields.has("primaryCategoryId") ? (
            <Badge variant="default" className="ml-2">
              Changed
            </Badge>
          ) : null}
        </p>
        <Placements
          productId={item.productId}
          homePath={item.categoryPath}
          placements={item.placements}
          canDecide={canDecide}
          framed={false}
        />
      </RecordSection>

      <DecisionBar
        position={at >= 0 ? at + 1 : null}
        total={total}
        prev={prev}
        next={next}
        onOpen={open}
        canDecide={canDecide}
        isChange={isChange}
        busy={busy}
        missing={item.missingRequired}
        needsMargin={needsMargin}
        marginText={margin ? marginLabel(margin) : null}
        pays={range(priced.map((p) => p.pays))}
        message={sendingBack ? null : message}
        onApprove={doApprove}
        onSendBack={() => setSendingBack(true)}
      />

      <SendBackDialog
        open={sendingBack}
        onOpenChange={setSendingBack}
        shopName={item.shop.name}
        isChange={isChange}
        busy={busy}
        error={message}
        onSend={(reason) => void run("sent_back", () => sendBack.mutateAsync({ version: item.version, reason }))}
      />

      <ActivityLogDrawer
        app="back-office"
        log="bo-product"
        title="Product activity"
        description={`${item.productName} — Effy's decisions on it: review, margin, holds and its sizes on and off sale.`}
        api={api}
        path={`/catalog/v1/products/${item.productId}/activity`}
        queryKey={productKeys.detail(item.productId)}
        fileName={`product-${item.productName}-activity`}
      />
    </RecordPage>
  )
}

/**
 * The decision, floating at the bottom of the page and always in view: where the reviewer is in the queue on the
 * left, the margin and the two verdicts on the right. When it can't be approved, it says why and Send back leads.
 */
function DecisionBar({
  position,
  total,
  prev,
  next,
  onOpen,
  canDecide,
  isChange,
  busy,
  missing,
  needsMargin,
  marginText,
  pays,
  message,
  onApprove,
  onSendBack,
}: {
  position: number | null
  total: number
  prev?: string
  next?: string
  onOpen: (id: string) => void
  canDecide: boolean
  isChange: boolean
  busy: boolean
  missing: readonly string[]
  needsMargin: boolean
  marginText: string | null
  pays: string
  message: string | null
  onApprove: () => void
  onSendBack: () => void
}) {
  const { isMobile, setOpenMobile } = useSidebar()
  const focusMargin = () => {
    if (isMobile) setOpenMobile(true)
    setTimeout(() => callMargin(), isMobile ? 250 : 0)
  }
  const bar = useActionBar({
    open: true,
    label: "Decision",
    busy,
    children: (
      <DecisionControls
        {...{ position, total, prev, next, onOpen, canDecide, isChange, busy, missing, needsMargin, marginText, pays }}
        {...{ message, onApprove, onSendBack }}
        onMargin={focusMargin}
      />
    ),
  })
  // The bar is the console's one action bar (bottom centre of the window); the page keeps room for it at its end.
  return (
    <>
      <div aria-hidden="true" className="h-24" />
      {bar}
    </>
  )
}

/** A solid control on the bar, in both appearances (the bar's own controls are outlined). */
const SOLID_BRAND =
  "border-transparent bg-brand-fill text-brand-foreground hover:bg-brand-fill/90 hover:text-brand-foreground dark:bg-brand-fill dark:hover:bg-brand-fill/90"
const SOLID_INVERSE =
  "border-transparent bg-background text-foreground hover:bg-background/90 hover:text-foreground dark:bg-background dark:hover:bg-background/90"

/**
 * What the review puts on the action bar: where the reviewer is in the queue, the margin, Send back and Approve. As
 * the bar packs tighter it drops what it can spare — customers' price and the key hints, then the words "Queue" and
 * "change".
 */
function DecisionControls({
  position,
  total,
  prev,
  next,
  onOpen,
  canDecide,
  isChange,
  busy,
  missing,
  needsMargin,
  marginText,
  pays,
  message,
  onApprove,
  onSendBack,
  onMargin,
}: Parameters<typeof DecisionBar>[0] & { onMargin: () => void }) {
  const density = useActionBarDensity()
  const roomy = density === "normal"
  const tight = density === "tight" || density === "scroll"
  const blocked = missing.length > 0
  return (
    <>
      <ActionBarButton asChild>
        <Link to="/product-review">
          <ChevronLeft aria-hidden="true" />
          <span className={tight ? "sr-only" : undefined}>Queue</span>
        </Link>
      </ActionBarButton>
      {position !== null ? (
        <b className="px-1 font-semibold tabular-nums">
          {position} of {total}
        </b>
      ) : null}
      <ActionBarButton
        size="icon-sm"
        disabled={!prev}
        onClick={() => prev && onOpen(prev)}
        aria-label="Previous (←)"
        title="Previous (←)"
      >
        <ChevronLeft />
      </ActionBarButton>
      <ActionBarButton
        size="icon-sm"
        disabled={!next}
        onClick={() => next && onOpen(next)}
        aria-label="Next (→)"
        title="Next (→)"
      >
        <ChevronRight />
      </ActionBarButton>
      <span className="ef-selbar__rule" aria-hidden="true" />

      {message ? (
        <span role="alert" className="max-w-80 truncate" title={message}>
          {message}
        </span>
      ) : null}

      {!canDecide ? (
        <span className="opacity-75">Deciding needs a manager or an administrator.</span>
      ) : (
        <>
          {blocked ? (
            <span className="flex min-w-0 items-center gap-1.5 truncate text-destructive-fill" role="status">
              <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
              {missing.join(", ")} {missing.length === 1 ? "is" : "are"} empty — send it back
            </span>
          ) : (
            <ActionBarButton
              className={needsMargin ? "border-destructive-fill text-destructive-fill" : undefined}
              onClick={onMargin}
              title="Change the margin"
              aria-label={
                needsMargin
                  ? undefined
                  : `Effy margin ${marginText ?? "unchanged"}, customers pay ${pays}. Change the margin`
              }
            >
              {needsMargin ? (
                <>
                  <CircleAlert aria-hidden="true" />
                  Set a margin
                </>
              ) : (
                <>
                  <b className="tabular-nums">{marginText ?? "Unchanged"}</b>
                  <span className="font-normal opacity-65">margin</span>
                  {roomy ? (
                    <>
                      <span aria-hidden="true" className="opacity-40">
                        ·
                      </span>
                      <span className="font-normal opacity-65">customers pay</span>
                      <b className="tabular-nums">{pays}</b>
                    </>
                  ) : null}
                  <Pencil aria-hidden="true" className="size-3.5 opacity-65" />
                </>
              )}
            </ActionBarButton>
          )}
          <span className="ef-selbar__rule" aria-hidden="true" />
          <ActionBarButton className={blocked ? SOLID_INVERSE : undefined} disabled={busy} onClick={onSendBack}>
            Send back
            {roomy ? <Kbd className="ml-1">B</Kbd> : null}
          </ActionBarButton>
          {blocked ? null : (
            <ActionBarButton className={SOLID_BRAND} disabled={busy || needsMargin} onClick={onApprove}>
              <Check aria-hidden="true" />
              {isChange && !tight ? "Approve change" : "Approve"}
              {roomy ? <Kbd className="ml-1">A</Kbd> : null}
            </ActionBarButton>
          )}
        </>
      )}
    </>
  )
}

/**
 * Takes the reviewer to the margin from the bar: the field is brought into view, ringed and tinted in the action colour
 * for a moment so the eye lands on it, and its value is selected so typing replaces it.
 */
function callMargin() {
  const field = document.getElementById("review-margin-field")
  const input = document.getElementById("review-margin")
  field?.scrollIntoView({ block: "nearest" })
  if (input instanceof HTMLInputElement) {
    input.focus({ preventScroll: true })
    input.select()
  }
  if (!field || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return
  const on = { boxShadow: "0 0 0 2px var(--primary-fill)", backgroundColor: "var(--primary-muted)" }
  field.animate([on, { ...on, offset: 0.55 }, { boxShadow: "0 0 0 2px transparent", backgroundColor: "transparent" }], {
    duration: 1800,
    easing: "ease-out",
  })
}

/** One row of pictures under a heading: now, or proposed; each marked main or new. */
function PictureRow({ title, note, images }: { title: string; note: string; images: readonly ReviewImageDTO[] }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-center gap-4 border-t py-4 first:border-t-0 first:pt-0 max-md:grid-cols-1">
      <div>
        <h3 className="text-[13px] font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">{note}</p>
      </div>
      {images.length === 0 ? (
        <p className="text-sm text-muted-foreground">No pictures.</p>
      ) : (
        <ul className="m-0 flex list-none flex-wrap gap-3 p-0">
          {images.map((img, i) => (
            <li key={img.url} className="relative size-28 overflow-hidden rounded-lg border bg-muted">
              <img src={img.url} alt={img.altText ?? ""} className="size-full object-cover" />
              {img.isNew || i === 0 ? (
                <Badge variant={img.isNew ? "success" : "outline"} className="absolute top-1.5 left-1.5 bg-background">
                  {img.isNew ? "New" : "Main"}
                </Badge>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** The main picture first, then the shop's order. */
const sortPictures = (images: readonly ReviewImageDTO[]) =>
  [...images].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary))

/** "AUD 9.50 – 38.00" over a set of amounts, or "—". */
function range(amounts: readonly (string | null | undefined)[]): string {
  const n = amounts.filter((a): a is string => !!a).map(Number)
  if (n.length === 0) return "—"
  const lo = Math.min(...n)
  const hi = Math.max(...n)
  return lo === hi ? aud(lo.toFixed(2)) : `${aud(lo.toFixed(2))} – ${hi.toFixed(2)}`
}
