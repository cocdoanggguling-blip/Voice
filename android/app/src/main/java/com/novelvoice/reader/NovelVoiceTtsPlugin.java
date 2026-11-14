package com.novelvoice.reader;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.OpenableColumns;
import android.provider.Settings;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.speech.tts.Voice;
import android.util.Base64;
import android.view.Window;
import android.view.WindowManager;

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

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;
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
    private boolean ttsInitCompleted = false;
    private final List<PluginCall> pendingVoicesCalls = new ArrayList<>();
    private final List<PluginCall> pendingEngineInfoCalls = new ArrayList<>();

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
        ttsInitCompleted = true;
        if (status == TextToSpeech.SUCCESS) {
            ttsReady = true;
            try {
                tts.setAudioAttributes(
                    new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build()
                );
            } catch (Exception ignored) {
                // Keep default audio attributes on older devices
            }
            tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                @Override
                public void onStart(String utteranceId) {
                    JSObject payload = new JSObject();
                    payload.put("utteranceId", utteranceId);
                    notifyListeners("utteranceStart", payload);
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

        List<PluginCall> voicesCalls;
        List<PluginCall> infoCalls;
        synchronized (this) {
            voicesCalls = new ArrayList<>(pendingVoicesCalls);
            pendingVoicesCalls.clear();
            infoCalls = new ArrayList<>(pendingEngineInfoCalls);
            pendingEngineInfoCalls.clear();
        }
        for (PluginCall call : infoCalls) {
            resolveEngineInfo(call);
        }
        for (PluginCall call : voicesCalls) {
            resolveVoices(call);
        }
    }

    @PluginMethod
    public void getEngineInfo(PluginCall call) {
        synchronized (this) {
            if (!ttsInitCompleted) {
                pendingEngineInfoCalls.add(call);
                return;
            }
        }
        resolveEngineInfo(call);
    }

    private void resolveEngineInfo(PluginCall call) {
        JSObject ret = new JSObject();
        int maxLen = TextToSpeech.getMaxSpeechInputLength();
        if (maxLen <= 0) maxLen = 3500;
        String defaultEngine = "";
        try {
            defaultEngine = tts != null && ttsReady ? tts.getDefaultEngine() : "";
        } catch (Exception ignored) {
            defaultEngine = "";
        }
        boolean ssmlSupported = defaultEngine != null && (
            defaultEngine.contains("com.google.android.tts") ||
            defaultEngine.contains("com.samsung.SMT")
        );
        ret.put("maxSpeechInputLength", maxLen);
        ret.put("ssmlSupported", ssmlSupported);
        ret.put("enginePackage", defaultEngine != null ? defaultEngine : "");
        call.resolve(ret);
    }

    private static boolean isSupportedVoiceLocale(String langLower, String nameLower) {
        if (
            langLower.equals("id") || langLower.startsWith("id-") || langLower.startsWith("id_") ||
            langLower.equals("in") || langLower.startsWith("in-") || langLower.startsWith("in_") ||
            langLower.equals("ind") || langLower.startsWith("ind-") || langLower.startsWith("ind_") ||
            langLower.equals("en") || langLower.startsWith("en-") || langLower.startsWith("en_") ||
            langLower.equals("eng") || langLower.startsWith("eng-") || langLower.startsWith("eng_")
        ) {
            return true;
        }
        if (langLower.isEmpty() || langLower.equals("und")) {
            return (
                nameLower.startsWith("id-") || nameLower.startsWith("in-") || nameLower.startsWith("ind-") ||
                nameLower.startsWith("en-") || nameLower.startsWith("eng-")
            );
        }
        return false;
    }

    private static String normalizeLangTag(Locale loc, String nameLower) {
        String tag = loc != null ? loc.toLanguageTag() : "";
        if (tag == null || tag.isEmpty() || tag.equalsIgnoreCase("und")) {
            if (nameLower.startsWith("id-id-") || nameLower.startsWith("in-id-")) return "id-ID";
            if (nameLower.startsWith("en-gb-")) return "en-GB";
            if (nameLower.startsWith("en-us-")) return "en-US";
            if (nameLower.startsWith("id-") || nameLower.startsWith("in-") || nameLower.startsWith("ind-")) return "id";
            if (nameLower.startsWith("en-") || nameLower.startsWith("eng-")) return "en";
            return "";
        }
        String lower = tag.toLowerCase(Locale.ROOT);
        if (lower.equals("in")) return "id";
        if (lower.startsWith("in-")) return "id" + tag.substring(2);
        if (lower.equals("ind")) return "id";
        if (lower.startsWith("ind-")) return "id" + tag.substring(3);
        if (lower.equals("eng")) return "en";
        if (lower.startsWith("eng-")) return "en" + tag.substring(3);
        return tag;
    }

    private static int getVoiceSortGroup(String langLower) {
        if (langLower.equals("id") || langLower.startsWith("id-") || langLower.startsWith("in")) return 0;
        if (langLower.startsWith("en-gb")) return 1;
        if (langLower.startsWith("en-us")) return 2;
        if (langLower.equals("en")) return 3;
        return 4;
    }

    @PluginMethod
    public void getVoices(PluginCall call) {
        synchronized (this) {
            if (!ttsInitCompleted) {
                pendingVoicesCalls.add(call);
                return;
            }
        }
        resolveVoices(call);
    }

    private void resolveVoices(PluginCall call) {
        JSArray voicesArray = new JSArray();
        if (ttsReady && tts != null) {
            String enginePkg = "";
            try {
                String eng = tts.getDefaultEngine();
                if (eng != null) enginePkg = eng;
            } catch (Exception ignored) {
                enginePkg = "";
            }

            List<Voice> filtered = new ArrayList<>();
            try {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        if (v == null || v.getName() == null) continue;
                        Locale loc = v.getLocale();
                        String rawTag = loc != null ? loc.toLanguageTag() : "";
                        String langLower = rawTag.toLowerCase(Locale.ROOT);
                        String nameLower = v.getName().toLowerCase(Locale.ROOT);
                        if (isSupportedVoiceLocale(langLower, nameLower)) {
                            filtered.add(v);
                        }
                    }
                }
            } catch (Exception ignored) {
                // Ignore transient binder issues from external TTS engines
            }

            Collections.sort(filtered, new Comparator<Voice>() {
                @Override
                public int compare(Voice a, Voice b) {
                    String aName = a.getName() != null ? a.getName().toLowerCase(Locale.ROOT) : "";
                    String bName = b.getName() != null ? b.getName().toLowerCase(Locale.ROOT) : "";
                    String aLang = normalizeLangTag(a.getLocale(), aName).toLowerCase(Locale.ROOT);
                    String bLang = normalizeLangTag(b.getLocale(), bName).toLowerCase(Locale.ROOT);
                    int grp = Integer.compare(getVoiceSortGroup(aLang), getVoiceSortGroup(bLang));
                    if (grp != 0) return grp;
                    int localCmp = Boolean.compare(a.isNetworkConnectionRequired(), b.isNetworkConnectionRequired());
                    if (localCmp != 0) return localCmp;
                    return aName.compareTo(bName);
                }
            });

            for (Voice v : filtered) {
                String nameLower = v.getName().toLowerCase(Locale.ROOT);
                String langTag = normalizeLangTag(v.getLocale(), nameLower);
                JSObject item = new JSObject();
                item.put("voiceURI", v.getName());
                item.put("name", v.getName());
                item.put("lang", langTag);
                item.put("localService", !v.isNetworkConnectionRequired());
                if (!enginePkg.isEmpty()) {
                    item.put("engineName", enginePkg);
                }
                voicesArray.put(item);
            }
        }
        JSObject ret = new JSObject();
        ret.put("voices", voicesArray);
        call.resolve(ret);
    }

    @PluginMethod
    public void configureSession(PluginCall call) {
        if (!ttsReady || tts == null) {
            call.reject("TTS engine not initialized");
            return;
        }
        String voiceURI = call.getString("voiceURI", "");
        float rate = call.getFloat("rate", 1.0f);
        float pitch = call.getFloat("pitch", 1.0f);

        tts.setSpeechRate(Math.max(0.4f, Math.min(3.5f, rate)));
        tts.setPitch(Math.max(0.5f, Math.min(2.0f, pitch)));

        try {
            if (voiceURI != null && !voiceURI.isEmpty()) {
                Set<Voice> voices = tts.getVoices();
                if (voices != null) {
                    for (Voice v : voices) {
                        if (v != null && voiceURI.equals(v.getName())) {
                            tts.setVoice(v);
                            break;
                        }
                    }
                }
            } else {
                Voice def = tts.getDefaultVoice();
                if (def != null) {
                    tts.setVoice(def);
                }
            }
        } catch (Exception ignored) {
            // Keep active voice if engine refuses selection
        }
        call.resolve();
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!ttsReady || tts == null) {
            call.reject("TTS engine not initialized");
            return;
        }
        String text = call.getString("text", "");
        String utteranceId = call.getString("utteranceId", "utt_" + System.currentTimeMillis());
        int queueMode = call.getInt("queueMode", TextToSpeech.QUEUE_ADD);
        float volume = call.getFloat("volume", 1.0f);
        int androidQueueMode = (queueMode == 0) ? TextToSpeech.QUEUE_FLUSH : TextToSpeech.QUEUE_ADD;

        Bundle params = new Bundle();
        params.putString(TextToSpeech.Engine.KEY_PARAM_UTTERANCE_ID, utteranceId);
        params.putFloat(TextToSpeech.Engine.KEY_PARAM_VOLUME, Math.max(0.05f, Math.min(1.0f, volume)));
        tts.speak(text, androidQueueMode, params, utteranceId);
        call.resolve();
    }

    @PluginMethod
    public void playSilent(PluginCall call) {
        if (!ttsReady || tts == null) {
            call.resolve();
            return;
        }
        long durationMs = call.getInt("durationMs", 300);
        String utteranceId = call.getString("utteranceId", "sil_" + System.currentTimeMillis());
        tts.playSilentUtterance(Math.max(0L, durationMs), TextToSpeech.QUEUE_ADD, utteranceId);
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
    public void openBatteryOptimizationSettings(PluginCall call) {
        JSObject ret = new JSObject();
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            ret.put("opened", false);
            call.resolve(ret);
            return;
        }
        try {
            String pkg = getContext().getPackageName();
            PowerManager pm = (PowerManager) getContext().getSystemService(android.content.Context.POWER_SERVICE);
            if (pm != null && pm.isIgnoringBatteryOptimizations(pkg)) {
                Intent listIntent = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                listIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(listIntent);
            } else {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + pkg));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(intent);
            }
            ret.put("opened", true);
        } catch (Exception e) {
            try {
                Intent fallback = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                fallback.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(fallback);
                ret.put("opened", true);
            } catch (Exception ignored) {
                ret.put("opened", false);
            }
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void setScreenBrightness(PluginCall call) {
        float brightness = call.getFloat("brightness", -1.0f);
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                Window window = activity.getWindow();
                if (window != null) {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    if (brightness < 0f) {
                        lp.screenBrightness = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE;
                    } else {
                        lp.screenBrightness = Math.max(0.02f, Math.min(1.0f, brightness));
                    }
                    window.setAttributes(lp);
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void setKeepScreenOn(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                Window window = activity.getWindow();
                if (window != null) {
                    if (enabled) {
                        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void setOrientationLock(PluginCall call) {
        String mode = call.getString("mode", "auto");
        Activity activity = getActivity();
        if (activity != null) {
            activity.runOnUiThread(() -> {
                if ("portrait".equals(mode)) {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
                } else if ("landscape".equals(mode)) {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
                } else {
                    activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_UNSPECIFIED);
                }
            });
        }
        call.resolve();
    }

    @PluginMethod
    public void consumePendingOpenEpub(PluginCall call) {
        Uri uri = MainActivity.consumePendingEpubUri();
        if (uri == null) {
            call.resolve(new JSObject());
            return;
        }
        try {
            String fileName = queryDisplayName(uri);
            if (fileName == null || fileName.isEmpty()) {
                fileName = "Buku-Impor.epub";
            }
            byte[] bytes = readUriBytes(uri, 80 * 1024 * 1024);
            if (bytes == null || bytes.length == 0) {
                call.resolve(new JSObject());
                return;
            }
            String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            JSObject ret = new JSObject();
            ret.put("fileName", fileName);
            ret.put("base64", b64);
            call.resolve(ret);
        } catch (Exception e) {
            call.resolve(new JSObject());
        }
    }

    private String queryDisplayName(Uri uri) {
        try (Cursor cursor = getContext().getContentResolver().query(uri, null, null, null, null)) {
            if (cursor != null && cursor.moveToFirst()) {
                int idx = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    return cursor.getString(idx);
                }
            }
        } catch (Exception ignored) {
            // Fallback to last path segment
        }
        return uri.getLastPathSegment();
    }

    private byte[] readUriBytes(Uri uri, int maxBytes) {
        try (InputStream is = getContext().getContentResolver().openInputStream(uri)) {
            if (is == null) return null;
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            byte[] chunk = new byte[16384];
            int read;
            int total = 0;
            while ((read = is.read(chunk)) != -1) {
                total += read;
                if (total > maxBytes) {
                    return null;
                }
                buffer.write(chunk, 0, read);
            }
            return buffer.toByteArray();
        } catch (Exception e) {
            return null;
        }
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
        synchronized (this) {
            pendingVoicesCalls.clear();
            pendingEngineInfoCalls.clear();
        }
        if (tts != null) {
            tts.stop();
            tts.shutdown();
            tts = null;
        }
        super.handleOnDestroy();
    }
}
