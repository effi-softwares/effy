import { useState } from "react"

import { useActivityAction } from "@effy/web-kit/activity-log"
import { MoreActions } from "@effy/web-kit/patterns"
import type { ProductStatus } from "@effy/shared-types"
import { Trash2 } from "lucide-react"

import { Button } from "@effy/design-system/ui"

import { DesignSheet } from "@/components/console/DesignSheet"

import { track } from "@/lib/telemetry"

import { productMutationError } from "./errorText"
import { ReceiveStockButton, SizePicker } from "./StockControls"
import { sizeLabelOf } from "@effy/web-kit/product-form"
import type { ProductDetail } from "./model"
import { useChangeStatus, useDeleteProduct, useSubmitForReview, useWithdrawReview } from "./queries"
import { ReceiveStockDialog, StartTrackingDialog } from "./StockDialogs"
import { removalAction, visibilityAction } from "./statusControl"
import { variantStockQuery } from "./stockQueries"
import { useQuery } from "@tanstack/react-query"

export function ProductHeaderActions({
  detail,
  stockVariantId,
  onDeleted,
}: {
  detail: ProductDetail
  stockVariantId: string
  onDeleted: () => void
}) {
  const activity = useActivityAction()
  const changeStatus = useChangeStatus(detail.id)
  const [receiveVariantId, setReceiveVariantId] = useState(stockVariantId)
  const stock = useQuery(variantStockQuery(receiveVariantId))
  const [receiveOpen, setReceiveOpen] = useState(false)
  const sizeControl = (
    <SizePicker detail={detail} variantId={receiveVariantId} onChange={setReceiveVariantId} id="receive-size" />
  )
  const [confirm, setConfirm] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = useSubmitForReview(detail.id)
  const withdraw = useWithdrawReview(detail.id)
  const action = visibilityAction(detail.status, detail.reviewState, detail.hold !== null)
  const removal = removalAction(detail.status, detail.reviewState, detail.hold !== null)
  const [removing, setRemoving] = useState(false)
  const busy = changeStatus.isPending || submit.isPending || withdraw.isPending

  function review(kind: "submit" | "withdraw") {
    setError(null)
    ;(kind === "submit" ? submit : withdraw).mutate(undefined, {
      onSuccess: () => {
        setConfirm(false)
        track({
          name: kind === "submit" ? "product_submitted_for_review" : "product_review_withdrawn",
          productId: detail.id,
        })
      },
      onError: (err) => {
        setConfirm(false)
        setError(
          productMutationError(
            err,
            kind === "submit"
              ? "This product has already been reviewed. Reload to see where it stands."
              : "There is nothing waiting for review on this product. Reload to see where it stands.",
          ),
        )
      },
    })
  }

  function apply(status: ProductStatus) {
    setError(null)
    changeStatus.mutate(
      { status },
      {
        onSuccess: () => {
          setConfirm(false)
          if (status === "archived") track({ name: "product_archived", productId: detail.id })
        },
        onError: (err) => setError(productMutationError(err)),
      },
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ReceiveStockButton
        variantId={stockVariantId}
        onReceive={() => {
          setReceiveVariantId(stockVariantId)
          setReceiveOpen(true)
        }}
      />

      {action ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError(null)
            setConfirm(true)
          }}
        >
          {action.label}
        </Button>
      ) : null}

      <MoreActions
        actions={[
          { ...activity, label: "Stock activity" },
          removal ? { label: removal.label, icon: Trash2, destructive: true, onSelect: () => setRemoving(true) } : null,
        ]}
      />
      <ProductRemovalControl detail={detail} onDeleted={onDeleted} open={removing} onOpenChange={setRemoving} />

      {error ? (
        <span role="alert" className="text-sm font-medium">
          {error}
        </span>
      ) : null}

      {stock.data ? (
        stock.data.stock.tracked ? (
          <ReceiveStockDialog
            variantId={receiveVariantId}
            stock={stock.data.stock}
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
            sizeLabel={sizeLabelOf(detail, receiveVariantId)}
            sizeControl={sizeControl}
          />
        ) : (
          <StartTrackingDialog
            variantId={receiveVariantId}
            open={receiveOpen}
            onOpenChange={setReceiveOpen}
            sizeLabel={sizeLabelOf(detail, receiveVariantId)}
            sizeControl={sizeControl}
          />
        )
      ) : null}

      {action ? (
        <DesignSheet
          open={confirm}
          onOpenChange={setConfirm}
          title={action.confirmTitle}
          description={action.confirmBody}
          saveLabel={action.confirmLabel}
          saving={busy}
          onSave={() => {
            if (action.kind === "status") apply(action.target)
            else review(action.kind)
          }}
        >
          {null}
        </DesignSheet>
      ) : null}
    </div>
  )
}

/** The confirm for archiving or deleting the product; it opens from the page's "More" menu. */
function ProductRemovalControl({
  detail,
  onDeleted,
  open: confirm,
  onOpenChange: setConfirm,
}: {
  detail: ProductDetail
  onDeleted: () => void
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const changeStatus = useChangeStatus(detail.id)
  const deleteProduct = useDeleteProduct(detail.id)
  const [error, setError] = useState<string | null>(null)

  const action = removalAction(detail.status, detail.reviewState, detail.hold !== null)
  if (!action) return null

  const busy = changeStatus.isPending || deleteProduct.isPending

  function run() {
    setError(null)
    if (action!.kind === "delete") {
      deleteProduct.mutate(undefined, {
        onSuccess: () => {
          setConfirm(false)
          onDeleted()
        },
        onError: (err) => setError(productMutationError(err)),
      })
      return
    }
    changeStatus.mutate(
      { status: "archived" },
      {
        onSuccess: () => {
          setConfirm(false)
          track({ name: "product_archived", productId: detail.id })
        },
        onError: (err) => setError(productMutationError(err)),
      },
    )
  }

  return (
    <>
      {error ? (
        <span role="alert" className="text-sm font-medium">
          {error}
        </span>
      ) : null}

      <DesignSheet
        open={confirm}
        onOpenChange={setConfirm}
        title={action.confirmTitle}
        description={action.confirmBody}
        saveLabel={action.confirmLabel}
        destructive
        saving={busy}
        onSave={run}
      >
        {null}
      </DesignSheet>
    </>
  )
}
