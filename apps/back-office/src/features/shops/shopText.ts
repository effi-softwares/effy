export function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

export function labelScanningText(l: { scanned: number; notScanned: number; sinceDays: number }): string {
  const total = l.scanned + l.notScanned
  if (total === 0) return `No scanning recorded in the last ${l.sinceDays} days`
  const share = Math.round((l.notScanned / total) * 100)
  return `${l.scanned} scanned · ${l.notScanned} not scanned (${share}%) · last ${l.sinceDays} days`
}
