package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.aspectRatio
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.features.catalog.domain.StockUseCases
import com.effyshopping.mobile.design.EffySpacing
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListProducts
import com.effyshopping.shop.mobile.features.catalog.domain.ProductAttributeValue
import com.effyshopping.shop.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.shop.mobile.features.catalog.domain.ProductListItem
import com.effyshopping.shop.mobile.features.catalog.domain.ProductMedia
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import org.jetbrains.compose.resources.decodeToImageBitmap

@Composable
fun CatalogRoute(
    listProducts: ListProducts,
    getProduct: GetProduct,
    stockUseCases: StockUseCases,
    onOpenRestock: () -> Unit = {},
) {
    val viewModel = viewModel { CatalogViewModel(listProducts, getProduct) }
    val state by viewModel.state.collectAsState()
    CatalogScreen(
        state = state,
        onSelectFilter = viewModel::selectFilter,
        onSelectProduct = viewModel::selectProduct,
        onRetry = viewModel::refresh,
        onNewProduct = {},
        onEditDetails = {},
        onOpenRestock = onOpenRestock,
        stockPane = { productId -> StockPane(productId, stockUseCases) },
    )
}

/**
 * The Inventory tab's own MVVM island (054).
 *
 * ⚠ ITS OWN ViewModel, keyed on the product. Folding stock into `CatalogViewModel` would make every
 * product selection re-fetch stock the operator may never look at, and would put two independent
 * server resources behind one loading flag — so a slow stock read would blank the product details.
 */
@Composable
private fun StockPane(productId: String, useCases: StockUseCases) {
    val viewModel = viewModel(key = "stock-$productId") {
        StockViewModel(
            useCases.getProductStock,
            useCases.setStockCount,
            useCases.adjustStock,
            useCases.setStockTracking,
            useCases.setStockThreshold,
        )
    }
    val state by viewModel.state.collectAsState()
    LaunchedEffect(productId) { viewModel.load(productId) }
    StockSection(
        state = state,
        onEnableTracking = viewModel::enableTracking,
        onDisableTracking = viewModel::disableTracking,
        onOpeningCountChange = viewModel::setOpeningCount,
        onModeChange = viewModel::setMode,
        onAmountChange = viewModel::setAmount,
        onReasonChange = viewModel::setReason,
        onSubmitAmount = viewModel::submitAmount,
        onThresholdChange = viewModel::setThresholdInput,
        onSubmitThreshold = viewModel::submitThreshold,
        onClearThreshold = viewModel::clearThreshold,
    )
}

@Composable
fun CatalogScreen(
    state: CatalogUiState,
    onSelectFilter: (CatalogFilter) -> Unit,
    onSelectProduct: (String) -> Unit,
    onRetry: () -> Unit,
    onNewProduct: () -> Unit,
    onEditDetails: () -> Unit,
    stockPane: @Composable (productId: String) -> Unit,
    onOpenRestock: () -> Unit = {},
) {
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .windowInsetsPadding(WindowInsets.safeDrawing.only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal))
            .imePadding(),
    ) {
        val wide = maxWidth >= 840.dp
        Column(Modifier.fillMaxSize()) {
            CatalogHeader(onNewProduct, onOpenRestock)
            HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
            if (wide) {
                Row(Modifier.fillMaxSize()) {
                    CatalogListPane(
                        state = state,
                        onSelectFilter = onSelectFilter,
                        onSelectProduct = onSelectProduct,
                        onRetry = onRetry,
                        constrainProductList = true,
                        modifier = Modifier.width(380.dp).fillMaxHeight(),
                    )
                    Box(
                        Modifier
                            .width(1.dp)
                            .fillMaxHeight()
                            .background(MaterialTheme.colorScheme.outlineVariant),
                    )
                    CatalogDetailPane(
                        state = state,
                        onEditDetails = onEditDetails,
                        scrollable = true,
                        modifier = Modifier.weight(1f).fillMaxHeight(),
                        stockPane = stockPane,
                    )
                }
            } else {
                Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
                    CatalogListPane(
                        state = state,
                        onSelectFilter = onSelectFilter,
                        onSelectProduct = onSelectProduct,
                        onRetry = onRetry,
                        constrainProductList = false,
                        modifier = Modifier.fillMaxWidth(),
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                    CatalogDetailPane(
                        state = state,
                        onEditDetails = onEditDetails,
                        scrollable = false,
                        modifier = Modifier.fillMaxWidth(),
                        stockPane = stockPane,
                    )
                }
            }
        }
    }
}

