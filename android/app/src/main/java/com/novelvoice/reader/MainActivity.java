package com.novelvoice.reader;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static Uri pendingEpubUri = null;

    public static synchronized Uri consumePendingEpubUri() {
        Uri uri = pendingEpubUri;
        pendingEpubUri = null;
        return uri;
    }

    private static synchronized void setPendingEpubUri(Uri uri) {
        if (uri != null) {
            pendingEpubUri = uri;
        }
    }

    private void captureIncomingIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            setPendingEpubUri(intent.getData());
        }
    }

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NovelVoiceTtsPlugin.class);
        super.onCreate(savedInstanceState);
        captureIncomingIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        captureIncomingIntent(intent);
    }
}
