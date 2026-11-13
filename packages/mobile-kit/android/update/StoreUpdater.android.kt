package com.effyshopping.mobile.kit.update

import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.IntentSenderRequest
import androidx.activity.result.contract.ActivityResultContracts
import com.google.android.play.core.appupdate.AppUpdateInfo
import com.google.android.play.core.appupdate.AppUpdateManager
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.appupdate.AppUpdateOptions
import com.google.android.play.core.install.InstallStateUpdatedListener
import com.google.android.play.core.install.model.AppUpdateType
import com.google.android.play.core.install.model.InstallStatus
import com.google.android.play.core.install.model.UpdateAvailability
import com.google.android.play.core.ktx.requestAppUpdateInfo
import java.lang.ref.WeakReference

/**
 * Android's way to update (121, research R5): Google Play In-App Updates when the app was installed from Play, the Play
 * page otherwise.
 *
 * One per process (made in the Application, handed to the `AppContainer`). The activity must call [attach] in
 * `onCreate` - the result launcher has to be registered before the activity starts - and [onResume] from `onResume`,
 * which resumes an immediate update Play was in the middle of, and reports a background download that finished while
 * the app was away.
 */
class AndroidStoreUpdater(context: Context) : StoreUpdater {
    private val appContext = context.applicationContext
    private val manager: AppUpdateManager by lazy { AppUpdateManagerFactory.create(appContext) }
    private var activityRef: WeakReference<ComponentActivity>? = null
    private var launcher: ActivityResultLauncher<IntentSenderRequest>? = null
    private var listener: InstallStateUpdatedListener? = null
    private var onDownloaded: (() -> Unit)? = null

    override val platform = AppPlatform.Android

    /** From the activity's `onCreate`. The result is not needed: Play restarts the app on success, and a cancelled
     * mandatory update leaves the mandatory screen showing. */
    fun attach(activity: ComponentActivity) {
        activityRef = WeakReference(activity)
        launcher = activity.registerForActivityResult(ActivityResultContracts.StartIntentSenderForResult()) { }
    }

    /** From the activity's `onResume`. */
    suspend fun onResume() {
        val info = info() ?: return
        if (info.updateAvailability() == UpdateAvailability.DEVELOPER_TRIGGERED_UPDATE_IN_PROGRESS) {
            launcher?.let { manager.startUpdateFlowForResult(info, it, AppUpdateOptions.newBuilder(AppUpdateType.IMMEDIATE).build()) }
        }
        if (info.installStatus() == InstallStatus.DOWNLOADED) onDownloaded?.invoke()
    }

    override suspend fun isStoreInstall(): Boolean = runCatching {
        val pm = appContext.packageManager
        val installer = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            pm.getInstallSourceInfo(appContext.packageName).installingPackageName
        } else {
            @Suppress("DEPRECATION")
            pm.getInstallerPackageName(appContext.packageName)
        }
        installer == PLAY_STORE
    }.getOrDefault(false)

    override suspend fun updateAvailable(): Boolean? =
        info()?.let { it.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE }

    override suspend fun startImmediate(): Boolean = start(AppUpdateType.IMMEDIATE)

    override suspend fun startFlexible(onDownloaded: () -> Unit): Boolean {
        this.onDownloaded = onDownloaded
        if (listener == null) {
            val l = InstallStateUpdatedListener { state ->
                if (state.installStatus() == InstallStatus.DOWNLOADED) this.onDownloaded?.invoke()
            }
            manager.registerListener(l)
            listener = l
        }
        return start(AppUpdateType.FLEXIBLE)
    }

    override fun completeFlexible() {
        manager.completeUpdate()
    }

    override fun openStore(storeUrl: String?) {
        storeUrl ?: return
        val context = activityRef?.get() ?: appContext
        val market = Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=${appContext.packageName}"))
        val web = Intent(Intent.ACTION_VIEW, Uri.parse(storeUrl))
        for (intent in listOf(market, web)) {
            if (context !is ComponentActivity) intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            try {
                context.startActivity(intent)
                return
            } catch (_: ActivityNotFoundException) {
                // no Play Store app: try the web page
            }
        }
    }

    override fun leaveApp() {
        activityRef?.get()?.moveTaskToBack(true)
    }

    private suspend fun info(): AppUpdateInfo? = runCatching { manager.requestAppUpdateInfo() }.getOrNull()

    private suspend fun start(type: Int): Boolean {
        if (!isStoreInstall()) return false
        val launcher = launcher ?: return false
        val info = info() ?: return false
        if (info.updateAvailability() != UpdateAvailability.UPDATE_AVAILABLE) return false
        val options = AppUpdateOptions.newBuilder(type).build()
        if (!info.isUpdateTypeAllowed(options)) return false
        return runCatching { manager.startUpdateFlowForResult(info, launcher, options) }.getOrDefault(false)
    }

    private companion object {
        const val PLAY_STORE = "com.android.vending"
    }
}
