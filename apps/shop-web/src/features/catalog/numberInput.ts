export function wholeNumber(raw: string): number | null {
  const text = raw.trim()
  if (!/^\d+$/.test(text)) return null
  return Number(text)
}

export function signedNumber(raw: string): number | null {
  const text = raw.trim()
  if (!/^[+-]?\d+$/.test(text)) return null
  const n = Number(text)
  return n === 0 ? null : n
}
