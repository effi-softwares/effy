package com.effyshopping.customer.mobile.features.legal.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.LinkAnnotation
import androidx.compose.ui.text.LinkInteractionListener
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextLinkStyles
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withLink
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.effyshopping.mobile.design.EffySpacing

/**
 * A tiny, DEPENDENCY-FREE renderer for the constrained Markdown subset that @effy/legal-content ships.
 *
 * The content is authored once (web + mobile) and generated into `LegalContent.kt`; this renders it
 * natively so the documents work offline, inside the app, with no third-party Markdown library. The
 * subset is exactly the one defined in `packages/legal-content/src/markdown.ts` (Principle II): `#`–
 * `###` headings, paragraphs, `-`/`*` and `1.` lists, pipe tables, and inline `**bold**`, `*italic*`,
 * `[label](href)`. Anything outside the subset is authored out (guarded by `legal:check` + the
 * web-side vitest subset test), so this parser is deliberately small.
 */

// ── Model ────────────────────────────────────────────────────────────────────────────────────────

internal data class Run(val text: String, val bold: Boolean = false, val italic: Boolean = false, val href: String? = null)

internal sealed interface LegalBlock {
    data class Heading(val level: Int, val runs: List<Run>) : LegalBlock
    data class Paragraph(val runs: List<Run>) : LegalBlock
    data class ListBlock(val ordered: Boolean, val items: List<List<Run>>) : LegalBlock
    data class Table(val header: List<List<Run>>, val rows: List<List<List<Run>>>) : LegalBlock
}

// ── Parser (mirror of markdown.ts) ─────────────────────────────────────────────────────────────────

private val HEADING = Regex("^(#{1,3})\\s+(.*)$")
private val UL = Regex("^[-*]\\s+(.*)$")
private val OL = Regex("^\\d+\\.\\s+(.*)$")
private val TABLE_ROW = Regex("^\\|(.+)\\|\\s*$")
private val TABLE_SEP = Regex("^\\|[\\s:|-]+\\|\\s*$")
private val INLINE = Regex("(\\*\\*[^*]+\\*\\*|\\*[^*]+\\*|\\[[^\\]]+\\]\\([^)]+\\))")
private val LINK = Regex("^\\[([^\\]]+)\\]\\(([^)]+)\\)$")

internal fun parseLegalMarkdown(src: String): List<LegalBlock> {
    val lines = src.replace("\r\n", "\n").split("\n")
    val blocks = mutableListOf<LegalBlock>()
    val para = mutableListOf<String>()

    fun flushParagraph() {
        if (para.isEmpty()) return
        blocks += LegalBlock.Paragraph(parseInline(para.joinToString(" ").trim()))
        para.clear()
    }

    var i = 0
    while (i < lines.size) {
        val line = lines[i]
        val trimmed = line.trim()

        if (trimmed.isEmpty()) {
            flushParagraph()
            i++
            continue
        }

        val h = HEADING.find(trimmed)
        if (h != null) {
            flushParagraph()
            blocks += LegalBlock.Heading(h.groupValues[1].length, parseInline(h.groupValues[2].trim()))
            i++
            continue
        }

        // Table: a row line immediately followed by a separator row.
        if (TABLE_ROW.matches(trimmed) && i + 1 < lines.size && TABLE_SEP.matches(lines[i + 1].trim())) {
            flushParagraph()
            val header = splitRow(trimmed)
            val rows = mutableListOf<List<List<Run>>>()
            i += 2
            while (i < lines.size && TABLE_ROW.matches(lines[i].trim())) {
                rows += splitRow(lines[i].trim())
                i++
            }
            blocks += LegalBlock.Table(header, rows)
            continue
        }

        if (UL.matches(trimmed) || OL.matches(trimmed)) {
            flushParagraph()
            val ordered = OL.matches(trimmed)
            val items = mutableListOf<List<Run>>()
            while (i < lines.size) {
                val t = lines[i].trim()
                val m = if (ordered) OL.find(t) else UL.find(t)
                if (m == null) break
                items += parseInline(m.groupValues[1].trim())
                i++
            }
            blocks += LegalBlock.ListBlock(ordered, items)
            continue
        }

        para += trimmed
        i++
    }
    flushParagraph()
    return blocks
}

private fun splitRow(line: String): List<List<Run>> {
    val inner = line.removePrefix("|").trimEnd().removeSuffix("|")
    return inner.split("|").map { parseInline(it.trim()) }
}