@Composable
private fun CatalogHeader(onNewProduct: () -> Unit, onOpenRestock: () -> Unit = {}) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(horizontal = EffySpacing.xl, vertical = EffySpacing.lg),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            "Catalog",
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.semantics { heading() },
        )
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.md), verticalAlignment = Alignment.CenterVertically) {
            Text("Search", style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            // ⚠ Restock lives INSIDE Catalog, not as a fifth tab: the bar carries four and that is the
            // ceiling on a phone, and every row in that list leads back to a product's Inventory tab.
            TextButton(onClick = onOpenRestock, modifier = Modifier.heightIn(min = 52.dp)) {
                Text("Restock", style = MaterialTheme.typography.labelLarge)
            }
            Button(
                onClick = onNewProduct,
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.heightIn(min = 52.dp),
            ) {
                Text("+ New product", color = MaterialTheme.colorScheme.onPrimary)
            }
        }
    }
}

@Composable
private fun CatalogListPane(
    state: CatalogUiState,
    onSelectFilter: (CatalogFilter) -> Unit,
    onSelectProduct: (String) -> Unit,
    onRetry: () -> Unit,
    constrainProductList: Boolean,
    modifier: Modifier,
) {
    Column(modifier.background(MaterialTheme.colorScheme.background)) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState())
                .padding(EffySpacing.md),
            horizontalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            CatalogFilter.entries.forEach { filter ->
                FilterChip(label = filter.label, selected = state.filter == filter) { onSelectFilter(filter) }
            }
        }
        HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
        when {
            state.isLoadingList -> LoadingBlock("Loading products")
            state.message != null && state.products.isEmpty() -> ErrorBlock(state.message, onRetry)
            state.products.isEmpty() -> EmptyBlock("No products found for this filter.")
            else -> Column(
                if (constrainProductList) {
                    Modifier.weight(1f).verticalScroll(rememberScrollState())
                } else {
                    Modifier.fillMaxWidth()
                },
            ) {
                state.products.forEach { product ->
                    CatalogProductRow(
                        product = product,
                        selected = product.id == state.selectedId,
                        onClick = { onSelectProduct(product.id) },
                    )
                    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
                }
            }
        }
    }
}

@Composable
private fun CatalogProductRow(product: ProductListItem, selected: Boolean, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(if (selected) MaterialTheme.colorScheme.surface else MaterialTheme.colorScheme.background)
            .clickable(onClick = onClick)
            .heightIn(min = 92.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier
                .width(3.dp)
                .fillMaxHeight()
                .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.background),
        )
        ProductImage(product.primaryImageUrl, product.name, Modifier.padding(start = EffySpacing.md))
        Column(
            modifier = Modifier.weight(1f).padding(horizontal = EffySpacing.md),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(product.name, style = MaterialTheme.typography.titleMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                listOfNotNull(product.brand, product.sku).joinToString(" · ").ifBlank { product.categoryName },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        Column(
            modifier = Modifier.padding(end = EffySpacing.md),
            horizontalAlignment = Alignment.End,
            verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
        ) {
            Text(formatMoney(product.currency, product.priceAmount), style = MaterialTheme.typography.titleSmall)
            StatusPill(product.status)
        }
    }
}

