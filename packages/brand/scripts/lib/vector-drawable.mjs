// Converts a composed SVG to an Android VectorDrawable (adaptive layers, themed layer, splash). A
// targeted converter for the shapes the mark uses: anything else raises. It bridges two differences:
// the viewport starts at 0,0 (the viewBox offset becomes a group translation), and <group> carries no
// presentation attributes (inherited fill and stroke are resolved onto each path).

const SUPPORTED = new Set(["path", "line", "rect", "g"])

/** Parse the composed SVG into a flat list of paths with fully-resolved presentation attributes. */
function flatten(svg) {
  const openTag = svg.match(/<svg[^>]*>/)
  if (!openTag) throw new Error("vd: no <svg> element")
  const viewBox = openTag[0].match(/viewBox="([-\d.\s]+)"/)
  if (!viewBox) throw new Error("vd: <svg> has no viewBox")
  const [ox, oy, vw, vh] = viewBox[1].trim().split(/\s+/).map(Number)

  const body = svg.slice(svg.indexOf(">") + 1, svg.lastIndexOf("</svg>"))
  const out = []

  // Document order, with a stack of inherited attributes and translations.
  const stack = [{ attrs: {}, tx: 0, ty: 0 }]
  const tokenRe = /<(\/?)([a-zA-Z]+)((?:\s+[^>]*?)?)(\/?)>/g
  let m
  while ((m = tokenRe.exec(body)) !== null) {
    const [, closing, name, rawAttrs, selfClose] = m
    if (!SUPPORTED.has(name)) {
      throw new Error(
        `vd: unsupported element <${name}>. This converter handles only the shapes the authored ` +
        `mark uses. Extend it deliberately - do not let unknown geometry pass through silently.`,
      )
    }
    if (closing) {
      if (name === "g") stack.pop()
      continue
    }
    const attrs = parseAttrs(rawAttrs)

    if (name === "g") {
      const parent = stack[stack.length - 1]
      const t = parseTranslate(attrs.transform)
      stack.push({
        attrs: { ...parent.attrs, ...presentation(attrs) },
        tx: parent.tx + t.x,
        ty: parent.ty + t.y,
      })
      if (selfClose) stack.pop()
      continue
    }

    const ctx = stack[stack.length - 1]
    const resolved = { ...ctx.attrs, ...presentation(attrs) }
    let d
    if (name === "path") {
      d = attrs.d
      if (!d) throw new Error("vd: <path> without d")
    } else if (name === "line") {
      const x1 = requireNumber(attrs.x1, "x1", "line")
      const y1 = requireNumber(attrs.y1, "y1", "line")
      const x2 = requireNumber(attrs.x2, "x2", "line")
      const y2 = requireNumber(attrs.y2, "y2", "line")
      d = `M ${x1},${y1} L ${x2},${y2}`
    } else if (name === "rect") {
      const x = requireNumber(attrs.x, "x", "rect")
      const y = requireNumber(attrs.y, "y", "rect")
      const w = requireNumber(attrs.width, "width", "rect")
      const h = requireNumber(attrs.height, "height", "rect")
      d = `M ${x},${y} L ${x + w},${y} L ${x + w},${y + h} L ${x},${y + h} Z`
    }
    out.push({ d, attrs: resolved, tx: ctx.tx, ty: ctx.ty })
  }

  return { ox, oy, vw, vh, paths: out }
}

function parseAttrs(raw) {
  const attrs = {}
  // The name class must admit digits, or x1/y1/x2/y2 on <line> emit `undefined` pathData that Android rejects at inflation.
  const re = /([a-zA-Z_][\w:.-]*)="([^"]*)"/g
  let m
  while ((m = re.exec(raw)) !== null) attrs[m[1]] = m[2]
  return attrs
}

/** Every coordinate that reaches pathData must be a real number: the converter checks its own output. */
function requireNumber(v, what, el) {
  const n = Number(v)
  if (v === undefined || v === "" || !Number.isFinite(n)) {
    throw new Error(
      `vd: <${el}> attribute ${what} is '${v}' - not a finite number. ` +
      `Emitting this would produce pathData Android cannot inflate, and the failure would surface ` +
      `only as a silently-defaulted icon on device.`,
    )
  }
  return n
}

const PRESENTATION = ["fill", "stroke", "stroke-width", "stroke-linecap", "stroke-linejoin"]
function presentation(attrs) {
  const out = {}
  for (const k of PRESENTATION) if (attrs[k] !== undefined) out[k] = attrs[k]
  return out
}

function parseTranslate(transform) {
  if (!transform) return { x: 0, y: 0 }
  const m = transform.match(/translate\(\s*(-?[\d.]+)\s*,?\s*(-?[\d.]+)?\s*\)/)
  if (!m) {
    throw new Error(`vd: unsupported transform '${transform}' - only translate() is handled`)
  }
  return { x: Number(m[1]), y: Number(m[2] ?? 0) }
}

