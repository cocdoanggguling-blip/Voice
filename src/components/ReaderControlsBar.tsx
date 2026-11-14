import React, { useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  Lock,
  LockOpen,
  Moon,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
  Volume2,
} from 'lucide-react';
import type { ChapterMeta, OrientationLockMode, TtsReadingMode } from '../types/reader';
import type { BookVirtualPageSummary } from '../utils/bookMetrics';

interface ReaderControlsBarProps {
  visible: boolean;
  ttsBarExpanded: boolean;
  isPlaying: boolean;
  currentSentenceIndex: number;
  totalSentences: number;
  bookVirtualPage: number;
  totalVirtualPages: number;
  chapterProgressPercent: number;
  chapters: ChapterMeta[];
  virtualSummary: BookVirtualPageSummary | null;
  sleepRemainingSec: number | null;
  sleepTimerMode: number;
  readingMode: TtsReadingMode;
  rate: number;
  autoScrollEnabled: boolean;
  orientationLock: OrientationLockMode;
  onTogglePlay: () => void;
  onPrevSentence: () => void;
  onNextSentence: () => void;
  onPrevParagraph: () => void;
  onNextParagraph: () => void;
  onSeekVirtualPage: (targetPage: number) => void;
  onToggleQuickMenu: () => void;
  onToggleAutoScroll: () => void;
  onCycleOrientation: () => void;
  onToggleTtsBar: () => void;
  onOpenTtsSettings: () => void;
}

