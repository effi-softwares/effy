package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.app.AppContainer
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.AssignSections
import com.effyshopping.shop.mobile.features.catalog.domain.ChangeProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.DeleteProduct
import com.effyshopping.shop.mobile.features.catalog.domain.GetProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ListShopSections
import com.effyshopping.shop.mobile.features.catalog.domain.ProductDetail
import com.effyshopping.shop.mobile.features.catalog.domain.ProductPatch
import com.effyshopping.shop.mobile.features.catalog.domain.ProductStatus
import com.effyshopping.shop.mobile.features.catalog.domain.ShopSection
import com.effyshopping.shop.mobile.features.catalog.domain.UpdateProduct
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * The product detail + edit surface (016 US4/US5). A sectioned, TABBED read with FOCUSED bottom-sheet edits:
 * each edit sends the product's current `updatedAt` as `expectedUpdatedAt`, so a concurrent change yields a
 * 409 the ViewModel turns into a reload prompt ([UiState.conflict], FR-023a) rather than a silent overwrite.
 * A schema-drift notice ([ProductDetail.missingMandatoryAttributes]) is shown non-blocking (FR-020a).
 * Lifecycle controls change status and offer archive (the default remove) vs a guarded hard delete (R8).
 */
class DetailViewModel(
    private val productId: String,
    private val getProduct: GetProduct,
    private val updateProduct: UpdateProduct,
    private val changeStatus: ChangeProductStatus,
    private val deleteProduct: DeleteProduct,
    private val listSections: ListShopSections,
    private val assignSections: AssignSections,
) : ViewModel() {
    enum class Tab(val label: String) { OVERVIEW("Overview"), ATTRIBUTES("Attributes"), MEDIA("Media"), SECTIONS("Sections"), INVENTORY("Inventory") }

    data class UiState(
        val loading: Boolean = true,
        val product: ProductDetail? = null,
        val tab: Tab = Tab.OVERVIEW,
        val error: String? = null,
        val conflict: Boolean = false,
        val busy: Boolean = false,
        val actionError: String? = null,
        val sections: List<ShopSection> = emptyList(),
        val deleted: Boolean = false,
    )

    private val _state = MutableStateFlow(UiState())
    val state = _state.asStateFlow()

    init { load() }

    fun selectTab(tab: Tab) {
        _state.value = _state.value.copy(tab = tab)
        if (tab == Tab.SECTIONS && _state.value.sections.isEmpty()) loadSections()
    }

    fun load() {
        _state.value = _state.value.copy(loading = true, error = null, conflict = false)
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(loading = false, product = getProduct(productId))
            } catch (e: AppException) {
                _state.value = _state.value.copy(loading = false, error = messageFor(e.error))
            }
        }
    }

    /** A focused edit — [patch] carries only the changed fields; the token is the product's `updatedAt`. */
    fun saveEdit(build: (String) -> ProductPatch, onDone: () -> Unit) {
        val current = _state.value.product ?: return
        _state.value = _state.value.copy(busy = true, actionError = null, conflict = false)
        viewModelScope.launch {
            try {
                val updated = updateProduct(current.id, build(current.updatedAt))
                _state.value = _state.value.copy(busy = false, product = updated)
                onDone()
            } catch (e: AppException) {
                if (e.error == AppError.Conflict) {
                    // FR-023a — someone else changed it first. Don't overwrite; prompt a reload.
                    _state.value = _state.value.copy(busy = false, conflict = true)
                    onDone()
                } else {
                    _state.value = _state.value.copy(busy = false, actionError = messageFor(e.error))
                }
            }
        }
    }

    fun changeStatus(status: ProductStatus) {
        val current = _state.value.product ?: return
        _state.value = _state.value.copy(busy = true, actionError = null)
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(busy = false, product = changeStatus(current.id, status))
            } catch (e: AppException) {
                _state.value = _state.value.copy(busy = false, actionError = messageFor(e.error))
            }
        }
    }

    fun delete(onDeleted: () -> Unit) {
        val current = _state.value.product ?: return
        _state.value = _state.value.copy(busy = true, actionError = null)
        viewModelScope.launch {
            try {
                deleteProduct(current.id)
                _state.value = _state.value.copy(busy = false, deleted = true)
                onDeleted()
            } catch (e: AppException) {
                // R8 — a referenced/published product cannot be hard-deleted; steer to archive.
                val msg = if (e.error == AppError.Conflict) "This product is in use — archive it instead." else messageFor(e.error)
                _state.value = _state.value.copy(busy = false, actionError = msg)
            }
        }
    }

    private fun loadSections() {
        viewModelScope.launch {
            runCatching { listSections() }.getOrNull()?.let { _state.value = _state.value.copy(sections = it) }
        }
    }

    fun setSections(ids: List<String>) {
        val current = _state.value.product ?: return
        _state.value = _state.value.copy(busy = true, actionError = null)
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(busy = false, product = assignSections(current.id, ids))
            } catch (e: AppException) {
                _state.value = _state.value.copy(busy = false, actionError = messageFor(e.error))
            }
        }
    }

    private fun messageFor(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        AppError.NotFound -> "This product is no longer available."
        AppError.Conflict -> "That didn't save — please reload and try again."
        AppError.Network -> "No connection. Check your network and try again."
        AppError.Forbidden -> "You don't have access to do that."
        else -> "Something went wrong. Try again."
    }
}

