package com.novelvoice.reader;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;
import androidx.media.session.MediaButtonReceiver;

public class NovelVoiceTtsService extends Service {

    public static final String CHANNEL_ID = "novelvoice_tts_playback";
    public static final int NOTIFICATION_ID = 4109;

    public static final String ACTION_START_OR_UPDATE = "com.novelvoice.reader.ACTION_START_OR_UPDATE";
    public static final String ACTION_PLAY = "com.novelvoice.reader.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.novelvoice.reader.ACTION_PAUSE";
    public static final String ACTION_NEXT = "com.novelvoice.reader.ACTION_NEXT";
    public static final String ACTION_PREV = "com.novelvoice.reader.ACTION_PREV";
    public static final String ACTION_STOP = "com.novelvoice.reader.ACTION_STOP";

    public static final String EXTRA_BOOK_TITLE = "bookTitle";
    public static final String EXTRA_CHAPTER_TITLE = "chapterTitle";
    public static final String EXTRA_SENTENCE_PREVIEW = "sentencePreview";
    public static final String EXTRA_IS_PLAYING = "isPlaying";

    public interface MediaActionListener {
        void onMediaAction(String action);
    }

    private static MediaActionListener mediaActionListener;

    public static void setMediaActionListener(MediaActionListener listener) {
        mediaActionListener = listener;
    }

    private MediaSessionCompat mediaSession;
    private PowerManager.WakeLock wakeLock;
    private String bookTitle = "NovelVoice";
    private String chapterTitle = "Membaca Buku";
    private String sentencePreview = "";
    private boolean isPlaying = false;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();

        mediaSession = new MediaSessionCompat(this, "NovelVoiceTtsSession");
        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                dispatchAction("play");
            }

            @Override
            public void onPause() {
                dispatchAction("pause");
            }

            @Override
            public void onSkipToNext() {
                dispatchAction("next");
            }

            @Override
            public void onSkipToPrevious() {
                dispatchAction("prev");
            }

            @Override
            public void onStop() {
                dispatchAction("stop");
                stopSelf();
            }
        });
        mediaSession.setActive(true);

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        if (pm != null) {
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "NovelVoice::TtsWakeLock");
            wakeLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            MediaButtonReceiver.handleIntent(mediaSession, intent);
            String action = intent.getAction();

            if (ACTION_PLAY.equals(action)) {
                dispatchAction("play");
                return START_STICKY;
            } else if (ACTION_PAUSE.equals(action)) {
                dispatchAction("pause");
                return START_STICKY;
            } else if (ACTION_NEXT.equals(action)) {
                dispatchAction("next");
                return START_STICKY;
            } else if (ACTION_PREV.equals(action)) {
                dispatchAction("prev");
                return START_STICKY;
            } else if (ACTION_STOP.equals(action)) {
                dispatchAction("stop");
                releaseWakeLock();
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
                return START_NOT_STICKY;
            }

            if (intent.hasExtra(EXTRA_BOOK_TITLE)) {
                bookTitle = intent.getStringExtra(EXTRA_BOOK_TITLE);
            }
            if (intent.hasExtra(EXTRA_CHAPTER_TITLE)) {
                chapterTitle = intent.getStringExtra(EXTRA_CHAPTER_TITLE);
            }
            if (intent.hasExtra(EXTRA_SENTENCE_PREVIEW)) {
                sentencePreview = intent.getStringExtra(EXTRA_SENTENCE_PREVIEW);
            }
            isPlaying = intent.getBooleanExtra(EXTRA_IS_PLAYING, true);
        }

        if (isPlaying) {
            acquireWakeLock();
        } else {
            releaseWakeLock();
        }

        updateMediaSessionState();
        Notification notification = buildNotification();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
            );
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }

        return START_STICKY;
    }

    private void dispatchAction(String action) {
        if (mediaActionListener != null) {
            mediaActionListener.onMediaAction(action);
        }
    }

    private void updateMediaSessionState() {
        long actions = PlaybackStateCompat.ACTION_PLAY
            | PlaybackStateCompat.ACTION_PAUSE
            | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
            | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_STOP;

        int state = isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED;
        mediaSession.setPlaybackState(
            new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(state, PlaybackStateCompat.PLAYBACK_POSITION_UNKNOWN, 1.0f)
                .build()
        );

        mediaSession.setMetadata(
            new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, bookTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, chapterTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, sentencePreview)
                .build()
        );
    }

    private Notification buildNotification() {
        Intent openAppIntent = new Intent(this, MainActivity.class);
        openAppIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            0,
            openAppIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        PendingIntent prevIntent = serviceActionIntent(ACTION_PREV, 1);
        PendingIntent toggleIntent = serviceActionIntent(isPlaying ? ACTION_PAUSE : ACTION_PLAY, 2);
        PendingIntent nextIntent = serviceActionIntent(ACTION_NEXT, 3);
        PendingIntent stopIntent = serviceActionIntent(ACTION_STOP, 4);

        int toggleIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String toggleLabel = isPlaying ? "Jeda" : "Putar";

        String bodyText = (sentencePreview != null && !sentencePreview.isEmpty())
            ? chapterTitle + " — " + sentencePreview
            : chapterTitle;

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_novelvoice)
            .setContentTitle(bookTitle)
            .setContentText(bodyText)
            .setContentIntent(contentIntent)
            .setDeleteIntent(stopIntent)
            .setOngoing(isPlaying)
            .setOnlyAlertOnce(true)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(android.R.drawable.ic_media_previous, "Sebelumnya", prevIntent)
            .addAction(toggleIcon, toggleLabel, toggleIntent)
            .addAction(android.R.drawable.ic_media_next, "Berikutnya", nextIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Berhenti", stopIntent)
            .setStyle(
                new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
            )
            .build();
    }

    private PendingIntent serviceActionIntent(String action, int requestCode) {
        Intent intent = new Intent(this, NovelVoiceTtsService.class);
        intent.setAction(action);
        return PendingIntent.getService(
            this,
            requestCode,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Pembacaan Suara NovelVoice",
                NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Kontrol pemutaran Text-to-Speech di latar belakang");
            channel.setShowBadge(false);
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private void acquireWakeLock() {
        if (wakeLock != null && !wakeLock.isHeld()) {
            // 3 hours safety cap per continuous session
            wakeLock.acquire(3 * 60 * 60 * 1000L);
        }
    }

    private void releaseWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
    }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
