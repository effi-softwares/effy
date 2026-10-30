package com.effyshopping.customer.mobile.features.account.presentation

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.text.input.KeyboardType
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.effyshopping.customer.mobile.app.AppContainer
import com.effyshopping.customer.mobile.core.error.AppError
import com.effyshopping.customer.mobile.core.error.AppException
import com.effyshopping.customer.mobile.core.presentation.EffyAppBar
import com.effyshopping.customer.mobile.core.presentation.EffyField
import com.effyshopping.customer.mobile.core.presentation.EffyHairline
import com.effyshopping.customer.mobile.core.presentation.EffyMinTouchTarget
import com.effyshopping.customer.mobile.core.presentation.EffyPrimaryButton
import com.effyshopping.customer.mobile.core.presentation.EffySheet
import com.effyshopping.customer.mobile.core.presentation.EffyValueRow
import com.effyshopping.customer.mobile.core.session.SessionWriter
import com.effyshopping.customer.mobile.features.account.domain.Customer
import com.effyshopping.customer.mobile.features.account.domain.UpdateProfile
import com.effyshopping.mobile.design.EffySpacing
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Personal info as detail rows with no input fields; a row opens a sheet holding that one value, so a row
 * can show a verified, "managed by Google" or pending state. Its own ViewModel, so its errors cannot leak
 * onto other account screens.
 */

/** Which detail the sheet is currently editing. `null` = the sheet is closed. */
enum class EditableDetail { GIVEN, FAMILY, PHONE }

data class PersonalDetailsUiState(
    val saving: Boolean = false,
    val error: String? = null,
)

class PersonalDetailsViewModel(
    private val updateProfileUseCase: UpdateProfile,
    private val session: SessionWriter,
) : ViewModel() {
    private val _state = MutableStateFlow(PersonalDetailsUiState())
    val state = _state.asStateFlow()

    /**
     * Save one edited detail, carrying the others through unchanged.
     *
     * Every field is sent, not just the edited one - the backend's PATCH writes the columns it
     * names, so an omitted field would be cleared. `""` means "cleared"; a `null` would be dropped by
     * `explicitNulls = false` and the clear would silently no-op.
     *
     * [onSaved] fires only on success. A failed save must leave the sheet open with
     * what the shopper typed still in it - including when the failure is an expired session, where the
     * temptation to close and bounce to sign-in would discard their work on the way.
     */
    fun save(customer: Customer, field: EditableDetail, value: String, onSaved: () -> Unit) {
        _state.value = PersonalDetailsUiState(saving = true)
        viewModelScope.launch {
            try {
                val updated = updateProfileUseCase(
                    given = if (field == EditableDetail.GIVEN) value else customer.name.given.orEmpty(),
                    family = if (field == EditableDetail.FAMILY) value else customer.name.family.orEmpty(),
                    phone = if (field == EditableDetail.PHONE) value else customer.phone.orEmpty(),
                )
                session.setAuthenticated(updated)
                onSaved()
            } catch (e: AppException) {
                _state.value = PersonalDetailsUiState(error = message(e.error))
                if (e.error == AppError.Forbidden) session.setBarred()
            } finally {
                _state.value = _state.value.copy(saving = false)
            }
        }
    }

    fun clearError() {
        _state.value = _state.value.copy(error = null)
    }

    private fun message(e: AppError): String = when (e) {
        is AppError.Validation -> e.message
        is AppError.RateLimited -> "Too many attempts. Please wait a little and try again."
        AppError.Network -> "No connection. Check your network and try again."
        AppError.Forbidden -> "This account can't be used."
        // The sheet stays open on this, so the typed value survives the trip to sign-in.
        AppError.Unauthenticated -> "Your session expired. Sign in again, then save."
        AppError.NotFound -> "We couldn't find that."
        AppError.Unavailable -> "We're having trouble right now. Try again shortly."
        else -> "Something went wrong. Try again."
    }
}

