import { expect, test } from "@playwright/test"

/**
 * SC-004 / FR-002 / FR-008 — the storefront's central promise.
 *
 * These assertions cannot be made by a unit test, and they cannot be made by a browser test
 * either. They require fetching the RAW HTTP RESPONSE and looking at the bytes the server
 * actually sent, before any JavaScript has run. That is the only way to know what a crawler —
 * or a link preview bot, or a customer on a flaky connection — actually receives.
 *
 * If these fail, the surface has failed the thing it exists for, no matter how good it looks in
 * a browser.
 */

const PUBLIC_PAGES = ["/", "/browse"] as const

test.describe("public pages are server-rendered (SC-004)", () => {
  for (const path of PUBLIC_PAGES) {
    test(`${path} delivers its content with NO client-side JS executed`, async ({
      request,
    }) => {
      const res = await request.get(path)
      expect(res.status()).toBe(200)

      const html = await res.text()

      // The real content — not an empty shell to be filled in later.
      expect(html).toMatch(/<h1[^>]*>/)
      expect(html).toContain("Effy")

      // If this ever starts failing, someone turned a page into a client component.
      expect(html.length).toBeGreaterThan(1000)
    })

    test(`${path} carries complete, page-specific metadata (SC-005)`, async ({
      request,
    }) => {
      const html = await (await request.get(path)).text()

      expect(html).toMatch(/<title>[^<]+<\/title>/)
      expect(html).toMatch(/<meta name="description" content="[^"]+"/)
      expect(html).toMatch(/<link rel="canonical" href="[^"]+"/)
      expect(html).toMatch(/<meta property="og:/)
    })
  }

  test("home page content is genuinely present, not hydrated in", async ({ request }) => {
    const html = await (await request.get("/")).text()
    expect(html).toContain("Groceries, delivered")
  })

  test("browse page content is genuinely present", async ({ request }) => {
    const html = await (await request.get("/browse")).text()
    expect(html).toContain("Browse the store")
  })

  test("structured data is emitted as JSON-LD", async ({ request }) => {
    const html = await (await request.get("/")).text()
    expect(html).toContain('type="application/ld+json"')
    expect(html).toContain('"@type":"Organization"')
  })
})

test.describe("crawl directives (FR-004)", () => {
  test("robots.txt allows the store and disallows the private paths", async ({
    request,
  }) => {
    const body = await (await request.get("/robots.txt")).text()

    expect(body).toContain("Allow: /")
    for (const path of ["/account", "/checkout", "/sign-in", "/sign-up"]) {
      expect(body).toContain(`Disallow: ${path}`)
    }
    expect(body).toMatch(/Sitemap: https?:\/\/.+\/sitemap\.xml/)
  })

  test("sitemap.xml lists the public pages and nothing private", async ({ request }) => {
    const body = await (await request.get("/sitemap.xml")).text()

    expect(body).toContain("<urlset")
    expect(body).toContain("/browse")

    // Listing a page in the sitemap that robots.txt disallows is a contradiction.
    for (const path of ["/account", "/checkout", "/sign-in"]) {
      expect(body).not.toContain(`${path}<`)
    }
  })
})

/**
 * FR-008 — NO CLOAKING.
 *
 * Serving different CONTENT to crawlers than to shoppers is a Google Search spam-policy
 * violation and grounds for manual action. It is also the tempting "fix" whenever SSR gets
 * hard, which is why it is asserted rather than merely promised.
 *
 * ⚠ What we assert is CONTENT equality, not byte equality — and the distinction is real, not a
 * convenience. Next.js legitimately varies the TRANSPORT by user-agent: it detects HTML-limited
 * bots and INLINES the streamed content and metadata into the initial HTML, while browsers
 * receive the same material through streaming machinery. The bytes therefore differ; the page
 * does not. Per the Next docs, that is a flush-timing optimization, not cloaking — the crawler
 * ends up with strictly MORE of the page up-front, never different content.
 *
 * Asserting byte equality here would fail forever while proving nothing. So we compare what
 * FR-008 actually protects: the title, the description, the canonical, and the visible copy.
 */
test.describe("no cloaking (FR-008)", () => {
  const CONTENT_MARKERS: Record<(typeof PUBLIC_PAGES)[number], string[]> = {
    "/": ["Groceries, delivered.", "Why Effy", "Start browsing", "Sign in"],
    "/browse": ["Browse the store", "guest", "Sign in"],
  }

  for (const path of PUBLIC_PAGES) {
    test(`${path} serves the same CONTENT to Googlebot and to a browser`, async ({
      playwright,
    }) => {
      const base = process.env.E2E_BASE_URL ?? "http://localhost:3000"
      const ctx = (ua: string) =>
        playwright.request.newContext({
          baseURL: base,
          extraHTTPHeaders: { "User-Agent": ua },
        })

      const asBot = await ctx(
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      )
      const asHuman = await ctx(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      )

      const botHtml = await (await asBot.get(path)).text()
      const humanHtml = await (await asHuman.get(path)).text()

      await asBot.dispose()
      await asHuman.dispose()

      // 1. The head that search engines actually read is identical.
      expect(headTag(botHtml, "title")).toBe(headTag(humanHtml, "title"))
      expect(metaContent(botHtml, "description")).toBe(
        metaContent(humanHtml, "description"),
      )
      expect(canonical(botHtml)).toBe(canonical(humanHtml))

      // 2. Every piece of visible copy is present for BOTH. The crawler is not being fed a
      //    different store than the shopper.
      for (const marker of CONTENT_MARKERS[path]) {
        expect(botHtml, `bot is missing: ${marker}`).toContain(marker)
        expect(humanHtml, `human is missing: ${marker}`).toContain(marker)
      }
    })
  }
})

function headTag(html: string, tag: string): string | null {
  return new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(html)?.[1] ?? null
}

function metaContent(html: string, name: string): string | null {
  return (
    new RegExp(`<meta name="${name}" content="([^"]*)"`).exec(html)?.[1] ?? null
  )
}

function canonical(html: string): string | null {
  return /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null
}
