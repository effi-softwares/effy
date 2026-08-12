# Contract: `@effy/legal-content` shared module + drift guard

The interface the shared content package exposes, and the guarantees the generator/guard enforce. This
is the Principle-II single source of truth consumed by web (directly) and mobile (via generated code).

## Exposed shape (consumed by customer-web)

```
manifest: LegalDocument[]            // slug, title, currentVersion, effectiveDate, category, order
getDocument(slug): {                 // throws on unknown slug
  title, slug, version, effectiveDate, status, bodyMarkdown
}
getVersions(slug): DocumentVersion[] // current + superseded, newest first
identifiers: RealWorldIdentifiers    // tokens; unresolved placeholders are legal, but fail legal:check
```

- Markdown is a **constrained subset**: headings (`#`–`###`), paragraphs, `**bold**`/`*italic*`,
  ordered/unordered lists, links, and pipe tables (refund matrix only). Anything outside the subset is
  a content error the renderer tests reject — both renderers (web R2, mobile R3) support exactly this
  subset so a document cannot render on one surface and break on the other.
- No runtime/network access. Pure data compiled at build time.

## Generator: `legal:gen`

- Reads the canonical corpus + `manifest.ts` and emits **committed** Kotlin content for
  `apps/customer-mobile` (the mobile document catalogue), analogous to `tokens:gen`/`brand-gen`.
- Deterministic: same input → byte-identical output (a re-run in CI proves no drift).

## Guard: `legal:check` (rides `pnpm test` / the repo gate)

MUST fail, and name what is wrong, when any of:
1. **Drift** — the committed mobile content differs from a fresh `legal:gen` (web ↔ mobile parity, FR-013).
2. **Unresolved identifier** — any `[UPPER_SNAKE]` placeholder remains in generated web or mobile output
   (constitution "fail loudly", FR-009).
3. **Manifest integrity** — a `manifest` slug with no document dir/current file, or a document not in the
   manifest.
4. **Subset violation** — `body` uses Markdown outside the supported subset.
5. **Broken internal link** — a document links to a `/legal/*` slug or route that does not exist.

Proven the way it will break (the platform's guard doctrine): the guard is demonstrated by (a) editing
one generated mobile line → drift fails; (b) leaving one placeholder → identifier check fails; (c)
removing a manifest entry → integrity fails.

## Link-integrity contract (consumed by the web + mobile tests)

Each `LegalDocument.linkedFrom` names the entry points that MUST resolve to it. The tests assert:

| Entry point | Surface | Links (slugs) |
|---|---|---|
| Footer "Legal & company" column | web | all `legal` + `about` + `delete-account` + `/legal` index |
| Sign-up consent line | web + mobile | `terms-of-service`, `privacy-policy` |
| Checkout (place-order) | web + mobile | `terms-of-service`, `refunds-returns` |
| Newsletter sign-up | web | `privacy-policy` |
| Account → Privacy & data | web + mobile | `privacy-policy`, `terms-of-service`, `refunds-returns`, `acknowledgements`, delete-account |
| Mobile About screen | mobile | `about`, `acknowledgements`, `privacy-policy`, `terms-of-service` |
| `/delete-account` | web | `privacy-policy` |
| `/legal` index | web | all documents |

⚠ The mobile **Terms→Privacy** mis-wire (spec FR-022) is covered by a regression test asserting the
Terms row opens the Terms document, not the Privacy screen.
