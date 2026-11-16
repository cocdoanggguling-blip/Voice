import React, { useEffect, useState } from 'react';
import { Check, RotateCcw } from 'lucide-react';
import {
  DEFAULT_UI_COLOR,
  UI_COLOR_PRESETS,
  getReadableTextColor,
  normalizeHexColor,
} from '../utils/uiTheme';

interface UiColorCustomizerProps {
  value: string;
  onChange: (hexColor: string) => void;
  compact?: boolean;
}

export const UiColorCustomizer: React.FC<UiColorCustomizerProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  const normalized = normalizeHexColor(value, DEFAULT_UI_COLOR);
  const [hexDraft, setHexDraft] = useState(normalized);

  useEffect(() => {
    setHexDraft(normalized);
  }, [normalized]);

  const isDefault = normalized === DEFAULT_UI_COLOR;

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-[var(--nv-chrome-text,var(--nv-text))]">
            Warna UI Aplikasi (Header &amp; Aksen)
          </p>
          {!compact && (
            <p className="text-[11px] text-[var(--nv-chrome-muted,var(--nv-muted))]">
              Default Cyan; sesuaikan warna bilah atas, tab aktif, dan tombol utama.
            </p>
          )}
        </div>

        {!isDefault && (
          <button
            type="button"
            onClick={() => onChange(DEFAULT_UI_COLOR)}
            className="inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-[4px] border border-[var(--nv-chrome-border,var(--nv-border))] px-2.5 text-[11px] font-semibold text-[var(--nv-ui-accent)] hover:bg-white/5 whitespace-nowrap"
          >
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
            <span>Reset Cyan</span>
          </button>
        )}
      </div>

      {/* Preset Color Swatches */}
      <div className="flex flex-wrap items-center gap-2">
        {UI_COLOR_PRESETS.map((preset) => {
          const active = normalized === preset.color;
          const iconColor = getReadableTextColor(preset.color);
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => onChange(preset.color)}
              aria-label={`Pilih warna UI ${preset.label}`}
              aria-pressed={active}
              title={preset.label}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-full border-2 transition-transform ${
                active
                  ? 'scale-110 border-[var(--nv-chrome-text,var(--nv-text))] shadow-md'
                  : 'border-white/25 hover:scale-105'
              }`}
              style={{ backgroundColor: preset.color, color: iconColor }}
            >
              {active && <Check className="h-4 w-4 stroke-[2.5]" aria-hidden="true" />}
            </button>
          );
        })}
      </div>

      {/* Custom Native Color Picker + Hex Input */}
      <div className="flex items-center gap-2 rounded-[4px] border border-[var(--nv-chrome-border,var(--nv-border))] bg-[var(--nv-sheet-card,var(--nv-chrome-bg))] px-2.5 py-2">
        <label className="flex items-center gap-2 text-xs font-medium cursor-pointer shrink-0">
          <input
            type="color"
            aria-label="Pemilih warna UI kustom"
            value={normalized}
            onChange={(e) => onChange(normalizeHexColor(e.target.value, DEFAULT_UI_COLOR))}
            className="h-7 w-9 cursor-pointer rounded border border-white/20 bg-transparent p-0"
          />
          <span className="text-[11px] text-[var(--nv-chrome-muted,var(--nv-muted))]">
            Kustom:
          </span>
        </label>

        <input
          type="text"
          aria-label="Kode hex warna UI"
          value={hexDraft}
          maxLength={7}
          onChange={(e) => {
            const val = e.target.value;
            setHexDraft(val);
            if (/^#?[0-9a-f]{6}$/i.test(val.trim())) {
              onChange(normalizeHexColor(val, DEFAULT_UI_COLOR));
            }
          }}
          onBlur={() => setHexDraft(normalized)}
          placeholder="#06b6d4"
          className="min-h-[32px] min-w-0 flex-1 rounded-[4px] border border-[var(--nv-chrome-border,var(--nv-border))] bg-[var(--nv-chrome-card,var(--nv-sheet-bg))] px-2.5 font-reader-mono text-xs uppercase focus:border-[var(--nv-ui-accent)] focus:outline-none"
        />

        <span
          className="inline-flex min-h-[28px] shrink-0 items-center rounded-[4px] px-2.5 text-[11px] font-bold"
          style={{
            backgroundColor: 'var(--nv-ui-accent)',
            color: 'var(--nv-ui-accent-text)',
          }}
        >
          Pratinjau
        </span>
      </div>
    </div>
  );
};
