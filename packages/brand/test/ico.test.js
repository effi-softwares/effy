import { test, describe } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { resolve, dirname } from "node:path"
import { fileURLToPath } from "node:url"

import { buildIco, readIcoDirectory } from "../scripts/lib/ico.mjs"

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "../../..")

const fakePng = (n) => Buffer.alloc(n, 0xab)

describe("ICO container assembly", () => {
  test("header declares type 1 and the entry count", () => {
    const ico = buildIco([16, 32, 48].map((size) => ({ size, png: fakePng(100 + size) })))
    assert.equal(ico.readUInt16LE(0), 0, "reserved must be 0")
    assert.equal(ico.readUInt16LE(2), 1, "type must be 1 (icon)")
    assert.equal(ico.readUInt16LE(4), 3)
  })

  test("directory offsets and lengths address the payloads exactly", () => {
    const sizes = [16, 32, 48]
    const pngs = sizes.map((s) => fakePng(100 + s))
    const ico = buildIco(sizes.map((size, i) => ({ size, png: pngs[i] })))
    const dir = readIcoDirectory(ico)

    assert.equal(dir.length, 3)
    dir.forEach((e, i) => {
      assert.equal(e.width, sizes[i])
      assert.equal(e.height, sizes[i])
      assert.equal(e.bpp, 32)
      assert.equal(e.length, pngs[i].length)
      // The slice at the declared offset must be byte-identical to the payload we put in.
      assert.deepEqual(ico.subarray(e.offset, e.offset + e.length), pngs[i])
    })
  })

  test("first payload begins immediately after the directory", () => {
    const ico = buildIco([{ size: 16, png: fakePng(50) }, { size: 32, png: fakePng(60) }])
    assert.equal(readIcoDirectory(ico)[0].offset, 6 + 2 * 16)
  })

  test("total length is header + directory + payloads, with no slack", () => {
    const pngs = [fakePng(50), fakePng(60), fakePng(70)]
    const ico = buildIco([16, 32, 48].map((size, i) => ({ size, png: pngs[i] })))
    assert.equal(ico.length, 6 + 3 * 16 + pngs.reduce((a, b) => a + b.length, 0))
  })

  test("256 is encoded as 0 — the field is one byte", () => {
    const ico = buildIco([{ size: 256, png: fakePng(10) }])
    assert.equal(ico.readUInt8(6), 0)
    assert.equal(readIcoDirectory(ico)[0].width, 256)
  })

  test("rejects an empty set and out-of-range sizes", () => {
    assert.throws(() => buildIco([]), /no entries/)
    assert.throws(() => buildIco([{ size: 512, png: fakePng(1) }]), /out of range/)
  })
})

describe("the generated favicons", () => {
  // Three surfaces, three colourways — each must be a well-formed multi-size ICO.
  for (const p of [
    "apps/customer-web/app/favicon.ico",
    "apps/shop-web/public/favicon.ico",
    "apps/back-office/public/favicon.ico",
  ]) {
    test(`${p} is a valid 16/32/48 ICO carrying PNG payloads`, () => {
      const dir = readIcoDirectory(readFileSync(resolve(REPO, p)))
      assert.deepEqual(
        dir.map((e) => e.width),
        [16, 32, 48],
      )
      const buf = readFileSync(resolve(REPO, p))
      for (const e of dir) {
        // PNG magic at each declared offset.
        assert.equal(buf.readUInt32BE(e.offset), 0x89504e47, "payload is not a PNG")
      }
    })
  }
})