@Composable
fun PersonalDetailsScreen(container: AppContainer, customer: Customer) {
    val vm = viewModel { PersonalDetailsViewModel(container.updateProfile, container.session) }
    val state by vm.state.collectAsState()

    // `rememberSaveable`: the open field and its text survive process death, which a ViewModel does not.
    var editing by rememberSaveable { mutableStateOf<EditableDetail?>(null) }
    var draft by rememberSaveable { mutableStateOf("") }
    var emailNoted by rememberSaveable { mutableStateOf(false) }

    Column(modifier = Modifier.fillMaxSize()) {
        EffyAppBar(title = "Personal info", onBack = { container.navigator.pop() })

        Column(modifier = Modifier.fillMaxWidth().verticalScroll(rememberScrollState())) {
            EffyValueRow("First name", customer.name.given, {
                draft = customer.name.given.orEmpty(); editing = EditableDetail.GIVEN
            })
            EffyHairline()
            EffyValueRow("Last name", customer.name.family, {
                draft = customer.name.family.orEmpty(); editing = EditableDetail.FAMILY
            })
            EffyHairline()

            // No verified indicator. The value is self-asserted and this feature never
            // verifies it, so a tick would be a claim the platform cannot support - and one a shopper
            // would reasonably rely on.
            EffyValueRow("Phone number", customer.phone, {
                draft = customer.phone.orEmpty(); editing = EditableDetail.PHONE
            })
            EffyHairline()

            // Shown, not editable, and activating it explains why. A row that silently
            // ignores a tap is indistinguishable from a broken one: the shopper taps twice, then
            // reports a bug. Changing an email is an identity operation, not a profile edit.
            EffyValueRow(
                label = "Email",
                value = customer.email,
                onClick = { emailNoted = true },
                editable = false,
                trailingNote = "Can't be changed",
            )
            // 087 (Personal info board) - the reason is said up front, under the row, not only on a tap.
            Text(
                "Your email is how you sign in. To change it, contact us.",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = EffySpacing.lg).padding(bottom = EffySpacing.s),
            )
            EffyHairline()

            if (emailNoted) {
                Text(
                    "Your email address is how you sign in, so it can't be changed here. " +
                        "Contact support if you need to move your account to a different address.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = EffySpacing.lg, vertical = EffySpacing.md),
                )
            }
        }
    }

    editing?.let { field ->
        val original = when (field) {
            EditableDetail.GIVEN -> customer.name.given.orEmpty()
            EditableDetail.FAMILY -> customer.name.family.orEmpty()
            EditableDetail.PHONE -> customer.phone.orEmpty()
        }
        DetailEditSheet(
            // 087 (board) - the phone sheet names the field "Mobile number" and says what it is for.
            label = if (field == EditableDetail.PHONE) "Mobile number" else null,
            helper = if (field == EditableDetail.PHONE) "We'll only call or text about a delivery." else null,
            title = when (field) {
                EditableDetail.GIVEN -> "First name"
                EditableDetail.FAMILY -> "Last name"
                EditableDetail.PHONE -> "Phone number"
            },
            value = draft,
            onValueChange = { draft = it },
            original = original,
            keyboard = if (field == EditableDetail.PHONE) KeyboardType.Phone else KeyboardType.Text,
            saving = state.saving,
            error = state.error,
            onDismiss = { editing = null; vm.clearError() },
            onSave = { vm.save(customer, field, draft) { editing = null } },
        )
    }
}

/**
 * The single-field sheet. The value is hoisted to the caller so it can be `rememberSaveable` there. The
 * dirty flag goes to [EffySheet], which intercepts all three dismissal routes (drag, scrim, system back).
 */
@Composable
private fun DetailEditSheet(
    label: String?,
    helper: String?,
    title: String,
    value: String,
    onValueChange: (String) -> Unit,
    original: String,
    keyboard: KeyboardType,
    saving: Boolean,
    error: String?,
    onDismiss: () -> Unit,
    onSave: () -> Unit,
) {
    val focus = remember { FocusRequester() }

    // Focused with the keyboard up, without a second interaction.
    LaunchedEffect(title) { focus.requestFocus() }

    EffySheet(
        title = title,
        onDismiss = onDismiss,
        dirty = value != original,
        primaryLabel = "Save",
        onPrimary = onSave,
        primaryEnabled = !saving,
    ) {
        // No label that repeats the title - the sheet already says "First name"; printing it twice
        // is what the first build shipped. The phone's label differs ("Mobile number"), so it stays.
        EffyField(
            label = label,
            value = value,
            onValueChange = onValueChange,
            error = error,
            keyboardOptions = KeyboardOptions(keyboardType = keyboard),
            modifier = Modifier.focusRequester(focus),
        )
        helper?.let {
            Text(it, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }
}