private fun detailViewModel(container: AppContainer, id: String): DetailViewModel = DetailViewModel(
    productId = id,
    getProduct = container.getProduct,
    updateProduct = container.updateProduct,
    changeStatus = container.changeProductStatus,
    deleteProduct = container.deleteProduct,
    listSections = container.listShopSections,
    assignSections = container.assignSections,
)

/** Full-screen detail (compact / pushed route): a top back affordance + the shared body. */
@Composable
fun ProductDetailScreen(container: AppContainer, id: String, onBack: () -> Unit) {
    val vm = viewModel(key = "detail-$id") { detailViewModel(container, id) }
    Column(modifier = Modifier.fillMaxSize()) {
        Row(modifier = Modifier.fillMaxWidth().padding(8.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = onBack) { Text("Back") }
        }
        DetailBody(vm, onDeleted = onBack)
    }
}

/** Embedded detail pane (tablet two-pane): no back affordance — selection is driven by the list. */
@Composable
fun ProductDetailPane(container: AppContainer, id: String, onDeleted: () -> Unit) {
    val vm = viewModel(key = "detail-pane-$id") { detailViewModel(container, id) }
    DetailBody(vm, onDeleted = onDeleted)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DetailBody(vm: DetailViewModel, onDeleted: () -> Unit) {
    val state by vm.state.collectAsState()
    var editing by remember { mutableStateOf(false) }

    when {
        state.loading -> { Box(Modifier.fillMaxSize(), Alignment.Center) { CircularProgressIndicator() }; return }
        state.error != null -> { Box(Modifier.fillMaxSize().padding(24.dp), Alignment.Center) { Text(state.error!!, color = MaterialTheme.colorScheme.error) }; return }
    }
    val product = state.product ?: return

    Column(modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState())) {
        Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 16.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(product.name, style = MaterialTheme.typography.headlineSmall)
            Text("${product.currency} ${product.priceAmount} · ${product.status.label}", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }

        if (state.conflict) ConflictNotice(onReload = vm::load)
        if (product.missingMandatoryAttributes.isNotEmpty()) MissingAttributesNotice(product.missingMandatoryAttributes)
        state.actionError?.let { Text(it, color = MaterialTheme.colorScheme.error, modifier = Modifier.padding(horizontal = 24.dp)) }

        TabRow(selectedTabIndex = state.tab.ordinal) {
            DetailViewModel.Tab.entries.forEach { tab ->
                Tab(selected = state.tab == tab, onClick = { vm.selectTab(tab) }, text = { Text(tab.label) })
            }
        }

        when (state.tab) {
            DetailViewModel.Tab.OVERVIEW -> OverviewTab(product, onEdit = { editing = true })
            DetailViewModel.Tab.ATTRIBUTES -> AttributesTab(product)
            DetailViewModel.Tab.MEDIA -> MediaTab(product)
            DetailViewModel.Tab.SECTIONS -> SectionsTab(state, vm)
            DetailViewModel.Tab.INVENTORY -> ComingSoon("Inventory levels will live here (US5).")
        }

        HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
        LifecycleControls(product, state.busy, onStatus = vm::changeStatus, onDelete = { vm.delete(onDeleted) })
    }

    if (editing) EditBasicsSheet(product, state.busy, onSave = { patch -> vm.saveEdit(patch) { editing = false } }, onDismiss = { editing = false })
}

@Composable
private fun OverviewTab(product: ProductDetail, onEdit: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)) {
        DetailLine("Name", product.name)
        DetailLine("Short description", product.shortDescription)
        product.longDescription?.let { DetailLine("Description", it) }
        DetailLine("Brand", product.brand ?: "—")
        DetailLine("SKU", product.sku ?: "—")
        DetailLine("GTIN", product.gtin ?: "—")
        DetailLine("Type", product.typeName)
        DetailLine("Category", product.categoryName)
        product.compareAtAmount?.let { DetailLine("Compare-at", "${product.currency} $it") }
        Button(onClick = onEdit, modifier = Modifier.padding(top = 8.dp)) { Text("Edit details") }
    }
}

