// The briefing: how a period went, in words, by fixed rules. The same numbers always give the same sentences, and no
// line appears without enough behind it. Pure, so each rule is tested; the screen only displays the result.
import type { InsightsBriefingDTO, InsightsBucketDTO, InsightsFigureDTO, InsightsRange, InsightsTopProductDTO, ShopInsightsDTO } from "@effy/shared-types";

/** Revenue change, in percent, at which a period stops being steady. */
const STRONG_FROM = 8;
const QUIET_BELOW = -8;
/** Rate moves smaller than this are noise. */
const RATE_MOVE = 0.1;
/** Places a product must climb to be worth a line. */
const CLIMB = 2;
const MAX_LINES = 3;

const WEEKDAY: Record<string, string> = {
  Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday", Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday",
};

const dollars = (n: number, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);

const hourWords = (label: string) => {
  const h = Number(label);
  return `${h % 12 || 12} ${h < 12 ? "am" : "pm"}`;
};

export function moodOf(revenue: InsightsFigureDTO): InsightsBriefingDTO["mood"] {
  if (revenue.change.kind !== "pct" || revenue.change.amount === null) return null;
  const pct = Number(revenue.change.amount);
  if (pct >= STRONG_FROM) return "strong";
  if (pct >= 0) return "steady";
  return pct > QUIET_BELOW ? "slower" : "quiet";
}

function comparedWith(range: InsightsRange, weekday: string): string {
  if (range === "today") return `last ${weekday} at this time`;
  return range === "7d" ? "the week before" : "the 30 days before";
}

const PERIOD: Record<InsightsRange, string> = { today: "the day so far", "7d": "this week", "30d": "these 30 days" };

/** The best bucket, once there is more than one to choose from. */
function bestLine(range: InsightsRange, buckets: readonly InsightsBucketDTO[], currency: string): InsightsBriefingDTO["changes"][number] | null {
  const sold = buckets.filter((b) => Number(b.revenue) > 0);
  if (sold.length < 2) return null;
  const best = sold.reduce((a, b) => (Number(b.revenue) > Number(a.revenue) ? b : a));
  const total = sold.reduce((n, b) => n + Number(b.revenue), 0);
  const share = Math.round((Number(best.revenue) / total) * 100);
  const [weekday] = best.label.split(" ");
  const title =
    range === "today"
      ? `${hourWords(best.label)} was the busiest hour`
      : range === "7d"
        ? `${WEEKDAY[weekday!] ?? best.label} was the best day`
        : `${best.label} was the best day`;
  return { tone: "up", title, detail: `${dollars(Number(best.revenue), currency)}, ${share}% of ${PERIOD[range]}`, page: "sales" };
}

function foundLine(
  found: InsightsFigureDTO | null,
  worst: { name: string; units: number } | undefined,
  units: number,
  against: string,
): InsightsBriefingDTO["changes"][number] | null {
  if (!found || found.change.kind !== "abs" || found.change.amount === null) return null;
  const move = Number(found.change.amount);
  if (Math.abs(move) < RATE_MOVE) return null;
  if (move > 0) return { tone: "up", title: `Found rate rose to ${found.value}%`, detail: `From ${found.previous}% ${against}`, page: "service" };
  return {
    tone: "down",
    title: `Found rate fell to ${found.value}%`,
    detail: worst ? `${worst.name} caused ${worst.units} of the ${units} ${units === 1 ? "unit" : "units"} you could not supply` : `From ${found.previous}% ${against}`,
    page: "service",
  };
}

function productLine(products: readonly InsightsTopProductDTO[]): InsightsBriefingDTO["changes"][number] | null {
  const climbs = products
    .map((p, i) => ({ p, rank: i + 1, up: p.previousRank === null ? 0 : p.previousRank - (i + 1) }))
    .sort((a, b) => b.up - a.up);
  const top = climbs[0];
  if (top && top.up >= CLIMB) {
    return { tone: "up", title: `${top.p.name} is climbing`, detail: `Up ${top.up} places to number ${top.rank} in your best sellers`, page: "products" };
  }
  const first = products[0];
  return first ? { tone: "flat", title: `${first.name} is your best seller`, detail: `${first.units} ${first.units === 1 ? "unit" : "units"} sold`, page: "products" } : null;
}

export function buildBriefing(input: {
  range: InsightsRange;
  /** The weekday today is, on the shop's clock. */
  weekday: string;
  currency: string;
  revenue: InsightsFigureDTO;
  buckets: readonly InsightsBucketDTO[];
  quality: ShopInsightsDTO["quality"];
  topProducts: readonly InsightsTopProductDTO[];
  cantSupplyProducts: readonly { name: string; units: number }[];
}): InsightsBriefingDTO {
  const against = comparedWith(input.range, input.weekday);
  const units = input.cantSupplyProducts.reduce((n, p) => n + p.units, 0);
  const changes = [
    bestLine(input.range, input.buckets, input.currency),
    foundLine(input.quality.foundRate, input.cantSupplyProducts[0], units, against),
    productLine(input.topProducts),
  ].filter((c) => c !== null);
  return { mood: moodOf(input.revenue), comparedWith: against, changes: changes.slice(0, MAX_LINES) };
}
