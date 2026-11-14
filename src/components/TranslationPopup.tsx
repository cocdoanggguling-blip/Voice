import React from 'react';
import { Languages, Play, WifiOff, X } from 'lucide-react';
import { TARGET_LANGUAGES } from '../services/translationService';
import type { TargetLanguageCode, TranslationResult } from '../types/reader';

interface TranslationPopupProps {
  sourceText: string;
  sentenceIndex: number | null;
  targetLang: TargetLanguageCode;
  loading: boolean;
  result: TranslationResult | null;
  onChangeTargetLang: (lang: TargetLanguageCode) => void;
  onReadFromHere?: (sentenceIndex: number) => void;
  onClose: () => void;
}

export const TranslationPopup: React.FC<TranslationPopupProps> = ({
  sourceText,
  sentenceIndex,
  targetLang,
  loading,
  result,
  onChangeTargetLang,
  onReadFromHere,
  onClose,
}) => {
  if (!sourceText) return null;

  return (
    <div
      role="dialog"
      aria-label="Popup Terjemahan"
      className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-4 text-[var(--nv-text)] shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--nv-muted)]">
          <Languages className="h-4 w-4 text-[var(--nv-accent)]" aria-hidden="true" />
          <span>Terjemahan Langsung</span>
          {result?.fromCache && <span>· Cache</span>}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Pilih bahasa tujuan terjemahan"
            value={targetLang}
            onChange={(e) => onChangeTargetLang(e.target.value as TargetLanguageCode)}
            className="min-h-[36px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-bg)] px-2 text-xs font-medium"
          >
            {TARGET_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup popup terjemahan"
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      <p className="mb-2 line-clamp-3 text-xs text-[var(--nv-muted)]">{sourceText}</p>

      <div className="border-t border-[var(--nv-border)] pt-2.5">
        {loading ? (
          <p className="text-sm text-[var(--nv-muted)]">Menerjemahkan...</p>
        ) : result?.offline ? (
          <div className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{result.error}</span>
          </div>
        ) : result && !result.ok ? (
          <p className="text-sm text-red-600 dark:text-red-400">{result.error}</p>
        ) : (
          <p className="font-reader-literata text-base leading-relaxed font-medium">
            {result?.translatedText}
          </p>
        )}
      </div>

      {sentenceIndex !== null && onReadFromHere && (
        <div className="mt-3 flex justify-end border-t border-[var(--nv-border)] pt-2.5">
          <button
            type="button"
            onClick={() => {
              onReadFromHere(sentenceIndex);
              onClose();
            }}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-[var(--nv-accent)] px-3.5 text-xs font-semibold text-white hover:opacity-90"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            <span>Baca TTS dari kalimat ini</span>
          </button>
        </div>
      )}
    </div>
  );
};