@Composable
private fun CatalogDetailPane(
    state: CatalogUiState,
    onEditDetails: () -> Unit,
    scrollable: Boolean,
    modifier: Modifier,
    stockPane: @Composable (productId: String) -> Unit,
) {
    val paneModifier = modifier
        .background(MaterialTheme.colorScheme.background)
        .then(if (scrollable) Modifier.verticalScroll(rememberScrollState()) else Modifier)
        .padding(EffySpacing.xl)

    Column(
        modifier = paneModifier,
        verticalArrangement = Arrangement.spacedBy(EffySpacing.xl),
    ) {
        when {
            state.isLoadingDetail -> LoadingBlock("Loading product details")
            state.detail != null -> ProductDetailContent(state.detail, onEditDetails, stockPane)
            state.products.isEmpty() -> EmptyBlock("Select a product once the catalog has items.")
            else -> EmptyBlock("Select a product to view its details.")
        }
    }
}

@Composable
private fun ProductDetailContent(
    detail: ProductDetail,
    onEditDetails: () -> Unit,
    stockPane: @Composable (productId: String) -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val stackHeaderActions = maxWidth < 620.dp
        if (stackHeaderActions) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md)) {
                ProductTitleBlock(detail)
                ProductHeaderActions(onEditDetails)
            }
        } else {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(EffySpacing.lg),
                verticalAlignment = Alignment.Top,
            ) {
                ProductTitleBlock(detail, Modifier.weight(1f))
                ProductHeaderActions(onEditDetails)
            }
        }
    }
    MediaStrip(detail.media)

    var tab by remember(detail.id) { mutableStateOf(ProductDetailTab.OVERVIEW) }
    DetailTabs(tab) { tab = it }
    when (tab) {
        ProductDetailTab.INVENTORY -> stockPane(detail.id)
        // Attributes and Media have always shown the overview — see the note on DetailTabs.
        else -> ProductDetails(detail)
    }
}

@Composable
private fun ProductTitleBlock(detail: ProductDetail, modifier: Modifier = Modifier) {
    Column(modifier = modifier, verticalArrangement = Arrangement.spacedBy(EffySpacing.xs)) {
        Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), verticalAlignment = Alignment.CenterVertically) {
            StatusPill(detail.status)
            Text("ID: ${detail.id.take(8)}", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Text(detail.name, style = MaterialTheme.typography.headlineMedium, color = MaterialTheme.colorScheme.onBackground)
        Text(
            "${formatMoney(detail.currency, detail.priceAmount)} / ${detail.shortDescription}",
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.primary,
        )
    }
}

@Composable
private fun ProductHeaderActions(onEditDetails: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s)) {
        OutlinedButton(onClick = onEditDetails, shape = RoundedCornerShape(8.dp)) { Text("Edit details") }
        OutlinedButton(onClick = {}, shape = RoundedCornerShape(8.dp)) { Text("More") }
    }
}

@Composable
private fun MediaStrip(media: List<ProductMedia>) {
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val primaryImageUrl = media.firstOrNull { it.isPrimary }?.url ?: media.firstOrNull()?.url
        val stackMedia = maxWidth < 560.dp
        if (stackMedia) {
            Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.md), modifier = Modifier.fillMaxWidth()) {
                ProductImage(
                    imageUrl = primaryImageUrl,
                    label = "Primary product media",
                    modifier = Modifier.fillMaxWidth().aspectRatio(1.6f),
                    large = true,
                    fixedSize = false,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.s), modifier = Modifier.fillMaxWidth()) {
                    media.drop(1).take(2).forEach { item ->
                        ProductImage(
                            item.url,
                            item.altText ?: "Product media",
                            Modifier.weight(1f).height(82.dp),
                            fixedSize = false,
                        )
                    }
                    AddMediaSlot(Modifier.weight(1f))
                }
            }
        } else {
            Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.md), modifier = Modifier.fillMaxWidth()) {
                ProductImage(
                    imageUrl = primaryImageUrl,
                    label = "Primary product media",
                    modifier = Modifier.weight(1f).aspectRatio(1.6f).heightIn(max = 340.dp),
                    large = true,
                    fixedSize = false,
                )
                Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.s), modifier = Modifier.width(132.dp)) {
                    media.drop(1).take(2).forEach { item ->
                        ProductImage(item.url, item.altText ?: "Product media", Modifier.fillMaxWidth().height(82.dp), fixedSize = false)
                    }
                    AddMediaSlot()
                }
            }
        }
    }
}

