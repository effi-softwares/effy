package com.effyshopping.customer.mobile.features.delivery

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.ic_location_outlined
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.launch
import org.jetbrains.compose.resources.painterResource

/**
 * "Do we deliver to you?" on the Home screen (025 US1 / FR-012, FR-014) — the mobile counterpart of
 * the web header affordance.
 *
 * It closes the storefront's worst gap: a shopper could browse, fill a cart, sign in, and only then
 * discover Effy does not serve their address.
 *
 * ⚠ THREE states, and conflating any two is the failure mode:
 *   serviced == true   → we deliver
 *   serviced == false  → we do not deliver (browsing is unaffected — FR-014)
 *   serviced == null   → we have not asked, or the check failed. NEVER rendered as a refusal.
 *
 * ── 030 ────────────────────────────────────────────────────────────────────────────────────────
 *
 * The entry surface is now a **bottom sheet** ([DeliverySheet]), not a centre-screen dialog, and the
 * set location is written out as a PLACE — "Richmond VIC 3121", not "3121" — by the shared rule in
 * [formatPlace]. A shopper who was unsure of their postcode cannot verify four bare digits, and that
 * is exactly the shopper this feature exists for.
 */
@Composable
fun DeliveryBar(container: AppContainer) {
    val context by container.deliveryContext.state.collectAsState()
    var editing by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    fun check(postcode: String) {
        scope.launch {
            try {
                val result = container.checkServiceability(postcode)
                container.deliveryContext.recordServiceability(result.postcode, result.serviced)
            } catch (_: Throwable) {
                // Offline or a failed read leaves `serviced` null — which renders as "we couldn't
                // check", never as "we don't deliver here". Telling a prospective customer the second
                // when the first is true is the outcome this capability exists to prevent.
            }
        }
    }

    // Re-check a restored location that has no verdict yet.
    LaunchedEffect(context?.postcode) {
        val current = context
        if (current != null && current.serviced == null) check(current.postcode)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { editing = true }
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Icon(
            // A location pin, not the receipt glyph this used to borrow — that same icon means
            // "Orders" in the bottom bar, so it said the wrong thing twice over.
            painterResource(Res.drawable.ic_location_outlined),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                // FR-033: the PLACE, not the bare postcode. `formatPlace` degrades to digits when the
                // locality is unknown, so this is never empty and never invents a suburb (FR-034).
                context?.let { formatPlace(it) } ?: "Set your delivery location",
                style = MaterialTheme.typography.bodyMedium,
            )
            context?.let { ctx ->
                val message = when (ctx.serviced) {
                    true -> "We deliver here"
                    false -> "We don’t deliver here yet — you can keep browsing"
                    null -> "Checking…"
                }
                Text(
                    message,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    // Announced so the verdict reaches a screen-reader user (FR-045). ⚠ FR-042: it
                    // names the place in the SAME words the visible line above uses, because both
                    // come from `formatPlace`.
                    modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite },
                )
            }
        }
        Text(
            if (context == null) "Set" else "Change",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.primary,
        )
    }

    if (editing) {
        DeliverySheet(
            store = container.deliveryContext,
            searchLocalities = container.searchLocalities,
            onCheck = ::check,
            onDismiss = { editing = false },
        )
    }
}
