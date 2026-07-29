package com.effyshopping.customer.mobile.features.help.presentation

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.core.presentation.EffyNavRow
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_arrow_back
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/**
 * The help area (026 US4 / T070) — the source design's FAQs, Help Center and Customer Service screens.
 *
 * ⚠ THE CONTENT IS STATIC, AND THAT IS THE SHIPPED ANSWER, not a placeholder. The platform has no CMS
 * and does not need one for a dozen answers; unlike Notifications, nothing here pretends a capability
 * exists. What IS deliberately absent is anything the platform cannot honour — there is no live-chat
 * entry point, because there is no live chat behind it.
 *
 * ⚠ Every answer below is written to be true of Effy AS BUILT. The source kit's own FAQ copy talks
 * about e-wallets and card linking, neither of which this platform has; copying it would have put
 * confident answers about features that do not exist in front of customers.
 */
private data class Faq(val question: String, val answer: String)

private val FAQS = listOf(
    Faq(
        "Do I need an account to browse?",
        "No. You can browse the whole store and build a cart as a guest. We only ask who you are " +
            "when you place an order, so we know where to deliver it.",
    ),
    Faq(
        "How do I know if you deliver to me?",
        "Set your delivery location from the storefront and we'll tell you straight away — before " +
            "you add anything to your cart.",
    ),
    Faq(
        "Why did my order arrive in more than one delivery?",
        "Larger orders are sometimes prepared in more than one package. You'll see the split before " +
            "you pay, and each package is tracked separately.",
    ),
    Faq(
        "How do I change or cancel an order?",
        "Contact us as soon as you can. Once an order has been picked and packed we may not be able " +
            "to change it.",
    ),
    Faq(
        "How are refunds handled?",
        "Refunds go back to the card you paid with. Card payments are handled by our payment " +
            "provider — we never see or store your card details.",
    ),
)

/**
 * A pushed help screen: fixed app bar, scrolling body.
 *
 * ⚠ All three of these used to open a large left-aligned heading and nothing else — no app bar, so no
 * back arrow, and the tab bar hides below a tab root, which left the shopper with no way out but the
 * system gesture. The title belongs in the bar, and the bar must NOT scroll away with the content.
 */
@Composable
private fun HelpScaffold(title: String, content: @Composable ColumnScope.() -> Unit) {
    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = title)
        Column(
            modifier = Modifier.fillMaxWidth().weight(1f).verticalScroll(rememberScrollState()),
            content = content,
        )
    }
}

/** FAQs — an accordion list, the source's pattern. */
@Composable
fun FaqsScreen() = HelpScaffold("FAQs") {
    FAQS.forEach { faq ->
        FaqRow(faq)
        EffyHairline()
    }
}

@Composable
private fun FaqRow(faq: Faq) {
    var open by remember { mutableStateOf(false) }
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { open = !open }
            .padding(EffySpacing.lg),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = EffyMinTouchTarget),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Text(faq.question, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
            // The chevron ROTATES to show state — so "expanded" is conveyed by orientation and by the
            // answer's presence, never by colour (FR-040).
            //
            // ⚠ The arrow asset points LEFT at 0°, and rotation is clockwise, so DOWN is 270° and UP
            // is 90°. It used to be 180°/270° — collapsed pointed RIGHT, which is the "opens another
            // screen" arrow this very file uses for the Help Centre rows, and expanded pointed DOWN,
            // which is the universal "tap to expand". Both states said the opposite of the truth.
            Icon(
                painterResource(Res.drawable.ic_arrow_back),
                contentDescription = null,
                modifier = Modifier.size(20.dp).rotate(if (open) 90f else 270f),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(open) {
            Text(
                faq.answer,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = EffySpacing.s),
            )
        }
    }
}

/** Help Center — topic rows, the source's pattern. */
@Composable
fun HelpCenterScreen(onTopic: (String) -> Unit = {}) = HelpScaffold("Help Center") {
    listOf(
        "Orders and delivery",
        "Payments and refunds",
        "Your account",
        "Privacy and data",
    ).forEach { topic -> EffyNavRow(topic, onClick = { onTopic(topic) }) }
}

/**
 * Customer Service — how to reach a person.
 *
 * ⚠ The source offers live chat, WhatsApp and a phone line. Only what Effy can actually answer is
 * offered here: email. Listing a channel nobody is on is worse than listing none.
 */
@Composable
fun CustomerServiceScreen(onEmail: () -> Unit = {}) = HelpScaffold("Customer Service") {
    Text(
        "We'll get back to you as quickly as we can.",
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
    )
    EffyNavRow(
        "Email us",
        supporting = "support@effyshopping.com",
        onClick = onEmail,
    )
}