@Composable
private fun AttributesTab(product: ProductDetail) {
    Column(modifier = Modifier.fillMaxWidth()) {
        if (product.attributes.isEmpty()) {
            ComingSoon("No attributes recorded for this product.")
        } else product.attributes.forEach { attr ->
            DetailLinePadded(attr.name, attr.display)
            HorizontalDivider()
        }
    }
}

@Composable
private fun MediaTab(product: ProductDetail) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (product.media.isEmpty()) {
            Text("No images yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        } else product.media.forEach { m ->
            Text((if (m.isPrimary) "★ " else "") + (m.altText ?: m.storageKey), style = MaterialTheme.typography.bodyMedium)
        }
        // Upload needs a platform file picker + the presigned PUT — a deliberate later polish (R13).
        OutlinedButton(onClick = {}, enabled = false) { Text("Add photo — coming soon") }
    }
}

@OptIn(ExperimentalLayoutApi::class, ExperimentalMaterial3Api::class)
@Composable
private fun SectionsTab(state: DetailViewModel.UiState, vm: DetailViewModel) {
    val product = state.product ?: return
    val current = product.sections.toSet()
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.sections.isEmpty()) {
            Text("No sections defined for this shop yet.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            state.sections.forEach { section ->
                val selected = current.contains(section.id)
                FilterChip(
                    selected = selected,
                    onClick = {
                        val next = if (selected) current - section.id else current + section.id
                        vm.setSections(next.toList())
                    },
                    label = { Text(section.name) },
                )
            }
        }
    }
}

@Composable
private fun LifecycleControls(product: ProductDetail, busy: Boolean, onStatus: (ProductStatus) -> Unit, onDelete: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Lifecycle", style = MaterialTheme.typography.titleSmall)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            if (product.status != ProductStatus.ACTIVE) {
                Button(onClick = { onStatus(ProductStatus.ACTIVE) }, enabled = !busy) { Text("Publish") }
            }
            if (product.status == ProductStatus.ACTIVE) {
                OutlinedButton(onClick = { onStatus(ProductStatus.UNAVAILABLE) }, enabled = !busy) { Text("Make unavailable") }
            }
            if (product.status != ProductStatus.ARCHIVED) {
                OutlinedButton(onClick = { onStatus(ProductStatus.ARCHIVED) }, enabled = !busy) { Text("Archive") }
            }
        }
        // Archive is the default "remove"; hard delete is guarded server-side (draft/unreferenced only, R8).
        TextButton(onClick = onDelete, enabled = !busy) { Text("Delete permanently") }
    }
}

@Composable
private fun ConflictNotice(onReload: () -> Unit) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text("Someone else changed this product while you were editing.", style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.error)
        TextButton(onClick = onReload) { Text("Reload latest") }
    }
}

@Composable
private fun MissingAttributesNotice(missing: List<String>) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)) {
        Text(
            "Heads up: ${missing.size} attribute${if (missing.size == 1) " is" else "s are"} now required for this type. Edit to add: ${missing.joinToString(", ")}.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.tertiary,
        )
    }
}

@Composable
private fun ComingSoon(message: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Text(message, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun DetailLinePadded(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp, vertical = 8.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value, style = MaterialTheme.typography.bodyLarge)
    }
}

/**
 * The FOCUSED edit sheet (FR-023). Edits only the core content fields; the ViewModel stamps the current
 * `updatedAt` as `expectedUpdatedAt` so a stale save is refused (409 → reload prompt) not silently applied.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun EditBasicsSheet(
    product: ProductDetail,
    busy: Boolean,
    onSave: ((String) -> ProductPatch) -> Unit,
    onDismiss: () -> Unit,
) {
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
    var name by remember { mutableStateOf(product.name) }
    var shortDesc by remember { mutableStateOf(product.shortDescription) }
    var price by remember { mutableStateOf(product.priceAmount) }
    var brand by remember { mutableStateOf(product.brand ?: "") }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(modifier = Modifier.fillMaxWidth().padding(24.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text("Edit details", style = MaterialTheme.typography.headlineSmall)
            OutlinedTextField(name, { name = it }, label = { Text("Name") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(shortDesc, { shortDesc = it }, label = { Text("Short description") }, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(price, { price = it }, label = { Text("Price") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            OutlinedTextField(brand, { brand = it }, label = { Text("Brand") }, singleLine = true, modifier = Modifier.fillMaxWidth())
            Button(
                onClick = {
                    onSave { token ->
                        ProductPatch(
                            expectedUpdatedAt = token,
                            name = name.trim().takeIf { it != product.name },
                            shortDescription = shortDesc.trim().takeIf { it != product.shortDescription },
                            priceAmount = price.trim().takeIf { it != product.priceAmount },
                            brand = brand.trim().takeIf { it != (product.brand ?: "") },
                        )
                    }
                },
                enabled = !busy,
                modifier = Modifier.fillMaxWidth(),
            ) { Text(if (busy) "Saving…" else "Save") }
        }
    }
}
