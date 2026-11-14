import React, { useMemo, useState } from 'react';
import {
  BatteryCharging,
  Bell,
  ExternalLink,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
  Volume2,
  X,
} from 'lucide-react';
import type { NotificationPermissionStatus } from '../services/ttsBridge';
import type {
  TextReplaceRule,
  TtsEngineCapabilities,
  TtsReadingMode,
  TtsSettings,
  TtsVoiceInfo,
} from '../types/reader';
import {
  filterAndSortTtsVoices,
  formatVoiceEngineLabel,
  normalizeVoiceLangFilter,
} from '../utils/ttsVoices';

interface TtsSettingsSheetProps {
  open: boolean;
  settings: TtsSettings;
  ttsOnlyRules?: TextReplaceRule[];
  voices: TtsVoiceInfo[];
  engineCapabilities: TtsEngineCapabilities;
  notificationStatus: NotificationPermissionStatus;
  sleepRemainingSec: number | null;
  onUpdate: (patch: Partial<TtsSettings>) => void;
  onOpenManageTtsRules?: () => void;
  onOpenAddTtsRule?: () => void;
  onPreviewVoice: (voiceURI: string) => void;
  onRefreshVoices: () => Promise<void> | void;
  onOpenAndroidTtsSettings: () => Promise<{ opened: boolean; message?: string }>;
  onOpenBatteryOptimization: () => Promise<{ opened: boolean; message?: string }>;
  onRequestNotificationPermission: () => Promise<void>;
  onClose: () => void;
}

