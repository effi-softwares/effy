package com.effyshopping.shop.mobile.features.catalog.presentation

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.shop.mobile.core.draft.DraftStore
import com.effyshopping.shop.mobile.core.error.AppError
import com.effyshopping.shop.mobile.core.error.AppException
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeDef
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeInput
import com.effyshopping.shop.mobile.features.catalog.domain.AttributeType
import com.effyshopping.shop.mobile.features.catalog.domain.CatalogSchema
import com.effyshopping.shop.mobile.features.catalog.domain.CreateProduct
import com.effyshopping.shop.mobile.features.catalog.domain.GetCatalogSchema
import com.effyshopping.shop.mobile.features.catalog.domain.NewProduct
import com.effyshopping.shop.mobile.features.catalog.domain.ProductType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/** The device-local create draft (FR-012) — serialized to one [DraftStore] slot, restored on reopen. */
@Serializable
data class ProductDraft(
    val stepOrdinal: Int = 0,
    val name: String = "",
    val shortDescription: String = "",
    val longDescription: String = "",
    val brand: String = "",
    val sku: String = "",
    val gtin: String = "",
    val priceAmount: String = "",
    val compareAtAmount: String = "",
    val productTypeId: String? = null,
    val primaryCategoryId: String? = null,
    val attributes: Map<String, DraftAttr> = emptyMap(),
)

/** One attribute's in-progress value in the draft. Numbers are kept as text and parsed on submit. */
@Serializable
data class DraftAttr(
    val text: String? = null,
    val number: String? = null,
    val bool: Boolean? = null,
    val options: List<String> = emptyList(),
)

private val draftJson = Json { ignoreUnknownKeys = true; encodeDefaults = true }

/**
 * The schema-driven create flow (016 US2). A multi-step [ModalBottomSheet] whose whole in-progress state
 * lives in [UiState.draft] — persisted to the [DraftStore] on every edit and restored on reopen, cleared on
 * publish or discard. The attribute step is DYNAMIC: it renders exactly the attributes the chosen product
 * type declares (FR-011), each with the control its data type calls for. Validation is a courtesy here; the
 * backend is authoritative (missing mandatory / typed / SKU checks).
 *
 * MVVM: explicit collaborators (not the container); the View is a pure function of the immutable [UiState].
 */
