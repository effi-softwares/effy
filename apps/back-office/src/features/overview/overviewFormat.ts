const TZ = "Australia/Melbourne"
export const dateLine = new Intl.DateTimeFormat("en-AU", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: TZ,
})
const hourNow = () =>
  Number(new Intl.DateTimeFormat("en-AU", { hour: "numeric", hourCycle: "h23", timeZone: TZ }).format(new Date()))
export const hhmm = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TZ,
})
const clock12 = new Intl.DateTimeFormat("en-AU", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: TZ,
})
export const money = (amount: string, currency: string) =>
  new Intl.NumberFormat("en-AU", { style: "currency", currency }).format(Number(amount))

export function ampm(time: string): string {
  const [h = 0, m = 0] = time.split(":").map(Number)
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`
}
export const at12 = (iso: string) => clock12.format(new Date(iso)).replace(/[  ]/g, " ").toLowerCase()

export function greeting(): string {
  const h = hourNow()
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening"
}
