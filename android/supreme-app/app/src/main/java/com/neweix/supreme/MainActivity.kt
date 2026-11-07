package com.neweix.supreme

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import kotlin.math.max

class MainActivity : Activity() {
    private var webView: WebView? = null
    private var progressBar: ProgressBar? = null
    private var errorPanel: LinearLayout? = null
    private var mainFrameLoadFailed = false
    private var backInvokedCallback: android.window.OnBackInvokedCallback? = null
    private var biometricPrompt: BiometricPrompt? = null
    private var lockOverlay: View? = null
    private var isUnlocked = false
    private var authInProgress = false
    private var hasLoadedPrivatePage = false

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val browser = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            settings.setSupportMultipleWindows(false)
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.safeBrowsingEnabled = true
            // Keep normal HTTP caching semantics: the protected dashboard sends
            // private/no-store headers, while versioned static assets may cache.
            // This forces every top-level navigation/reopen to revalidate remotely.
            settings.cacheMode = android.webkit.WebSettings.LOAD_DEFAULT

            CookieManager.getInstance().setAcceptCookie(true)
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    progressBar?.progress = newProgress
                    progressBar?.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                }
            }

            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(
                    view: WebView,
                    request: WebResourceRequest
                ): Boolean {
                    val uri = request.url
                    val host = uri.host?.lowercase()
                    if (
                        uri.scheme == "https" &&
                        (host == "neweix.com" || host == "www.neweix.com") &&
                        (uri.port == -1 || uri.port == 443) &&
                        uri.userInfo == null
                    ) {
                        val path = uri.encodedPath.orEmpty()
                        val privatePrefix = BuildConfig.SUPREME_PRIVATE_PATH
                        val allowedSupremeRoutes = listOf(
                            "/auth/supreme-login",
                            "/auth/mfa",
                            "/auth/mfa/setup",
                            "/auth/logout",
                        )
                        val isPrivateWorkspaceRoute =
                            path == privatePrefix || path.startsWith("$privatePrefix/") ||
                            path == "/supreme" || path.startsWith("/supreme/")
                        val isSupremeAuthRoute = allowedSupremeRoutes.any { route ->
                            path == route || path.startsWith("$route/")
                        }
                        if (isPrivateWorkspaceRoute || isSupremeAuthRoute) return false

                        // Never let this private app fall back to the customer
                        // storefront or shared staff sign-in. Return to its entry.
                        view.loadUrl(BuildConfig.SITE_ORIGIN + privatePrefix)
                        return true
                    }

                    // External web navigation is blocked; only device actions are handed off.
                    return openExternalUri(uri)
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    mainFrameLoadFailed = false
                    errorPanel?.visibility = View.GONE
                    progressBar?.visibility = View.VISIBLE
                    progressBar?.progress = 0
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    progressBar?.visibility = View.GONE
                    if (mainFrameLoadFailed) showLoadError()
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    if (request.isForMainFrame) {
                        mainFrameLoadFailed = true
                        showLoadError()
                    }
                }

                override fun onReceivedHttpError(
                    view: WebView,
                    request: WebResourceRequest,
                    errorResponse: android.webkit.WebResourceResponse
                ) {
                    if (request.isForMainFrame && errorResponse.statusCode >= 500) {
                        mainFrameLoadFailed = true
                        showLoadError()
                    }
                }

                override fun onReceivedSslError(
                    view: WebView,
                    handler: android.webkit.SslErrorHandler,
                    error: android.net.http.SslError
                ) {
                    // Never bypass certificate validation.
                    handler.cancel()
                    mainFrameLoadFailed = true
                    showLoadError()
                }
            }
        }

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (android.os.Build.VERSION.SDK_INT >= 29) {
            window.isNavigationBarContrastEnforced = false
        }

        val root = FrameLayout(this).apply {
            setBackgroundColor(Color.rgb(11, 18, 32))
        }
        val bar = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            isIndeterminate = false
            max = 100
            visibility = View.GONE
        }
        root.addView(
            browser,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        root.addView(
            bar,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                dp(3),
                Gravity.TOP
            )
        )

        val error = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(28), dp(28), dp(28))
            visibility = View.GONE
            addView(TextView(this@MainActivity).apply {
                text = "সংযোগ পাওয়া যাচ্ছে না। ইন্টারনেট পরীক্ষা করে আবার চেষ্টা করুন।"
                textSize = 16f
                gravity = Gravity.CENTER
            })
            addView(Button(this@MainActivity).apply {
                text = "আবার চেষ্টা করুন"
                setOnClickListener {
                    visibility = View.GONE
                    browser.reload()
                }
            })
        }
        root.addView(
            error,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )

        val privacyShield = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
            setBackgroundColor(Color.rgb(11, 18, 32))
            addView(TextView(this@MainActivity).apply {
                text = "SUPREME"
                textSize = 28f
                setTextColor(Color.rgb(212, 175, 55))
                gravity = Gravity.CENTER
            })
            addView(TextView(this@MainActivity).apply {
                text = "Authenticate to unlock"
                textSize = 15f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
            })
        }
        root.addView(
            privacyShield,
            FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        )
        lockOverlay = privacyShield

        ViewCompat.setOnApplyWindowInsetsListener(root) { view, insets ->
            val safe = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout()
            )
            val ime = insets.getInsets(WindowInsetsCompat.Type.ime())
            view.setPadding(safe.left, safe.top, safe.right, max(safe.bottom, ime.bottom))
            insets
        }

        webView = browser
        progressBar = bar
        errorPanel = error
        setContentView(root)
        ViewCompat.requestApplyInsets(root)

        // Android 13+ predictive/system back must use the platform dispatcher.
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            val callback = android.window.OnBackInvokedCallback { handleBack() }
            backInvokedCallback = callback
            onBackInvokedDispatcher.registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,
                callback
            )
        }

        val privatePath = BuildConfig.SUPREME_PRIVATE_PATH
        if (!Regex("^/control-[A-Fa-f0-9]{48}$").matches(privatePath)) {
            showMessage("Supreme app is not configured. Please install the official build.")
            return
        }
        configureAppLock()
        authenticateToUnlock()
    }


    private fun configureAppLock() {
        biometricPrompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    authInProgress = false
                    val wasUnlocked = isUnlocked
                    isUnlocked = true
                    lockOverlay?.visibility = View.GONE
                    if (!hasLoadedPrivatePage) {
                        hasLoadedPrivatePage = true
                        // Do not restore a saved WebView document. Load the current
                        // private server route only after local device authentication.
                        webView?.loadUrl(BuildConfig.SITE_ORIGIN + BuildConfig.SUPREME_PRIVATE_PATH)
                    } else if (!wasUnlocked) {
                        webView?.reload()
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    authInProgress = false
                    isUnlocked = false
                    lockOverlay?.visibility = View.VISIBLE
                    if (errorCode != BiometricPrompt.ERROR_USER_CANCELED &&
                        errorCode != BiometricPrompt.ERROR_NEGATIVE_BUTTON
                    ) {
                        showMessage("Device authentication is required to open Supreme.")
                    }
                }

                override fun onAuthenticationFailed() {
                    // Keep the system prompt open; no app content is revealed.
                }
            }
        )
    }

    private fun authenticateToUnlock() {
        if (isUnlocked || authInProgress) return
        val prompt = biometricPrompt ?: return
        authInProgress = true
        lockOverlay?.visibility = View.VISIBLE
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Unlock Supreme")
            .setSubtitle("Use your fingerprint or your phone's screen lock PIN")
            .setDescription("Your device credential stays on your phone.")
            .setDeviceCredentialAllowed(true)
            .build()
        prompt.authenticate(promptInfo)
    }

    override fun onStop() {
        super.onStop()
        if (!isChangingConfigurations) {
            isUnlocked = false
            authInProgress = false
            lockOverlay?.visibility = View.VISIBLE
        }
    }

    override fun onResume() {
        super.onResume()
        if (webView != null && !isUnlocked) authenticateToUnlock()
    }

    private fun openExternalUri(uri: Uri): Boolean {
        return try {
            val intent = when (uri.scheme?.lowercase()) {
                "tel" -> Intent(Intent.ACTION_DIAL, uri)
                "mailto" -> Intent(Intent.ACTION_SENDTO, uri)
                else -> return true
            }
            startActivity(intent)
            true
        } catch (_: Exception) {
            true
        }
    }

    private fun showLoadError() {
        progressBar?.visibility = View.GONE
        errorPanel?.visibility = View.VISIBLE
    }

    private fun showMessage(message: String) {
        setContentView(TextView(this).apply {
            text = message
            textSize = 16f
            gravity = Gravity.CENTER
            setPadding(dp(32), dp(32), dp(32), dp(32))
        })
    }

    private fun dp(value: Int): Int =
        (value * resources.displayMetrics.density).toInt()

    private fun handleBack() {
        val browser = webView
        if (errorPanel?.visibility == View.VISIBLE) {
            errorPanel?.visibility = View.GONE
            if (browser?.canGoBack() == true) browser.goBack() else super.onBackPressed()
        } else if (browser?.canGoBack() == true) {
            browser.goBack()
        } else {
            super.onBackPressed()
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // Android 12 and earlier use the legacy Activity callback.
        if (android.os.Build.VERSION.SDK_INT < 33) handleBack()
        else super.onBackPressed()
    }

    override fun onDestroy() {
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            backInvokedCallback?.let(onBackInvokedDispatcher::unregisterOnBackInvokedCallback)
        }
        backInvokedCallback = null
        webView?.apply {
            stopLoading()
            webChromeClient = null
            webViewClient = WebViewClient()
            destroy()
        }
        webView = null
        biometricPrompt = null
        lockOverlay = null
        progressBar = null
        errorPanel = null
        super.onDestroy()
    }
}
