import { useQuery } from "@tanstack/react-query";

import { Link } from "@tanstack/react-router";

import { deliveryHealthQuery } from "./queries";

/**
 * The three ways a delivery configuration goes quietly wrong (031 US4).
 *
 * ── ⚠ Why this exists ──────────────────────────────────────────────────────────────────────────
 *
 * Two real defects sat in the live configuration for weeks, each invisible:
 *
 *   • **3001 in Melbourne Metro** — Melbourne's PO-box code, no street addresses. Added through a
 *     field that checked the shape of a postcode and nothing else. Found by a hand-written query.
 *   • **REGIONAL serving Ballarat and Bendigo with nothing offered** — so the storefront answers
 *     "we deliver here" and checkout can quote nothing. Shoppers invited in and stopped at payment.
 *
 * Neither produced an error, a log line or an alert. This panel is what makes the next one visible in
 * a day rather than in weeks.
 *
 * ⚠ A CORRECTLY CONFIGURED SYSTEM SHOWS NOTHING HERE (SC-009). An indicator that is always lit tells
 * an operator nothing, which is exactly how the last two went unnoticed.
 *
 * ⚠ No cards, per the design doctrine — this is a list of problems an operator can act on, not a grid
 * of metric tiles.
 */
export function DeliveryHealthPanel() {
  const { data, isPending, isError } = useQuery(deliveryHealthQuery());

  if (isPending || isError || !data) return null;

  const total =
    data.unknownPlace.length + data.unconfigured.length + data.emptyZones.length;

  // ⚠ Silence is the healthy state, and it must look like nothing rather than like a green badge.
  if (total === 0) return null;

  return (
    <section className="space-y-3" data-testid="delivery-health">
      <h2 className="text-lg font-semibold">
        Configuration problems{" "}
        <span className="text-muted-foreground font-normal">({total})</span>
      </h2>

      {data.unconfigured.length > 0 && (
        <HealthGroup
          testId="health-unconfigured"
          title="Serviceable, but nothing is offered"
          // ⚠ The REGIONAL class, stated in terms of what the shopper experiences rather than in
          // terms of rows — "no active offering" means nothing to the person who has to fix it.
          detail="Shoppers in these areas are told Effy delivers to them, and then cannot complete checkout. Either configure a service level or mark the area not served."
          items={data.unconfigured.map((a) => `${a.postcode} — ${a.zoneCode}`)}
        />
      )}

      {data.unknownPlace.length > 0 && (
        <HealthGroup
          testId="health-unknown-place"
          title="No known place uses this postcode"
          detail="These may be PO-box or non-residential postcodes — nothing can be delivered to them. They may also be new postcodes the locality record has not caught up with."
          items={data.unknownPlace.map((a) => `${a.postcode} — ${a.zoneCode}`)}
        />
      )}

      {data.emptyZones.length > 0 && (
        <HealthGroup
          testId="health-empty-zones"
          title="Zones serving nobody"
          detail="These zones have no areas assigned, so they affect no shopper and price nothing."
          items={data.emptyZones.map((z) => z.zoneCode)}
        />
      )}

      <p className="text-sm text-muted-foreground">
        <Link to="/delivery-zones" className="underline underline-offset-2">
          Review delivery zones
        </Link>
      </p>
    </section>
  );
}

function HealthGroup({
  testId,
  title,
  detail,
  items,
}: {
  testId: string;
  title: string;
  detail: string;
  items: string[];
}) {
  return (
    <div data-testid={testId} className="rounded-md border px-3 py-2">
      <p className="text-sm font-medium">
        {title} <span className="text-muted-foreground">({items.length})</span>
      </p>
      <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-sm font-mono tabular-nums">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
