package com.effyshopping.customer.mobile.features.legal

import com.effyshopping.customer.mobile.features.legal.generated.LEGAL_DOCUMENTS
import com.effyshopping.customer.mobile.features.legal.presentation.LegalBlock
import com.effyshopping.customer.mobile.features.legal.presentation.parseInline
import com.effyshopping.customer.mobile.features.legal.presentation.parseLegalMarkdown
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LegalCatalogueTest {

    private val requiredSlugs = listOf(
        "privacy-policy", "terms-of-service", "refunds-returns", "delivery-policy",
        "promotions-terms", "food-safety-allergens", "cookies-tracking", "acceptable-use",
        "eula", "about",
    )

    @Test
    fun everyRequiredDocumentIsPresent() {
        val slugs = LEGAL_DOCUMENTS.map { it.slug }
        for (slug in requiredSlugs) {
            assertTrue(slugs.contains(slug), "Missing legal document: $slug")
        }
        assertEquals(requiredSlugs.size, LEGAL_DOCUMENTS.size, "Unexpected document count")
    }

    @Test
    fun everyDocumentHasRealProseAndParses() {
        for (doc in LEGAL_DOCUMENTS) {
            assertTrue(doc.title.isNotBlank(), "${doc.slug} has no title")
            assertTrue(doc.currentVersion.isNotBlank(), "${doc.slug} has no version")
            assertTrue(doc.effectiveDate.isNotBlank(), "${doc.slug} has no effective date")
            assertTrue(doc.body.length > 200, "${doc.slug} body is too short to be real prose")
            assertTrue(
                !doc.body.lowercase().contains("document is being prepared"),
                "${doc.slug} still holds placeholder text",
            )
            val blocks = parseLegalMarkdown(doc.body)
            assertTrue(blocks.isNotEmpty(), "${doc.slug} parsed to no blocks")
        }
    }

    @Test
    fun termsAndPrivacyAreDistinctDocuments() {
        // Regression: a prior mobile build wired BOTH the Terms and Privacy rows to the Privacy screen.
        val terms = LEGAL_DOCUMENTS.first { it.slug == "terms-of-service" }
        val privacy = LEGAL_DOCUMENTS.first { it.slug == "privacy-policy" }
        assertTrue(terms.body != privacy.body, "Terms and Privacy must be different documents")
        assertTrue(terms.title.contains("Terms"), "Terms document has the wrong title")
    }

    @Test
    fun everyInternalLinkResolvesToAKnownDocument() {
        val slugs = LEGAL_DOCUMENTS.map { it.slug }.toSet()
        val linkPrefix = "/legal/"
        for (doc in LEGAL_DOCUMENTS) {
            val hrefs = collectHrefs(parseLegalMarkdown(doc.body))
            for (href in hrefs) {
                if (href.startsWith(linkPrefix)) {
                    val target = href.removePrefix(linkPrefix)
                    assertTrue(
                        slugs.contains(target),
                        "${doc.slug} links to unknown legal route /legal/$target",
                    )
                }
            }
        }
    }

    @Test
    fun inlineParsesLinksAndEmphasis() {
        val runs = parseInline("see our [Privacy Policy](/legal/privacy-policy) and **note** this")
        assertTrue(runs.any { it.href == "/legal/privacy-policy" }, "link run missing")
        assertTrue(runs.any { it.bold }, "bold run missing")
    }

    private fun collectHrefs(blocks: List<LegalBlock>): List<String> {
        val hrefs = mutableListOf<String>()
        fun addRuns(runs: List<com.effyshopping.customer.mobile.features.legal.presentation.Run>) {
            runs.forEach { it.href?.let(hrefs::add) }
        }
        for (block in blocks) {
            when (block) {
                is LegalBlock.Heading -> addRuns(block.runs)
                is LegalBlock.Paragraph -> addRuns(block.runs)
                is LegalBlock.ListBlock -> block.items.forEach(::addRuns)
                is LegalBlock.Table -> {
                    block.header.forEach(::addRuns)
                    block.rows.forEach { row -> row.forEach(::addRuns) }
                }
            }
        }
        return hrefs
    }
}
