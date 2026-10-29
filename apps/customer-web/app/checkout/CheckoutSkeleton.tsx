import { Bone, Loading } from "@/components/ui/skeletons"

/*
 * Checkout's loading shapes: the page while the shopper and their addresses are read, and step 2 while a
 * quote is being worked out. Steps keep their numbers and the words they always have; what depends on the
 * quote (who delivers, the windows, the fee) is a bone until the quote says.
 */

const card = "rounded-lg border bg-card p-5 shadow-xs sm:p-6"

/** Step 2 before the quote answers — Effy or courier is not known yet, so its title is a bone too. */
export function DeliveryStepSkeleton() {
  return (
    <div className={card}>
      <Loading label="Working out delivery">
        <section>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden="true">2. </span>
            <Bone kind="heading" className="w-40" />
          </h2>
          <Bone className="mt-2 w-64 max-w-full" />
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Bone key={i} kind="control" className="h-14" />
            ))}
          </div>
        </section>
      </Loading>
    </div>
  )
}

/** The whole flow before it can start: the address step, step 2, billing and the summary rail. */
export function CheckoutSkeleton() {
  return (
    <Loading label="Loading checkout">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <section className={card}>
            <h2 className="text-lg font-semibold">
              <span aria-hidden="true">1. </span>
              Delivery address
            </h2>
            <p className="mt-1 mb-4 text-sm text-muted-foreground">Where should we bring your order?</p>
            <div className="grid gap-3 md:grid-cols-2">
              {[0, 1].map((i) => (
                <div key={i} className="flex flex-col gap-2 rounded-md border p-4">
                  <Bone className="w-32" />
                  <Bone kind="small" className="w-48" />
                  <Bone kind="small" className="w-40" />
                </div>
              ))}
            </div>
          </section>
          <DeliveryStepSkeleton />
          <div className={card}>
            <div className="flex items-center justify-between gap-4">
              <span className="text-base leading-snug font-semibold">Billing address same as shipping</span>
              <Bone className="h-6 w-11 rounded-full" />
            </div>
          </div>
        </div>
        <aside className={`min-w-0 ${card}`}>
          <h2 className="font-semibold">Order summary</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {["Items", "Delivery"].map((label) => (
              <div key={label} className="flex items-center justify-between">
                <dt>{label}</dt>
                <dd>
                  <Bone className="w-16" />
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between border-t pt-3">
              <dt className="text-base font-semibold">Total</dt>
              <dd>
                <Bone kind="price" className="w-20" />
              </dd>
            </div>
          </dl>
          <Bone kind="control" className="mt-6 h-12" />
        </aside>
      </div>
    </Loading>
  )
}
