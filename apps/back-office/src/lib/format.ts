const TZ = "Australia/Melbourne"

const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" })
const time = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true })
const shortDay = new Intl.DateTimeFormat("en-AU", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" })

const clean = (s: string) => s.replace(/[  ]/g, " ")

export function clockAt(iso: string | Date): string {
  return clean(time.format(new Date(iso))).toLowerCase()
}

export function dayWord(iso: string | Date, now: Date = new Date()): string {
  const d = ymd.format(new Date(iso))
  const dayMs = 86_400_000
  if (d === ymd.format(now)) return "Today"
  if (d === ymd.format(new Date(now.getTime() - dayMs))) return "Yesterday"
  if (d === ymd.format(new Date(now.getTime() + dayMs))) return "Tomorrow"
  return clean(shortDay.format(new Date(iso))).replace(",", "")
}

export function moment(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—"
  return `${dayWord(iso, now)}, ${clockAt(iso)}`
}

export function money(amount: string | number, currency = "AUD"): string {
  const n = Number(amount)
  if (!Number.isFinite(n)) return `${currency} ${amount}`
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, currencyDisplay: "narrowSymbol" }).format(n)
}
