import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  BatteryCharging,
  Bell,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Moon,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Trash2,
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
  { value: 0, label: 'Dimatikan' },
  { value: 10, label: '10 mnt' },
  { value: 15, label: '15 mnt' },
  { value: 30, label: '30 mnt' },
  { value: 45, label: '45 mnt' },
  { value: 60, label: '60 mnt' },
  { value: -1, label: 'Akhir Bab' },
];

type ActiveInlinePanel = 'voice' | 'speed' | 'timer' | null;

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
  const [expandedPanel, setExpandedPanel] = useState<ActiveInlinePanel>(null);
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

  const togglePanel = (panel: ActiveInlinePanel) => {
    setExpandedPanel((prev) => (prev === panel ? null : panel));
  };

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

  const activeVoiceLabel = settings.voiceURI || 'Bawaan Sistem (ID & EN)';
  const rateDisplay = `${Number(settings.rate.toFixed(1))}x`;
  const timerDisplay =
    sleepRemainingSec !== null
      ? `${Math.floor(sleepRemainingSec / 60)}:${String(sleepRemainingSec % 60).padStart(2, '0')} tersisa`
      : settings.sleepTimerMinutes === 0
        ? 'Dimatikan'
        : settings.sleepTimerMinutes === -1
          ? 'Akhir Bab'
          : `${settings.sleepTimerMinutes} menit`;

  const ReadEraSwitchRow = ({
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
    <div className="flex items-center justify-between gap-4 px-5 py-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[15px] font-normal leading-snug text-[var(--nv-chrome-text)]">
          {label}
        </p>
        {desc && (
          <p className="mt-0.5 text-[12.5px] leading-snug text-[var(--nv-chrome-muted)]">{desc}</p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-label={label}
        aria-checked={checked}
        onClick={onToggle}
        className={`relative inline-flex h-4 w-9 shrink-0 items-center rounded-full transition-colors ${
          checked ? 'bg-[#007e96]' : 'bg-[#6b7578]'
        }`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full shadow-md transition-transform ${
            checked ? 'translate-x-4 bg-[var(--nv-cyan)]' : 'translate-x-0 bg-[#c4cbce]'
          }`}
        />
      </button>
    </div>
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan TTS"
      className="fixed inset-0 z-50 flex flex-col bg-[var(--nv-chrome-bg)] text-[var(--nv-chrome-text)]"
    >
      {/* Top Teal AppBar matching ReadEra Pengaturan TTS */}
      <header className="shrink-0 bg-[var(--nv-teal)] text-[var(--nv-teal-text)] shadow-sm pt-safe">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-2 sm:px-4">
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan suara"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--nv-teal-text)] hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 className="text-[19px] font-medium tracking-tight text-[var(--nv-teal-text)]">Pengaturan TTS</h2>
        </div>
      </header>

      {/* Unboxed ReadEra List Layout */}
      <div className="flex-1 overflow-y-auto pb-safe">
        <div className="mx-auto w-full max-w-3xl pb-10">
          {/* 1. Suara */}
          <button
            type="button"
            onClick={() => togglePanel('voice')}
            className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-normal text-[var(--nv-chrome-text)]">Suara</p>
              <p className="truncate text-[13px] text-[var(--nv-chrome-muted)]">
                {activeVoiceLabel}
              </p>
            </div>
            {expandedPanel === 'voice' ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            )}
          </button>

          {expandedPanel === 'voice' && (
            <div className="border-y border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-5 py-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <label
                    htmlFor="tts-lang-filter"
                    className="text-xs font-semibold text-[var(--nv-chrome-muted)]"
                  >
                    Daftar Voice ID &amp; EN ({filteredVoices.length})
                  </label>
                  <button
                    type="button"
                    onClick={() => void onRefreshVoices()}
                    aria-label="Muat ulang daftar voice sistem"
                    className="inline-flex min-h-[32px] min-w-[32px] items-center justify-center rounded border border-[var(--nv-chrome-border)] hover:bg-white/5"
                  >
                    <RefreshCw
                      className="h-3.5 w-3.5 text-[var(--nv-chrome-muted)]"
                      aria-hidden="true"
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    id="tts-lang-filter"
                    value={normalizedFilter}
                    onChange={(e) => onUpdate({ langFilter: e.target.value })}
                    className="min-h-[36px] rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-2.5 text-xs text-[var(--nv-chrome-text)]"
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
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded bg-[var(--nv-ui-accent)] px-3 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105 whitespace-nowrap"
                  >
                    <Play className="h-3 w-3 fill-current" aria-hidden="true" />
                    <span>Tes Suara</span>
                  </button>
                </div>
              </div>

              {settings.voiceURI && (
                <div className="flex items-center justify-between gap-2 rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 py-2 text-xs">
                  <span className="truncate text-[var(--nv-chrome-muted)]">
                    Aktif:{' '}
                    <strong className="text-[var(--nv-chrome-text)]">{settings.voiceURI}</strong>
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdate({ voiceURI: '' })}
                    className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--nv-gold)] hover:underline whitespace-nowrap"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Bawaan Sistem</span>
                  </button>
                </div>
              )}

              <div className="max-h-56 overflow-y-auto rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] divide-y divide-[var(--nv-chrome-border)]">
                {filteredVoices.length === 0 ? (
                  <p className="p-3 text-xs text-[var(--nv-chrome-muted)]">
                    Tidak ada voice terdeteksi pada filter ini. Gunakan suara bawaan, tekan muat
                    ulang, atau buka pengaturan TTS Android.
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
                          selected ? 'bg-[var(--nv-teal)]/35' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdate({ voiceURI: voice.voiceURI })}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-medium text-[var(--nv-chrome-text)]">
                            {voice.name}
                          </p>
                          <p className="text-xs text-[var(--nv-chrome-muted)]">
                            {voice.lang || 'id/en'}
                            {engineLabel ? ` · ${engineLabel}` : ''}
                            {` · ${modeLabel}`}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => onPreviewVoice(voice.voiceURI)}
                          aria-label={`Pratinjau suara ${voice.name}`}
                          className="inline-flex min-h-[36px] min-w-[36px] shrink-0 items-center justify-center rounded border border-[var(--nv-chrome-border)] hover:bg-white/10"
                        >
                          <Play className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* 2. Kecepatan (+ Pitch & Volume) */}
          <button
            type="button"
            onClick={() => togglePanel('speed')}
            className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-normal text-[var(--nv-chrome-text)]">Kecepatan</p>
              <p className="text-[13px] text-[var(--nv-chrome-muted)] tabular-nums">{rateDisplay}</p>
            </div>
            {expandedPanel === 'speed' ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            )}
          </button>

          {expandedPanel === 'speed' && (
            <div className="border-y border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-5 py-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="tts-rate"
                    className="text-xs font-semibold text-[var(--nv-chrome-muted)]"
                  >
                    Kecepatan
                  </label>
                  <span className="text-xs font-semibold tabular-nums text-[var(--nv-chrome-text)]">
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
                  className="nv-range nv-range-gold w-full bg-white/20 h-[3px] rounded-full"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="tts-pitch"
                    className="text-xs font-semibold text-[var(--nv-chrome-muted)]"
                  >
                    Nada (Pitch)
                  </label>
                  <span className="text-xs font-semibold tabular-nums text-[var(--nv-chrome-text)]">
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
                  className="nv-range nv-range-gold w-full bg-white/20 h-[3px] rounded-full"
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="tts-volume"
                    className="text-xs font-semibold text-[var(--nv-chrome-muted)]"
                  >
                    Volume
                  </label>
                  <span className="text-xs font-semibold tabular-nums text-[var(--nv-chrome-text)]">
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
                  className="nv-range nv-range-gold w-full bg-white/20 h-[3px] rounded-full"
                />
              </div>
            </div>
          )}

          {/* 3. Pewaktu (Sleep Timer) */}
          <button
            type="button"
            onClick={() => togglePanel('timer')}
            className="flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-white/[0.03]"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-normal text-[var(--nv-chrome-text)]">Pewaktu</p>
              <p className="text-[13px] text-[var(--nv-chrome-muted)] tabular-nums">
                {timerDisplay}
              </p>
            </div>
            {expandedPanel === 'timer' ? (
              <ChevronUp className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            ) : (
              <ChevronDown className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            )}
          </button>

          {expandedPanel === 'timer' && (
            <div className="border-y border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-5 py-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-[var(--nv-chrome-muted)]">
                  <Moon className="h-3.5 w-3.5" aria-hidden="true" />
                  Pilih Durasi Pewaktu
                </span>
                {sleepRemainingSec !== null && (
                  <span className="text-xs font-semibold text-[var(--nv-gold)] tabular-nums">
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
                    className={`min-h-[38px] rounded border px-2 text-xs font-medium transition-colors whitespace-nowrap ${
                      settings.sleepTimerMinutes === opt.value
                        ? 'border-[var(--nv-gold)] bg-[var(--nv-gold)]/15 text-[var(--nv-gold)]'
                        : 'border-[var(--nv-chrome-border)] text-[var(--nv-chrome-text)] hover:bg-white/5'
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
                    className="min-h-[38px] w-full rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-2 text-center text-xs text-[var(--nv-chrome-text)]"
                  />
                </form>
              </div>

              <label className="flex items-center justify-between gap-3 pt-1 cursor-pointer">
                <div>
                  <p className="text-xs font-semibold text-[var(--nv-chrome-text)]">
                    Kecilkan suara perlahan sebelum berhenti
                  </p>
                  <p className="text-[11px] text-[var(--nv-chrome-muted)]">
                    Menurunkan volume bertahap 10 detik terakhir
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={settings.fadeOutBeforeStop}
                  onChange={() => onUpdate({ fadeOutBeforeStop: !settings.fadeOutBeforeStop })}
                  className="h-4 w-4 accent-[var(--nv-gold)]"
                />
              </label>
            </div>
          )}

          {/* 4. Mode multi bahasa */}
          <ReadEraSwitchRow
            label="Mode multi bahasa"
            desc="Diperlukan untuk menyuarakan buku yang di dalamnya terdapat lebih dari satu bahasa."
            checked={settings.multiLangAuto}
            onToggle={() => onUpdate({ multiLangAuto: !settings.multiLangAuto })}
          />

          {/* 5. Suara catatan kaki */}
          <ReadEraSwitchRow
            label="Suara catatan kaki"
            desc="Hanya untuk epub, fb2, mobi"
            checked={settings.readFootnotes}
            onToggle={() => onUpdate({ readFootnotes: !settings.readFootnotes })}
          />

          {/* 6. Lewati tajuk dan catatan kaki */}
          <ReadEraSwitchRow
            label="Lewati tajuk dan catatan kaki"
            desc="Hanya untuk pdf, djvu"
            checked={settings.skipHeadersAndFootnotes}
            onToggle={() =>
              onUpdate({ skipHeadersAndFootnotes: !settings.skipHeadersAndFootnotes })
            }
          />

          {/* Below-the-Fold Hairline Sections (All Advanced Controls Intact) */}
          <div className="mt-4 border-t border-[var(--nv-chrome-border)] pt-4 space-y-5">
            {/* Mode Baca TTS & Filter Tambahan */}
            <section className="px-5 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Mode Baca &amp; Filter Teks
              </h3>
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
                    className={`min-h-[40px] rounded border px-3 text-xs font-semibold transition-colors ${
                      settings.readingMode === mode.id
                        ? 'border-[var(--nv-gold)] bg-[var(--nv-gold)]/15 text-[var(--nv-gold)]'
                        : 'border-[var(--nv-chrome-border)] text-[var(--nv-chrome-text)] hover:bg-white/5'
                    }`}
                  >
                    {mode.label}
                  </button>
                ))}
              </div>
            </section>

            <div>
              <ReadEraSwitchRow
                label="Baca Judul Bab"
                checked={settings.readChapterTitle}
                onToggle={() => onUpdate({ readChapterTitle: !settings.readChapterTitle })}
              />
              <ReadEraSwitchRow
                label="Lewati Teks di Dalam Kurung (...)"
                checked={settings.skipParentheses}
                onToggle={() => onUpdate({ skipParentheses: !settings.skipParentheses })}
              />
              <ReadEraSwitchRow
                label="Lewati Simbol & Tanda Kutip Berlebih"
                checked={settings.skipSymbolsAndQuotes}
                onToggle={() =>
                  onUpdate({ skipSymbolsAndQuotes: !settings.skipSymbolsAndQuotes })
                }
              />
            </div>

            {/* Pengaturan Jeda Alami */}
            <section className="border-t border-[var(--nv-chrome-border)] px-5 pt-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                  Pengaturan Jeda Alami
                </h3>
                <span className="text-[11px] font-medium text-[var(--nv-chrome-muted)]">
                  {engineCapabilities.ssmlSupported ? 'SSML Aktif' : 'Antrean Jeda Aktif'}
                </span>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label
                      htmlFor="tts-comma-pause"
                      className="text-xs text-[var(--nv-chrome-muted)]"
                    >
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
                    className="nv-range nv-range-gold w-full bg-white/20 h-[3px] rounded-full"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label
                      htmlFor="tts-sentence-pause"
                      className="text-xs text-[var(--nv-chrome-muted)]"
                    >
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
                    className="nv-range nv-range-gold w-full bg-white/20 h-[3px] rounded-full"
                  />
                </div>

                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <label
                      htmlFor="tts-para-pause"
                      className="text-xs text-[var(--nv-chrome-muted)]"
                    >
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
                    className="nv-range nv-range-gold w-full bg-white/20 h-[3px] rounded-full"
                  />
                </div>
              </div>
            </section>

            {/* Kamus Pelafalan & Aturan Khusus TTS */}
            <section className="border-t border-[var(--nv-chrome-border)] px-5 pt-4 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Kamus Pelafalan
              </h3>
              <form
                onSubmit={handleAddPronunciationRule}
                className="flex flex-col gap-2 sm:flex-row"
              >
                <input
                  type="text"
                  value={dictPattern}
                  onChange={(e) => setDictPattern(e.target.value)}
                  placeholder="Kata (mis. Yth.)"
                  className="min-h-[38px] flex-1 rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-2.5 text-xs text-[var(--nv-chrome-text)]"
                />
                <input
                  type="text"
                  value={dictReplacement}
                  onChange={(e) => setDictReplacement(e.target.value)}
                  placeholder="Cara baca (mis. Yang terhormat)"
                  className="min-h-[38px] flex-1 rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-2.5 text-xs text-[var(--nv-chrome-text)]"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center justify-center gap-1 rounded bg-[var(--nv-ui-accent)] px-3.5 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105 whitespace-nowrap"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tambah</span>
                </button>
              </form>

              {settings.pronunciationDict.length > 0 && (
                <div className="space-y-1.5">
                  {settings.pronunciationDict.map((rule) => (
                    <div
                      key={rule.id}
                      className="flex items-center justify-between gap-2 rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-3 py-1.5 text-xs"
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
                        className="inline-flex h-7 w-7 items-center justify-center rounded text-[var(--nv-chrome-muted)] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {(onOpenManageTtsRules || onOpenAddTtsRule) && (
                <div className="border-t border-[var(--nv-chrome-border)] pt-3 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold">
                        Aturan Ganti Khusus TTS ({ttsOnlyRules.filter((r) => r.enabled).length}{' '}
                        aktif)
                      </p>
                      <p className="text-[11px] text-[var(--nv-chrome-muted)]">
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
                          className="inline-flex min-h-[34px] items-center gap-1 rounded bg-[var(--nv-ui-accent)] px-2.5 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105 whitespace-nowrap"
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
                          className="inline-flex min-h-[34px] items-center rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-2.5 text-xs font-semibold hover:brightness-110 whitespace-nowrap"
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
                          className={`truncate rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-2.5 py-1 text-[11px] ${
                            r.enabled ? '' : 'opacity-50'
                          }`}
                        >
                          <strong>"{r.pattern}"</strong> → "{r.replacement}"
                          {!r.enabled ? ' (nonaktif)' : ''}
                        </p>
                      ))}
                      {ttsOnlyRules.length > 3 && (
                        <p className="text-[11px] text-[var(--nv-chrome-muted)]">
                          +{ttsOnlyRules.length - 3} aturan TTS lainnya
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Pengaturan Mesin Android */}
            <section className="border-t border-[var(--nv-chrome-border)] px-5 pt-4 space-y-2.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Sistem &amp; Mesin TTS Android
              </h3>
              <button
                type="button"
                onClick={handleOpenEngineSettings}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-4 text-xs font-semibold text-[var(--nv-chrome-text)] hover:brightness-110"
              >
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                <span>Tambah Voice / Ganti Mesin TTS</span>
              </button>

              <button
                type="button"
                onClick={handleOpenBatterySettings}
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] px-4 text-xs font-semibold text-[var(--nv-chrome-text)] hover:brightness-110"
              >
                <BatteryCharging className="h-4 w-4" aria-hidden="true" />
                <span>Nonaktifkan Optimasi Baterai (Latar Belakang)</span>
              </button>

              {engineFeedback && (
                <p className="rounded border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-3 text-xs leading-relaxed text-[var(--nv-chrome-muted)]">
                  {engineFeedback}
                </p>
              )}

              {notificationStatus.isNative && !notificationStatus.granted && (
                <button
                  type="button"
                  onClick={onRequestNotificationPermission}
                  className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded bg-[var(--nv-ui-accent)] px-4 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105"
                >
                  <Bell className="h-4 w-4" aria-hidden="true" />
                  <span>Izinkan Notifikasi Kontrol TTS (Android 13+)</span>
                </button>
              )}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};
