import { useEffect, useMemo, useState, type ReactNode } from "react"

import { Bell, ClipboardCheck, History, Layers, PackagePlus, Pencil, Plus, Trash2 } from "lucide-react"

import { Badge, Button, Switch, toast } from "@effy/design-system/ui"
import { useActivityLog } from "@effy/web-kit/activity-log"
import {
  defaultStockVariantId,
  draftFromDetail,
  sizeLabelOf,
  toInputs,
  variantSetErrors,
} from "@effy/web-kit/product-form"
import {
  SizesFocus,
  SizesSheet,
  SizesViewToggle,
  storedSizesView,
  storeSizesView,
  type SheetField,
  type SheetRow,
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
import { AdjustStockDialog, ReceiveStockDialog, StartTrackingDialog } from "./StockDialogs"
import { useFocusedEdit } from "./useFocusedEdit"

type StockDialog = { kind: "receive" | "count" | "rules"; variantId: string; open: boolean }

/**
 * The product's sizes: one at a time (each size's price, stock and codes) or as a spreadsheet the shop types prices,
 * codes and weights into. Turning a size off sale and stock are immediate; a price, code or weight on an approved
 * product goes to Effy for review.
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
              Edit sizes
            </Button>
          ) : null}
        </>
      }
    >
      {view === "focus" ? (
        <SizesFocus
          sizes={sizes}
          selectedId={selected}
          onSelect={setSelected}
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
          key={detail.updatedAt}
          detail={detail}
          sizes={sizes}
          readOnly={readOnly}
          money={money}
          saleControl={(s) => saleControl(s, false)}
          onReceive={(id) => open("receive", id)}
          onDraft={onDraft}
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

const FIELD_OF: Record<string, SheetField> = {
  shopPriceAmount: "price",
  sku: "sku",
  gtin: "gtin",
  weightGrams: "weight",
}

/** The spreadsheet, with what the shop has typed since the product was last read; saved as one change. */
function SheetEditor({
  detail,
  sizes,
  readOnly,
  money,
  saleControl,
  onReceive,
  onDraft,
}: {
  detail: ProductDetail
  sizes: SizeView[]
  readOnly: boolean
  money: (amount: string) => string
  saleControl: (s: SizeView) => ReactNode
  onReceive: (variantId: string) => void
  onDraft?: (prices: Record<string, string> | null) => void
}) {
  const edit = useFocusedEdit(detail.id)
  const approved = isApproved(detail)
  // The set as the shop is editing it: the live sizes, or the change already with Effy.
  const base = useMemo(() => draftFromDetail(detail), [detail])
  const initial = useMemo(
    () =>
      Object.fromEntries(
        base.variants.map((r) => [r.id, { price: r.shopPriceAmount, sku: r.sku, gtin: r.gtin, weight: r.weightGrams }]),
      ) as Record<string, SheetRow>,
    [base],
  )
  const [typed, setTyped] = useState<Record<string, SheetRow>>(initial)
  const [touched, setTouched] = useState(false)

  const set = {
    ...base,
    variants: base.variants.map((r) => {
      const t = typed[r.id]
      return t ? { ...r, shopPriceAmount: t.price, sku: t.sku, gtin: t.gtin, weightGrams: t.weight } : r
    }),
  }
  const errors: Record<string, string> = {}
  for (const [field, message] of Object.entries(variantSetErrors(set))) {
    const m = /^variants\[(\d+)\]\.(\w+)$/.exec(field)
    const row = m ? set.variants[Number(m[1])] : undefined
    const cell = m ? FIELD_OF[m[2]!] : undefined
    if (row && cell) errors[`${row.id}:${cell}`] = message
  }
  const dirty = JSON.stringify(typed) !== JSON.stringify(initial)
  const changed = Object.keys(typed).filter((id) => JSON.stringify(typed[id]) !== JSON.stringify(initial[id])).length
  const invalid = Object.keys(errors).length > 0

  useEffect(() => {
    onDraft?.(dirty ? Object.fromEntries(Object.entries(typed).map(([id, r]) => [id, r.price])) : null)
  }, [typed, dirty, onDraft])
  // Leaving the spreadsheet (or saving, which re-reads the product) ends what was being typed.
  useEffect(() => () => onDraft?.(null), [onDraft])

  function save() {
    setTouched(true)
    if (invalid) return
    const inputs = toInputs(set)
    void edit.save(
      {
        expectedUpdatedAt: detail.updatedAt,
        options: inputs.options,
        variants: inputs.variants,
        unitBasis: inputs.unitBasis,
      },
      () => {
        track({ name: "product_variants_saved", productId: detail.id, variantCount: inputs.variants.length })
        toast(approved ? "Sent to Effy. Customers see it once it is approved." : "Saved")
      },
    )
  }

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
                value: typed,
                initial,
                errors: touched ? errors : undefined,
                disabled: edit.saving,
                onChange: (id, field, value) => setTyped((t) => ({ ...t, [id]: { ...t[id]!, [field]: value } })),
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
      {dirty || edit.error ? (
        <div className="ef-actionbar mx-0 mb-0 rounded-lg border px-4" role="region" aria-label="Unsaved changes">
          <div className="ef-actionbar__text">
            <span className="ef-actionbar__title">
              {changed} {changed === 1 ? "size" : "sizes"} changed
            </span>
            <span className="ef-actionbar__desc">
              {edit.error ??
                (touched && invalid
                  ? "Fix the marked cells first."
                  : approved
                    ? "Effy checks it first — customers keep seeing today's version until it is approved."
                    : "Saved straight to the product.")}
            </span>
          </div>
          <div className="ef-actionbar__actions">
            <Button
              variant="ghost"
              disabled={edit.saving}
              onClick={() => {
                setTyped(initial)
                setTouched(false)
              }}
            >
              Discard
            </Button>
            {edit.stale ? (
              <Button variant="outline" onClick={edit.reload}>
                Reload
              </Button>
            ) : (
              <Button onClick={save} disabled={edit.saving || (touched && invalid)}>
                {edit.saving ? "Saving…" : approved ? "Send to Effy" : "Save"}
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}