export const ReaderControlsBar: React.FC<ReaderControlsBarProps> = ({
  visible,
  ttsBarExpanded,
  isPlaying,
  currentSentenceIndex,
  totalSentences,
  bookVirtualPage,
  totalVirtualPages,
  chapterProgressPercent,
  chapters,
  virtualSummary,
  sleepRemainingSec,
  sleepTimerMode,
  readingMode,
  rate,
  autoScrollEnabled,
  orientationLock,
  onTogglePlay,
  onPrevSentence,
  onNextSentence,
  onPrevParagraph,
  onNextParagraph,
  onSeekVirtualPage,
  onToggleQuickMenu,
  onToggleAutoScroll,
  onCycleOrientation,
  onToggleTtsBar,
  onOpenTtsSettings,
}) => {
  const [draggingPage, setDraggingPage] = useState<number | null>(null);

  const previewPage = draggingPage ?? bookVirtualPage;

  const draggingTooltip = useMemo(() => {
    if (draggingPage === null || !virtualSummary) return null;
    for (const span of virtualSummary.chapters) {
      if (draggingPage >= span.startVirtualPage && draggingPage <= span.endVirtualPage) {
        const title = chapters[span.chapterIndex]?.title || `Bab ${span.chapterIndex + 1}`;
        return `${title} · Hal. ${draggingPage}`;
      }
    }
    return `Hal. ${draggingPage}`;
  }, [chapters, draggingPage, virtualSummary]);

  // Sample chapter tick positions (up to 48 ticks visually clean even for 200+ chapters)
  const chapterTickRatios = useMemo(() => {
    if (!virtualSummary || virtualSummary.totalVirtualPages <= 1) return [];
    const spans = virtualSummary.chapters;
    const step = Math.max(1, Math.ceil(spans.length / 48));
    const ratios: number[] = [];
    for (let i = 0; i < spans.length; i += step) {
      const r = (spans[i].startVirtualPage - 1) / Math.max(1, virtualSummary.totalVirtualPages - 1);
      ratios.push(Math.max(0, Math.min(1, r)) * 100);
    }
    return ratios;
  }, [virtualSummary]);

  const safeTotalSentences = Math.max(1, totalSentences);
  const displaySentence = Math.min(safeTotalSentences, currentSentenceIndex + 1);
  const showMiniPlayer = isPlaying || ttsBarExpanded;

  return (
    <div className="sticky bottom-0 z-30">
      {/* Thin Chapter Progress Line Always Visible Under Text */}
      <div className="h-[3px] w-full bg-[var(--nv-border)]/50">
        <div
          className="h-full bg-[var(--nv-accent)] transition-all duration-150"
          style={{ width: `${Math.max(0, Math.min(100, chapterProgressPercent))}%` }}
        />
      </div>

      {/* Expandable / Active TTS Mini-Player */}
      {showMiniPlayer && (
        <div className="border-t border-[var(--nv-border)] bg-[var(--nv-surface)]/95 backdrop-blur-md">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-1.5 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold tabular-nums">
                Kalimat {displaySentence} / {totalSentences}
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

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={onPrevParagraph}
                aria-label="Paragraf sebelumnya"
                className="hidden sm:inline-flex h-10 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onPrevSentence}
                aria-label="Kalimat sebelumnya"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Jeda pembacaan TTS' : 'Mulai pembacaan TTS'}
                className="inline-flex h-10 w-11 items-center justify-center rounded-xl bg-[var(--nv-accent)] text-white shadow-sm"
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 fill-current translate-x-0.5" />
                )}
              </button>
              <button
                type="button"
                onClick={onNextSentence}
                aria-label="Kalimat berikutnya"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onNextParagraph}
                aria-label="Paragraf berikutnya"
                className="hidden sm:inline-flex h-10 w-9 items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 justify-end">
              <button
                type="button"
                onClick={onOpenTtsSettings}
                aria-label="Pengaturan suara TTS"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-2.5 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Suara</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Reader Bottom Bar (Hidden in Immersive Mode) */}
      {visible && (
        <footer className="border-t border-[var(--nv-border)] bg-[var(--nv-surface)]/95 backdrop-blur-md pb-safe">
          <div className="mx-auto max-w-5xl px-3 pt-2 pb-2 sm:px-5">
            {/* Long Seekbar with Chapter Tick Markers & Drag Tooltip */}
            <div className="relative mb-1.5 flex items-center">
              {draggingTooltip && (
                <div className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 rounded-lg border border-[var(--nv-border)] bg-[var(--nv-text)] px-3 py-1 text-xs font-semibold text-[var(--nv-bg)] shadow-lg whitespace-nowrap">
                  {draggingTooltip}
                </div>
              )}
              <div className="relative flex w-full items-center">
                {/* Chapter Tick Marks Behind Slider */}
                <div className="pointer-events-none absolute inset-x-2 top-1/2 flex h-2 -translate-y-1/2 items-center">
                  {chapterTickRatios.map((leftPct, idx) => (
                    <span
                      key={idx}
                      style={{ left: `${leftPct}%` }}
                      className="absolute h-2 w-[1.5px] -translate-x-1/2 bg-[var(--nv-muted)]/45"
                    />
                  ))}
                </div>
                <input
                  type="range"
                  aria-label="Posisi halaman virtual buku"
                  min={1}
                  max={Math.max(1, totalVirtualPages)}
                  value={Math.min(Math.max(1, previewPage), Math.max(1, totalVirtualPages))}
                  onChange={(e) => setDraggingPage(Number(e.target.value))}
                  onMouseUp={() => {
                    if (draggingPage !== null) {
                      onSeekVirtualPage(draggingPage);
                      setDraggingPage(null);
                    }
                  }}
                  onTouchEnd={() => {
                    if (draggingPage !== null) {
                      onSeekVirtualPage(draggingPage);
                      setDraggingPage(null);
                    }
                  }}
                  onKeyUp={() => {
                    if (draggingPage !== null) {
                      onSeekVirtualPage(draggingPage);
                      setDraggingPage(null);
                    }
                  }}
                  className="relative z-10 h-5 w-full cursor-pointer accent-[var(--nv-accent)] bg-transparent"
                />
              </div>
            </div>

            {/* Bottom Controls Row: Quick Menu, "176 dari 1086", Auto-scroll, Orientation Lock, TTS */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleQuickMenu}
                  aria-label="Menu cepat pembacaan"
                  title="Menu Cepat"
                  className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <LayoutGrid className="h-4 w-4" aria-hidden="true" />
                </button>

                <span className="px-1 text-xs font-semibold tabular-nums whitespace-nowrap">
                  {previewPage} dari {Math.max(1, totalVirtualPages)}
                </span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={onToggleAutoScroll}
                  aria-label="Gulir otomatis"
                  aria-pressed={autoScrollEnabled}
                  title={autoScrollEnabled ? 'Matikan gulir otomatis' : 'Aktifkan gulir otomatis'}
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-xl px-2.5 text-xs font-medium ${
                    autoScrollEnabled
                      ? 'bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <ArrowDownCircle className="h-4 w-4" aria-hidden="true" />
                  <span className="hidden sm:inline">Auto</span>
                </button>

                <button
                  type="button"
                  onClick={onCycleOrientation}
                  aria-label={`Kunci orientasi: ${orientationLock}`}
                  title={`Orientasi: ${
                    orientationLock === 'auto'
                      ? 'Otomatis'
                      : orientationLock === 'portrait'
                        ? 'Potret'
                        : 'Lanskap'
                  }`}
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-xl px-2.5 text-xs font-medium ${
                    orientationLock !== 'auto'
                      ? 'bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  {orientationLock === 'auto' ? (
                    <LockOpen className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Lock className="h-4 w-4" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline capitalize">{orientationLock}</span>
                </button>

                <button
                  type="button"
                  onClick={onToggleTtsBar}
                  aria-label="Buka atau tutup kontrol TTS"
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-xl px-2.5 text-xs font-semibold ${
                    showMiniPlayer
                      ? 'bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                      : 'hover:bg-black/5 dark:hover:bg-white/5'
                  }`}
                >
                  <Volume2 className="h-4 w-4" aria-hidden="true" />
                  <span>TTS</span>
                </button>
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};
