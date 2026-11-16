import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookmarkPlus,
  Copy,
  Download,
  MoreVertical,
  Search,
  Trash2,
} from 'lucide-react';
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

const ROW_HEIGHT = 54;
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
  const [searchOpen, setSearchOpen] = useState(false);
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
      className="fixed inset-0 z-50 flex justify-start bg-black/55 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="flex h-full w-full max-w-md flex-col bg-[var(--nv-sheet-bg)] text-[var(--nv-text)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Deep Teal Header + Integrated 3-Tab Underline Bar */}
        <header className="bg-[var(--nv-teal)] text-[var(--nv-teal-text)] shadow-md pt-safe">
          <div className="flex h-13 items-center justify-between gap-1 px-1.5 sm:px-2">
            <button
              type="button"
              onClick={onClose}
              aria-label="Tutup daftar isi"
              className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full hover:bg-white/10"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>

            <h2 className="min-w-0 flex-1 truncate text-sm font-medium sm:text-base">
              {bookTitle}
            </h2>

            <button
              type="button"
              onClick={() => setSearchOpen((v) => !v)}
              aria-label="Cari atau loncat ke bab"
              title="Cari / Loncat Bab"
              className={`inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-full hover:bg-white/10 ${
                searchOpen ? 'text-[var(--nv-ui-bar-highlight)]' : ''
              }`}
            >
              {searchOpen ? (
                <Search className="h-5 w-5" aria-hidden="true" />
              ) : (
                <MoreVertical className="h-5 w-5" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* 3 Tabs: KONTEN, PENANDA, KUTIPAN */}
          <div className="mx-auto grid max-w-sm grid-cols-3 text-xs font-bold tracking-wide">
            {(
              [
                { id: 'contents', label: 'KONTEN' },
                { id: 'bookmarks', label: 'PENANDA' },
                { id: 'quotes', label: 'KUTIPAN' },
              ] as Array<{ id: DrawerTab; label: string }>
            ).map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveTab(t.id)}
                  className={`relative min-h-[42px] px-2 transition-colors whitespace-nowrap ${
                    active ? 'text-[var(--nv-teal-text)]' : 'text-[var(--nv-teal-text)]/75 hover:text-[var(--nv-teal-text)]'
                  }`}
                >
                  {t.label}
                  {active && (
                    <span className="absolute inset-x-3 bottom-0 h-[3px] bg-[var(--nv-ui-bar-highlight)]" />
                  )}
                </button>
              );
            })}
          </div>
        </header>

        {/* Tab 1: KONTEN (Virtualized Stacked Strips) */}
        {activeTab === 'contents' && (
          <>
            {searchOpen && (
              <div className="space-y-2 border-b border-[var(--nv-border)] bg-[var(--nv-sheet-card)] p-2.5">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nv-muted)]" />
                  <input
                    type="search"
                    autoFocus
                    value={tocSearch}
                    onChange={(e) => setTocSearch(e.target.value)}
                    placeholder="Cari nama bab..."
                    className="min-h-[38px] w-full rounded-[4px] border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] pl-9 pr-3 text-xs"
                  />
                </div>

                <form onSubmit={handleJumpChapter} className="flex gap-2">
                  <input
                    type="number"
                    min={1}
                    value={jumpInput}
                    onChange={(e) => setJumpInput(e.target.value)}
                    placeholder={`Loncat ke bab (1–${toc.length})...`}
                    className="min-h-[36px] flex-1 rounded-[4px] border border-[var(--nv-border)] bg-[var(--nv-sheet-bg)] px-3 text-xs"
                  />
                  <button
                    type="submit"
                    className="min-h-[36px] rounded-[4px] bg-[var(--nv-ui-accent)] px-3.5 text-xs font-bold text-[var(--nv-ui-accent-text)]"
                  >
                    Buka
                  </button>
                </form>
              </div>
            )}

            <div
              ref={scrollContainerRef}
              onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
              className="relative flex-1 overflow-y-auto px-1.5 py-1"
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
                      ? String(chapSpan.startVirtualPage)
                      : String(item.chapterIndex + 1);

                    return (
                      <div
                        key={`${item.id}-${rowIndex}`}
                        style={{
                          position: 'absolute',
                          top: `${rowIndex * ROW_HEIGHT}px`,
                          left: 0,
                          right: 0,
                          height: `${ROW_HEIGHT - 4}px`,
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            onSelectChapter(item.chapterIndex);
                            onClose();
                          }}
                          style={{
                            paddingLeft: `${14 + Math.min(3, item.level) * 14}px`,
                          }}
                          className={`flex h-full w-full items-center justify-between rounded-[3px] pr-3.5 text-left transition-colors ${
                            isActive
                              ? 'bg-[var(--nv-sheet-row-active)] font-medium text-[var(--nv-text)]'
                              : 'bg-[var(--nv-sheet-row)] hover:brightness-110'
                          }`}
                        >
                          <span className="line-clamp-2 text-[13px] leading-snug">
                            {item.label}
                          </span>
                          <span className="ml-3 shrink-0 text-[13px] text-[var(--nv-muted)] tabular-nums">
                            {pageLabel}
                          </span>
                        </button>
                      </div>
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
                className="flex min-h-[42px] w-full items-center justify-center gap-2 rounded-[4px] bg-[var(--nv-ui-accent)] px-3 text-xs font-bold text-[var(--nv-ui-accent-text)]"
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
                    className="flex items-start justify-between gap-2 px-4 py-3 hover:bg-white/5"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onSelectChapter(bm.chapterIndex, bm.charOffset);
                        onClose();
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="text-xs font-bold text-[var(--nv-gold)]">
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
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-[var(--nv-muted)] hover:text-red-400"
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
                  className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-[var(--nv-border)] bg-[var(--nv-sheet-row)] px-3 text-xs font-semibold hover:brightness-110"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Ekspor .TXT</span>
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyAllQuotes()}
                  className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-[4px] border border-[var(--nv-border)] bg-[var(--nv-sheet-row)] px-3 text-xs font-semibold hover:brightness-110"
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Salin Semua</span>
                </button>
              </div>
            )}

            {quoteStatus && (
              <p className="border-b border-[var(--nv-border)] bg-[var(--nv-sheet-row-active)] px-4 py-2 text-xs">
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
                    className="flex items-start gap-3 px-4 py-3 hover:bg-white/5"
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
                        <p className="mt-1.5 rounded bg-[var(--nv-sheet-row)] px-2.5 py-1.5 text-xs italic text-[var(--nv-gold)]">
                          Catatan: {hl.note}
                        </p>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteHighlight(hl.id)}
                      aria-label="Hapus kutipan"
                      className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded text-[var(--nv-muted)] hover:text-red-400"
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
