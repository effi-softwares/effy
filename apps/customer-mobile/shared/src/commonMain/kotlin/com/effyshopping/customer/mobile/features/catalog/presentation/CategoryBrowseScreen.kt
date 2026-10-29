package com.effyshopping.customer.mobile.features.catalog.presentation

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyErrorState
import com.effyshopping.customer.mobile.core.presentation.EffyLoading
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonShape
import com.effyshopping.customer.mobile.core.presentation.EffySkeletonText
import com.effyshopping.customer.mobile.core.presentation.EffySurface
import com.effyshopping.customer.mobile.features.catalog.domain.BrowseTarget
import com.effyshopping.customer.mobile.features.catalog.domain.Category
import com.effyshopping.customer.mobile.resources.Res
import com.effyshopping.customer.mobile.resources.lucide_chevron_right
import com.effyshopping.mobile.design.EffySpacing
import org.jetbrains.compose.resources.painterResource

/**
 * The category tree, one level per pushed page (101, FR-033): a department's aisles, an aisle's shelves, down to
 * five levels. A category with sub-categories opens the next level; a leaf, or "All in …", opens Search scoped
 * to it. A list of rows — never cards — each with its icon and how many products it holds.
 */
@Composable
fun CategoryBrowseScreen(
    container: AppContainer,
    parentKey: String?,
    title: String,
    onLevel: (Category) -> Unit,
    onProducts: (Category) -> Unit,
) {
    val vm = viewModel(key = "browse:${parentKey.orEmpty()}") {
        CategoryBrowseViewModel(parentKey = parentKey, getCategories = { container.getCategories() })
    }
    val state by vm.state.collectAsState()

    Column(Modifier.fillMaxSize()) {
        EffyAppBar(title = title)
        when (val s = state) {
            CategoryBrowseUiState.Loading -> BrowseSkeleton()
            CategoryBrowseUiState.Error -> EffyErrorState(title = "Couldn't load the aisles", onRetry = vm::load)
            is CategoryBrowseUiState.Ready -> LazyColumn(Modifier.fillMaxSize()) {
                s.level.parent?.let { parent ->
                    item(key = "all") {
                        BrowseRow(name = "All in ${parent.name}", count = parent.productCount, icon = parent.icon, onClick = { onProducts(parent) }, emphasis = true)
                        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    }
                }
                items(s.level.children, key = { it.key }) { c ->
                    val target = vm.targetOf(c)
                    BrowseRow(
                        name = c.name,
                        count = c.productCount,
                        icon = c.icon,
                        deeper = target is BrowseTarget.Level,
                        onClick = {
                            when (target) {
                                is BrowseTarget.Level -> onLevel(c)
                                is BrowseTarget.Products -> onProducts(c)
                            }
                        },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}

/** The aisle list before it reads: rows laid out as [BrowseRow] lays them out — round icon, name, count. */
@Composable
private fun BrowseSkeleton() {
    val type = MaterialTheme.typography
    EffyLoading(Modifier.fillMaxSize(), label = "Loading aisles") {
        Column(Modifier.fillMaxSize()) {
            repeat(7) { i ->
                Row(
                    Modifier.fillMaxWidth().heightIn(min = 64.dp).padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
                ) {
                    EffySkeletonShape(CircleShape, Modifier.size(44.dp))
                    Column(Modifier.weight(1f)) {
                        EffySkeletonText(type.bodyLarge, Modifier.fillMaxWidth(), widthFraction = listOf(0.5f, 0.35f, 0.6f)[i % 3])
                        EffySkeletonText(type.bodySmall, Modifier.fillMaxWidth(), widthFraction = 0.25f)
                    }
                }
            }
        }
    }
}

@Composable
private fun BrowseRow(name: String, count: Int, icon: String?, onClick: () -> Unit, deeper: Boolean = false, emphasis: Boolean = false) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .heightIn(min = 64.dp)
            .clickable(role = Role.Button, onClickLabel = name, onClick = onClick)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(EffySpacing.md),
    ) {
        Box(Modifier.size(44.dp).clip(CircleShape).background(EffySurface.tint), contentAlignment = Alignment.Center) {
            Icon(painterResource(categoryIcon(icon)), contentDescription = null, modifier = Modifier.size(22.dp))
        }
        Column(Modifier.weight(1f)) {
            Text(
                name,
                style = MaterialTheme.typography.bodyLarge.copy(fontWeight = if (emphasis) FontWeight.SemiBold else FontWeight.Medium),
                color = if (emphasis) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis,
            )
            Text("$count products", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        if (deeper) Icon(painterResource(Res.drawable.lucide_chevron_right), contentDescription = null, modifier = Modifier.size(20.dp))
    }
}
