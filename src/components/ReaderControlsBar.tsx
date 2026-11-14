import React from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  Moon,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
} from 'lucide-react';
import type { TtsReadingMode } from '../types/reader';

interface ReaderControlsBarProps {
  isPlaying: boolean;
  currentSentenceIndex: number;
  totalSentences: number;
  sleepRemainingSec: number | null;
  sleepTimerMode: number;
  readingMode: TtsReadingMode;
  rate: number;
  onTogglePlay: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onPrevParagraph: () => void;
  onNextParagraph: () => void;
  onOpenTtsSettings: () => void;
}

export const ReaderControlsBar: React.FC<ReaderControlsBarProps> = ({
  isPlaying,
  currentSentenceIndex,
  totalSentences,
  sleepRemainingSec,
  sleepTimerMode,
  readingMode,
  rate,
  onTogglePlay,
  onPrevSentence,
  onNextSentence,
  onPrevParagraph,
  onNextParagraph,
  onOpenTtsSettings,
}) => {
  const safeTotal = Math.max(1, totalSentences);
  const displayIndex = Math.min(safeTotal, currentSentenceIndex + 1);

  return (
    <footer className="sticky bottom-0 z-30 border-t border-[var(--nv-border)] bg-[var(--nv-surface)]/95 backdrop-blur-md pb-safe">
      <div className="mx-auto flex max-w-4xl items-center justify-between gap-2 px-3 py-2 sm:px-5">
        {/* Left: Sentence counter & mode */}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold tabular-nums">
            Kalimat {displayIndex} / {totalSentences}
          </p>
          <p className="truncate text-[11px] text-[var(--nv-muted)] tabular-nums">
            {rate.toFixed(1)}× · {readingMode === 'flowing' ? 'Mengalir' : 'Per kalimat'}
            {sleepRemainingSec !== null && (
              <>
                {' '}
                · <Moon className="inline h-3 w-3" aria-hidden="true" />{' '}
                {Math.floor(sleepRemainingSec / 60)}:
                {String(sleepRemainingSec % 60).padStart(2, '0')}
              </>
            )}
            {sleepRemainingSec === null && sleepTimerMode === -1 && ' · Akhir Bab'}
          </p>
        </div>

        {/* Center: Thumb-zone Playback Controls */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={onPrevParagraph}
            aria-label="Paragraf sebelumnya"
            title="Paragraf sebelumnya"
            className="hidden sm:inline-flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onPrevSentence}
            aria-label="Kalimat sebelumnya"
            title="Kalimat sebelumnya"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <SkipBack className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            aria-label={isPlaying ? 'Jeda pembacaan TTS' : 'Mulai pembacaan TTS'}
            className="inline-flex h-11 w-12 items-center justify-center rounded-2xl bg-[var(--nv-accent)] text-white shadow-sm transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause className="h-5 w-5 fill-current" aria-hidden="true" />
            ) : (
              <Play className="h-5 w-5 fill-current translate-x-0.5" aria-hidden="true" />
            )}
          </button>

          <button
            type="button"
            onClick={onNextSentence}
            aria-label="Kalimat berikutnya"
            title="Kalimat berikutnya"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <SkipForward className="h-5 w-5" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={onNextParagraph}
            aria-label="Paragraf berikutnya"
            title="Paragraf berikutnya"
            className="hidden sm:inline-flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <ChevronsRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {/* Right: Quick TTS Settings Trigger */}
        <div className="flex flex-1 justify-end">
          <button
            type="button"
            onClick={onOpenTtsSettings}
            aria-label="Pengaturan suara TTS"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap shrink-0"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Suara</span>
          </button>
        </div>
      </div>
    </footer>
  );
};
