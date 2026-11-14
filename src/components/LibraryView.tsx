import React, { useMemo, useRef, useState } from 'react';
import { BookOpen, Plus, Search, Trash2, Upload } from 'lucide-react';
import type { BookMetadata, ReaderTheme } from '../types/reader';

interface LibraryViewProps {
  books: BookMetadata[];
  theme: ReaderTheme;
  isLoading: boolean;
  isImporting: boolean;
  importError: string | null;
  onImportFile: (file: File) => void;
  onOpenBook: (book: BookMetadata) => void;
  onDeleteBook: (bookId: string) => void;
  onChangeTheme: (theme: ReaderTheme) => void;
}

type ShelfFilter = 'all' | 'reading' | 'finished';

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  theme,
  isLoading,
  isImporting,
  importError,
  onImportFile,
  onOpenBook,
  onDeleteBook,
  onChangeTheme,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<ShelfFilter>('all');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const filteredBooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return books.filter((b) => {
      if (filter === 'reading' && (b.progressPercent <= 0 || b.progressPercent >= 100)) {
        return false;
      }
      if (filter === 'finished' && b.progressPercent < 100) {
        return false;
      }
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q)
      );
    });
  }, [books, filter, searchQuery]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onImportFile(file);
    }
    e.target.value = '';
  };

  const pendingBook = books.find((b) => b.id === pendingDeleteId) ?? null;

  return (
    <div className="min-h-screen bg-[var(--nv-bg)] text-[var(--nv-text)] transition-colors duration-150">
      {/* Top Bar: 3-zone contract */}
      <header className="sticky top-0 z-30 border-b border-[var(--nv-border)] bg-[var(--nv-bg)]/95 backdrop-blur-md pt-safe">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <span className="font-reader-literata text-xl font-bold tracking-tight whitespace-nowrap shrink-0">
            NovelVoice
          </span>

          <nav aria-label="Filter rak buku" className="hidden md:flex items-center gap-6 text-sm font-medium">
            <button
              type="button"
              onClick={() => setFilter('all')}
              className={`min-h-[40px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                filter === 'all'
                  ? 'border-[var(--nv-accent)] text-[var(--nv-text)]'
                  : 'border-transparent text-[var(--nv-muted)] hover:text-[var(--nv-text)]'
              }`}
            >
              Semua Buku
            </button>
            <button
              type="button"
              onClick={() => setFilter('reading')}
              className={`min-h-[40px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                filter === 'reading'
                  ? 'border-[var(--nv-accent)] text-[var(--nv-text)]'
                  : 'border-transparent text-[var(--nv-muted)] hover:text-[var(--nv-text)]'
              }`}
            >
              Sedang Dibaca
            </button>
            <button
              type="button"
              onClick={() => setFilter('finished')}
              className={`min-h-[40px] px-1 whitespace-nowrap shrink-0 border-b-2 transition-colors ${
                filter === 'finished'
                  ? 'border-[var(--nv-accent)] text-[var(--nv-text)]'
                  : 'border-transparent text-[var(--nv-muted)] hover:text-[var(--nv-text)]'
              }`}
            >
              Selesai
            </button>
          </nav>

          <div className="flex items-center gap-2 shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              accept=".epub,application/epub+zip"
              onChange={handleFileChange}
              className="hidden"
              aria-label="Pilih file EPUB dari penyimpanan"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--nv-accent)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              <span>{isImporting ? 'Mengimpor...' : 'Impor EPUB'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:py-8">
        {/* Shelf Toolbar: Search, Mobile Filter Tabs & Theme Switcher */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-reader-literata text-2xl font-bold tracking-tight sm:text-3xl">
              Rak Buku
            </h1>
            <p className="mt-1 text-sm text-[var(--nv-muted)]">
              <span className="tabular-nums">{books.length}</span> buku tersimpan secara lokal di perangkat
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 sm:w-64 sm:flex-initial">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--nv-muted)]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari judul atau penulis..."
                aria-label="Cari judul atau penulis"
                className="min-h-[44px] w-full rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] pl-9 pr-3 text-sm text-[var(--nv-text)] placeholder:text-[var(--nv-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--nv-accent)]"
              />
            </div>

            <div
              role="group"
              aria-label="Tema tampilan"
              className="flex items-center rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-1"
            >
              {(
                [
                  { id: 'light', label: 'Terang' },
                  { id: 'sepia', label: 'Sepia' },
                  { id: 'dark', label: 'Gelap' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onChangeTheme(t.id)}
                  className={`min-h-[36px] rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    theme === t.id
                      ? 'bg-[var(--nv-accent)] text-white'
                      : 'text-[var(--nv-muted)] hover:text-[var(--nv-text)]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile Filter Tabs */}
        <div className="mb-5 flex items-center gap-1 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-1 md:hidden">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'reading', label: 'Dibaca' },
              { id: 'finished', label: 'Selesai' },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={`min-h-[40px] flex-1 rounded-lg px-3 text-xs font-medium transition-colors whitespace-nowrap ${
                filter === item.id
                  ? 'bg-[var(--nv-accent)] text-white'
                  : 'text-[var(--nv-muted)]'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {importError && (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {importError}
          </div>
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[1, 2].map((n) => (
              <div
                key={n}
                className="h-64 animate-pulse rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)]"
              />
            ))}
          </div>
        ) : filteredBooks.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--nv-border)] bg-[var(--nv-surface)] px-6 py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-[var(--nv-muted)]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">
              {books.length === 0 ? 'Rak buku masih kosong' : 'Buku tidak ditemukan'}
            </h2>
            <p className="mt-1 max-w-md text-sm text-[var(--nv-muted)]">
              {books.length === 0
                ? 'Impor file .epub dari penyimpanan perangkat untuk mulai membaca dan mendengarkan dengan Text-to-Speech.'
                : 'Coba ubah kata kunci pencarian atau pilih filter rak buku lainnya.'}
            </p>
            {books.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--nv-accent)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Pilih File EPUB</span>
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredBooks.map((book) => (
              <article
                key={book.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] transition-shadow hover:shadow-md"
              >
                <button
                  type="button"
                  onClick={() => onOpenBook(book)}
                  className="flex flex-1 flex-col text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nv-accent)]"
                  aria-label={`Buka buku ${book.title}`}
                >
                  <div className="relative aspect-[3/4] w-full overflow-hidden bg-stone-200 dark:bg-stone-800">
                    {book.coverDataUrl ? (
                      <img
                        src={book.coverDataUrl}
                        alt={`Sampul ${book.title}`}
                        referrerPolicy="no-referrer"
                        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                      />
                    ) : (
                      <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-stone-700 to-stone-900 p-5 text-stone-100">
                        <span className="text-xs uppercase tracking-wider opacity-75">
                          EPUB
                        </span>
                        <div>
                          <p className="font-reader-literata text-lg font-bold leading-snug line-clamp-3">
                            {book.title}
                          </p>
                          <p className="mt-2 text-xs opacity-80 line-clamp-1">{book.author}</p>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col justify-between p-4">
                    <div>
                      <h2 className="font-reader-literata text-base font-bold leading-snug line-clamp-2">
                        {book.title}
                      </h2>
                      <p className="mt-1 text-xs text-[var(--nv-muted)] line-clamp-1">
                        {book.author}
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="mb-1.5 flex items-center justify-between text-xs text-[var(--nv-muted)] tabular-nums">
                        <span>
                          Bab {Math.min(book.totalChapters, book.currentChapterIndex + 1)} /{' '}
                          {book.totalChapters}
                        </span>
                        <span>{Math.round(book.progressPercent)}%</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nv-border)]">
                        <div
                          className="h-full rounded-full bg-[var(--nv-accent)] transition-all duration-200"
                          style={{ width: `${Math.max(4, Math.min(100, book.progressPercent))}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </button>

                <div className="flex items-center justify-between border-t border-[var(--nv-border)] px-4 py-2">
                  <span className="text-xs text-[var(--nv-muted)]">
                    {book.language.toUpperCase()} · {book.isSample ? 'Contoh' : 'Lokal'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPendingDeleteId(book.id)}
                    aria-label={`Hapus ${book.title}`}
                    className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-lg text-[var(--nv-muted)] transition-colors hover:bg-red-500/10 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </main>

      {/* Accessible Delete Confirmation Modal */}
      {pendingBook && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-book-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-sm rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5 shadow-xl">
            <h2 id="delete-book-title" className="text-base font-bold">
              Hapus buku dari rak?
            </h2>
            <p className="mt-2 text-sm text-[var(--nv-muted)]">
              "{pendingBook.title}" beserta posisi baca terakhirnya akan dihapus dari penyimpanan lokal.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDeleteId(null)}
                className="min-h-[44px] rounded-xl border border-[var(--nv-border)] px-4 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/5"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={() => {
                  onDeleteBook(pendingBook.id);
                  setPendingDeleteId(null);
                }}
                className="min-h-[44px] rounded-xl bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-700"
              >
                Hapus
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