class CreateViewModel(
    private val getCatalogSchema: GetCatalogSchema,
    private val createProduct: CreateProduct,
    private val draftStore: DraftStore,
) : ViewModel() {
    enum class Step { BASICS, CLASSIFY, ATTRIBUTES, REVIEW }

    data class UiState(
        val loadingSchema: Boolean = true,
        val schema: CatalogSchema? = null,
        val step: Step = Step.BASICS,
        val draft: ProductDraft = ProductDraft(),
        val submitting: Boolean = false,
        val error: String? = null,
        val createdId: String? = null,
    ) {
        val selectedType: ProductType?
            get() = schema?.productTypes?.firstOrNull { it.id == draft.productTypeId }

        /** The attributes to render on the ATTRIBUTES step (empty until a type is chosen). */
        val typeAttributes: List<AttributeDef> get() = selectedType?.attributes.orEmpty()

        val basicsValid: Boolean
            get() = draft.name.isNotBlank() && draft.shortDescription.isNotBlank() && draft.priceAmount.isNotBlank()

        val classifyValid: Boolean get() = draft.productTypeId != null && draft.primaryCategoryId != null

        val mandatoryValid: Boolean
            get() = typeAttributes.filter { it.isMandatory }.all { hasValue(draft.attributes[it.attributeId], it.type) }

        val canSubmit: Boolean get() = basicsValid && classifyValid && mandatoryValid
    }

    private val _state = MutableStateFlow(UiState())
    val state = _state.asStateFlow()

    init {
        // Restore any device-local draft BEFORE loading the schema (the whole point of FR-012).
        draftStore.read()?.let { raw ->
            runCatching { draftJson.decodeFromString(ProductDraft.serializer(), raw) }.getOrNull()?.let { d ->
                _state.value = _state.value.copy(draft = d, step = Step.entries.getOrElse(d.stepOrdinal) { Step.BASICS })
            }
        }
        loadSchema()
    }

    private fun loadSchema() {
        _state.value = _state.value.copy(loadingSchema = true, error = null)
        viewModelScope.launch {
            try {
                _state.value = _state.value.copy(schema = getCatalogSchema(), loadingSchema = false)
            } catch (e: AppException) {
                _state.value = _state.value.copy(loadingSchema = false, error = messageFor(e.error))
            }
        }
    }

    // ── field edits (each persists the draft) ───────────────────────────────────────────────────────
    fun onName(v: String) = edit { it.copy(name = v) }
    fun onShortDescription(v: String) = edit { it.copy(shortDescription = v) }
    fun onLongDescription(v: String) = edit { it.copy(longDescription = v) }
    fun onBrand(v: String) = edit { it.copy(brand = v) }
    fun onSku(v: String) = edit { it.copy(sku = v) }
    fun onGtin(v: String) = edit { it.copy(gtin = v) }
    fun onPrice(v: String) = edit { it.copy(priceAmount = v) }
    fun onCompareAt(v: String) = edit { it.copy(compareAtAmount = v) }
    fun selectType(id: String) = edit { it.copy(productTypeId = id) }
    fun selectCategory(id: String) = edit { it.copy(primaryCategoryId = id) }

    fun setAttrText(attributeId: String, v: String) = editAttr(attributeId) { it.copy(text = v) }
    fun setAttrNumber(attributeId: String, v: String) = editAttr(attributeId) { it.copy(number = v) }
    fun setAttrBool(attributeId: String, v: Boolean) = editAttr(attributeId) { it.copy(bool = v) }
    fun toggleOption(attributeId: String, value: String, single: Boolean) = editAttr(attributeId) { cur ->
        val next = when {
            single -> listOf(value)
            cur.options.contains(value) -> cur.options - value
            else -> cur.options + value
        }
        cur.copy(options = next)
    }

    fun goTo(step: Step) {
        val draft = _state.value.draft.copy(stepOrdinal = step.ordinal)
        _state.value = _state.value.copy(step = step, draft = draft, error = null)
        persist(draft)
    }
    fun next() { val s = _state.value.step.ordinal; if (s < Step.entries.lastIndex) goTo(Step.entries[s + 1]) }
    fun back() { val s = _state.value.step.ordinal; if (s > 0) goTo(Step.entries[s - 1]) }

    /** Publish the draft as a product; on success clear the device draft and surface the new id. */
    fun submit() {
        if (!_state.value.canSubmit) return
        _state.value = _state.value.copy(submitting = true, error = null)
        viewModelScope.launch {
            try {
                val created = createProduct(_state.value.draft.toNewProduct(_state.value.typeAttributes))
                draftStore.clear()
                _state.value = _state.value.copy(submitting = false, createdId = created.id)
            } catch (e: AppException) {
                _state.value = _state.value.copy(submitting = false, error = messageFor(e.error))
            }
        }
    }

    /** Throw away the in-progress draft (device + memory) so the next open starts clean. */
    fun discard() {
        draftStore.clear()
        _state.value = _state.value.copy(draft = ProductDraft(), step = Step.BASICS, error = null)
    }

    private inline fun edit(persist: Boolean = true, transform: (ProductDraft) -> ProductDraft): Unit {
        val next = transform(_state.value.draft).copy(stepOrdinal = _state.value.step.ordinal)
        _state.value = _state.value.copy(draft = next, error = null)
        if (persist) persist(next)
    }

    private inline fun editAttr(attributeId: String, transform: (DraftAttr) -> DraftAttr) = edit {
        it.copy(attributes = it.attributes + (attributeId to transform(it.attributes[attributeId] ?: DraftAttr())))
    }

    private fun persist(draft: ProductDraft) {
        runCatching { draftStore.write(draftJson.encodeToString(ProductDraft.serializer(), draft)) }
    }

    private fun messageFor(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        AppError.Conflict -> "That didn't save — the SKU may already be in use."
        AppError.Network -> "No connection. Your draft is safe — try again."
        AppError.Forbidden -> "You don't have access to do that."
        else -> "Something went wrong. Your draft is safe — try again."
    }
}

