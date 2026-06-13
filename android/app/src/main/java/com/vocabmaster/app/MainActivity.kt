package com.vocabmaster.app

import android.annotation.SuppressLint
import android.app.Activity
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceError
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.ApiException
import com.google.firebase.auth.FirebaseAuth
import java.util.Base64
import java.util.concurrent.TimeUnit
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

class MainActivity : Activity() {
    companion object {
        private const val TAG = "VocabMaster"
        private const val ONLINE_URL = "https://vocabmaster112225.web.app/"
        private const val OFFLINE_URL = "file:///android_asset/index.html"
        private const val ONLINE_TIMEOUT_MS = 8000L
        private const val RC_SIGN_IN = 9001
    }

    private lateinit var webView: WebView
    private lateinit var ttsBridge: TTSBridge
    private lateinit var googleSignInClient: GoogleSignInClient
    private lateinit var firebaseAuth: FirebaseAuth
    private var isOnlineMode = false
    private var loadJob: Job? = null
    private var pendingAuthCallback: String? = null

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        ttsBridge = TTSBridge.getInstance(this)
        firebaseAuth = FirebaseAuth.getInstance()

        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken("1020976660084-12io12v4tqg871pq7rv1d72hpld0j39p.apps.googleusercontent.com")
            .requestEmail()
            .build()
        googleSignInClient = GoogleSignIn.getClient(this, gso)

        webView = findViewById(R.id.webview)
        setupWebView()

        ttsBridge.callbackHandler = { callbackId, json ->
            runOnUiThread {
                val encoded = Base64.getEncoder().encodeToString(json.toByteArray(Charsets.UTF_8))
                webView.evaluateJavascript(
                    "__nativeTTSBridge._onResultEncoded('$callbackId', '$encoded')",
                    null
                )
            }
        }

        loadOnlineFirstWithFallback()
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowFileAccessFromFileURLs = true
        settings.allowUniversalAccessFromFileURLs = true
        settings.mediaPlaybackRequiresUserGesture = false
        settings.mixedContentMode = WebSettings.MIXED_CONTENT_ALWAYS_ALLOW
        settings.userAgentString = settings.userAgentString + " VocabMasterApp/1.0"

        webView.webViewClient = object : WebViewClient() {
            override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                super.onReceivedError(view, request, error)
                Log.w(TAG, "WebView error: ${error?.description} (code: ${error?.errorCode})")
                if (!isOnlineMode && request?.url?.toString()?.startsWith("https://") == true) {
                }
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                Log.d(TAG, "Page loaded: $url")
                if (url?.startsWith("https://") == true) {
                    isOnlineMode = true
                    loadJob?.cancel()
                }
            }
        }
        webView.webChromeClient = WebChromeClient()

        webView.addJavascriptInterface(NativeTTSJSInterface(), "NativeTTS")
        webView.addJavascriptInterface(NativeAuthJSInterface(), "NativeAuth")
    }

    private fun loadOnlineFirstWithFallback() {
        webView.loadUrl(OFFLINE_URL)
    }

    inner class NativeTTSJSInterface {
        @JavascriptInterface
        fun getVoices(): String {
            Log.d(TAG, "NativeTTS.getVoices called from JS")
            return ttsBridge.getVoices()
        }

        @JavascriptInterface
        fun speak(text: String, voiceName: String, langTag: String, rate: Float, callbackId: String) {
            Log.d(TAG, "NativeTTS.speak: text='$text' voice='$voiceName' lang='$langTag'")
            ttsBridge.speak(text, voiceName, langTag, rate, callbackId)
        }

        @JavascriptInterface
        fun stop() {
            ttsBridge.stop()
        }

        @JavascriptInterface
        fun previewVoice(voiceName: String, langTag: String, callbackId: String) {
            Log.d(TAG, "NativeTTS.previewVoice: voice=$voiceName lang=$langTag")
            ttsBridge.previewVoice(voiceName, langTag, callbackId)
        }
    }

    inner class NativeAuthJSInterface {
        @JavascriptInterface
        fun signIn(callbackId: String) {
            Log.d(TAG, "NativeAuth.signIn called, callbackId=$callbackId")
            pendingAuthCallback = callbackId
            val signInIntent = googleSignInClient.signInIntent
            startActivityForResult(signInIntent, RC_SIGN_IN)
        }

        @JavascriptInterface
        fun signOut() {
            Log.d(TAG, "NativeAuth.signOut called")
            googleSignInClient.signOut().addOnCompleteListener {
                firebaseAuth.signOut()
                webView.evaluateJavascript("__nativeAuth._onSignOut()", null)
            }
        }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)

        if (requestCode == RC_SIGN_IN) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(data)
            try {
                val account = task.getResult(ApiException::class.java)
                val idToken = account.idToken
                Log.d(TAG, "Google Sign-In success, idToken=${idToken?.take(20)}...")

                if (idToken != null) {
                    val encodedToken = Base64.getEncoder().encodeToString(idToken.toByteArray(Charsets.UTF_8))
                    val photoUrl = account.photoUrl?.toString() ?: ""
                    val displayName = account.displayName ?: ""
                    val encodedPhoto = Base64.getEncoder().encodeToString(photoUrl.toByteArray(Charsets.UTF_8))
                    val encodedName = Base64.getEncoder().encodeToString(displayName.toByteArray(Charsets.UTF_8))
                    val cb = pendingAuthCallback ?: "default"
                    pendingAuthCallback = null
                    webView.evaluateJavascript(
                        "__nativeAuth._onSignInResult('$cb', '$encodedToken', '$encodedPhoto', '$encodedName')",
                        null
                    )
                } else {
                    val cb = pendingAuthCallback ?: "default"
                    pendingAuthCallback = null
                    webView.evaluateJavascript(
                        "__nativeAuth._onSignInError('$cb', 'No ID token received')",
                        null
                    )
                }
            } catch (e: ApiException) {
                Log.w(TAG, "Google Sign-In failed: ${e.statusCode}")
                val cb = pendingAuthCallback ?: "default"
                pendingAuthCallback = null
                webView.evaluateJavascript(
                    "__nativeAuth._onSignInError('$cb', '${e.statusCode}: ${e.message}')",
                    null
                )
            }
        }
    }

    override fun onDestroy() {
        loadJob?.cancel()
        ttsBridge.destroy()
        webView.destroy()
        super.onDestroy()
    }
}
