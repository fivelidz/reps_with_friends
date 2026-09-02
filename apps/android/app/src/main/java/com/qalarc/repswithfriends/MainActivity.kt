package com.qalarc.repswithfriends

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Bundle
import android.webkit.JavascriptInterface
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * Reps With Friends — native Android shell around https://rwf.qalarc.com/figma-app
 *
 * Minimal WebView wrapper:
 *  - JavaScript + DOM storage + cache enabled
 *  - back button routes to webView.goBack() (in-app navigation)
 *  - rwf.qalarc.com links stay in-app; anything else opens externally
 *  - dark local offline fallback page (assets/offline.html) with a Retry button
 *  - status/nav bar colour #0a0b0d via the theme
 */
class MainActivity : Activity() {

    companion object {
        const val APP_URL = "https://rwf.qalarc.com/figma-app"
        const val APP_HOST = "rwf.qalarc.com"
        const val OFFLINE_URL = "file:///android_asset/offline.html"
        const val BRAND_BG = "#0a0b0d"
    }

    private lateinit var webView: WebView

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this).apply {
            setBackgroundColor(Color.parseColor(BRAND_BG))
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                cacheMode = WebSettings.LOAD_DEFAULT
                useWideViewPort = true
                loadWithOverviewMode = true
            }
            webViewClient = AppWebViewClient()
            addJavascriptInterface(RetryBridge(), "Android")
        }
        setContentView(webView)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
        } else {
            loadAppOrOffline()
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        if (this::webView.isInitialized) webView.saveState(outState)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (this::webView.isInitialized && webView.canGoBack()) {
            webView.goBack()
        } else {
            super.onBackPressed()
        }
    }

    override fun onDestroy() {
        if (this::webView.isInitialized) webView.destroy()
        super.onDestroy()
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(CONNECTIVITY_SERVICE) as ConnectivityManager
        val caps = cm.getNetworkCapabilities(cm.activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun loadAppOrOffline() {
        webView.loadUrl(if (isOnline()) APP_URL else OFFLINE_URL)
    }

    /** Called from assets/offline.html's Retry button via window.Android.retry(). */
    inner class RetryBridge {
        @JavascriptInterface
        fun retry() {
            runOnUiThread { loadAppOrOffline() }
        }
    }

    private inner class AppWebViewClient : WebViewClient() {

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val uri = request.url
            return when (uri.scheme?.lowercase()) {
                "file" -> false // the offline page lives inside the webview
                "http", "https" ->
                    if (uri.host == APP_HOST) {
                        false // rwf.qalarc.com navigates in-app (back button = webview back)
                    } else {
                        openExternally(uri)
                        true
                    }
                else -> {
                    openExternally(uri)
                    true
                }
            }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            // Main-frame failures only — a broken subresource shouldn't nuke the app.
            if (request.isForMainFrame) {
                view.loadUrl(OFFLINE_URL)
            }
        }

        private fun openExternally(uri: Uri) {
            try {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } catch (_: Exception) {
                // No handler for this scheme — ignore.
            }
        }
    }
}
