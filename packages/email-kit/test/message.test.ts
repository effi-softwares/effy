import { readFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { describe, expect, it } from "vitest"

import type { MailIdentity } from "../src/audience.js"
import { render } from "../src/render.js"

const here = dirname(fileURLToPath(import.meta.url))
const fixture = () => JSON.parse(readFileSync(resolve(here, "../src/fixtures/message.json"), "utf8"))

const identity: MailIdentity = {
  sender: "Effy <no-reply@dev.effyshopping.com>",
  replyToPublic: "hello@effyshopping.com",
  replyToInternal: "workspace-admin@effyshopping.com",
  postalAddress: "",
}

describe("message email (115)", () => {
  it("a marketing email says who it is from, why it came, and carries Unsubscribe - in both parts", () => {
    const v = fixture()
    const out = render("message", v, "customer", identity)
    expect(out.subject).toBe(v.title)
    for (const part of [out.html, out.text]) {
      expect(part).toContain(v.paragraphs[0].text)
      expect(part).toContain("From Effy")
      expect(part).toContain("said yes to offers by email")
      expect(part).toContain("/email/unsubscribe?t")
      expect(part).toContain("hello@effyshopping.com")
    }
    expect(out.html).toContain(">Unsubscribe<")
    expect(out.text).toContain(v.unsubscribeUrl)
  })

  it("a service email (important, direct) has no unsubscribe", () => {
    const out = render("message", { ...fixture(), marketing: false, unsubscribeUrl: "" }, "customer", identity)
    for (const part of [out.html, out.text]) {
      expect(part).not.toMatch(/unsubscribe/i)
      expect(part).toContain("about your account")
    }
  })

  it("leaves the picture out when there is none, and escapes the words", () => {
    const out = render("message", { ...fixture(), hasImage: false, paragraphs: [{ text: "<b>bold</b> & more" }] }, "customer", identity)
    expect(out.html).not.toContain("<img src=\"https://media")
    expect(out.html).toContain("&lt;b&gt;bold&lt;/b&gt; &amp; more")
  })
})
