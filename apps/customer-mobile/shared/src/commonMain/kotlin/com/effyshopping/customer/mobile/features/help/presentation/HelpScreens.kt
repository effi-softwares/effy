package com.effyshopping.customer.mobile.features.help.presentation

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.animation.core.tween
import androidx.compose.animation.core.animateFloatAsState
import com.effyshopping.customer.mobile.resources.lucide_mail
import com.effyshopping.customer.mobile.resources.lucide_lock
import com.effyshopping.customer.mobile.resources.lucide_user_round
import com.effyshopping.customer.mobile.resources.lucide_credit_card
import com.effyshopping.customer.mobile.resources.lucide_truck
import com.effyshopping.customer.mobile.resources.lucide_chevron_down
import com.effyshopping.customer.mobile.core.presentation.effyDuration
import com.effyshopping.customer.mobile.core.presentation.EffyStorefrontMotion
import com.effyshopping.customer.mobile.core.presentation.EffySize
import com.effyshopping.customer.mobile.core.presentation.EffyRowIcon
import com.effyshopping.customer.mobile.core.presentation.EffyGroupDivider
import com.effyshopping.customer.mobile.core.presentation.EffyGroup
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
    // 087 — rewritten to the delivery model as built (083/085). The old answers told shoppers to set a
    // location "from the storefront" (there is no such control in the app) and that an order could be
    // split into packages shown before paying — which revealed how many suppliers fill an order, the
    // one thing the hidden-fulfilment rule forbids.
    Faq(
        "How do I know if you deliver to me?",
        "Add your address at checkout and we'll tell you straight away who delivers it: Effy's own " +
            "drivers in a window you choose, or a courier with an estimated arrival.",
    ),
    Faq(
        "When will my order arrive?",
        "If Effy delivers to you, you choose a day — today or one of the next few — and, if you like, " +
            "a time window. Courier orders show an estimate before you pay.",
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

/** FAQs — an accordion list in a group (Help board). */
@Composable
fun FaqsScreen() = HelpScaffold("FAQs") {
    EffyGroup(modifier = Modifier.padding(EffySpacing.lg)) {
        FAQS.forEachIndexed { i, faq ->
            FaqRow(faq)
            if (i < FAQS.lastIndex) EffyGroupDivider()
        }
    }
}

@Composable
private fun FaqRow(faq: Faq) {
    var open by remember { mutableStateOf(false) }
    // 087 — the chevron ROTATES (it snapped) — state by orientation and by the answer's presence.
    val rotation by animateFloatAsState(if (open) 180f else 0f, tween(effyDuration(EffyStorefrontMotion.StandardMillis)), label = "faqChevron")
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(role = Role.Button, onClickLabel = if (open) "Hide answer" else "Show answer") { open = !open }
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
    ) {
        Row(
            modifier = Modifier.fillMaxWidth().heightIn(min = EffySize.target),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        ) {
            Text(faq.question, style = MaterialTheme.typography.bodyLarge.copy(fontWeight = FontWeight.Medium), modifier = Modifier.weight(1f))
            Icon(
                painterResource(Res.drawable.lucide_chevron_down),
                contentDescription = null,
                modifier = Modifier.size(20.dp).rotate(rotation),
                tint = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        AnimatedVisibility(open) {
            Text(
                faq.answer,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = EffySpacing.md),
            )
        }
    }
}

/**
 * Help centre — topic rows (Help board). 087: each topic opens the answers; they did nothing.
 */
@Composable
fun HelpCenterScreen(onTopic: (String) -> Unit = {}) = HelpScaffold("Help centre") {
    val topics = listOf(
        "Orders and delivery" to Res.drawable.lucide_truck,
        "Payments and refunds" to Res.drawable.lucide_credit_card,
        "Your account" to Res.drawable.lucide_user_round,
        "Privacy and data" to Res.drawable.lucide_lock,
    )
    EffyGroup(modifier = Modifier.padding(EffySpacing.lg)) {
        topics.forEachIndexed { i, (topic, icon) ->
            EffyNavRow(topic, leading = { EffyRowIcon(icon) }, onClick = { onTopic(topic) }, divider = false)
            if (i < topics.lastIndex) EffyGroupDivider()
        }
    }
}

/**
 * Contact us — how to reach a person. Only what Effy can answer is offered: email.
 *
 * ⚠ 087 FR-030: the ONE customer-facing address is hello@effyshopping.com (CLAUDE.md, approved
 * mailboxes). This screen showed a "support" address Effy does not have, and its
 * "Email us" row did nothing. It now opens the mail app.
 */
@Composable
fun CustomerServiceScreen() = HelpScaffold("Contact us") {
    val uri = LocalUriHandler.current
    Column(modifier = Modifier.padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
        Text(
            "We'll get back to you as quickly as we can.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        EffyGroup {
            EffyNavRow(
                "Email us",
                leading = { EffyRowIcon(Res.drawable.lucide_mail) },
                supporting = SUPPORT_EMAIL,
                onClick = { uri.openUri("mailto:$SUPPORT_EMAIL") },
                divider = false,
            )
        }
    }
}

/** The customer-facing Effy address — the only one a shopper may see (CLAUDE.md). */
internal const val SUPPORT_EMAIL = "hello@effyshopping.com"