/** SVG colour → Android argb. `none` becomes fully transparent. */
function colour(v) {
  if (!v || v === "none") return "#00000000"
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  throw new Error(`vd: unsupported colour '${v}' - only #rrggbb and none are handled`)
}

const CAP = { butt: "butt", round: "round", square: "square" }
const JOIN = { miter: "miter", round: "round", bevel: "bevel" }

/**
 * @param {string} svg composed SVG (already colourway-applied)
 * @param {number} sizeDp android:width/height in dp (108 for adaptive layers, 288 for splash)
 */
export function toVectorDrawable(svg, sizeDp) {
  const { ox, oy, vw, vh, paths } = flatten(svg)

  const lines = []
  lines.push('<?xml version="1.0" encoding="utf-8"?>')
  lines.push("<!-- GENERATED by @effy/brand (024). Do not edit - run `make brand-gen`. -->")
  lines.push('<vector xmlns:android="http://schemas.android.com/apk/res/android"')
  lines.push(`    android:width="${sizeDp}dp"`)
  lines.push(`    android:height="${sizeDp}dp"`)
  lines.push(`    android:viewportWidth="${vw}"`)
  lines.push(`    android:viewportHeight="${vh}">`)

  // The viewBox offset becomes a group translation.
  const needsOffset = ox !== 0 || oy !== 0
  const indent = needsOffset ? "        " : "    "
  if (needsOffset) {
    lines.push(`    <group android:translateX="${-ox}" android:translateY="${-oy}">`)
  }

  for (const p of paths) {
    const a = p.attrs
    // Inherited group translation folded into each path.
    const inner = p.tx !== 0 || p.ty !== 0
    const pad = inner ? indent + "    " : indent
    if (inner) {
      lines.push(`${indent}<group android:translateX="${p.tx}" android:translateY="${p.ty}">`)
    }
    lines.push(`${pad}<path`)
    lines.push(`${pad}    android:pathData="${p.d.replace(/\s+/g, " ").trim()}"`)
    lines.push(`${pad}    android:fillColor="${colour(a.fill)}"`)
    if (a.stroke && a.stroke !== "none") {
      lines.push(`${pad}    android:strokeColor="${colour(a.stroke)}"`)
      lines.push(`${pad}    android:strokeWidth="${a["stroke-width"] ?? 1}"`)
      if (a["stroke-linecap"]) {
        lines.push(`${pad}    android:strokeLineCap="${CAP[a["stroke-linecap"]] ?? "butt"}"`)
      }
      if (a["stroke-linejoin"]) {
        lines.push(`${pad}    android:strokeLineJoin="${JOIN[a["stroke-linejoin"]] ?? "miter"}"`)
      }
    }
    lines[lines.length - 1] += " />"
    if (inner) lines.push(`${indent}</group>`)
  }

  if (needsOffset) lines.push("    </group>")
  lines.push("</vector>")
  const xml = lines.join("\n") + "\n"
  assertRenderable(xml)
  return xml
}

/** Refuses to emit a VectorDrawable Android's PathParser would reject: valid XML is not enough. */
export function assertRenderable(xml) {
  for (const m of xml.matchAll(/android:pathData="([^"]*)"/g)) {
    const d = m[1]
    if (/undefined|NaN|null/.test(d)) {
      throw new Error(`vd: pathData contains a non-numeric token: "${d}"`)
    }
    // A sticky scan that must consume the whole string: compact syntax like "M0,0h108v108h-108z" glues commands to numbers.
    const token = /([MmLlHhVvCcSsQqTtAaZz])|(-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?)|([\s,]+)/y
    let i = 0
    while (i < d.length) {
      token.lastIndex = i
      const t = token.exec(d)
      if (!t) {
        throw new Error(`vd: pathData is unparseable at offset ${i} ("${d.slice(i, i + 12)}…") in "${d}"`)
      }
      i = token.lastIndex
    }
  }
  for (const m of xml.matchAll(/android:(translateX|translateY|strokeWidth)="([^"]*)"/g)) {
    if (!Number.isFinite(Number(m[2]))) {
      throw new Error(`vd: android:${m[1]}="${m[2]}" is not a number`)
    }
  }
}

/** A flat single-colour VectorDrawable - the adaptive icon's background layer. */
export function solidVectorDrawable(hex, sizeDp = 108) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    "<!-- GENERATED by @effy/brand (024). Do not edit - run `make brand-gen`. -->\n" +
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n' +
    `    android:width="${sizeDp}dp"\n` +
    `    android:height="${sizeDp}dp"\n` +
    '    android:viewportWidth="108"\n' +
    '    android:viewportHeight="108">\n' +
    `    <path android:fillColor="${colour(hex)}" android:pathData="M0,0h108v108h-108z" />\n` +
    "</vector>\n"
  )
}
