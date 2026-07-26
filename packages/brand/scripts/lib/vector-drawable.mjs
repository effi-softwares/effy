// VECTOR DRAWABLE — convert a composed SVG to an Android VectorDrawable (024 research R4).
//
// Android gets vectors wherever the platform allows: adaptive-icon layers (API 26+), the themed
// monochrome layer (API 33+) and the splash mark are all resolution-independent and diff-readable.
// Only API 24–25 still needs raster mipmaps, because adaptive icons did not exist yet.
//
// This is a TARGETED converter for the shapes our authored mark actually uses. It is deliberately
// NOT a general SVG engine: anything it does not recognise raises. If the artwork ever gains a
// gradient, a clip path or a nested transform this cannot express, the build FAILS LOUDLY rather
// than silently dropping geometry and shipping a subtly wrong icon.
//
// Two structural differences from SVG it has to bridge:
//   1. A VectorDrawable viewport always starts at 0,0 — there is no viewBox min-x/min-y. The offset
//      becomes an outer <group> translation.
//   2. <group> carries NO presentation attributes. Stroke/fill inherited from an SVG <g> must be
//      resolved down onto every individual <path>.

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

  // Walk tokens in document order, maintaining a stack of inherited attributes + translations.
  const stack = [{ attrs: {}, tx: 0, ty: 0 }]
  const tokenRe = /<(\/?)([a-zA-Z]+)((?:\s+[^>]*?)?)(\/?)>/g
  let m
  while ((m = tokenRe.exec(body)) !== null) {
    const [, closing, name, rawAttrs, selfClose] = m
    if (!SUPPORTED.has(name)) {
      throw new Error(
        `vd: unsupported element <${name}>. This converter handles only the shapes the authored ` +
          `mark uses. Extend it deliberately — do not let unknown geometry pass through silently.`,
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
  // ⚠ The name class MUST admit digits. `[a-zA-Z-]+` silently fails to match x1/y1/x2/y2 on <line>,
  // which produced `M undefined,undefined` pathData — valid XML that Android's PathParser rejects at
  // inflation, so the adaptive icon AND the splash both fell back to system defaults with only a
  // `ShellStartingWindow: Get attribute fail` warning in logcat to show for it.
  const re = /([a-zA-Z_][\w:.-]*)="([^"]*)"/g
  let m
  while ((m = re.exec(raw)) !== null) attrs[m[1]] = m[2]
  return attrs
}

/**
 * Every coordinate that reaches pathData must be a real number.
 *
 * This exists because the bug above was NOT caught by "the converter throws on what it doesn't
 * understand" — it understood <line> perfectly well and then emitted rubbish. A converter that can
 * produce output Android refuses to inflate has to check its own output, not just its input.
 */
function requireNumber(v, what, el) {
  const n = Number(v)
  if (v === undefined || v === "" || !Number.isFinite(n)) {
    throw new Error(
      `vd: <${el}> attribute ${what} is '${v}' — not a finite number. ` +
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
    throw new Error(`vd: unsupported transform '${transform}' — only translate() is handled`)
  }
  return { x: Number(m[1]), y: Number(m[2] ?? 0) }
}

/** SVG colour → Android ARGB. `none` becomes fully transparent. */
function colour(v) {
  if (!v || v === "none") return "#00000000"
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v.toLowerCase()
  throw new Error(`vd: unsupported colour '${v}' — only #rrggbb and none are handled`)
}

const CAP = { butt: "butt", round: "round", square: "square" }
const JOIN = { miter: "miter", round: "round", bevel: "bevel" }

/**
 * @param {string} svg       composed SVG (already colourway-applied)
 * @param {number} sizeDp    android:width/height in dp (108 for adaptive layers, 288 for splash)
 */
export function toVectorDrawable(svg, sizeDp) {
  const { ox, oy, vw, vh, paths } = flatten(svg)

  const lines = []
  lines.push('<?xml version="1.0" encoding="utf-8"?>')
  lines.push("<!-- GENERATED by @effy/brand (024). Do not edit — run `make brand-gen`. -->")
  lines.push('<vector xmlns:android="http://schemas.android.com/apk/res/android"')
  lines.push(`    android:width="${sizeDp}dp"`)
  lines.push(`    android:height="${sizeDp}dp"`)
  lines.push(`    android:viewportWidth="${vw}"`)
  lines.push(`    android:viewportHeight="${vh}">`)

  // Bridge #1: viewBox offset becomes a group translation, since a VectorDrawable viewport is 0,0-based.
  const needsOffset = ox !== 0 || oy !== 0
  const indent = needsOffset ? "        " : "    "
  if (needsOffset) {
    lines.push(`    <group android:translateX="${-ox}" android:translateY="${-oy}">`)
  }

  for (const p of paths) {
    const a = p.attrs
    // Bridge #2: inherited group translation folded into each path.
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

/**
 * Last line of defence: refuse to emit a VectorDrawable Android would reject at inflation.
 *
 * The `undefined,undefined` bug shipped as perfectly well-formed XML that compiled cleanly through
 * aapt2 and packaged into the APK. Nothing failed until a device tried to draw it, and even then the
 * only signal was one warning line in logcat while the launcher quietly used a default icon. XML
 * validity is not the property we need — parseability by Android's PathParser is.
 */
export function assertRenderable(xml) {
  for (const m of xml.matchAll(/android:pathData="([^"]*)"/g)) {
    const d = m[1]
    if (/undefined|NaN|null/.test(d)) {
      throw new Error(`vd: pathData contains a non-numeric token: "${d}"`)
    }
    // Tokenise the way a path parser does. Splitting on separators is NOT good enough: compact SVG
    // syntax glues commands to numbers ("M0,0h108v108h-108z" is valid and is what the solid
    // background layer emits). A sticky scan that must consume the WHOLE string is the honest check.
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

/** A flat single-colour VectorDrawable — the adaptive icon's background layer. */
export function solidVectorDrawable(hex, sizeDp = 108) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    "<!-- GENERATED by @effy/brand (024). Do not edit — run `make brand-gen`. -->\n" +
    '<vector xmlns:android="http://schemas.android.com/apk/res/android"\n' +
    `    android:width="${sizeDp}dp"\n` +
    `    android:height="${sizeDp}dp"\n` +
    '    android:viewportWidth="108"\n' +
    '    android:viewportHeight="108">\n' +
    `    <path android:fillColor="${colour(hex)}" android:pathData="M0,0h108v108h-108z" />\n` +
    "</vector>\n"
  )
}
