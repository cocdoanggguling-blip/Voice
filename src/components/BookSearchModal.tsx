import React, { useEffect, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import type { Book } from 'epubjs';
import { searchInBook, type EpubReplaceOptions } from '../services/epubService';
import type { BookSearchMatch, ChapterMeta } from '../types/reader';

interface BookSearchModalProps {
  open: boolean;
  epubBook: Book | null;
  chapters: ChapterMeta[];
  replaceOptions?: EpubReplaceOptions;
  onSelectMatch: (chapterIndex: number, charOffset: number) => void;
  onClose: () => void;
}

export const BookSearchModal: React.FC<BookSearchModalProps> = ({
  open,
  epubBook,
  chapters,
  replaceOptions,
  onSelectMatch,
  onClose,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BookSearchMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setHasSearched(false);
  }, [open]);

  if (!open) return null;

  const runSearch = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const clean = query.trim();
    if (!epubBook || clean.length < 2) return;

    setSearching(true);
    setHasSearched(true);
    let cancelled = false;
    try {
      const hits = await searchInBook(
        epubBook,
        chapters,
        clean,
        () => cancelled,
        80,
        replaceOptions
      );
      setResults(hits);
    } finally {
      cancelled = true;
      setSearching(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Cari dalam buku"
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-3 pt-12 backdrop-blur-xs sm:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[82vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] text-[var(--nv-text)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <form
          onSubmit={(e) => void runSearch(e)}
          className="flex items-center gap-2 border-b border-[var(--nv-border)] px-3 py-2.5"
        >
          <Search className="h-4 w-4 shrink-0 text-[var(--nv-muted)]" aria-hidden="true" />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cari kata atau frasa di seluruh bab..."
            className="min-h-[42px] flex-1 bg-transparent text-sm focus:outline-none"
          />
          <button
            type="submit"
            disabled={searching || query.trim().length < 2}
            className="min-h-[38px] rounded-xl bg-[var(--nv-accent)] px-3.5 text-xs font-semibold text-white disabled:opacity-40 whitespace-nowrap shrink-0"
          >
            {searching ? 'Mencari...' : 'Cari'}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Tutup pencarian buku"
            className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </form>

        <div className="flex-1 overflow-y-auto divide-y divide-[var(--nv-border)]">
          {searching ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-[var(--nv-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Memindai seluruh bab...</span>
            </div>
          ) : !hasSearched ? (
            <p className="px-5 py-10 text-center text-xs text-[var(--nv-muted)]">
              Masukkan minimal 2 karakter lalu tekan Cari.
            </p>
          ) : results.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-[var(--nv-muted)]">
              Tidak ada kecocokan untuk "{query}".
            </p>
          ) : (
            results.map((hit, idx) => (
              <button
                key={`${hit.chapterIndex}-${hit.charOffset}-${idx}`}
                type="button"
                onClick={() => {
                  onSelectMatch(hit.chapterIndex, hit.charOffset);
                  onClose();
                }}
                className="flex w-full flex-col gap-1 px-4 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
              >
                <span className="text-xs font-semibold text-[var(--nv-accent)]">
                  Bab {hit.chapterIndex + 1} · {hit.chapterTitle}
                </span>
                <span className="text-sm leading-relaxed text-[var(--nv-text)]">
                  {hit.snippet}
                </span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