internal fun parseInline(text: String): List<Run> {
    val runs = mutableListOf<Run>()
    var last = 0
    for (m in INLINE.findAll(text)) {
        if (m.range.first > last) runs += Run(text.substring(last, m.range.first))
        val tok = m.value
        when {
            tok.startsWith("**") -> runs += Run(tok.substring(2, tok.length - 2), bold = true)
            tok.startsWith("*") -> runs += Run(tok.substring(1, tok.length - 1), italic = true)
            else -> {
                val link = LINK.find(tok)
                if (link != null) runs += Run(link.groupValues[1], href = link.groupValues[2])
                else runs += Run(tok)
            }
        }
        last = m.range.last + 1
    }
    if (last < text.length) runs += Run(text.substring(last))
    return if (runs.isEmpty()) listOf(Run(text)) else runs
}

// ── Renderer ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Renders a document body. `onNavigateSlug` handles internal `/legal/<slug>` links; external `http`
 * links open in the platform browser.
 */
@Composable
internal fun LegalDocumentBody(
    body: String,
    onNavigateSlug: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val uriHandler = LocalUriHandler.current
    val blocks = remember(body) { parseLegalMarkdown(body) }
    val onLink: (String) -> Unit = { href ->
        when {
            href.startsWith("/legal/") -> href.removePrefix("/legal/").takeIf { it.isNotEmpty() }?.let(onNavigateSlug)
            href.startsWith("http") -> uriHandler.openUri(href)
            else -> {}
        }
    }
    Column(modifier) {
        blocks.forEach { block -> LegalBlockView(block, onLink) }
    }
}

/**
 * A single line of inline markdown with clickable document links — for point-of-decision consent
 * text (checkout, sign-up). Internal `/legal/<slug>` links navigate in-app; external open the browser.
 */
@Composable
fun LegalLinksText(
    markdown: String,
    onNavigateSlug: (String) -> Unit,
    modifier: Modifier = Modifier,
    style: TextStyle = MaterialTheme.typography.bodySmall,
    color: Color = MaterialTheme.colorScheme.onSurfaceVariant,
) {
    val uriHandler = LocalUriHandler.current
    val runs = remember(markdown) { parseInline(markdown) }
    val onLink: (String) -> Unit = { href ->
        when {
            href.startsWith("/legal/") -> href.removePrefix("/legal/").takeIf { it.isNotEmpty() }?.let(onNavigateSlug)
            href.startsWith("http") -> uriHandler.openUri(href)
            else -> {}
        }
    }
    Text(inline(runs, onLink), style = style, color = color, modifier = modifier)
}

@Composable
private fun LegalBlockView(block: LegalBlock, onLink: (String) -> Unit) {
    when (block) {
        is LegalBlock.Heading -> {
            val style = when (block.level) {
                1 -> MaterialTheme.typography.titleLarge
                2 -> MaterialTheme.typography.titleMedium
                else -> MaterialTheme.typography.titleSmall
            }
            Text(
                inline(block.runs, onLink),
                style = style,
                modifier = Modifier.padding(top = EffySpacing.lg, bottom = EffySpacing.xs),
            )
        }
        is LegalBlock.Paragraph -> Text(
            inline(block.runs, onLink),
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(bottom = EffySpacing.s),
        )
        is LegalBlock.ListBlock -> Column(modifier = Modifier.padding(bottom = EffySpacing.s)) {
            block.items.forEachIndexed { index, item ->
                Row(modifier = Modifier.padding(vertical = 2.dp)) {
                    Text(
                        if (block.ordered) "${index + 1}. " else "•  ",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    Text(
                        inline(item, onLink),
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
        }
        is LegalBlock.Table -> Column(modifier = Modifier.padding(vertical = EffySpacing.s)) {
            TableRow(block.header, onLink, header = true)
            HorizontalDivider()
            block.rows.forEach { row ->
                TableRow(row, onLink, header = false)
                HorizontalDivider()
            }
        }
    }
}

@Composable
private fun TableRow(cells: List<List<Run>>, onLink: (String) -> Unit, header: Boolean) {
    Row(modifier = Modifier.padding(vertical = EffySpacing.xs)) {
        cells.forEach { cell ->
            Text(
                inline(cell, onLink),
                style = if (header) MaterialTheme.typography.labelMedium else MaterialTheme.typography.bodySmall,
                color = if (header) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.weight(1f).padding(end = EffySpacing.s),
            )
        }
    }
}

private fun inline(runs: List<Run>, onLink: (String) -> Unit): AnnotatedString = buildAnnotatedString {
    val linkStyles = TextLinkStyles(SpanStyle(textDecoration = TextDecoration.Underline, fontWeight = FontWeight.Medium))
    runs.forEach { run ->
        val href = run.href
        when {
            href != null -> withLink(
                LinkAnnotation.Clickable(
                    tag = href,
                    styles = linkStyles,
                    linkInteractionListener = LinkInteractionListener { onLink(href) },
                ),
            ) { append(run.text) }
            run.bold -> withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(run.text) }
            run.italic -> withStyle(SpanStyle(fontStyle = FontStyle.Italic)) { append(run.text) }
            else -> append(run.text)
        }
    }
}
