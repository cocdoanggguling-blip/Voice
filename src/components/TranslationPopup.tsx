import React from 'react';
import { Languages, Play, Volume2, WifiOff, X } from 'lucide-react';
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
  onSpeakTranslation?: (translatedText: string, lang: TargetLanguageCode) => void;
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
  onSpeakTranslation,
  onClose,
}) => {
  if (!sourceText) return null;

  return (
    <div
      role="dialog"
      aria-label="Popup Terjemahan"
      className="fixed bottom-28 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] p-4 text-[var(--nv-text)] shadow-2xl"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-[var(--nv-muted)]">
          <Languages className="h-4 w-4 text-[var(--nv-cyan)]" aria-hidden="true" />
          <span>Terjemahan</span>
          {result?.provider && (
            <span>· {result.provider === 'libretranslate' ? 'LibreTranslate' : 'MyMemory'}</span>
          )}
          {result?.fromCache && <span>· Cache</span>}
        </div>

        <div className="flex items-center gap-2">
          <select
            aria-label="Pilih bahasa tujuan terjemahan"
            value={targetLang}
            onChange={(e) => onChangeTargetLang(e.target.value as TargetLanguageCode)}
            className="min-h-[36px] rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-2 text-xs font-medium"
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
            className="inline-flex min-h-[36px] min-w-[36px] items-center justify-center rounded-lg hover:bg-white/10"
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
          <div className="flex items-center gap-2 text-sm text-amber-300">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{result.error}</span>
          </div>
        ) : result && !result.ok ? (
          <p className="text-sm text-red-400">{result.error}</p>
        ) : (
          <p className="font-reader-literata text-base leading-relaxed font-medium">
            {result?.translatedText}
          </p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-[var(--nv-border)] pt-2.5">
        {result?.ok && result.translatedText && onSpeakTranslation && (
          <button
            type="button"
            onClick={() => onSpeakTranslation(result.translatedText, targetLang)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-sheet-card)] px-3 text-xs font-semibold hover:brightness-110"
          >
            <Volume2 className="h-3.5 w-3.5 text-[var(--nv-cyan)]" aria-hidden="true" />
            <span>Bacakan Terjemahan</span>
          </button>
        )}

        {sentenceIndex !== null && onReadFromHere && (
          <button
            type="button"
            onClick={() => {
              onReadFromHere(sentenceIndex);
              onClose();
            }}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg bg-[var(--nv-ui-accent)] px-3.5 text-xs font-bold text-[var(--nv-ui-accent-text)] hover:brightness-105"
          >
            <Play className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
            <span>Baca dari kalimat ini</span>
          </button>
        )}
      </div>
    </div>
  );
};
