import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Minus,
  Plus,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { DEFAULT_UI_COLOR } from '../utils/uiTheme';
import { GeminiTranslationConfig } from './GeminiTranslationConfig';
import { UiColorCustomizer } from './UiColorCustomizer';
import type {
  CustomFontRecord,
  OrientationLockMode,
  PageAnimationMode,
  ReaderFont,
  ReaderPreset,
  ReaderSettings,
  ReaderTheme,
  ReadingMode,
  TextAlignMode,
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

const BUILTIN_FONTS: Array<{ id: ReaderFont; label: string }> = [
  { id: 'book', label: 'Font Bawaan Buku' },
  { id: 'alice', label: 'Alice' },
  { id: 'literata', label: 'Literata' },
  { id: 'merriweather', label: 'Merriweather' },
  { id: 'lora', label: 'Lora' },
  { id: 'roboto', label: 'Roboto' },
  { id: 'noto-serif', label: 'Noto Serif' },
  { id: 'open-sans', label: 'Open Sans' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible' },
  { id: 'jakarta', label: 'Jakarta Sans' },
  { id: 'mono', label: 'Monospace' },
];

const THEME_OPTIONS: Array<{ id: ReaderTheme; label: string }> = [
  { id: 'light', label: 'Siang' },
  { id: 'dark', label: 'Malam' },
  { id: 'twilight', label: 'Senja' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'amoled', label: 'AMOLED' },
  { id: 'custom', label: 'Kustom' },
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
  const [showGeneral, setShowGeneral] = useState(false);

  useEffect(() => {
    if (open) setShowGeneral(false);
  }, [open]);

  if (!open) return null;

  const linePct = settings.lineHeightPercent || Math.round(settings.lineHeight * 100);
  const weightRatio = ((settings.fontWeight - 300) / 400) * 100;

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

  const GoldSwitch = ({
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
      className="relative inline-flex h-5 w-10 shrink-0 items-center"
    >
      <span
        className={`h-3.5 w-9 rounded-full transition-colors ${
          checked ? 'bg-[var(--nv-gold)]/55' : 'bg-stone-500/50'
        }`}
      />
      <span
        className={`absolute h-5 w-5 rounded-full shadow transition-transform ${
          checked
            ? 'translate-x-5 bg-[var(--nv-gold)]'
            : 'translate-x-0 bg-stone-200'
        }`}
      />
    </button>
  );

  // Full General Settings Screen (when user clicks SETELAN UMUM)
  if (showGeneral) {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Setelan Umum Tampilan"
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-3 backdrop-blur-xs sm:p-5"
        onClick={onClose}
      >
        <div
          className="flex max-h-[88vh] w-full max-w-xl flex-col overflow-hidden rounded-lg border border-white/10 bg-[var(--nv-sheet-bg)] text-[var(--nv-text)] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between bg-[var(--nv-teal)] px-2 py-1.5 text-[var(--nv-teal-text)]">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setShowGeneral(false)}
                aria-label="Kembali ke setelan cepat"
                className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-full hover:bg-white/10"
              >
                <ArrowLeft className="h-5 w-5" />
              </button>
              <h2 className="text-sm font-bold tracking-wide uppercase">Setelan Umum</h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup setelan tampilan"
              className="inline-flex min-h-[42px] min-w-[42px] items-center justify-center rounded-full hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 space-y-5 overflow-y-auto p-4 pb-safe">
            {/* Warna UI Aplikasi (Custom UI Color) */}
            <div className="rounded-[6px] border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] p-3">
              <UiColorCustomizer
                value={settings.uiColor || DEFAULT_UI_COLOR}
                onChange={(uiColor) => onUpdate({ uiColor })}
              />
            </div>

            {/* Mode Baca */}
            <div>
              <p className="mb-2 text-xs font-semibold text-[var(--nv-muted)]">Mode Membaca</p>
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
                    className={`min-h-[40px] rounded-[4px] border px-3 text-xs font-semibold ${
                      settings.readingMode === m.id
                        ? 'border-[var(--nv-gold)] bg-[var(--nv-gold)]/15 text-[var(--nv-gold)]'
                        : 'border-[var(--nv-border)] bg-[var(--nv-sheet-card)]'
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Impor Font .ttf/.otf & Custom Fonts */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-[var(--nv-muted)]">
                  Font Kustom (.ttf / .otf)
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
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-[4px] bg-[var(--nv-ui-accent)] px-3 text-xs font-bold text-[var(--nv-ui-accent-text)]"
                >
                  <Upload className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Impor .ttf/.otf</span>
                </button>
              </div>
              {customFonts.length > 0 && (
                <div className="space-y-1.5">
                  {customFonts.map((cf) => {
                    const fontKey: ReaderFont = `custom:${cf.id}`;
                    const active = settings.font === fontKey;
                    return (
                      <div
                        key={cf.id}
                        className={`flex items-center justify-between rounded-[4px] border px-3 py-1.5 ${
                          active
                            ? 'border-[var(--nv-gold)] bg-[var(--nv-gold)]/15'
                            : 'border-[var(--nv-border)] bg-[var(--nv-sheet-card)]'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => onUpdate({ font: fontKey })}
                          style={{ fontFamily: `"${cf.familyName}", serif` }}
                          className="flex-1 truncate text-left text-sm font-medium"
                        >
                          {cf.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => void onDeleteCustomFont(cf.id)}
                          aria-label={`Hapus font ${cf.name}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--nv-muted)] hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Layar Tetap Menyala */}
            <div className="flex items-center justify-between gap-3 rounded-[4px] bg-[var(--nv-sheet-card)] px-3.5 py-2.5">
              <div>
                <p className="text-xs font-semibold">Layar Tetap Menyala</p>
                <p className="text-[11px] text-[var(--nv-muted)]">
                  Cegah layar meredup saat membaca
                </p>
              </div>
              <GoldSwitch
                checked={settings.keepScreenOn}
                label="Layar Tetap Menyala"
                onToggle={() => onUpdate({ keepScreenOn: !settings.keepScreenOn })}
              />
            </div>

            {/* Margin 4 Sisi & Jarak Paragraf */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-[var(--nv-muted)]">
                Margin 4 Sisi (px) &amp; Jarak Paragraf
              </p>
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
                    className="flex flex-col items-center rounded-[4px] bg-[var(--nv-sheet-card)] p-2"
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
                  className="nv-range nv-range-gold w-full"
                  style={{
                    background: `linear-gradient(to right, var(--nv-gold) ${((settings.paragraphSpacingPx - 4) / 28) * 100}%, rgba(150,150,150,0.35) ${((settings.paragraphSpacingPx - 4) / 28) * 100}%)`,
                    height: '3px',
                  }}
                />
              </div>

              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--nv-muted)]">
                  Kunci Orientasi Layar
                </p>
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
                      className={`min-h-[38px] rounded-[4px] border px-2 text-xs font-medium ${
                        settings.orientationLock === o.id
                          ? 'border-[var(--nv-gold)] bg-[var(--nv-gold)]/15 text-[var(--nv-gold)]'
                          : 'border-[var(--nv-border)] bg-[var(--nv-sheet-card)]'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preset Tampilan */}
            <div className="space-y-2.5 border-t border-[var(--nv-border)] pt-4">
              <p className="text-xs font-semibold text-[var(--nv-muted)]">
                Preset Tampilan Tersimpan
              </p>
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
                  className="min-h-[38px] flex-1 rounded-[4px] border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
                />
                <button
                  type="submit"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-[4px] bg-[var(--nv-ui-accent)] px-3.5 text-xs font-bold text-[var(--nv-ui-accent-text)] whitespace-nowrap"
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
                      className="flex items-center justify-between rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-1.5"
                    >
                      <button
                        type="button"
                        onClick={() => onApplyPreset(p)}
                        className="flex-1 text-left text-xs font-semibold hover:text-[var(--nv-gold)]"
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeletePreset(p.id)}
                        aria-label={`Hapus preset ${p.name}`}
                        className="inline-flex h-8 w-8 items-center justify-center rounded text-[var(--nv-muted)] hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Terjemahan Langsung */}
            <div className="space-y-3 border-t border-[var(--nv-border)] pt-4">
              <p className="text-xs font-semibold text-[var(--nv-muted)]">Terjemahan Langsung</p>
              <GeminiTranslationConfig
                settings={settings}
                onUpdate={onUpdate}
                surface="sheet"
                idPrefix="sheet-trans"
              />

              <div className="flex items-center justify-between gap-4 rounded-[4px] bg-[var(--nv-sheet-card)] px-3.5 py-2.5">
                <div>
                  <p className="text-xs font-semibold">Terjemahkan Paragraf</p>
                  <p className="text-[11px] text-[var(--nv-muted)]">
                    Tampilkan terjemahan di bawah teks asli saat online
                  </p>
                </div>
                <GoldSwitch
                  checked={settings.paragraphTranslateEnabled}
                  label="Aktifkan terjemahan paragraf"
                  onToggle={() =>
                    onUpdate({ paragraphTranslateEnabled: !settings.paragraphTranslateEnabled })
                  }
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Primary Floating Top-Right ReadEra Popover (Screenshot cdacc9d9.jpg)
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Setelan Tampilan Bacaan"
      className="fixed inset-0 z-50 bg-black/30"
      onClick={onClose}
    >
      <div
        className="fixed right-2 top-12 z-50 max-h-[82vh] w-[calc(100%-1rem)] max-w-[330px] overflow-y-auto rounded-[6px] border border-white/10 bg-[var(--nv-sheet-bg)] p-2 text-[var(--nv-text)] shadow-2xl sm:right-5 sm:top-14"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Cyan Header */}
        <h2 className="px-2 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-[var(--nv-cyan)]">
          SETELAN EPUB &amp; TAMPILAN BACAAN
        </h2>

        <div className="space-y-1.5">
          {/* 1. MEMBUKA HALAMAN */}
          <label className="block rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-muted)]">
              MEMBUKA HALAMAN
            </span>
            <select
              aria-label="Membuka halaman"
              value={settings.pageAnimation}
              onChange={(e) => onUpdate({ pageAnimation: e.target.value as PageAnimationMode })}
              className="mt-0.5 w-full bg-transparent text-sm font-normal focus:outline-none"
            >
              <option value="horizontal" className="bg-[var(--nv-sheet-bg)]">
                Horisontal
              </option>
              <option value="vertical" className="bg-[var(--nv-sheet-bg)]">
                Vertikal
              </option>
              <option value="fade" className="bg-[var(--nv-sheet-bg)]">
                Fade
              </option>
              <option value="none" className="bg-[var(--nv-sheet-bg)]">
                Tanpa animasi
              </option>
            </select>
          </label>

          {/* 2. MODE WARNA */}
          <label className="block rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-muted)]">
              MODE WARNA
            </span>
            <select
              aria-label="Mode warna"
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value as ReaderTheme })}
              className="mt-0.5 w-full bg-transparent text-sm font-normal focus:outline-none"
            >
              {THEME_OPTIONS.map((t) => (
                <option key={t.id} value={t.id} className="bg-[var(--nv-sheet-bg)]">
                  {t.label}
                </option>
              ))}
            </select>
          </label>

          {settings.theme === 'custom' && (
            <div className="grid grid-cols-3 gap-2 rounded-[4px] bg-[var(--nv-sheet-card)] p-2">
              <label className="flex flex-col gap-0.5 text-[10px] text-[var(--nv-muted)]">
                <span>Latar</span>
                <input
                  type="color"
                  value={settings.customBg}
                  onChange={(e) => onUpdate({ customBg: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-[var(--nv-border)] bg-transparent"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-[var(--nv-muted)]">
                <span>Teks</span>
                <input
                  type="color"
                  value={settings.customText}
                  onChange={(e) => onUpdate({ customText: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-[var(--nv-border)] bg-transparent"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-[var(--nv-muted)]">
                <span>Aksen</span>
                <input
                  type="color"
                  value={settings.customAccent}
                  onChange={(e) => onUpdate({ customAccent: e.target.value })}
                  className="h-7 w-full cursor-pointer rounded border border-[var(--nv-border)] bg-transparent"
                />
              </label>
            </div>
          )}

          {/* 3. MUKA FONT */}
          <label className="block rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-muted)]">
              MUKA FONT
            </span>
            <select
              aria-label="Muka font"
              value={settings.font}
              onChange={(e) => onUpdate({ font: e.target.value as ReaderFont })}
              className="mt-0.5 w-full bg-transparent text-sm font-normal focus:outline-none"
            >
              {BUILTIN_FONTS.map((f) => (
                <option key={f.id} value={f.id} className="bg-[var(--nv-sheet-bg)]">
                  {f.label}
                </option>
              ))}
              {customFonts.map((cf) => (
                <option key={cf.id} value={`custom:${cf.id}`} className="bg-[var(--nv-sheet-bg)]">
                  {cf.name} (Impor)
                </option>
              ))}
            </select>
          </label>

          {/* 4. UKURAN FONT (- N +) */}
          <div className="rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-muted)]">
              UKURAN FONT
            </span>
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                aria-label="Perkecil ukuran font"
                onClick={() => onUpdate({ fontSize: Math.max(12, settings.fontSize - 1) })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/40 hover:bg-white/10"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-medium tabular-nums">{settings.fontSize}</span>
              <button
                type="button"
                aria-label="Perbesar ukuran font"
                onClick={() => onUpdate({ fontSize: Math.min(36, settings.fontSize + 1) })}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/40 hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 5. KETEBALAN FONT (Gold Slider) */}
          <div className="rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-2">
            <div className="mb-2 flex items-center justify-between">
              <label
                htmlFor="reader-font-weight"
                className="text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-muted)]"
              >
                KETEBALAN FONT
              </label>
              <span className="text-[11px] text-[var(--nv-muted)] tabular-nums">
                {settings.fontWeight}
              </span>
            </div>
            <input
              id="reader-font-weight"
              type="range"
              min={300}
              max={700}
              step={100}
              value={settings.fontWeight}
              onChange={(e) => onUpdate({ fontWeight: Number(e.target.value) })}
              className="nv-range nv-range-gold w-full"
              style={{
                background: `linear-gradient(to right, var(--nv-gold) ${weightRatio}%, rgba(180,180,180,0.3) ${weightRatio}%)`,
                height: '3px',
              }}
            />
          </div>

          {/* 6. SPASI BARIS (- N% +) */}
          <div className="rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-muted)]">
              SPASI BARIS
            </span>
            <div className="mt-1 flex items-center justify-between">
              <button
                type="button"
                aria-label="Kurangi jarak baris"
                onClick={() => updateLinePercent(linePct - 10)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/40 hover:bg-white/10"
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <span className="text-sm font-medium tabular-nums">{linePct}%</span>
              <button
                type="button"
                aria-label="Tambah jarak baris"
                onClick={() => updateLinePercent(linePct + 10)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-current/40 hover:bg-white/10"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* 7. PERATAAN TEKS */}
          <label className="block rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-1.5">
            <span className="block text-[10px] font-semibold uppercase tracking-wide text-[var(--nv-muted)]">
              PERATAAN TEKS
            </span>
            <select
              aria-label="Perataan teks"
              value={settings.textAlign}
              onChange={(e) => onUpdate({ textAlign: e.target.value as TextAlignMode })}
              className="mt-0.5 w-full bg-transparent text-sm font-normal focus:outline-none"
            >
              <option value="original" className="bg-[var(--nv-sheet-bg)]">
                Asli
              </option>
              <option value="left" className="bg-[var(--nv-sheet-bg)]">
                Rata kiri
              </option>
              <option value="justify" className="bg-[var(--nv-sheet-bg)]">
                Rata kiri-kanan
              </option>
              <option value="original-hyphen" className="bg-[var(--nv-sheet-bg)]">
                Asli + Penggarisan
              </option>
            </select>
          </label>

          {/* 8. Tampilan 2 halaman */}
          <div className="flex items-center justify-between rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-2.5">
            <span className="text-sm">Tampilan 2 halaman</span>
            <GoldSwitch
              checked={settings.twoPageSpread}
              label="Tampilan 2 halaman"
              onToggle={() => onUpdate({ twoPageSpread: !settings.twoPageSpread })}
            />
          </div>

          {/* 9. Batas jarak halaman */}
          <div className="flex items-center justify-between rounded-[4px] bg-[var(--nv-sheet-card)] px-3 py-2.5">
            <span className="text-sm">Batas jarak halaman</span>
            <GoldSwitch
              checked={settings.pageGapBorder}
              label="Batas jarak halaman"
              onToggle={() => onUpdate({ pageGapBorder: !settings.pageGapBorder })}
            />
          </div>
        </div>

        {/* Footer: SETELAN UMUM */}
        <button
          type="button"
          onClick={() => setShowGeneral(true)}
          className="mt-1.5 flex min-h-[42px] w-full items-center justify-center rounded-[4px] text-xs font-bold tracking-wider uppercase hover:bg-white/5"
        >
          SETELAN UMUM
        </button>
      </div>
    </div>
  );
};