/**
 * ⚠ THESE TABS WERE DECORATIVE UNTIL 054. `DetailTabs()` took no parameters, hard-coded index 0 as
 * selected, and the pane below it always rendered the same content — so tapping "Attributes", "Media"
 * or "Inventory" did nothing at all, silently. This is a PRE-EXISTING gap that 054 did not introduce;
 * it makes **Inventory** real because that is the tab this slice owns, and leaves the other two
 * showing the overview exactly as they always have. Making Attributes and Media real is their own
 * slice's work, and pretending otherwise here would hide the gap rather than record it.
 */
internal enum class ProductDetailTab(val label: String) {
    OVERVIEW("Overview"),
    ATTRIBUTES("Attributes"),
    MEDIA("Media"),
    INVENTORY("Inventory"),
}

@Composable
private fun DetailTabs(selected: ProductDetailTab, onSelect: (ProductDetailTab) -> Unit) {
    Row(modifier = Modifier.fillMaxWidth()) {
        ProductDetailTab.entries.forEach { tab ->
            val isSelected = tab == selected
            Column(
                modifier = Modifier
                    .weight(1f)
                    .clickable { onSelect(tab) },
                horizontalAlignment = Alignment.CenterHorizontally,
            ) {
                Text(
                    tab.label,
                    style = MaterialTheme.typography.labelLarge,
                    color = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(vertical = EffySpacing.s),
                )
                Box(
                    Modifier
                        .height(2.dp)
                        .fillMaxWidth()
                        .background(if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant),
                )
            }
        }
    }
}

@Composable
private fun ProductDetails(detail: ProductDetail) {
    Column(verticalArrangement = Arrangement.spacedBy(EffySpacing.lg)) {
        Text(
            "PRODUCT DETAILS",
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
        BoxWithConstraints(Modifier.fillMaxWidth()) {
            if (maxWidth < 560.dp) {
                Column {
                    DetailRow("Brand", detail.brand ?: "—")
                    DetailRow("SKU", detail.sku ?: "—")
                    DetailRow("GTIN", detail.gtin ?: "—")
                    DetailRow("Category", detail.categoryName)
                    DetailRow("Type", detail.typeName)
                    DetailRow("Updated", detail.updatedAt.take(10))
                }
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(EffySpacing.xl), modifier = Modifier.fillMaxWidth()) {
                    Column(Modifier.weight(1f)) {
                        DetailRow("Brand", detail.brand ?: "—")
                        DetailRow("GTIN", detail.gtin ?: "—")
                        DetailRow("Type", detail.typeName)
                    }
                    Column(Modifier.weight(1f)) {
                        DetailRow("SKU", detail.sku ?: "—")
                        DetailRow("Category", detail.categoryName)
                        DetailRow("Updated", detail.updatedAt.take(10))
                    }
                }
            }
        }
        Text("DESCRIPTION", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(
            detail.longDescription ?: detail.shortDescription,
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground,
        )
        if (detail.attributes.isNotEmpty()) {
            Text("ATTRIBUTES", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            detail.attributes.take(6).forEach { AttributeRow(it) }
        }
    }
}

@Composable
private fun DetailRow(label: String, value: String) {
    Row(
        modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyMedium, fontWeight = FontWeight.SemiBold)
    }
    HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant)
}

@Composable
private fun AttributeRow(attribute: ProductAttributeValue) {
    DetailRow(attribute.name, attribute.display)
}

