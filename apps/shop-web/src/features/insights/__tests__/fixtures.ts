import type { InsightsFigureDTO, InsightsRange, ShopInsightsDTO } from "@effy/shared-types"

export const NOW = "2026-09-14T04:00:00.000Z"

const pct = (value: string, previous: string, amount: string): InsightsFigureDTO => ({ value, previous, change: { kind: "pct", amount } })
const abs = (value: string, previous: string, amount: string): InsightsFigureDTO => ({ value, previous, change: { kind: "abs", amount } })
const none = (value: string): InsightsFigureDTO => ({ value, previous: null, change: { kind: "none", amount: null } })

/** A whole week of figures for one shop: every field the pages read, so a test changes only what it is about. */
export function insightsDto(over: Partial<ShopInsightsDTO> = {}, range: InsightsRange = "7d"): ShopInsightsDTO {
  const days = ["Fri 30", "Sat 31", "Sun 1", "Mon 2", "Tue 3", "Wed 4", "Thu 5"]
  const orders = [27, 39, 33, 25, 26, 28, 18]
  return {
    range,
    timezone: "Australia/Melbourne",
    window: { from: NOW, to: NOW },
    comparison: { basis: "previous_7_days", from: NOW, to: NOW },
    computedAt: NOW,
    currency: "AUD",
    primary: {
      revenue: pct("8443.00", "7518.00", "12"),
      orders: { ...abs("196", "181", "15"), perDay: "28", lastHour: null },
      averageOrderValue: pct("43.08", "41.54", "3.7"),
      itemsPerOrder: pct("6.8", "6.5", "4.6"),
    },
    pace: null,
    weekdays: [980, 1010, 1120, 1170, 1260, 1640, 1390].map((v, i) => ({ weekday: i + 1, revenue: v.toFixed(2) })),
    readyByHour: [
      { hour: 11, seconds: 780, orders: 20 },
      { hour: 12, seconds: 1320, orders: 31 },
      { hour: 13, seconds: 900, orders: 22 },
    ],
    aisles: [
      { categoryId: "c1", name: "Dairy & eggs", revenue: "1942.00", previous: "1830.00" },
      { categoryId: "c2", name: "Bakery", revenue: "1798.00", previous: "1520.00" },
    ],
    orderSizes: [18, 62, 79, 31, 6],
    customers: { effyDriver: 176, courier: 20, returning: 114 },
    concentration: { products: 85, top80: 24 },
    together: [{ a: { productId: "p1", name: "Sourdough loaf" }, b: { productId: "p2", name: "Free-range eggs" }, orders: 21 }],
    runs: [
      { time: "10:30", due: 38, ready: 37 },
      { time: "12:30", due: 61, ready: 52 },
    ],
    pickers: null,
    stock: {
      outOfStock: [{ productId: "p1", variantId: "v1", name: "Sourdough loaf", sold: 64, since: NOW }],
      runningOut: [{ productId: "p9", name: "Hummus 200g", left: 3, perDay: "3.9", daysLeft: "0.8" }],
      soldOut: [{ productId: "p1", variantId: "v1", name: "Sourdough loaf", times: 3, hours: "11.0", stillOut: true, missedRevenue: "160.00" }],
      notSelling: [{ productId: "p7", name: "Tahini 400g", left: 9, value: "72.00" }],
      writtenOff: { expired: { units: 12, value: "46.00" }, damaged: { units: 4, value: "19.00" }, corrections: { units: -6 } },
    },
    secondary: {
      refunds: { ...pct("62.40", "40.00", "56"), orders: 4 },
      cantSupply: { ...abs("11", "8", "3"), units: 14 },
      cancelled: abs("2", "1", "1"),
    },
    series: {
      grain: "day",
      buckets: days.map((label, i) => ({
        start: NOW,
        label,
        partial: i === 6,
        revenue: (orders[i]! * 43).toFixed(2),
        orders: orders[i]!,
        units: orders[i]! * 7,
        previousRevenue: (orders[i]! * 40).toFixed(2),
        previousOrders: orders[i]! - 2,
        previousUnits: (orders[i]! - 2) * 6,
        foundRate: "97.8",
        cantSupplyRate: "1.1",
        averageTimeToReady: 840,
      })),
      revenueTotal: pct("8443.00", "7518.00", "12"),
      ordersTotal: abs("196", "181", "15"),
    },
    topProducts: [
      { productId: "p1", name: "Sourdough loaf", sku: null, thumbnailUrl: null, units: 64, revenue: "544.00", share: 1, shareOfSales: "6.4", previousRank: 1, stockLeft: 0 },
      { productId: "p3", name: "Greek yoghurt 1kg", sku: null, thumbnailUrl: null, units: 41, revenue: "283.00", share: 0.52, shareOfSales: "3.4", previousRank: 6, stockLeft: 6 },
      { productId: "p4", name: "Bananas", sku: null, thumbnailUrl: null, units: 38, revenue: "148.00", share: 0.27, shareOfSales: "1.8", previousRank: 2, stockLeft: null },
    ],
    briefing: {
      mood: "strong",
      comparedWith: "the week before",
      changes: [
        { tone: "up", title: "Saturday was the best day", detail: "$1,671, 20% of this week", page: "sales" },
        { tone: "down", title: "Sourdough loaf sold out 3 times", detail: "About $160 of sales it could have had", page: "stock" },
      ],
    },
    rhythm: {
      weeks: 4,
      cells: [
        { weekday: 6, hour: 11, orders: 27 },
        { weekday: 1, hour: 9, orders: 4 },
      ],
    },
    cantSupplyProducts: [{ productId: "p8", name: "Free-range eggs", units: 9 }],
    quality: {
      foundRate: abs("97.8", "98.6", "-0.8"),
      cantSupplyRate: abs("1.1", "0.7", "0.4"),
      averageTimeToReady: pct("840", "960", "-12"),
      readyBeforeDriver: abs("90.9", "88.0", "2.9"),
      readySpread: [52, 71, 40, 19, 9, 5],
    },
    ...over,
  }
}

export { none }
