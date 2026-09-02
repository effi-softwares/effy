import { useState } from "react";

import type { AdminOrderDetailDTO, ProposedRefundDTO, RefundDTO } from "@effy/shared-types";
import { Button, Input } from "@effy/design-system/ui";

import { refundActionError } from "../refundErrorText";
import { useDeclineRefundRequest, useDismissProposal } from "../refundQueries";
import { RefundPanel } from "./RefundPanel";

/**
 * The refund half of an order, for staff (055 US1).
 *
 * ⚠ ORDERED BY WHAT NEEDS A DECISION. Proposals first — they are money the platform's own records say
 * is owed and nobody has returned — then the control, then what has already happened. An operator
 * opening this order because a customer is on the phone should not have to scroll past history to
 * find the thing they must act on.
 *
 * ⚠ Detail rows and tables, no cards (Principle V), and no colour carries meaning: a failed refund is
 * marked by the word "failed" and its reason, not by a red tint that a colour-blind operator or a
 * greyscale print loses entirely.
 */
export function RefundsSection({
  order,
  canIssue,
}: {
  order: AdminOrderDetailDTO;
  canIssue: boolean;
}) {
  return (
    <>
      {order.refundRequest && order.refundRequest.status === "open" ? (
        <OpenRequest orderId={order.id} request={order.refundRequest} canAct={canIssue} />
      ) : null}

      {order.proposedRefunds.length > 0 ? (
        <ProposedRefunds orderId={order.id} proposals={order.proposedRefunds} canAct={canIssue} />
      ) : null}

      {canIssue ? (
        <RefundPanel
          orderId={order.id}
          lines={order.refundableLines}
          refundableAmount={order.refundableAmount}
        />
      ) : null}

      <RefundHistory refunds={order.refunds} refundedAmount={order.refundedAmount} />
    </>
  );
}

/**
 * A customer's unanswered ask (055 FR-005r).
 *
 * ⚠ THEIR OWN WORDS, UNEDITED. A summarised complaint is a different complaint, and the summary is
 * always written by someone who has already decided what they think happened.
 *
 * ⚠ IT IS ANSWERED BY ISSUING A REFUND OR BY DECLINING — there is no third button and no reply box.
 * A thread would be a support product, and building half of one, where replies arrive and nobody is
 * assigned to answer, is worse than not building it.
 */
function OpenRequest({
  orderId,
  request,
  canAct,
}: {
  orderId: string;
  request: NonNullable<AdminOrderDetailDTO["refundRequest"]>;
  canAct: boolean;
}) {
  const decline = useDeclineRefundRequest(orderId);
  const [declining, setDeclining] = useState(false);
  const [note, setNote] = useState("");

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">The customer has asked for a refund</h2>
      <p className="text-sm">{request.message}</p>
      {request.items.length > 0 ? (
        <ul className="text-sm text-muted-foreground">
          {request.items.map((i) => (
            <li key={i.orderItemId}>
              {i.quantity} × {i.productName}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">They did not name particular items.</p>
      )}

      {/* ⚠ Issuing a refund below closes this automatically — there is no "mark as refunded" button,
          because a request answered without money moving would be a lie in the record. */}
      {canAct ? (
        declining ? (
          <div className="space-y-2 border-t pt-3">
            <label htmlFor="decline-note" className="text-sm font-medium">
              Why are you declining this?
            </label>
            {/* ⚠ Required by this screen. Telling a customer they are not owed money they believe
                they are owed is as consequential as paying them, and nobody comes back to check it. */}
            <Input
              id="decline-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. the delivery photo shows all six cartons"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={note.trim() === "" || decline.isPending}
                onClick={() =>
                  decline.mutate(
                    { requestId: request.id, note: note.trim() },
                    { onSuccess: () => setDeclining(false) },
                  )
                }
              >
                Decline
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setDeclining(false)}>
                Cancel
              </Button>
            </div>
            {decline.isError ? (
              <p role="alert" className="text-sm text-destructive">
                {refundActionError(decline.error)}
              </p>
            ) : null}
          </div>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => setDeclining(true)}>
            Decline this request
          </Button>
        )
      ) : null}
    </section>
  );
}

/**
 * ⚠ THE PLATFORM'S OWN EVIDENCE THAT SOMEBODY IS OWED MONEY.
 *
 * A picker recorded that these units were not supplied. Making the customer notice and ask is the
 * failure this whole slice exists to close — but a payment triggered by a warehouse tap has no second
 * pair of eyes, so this proposes and a person decides (spec A5b).
 */
