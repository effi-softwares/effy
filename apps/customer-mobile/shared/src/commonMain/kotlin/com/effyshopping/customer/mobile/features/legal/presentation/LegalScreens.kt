package com.effyshopping.customer.mobile.features.legal.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.nav.CustomerNavKey
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyNavRow
import com.effyshopping.customer.mobile.features.legal.generated.LEGAL_DOCUMENTS
import com.effyshopping.mobile.design.EffySpacing

/**
 * Legal & informational documents on mobile.
 *
 * The content is generated from @effy/legal-content (`LegalContent.kt`) — one source of truth shared
 * with the web storefront — and rendered natively by [LegalDocumentBody]. Two screens serve all
 * documents: an index that lists every one (so none can be missed), and a generic document screen
 * that renders any slug (Privacy, Terms, Refunds, Delivery, Promotions, Food safety, Cookies,
 * Acceptable use, eula, Acknowledgements, About).
 */

/** The `/legal` index — lists every document so a person (and a store reviewer) can find them all. */
@Composable
fun LegalIndexScreen(container: AppContainer) {
    val nav = container.navigator
    val documents = LEGAL_DOCUMENTS.sortedBy { it.order }
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Legal", onBack = { nav.pop() })
        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
            LegalSectionHeader("Policies & agreements")
            documents.filter { it.category == "legal" }.forEach { doc ->
                // 087 (Legal board) — each policy says when it last changed.
                EffyNavRow(
                    doc.title,
                    supporting = "Updated ${legalDate(doc.effectiveDate)}",
                    onClick = { nav.push(CustomerNavKey.LegalDocument(doc.slug)) },
                )
            }
            LegalSectionHeader("About")
            val info = documents.filter { it.category == "info" }
            info.forEachIndexed { i, doc ->
                EffyNavRow(
                    doc.title,
                    onClick = { nav.push(CustomerNavKey.LegalDocument(doc.slug)) },
                    divider = i < info.lastIndex, // no trailing divider under the last row
                )
            }
            // No "Delete account" here. Deletion is an action, not a document — it lives in
            // Account → Privacy & data → Delete account (which satisfies Apple 5.1.1(v) / Google).
        }
    }
}

/** Renders any one document by slug, with its version + effective date. */
@Composable
fun LegalDocumentScreen(container: AppContainer, slug: String) {
    val nav = container.navigator
    val doc = LEGAL_DOCUMENTS.firstOrNull { it.slug == slug }
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = doc?.title ?: "Legal", onBack = { nav.pop() })
        if (doc == null) {
            Text(
                "This document is not available.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(EffySpacing.lg),
            )
            return@Column
        }
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
        ) {
            Text(
                "Version ${doc.currentVersion} · Effective ${doc.effectiveDate}",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = EffySpacing.md),
            )
            LegalDocumentBody(
                body = doc.body,
                onNavigateSlug = { nav.push(CustomerNavKey.LegalDocument(it)) },
            )
        }
    }
}

@Composable
private fun LegalSectionHeader(title: String) {
    Text(
        title,
        style = MaterialTheme.typography.titleSmall,
        modifier = Modifier.padding(start = EffySpacing.lg, end = EffySpacing.lg, top = EffySpacing.lg, bottom = EffySpacing.s),
    )
}

/** "2026-08-13" → "13 Aug 2026". Anything not in that shape is shown as given. */
internal fun legalDate(iso: String): String {
    val parts = iso.split("-")
    val month = parts.getOrNull(1)?.toIntOrNull()
    val day = parts.getOrNull(2)?.toIntOrNull()
    if (parts.size != 3 || month == null || day == null || month !in 1..12) return iso
    val names = listOf("Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec")
    return "$day ${names[month - 1]} ${parts[0]}"
}
