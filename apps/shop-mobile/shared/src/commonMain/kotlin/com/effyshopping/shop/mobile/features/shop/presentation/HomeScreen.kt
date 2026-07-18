package com.effyshopping.shop.mobile.features.shop.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.design.EffySpacing
import com.effyshopping.shop.mobile.features.home.domain.AttentionItem
import com.effyshopping.shop.mobile.features.home.domain.AttentionSeverity
import com.effyshopping.shop.mobile.features.home.domain.GetHomeDashboard
import com.effyshopping.shop.mobile.features.home.domain.HomeDashboard
import com.effyshopping.shop.mobile.features.home.domain.OrderStatus
import com.effyshopping.shop.mobile.features.home.domain.PersonnelSummary
import com.effyshopping.shop.mobile.features.home.domain.RecentOrder
import com.effyshopping.shop.mobile.features.home.domain.StorageState
import com.effyshopping.shop.mobile.features.home.domain.StorageZone
import com.effyshopping.shop.mobile.features.home.presentation.HomeDashboardUiState
import com.effyshopping.shop.mobile.features.home.presentation.HomeDashboardViewModel
import com.effyshopping.shop.mobile.features.shop.domain.Operator
import kotlin.math.max

@Composable
fun HomeRoute(
    operator: Operator,
    getHomeDashboard: GetHomeDashboard,
    onOpenCatalog: () -> Unit,
    onOpenManager: () -> Unit,
) {
    val viewModel = viewModel { HomeDashboardViewModel(getHomeDashboard) }
    val state by viewModel.state.collectAsState()
    HomeScreen(
        operator = operator,
        state = state,
        onRefresh = viewModel::refresh,
        onOpenCatalog = onOpenCatalog,
        onOpenManager = onOpenManager,
    )
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HomeScreen(
    operator: Operator,
    state: HomeDashboardUiState,
    onRefresh: () -> Unit,
    onOpenCatalog: () -> Unit,
    onOpenManager: () -> Unit,
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
            .imePadding()
            .verticalScroll(rememberScrollState())
            .padding(horizontal = EffySpacing.xl, vertical = EffySpacing.lg),
    ) {
        val wide = maxWidth >= 900.dp
        Column(
            modifier = Modifier.fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            when (state) {
                HomeDashboardUiState.Loading -> HomeSkeleton(operator)
                HomeDashboardUiState.Failed -> HomeFailure(onRefresh)
                is HomeDashboardUiState.Ready -> HomeDashboardContent(
                    operator = operator,
                    dashboard = state.dashboard,
                    wide = wide,
                    onOpenCatalog = onOpenCatalog,
                    onOpenManager = onOpenManager,
                )
            }
        }
    }
}

@Composable
private fun HomeDashboardContent(
    operator: Operator,
    dashboard: HomeDashboard,
    wide: Boolean,
    onOpenCatalog: () -> Unit,
    onOpenManager: () -> Unit,
) {
    HomeHeader(operator = operator, dashboard = dashboard)
    if (wide) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
        ) {
            Column(
                modifier = Modifier.weight(0.95f),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.md),
            ) {
                EfficiencyPanel(dashboard)
                FulfillmentPanel(dashboard)
                StoragePanel(dashboard.storage)
            }
            Column(
                modifier = Modifier.weight(1.9f),
                verticalArrangement = Arrangement.spacedBy(EffySpacing.lg),
            ) {
                AttentionSection(dashboard.attention, onOpenCatalog)
                PersonnelSection(dashboard.personnel, onOpenManager)
                RecentOrdersSection(dashboard.recentOrders)
            }
        }
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
            EfficiencyPanel(dashboard)
            FulfillmentPanel(dashboard)
            AttentionSection(dashboard.attention, onOpenCatalog)
            PersonnelSection(dashboard.personnel, onOpenManager)
            StoragePanel(dashboard.storage)
            RecentOrdersSection(dashboard.recentOrders)
        }
    }
}

@Composable
private fun HomeHeader(operator: Operator, dashboard: HomeDashboard) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Top,
    ) {
        Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
            Text(
                "Hello, ${operator.headerName()}",
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onBackground,
                modifier = Modifier.semantics { heading() },
            )
            Text(
                "${dashboard.shopName} · ${dashboard.zone}",
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        StatusChip(if (dashboard.storeOnline) "Store Online" else "Store Offline", dashboard.storeOnline)
    }
}

@Composable
private fun EfficiencyPanel(dashboard: HomeDashboard) {
    DashboardPanel(minHeight = 184.dp) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            MiniIcon(tone = PanelTone.Positive)
            Text(
                "+${dashboard.dailyPickEfficiency.deltaPercent}%",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
        Text(
            "Daily Pick Efficiency",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            "${dashboard.dailyPickEfficiency.percent}%",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.primary,
        )
        BarChart(dashboard.dailyPickEfficiency.hourlyFulfillment)
        Text(
            "Hourly fulfillment rate",
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.align(Alignment.End),
        )
    }
}

