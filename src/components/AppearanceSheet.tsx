import React from 'react';
import { X } from 'lucide-react';
import { TARGET_LANGUAGES } from '../services/translationService';
import type { ReaderFont, ReaderSettings, ReaderTheme, ReadingMode, TargetLanguageCode } from '../types/reader';

interface AppearanceSheetProps {
  open: boolean;
  settings: ReaderSettings;
  onUpdate: (patch: Partial<ReaderSettings>) => void;
  onClose: () => void;
}

export const AppearanceSheet: React.FC<AppearanceSheetProps> = ({
  open,
  settings,
  onUpdate,
  onClose,
}) => {
  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pengaturan Tampilan dan Terjemahan"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-t-3xl border border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[var(--nv-border)] sm:hidden" />

        <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-5 py-3.5">
          <h2 className="text-base font-bold">Tampilan &amp; Bacaan</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pengaturan tampilan"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[75vh] space-y-5 overflow-y-auto p-5 pb-safe">
          {/* Theme */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Tema Warna</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'light', label: 'Terang', preview: 'bg-[#faf9f6] text-[#1c1917]' },
                  { id: 'sepia', label: 'Sepia', preview: 'bg-[#f4ecd8] text-[#3b2f23]' },
                  { id: 'dark', label: 'Gelap', preview: 'bg-[#121417] text-[#e6e3dd]' },
                ] as Array<{ id: ReaderTheme; label: string; preview: string }>
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUpdate({ theme: t.id })}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold transition-all ${t.preview} ${
                    settings.theme === t.id
                      ? 'border-[var(--nv-accent)] ring-2 ring-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Family */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Jenis Huruf</p>
            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  { id: 'literata', label: 'Literata', cls: 'font-reader-literata' },
                  { id: 'jakarta', label: 'Sans', cls: 'font-reader-jakarta' },
                  { id: 'mono', label: 'Mono', cls: 'font-reader-mono' },
                ] as Array<{ id: ReaderFont; label: string; cls: string }>
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onUpdate({ font: f.id })}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium transition-colors ${f.cls} ${
                    settings.font === f.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="reader-font-size" className="text-xs font-semibold text-[var(--nv-muted)]">
                Ukuran Font
              </label>
              <span className="text-xs font-semibold tabular-nums">{settings.fontSize} px</span>
            </div>
            <input
              id="reader-font-size"
              type="range"
              min={14}
              max={28}
              step={1}
              value={settings.fontSize}
              onChange={(e) => onUpdate({ fontSize: Number(e.target.value) })}
              className="h-2 w-full accent-[var(--nv-accent)]"
            />
          </div>

          {/* Line Spacing */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <label htmlFor="reader-line-height" className="text-xs font-semibold text-[var(--nv-muted)]">
                Jarak Baris
              </label>
              <span className="text-xs font-semibold tabular-nums">
                {settings.lineHeight.toFixed(1)}×
              </span>
            </div>
            <input
              id="reader-line-height"
              type="range"
              min={1.4}
              max={2.2}
              step={0.1}
              value={settings.lineHeight}
              onChange={(e) => onUpdate({ lineHeight: Number(e.target.value) })}
              className="h-2 w-full accent-[var(--nv-accent)]"
            />
          </div>

          {/* Reading Mode */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Mode Baca</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'scroll', label: 'Gulir Vertikal (Scroll)' },
                  { id: 'paginated', label: 'Halaman (Paginated)' },
                ] as Array<{ id: ReadingMode; label: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdate({ readingMode: m.id })}
                  className={`min-h-[44px] rounded-xl border px-3 text-sm font-medium transition-colors ${
                    settings.readingMode === m.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>
          </div>

          {/* Translation Language & Inline Paragraph Translation */}
          <div className="border-t border-[var(--nv-border)] pt-4 space-y-3">
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="target-lang-select" className="text-sm font-medium">
                Bahasa Terjemahan
              </label>
              <select
                id="target-lang-select"
                value={settings.targetLanguage}
                onChange={(e) => onUpdate({ targetLanguage: e.target.value as TargetLanguageCode })}
                className="min-h-[44px] rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-sm"
              >
                {TARGET_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium">Terjemahkan Paragraf</p>
                <p className="text-xs text-[var(--nv-muted)]">
                  Tampilkan terjemahan di bawah teks asli saat online
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.paragraphTranslateEnabled}
                aria-label="Aktifkan terjemahan paragraf"
                onClick={() =>
                  onUpdate({ paragraphTranslateEnabled: !settings.paragraphTranslateEnabled })
                }
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${
                  settings.paragraphTranslateEnabled ? 'bg-[var(--nv-accent)]' : 'bg-stone-400/50'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    settings.paragraphTranslateEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
