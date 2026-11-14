import React, { useRef, useState } from 'react';
import { BookmarkPlus, Minus, Plus, Trash2, Upload, X } from 'lucide-react';
import { TARGET_LANGUAGES } from '../services/translationService';
import type {
  CustomFontRecord,
  OrientationLockMode,
  PageAnimationMode,
  ReaderFont,
  ReaderPreset,
  ReaderSettings,
  ReaderTheme,
  ReadingMode,
  TargetLanguageCode,
  TextAlignMode,
  TranslationProvider,
} from '../types/reader';

interface AppearanceSheetProps {
  open: boolean;
  settings: ReaderSettings;
  customFonts: CustomFontRecord[];
  presets: ReaderPreset[];
  onUpdate: (patch: Partial<ReaderSettings>) => void;
  onImportCustomFont: (file: File) => Promise<void> | void;
  onDeleteCustomFont: (fontId: string) => Promise<void> | void;
  onSavePreset: (name: string) => void;
  onApplyPreset: (preset: ReaderPreset) => void;
  onDeletePreset: (id: string) => void;
  onClose: () => void;
}

const BUILTIN_FONTS: Array<{ id: ReaderFont; label: string; cls: string }> = [
  { id: 'book', label: 'Font Bawaan Buku', cls: 'font-reader-book' },
  { id: 'alice', label: 'Alice', cls: 'font-reader-alice' },
  { id: 'literata', label: 'Literata', cls: 'font-reader-literata' },
  { id: 'merriweather', label: 'Merriweather', cls: 'font-reader-merriweather' },
  { id: 'lora', label: 'Lora', cls: 'font-reader-lora' },
  { id: 'roboto', label: 'Roboto', cls: 'font-reader-roboto' },
  { id: 'noto-serif', label: 'Noto Serif', cls: 'font-reader-noto-serif' },
  { id: 'open-sans', label: 'Open Sans', cls: 'font-reader-open-sans' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', cls: 'font-reader-atkinson' },
  { id: 'jakarta', label: 'Jakarta Sans', cls: 'font-reader-jakarta' },
  { id: 'mono', label: 'Monospace', cls: 'font-reader-mono' },
];

const THEME_OPTIONS: Array<{ id: ReaderTheme; label: string; style: React.CSSProperties }> = [
  { id: 'light', label: 'Siang', style: { backgroundColor: '#faf9f6', color: '#1c1917' } },
  { id: 'dark', label: 'Malam', style: { backgroundColor: '#121417', color: '#e6e3dd' } },
  { id: 'twilight', label: 'Senja', style: { backgroundColor: '#2b2b2b', color: '#bac7d6' } },
  { id: 'sepia', label: 'Sepia', style: { backgroundColor: '#f4ecd8', color: '#3b2f23' } },
  { id: 'amoled', label: 'AMOLED', style: { backgroundColor: '#000000', color: '#e5e5e5' } },
  { id: 'custom', label: 'Kustom', style: { backgroundColor: '#ede9fe', color: '#3b0764' } },
];

export const AppearanceSheet: React.FC<AppearanceSheetProps> = ({
  open,
  settings,
  customFonts,
  presets,
  onUpdate,
  onImportCustomFont,
  onDeleteCustomFont,
  onSavePreset,
  onApplyPreset,
  onDeletePreset,
  onClose,
}) => {
  const fontInputRef = useRef<HTMLInputElement>(null);
  const [presetName, setPresetName] = useState('');

  if (!open) return null;

  const linePct = settings.lineHeightPercent || Math.round(settings.lineHeight * 100);

  const updateLinePercent = (nextPct: number) => {
    const clamped = Math.max(110, Math.min(250, nextPct));
    onUpdate({
      lineHeightPercent: clamped,
      lineHeight: Number((clamped / 100).toFixed(2)),
    });
  };

  const updateMargin = (side: keyof ReaderSettings['margins'], delta: number) => {
    const current = settings.margins[side];
    const next = Math.max(4, Math.min(72, current + delta));
    onUpdate({
      margins: {
        ...settings.margins,
        [side]: next,
      },
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Setelan Tampilan Bacaan"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-xs sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-t-3xl border border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-[var(--nv-border)] sm:hidden" />

        <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-5 py-3.5">
          <h2 className="text-base font-bold">Setelan Tampilan</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup setelan tampilan"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[78vh] space-y-5 overflow-y-auto p-5 pb-safe">
          {/* 1. Mode Baca & Animasi Buka Halaman */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--nv-muted)]">Mode &amp; Membuka Halaman</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'scroll', label: 'Gulir Vertikal' },
                  { id: 'paginated', label: 'Per Halaman' },
                ] as Array<{ id: ReadingMode; label: string }>
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onUpdate({ readingMode: m.id })}
                  className={`min-h-[42px] rounded-xl border px-3 text-xs font-semibold ${
                    settings.readingMode === m.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { id: 'horizontal', label: 'Horizontal' },
                  { id: 'vertical', label: 'Vertikal' },
                  { id: 'fade', label: 'Fade' },
                  { id: 'none', label: 'Tanpa animasi' },
                ] as Array<{ id: PageAnimationMode; label: string }>
              ).map((anim) => (
                <button
                  key={anim.id}
                  type="button"
                  onClick={() => onUpdate({ pageAnimation: anim.id })}
                  className={`min-h-[38px] rounded-xl border px-2.5 text-xs font-medium whitespace-nowrap ${
                    settings.pageAnimation === anim.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {anim.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Mode Warna (6 Tema) */}
          <div className="space-y-2.5">
            <p className="text-xs font-semibold text-[var(--nv-muted)]">Mode Warna (6 Tema)</p>
            <div className="grid grid-cols-3 gap-2">
              {THEME_OPTIONS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onUpdate({ theme: t.id })}
                  style={
                    t.id === 'custom'
                      ? { backgroundColor: settings.customBg, color: settings.customText }
                      : t.style
                  }
                  className={`min-h-[44px] rounded-xl border px-3 text-xs font-bold transition-all ${
                    settings.theme === t.id
                      ? 'border-[var(--nv-accent)] ring-2 ring-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {settings.theme === 'custom' && (
              <div className="grid grid-cols-3 gap-3 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3">
                <label className="flex flex-col gap-1 text-[11px] text-[var(--nv-muted)]">
                  <span>Latar</span>
                  <input
                    type="color"
                    value={settings.customBg}
                    onChange={(e) => onUpdate({ customBg: e.target.value })}
                    className="h-9 w-full cursor-pointer rounded border border-[var(--nv-border)] bg-transparent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[var(--nv-muted)]">
                  <span>Teks</span>
                  <input
                    type="color"
                    value={settings.customText}
                    onChange={(e) => onUpdate({ customText: e.target.value })}
                    className="h-9 w-full cursor-pointer rounded border border-[var(--nv-border)] bg-transparent"
                  />
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-[var(--nv-muted)]">
                  <span>Aksen</span>
                  <input
                    type="color"
                    value={settings.customAccent}
                    onChange={(e) => onUpdate({ customAccent: e.target.value })}
                    className="h-9 w-full cursor-pointer rounded border border-[var(--nv-border)] bg-transparent"
                  />
                </label>
              </div>
            )}
          </div>

          {/* 3. Muka Font + Impor .ttf/.otf */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-[var(--nv-muted)]">
                Muka Font ({BUILTIN_FONTS.length + customFonts.length})
              </p>
              <input
                ref={fontInputRef}
                type="file"
                accept=".ttf,.otf,font/ttf,font/otf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onImportCustomFont(file);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fontInputRef.current?.click()}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg border border-[var(--nv-border)] px-2.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
              >
                <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                <span>Impor .ttf/.otf</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {BUILTIN_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => onUpdate({ font: f.id })}
                  className={`min-h-[40px] rounded-xl border px-2.5 text-xs font-medium truncate ${f.cls} ${
                    settings.font === f.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {customFonts.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] font-medium text-[var(--nv-muted)]">Font Impor Anda</p>
                <div className="space-y-1.5">
                  {customFonts.map((cf) => {
                    const fontKey: ReaderFont = `custom:${cf.id}`;
                    const active = settings.font === fontKey;
                    return (
                      <div
                        key={cf.id}
                        className={`flex items-center justify-between rounded-xl border px-3 py-1.5 ${
                          active
                            ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)]'
                            : 'border-[var(--nv-border)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdate({ font: fontKey })}
                          style={{ fontFamily: `"${cf.familyName}", serif` }}
                          className="flex-1 text-left text-sm font-medium truncate"
                        >
                          {cf.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteCustomFont(cf.id)}
                          aria-label={`Hapus font ${cf.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* 4. Ukuran Font (Stepper - / + dengan angka) */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Ukuran Font</p>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Perkecil ukuran font"
                  onClick={() => onUpdate({ fontSize: Math.max(12, settings.fontSize - 1) })}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold tabular-nums">{settings.fontSize} px</span>
                <button
                  type="button"
                  aria-label="Perbesar ukuran font"
                  onClick={() => onUpdate({ fontSize: Math.min(36, settings.fontSize + 1) })}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* 6. Jarak Baris (Stepper %) */}
            <div className="rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3">
              <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Jarak Baris</p>
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  aria-label="Kurangi jarak baris"
                  onClick={() => updateLinePercent(linePct - 10)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)]"
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="text-sm font-bold tabular-nums">{linePct}%</span>
                <button
                  type="button"
                  aria-label="Tambah jarak baris"
                  onClick={() => updateLinePercent(linePct + 10)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[var(--nv-border)] bg-[var(--nv-surface)]"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          {/* 5. Ketebalan Font */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="reader-font-weight" className="text-xs font-semibold text-[var(--nv-muted)]">
                Ketebalan Font
              </label>
              <span className="text-xs font-semibold tabular-nums">{settings.fontWeight}</span>
            </div>
            <input
              id="reader-font-weight"
              type="range"
              min={300}
              max={700}
              step={100}
              value={settings.fontWeight}
              onChange={(e) => onUpdate({ fontWeight: Number(e.target.value) })}
              className="h-2 w-full accent-[var(--nv-accent)]"
            />
          </div>

          {/* 7. Perataan Teks */}
          <div>
            <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Perataan Teks</p>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'original', label: 'Asli' },
                  { id: 'left', label: 'Rata kiri' },
                  { id: 'justify', label: 'Rata kiri-kanan' },
                  { id: 'original-hyphen', label: 'Asli + Penggarisan' },
                ] as Array<{ id: TextAlignMode; label: string }>
              ).map((al) => (
                <button
                  key={al.id}
                  type="button"
                  onClick={() => onUpdate({ textAlign: al.id })}
                  className={`min-h-[40px] rounded-xl border px-3 text-xs font-medium ${
                    settings.textAlign === al.id
                      ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'border-[var(--nv-border)]'
                  }`}
                >
                  {al.label}
                </button>
              ))}
            </div>
          </div>

          {/* 8 & 9. Tata Letak 2 Halaman & Batas Celah + Layar Tetap Menyala */}
          <div className="space-y-3 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Tata Letak 2 Halaman (Layar Lebar)</p>
                <p className="text-[11px] text-[var(--nv-muted)]">Aktif di tablet / orientasi lanskap</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.twoPageSpread}
                onClick={() => onUpdate({ twoPageSpread: !settings.twoPageSpread })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  settings.twoPageSpread ? 'bg-[var(--nv-accent)]' : 'bg-stone-400/50'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.twoPageSpread ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Batas Celah Halaman</p>
                <p className="text-[11px] text-[var(--nv-muted)]">Tampilkan garis pembatas kolom halaman</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.pageGapBorder}
                onClick={() => onUpdate({ pageGapBorder: !settings.pageGapBorder })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  settings.pageGapBorder ? 'bg-[var(--nv-accent)]' : 'bg-stone-400/50'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.pageGapBorder ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold">Layar Tetap Menyala</p>
                <p className="text-[11px] text-[var(--nv-muted)]">Cegah layar meredup saat membaca</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.keepScreenOn}
                onClick={() => onUpdate({ keepScreenOn: !settings.keepScreenOn })}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  settings.keepScreenOn ? 'bg-[var(--nv-accent)]' : 'bg-stone-400/50'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    settings.keepScreenOn ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* 10. Margin 4 Sisi, Jarak Paragraf & Orientasi Layar */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-[var(--nv-muted)]">Margin 4 Sisi (px) &amp; Jarak Paragraf</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  { side: 'top', label: 'Atas' },
                  { side: 'right', label: 'Kanan' },
                  { side: 'bottom', label: 'Bawah' },
                  { side: 'left', label: 'Kiri' },
                ] as const
              ).map(({ side, label }) => (
                <div
                  key={side}
                  className="flex flex-col items-center rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] p-2"
                >
                  <span className="text-[11px] text-[var(--nv-muted)]">{label}</span>
                  <div className="mt-1 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => updateMargin(side, -4)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--nv-border)]"
                    >
                      −
                    </button>
                    <span className="w-6 text-center text-xs font-semibold tabular-nums">
                      {settings.margins[side]}
                    </span>
                    <button
                      type="button"
                      onClick={() => updateMargin(side, 4)}
                      className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--nv-border)]"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div>
              <div className="mb-1 flex items-center justify-between">
                <label htmlFor="para-spacing" className="text-xs font-semibold text-[var(--nv-muted)]">
                  Jarak Antar Paragraf
                </label>
                <span className="text-xs font-semibold tabular-nums">
                  {settings.paragraphSpacingPx} px
                </span>
              </div>
              <input
                id="para-spacing"
                type="range"
                min={4}
                max={32}
                step={2}
                value={settings.paragraphSpacingPx}
                onChange={(e) => onUpdate({ paragraphSpacingPx: Number(e.target.value) })}
                className="h-2 w-full accent-[var(--nv-accent)]"
              />
            </div>

            <div>
              <p className="mb-1.5 text-xs font-semibold text-[var(--nv-muted)]">Kunci Orientasi Layar</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'auto', label: 'Otomatis' },
                    { id: 'portrait', label: 'Potret' },
                    { id: 'landscape', label: 'Lanskap' },
                  ] as Array<{ id: OrientationLockMode; label: string }>
                ).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => onUpdate({ orientationLock: o.id })}
                    className={`min-h-[38px] rounded-xl border px-2 text-xs font-medium ${
                      settings.orientationLock === o.id
                        ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                        : 'border-[var(--nv-border)]'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Preset Setelan Tersimpan */}
          <div className="space-y-2.5 border-t border-[var(--nv-border)] pt-4">
            <p className="text-xs font-semibold text-[var(--nv-muted)]">Preset Tampilan Tersimpan</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!presetName.trim()) return;
                onSavePreset(presetName.trim());
                setPresetName('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={presetName}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="Nama preset (mis. Malam Nyaman)..."
                className="min-h-[40px] flex-1 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
              />
              <button
                type="submit"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--nv-accent)] px-3.5 text-xs font-semibold text-white whitespace-nowrap"
              >
                <BookmarkPlus className="h-3.5 w-3.5" />
                <span>Simpan</span>
              </button>
            </form>

            {presets.length > 0 && (
              <div className="space-y-1.5">
                {presets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 py-1.5"
                  >
                    <button
                      type="button"
                      onClick={() => onApplyPreset(p)}
                      className="flex-1 text-left text-xs font-semibold hover:text-[var(--nv-accent)]"
                    >
                      {p.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeletePreset(p.id)}
                      aria-label={`Hapus preset ${p.name}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Terjemahan Langsung Settings */}
          <div className="space-y-3 border-t border-[var(--nv-border)] pt-4">
            <p className="text-xs font-semibold text-[var(--nv-muted)]">Terjemahan Langsung</p>
            <div className="flex items-center justify-between gap-4">
              <label htmlFor="target-lang-select" className="text-xs font-medium">
                Bahasa Tujuan
              </label>
              <select
                id="target-lang-select"
                value={settings.targetLanguage}
                onChange={(e) => onUpdate({ targetLanguage: e.target.value as TargetLanguageCode })}
                className="min-h-[40px] rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
              >
                {TARGET_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center justify-between gap-4">
              <label htmlFor="provider-select" className="text-xs font-medium">
                Penyedia Terjemahan
              </label>
              <select
                id="provider-select"
                value={settings.translationProvider}
                onChange={(e) =>
                  onUpdate({ translationProvider: e.target.value as TranslationProvider })
                }
                className="min-h-[40px] rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
              >
                <option value="mymemory">MyMemory (Gratis Tanpa Key)</option>
                <option value="libretranslate">LibreTranslate</option>
              </select>
            </div>

            {settings.translationProvider === 'libretranslate' && (
              <div>
                <label className="mb-1 block text-[11px] text-[var(--nv-muted)]">
                  Endpoint LibreTranslate
                </label>
                <input
                  type="url"
                  value={settings.libreTranslateUrl}
                  onChange={(e) => onUpdate({ libreTranslateUrl: e.target.value })}
                  placeholder="https://libretranslate.com/translate"
                  className="min-h-[38px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
                />
              </div>
            )}

            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold">Terjemahkan Paragraf</p>
                <p className="text-[11px] text-[var(--nv-muted)]">
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
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  settings.paragraphTranslateEnabled ? 'bg-[var(--nv-accent)]' : 'bg-stone-400/50'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
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
