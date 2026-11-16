import React from 'react';
import { History, Play, X } from 'lucide-react';
import type { TtsLastPosition } from '../types/reader';

interface TtsStartChoiceModalProps {
  open: boolean;
  startHereLabel: string;
  startHerePreview: string;
  lastTtsPosition: TtsLastPosition | null;
  onStartFromHere: () => void;
  onResumePrevious: () => void;
  onClose: () => void;
}

export const TtsStartChoiceModal: React.FC<TtsStartChoiceModalProps> = ({
  open,
  startHereLabel,
  startHerePreview,
  lastTtsPosition,
  onStartFromHere,
  onResumePrevious,
  onClose,
}) => {
  if (!open) return null;

  const hasSavedPosition = Boolean(lastTtsPosition);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pilih posisi mulai TTS"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] p-4 text-[var(--nv-text)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold tracking-wide text-[var(--nv-text)]">
              Mulai Pembacaan Suara (TTS)
            </h2>
            <p className="mt-0.5 text-xs text-[var(--nv-muted)]">
              Pilih titik awal pembacaan untuk buku ini.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pilihan mulai TTS"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:bg-white/10 hover:text-[var(--nv-text)]"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-2.5">
          <button
            type="button"
            onClick={onStartFromHere}
            className="flex w-full items-start gap-3 rounded-lg border border-[var(--nv-cyan)]/50 bg-[var(--nv-cyan)]/12 px-3.5 py-3 text-left transition-colors hover:bg-[var(--nv-cyan)]/20"
          >
            <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--nv-ui-accent)] text-[var(--nv-ui-accent-text)]">
              <Play className="h-4 w-4 fill-current translate-x-0.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--nv-text)]">
                Mulai dari sini
              </span>
              <span className="mt-0.5 block text-xs font-medium text-[var(--nv-cyan)]">
                {startHereLabel}
              </span>
              {startHerePreview && (
                <span className="mt-0.5 block line-clamp-2 text-xs text-[var(--nv-muted)]">
                  "{startHerePreview}"
                </span>
              )}
            </span>
          </button>

          <button
            type="button"
            disabled={!hasSavedPosition}
            onClick={onResumePrevious}
            className={`flex w-full items-start gap-3 rounded-lg border px-3.5 py-3 text-left transition-colors ${
              hasSavedPosition
                ? 'border-[var(--nv-border)] bg-[var(--nv-sheet-card)] hover:border-[var(--nv-gold)]/50 hover:bg-white/5'
                : 'cursor-not-allowed border-[var(--nv-border)]/60 bg-[var(--nv-sheet-card)]/50 opacity-55'
            }`}
          >
            <span
              className={`mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                hasSavedPosition
                  ? 'bg-[var(--nv-gold)]/20 text-[var(--nv-gold)]'
                  : 'bg-white/10 text-[var(--nv-muted)]'
              }`}
            >
              <History className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold text-[var(--nv-text)]">
                Lanjutkan sebelumnya
              </span>
              {lastTtsPosition ? (
                <>
                  <span className="mt-0.5 block text-xs font-medium text-[var(--nv-gold)]">
                    {lastTtsPosition.chapterTitle || `Bab ${lastTtsPosition.chapterIndex + 1}`} · Paragraf{' '}
                    {lastTtsPosition.paragraphIndex + 1}
                  </span>
                  {lastTtsPosition.snippet && (
                    <span className="mt-0.5 block line-clamp-2 text-xs text-[var(--nv-muted)]">
                      "{lastTtsPosition.snippet}"
                    </span>
                  )}
                </>
              ) : (
                <span className="mt-0.5 block text-xs text-[var(--nv-muted)]">
                  Belum ada posisi berhenti atau jeda TTS sebelumnya.
                </span>
              )}
            </span>
          </button>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[38px] rounded-lg px-3.5 text-xs font-semibold text-[var(--nv-muted)] hover:bg-white/5 hover:text-[var(--nv-text)]"
          >
            Batal
          </button>
        </div>
      </div>
    </div>
  );
};
