import React, { useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  ChevronRight,
  Download,
  FolderInput,
  Languages,
  Palette,
  RotateCcw,
  SearchCheck,
  SlidersHorizontal,
  Upload,
  Volume2,
} from 'lucide-react';
import type {
  FindReplaceDefaultSettings,
  ReaderSettings,
  ReaderTheme,
  ReplaceScope,
  TargetLanguageCode,
  TranslationProvider,
  TtsSettings,
} from '../types/reader';
import { TARGET_LANGUAGES } from '../services/translationService';
import { DEFAULT_FIND_REPLACE_SETTINGS, SCOPE_LABELS } from '../utils/textReplace';
import { DEFAULT_UI_COLOR } from '../utils/uiTheme';
import { UiColorCustomizer } from './UiColorCustomizer';

interface MainSettingsModalProps {
  open: boolean;
  readerSettings: ReaderSettings;
  ttsSettings: TtsSettings;
  onUpdateReaderSettings: (patch: Partial<ReaderSettings>) => void;
  onOpenReaderAppearance: () => void;
  onOpenTtsSettings: () => void;
  onScanFolder: () => void;
  onExportBackup: () => Promise<void> | void;
  onTriggerRestoreBackup: () => void;
  onResetAllSettings: () => void;
  onClose: () => void;
}

const THEME_OPTIONS: Array<{ id: ReaderTheme; label: string }> = [
  { id: 'light', label: 'Siang' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'twilight', label: 'Senja' },
  { id: 'dark', label: 'Malam' },
  { id: 'amoled', label: 'AMOLED' },
  { id: 'custom', label: 'Kustom' },
];

const DEFAULT_SCOPE_OPTIONS: ReplaceScope[] = [
  'book',
  'chapter',
  'fromHereToEnd',
  'series',
  'global',
];

