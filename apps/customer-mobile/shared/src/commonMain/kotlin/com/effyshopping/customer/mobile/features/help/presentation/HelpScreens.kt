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
import com.effyshopping.customer.mobile.core.presentation.EffyDisplay
import com.effyshopping.customer.mobile.core.presentation.DisplaySize
import com.effyshopping.customer.mobile.resources.lucide_package

/**
 * The help area: FAQs, Help Center and Customer Service. Static content, true of Effy as built, and nothing
 * the platform cannot honour (no live-chat entry, because there is no live chat).
 */
private data class Faq(val question: String, val answer: String)

// 087 (Help board) - the board's five questions, answered true of Effy as built (083/085 delivery,
// Points, 055 refunds and cancellation). Nothing here may say how many suppliers fill an order.
private val FAQS = listOf(
    Faq(
        "Who delivers my order?",
        "It depends on your address. Where Effy delivers, you choose a delivery window. Elsewhere, a " +
            "courier partner delivers and you see an estimate before you pay.",
    ),
    Faq(
        "How do delivery windows work?",
        "Choose today or one of the next few delivery days. A day on its own is fine - we'll deliver any " +
            "time that day - or pick a window if you need a specific time. Each window shows the time to " +
            "order by.",
    ),
    Faq(
        "What are Effy points?",
        "Points are store credit. Use them at checkout as a way of paying - your order total stays the " +
            "same, points pay what they cover and any rest goes on your card. Your balance is in " +
            "Account, under Effy points.",
    ),
    Faq(
        "How do refunds work?",
        "Refunds go back to the card or payment method you paid with, usually within a few business " +
            "days - when it appears depends on your bank. We never see or store your card details.",
    ),
    Faq(
        "Can I change or cancel an order?",
        "Until we start preparing it, you can cancel an order yourself from its details and we refund " +
            "everything, delivery included. After that, contact us and we'll see what we can do.",
    ),
)

/**
 * Help (087, Help board) - one page: "How can we help?", the answers, how to reach a person, and where
 * to go when something is wrong with an order. It replaces three screens (FAQs, Help centre, Contact
 * us) that each held a fragment of this; their routes all open it.
 */
@Composable
fun HelpScreen(onOpenOrders: () -> Unit) = HelpScaffold("Help") {
    val uri = LocalUriHandler.current
    Column(modifier = Modifier.padding(EffySpacing.lg), verticalArrangement = Arrangement.spacedBy(EffySpacing.xl)) {
        EffyDisplay("How can we help?", size = DisplaySize.Section)
        EffyGroup {
            FAQS.forEachIndexed { i, faq ->
                FaqRow(faq)
                if (i < FAQS.lastIndex) EffyGroupDivider()
            }
        }
        EffyGroup(caption = "Send us a message") {
            Text(
                "We'll get back to you as quickly as we can.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
            )
            EffyNavRow(
                "Email us",
                leading = { EffyRowIcon(Res.drawable.lucide_mail) },
                supporting = SUPPORT_EMAIL,
                onClick = { uri.openUri("mailto:$SUPPORT_EMAIL") },
                divider = false,
            )
        }
        EffyGroup(caption = "Something wrong with an order?") {
            EffyNavRow(
                "Your orders",
                leading = { EffyRowIcon(Res.drawable.lucide_package) },
                supporting = "Open the order and choose Report a problem.",
                onClick = onOpenOrders,
                divider = false,
            )
        }
    }
}

/** A pushed help screen: a fixed app bar (title and back arrow) over a scrolling body. */
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

@Composable
private fun FaqRow(faq: Faq) {
    var open by remember { mutableStateOf(false) }
    // The chevron rotates (it snapped) - state by orientation and by the answer's presence.
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

/** The customer-facing Effy address - the only one a shopper may see (claude.md). */
internal const val SUPPORT_EMAIL = "hello@effyshopping.com"
