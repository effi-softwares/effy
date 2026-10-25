export const PATTERNS: readonly string[] = [
  "212222",
  "222122",
  "222221",
  "121223",
  "121322",
  "131222",
  "122213",
  "122312",
  "132212",
  "221213",
  "221312",
  "231212",
  "112232",
  "122132",
  "122231",
  "113222",
  "123122",
  "123221",
  "223211",
  "221132",
  "221231",
  "213212",
  "223112",
  "312131",
  "311222",
  "321122",
  "321221",
  "312212",
  "322112",
  "322211",
  "212123",
  "212321",
  "232121",
  "111323",
  "131123",
  "131321",
  "112313",
  "132113",
  "132311",
  "211313",
  "231113",
  "231311",
  "112133",
  "112331",
  "132131",
  "113123",
  "113321",
  "133121",
  "313121",
  "211331",
  "231131",
  "213113",
  "213311",
  "213131",
  "311123",
  "311321",
  "331121",
  "312113",
  "312311",
  "332111",
  "314111",
  "221411",
  "431111",
  "111224",
  "111422",
  "121124",
  "121421",
  "141122",
  "141221",
  "112214",
  "112412",
  "122114",
  "122411",
  "142112",
  "142211",
  "241211",
  "221114",
  "413111",
  "241112",
  "134111",
  "111242",
  "121142",
  "121241",
  "114212",
  "124112",
  "124211",
  "411212",
  "421112",
  "421211",
  "212141",
  "214121",
  "412121",
  "111143",
  "111341",
  "131141",
  "114113",
  "114311",
  "411113",
  "411311",
  "113141",
  "114131",
  "311141",
  "411131",
  "211412",
  "211214",
  "211232",
  "2331112",
]

export const START_B = 104
export const STOP = 106

export function code128BValues(text: string): number[] {
  const values = [START_B]
  for (const ch of text) {
    const code = ch.charCodeAt(0)
    if (code < 32 || code > 126) throw new Error(`Code 128 B cannot encode ${JSON.stringify(ch)}`)
    values.push(code - 32)
  }
  const checksum = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103
  values.push(checksum)
  return values
}

export function code128BWidths(text: string): number[] {
  return [...code128BValues(text), STOP].flatMap((v) => [...PATTERNS[v]!].map(Number))
}

export function code128BSvg(text: string, opts: { moduleMm: number; heightMm: number }): string {
  const widths = code128BWidths(text)
  const quiet = 10
  const total = quiet * 2 + widths.reduce((a, b) => a + b, 0)
  let x = quiet
  const bars: string[] = []
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w}" height="1"/>`)
    x += w
  })
  const widthMm = total * opts.moduleMm
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${widthMm}mm" height="${opts.heightMm}mm" ` +
    `viewBox="0 0 ${total} 1" preserveAspectRatio="none" shape-rendering="crispEdges">` +
    `<rect width="${total}" height="1" fill="#fff"/><g fill="#000">${bars.join("")}</g></svg>`
  )
}
