import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookmarkPlus, Copy, Download, Search, Trash2, X } from 'lucide-react';
import type { BookmarkItem, HighlightItem, TocItem } from '../types/reader';
import type { BookVirtualPageSummary } from '../utils/bookMetrics';
import { formatIndoTimestamp } from '../utils/bookMetrics';

interface TocDrawerProps {
  open: boolean;
  bookTitle: string;
  toc: TocItem[];
  currentChapterIndex: number;
  virtualPageSummary: BookVirtualPageSummary | null;
  bookmarks: BookmarkItem[];
  highlights: HighlightItem[];
  onSelectChapter: (chapterIndex: number, charOffset?: number) => void;
  onAddCurrentBookmark: () => void;
  onDeleteBookmark: (id: string) => void;
  onDeleteHighlight: (id: string) => void;
  onClose: () => void;
}

type DrawerTab = 'contents' | 'bookmarks' | 'quotes';

const ROW_HEIGHT = 60;
const OVERSCAN = 8;

const COLOR_DOT_CLASSES: Record<HighlightItem['color'], string> = {
  yellow: 'bg-amber-400',
  green: 'bg-emerald-500',
  blue: 'bg-sky-500',
  pink: 'bg-pink-500',
  purple: 'bg-purple-500',
};

export const TocDrawer: React.FC<TocDrawerProps> = ({
  open,
  bookTitle,
  toc,
  currentChapterIndex,
  virtualPageSummary,
  bookmarks,
  highlights,
  onSelectChapter,
  onAddCurrentBookmark,
  onDeleteBookmark,
  onDeleteHighlight,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('contents');
  const [tocSearch, setTocSearch] = useState('');
  const [jumpInput, setJumpInput] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(540);
  const [quoteStatus, setQuoteStatus] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const filteredToc = useMemo(() => {
    const q = tocSearch.trim().toLowerCase();
    if (!q) return toc;
    return toc.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        String(item.chapterIndex + 1).includes(q)
    );
  }, [toc, tocSearch]);

  // Measure viewport height & auto-scroll active chapter into view when opening KONTEN
  useEffect(() => {
    if (!open || activeTab !== 'contents') return;
    const container = scrollContainerRef.current;
    if (!container) return;

    setViewportH(container.clientHeight || 540);
    const activeIdx = filteredToc.findIndex((t) => t.chapterIndex === currentChapterIndex);
    if (activeIdx >= 0) {
      const targetScroll = Math.max(0, activeIdx * ROW_HEIGHT - (container.clientHeight || 480) / 2);
      container.scrollTop = targetScroll;
      setScrollTop(targetScroll);
    }
  }, [open, activeTab, currentChapterIndex, filteredToc]);

  if (!open) return null;

  const totalHeight = filteredToc.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportH / ROW_HEIGHT) + OVERSCAN * 2;
  const endIdx = Math.min(filteredToc.length, startIdx + visibleCount);
  const visibleSlice = filteredToc.slice(startIdx, endIdx);

  const buildQuotesExportText = () => {
    const lines: string[] = [`KUTIPAN & CATATAN — ${bookTitle}`, ''];
    highlights.forEach((h, i) => {
      lines.push(`${i + 1}. [${h.chapterTitle}]`);
      lines.push(`"${h.text}"`);
      if (h.note) lines.push(`Catatan: ${h.note}`);
      lines.push('');
    });
    return lines.join('\n');
  };

  const handleExportTxt = () => {
    const content = buildQuotesExportText();
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${bookTitle.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_kutipan.txt`;
    a.click();
    URL.revokeObjectURL(url);
    setQuoteStatus('Kutipan diunduh sebagai file .txt');
    window.setTimeout(() => setQuoteStatus(null), 2500);
  };

  const handleCopyAllQuotes = async () => {
    try {
      await navigator.clipboard.writeText(buildQuotesExportText());
      setQuoteStatus('Semua kutipan disalin ke papan klip.');
      window.setTimeout(() => setQuoteStatus(null), 2500);
    } catch {
      setQuoteStatus('Gagal menyalin kutipan.');
    }
  };

  const handleJumpChapter = (e: React.FormEvent) => {
    e.preventDefault();
    const num = Number.parseInt(jumpInput.trim(), 10);
    if (!Number.isFinite(num) || num < 1) return;
    onSelectChapter(num - 1);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Daftar Isi, Penanda, dan Kutipan"
      className="fixed inset-0 z-50 flex justify-start bg-black/50 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col border-r border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--nv-border)] px-4 py-3 pt-safe">
          <div className="min-w-0 pr-2">
            <h2 className="truncate text-sm font-bold">{bookTitle}</h2>
            <p className="text-xs text-[var(--nv-muted)] tabular-nums">
              {toc.length} entri · {bookmarks.length} penanda · {highlights.length} kutipan
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup daftar isi"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* 3 Tabs: KONTEN, PENANDA, KUTIPAN */}
        <div className="grid grid-cols-3 border-b border-[var(--nv-border)] text-xs font-bold">
          {(
            [
              { id: 'contents', label: 'KONTEN' },
              { id: 'bookmarks', label: 'PENANDA' },
              { id: 'quotes', label: 'KUTIPAN' },
            ] as Array<{ id: DrawerTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`min-h-[44px] border-b-2 transition-colors whitespace-nowrap ${
                activeTab === t.id
                  ? 'border-[var(--nv-accent)] text-[var(--nv-accent)]'
                  : 'border-transparent text-[var(--nv-muted)]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab 1: KONTEN (Virtualized) */}
        {activeTab === 'contents' && (
          <>
            <div className="space-y-2 border-b border-[var(--nv-border)] p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nv-muted)]" />
                <input
                  type="search"
                  value={tocSearch}
                  onChange={(e) => setTocSearch(e.target.value)}
                  placeholder="Cari nama bab..."
                  className="min-h-[38px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] pl-9 pr-3 text-xs"
                />
              </div>

              <form onSubmit={handleJumpChapter} className="flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={jumpInput}
                  onChange={(e) => setJumpInput(e.target.value)}
                  placeholder="Loncat ke nomor bab..."
                  className="min-h-[36px] flex-1 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
                />
                <button
                  type="submit"
                  className="min-h-[36px] rounded-xl border border-[var(--nv-border)] px-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5"
                >
                  Buka
                </button>
              </form>
            </div>

            <div
              ref={scrollContainerRef}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              className="relative flex-1 overflow-y-auto"
            >
              {filteredToc.length === 0 ? (
                <p className="px-4 py-10 text-center text-xs text-[var(--nv-muted)]">
                  Tidak ada bab yang cocok.
                </p>
              ) : (
                <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                  {visibleSlice.map((item, offsetIdx) => {
                    const rowIndex = startIdx + offsetIdx;
                    const isActive = item.chapterIndex === currentChapterIndex;
                    const chapSpan = virtualPageSummary?.chapters[item.chapterIndex];
                    const pageLabel = chapSpan
                      ? `hal. ${chapSpan.startVirtualPage}`
                      : `Bab ${item.chapterIndex + 1}`;

                    return (
                      <button
                        key={`${item.id}-${rowIndex}`}
                        type="button"
                        onClick={() => {
                          onSelectChapter(item.chapterIndex);
                          onClose();
                        }}
                        style={{
                          position: 'absolute',
                          top: `${rowIndex * ROW_HEIGHT}px`,
                          left: 0,
                          right: 0,
                          height: `${ROW_HEIGHT}px`,
                          paddingLeft: `${16 + Math.min(3, item.level) * 14}px`,
                        }}
                        className={`flex items-center justify-between border-b border-[var(--nv-border)]/60 pr-4 text-left text-sm transition-colors ${
                          isActive
                            ? 'bg-[var(--nv-accent-soft)] font-semibold text-[var(--nv-accent)]'
                            : 'hover:bg-black/5 dark:hover:bg-white/5'
                        }`}
                      >
                        <span className="line-clamp-2 text-xs sm:text-sm leading-snug">
                          {item.label}
                        </span>
                        <span className="ml-3 shrink-0 text-xs text-[var(--nv-muted)] tabular-nums">
                          {pageLabel}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* Tab 2: PENANDA */}
        {activeTab === 'bookmarks' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="border-b border-[var(--nv-border)] p-3">
              <button
                type="button"
                onClick={onAddCurrentBookmark}
                className="flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--nv-accent)] px-3 text-xs font-semibold text-white"
              >
                <BookmarkPlus className="h-4 w-4" />
                <span>Tandai Posisi Baca Saat Ini</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--nv-border)]">
              {bookmarks.length === 0 ? (
                <p className="px-5 py-12 text-center text-xs text-[var(--nv-muted)]">
                  Belum ada penanda. Ketuk tombol di atas atau menu ⋮ di layar baca untuk menambah penanda.
                </p>
              ) : (
                bookmarks.map((bm) => (
                  <div
                    key={bm.id}
                    className="flex items-start justify-between gap-2 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectChapter(bm.chapterIndex, bm.charOffset);
                        onClose();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-xs font-bold text-[var(--nv-accent)]">
                        {bm.chapterTitle} · {Math.round(bm.progressPercent)}%
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--nv-text)]">
                        "{bm.quote}"
                      </p>
                      <p className="mt-1 text-[11px] text-[var(--nv-muted)]">
                        {formatIndoTimestamp(bm.createdAt)}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteBookmark(bm.id)}
                      aria-label="Hapus penanda"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* Tab 3: KUTIPAN (Highlights & Notes + Export) */}
        {activeTab === 'quotes' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {highlights.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--nv-border)] p-3">
                <button
                  type="button"
                  onClick={handleExportTxt}
                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Ekspor .TXT</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAllQuotes()}
                  className="inline-flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin Semua</span>
                </button>
              </div>
            )}

            {quoteStatus && (
              <p className="border-b border-[var(--nv-border)] bg-[var(--nv-accent-soft)] px-4 py-2 text-xs">
                {quoteStatus}
              </p>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--nv-border)]">
              {highlights.length === 0 ? (
                <p className="px-5 py-12 text-center text-xs text-[var(--nv-muted)]">
                  Belum ada sorotan atau catatan. Pilih teks atau ketuk kalimat saat membaca untuk membuat highlight &amp; catatan.
                </p>
              ) : (
                highlights.map((hl) => (
                  <div
                    key={hl.id}
                    className="flex items-start gap-3 px-4 py-3 hover:bg-black/5 dark:hover:bg-white/5"
                  >
                    <span
                      className={`mt-1 h-10 w-1.5 shrink-0 rounded-full ${COLOR_DOT_CLASSES[hl.color]}`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onSelectChapter(hl.chapterIndex, hl.charOffset);
                        onClose();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-[11px] font-semibold text-[var(--nv-muted)]">
                        {hl.chapterTitle}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--nv-text)]">
                        "{hl.text}"
                      </p>
                      {hl.note && (
                        <p className="mt-1.5 rounded-lg bg-[var(--nv-bg)] px-2.5 py-1.5 text-xs italic text-[var(--nv-accent)]">
                          Catatan: {hl.note}
                        </p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHighlight(hl.id)}
                      aria-label="Hapus kutipan"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