@Composable
private fun FulfillmentPanel(dashboard: HomeDashboard) {
    DashboardPanel(minHeight = 148.dp) {
        Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
            MiniIcon(tone = PanelTone.Warning)
            Text(
                "Avg ${dashboard.fulfillmentSpeed.averageMinutes}m",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.error,
            )
        }
        Text(
            "Fulfillment Speed",
            style = MaterialTheme.typography.labelLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        Text(
            dashboard.fulfillmentSpeed.label,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.error,
        )
    }
}

@Composable
private fun StoragePanel(storage: List<StorageZone>) {
    DashboardPanel {
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Storage Utilization", style = MaterialTheme.typography.titleMedium)
            Text("i", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        storage.forEach { zone ->
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                    Text(zone.name, style = MaterialTheme.typography.bodyMedium)
                    Text("${zone.percent}%", style = MaterialTheme.typography.labelLarge)
                }
                ProgressLine(zone.percent, warning = zone.state == StorageState.Warning)
            }
        }
    }
}

@Composable
private fun AttentionSection(items: List<AttentionItem>, onOpenCatalog: () -> Unit) {
    SectionHeader("Requires Attention", action = "View All", onAction = onOpenCatalog)
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        items.forEach { item ->
            DashboardRow {
                MiniIcon(tone = if (item.severity == AttentionSeverity.Urgent) PanelTone.Critical else PanelTone.Neutral)
                Column(modifier = Modifier.weight(1f)) {
                    Text(item.title, style = MaterialTheme.typography.titleMedium)
                    Text(item.detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                SeverityPill(item.severity)
                Text(">", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}

@Composable
@OptIn(ExperimentalLayoutApi::class)
private fun PersonnelSection(personnel: List<PersonnelSummary>, onOpenManager: () -> Unit) {
    SectionHeader("Personnel Overview", action = "Roster", onAction = onOpenManager)
    FlowRow(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        maxItemsInEachRow = 2,
    ) {
        personnel.forEach { person ->
            PersonnelTile(person, Modifier.weight(1f).widthIn(min = 220.dp))
        }
    }
}

@Composable
private fun RecentOrdersSection(orders: List<RecentOrder>) {
    SectionHeader("Recent Orders", action = "View All", onAction = {})
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface),
    ) {
        orders.forEachIndexed { index, order ->
            OrderRow(order)
            if (index != orders.lastIndex) HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        }
    }
}

@Composable
private fun PersonnelTile(person: PersonnelSummary, modifier: Modifier = Modifier) {
    DashboardRow(modifier = modifier.heightIn(min = 72.dp)) {
        Avatar(person.initials, muted = !person.available)
        Column(modifier = Modifier.weight(1f)) {
            Text(person.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                person.activity,
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Box(
            Modifier
                .size(10.dp)
                .clip(CircleShape)
                .background(if (person.available) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
        )
    }
}

@Composable
private fun OrderRow(order: RecentOrder) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 72.dp)
            .padding(horizontal = EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        MiniIcon(tone = if (order.status == OrderStatus.Active) PanelTone.Warning else PanelTone.Neutral)
        Column(modifier = Modifier.weight(1f)) {
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs), verticalAlignment = Alignment.Bottom) {
                Text(order.orderNumber, style = MaterialTheme.typography.titleMedium)
                Text(order.time, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(order.detail, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        OrderStatusPill(order.status)
        Text(">", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SectionHeader(title: String, action: String, onAction: () -> Unit) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(title, style = MaterialTheme.typography.titleLarge)
        TextButton(onClick = onAction) { Text(action) }
    }
}

@Composable
private fun DashboardPanel(
    modifier: Modifier = Modifier,
    minHeight: Dp = 0.dp,
    content: @Composable ColumnScope.() -> Unit,
) {
    Column(
        modifier = modifier
            .fillMaxWidth()
            .heightIn(min = minHeight)
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(EffySpacing.md),
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        content = content,
    )
}

@Composable
private fun DashboardRow(
    modifier: Modifier = Modifier,
    content: @Composable RowScope.() -> Unit,
) {
    Row(
        modifier = modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(16.dp))
            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(16.dp))
            .background(MaterialTheme.colorScheme.surface)
            .padding(EffySpacing.md),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        content = content,
    )
}

@Composable
private fun BarChart(values: List<Int>) {
    val largest = max(1, values.maxOrNull() ?: 1)
    Row(
        modifier = Modifier.fillMaxWidth().height(44.dp),
        horizontalArrangement = Arrangement.spacedBy(3.dp),
        verticalAlignment = Alignment.Bottom,
    ) {
        values.forEach { value ->
            val fraction = value.toFloat() / largest.toFloat()
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxHeight(fraction.coerceIn(0.15f, 1f))
                    .clip(RoundedCornerShape(2.dp))
                    .background(
                        if (fraction > 0.75f) MaterialTheme.colorScheme.primary
                        else MaterialTheme.colorScheme.primaryContainer,
                    ),
            )
        }
    }
}

@Composable
private fun ProgressLine(percent: Int, warning: Boolean) {
    Box(
        Modifier
            .fillMaxWidth()
            .height(8.dp)
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.outlineVariant),
    ) {
        Box(
            Modifier
                .fillMaxWidth((percent / 100f).coerceIn(0f, 1f))
                .fillMaxHeight()
                .clip(CircleShape)
                .background(if (warning) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary),
        )
    }
}

@Composable
private fun StatusChip(label: String, online: Boolean) {
    Row(
        modifier = Modifier
            .clip(CircleShape)
            .background(MaterialTheme.colorScheme.surfaceVariant)
            .padding(horizontal = EffySpacing.md, vertical = EffySpacing.xs),
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.xs),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .size(7.dp)
                .clip(CircleShape)
                .background(if (online) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline),
        )
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SeverityPill(severity: AttentionSeverity) {
    val label = if (severity == AttentionSeverity.Urgent) "URGENT" else "OPEN"
    Text(
        label,
        style = MaterialTheme.typography.labelSmall,
        color = if (severity == AttentionSeverity.Urgent) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (severity == AttentionSeverity.Urgent) MaterialTheme.colorScheme.errorContainer else MaterialTheme.colorScheme.primaryContainer)
            .padding(horizontal = EffySpacing.s, vertical = 4.dp),
    )
}

@Composable
private fun OrderStatusPill(status: OrderStatus) {
    val label = when (status) {
        OrderStatus.Ready -> "READY"
        OrderStatus.InTransit -> "IN TRANSIT"
        OrderStatus.Active -> "ACTIVE"
        OrderStatus.Queued -> "QUEUED"
    }
    val important = status == OrderStatus.Ready
    val active = status == OrderStatus.Active
    Text(
        label,
        style = MaterialTheme.typography.labelSmall,
        color = when {
            active -> MaterialTheme.colorScheme.error
            important -> MaterialTheme.colorScheme.primary
            else -> MaterialTheme.colorScheme.onSurfaceVariant
        },
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(
                when {
                    active -> MaterialTheme.colorScheme.errorContainer
                    important -> MaterialTheme.colorScheme.primaryContainer
                    else -> MaterialTheme.colorScheme.surfaceVariant
                },
            )
            .padding(horizontal = EffySpacing.s, vertical = 4.dp),
    )
}

@Composable
private fun MiniIcon(tone: PanelTone) {
    val background = when (tone) {
        PanelTone.Positive -> MaterialTheme.colorScheme.primaryContainer
        PanelTone.Warning -> MaterialTheme.colorScheme.errorContainer
        PanelTone.Critical -> MaterialTheme.colorScheme.errorContainer
        PanelTone.Neutral -> MaterialTheme.colorScheme.surfaceVariant
    }
    Box(
        modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(10.dp))
            .background(background),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(16.dp)
                .clip(RoundedCornerShape(4.dp))
                .border(
                    2.dp,
                    if (tone == PanelTone.Critical || tone == PanelTone.Warning) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.primary
                    },
                    RoundedCornerShape(4.dp),
                ),
        )
    }
}

