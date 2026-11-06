package com.neweix.supreme

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
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

class MainActivity : Activity() {
    private var webView: WebView? = null
    private var progressBar: ProgressBar? = null
    private var errorPanel: LinearLayout? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val privatePath = BuildConfig.SUPREME_PRIVATE_PATH
        if (!Regex("^/control-[A-Fa-f0-9]{48}$").matches(privatePath)) {
            showMessage("Supreme app is not configured. Please install the official build.")
            return
        }

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
                        return false
                    }

                    // Hand external web pages and supported device actions to Android.
                    return openExternalUri(uri)
                }

                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    errorPanel?.visibility = View.GONE
                    progressBar?.visibility = View.VISIBLE
                    progressBar?.progress = 0
                }

                override fun onPageFinished(view: WebView?, url: String?) {
                    progressBar?.visibility = View.GONE
                }

                override fun onReceivedError(
                    view: WebView,
                    request: WebResourceRequest,
                    error: WebResourceError
                ) {
                    if (request.isForMainFrame) showLoadError()
                }

                override fun onReceivedSslError(
                    view: WebView,
                    handler: android.webkit.SslErrorHandler,
                    error: android.net.http.SslError
                ) {
                    // Never bypass certificate validation.
                    handler.cancel()
                    showLoadError()
                }
            }
        }

        val root = FrameLayout(this)
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

        webView = browser
        progressBar = bar
        errorPanel = error
        setContentView(root)

        if (savedInstanceState != null && browser.restoreState(savedInstanceState) == null) {
            browser.loadUrl(BuildConfig.SITE_ORIGIN + privatePath)
        } else if (savedInstanceState == null) {
            browser.loadUrl(BuildConfig.SITE_ORIGIN + privatePath)
        }
    }

    private fun openExternalUri(uri: Uri): Boolean {
        return try {
            val intent = when (uri.scheme?.lowercase()) {
                "https", "http" -> Intent(Intent.ACTION_VIEW, uri)
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

    override fun onSaveInstanceState(outState: Bundle) {
        webView?.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
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

    override fun onDestroy() {
        webView?.apply {
            stopLoading()
            webChromeClient = null
            webViewClient = WebViewClient()
            destroy()
        }
        webView = null
        progressBar = null
        errorPanel = null
        super.onDestroy()
    }
}