const SLEEP_OPTIONS = [
  { value: 0, label: 'Mati' },
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
  ttsOnlyRules = [],
  voices,
  engineCapabilities,
  notificationStatus,
  sleepRemainingSec,
  onUpdate,
  onOpenManageTtsRules,
  onOpenAddTtsRule,
  onPreviewVoice,
  onRefreshVoices,
  onOpenAndroidTtsSettings,
  onOpenBatteryOptimization,
  onRequestNotificationPermission,
  onClose,
}) => {
  const [engineFeedback, setEngineFeedback] = useState<string | null>(null);
  const [customSleepInput, setCustomSleepInput] = useState('');
  const [dictPattern, setDictPattern] = useState('');
  const [dictReplacement, setDictReplacement] = useState('');

  const normalizedFilter = normalizeVoiceLangFilter(settings.langFilter);

  const filteredVoices = useMemo(
    () => filterAndSortTtsVoices(voices, normalizedFilter),
    [voices, normalizedFilter]
  );

  if (!open) return null;

  const handleOpenEngineSettings = async () => {
    const res = await onOpenAndroidTtsSettings();
    if (!res.opened && res.message) {
      setEngineFeedback(res.message);
    } else {
      setEngineFeedback(null);
    }
  };

  const handleOpenBatterySettings = async () => {
    const res = await onOpenBatteryOptimization();
    if (!res.opened && res.message) {
      setEngineFeedback(res.message);
    } else {
      setEngineFeedback(null);
    }
  };

  const handleAddPronunciationRule = (e: React.FormEvent) => {
    e.preventDefault();
    const p = dictPattern.trim();
    const r = dictReplacement.trim();
    if (!p || !r) return;
    const next = [
      ...settings.pronunciationDict,
      {
        id: `pr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        pattern: p,
        replacement: r,
      },
    ];
    onUpdate({ pronunciationDict: next });
    setDictPattern('');
    setDictReplacement('');
  };

  const ToggleRow = ({
    label,
    desc,
    checked,
    onToggle,
  }: {
    label: string;
    desc?: string;
    checked: boolean;
    onToggle: () => void;
  }) => (
    <div className="flex items-center justify-between gap-3 py-1">
      <div className="min-w-0">
        <p className="text-xs font-semibold">{label}</p>
        {desc && <p className="text-[11px] text-[var(--nv-muted)]">{desc}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={onToggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-[var(--nv-accent)]' : 'bg-stone-400/50'
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan Suara dan TTS"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-3xl border border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl sm:rounded-2xl"
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
                  className={`min-h-[42px] rounded-xl border px-3 text-xs font-semibold transition-colors ${
                    settings.readingMode === mode.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)] hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>

          {/* Speed (0.5x - 3.0x), Pitch & Volume */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-rate" className="text-xs font-semibold text-[var(--nv-muted)]">
                  Kecepatan
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.rate.toFixed(1)}×
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
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-pitch" className="text-xs font-semibold text-[var(--nv-muted)]">
                  Nada (Pitch)
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

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-volume" className="text-xs font-semibold text-[var(--nv-muted)]">
                  Volume
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {Math.round((settings.volume ?? 1) * 100)}%
                </span>
              </div>
              <input
                id="tts-volume"
                type="range"
                min={0.1}
                max={1.0}
                step={0.05}
                value={settings.volume ?? 1.0}
                onChange={(e) => onUpdate({ volume: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)]"
              />
            </div>
          </div>

          {/* Jeda Koma (0-500ms default 200ms), Kalimat & Paragraf */}
          <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3.5 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold">Pengaturan Jeda Alami</p>
              <span className="text-[11px] font-medium text-[var(--nv-muted)]">
                {engineCapabilities.ssmlSupported ? 'SSML Aktif' : 'Antrean Jeda Aktif'}
              </span>
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-comma-pause" className="text-xs text-[var(--nv-muted)]">
                  Jeda di Koma (0–500 ms)
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.commaPauseMs === 0 ? '0 ms (Bawaan)' : `${settings.commaPauseMs} ms`}
                </span>
              </div>
              <input
                id="tts-comma-pause"
                type="range"
                min={0}
                max={500}
                step={25}
                value={settings.commaPauseMs}
                onChange={(e) => onUpdate({ commaPauseMs: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-sentence-pause" className="text-xs text-[var(--nv-muted)]">
                  Jeda Akhir Kalimat
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.sentencePauseMs === 0
                    ? '0 ms (Alami)'
                    : `${settings.sentencePauseMs} ms`}
                </span>
              </div>
              <input
                id="tts-sentence-pause"
                type="range"
                min={0}
                max={600}
                step={50}
                value={settings.sentencePauseMs}
                onChange={(e) => onUpdate({ sentencePauseMs: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)]"
              />
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="tts-para-pause" className="text-xs text-[var(--nv-muted)]">
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
          </div>

          {/* Sleep Timer + Custom + Fade Out */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
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
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const val = Number.parseInt(customSleepInput, 10);
                  if (Number.isFinite(val) && val > 0) {
                    onUpdate({ sleepTimerMinutes: Math.min(360, val) });
                    setCustomSleepInput('');
                  }
                }}
                className="flex"
              >
                <input
                  type="number"
                  min={1}
                  max={360}
                  value={customSleepInput}
                  onChange={(e) => setCustomSleepInput(e.target.value)}
                  placeholder="Kustom"
                  aria-label="Menit kustom timer tidur"
                  className="min-h-[38px] w-full rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-2 text-center text-xs"
                />
              </form>
            </div>

            <ToggleRow
              label="Kecilkan suara perlahan sebelum berhenti"
              desc="Menurunkan volume bertahap 10 detik terakhir"
              checked={settings.fadeOutBeforeStop}
              onToggle={() => onUpdate({ fadeOutBeforeStop: !settings.fadeOutBeforeStop })}
            />
          </div>

          {/* Opsi Pembacaan & Filter Teks */}
          <div className="space-y-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3.5">
            <p className="text-xs font-semibold">Opsi Pembacaan &amp; Filter Teks</p>

            <ToggleRow
              label="Mode Multi Bahasa (Otomatis ID / EN)"
              desc="Ganti voice otomatis sesuai bahasa tiap paragraf"
              checked={settings.multiLangAuto}
              onToggle={() => onUpdate({ multiLangAuto: !settings.multiLangAuto })}
            />
            <ToggleRow
              label="Baca Judul Bab"
              checked={settings.readChapterTitle}
              onToggle={() => onUpdate({ readChapterTitle: !settings.readChapterTitle })}
            />
            <ToggleRow
              label="Suara Catatan Kaki"
              desc="Bacakan catatan kaki & referensi [1]"
              checked={settings.readFootnotes}
              onToggle={() => onUpdate({ readFootnotes: !settings.readFootnotes })}
            />
            <ToggleRow
              label="Lewati Tajuk & Catatan Kaki"
              checked={settings.skipHeadersAndFootnotes}
              onToggle={() =>
                onUpdate({ skipHeadersAndFootnotes: !settings.skipHeadersAndFootnotes })
              }
            />
            <ToggleRow
              label="Lewati Teks di Dalam Kurung (...)"
              checked={settings.skipParentheses}
              onToggle={() => onUpdate({ skipParentheses: !settings.skipParentheses })}
            />
            <ToggleRow
              label="Lewati Simbol & Tanda Kutip Berlebih"
              checked={settings.skipSymbolsAndQuotes}
              onToggle={() => onUpdate({ skipSymbolsAndQuotes: !settings.skipSymbolsAndQuotes })}
            />
          </div>

          {/* Kamus Pelafalan */}
          <div className="space-y-2.5 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3.5">
            <p className="text-xs font-semibold">Kamus Pelafalan</p>
            <form onSubmit={handleAddPronunciationRule} className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={dictPattern}
                onChange={(e) => setDictPattern(e.target.value)}
                placeholder="Kata (mis. Yth.)"
                className="min-h-[38px] flex-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2.5 text-xs"
              />
              <input
                type="text"
                value={dictReplacement}
                onChange={(e) => setDictReplacement(e.target.value)}
                placeholder="Cara baca (mis. Yang terhormat)"
                className="min-h-[38px] flex-1 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2.5 text-xs"
              />
              <button
                type="submit"
                className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded-lg bg-[var(--nv-accent)] px-3 text-xs font-semibold text-white whitespace-nowrap"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Tambah</span>
              </button>
            </form>

            {settings.pronunciationDict.length > 0 && (
              <div className="space-y-1 pt-1">
                {settings.pronunciationDict.map((rule) => (
                  <div
                    key={rule.id}
                    className="flex items-center justify-between gap-2 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2.5 py-1.5 text-xs"
                  >
                    <span className="truncate">
                      <strong>{rule.pattern}</strong> → {rule.replacement}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        onUpdate({
                          pronunciationDict: settings.pronunciationDict.filter(
                            (r) => r.id !== rule.id
                          ),
                        })
                      }
                      aria-label={`Hapus aturan ${rule.pattern}`}
                      className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--nv-muted)] hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Sinkronisasi Aturan Ganti Teks "Hanya untuk TTS" */}
            {(onOpenManageTtsRules || onOpenAddTtsRule) && (
              <div className="mt-2 border-t border-[var(--nv-border)] pt-2.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">
                      Aturan Ganti Khusus TTS ({ttsOnlyRules.filter((r) => r.enabled).length} aktif)
                    </p>
                    <p className="text-[11px] text-[var(--nv-muted)]">
                      Teks layar tetap asli, hanya ucapan TTS yang diganti.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {onOpenAddTtsRule && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenAddTtsRule();
                        }}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-[var(--nv-accent)] px-2.5 text-xs font-semibold text-white whitespace-nowrap"
                      >
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Tambah</span>
                      </button>
                    )}
                    {onOpenManageTtsRules && (
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenManageTtsRules();
                        }}
                        className="inline-flex min-h-[34px] items-center rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
                      >
                        Kelola Aturan TTS
                      </button>
                    )}
                  </div>
                </div>
                {ttsOnlyRules.length > 0 && (
                  <div className="space-y-1">
                    {ttsOnlyRules.slice(0, 3).map((r) => (
                      <p
                        key={r.id}
                        className={`truncate rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2.5 py-1 text-[11px] ${
                          r.enabled ? '' : 'opacity-50'
                        }`}
                      >
                        <strong>"{r.pattern}"</strong> → "{r.replacement}"
                        {!r.enabled ? ' (nonaktif)' : ''}
                      </p>
                    ))}
                    {ttsOnlyRules.length > 3 && (
                      <p className="text-[11px] text-[var(--nv-muted)]">
                        +{ttsOnlyRules.length - 3} aturan TTS lainnya
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Voice Filter & Selection (ID & EN Only) */}
          <div className="border-t border-[var(--nv-border)] pt-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <label htmlFor="tts-lang-filter" className="text-xs font-semibold text-[var(--nv-muted)]">
                  Daftar Voice ID &amp; EN ({filteredVoices.length})
                </label>
                <button
                  type="button"
                  onClick={() => void onRefreshVoices()}
                  aria-label="Muat ulang daftar voice sistem"
                  className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded-lg border border-[var(--nv-border)] hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <RefreshCw className="h-3.5 w-3.5 text-[var(--nv-muted)]" aria-hidden="true" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <select
                  id="tts-lang-filter"
                  value={normalizedFilter}
                  onChange={(e) => onUpdate({ langFilter: e.target.value })}
                  className="min-h-[36px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-2.5 text-xs"
                >
                  <option value="all">ID &amp; Inggris (GB/US)</option>
                  <option value="id">Indonesia (id-ID)</option>
                  <option value="en_gb">Inggris UK (en-GB)</option>
                  <option value="en_us">Inggris US (en-US)</option>
                  <option value="en_all">Semua Inggris (en-*)</option>
                </select>

                <button
                  type="button"
                  onClick={() => onPreviewVoice(settings.voiceURI)}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-[var(--nv-accent)] px-3 text-xs font-semibold text-white hover:opacity-90 whitespace-nowrap"
                >
                  <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                  <span>Tes Suara</span>
                </button>
              </div>
            </div>

            {settings.voiceURI && (
              <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-2 text-xs">
                <span className="truncate text-[var(--nv-muted)]">
                  Aktif: <strong className="text-[var(--nv-text)]">{settings.voiceURI}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => onUpdate({ voiceURI: '' })}
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-[var(--nv-accent)] hover:underline whitespace-nowrap"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  <span>Bawaan Sistem</span>
                </button>
              </div>
            )}

            <div className="max-h-52 overflow-y-auto rounded-xl border border-[var(--nv-border)] divide-y divide-[var(--nv-border)]">
              {filteredVoices.length === 0 ? (
                <p className="p-3 text-xs text-[var(--nv-muted)]">
                  Tidak ada voice terdeteksi pada filter ini. Gunakan suara bawaan, tekan muat ulang, atau buka pengaturan TTS Android.
                </p>
              ) : (
                filteredVoices.map((voice) => {
                  const selected = settings.voiceURI === voice.voiceURI;
                  const engineLabel = formatVoiceEngineLabel(voice);
                  const modeLabel = voice.localService ? 'Offline (Lokal)' : 'Online (Jaringan)';
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
                          {voice.lang || 'id/en'}
                          {engineLabel ? ` · ${engineLabel}` : ''}
                          {` · ${modeLabel}`}
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

            {/* Android TTS Settings, Battery Optimization, Notification Permission */}
            <div className="mt-3 space-y-2">
              <button
                type="button"
                onClick={handleOpenEngineSettings}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span>Tambah Voice / Ganti Mesin TTS</span>
              </button>

              <button
                type="button"
                onClick={handleOpenBatterySettings}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-4 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5"
              >
                <BatteryCharging className="h-4 w-4" aria-hidden="true" />
                <span>Nonaktifkan Optimasi Baterai (Latar Belakang)</span>
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
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-xs font-semibold text-white hover:bg-amber-700"
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
