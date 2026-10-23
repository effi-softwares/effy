import { DELIVERY_NOTE_LINE_WORDS, type DeliveryNoteDTO } from "@effy/shared-types"

import { DeliveryNoteSeen } from "./DeliveryNoteSeen"
import { TaxInvoiceBlock } from "./TaxInvoiceBlock"

const DAY = new Intl.DateTimeFormat("en-AU", { dateStyle: "long", timeZone: "Australia/Melbourne" })

/**
 * The order's documents. The delivery note says what was supplied, line by line, once the
 * order has arrived; before that the section says when it will be ready. Digital only: there is no
 * paper note in the bag.
 *
 * No prices and nothing about how the order was filled: the note's lines are merged by the server,
 * and this renders only what it is sent.
 */
export function OrderDocuments({ orderId, note }: { orderId: string; note: DeliveryNoteDTO | null }) {
  return (
    <section id="documents" aria-labelledby="documents-heading" className="scroll-mt-24 rounded-lg border bg-card p-6 shadow-xs">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="documents-heading" className="leading-none font-semibold">
          Documents
        </h2>
        {note ? (
          <a
            href={`/api/orders/${encodeURIComponent(orderId)}/documents/delivery-note`}
            download
            className="text-sm font-medium text-primary underline underline-offset-4"
          >
            Download delivery note (PDF)
          </a>
        ) : null}
      </div>
      {note ? (
        <div className="mt-4 space-y-3">
          <DeliveryNoteSeen />
          <p className="text-sm text-muted-foreground">Delivery note · delivered {DAY.format(new Date(note.deliveredAt))}</p>
          <table className="w-full text-sm" aria-label="Delivery note">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Item</th>
                <th className="py-2 pr-3 text-right font-medium">Ordered</th>
                <th className="py-2 pr-3 text-right font-medium">Supplied</th>
                <th className="py-2 font-medium">
                  <span className="sr-only">Note</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {note.lines.map((l) => (
                <tr key={l.name} className="border-b last:border-0">
                  <td className="py-2 pr-3">{l.name}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.ordered}</td>
                  <td className="py-2 pr-3 text-right tabular-nums">{l.supplied}</td>
                  <td className="py-2 text-right font-medium">{l.status === "supplied" ? "" : DELIVERY_NOTE_LINE_WORDS[l.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">Your delivery note will be here once your order has arrived.</p>
      )}
      {/* The tax invoice, on request. */}
      <div className="mt-6 space-y-2 border-t pt-4">
        <h3 className="text-sm font-semibold">Tax invoice</h3>
        <TaxInvoiceBlock orderId={orderId} />
      </div>
    </section>
  )
}
