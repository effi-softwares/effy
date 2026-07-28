package com.effyshopping.customer.mobile.features.delivery

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
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
import com.effyshopping.customer.mobile.resources.ic_orders_outlined
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
 */
@Composable
fun DeliveryBar(container: AppContainer) {
    val context by container.deliveryContext.state.collectAsState()
    var editing by remember { mutableStateOf(false) }
    var draft by remember { mutableStateOf("") }
    var error by remember { mutableStateOf<String?>(null) }
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
            .clickable {
                draft = context?.postcode ?: ""
                error = null
                editing = true
            }
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Icon(
            painterResource(Res.drawable.ic_orders_outlined),
            contentDescription = null,
            modifier = Modifier.size(18.dp),
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Column(modifier = Modifier.weight(1f)) {
            Text(
                if (context == null) "Set your delivery location" else "Deliver to ${context!!.postcode}",
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
                    // Announced so the verdict reaches a screen-reader user (FR-045).
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
        AlertDialog(
            onDismissRequest = { editing = false },
            title = { Text("Delivery location") },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
                    Text(
                        "We’ll tell you straight away whether we deliver to you.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                    OutlinedTextField(
                        value = draft,
                        onValueChange = {
                            draft = it
                            error = null
                        },
                        label = { Text("Postcode") },
                        singleLine = true,
                        isError = error != null,
                        supportingText = error?.let { { Text(it) } },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = {
                    val postcode = container.deliveryContext.setPostcode(draft)
                    if (postcode == null) {
                        // "That isn't a postcode" — deliberately NOT "we don't deliver there".
                        error = "Enter a 4-digit postcode."
                        return@TextButton
                    }
                    editing = false
                    check(postcode)
                }) { Text("Check") }
            },
            dismissButton = {
                if (context != null) {
                    TextButton(onClick = {
                        container.deliveryContext.clear()
                        editing = false
                    }) { Text("Clear") }
                } else {
                    TextButton(onClick = { editing = false }) { Text("Cancel") }
                }
            },
        )
    }
}