@Composable
private fun FilterChip(label: String, selected: Boolean, onClick: () -> Unit) {
    Text(
        label,
        modifier = Modifier
            .clip(CircleShape)
            .background(if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.background)
            .border(1.dp, if (selected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outline, CircleShape)
            .clickable(onClick = onClick)
            .padding(horizontal = EffySpacing.lg, vertical = EffySpacing.s),
        style = MaterialTheme.typography.labelLarge,
        color = if (selected) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
    )
}

@Composable
private fun StatusPill(status: ProductStatus) {
    val isActive = status == ProductStatus.ACTIVE
    Text(
        status.label.uppercase(),
        modifier = Modifier
            .clip(CircleShape)
            .background(
                when (status) {
                    ProductStatus.ACTIVE -> MaterialTheme.colorScheme.primary
                    ProductStatus.UNAVAILABLE -> MaterialTheme.colorScheme.error
                    else -> MaterialTheme.colorScheme.surfaceVariant
                },
            )
            .padding(horizontal = EffySpacing.s, vertical = 3.dp),
        style = MaterialTheme.typography.labelSmall,
        color = if (isActive || status == ProductStatus.UNAVAILABLE) {
            MaterialTheme.colorScheme.onPrimary
        } else {
            MaterialTheme.colorScheme.onSurfaceVariant
        },
    )
}

@Composable
private fun ProductImage(
    imageUrl: String?,
    label: String,
    modifier: Modifier = Modifier,
    large: Boolean = false,
    fixedSize: Boolean = true,
) {
    var bitmap by remember(imageUrl) { mutableStateOf<ImageBitmap?>(null) }
    var hasImageFailed by remember(imageUrl) { mutableStateOf(false) }
    val sizeModifier = if (fixedSize) Modifier.size(if (large) 180.dp else 56.dp) else Modifier
    val imageShape = RoundedCornerShape(if (large) 14.dp else 10.dp)
    val imageModifier = modifier
        .then(sizeModifier)
        .clip(imageShape)
        .background(MaterialTheme.colorScheme.surfaceVariant)
        .border(1.dp, MaterialTheme.colorScheme.outlineVariant, imageShape)

    LaunchedEffect(imageUrl) {
        bitmap = null
        hasImageFailed = false
        val url = imageUrl?.takeIf { it.isNotBlank() } ?: return@LaunchedEffect
        runCatching {
            val bytes = loadRemoteImageBytes(url) ?: error("Product image request failed")
            bytes.decodeToImageBitmap()
        }.onSuccess { bitmap = it }
            .onFailure { hasImageFailed = true }
    }

    Box(
        modifier = imageModifier,
        contentAlignment = Alignment.Center,
    ) {
        val loadedBitmap = bitmap
        if (loadedBitmap != null) {
            Image(
                bitmap = loadedBitmap,
                contentDescription = label,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
        } else {
            Text(
                if (imageUrl.isNullOrBlank() || hasImageFailed) label.take(2).uppercase() else "",
                style = if (large) MaterialTheme.typography.titleLarge else MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
        }
    }
}

@Composable
private fun AddMediaSlot(modifier: Modifier = Modifier) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .height(82.dp)
            .clip(RoundedCornerShape(10.dp))
            .border(1.dp, MaterialTheme.colorScheme.outline, RoundedCornerShape(10.dp)),
        contentAlignment = Alignment.Center,
    ) {
        Text("+", style = MaterialTheme.typography.headlineSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun LoadingBlock(message: String) {
    Box(Modifier.fillMaxWidth().heightIn(min = 160.dp), contentAlignment = Alignment.Center) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun EmptyBlock(message: String) {
    Box(Modifier.fillMaxWidth().heightIn(min = 160.dp), contentAlignment = Alignment.Center) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ErrorBlock(message: String, onRetry: () -> Unit) {
    Column(
        modifier = Modifier.fillMaxWidth().padding(EffySpacing.xl),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(EffySpacing.s),
    ) {
        Text(message, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
        OutlinedButton(onClick = onRetry, shape = RoundedCornerShape(8.dp)) { Text("Retry") }
    }
}

private fun formatMoney(currency: String, amount: String): String {
    val symbol = when (currency.uppercase()) {
        "AUD" -> "$"
        "USD" -> "$"
        else -> "$currency "
    }
    return "$symbol$amount"
}