@Composable
private fun Avatar(initials: String, muted: Boolean, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .size(44.dp)
            .clip(CircleShape)
            .background(if (muted) MaterialTheme.colorScheme.surfaceVariant else MaterialTheme.colorScheme.primaryContainer),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            initials,
            style = MaterialTheme.typography.labelLarge,
            color = if (muted) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun HomeSkeleton(operator: Operator) {
    HomeHeader(
        operator = operator,
        dashboard = HomeDashboard(
            shopName = operator.shop?.name ?: "Assigned shop",
            zone = operator.shop?.code ?: "Zone pending",
            storeOnline = true,
            dailyPickEfficiency = com.effyshopping.shop.mobile.features.home.domain.EfficiencyMetric(0, 0.0, emptyList()),
            fulfillmentSpeed = com.effyshopping.shop.mobile.features.home.domain.FulfillmentSpeed("Loading", 0),
            storage = emptyList(),
            attention = emptyList(),
            personnel = emptyList(),
            recentOrders = emptyList(),
        ),
    )
    DashboardPanel(minHeight = 180.dp) {
        Text("Loading dashboard", style = MaterialTheme.typography.titleMedium)
        Text("Preparing the latest shop snapshot.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun HomeFailure(onRefresh: () -> Unit) {
    DashboardPanel(minHeight = 160.dp) {
        Text("Dashboard unavailable", style = MaterialTheme.typography.titleMedium)
        Text(
            "The home summary could not be loaded. Try again when the connection settles.",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        TextButton(onClick = onRefresh) { Text("Retry") }
    }
}

private enum class PanelTone { Positive, Warning, Critical, Neutral }

private fun Operator.headerName(): String {
    val source = email?.substringBefore("@")?.trim()?.takeIf { it.isNotBlank() } ?: display
    return source.replaceFirstChar { char -> char.uppercase() }
}
