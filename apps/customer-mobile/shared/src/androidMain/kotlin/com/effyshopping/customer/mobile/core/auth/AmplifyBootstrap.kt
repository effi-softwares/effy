package com.effyshopping.customer.mobile.core.auth

import android.content.Context
import com.amplifyframework.auth.cognito.AWSCognitoAuthPlugin
import com.amplifyframework.core.Amplify
import com.amplifyframework.core.configuration.AmplifyOutputs
import com.effyshopping.customer.mobile.core.config.buildAmplifyOutputsJson

/**
 * Configures Amplify Android from the in-code config string (no `amplifyconfiguration.json`, D12).
 * Lives in `:shared` so Amplify stays an implementation detail — `:androidApp` never imports the SDK.
 */
object AmplifyBootstrap {
    fun configure(context: Context) {
        Amplify.addPlugin(AWSCognitoAuthPlugin())
        Amplify.configure(AmplifyOutputs.fromString(buildAmplifyOutputsJson()), context)
    }
}