function ProposedRefunds({
  orderId,
  proposals,
  canAct,
}: {
  orderId: string;
  proposals: readonly ProposedRefundDTO[];
  canAct: boolean;
}) {
  const dismiss = useDismissProposal(orderId);
  const [dismissing, setDismissing] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Owed but not refunded</h2>
      <p className="text-sm text-muted-foreground">
        The shop recorded these as not supplied. The customer paid for them.
      </p>
      <table className="w-full text-sm">
        <tbody className="divide-y">
          {proposals.map((p) => (
            <tr key={p.orderItemId}>
              <td className="py-2">{p.productName}</td>
              <td className="w-20 py-2 tabular-nums text-muted-foreground">{p.quantity} short</td>
              <td className="w-24 py-2 tabular-nums">{p.amount}</td>
              <td className="w-32 py-2 text-right">
                {canAct ? (
                  dismissing === p.orderItemId ? null : (
                    <Button variant="ghost" size="sm" onClick={() => setDismissing(p.orderItemId)}>
                      Not owed
                    </Button>
                  )
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* ⚠ A REASON IS REQUIRED, and the server refuses without one. Deciding a customer is NOT owed
          money they paid for is exactly as consequential as deciding they are — and it is the
          decision nobody will ever come back and check. */}
      {dismissing ? (
        <div className="space-y-2 border-t pt-3">
          <label htmlFor="dismiss-reason" className="text-sm font-medium">
            Why is this not owed?
          </label>
          <Input
            id="dismiss-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. the shop substituted an equivalent item"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              disabled={reason.trim() === "" || dismiss.isPending}
              onClick={() =>
                dismiss.mutate(
                  { orderItemId: dismissing, reason: reason.trim() },
                  {
                    onSuccess: () => {
                      setDismissing(null);
                      setReason("");
                    },
                  },
                )
              }
            >
              Dismiss
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setDismissing(null)}>
              Cancel
            </Button>
          </div>
          {dismiss.isError ? (
            <p role="alert" className="text-sm text-destructive">
              {refundActionError(dismiss.error)}
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** What has actually been refunded, and what happened to each attempt. */
function RefundHistory({
  refunds,
  refundedAmount,
}: {
  refunds: readonly RefundDTO[];
  refundedAmount: string;
}) {
  if (refunds.length === 0) {
    return (
      <section className="space-y-3">
        <h2 className="text-sm font-medium">Refunds</h2>
        <p className="text-sm text-muted-foreground">Nothing has been refunded on this order.</p>
      </section>
    );
  }

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-medium">Refunds</h2>
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr className="border-b">
            <th className="py-2 font-medium">When</th>
            <th className="py-2 font-medium">Amount</th>
            <th className="py-2 font-medium">What it covered</th>
            <th className="py-2 font-medium">State</th>
            <th className="py-2 font-medium">Who</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {refunds.map((r) => (
            <tr key={r.id}>
              <td className="w-44 py-2 align-top tabular-nums text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()}
              </td>
              <td className="w-24 py-2 align-top tabular-nums">{r.amount}</td>
              <td className="py-2 align-top">
                {r.kind !== "item" ? (
                  // ⚠ Neither names a line, by design — which is why the note is required on both.
                  // An `external` one was issued in the provider's dashboard, so its note is the only
                  // thing that can explain it at all.
                  <span>
                    {KIND_WORD[r.kind] ?? r.kind}
                    {r.note ? ` — ${r.note}` : ""}
                  </span>
                ) : (
                  <span>
                    {r.lines.map((l) => `${l.quantity} × ${l.productName}`).join(", ") || "—"}
                  </span>
                )}
              </td>
              <td className="w-56 py-2 align-top">
                {STATE_WORD[r.status] ?? r.status}
                {/* ⚠ The provider's reason, STAFF ONLY. It is what decides whether retrying could
                    ever help, and it is never shown to the customer — "your bank refused it" is
                    something a shopper can do nothing with and reads as an accusation. */}
                {r.failureReason ? (
                  <span className="block text-xs text-muted-foreground">{r.failureReason}</span>
                ) : null}
              </td>
              {/* ⚠ 057 — THE ACTOR'S POOL IS NAMED, NOT JUST THEIR LABEL, AND THIS FIXED A REAL GAP.
                  `actorLabel` is resolved by a LEFT JOIN against `admin.staff`. That answers for a
                  back-office actor and for nobody else — so the moment a SHOP could issue a refund
                  (057 US5), every shop-issued refund would have rendered here as a bare "—":
                  unattributable, with nothing on screen saying anything was missing. The refund
                  table's own comment calls that "the audit gap this table exists to close."
                  Showing the kind means an unresolved label is still attributed to a pool. */}
              <td className="w-40 py-2 align-top text-muted-foreground">
                {actorText(r)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 border-t pt-2 text-sm">
        <dt className="text-muted-foreground">Refunded in total</dt>
        <dd className="tabular-nums">{refundedAmount}</dd>
      </dl>
    </section>
  );
}

/**
 * ⚠ FIVE STATES, SAID PLAINLY. The pairs exist because each answers a different question — has the
 * provider got it (`submitting`/`submitted`), and could retrying ever help (`failed`/`refused`).
 * Collapsing them would leave staff unable to tell a stuck attempt from a dead one.
 */
/** What a refund that names no lines actually was. */
const KIND_WORD: Record<string, string> = {
  goodwill: "Goodwill",
  cancellation: "Order cancelled",
  external: "Issued outside Effy",
};

const STATE_WORD: Record<string, string> = {
  // ⚠ NOT "sending" — that reads as progress, and this state is the absence of an answer. The provider
  // never replied, so nobody can say whether the refund exists. An operator told "sending" waits; one
  // told the truth escalates, which is the only useful thing to do with it.
  submitting: "No answer from the bank — needs checking",
  submitted: "On its way to the customer",
  succeeded: "Refunded",
  failed: "Failed — needs attention",
  refused: "Refused — cannot be retried",
};

/**
 * Who issued a refund, in words.
 *
 * ⚠ `system` HAS NO PERSON AND MUST NOT INVENT ONE — it arrived from the provider unattributed, and
 * a name here would be a false statement in the one record that exists to say who moved money.
 * Everything else names its pool, so a label that failed to resolve still says where to look.
 */
function actorText(r: RefundDTO): string {
  switch (r.actorKind) {
    case "system":
      return "Automatic";
    case "customer":
      return r.actorLabel ?? "The customer";
    case "shop":
      return r.actorLabel ? `${r.actorLabel} (shop)` : "Shop";
    case "back_office":
      return r.actorLabel ?? "Effy staff";
  }
}
