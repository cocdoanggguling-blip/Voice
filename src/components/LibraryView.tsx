import React, { useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Download,
  FolderInput,
  FolderPlus,
  Info,
  Layers,
  LayoutGrid,
  List as ListIcon,
  Plus,
  Search,
  Share2,
  Star,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { BookMetadata, ReaderTheme } from '../types/reader';
import {
  compareNaturalTitles,
  extractSeriesName,
  formatFileSizeId,
} from '../utils/bookMetrics';
import { BookDetailModal } from './BookDetailModal';

interface LibraryViewProps {
  books: BookMetadata[];
  theme: ReaderTheme;
  isLoading: boolean;
  isImporting: boolean;
  importError: string | null;
  importInfo: string | null;
  onImportFiles: (files: FileList | File[]) => Promise<void> | void;
  onOpenBook: (book: BookMetadata, autoStartTts?: boolean) => void;
  onUpdateBookMetadata: (updated: BookMetadata) => Promise<void> | void;
  onDeleteBook: (bookId: string) => void;
  onChangeTheme: (theme: ReaderTheme) => void;
  onExportBackup: () => Promise<void> | void;
  onImportBackup: (file: File) => Promise<void> | void;
}

type ShelfTab = 'all' | 'recent' | 'favorites' | 'finished' | 'collections';
type SortMode = 'natural' | 'author' | 'lastRead' | 'addedAt' | 'size';

export const LibraryView: React.FC<LibraryViewProps> = ({
  books,
  theme,
  isLoading,
  isImporting,
  importError,
  importInfo,
  onImportFiles,
  onOpenBook,
  onUpdateBookMetadata,
  onDeleteBook,
  onChangeTheme,
  onExportBackup,
  onImportBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const backupInputRef = useRef<HTMLInputElement>(null);

  const [tab, setTab] = useState<ShelfTab>('all');
  const [selectedCollection, setSelectedCollection] = useState<string>('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortMode, setSortMode] = useState<SortMode>('lastRead');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [groupBySeries, setGroupBySeries] = useState(false);

  const [detailBookId, setDetailBookId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [collectionTargetBookId, setCollectionTargetBookId] = useState<string | null>(null);
  const [newCollectionText, setNewCollectionText] = useState('');
  const [showBackupModal, setShowBackupModal] = useState(false);

  const allCollections = useMemo(() => {
    const set = new Set<string>();
    books.forEach((b) => (b.collections || []).forEach((c) => set.add(c)));
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'id'));
  }, [books]);

  const filteredAndSorted = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = books.filter((b) => {
      if (tab === 'recent' && b.progressPercent <= 0) return false;
      if (tab === 'favorites' && !b.isFavorite) return false;
      if (tab === 'finished' && !b.isFinished && b.progressPercent < 100) return false;
      if (tab === 'collections') {
        if (selectedCollection) {
          if (!(b.collections || []).includes(selectedCollection)) return false;
        } else if (!b.collections || b.collections.length === 0) {
          return false;
        }
      }
      if (!q) return true;
      return (
        b.title.toLowerCase().includes(q) ||
        b.author.toLowerCase().includes(q) ||
        (b.series || '').toLowerCase().includes(q)
      );
    });

    const sorted = [...filtered].sort((a, b) => {
      if (sortMode === 'natural') return compareNaturalTitles(a.title, b.title);
      if (sortMode === 'author') {
        const cmp = a.author.localeCompare(b.author, 'id');
        return cmp !== 0 ? cmp : compareNaturalTitles(a.title, b.title);
      }
      if (sortMode === 'addedAt') return b.addedAt - a.addedAt;
      if (sortMode === 'size') return (b.fileSizeBytes || 0) - (a.fileSizeBytes || 0);
      return b.lastReadAt - a.lastReadAt;
    });

    return sorted;
  }, [books, searchQuery, selectedCollection, sortMode, tab]);

  const groupedSeries = useMemo(() => {
    if (!groupBySeries) return null;
    const map = new Map<string, BookMetadata[]>();
    for (const book of filteredAndSorted) {
      const series = extractSeriesName(book);
      const list = map.get(series) || [];
      list.push(book);
      map.set(series, list);
    }
    return Array.from(map.entries())
      .map(([seriesName, items]) => ({
        seriesName,
        items: [...items].sort((a, b) => compareNaturalTitles(a.title, b.title)),
      }))
      .sort((a, b) => compareNaturalTitles(a.seriesName, b.seriesName));
  }, [filteredAndSorted, groupBySeries]);

  const detailBook = books.find((b) => b.id === detailBookId) ?? null;
  const pendingBook = books.find((b) => b.id === pendingDeleteId) ?? null;
  const collectionBook = books.find((b) => b.id === collectionTargetBookId) ?? null;

  const handleToggleFavorite = (book: BookMetadata) => {
    void onUpdateBookMetadata({ ...book, isFavorite: !book.isFavorite });
  };

  const handleToggleFinished = (book: BookMetadata) => {
    const next = !(book.isFinished || book.progressPercent >= 100);
    void onUpdateBookMetadata({
      ...book,
      isFinished: next,
      progressPercent: next ? 100 : book.progressPercent,
    });
  };

  const handleShareBook = async (book: BookMetadata) => {
    const text = `${book.title} — ${book.author} (${Math.round(book.progressPercent)}%)`;
    try {
      if (navigator.share) {
        await navigator.share({ title: book.title, text });
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      // Ignore cancel
    }
  };

  const renderBookCard = (book: BookMetadata) => {
    const finished = book.isFinished || book.progressPercent >= 100;
    const isList = viewMode === 'list';

    return (
      <article
        key={book.id}
        className={`group flex overflow-hidden rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] transition-shadow hover:shadow-md ${
          isList ? 'flex-row items-stretch' : 'flex-col'
        }`}
      >
        <button
          type="button"
          onClick={() => onOpenBook(book)}
          className={`flex text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--nv-accent)] ${
            isList ? 'flex-1 flex-row items-center gap-3.5 p-3 min-w-0' : 'flex-1 flex-col'
          }`}
          aria-label={`Buka buku ${book.title}`}
        >
          <div
            className={`relative overflow-hidden bg-stone-200 dark:bg-stone-800 shrink-0 ${
              isList ? 'h-24 w-16 rounded-lg' : 'aspect-[3/4] w-full'
            }`}
          >
            {book.coverDataUrl ? (
              <img
                src={book.coverDataUrl}
                alt={`Sampul ${book.title}`}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
              />
            ) : (
              <div className="flex h-full w-full flex-col justify-between bg-gradient-to-br from-stone-700 to-stone-900 p-3 text-stone-100">
                <span className="text-[10px] uppercase tracking-wider opacity-75">EPUB</span>
                <div>
                  <p
                    className={`font-reader-literata font-bold leading-snug line-clamp-3 ${
                      isList ? 'text-[11px]' : 'text-base'
                    }`}
                  >
                    {book.title}
                  </p>
                  {!isList && (
                    <p className="mt-1.5 text-xs opacity-80 line-clamp-1">{book.author}</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={`flex flex-1 flex-col justify-between min-w-0 ${isList ? '' : 'p-4 w-full'}`}>
            <div>
              <h2 className="font-reader-literata text-sm font-bold leading-snug line-clamp-2 sm:text-base">
                {book.title}
              </h2>
              <p className="mt-0.5 text-xs text-[var(--nv-muted)] line-clamp-1">{book.author}</p>
              <p className="mt-1 text-[11px] text-[var(--nv-muted)] tabular-nums">
                EPUB, {formatFileSizeId(book.fileSizeBytes)} ·{' '}
                {book.language.toUpperCase()}
                {book.collections && book.collections.length > 0
                  ? ` · ${book.collections[0]}`
                  : ''}
              </p>
            </div>

            <div className={isList ? 'mt-2.5' : 'mt-3.5'}>
              <div className="mb-1 flex items-center justify-between text-[11px] text-[var(--nv-muted)] tabular-nums">
                <span>
                  Bab {Math.min(book.totalChapters, book.currentChapterIndex + 1)} /{' '}
                  {book.totalChapters}
                </span>
                <span>{finished ? 'Selesai' : `${Math.round(book.progressPercent)}%`}</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--nv-border)]">
                <div
                  className="h-full rounded-full bg-[var(--nv-accent)] transition-all duration-200"
                  style={{ width: `${Math.max(3, Math.min(100, book.progressPercent))}%` }}
                />
              </div>
            </div>
          </div>
        </button>

        {/* Rich Card Action Icons */}
        <div
          className={`flex items-center justify-between border-[var(--nv-border)] ${
            isList
              ? 'flex-col justify-center border-l px-1.5 py-2 gap-1'
              : 'border-t px-2 py-1.5'
          }`}
        >
          <button
            type="button"
            onClick={() => handleToggleFavorite(book)}
            aria-label={book.isFavorite ? `Hapus favorit ${book.title}` : `Favoritkan ${book.title}`}
            title="Favorit"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              book.isFavorite
                ? 'text-amber-500'
                : 'text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <Star className={`h-4 w-4 ${book.isFavorite ? 'fill-current' : ''}`} aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => handleToggleFinished(book)}
            aria-label={`Tandai selesai ${book.title}`}
            title="Tandai Selesai"
            className={`inline-flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              finished
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setCollectionTargetBookId(book.id)}
            aria-label={`Koleksi ${book.title}`}
            title="Tambahkan ke Koleksi"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <FolderPlus className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            onClick={() => setDetailBookId(book.id)}
            aria-label={`Tentang dokumen ${book.title}`}
            title="Tentang Dokumen"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5"
          >
            <Info className="h-4 w-4" aria-hidden="true" />
          </button>

          {!isList && (
            <button
              type="button"
              onClick={() => void handleShareBook(book)}
              aria-label={`Bagikan ${book.title}`}
              title="Bagikan"
              className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5"
            >
              <Share2 className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setPendingDeleteId(book.id)}
            aria-label={`Hapus ${book.title}`}
            title="Hapus"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[var(--nv-muted)] transition-colors hover:bg-red-500/10 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-[var(--nv-bg)] text-[var(--nv-text)] transition-colors duration-150">
      {/* Hidden File & Folder Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".epub,application/epub+zip"
        onChange={(e) => {
          if (e.target.files?.length) void onImportFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
        aria-label="Pilih beberapa file EPUB"
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error webkitdirectory is supported in Chromium/Android WebView
        webkitdirectory=""
        accept=".epub,application/epub+zip"
        onChange={(e) => {
          if (e.target.files?.length) void onImportFiles(e.target.files);
          e.target.value = '';
        }}
        className="hidden"
        aria-label="Pindai folder EPUB"
      />
      <input
        ref={backupInputRef}
        type="file"
        accept=".json,application/json"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImportBackup(f);
          e.target.value = '';
          setShowBackupModal(false);
        }}
        className="hidden"
        aria-label="Impor file cadangan JSON"
      />

      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-[var(--nv-border)] bg-[var(--nv-bg)]/95 backdrop-blur-md pt-safe">
        {searchOpen ? (
          <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-3 sm:px-6">
            <button
              type="button"
              onClick={() => {
                setSearchOpen(false);
                setSearchQuery('');
              }}
              aria-label="Tutup pencarian"
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <input
              type="text"
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Cari judul, pengarang, atau seri..."
              className="min-h-[42px] flex-1 bg-transparent text-sm focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Bersihkan kata kunci"
                className="inline-flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ) : (
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-2.5 sm:px-6">
            <span className="font-reader-literata text-xl font-bold tracking-tight whitespace-nowrap shrink-0">
              NovelVoice
            </span>

            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Cari di perpustakaan"
                className="inline-flex min-h-[42px] min-w-[40px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Search className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => setShowBackupModal(true)}
                aria-label="Cadangkan dan pulihkan data"
                title="Cadangkan / Pulihkan JSON"
                className="inline-flex min-h-[42px] min-w-[40px] items-center justify-center rounded-xl hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Download className="h-5 w-5" aria-hidden="true" />
              </button>

              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                disabled={isImporting}
                aria-label="Pindai folder EPUB"
                title="Impor Folder EPUB"
                className="inline-flex min-h-[42px] min-w-[40px] items-center justify-center gap-1.5 rounded-xl border border-[var(--nv-border)] px-2 sm:px-3 text-xs font-semibold hover:bg-black/5 dark:hover:bg-white/5 whitespace-nowrap"
              >
                <FolderInput className="h-4 w-4" aria-hidden="true" />
                <span className="hidden sm:inline">Folder</span>
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="inline-flex min-h-[42px] items-center gap-1.5 rounded-xl bg-[var(--nv-accent)] px-3 sm:px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 active:scale-[0.98] disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                <span>
                  {isImporting ? 'Mengimpor...' : (
                    <>
                      Impor<span className="hidden sm:inline"> EPUB</span>
                    </>
                  )}
                </span>
              </button>
            </div>
          </div>
        )}

        {/* 5 Shelf Tabs */}
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 pb-2 sm:px-6">
          {(
            [
              { id: 'all', label: 'Semua' },
              { id: 'recent', label: 'Terakhir' },
              { id: 'favorites', label: 'Favorit' },
              { id: 'finished', label: 'Selesai' },
              { id: 'collections', label: 'Koleksi' },
            ] as Array<{ id: ShelfTab; label: string }>
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`min-h-[38px] rounded-xl px-3.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                tab === t.id
                  ? 'bg-[var(--nv-accent)] text-white'
                  : 'text-[var(--nv-muted)] hover:bg-black/5 dark:hover:bg-white/5'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-7">
        {/* Toolbar: Book count, Sort, View Mode, Series Group, Quick Theme */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h1 className="font-reader-literata text-xl font-bold tracking-tight sm:text-2xl">
              Perpustakaan
            </h1>
            <span className="text-xs font-medium text-[var(--nv-muted)] tabular-nums">
              {filteredAndSorted.length} buku
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Urutkan buku"
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="min-h-[40px] rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-3 text-xs font-medium"
            >
              <option value="lastRead">Terakhir Dibaca</option>
              <option value="natural">Judul (Natural 1–200)</option>
              <option value="author">Pengarang</option>
              <option value="addedAt">Tanggal Ditambahkan</option>
              <option value="size">Ukuran File</option>
            </select>

            <button
              type="button"
              onClick={() => setGroupBySeries((g) => !g)}
              aria-pressed={groupBySeries}
              title="Kelompokkan menurut seri"
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 text-xs font-medium whitespace-nowrap ${
                groupBySeries
                  ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                  : 'border-[var(--nv-border)] bg-[var(--nv-surface)]'
              }`}
            >
              <Layers className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Seri</span>
            </button>

            <div className="flex items-center rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-0.5">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                aria-label="Tampilan kisi"
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                  viewMode === 'grid'
                    ? 'bg-[var(--nv-accent)] text-white'
                    : 'text-[var(--nv-muted)]'
                }`}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('list')}
                aria-label="Tampilan daftar"
                className={`inline-flex h-9 w-9 items-center justify-center rounded-lg ${
                  viewMode === 'list'
                    ? 'bg-[var(--nv-accent)] text-white'
                    : 'text-[var(--nv-muted)]'
                }`}
              >
                <ListIcon className="h-4 w-4" />
              </button>
            </div>

            <select
              aria-label="Tema cepat perpustakaan"
              value={theme}
              onChange={(e) => onChangeTheme(e.target.value as ReaderTheme)}
              className="min-h-[40px] rounded-xl border border-[var(--nv-border)] bg-[var(--nv-surface)] px-2.5 text-xs font-medium"
            >
              <option value="light">Siang</option>
              <option value="sepia">Sepia</option>
              <option value="twilight">Senja</option>
              <option value="dark">Malam</option>
              <option value="amoled">AMOLED</option>
              <option value="custom">Kustom</option>
            </select>
          </div>
        </div>

        {/* Sub-filter for Collections */}
        {tab === 'collections' && (
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedCollection('')}
              className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                selectedCollection === ''
                  ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                  : 'border-[var(--nv-border)]'
              }`}
            >
              Semua Koleksi
            </button>
            {allCollections.map((col) => (
              <button
                key={col}
                type="button"
                onClick={() => setSelectedCollection(col)}
                className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                  selectedCollection === col
                    ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                    : 'border-[var(--nv-border)]'
                }`}
              >
                {col}
              </button>
            ))}
          </div>
        )}

        {importError && (
          <div
            role="alert"
            className="mb-5 rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900 dark:border-red-800 dark:bg-red-950/50 dark:text-red-200"
          >
            {importError}
          </div>
        )}

        {importInfo && (
          <div className="mb-5 rounded-xl border border-[var(--nv-accent)]/40 bg-[var(--nv-accent-soft)] px-4 py-3 text-sm text-[var(--nv-text)]">
            {importInfo}
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
        ) : filteredAndSorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--nv-border)] bg-[var(--nv-surface)] px-6 py-16 text-center">
            <BookOpen className="mb-3 h-10 w-10 text-[var(--nv-muted)]" aria-hidden="true" />
            <h2 className="text-lg font-semibold">
              {books.length === 0 ? 'Rak buku masih kosong' : 'Belum ada buku pada filter ini'}
            </h2>
            <p className="mt-1 max-w-md text-sm text-[var(--nv-muted)]">
              {books.length === 0
                ? 'Impor satu atau banyak file .epub (atau satu folder) dari penyimpanan perangkat.'
                : 'Coba ubah tab, kata kunci pencarian, atau tandai buku terlebih dahulu.'}
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[var(--nv-accent)] px-5 py-2.5 text-sm font-semibold text-white"
              >
                <Upload className="h-4 w-4" aria-hidden="true" />
                <span>Pilih File EPUB</span>
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-[var(--nv-border)] px-4 py-2.5 text-sm font-semibold"
              >
                <FolderInput className="h-4 w-4" aria-hidden="true" />
                <span>Pindai Folder</span>
              </button>
            </div>
          </div>
        ) : groupedSeries ? (
          <div className="space-y-8">
            {groupedSeries.map((group) => (
              <section key={group.seriesName}>
                <div className="mb-3 flex items-center justify-between border-b border-[var(--nv-border)] pb-2">
                  <h2 className="font-reader-literata text-base font-bold">
                    {group.seriesName}
                  </h2>
                  <span className="text-xs text-[var(--nv-muted)] tabular-nums">
                    {group.items.length} jilid
                  </span>
                </div>
                <div
                  className={
                    viewMode === 'list'
                      ? 'space-y-3'
                      : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
                  }
                >
                  {group.items.map(renderBookCard)}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div
            className={
              viewMode === 'list'
                ? 'space-y-3'
                : 'grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
            }
          >
            {filteredAndSorted.map(renderBookCard)}
          </div>
        )}
      </main>

      {/* Tentang Dokumen Modal */}
      <BookDetailModal
        book={detailBook}
        allCollections={allCollections}
        onClose={() => setDetailBookId(null)}
        onReadBook={(b) => {
          setDetailBookId(null);
          onOpenBook(b, false);
        }}
        onReadWithTts={(b) => {
          setDetailBookId(null);
          onOpenBook(b, true);
        }}
        onUpdateMetadata={onUpdateBookMetadata}
        onDeleteBook={onDeleteBook}
      />

      {/* Quick Collection Modal */}
      {collectionBook && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setCollectionTargetBookId(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-base font-bold">Koleksi untuk "{collectionBook.title}"</h2>
            <div className="flex flex-wrap gap-2">
              {allCollections.map((col) => {
                const active = (collectionBook.collections || []).includes(col);
                return (
                  <button
                    key={col}
                    type="button"
                    onClick={() => {
                      const curr = collectionBook.collections || [];
                      const nextCols = active
                        ? curr.filter((c) => c !== col)
                        : [...curr, col];
                      void onUpdateBookMetadata({ ...collectionBook, collections: nextCols });
                    }}
                    className={`min-h-[36px] rounded-xl border px-3 text-xs font-medium ${
                      active
                        ? 'border-[var(--nv-accent)] bg-[var(--nv-accent-soft)] text-[var(--nv-accent)]'
                        : 'border-[var(--nv-border)]'
                    }`}
                  >
                    {active ? '✓ ' : '+ '}
                    {col}
                  </button>
                );
              })}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const clean = newCollectionText.trim();
                if (!clean) return;
                const curr = collectionBook.collections || [];
                if (!curr.includes(clean)) {
                  void onUpdateBookMetadata({
                    ...collectionBook,
                    collections: [...curr, clean],
                  });
                }
                setNewCollectionText('');
              }}
              className="flex gap-2"
            >
              <input
                type="text"
                value={newCollectionText}
                onChange={(e) => setNewCollectionText(e.target.value)}
                placeholder="Buat koleksi baru..."
                className="min-h-[40px] flex-1 rounded-xl border border-[var(--nv-border)] bg-[var(--nv-bg)] px-3 text-xs"
              />
              <button
                type="submit"
                className="min-h-[40px] rounded-xl bg-[var(--nv-accent)] px-3.5 text-xs font-semibold text-white"
              >
                Tambah
              </button>
            </form>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setCollectionTargetBookId(null)}
                className="min-h-[40px] rounded-xl border border-[var(--nv-border)] px-4 text-xs font-medium"
              >
                Selesai
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Backup / Restore JSON Modal */}
      {showBackupModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Cadangkan dan Pulihkan Data"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setShowBackupModal(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-[var(--nv-border)] bg-[var(--nv-surface)] p-5 shadow-xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-base font-bold">Cadangan &amp; Pemulihan (JSON)</h2>
              <button
                type="button"
                onClick={() => setShowBackupModal(false)}
                aria-label="Tutup dialog cadangan"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs leading-relaxed text-[var(--nv-muted)]">
              Ekspor atau pulihkan posisi baca terakhir, penanda, kutipan, catatan, preset tampilan, dan setelan TTS Anda ke berkas JSON.
            </p>
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  void onExportBackup();
                  setShowBackupModal(false);
                }}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-[var(--nv-accent)] px-4 text-sm font-semibold text-white"
              >
                <Download className="h-4 w-4" />
                <span>Ekspor Cadangan (.json)</span>
              </button>
              <button
                type="button"
                onClick={() => backupInputRef.current?.click()}
                className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border border-[var(--nv-border)] px-4 text-sm font-semibold"
              >
                <Upload className="h-4 w-4" />
                <span>Pulihkan dari File (.json)</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
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
              "{pendingBook.title}" beserta posisi baca, penanda, dan kutipannya akan dihapus dari perangkat.
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
