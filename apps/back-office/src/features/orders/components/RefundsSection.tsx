import { useState } from "react"

import type { AdminOrderDetailDTO, ProposedRefundDTO, RefundDTO } from "@effy/shared-types"
import { Button, Input, Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@effy/design-system/ui"

import { refundActionError } from "../refundErrorText"
import { useDeclineRefundRequest, useDismissProposal } from "../refundQueries"
import { RefundPanel } from "./RefundPanel"

export function RefundsSection({ order, canIssue }: { order: AdminOrderDetailDTO; canIssue: boolean }) {
  return (
    <div className="space-y-4">
      {order.refundRequest && order.refundRequest.status === "open" ? (
        <OpenRequest orderId={order.id} request={order.refundRequest} canAct={canIssue} />
      ) : null}

      {order.proposedRefunds.length > 0 ? (
        <ProposedRefunds orderId={order.id} proposals={order.proposedRefunds} canAct={canIssue} />
      ) : null}

      {canIssue ? (
        <RefundPanel orderId={order.id} lines={order.refundableLines} refundableAmount={order.refundableAmount} />
      ) : null}

      <RefundHistory refunds={order.refunds} refundedAmount={order.refundedAmount} />
    </div>
  )
}

function OpenRequest({
  orderId,
  request,
  canAct,
}: {
  orderId: string
  request: NonNullable<AdminOrderDetailDTO["refundRequest"]>
  canAct: boolean
}) {
  const decline = useDeclineRefundRequest(orderId)
  const [declining, setDeclining] = useState(false)
  const [note, setNote] = useState("")

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="font-medium">The customer has asked for a refund</h3>
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

      {canAct ? (
        declining ? (
          <div className="space-y-2 border-t pt-3">
            <label htmlFor="decline-note" className="text-sm font-medium">
              Why are you declining this?
            </label>
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
                  decline.mutate({ requestId: request.id, note: note.trim() }, { onSuccess: () => setDeclining(false) })
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
  )
}

function ProposedRefunds({
  orderId,
  proposals,
  canAct,
}: {
  orderId: string
  proposals: readonly ProposedRefundDTO[]
  canAct: boolean
}) {
  const dismiss = useDismissProposal(orderId)
  const [dismissing, setDismissing] = useState<string | null>(null)
  const [reason, setReason] = useState("")

  return (
    <section className="space-y-3 rounded-lg border border-border p-4">
      <h3 className="font-medium">Owed but not refunded</h3>
      <p className="text-sm text-muted-foreground">
        The shop recorded these as not supplied. The customer paid for them.
      </p>
      <Table className="w-full text-sm">
        <TableBody className="divide-y">
          {proposals.map((p) => (
            <TableRow key={p.orderItemId}>
              <TableCell className="py-2">{p.productName}</TableCell>
              <TableCell className="w-20 py-2 tabular-nums text-muted-foreground">{p.quantity} short</TableCell>
              <TableCell className="w-24 py-2 tabular-nums">{p.amount}</TableCell>
              <TableCell className="w-32 py-2 text-right">
                {canAct ? (
                  dismissing === p.orderItemId ? null : (
                    <Button variant="ghost" size="sm" onClick={() => setDismissing(p.orderItemId)}>
                      Not owed
                    </Button>
                  )
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
                      setDismissing(null)
                      setReason("")
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
  )
}

function RefundHistory({ refunds, refundedAmount }: { refunds: readonly RefundDTO[]; refundedAmount: string }) {
  if (refunds.length === 0) {
    return (
      <section className="space-y-1">
        <h3 className="font-medium">Refunds issued</h3>
        <p className="text-sm text-muted-foreground">Nothing has been refunded on this order.</p>
      </section>
    )
  }

  return (
    <section className="space-y-3">
      <h3 className="font-medium">Refunds issued</h3>
      <Table className="rounded-lg border border-border [&_td]:py-2">
        <TableHeader className="text-left text-muted-foreground">
          <TableRow className="border-b">
            <TableHead className="py-2 font-medium">When</TableHead>
            <TableHead className="py-2 font-medium">Amount</TableHead>
            <TableHead className="py-2 font-medium">What it covered</TableHead>
            <TableHead className="py-2 font-medium">State</TableHead>
            <TableHead className="py-2 font-medium">Who</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="divide-y">
          {refunds.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="w-44 py-2 align-top tabular-nums text-muted-foreground">
                {new Date(r.createdAt).toLocaleString()}
              </TableCell>
              <TableCell className="w-24 py-2 align-top tabular-nums">
                {r.amount}
                {r.pointsReturned ? (
                  <span className="block text-xs text-muted-foreground">
                    {r.cardAmount} to card · {r.pointsReturned.toLocaleString("en-AU")} points
                  </span>
                ) : null}
              </TableCell>
              <TableCell className="py-2 align-top">
                {r.kind !== "item" ? (
                  <span>
                    {KIND_WORD[r.kind] ?? r.kind}
                    {r.note ? ` — ${r.note}` : ""}
                  </span>
                ) : (
                  <span>{r.lines.map((l) => `${l.quantity} × ${l.productName}`).join(", ") || "—"}</span>
                )}
              </TableCell>
              <TableCell className="w-56 py-2 align-top">
                {STATE_WORD[r.status] ?? r.status}
                {r.failureReason ? (
                  <span className="block text-xs text-muted-foreground">{r.failureReason}</span>
                ) : null}
              </TableCell>
              <TableCell className="w-40 py-2 align-top text-muted-foreground">{actorText(r)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <dl className="grid grid-cols-[10rem_1fr] gap-x-4 border-t pt-2 text-sm">
        <dt className="text-muted-foreground">Refunded in total</dt>
        <dd className="tabular-nums">{refundedAmount}</dd>
      </dl>
    </section>
  )
}

const KIND_WORD: Record<string, string> = {
  goodwill: "Goodwill",
  cancellation: "Order cancelled",
  external: "Issued outside Effy",
}

const STATE_WORD: Record<string, string> = {
  submitting: "No answer from the bank — needs checking",
  submitted: "On its way to the customer",
  succeeded: "Refunded",
  failed: "Failed — needs attention",
  refused: "Refused — cannot be retried",
}

function actorText(r: RefundDTO): string {
  switch (r.actorKind) {
    case "system":
      return "Automatic"
    case "customer":
      return r.actorLabel ?? "The customer"
    case "shop":
      return r.actorLabel ? `${r.actorLabel} (shop)` : "Shop"
    case "back_office":
      return r.actorLabel ?? "Effy staff"
  }
}
