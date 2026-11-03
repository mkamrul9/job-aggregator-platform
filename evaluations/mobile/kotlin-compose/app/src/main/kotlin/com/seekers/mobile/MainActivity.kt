package com.seekers.mobile

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import com.seekers.mobile.api.SeekersApiClientImpl
import com.seekers.mobile.ui.SeekersApp
import com.seekers.mobile.viewmodel.JobSearchViewModel
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {

    private val apiClient by lazy { SeekersApiClientImpl() }
    private val viewModel by lazy { JobSearchViewModel(apiClient) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Initial job fetch
        CoroutineScope(Dispatchers.Main).launch {
            viewModel.loadJobs()
        }

        // Handle deep link if activity started via intent
        handleIntent(intent)

        setContent {
            SeekersApp(
                viewModel = viewModel,
                onApplyOutbound = { url ->
                    val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
                    startActivity(intent)
                }
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleIntent(intent)
    }

    private fun handleIntent(intent: Intent?) {
        intent?.data?.let { uri ->
            viewModel.handleDeepLink(uri.toString())
        }
    }
}