/** Draft → the create payload. Only attributes that actually carry a value are sent. */
private fun ProductDraft.toNewProduct(defs: List<AttributeDef>): NewProduct = NewProduct(
    name = name.trim(),
    shortDescription = shortDescription.trim(),
    priceAmount = priceAmount.trim(),
    primaryCategoryId = primaryCategoryId!!,
    productTypeId = productTypeId!!,
    longDescription = longDescription.ifBlank { null },
    sku = sku.ifBlank { null },
    brand = brand.ifBlank { null },
    gtin = gtin.ifBlank { null },
    compareAtAmount = compareAtAmount.ifBlank { null },
    attributes = defs.mapNotNull { def ->
        val v = attributes[def.attributeId] ?: return@mapNotNull null
        if (!hasValue(v, def.type)) return@mapNotNull null
        AttributeInput(
            attributeId = def.attributeId,
            valueBoolean = if (def.type == AttributeType.BOOLEAN) v.bool else null,
            valueNumber = if (def.type == AttributeType.NUMBER) v.number?.toDoubleOrNull() else null,
            valueOptions = if (def.type == AttributeType.SINGLE_SELECT || def.type == AttributeType.MULTI_SELECT) v.options else null,
            valueText = if (def.type == AttributeType.SHORT_TEXT || def.type == AttributeType.LONG_TEXT) v.text else null,
        )
    },
)

/** Whether a draft value is present for the given type (drives mandatory validation + payload inclusion). */
internal fun hasValue(v: DraftAttr?, type: AttributeType): Boolean = when (type) {
    AttributeType.BOOLEAN -> v?.bool != null
    AttributeType.NUMBER -> v?.number?.toDoubleOrNull() != null
    AttributeType.SINGLE_SELECT, AttributeType.MULTI_SELECT -> !v?.options.isNullOrEmpty()
    AttributeType.SHORT_TEXT, AttributeType.LONG_TEXT -> !v?.text.isNullOrBlank()
}

// ── UI ─────────────────────────────────────────────────────────────────────────────────────────────

