import React, { useMemo, useState } from 'react';
import { Bell, ExternalLink, Moon, Play, Volume2, X } from 'lucide-react';
import type { NotificationPermissionStatus } from '../services/ttsBridge';
import type {
  TtsEngineCapabilities,
  TtsReadingMode,
  TtsSettings,
  TtsVoiceInfo,
} from '../types/reader';

interface TtsSettingsSheetProps {
  open: boolean;
  settings: TtsSettings;
  voices: TtsVoiceInfo[];
  engineCapabilities: TtsEngineCapabilities;
  notificationStatus: NotificationPermissionStatus;
  sleepRemainingSec: number | null;
  onUpdate: (patch: Partial<TtsSettings>) => void;
  onPreviewVoice: (voiceURI: string) => void;
  onOpenAndroidTtsSettings: () => Promise<{ opened: boolean; message?: string }>;
  onRequestNotificationPermission: () => Promise<void>;
  onClose: () => void;
}

const SLEEP_OPTIONS = [
  { value: 0, label: 'Mati' },
  { value: 5, label: '5 mnt' },
  { value: 10, label: '10 mnt' },
  { value: 15, label: '15 mnt' },
  { value: 30, label: '30 mnt' },
  { value: 45, label: '45 mnt' },
  { value: 60, label: '60 mnt' },
  { value: -1, label: 'Akhir Bab' },
];