export const MainSettingsModal: React.FC<MainSettingsModalProps> = ({
  open,
  readerSettings,
  ttsSettings,
  onUpdateReaderSettings,
  onOpenReaderAppearance,
  onOpenTtsSettings,
  onScanFolder,
  onExportBackup,
  onTriggerRestoreBackup,
  onResetAllSettings,
  onClose,
}) => {
  const [confirmReset, setConfirmReset] = useState(false);

  if (!open) return null;

  const findDefaults: FindReplaceDefaultSettings =
    readerSettings.findReplaceDefaults ?? DEFAULT_FIND_REPLACE_SETTINGS;

  const updateFindDefaults = (patch: Partial<FindReplaceDefaultSettings>) => {
    onUpdateReaderSettings({
      findReplaceDefaults: {
        ...findDefaults,
        ...patch,
      },
    });
  };

  const activeThemeLabel =
    THEME_OPTIONS.find((t) => t.id === readerSettings.theme)?.label ?? 'Senja';
  const activeVoiceSummary = ttsSettings.voiceURI
    ? ttsSettings.voiceURI
    : 'Bawaan Sistem (ID & EN)';

  const ToggleSwitch = ({
    checked,
    label,
    onToggle,
  }: {
    checked: boolean;
    label: string;
    onToggle: () => void;
  }) => (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
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
  );

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Setelan Utama NovelVoice"
      className="fixed inset-0 z-40 flex flex-col bg-[var(--nv-chrome-bg)] text-[var(--nv-chrome-text)]"
    >
      <header className="shrink-0 bg-[var(--nv-teal)] text-[var(--nv-teal-text)] shadow-sm pt-safe">
        <div className="mx-auto flex h-14 max-w-3xl items-center gap-3 px-2 sm:px-4">
          <button
            type="button"
            onClick={() => {
              setConfirmReset(false);
              onClose();
            }}
            aria-label="Tutup menu setelan"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[var(--nv-teal-text)] hover:bg-white/10"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <h2 className="text-[19px] font-medium tracking-tight text-[var(--nv-teal-text)]">
            Setelan
          </h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto pb-safe">
        <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-5 pb-12">
          {/* 1. Tampilan & Warna UI */}
          <section className="rounded-[6px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-4 space-y-4">
            <div className="flex items-center gap-2">
              <Palette className="h-4 w-4 text-[var(--nv-cyan)]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Tampilan &amp; Warna UI
              </h3>
            </div>

            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--nv-chrome-text)]">
                Tema Aplikasi &amp; Layar Baca
              </p>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
                {THEME_OPTIONS.map((t) => {
                  const active = readerSettings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => onUpdateReaderSettings({ theme: t.id })}
                      className={`min-h-[38px] rounded-[4px] border px-2 text-xs font-semibold transition-colors ${
                        active
                          ? 'border-[var(--nv-ui-accent)] bg-[var(--nv-ui-accent)]/15 text-[var(--nv-ui-accent)]'
                          : 'border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)]'
                      }`}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {readerSettings.theme === 'custom' && (
                <div className="mt-3 grid grid-cols-3 gap-2 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] p-2.5">
                  <label className="flex flex-col gap-1 text-[11px] text-[var(--nv-chrome-muted)]">
                    <span>Latar Baca</span>
                    <input
                      type="color"
                      value={readerSettings.customBg}
                      onChange={(e) => onUpdateReaderSettings({ customBg: e.target.value })}
                      className="h-8 w-full cursor-pointer rounded border border-[var(--nv-chrome-border)] bg-transparent"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-[var(--nv-chrome-muted)]">
                    <span>Warna Teks</span>
                    <input
                      type="color"
                      value={readerSettings.customText}
                      onChange={(e) => onUpdateReaderSettings({ customText: e.target.value })}
                      className="h-8 w-full cursor-pointer rounded border border-[var(--nv-chrome-border)] bg-transparent"
                    />
                  </label>
                  <label className="flex flex-col gap-1 text-[11px] text-[var(--nv-chrome-muted)]">
                    <span>Warna Sorot</span>
                    <input
                      type="color"
                      value={readerSettings.customAccent}
                      onChange={(e) => onUpdateReaderSettings({ customAccent: e.target.value })}
                      className="h-8 w-full cursor-pointer rounded border border-[var(--nv-chrome-border)] bg-transparent"
                    />
                  </label>
                </div>
              )}
            </div>

            <div className="border-t border-[var(--nv-chrome-border)] pt-3.5">
              <UiColorCustomizer
                value={readerSettings.uiColor || DEFAULT_UI_COLOR}
                onChange={(uiColor) => onUpdateReaderSettings({ uiColor })}
              />
            </div>

            <button
              type="button"
              onClick={onOpenReaderAppearance}
              className="flex min-h-[46px] w-full items-center justify-between gap-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3.5 py-2.5 text-left hover:border-[var(--nv-ui-accent)]/60"
            >
              <div className="flex items-center gap-3 min-w-0">
                <BookOpen className="h-4 w-4 shrink-0 text-[var(--nv-cyan)]" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--nv-chrome-text)]">
                    Setelan Bacaan (Font, Ukuran, Spasi, Margin)
                  </p>
                  <p className="truncate text-xs text-[var(--nv-chrome-muted)]">
                    Tema {activeThemeLabel} · Font {readerSettings.font} · {readerSettings.fontSize}px ·{' '}
                    {readerSettings.readingMode === 'scroll' ? 'Gulir' : 'Per Halaman'}
                  </p>
                </div>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            </button>
          </section>

          {/* 2. Suara & TTS */}
          <section className="rounded-[6px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Volume2 className="h-4 w-4 text-[var(--nv-cyan)]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Suara &amp; Text-to-Speech (TTS)
              </h3>
            </div>

            <button
              type="button"
              onClick={onOpenTtsSettings}
              className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3.5 py-2.5 text-left hover:border-[var(--nv-ui-accent)]/60"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-[var(--nv-chrome-text)]">
                  Pengaturan Suara, Kecepatan &amp; Jeda TTS
                </p>
                <p className="truncate text-xs text-[var(--nv-chrome-muted)]">
                  {activeVoiceSummary} · {ttsSettings.rate.toFixed(1)}× ·{' '}
                  {ttsSettings.readingMode === 'flowing' ? 'Mengalir' : 'Per kalimat'}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-[var(--nv-chrome-muted)]" />
            </button>
          </section>

          {/* 3. Terjemahan Langsung */}
          <section className="rounded-[6px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Languages className="h-4 w-4 text-[var(--nv-cyan)]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Terjemahan Langsung
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--nv-chrome-muted)]">
                  Bahasa Tujuan
                </span>
                <select
                  aria-label="Bahasa tujuan terjemahan"
                  value={readerSettings.targetLanguage}
                  onChange={(e) =>
                    onUpdateReaderSettings({
                      targetLanguage: e.target.value as TargetLanguageCode,
                    })
                  }
                  className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-xs text-[var(--nv-chrome-text)]"
                >
                  {TARGET_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--nv-chrome-muted)]">
                  Penyedia Terjemahan
                </span>
                <select
                  aria-label="Penyedia terjemahan"
                  value={readerSettings.translationProvider}
                  onChange={(e) =>
                    onUpdateReaderSettings({
                      translationProvider: e.target.value as TranslationProvider,
                    })
                  }
                  className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-xs text-[var(--nv-chrome-text)]"
                >
                  <option value="mymemory">MyMemory (Gratis Tanpa Key)</option>
                  <option value="libretranslate">LibreTranslate</option>
                </select>
              </label>
            </div>

            {readerSettings.translationProvider === 'libretranslate' && (
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-[var(--nv-chrome-muted)]">
                  Endpoint LibreTranslate
                </span>
                <input
                  type="url"
                  value={readerSettings.libreTranslateUrl}
                  onChange={(e) => onUpdateReaderSettings({ libreTranslateUrl: e.target.value })}
                  placeholder="https://libretranslate.com/translate"
                  className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-xs text-[var(--nv-chrome-text)]"
                />
              </label>
            )}

            <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3.5 py-2.5">
              <div>
                <p className="text-xs font-semibold">Terjemahkan Paragraf Otomatis</p>
                <p className="text-[11px] text-[var(--nv-chrome-muted)]">
                  Tampilkan terjemahan di bawah teks asli saat membaca online
                </p>
              </div>
              <ToggleSwitch
                checked={readerSettings.paragraphTranslateEnabled}
                label="Terjemahkan paragraf otomatis"
                onToggle={() =>
                  onUpdateReaderSettings({
                    paragraphTranslateEnabled: !readerSettings.paragraphTranslateEnabled,
                  })
                }
              />
            </div>
          </section>

          {/* 4. Default Cari & Ganti Teks */}
          <section className="rounded-[6px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <SearchCheck className="h-4 w-4 text-[var(--nv-cyan)]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Default Cari &amp; Ganti Teks
              </h3>
            </div>

            <label className="block">
              <span className="mb-1 block text-xs font-medium text-[var(--nv-chrome-muted)]">
                Cakupan Bawaan
              </span>
              <select
                aria-label="Cakupan bawaan cari dan ganti"
                value={findDefaults.defaultScope}
                onChange={(e) =>
                  updateFindDefaults({ defaultScope: e.target.value as ReplaceScope })
                }
                className="min-h-[40px] w-full rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3 text-xs text-[var(--nv-chrome-text)]"
              >
                {DEFAULT_SCOPE_OPTIONS.map((scope) => (
                  <option key={scope} value={scope}>
                    {SCOPE_LABELS[scope]}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3.5 py-2">
                <span className="text-xs font-medium">Peka huruf besar &amp; kecil</span>
                <ToggleSwitch
                  checked={findDefaults.defaultCaseSensitive}
                  label="Default peka huruf besar kecil"
                  onToggle={() =>
                    updateFindDefaults({
                      defaultCaseSensitive: !findDefaults.defaultCaseSensitive,
                    })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3.5 py-2">
                <span className="text-xs font-medium">Kata utuh secara bawaan</span>
                <ToggleSwitch
                  checked={findDefaults.defaultWholeWord}
                  label="Default kata utuh"
                  onToggle={() =>
                    updateFindDefaults({ defaultWholeWord: !findDefaults.defaultWholeWord })
                  }
                />
              </div>

              <div className="flex items-center justify-between gap-3 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-3.5 py-2">
                <span className="text-xs font-medium">Terapkan aturan ke Daftar Isi</span>
                <ToggleSwitch
                  checked={findDefaults.applyToToc}
                  label="Terapkan aturan ganti ke Daftar Isi"
                  onToggle={() => updateFindDefaults({ applyToToc: !findDefaults.applyToToc })}
                />
              </div>
            </div>
          </section>

          {/* 5. Cadangan, Perpustakaan & Reset */}
          <section className="rounded-[6px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-card)] p-4 space-y-3">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="h-4 w-4 text-[var(--nv-cyan)]" aria-hidden="true" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--nv-cyan)]">
                Cadangan Data &amp; Sistem
              </h3>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => void onExportBackup()}
                className="flex min-h-[42px] items-center justify-center gap-2 rounded-[4px] bg-[var(--nv-teal)] px-4 text-xs font-semibold text-[var(--nv-teal-text)] hover:brightness-105"
              >
                <Download className="h-4 w-4" aria-hidden="true" />
                <span>Ekspor Cadangan (.json)</span>
              </button>

              <button
                type="button"
                onClick={onTriggerRestoreBackup}
                className="flex min-h-[42px] items-center justify-center gap-2 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-4 text-xs font-semibold hover:brightness-110"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Pulihkan dari File (.json)</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onScanFolder}
              className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-[4px] border border-[var(--nv-chrome-border)] bg-[var(--nv-chrome-bg)] px-4 text-xs font-semibold hover:brightness-110"
            >
              <FolderInput className="h-4 w-4" aria-hidden="true" />
              <span>Pindai Folder EPUB dari Perangkat</span>
            </button>

            <div className="border-t border-[var(--nv-chrome-border)] pt-3">
              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-[4px] border border-red-400/35 px-4 text-xs font-semibold text-red-400 hover:bg-red-500/10"
                >
                  <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Reset Setelan ke Bawaan</span>
                </button>
              ) : (
                <div className="flex flex-col gap-2 rounded-[4px] border border-red-400/40 bg-red-950/25 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-xs text-[var(--nv-chrome-text)]">
                    Kembalikan semua setelan tampilan &amp; TTS ke bawaan (buku tetap aman)?
                  </p>
                  <div className="flex items-center justify-end gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setConfirmReset(false)}
                      className="min-h-[34px] rounded-[4px] border border-[var(--nv-chrome-border)] px-3 text-xs font-medium"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onResetAllSettings();
                        setConfirmReset(false);
                      }}
                      className="min-h-[34px] rounded-[4px] bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700"
                    >
                      Ya, Reset
                    </button>
                  </div>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