/**
 * The create bottom sheet. Opened from the catalog list; [onCreated] fires with the new id (the caller
 * closes the sheet + refreshes the list), [onDismiss] closes it (the draft persists for next time).
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProductCreateSheet(
    vm: CreateViewModel,
    onCreated: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val state by vm.state.collectAsState()
    val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)

    LaunchedEffect(state.createdId) { state.createdId?.let(onCreated) }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 24.dp).padding(bottom = 24.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text("New product", style = MaterialTheme.typography.headlineSmall)
            Text(stepLabel(state.step), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.primary)
            HorizontalDivider()

            if (state.loadingSchema) {
                CircularProgressIndicator()
            } else when (state.step) {
                CreateViewModel.Step.BASICS -> BasicsStep(state, vm)
                CreateViewModel.Step.CLASSIFY -> ClassifyStep(state, vm)
                CreateViewModel.Step.ATTRIBUTES -> AttributesStep(state, vm)
                CreateViewModel.Step.REVIEW -> ReviewStep(state)
            }

            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error) }
            HorizontalDivider()
            StepControls(state, vm, onDismiss)
        }
    }
}

@Composable
private fun BasicsStep(state: CreateViewModel.UiState, vm: CreateViewModel) {
    val d = state.draft
    Field("Name", d.name, vm::onName)
    Field("Short description", d.shortDescription, vm::onShortDescription)
    Field("Brand (optional)", d.brand, vm::onBrand)
    Field("Price", d.priceAmount, vm::onPrice, KeyboardType.Decimal)
    Field("Compare-at price (optional)", d.compareAtAmount, vm::onCompareAt, KeyboardType.Decimal)
    Field("SKU (optional)", d.sku, vm::onSku)
}

@Composable
private fun ClassifyStep(state: CreateViewModel.UiState, vm: CreateViewModel) {
    val schema = state.schema ?: return
    Text("Product type", style = MaterialTheme.typography.titleSmall)
    ChipFlow(schema.productTypes.map { it.id to it.name }, state.draft.productTypeId, vm::selectType)
    HorizontalDivider()
    Text("Category", style = MaterialTheme.typography.titleSmall)
    ChipFlow(schema.categories.map { it.id to it.name }, state.draft.primaryCategoryId, vm::selectCategory)
}

@Composable
private fun AttributesStep(state: CreateViewModel.UiState, vm: CreateViewModel) {
    val defs = state.typeAttributes
    if (defs.isEmpty()) {
        Text("This type has no extra attributes.", style = MaterialTheme.typography.bodyMedium)
        return
    }
    defs.forEach { def ->
        val label = def.name + if (def.isMandatory) " *" else ""
        val v = state.draft.attributes[def.attributeId]
        when (def.type) {
            AttributeType.BOOLEAN -> Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(label, style = MaterialTheme.typography.bodyLarge)
                Switch(checked = v?.bool == true, onCheckedChange = { vm.setAttrBool(def.attributeId, it) })
            }
            AttributeType.NUMBER -> Field(
                label + (def.unit?.let { " ($it)" } ?: ""), v?.number ?: "",
                { vm.setAttrNumber(def.attributeId, it) }, KeyboardType.Decimal,
            )
            AttributeType.SHORT_TEXT, AttributeType.LONG_TEXT ->
                Field(label, v?.text ?: "", { vm.setAttrText(def.attributeId, it) })
            AttributeType.SINGLE_SELECT, AttributeType.MULTI_SELECT -> {
                Text(label, style = MaterialTheme.typography.titleSmall)
                val single = def.type == AttributeType.SINGLE_SELECT
                ChipFlowMulti(def.allowedValues.map { it.value to it.label }, v?.options.orEmpty()) {
                    vm.toggleOption(def.attributeId, it, single)
                }
            }
        }
        def.helpText?.let { Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant) }
    }
}

@Composable
private fun ReviewStep(state: CreateViewModel.UiState) {
    val d = state.draft
    DetailLine("Name", d.name)
    DetailLine("Type", state.selectedType?.name ?: "—")
    DetailLine("Category", state.schema?.categories?.firstOrNull { it.id == d.primaryCategoryId }?.name ?: "—")
    DetailLine("Price", d.priceAmount)
    if (!state.canSubmit) {
        Text("Fill in name, description, price, type, category and any required attributes to publish.",
            style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun StepControls(state: CreateViewModel.UiState, vm: CreateViewModel, onDismiss: () -> Unit) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        if (state.step != CreateViewModel.Step.BASICS) {
            TextButton(onClick = vm::back) { Text("Back") }
        }
        if (state.step != CreateViewModel.Step.REVIEW) {
            Button(onClick = vm::next, modifier = Modifier.fillMaxWidth()) { Text("Next") }
        } else {
            Button(onClick = vm::submit, enabled = state.canSubmit && !state.submitting, modifier = Modifier.fillMaxWidth()) {
                Text(if (state.submitting) "Publishing…" else "Publish")
            }
        }
    }
    TextButton(onClick = { vm.discard(); onDismiss() }) { Text("Discard draft") }
}

@Composable
private fun Field(
    label: String,
    value: String,
    onChange: (String) -> Unit,
    keyboard: KeyboardType = KeyboardType.Text,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onChange,
        label = { Text(label) },
        singleLine = keyboard != KeyboardType.Text,
        keyboardOptions = KeyboardOptions(keyboardType = keyboard),
        modifier = Modifier.fillMaxWidth(),
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChipFlow(options: List<Pair<String, String>>, selected: String?, onSelect: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (id, name) ->
            FilterChip(selected = id == selected, onClick = { onSelect(id) }, label = { Text(name) })
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun ChipFlowMulti(options: List<Pair<String, String>>, selected: List<String>, onToggle: (String) -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        options.forEach { (value, label) ->
            FilterChip(selected = selected.contains(value), onClick = { onToggle(value) }, label = { Text(label) })
        }
    }
}

@Composable
internal fun DetailLine(label: String, value: String) {
    Column(modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp)) {
        Text(label, style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Text(value.ifBlank { "—" }, style = MaterialTheme.typography.bodyLarge)
    }
}

private fun stepLabel(step: CreateViewModel.Step): String = when (step) {
    CreateViewModel.Step.BASICS -> "Step 1 of 4 · Basics"
    CreateViewModel.Step.CLASSIFY -> "Step 2 of 4 · Type & category"
    CreateViewModel.Step.ATTRIBUTES -> "Step 3 of 4 · Attributes"
    CreateViewModel.Step.REVIEW -> "Step 4 of 4 · Review"
}
