import React, { useMemo, useState } from 'react';
import {
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  Moon,
  Pause,
  Pin,
  Play,
  RefreshCw,
  SkipBack,
  SkipForward,
  SlidersHorizontal,
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
  onOpenTtsSettings,
}) => {
  const [draggingPage, setDraggingPage] = useState<number | null>(null);

  const safeTotalPages = Math.max(1, totalVirtualPages);
  const previewPage = Math.min(Math.max(1, draggingPage ?? bookVirtualPage), safeTotalPages);

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

  // Dense fine chapter tick marks along the bottom seekbar
  const chapterTickRatios = useMemo(() => {
    if (!virtualSummary || virtualSummary.totalVirtualPages <= 1) return [];
    const spans = virtualSummary.chapters;
    const step = Math.max(1, Math.ceil(spans.length / 72));
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
  const seekPercent =
    safeTotalPages <= 1 ? 0 : Math.min(100, Math.max(0, ((previewPage - 1) / (safeTotalPages - 1)) * 100));
  const clampedChapterPct = Math.max(0, Math.min(100, chapterProgressPercent));

  return (
    <div data-reader-bottom-bar="true" className="sticky bottom-0 z-30">
      {/* Razor-thin Chapter Progress Line Always Visible Under Text */}
      <div className="mx-auto max-w-5xl px-3 py-1">
        <div className="relative flex h-[2px] w-full items-center rounded-full bg-[var(--nv-border)]/50">
          <span
            aria-hidden="true"
            className="absolute left-0 h-1.5 w-1.5 -translate-x-0.5 rounded-full bg-[#7a7a7a]"
          />
          <div
            className="h-full rounded-full bg-[#7a7a7a] transition-all duration-150"
            style={{ width: `${clampedChapterPct}%` }}
          />
          <span
            aria-hidden="true"
            className="absolute right-0 h-1.5 w-1.5 translate-x-0.5 rounded-full bg-[#7a7a7a]/60"
          />
        </div>
      </div>

      {/* Expandable / Active TTS Mini-Player in Deep Teal */}
      {showMiniPlayer && (
        <div className="border-t border-white/10 bg-[var(--nv-teal-deep)] text-white shadow-lg">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-2 px-3 py-2 sm:px-5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold tabular-nums text-white">
                Kalimat {displaySentence} / {totalSentences}
              </p>
              <p className="truncate text-[11px] text-white/75 tabular-nums">
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
                className="hidden sm:inline-flex h-10 w-9 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onPrevSentence}
                aria-label="Kalimat sebelumnya"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
              >
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Jeda pembacaan TTS' : 'Mulai pembacaan TTS'}
                className="inline-flex h-10 w-11 items-center justify-center rounded-lg bg-[var(--nv-ui-bar-highlight)] text-[var(--nv-ui-bar-highlight-text)] shadow-sm hover:brightness-105"
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
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
              >
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={onNextParagraph}
                aria-label="Paragraf berikutnya"
                className="hidden sm:inline-flex h-10 w-9 items-center justify-center rounded-lg text-white/90 hover:bg-white/10"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 justify-end">
              <button
                type="button"
                onClick={onOpenTtsSettings}
                aria-label="Pengaturan suara TTS"
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-white/25 bg-white/10 px-2.5 text-xs font-semibold text-white hover:bg-white/20 whitespace-nowrap"
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Suara</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Reader Bottom Teal Bar (Hidden in Immersive Mode) */}
      {visible && (
        <footer className="bg-[var(--nv-teal)] text-[var(--nv-teal-text)] shadow-[0_-2px_10px_rgba(0,0,0,0.28)] pb-safe">
          <div className="mx-auto max-w-5xl px-3 pt-1.5 pb-2.5 sm:px-5">
            {/* Top Row: Quick Menu (left), "176 dari 1086" (center), Auto-Scroll + Orientation Pin (right) */}
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="flex min-w-[84px] items-center justify-start">
                <button
                  type="button"
                  onClick={onToggleQuickMenu}
                  aria-label="Menu cepat pembacaan"
                  title="Menu Cepat"
                  className="inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg text-[var(--nv-teal-text)]/80 hover:bg-white/10 hover:text-[var(--nv-teal-text)]"
                >
                  <LayoutGrid className="h-[18px] w-[18px]" aria-hidden="true" />
                </button>
              </div>

              <span className="text-sm font-medium tracking-tight text-[var(--nv-teal-text)] tabular-nums whitespace-nowrap">
                {previewPage} dari {safeTotalPages}
              </span>

              <div className="flex min-w-[84px] items-center justify-end gap-1">
                <button
                  type="button"
                  onClick={onToggleAutoScroll}
                  aria-label="Gulir otomatis"
                  aria-pressed={autoScrollEnabled}
                  title={autoScrollEnabled ? 'Matikan gulir otomatis' : 'Aktifkan gulir otomatis'}
                  className={`inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg transition-colors ${
                    autoScrollEnabled
                      ? 'bg-white/15 text-[var(--nv-ui-bar-highlight)]'
                      : 'text-[var(--nv-teal-text)]/80 hover:bg-white/10 hover:text-[var(--nv-teal-text)]'
                  }`}
                >
                  <RefreshCw className="h-[18px] w-[18px]" aria-hidden="true" />
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
                  className={`inline-flex min-h-[38px] min-w-[38px] items-center justify-center rounded-lg transition-colors ${
                    orientationLock !== 'auto'
                      ? 'bg-white/15 text-[var(--nv-ui-bar-highlight)]'
                      : 'text-[var(--nv-teal-text)]/80 hover:bg-white/10 hover:text-[var(--nv-teal-text)]'
                  }`}
                >
                  <Pin
                    className={`h-[18px] w-[18px] ${
                      orientationLock !== 'auto' ? '' : 'rotate-45'
                    }`}
                    aria-hidden="true"
                  />
                </button>
              </div>
            </div>

            {/* Bottom Row: Full-Width Cyan Seekbar with Chapter Tick Marks & Drag Tooltip */}
            <div className="relative flex items-center">
              {draggingTooltip && (
                <div className="pointer-events-none absolute -top-10 left-1/2 -translate-x-1/2 rounded-[4px] border border-white/15 bg-[var(--nv-sheet-bg)] px-3 py-1 text-xs font-semibold text-[var(--nv-text)] shadow-xl whitespace-nowrap">
                  {draggingTooltip}
                </div>
              )}
              <div className="relative flex w-full items-center">
                {/* Chapter Tick Marks Behind Cyan Slider */}
                <div className="pointer-events-none absolute inset-x-1.5 top-1/2 flex h-2 -translate-y-1/2 items-center">
                  {chapterTickRatios.map((leftPct, idx) => (
                    <span
                      key={idx}
                      style={{ left: `${leftPct}%` }}
                      className="absolute h-1.5 w-[1px] -translate-x-1/2 bg-white/35"
                    />
                  ))}
                </div>
                <input
                  type="range"
                  aria-label="Posisi halaman virtual buku"
                  min={1}
                  max={safeTotalPages}
                  value={previewPage}
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
                  style={{
                    background: `linear-gradient(to right, var(--nv-ui-bar-highlight) ${seekPercent}%, rgba(255,255,255,0.28) ${seekPercent}%)`,
                    height: '3px',
                    borderRadius: '9999px',
                  }}
                  className="nv-range nv-range-cyan relative z-10 w-full cursor-pointer"
                />
              </div>
            </div>
          </div>
        </footer>
      )}
    </div>
  );
};
