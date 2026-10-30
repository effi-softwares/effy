import { useState, type ReactNode } from "react"

import { Bell, ClipboardCheck, History, Layers, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react"

import { Badge, Button, Switch, toast } from "@effy/design-system/ui"
import { useActivityLog } from "@effy/web-kit/activity-log"
import { defaultStockVariantId, sizeLabelOf } from "@effy/web-kit/product-form"
import {
  SizesFocus,
  SizesSheet,
  SizesViewToggle,
  storedSizesView,
  storeSizesView,
  type SizesView,
  type SizeView,
} from "@effy/web-kit/product-page"
import { RecordSection } from "@effy/web-kit/patterns"

import { DesignSheet } from "@/components/console/DesignSheet"
import { track } from "@/lib/telemetry"

import { formatMoney } from "./detailFormat"
import { productMutationError } from "./errorText"
import { InventoryRulesDialog } from "./InventoryRulesDialog"
import type { ProductDetail } from "./model"
import { shopSizes } from "./productPage"
import { useSetVariantState } from "./queries"
import { isApproved } from "./review"
import { useSizesDraft, type SizesDraft } from "./sizesDraft"
import { AdjustStockDialog, ReceiveStockDialog, StartTrackingDialog } from "./StockDialogs"

type StockDialog = { kind: "receive" | "count" | "rules"; variantId: string; open: boolean }

/**
 * The product's sizes: one at a time (each size's price, stock and codes, edited where they are shown) or as a
 * spreadsheet the shop types prices, codes and weights into — one draft for both, so switching keeps what is typed.
 * Adding, removing or re-labelling sizes is the sizes dialog's. Turning a size off sale and stock are immediate; a
 * price, code or weight on an approved product goes to Effy for review.
 */
export function ProductSizes({
  detail,
  readOnly,
  onEditSizes,
  onDraft,
}: {
  detail: ProductDetail
  /** Effy is still setting the product up: the shop sees it and changes nothing. */
  readOnly: boolean
  /** The full sizes editor (options, new sizes, pack sizes). */
  onEditSizes?: () => void
  /** The prices being typed in the spreadsheet, by size, or null when nothing is: the preview follows them. */
  onDraft?: (prices: Record<string, string> | null) => void
}) {
  const sizes = shopSizes(detail)
  const approved = isApproved(detail)
  const [view, setView] = useState<SizesView>(storedSizesView)
  const [selected, setSelected] = useState(() => defaultStockVariantId(detail) ?? sizes[0]?.id ?? "")
  const [dialog, setDialog] = useState<StockDialog | null>(null)
  const [removing, setRemoving] = useState<SizeView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const setState = useSetVariantState(detail.id)
  const activity = useActivityLog()
  const hasOptions = detail.options.length > 0
  const onSale = sizes.filter((s) => s.onSale).length
  const money = (amount: string) => formatMoney(amount, detail.currency)
  const draft = useSizesDraft(detail, onDraft)
  const [editingId, setEditingId] = useState<string | null>(null)

  async function change(s: SizeView, state: "active" | "inactive" | "removed") {
    setError(null)
    try {
      await setState.mutateAsync({ variantId: s.id, state })
      track({ name: "product_variant_state_changed", productId: detail.id, state })
      if (state !== "removed") toast(state === "active" ? `${s.label} is on sale` : `${s.label} is off sale`)
    } catch (err) {
      setError(productMutationError(err))
    }
  }

  function saleControl(s: SizeView, withWord: boolean) {
    if (!hasOptions) {
      return s.onSale ? <Badge variant="success">On sale</Badge> : <Badge variant="quiet">Off sale</Badge>
    }
    const last = s.onSale && onSale <= 1
    const heldOff = detail.hold !== null && !s.onSale
    return (
      <>
        {withWord ? <span>{s.onSale ? "On sale" : "Off sale"}</span> : null}
        <Switch
          checked={s.onSale}
          aria-label={`${s.label} on sale`}
          // Held by Effy (102): a size may come off sale, never back on. Read-only while Effy sets it up.
          disabled={setState.isPending || last || readOnly || heldOff}
          title={
            heldOff
              ? "Effy is holding this product — no size can go back on sale until Effy releases it"
              : last
                ? "The last size on sale — make the product unavailable instead"
                : undefined
          }
          onCheckedChange={(on) => void change(s, on ? "active" : "inactive")}
        />
      </>
    )
  }

  const open = (kind: StockDialog["kind"], variantId: string) => setDialog({ kind, variantId, open: true })
  const stockActions = (s: SizeView) =>
    readOnly ? null : (
      <>
        <Button variant="outline" size="sm" onClick={() => open("receive", s.id)}>
          <PackagePlus aria-hidden="true" />
          {s.stock.tracked ? "Receive" : "Add stock"}
        </Button>
        <Button variant="outline" size="sm" disabled={!s.stock.tracked} onClick={() => open("count", s.id)}>
          <ClipboardCheck aria-hidden="true" />
          Adjust
        </Button>
        <Button variant="outline" size="sm" onClick={() => open("rules", s.id)}>
          <Bell aria-hidden="true" />
          Alert level
        </Button>
        <Button variant="outline" size="sm" onClick={() => activity.show({ sub: s.id })}>
          <History aria-hidden="true" />
          Stock activity
        </Button>
      </>
    )

  const chosen = dialog ? detail.variants.find((v) => v.id === dialog.variantId) : undefined
  const close = (o: boolean) => !o && setDialog((d) => (d ? { ...d, open: false } : d))

  return (
    <RecordSection
      id="sizes"
      icon={Layers}
      title="Sizes and prices"
      description={
        readOnly
          ? "Effy is setting these up. You can change them once the product is on sale."
          : approved
            ? "A new price, code or weight is checked by Effy before it applies. Turning a size off sale is immediate."
            : "What you are paid for each size. Effy sets what customers pay when it approves the product."
      }
      actions={
        <>
          <SizesViewToggle
            value={view}
            onChange={(v) => {
              setView(v)
              storeSizesView(v)
            }}
          />
          {!readOnly && onEditSizes ? (
            <Button variant="outline" onClick={onEditSizes}>
              <Pencil aria-hidden="true" />
              Add or remove sizes
            </Button>
          ) : null}
        </>
      }
    >
      {view === "focus" ? (
        <SizesFocus
          sizes={sizes}
          selectedId={selected}
          onSelect={(id) => {
            setSelected(id)
            if (!draft.dirty) setEditingId(null)
          }}
          money={money}
          priceLabel="Your price"
          codeLabel="Your code"
          pendingWord={detail.pendingChange?.state === "sent_back" ? "Sent back" : "In review"}
          onSaleControl={(s) => saleControl(s, true)}
          stockActions={stockActions}
          footer={
            hasOptions && !readOnly
              ? (s) => (
                  <Button
                    variant="ghost"
                    className="text-destructive hover:bg-destructive-soft hover:text-destructive"
                    disabled={setState.isPending || (s.onSale && onSale <= 1)}
                    onClick={() => setRemoving(s)}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove {s.label}
                  </Button>
                )
              : undefined
          }
          edit={
            readOnly
              ? undefined
              : {
                  sizeId: editingId,
                  onStart: setEditingId,
                  value: draft.typed,
                  initial: draft.initial,
                  errors: draft.errors,
                  onChange: draft.change,
                  onSave: () => draft.save(() => setEditingId(null)),
                  onCancel: () => {
                    draft.discard()
                    setEditingId(null)
                  },
                  currency: detail.currency,
                  saveLabel: draft.saveLabel,
                  note: draft.invalid ? "Fix the marked fields first." : draft.note,
                  customerPriceWhileChanging: draft.approved ? "Set by Effy on approval" : "Set when Effy approves it",
                  saving: draft.saving,
                  error: draft.error,
                  onReload: draft.stale ? draft.reload : undefined,
                }
          }
          addSize={
            !readOnly && onEditSizes ? (
              <Button variant="ghost" size="sm" onClick={onEditSizes}>
                <Plus aria-hidden="true" />
                Add a size
              </Button>
            ) : undefined
          }
        />
      ) : (
        <SheetEditor
          draft={draft}
          sizes={sizes}
          readOnly={readOnly}
          money={money}
          saleControl={(s) => saleControl(s, false)}
          onReceive={(id) => open("receive", id)}
        />
      )}

      {error ? (
        <p role="alert" className="mt-4 text-sm font-medium">
          {error}
        </p>
      ) : null}

      {dialog && chosen ? (
        dialog.kind === "rules" ? (
          <InventoryRulesDialog
            detail={detail}
            variantId={chosen.id}
            stock={chosen.stock}
            open={dialog.open}
            onOpenChange={close}
          />
        ) : dialog.kind === "count" && chosen.stock.tracked ? (
          <AdjustStockDialog
            variantId={chosen.id}
            stock={chosen.stock}
            open={dialog.open}
            onOpenChange={close}
            sizeLabel={sizeLabelOf(detail, chosen.id)}
          />
        ) : chosen.stock.tracked ? (
          <ReceiveStockDialog
            variantId={chosen.id}
            stock={chosen.stock}
            open={dialog.open}
            onOpenChange={close}
            sizeLabel={sizeLabelOf(detail, chosen.id)}
          />
        ) : (
          <StartTrackingDialog
            variantId={chosen.id}
            open={dialog.open}
            onOpenChange={close}
            sizeLabel={sizeLabelOf(detail, chosen.id)}
          />
        )
      ) : null}

      <DesignSheet
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Remove ${removing?.label ?? "this size"}?`}
        description="It stops being sold at once. Past orders and its stock history keep it."
        saveLabel="Remove size"
        destructive
        saving={setState.isPending}
        onSave={() => {
          if (!removing) return
          void change(removing, "removed").then(() => setRemoving(null))
        }}
      >
        <p className="text-sm text-muted-foreground">To sell it again later, add it back as a new size.</p>
      </DesignSheet>
    </RecordSection>
  )
}

/** The spreadsheet over the sizes draft; the bar under it saves every changed size as one change. */
function SheetEditor({
  draft,
  sizes,
  readOnly,
  money,
  saleControl,
  onReceive,
}: {
  draft: SizesDraft
  sizes: SizeView[]
  readOnly: boolean
  money: (amount: string) => string
  saleControl: (s: SizeView) => ReactNode
  onReceive: (variantId: string) => void
}) {
  return (
    <div className="grid gap-4">
      <SizesSheet
        sizes={sizes}
        money={money}
        priceLabel="Your price"
        codeLabel="Your code"
        editing={
          readOnly
            ? undefined
            : {
                value: draft.typed,
                initial: draft.initial,
                errors: draft.errors,
                disabled: draft.saving,
                onChange: draft.change,
              }
        }
        onSaleControl={saleControl}
        stockAction={
          readOnly
            ? undefined
            : (s) => (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => onReceive(s.id)}
                  aria-label={`Receive stock of ${s.label}`}
                  title="Receive stock"
                >
                  <Plus />
                </Button>
              )
        }
      />
      {readOnly ? null : (
        <p className="text-[13px] text-muted-foreground">
          Tab moves to the next cell, Enter to the one below. An empty weight keeps the assumed one.
        </p>
      )}
      {draft.dirty || draft.error ? (
        <div className="ef-actionbar mx-0 mb-0 rounded-lg border px-4" role="region" aria-label="Unsaved changes">
          <div className="ef-actionbar__text">
            <span className="ef-actionbar__title">
              {draft.changed} {draft.changed === 1 ? "size" : "sizes"} changed
            </span>
            <span className="ef-actionbar__desc">
              {draft.error ?? (draft.invalid ? "Fix the marked cells first." : draft.note)}
            </span>
          </div>
          <div className="ef-actionbar__actions">
            <Button variant="ghost" disabled={draft.saving} onClick={draft.discard}>
              Discard
            </Button>
            {draft.stale ? (
              <Button variant="outline" onClick={draft.reload}>
                Reload
              </Button>
            ) : (
              <Button onClick={() => draft.save()} disabled={draft.saving || draft.invalid}>
                {draft.saving ? "Saving…" : draft.saveLabel}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
