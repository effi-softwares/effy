import { useState } from "react";

import type { ProductStatus } from "@effy/shared-types";
import { History } from "lucide-react";

import { Button } from "@effy/design-system/ui";

import { DesignSheet } from "@/components/console/DesignSheet";

import { track } from "@/lib/telemetry";

import { productMutationError } from "./errorText";
import { ReceiveStockButton, SizePicker } from "./InventorySection";
import { sizeLabelOf } from "./variants";
import type { ProductDetail } from "./model";
import { useChangeStatus, useDeleteProduct, useSubmitForReview, useWithdrawReview } from "./queries";
import { ReceiveStockDialog, StartTrackingDialog } from "./StockDialogs";
import { removalAction, visibilityAction } from "./statusControl";
import { variantStockQuery } from "./stockQueries";
import { useQuery } from "@tanstack/react-query";

/**
 * The product's two named actions, replacing the `Change status` dropdown + `Delete/Archive`
 * ghost button this screen carried.
 *
 * The transitions did not change — the presentation did. `availableTransitions` still describes the
 * same state machine and the backend still re-validates every move; what went is a menu that made the
 * operator open it to discover what it could do and then translate "make unavailable" into the thing
 * they wanted, which was "take it off the storefront". See `statusControl.ts` for the mapping.
 *
 * And every move is confirmed. The mockup confirms too, and it is right to: publishing puts a
 * product in front of shoppers and unpublishing takes it away from them mid-basket. The confirmation
 * body says what actually happens to orders and to the stock count, because "are you sure?" on its own
 * teaches nobody anything.
 */
export function ProductHeaderActions({
  detail,
  stockVariantId,
  onOpenActivity,
  onDeleted,
}: {
  detail: ProductDetail;
  /** The size "Receive stock" receives into: the one the Inventory tab shows. */
  stockVariantId: string;
  onOpenActivity: () => void;
  onDeleted: () => void;
}) {
  const changeStatus = useChangeStatus(detail.id);
  // Stock is per size. The header's dialog opens on the size the Inventory section shows, names
  // it in its title, and lets the operator pick another — it never writes to a size nobody chose.
  const [receiveVariantId, setReceiveVariantId] = useState(stockVariantId);
  const stock = useQuery(variantStockQuery(receiveVariantId));
  const [receiveOpen, setReceiveOpen] = useState(false);
  const sizeControl = (
    <SizePicker detail={detail} variantId={receiveVariantId} onChange={setReceiveVariantId} id="receive-size" />
  );
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = useSubmitForReview(detail.id);
  const withdraw = useWithdrawReview(detail.id);
  const action = visibilityAction(detail.status, detail.reviewState);
  const busy = changeStatus.isPending || submit.isPending || withdraw.isPending;

  /** Submit / withdraw are their own requests, not a status move. */
  function review(kind: "submit" | "withdraw") {
    setError(null);
    (kind === "submit" ? submit : withdraw).mutate(undefined, {
      onSuccess: () => {
        setConfirm(false);
        track({ name: kind === "submit" ? "product_submitted_for_review" : "product_review_withdrawn", productId: detail.id });
      },
      onError: (err) => {
        setConfirm(false);
        setError(
          productMutationError(
            err,
            kind === "submit"
              ? "This product has already been reviewed. Reload to see where it stands."
              : "There is nothing waiting for review on this product. Reload to see where it stands.",
          ),
        );
      },
    });
  }

  function apply(status: ProductStatus) {
    setError(null);
    changeStatus.mutate(
      { status },
      {
        onSuccess: () => {
          setConfirm(false);
          if (status === "archived") track({ name: "product_archived", productId: detail.id });
        },
        onError: (err) => setError(productMutationError(err)),
      },
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <ReceiveStockButton
        variantId={stockVariantId}
        onReceive={() => {
          setReceiveVariantId(stockVariantId);
          setReceiveOpen(true);
        }}
      />

      {action ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => {
            setError(null);
            setConfirm(true);
          }}
        >
          {action.label}
        </Button>
      ) : null}

      <Button variant="outline" onClick={onOpenActivity}>
        <History aria-hidden="true" />
        Activity
      </Button>

      <ProductRemovalControl detail={detail} onDeleted={onDeleted} />

      {error ? <span role="alert" className="text-sm font-medium">{error}</span> : null}

      {/* Mounted only once the stock read has landed. The receive dialog shows "on hand → after"
          before the write, and it cannot do that arithmetic against a count it does not have yet — an
          opening state of "0 → 24" for a shelf holding 12 is exactly the wrong thing to show someone
          about to commit a number.

          Which dialog depends on the product, and the button's own label already said which one is
          coming. Since 098 a new size is counted from the start (at zero); a size whose counting a shop
          switched off (made to order), or one from before that rule, gets `StartTrackingDialog`, which turns counting on and
          records the opening count in a single request. A tracked product gets the additive receive.
          The two are not one dialog with a mode, because the operator is not choosing between them
          the product's own state decides, and a mode switch would offer a choice with one right
          answer. */}
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
            if (action.kind === "status") apply(action.target);
            else review(action.kind);
          }}
        >
          {null}
        </DesignSheet>
      ) : null}
    </div>
  );
}

/**
 * The removal control, last in the header's action row (`ProductHeaderActions`). A published product
 * cannot be deleted (orders reference it), so it offers archive, saying what is kept; a never-published
 * draft really can go, and its confirmation says so.
 */
export function ProductRemovalControl({
  detail,
  onDeleted,
}: {
  detail: ProductDetail;
  onDeleted: () => void;
}) {
  const changeStatus = useChangeStatus(detail.id);
  const deleteProduct = useDeleteProduct(detail.id);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = removalAction(detail.status);
  if (!action) return null;

  const busy = changeStatus.isPending || deleteProduct.isPending;

  function run() {
    setError(null);
    if (action!.kind === "delete") {
      deleteProduct.mutate(undefined, {
        onSuccess: () => {
          setConfirm(false);
          onDeleted();
        },
        onError: (err) => setError(productMutationError(err)),
      });
      return;
    }
    changeStatus.mutate(
      { status: "archived" },
      {
        onSuccess: () => {
          setConfirm(false);
          track({ name: "product_archived", productId: detail.id });
        },
        onError: (err) => setError(productMutationError(err)),
      },
    );
  }

  return (
    <>
      {/* Outlined, not filled: a reversible archive must not shout as loudly as a permanent delete.
          The confirmation carries the weight, with its consequence in words and a foreground (black)
          confirm — the identity has no red. */}
      <Button variant="outline" disabled={busy} onClick={() => setConfirm(true)}>
        {action.label}
      </Button>

      {error ? <span role="alert" className="text-sm font-medium">{error}</span> : null}

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
  );
}
