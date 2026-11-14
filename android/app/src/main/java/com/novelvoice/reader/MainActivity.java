package com.novelvoice.reader;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NovelVoiceTtsPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