export const TtsSettingsSheet: React.FC<TtsSettingsSheetProps> = ({
  open,
  settings,
  voices,
  engineCapabilities,
  notificationStatus,
  sleepRemainingSec,
  onUpdate,
  onPreviewVoice,
  onOpenAndroidTtsSettings,
  onRequestNotificationPermission,
  onClose,
}) => {
  const [engineFeedback, setEngineFeedback] = useState<string | null>(null);

  const availableLanguages = useMemo(() => {
    const langs = new Set<string>();
    voices.forEach((v) => {
      if (v.lang) langs.add(v.lang.split('-')[0].toLowerCase());
    });
    return Array.from(langs).sort();
  }, [voices]);

  const filteredVoices = useMemo(() => {
    if (settings.langFilter === 'all') return voices;
    return voices.filter((v) =>
      v.lang.toLowerCase().startsWith(settings.langFilter.toLowerCase())
    );
  }, [voices, settings.langFilter]);

  if (!open) return null;

  const handleOpenEngineSettings = async () => {
    const res = await onOpenAndroidTtsSettings();
    if (!res.opened && res.message) {
      setEngineFeedback(res.message);
    } else {
      setEngineFeedback(null);
    }
  };

  const ssmlDisabled = !engineCapabilities.ssmlSupported;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan Suara dan TTS"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl border border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[var(--nv-border)] sm:hidden" />

        <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5 text-[var(--nv-accent)]" aria-hidden="true" />
            <h2 className="text-base font-bold">Pengaturan Suara (TTS)</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan suara"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5 pb-safe">
          {/* Mode Baca */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Mode Baca TTS</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'flowing', label: 'Mengalir (disarankan)' },
                  { id: 'sentence', label: 'Per kalimat' },
                ] as Array<{ id: TtsReadingMode; label: string }>
              ).map((mode) => (
                <button
                  key={mode.id}
                  type="button"
                  onClick={() => onUpdate({ readingMode: mode.id })}
                  className={`min-h-[44px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                    settings.readingMode === mode.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-[var(--nv-muted)]">
              Mode Mengalir mengirim paragraf utuh dengan antrean tanpa celah agar intonasi alami.
            </p>
          </div>

          {/* Ukuran Potongan (Flowing mode) */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="tts-chunk-size" className="text-xs font-semibold text-[var(--nv-muted)]">
                Ukuran Potongan
              </label>
              <span className="text-xs font-semibold tabular-nums">
                {settings.chunkSizeChars} karakter
              </span>
            </div>
            <input
              id="tts-chunk-size"
              type="range"
              min={300}
              max={3000}
              step={100}
              disabled={settings.readingMode === 'sentence'}
              value={settings.chunkSizeChars}
              onChange={(e) => onUpdate({ chunkSizeChars: Number(e.target.value) })}
              className="h-2 w-full accent-[var(--nv-accent)] disabled:opacity-40"
            />
          </div>

          {/* Speed (0.5x - 3.0x) & Pitch */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="tts-rate" className="text-xs font-semibold text-[var(--nv-muted)]">
                  Kecepatan Baca
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.rate.toFixed(2)}×
                </span>
              </div>
              <input
                id="tts-rate"
                type="range"
                min={0.5}
                max={3.0}
                step={0.1}
                value={settings.rate}
                onChange={(e) => onUpdate({ rate: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)]"
              />
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="tts-pitch" className="text-xs font-semibold text-[var(--nv-muted)]">
                  Nada Suara (Pitch)
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.pitch.toFixed(2)}
                </span>
              </div>
              <input
                id="tts-pitch"
                type="range"
                min={0.5}
                max={1.6}
                step={0.05}
                value={settings.pitch}
                onChange={(e) => onUpdate({ pitch: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)]"
              />
            </div>
          </div>

          {/* Jeda Antar Paragraf */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="tts-para-pause" className="text-xs font-semibold text-[var(--nv-muted)]">
                Jeda Antar Paragraf
              </label>
              <span className="text-xs font-semibold tabular-nums">
                {settings.paragraphPauseMs} ms
              </span>
            </div>
            <input
              id="tts-para-pause"
              type="range"
              min={0}
              max={800}
              step={50}
              value={settings.paragraphPauseMs}
              onChange={(e) => onUpdate({ paragraphPauseMs: Number(e.target.value) })}
              className="h-2 w-full accent-[var(--nv-accent)]"
            />
          </div>

          {/* Jeda Tambahan SSML (Koma & Akhir Kalimat) */}
          <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Jeda Tambahan (SSML)</p>
              {ssmlDisabled && (
                <span className="text-[11px] font-medium text-[var(--nv-muted)]">
                  Tidak didukung mesin TTS ini
                </span>
              )}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-comma-pause" className="text-xs text-[var(--nv-muted)]">
                  Jeda Tambahan Koma
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.commaPauseMs === 0 ? '0 ms (Alami)' : `${settings.commaPauseMs} ms`}
                </span>
              </div>
              <input
                id="tts-comma-pause"
                type="range"
                min={0}
                max={300}
                step={25}
                disabled={ssmlDisabled}
                value={settings.commaPauseMs}
                onChange={(e) => onUpdate({ commaPauseMs: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)] disabled:opacity-40"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-sentence-pause" className="text-xs text-[var(--nv-muted)]">
                  Jeda Tambahan Akhir Kalimat
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.sentencePauseMs === 0 ? '0 ms (Alami)' : `${settings.sentencePauseMs} ms`}
                </span>
              </div>
              <input
                id="tts-sentence-pause"
                type="range"
                min={0}
                max={600}
                step={50}
                disabled={ssmlDisabled}
                value={settings.sentencePauseMs}
                onChange={(e) => onUpdate({ sentencePauseMs: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)] disabled:opacity-40"
              />
            </div>
          </div>

          {/* Sleep Timer */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--nv-muted)]">
                <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                Timer Tidur (Sleep Timer)
              </span>
              {sleepRemainingSec !== null && (
                <span className="text-xs font-semibold text-[var(--nv-accent)] tabular-nums">
                  Sisa {Math.floor(sleepRemainingSec / 60)}:
                  {String(sleepRemainingSec % 60).padStart(2, '0')}
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              {SLEEP_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => onUpdate({ sleepTimerMinutes: opt.value })}
                  className={`min-h-[38px] rounded-lg border px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                    settings.sleepTimerMinutes === opt.value
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Voice Filter & Selection */}
          <div className="border-t border-[var(--nv-border)] pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="tts-lang-filter" className="text-xs font-semibold text-[var(--nv-muted)]">
                Daftar Voice Sistem ({filteredVoices.length})
              </label>
              <div className="flex items-center gap-2">
                <select
                  id="tts-lang-filter"
                  value={settings.langFilter}
                  onChange={(e) => onUpdate({ langFilter: e.target.value })}
                  className="min-h-[36px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-2.5 text-xs"
                >
                  <option value="all">Semua Bahasa</option>
                  {availableLanguages.map((code) => (
                    <option key={code} value={code}>
                      {code.toUpperCase()}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => onPreviewVoice(settings.voiceURI)}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-[var(--nv-accent)] px-3 text-xs font-semibold text-white hover:opacity-90"
                >
                  <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                  <span>Tes Suara</span>
                </button>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-[var(--nv-border)] divide-y divide-[var(--nv-border)]">
              {filteredVoices.length === 0 ? (
                <p className="p-3 text-xs text-[var(--nv-muted)]">
                  Tidak ada voice sistem terdeteksi pada filter bahasa ini. Gunakan suara bawaan atau buka pengaturan TTS perangkat.
                </p>
              ) : (
                filteredVoices.map((voice) => {
                  const selected = settings.voiceURI === voice.voiceURI;
                  return (
                    <div
                      key={voice.voiceURI}
                      className={`flex items-center justify-between gap-2 px-3 py-2 ${
                        selected ? 'bg-[var(--nv-accent-soft)]' : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onUpdate({ voiceURI: voice.voiceURI })}
                        className="min-w-0 flex-1 text-left"
                      >
                        <p className="truncate text-sm font-medium">{voice.name}</p>
                        <p className="text-xs text-[var(--nv-muted)]">
                          {voice.lang} · {voice.localService ? 'Offline' : 'Online'}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => onPreviewVoice(voice.voiceURI)}
                        aria-label={`Pratinjau suara ${voice.name}`}
                        className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded-lg border border-[var(--nv-border)] hover:bg-black/5 dark:hover:bg-white/5"
                      >
                        <Play className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* External Android TTS Engine Button */}
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={handleOpenEngineSettings}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span>Tambah Voice / Ganti Mesin TTS</span>
              </button>

              {engineFeedback && (
                <p className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3 text-xs leading-relaxed text-[var(--nv-muted)]">
                  {engineFeedback}
                </p>
              )}

              {notificationStatus.isNative && !notificationStatus.granted && (
                <button
                  type="button"
                  onClick={onRequestNotificationPermission}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700"
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  <span>Izinkan Notifikasi Kontrol TTS (Android 13+)</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
