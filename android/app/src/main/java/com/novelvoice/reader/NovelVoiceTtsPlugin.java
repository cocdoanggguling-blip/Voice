package com.novelvoice.reader;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.Locale;
import java.util.Set;

@CapacitorPlugin(
    name = "NovelVoiceTts",
    permissions = {
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notifications"
        )
    }
)
public class NovelVoiceTtsPlugin extends Plugin implements TextToSpeech.OnInitListener {

    private TextToSpeech tts;
    private boolean ttsReady = false;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), this);
        NovelVoiceTtsService.setMediaActionListener(action -> {
            JSObject payload = new JSObject();
            payload.put("action", action);
            notifyListeners("mediaAction", payload);
        });
    }

    @Override
    public void onInit(int status) {
        if (status == TextToSpeech.SUCCESS) {
            ttsReady = true;
            tts.setAudioAttributes(
                new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
            );
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    // Handled on JS side via speak resolution
                }

                @Override
                public void onRangeStart(String utteranceId, int start, int end, int frame) {
                    JSObject payload = new JSObject();
                    payload.put("utteranceId", utteranceId);
                    payload.put("start", start);
                    payload.put("end", end);
                    notifyListeners("rangeStart", payload);
                }

                @Override
                public void onDone(String utteranceId) {
                    JSObject payload = new JSObject();
                    payload.put("utteranceId", utteranceId);
                    notifyListeners("utteranceDone", payload);
                }

                @Override
                public void onError(String utteranceId) {
                    JSObject payload = new JSObject();
                    payload.put("utteranceId", utteranceId);
                    notifyListeners("utteranceDone", payload);
                }
            });
        }
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        JSArray voicesArray = new JSArray();
        if (ttsReady && tts != null) {
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice v : voices) {
                    JSObject item = new JSObject();
                    item.put("voiceURI", v.getName());
                    item.put("name", v.getName());
                    Locale loc = v.getLocale();
                    item.put("lang", loc != null ? loc.toLanguageTag() : "und");
                    item.put("localService", !v.isNetworkConnectionRequired());
                    voicesArray.put(item);
                }
            }
        }
        JSObject ret = new JSObject();
        ret.put("voices", voicesArray);
        call.resolve(ret);
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!ttsReady || tts == null) {
            call.reject("TTS engine not initialized");
            return;
        }
        String text = call.getString("text", "");
        String voiceURI = call.getString("voiceURI", "");
        float rate = call.getFloat("rate", 1.0f);
        float pitch = call.getFloat("pitch", 1.0f);
        String utteranceId = call.getString("utteranceId", "utt_" + System.currentTimeMillis());

        tts.setSpeechRate(Math.max(0.4f, Math.min(2.5f, rate)));
        tts.setPitch(Math.max(0.5f, Math.min(2.0f, pitch)));

        if (voiceURI != null && !voiceURI.isEmpty()) {
            Set<Voice> voices = tts.getVoices();
            if (voices != null) {
                for (Voice v : voices) {
                    if (v.getName().equals(voiceURI)) {
                        tts.setVoice(v);
                        break;
                    }
                }
            }
        }

        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        tts.speak(text, TextToSpeech.QUEUE_FLUSH, params, utteranceId);
        call.resolve();
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) {
            tts.stop();
        }
        call.resolve();
    }

    @PluginMethod
    public void openTtsSettings(PluginCall call) {
        JSObject ret = new JSObject();
        try {
            Intent intent = new Intent("com.android.settings.TTS_SETTINGS");
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            ret.put("opened", true);
        } catch (Exception e) {
            ret.put("opened", false);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(),
            Manifest.permission.POST_NOTIFICATIONS
        ) == PackageManager.PERMISSION_GRANTED;
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
            return;
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject ret = new JSObject();
            ret.put("granted", true);
            call.resolve(ret);
        } else {
            requestPermissionForAlias("notifications", call, "notificationsCallback");
        }
    }

    @PermissionCallback
    private void notificationsCallback(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", getPermissionState("notifications") == PermissionState.GRANTED);
        call.resolve(ret);
    }

    @PluginMethod
    public void startForegroundService(PluginCall call) {
        dispatchServiceIntent(call, NovelVoiceTtsService.ACTION_START_OR_UPDATE, true);
    }

    @PluginMethod
    public void updateNotification(PluginCall call) {
        dispatchServiceIntent(call, NovelVoiceTtsService.ACTION_START_OR_UPDATE, false);
    }

    @PluginMethod
    public void stopForegroundService(PluginCall call) {
        Intent intent = new Intent(getContext(), NovelVoiceTtsService.class);
        intent.setAction(NovelVoiceTtsService.ACTION_STOP);
        getContext().startService(intent);
        call.resolve();
    }

    private void dispatchServiceIntent(PluginCall call, String action, boolean startForeground) {
        Intent intent = new Intent(getContext(), NovelVoiceTtsService.class);
        intent.setAction(action);
        intent.putExtra(NovelVoiceTtsService.EXTRA_BOOK_TITLE, call.getString("bookTitle", "NovelVoice"));
        intent.putExtra(NovelVoiceTtsService.EXTRA_CHAPTER_TITLE, call.getString("chapterTitle", "Membaca"));
        intent.putExtra(NovelVoiceTtsService.EXTRA_SENTENCE_PREVIEW, call.getString("sentencePreview", ""));
        intent.putExtra(NovelVoiceTtsService.EXTRA_IS_PLAYING, call.getBoolean("isPlaying", true));

        if (startForeground && Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            getContext().startForegroundService(intent);
        } else {
            getContext().startService(intent);
        }
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        NovelVoiceTtsService.setMediaActionListener(null);
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
