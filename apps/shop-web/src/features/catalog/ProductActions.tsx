import { useState } from "react";

import type { ProductStatus } from "@effy/shared-types";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
} from "@effy/design-system/ui";

import { track } from "@/lib/telemetry";

import { productMutationError } from "./errorText";
import { ReceiveStockButton } from "./InventorySection";
import type { ProductDetail } from "./model";
import { useChangeStatus, useDeleteProduct } from "./queries";
import { ReceiveStockDialog } from "./StockDialogs";
import { removalAction, visibilityAction } from "./statusControl";
import { productStockQuery } from "./stockQueries";
import { useQuery } from "@tanstack/react-query";

/**
 * The product's two named actions (057), replacing the `Change status` dropdown + `Delete/Archive`
 * ghost button this screen carried.
 *
 * ⚠ THE TRANSITIONS DID NOT CHANGE — the PRESENTATION did. `availableTransitions` still describes the
 * same state machine and the backend still re-validates every move; what went is a menu that made the
 * operator open it to discover what it could do and then translate "make unavailable" into the thing
 * they wanted, which was "take it off the storefront". See `statusControl.ts` for the mapping.
 *
 * ⚠ AND EVERY MOVE IS CONFIRMED. The mockup confirms too, and it is right to: publishing puts a
 * product in front of shoppers and unpublishing takes it away from them mid-basket. The confirmation
 * body says what actually happens to orders and to the stock count, because "are you sure?" on its own
 * teaches nobody anything.
 */
export function ProductHeaderActions({
  detail,
  onOpenActivity,
  onDeleted,
}: {
  detail: ProductDetail;
  onOpenActivity: () => void;
  onDeleted: () => void;
}) {
  const changeStatus = useChangeStatus(detail.id);
  const stock = useQuery(productStockQuery(detail.id));
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const action = visibilityAction(detail.status);

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
      <ReceiveStockButton detail={detail} onReceive={() => setReceiveOpen(true)} />

      {action ? (
        <Button
          variant="outline"
          size="sm"
          disabled={changeStatus.isPending}
          onClick={() => {
            setError(null);
            setConfirm(true);
          }}
        >
          {action.label}
        </Button>
      ) : null}

      <Button variant="outline" size="sm" onClick={onOpenActivity}>
        Activity
      </Button>

      <ProductRemovalControl detail={detail} onDeleted={onDeleted} />

      {error ? <span className="text-destructive text-sm">{error}</span> : null}

      {/* ⚠ Mounted only once the stock read has landed. The dialog shows "on hand → after" before the
          write, and it cannot do that arithmetic against a count it does not have yet — an opening
          state of "0 → 24" for a shelf holding 12 is exactly the wrong thing to show someone about to
          commit a number. */}
      {stock.data ? (
        <ReceiveStockDialog
          productId={detail.id}
          stock={stock.data.stock}
          open={receiveOpen}
          onOpenChange={setReceiveOpen}
        />
      ) : null}

      {action ? (
        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
              <AlertDialogDescription>{action.confirmBody}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={changeStatus.isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  apply(action.target);
                }}
                disabled={changeStatus.isPending}
              >
                {action.confirmLabel}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      ) : null}
    </div>
  );
}

/**
 * The removal control — last in the header's action row (057 revision; it used to sit at the foot of
 * a right rail the revised mockup deleted). Rendered by `ProductHeaderActions`.
 *
 * ⚠ ARCHIVING IS NOT DELETION AND THE BUTTON NEVER PRETENDS IT IS. A published product cannot be hard
 * deleted — the backend refuses it, because orders and fulfilments reference the row — so the only
 * offer made for one is the archive, with copy saying what is kept. An unpublished draft has never
 * been referenced by anything, so that one really can go, and its confirmation says so plainly.
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
      {/* ⚠ OUTLINED, NOT FILLED — only the WORD takes the destructive colour (operator direction,
          2026-09-10, reversing this button's earlier neutral treatment). The platform's `--destructive`
          is AA as text, so the label reads; a filled red button would shout a reversible archive as
          loudly as a permanent delete, and the confirmation is what carries the weight. */}
      <Button
        variant="outline"
        size="sm"
        disabled={busy}
        onClick={() => setConfirm(true)}
        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
      >
        {action.label}
      </Button>

      {error ? <span className="text-destructive text-sm">{error}</span> : null}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{action.confirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>{action.confirmBody}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
              disabled={busy}
            >
              {action.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
